/* POST /api/login
   Verifies email + password, then checks contact tags for wholesale status.
   Returns { status: 'approved' | 'pending' | 'denied' | 'unknown' } */

const { ghlRequest, env, TAGS, verifyPassword, getCustomFieldValue } = require('./_ghl');

module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const { email, password } = req.body || {};
    if (!email) return res.status(400).json({ error: 'Email required.' });
    if (!password) return res.status(400).json({ error: 'Password required.' });

    const cfPasswordId = process.env.CF_PASSWORD_HASH;
    if (!cfPasswordId) {
      return res.status(500).json({ error: 'Server is not configured for passwords (missing CF_PASSWORD_HASH).' });
    }

    const locationId = env('GHL_LOCATION_ID');
    const cleanEmail = String(email).trim().toLowerCase();

    const data = await ghlRequest('/contacts/search/duplicate', {
      query: { locationId, email: cleanEmail }
    });

    const found = data.contact || data.contacts?.[0];
    if (!found) return res.status(200).json({ status: 'unknown' });

    // Fetch full contact so we have custom fields (duplicate search response is sparse).
    let contact = found;
    try {
      const full = await ghlRequest(`/contacts/${found.id}`);
      contact = full.contact || full;
    } catch (e) {
      console.log('[login] full contact fetch failed:', e.message);
    }

    const storedHash = getCustomFieldValue(contact, cfPasswordId);
    if (!storedHash) {
      return res.status(401).json({ error: 'No password set for this account. Please reapply.' });
    }
    if (!verifyPassword(password, storedHash)) {
      return res.status(401).json({ error: 'Incorrect email or password.' });
    }

    const tags = (contact.tags || []).map(t => String(t).toLowerCase());

    let status = 'unknown';
    if (tags.includes(TAGS.APPROVED)) status = 'approved';
    else if (tags.includes(TAGS.DENIED)) status = 'denied';
    else if (tags.includes(TAGS.PENDING) || tags.includes(TAGS.APPLICANT)) status = 'pending';

    return res.status(200).json({
      status,
      contactId: contact.id,
      firstName: contact.firstName || contact.firstNameLowerCase || '',
      lastName:  contact.lastName  || contact.lastNameLowerCase  || ''
    });
  } catch (err) {
    console.error('login error:', err);
    return res.status(500).json({ error: err.message || 'Server error' });
  }
};
