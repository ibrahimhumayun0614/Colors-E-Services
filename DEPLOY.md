# Deploy live via GitHub + Cloudflare (no Node.js on your PC)

Everything builds on **GitHub Actions** and deploys to **Cloudflare**. You only need a browser and Git (or GitHub Desktop).

Open the app from **Cloudflare Dashboard → Workers & Pages → ccs-invoice → Visit site** (bookmark that URL for daily use).

| Project | Type | Where to find it |
|---------|------|------------------|
| **ccs-invoice** | Pages (website) | Cloudflare → Workers & Pages → **ccs-invoice** |
| **ccs-invoice-api** | Worker (API) | Cloudflare → Workers & Pages → **ccs-invoice-api** |

> Do **not** put your Worker API URL in this repo or in public docs. Configure it only as the GitHub secret `WORKER_API_URL` (see Step 4). Opening the Worker URL directly in a browser often shows 404 — that is normal. Always use **ccs-invoice** for the app.
---

## Step 1 — Create the D1 database (Cloudflare Dashboard)

1. Go to [Cloudflare Dashboard](https://dash.cloudflare.com/)
2. Open **Storage & Databases** → **D1 SQL Database**
3. Click **Create database**
4. Name it: `ccs-invoice-db`
5. Copy the **Database ID** (a UUID like `a1b2c3d4-...`)

6. Open `worker/wrangler.toml` in this project and replace:
   ```
   database_id = "REPLACE_WITH_YOUR_D1_DATABASE_ID"
   ```
   with your real Database ID.

> Do this **before** the first deploy, or the workflow will fail.

---

## Step 2 — Push code to GitHub

### Option A — GitHub website (easiest, no terminal)

1. Go to [github.com/new](https://github.com/new)
2. Create a repo named e.g. `client-crm` (public or private)
3. On the repo page click **Add file** → **Upload files**
4. Drag the entire `App` folder contents into the upload area
5. Click **Commit changes**

### Option B — GitHub Desktop

1. Install [GitHub Desktop](https://desktop.github.com/)
2. **File → Add local repository** → select this `App` folder
3. **Publish repository** to your GitHub account

### Option C — Git in terminal (if you prefer)

```powershell
cd c:\Users\mohamed.ibrahim\Downloads\Application\App
git init
git add .
git commit -m "Initial CRM app"
git branch -M main
git remote add origin https://github.com/YOUR-USERNAME/client-crm.git
git push -u origin main
```

---

## Step 3 — Cloudflare API token

1. In [Cloudflare Dashboard](https://dash.cloudflare.com/), copy your **Account ID** (right sidebar on Workers home)
2. Go to [API Tokens](https://dash.cloudflare.com/profile/api-tokens) → **Create Token**
3. Use template **Edit Cloudflare Workers** and add these permissions:
   - **Account → D1 → Edit**
   - **Account → Cloudflare Pages → Edit**
4. Create token and **copy it** (shown once)

---

## Step 4 — GitHub secrets

In your GitHub repo:

1. **Settings** → **Secrets and variables** → **Actions**
2. **New repository secret** — add all of these:

| Name | Value |
|------|--------|
| `CLOUDFLARE_API_TOKEN` | Token from Step 3 |
| `CLOUDFLARE_ACCOUNT_ID` | Account ID from Step 3 |
| `WORKER_API_URL` | Worker base URL + `/api` from Cloudflare → **ccs-invoice-api** → Triggers (e.g. `https://…workers.dev/api`). **Secrets only — never commit this URL.** |
| `PAGES_PROJECT_NAME` | (optional) Default is `ccs-invoice` |

> **Worker vs Pages:** `ccs-invoice-api` is the API. `ccs-invoice` is the website. Keep the API URL in GitHub Secrets, not in code or markdown.

---

## Step 5 — First deploy

1. In GitHub repo go to **Actions**
2. Open **Deploy to Cloudflare** → **Run workflow**
3. Check **Apply D1 schema** (first time only) → **Run workflow**

Or push any change to the `main` branch — deploy runs automatically.

> **Normal code updates** only deploy the Worker API + website. Database schema runs **only** when `worker/schema.sql` changes or when you tick **Apply D1 schema** on a manual run. Demo data is **not** loaded automatically — use **Settings → Data** in the app.

Wait ~2 minutes. When the green checkmark appears, your app is live.

---

## Step 6 — Set your API password (one time)

1. Cloudflare Dashboard → **Workers & Pages** → **ccs-invoice-api**
2. **Settings** → **Variables and Secrets**
3. Under **Secrets**, add:
   - Name: `API_SECRET`
   - Value: a password you choose (e.g. a long random string)
4. **Deploy** / save (Cloudflare may redeploy the worker)

---

## Step 7 — Open the app

1. Cloudflare Dashboard → **Workers & Pages** → **ccs-invoice** → **Visit site**
2. Log in with your `API_SECRET` password

You’re done. Bookmark your Pages URL for daily use.

---

## Final stage — before you treat production as live

Complete this checklist **after** deploy works and **before** you rely on the app day to day:

| Item | Action |
|------|--------|
| **Login lockout** | **Enable** rate limiting in production. Do **not** add `DISABLE_LOGIN_RATE_LIMIT` to Cloudflare **ccs-invoice-api** secrets or vars. That flag is for local `.dev.vars` only while developing. |
| **API password** | Use a strong random `API_SECRET` (not `local-dev-password`). |
| **Shop profile** | In the app → **Settings → Profile**, set company name (e.g. **Colors Common Services**), address, and payment details for invoices. |
| **Demo data** | Skip demo load in production, or remove demo data from **Settings → Data** when finished testing. |
| **Origins** | In **ccs-invoice-api** → **Variables**, set `ALLOWED_ORIGINS` to your live **ccs-invoice** URL (and custom domain if you add one). |

---

## Update the app after changes

Edit files on GitHub (or push from GitHub Desktop):

- **Edit on GitHub:** open a file → pencil icon → edit → **Commit changes**
- **GitHub Desktop:** commit + push

Each push to `main` redeploys the **API and website only** (~2 min). Your database is not touched unless you change `schema.sql` or run **Apply D1 schema** manually. Demo data is managed from **Settings → Data** in the app.

---

## Troubleshooting

| Problem | Fix |
|---------|-----|
| Action fails: invalid `database_id` | Complete Step 1 — set real D1 ID in `wrangler.toml` |
| Action fails: unauthorized | Check `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID` secrets |
| `Unauthorized` in the app | Settings → enter the same value as `API_SECRET` in Cloudflare |
| Action fails: assets-upload / code 10013 | Fixed — app now deploys API + Pages separately |
| Blank page on Pages | Set GitHub secret `WORKER_API_URL` to your Worker trigger URL + `/api` (from Cloudflare **ccs-invoice-api**, not from this repo) |
| Worker shows 404 in browser | Normal — API only. Open the app via **ccs-invoice** in Cloudflare Dashboard |
| Database errors | Re-run **Deploy to Cloudflare** with **Apply D1 schema** checked, or edit `worker/schema.sql` and push |
| Explore with sample data | Open the app → **Settings → Data** → **Load demo data** |
| Remove sample data | **Settings → Data** → **Remove demo data** (only `@demo.local` records) |

---

## Custom domain (optional)

Cloudflare → Workers → **ccs-invoice-api** → **Settings** → **Domains & Routes** → add your domain.
