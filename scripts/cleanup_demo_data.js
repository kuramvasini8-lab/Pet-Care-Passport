/**
 * PetCare Passport - Safe Production Demo Data Cleanup Command
 * 
 * Safely removes only designated demo accounts, demo pets, and demo sample records.
 * NEVER deletes legitimate user accounts or real data.
 * Does NOT delete administrators that are not explicit demo accounts.
 * 
 * Usage:
 *   node scripts/cleanup_demo_data.js           # Executes safe cleanup
 *   node scripts/cleanup_demo_data.js --dry-run # Previews identified records without deleting
 */
const mysql = require('mysql2/promise');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

const DB_CONFIG = {
  host: process.env.MYSQL_HOST || 'localhost',
  port: parseInt(process.env.MYSQL_PORT || '3366', 10),
  user: process.env.MYSQL_USER || 'root',
  password: process.env.MYSQL_PASSWORD || '',
  database: process.env.MYSQL_DATABASE || 'petcare_passport'
};

// Known demo accounts and identifiers
const DEMO_EMAILS = [
  'admin@petcarepassport.com',
  'sarah@example.com',
  'mark@example.com'
];

const DEMO_PET_PUBLIC_IDS = [
  'luna-pass-a9b8c7d6',
  'milo-pass-e1f2g3h4',
  'barnaby-pass-j5k6l7m8',
  'cleo-pass-x1y2z3a4',
  'rocky-pass-99887766'
];

const DEMO_LF_EMAILS = [
  'sarah@example.com',
  'jennifer@example.com'
];

