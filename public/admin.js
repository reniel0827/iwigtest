/* ===========================================================
   iWIG ADMIN DASHBOARD · FRONTEND
   =========================================================== */

const $  = (sel) => document.querySelector(sel);
const $$ = (sel) => document.querySelectorAll(sel);

const adminState = {
  token: sessionStorage.getItem('iwig_admin_token') || null
};

// ============== LOGIN ==============

if (adminState.token) showDash();

$('#adminLoginForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const msg = $('#adminLoginMsg');
  msg.textContent = ''; msg.className = 'form-msg';
  const password = new FormData(e.target).get('password');
  try {
    const res = await fetch('/api/admin/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password })
    });
    const json = await res.json();
    if (!res.ok) throw new Error(json.error || 'Login failed.');
    adminState.token = json.token;
    sessionStorage.setItem('iwig_admin_token', json.token);
    showDash();
  } catch (err) {
    msg.textContent = err.message;
    msg.classList.add('error');
  }
});

$('#adminLogout').addEventListener('click', () => {
  sessionStorage.removeItem('iwig_admin_token');
  adminState.token = null;
  $('#adminLoginRoute').classList.add('active');
  $('#adminDashRoute').classList.remove('active');
});

function showDash() {
  $('#adminLoginRoute').classList.remove('active');
  $('#adminDashRoute').classList.add('active');
  loadApplications();
}

// ============== TABS ==============

$$('.tab').forEach(t => {
  if (t.id === 'adminLogout') return;
  t.addEventListener('click', () => {
    $$('.tab').forEach(x => x.classList.remove('active'));
    t.classList.add('active');
    const target = t.dataset.tab;
    $$('.tab-panel').forEach(p => p.classList.toggle('active', p.dataset.panel === target));
    if (target === 'applications') loadApplications();
    if (target === 'members')      loadMembers();
    if (target === 'products')     loadAdminProducts();
  });
});

// ============== APPLICATIONS / MEMBERS ==============

async function fetchApplicants(filter) {
  const res = await fetch(`/api/admin/applications?status=${filter}`, {
    headers: { 'x-iwig-admin': adminState.token }
  });
  const json = await res.json();
  if (!res.ok) throw new Error(json.error || 'Failed');
  return json.applicants || [];
}

async function loadApplications() {
  const list = $('#appList');
  list.innerHTML = '<div class="loader">Loading…</div>';
  try {
    const applicants = await fetchApplicants('pending');
    if (!applicants.length) {
      list.innerHTML = '<div class="loader">No pending applications.</div>';
      return;
    }
    list.innerHTML = applicants.map(renderAppCard).join('');
  } catch (err) {
    list.innerHTML = `<div class="loader">Error: ${err.message}</div>`;
  }
}

async function loadMembers() {
  const list = $('#memberList');
  list.innerHTML = '<div class="loader">Loading…</div>';
  try {
    const applicants = await fetchApplicants('approved');
    if (!applicants.length) {
      list.innerHTML = '<div class="loader">No approved members yet.</div>';
      return;
    }
    list.innerHTML = applicants.map(renderAppCard).join('');
  } catch (err) {
    list.innerHTML = `<div class="loader">Error: ${err.message}</div>`;
  }
}

function renderAppCard(a) {
  const status = a.status || 'pending';
  const owner = a.ownerContact || [a.firstName, a.lastName].filter(Boolean).join(' ');
  return `
    <article class="app-card" data-id="${a.id}">
      <div class="app-card-info">
        <h4>${escapeHtml(a.businessName || '—')}</h4>
        <div class="app-card-meta">
          <span>${escapeHtml(owner || '—')}</span>
          <span>${escapeHtml(a.email || '')}</span>
          <span>${escapeHtml(a.phone || '—')}</span>
        </div>
        <div class="app-card-detail">
          <strong>Business type:</strong> ${escapeHtml(a.businessType || '—')} ·
          <strong>Years:</strong> ${escapeHtml(a.yearsInBusiness || '—')}<br/>
          <strong>Address:</strong> ${escapeHtml(a.businessAddress || '—')}
          ${a.notes ? `<br/><strong>About:</strong> ${escapeHtml(a.notes)}` : ''}
        </div>
      </div>
      <div class="app-card-actions">
        <span class="app-status ${status}">${status}</span>
        ${status === 'pending' ? `
          <button class="btn-success" data-decision="approved" data-id="${a.id}">Approve</button>
          <button class="btn-danger"  data-decision="denied"   data-id="${a.id}">Deny</button>
        ` : ''}
        ${status === 'approved' ? `
          <button class="btn-danger" data-decision="revoked" data-id="${a.id}">Revoke Access</button>
        ` : ''}
      </div>
    </article>
  `;
}

