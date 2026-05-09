/* CRUD /api/admin/products
   GET    – list all products with prices
   POST   – create product + default one-time price
   PUT    – update product fields and/or price
   DELETE – delete product (?id=xxx)

   NOTE: GHL returns price `amount` as the dollar value directly (e.g. 50 = $50).
   No cents conversion is applied. */

const { ghlRequest, env } = require('../_ghl');
const { verifyAdminToken } = require('./_auth');

module.exports = async (req, res) => {
  if (!verifyAdminToken(req)) return res.status(401).json({ error: 'Unauthorized' });

  const locationId = env('GHL_LOCATION_ID');

  try {
    if (req.method === 'GET')    return await handleGet(req, res, locationId);
    if (req.method === 'POST')   return await handleCreate(req, res, locationId);
    if (req.method === 'PUT')    return await handleUpdate(req, res, locationId);
    if (req.method === 'DELETE') return await handleDelete(req, res, locationId);
    return res.status(405).json({ error: 'Method not allowed' });
  } catch (err) {
    console.error('[admin/products]', req.method, err);
    return res.status(500).json({ error: err.message });
  }
};

async function handleGet(req, res, locationId) {
  const data = await ghlRequest('/products/', { query: { locationId, limit: 100 } });
  const raw = data.products || data.data || [];

  const products = await Promise.all(raw.map(async (p) => {
    const pid = p._id || p.id;
    let priceAmount = null, priceId = null;
    try {
      const pd = await ghlRequest(`/products/${pid}/price`, { query: { locationId, limit: 10 } });
      const prices = pd.prices || pd.data || [];
      const def = prices.find(x => x.type === 'one_time') || prices[0];
      if (def) { priceAmount = def.amount; priceId = def._id || def.id; }
    } catch (err) {
      console.error(`[admin/products] price fetch failed ${pid}:`, err.status, err.message);
    }

    // Separate main image from additional images (medias array)
    const mainImage = p.image || null;
    const extraImages = (p.medias || []).map(m => m.url || m).filter(Boolean);

    return {
      id: pid,
      name: p.name,
      description: p.description || '',
      image: mainImage,
      images: extraImages,
      // GHL returns amount as dollar value directly — no /100 conversion
      price: typeof priceAmount === 'number' ? priceAmount : 0,
      priceId,
      availableQty: p.availableQuantity != null ? p.availableQuantity : null,
      productType: p.productType || 'DIGITAL',
    };
  }));

  return res.status(200).json({ products });
}

const VALID_PRODUCT_TYPES = ['DIGITAL', 'PHYSICAL', 'SERVICE'];

async function handleCreate(req, res, locationId) {
  const { name, description, image, images, price, availableQty, productType } = req.body || {};
  if (!name)                          return res.status(400).json({ error: 'name is required' });
  if (price == null || isNaN(price))  return res.status(400).json({ error: 'price is required' });

  const type = VALID_PRODUCT_TYPES.includes(productType) ? productType : 'DIGITAL';
  const productBody = { name, locationId, productType: type };
  if (description)          productBody.description = description;
  if (image)                productBody.image = image;
  if (Array.isArray(images) && images.length) {
    productBody.medias = images.map(url => ({ url, type: 'image', isFeatured: false }));
  }
  if (availableQty != null) productBody.availableQuantity = Number(availableQty);

  const created = await ghlRequest('/products/', { method: 'POST', body: productBody });
  const pid = created._id || created.id || created.product?._id || created.product?.id;
  if (!pid) throw new Error('Product created but ID missing from GHL response');

  const priceCreated = await ghlRequest(`/products/${pid}/price`, {
    method: 'POST',
    // Send dollar amount directly — no *100 conversion
    body: { name: 'Default', type: 'one_time', amount: Number(price), currency: 'USD', locationId }
  });
  const priceId = priceCreated._id || priceCreated.id || priceCreated.price?._id || priceCreated.price?.id;

  return res.status(201).json({
    product: {
      id: pid, name, description: description || '',
      image: image || null, images: images || [],
      price: Number(price), priceId,
      availableQty: availableQty != null ? Number(availableQty) : null,
      productType: type,
    }
  });
}

async function handleUpdate(req, res, locationId) {
  const { id, priceId, name, description, image, images, price, availableQty, productType } = req.body || {};
  if (!id)   return res.status(400).json({ error: 'id is required' });
  if (!name) return res.status(400).json({ error: 'name is required' });

  const type = VALID_PRODUCT_TYPES.includes(productType) ? productType : 'DIGITAL';
  const productBody = { name, locationId, productType: type };
  if (description !== undefined) productBody.description = description;
  if (image)                     productBody.image = image;
  if (Array.isArray(images)) {
    productBody.medias = images.map(url => ({ url, type: 'image', isFeatured: false }));
  }
  if (availableQty != null) productBody.availableQuantity = Number(availableQty);

  await ghlRequest(`/products/${id}`, { method: 'PUT', body: productBody });

  if (price != null && !isNaN(price)) {
    // Send dollar amount directly — no *100 conversion
    const amount = Number(price);
    if (priceId) {
      await ghlRequest(`/products/${id}/price/${priceId}`, {
        method: 'PUT',
        body: { name: 'Default', type: 'one_time', amount, currency: 'USD', locationId }
      });
    } else {
      await ghlRequest(`/products/${id}/price`, {
        method: 'POST',
        body: { name: 'Default', type: 'one_time', amount, currency: 'USD', locationId }
      });
    }
  }

  return res.status(200).json({ ok: true });
}

async function handleDelete(req, res, locationId) {
  const id = (req.query && req.query.id) || (req.body && req.body.id);
  if (!id) return res.status(400).json({ error: 'id is required' });

  await ghlRequest(`/products/${id}`, { method: 'DELETE', query: { locationId } });

  return res.status(200).json({ ok: true });
}
