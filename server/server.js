/* =========================================================
   DAWN'S WARDROBE — server.js
   Express API + static file server backed by SQLite (db.js).
   ========================================================= */

require('dotenv').config();
const path = require('path');
const crypto = require('crypto');
const express = require('express');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const nodemailer = require('nodemailer');
const db = require('./db');

const app = express();
const PORT = process.env.PORT || 3000;
const EMAIL_SERVICE = process.env.EMAIL_SERVICE;
const EMAIL_HOST = process.env.EMAIL_HOST;
const EMAIL_PORT = process.env.EMAIL_PORT ? Number(process.env.EMAIL_PORT) : undefined;
const EMAIL_SECURE = process.env.EMAIL_SECURE === 'true' || EMAIL_PORT === 465;
const EMAIL_USER = process.env.EMAIL_USER;
const EMAIL_PASS = process.env.EMAIL_PASS;
const EMAIL_FROM = process.env.EMAIL_FROM || EMAIL_USER;
const NOTIFY_EMAIL = process.env.NOTIFY_EMAIL || EMAIL_USER;

let mailTransport = null;
if (EMAIL_USER && EMAIL_PASS && NOTIFY_EMAIL) {
  const transportOptions = EMAIL_HOST
    ? {
        host: EMAIL_HOST,
        port: EMAIL_PORT || 587,
        secure: EMAIL_SECURE,
        auth: { user: EMAIL_USER, pass: EMAIL_PASS }
      }
    : EMAIL_SERVICE
      ? { service: EMAIL_SERVICE, auth: { user: EMAIL_USER, pass: EMAIL_PASS } }
      : null;

  if (transportOptions) {
    mailTransport = nodemailer.createTransport(transportOptions);
  }
}

if (mailTransport) {
  console.log('Order email notifications enabled to', NOTIFY_EMAIL, 'from', EMAIL_FROM);
  console.log('Email transport configured with', EMAIL_SERVICE ? `service=${EMAIL_SERVICE}` : `host=${EMAIL_HOST}:${EMAIL_PORT}`);
} else {
  console.log('Order email notifications disabled. Set EMAIL_USER, EMAIL_PASS, and NOTIFY_EMAIL plus EMAIL_SERVICE or EMAIL_HOST to enable.');
}

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, '..', 'public')));

const ORDER_STATUSES = ['Processing', 'Packed', 'Out for delivery', 'Delivered', 'Cancelled'];
const SHIPPING_FEE = 120;

