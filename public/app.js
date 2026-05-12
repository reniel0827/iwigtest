/* ===========================================================
   iWIG WHOLESALE PORTAL · FRONTEND
   Plain vanilla JS · talks to /api/* serverless functions
   =========================================================== */

// ============== STATE ==============

const state = {
  user: null,        // { email, firstName, lastName, contactId }
  products: [],
  cart: JSON.parse(localStorage.getItem('iwig_cart') || '[]'),
  currentProductId: null  // set when navigating to product detail page
};

const MIN_ORDER = 5500;

// ============== HELPERS ==============

const $  = (sel) => document.querySelector(sel);
const $$ = (sel) => document.querySelectorAll(sel);

const fmt = (n) => '$' + Number(n).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 2 });

function saveCart() {
  localStorage.setItem('iwig_cart', JSON.stringify(state.cart));
  updateCartBadges();
}

function saveUser(user) {
  state.user = user;
  if (user) localStorage.setItem('iwig_user', JSON.stringify(user));
  else localStorage.removeItem('iwig_user');
  reflectAuthUI();
}

function loadUser() {
  try {
    const u = JSON.parse(localStorage.getItem('iwig_user'));
    if (u && u.email) state.user = u;
  } catch (e) {}
}

function reflectAuthUI() {
  const loggedIn = !!state.user;
  $('#navLogin').hidden  = loggedIn;
  $('#navApply').hidden  = loggedIn;
  $('#navPortal').hidden = !loggedIn;
  $('#navCart').hidden   = !loggedIn;
  $('#navLogout').hidden = !loggedIn;
}

// ============== ROUTING ==============

function go(page) {
  $$('.route').forEach(el => el.classList.toggle('active', el.dataset.page === page));
  window.scrollTo({ top: 0, behavior: 'instant' });
  $('#navLinks').classList.remove('open');

  if (page === 'portal')   loadProducts();
  if (page === 'cart')     renderCart();
  if (page === 'checkout') startCheckout();
  if (page === 'product')  loadProductDetail(state.currentProductId);
}

function openProduct(id) {
  if (!state.user) return go('login');
  state.currentProductId = id;
  go('product');
}

document.addEventListener('click', (e) => {
  const link = e.target.closest('[data-route]');
  if (!link) return;
  e.preventDefault();
  const route = link.dataset.route;

  // gate protected routes
  if ((route === 'portal' || route === 'cart') && !state.user) {
    return go('login');
  }
  go(route);
});

// ============== NAV / LOGOUT ==============

$('#navToggle').addEventListener('click', () => $('#navLinks').classList.toggle('open'));

$('#navLogout').addEventListener('click', (e) => {
  e.preventDefault();
  saveUser(null);
  state.cart = []; saveCart();
  go('home');
});

// ============== APPLY ==============

$('#applyForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const form = e.target;
  const btn  = $('#applyBtn');
  const msg  = $('#applyMsg');
  msg.textContent = ''; msg.className = 'form-msg';

  const data = Object.fromEntries(new FormData(form).entries());

  if (!data.password || data.password.length < 8) {
    msg.textContent = 'Password must be at least 8 characters.';
    msg.classList.add('error');
    return;
  }
  if (data.password !== data.confirmPassword) {
    msg.textContent = 'Passwords do not match.';
    msg.classList.add('error');
    return;
  }
  delete data.confirmPassword;

  btn.disabled = true; btn.textContent = 'Submitting…';

  try {
    const res = await fetch('/api/signup', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });
    const json = await res.json();
    if (!res.ok) throw new Error(json.error || 'Submission failed.');
    msg.textContent = 'Application received. You\'ll receive an email once approved (24–48 hrs).';
    msg.classList.add('success');
    form.reset();
  } catch (err) {
    msg.textContent = err.message;
    msg.classList.add('error');
  } finally {
    btn.disabled = false; btn.textContent = 'Submit Application';
  }
});

// ============== LOGIN ==============

