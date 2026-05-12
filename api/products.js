/* GET /api/products
   Returns the catalog with prices. Verifies caller has the approved tag.
   Logs every step so price failures are visible in Vercel logs. */

const { ghlRequest, env, TAGS } = require('./_ghl');
const { unpackDescription } = require('./_desc');

async function isApproved(email, locationId) {
  if (!email) return false;
  const data = await ghlRequest('/contacts/search/duplicate', {
    query: { locationId, email: String(email).trim().toLowerCase() }
  }).catch(() => null);
  if (!data) return false;
  const contact = data.contact || data.contacts?.[0];
  if (!contact) return false;
  const tags = (contact.tags || []).map(t => String(t).toLowerCase());
  return tags.includes(TAGS.APPROVED);
}

/** Fetch all products from GHL Payments → Products. */
async function fetchAllProducts(locationId) {
  const data = await ghlRequest('/products/', {
    query: { locationId, limit: 100 }
  });
  return data.products || data.data || [];
}

/** Fetch the price record(s) for a single product. */
async function fetchPriceForProduct(productId, locationId) {
  try {
    const data = await ghlRequest(`/products/${productId}/price`, {
      query: { locationId, limit: 10 }
    });
    const prices = data.prices || data.data || [];
    if (!prices.length) {
      console.log(`[products] product ${productId} has NO price record in GHL.`);
      return { amount: null, currency: 'USD', priceId: null, error: 'no_price_set' };
    }
    // pick the first one_time price, fall back to first whatever
    const def = prices.find(p => p.type === 'one_time') || prices[0];
    return {
      amount:   def.amount,            // GHL returns dollar value directly (no cents conversion)
      currency: def.currency || 'USD',
      priceId:  def._id || def.id,
      compareAt: def.compareAtPrice || null,
      availableQty: def.availableQuantity != null ? def.availableQuantity : null
    };
  } catch (err) {
    console.error(`[products] price fetch FAILED for ${productId}: status=${err.status} msg=${err.message}`);
    // Surface the cause: 401 = scope missing, 404 = product/price not found
    return {
      amount: null,
      currency: 'USD',
      priceId: null,
      error: err.status === 401 ? 'scope_missing' : 'fetch_failed',
      errorMsg: err.message
    };
  }
}

module.exports = async (req, res) => {
  try {
    const locationId = env('GHL_LOCATION_ID');
    const email = req.headers['x-iwig-email'];

    if (!await isApproved(email, locationId)) {
      return res.status(403).json({ error: 'Not authorized' });
    }

    const products = await fetchAllProducts(locationId);
    console.log(`[products] fetched ${products.length} products from GHL`);

    const enriched = await Promise.all(products.map(async (p) => {
      const pid = p._id || p.id;
      const price = await fetchPriceForProduct(pid, locationId);

      // GHL returns amount as the dollar value directly — no /100 conversion
      const dollars = (typeof price.amount === 'number') ? price.amount : 0;

      // Image URLs are embedded in the description as a hidden marker
      // (see _desc.js). Fall back to legacy fields for older products.
      const unpacked = unpackDescription(p.description);
      const medias = (p.medias || []).filter(m => m && (m.url || typeof m === 'string'));
      const mediaUrls = medias.map(m => (typeof m === 'string' ? m : m.url));
      const featured = medias.find(m => m && m.isFeatured);
      const mainImage =
        unpacked.image ||
        (featured && featured.url) ||
        p.image ||
        p.imageUrl ||
        p.featuredImage ||
        mediaUrls[0] ||
        null;
      const seen = new Set(mainImage ? [mainImage] : []);
      const extraImages = [];
      for (const url of [...unpacked.images, ...mediaUrls]) {
        if (url && !seen.has(url)) { seen.add(url); extraImages.push(url); }
      }

      return {
        id: pid,
        name: p.name || 'Untitled',
        description: unpacked.description,
        image: mainImage,
        images: extraImages,
        price: dollars,
        currency: price.currency,
        priceId: price.priceId,
        availableQty: price.availableQty != null ? price.availableQty
                       : (p.availableQuantity != null ? p.availableQuantity : null),
        // helpful debug info — also visible in browser DevTools network tab
        _priceError: price.error || null
      };
    }));

    // surface a top-level warning if prices broadly failed
    const priceErrors = enriched.filter(p => p._priceError);
    if (priceErrors.length === enriched.length && enriched.length > 0) {
      const reason = priceErrors[0]._priceError;
      let hint = '';
      if (reason === 'scope_missing') {
        hint = 'Your GHL Private Integration token is missing the products/prices.readonly scope. Recreate the integration with that scope and update GHL_PRIVATE_TOKEN in Vercel.';
      } else if (reason === 'no_price_set') {
        hint = 'Products exist but none have a price set. Add prices in GHL → Payments → Products → [product] → Pricing.';
      }
      console.warn('[products] ALL prices failed. reason:', reason, hint);
      return res.status(200).json({
        products: enriched,
        warning: hint
      });
    }

    return res.status(200).json({ products: enriched });
  } catch (err) {
    console.error('[products] error:', err);
    return res.status(500).json({ error: err.message || 'Server error' });
  }
};