document.body.addEventListener('click', async (e) => {
  const btn = e.target.closest('[data-decision]');
  if (!btn) return;
  const decision = btn.dataset.decision;
  const id = btn.dataset.id;
  const card = btn.closest('.app-card');

  if (decision === 'denied' && !confirm('Deny this applicant?')) return;
  if (decision === 'revoked' && !confirm('Revoke access for this member?')) return;

  btn.disabled = true; btn.textContent = '…';
  try {
    const res = await fetch('/api/admin/decision', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-iwig-admin': adminState.token },
      body: JSON.stringify({ contactId: id, decision })
    });
    const json = await res.json();
    if (!res.ok) throw new Error(json.error || 'Failed');
    card.remove();
  } catch (err) {
    alert('Error: ' + err.message);
    btn.disabled = false;
  }
});

// ============== PRODUCTS ==============

adminState.products = [];

async function loadAdminProducts() {
  const grid = $('#adminProductGrid');
  grid.innerHTML = '<div class="loader">Loading…</div>';
  try {
    const res = await fetch('/api/admin/products', {
      headers: { 'x-iwig-admin': adminState.token }
    });
    const json = await res.json();
    if (!res.ok) throw new Error(json.error || 'Failed');
    adminState.products = json.products || [];
    if (!adminState.products.length) {
      grid.innerHTML = '<div class="loader">No products yet. Click "+ Add Product" to create one.</div>';
      return;
    }
    grid.innerHTML = adminState.products.map(renderAdminProductCard).join('');
  } catch (err) {
    grid.innerHTML = `<div class="loader">Error: ${err.message}</div>`;
  }
}

function renderAdminProductCard(p) {
  const imgCount = (p.images || []).length;
  return `
    <article class="admin-product-card" data-product-id="${escapeHtml(p.id)}">
      <div class="product-image ${p.image ? '' : 'no-img'}">
        ${p.image ? `<img src="${escapeHtml(p.image)}" alt="${escapeHtml(p.name)}" loading="lazy" referrerpolicy="no-referrer" />` : ''}
        ${imgCount ? `<span class="img-count-badge">+${imgCount}</span>` : ''}
      </div>
      <div class="admin-product-card-body">
        <h4>${escapeHtml(p.name)}</h4>
        <p>$${Number(p.price).toLocaleString()} · ${p.availableQty != null ? p.availableQty + ' in stock' : '—'}</p>
        <div class="product-card-actions">
          <button class="btn btn-ghost btn-sm" data-action="preview" data-product-id="${escapeHtml(p.id)}">Preview</button>
          <button class="btn btn-ghost btn-sm" data-action="edit" data-product-id="${escapeHtml(p.id)}">Edit</button>
          <button class="btn btn-danger" data-action="delete" data-product-id="${escapeHtml(p.id)}">Delete</button>
        </div>
      </div>
    </article>
  `;
}

// ---- Image helpers ----

function addImageInput(url) {
  const row = document.createElement('div');
  row.className = 'img-input-row';
  row.innerHTML = `
    <input type="url" class="extra-image-url" placeholder="https://…" value="${escapeHtml(url || '')}" />
    <button type="button" class="img-remove-btn" title="Remove">&#215;</button>
  `;
  row.querySelector('.img-remove-btn').addEventListener('click', () => row.remove());
  $('#additionalImages').appendChild(row);
}

function getAdditionalImages() {
  return [...$$('.extra-image-url')].map(i => i.value.trim()).filter(Boolean);
}

$('#addImageBtn').addEventListener('click', () => addImageInput(''));

// ---- Modal open / close ----

