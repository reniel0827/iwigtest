/* POST /api/login
   Checks a contact's tags to determine wholesale status.
   Returns { status: 'approved' | 'pending' | 'denied' | 'unknown' } */

const { ghlRequest, env, TAGS } = require('./_ghl');

module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const { email } = req.body || {};
    if (!email) return res.status(400).json({ error: 'Email required.' });

    const locationId = env('GHL_LOCATION_ID');
    const cleanEmail = String(email).trim().toLowerCase();

    const data = await ghlRequest('/contacts/search/duplicate', {
      query: { locationId, email: cleanEmail }
    });

    const contact = data.contact || data.contacts?.[0];
    if (!contact) return res.status(200).json({ status: 'unknown' });

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
