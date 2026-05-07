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
  return `
    <article class="app-card" data-id="${a.id}">
      <div class="app-card-info">
        <h4>${escapeHtml(a.firstName || '')} ${escapeHtml(a.lastName || '')}</h4>
        <div class="app-card-meta">
          <span>${escapeHtml(a.email || '')}</span>
          <span>${escapeHtml(a.phone || '—')}</span>
          <span>${escapeHtml(a.businessName || '—')}</span>
        </div>
        <div class="app-card-detail">
          <strong>Business type:</strong> ${escapeHtml(a.businessType || '—')} ·
          <strong>Reseller ID:</strong> ${escapeHtml(a.resellerId || '—')} ·
          <strong>Site:</strong> ${escapeHtml(a.website || '—')}
          ${a.notes ? `<br/><strong>Notes:</strong> ${escapeHtml(a.notes)}` : ''}
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

async function loadAdminProducts() {
  const grid = $('#adminProductGrid');
  grid.innerHTML = '<div class="loader">Loading…</div>';
  try {
    const res = await fetch('/api/admin/products', {
      headers: { 'x-iwig-admin': adminState.token }
    });
    const json = await res.json();
    if (!res.ok) throw new Error(json.error || 'Failed');
    const products = json.products || [];
    if (!products.length) {
      grid.innerHTML = '<div class="loader">No products. Add some inside GoHighLevel → Payments → Products.</div>';
      return;
    }
    grid.innerHTML = products.map(p => `
      <article class="admin-product-card">
        <div class="product-image ${p.image ? '' : 'no-img'}"
             ${p.image ? `style="background-image:url('${p.image}')"` : ''}></div>
        <div class="admin-product-card-body">
          <h4>${escapeHtml(p.name)}</h4>
          <p>$${Number(p.price).toLocaleString()} · ${p.availableQty != null ? p.availableQty + ' in stock' : '—'}</p>
        </div>
      </article>
    `).join('');
  } catch (err) {
    grid.innerHTML = `<div class="loader">Error: ${err.message}</div>`;
  }
}

function escapeHtml(s) {
  return String(s || '').replace(/[&<>"']/g, c => ({
    '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
  }[c]));
}
