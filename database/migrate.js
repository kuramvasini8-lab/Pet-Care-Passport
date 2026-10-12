/**
 * PetCare Passport - Database Migration & Seed Runner
 * Initializes the database schema and populates rich seed records.
 */
const mysql = require('mysql2/promise');
const bcrypt = require('bcryptjs');
const QRCode = require('qrcode');
const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

const DB_CONFIG = {
  host: process.env.MYSQL_HOST || 'localhost',
  port: parseInt(process.env.MYSQL_PORT || '3366', 10),
  user: process.env.MYSQL_USER || 'root',
  password: process.env.MYSQL_PASSWORD || '',
  database: process.env.MYSQL_DATABASE || 'petcare_passport',
  multipleStatements: true
};

async function migrate() {
  console.log(`[Migration] Connecting to MySQL at ${DB_CONFIG.host}:${DB_CONFIG.port}...`);
  
  // Step 1: Connect without database to ensure DB exists
  const rootConn = await mysql.createConnection({
    host: DB_CONFIG.host,
    port: DB_CONFIG.port,
    user: DB_CONFIG.user,
    password: DB_CONFIG.password
  });

  await rootConn.query(`CREATE DATABASE IF NOT EXISTS \`${DB_CONFIG.database}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;`);
  await rootConn.end();
  console.log(`[Migration] Database \`${DB_CONFIG.database}\` confirmed.`);

  // Step 2: Connect to the database and run schema.sql
  const dbConn = await mysql.createConnection(DB_CONFIG);
  const schemaSql = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8');
  console.log('[Migration] Applying database schema...');
  await dbConn.query(schemaSql);
  console.log('[Migration] Database schema applied successfully.');

  // Step 3: Seed initial users and bootstrap admin
  console.log('[Migration] Seeding demo accounts and bootstrap administrator...');
  const saltRounds = 10;

  const adminPass = process.env.ADMIN_BOOTSTRAP_PASSWORD || 'AdminPass123!';
  const adminEmail = process.env.ADMIN_BOOTSTRAP_EMAIL || 'admin@petcarepassport.com';
  const adminName = process.env.ADMIN_BOOTSTRAP_NAME || 'System Administrator';
  const adminHash = await bcrypt.hash(adminPass, saltRounds);

  const ownerPass = 'Owner123!';
  const ownerHash = await bcrypt.hash(ownerPass, saltRounds);

  const adopterPass = 'Adopter123!';
  const adopterHash = await bcrypt.hash(adopterPass, saltRounds);

  // Insert Admin
  const [adminResult] = await dbConn.query(
    `INSERT INTO users (full_name, email, password_hash, phone, role, status)
     VALUES (?, ?, ?, ?, 'admin', 'active')`,
    [adminName, adminEmail, adminHash, '+1 (555) 019-2831']
  );
  const adminId = adminResult.insertId;

  // Insert Demo Pet Owner
  const [ownerResult] = await dbConn.query(
    `INSERT INTO users (full_name, email, password_hash, phone, role, status)
     VALUES (?, ?, ?, ?, 'user', 'active')`,
    ['Sarah Jenkins', 'sarah@example.com', ownerHash, '+1 (555) 234-5678']
  );
  const ownerId = ownerResult.insertId;

  // Insert Demo Adopter
  const [adopterResult] = await dbConn.query(
    `INSERT INTO users (full_name, email, password_hash, phone, role, status)
     VALUES (?, ?, ?, ?, 'user', 'active')`,
    ['Marcus Vance', 'mark@example.com', adopterHash, '+1 (555) 876-5432']
  );
  const adopterId = adopterResult.insertId;

  console.log(`[Migration] Created Users: Admin (ID: ${adminId}), Owner (ID: ${ownerId}), Adopter (ID: ${adopterId})`);

  // Step 4: Seed Pets for Sarah
  console.log('[Migration] Seeding pets and generating digital passport QR codes...');

  // Pet 1: Luna (Dog)
  const lunaPublicId = 'luna-pass-a9b8c7d6';
  const lunaQr = await QRCode.toDataURL(`http://localhost:${process.env.PORT || 3000}/passport-view.html?id=${lunaPublicId}`);
  const [p1] = await dbConn.query(
    `INSERT INTO pets (user_id, public_id, name, species, breed, dob_or_age, sex, color_marks, microchip_number, weight, blood_group, is_sterilized, dietary_requirements, allergies, medical_conditions, current_medications, special_care, notes, photo_url)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      ownerId,
      lunaPublicId,
      'Luna',
      'Dog',
      'Golden Retriever',
      '3 years',
      'Female',
      'Golden coat, white star marking on chest',
      '985141002345678',
      28.5,
      'DEA 1.1 Negative',
      true,
      'Grain-free salmon kibble, 2 cups twice daily',
      'Seasonal grass pollen allergy (causes mild skin itch)',
      'Mild hip sensitivity in cold weather',
      'Omega-3 Fish Oil (1 capsule daily with food)',
      'Gentle handling around hind hips; loves swimming',
      'Extremely friendly family companion, microchipped and vaccinated.',
      '/assets/images/dog-luna.jpg'
    ]
  );
  const lunaId = p1.insertId;

  await dbConn.query(
    `INSERT INTO passports (pet_id, is_public_enabled, show_photo, show_name, show_breed, show_emergency_contact, emergency_contact_name, emergency_contact_phone, emergency_notes, show_medical_alerts, show_allergies, show_vaccinations, qr_code_url)
     VALUES (?, true, true, true, true, true, ?, ?, ?, true, true, true, ?)`,
    [
      lunaId,
      'Sarah Jenkins',
      '+1 (555) 234-5678',
      'If found, please call owner immediately. Luna is friendly and loves gentle head scratches.',
      lunaQr
    ]
  );

  // Pet 2: Milo (Cat)
  const miloPublicId = 'milo-pass-e1f2g3h4';
  const miloQr = await QRCode.toDataURL(`http://localhost:${process.env.PORT || 3000}/passport-view.html?id=${miloPublicId}`);
  const [p2] = await dbConn.query(
    `INSERT INTO pets (user_id, public_id, name, species, breed, dob_or_age, sex, color_marks, microchip_number, weight, blood_group, is_sterilized, dietary_requirements, allergies, medical_conditions, current_medications, special_care, notes, photo_url)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      ownerId,
      miloPublicId,
      'Milo',
      'Cat',
      'British Shorthair',
      '2 years',
      'Male',
      'Dense blue-gray coat, copper amber eyes',
      '985141009876543',
      4.8,
      'Type A',
      true,
      'Royal Canin British Shorthair wet pouch + dry kibble',
      'None reported',
      'None',
      'None',
      'Indoor-only cat; gets anxious in loud car rides',
      'Very calm, cuddly indoor cat.',
      '/assets/images/cat-milo.jpg'
    ]
  );
  const miloId = p2.insertId;

  await dbConn.query(
    `INSERT INTO passports (pet_id, is_public_enabled, show_photo, show_name, show_breed, show_emergency_contact, emergency_contact_name, emergency_contact_phone, emergency_notes, show_medical_alerts, show_allergies, show_vaccinations, qr_code_url)
     VALUES (?, true, true, true, true, true, ?, ?, ?, true, true, true, ?)`,
    [
      miloId,
      'Sarah Jenkins',
      '+1 (555) 234-5678',
      'Indoor cat! If seen outdoors, please contact immediately.',
      miloQr
    ]
  );

  // Pet 3: Barnaby (Dog - For Adoption Listing)
  const barnabyPublicId = 'barnaby-pass-j5k6l7m8';
  const barnabyQr = await QRCode.toDataURL(`http://localhost:${process.env.PORT || 3000}/passport-view.html?id=${barnabyPublicId}`);
  const [p3] = await dbConn.query(
    `INSERT INTO pets (user_id, public_id, name, species, breed, dob_or_age, sex, color_marks, microchip_number, weight, blood_group, is_sterilized, dietary_requirements, allergies, medical_conditions, current_medications, special_care, notes, photo_url)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      ownerId,
      barnabyPublicId,
      'Barnaby',
      'Dog',
      'Beagle',
      '1.5 years',
      'Male',
      'Classic tri-color black, tan, and white with white tail tip',
      '985141005544332',
      12.2,
      'DEA 1.1 Positive',
      true,
      'Standard puppy-to-adult canine kibble',
      'Chicken byproduct sensitivity (prefers beef/lamb)',
      'Healthy and active',
      'None',
      'Needs fenced yard; keen scent hound instinct',
      'Seeking a loving active family due to family relocation.',
      '/assets/images/dog-barnaby.jpg'
    ]
  );
  const barnabyId = p3.insertId;

  await dbConn.query(
    `INSERT INTO passports (pet_id, is_public_enabled, show_photo, show_name, show_breed, show_emergency_contact, emergency_contact_name, emergency_contact_phone, emergency_notes, show_medical_alerts, show_allergies, show_vaccinations, qr_code_url)
     VALUES (?, true, true, true, true, false, NULL, NULL, 'Rehoming passport', true, true, true, ?)`,
    [barnabyId, barnabyQr]
  );

  // Step 5: Seed Health Records for Luna & Milo
  console.log('[Migration] Seeding health records...');
  await dbConn.query(
    `INSERT INTO health_records (pet_id, record_type, title, date, veterinarian_name, clinic_name, description, treatment_plan, follow_up_instructions, entry_source)
     VALUES 
     (?, 'vet_visit', 'Annual Wellness & Dental Examination', '2026-03-15', 'Dr. Emily Watson, DVM', 'Oakridge Animal Hospital', 'Comprehensive physical examination. Teeth clean grade 1, heart clear, lungs clear, joints sound.', 'Continue daily brushing and dental chews.', 'Next routine checkup in 12 months.', 'clinic_verified'),
     (?, 'treatment', 'Seasonal Dermatitis Relief Treatment', '2026-06-20', 'Dr. David Chen, DVM', 'Metro Veterinary Center', 'Mild localized pruritus on paws after garden play during high pollen week.', 'Cytopoint injection administered. Antiseptic paw wipes recommended.', 'Monitor for 14 days; call clinic if itching persists.', 'clinic_verified'),
     (?, 'vet_visit', 'Routine Kitten Vaccination & Health Check', '2025-11-10', 'Dr. Emily Watson, DVM', 'Oakridge Animal Hospital', 'Healthy weight gain, heart normal, ears clean.', 'Core kitten vaccines administered.', 'Return for annual booster.', 'clinic_verified')`,
    [lunaId, lunaId, miloId]
  );

  // Step 6: Seed Vaccinations (With Up-to-date, Due Soon, and Overdue statuses!)
  console.log('[Migration] Seeding vaccination schedules...');
  // Let's create realistic dates:
  // Today in simulation is Oct 2026:
  // - Luna Rabies: administered 2025-11-15, next due 2026-11-15 (Due soon! within ~30 days)
  // - Luna DHPP: administered 2025-10-01, next due 2026-10-01 (Overdue! past date)
  // - Luna Bordetella: administered 2026-04-10, next due 2027-04-10 (Up to Date)
  // - Milo FVRCP: administered 2026-02-14, next due 2027-02-14 (Up to Date)
  // - Milo Rabies: administered 2025-08-01, next due 2026-08-01 (Overdue)
  // - Barnaby Core Rabies: administered 2026-05-10, next due 2027-05-10 (Up to Date)
  await dbConn.query(
    `INSERT INTO vaccinations (pet_id, vaccine_name, administered_date, next_due_date, clinic_name, batch_number, entry_source, notes)
     VALUES 
     (?, 'Canine Rabies 3-Year Booster', '2025-11-15', '2026-11-15', 'Oakridge Animal Hospital', 'RB-98214-X', 'clinic_verified', 'Annual state requirement booster.'),
     (?, 'Canine DHPP (Distemper, Hepatitis, Parvovirus)', '2025-10-01', '2026-10-01', 'Oakridge Animal Hospital', 'DHPP-7721-B', 'clinic_verified', 'Core 5-in-1 combo vaccine. Overdue for annual renewal!'),
     (?, 'Bordetella Bronchiseptica (Kennel Cough)', '2026-04-10', '2027-04-10', 'Metro Veterinary Center', 'BOR-3310-C', 'clinic_verified', 'Intranasal administration. Up to date.'),
     (?, 'Feline FVRCP (Feline Viral Rhinotracheitis)', '2026-02-14', '2027-02-14', 'Oakridge Animal Hospital', 'FVR-4412-A', 'clinic_verified', 'Core feline combo vaccine.'),
     (?, 'Feline Rabies Vaccine', '2025-08-01', '2026-08-01', 'Metro Veterinary Center', 'FRB-1192-K', 'owner_entered', 'Booster due.'),
     (?, 'Canine Rabies & DHPP Combo', '2026-05-10', '2027-05-10', 'Sunset Pet Care Clinic', 'CRB-8801-D', 'clinic_verified', 'Complete puppy booster series verified.')`,
    [lunaId, lunaId, lunaId, miloId, miloId, barnabyId]
  );

  // Step 7: Seed Daily Care Tasks
  console.log('[Migration] Seeding daily care tasks...');
  await dbConn.query(
    `INSERT INTO daily_care_tasks (pet_id, task_type, title, description, dosage_instruction, frequency, due_date, due_time, is_completed)
     VALUES 
     (?, 'medication', 'Omega-3 Fish Oil Supplement', 'Administer 1 capsule with morning breakfast meal', '1 capsule (1000mg) owner-administered', 'daily', CURDATE(), '08:00:00', true),
     (?, 'walking', 'Morning Park Walk', '30-minute brisk walk around the neighborhood park', NULL, 'daily', CURDATE(), '07:30:00', true),
     (?, 'grooming', 'Coat Brushing & Deshedding', 'Weekly fur rake and slicker brush session', NULL, 'weekly', CURDATE(), '17:00:00', false),
     (?, 'medication', 'Paw Antiseptic Cleanse', 'Gentle wipe of paw pads after outdoor walk', '2 wipes as directed by vet', 'daily', CURDATE(), '19:30:00', false),
     (?, 'feeding', 'Evening Wet Food Dinner', 'Feed 1 pouch of British Shorthair wet food', '85g pouch', 'daily', CURDATE(), '18:00:00', false),
     (?, 'grooming', 'Nail Trimming', 'Inspect and trim front claws using cat claw trimmer', NULL, 'weekly', DATE_ADD(CURDATE(), INTERVAL 2 DAY), '14:00:00', false)`,
    [lunaId, lunaId, lunaId, lunaId, miloId, miloId]
  );

  // Step 8: Seed Appointments
  console.log('[Migration] Seeding appointments...');
  await dbConn.query(
    `INSERT INTO appointments (pet_id, user_id, clinic_name, veterinarian_name, appointment_date, purpose, status, notes, follow_up_notes)
     VALUES 
     (?, ?, 'Oakridge Animal Hospital', 'Dr. Emily Watson, DVM', DATE_ADD(NOW(), INTERVAL 3 DAY), 'Overdue DHPP Vaccination Booster & Annual Check', 'upcoming', 'Owner-managed reminder for overdue vaccine renewal.', 'Ask about winter paw balm.'),
     (?, ?, 'Metro Veterinary Center', 'Dr. David Chen, DVM', DATE_ADD(NOW(), INTERVAL 14 DAY), 'Routine Dental Checkup & Cleaning Consultation', 'upcoming', 'Check mild tartar on rear molars.', NULL),
     (?, ?, 'Oakridge Animal Hospital', 'Dr. Emily Watson, DVM', DATE_SUB(NOW(), INTERVAL 60 DAY), 'Microchip Verification & Rabies Vaccine Check', 'completed', 'Completed successfully. Microchip read accurately.', 'Healthy vitals recorded.')`,
    [lunaId, ownerId, miloId, ownerId, lunaId, ownerId]
  );

  // Step 9: Seed Adoption Listings
  console.log('[Migration] Seeding adoption listings...');
  // Listing 1: Barnaby (Approved & Active) - Publicly viewable!
  const [l1] = await dbConn.query(
    `INSERT INTO adoption_listings (pet_id, user_id, title, description, temperament, health_summary, adoption_requirements, general_location, status, moderated_by, moderated_at, moderation_notes)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'approved', ?, NOW(), 'Approved by administrator. Meets all community adoption standards.')`,
    [
      barnabyId,
      ownerId,
      'Friendly and Playful Beagle "Barnaby" Looking for an Active Forever Home',
      'Barnaby is an energetic, sweet-tempered 1.5-year-old Beagle who adores human companionship, outdoor adventures, and learning new scent games. He is fully house-trained, neutered, and gets along wonderfully with kids and other dogs.',
      'Affectionate, inquisitive, energetic, friendly with children, social with other dogs.',
      'Up to date on all core vaccinations, neutered, microchipped, healthy weight and clear health history.',
      'Securely fenced yard required due to Beagle hound curiosity. Family committed to daily walks and mental stimulation.',
      'Seattle, WA Metro Area',
      adminId
    ]
  );
  const barnabyListingId = l1.insertId;

  // Listing 2: Cleo (Pending Approval) - In Admin Moderation Queue!
  // Let's create Pet 4: Cleo for another user
  const cleoPublicId = 'cleo-pass-x1y2z3a4';
  const cleoQr = await QRCode.toDataURL(`http://localhost:${process.env.PORT || 3000}/passport-view.html?id=${cleoPublicId}`);
  const [p4] = await dbConn.query(
    `INSERT INTO pets (user_id, public_id, name, species, breed, dob_or_age, sex, color_marks, microchip_number, weight, blood_group, is_sterilized, dietary_requirements, allergies, medical_conditions, current_medications, special_care, notes, photo_url)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      ownerId,
      cleoPublicId,
      'Cleo',
      'Cat',
      'Siamese',
      '10 months',
      'Female',
      'Seal point markings on cream body, brilliant blue almond eyes',
      '985141009988776',
      3.2,
      'Type A',
      true,
      'High protein kitten/young adult pate',
      'None',
      'Healthy',
      'None',
      'Vocal and affectionate companion',
      'Looking for gentle indoor home.',
      '/assets/images/cat-cleo.jpg'
    ]
  );
  const cleoId = p4.insertId;

  await dbConn.query(
    `INSERT INTO passports (pet_id, is_public_enabled, show_photo, show_name, show_breed, show_emergency_contact, emergency_contact_name, emergency_contact_phone, emergency_notes, show_medical_alerts, show_allergies, show_vaccinations, qr_code_url)
     VALUES (?, true, true, true, true, false, NULL, NULL, 'Adoption pending review', true, true, true, ?)`,
    [cleoId, cleoQr]
  );

  const [l2] = await dbConn.query(
    `INSERT INTO adoption_listings (pet_id, user_id, title, description, temperament, health_summary, adoption_requirements, general_location, status)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'pending_approval')`,
    [
      cleoId,
      ownerId,
      'Gentle Young Siamese "Cleo" - Sweet Vocal Companion',
      'Cleo is a loving 10-month-old Siamese cat who loves gentle cuddles, interactive feather wands, and curling up in sunny spots. Very communicative and bonded with people.',
      'Sweet, vocal, curious, calm indoor disposition.',
      'Spayed, microchipped, core vaccines completed.',
      'Indoor-only household. Quiet environment preferred.',
      'Bellevue, WA'
    ]
  );
  const cleoListingId = l2.insertId;

  // Listing 3: Another Pet (Status: Changes Requested)
  const [p5] = await dbConn.query(
    `INSERT INTO pets (user_id, public_id, name, species, breed, dob_or_age, sex, color_marks, microchip_number, weight, blood_group, is_sterilized, dietary_requirements, allergies, medical_conditions, current_medications, special_care, notes, photo_url)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      ownerId,
      'rocky-pass-99887766',
      'Rocky',
      'Dog',
      'Boxer Mix',
      '4 years',
      'Male',
      'Brindle coat with white chest bib',
      '985141001122334',
      29.0,
      'DEA 1.1 Negative',
      true,
      'Adult canine kibble',
      'None',
      'Healthy',
      'None',
      'Needs experienced dog handler',
      'Needs rehoming due to owner travel schedule.',
      '/assets/images/dog-rocky.jpg'
    ]
  );
  const rockyId = p5.insertId;

  const [l3] = await dbConn.query(
    `INSERT INTO adoption_listings (pet_id, user_id, title, description, temperament, health_summary, adoption_requirements, general_location, status, moderation_notes)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'changes_requested', 'Please add more specific details regarding compatibility with other dogs and clarify vaccination dates before public listing.')`,
    [
      rockyId,
      ownerId,
      'Energetic Boxer Mix "Rocky" Seeking Experienced Handler',
      'Rocky is a friendly and strong 4-year-old Boxer mix who loves games of fetch and active running.',
      'High energy, loyal, eager to please.',
      'Vaccinated and neutered.',
      'Experienced adult household.',
      'Tacoma, WA'
    ]
  );

  // Step 10: Seed Adoption Enquiries & Applications for Barnaby
  console.log('[Migration] Seeding adoption enquiries and applications...');
  await dbConn.query(
    `INSERT INTO adoption_enquiries (listing_id, user_id, inquirer_name, inquirer_email, inquirer_phone, message, household_info, status)
     VALUES (?, ?, ?, ?, ?, ?, ?, 'new')`,
    [
      barnabyListingId,
      adopterId,
      'Marcus Vance',
      'mark@example.com',
      '+1 (555) 876-5432',
      'Hello Sarah! We fell in love with Barnaby\'s profile. We have a large fenced yard in suburban Seattle and are working from home full-time. We would love to meet Barnaby!',
      'Single family home with 0.5-acre securely fenced yard. No other pets currently.',
    ]
  );

  await dbConn.query(
    `INSERT INTO adoption_applications (listing_id, applicant_id, household_type, owns_other_pets, has_yard, experience_description, reference_contact, notes, status)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'submitted')`,
    [
      barnabyListingId,
      adopterId,
      'Single Family House with Fenced Yard',
      false,
      true,
      'Grew up with Beagles and Labradors. Experienced with positive reinforcement training and crate training.',
      'Dr. Robert Smith (Family Veterinarian), +1 (555) 998-1122',
      'Flexible schedule for home visit and meet-and-greet.'
    ]
  );

  // Seed Favourite for Marcus
  await dbConn.query(
    `INSERT INTO favourites (user_id, listing_id) VALUES (?, ?)`,
    [adopterId, barnabyListingId]
  );

  // Step 11: Seed Lost & Found Reports
  console.log('[Migration] Seeding Lost & Found reports...');
  const [lf1] = await dbConn.query(
    `INSERT INTO lost_found_reports (user_id, report_type, pet_name, species, breed, color_markings, date_lost_or_found, general_location, description, photo_url, contact_name, contact_phone, contact_email, status)
     VALUES (?, 'lost', 'Daisy', 'Dog', 'Corgi', 'Red and white coat, stub tail, wearing red collar with silver bell', DATE_SUB(CURDATE(), INTERVAL 2 DAY), 'Green Lake Park, Seattle, WA', 'Daisy slipped her leash near the east bathhouse around 4:30 PM. Very friendly but easily startled by bicycles.', '/assets/images/lost-corgi.jpg', 'Jennifer Miller', '+1 (555) 345-6789', 'jennifer@example.com', 'published')`,
    [ownerId]
  );
  const daisyReportId = lf1.insertId;

  await dbConn.query(
    `INSERT INTO lost_found_sightings (report_id, reporter_name, reporter_contact, sighting_date, location, notes)
     VALUES (?, 'David K.', '+1 (555) 777-8899', NOW(), 'Near Green Lake Community Center', 'Saw a small reddish corgi near the tennis courts walking towards the playground.')`,
    [daisyReportId]
  );

  await dbConn.query(
    `INSERT INTO lost_found_reports (user_id, report_type, pet_name, species, breed, color_markings, date_lost_or_found, general_location, description, photo_url, contact_name, contact_phone, contact_email, status)
     VALUES (NULL, 'found', 'Unknown', 'Cat', 'Domestic Tabby', 'Brown mackerel tabby with white socks on all four paws', DATE_SUB(CURDATE(), INTERVAL 1 DAY), 'Northgate Way & 1st Ave, Seattle, WA', 'Found a friendly young cat resting on our porch. No collar found. Brought to warmth and provided food.', '/assets/images/found-tabby.jpg', 'Alex Rivera', '+1 (555) 432-1098', 'alex@example.com', 'published')`
  );

  // Step 12: Seed Clinics Directory
  console.log('[Migration] Seeding verified veterinary clinics directory...');
  await dbConn.query(
    `INSERT INTO clinics (name, phone, email, address, city, website, hours, services, is_verified)
     VALUES 
     ('Oakridge Animal Hospital', '+1 (555) 443-8800', 'care@oakridgevet.com', '1240 Oakridge Blvd', 'Seattle, WA', 'https://oakridgevet.example.com', 'Mon-Fri: 8am-7pm, Sat: 9am-4pm', 'General Medicine, Vaccinations, Surgery, Dental Care, Microchipping', true),
     ('Metro Veterinary Center & Emergency', '+1 (555) 991-3344', 'emergency@metrovet.example.com', '800 Westlake Ave N', 'Seattle, WA', 'https://metrovet.example.com', 'Open 24/7 for Emergencies', '24/7 Emergency Care, Intensive Care, Diagnostic Imaging, Surgery', true),
     ('Sunset Pet Care Clinic', '+1 (555) 332-1100', 'info@sunsetpetcare.example.com', '450 Sunset Highway', 'Bellevue, WA', 'https://sunsetpetcare.example.com', 'Mon-Sat: 8:30am-6pm', 'Wellness Exams, Preventative Care, Vaccinations, Senior Pet Care', true)`
  );

  // Step 13: Seed Complaints & Reports (For Admin Dashboard)
  console.log('[Migration] Seeding reports and complaints...');
  await dbConn.query(
    `INSERT INTO reports_and_complaints (user_id, category, target_id, reporter_email, subject, details, status, admin_notes)
     VALUES 
     (?, 'scam_misleading', ?, 'concerned_citizen@example.com', 'Suspicious third-party seller copycat', ?, 'open', 'Assigned to investigation queue.'),
     (?, 'lost_found', ?, 'park_ranger@example.com', 'Duplicate sighting update verification', ?, 'under_review', 'Verified with ranger; sighting confirmed.')`,
    [
      adopterId,
      barnabyListingId,
      'Observed an external social media post copying pictures from adoption listing. Please review and verify owner ownership.',
      ownerId,
      daisyReportId,
      'Follow up on Green Lake sighting report to ensure accuracy.'
    ]
  );

  // Step 14: Seed Notifications
  console.log('[Migration] Seeding user notifications...');
  await dbConn.query(
    `INSERT INTO notifications (user_id, title, message, type, is_read, link)
     VALUES 
     (?, 'Overdue Vaccination Alert', 'Luna has an overdue DHPP vaccination based on your entered date (2026-10-01). Please consult your veterinary clinic.', 'reminder', false, '/owner/vaccinations.html'),
     (?, 'Upcoming Appointment Reminder', 'Reminder: Luna has an upcoming appointment at Oakridge Animal Hospital in 3 days.', 'reminder', false, '/owner/appointments.html'),
     (?, 'New Adoption Enquiry Received', 'Marcus Vance submitted an enquiry regarding Barnaby.', 'enquiry', false, '/owner/rehoming.html'),
     (?, 'Adoption Application Submitted', 'Your adoption application for Barnaby has been submitted and is currently with the owner.', 'application', false, '/adopter/applications.html')`,
    [ownerId, ownerId, ownerId, adopterId]
  );

  // Step 15: Seed Reminders Monitoring Log (Admin View)
  console.log('[Migration] Seeding reminders log for administrator oversight...');
  await dbConn.query(
    `INSERT INTO reminders_log (type, reference_id, recipient_email, status, error_message, retry_count)
     VALUES 
     ('vaccination', 1, 'sarah@example.com', 'delivered', NULL, 0),
     ('appointment', 1, 'sarah@example.com', 'accepted_by_provider', NULL, 0),
     ('email_notification', 1, 'sarah@example.com', 'delivered', NULL, 0),
     ('vaccination', 2, 'user_bounced@domain-invalid.org', 'failed', 'SMTP 550: Mailbox does not exist or domain lookup timeout.', 2)`
  );

  // Step 16: Seed Audit Logs (Admin View)
  console.log('[Migration] Seeding audit logs...');
  await dbConn.query(
    `INSERT INTO audit_logs (admin_id, admin_name, action_type, target_entity, target_id, reason, details, ip_address)
     VALUES 
     (?, ?, 'APPROVE_ADOPTION_LISTING', 'adoption_listings', ?, 'Verified listing details and confirmed owner authorization', 'Listing status updated from pending_approval to approved', '127.0.0.1'),
     (?, ?, 'REQUEST_LISTING_CHANGES', 'adoption_listings', ?, 'Missing behavioral specifics with other animals', 'Status updated to changes_requested with feedback note provided to owner', '127.0.0.1')`,
    [adminId, adminName, barnabyListingId, adminId, adminName, 3]
  );

  await dbConn.end();
  console.log('================================================================');
  console.log(' Migration & Seeding completed successfully!');
  console.log(` Admin account: ${adminEmail} / ${adminPass}`);
  console.log(` Owner account: sarah@example.com / ${ownerPass}`);
  console.log(` Adopter account: mark@example.com / ${adopterPass}`);
  console.log('================================================================');
}

migrate().catch(err => {
  console.error('[Migration ERROR]:', err);
  process.exit(1);
});
