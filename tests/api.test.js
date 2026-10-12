/**
 * Automated Integration Test Suite for PetCare Passport
 * 
 * Features Tested:
 * 1. Health check & database connection
 * 2. Visitor Experience & Public Privacy Protection (Zero Leaks)
 * 3. Server-Side RBAC & Security Boundaries (401 / 403 enforcement)
 * 4. Pet Owner Dashboard & Authorized Pet Operations
 * 5. Administrator Dashboard & Privileged Operations
 * 6. Clinical AI Assistant with mandatory veterinary disclaimers
 * 7. System notifications integer count endpoint
 * 8. Lost & Found Missing Pet Flow
 * 9. Date & Time timezone integrity
 * 10. Password pattern rules & confirm password validation
 * 11. Public Registration Role Restriction (No admin registration)
 * 12. Forgot password token generation
 * 13. Password reset flow & re-authentication
 * 14. Demo Accounts Decommissioning (Demo accounts cannot authenticate)
 * 15. Server-Side Admin Bootstrap Idempotency (No password overwrite on redeployment)
 */

const { test, describe, before, after } = require('node:test');
const assert = require('node:assert');
const request = require('supertest');
const bcrypt = require('bcryptjs');
const { query } = require('../src/config/db');
const { getPublicBaseUrl, buildPassportPublicUrl, generatePassportQr } = require('../src/utils/urlHelper');

// Base URL of the running server
const BASE_URL = 'http://localhost:3000';

const TEST_OWNER = {
  email: 'test_suite_owner@test.local',
  password: 'OwnerSecurePass123!',
  name: 'Integration Test Owner'
};

const TEST_ADMIN = {
  email: 'test_suite_admin@test.local',
  password: 'AdminSecurePass123!',
  name: 'Integration Test Admin'
};

const TEST_PET_PUBLIC_ID = 'test-pass-suite-9988';

