const crypto = require('crypto');

function normalizeIdentifierPart(value) {
  return String(value || '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()
    .replace(/\s+/g, ' ')
    .replace(/[^\w\s:/.-]/g, '');
}

function hashParts(prefix, parts) {
  const normalized = parts.map(normalizeIdentifierPart).join('|');
  const hash = crypto.createHash('sha256').update(normalized).digest('hex').slice(0, 24);
  return `${prefix}_${hash}`;
}

function buildTheatreStableId(theatre) {
  return hashParts('theatre', [theatre.name, theatre.city]);
}

function extractEventIdFromUrl(value) {
  if (!value) return '';

  try {
    const url = new URL(value);
    const eventParams = ['event', 'event_id', 'eventId', 'production', 'production_id', 'id'];
    for (const key of eventParams) {
      const paramValue = url.searchParams.get(key);
      if (paramValue) return `${key}:${paramValue}`;
    }

    const fromEvent = url.searchParams.get('returnurl') || url.searchParams.get('returnUrl');
    if (fromEvent) {
      const nested = decodeURIComponent(fromEvent);
      const match = nested.match(/[?&](?:from_event|event|event_id)=([^&]+)/i);
      if (match) return `returnurl:${match[1]}`;
    }
  } catch (_err) {
    const match = String(value).match(/[?&](?:event|event_id|eventId|from_event)=([^&]+)/i);
    if (match) return `url:${match[1]}`;
  }

  return '';
}

function canonicalSourceUrl(value) {
  if (!value) return '';

  try {
    const url = new URL(value);
    url.hash = '';
    url.search = '';
    return url.toString().replace(/\/$/, '');
  } catch (_err) {
    return String(value).split('#')[0].split('?')[0].replace(/\/$/, '');
  }
}

function buildShowStableId(show, theatreStableId) {
  const sourceEventId =
    show.source_event_id ||
    show.sourceEventId ||
    extractEventIdFromUrl(show.ticket_url) ||
    '';

  if (sourceEventId) {
    return hashParts('show', [theatreStableId, sourceEventId]);
  }

  const canonicalUrl = canonicalSourceUrl(show.source_url);
  const sourceUrlLooksSpecific =
    canonicalUrl &&
    !/\/api\/|\/graphql|\/json|\/feed|\/agenda\/?$|\/events\/?$|\/calendar\/?$/i.test(canonicalUrl);

  if (sourceUrlLooksSpecific) {
    return hashParts('show', [theatreStableId, canonicalUrl]);
  }

  return hashParts('show', [theatreStableId, show.title, show.date_time]);
}

function buildShowContentHash(show) {
  return hashParts('content', [
    show.title,
    show.description,
    show.genre,
    show.date_time,
    show.image_url,
    show.source_url,
    show.source_event_id,
  ]);
}

module.exports = {
  buildShowContentHash,
  buildShowStableId,
  buildTheatreStableId,
  canonicalSourceUrl,
  extractEventIdFromUrl,
  normalizeIdentifierPart,
};
