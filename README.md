# Dawn's Wardrobe — backend + database

A Node/Express API backed by SQLite. Replaces the old `localStorage`
version: users, cart, and orders now live in a real database
(`server/data.db`), served over HTTP to the same frontend pages.

## Folder structure

```
dawns-wardrobe/
  server/
    package.json
    server.js      ← Express app + all API routes
    db.js           ← SQLite schema + product seed data
  public/
    style.css       ← unchanged
    function.js     ← now an API client (fetch calls instead of localStorage)
    reg.html
    shop.html
    payment.html    ← new; matches the pay-/receipt-/delivery- CSS you already had
    admin.html
  .gitignore
```

## Deploying from a tablet (no terminal needed)

### 1. Upload to GitHub
1. Go to your new repo (e.g. `github.com/donnalyng22-rgb/dawns-wardrobe`).
2. Click **"uploading an existing file"** (or Add file → Upload files).
3. Upload every file above, **keeping the folder structure** — GitHub's
   uploader preserves subfolders when you drag a whole folder in, or you
   can create the `server/` and `public/` folders first by uploading
   one file at a time with the folder path typed into the filename box
   (e.g. type `server/server.js` as the filename).
4. Commit directly to `main`.

### 2. Deploy on Render
1. Go to [render.com](https://render.com) → sign up (GitHub login is easiest).
2. **New → Web Service** → connect your `dawns-wardrobe` repo.
3. Fill in:
   - **Root Directory:** `server`
   - **Build Command:** `npm install`
   - **Start Command:** `npm start`
   - **Instance Type:** Free
4. Click **Create Web Service**. Render installs dependencies and
   starts the server — you'll get a live URL like
   `https://dawns-wardrobe.onrender.com`.
5. Open that URL — it serves `public/reg.html` automatically
   (Express serves `public/` as static files, and `/api/...` is the API).

### 3. Known free-tier limits
- The service sleeps after ~15 min idle; the next visit takes ~30s to wake up.
- The SQLite file (`server/data.db`) is **not guaranteed to persist**
  across redeploys on Render's free plan, since the filesystem is
  ephemeral. For data that must survive redeploys, add a Render
  **persistent disk** (small paid add-on) mounted at `server/`, or
  migrate to Render's free-tier **Postgres** later — the `db.js` file
  is the only place that would need to change.

## API summary

| Method | Path                | Auth | Purpose |
|---|---|---|---|
| POST | `/api/auth/register` | – | create account, returns token |
| POST | `/api/auth/login` | – | returns token |
| GET  | `/api/auth/me` | ✓ | current user |
| POST | `/api/auth/logout` | ✓ | invalidate token |
| GET  | `/api/products` | – | product catalog |
| GET  | `/api/cart` | ✓ | current user's cart |
| POST | `/api/cart` | ✓ | add item `{productId, qty, size, color}` |
| PATCH | `/api/cart/:itemId` | ✓ | change qty |
| DELETE | `/api/cart/:itemId` | ✓ | remove item |
| POST | `/api/orders` | ✓ | checkout `{method, address}` |
| GET  | `/api/orders` | ✓ | all orders (admin page) |
| GET  | `/api/orders/:id` | ✓ | one order |
| PATCH | `/api/orders/:id` | ✓ | update status |
| DELETE | `/api/orders/:id` | ✓ | delete one order |
| DELETE | `/api/orders` | ✓ | clear all orders |

Auth uses a bearer token (`Authorization: Bearer <token>`), stored in
`localStorage` on the client as `dw_token` — only the token lives
client-side now, not any actual data.
