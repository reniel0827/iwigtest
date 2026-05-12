/* ===========================================================
   GoHighLevel API helper · used by all /api/* functions
   =========================================================== */

const crypto = require('crypto');

const GHL_BASE = 'https://services.leadconnectorhq.com';
const API_VERSION = '2021-07-28';

function env(name) {
  const v = process.env[name];
  if (!v) throw new Error(`Missing env: ${name}`);
  return v;
}

async function ghlRequest(path, { method = 'GET', body, query } = {}) {
  const token = env('GHL_PRIVATE_TOKEN');
  let url = GHL_BASE + path;
  if (query) {
    const q = new URLSearchParams(query).toString();
    url += (url.includes('?') ? '&' : '?') + q;
  }
  const res = await fetch(url, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      Version: API_VERSION,
      'Content-Type': 'application/json',
      Accept: 'application/json'
    },
    body: body ? JSON.stringify(body) : undefined
  });
  const text = await res.text();
  let data;
  try { data = JSON.parse(text); } catch (e) { data = { raw: text }; }
  if (!res.ok) {
    const err = new Error(`GHL ${res.status}: ${data.message || data.error || text.slice(0, 200)}`);
    err.status = res.status;
    err.body = data;
    throw err;
  }
  return data;
}

const TAGS = {
  PENDING:  'wholesale-pending',
  APPROVED: 'wholesale-approved',
  DENIED:   'wholesale-denied',
  APPLICANT: 'wholesale-applicant'
};

function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(String(password), salt, 64).toString('hex');
  return `scrypt$${salt}$${hash}`;
}

function verifyPassword(password, stored) {
  if (!stored || typeof stored !== 'string' || !stored.startsWith('scrypt$')) return false;
  const [, salt, hash] = stored.split('$');
  if (!salt || !hash) return false;
  const test = crypto.scryptSync(String(password), salt, 64).toString('hex');
  try {
    return crypto.timingSafeEqual(Buffer.from(hash, 'hex'), Buffer.from(test, 'hex'));
  } catch { return false; }
}

function getCustomFieldValue(contact, fieldId) {
  if (!contact || !fieldId) return undefined;
  const cf = contact.customFields || contact.customField || [];
  for (const f of cf) {
    if (f && (f.id === fieldId || f.fieldId === fieldId)) return f.value;
  }
  return undefined;
}

module.exports = {
  ghlRequest, env, TAGS, GHL_BASE, API_VERSION,
  hashPassword, verifyPassword, getCustomFieldValue
};
