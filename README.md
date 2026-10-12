# 🐾 PetCare Passport

> A comprehensive, full-stack digital pet healthcare management and adoption platform featuring **three strictly separated user experiences**: **Pet Owner Dashboard**, **Adopter / Visitor Experience**, and **Administrator Dashboard**. Built with a real MySQL relational database, Node.js Express 5 backend, Vanilla ES6+ frontend, and zero frontend framework dependencies.

---

## 🌟 Architecture Overview: Three Distinct Experiences

PetCare Passport is architected to address three distinct user workflows, each with dedicated interfaces, custom navigation, role-based access control (RBAC), and database-driven data isolation:

```
                                  ┌───────────────────────────────┐
                                  │      PetCare Passport App     │
                                  └───────────────┬───────────────┘
                                                  │
                 ┌────────────────────────────────┼────────────────────────────────┐
                 │                                │                                │
                 ▼                                ▼                                ▼
  ┌─────────────────────────────┐  ┌─────────────────────────────┐  ┌─────────────────────────────┐
  │ 1. ADOPTER / VISITOR UI     │  │ 2. PET OWNER DASHBOARD      │  │ 3. ADMINISTRATOR CONSOLE    │
  │ Public & Adopter Experience │  │ Authenticated Pet Owners    │  │ Privileged Platform Admins  │
  ├─────────────────────────────┤  ├─────────────────────────────┤  ├─────────────────────────────┤
  │ • Public Home & Featured    │  │ • Personalized Overview     │  │ • Real-time DB Analytics    │
  │ • Adoption Filter & Search  │  │ • "My Pets" Profile CRUD    │  │ • User Account Governance   │
  │ • Sanitized Pet Details     │  │ • Digital Passports & QR    │  │ • Adoption Moderation Queue │
  │ • Adoption Enquiries        │  │ • Chronological Health Recs │  │ • Lost & Found Moderation   │
  │ • Formal Applications       │  │ • Vaccine Due Calculator    │  │ • Reports & Complaints Desk │
  │ • Favourite Pets Stash      │  │ • Daily Recurring Care      │  │ • Appointment Oversight     │
  │ • Lost & Found Sightings    │  │ • Owner Appointment Records │  │ • Clinic Directory CRUD     │
  │ • Care Guides Library       │  │ • Rehoming Submissions      │  │ • Reminder & Email Telemetry│
  │                             │  │ • AI Pet-Care Assistant     │  │ • Immutable Audit Logs      │
  │                             │  │ • In-App Notifications      │  │ • Live System Health Check  │
  └─────────────────────────────┘  └─────────────────────────────┘  └─────────────────────────────┘
                 │                                │                                │
                 └────────────────────────────────┼────────────────────────────────┘
                                                  │
                                                  ▼
                                 ┌─────────────────────────────────┐
                                 │ Express 5 REST API & Middleware │
                                 │  • RBAC & HttpOnly Sessions     │
                                 │  • Helmet & CSRF Headers        │
                                 │  • Rate Limiting & Multer       │
                                 │  • AI & Resend Email Services   │
                                 └────────────────┬────────────────┘
                                                  │
                                                  ▼
                                 ┌─────────────────────────────────┐
                                 │      MySQL 8.0 Relational DB    │
                                 │   18 Tables, Foreign Keys,      │
                                 │   Transactions, Indices         │
                                 └─────────────────────────────────┘
```

---

## 🚀 Key Modules & Capabilities