$('#loginForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const form = e.target;
  const btn  = $('#loginBtn');
  const msg  = $('#loginMsg');
  msg.textContent = ''; msg.className = 'form-msg';

  const fd = new FormData(form);
  const email = fd.get('email').trim().toLowerCase();
  const password = fd.get('password') || '';

  if (!password) {
    msg.textContent = 'Password required.';
    msg.classList.add('error');
    return;
  }

  btn.disabled = true; btn.textContent = 'Checking…';

  try {
    const res = await fetch('/api/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password })
    });
    const json = await res.json();
    if (!res.ok) throw new Error(json.error || 'Login failed.');

    if (json.status === 'approved') {
      saveUser({
        email,
        firstName: json.firstName || '',
        lastName:  json.lastName  || '',
        contactId: json.contactId
      });
      msg.textContent = 'Welcome back.';
      msg.classList.add('success');
      setTimeout(() => go('portal'), 400);
    } else if (json.status === 'pending') {
      msg.textContent = 'Your application is still under review. We\'ll email you when access is granted.';
      msg.classList.add('error');
    } else if (json.status === 'denied') {
      msg.textContent = 'This account is not eligible for wholesale access at this time.';
      msg.classList.add('error');
    } else {
      msg.textContent = 'No application found for this email. Please apply first.';
      msg.classList.add('error');
    }
  } catch (err) {
    msg.textContent = err.message;
    msg.classList.add('error');
  } finally {
    btn.disabled = false; btn.textContent = 'Continue';
  }
});

// ============== PRODUCTS ==============

async function loadProducts() {
  $('#portalGreeting').textContent = state.user?.firstName
    ? `Welcome, ${state.user.firstName}.`
    : 'Welcome.';

  if (state.products.length) return renderProducts(state.products);

  const grid = $('#productGrid');
  grid.innerHTML = '<div class="loader">Loading catalog…</div>';

  try {
    const res = await fetch('/api/products', {
      headers: { 'x-iwig-email': state.user.email }
    });
    const json = await res.json();
    if (!res.ok) throw new Error(json.error || 'Failed to load.');
    state.products = json.products || [];
    renderProducts(state.products);
  } catch (err) {
    grid.innerHTML = `<div class="loader">Error: ${err.message}</div>`;
  }
}

function renderProducts(list) {
  const grid = $('#productGrid');
  if (!list.length) {
    grid.innerHTML = '<div class="loader">No products available yet.</div>';
    return;
  }
  grid.innerHTML = list.map(p => productCardHTML(p)).join('');
}

function productCardHTML(p) {
  const inStock = p.availableQty == null || p.availableQty > 0;
  return `
    <article class="product-card" data-id="${p.id}" data-product-open="${p.id}">
      <div class="product-image ${p.image ? '' : 'no-img'}">
        ${p.image ? `<img src="${escapeHtml(p.image)}" alt="${escapeHtml(p.name)}" loading="lazy" referrerpolicy="no-referrer" />` : ''}
      </div>
      <div class="product-body">
        <h3 class="product-name">${escapeHtml(p.name)}</h3>
        <p class="product-desc">${escapeHtml(p.description || '')}</p>
        <div class="product-meta">
          <span class="product-price"><span class="currency">$</span>${Number(p.price).toLocaleString()}</span>
          <span class="product-stock ${inStock ? '' : 'out'}">
            ${inStock ? (p.availableQty != null ? `${p.availableQty} in stock` : 'In stock') : 'Out of stock'}
          </span>
        </div>
        <div class="add-row">
          <input type="number" class="qty-input" min="1" value="1" ${inStock ? '' : 'disabled'} />
          <button class="add-btn" data-add="${p.id}" ${inStock ? '' : 'disabled'}>
            ${inStock ? 'Add to cart' : 'Sold out'}
          </button>
        </div>
      </div>
    </article>
  `;
}