$('#addProductBtn').addEventListener('click', () => openProductModal(null));
$('#modalClose').addEventListener('click', closeProductModal);
$('#modalCancel').addEventListener('click', closeProductModal);
$('#productModal').addEventListener('click', (e) => {
  if (e.target === $('#productModal')) closeProductModal();
});

function openProductModal(product) {
  const modal = $('#productModal');
  $('#modalTitle').textContent        = product ? 'Edit Product' : 'Add Product';
  $('#productSaveBtn').textContent    = product ? 'Update Product' : 'Save Product';
  $('#productName').value             = product ? product.name : '';
  $('#productDescription').value      = product ? (product.description || '') : '';
  $('#productPrice').value            = product ? product.price : '';
  $('#productQty').value              = (product && product.availableQty != null) ? product.availableQty : '';
  $('#productType').value             = product ? (product.productType || 'DIGITAL') : 'DIGITAL';
  $('#productImage').value            = product ? (product.image || '') : '';
  $('#additionalImages').innerHTML    = '';
  (product?.images || []).forEach(url => addImageInput(url));
  $('#productFormMsg').textContent    = '';
  $('#productFormMsg').className      = 'form-msg';
  modal._editId      = product ? product.id : null;
  modal._editPriceId = product ? product.priceId : null;
  modal.classList.add('active');
  $('#productName').focus();
}

function closeProductModal() {
  const modal = $('#productModal');
  modal.classList.remove('active');
  modal._editId = modal._editPriceId = null;
}

// ---- Form submit (create / update) ----

$('#productForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const modal  = $('#productModal');
  const msg    = $('#productFormMsg');
  const saveBtn = $('#productSaveBtn');
  msg.textContent = ''; msg.className = 'form-msg';

  const payload = {
    name:        $('#productName').value.trim(),
    description: $('#productDescription').value.trim(),
    price:       parseFloat($('#productPrice').value),
    availableQty: $('#productQty').value !== '' ? parseInt($('#productQty').value, 10) : null,
    productType: $('#productType').value,
    image:       $('#productImage').value.trim() || null,
    images:      getAdditionalImages(),
  };

  const isEdit = !!modal._editId;
  if (isEdit) { payload.id = modal._editId; payload.priceId = modal._editPriceId; }

  saveBtn.disabled = true;
  saveBtn.textContent = 'Saving…';

  try {
    const res = await fetch('/api/admin/products', {
      method:  isEdit ? 'PUT' : 'POST',
      headers: { 'Content-Type': 'application/json', 'x-iwig-admin': adminState.token },
      body:    JSON.stringify(payload),
    });
    const json = await res.json();
    if (!res.ok) throw new Error(json.error || 'Failed');
    closeProductModal();
    loadAdminProducts();
  } catch (err) {
    msg.textContent = err.message;
    msg.classList.add('error');
    saveBtn.disabled = false;
    saveBtn.textContent = isEdit ? 'Update Product' : 'Save Product';
  }
});

// ---- Edit / Delete delegation ----

