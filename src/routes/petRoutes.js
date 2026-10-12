/**
 * Pet Profile Management Routes (Pet Owner Dashboard)
 */
const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const QRCode = require('qrcode');
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

    // Generate QR Code linking to public passport page
    const passportUrl = `http://localhost:${process.env.PORT || 3000}/passport-view.html?id=${publicId}`;
    const qrDataUrl = await QRCode.toDataURL(passportUrl, {
      errorCorrectionLevel: 'H',
      margin: 2,
      width: 320
    });

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

module.exports = router;
