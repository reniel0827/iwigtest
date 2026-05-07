/* Shared admin token verifier. */

const crypto = require('crypto');
const { env } = require('../_ghl');

const TOKEN_TTL_MS = 8 * 60 * 60 * 1000; // 8 hours

function verifyAdminToken(req) {
  const token = req.headers['x-iwig-admin'];
  if (!token || !token.includes('.')) return false;
  const [ts, sig] = token.split('.');
  if (!ts || !sig) return false;
  const tsNum = Number(ts);
  if (!tsNum || (Date.now() - tsNum) > TOKEN_TTL_MS) return false;
  const secret = env('ADMIN_SECRET');
  const expected = crypto.createHmac('sha256', secret).update(ts).digest('hex');
  try {
    return crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected));
  } catch { return false; }
}

module.exports = { verifyAdminToken };
