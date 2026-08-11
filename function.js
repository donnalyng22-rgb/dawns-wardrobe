/* =========================================================
   DAWN'S WARDROBE — function.js (API client version)
   Talks to the Express + SQLite backend instead of localStorage.
   Only the auth token lives in localStorage; everything else
   (user profile, cart, orders, products) lives in the database
   and is fetched over the network.
   ========================================================= */

const TOKEN_KEY = 'dw_token';
const SHIPPING_FEE = 120; // display default; server is the source of truth

/* ---------------- currency ---------------- */
function formatPHP(n) {
  return '\u20B1' + Number(n).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/* ---------------- static UI data (not stored in DB) ---------------- */
const CATEGORIES = ['All', 'Shirts', 'Hoodies', 'Jorts', 'Caps'];
const ORDER_STATUSES = ['Processing', 'Packed', 'Out for delivery', 'Delivered', 'Cancelled'];

const ICONS = {
  tee: `<svg viewBox="0 0 100 100" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linejoin="round"><path d="M30 18 L10 30 L20 42 L30 36 V86 H70 V36 L80 42 L90 30 L70 18 Q65 26 50 26 Q35 26 30 18 Z"/></svg>`,
  hoodie: `<svg viewBox="0 0 100 100" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linejoin="round"><path d="M28 20 L10 32 L20 44 L28 38 V86 H72 V38 L80 44 L90 32 L72 20 Q70 30 50 32 Q30 30 28 20 Z"/><path d="M38 20 Q50 40 62 20"/><circle cx="46" cy="52" r="1.6" fill="currentColor"/><circle cx="54" cy="52" r="1.6" fill="currentColor"/></svg>`,
  jorts: `<svg viewBox="0 0 100 100" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linejoin="round"><path d="M22 16 H78 L80 56 Q80 62 74 62 L58 62 L54 84 H46 L42 62 L26 62 Q20 62 20 56 Z"/><line x1="50" y1="16" x2="50" y2="60"/></svg>`,
  pants: `<svg viewBox="0 0 100 100" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linejoin="round"><path d="M24 14 H76 L79 88 H63 L52 34 L48 34 L40 88 H21 Z"/><line x1="50" y1="14" x2="50" y2="34"/></svg>`,
  jacket: `<svg viewBox="0 0 100 100" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linejoin="round"><path d="M32 16 L10 30 L20 44 L30 38 V86 H70 V38 L80 44 L90 30 L68 16 L58 26 L50 30 L42 26 Z"/><line x1="50" y1="30" x2="50" y2="86"/></svg>`,
  cap: `<svg viewBox="0 0 100 100" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linejoin="round"><path d="M15 62 Q50 30 85 62" /><path d="M85 62 Q95 60 96 66 Q96 72 84 70 Z"/><path d="M15 62 Q50 74 85 62" /></svg>`
};

/* ---------------- low-level API helper ---------------- */
function getToken() { return localStorage.getItem(TOKEN_KEY); }
function setToken(t) { localStorage.setItem(TOKEN_KEY, t); }
function clearToken() { localStorage.removeItem(TOKEN_KEY); }

async function api(path, options = {}) {
  const headers = { 'Content-Type': 'application/json', ...(options.headers || {}) };
  const token = getToken();
  if (token) headers['Authorization'] = 'Bearer ' + token;

  const res = await fetch(path, { ...options, headers });
  let data = null;
  try { data = await res.json(); } catch (e) { /* no body */ }

  if (!res.ok) {
    const msg = (data && data.error) || `Request failed (${res.status})`;
    const err = new Error(msg);
    err.status = res.status;
    throw err;
  }
  return data;
}
const apiGet = (path) => api(path, { method: 'GET' });
const apiPost = (path, body) => api(path, { method: 'POST', body: JSON.stringify(body || {}) });
const apiPatch = (path, body) => api(path, { method: 'PATCH', body: JSON.stringify(body || {}) });
const apiDelete = (path) => api(path, { method: 'DELETE' });

/* ---------------- auth ---------------- */
async function register(name, email, password) {
  const data = await apiPost('/api/auth/register', { name, email, password });
  setToken(data.token);
  return data.user;
}
async function login(email, password) {
  const data = await apiPost('/api/auth/login', { email, password });
  setToken(data.token);
  return data.user;
}
async function logout() {
  try { await apiPost('/api/auth/logout'); } catch (e) { /* ignore */ }
  clearToken();
}
async function getCurrentUser() {
  if (!getToken()) return null;
  try {
    const data = await apiGet('/api/auth/me');
    return data.user;
  } catch (e) {
    clearToken();
    return null;
  }
}
/* Call at the top of any page that requires login.
   Returns the user object, or redirects to reg.html and returns null. */
async function requireAuth() {
  const user = await getCurrentUser();
  if (!user) { window.location.href = 'reg.html'; return null; }
  return user;
}

/* ---------------- products ---------------- */
let PRODUCTS = [];
async function loadProducts() {
  const data = await apiGet('/api/products');
  PRODUCTS = data.products;
  return PRODUCTS;
}

/* ---------------- cart ---------------- */
async function fetchCart() {
  return apiGet('/api/cart'); // { lines, subtotal, shipping, total }
}
async function addToCart(productId, qty, size, color) {
  return apiPost('/api/cart', { productId, qty, size, color }); // { lines }
}
async function setCartQty(itemId, qty) {
  return apiPatch(`/api/cart/${itemId}`, { qty }); // { lines }
}
async function removeCartItem(itemId) {
  return apiDelete(`/api/cart/${itemId}`); // { lines }
}

/* ---------------- orders ---------------- */
async function checkout(method, address) {
  const data = await apiPost('/api/orders', { method, address });
  return data.order;
}
async function fetchOrders() {
  const data = await apiGet('/api/orders');
  return data.orders;
}
async function fetchOrder(id) {
  const data = await apiGet(`/api/orders/${id}`);
  return data.order;
}
async function updateOrderStatus(id, status) {
  const data = await apiPatch(`/api/orders/${id}`, { status });
  return data.order;
}
async function deleteOrderApi(id) {
  return apiDelete(`/api/orders/${id}`);
}
async function clearAllOrders() {
  return apiDelete('/api/orders');
}

/* ---------------- misc UI helpers ---------------- */
function showToast(msg, ms = 2400) {
  let el = document.querySelector('.toast');
  if (!el) {
    el = document.createElement('div');
    el.className = 'toast';
    document.body.appendChild(el);
  }
  el.textContent = msg;
  requestAnimationFrame(() => el.classList.add('show'));
  clearTimeout(el._t);
  el._t = setTimeout(() => el.classList.remove('show'), ms);
}

/* flying-tag add-to-cart animation: flies a little price tag
   from the clicked button toward the cart icon in the topbar */
function flyToCart(startEl, label) {
  const cartBtn = document.querySelector('.cart-btn');
  if (!cartBtn || !startEl) return;
  const startRect = startEl.getBoundingClientRect();
  const endRect = cartBtn.getBoundingClientRect();

  const tag = document.createElement('div');
  tag.className = 'fly-tag';
  tag.textContent = label || 'ADDED';
  tag.style.left = startRect.left + startRect.width / 2 - 20 + 'px';
  tag.style.top = startRect.top + startRect.height / 2 - 12 + 'px';
  document.body.appendChild(tag);

  requestAnimationFrame(() => {
    tag.style.left = endRect.left + endRect.width / 2 - 20 + 'px';
    tag.style.top = endRect.top + endRect.height / 2 - 12 + 'px';
    tag.style.transform = 'scale(.3)';
    tag.style.opacity = '0.15';
  });

  setTimeout(() => tag.remove(), 750);
}
