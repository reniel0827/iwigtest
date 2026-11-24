/* POST /api/signup
   Creates a new contact in GoHighLevel with the wholesale-pending tag.
   Handles duplicates gracefully and returns useful error info. */

const { ghlRequest, env, TAGS, hashPassword, getCustomFieldValue, customFieldId } = require('./_ghl');

const MIN_PASSWORD_LEN = 8;

/** Re-fetch the contact and check the password hash field has a value. */
async function passwordSaved(contactId, fieldId) {
  try {
    const full = await ghlRequest(`/contacts/${contactId}`);
    const value = getCustomFieldValue(full.contact || full, fieldId);
    return typeof value === 'string' && value.startsWith('scrypt$');
  } catch (e) {
    console.log('[signup] verify fetch failed:', e.message);
    return false;
  }
}

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
      businessName, businessType, businessAddress, yearsInBusiness, notes,
      password
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
    if (!password || String(password).length < MIN_PASSWORD_LEN) {
      return res.status(400).json({ error: `Password must be at least ${MIN_PASSWORD_LEN} characters.` });
    }

    const cfPasswordId = await customFieldId('CF_PASSWORD_HASH');
    if (!cfPasswordId) {
      return res.status(500).json({ error: 'Server is not configured for passwords (missing CF_PASSWORD_HASH).' });
    }
    const passwordHash = hashPassword(password);

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
    const optionalId = (name) => customFieldId(name).catch(e => { console.log('[signup]', e.message); return ''; });
    const [cfBusinessType, cfYears, cfNotes] = await Promise.all(
      ['CF_BUSINESS_TYPE', 'CF_YEARS_IN_BUSINESS', 'CF_NOTES'].map(optionalId)
    );
    const cf = [];
    if (cfBusinessType && businessType)    cf.push({ id: cfBusinessType, value: businessType });
    if (cfYears        && yearsInBusiness) cf.push({ id: cfYears,        value: yearsInBusiness });
    if (cfNotes        && notes)           cf.push({ id: cfNotes,        value: notes });
    cf.push({ id: cfPasswordId, value: passwordHash });
    payload.customFields = cf;

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

    // ====== confirm the password hash actually landed ======
    // GHL silently ignores custom field ids it doesn't recognise, so read it back.
    let saved = await passwordSaved(contact.id, cfPasswordId);
    if (!saved) {
      console.log('[signup] password hash missing after save; retrying with field_value');
      await ghlRequest(`/contacts/${contact.id}`, {
        method: 'PUT',
        body: { customFields: [{ id: cfPasswordId, field_value: passwordHash }] }
      }).catch(e => console.log('[signup] password retry failed:', e.message));
      saved = await passwordSaved(contact.id, cfPasswordId);
    }
    if (!saved) {
      console.error('[signup] password NOT saved. Check that CF_PASSWORD_HASH is the custom field ID (not its key) from location', locationId);
      return res.status(500).json({
        error: 'Your application was received, but your password could not be saved. Please contact us.',
        details: { hint: 'CF_PASSWORD_HASH does not match a Contact custom field in this location.', contactId: contact.id }
      });
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
