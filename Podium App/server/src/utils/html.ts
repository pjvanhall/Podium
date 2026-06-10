function decodeHtmlEntities(value) {
  if (typeof value !== 'string' || !value.includes('&')) return value;

  const named = {
    amp: '&',
    lt: '<',
    gt: '>',
    quot: '"',
    apos: "'",
    nbsp: ' ',
  };

  let decoded = value;
  for (let i = 0; i < 2; i++) {
    decoded = decoded
      .replace(/&#x([0-9a-f]+);/gi, (_, hex) => String.fromCodePoint(parseInt(hex, 16)))
      .replace(/&#(\d+);/g, (_, num) => String.fromCodePoint(parseInt(num, 10)))
      .replace(/&([a-z]+);/gi, (match, name) => named[name.toLowerCase()] ?? match);
  }

  return decoded;
}

function decodePerformanceText(performance) {
  if (!performance) return performance;
  return {
    ...performance,
    title: decodeHtmlEntities(performance.title),
    description: decodeHtmlEntities(performance.description),
    genre: decodeHtmlEntities(performance.genre),
  };
}

module.exports = { decodeHtmlEntities, decodePerformanceText };
