/* POST /api/admin/decision
   Body: { contactId, decision: 'approved' | 'denied' | 'revoked' }
   Adds the right tag and removes the others. */

const { ghlRequest, TAGS } = require('../_ghl');
const { verifyAdminToken } = require('./_auth');

module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  if (!verifyAdminToken(req)) return res.status(401).json({ error: 'Unauthorized' });

  try {
    const { contactId, decision } = req.body || {};
    if (!contactId || !decision) {
      return res.status(400).json({ error: 'contactId and decision required.' });
    }

    let addTags = [];
    let removeTags = [];

    switch (decision) {
      case 'approved':
        addTags    = [TAGS.APPROVED];
        removeTags = [TAGS.PENDING, TAGS.DENIED];
        break;
      case 'denied':
        addTags    = [TAGS.DENIED];
        removeTags = [TAGS.PENDING, TAGS.APPROVED];
        break;
      case 'revoked':
        addTags    = [TAGS.DENIED];
        removeTags = [TAGS.APPROVED, TAGS.PENDING];
        break;
      default:
        return res.status(400).json({ error: 'Invalid decision.' });
    }

    if (removeTags.length) {
      await ghlRequest(`/contacts/${contactId}/tags`, {
        method: 'DELETE',
        body: { tags: removeTags }
      }).catch(err => console.error('remove tag err:', err.message));
    }
    if (addTags.length) {
      await ghlRequest(`/contacts/${contactId}/tags`, {
        method: 'POST',
        body: { tags: addTags }
      });
    }

    return res.status(200).json({ ok: true, decision });
  } catch (err) {
    console.error('admin decision error:', err);
    return res.status(500).json({ error: err.message });
  }
};
