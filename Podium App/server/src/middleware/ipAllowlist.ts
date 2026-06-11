const net = require('net');

function normalizeIp(value) {
  if (!value) return '';

  const raw = Array.isArray(value) ? value[0] : String(value);
  let ip = raw.split(',')[0].trim();

  const ipv4WithPort = ip.match(/^(\d{1,3}(?:\.\d{1,3}){3}):\d+$/);
  if (ipv4WithPort) {
    ip = ipv4WithPort[1];
  }

  if (ip.startsWith('::ffff:')) {
    ip = ip.slice(7);
  }

  if (ip === '::1') {
    return '127.0.0.1';
  }

  return ip;
}

function getClientIp(req) {
  return normalizeIp(
    req.headers['x-forwarded-for'] ||
      req.headers['x-real-ip'] ||
      req.ip ||
      (req.socket && req.socket.remoteAddress)
  );
}

function ipv4ToNumber(ip) {
  if (net.isIP(ip) !== 4) return null;

  const parts = ip.split('.').map(Number);
  if (parts.some((part) => part < 0 || part > 255 || !Number.isInteger(part))) {
    return null;
  }

  return parts.reduce((total, part) => total * 256 + part, 0);
}

function matchesCidr(ip, cidr) {
  const [baseIp, prefixText] = cidr.split('/');
  const prefix = Number(prefixText);

  if (!Number.isInteger(prefix) || prefix < 0 || prefix > 32) {
    return false;
  }

  const ipNumber = ipv4ToNumber(ip);
  const baseNumber = ipv4ToNumber(normalizeIp(baseIp));

  if (ipNumber === null || baseNumber === null) {
    return false;
  }

  const blockSize = Math.pow(2, 32 - prefix);
  return Math.floor(ipNumber / blockSize) === Math.floor(baseNumber / blockSize);
}

function matchesRule(ip, rule) {
  const normalizedRule = normalizeIp(rule);

  if (!ip || !normalizedRule) {
    return false;
  }

  if (normalizedRule.includes('/')) {
    return matchesCidr(ip, normalizedRule);
  }

  return ip === normalizedRule;
}

function createIpAllowlistMiddleware() {
  const allowlist = (process.env.ALLOWED_IPS || '')
    .split(',')
    .map((rule) => rule.trim())
    .filter(Boolean);

  if (!allowlist.length) {
    return (_req, _res, next) => next();
  }

  return (req, res, next) => {
    const clientIp = getClientIp(req);

    if (allowlist.some((rule) => matchesRule(clientIp, rule))) {
      return next();
    }

    console.warn(`Blocked request from IP ${clientIp || 'unknown'}: ${req.method} ${req.originalUrl}`);
    return res.status(403).json({
      error: 'Deze omgeving is alleen toegankelijk vanaf een toegestaan netwerk.',
    });
  };
}

module.exports = { createIpAllowlistMiddleware, getClientIp };
