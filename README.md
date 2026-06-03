# Geoform Monitor — Deployment Guide
## MySQL + Netlify Functions Backend

---

## What You're Getting

```
Monitor/
├── index.html                  ← your dashboard (needs 1 edit — see Step 4)
├── Vessel_Monitor.xlsx         ← your existing Excel file
├── schema.sql                  ← run this ONCE in MySQL to create tables
├── netlify.toml                ← tells Netlify where your functions are
├── package.json                ← Node dependency (mysql2)
├── DB_PATCH.js                 ← copy this into index.html (see Step 4)
└── netlify/
    └── functions/
        ├── db.js               ← shared DB connection (don't edit)
        ├── vessels.js          ← GET all vessels / PATCH one field
        ├── sync.js             ← POST Excel → merge into DB
        └── audit.js            ← GET/DELETE audit log
```

---

## Step 1 — Set Up Your MySQL Database

Run `schema.sql` in your MySQL client (phpMyAdmin, TablePlus, DBeaver, etc.):

```sql
-- Just open schema.sql and run the whole file.
-- It creates 3 tables: vessels, audit_log, mom_errors
```

---

## Step 2 — Create a GitHub Repository

1. Go to https://github.com/new
2. Name it `geoform-monitor` (or anything you like)
3. Keep it **Private**
4. Click **Create repository**

Then on your computer, open a terminal in your `Monitor/` folder:

```bash
git init
git add .
git commit -m "Initial commit"
git branch -M main
git remote add origin https://github.com/YOUR_USERNAME/geoform-monitor.git
git push -u origin main
```

---

## Step 3 — Deploy to Netlify

1. Go to https://app.netlify.com
2. Click **Add new site → Import an existing project**
3. Connect your GitHub account → select `geoform-monitor`
4. Build settings:
   - **Build command:** leave blank (nothing to build)
   - **Publish directory:** `.` (just a dot)
5. Click **Deploy site**

### Set Environment Variables in Netlify

In your Netlify site dashboard → **Site configuration → Environment variables → Add a variable**:

| Key       | Value                          |
|-----------|--------------------------------|
| `DB_HOST` | your MySQL host (e.g. `db.example.com`) |
| `DB_USER` | your MySQL username            |
| `DB_PASS` | your MySQL password            |
| `DB_NAME` | your database name             |
| `DB_PORT` | `3306` (default, or your port) |
| `DB_SSL`  | `true` if your host requires SSL (most cloud MySQL providers do) |

After adding variables → **Trigger deploy** so the functions pick them up.

---

## Step 4 — Update index.html (ONE EDIT)

Open `index.html` and find this section near the bottom of the `<script>` tag:

```javascript
/* ═══════════════════════════════════════════════════════════
   INLINE EDIT ENGINE — Persistence, Edit Mode, Audit Log
═══════════════════════════════════════════════════════════*/
const LS_EDITS_KEY    = 'geoform_edits_v1';
```

**Select from that line all the way down to and including the closing `});` of the `DOMContentLoaded` block** (it's the very last thing before `</script>`).

**Replace that entire selected block** with the contents of `DB_PATCH.js`.

Save `index.html`, commit, and push:

```bash
git add index.html
git commit -m "Switch to MySQL persistence"
git push
```

Netlify will auto-deploy in ~30 seconds.

---

## Step 5 — Seed the Database with Your Excel Data

Once deployed, open your live site URL.
Drag-and-drop your `Vessel_Monitor.xlsx` onto the dashboard (or use the Upload button).

The dashboard will:
1. Parse the Excel file (existing logic)
2. Send all rows to `/.netlify/functions/sync`
3. Insert all vessels into MySQL
4. Reload from the database

From this point, **the Excel file is optional** — the database is the source of truth.

---

## How It Works After Deployment

| Action | What Happens |
|--------|-------------|
| Page load | Fetches all vessels from MySQL (`GET /vessels`) |
| PIC clicks a cell in Edit Mode | `PATCH /vessels` — saves to MySQL instantly |
| Page refresh | Still shows the same data — it came from MySQL |
| Another user opens the dashboard | Sees all the latest edits automatically |
| Excel upload | `POST /sync` — new vessels added, existing vessels updated only for non-manually-edited fields |
| Click 🕐 History | Audit drawer fetches from MySQL audit_log table |
| Click ⬇ Source Excel | Downloads current DB data as .xlsx |

---

## Merge Logic (Excel Upload)

When you upload a new Excel file:

- **New vessel** (name not in DB) → inserted completely
- **Existing vessel, field NOT manually edited** → updated from Excel
- **Existing vessel, field WAS manually edited** → **kept as-is** (the PIC's edit wins)

"Manually edited" means there's an entry in `audit_log` for that vessel + field.

---

## Local Development (Optional)

```bash
npm install
npm install -g netlify-cli
netlify dev
```

Create a `.env` file in your project root (Netlify CLI picks it up):
```
DB_HOST=your_host
DB_USER=your_user
DB_PASS=your_password
DB_NAME=your_db
DB_PORT=3306
DB_SSL=true
```

Your dashboard will be at `http://localhost:8888` and functions at
`http://localhost:8888/.netlify/functions/vessels` etc.

---

## Troubleshooting

**"DB unreachable — showing sample data"**
→ Check your Netlify environment variables are set correctly.
→ Check `DB_SSL=true` if your MySQL provider requires SSL.
→ Check the function logs in Netlify → Functions → vessels → Logs.

**"Save failed — change reverted"**
→ The PATCH to MySQL failed. Check function logs for the exact error.
→ Verify your DB user has INSERT/UPDATE permissions on the `vessels` and `audit_log` tables.

**Excel sync inserted 0 rows**
→ Make sure your Excel column headers match the expected names.
  The dashboard auto-detects: "Principal", "Vessel", "Last Approved Till",
  "PIC", "Incorrect Reporting", "Issue Type", "Biofuel", "Year End Report".

---

## Database Permissions Needed

```sql
GRANT SELECT, INSERT, UPDATE, DELETE ON your_db.vessels   TO 'your_user'@'%';
GRANT SELECT, INSERT, UPDATE, DELETE ON your_db.audit_log TO 'your_user'@'%';
GRANT SELECT, INSERT, UPDATE, DELETE ON your_db.mom_errors TO 'your_user'@'%';
FLUSH PRIVILEGES;
```
