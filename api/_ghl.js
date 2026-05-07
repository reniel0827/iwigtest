/* ===========================================================
   GoHighLevel API helper · used by all /api/* functions
   =========================================================== */

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

module.exports = { ghlRequest, env, TAGS, GHL_BASE, API_VERSION };
