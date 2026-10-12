# 🐾 PetCare Passport

PetCare Passport is a full-stack digital pet healthcare and emergency identification platform. It features **two dedicated portals**—the **Pet Owner Dashboard** and the **Administrator Console**—complemented by a public **Lost & Found Community Hub** and **Smart Emergency QR Passports**.

Built with MySQL 8.0, Node.js Express 5.3 backend, and Vanilla HTML5/CSS3/ES6+ JavaScript with zero frontend build dependencies.

---

## 📑 Table of Contents
- [Features](#-features)
- [Architecture & Tech Stack](#-architecture--tech-stack)
- [Local Setup & Getting Started](#-local-setup--getting-started)
- [Environment Variables](#-environment-variables)
- [Digital Passports & QR Code Resolution](#-digital-passports--qr-code-resolution)
- [Production Deployment & Demo Cleanup](#-production-deployment--demo-cleanup)
- [Automated Testing](#-automated-testing)
- [Security, Limitations & License](#-security-limitations--license)

---

## ✨ Features

### 🐶 Pet Owner Dashboard (`/owner/*`)
* **Pet Profiles (`/owner/pets.html`)**: Register, view, edit, and archive pets (species, breed, DOB/age, sex, microchip, weight, blood type, sterilization, markings, allergies, medical notes).
* **Digital Passports & QR Tags (`/owner/passports.html`)**: Generates unique public passport IDs with high-res QR codes. Granular privacy toggles for photo, name, breed, emergency phone, medical alerts, allergies, and vaccines.
* **Health Records (`/owner/health.html`)**: Chronological veterinary visits, surgeries, lab results, and document attachments (differentiates owner-entered from clinic-attributed entries).
* **Vaccination Tracker (`/owner/vaccinations.html`)**: Vaccine logs, clinics, and next-due dates with dynamic status badges (`Up to Date`, `Due Soon`, `Overdue`, `Unknown`).
* **Daily Care (`/owner/daily-care.html`)**: Recurring medications, feeding routines, grooming, and exercise checklists with completion persistence.
* **AI Assistant (`/owner/ai-assistant.html`)**: Wellness advice and triage guidance via Google Gemini or OpenRouter, with an internal evidence-based fallback engine and veterinary disclaimers.
* **Notifications & Settings (`/owner/notifications.html`, `/owner/profile.html`)**: In-app alerts, profile updates, and pattern-enforced password security.

### 🌍 Public Community & Emergency Hub
* **Public QR Passport (`/passport-view.html?id=[public_id]` & `/passport-view`)**: Mobile view accessible by scanning a pet's collar tag. Strips internal IDs, passwords, and private user data server-side. Refreshing does not 404.
* **Lost & Found Hub (`/lost-found.html`)**: Missing/found pet alert feeds with city filters, report submission with photos, and community sighting reports with geolocation.
* **Care Guides (`/care-guides.html`)**: Evidence-based preventative wellness information and emergency advice.

### 🛡️ Administrator Console (`/admin/*`)
* **Operations Dashboard (`/admin/dashboard.html`)**: Platform counts for users, pets, clinics, reports, and reminder engine telemetry.
* **User Governance (`/admin/users.html`)**: Inspect, suspend, or reactivate user accounts with mandatory documented reasons. Admins cannot suspend themselves.
* **Moderation & Reports (`/admin/lost-found.html`, `/admin/reports.html`)**: Moderate lost & found notices and triage community complaints with internal notes.
* **Clinic Directory (`/admin/clinics.html`)**: Manage vetted veterinary clinics and licensing badges.
* **Reminders & Audit Trail (`/admin/reminders.html`, `/admin/audit-logs.html`, `/admin/system-health.html`)**: Telemetry logs with manual retry, append-only admin audit logs, and live latency diagnostics.

---

## 🏗️ Architecture & Tech Stack

```text
Clients (Owner / Public / Admin) ──> Express 5 REST API (Node.js 18+) ──> MySQL 8.0 Database
  [Helmet, CORS, Rate-Limit, Sessions]     [AI / Resend Email Fallbacks]    [15 Relational Tables, Pools]
```

* **Frontend**: Semantic HTML5, Vanilla CSS3 (Golden Fur design tokens), Vanilla ES6+ JS, Chart.js, QRCode.js.
* **Backend**: Node.js, Express 5.3.0, `express-session`, `express-mysql-session`, `bcryptjs`, `helmet`, `express-rate-limit`, `multer`, `qrcode`.
* **Database**: MySQL 8.0+ via `mysql2/promise` connection pools with foreign keys and ACID transactions.

---

## 🚀 Local Setup & Getting Started

### Prerequisites
* Node.js v18.0.0+ and npm v9.0.0+
* MySQL Server v8.0+ running locally or remotely

### 1. Installation
```bash
git clone <YOUR_REPOSITORY_URL> pet-care-passport
cd pet-care-passport
npm install
```

### 2. Configure Environment (`.env`)
```bash
cp .env.example .env
```
Set your local credentials in `.env`:
```dotenv
PORT=3000
NODE_ENV=development
MYSQL_HOST=localhost
MYSQL_PORT=3306
MYSQL_USER=root
MYSQL_PASSWORD=<YOUR_LOCAL_MYSQL_PASSWORD>
MYSQL_DATABASE=petcare_passport
SESSION_SECRET=<YOUR_RANDOM_SESSION_SECRET>
PUBLIC_BASE_URL=http://localhost:3000
```
*(Generate secret: `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`)*

### 3. Initialize Database & Verified Clinics
```bash
npm run migrate
```
Applies schema DDL non-destructively (`CREATE TABLE IF NOT EXISTS`) and seeds verified clinics if empty. **Never inserts demo accounts.**

### 4. Bootstrap Initial Administrator
Public registration (`/register.html`) hardcodes `role: 'user'`, preventing privilege escalation. Create your admin account via CLI:
```bash
npm run bootstrap-admin -- --email "admin@yourdomain.com" --password "<STRONG_PASSWORD>" --name "Platform Administrator"
```
*Enforces 8+ chars, upper, lower, digit, and symbol. Idempotent: never overwrites existing passwords or duplicates accounts on re-run.*

### 5. Start Application
```bash
npm start
```
Accessible at `http://localhost:3000` (Login: `/login.html`, Health: `/api/health-check`).

---

## 🌐 Environment Variables

| Variable | Required | Default | Description | Example / Placeholder |
| :--- | :---: | :--- | :--- | :--- |
| `NODE_ENV` | **Yes** | `development` | Enforces secure cookies and HTTPS QR validation in `production`. | `production` |
| `PORT` | Optional | `3000` | Port for Express server. | `3000` |
| `PUBLIC_BASE_URL` | **Yes** | `http://localhost:3000` | Base URL for QR codes. **Must use HTTPS in production.** (Accepts `APP_URL`). | `https://passport.yourdomain.com` |
| `MYSQL_HOST` / `MYSQL_PORT` | **Yes** | `localhost:3306` | MySQL host and port. | `localhost` / `3306` |
| `MYSQL_USER` / `MYSQL_PASSWORD` | **Yes** | `root` / `""` | MySQL credentials. | `petcare_user` / `<STRONG_PASSWORD>` |
| `MYSQL_DATABASE` | **Yes** | `petcare_passport` | Database name. | `petcare_passport` |
| `SESSION_SECRET` | **Yes** | Default key | Secret for signing session cookies. | `<STRONG_SESSION_SECRET>` |
| `AI_PROVIDER` | Optional | `gemini` | `gemini` or `openrouter` (uses clinical fallback engine if unset). | `gemini` |
| `GEMINI_API_KEY` / `OPENROUTER_API_KEY` | Optional | `""` | API keys for third-party AI assistants. | `<YOUR_AI_API_KEY>` |
| `EMAIL_PROVIDER` / `RESEND_API_KEY` | Optional | `resend` / `""` | Transactional email provider (simulated in console if unset). | `<YOUR_RESEND_KEY>` |
| `ADMIN_BOOTSTRAP_EMAIL` / `_PASSWORD` | Optional | `""` | Default credentials for `npm run bootstrap-admin`. | `admin@domain.com` / `<PWD>` |

---

## 🔗 Digital Passports & QR Code Resolution

QR codes containing `localhost` URLs will fail when scanned by mobile phones in the real world because `localhost` resolves to the phone itself.

* **Code Implementation (`src/utils/urlHelper.js`)**:
  * **In Production (`NODE_ENV=production`)**: `PUBLIC_BASE_URL` is mandatory, must be a valid URL, must use `https:`, and cannot be `localhost`. If missing or invalid, QR generation throws an explicit error rather than silently embedding localhost.
  * **In Development**: Falls back to `http://localhost:${PORT || 3000}` if unset.
  * **QR Encoding**: Generates high-resolution PNG data URLs with error correction level `H` (~30% error recovery for worn collar tags).
  * **Direct Routes**: Both `/passport-view.html?id=[public_id]` and `/passport-view?id=[public_id]` serve directly without 404 on refresh. Accepts both `?id=` and `?code=`.
* **Privacy Guarantee**: `GET /api/passports/public/:publicId` returns only owner-authorized fields. Internal database IDs, user IDs, passwords, emails, and medical documents are stripped server-side. Uses non-guessable IDs (`${name}-${randomBytes(8)}`).
* **Updating Existing QR Codes**:
  * *Option A (Owner UI)*: In `/owner/passports.html`, click **🔄 Revoke & Regenerate QR** to invalidate the old ID and encode `PUBLIC_BASE_URL`.
  * *Option B (Bulk CLI Tool)*: Update all existing stored QR codes without altering pet data:
    ```bash
    npm run refresh-qr -- --dry-run   # Preview
    npm run refresh-qr               # Execute safe update
    ```

---

## 🛡️ Production Deployment & Demo Cleanup

### 1. Safe Demo Data Cleanup
If deploying or migrating from staging, remove legacy demo accounts (`admin@petcarepassport.com`, `sarah@example.com`, `mark@example.com`):
```bash
mysqldump -h <HOST> -P <PORT> -u <USER> -p <DB> > backup_before_cleanup.sql # Step 1: Backup
npm run cleanup-demo -- --dry-run                                           # Step 2: Preview
npm run cleanup-demo                                                        # Step 3: Transactional cleanup
```
* **Safety Guarantees**: Never runs blind deletes. Preserves all legitimate user accounts and real pets. Demo accounts receive `401 Unauthorized` post-cleanup. For managed remote databases (AWS RDS, Cloud SQL), run `database/cleanup_demo_data.sql`.
* **Zero Startup Seeding**: `server.js` and `npm run migrate` never re-seed demo data on startup. Development seeds (`npm run seed:dev`) halt if `NODE_ENV === 'production'`.

### 2. Deployment Steps
1. Provision MySQL 8.0+ instance and configure hosting environment variables (`NODE_ENV=production`, `PUBLIC_BASE_URL=https://...`).
2. Run migrations: `npm run migrate`. Clean legacy demos if needed: `npm run cleanup-demo`.
3. Provision administrator: `npm run bootstrap-admin -- --email <email> --password <pwd> --name <name>`.
4. Run app via PM2 (`pm2 start server.js --name petcare --env production`) or Docker.
5. Terminate HTTPS via Nginx/Caddy. **HTTPS is required because `server.js` sets `cookie.secure = true` in production.**

```nginx
server {
    listen 80; server_name passport.yourdomain.com;
    return 301 https://$host$request_uri;
}
server {
    listen 443 ssl http2; server_name passport.yourdomain.com;
    ssl_certificate /etc/letsencrypt/live/passport.yourdomain.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/passport.yourdomain.com/privkey.pem;
    client_max_body_size 15M;
    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

---

## 🧪 Automated Testing

Automated integration test suite using the Node.js native test runner (`node --test`), `supertest`, and `node:assert`:

```bash
npm test
```

### Verified Test Scope (24 Scenarios, All Passing)
1. **Health & DB**: System health check returns 200 and active database pool.
2. **Privacy**: Public passport strips passwords, user IDs, and private medical documents.
3. **Public Hub**: Lost & found reports browseable without login; direct passport route loads without 404.
4. **RBAC**: Unauthenticated `/api/owner/overview` and `/api/admin/overview` return 401.
5. **Auth**: Invalid password rejected; owner and administrator dashboards authenticate and load data.
6. **Safety & Triage**: AI assistant enforces clinical veterinary disclaimers; unread notifications return integer counts.
7. **Reporting**: Pet owner missing pet report automatically publishes community alert.
8. **Data Integrity**: Vaccination dates match without timezone drift.
9. **Password Rules**: Complexity enforced; confirmation match required; forgot password token and reset verified.
10. **Role Escalation Guard**: Public registration ignores `role` parameter and hardcodes `'user'`.
11. **Production Hardening**: Demo accounts cannot authenticate (401); admin bootstrap rerun preserves existing password.
12. **QR & Base URL**: Local/production URL resolution verified; production mode rejects missing/insecure/localhost URLs; QR encodes level H data URL; non-existent passport returns 404 (`PASSPORT_NOT_FOUND`); QR regeneration invalidates old ID.

```text
▶ PetCare Passport Integration Test Suite (24 passed, 0 failed, 6468ms)
```

---

## 🔒 Security, Limitations & License

* **Security Controls**: Server-side RBAC session authorization, parameterized queries, `bcryptjs` hashing, `express-rate-limit`, append-only `audit_logs` table, and `cookie.secure = true` in production.
* **Limitations**: AI assistant responses and vaccine calculators are informational and do not replace professional veterinary advice. Collar QR tags require mobile internet connectivity to load public passports.
* **License**: ISC License (see `package.json`).