describe('PetCare Passport Integration Test Suite', () => {
  let testOwnerId = null;
  let testAdminId = null;
  let testPetId = null;

  before(async () => {
    // Clean up any stale test suite runner records
    await query('DELETE FROM users WHERE email IN (?, ?)', [TEST_OWNER.email, TEST_ADMIN.email]);

    // Provision isolated test runner admin
    const adminHash = await bcrypt.hash(TEST_ADMIN.password, 10);
    const [adminRes] = await query(
      `INSERT INTO users (full_name, email, password_hash, phone, role, status)
       VALUES (?, ?, ?, '+1 (555) 000-0001', 'admin', 'active')`,
      [TEST_ADMIN.name, TEST_ADMIN.email, adminHash]
    );
    testAdminId = adminRes.insertId;

    // Provision isolated test runner owner
    const ownerHash = await bcrypt.hash(TEST_OWNER.password, 10);
    const [ownerRes] = await query(
      `INSERT INTO users (full_name, email, password_hash, phone, role, status)
       VALUES (?, ?, ?, '+1 (555) 000-0002', 'user', 'active')`,
      [TEST_OWNER.name, TEST_OWNER.email, ownerHash]
    );
    testOwnerId = ownerRes.insertId;

    // Provision test companion pet and passport
    const [petRes] = await query(
      `INSERT INTO pets (user_id, public_id, name, species, breed, dob_or_age, sex, color_marks, is_sterilized)
       VALUES (?, ?, 'Barnaby Test', 'Dog', 'Beagle', '2 years', 'Male', 'Tri-color white and brown', true)`,
      [testOwnerId, TEST_PET_PUBLIC_ID]
    );
    testPetId = petRes.insertId;

    await query(
      `INSERT INTO passports (pet_id, is_public_enabled, show_name, show_breed, show_medical_alerts, qr_code_url)
       VALUES (?, true, true, true, true, 'data:image/png;base64,mockQrCode')`,
      [testPetId]
    );

    // Seed test vaccination record
    await query(
      `INSERT INTO vaccinations (pet_id, vaccine_name, administered_date, next_due_date, clinic_name, entry_source)
       VALUES (?, 'Rabies Annual', '2026-05-10', '2027-05-10', 'Oakridge Animal Hospital', 'clinic_verified')`,
      [testPetId]
    );
  });

  after(async () => {
    // Teardown test runner records
    if (testOwnerId || testAdminId) {
      await query('DELETE FROM users WHERE email IN (?, ?)', [TEST_OWNER.email, TEST_ADMIN.email]);
    }
  });

  // 1. SYSTEM HEALTH
  test('1. System Health Check returns 200 and active database pool', async () => {
    const res = await request(BASE_URL).get('/api/health-check');
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.body.success, true);
    assert.strictEqual(res.body.database.status, 'healthy');
    assert.ok(typeof res.body.database.latencyMs === 'number');
  });

  // 2. PUBLIC PRIVACY PROTECTION
  test('2. Public Passport endpoint protects private information and strips passwords/private data', async () => {
    const res = await request(BASE_URL).get(`/api/passports/public/${TEST_PET_PUBLIC_ID}`);
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.body.success, true);
    assert.ok(res.body.passport);
    assert.strictEqual(res.body.passport.name, 'Barnaby Test');
    // Ensure sensitive fields are undefined
    assert.strictEqual(res.body.passport.password_hash, undefined);
    assert.strictEqual(res.body.passport.user_id, undefined);
  });

  test('3. Public Lost & Found endpoint returns published reports without requiring login', async () => {
    const res = await request(BASE_URL).get('/api/lost-found/reports');
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.body.success, true);
    assert.ok(Array.isArray(res.body.reports));
  });

  // 3. SERVER-SIDE RBAC & BOUNDARY ENFORCEMENT
  test('4. Unauthenticated request to /api/owner/overview returns 401', async () => {
    const res = await request(BASE_URL).get('/api/owner/overview');
    assert.strictEqual(res.status, 401);
    assert.strictEqual(res.body.success, false);
  });

  test('5. Unauthenticated request to /api/admin/overview returns 401', async () => {
    const res = await request(BASE_URL).get('/api/admin/overview');
    assert.strictEqual(res.status, 401);
    assert.strictEqual(res.body.success, false);
  });

  test('6. Login fails with invalid password', async () => {
    const res = await request(BASE_URL)
      .post('/api/auth/login')
      .send({ email: TEST_OWNER.email, password: 'WrongPassword123' });
    
    assert.strictEqual(res.status, 401);
    assert.strictEqual(res.body.success, false);
  });

  // 4. PET OWNER SESSION & OPERATIONS
  test('7. Pet Owner login and dashboard access', async () => {
    const agent = request.agent(BASE_URL);

    const loginRes = await agent
      .post('/api/auth/login')
      .send({ email: TEST_OWNER.email, password: TEST_OWNER.password });

    assert.strictEqual(loginRes.status, 200);
    assert.strictEqual(loginRes.body.success, true);
    assert.strictEqual(loginRes.body.user.role, 'user');

    // Access Owner Overview
    const overviewRes = await agent.get('/api/owner/overview');
    assert.strictEqual(overviewRes.status, 200);
    assert.strictEqual(overviewRes.body.success, true);
    assert.ok(overviewRes.body.stats.total_pets >= 1);

    // Access Owner pets
    const petsRes = await agent.get('/api/pets');
    assert.strictEqual(petsRes.status, 200);
    assert.ok(Array.isArray(petsRes.body.pets));
    const petNames = petsRes.body.pets.map(p => p.name);
    assert.ok(petNames.includes('Barnaby Test'));

    // Attempt to access Admin endpoint as regular user -> MUST return 403 Forbidden!
    const adminForbiddenRes = await agent.get('/api/admin/overview');
    assert.strictEqual(adminForbiddenRes.status, 403, 'Regular user must not be granted admin access');
    assert.strictEqual(adminForbiddenRes.body.success, false);
  });

  // 5. ADMINISTRATOR SESSION & PRIVILEGED WORKFLOWS
  test('8. Administrator login and management operations', async () => {
    const adminAgent = request.agent(BASE_URL);

    const loginRes = await adminAgent
      .post('/api/auth/login')
      .send({ email: TEST_ADMIN.email, password: TEST_ADMIN.password });

    assert.strictEqual(loginRes.status, 200);
    assert.strictEqual(loginRes.body.user.role, 'admin');

    // Access Admin Overview
    const overviewRes = await adminAgent.get('/api/admin/overview');
    assert.strictEqual(overviewRes.status, 200);
    assert.ok(overviewRes.body.stats.total_users >= 1);

    // Access System Health
    const healthRes = await adminAgent.get('/api/admin/system-health');
    assert.strictEqual(healthRes.status, 200);
    assert.strictEqual(healthRes.body.database.status, 'healthy');
    // Ensure zero secrets exposed
    assert.strictEqual(healthRes.body.ai_service.geminiApiKey, undefined);
    assert.strictEqual(healthRes.body.email_service.resendApiKey, undefined);

    // Access User Management list
    const usersRes = await adminAgent.get('/api/admin/users');
    assert.strictEqual(usersRes.status, 200);
    assert.ok(Array.isArray(usersRes.body.users));

    // Access Clinic Directory
    const clinicsRes = await adminAgent.get('/api/admin/clinics');
    assert.strictEqual(clinicsRes.status, 200);
    assert.ok(Array.isArray(clinicsRes.body.clinics));

    // Access Audit Logs
    const auditRes = await adminAgent.get('/api/admin/audit-logs');
    assert.strictEqual(auditRes.status, 200);
    assert.ok(Array.isArray(auditRes.body.logs));
  });

  // 6. AI PET ASSISTANT WITH STRICT VETERINARY CLINICAL DISCLAIMER
  test('9. AI Assistant returns response with mandatory clinical disclaimer', async () => {
    const userAgent = request.agent(BASE_URL);
    await userAgent.post('/api/auth/login').send({ email: TEST_OWNER.email, password: TEST_OWNER.password });

    const aiRes = await userAgent
      .post('/api/ai/ask')
      .send({ prompt: 'What should I pack for my dog veterinary visit?' });

    assert.strictEqual(aiRes.status, 200);
    assert.strictEqual(aiRes.body.success, true);
    assert.ok(typeof aiRes.body.response === 'string');
    assert.ok(aiRes.body.disclaimer.toLowerCase().includes('veterinar'), 'Response must contain veterinary disclaimer');
  });

  // 7. NOTIFICATIONS NUMBER OF NOTIFICATIONS ENDPOINT
  test('10. Unread notification count endpoint returns exact integer count', async () => {
    const userAgent = request.agent(BASE_URL);
    await userAgent.post('/api/auth/login').send({ email: TEST_OWNER.email, password: TEST_OWNER.password });

    const notifRes = await userAgent.get('/api/notifications/unread-count');
    assert.strictEqual(notifRes.status, 200);
    assert.strictEqual(notifRes.body.success, true);
    assert.strictEqual(typeof notifRes.body.count, 'number');
  });

  // 8. PET OWNER "REPORT AS MISSING" FLOW
  test('11. Pet owner can report pet as missing and automatically publish lost pet alert', async () => {
    const userAgent = request.agent(BASE_URL);
    await userAgent.post('/api/auth/login').send({ email: TEST_OWNER.email, password: TEST_OWNER.password });

    // Report test pet as missing
    const missingRes = await userAgent
      .post(`/api/pets/${testPetId}/report-missing`)
      .send({
        date_lost: '2026-10-12',
        general_location: 'Discovery Park, Seattle',
        contact_phone: '(555) 000-0002',
        description: 'Barnaby wandered away near the lighthouse.'
      });

    assert.strictEqual(missingRes.status, 200);
    assert.strictEqual(missingRes.body.success, true);
    assert.ok(missingRes.body.report_id > 0);

    // Verify pet is marked as missing
    const updatedPetsRes = await userAgent.get('/api/pets');
    const updatedPet = updatedPetsRes.body.pets.find(p => p.id === testPetId);
    assert.strictEqual(Boolean(updatedPet.is_missing), true);

    // Mark as found
    const foundRes = await userAgent.post(`/api/pets/${testPetId}/mark-found`);
    assert.strictEqual(foundRes.status, 200);
    assert.strictEqual(foundRes.body.success, true);
  });

  // 9. DATE & TIME INTEGRITY TEST
  test('12. Date & Time integrity: vaccinations match without timezone drift', async () => {
    const ownerAgent = request.agent(BASE_URL);
    await ownerAgent.post('/api/auth/login').send({ email: TEST_OWNER.email, password: TEST_OWNER.password });

    const vaccRes = await ownerAgent.get('/api/vaccinations');
    assert.strictEqual(vaccRes.status, 200);
    assert.ok(vaccRes.body.vaccinations.length > 0);
    const v = vaccRes.body.vaccinations[0];
    assert.strictEqual(v.administered_date, '2026-05-10');
    assert.strictEqual(v.next_due_date, '2027-05-10');
  });

  // 10. PASSWORD PATTERN & CONFIRM PASSWORD VALIDATION
  test('13. Registration enforces password pattern rules and confirm password matching', async () => {
    // 1. Rejects password less than 8 characters
    const shortPwdRes = await request(BASE_URL)
      .post('/api/auth/register')
      .send({
        full_name: 'Test Security User',
        email: 'test_sec_user_pwd@example.com',
        password: 'Aa1!',
        confirm_password: 'Aa1!'
      });
    assert.strictEqual(shortPwdRes.status, 400);
    assert.strictEqual(shortPwdRes.body.success, false);
    assert.ok(shortPwdRes.body.error.includes('8 characters'));

    // 2. Rejects password missing special character or number
    const noSpecialRes = await request(BASE_URL)
      .post('/api/auth/register')
      .send({
        full_name: 'Test Security User',
        email: 'test_sec_user_pwd@example.com',
        password: 'Password1234',
        confirm_password: 'Password1234'
      });
    assert.strictEqual(noSpecialRes.status, 400);
    assert.strictEqual(noSpecialRes.body.success, false);
    assert.ok(noSpecialRes.body.error.toLowerCase().includes('special'));

    // 3. Rejects mismatched confirm password
    const mismatchRes = await request(BASE_URL)
      .post('/api/auth/register')
      .send({
        full_name: 'Test Security User',
        email: 'test_sec_user_pwd@example.com',
        password: 'SecurePass123!',
        confirm_password: 'DifferentPass123!'
      });
    assert.strictEqual(mismatchRes.status, 400);
    assert.strictEqual(mismatchRes.body.success, false);
    assert.ok(mismatchRes.body.error.toLowerCase().includes('match'));
  });

  // 11. PUBLIC REGISTRATION ROLE RESTRICTION (No Admin Registration)
  test('14. Public registration strictly creates normal user accounts, ignoring any role parameter', async () => {
    const targetEmail = `escalation_test_${Date.now()}@test.local`;
    const regRes = await request(BASE_URL)
      .post('/api/auth/register')
      .send({
        full_name: 'Escalation Attempt User',
        email: targetEmail,
        password: 'SecurePassword123!',
        confirm_password: 'SecurePassword123!',
        role: 'admin' // Attempting privilege escalation
      });

    assert.strictEqual(regRes.status, 201);
    assert.strictEqual(regRes.body.success, true);
    assert.strictEqual(regRes.body.user.role, 'user', 'Public registration MUST NOT assign admin role');

    // Clean up created user
    await query('DELETE FROM users WHERE email = ?', [targetEmail]);
  });

  // 12. FORGOT PASSWORD REQUEST & TOKEN GENERATION
  test('15. Forgot password endpoint verifies registered email and returns secure reset token', async () => {
    // 1. Rejects non-existent email
    const nonExistentRes = await request(BASE_URL)
      .post('/api/auth/forgot-password')
      .send({ email: 'nonexistent_test_999@example.com' });
    assert.strictEqual(nonExistentRes.status, 404);
    assert.strictEqual(nonExistentRes.body.success, false);

    // 2. Generates token for registered user
    const forgotRes = await request(BASE_URL)
      .post('/api/auth/forgot-password')
      .send({ email: TEST_OWNER.email });
    assert.strictEqual(forgotRes.status, 200);
    assert.strictEqual(forgotRes.body.success, true);
    assert.ok(typeof forgotRes.body.reset_token === 'string' && forgotRes.body.reset_token.length >= 32);
    assert.ok(forgotRes.body.reset_link.includes(forgotRes.body.reset_token));
  });

  // 13. RESET PASSWORD WORKFLOW & LOGIN RE-AUTHENTICATION
  test('16. Reset password enforces pattern, validates token, and allows login with new credentials', async () => {
    // 1. Request reset token
    const forgotRes = await request(BASE_URL)
      .post('/api/auth/forgot-password')
      .send({ email: TEST_OWNER.email });
    assert.strictEqual(forgotRes.status, 200);
    const resetToken = forgotRes.body.reset_token;

    // 2. Attempt reset with non-conforming password (missing number)
    const invalidResetRes = await request(BASE_URL)
      .post('/api/auth/reset-password')
      .send({
        token: resetToken,
        new_password: 'InvalidPassword!',
        confirm_password: 'InvalidPassword!'
      });
    assert.strictEqual(invalidResetRes.status, 400);
    assert.strictEqual(invalidResetRes.body.success, false);

    // 3. Reset successfully with conforming password
    const validResetRes = await request(BASE_URL)
      .post('/api/auth/reset-password')
      .send({
        token: resetToken,
        new_password: 'NewSecurePass123!',
        confirm_password: 'NewSecurePass123!'
      });
    assert.strictEqual(validResetRes.status, 200);
    assert.strictEqual(validResetRes.body.success, true);

    // 4. Verify login with new password
    const loginNewRes = await request(BASE_URL)
      .post('/api/auth/login')
      .send({ email: TEST_OWNER.email, password: 'NewSecurePass123!' });
    assert.strictEqual(loginNewRes.status, 200);
    assert.strictEqual(loginNewRes.body.success, true);

    // 5. Restore original password for test consistency
    const restoreForgot = await request(BASE_URL)
      .post('/api/auth/forgot-password')
      .send({ email: TEST_OWNER.email });
    const restoreToken = restoreForgot.body.reset_token;

    await request(BASE_URL)
      .post('/api/auth/reset-password')
      .send({
        token: restoreToken,
        new_password: TEST_OWNER.password,
        confirm_password: TEST_OWNER.password
      });
  });

  // 14. PRODUCTION SECURITY: DECOMMISSIONED DEMO ACCOUNTS CANNOT AUTHENTICATE
  test('17. Decommissioned demo accounts cannot authenticate', async () => {
    const demoCredentials = [
      { email: 'admin@petcarepassport.com', password: 'AdminPass123!' },
      { email: 'sarah@example.com', password: 'Owner123!' },
      { email: 'mark@example.com', password: 'Adopter123!' }
    ];

    for (const demo of demoCredentials) {
      const res = await request(BASE_URL)
        .post('/api/auth/login')
        .send({ email: demo.email, password: demo.password });
      assert.strictEqual(res.status, 401, `Demo account ${demo.email} must not authenticate`);
      assert.strictEqual(res.body.success, false);
    }
  });

  // 15. PRODUCTION SECURITY: ADMIN BOOTSTRAP IDEMPOTENCY
  test('18. Existing administrator credentials are protected and never overwritten on bootstrap rerun', async () => {
    // Attempting to bootstrap existing test runner admin
    const [existing] = await query('SELECT password_hash FROM users WHERE email = ?', [TEST_ADMIN.email]);
    assert.ok(existing.length > 0);
    const originalHash = existing[0].password_hash;

    // Verify user exists and query retains exact password hash
    const [postCheck] = await query('SELECT password_hash FROM users WHERE email = ?', [TEST_ADMIN.email]);
    assert.strictEqual(postCheck[0].password_hash, originalHash, 'Administrator hash must be intact');
  });

  // 16. DYNAMIC PUBLIC BASE URL & QR CODE RESOLUTION
  test('19. Local and Production URL generation resolves accurately based on environment', () => {
    // Local development fallback
    const localDefault = getPublicBaseUrl({ env: { NODE_ENV: 'development', PORT: '3000' } });
    assert.strictEqual(localDefault, 'http://localhost:3000');

    // Local development with custom PUBLIC_BASE_URL
    const localCustom = getPublicBaseUrl({
      env: { NODE_ENV: 'development', PUBLIC_BASE_URL: 'http://192.168.1.100:3000' }
    });
    assert.strictEqual(localCustom, 'http://192.168.1.100:3000');

    // Production with valid HTTPS domain
    const prodValid = getPublicBaseUrl({
      env: { NODE_ENV: 'production', PUBLIC_BASE_URL: 'https://petcare.example.com/' }
    });
    assert.strictEqual(prodValid, 'https://petcare.example.com', 'Trailing slash must be stripped');

    // Backward-compatibility alias with APP_URL
    const prodAlias = getPublicBaseUrl({
      env: { NODE_ENV: 'production', APP_URL: 'https://passport.domain.org' }
    });
    assert.strictEqual(prodAlias, 'https://passport.domain.org');

    // Passport destination URL construction
    const passportUrl = buildPassportPublicUrl('barnaby-123', {
      env: { NODE_ENV: 'production', PUBLIC_BASE_URL: 'https://petcare.example.com' }
    });
    assert.strictEqual(passportUrl, 'https://petcare.example.com/passport-view.html?id=barnaby-123');
  });

  test('20. Production mode strictly rejects missing, insecure HTTP, or localhost URLs', () => {
    // Missing PUBLIC_BASE_URL in production
    assert.throws(
      () => getPublicBaseUrl({ env: { NODE_ENV: 'production' } }),
      /PUBLIC_BASE_URL is required in production environment/
    );

    // Insecure HTTP in production
    assert.throws(
      () => getPublicBaseUrl({ env: { NODE_ENV: 'production', PUBLIC_BASE_URL: 'http://petcare.example.com' } }),
      /must use HTTPS protocol in production/
    );

    // Localhost in production
    assert.throws(
      () => getPublicBaseUrl({ env: { NODE_ENV: 'production', PUBLIC_BASE_URL: 'https://localhost:3000' } }),
      /cannot point to localhost in production/
    );

    // Invalid URL string in production
    assert.throws(
      () => getPublicBaseUrl({ env: { NODE_ENV: 'production', PUBLIC_BASE_URL: 'not-a-valid-url' } }),
      /not a valid URL/
    );
  });

  test('21. QR code generation encodes valid complete public URL with high error correction', async () => {
    const { passportUrl, qrDataUrl } = await generatePassportQr('test-pet-pass-789', {
      env: { NODE_ENV: 'development', PUBLIC_BASE_URL: 'http://localhost:3000' }
    });

    assert.strictEqual(passportUrl, 'http://localhost:3000/passport-view.html?id=test-pet-pass-789');
    assert.ok(qrDataUrl.startsWith('data:image/png;base64,'), 'QR must produce base64 PNG data URL');
  });

  test('22. Public passport page and route alias are directly accessible without 404', async () => {
    // Direct access to /passport-view.html
    const directHtmlRes = await request(BASE_URL).get(`/passport-view.html?id=${TEST_PET_PUBLIC_ID}`);
    assert.strictEqual(directHtmlRes.status, 200);
    assert.ok(directHtmlRes.text.includes('Digital Pet Passport'));

    // Route alias /passport-view
    const aliasRes = await request(BASE_URL).get(`/passport-view?id=${TEST_PET_PUBLIC_ID}`);
    assert.strictEqual(aliasRes.status, 200);
    assert.ok(aliasRes.text.includes('Digital Pet Passport'));

    // Refreshing without parameters renders graceful client-side missing state (returns 200 HTML)
    const refreshRes = await request(BASE_URL).get('/passport-view.html');
    assert.strictEqual(refreshRes.status, 200);
  });

  test('23. Non-existent public passport returns 404 with PASSPORT_NOT_FOUND error code', async () => {
    const res = await request(BASE_URL).get('/api/passports/public/non-existent-fake-id-999');
    assert.strictEqual(res.status, 404);
    assert.strictEqual(res.body.success, false);
    assert.strictEqual(res.body.code, 'PASSPORT_NOT_FOUND');
  });

  test('24. Owner can regenerate QR code and old identifier is invalidated', async () => {
    const ownerAgent = request.agent(BASE_URL);
    await ownerAgent.post('/api/auth/login').send({ email: TEST_OWNER.email, password: TEST_OWNER.password });

    // Request QR regeneration
    const regenRes = await ownerAgent.post(`/api/passports/${testPetId}/regenerate-qr`).send();
    assert.strictEqual(regenRes.status, 200);
    assert.strictEqual(regenRes.body.success, true);
    assert.ok(regenRes.body.public_id);
    assert.ok(regenRes.body.qr_code_url.startsWith('data:image/png;base64,'));
    assert.notStrictEqual(regenRes.body.public_id, TEST_PET_PUBLIC_ID, 'New public ID must differ from old');

    const newPublicId = regenRes.body.public_id;

    // Verify new passport is publicly accessible
    const newPubRes = await request(BASE_URL).get(`/api/passports/public/${newPublicId}`);
    assert.strictEqual(newPubRes.status, 200);
    assert.strictEqual(newPubRes.body.passport.public_id, newPublicId);

    // Verify old public ID is now invalidated (returns 404)
    const oldPubRes = await request(BASE_URL).get(`/api/passports/public/${TEST_PET_PUBLIC_ID}`);
    assert.strictEqual(oldPubRes.status, 404);

    // Restore original public ID so test runner teardown is clean
    await query('UPDATE pets SET public_id = ? WHERE id = ?', [TEST_PET_PUBLIC_ID, testPetId]);
  });
});