function handleProductGridClick(e) {
  // Add-to-cart button — handle first, don't bubble to card navigation
  const btn = e.target.closest('[data-add]');
  if (btn) {
    const id = btn.dataset.add;
    const card = btn.closest('.product-card');
    const qty = Math.max(1, parseInt(card.querySelector('.qty-input').value) || 1);
    const product = state.products.find(p => p.id === id);
    if (!product) return;
    addToCart(product, qty);
    btn.classList.add('added');
    btn.textContent = '✓ Added';
    setTimeout(() => { btn.classList.remove('added'); btn.textContent = 'Add to cart'; }, 1300);
    return;
  }
  // Ignore clicks on the qty input (don't navigate when typing/clicking quantity)
  if (e.target.closest('.qty-input')) return;
  // Otherwise, clicking anywhere on the card opens the product detail
  const card = e.target.closest('[data-product-open]');
  if (!card) return;
  openProduct(card.dataset.productOpen);
}

$('#productGrid').addEventListener('click', handleProductGridClick);
$('#relatedGrid').addEventListener('click', handleProductGridClick);

$('#searchBox').addEventListener('input', (e) => {
  const q = e.target.value.toLowerCase().trim();
  if (!q) return renderProducts(state.products);
  renderProducts(state.products.filter(p =>
    p.name.toLowerCase().includes(q) ||
    (p.description || '').toLowerCase().includes(q)
  ));
});

// ============== PRODUCT DETAIL ==============

async function loadProductDetail(id) {
  const wrap = $('#productDetail');
  const relatedWrap = $('#relatedWrap');
  relatedWrap.hidden = true;
  wrap.innerHTML = '<div class="loader">Loading…</div>';

  // Make sure products are loaded so we can find this one + show related
  if (!state.products.length) {
    try {
      const res = await fetch('/api/products', { headers: { 'x-iwig-email': state.user.email } });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Failed to load.');
      state.products = json.products || [];
    } catch (err) {
      wrap.innerHTML = `<div class="loader">Error: ${err.message}</div>`;
      return;
    }
  }

  const product = state.products.find(p => p.id === id);
  if (!product) {
    wrap.innerHTML = `
      <div class="loader">
        Product not found.
        <br/><a href="#" data-route="portal">← Back to catalog</a>
      </div>`;
    return;
  }

  renderProductDetail(product);
  renderRelated(product);
}

