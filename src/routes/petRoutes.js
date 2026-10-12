/**
 * Pet Profile Management Routes (Pet Owner Dashboard)
 */
const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const QRCode = require('qrcode');
const { generatePassportQr } = require('../utils/urlHelper');
const { query } = require('../config/db');
const { requireAuth } = require('../middleware/auth');
const upload = require('../middleware/upload');

// 1. List authenticated user's active pets
router.get('/', requireAuth, async (req, res) => {
  try {
    const userId = req.session.user.id;
    const [pets] = await query(
      `SELECT p.*, pass.is_public_enabled, pass.qr_code_url
       FROM pets p
       LEFT JOIN passports pass ON pass.pet_id = p.id
       WHERE p.user_id = ? AND p.is_archived = false
       ORDER BY p.created_at DESC`,
      [userId]
    );

    res.json({ success: true, pets });
  } catch (error) {
    console.error('[PetRoutes] List pets error:', error);
    res.status(500).json({ success: false, error: 'Failed to retrieve pet records.' });
  }
});

// 2. Add a new pet
router.post('/', requireAuth, upload.single('photo'), async (req, res) => {
  try {
    const userId = req.session.user.id;
    const {
      name,
      species,
      breed,
      dob_or_age,
      sex,
      color_marks,
      microchip_number,
      weight,
      blood_group,
      is_sterilized,
      dietary_requirements,
      allergies,
      medical_conditions,
      current_medications,
      special_care,
      notes
    } = req.body;

    if (!name || !species) {
      return res.status(400).json({ success: false, error: 'Pet name and species are required.' });
    }

    const publicId = `${name.toLowerCase().replace(/[^a-z0-9]/g, '')}-${crypto.randomBytes(6).toString('hex')}`;
    const photoUrl = req.file ? `/uploads/${req.file.filename}` : '/assets/images/default-pet.jpg';

    const [petResult] = await query(
      `INSERT INTO pets (
        user_id, public_id, name, species, breed, dob_or_age, sex, color_marks,
        microchip_number, weight, blood_group, is_sterilized, dietary_requirements,
        allergies, medical_conditions, current_medications, special_care, notes, photo_url
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        userId,
        publicId,
        name.trim(),
        species.trim(),
        breed ? breed.trim() : null,
        dob_or_age ? dob_or_age.trim() : null,
        sex || 'Unknown',
        color_marks ? color_marks.trim() : null,
        microchip_number ? microchip_number.trim() : null,
        weight ? parseFloat(weight) : null,
        blood_group ? blood_group.trim() : null,
        is_sterilized === 'true' || is_sterilized === true,
        dietary_requirements ? dietary_requirements.trim() : null,
        allergies ? allergies.trim() : null,
        medical_conditions ? medical_conditions.trim() : null,
        current_medications ? current_medications.trim() : null,
        special_care ? special_care.trim() : null,
        notes ? notes.trim() : null,
        photoUrl
      ]
    );

    const petId = petResult.insertId;

    // Generate QR Code linking to public passport page using validated PUBLIC_BASE_URL
    const { qrDataUrl } = await generatePassportQr(publicId);

    // Create Digital Passport
    await query(
      `INSERT INTO passports (
        pet_id, is_public_enabled, show_photo, show_name, show_breed,
        show_emergency_contact, emergency_contact_name, emergency_contact_phone,
        emergency_notes, show_medical_alerts, show_allergies, show_vaccinations, qr_code_url
      ) VALUES (?, true, true, true, true, true, ?, ?, ?, true, true, true, ?)`,
      [
        petId,
        req.session.user.full_name,
        req.session.user.phone,
        `Emergency contact for ${name}. Please contact owner immediately if found.`,
        qrDataUrl
      ]
    );

    // Add in-app notification
    await query(
      `INSERT INTO notifications (user_id, title, message, type, link)
       VALUES (?, 'Pet Profile Created', 'Digital Passport & Profile created for ${name}.', 'system', '/owner/pets.html')`,
      [userId]
    );

    res.status(201).json({
      success: true,
      message: `Pet "${name}" registered with Digital Passport!`,
      pet: {
        id: petId,
        public_id: publicId,
        name,
        species,
        photo_url: photoUrl
      }
    });
  } catch (error) {
    console.error('[PetRoutes] Add pet error:', error);
    res.status(500).json({ success: false, error: 'Failed to create pet profile.' });
  }
});

// 3. Get single pet profile (Ownership strictly verified!)
router.get('/:id', requireAuth, async (req, res) => {
  try {
    const petId = req.params.id;
    const userId = req.session.user.id;

    const [pets] = await query(
      `SELECT p.*, pass.is_public_enabled, pass.qr_code_url,
              pass.show_emergency_contact, pass.emergency_contact_name, pass.emergency_contact_phone, pass.emergency_notes,
              pass.show_medical_alerts, pass.show_allergies, pass.show_vaccinations
       FROM pets p
       LEFT JOIN passports pass ON pass.pet_id = p.id
       WHERE p.id = ? AND p.user_id = ?`,
      [petId, userId]
    );

    if (pets.length === 0) {
      return res.status(404).json({ success: false, error: 'Pet profile not found or unauthorized.' });
    }

    res.json({ success: true, pet: pets[0] });
  } catch (error) {
    console.error('[PetRoutes] Get pet error:', error);
    res.status(500).json({ success: false, error: 'Failed to retrieve pet profile.' });
  }
});

// 4. Update pet profile (Ownership verified!)
router.put('/:id', requireAuth, upload.single('photo'), async (req, res) => {
  try {
    const petId = req.params.id;
    const userId = req.session.user.id;

    // Verify ownership
    const [existing] = await query('SELECT id, photo_url FROM pets WHERE id = ? AND user_id = ?', [petId, userId]);
    if (existing.length === 0) {
      return res.status(404).json({ success: false, error: 'Pet not found or unauthorized.' });
    }

    const {
      name,
      species,
      breed,
      dob_or_age,
      sex,
      color_marks,
      microchip_number,
      weight,
      blood_group,
      is_sterilized,
      dietary_requirements,
      allergies,
      medical_conditions,
      current_medications,
      special_care,
      notes
    } = req.body;

    const photoUrl = req.file ? `/uploads/${req.file.filename}` : existing[0].photo_url;

    await query(
      `UPDATE pets SET
        name = ?, species = ?, breed = ?, dob_or_age = ?, sex = ?, color_marks = ?,
        microchip_number = ?, weight = ?, blood_group = ?, is_sterilized = ?,
        dietary_requirements = ?, allergies = ?, medical_conditions = ?,
        current_medications = ?, special_care = ?, notes = ?, photo_url = ?
       WHERE id = ? AND user_id = ?`,
      [
        name ? name.trim() : existing[0].name,
        species ? species.trim() : existing[0].species,
        breed ? breed.trim() : null,
        dob_or_age ? dob_or_age.trim() : null,
        sex || 'Unknown',
        color_marks ? color_marks.trim() : null,
        microchip_number ? microchip_number.trim() : null,
        weight ? parseFloat(weight) : null,
        blood_group ? blood_group.trim() : null,
        is_sterilized === 'true' || is_sterilized === true,
        dietary_requirements ? dietary_requirements.trim() : null,
        allergies ? allergies.trim() : null,
        medical_conditions ? medical_conditions.trim() : null,
        current_medications ? current_medications.trim() : null,
        special_care ? special_care.trim() : null,
        notes ? notes.trim() : null,
        photoUrl,
        petId,
        userId
      ]
    );

    res.json({ success: true, message: 'Pet profile updated successfully.' });
  } catch (error) {
    console.error('[PetRoutes] Update pet error:', error);
    res.status(500).json({ success: false, error: 'Failed to update pet profile.' });
  }
});

// 5. Archive pet (Soft delete)
router.delete('/:id', requireAuth, async (req, res) => {
  try {
    const petId = req.params.id;
    const userId = req.session.user.id;

    const [result] = await query(
      'UPDATE pets SET is_archived = true WHERE id = ? AND user_id = ?',
      [petId, userId]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({ success: false, error: 'Pet not found or unauthorized.' });
    }

    res.json({ success: true, message: 'Pet archived successfully.' });
  } catch (error) {
    console.error('[PetRoutes] Archive pet error:', error);
    res.status(500).json({ success: false, error: 'Failed to archive pet profile.' });
  }
});

// 6. Complete Chronological Health Timeline for Pet
router.get('/:id/timeline', requireAuth, async (req, res) => {
  try {
    const petId = req.params.id;
    const userId = req.session.user.id;

    // Verify ownership
    const [pet] = await query('SELECT id, name FROM pets WHERE id = ? AND user_id = ?', [petId, userId]);
    if (pet.length === 0) {
      return res.status(404).json({ success: false, error: 'Pet not found or unauthorized.' });
    }

    // Health records
    const [health] = await query(
      `SELECT 'health' as event_type, id, record_type as sub_type, title, date as event_date,
              veterinarian_name, clinic_name, description, treatment_plan, follow_up_instructions,
              entry_source, document_url
       FROM health_records
       WHERE pet_id = ?`,
      [petId]
    );

    // Vaccinations
    const [vacc] = await query(
      `SELECT 'vaccination' as event_type, id, 'vaccine' as sub_type, vaccine_name as title,
              administered_date as event_date, NULL as veterinarian_name, clinic_name,
              notes as description, NULL as treatment_plan, NULL as follow_up_instructions,
              entry_source, document_url, next_due_date, batch_number
       FROM vaccinations
       WHERE pet_id = ?`,
      [petId]
    );

    // Combine & Sort in descending order
    const timeline = [...health, ...vacc].sort((a, b) => new Date(b.event_date) - new Date(a.event_date));

    res.json({ success: true, pet: pet[0], timeline });
  } catch (error) {
    console.error('[PetRoutes] Timeline error:', error);
    res.status(500).json({ success: false, error: 'Failed to retrieve timeline.' });
  }
});

// 7. Report Pet Missing (Generates Community Alert & Publishes to Lost & Found)
router.post('/:id/report-missing', requireAuth, async (req, res) => {
  try {
    const petId = req.params.id;
    const userId = req.session.user.id;
    const { date_lost, general_location, description, contact_phone, contact_name } = req.body;

    // Verify ownership
    const [pets] = await query('SELECT * FROM pets WHERE id = ? AND user_id = ?', [petId, userId]);
    if (pets.length === 0) {
      return res.status(404).json({ success: false, error: 'Pet not found or unauthorized.' });
    }

    const pet = pets[0];
    const lostDate = date_lost || new Date().toISOString().split('T')[0];
    const loc = general_location ? general_location.trim() : 'Location not specified';
    const desc = description ? description.trim() : `Companion ${pet.name} is missing. Please contact owner if spotted.`;
    const phone = contact_phone ? contact_phone.trim() : (req.session.user.phone || 'Contact via message');
    const name = contact_name ? contact_name.trim() : req.session.user.full_name;

    const email = req.session.user.email || 'owner@example.com';
    const colorMarks = pet.color_marks || 'Distinctive markings';

    // 1. Mark pet as missing
    await query(
      'UPDATE pets SET is_missing = true, missing_since = ?, missing_notes = ? WHERE id = ?',
      [lostDate, desc, petId]
    );

    // 2. Automatically publish to lost_found_reports
    const [result] = await query(
      `INSERT INTO lost_found_reports (
        user_id, report_type, pet_name, species, breed, color_markings,
        date_lost_or_found, general_location, description, contact_name, contact_phone, contact_email, photo_url, status
      ) VALUES (?, 'lost', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'published')`,
      [
        userId,
        pet.name,
        pet.species,
        pet.breed || null,
        colorMarks,
        lostDate,
        loc,
        desc,
        name,
        phone,
        email,
        pet.photo_url || null
      ]
    );

    // 3. In-app notification
    await query(
      `INSERT INTO notifications (user_id, title, message, type, link)
       VALUES (?, ?, ?, 'system', '/lost-found.html')`,
      [
        userId,
        `🚨 Active Missing Pet Alert: ${pet.name}`,
        `Your missing pet alert for ${pet.name} has been published to the community Lost & Found registry.`
      ]
    );

    res.json({
      success: true,
      message: `🚨 ${pet.name} has been reported as missing. A community alert has been published to Lost & Found!`,
      report_id: result.insertId
    });
  } catch (error) {
    console.error('[PetRoutes] Report missing error:', error);
    res.status(500).json({ success: false, error: 'Failed to report pet as missing.' });
  }
});

// 8. Mark Pet Found / Reunited
router.post('/:id/mark-found', requireAuth, async (req, res) => {
  try {
    const petId = req.params.id;
    const userId = req.session.user.id;

    const [pets] = await query('SELECT * FROM pets WHERE id = ? AND user_id = ?', [petId, userId]);
    if (pets.length === 0) {
      return res.status(404).json({ success: false, error: 'Pet not found or unauthorized.' });
    }

    const pet = pets[0];

    // Mark pet as not missing
    await query('UPDATE pets SET is_missing = false, missing_since = NULL, missing_notes = NULL WHERE id = ?', [petId]);

    // Update any published lost report for this pet to reunited
    await query(
      `UPDATE lost_found_reports SET status = 'reunited' WHERE user_id = ? AND pet_name = ? AND report_type = 'lost' AND status = 'published'`,
      [userId, pet.name]
    );

    await query(
      `INSERT INTO notifications (user_id, title, message, type, link)
       VALUES (?, ?, ?, 'system', '/owner/pets.html')`,
      [
        userId,
        `🎉 ${pet.name} Marked as Reunited!`,
        `Wonderful news! ${pet.name} has been marked as found and reunited safely.`
      ]
    );

    res.json({
      success: true,
      message: `🎉 Great news! ${pet.name} has been marked as safely reunited.`
    });
  } catch (error) {
    console.error('[PetRoutes] Mark found error:', error);
    res.status(500).json({ success: false, error: 'Failed to mark pet as found.' });
  }
});

module.exports = router;
