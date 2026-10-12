/**
 * Automated Integration Test Suite for PetCare Passport
 * Tests:
 * 1. Health check & database connection
 * 2. Visitor Experience & Public Privacy Protection (Zero Leaks)
 * 3. Server-Side RBAC & Security Boundaries (401 / 403 enforcement)
 * 4. Pet Owner Dashboard & Authorized Pet Operations
 * 5. Administrator Dashboard & Privileged Operations
 */

const { test, describe, before } = require('node:test');
const assert = require('node:assert');
const request = require('supertest');
const http = require('http');

// Base URL of the running server
const BASE_URL = 'http://localhost:3000';

describe('PetCare Passport Test Suite', () => {

  // 1. SYSTEM HEALTH
  test('1. System Health Check returns 200 and active database pool', async () => {
    const res = await request(BASE_URL).get('/api/health-check');
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.body.success, true);
    assert.strictEqual(res.body.database.status, 'healthy');
    assert.ok(typeof res.body.database.latencyMs === 'number');
  });

  // 2. VISITOR / ADOPTER PUBLIC EXPERIENCE
  test('2. Public Adoption Search returns only approved listings', async () => {
    const res = await request(BASE_URL).get('/api/adoptions/public/listings');
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.body.success, true);
    assert.ok(Array.isArray(res.body.listings));

    // Every returned listing MUST have status 'approved'
    for (const listing of res.body.listings) {
      assert.strictEqual(listing.status, 'approved', 'Unapproved listing leaked to public');
      // Must not expose owner password or private database fields
      assert.strictEqual(listing.password_hash, undefined);
    }
  });

  test('3. Public Passport endpoint protects private information and strips passwords/private data', async () => {
    // Luna's public passport
    const res = await request(BASE_URL).get('/api/passports/public/luna-pass-a9b8c7d6');
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.body.success, true);
    assert.ok(res.body.passport);
    assert.strictEqual(res.body.passport.name, 'Luna');
    // Ensure sensitive fields are undefined
    assert.strictEqual(res.body.passport.password_hash, undefined);
    assert.strictEqual(res.body.passport.user_id, undefined);
  });

  test('4. Public Lost & Found endpoint returns published reports without requiring login', async () => {
    const res = await request(BASE_URL).get('/api/lost-found/reports');
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.body.success, true);
    assert.ok(Array.isArray(res.body.reports));
  });

  // 3. SERVER-SIDE RBAC & BOUNDARY ENFORCEMENT
  test('5. Unauthenticated request to /api/owner/overview returns 401', async () => {
    const res = await request(BASE_URL).get('/api/owner/overview');
    assert.strictEqual(res.status, 401);
    assert.strictEqual(res.body.success, false);
  });

  test('6. Unauthenticated request to /api/admin/overview returns 401', async () => {
    const res = await request(BASE_URL).get('/api/admin/overview');
    assert.strictEqual(res.status, 401);
    assert.strictEqual(res.body.success, false);
  });

  test('7. Login fails with invalid password', async () => {
    const res = await request(BASE_URL)
      .post('/api/auth/login')
      .send({ email: 'sarah@example.com', password: 'WrongPassword123' });
    
    assert.strictEqual(res.status, 401);
    assert.strictEqual(res.body.success, false);
  });

  // 4. PET OWNER SESSION & OPERATIONS
  test('8. Pet Owner login and dashboard access', async () => {
    const agent = request.agent(BASE_URL);

    // Login as Sarah
    const loginRes = await agent
      .post('/api/auth/login')
      .send({ email: 'sarah@example.com', password: 'Owner123!' });

    assert.strictEqual(loginRes.status, 200);
    assert.strictEqual(loginRes.body.success, true);
    assert.strictEqual(loginRes.body.user.role, 'user');

    // Access Owner Overview
    const overviewRes = await agent.get('/api/owner/overview');
    assert.strictEqual(overviewRes.status, 200);
    assert.strictEqual(overviewRes.body.success, true);
    assert.ok(overviewRes.body.stats.total_pets >= 2, 'Sarah should have at least 2 pets');

    // Access Sarah's pets
    const petsRes = await agent.get('/api/pets');
    assert.strictEqual(petsRes.status, 200);
    assert.ok(Array.isArray(petsRes.body.pets));
    const petNames = petsRes.body.pets.map(p => p.name);
    assert.ok(petNames.includes('Luna'));
    assert.ok(petNames.includes('Milo'));

    // Attempt to access Admin endpoint as regular user -> MUST return 403 Forbidden!
    const adminForbiddenRes = await agent.get('/api/admin/overview');
    assert.strictEqual(adminForbiddenRes.status, 403, 'Regular user must not be granted admin access');
    assert.strictEqual(adminForbiddenRes.body.success, false);
  });

  // 5. ADMINISTRATOR SESSION & PRIVILEGED WORKFLOWS
  test('9. Administrator login and management operations', async () => {
    const adminAgent = request.agent(BASE_URL);

    // Login as Admin
    const loginRes = await adminAgent
      .post('/api/auth/login')
      .send({ email: 'admin@petcarepassport.com', password: 'AdminPass123!' });

    assert.strictEqual(loginRes.status, 200);
    assert.strictEqual(loginRes.body.user.role, 'admin');

    // Access Admin Overview
    const overviewRes = await adminAgent.get('/api/admin/overview');
    assert.strictEqual(overviewRes.status, 200);
    assert.ok(overviewRes.body.stats.total_users >= 3);
    assert.ok(overviewRes.body.stats.total_pets >= 3);

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

    // Access Moderation Queue
    const moderationRes = await adminAgent.get('/api/admin/moderation/listings');
    assert.strictEqual(moderationRes.status, 200);
    assert.ok(Array.isArray(moderationRes.body.listings));

    // Access Audit Logs
    const auditRes = await adminAgent.get('/api/admin/audit-logs');
    assert.strictEqual(auditRes.status, 200);
    assert.ok(Array.isArray(auditRes.body.logs));
  });

  // 6. AI PET ASSISTANT WITH STRICT VETERINARY CLINICAL DISCLAIMER
  test('10. AI Assistant returns response with mandatory clinical disclaimer', async () => {
    const userAgent = request.agent(BASE_URL);
    await userAgent.post('/api/auth/login').send({ email: 'sarah@example.com', password: 'Owner123!' });

    const aiRes = await userAgent
      .post('/api/ai/ask')
      .send({ prompt: 'What should I pack for my dog veterinary visit?' });

    assert.strictEqual(aiRes.status, 200);
    assert.strictEqual(aiRes.body.success, true);
    assert.ok(typeof aiRes.body.response === 'string');
    assert.ok(aiRes.body.disclaimer.toLowerCase().includes('veterinar'), 'Response must contain veterinary disclaimer');
  });

  // 7. NOTIFICATIONS NUMBER OF NOTIFICATIONS ENDPOINT
  test('11. Unread notification count endpoint returns exact integer count', async () => {
    const userAgent = request.agent(BASE_URL);
    await userAgent.post('/api/auth/login').send({ email: 'sarah@example.com', password: 'Owner123!' });

    const notifRes = await userAgent.get('/api/notifications/unread-count');
    assert.strictEqual(notifRes.status, 200);
    assert.strictEqual(notifRes.body.success, true);
    assert.strictEqual(typeof notifRes.body.count, 'number');
  });

  // 8. PET OWNER "REPORT AS MISSING" FLOW
  test('12. Pet owner can report pet as missing and automatically publish lost pet alert', async () => {
    const userAgent = request.agent(BASE_URL);
    await userAgent.post('/api/auth/login').send({ email: 'sarah@example.com', password: 'Owner123!' });

    // Get Sarah's pets
    const petsRes = await userAgent.get('/api/pets');
    const luna = petsRes.body.pets.find(p => p.name === 'Luna');
    assert.ok(luna, 'Luna should exist in Sarah records');

    // Report Luna as missing
    const missingRes = await userAgent
      .post(`/api/pets/${luna.id}/report-missing`)
      .send({
        date_lost: '2026-10-12',
        general_location: 'Green Lake Park, Seattle',
        contact_phone: '(555) 234-5678',
        description: 'Luna slipped her leash near the playground. Wearing green collar.'
      });

    assert.strictEqual(missingRes.status, 200);
    assert.strictEqual(missingRes.body.success, true);
    assert.ok(missingRes.body.report_id > 0);

    // Verify pet is marked as missing in pet list
    const updatedPetsRes = await userAgent.get('/api/pets');
    const updatedLuna = updatedPetsRes.body.pets.find(p => p.id === luna.id);
    assert.strictEqual(Boolean(updatedLuna.is_missing), true);

    // Mark Luna as found
    const foundRes = await userAgent.post(`/api/pets/${luna.id}/mark-found`);
    assert.strictEqual(foundRes.status, 200);
    assert.strictEqual(foundRes.body.success, true);
  });

  // 9. ADMINISTRATOR ADOPTION VERIFICATION WORKFLOW
  test('13. Administrator can officially verify pet adoption listing', async () => {
    const adminAgent = request.agent(BASE_URL);
    await adminAgent.post('/api/auth/login').send({ email: 'admin@petcarepassport.com', password: 'AdminPass123!' });

    // Fetch listings
    const listRes = await adminAgent.get('/api/admin/moderation/listings');
    assert.ok(listRes.body.listings.length > 0);
    const targetListing = listRes.body.listings[0];

    // Verify listing
    const verifyRes = await adminAgent
      .put(`/api/admin/moderation/listings/${targetListing.id}/verify`)
      .send({
        verification_notes: 'Veterinary health records and ISO microchip verified by Platform Administrator.',
        checklist: ['microchip_verified', 'vaccines_verified', 'sterilization_verified']
      });

    assert.strictEqual(verifyRes.status, 200);
    assert.strictEqual(verifyRes.body.success, true);
    assert.strictEqual(verifyRes.body.is_verified, true);
  });

  // 10. ADMINISTRATOR ADOPTION APPLICATIONS OVERSIGHT
  test('14. Administrator can inspect platform-wide adoption applications', async () => {
    const adminAgent = request.agent(BASE_URL);
    await adminAgent.post('/api/auth/login').send({ email: 'admin@petcarepassport.com', password: 'AdminPass123!' });

    const appsRes = await adminAgent.get('/api/admin/moderation/applications');
    assert.strictEqual(appsRes.status, 200);
    assert.strictEqual(appsRes.body.success, true);
    assert.ok(Array.isArray(appsRes.body.applications));
  });
});