document.body.addEventListener('click', async (e) => {
  const btn = e.target.closest('[data-action]');
  if (!btn) return;

  const action    = btn.dataset.action;
  const productId = btn.dataset.productId;

  if (action === 'edit') {
    const product = adminState.products.find(p => p.id === productId);
    if (product) openProductModal(product);

  } else if (action === 'preview') {
    const product = adminState.products.find(p => p.id === productId);
    if (product) openProductPreview(product);

  } else if (action === 'delete') {
    if (!confirm('Delete this product? This cannot be undone.')) return;
    btn.disabled = true;
    try {
      const res = await fetch(`/api/admin/products?id=${encodeURIComponent(productId)}`, {
        method:  'DELETE',
        headers: { 'x-iwig-admin': adminState.token },
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Failed');
      loadAdminProducts();
    } catch (err) {
      alert('Error: ' + err.message);
      btn.disabled = false;
    }
  }
});

function escapeHtml(s) {
  return String(s || '').replace(/[&<>"']/g, c => ({
    '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
  }[c]));
}

// ============== LIVE PREVIEW (customer's view) ==============

$('#previewClose').addEventListener('click', closePreviewModal);
$('#previewModal').addEventListener('click', (e) => {
  if (e.target === $('#previewModal')) closePreviewModal();
});

function closePreviewModal() {
  $('#previewModal').classList.remove('active');
  $('#previewBody').innerHTML = '';
}

function openProductPreview(p) {
  const modal = $('#previewModal');
  const body  = $('#previewBody');
  const inStock = p.availableQty == null || p.availableQty > 0;
  const allImages = [p.image, ...(p.images || [])].filter(Boolean);
  const hasImages = allImages.length > 0;
  const multi = allImages.length > 1;

  body.innerHTML = `
    <div class="product-detail-grid preview-grid">
      <div class="pd-gallery">
        <div class="pd-slider ${hasImages ? '' : 'no-img'}" id="prevSlider">
          ${hasImages ? `
            <div class="pd-slides">
              ${allImages.map((src, i) => `
                <div class="pd-slide ${i === 0 ? 'active' : ''}" data-slide-index="${i}">
                  <img src="${escapeHtml(src)}" alt="${escapeHtml(p.name)}" referrerpolicy="no-referrer" ${i === 0 ? '' : 'loading="lazy"'} />
                </div>
              `).join('')}
            </div>
            ${multi ? `
              <button class="pd-arrow pd-arrow-prev" type="button" id="prevPrevBtn" aria-label="Previous image">&#8249;</button>
              <button class="pd-arrow pd-arrow-next" type="button" id="prevNextBtn" aria-label="Next image">&#8250;</button>
              <div class="pd-dots">
                ${allImages.map((_, i) => `
                  <button class="pd-dot ${i === 0 ? 'active' : ''}" type="button" data-dot-index="${i}" aria-label="Image ${i + 1}"></button>
                `).join('')}
              </div>
            ` : ''}
          ` : ''}
        </div>
        ${multi ? `
          <div class="pd-thumbs">
            ${allImages.map((src, i) => `
              <button class="pd-thumb ${i === 0 ? 'active' : ''}" type="button" data-thumb-index="${i}">
                <img src="${escapeHtml(src)}" alt="" loading="lazy" referrerpolicy="no-referrer" />
              </button>
            `).join('')}
          </div>
        ` : ''}
      </div>
      <div class="pd-info">
        <p class="eyebrow">Wholesale</p>
        <h1 class="pd-name">${escapeHtml(p.name)}</h1>
        <div class="pd-price-row">
          <span class="product-price"><span class="currency">$</span>${Number(p.price).toLocaleString()}</span>
          <span class="product-stock ${inStock ? '' : 'out'}">
            ${inStock ? (p.availableQty != null ? `${p.availableQty} in stock` : 'In stock') : 'Out of stock'}
          </span>
        </div>
        <p class="pd-desc">${escapeHtml(p.description || '')}</p>
        <div class="pd-add-row">
          <input type="number" class="qty-input" min="1" value="1" disabled />
          <button class="add-btn pd-add-btn" disabled>
            ${inStock ? 'Add to cart' : 'Sold out'}
          </button>
        </div>
        <p class="preview-note">Buttons are disabled in preview mode.</p>
      </div>
    </div>
  `;

  if (multi) {
    let currentIndex = 0;
    const total = allImages.length;
    const slides = body.querySelectorAll('.pd-slide');
    const dots   = body.querySelectorAll('.pd-dot');
    const thumbs = body.querySelectorAll('.pd-thumb');

    const goTo = (idx) => {
      currentIndex = ((idx % total) + total) % total;
      slides.forEach((el, i) => el.classList.toggle('active', i === currentIndex));
      dots.forEach((el, i)   => el.classList.toggle('active', i === currentIndex));
      thumbs.forEach((el, i) => el.classList.toggle('active', i === currentIndex));
    };

    $('#prevPrevBtn').addEventListener('click', () => goTo(currentIndex - 1));
    $('#prevNextBtn').addEventListener('click', () => goTo(currentIndex + 1));
    dots.forEach(d   => d.addEventListener('click', () => goTo(Number(d.dataset.dotIndex))));
    thumbs.forEach(t => t.addEventListener('click', () => goTo(Number(t.dataset.thumbIndex))));
  }

  modal.classList.add('active');
}