### 1. 🐕 Pet Owner Dashboard (`/owner/*`)
Designed exclusively for registered pet owners to manage their pets' complete health and care lifecycle:
* **Personalized Dashboard Overview (`/owner/dashboard.html`)**: Real-time calculated counts for registered pets, upcoming appointments, vaccinations due soon, overdue vaccinations, active daily care tasks, recent health records, and pending adoption listings.
* **Pet Profile Management (`/owner/pets.html`)**: Add, view, edit, and archive pets. Store name, species, breed, estimated age or DOB, sex, markings, microchip number, weight, blood type, sterilization status, allergies, known conditions, medication notes, and dietary schedules.
* **Digital Pet Passports & QR Codes (`/owner/passports.html`)**: Unique, non-guessable public passport IDs with auto-generated high-resolution QR codes linking to `/passport-view.html?id=[public_id]`. Granular owner visibility controls (toggle photo, emergency contact, allergies, medical alerts, and vaccines publicly or make passport completely private).
* **Health Records (`/owner/health.html`)**: Chronological veterinary visits, surgeries, lab tests, and procedures. Supports document uploads and explicitly differentiates owner-entered information from verified records.
* **Vaccination Management (`/owner/vaccinations.html`)**: Record vaccine name, clinic, administration date, and next due date. Real-time dynamic calculation of status badges: `Up to Date`, `Due Soon` (within 30 days), `Overdue`, and `Unknown`. Clear disclaimer that calculated statuses do not replace veterinary consultations.
* **Medications & Daily Care (`/owner/daily-care.html`)**: Recurring medication routines, feeding regimens, grooming sessions, and walking schedules with daily completion checkboxes and progress tracking.
* **Appointment Management (`/owner/appointments.html`)**: Owner-managed clinic visit planner with pet selector, clinic name, appointment date/time, purpose, and reminders. Explicitly communicates that records are owner-managed unless an official veterinary API integration confirms them.
* **Rehoming & Adoption Submissions (`/owner/rehoming.html`)**: Submit a pet for adoption. Listings remain unpublished under `pending_approval` status until approved by an administrator. Owners can respond to administrator requests for changes and manage adopter enquiries.
* **AI Pet-Care Assistant (`/owner/ai-assistant.html`)**: Evidence-based routine care guidance, visit preparation checklists, and nutrition advice powered by Google Gemini or OpenRouter with fallback clinical knowledge engine and strict non-veterinary disclaimer.
* **Notifications & Profile Settings (`/owner/notifications.html`, `/owner/profile.html`)**: Real-time alerts for vaccines, appointments, and enquiries; password update and profile management.

---

### 2. 🐱 Adopter / Visitor Experience (`/index.html`, `/adopt.html`, `/lost-found.html`, `/adopter/*`)
A dedicated discovery experience allowing visitors to browse and interact without being forced to register:
* **Public Home Page (`/index.html`)**: Welcoming introduction, search shortcuts, responsible pet ownership guides, and live database highlights of approved adoption listings.
* **"Adopt a Pet" Directory (`/adopt.html`)**: Comprehensive search and multi-parameter filtering by species, breed, age group, sex, and location. Displays real approved database listings only.
* **Sanitized Pet Adoption Profile (`/pet-details.html`)**: Rich photo display, temperament details, and adoption requirements. **Privacy Guarantee:** Automatically redacts owner passwords, private veterinary records, and home addresses server-side.
* **Adoption Enquiries & Direct Applications**: Safe enquiry submission form with validation and rate limiting. Registered adopters can submit formal multi-question adoption applications and track approval statuses (`Submitted`, `Under Review`, `Changes Requested`, `Accepted`, `Declined`, `Withdrawn`) at `/adopter/applications.html`.
* **Saved Favourites (`/adopter/favourites.html`)**: Registered users can bookmark pets to revisit their profiles anytime.
* **Lost & Found Community Hub (`/lost-found.html`)**: Browse published lost and found pets, submit lost/found reports with photos, submit sighting reports with geolocation, and celebrate reunited pets.
* **Universal Account Model**: An adopter account can easily add a pet to immediately access Pet Owner features without creating a duplicate account.

---

### 3. 🛡️ Administrator Dashboard (`/admin/*`)
A protected, dedicated administrative operations console with standalone navigation, server-side RBAC, and zero trust of client-supplied roles:
* **Platform Management Overview (`/admin/dashboard.html`)**: Real database counts for total users, registered pets, active listings, pending approvals, rejected/suspended listings, open reports, pending lost-and-found items, appointment volume, and failed reminder attempts.
* **User Governance (`/admin/users.html`)**: Search and inspect accounts. Suspend or reactivate accounts with a mandatory documented administrative reason. Prevents administrators from suspending their own accounts.
* **Adoption Listing Moderation (`/admin/moderation.html`)**: Review pending listings. Approve, reject with reason, request changes, or suspend. **Platform Integrity Rule:** Administrators are strictly prohibited from approving their own listings.
* **Lost & Found Moderation (`/admin/lost-found.html`)**: Review, publish, suspend, or close lost-and-found reports and community sightings.
* **Reports & Complaints Desk (`/admin/reports.html`)**: Triage platform complaints regarding suspected scams, inappropriate listings, or appointment disputes. Record private administrative notes and resolve complaints.
* **Appointment Oversight (`/admin/appointments.html`)**: Platform-wide visibility of all appointment records. Audited administrative updates with mandatory documented justification and pet owner notifications.
* **Veterinary Clinic Directory (`/admin/clinics.html`)**: Manage vetted veterinary clinics, verify licensing badges, and maintain service directories.
* **Reminder & Notification Telemetry (`/admin/reminders.html`)**: Inspect queued, accepted, and failed reminder dispatches. View safe error messages and click `🔁 Retry` to re-dispatch failed notifications.
* **System Audit Logs (`/admin/audit-logs.html`)**: Immutable audit trail recording administrator name, action type, target entity, target ID, documented reason, and metadata delta.
* **Platform Health Diagnostics (`/admin/system-health.html`)**: Real-time database round-trip latency, Node.js memory footprint, server uptime, and provider readiness flags with zero secret leakage.