/* ---------------- helpers ---------------- */
function genToken() {
  return crypto.randomBytes(24).toString('hex');
}
function genOrderId() {
  const d = new Date();
  const rand = Math.floor(1000 + Math.random() * 9000);
  const yy = d.getFullYear().toString().slice(2);
  const mm = (d.getMonth() + 1).toString().padStart(2, '0');
  const dd = d.getDate().toString().padStart(2, '0');
  return `DW-${yy}${mm}${dd}-${rand}`;
}
function publicUser(u) {
  return { id: u.id, name: u.name, email: u.email };
}
function parseProduct(p) {
  return { ...p, sizes: JSON.parse(p.sizes), colors: JSON.parse(p.colors) };
}
function formatPHP(n) {
  return '₱' + Number(n).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
async function sendOrderNotification(order) {
  if (!mailTransport) return;

  const htmlItems = order.items.map(i => `
      <tr>
        <td>${i.name}</td>
        <td>${i.size || '—'}</td>
        <td>${i.color || '—'}</td>
        <td style="text-align:right">${i.qty}</td>
        <td style="text-align:right">${formatPHP(i.lineTotal)}</td>
      </tr>
    `).join('');

  const html = `
    <div style="font-family:Arial,sans-serif;color:#111;line-height:1.5;">
      <h2>New order received: ${order.id}</h2>
      <p><strong>Customer:</strong> ${order.customerName} &lt;${order.customerEmail}&gt;</p>
      <p><strong>Payment:</strong> ${order.method}</p>
      <p><strong>Address:</strong> ${order.address || '—'}</p>
      <table cellpadding="6" cellspacing="0" border="1" style="border-collapse:collapse;width:100%;max-width:640px;">
        <thead>
          <tr>
            <th align="left">Item</th><th align="left">Size</th><th align="left">Color</th><th align="right">Qty</th><th align="right">Line total</th>
          </tr>
        </thead>
        <tbody>
          ${htmlItems}
        </tbody>
      </table>
      <p><strong>Subtotal:</strong> ${formatPHP(order.subtotal)}<br>
      <strong>Shipping:</strong> ${formatPHP(order.shipping)}<br>
      <strong>Total:</strong> ${formatPHP(order.total)}</p>
    </div>
  `;

  try {
    await mailTransport.sendMail({
      from: EMAIL_FROM,
      to: NOTIFY_EMAIL,
      subject: `New order received — ${order.id}`,
      text: `New order ${order.id} from ${order.customerName} (${order.customerEmail}). Total ${formatPHP(order.total)}.`,
      html
    });
  } catch (err) {
    console.error('Failed to send order notification email:', err);
  }
}

/* auth middleware: expects "Authorization: Bearer <token>" */
function authRequired(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return res.status(401).json({ error: 'Not authenticated' });

  const session = db.prepare('SELECT * FROM sessions WHERE token = ?').get(token);
  if (!session) return res.status(401).json({ error: 'Invalid or expired session' });

  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(session.user_id);
  if (!user) return res.status(401).json({ error: 'User not found' });

  req.user = user;
  next();
}

/* =========================================================
   AUTH
   ========================================================= */

app.post('/api/auth/register', (req, res) => {
  const { name, email, password } = req.body || {};
  if (!name || name.trim().length < 2) return res.status(400).json({ error: 'Please provide your name.' });
  if (!email || !/^\S+@\S+\.\S+$/.test(email)) return res.status(400).json({ error: 'Enter a valid email address.' });
  if (!password || password.length < 6) return res.status(400).json({ error: 'Password must be at least 6 characters.' });

  const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(email.trim().toLowerCase());
  if (existing) return res.status(409).json({ error: 'An account with that email already exists.' });

  const hash = bcrypt.hashSync(password, 10);
  const info = db.prepare('INSERT INTO users (name, email, password_hash) VALUES (?, ?, ?)')
    .run(name.trim(), email.trim().toLowerCase(), hash);

  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(info.lastInsertRowid);
  const token = genToken();
  db.prepare('INSERT INTO sessions (token, user_id) VALUES (?, ?)').run(token, user.id);

  res.status(201).json({ token, user: publicUser(user) });
});

app.post('/api/auth/login', (req, res) => {
  const { email, password } = req.body || {};
  if (!email || !/^\S+@\S+\.\S+$/.test(email)) return res.status(400).json({ error: 'Enter a valid email address.' });
  if (!password || password.length < 6) return res.status(400).json({ error: 'Password must be at least 6 characters.' });

  const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email.trim().toLowerCase());
  if (!user || !bcrypt.compareSync(password, user.password_hash)) {
    return res.status(401).json({ error: 'Incorrect email or password.' });
  }

  const token = genToken();
  db.prepare('INSERT INTO sessions (token, user_id) VALUES (?, ?)').run(token, user.id);
  res.json({ token, user: publicUser(user) });
});

app.get('/api/auth/me', authRequired, (req, res) => {
  res.json({ user: publicUser(req.user) });
});

app.post('/api/auth/logout', authRequired, (req, res) => {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (token) db.prepare('DELETE FROM sessions WHERE token = ?').run(token);
  res.json({ ok: true });
});

/* =========================================================
   PRODUCTS
   ========================================================= */

app.get('/api/products', (req, res) => {
  const rows = db.prepare('SELECT * FROM products').all();
  res.json({ products: rows.map(parseProduct) });
});

/* =========================================================
   CART  (per logged-in user)
   ========================================================= */

function cartLinesFor(userId) {
  const rows = db.prepare(`
    SELECT c.id AS item_id, c.size, c.color, c.qty, p.*
    FROM cart_items c JOIN products p ON p.id = c.product_id
    WHERE c.user_id = ?
    ORDER BY c.id ASC
  `).all(userId);

  return rows.map(r => ({
    itemId: r.item_id,
    id: r.id,
    name: r.name,
    cat: r.cat,
    price: r.price,
    icon: r.icon,
    image: r.image,
    size: r.size,
    color: r.color,
    qty: r.qty,
    lineTotal: r.price * r.qty
  }));
}

app.get('/api/cart', authRequired, (req, res) => {
  const lines = cartLinesFor(req.user.id);
  const subtotal = lines.reduce((s, l) => s + l.lineTotal, 0);
  const shipping = lines.length > 0 ? SHIPPING_FEE : 0;
  res.json({ lines, subtotal, shipping, total: subtotal + shipping });
});

app.post('/api/cart', authRequired, (req, res) => {
  const { productId, qty, size, color } = req.body || {};
  const q = Math.max(1, parseInt(qty, 10) || 1);
  const product = db.prepare('SELECT * FROM products WHERE id = ?').get(productId);
  if (!product) return res.status(404).json({ error: 'Product not found.' });

  const existing = db.prepare(`
    SELECT * FROM cart_items WHERE user_id = ? AND product_id = ? AND size = ? AND color = ?
  `).get(req.user.id, productId, size, color);

  if (existing) {
    db.prepare('UPDATE cart_items SET qty = ? WHERE id = ?').run(existing.qty + q, existing.id);
  } else {
    db.prepare(`
      INSERT INTO cart_items (user_id, product_id, size, color, qty) VALUES (?, ?, ?, ?, ?)
    `).run(req.user.id, productId, size, color, q);
  }

  res.status(201).json({ lines: cartLinesFor(req.user.id) });
});

