/* =========================================================
   DAWN'S WARDROBE — db.js
   SQLite database setup, schema, and product seed data.
   Uses better-sqlite3 (synchronous, no native build headaches
   on most hosts since it ships prebuilt binaries).
   ========================================================= */

const path = require('path');
const Database = require('better-sqlite3');

const DB_PATH = path.join(__dirname, 'data.db');
const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');

/* ---------------- schema ---------------- */
db.exec(`
CREATE TABLE IF NOT EXISTS users (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  name          TEXT NOT NULL,
  email         TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  created_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS sessions (
  token      TEXT PRIMARY KEY,
  user_id    INTEGER NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS products (
  id     TEXT PRIMARY KEY,
  name   TEXT NOT NULL,
  cat    TEXT NOT NULL,
  price  INTEGER NOT NULL,
  icon   TEXT NOT NULL,
  image  TEXT,
  sizes  TEXT NOT NULL,   -- JSON array
  colors TEXT NOT NULL    -- JSON array
);

CREATE TABLE IF NOT EXISTS cart_items (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id    INTEGER NOT NULL,
  product_id TEXT NOT NULL,
  size       TEXT NOT NULL,
  color      TEXT NOT NULL,
  qty        INTEGER NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (product_id) REFERENCES products(id),
  UNIQUE(user_id, product_id, size, color)
);

CREATE TABLE IF NOT EXISTS orders (
  id             TEXT PRIMARY KEY,      -- e.g. DW-260811-1234
  user_id        INTEGER,
  customer_name  TEXT,
  customer_email TEXT,
  subtotal       INTEGER NOT NULL,
  shipping       INTEGER NOT NULL,
  total          INTEGER NOT NULL,
  method         TEXT,
  address        TEXT,
  status         TEXT NOT NULL DEFAULT 'Processing',
  created_at     TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS order_items (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  order_id    TEXT NOT NULL,
  product_id  TEXT,
  name        TEXT NOT NULL,
  cat         TEXT,
  size        TEXT,
  color       TEXT,
  qty         INTEGER NOT NULL,
  price       INTEGER NOT NULL,
  line_total  INTEGER NOT NULL,
  FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE
);
`);

/* ---------------- seed products (only if table empty) ---------------- */
const APPAREL_SIZES = JSON.stringify(['S', 'M', 'L', 'XL', 'XXL']);
const ONE_SIZE = JSON.stringify(['One Size']);
const COLORWAYS = JSON.stringify([
  { name: 'Jet Black', hex: '#141414' },
  { name: 'Charcoal Grey', hex: '#4b4b4d' },
  { name: 'Stone Wash', hex: '#8c877c' }
]);

const SEED_PRODUCTS = [
  ['sh-01', 'Reyllo Clan Graphic Shirt', 'Shirts', 1299, 'tee', 'shirt-reyllo-clan.jpg', APPAREL_SIZES, COLORWAYS],
  ['sh-02', 'Dawn Varsity Graphic Shirt', 'Shirts', 1349, 'tee', 'shirt-dawn-varsity.jpg', APPAREL_SIZES, COLORWAYS],
  ['sh-03', 'Dawn 22 Custom Jersey', 'Shirts', 1599, 'tee', 'shirt-dawn-22-jersey.jpg', APPAREL_SIZES, COLORWAYS],
  ['sh-04', 'Calimon Sports Club Jersey', 'Shirts', 1499, 'tee', 'shirt-calimon-jersey.jpg', APPAREL_SIZES, COLORWAYS],
  ['ho-04', 'Reyllo Clan Cotton Lab Hoodie', 'Hoodies', 1799, 'hoodie', 'hoodie-reyllo-clan.jpg', APPAREL_SIZES, COLORWAYS],
  ['ho-05', 'Calimon Puff-Print Hoodie', 'Hoodies', 1899, 'hoodie', 'hoodie-calimon.jpg', APPAREL_SIZES, COLORWAYS],
  ['ho-06', 'Reyllo Studio Panel Hoodie', 'Hoodies', 1949, 'hoodie', 'hoodie-reyllo.jpg', APPAREL_SIZES, COLORWAYS],
  ['sh-05', 'I Am Not Reyllo For Nothing Tee', 'Shirts', 1399, 'tee', 'shirt-i-am-not-reyllo.jpg', APPAREL_SIZES, COLORWAYS],
  ['sh-06', 'Dawn Wardrobe Sleeveless Tee', 'Shirts', 1249, 'tee', 'shirt-dawn-wardrobe-sleeveless.jpg', APPAREL_SIZES, COLORWAYS],
  ['sh-07', 'Colimon Skeleton Rider Tee', 'Shirts', 1449, 'tee', 'shirt-colimon-skeleton.jpg', APPAREL_SIZES, COLORWAYS],
  ['sh-08', 'DJRG Anarchy Distressed Tee', 'Shirts', 1599, 'tee', 'shirt-djrg-anarchy-distressed.jpg', APPAREL_SIZES, COLORWAYS],
  ['cp-01', 'Dawn Street Kings Chain Cap', 'Caps', 699, 'cap', 'cap-dawn-streetkings.jpg', ONE_SIZE, COLORWAYS],
  ['cp-02', 'DVAG Tribal Distressed Cap', 'Caps', 649, 'cap', 'cap-dvag-tribal.jpg', ONE_SIZE, COLORWAYS],
  ['jo-01', 'DJRG Tribal Flame Shorts', 'Jorts', 1799, 'jorts', 'jorts-djrg-flame.jpg', APPAREL_SIZES, COLORWAYS],
  ['jo-02', 'Dawn Barbed Wire Denim Shorts', 'Jorts', 1849, 'jorts', 'jorts-dawn-barbedwire.jpg', APPAREL_SIZES, COLORWAYS]
];

const productCount = db.prepare('SELECT COUNT(*) AS c FROM products').get().c;
if (productCount === 0) {
  const insert = db.prepare(`
    INSERT INTO products (id, name, cat, price, icon, image, sizes, colors)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const insertMany = db.transaction((rows) => {
    for (const row of rows) insert.run(...row);
  });
  insertMany(SEED_PRODUCTS);
  console.log(`Seeded ${SEED_PRODUCTS.length} products.`);
}

module.exports = db;
