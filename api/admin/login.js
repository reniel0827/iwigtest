/* POST /api/admin/login
   Verifies admin password, returns a session token. */

const crypto = require('crypto');
const { env } = require('../_ghl');

module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  try {
    const { password } = req.body || {};
    if (!password) return res.status(400).json({ error: 'Password required.' });

    const adminPass = env('ADMIN_PASSWORD');
    if (password !== adminPass) {
      return res.status(401).json({ error: 'Invalid password.' });
    }

    // Stateless token: HMAC of timestamp signed with ADMIN_SECRET.
    // (Lightweight session — replace with JWT if desired.)
    const secret = env('ADMIN_SECRET');
    const ts = Date.now().toString();
    const sig = crypto.createHmac('sha256', secret).update(ts).digest('hex');
    const token = `${ts}.${sig}`;

    return res.status(200).json({ token });
  } catch (err) {
    console.error('admin login error:', err);
    return res.status(500).json({ error: err.message });
  }
};