app.patch('/api/cart/:itemId', authRequired, (req, res) => {
  const { qty } = req.body || {};
  const item = db.prepare('SELECT * FROM cart_items WHERE id = ? AND user_id = ?').get(req.params.itemId, req.user.id);
  if (!item) return res.status(404).json({ error: 'Cart item not found.' });

  if (qty <= 0) {
    db.prepare('DELETE FROM cart_items WHERE id = ?').run(item.id);
  } else {
    db.prepare('UPDATE cart_items SET qty = ? WHERE id = ?').run(qty, item.id);
  }
  res.json({ lines: cartLinesFor(req.user.id) });
});

app.delete('/api/cart/:itemId', authRequired, (req, res) => {
  db.prepare('DELETE FROM cart_items WHERE id = ? AND user_id = ?').run(req.params.itemId, req.user.id);
  res.json({ lines: cartLinesFor(req.user.id) });
});

/* =========================================================
   ORDERS
   ========================================================= */

app.post('/api/orders', authRequired, (req, res) => {
  const { method, address } = req.body || {};
  const lines = cartLinesFor(req.user.id);
  if (lines.length === 0) return res.status(400).json({ error: 'Your cart is empty.' });

  const subtotal = lines.reduce((s, l) => s + l.lineTotal, 0);
  const shipping = SHIPPING_FEE;
  const total = subtotal + shipping;
  const orderId = genOrderId();

  const insertOrder = db.prepare(`
    INSERT INTO orders (id, user_id, customer_name, customer_email, subtotal, shipping, total, method, address, status)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'Processing')
  `);
  const insertItem = db.prepare(`
    INSERT INTO order_items (order_id, product_id, name, cat, size, color, qty, price, line_total)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const clearCart = db.prepare('DELETE FROM cart_items WHERE user_id = ?');

  const tx = db.transaction(() => {
    insertOrder.run(orderId, req.user.id, req.user.name, req.user.email, subtotal, shipping, total, method || 'cash', address || '');
    for (const l of lines) {
      insertItem.run(orderId, l.id, l.name, l.cat, l.size, l.color, l.qty, l.price, l.lineTotal);
    }
    clearCart.run(req.user.id);
  });
  tx();

  const order = getOrderFull(orderId);
  res.status(201).json({ order });
  sendOrderNotification(order);
});

function getOrderFull(orderId) {
  const order = db.prepare('SELECT * FROM orders WHERE id = ?').get(orderId);
  if (!order) return null;
  const items = db.prepare('SELECT * FROM order_items WHERE order_id = ?').all(orderId);
  return {
    id: order.id,
    date: order.created_at,
    status: order.status,
    customerName: order.customer_name,
    customerEmail: order.customer_email,
    method: order.method,
    address: order.address,
    subtotal: order.subtotal,
    shipping: order.shipping,
    total: order.total,
    items: items.map(i => ({
      id: i.product_id, name: i.name, cat: i.cat, size: i.size, color: i.color,
      qty: i.qty, price: i.price, lineTotal: i.line_total
    }))
  };
}

/* Note: for this demo, any logged-in user can view /api/orders (all orders),
   matching the original single-shared-admin-page behavior. Add a role check
   here if you need real access control. */
app.get('/api/orders', authRequired, (req, res) => {
  const rows = db.prepare('SELECT id FROM orders ORDER BY created_at DESC').all();
  res.json({ orders: rows.map(r => getOrderFull(r.id)) });
});

app.get('/api/orders/:id', authRequired, (req, res) => {
  const order = getOrderFull(req.params.id);
  if (!order) return res.status(404).json({ error: 'Order not found.' });
  res.json({ order });
});

app.patch('/api/orders/:id', authRequired, (req, res) => {
  const { status } = req.body || {};
  if (!ORDER_STATUSES.includes(status)) return res.status(400).json({ error: 'Invalid status.' });
  const info = db.prepare('UPDATE orders SET status = ? WHERE id = ?').run(status, req.params.id);
  if (info.changes === 0) return res.status(404).json({ error: 'Order not found.' });
  res.json({ order: getOrderFull(req.params.id) });
});

app.delete('/api/orders/:id', authRequired, (req, res) => {
  db.prepare('DELETE FROM orders WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

app.delete('/api/orders', authRequired, (req, res) => {
  db.prepare('DELETE FROM orders').run();
  res.json({ ok: true });
});

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'public', 'reg.html'));
});

app.listen(PORT, () => {
  console.log(`Dawn's Wardrobe server running on http://localhost:${PORT}`);
});
