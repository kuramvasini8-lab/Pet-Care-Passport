/**
 * PetCare Passport - Safe Passport QR Code Refresh Script
 * 
 * Safely refreshes the stored QR code data URLs for existing pets using the
 * configured PUBLIC_BASE_URL.
 * 
 * Guarantees:
 * - Does NOT modify or delete pet records, medical data, or user profiles.
 * - Updates only the visual `qr_code_url` data URL stored in the `passports` table.
 * - Supports `--dry-run` to preview all changes without modifying the database.
 * 
 * Usage:
 *   node scripts/refresh_passport_qr.js --dry-run   # Preview
 *   node scripts/refresh_passport_qr.js             # Execute
 */
const mysql = require('mysql2/promise');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

const { getPublicBaseUrl, generatePassportQr } = require('../src/utils/urlHelper');

const DB_CONFIG = {
  host: process.env.MYSQL_HOST || 'localhost',
  port: parseInt(process.env.MYSQL_PORT || '3366', 10),
  user: process.env.MYSQL_USER || 'root',
  password: process.env.MYSQL_PASSWORD || '',
  database: process.env.MYSQL_DATABASE || 'petcare_passport'
};

async function refreshPassportQrCodes() {
  const isDryRun = process.argv.includes('--dry-run');

  console.log('================================================================');
  console.log('🐾 PetCare Passport - Passport QR Code Refresh Utility');
  console.log(`   Database: ${DB_CONFIG.database} on ${DB_CONFIG.host}:${DB_CONFIG.port}`);
  console.log(`   Environment: ${process.env.NODE_ENV || 'development'}`);

  let baseUrl;
  try {
    baseUrl = getPublicBaseUrl();
    console.log(`   Configured Public Base URL: ${baseUrl}`);
  } catch (err) {
    console.error(`\n❌ Configuration Error: ${err.message}`);
    process.exit(1);
  }

  if (isDryRun) {
    console.log('   MODE: DRY-RUN (Preview only, no records will be updated)');
  }
  console.log('================================================================');

  const conn = await mysql.createConnection(DB_CONFIG);

  try {
    const [rows] = await conn.query(
      `SELECT p.id as pet_id, p.name as pet_name, p.public_id, p.user_id,
              pass.id as passport_id, pass.qr_code_url
       FROM pets p
       JOIN passports pass ON pass.pet_id = p.id
       WHERE p.is_archived = false
       ORDER BY p.id ASC`
    );

    console.log(`\nFound ${rows.length} existing active passport(s) in database.\n`);

    if (rows.length === 0) {
      console.log('No passports found to refresh.');
      return;
    }

    let updatedCount = 0;

    for (const pet of rows) {
      const { passportUrl, qrDataUrl } = await generatePassportQr(pet.public_id);

      console.log(`• [Pet ID: ${pet.pet_id}] ${pet.pet_name} (Public ID: ${pet.public_id})`);
      console.log(`  Target QR Destination: ${passportUrl}`);

      if (!isDryRun) {
        await conn.query(
          'UPDATE passports SET qr_code_url = ? WHERE pet_id = ?',
          [qrDataUrl, pet.pet_id]
        );
        console.log(`  ✓ Updated QR code data URL in database.`);
      } else {
        console.log(`  [Dry-run] Would re-encode QR code for destination: ${passportUrl}`);
      }
      updatedCount++;
    }

    console.log('\n================================================================');
    if (isDryRun) {
      console.log(`DRY-RUN COMPLETE: Evaluated ${updatedCount} passport(s). Zero records modified.`);
      console.log('To apply these updates, run without --dry-run:');
      console.log('  node scripts/refresh_passport_qr.js');
    } else {
      console.log(`✅ SUCCESS: Refreshed QR codes for ${updatedCount} passport(s).`);
      console.log(`All QR codes now encode: ${baseUrl}/passport-view.html?id=[public_id]`);
      console.log('All pet profiles, medical histories, and user accounts were preserved.');
    }
    console.log('================================================================');

  } catch (err) {
    console.error('\n❌ QR Refresh failed:', err);
    process.exit(1);
  } finally {
    await conn.end();
  }
}

refreshPassportQrCodes().catch(err => {
  console.error('Execution error:', err);
  process.exit(1);
});
