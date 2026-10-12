/**
 * PetCare Passport - Development Seed Script (DEV / TEST ONLY)
 * 
 * STRICT PRODUCTION SAFEGUARD:
 * This script will REFUSE to execute if NODE_ENV is set to 'production'.
 * 
 * Usage:
 *   npm run seed:dev
 */
const mysql = require('mysql2/promise');
const bcrypt = require('bcryptjs');
const QRCode = require('qrcode');
const { generatePassportQr } = require('../src/utils/urlHelper');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

// STRICT SAFETY GUARD
if (process.env.NODE_ENV === 'production') {
  console.error('================================================================');
  console.error('⛔ FATAL: Refusing to seed demo data in PRODUCTION environment.');
  console.error('   NODE_ENV is set to "production".');
  console.error('================================================================');
  process.exit(1);
}

const DB_CONFIG = {
  host: process.env.MYSQL_HOST || 'localhost',
  port: parseInt(process.env.MYSQL_PORT || '3366', 10),
  user: process.env.MYSQL_USER || 'root',
  password: process.env.MYSQL_PASSWORD || '',
  database: process.env.MYSQL_DATABASE || 'petcare_passport'
};

async function seedDev() {
  console.log('[DevSeed] Connecting to database...');
  const conn = await mysql.createConnection(DB_CONFIG);

  try {
    const saltRounds = 10;
    const adminHash = await bcrypt.hash('AdminPass123!', saltRounds);
    const ownerHash = await bcrypt.hash('Owner123!', saltRounds);
    const adopterHash = await bcrypt.hash('Adopter123!', saltRounds);

    // 1. Insert Demo Users if not existing
    console.log('[DevSeed] Seeding demo accounts (admin@petcarepassport.com, sarah@example.com, mark@example.com)...');

    const [existingAdmin] = await conn.query('SELECT id FROM users WHERE email = ?', ['admin@petcarepassport.com']);
    let adminId = existingAdmin.length > 0 ? existingAdmin[0].id : null;
    if (!adminId) {
      const [r] = await conn.query(
        `INSERT INTO users (full_name, email, password_hash, phone, role, status) VALUES (?, ?, ?, ?, 'admin', 'active')`,
        ['Demo System Administrator', 'admin@petcarepassport.com', adminHash, '+1 (555) 019-2831']
      );
      adminId = r.insertId;
    }

    const [existingOwner] = await conn.query('SELECT id FROM users WHERE email = ?', ['sarah@example.com']);
    let ownerId = existingOwner.length > 0 ? existingOwner[0].id : null;
    if (!ownerId) {
      const [r] = await conn.query(
        `INSERT INTO users (full_name, email, password_hash, phone, role, status) VALUES (?, ?, ?, ?, 'user', 'active')`,
        ['Sarah Jenkins', 'sarah@example.com', ownerHash, '+1 (555) 234-5678']
      );
      ownerId = r.insertId;
    }

    const [existingAdopter] = await conn.query('SELECT id FROM users WHERE email = ?', ['mark@example.com']);
    let adopterId = existingAdopter.length > 0 ? existingAdopter[0].id : null;
    if (!adopterId) {
      const [r] = await conn.query(
        `INSERT INTO users (full_name, email, password_hash, phone, role, status) VALUES (?, ?, ?, ?, 'user', 'active')`,
        ['Marcus Vance', 'mark@example.com', adopterHash, '+1 (555) 876-5432']
      );
      adopterId = r.insertId;
    }

    // 2. Insert Demo Pets for Sarah
    const [existingLuna] = await conn.query('SELECT id FROM pets WHERE public_id = ?', ['luna-pass-a9b8c7d6']);
    if (existingLuna.length === 0) {
      const lunaPublicId = 'luna-pass-a9b8c7d6';
      const { qrDataUrl: lunaQr } = await generatePassportQr(lunaPublicId);

      const [p1] = await conn.query(
        `INSERT INTO pets (user_id, public_id, name, species, breed, dob_or_age, sex, color_marks, microchip_number, weight, blood_group, is_sterilized, dietary_requirements, allergies, medical_conditions, current_medications, special_care, notes, photo_url)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          ownerId, lunaPublicId, 'Luna', 'Dog', 'Golden Retriever', '3 years', 'Female',
          'Golden coat, white star marking on chest', '985141002345678', 28.5, 'DEA 1.1 Negative',
          true, 'Grain-free salmon kibble, 2 cups twice daily', 'Seasonal grass pollen allergy',
          'Mild hip sensitivity in cold weather', 'Omega-3 Fish Oil', 'Gentle handling around hind hips',
          'High energy, loves swimming and retrieving tennis balls.', '/assets/images/luna.jpg'
        ]
      );
      const lunaId = p1.insertId;

      await conn.query(
        `INSERT INTO passports (pet_id, is_public_enabled, show_photo, show_name, show_breed, show_emergency_contact, emergency_contact_name, emergency_contact_phone, emergency_notes, show_medical_alerts, show_allergies, show_vaccinations, qr_code_url)
         VALUES (?, true, true, true, true, true, 'Sarah Jenkins', '+1 (555) 234-5678', 'If found, please keep Luna in a secure yard. She is friendly with children.', true, true, true, ?)`,
        [lunaId, lunaQr]
      );

      await conn.query(
        `INSERT INTO vaccinations (pet_id, vaccine_name, administered_date, next_due_date, clinic_name, batch_number, entry_source, notes)
         VALUES 
         (?, 'Rabies 3-Year', '2025-06-15', '2028-06-15', 'Oakridge Animal Hospital', 'RAB-2025-091A', 'clinic_verified', 'Standard triennial rabies booster.'),
         (?, 'DHPP (Distemper, Hepatitis, Parvo, Parainfluenza)', '2024-10-01', '2026-10-01', 'Oakridge Animal Hospital', 'DHPP-8820', 'clinic_verified', 'Annual core vaccination.'),
         (?, 'Bordetella (Kennel Cough)', '2026-04-10', '2027-04-10', 'Metro Veterinary Center', 'BOR-4421', 'owner_entered', 'Administered prior to agility camp.')`,
        [lunaId, lunaId, lunaId]
      );

      await conn.query(
        `INSERT INTO daily_care_tasks (pet_id, task_type, title, description, dosage_instruction, frequency, due_date, due_time, is_completed)
         VALUES 
         (?, 'medication', 'Omega-3 Fish Oil Capsule', 'Administer joint health fish oil supplement with breakfast kibble.', '1 softgel capsule (1000mg)', 'daily', CURDATE(), '08:00:00', true),
         (?, 'feeding', 'Morning Kibble', 'Feed 1 cup grain-free salmon formula kibble.', '1 standard measuring cup', 'daily', CURDATE(), '08:30:00', true),
         (?, 'walking', 'Afternoon Park Walk', '30-minute leashed exercise at Green Lake Park.', 'Moderate pace', 'daily', CURDATE(), '16:30:00', false)`,
        [lunaId, lunaId, lunaId]
      );

      console.log(`[DevSeed] Demo pet Luna seeded (ID: ${lunaId}).`);
    }

    console.log('✅ Dev seeding completed successfully.');
  } finally {
    await conn.end();
  }
}

seedDev().catch(err => {
  console.error('[DevSeed] Error:', err);
  process.exit(1);
});
