/**
 * Digital Pet Passport & Public Emergency QR Routes
 */
const express = require('express');
const router = express.Router();
const QRCode = require('qrcode');
const crypto = require('crypto');
const { query } = require('../config/db');
const { requireAuth } = require('../middleware/auth');

// 1. PUBLIC ENDPOINT: Fetch Public Passport Profile
// STRICT PRIVACY PROTECTION: Only owner-approved fields are returned!
router.get('/public/:publicId', async (req, res) => {
  try {
    const publicId = req.params.publicId;

    const [pets] = await query(
      `SELECT p.id as pet_id, p.public_id, p.name, p.species, p.breed, p.dob_or_age, p.sex,
              p.color_marks, p.microchip_number, p.photo_url, p.allergies, p.medical_conditions,
              p.current_medications, p.special_care, p.is_sterilized,
              pass.is_public_enabled, pass.show_photo, pass.show_name, pass.show_breed,
              pass.show_emergency_contact, pass.emergency_contact_name, pass.emergency_contact_phone,
              pass.emergency_notes, pass.show_medical_alerts, pass.show_allergies, pass.show_vaccinations,
              pass.qr_code_url
       FROM pets p
       JOIN passports pass ON pass.pet_id = p.id
       WHERE p.public_id = ? AND p.is_archived = false`,
      [publicId]
    );

    if (pets.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Digital Pet Passport not found.',
        code: 'PASSPORT_NOT_FOUND'
      });
    }

    const row = pets[0];

    // If public passport access is disabled by owner
    if (!row.is_public_enabled) {
      return res.status(403).json({
        success: false,
        error: 'This Digital Pet Passport is currently set to private by its owner.',
        code: 'PASSPORT_PRIVATE'
      });
    }

    // Build strictly sanitized public payload
    const publicData = {
      public_id: row.public_id,
      species: row.species,
      sex: row.sex,
      is_sterilized: row.is_sterilized,
      qr_code_url: row.qr_code_url
    };

    if (row.show_name) publicData.name = row.name;
    if (row.show_photo) publicData.photo_url = row.photo_url;
    if (row.show_breed) publicData.breed = row.breed;
    if (row.color_marks) publicData.color_marks = row.color_marks;
    if (row.microchip_number) publicData.microchip_number = row.microchip_number;

    if (row.show_emergency_contact) {
      publicData.emergency_contact = {
        name: row.emergency_contact_name,
        phone: row.emergency_contact_phone,
        notes: row.emergency_notes
      };
    }

    if (row.show_medical_alerts) {
      publicData.medical_conditions = row.medical_conditions;
      publicData.current_medications = row.current_medications;
      publicData.special_care = row.special_care;
    }

    if (row.show_allergies) {
      publicData.allergies = row.allergies;
    }

    // If vaccinations are approved for public display, fetch core non-confidential vaccine history
    if (row.show_vaccinations) {
      const [vaccinations] = await query(
        `SELECT vaccine_name, administered_date, next_due_date, entry_source
         FROM vaccinations
         WHERE pet_id = ?
         ORDER BY administered_date DESC`,
        [row.pet_id]
      );
      publicData.vaccinations = vaccinations;
    }

    res.json({
      success: true,
      passport: publicData,
      disclaimer: 'This public emergency passport displays only owner-authorized information. Medical records are entered for informational reference and do not replace professional veterinary records.'
    });
  } catch (error) {
    console.error('[PassportRoutes] Public passport error:', error);
    res.status(500).json({ success: false, error: 'Failed to load public passport.' });
  }
});

// 2. Get passport settings & QR code for Pet Owner
router.get('/:petId', requireAuth, async (req, res) => {
  try {
    const petId = req.params.petId;
    const userId = req.session.user.id;

    // Verify pet ownership
    const [pets] = await query('SELECT * FROM pets WHERE id = ? AND user_id = ?', [petId, userId]);
    if (pets.length === 0) {
      return res.status(404).json({ success: false, error: 'Pet not found or unauthorized.' });
    }

    const pet = pets[0];
    let [passports] = await query('SELECT * FROM passports WHERE pet_id = ?', [petId]);

    // If passport doesn't exist yet, create one
    if (passports.length === 0) {
      const passportUrl = `http://localhost:${process.env.PORT || 3000}/passport-view.html?id=${pet.public_id}`;
      const qrDataUrl = await QRCode.toDataURL(passportUrl, { errorCorrectionLevel: 'H', margin: 2, width: 320 });
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
          `Emergency contact for ${pet.name}. Please contact owner immediately if found.`,
          qrDataUrl
        ]
      );
      [passports] = await query('SELECT * FROM passports WHERE pet_id = ?', [petId]);
    }

    res.json({
      success: true,
      pet: {
        id: pet.id,
        name: pet.name,
        species: pet.species,
        breed: pet.breed,
        public_id: pet.public_id,
        photo_url: pet.photo_url,
        microchip_number: pet.microchip_number
      },
      passport: passports[0],
      public_url: `http://localhost:${process.env.PORT || 3000}/passport-view.html?id=${pet.public_id}`
    });
  } catch (error) {
    console.error('[PassportRoutes] Get passport error:', error);
    res.status(500).json({ success: false, error: 'Failed to retrieve passport.' });
  }
});