function renderProductDetail(p) {
  const wrap = $('#productDetail');
  const inStock = p.availableQty == null || p.availableQty > 0;
  const allImages = [p.image, ...(p.images || [])].filter(Boolean);
  const hasImages = allImages.length > 0;
  const multi = allImages.length > 1;

  wrap.innerHTML = `
    <a href="#" class="back-link" data-route="portal">← Back to catalog</a>
    <div class="product-detail-grid">
      <div class="pd-gallery">
        <div class="pd-slider ${hasImages ? '' : 'no-img'}" id="pdSlider">
          ${hasImages ? `
            <div class="pd-slides" id="pdSlides">
              ${allImages.map((src, i) => `
                <div class="pd-slide ${i === 0 ? 'active' : ''}" data-slide-index="${i}">
                  <img src="${escapeHtml(src)}" alt="${escapeHtml(p.name)}" referrerpolicy="no-referrer" ${i === 0 ? '' : 'loading="lazy"'} />
                </div>
              `).join('')}
            </div>
            ${multi ? `
              <button class="pd-arrow pd-arrow-prev" type="button" id="pdPrev" aria-label="Previous image">&#8249;</button>
              <button class="pd-arrow pd-arrow-next" type="button" id="pdNext" aria-label="Next image">&#8250;</button>
              <div class="pd-dots" id="pdDots">
                ${allImages.map((_, i) => `
                  <button class="pd-dot ${i === 0 ? 'active' : ''}" type="button" data-dot-index="${i}" aria-label="Go to image ${i + 1}"></button>
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
          <input type="number" class="qty-input" id="pdQty" min="1" value="1" ${inStock ? '' : 'disabled'} />
          <button class="add-btn pd-add-btn" id="pdAddBtn" ${inStock ? '' : 'disabled'}>
            ${inStock ? 'Add to cart' : 'Sold out'}
          </button>
        </div>
      </div>
    </div>
  `;

  // ---- Slider behavior ----
  if (multi) {
    let currentIndex = 0;
    const total = allImages.length;
    const slider = $('#pdSlider');
    const slides = wrap.querySelectorAll('.pd-slide');
    const dots = wrap.querySelectorAll('.pd-dot');
    const thumbs = wrap.querySelectorAll('.pd-thumb');

    const goTo = (idx) => {
      currentIndex = ((idx % total) + total) % total; // wrap both directions
      slides.forEach((el, i) => el.classList.toggle('active', i === currentIndex));
      dots.forEach((el, i) => el.classList.toggle('active', i === currentIndex));
      thumbs.forEach((el, i) => el.classList.toggle('active', i === currentIndex));
    };

    $('#pdPrev').addEventListener('click', () => goTo(currentIndex - 1));
    $('#pdNext').addEventListener('click', () => goTo(currentIndex + 1));
    dots.forEach(dot => dot.addEventListener('click', () => goTo(Number(dot.dataset.dotIndex))));
    thumbs.forEach(t => t.addEventListener('click', () => goTo(Number(t.dataset.thumbIndex))));

    // Keyboard arrows when slider is focused or hovered
    const onKey = (e) => {
      if (e.key === 'ArrowLeft')  { e.preventDefault(); goTo(currentIndex - 1); }
      if (e.key === 'ArrowRight') { e.preventDefault(); goTo(currentIndex + 1); }
    };
    slider.tabIndex = 0;
    slider.addEventListener('keydown', onKey);

    // Touch swipe
    let touchStartX = 0, touchEndX = 0;
    slider.addEventListener('touchstart', (e) => { touchStartX = e.changedTouches[0].screenX; }, { passive: true });
    slider.addEventListener('touchend',   (e) => {
      touchEndX = e.changedTouches[0].screenX;
      const delta = touchEndX - touchStartX;
      if (Math.abs(delta) < 40) return;
      goTo(delta < 0 ? currentIndex + 1 : currentIndex - 1);
    }, { passive: true });
  }

  // ---- Add to cart ----
  const addBtn = $('#pdAddBtn');
  if (addBtn && inStock) {
    addBtn.addEventListener('click', () => {
      const qty = Math.max(1, parseInt($('#pdQty').value) || 1);
      addToCart(p, qty);
      addBtn.classList.add('added');
      addBtn.textContent = '✓ Added';
      setTimeout(() => { addBtn.classList.remove('added'); addBtn.textContent = 'Add to cart'; }, 1300);
    });
  }
}

function renderRelated(currentProduct) {
  const relatedWrap = $('#relatedWrap');
  const grid = $('#relatedGrid');
  const others = state.products.filter(p => p.id !== currentProduct.id);
  if (!others.length) {
    relatedWrap.hidden = true;
    return;
  }
  // Show up to 8 other products
  grid.innerHTML = others.slice(0, 8).map(productCardHTML).join('');
  relatedWrap.hidden = false;
}

// ============== CART ==============

function addToCart(product, qty) {
  const existing = state.cart.find(i => i.id === product.id);
  if (existing) existing.qty += qty;
  else state.cart.push({ id: product.id, name: product.name, price: product.price, image: product.image, qty });
  saveCart();
}

function updateCartBadges() {
  const count = state.cart.reduce((s, i) => s + i.qty, 0);
  const total = state.cart.reduce((s, i) => s + i.qty * i.price, 0);
  $('#cartBadge').textContent  = count;
  $('#hdrCartCount').textContent = count;
  $('#hdrCartTotal').textContent = fmt(total);
}

function renderCart() {
  const wrap = $('#cartTable');
  const totals = $('#cartTotals');
  const notice = $('#minNotice');
  const checkoutBtn = $('#checkoutBtn');

  if (!state.cart.length) {
    wrap.innerHTML = '<div class="cart-empty">Your cart is empty.</div>';
    totals.innerHTML = '';
    notice.textContent = '';
    checkoutBtn.disabled = true;
    return;
  }

  wrap.innerHTML = state.cart.map(i => `
    <div class="cart-row" data-id="${i.id}">
      <div class="cart-img" ${i.image ? `style="background-image:url('${i.image}')"` : ''}></div>
      <div class="cart-info">
        <h4>${escapeHtml(i.name)}</h4>
        <p>${fmt(i.price)} each</p>
      </div>
      <input type="number" class="qty-input" min="1" value="${i.qty}" data-update="${i.id}" />
      <div class="cart-line-price">${fmt(i.qty * i.price)}</div>
      <button class="cart-remove" data-remove="${i.id}" aria-label="Remove">×</button>
    </div>
  `).join('');

  const subtotal = state.cart.reduce((s, i) => s + i.qty * i.price, 0);
  totals.innerHTML = `
    <div class="cart-totals-row"><span>Subtotal</span><span>${fmt(subtotal)}</span></div>
    <div class="cart-totals-row"><span>Tax & shipping</span><span>Calculated at checkout</span></div>
    <div class="cart-totals-row grand"><span>Total</span><span>${fmt(subtotal)}</span></div>
  `;

  if (subtotal < MIN_ORDER) {
    const need = MIN_ORDER - subtotal;
    notice.textContent = `Minimum order is ${fmt(MIN_ORDER)}. Add ${fmt(need)} more to check out.`;
    notice.classList.add('warn');
    checkoutBtn.disabled = true;
  } else {
    notice.textContent = `✓ Minimum order of ${fmt(MIN_ORDER)} met.`;
    notice.classList.remove('warn');
    checkoutBtn.disabled = false;
  }
  updateCartBadges();
}

$('#cartTable').addEventListener('input', (e) => {
  const upd = e.target.closest('[data-update]');
  if (!upd) return;
  const id = upd.dataset.update;
  const item = state.cart.find(i => i.id === id);
  if (!item) return;
  item.qty = Math.max(1, parseInt(upd.value) || 1);
  saveCart();
  renderCart();
});
$('#cartTable').addEventListener('click', (e) => {
  const rm = e.target.closest('[data-remove]');
  if (!rm) return;
  state.cart = state.cart.filter(i => i.id !== rm.dataset.remove);
  saveCart();
  renderCart();
});

$('#checkoutBtn').addEventListener('click', () => {
  const subtotal = state.cart.reduce((s, i) => s + i.qty * i.price, 0);
  if (subtotal < MIN_ORDER) return;
  go('checkout');
});

// ============== CHECKOUT ==============

async function startCheckout() {
  const wrap = $('#checkoutFrameWrap');
  wrap.innerHTML = '<div class="loader">Loading secure form…</div>';

  try {
    const res = await fetch('/api/checkout', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: state.user.email,
        contactId: state.user.contactId,
        items: state.cart
      })
    });
    const json = await res.json();
    if (!res.ok) throw new Error(json.error || 'Could not start checkout.');

    // GHL form embed
    const url = json.formUrl;
    wrap.innerHTML = `
      <iframe
        src="${url}"
        title="iWIG Wholesale Checkout"
        loading="lazy"
        allow="payment"></iframe>
    `;
  } catch (err) {
    wrap.innerHTML = `<div class="loader">Error: ${err.message}</div>`;
  }
}

// ============== UTIL ==============

function escapeHtml(s) {
  return String(s || '').replace(/[&<>"']/g, c => ({
    '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
  }[c]));
}

// ============== INIT ==============

loadUser();
reflectAuthUI();
updateCartBadges();
$('#yr').textContent = new Date().getFullYear();
