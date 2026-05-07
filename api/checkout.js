/* POST /api/checkout
   Saves cart context to the contact in GHL, then returns the URL
   to your GHL order form (or generic form) prefilled with email.

   Two strategies (you choose in env):
   - GHL_CHECKOUT_FORM_URL = a public form URL — we append ?email=... etc.
   - or use GHL's invoice / order builder (advanced — see README). */

const { ghlRequest, env, TAGS } = require('./_ghl');

const MIN_ORDER = 5500;

module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const { email, contactId, items } = req.body || {};
    if (!email || !Array.isArray(items) || !items.length) {
      return res.status(400).json({ error: 'Cart is empty.' });
    }

    const subtotal = items.reduce((s, i) => s + (i.qty * i.price), 0);
    if (subtotal < MIN_ORDER) {
      return res.status(400).json({ error: `Minimum order is $${MIN_ORDER}.` });
    }

    const locationId = env('GHL_LOCATION_ID');
    const formUrl = env('GHL_CHECKOUT_FORM_URL'); // e.g. https://api.leadconnectorhq.com/widget/form/XXXXX

    // Save the cart contents as a note on the contact so the team has full visibility
    if (contactId) {
      const summary =
        `iWIG Wholesale Order Request\n` +
        `Subtotal: $${subtotal.toLocaleString()}\n\n` +
        items.map(i => `- ${i.name} × ${i.qty} = $${(i.qty * i.price).toLocaleString()}`).join('\n');

      await ghlRequest(`/contacts/${contactId}/notes`, {
        method: 'POST',
        body: { body: summary, userId: process.env.GHL_USER_ID || undefined }
      }).catch(err => console.error('note error', err.message));

      // Also tag so workflows can fire
      await ghlRequest(`/contacts/${contactId}/tags`, {
        method: 'POST',
        body: { tags: ['wholesale-order-pending'] }
      }).catch(err => console.error('tag error', err.message));
    }

    // Build URL with email prefill (works with any GHL form/order page)
    const url = new URL(formUrl);
    url.searchParams.set('email', email);
    url.searchParams.set('amount', subtotal.toFixed(2));
    if (contactId) url.searchParams.set('contact_id', contactId);

    return res.status(200).json({ formUrl: url.toString() });
  } catch (err) {
    console.error('checkout error:', err);
    return res.status(500).json({ error: err.message || 'Server error' });
  }
};
