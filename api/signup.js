/* POST /api/signup
   Creates a new contact in GoHighLevel with the wholesale-pending tag.
   Handles duplicates gracefully and returns useful error info. */

const { ghlRequest, env, TAGS } = require('./_ghl');

/** Normalize phone to E.164-ish (+digits). GHL is strict about phone format. */
function normalizePhone(raw) {
  if (!raw) return undefined;
  const digits = String(raw).replace(/[^\d+]/g, '');
  if (!digits) return undefined;
  // already starts with +
  if (digits.startsWith('+')) return digits;
  // assume US/CA if 10 digits, else add + and hope for the best
  if (digits.length === 10) return '+1' + digits;
  if (digits.length === 11 && digits.startsWith('1')) return '+' + digits;
  return '+' + digits;
}

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const {
      ownerContact, email, phone,
      businessName, businessType, businessAddress, yearsInBusiness, notes
    } = req.body || {};

    // ====== validate (all 8 fields required) ======
    const required = { businessName, ownerContact, businessType, email, phone, businessAddress, yearsInBusiness, notes };
    for (const [key, val] of Object.entries(required)) {
      if (!val || !String(val).trim()) {
        return res.status(400).json({ error: `${key} is required.` });
      }
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(email).trim())) {
      return res.status(400).json({ error: 'Please enter a valid email address.' });
    }

    const locationId = env('GHL_LOCATION_ID');

    // ====== build payload ======
    const cleanEmail = String(email).trim().toLowerCase();
    const cleanPhone = normalizePhone(phone);

    // Split owner contact into first/last for GHL native fields
    const ownerTrimmed = String(ownerContact).trim().replace(/\s+/g, ' ');
    const ownerParts = ownerTrimmed.split(' ');
    const firstName = ownerParts[0];
    const lastName  = ownerParts.slice(1).join(' ') || '';

    const payload = {
      locationId,
      firstName,
      lastName,
      name:        ownerTrimmed,
      email:       cleanEmail,
      phone:       cleanPhone,
      companyName: String(businessName).trim(),
      address1:    String(businessAddress).trim(),
      tags:        [TAGS.PENDING, TAGS.APPLICANT],
      source:      'iWIG Wholesale Portal'
    };

    // strip undefined keys so GHL doesn't complain
    Object.keys(payload).forEach(k => payload[k] === undefined && delete payload[k]);

    // optional custom fields (only sent if env IDs configured)
    const cf = [];
    if (process.env.CF_BUSINESS_TYPE      && businessType)    cf.push({ id: process.env.CF_BUSINESS_TYPE,      value: businessType });
    if (process.env.CF_YEARS_IN_BUSINESS  && yearsInBusiness) cf.push({ id: process.env.CF_YEARS_IN_BUSINESS,  value: yearsInBusiness });
    if (process.env.CF_NOTES              && notes)           cf.push({ id: process.env.CF_NOTES,              value: notes });
    if (cf.length) payload.customFields = cf;

    console.log('[signup] creating contact:', { email: cleanEmail, name: payload.name });

    // ====== try create ======
    let contact;
    let wasDuplicate = false;
    try {
      const data = await ghlRequest('/contacts/', { method: 'POST', body: payload });
      contact = data.contact || data;
    } catch (err) {
      // 400 = duplicate or validation error. Try to find existing.
      console.log('[signup] create failed, status:', err.status, 'msg:', err.message);

      if (err.status === 400 || err.status === 409 || err.status === 422) {
        const dup = await ghlRequest('/contacts/search/duplicate', {
          query: { locationId, email: cleanEmail }
        }).catch(e => null);
        const existing = dup && (dup.contact || dup.contacts?.[0]);

        if (existing) {
          wasDuplicate = true;
          contact = existing;
          // re-tag as pending (in case they were previously denied / cleared)
          await ghlRequest(`/contacts/${existing.id}/tags`, {
            method: 'POST',
            body: { tags: [TAGS.PENDING, TAGS.APPLICANT] }
          }).catch(e => console.log('[signup] re-tag failed:', e.message));
          // refresh fields on the existing contact (including custom fields, so resubmits don't lose data)
          const updateBody = {
            firstName:   payload.firstName,
            lastName:    payload.lastName,
            phone:       payload.phone,
            companyName: payload.companyName,
            address1:    payload.address1
          };
          if (payload.customFields) updateBody.customFields = payload.customFields;
          await ghlRequest(`/contacts/${existing.id}`, {
            method: 'PUT',
            body: updateBody
          }).catch(e => console.log('[signup] update failed:', e.message));
        } else {
          // not a duplicate — bubble the real error
          throw err;
        }
      } else {
        throw err;
      }
    }

    console.log('[signup] success contactId:', contact?.id, 'duplicate:', wasDuplicate);

    return res.status(200).json({
      ok: true,
      contactId: contact.id,
      wasDuplicate,
      message: wasDuplicate
        ? 'We found your existing account and reactivated your application.'
        : 'Application received.'
    });
  } catch (err) {
    console.error('[signup] error:', err.message, err.body || '');
    // bubble GHL's actual error message back so you can debug
    return res.status(500).json({
      error: err.message || 'Something went wrong. Please try again.',
      details: err.body || null
    });
  }
};