---

## 🛠️ Technology Stack

| Layer | Technologies Used |
| :--- | :--- |
| **Frontend** | HTML5, Vanilla CSS3 (Custom Design System, Glassmorphic Cards, Responsive Layouts), Vanilla JavaScript (ES6+), Fetch API, Chart.js, QRCode.js |
| **Backend** | Node.js, Express.js 5.x, express-session, express-mysql-session, bcryptjs, Helmet, express-rate-limit, Multer |
| **Database** | MySQL 8.0+ relational database via `mysql2` connection pooling with 18 relational tables, foreign key constraints, and parameterized queries |
| **AI Integration** | Backend service supporting Google Gemini API (`gemini-1.5-flash`), OpenRouter API (`meta-llama/llama-3-8b-instruct`), and domain-specific evidence-based clinical fallback engine |
| **Email Service** | Transactional email processing using Resend HTTP API with developer simulation logging fallback |
| **Testing** | Node.js native test runner (`node --test`), `supertest`, and `node:assert` |

---

## 📋 Database Schema

The system uses 18 normalized relational tables:
1. `users` — Authentication, roles (`user`, `admin`), profile, status (`active`, `suspended`).
2. `pets` — Pet profiles, microchips, markings, allergies, medical notes, unique public identifiers.
3. `passports` — Digital passport visibility toggles, emergency contacts, high-res QR data URLs.
4. `health_records` — Chronological veterinary visits, surgeries, lab results, file uploads, entry sources.
5. `vaccinations` — Administered vaccines, due dates, clinics, proof documents.
6. `daily_care_tasks` — Medication, feeding, grooming, walking recurring schedules.
7. `appointments` — Clinic visit records, dates, times, notes, administrative audit markers.
8. `adoption_listings` — Rehoming listings, requirements, moderation states (`pending_approval`, `approved`, `rejected`, `changes_requested`, `suspended`).
9. `adoption_enquiries` — Public and guest inquiries sent to pet owners.
10. `adoption_applications` — Formal adopter applications with multi-step review workflows.
11. `favourites` — Bookmarked adoption listings for registered adopters.
12. `lost_found_reports` — Lost and found pet notices, locations, and contact info.
13. `lost_found_sightings` — Community sightings with date, location, and photos.
14. `reports_and_complaints` — User reports on suspicious listings, scams, or abuse.
15. `clinics` — Directory of veterinary clinics with licensing verification status.
16. `notifications` — Persistent in-app user notifications.
17. `reminders_log` — Telemetry queue for reminders and emails (`queued`, `processing`, `accepted_by_provider`, `delivered`, `failed`).
18. `audit_logs` — Immutable administrative operations log.

---

## ⚙️ Installation & Local Setup

### Prerequisites
* **Node.js** (v18.0.0 or higher)
* **MySQL Server** (v8.0 or higher) running locally or remotely

### 1. Clone & Install Dependencies
```bash
cd d:/Pet-Care-Passport
npm install
```

### 2. Configure Environment Variables
Copy `.env.example` to `.env` and fill in your database credentials:
```bash
cp .env.example .env
```

Key variables in `.env`:
```env
PORT=3000
NODE_ENV=development

# MySQL Database Configuration
MYSQL_HOST=localhost
MYSQL_PORT=3306         # Adjust to your MySQL port (e.g., 3366)
MYSQL_USER=root
MYSQL_PASSWORD=your_password
MYSQL_DATABASE=petcare_passport

# Session Secret (cryptographic key)
SESSION_SECRET=petcare_super_secure_secret_key_2026_xyz

# AI Integration (Optional: works with fallback if not provided)
AI_PROVIDER=gemini
GEMINI_API_KEY=
GEMINI_MODEL=gemini-1.5-flash

# Transactional Email (Optional: simulated in console if not provided)
EMAIL_PROVIDER=resend
RESEND_API_KEY=
EMAIL_FROM=PetCare Passport <notifications@petcarepassport.com>

# Initial Administrator Bootstrap
ADMIN_BOOTSTRAP_EMAIL=admin@petcarepassport.com
ADMIN_BOOTSTRAP_PASSWORD=AdminPass123!
ADMIN_BOOTSTRAP_NAME=System Administrator
```

### 3. Run Database Migrations & Rich Seed Data
Run the migration script to create all 18 tables and populate them with realistic demo data:
```bash
node database/migrate.js
```

### 4. Start the Application
```bash
node server.js
```
The server will start on `http://localhost:3000`.

---

## 🔑 Pre-Seeded Demo Accounts

