/* GET /api/admin/products
   Admin view of catalog with prices. Same logic as user products but auth via admin token. */

const { ghlRequest, env } = require('../_ghl');
const { verifyAdminToken } = require('./_auth');

module.exports = async (req, res) => {
  if (!verifyAdminToken(req)) return res.status(401).json({ error: 'Unauthorized' });

  try {
    const locationId = env('GHL_LOCATION_ID');
    const data = await ghlRequest('/products/', { query: { locationId, limit: 100 } });
    const products = data.products || data.data || [];

    const enriched = await Promise.all(products.map(async (p) => {
      const pid = p._id || p.id;
      let price = { amount: null, error: null };
      try {
        const priceData = await ghlRequest(`/products/${pid}/price`, {
          query: { locationId, limit: 10 }
        });
        const prices = priceData.prices || priceData.data || [];
        const def = prices.find(x => x.type === 'one_time') || prices[0];
        if (def) price = { amount: def.amount, error: null };
        else price = { amount: null, error: 'no_price_set' };
      } catch (err) {
        console.error(`[admin/products] price fetch failed ${pid}:`, err.status, err.message);
        price.error = err.status === 401 ? 'scope_missing' : 'fetch_failed';
      }

      return {
        id: pid,
        name: p.name,
        description: p.description,
        image: p.image || (p.medias && p.medias[0]?.url) || null,
        price: typeof price.amount === 'number' ? price.amount / 100 : 0,
        availableQty: p.availableQuantity != null ? p.availableQuantity : null,
        _priceError: price.error
      };
    }));

    return res.status(200).json({ products: enriched });
  } catch (err) {
    console.error('[admin/products] error:', err);
    return res.status(500).json({ error: err.message });
  }
};