// 2. Update Passport Visibility Controls (Owner Only)
router.put('/:petId', requireAuth, async (req, res) => {
  try {
    const petId = req.params.petId;
    const userId = req.session.user.id;

    // Verify pet ownership
    const [pets] = await query('SELECT id FROM pets WHERE id = ? AND user_id = ?', [petId, userId]);
    if (pets.length === 0) {
      return res.status(404).json({ success: false, error: 'Pet not found or unauthorized.' });
    }

    const {
      is_public_enabled,
      show_photo,
      show_name,
      show_breed,
      show_emergency_contact,
      emergency_contact_name,
      emergency_contact_phone,
      emergency_notes,
      show_medical_alerts,
      show_allergies,
      show_vaccinations
    } = req.body;

    await query(
      `UPDATE passports SET
        is_public_enabled = ?,
        show_photo = ?,
        show_name = ?,
        show_breed = ?,
        show_emergency_contact = ?,
        emergency_contact_name = ?,
        emergency_contact_phone = ?,
        emergency_notes = ?,
        show_medical_alerts = ?,
        show_allergies = ?,
        show_vaccinations = ?
       WHERE pet_id = ?`,
      [
        is_public_enabled === true || is_public_enabled === 'true',
        show_photo === true || show_photo === 'true',
        show_name === true || show_name === 'true',
        show_breed === true || show_breed === 'true',
        show_emergency_contact === true || show_emergency_contact === 'true',
        emergency_contact_name ? emergency_contact_name.trim() : null,
        emergency_contact_phone ? emergency_contact_phone.trim() : null,
        emergency_notes ? emergency_notes.trim() : null,
        show_medical_alerts === true || show_medical_alerts === 'true',
        show_allergies === true || show_allergies === 'true',
        show_vaccinations === true || show_vaccinations === 'true',
        petId
      ]
    );

    res.json({ success: true, message: 'Digital passport privacy settings updated successfully.' });
  } catch (error) {
    console.error('[PassportRoutes] Update passport error:', error);
    res.status(500).json({ success: false, error: 'Failed to update passport settings.' });
  }
});

// 3. Regenerate Public Passport ID & QR Code
router.post('/:petId/regenerate-qr', requireAuth, async (req, res) => {
  try {
    const petId = req.params.petId;
    const userId = req.session.user.id;

    // Verify ownership
    const [pets] = await query('SELECT id, name FROM pets WHERE id = ? AND user_id = ?', [petId, userId]);
    if (pets.length === 0) {
      return res.status(404).json({ success: false, error: 'Pet not found or unauthorized.' });
    }

    const newPublicId = `${pets[0].name.toLowerCase().replace(/[^a-z0-9]/g, '')}-${crypto.randomBytes(8).toString('hex')}`;
    const newUrl = `http://localhost:${process.env.PORT || 3000}/passport-view.html?id=${newPublicId}`;
    const newQr = await QRCode.toDataURL(newUrl, { errorCorrectionLevel: 'H', margin: 2, width: 320 });

    await query('UPDATE pets SET public_id = ? WHERE id = ?', [newPublicId, petId]);
    await query('UPDATE passports SET qr_code_url = ? WHERE pet_id = ?', [newQr, petId]);

    res.json({
      success: true,
      message: 'Passport identifier and QR code regenerated! Old links are now invalidated.',
      public_id: newPublicId,
      qr_code_url: newQr,
      public_url: newUrl
    });
  } catch (error) {
    console.error('[PassportRoutes] Regenerate QR error:', error);
    res.status(500).json({ success: false, error: 'Failed to regenerate QR code.' });
  }
});

module.exports = router;