The login page (`/login.html`) includes **1-Click Demo Login** buttons for instant role testing:

| Experience / Role | Email Address | Password | Seeded Data & Scope |
| :--- | :--- | :--- | :--- |
| **🛡️ Administrator** | `admin@petcarepassport.com` | `AdminPass123!` | Full access to `/admin/*`, moderation queues, appointment oversight, user suspensions, audit logs, and diagnostics. |
| **🐾 Pet Owner** | `sarah@example.com` | `Owner123!` | Owner of **Luna** (Golden Retriever) and **Milo** (British Shorthair Cat). Has active QR passports, overdue vaccines, upcoming clinic appointments, and daily care tasks. |
| **🏡 Registered Adopter** | `mark@example.com` | `Adopter123!` | Has saved favourites (Barnaby & Cleo), submitted adoption applications, and sent enquiries. |
| **🌐 Public Visitor** | *No login required* | *N/A* | Browse `/index.html`, `/adopt.html`, `/lost-found.html`, `/passport-view.html`, and submit enquiries. |

---

## 🧪 Automated Testing

PetCare Passport includes a comprehensive automated integration test suite covering:
1. Database connection pool health check (`/api/health-check`).
2. Public adoption search filtering for approved listings only.
3. Public passport endpoint privacy sanitization (zero password/address leakage).
4. Public Lost & Found accessibility without authentication.
5. Server-side RBAC: 401 Unauthorized on protected routes.
6. Server-side RBAC: 403 Forbidden when a regular user attempts admin actions.
7. Authentication failure handling on invalid passwords.
8. Pet Owner session operations and pet data isolation.
9. Administrator session operations and privileged audit logging.
10. AI Assistant response validation with mandatory veterinary clinical disclaimers.

Run the test suite anytime:
```bash
npm test
```

Expected result:
```
✔ 1. System Health Check returns 200 and active database pool
✔ 2. Public Adoption Search returns only approved listings
✔ 3. Public Passport endpoint protects private information and strips passwords/private data
✔ 4. Public Lost & Found endpoint returns published reports without requiring login
✔ 5. Unauthenticated request to /api/owner/overview returns 401
✔ 6. Unauthenticated request to /api/admin/overview returns 401
✔ 7. Login fails with invalid password
✔ 8. Pet Owner login and dashboard access
✔ 9. Administrator login and management operations
✔ 10. AI Assistant returns response with mandatory clinical disclaimer
✔ PetCare Passport Test Suite (10 passed, 0 failed)
```

---

## 🔒 Security & Privacy Architecture

* **Zero Trust Client Roles**: Role authorization is validated on the backend via session middleware (`requireAuth`, `requireAdmin`). Frontend form fields or requests specifying roles are rejected.
* **Anti-Self-Approval Enforcement**: In `src/routes/adminRoutes.js`, administrators are strictly prohibited from approving their own adoption listings to preserve platform moderation integrity.
* **Public Passport Redaction**: The public passport API (`/api/passports/public/:publicId`) only returns fields explicitly toggled on by the owner. Passwords, user IDs, private medical records, and residential addresses are omitted.
* **Session Protection**: Managed via `express-session` with `express-mysql-session` persistent storage, `httpOnly: true`, `sameSite: 'lax'`, and configurable HTTPS in production.
* **Rate Limiting**: `express-rate-limit` protects authentication endpoints against brute-force attacks.
* **Audit Trail**: Every significant administrative action (user suspension, listing approval/rejection, appointment correction, clinic deletion) is logged in the `audit_logs` table with timestamp, IP address, and documented rationale.

---

## 🚀 Production Deployment Guide (Render / Railway / AWS)

### 1. Deploying to Render
1. Push the repository to GitHub.
2. In Render, create a **Managed MySQL** service. Note the connection URL and port.
3. Create a **Web Service** pointing to your repository with:
   * **Environment**: `Node`
   * **Build Command**: `npm install`
   * **Start Command**: `node server.js`
4. Add the environment variables from `.env.example` in the Render Dashboard (`NODE_ENV=production`, `MYSQL_HOST`, `MYSQL_USER`, `MYSQL_PASSWORD`, `MYSQL_DATABASE`, `SESSION_SECRET`, etc.).
5. Ensure `NODE_ENV=production` is set so secure cookie flags and Helmet security policies are enforced.
6. Connect a persistent disk to the `/uploads` directory to preserve user-uploaded pet photographs and documents across container redeployments.
7. Run `node database/migrate.js` in the Render shell or as a pre-deploy command to initialize the production schema.

---

## 📄 License & Attribution

Developed for **PetCare Passport**. Built with clean, accessible semantic HTML5, Vanilla CSS3, Vanilla ES6+ JavaScript, Node.js Express 5, and MySQL 8.
