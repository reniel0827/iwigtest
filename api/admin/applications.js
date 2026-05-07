/* GET /api/admin/applications?status=pending|approved|denied
   Returns wholesale applicants matching the requested status. */

const { ghlRequest, env, TAGS } = require('../_ghl');
const { verifyAdminToken } = require('./_auth');

const TAG_MAP = {
  pending:  TAGS.PENDING,
  approved: TAGS.APPROVED,
  denied:   TAGS.DENIED
};

module.exports = async (req, res) => {
  if (!verifyAdminToken(req)) return res.status(401).json({ error: 'Unauthorized' });

  try {
    const status = (req.query?.status || 'pending').toLowerCase();
    const tag = TAG_MAP[status];
    if (!tag) return res.status(400).json({ error: 'Invalid status.' });

    const locationId = env('GHL_LOCATION_ID');

    // POST /contacts/search lets us filter by tag
    const data = await ghlRequest('/contacts/search', {
      method: 'POST',
      body: {
        locationId,
        pageLimit: 100,
        filters: [{ field: 'tags', operator: 'contains', value: tag }]
      }
    });

    const contacts = data.contacts || data.data || [];

    const applicants = contacts.map(c => {
      const cf = (c.customFields || []).reduce((m, f) => {
        if (f.id) m[f.id] = f.value || f.fieldValue;
        return m;
      }, {});
      return {
        id: c.id,
        firstName: c.firstName,
        lastName: c.lastName,
        email: c.email,
        phone: c.phone,
        businessName: c.companyName,
        website: c.website,
        businessType: process.env.CF_BUSINESS_TYPE ? cf[process.env.CF_BUSINESS_TYPE] : '',
        resellerId:   process.env.CF_RESELLER_ID   ? cf[process.env.CF_RESELLER_ID]   : '',
        notes:        process.env.CF_NOTES         ? cf[process.env.CF_NOTES]         : '',
        tags: c.tags || [],
        status,
        createdAt: c.dateAdded || c.createdAt
      };
    });

    return res.status(200).json({ applicants });
  } catch (err) {
    console.error('admin applications error:', err);
    return res.status(500).json({ error: err.message });
  }
};