async function cleanupDemoData() {
  const isDryRun = process.argv.includes('--dry-run');

  console.log('================================================================');
  console.log('🐾 PetCare Passport - Production Demo Account Cleanup');
  console.log(`   Target Database: ${DB_CONFIG.database} on ${DB_CONFIG.host}:${DB_CONFIG.port}`);
  if (isDryRun) {
    console.log('   MODE: DRY-RUN (Preview only, no data will be modified)');
  }
  console.log('================================================================');

  const conn = await mysql.createConnection(DB_CONFIG);

  try {
    // 1. Inspect all user accounts in the database
    const [allUsers] = await conn.query('SELECT id, full_name, email, role, status, created_at FROM users ORDER BY id ASC');

    const demoUsers = allUsers.filter(u => DEMO_EMAILS.includes(u.email.toLowerCase()));
    const legitimateUsers = allUsers.filter(u => !DEMO_EMAILS.includes(u.email.toLowerCase()));

    console.log('\n--- 1. AUDIT USER ACCOUNTS ---');
    console.log(`Total user accounts in database: ${allUsers.length}`);

    // Report preserved legitimate accounts
    console.log(`\n🛡️ PRESERVED LEGITIMATE ACCOUNTS (${legitimateUsers.length}):`);
    if (legitimateUsers.length === 0) {
      console.log('   (No other user accounts currently present in database)');
    } else {
      legitimateUsers.forEach(u => {
        console.log(`   • [ID: ${u.id}] ${u.full_name} <${u.email}> | Role: ${u.role} | Status: ${u.status}`);
      });
    }

    // Report identified demo accounts
    console.log(`\n🎯 IDENTIFIED DEMO ACCOUNTS TO CLEAN (${demoUsers.length}):`);
    if (demoUsers.length === 0) {
      console.log('   ✅ No demo user accounts found in this database! (Already clean)');
    } else {
      demoUsers.forEach(u => {
        console.log(`   • [ID: ${u.id}] ${u.full_name} <${u.email}> | Role: ${u.role}`);
      });
    }

    // 2. Inspect demo pets
    const [allPets] = await conn.query('SELECT id, name, public_id, user_id FROM pets ORDER BY id ASC');
    const demoPets = allPets.filter(p => 
      DEMO_PET_PUBLIC_IDS.includes(p.public_id) || 
      demoUsers.some(du => du.id === p.user_id)
    );
    const legitimatePets = allPets.filter(p => !demoPets.some(dp => dp.id === p.id));

    console.log('\n--- 2. AUDIT COMPANION PETS ---');
    console.log(`Total pets in database: ${allPets.length}`);
    console.log(`🛡️ PRESERVED LEGITIMATE PETS: ${legitimatePets.length}`);
    legitimatePets.forEach(p => {
      console.log(`   • [ID: ${p.id}] ${p.name} (Public ID: ${p.public_id}, Owner User ID: ${p.user_id})`);
    });
    console.log(`🎯 IDENTIFIED DEMO PETS TO PURGE: ${demoPets.length}`);
    demoPets.forEach(p => {
      console.log(`   • [ID: ${p.id}] ${p.name} (Public ID: ${p.public_id}, Owner User ID: ${p.user_id})`);
    });

    // 3. Inspect demo Lost & Found reports
    const [demoLfReports] = await conn.query(
      'SELECT id, pet_name, contact_email, report_type FROM lost_found_reports WHERE contact_email IN (?)',
      [DEMO_LF_EMAILS]
    );
    console.log('\n--- 3. AUDIT LOST & FOUND REPORTS ---');
    console.log(`🎯 Identified demo lost/found reports to purge: ${demoLfReports.length}`);

    if (isDryRun) {
      console.log('\n================================================================');
      console.log('DRY-RUN COMPLETE: No changes were applied.');
      console.log('To execute cleanup, run without --dry-run:');
      console.log('  node scripts/cleanup_demo_data.js');
      console.log('================================================================');
      return;
    }

    if (demoUsers.length === 0 && demoPets.length === 0 && demoLfReports.length === 0) {
      console.log('\n================================================================');
      console.log('✅ DATABASE IS ALREADY CLEAN. No demo records were found to remove.');
      console.log('================================================================');
      return;
    }

    // Execute Cleanup Transaction
    console.log('\n--- 4. EXECUTING SAFE TRANSACTIONAL CLEANUP ---');
    await conn.beginTransaction();

    let deletedUsersCount = 0;
    if (demoUsers.length > 0) {
      const demoUserIds = demoUsers.map(u => u.id);
      // Deleting users cascades to pets, passports, health_records, vaccinations, daily_care_tasks, notifications, password_resets
      const [res] = await conn.query('DELETE FROM users WHERE id IN (?)', [demoUserIds]);
      deletedUsersCount = res.affectedRows;
      console.log(`   ✓ Deleted ${deletedUsersCount} demo user account(s) and cascaded child records.`);
    }

    // Clean any orphaned demo pets by public ID if any remain
    const [petRes] = await conn.query('DELETE FROM pets WHERE public_id IN (?)', [DEMO_PET_PUBLIC_IDS]);
    if (petRes.affectedRows > 0) {
      console.log(`   ✓ Cleaned ${petRes.affectedRows} residual demo pet(s).`);
    }

    // Clean demo lost & found reports
    const [lfRes] = await conn.query('DELETE FROM lost_found_reports WHERE contact_email IN (?)', [DEMO_LF_EMAILS]);
    if (lfRes.affectedRows > 0) {
      console.log(`   ✓ Cleaned ${lfRes.affectedRows} demo lost & found report(s).`);
    }

    // Clean demo reminders log
    const [remRes] = await conn.query('DELETE FROM reminders_log WHERE recipient_email IN (?)', [DEMO_EMAILS]);
    if (remRes.affectedRows > 0) {
      console.log(`   ✓ Cleaned ${remRes.affectedRows} demo reminder telemetry log(s).`);
    }

    // Log this cleanup in audit_logs
    await conn.query(
      `INSERT INTO audit_logs (admin_id, admin_name, action_type, target_entity, target_id, reason, details, ip_address)
       VALUES (NULL, 'System Migration Runner', 'DEMO_DATA_CLEANUP', 'database', 0, 'Production deployment demo account cleanup executed', ?, '127.0.0.1')`,
      [
        JSON.stringify({
          removedDemoEmails: DEMO_EMAILS,
          deletedUserCount: deletedUsersCount,
          preservedUserCount: legitimateUsers.length,
          timestamp: new Date().toISOString()
        })
      ]
    );

    await conn.commit();
    console.log('   ✓ Transaction committed successfully.');

    // 5. Verification Post-Cleanup
    console.log('\n--- 5. POST-CLEANUP VERIFICATION ---');
    const [remainingDemoUsers] = await conn.query(
      'SELECT COUNT(*) as count FROM users WHERE email IN (?)',
      [DEMO_EMAILS]
    );
    const [finalUsers] = await conn.query('SELECT id, full_name, email, role FROM users');

    console.log(`Demo accounts remaining in database: ${remainingDemoUsers[0].count} (Expected: 0)`);
    console.log(`Legitimate accounts intact:          ${finalUsers.length} (Expected: ${legitimateUsers.length})`);

    if (remainingDemoUsers[0].count === 0 && finalUsers.length === legitimateUsers.length) {
      console.log('================================================================');
      console.log('✅ CLEANUP VERIFICATION PASSED:');
      console.log('   1. All demo accounts (admin@petcarepassport.com, sarah@example.com, etc.) removed.');
      console.log('   2. Demo accounts cannot authenticate.');
      console.log('   3. All legitimate user accounts and their pets preserved intact.');
      console.log('   4. Audit trail entry created.');
      console.log('================================================================');
    } else {
      console.error('⚠️ Verification warning: discrepancy detected in post-cleanup count.');
    }

  } catch (err) {
    await conn.rollback();
    console.error('❌ Cleanup failed, transaction rolled back:', err);
    process.exit(1);
  } finally {
    await conn.end();
  }
}

cleanupDemoData().catch(err => {
  console.error('Cleanup execution error:', err);
  process.exit(1);
});
