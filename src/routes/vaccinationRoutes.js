/**
 * Vaccination Management Routes (Pet Owner Dashboard)
 */
const express = require('express');
const router = express.Router();
const { query } = require('../config/db');
const { requireAuth } = require('../middleware/auth');
const upload = require('../middleware/upload');

// Helper to compute clinical status from dates
function calculateVaccineStatus(nextDueDate) {
  if (!nextDueDate) {
    return {
      code: 'UNKNOWN',
      label: 'Unknown (No Due Date Entered)',
      badgeClass: 'badge-unknown'
    };
  }

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const due = new Date(nextDueDate);
  due.setHours(0, 0, 0, 0);

  const diffDays = Math.ceil((due - today) / (1000 * 60 * 60 * 24));

  if (diffDays < 0) {
    return {
      code: 'OVERDUE',
      label: `Overdue by ${Math.abs(diffDays)} day${Math.abs(diffDays) === 1 ? '' : 's'}`,
      badgeClass: 'badge-overdue',
      diffDays
    };
  } else if (diffDays <= 30) {
    return {
      code: 'DUE_SOON',
      label: `Due Soon (in ${diffDays} day${diffDays === 1 ? '' : 's'})`,
      badgeClass: 'badge-due-soon',
      diffDays
    };
  } else {
    return {
      code: 'UP_TO_DATE',
      label: 'Up to Date According to Entered Dates',
      badgeClass: 'badge-up-to-date',
      diffDays
    };
  }
}

// 1. Get all vaccinations for a pet or across all pets for user
router.get('/', requireAuth, async (req, res) => {
  try {
    const userId = req.session.user.id;
    const petId = req.query.petId;

    let sql = `
      SELECT v.*, p.name as pet_name, p.species, p.photo_url as pet_photo
      FROM vaccinations v
      JOIN pets p ON v.pet_id = p.id
      WHERE p.user_id = ? AND p.is_archived = false
    `;
    const params = [userId];

    if (petId) {
      sql += ' AND v.pet_id = ?';
      params.push(petId);
    }

    sql += ' ORDER BY v.administered_date DESC';

    const [rows] = await query(sql, params);

    const vaccinations = rows.map(v => ({
      ...v,
      status: calculateVaccineStatus(v.next_due_date)
    }));

    res.json({
      success: true,
      vaccinations,
      disclaimer: 'Vaccine statuses are calculated solely from entered dates for organizational tracking. They do not substitute for professional veterinary advice or legal rabies certification.'
    });
  } catch (error) {
    console.error('[VaccinationRoutes] List error:', error);
    res.status(500).json({ success: false, error: 'Failed to retrieve vaccination records.' });
  }
});

// 2. Add vaccination record
router.post('/:petId', requireAuth, upload.single('document'), async (req, res) => {
  try {
    const petId = req.params.petId;
    const userId = req.session.user.id;

    // Verify ownership
    const [pets] = await query('SELECT id, name FROM pets WHERE id = ? AND user_id = ?', [petId, userId]);
    if (pets.length === 0) {
      return res.status(404).json({ success: false, error: 'Pet not found or unauthorized.' });
    }

    const {
      vaccine_name,
      administered_date,
      next_due_date,
      clinic_name,
      batch_number,
      entry_source,
      notes
    } = req.body;

    if (!vaccine_name || !administered_date) {
      return res.status(400).json({ success: false, error: 'Vaccine name and administration date are required.' });
    }

    const documentUrl = req.file ? `/uploads/${req.file.filename}` : null;
    const verifiedSource = (entry_source === 'clinic_verified') ? 'clinic_verified' : 'owner_entered';

    const [result] = await query(
      `INSERT INTO vaccinations (
        pet_id, vaccine_name, administered_date, next_due_date,
        clinic_name, batch_number, document_url, entry_source, notes
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        petId,
        vaccine_name.trim(),
        administered_date,
        next_due_date || null,
        clinic_name ? clinic_name.trim() : null,
        batch_number ? batch_number.trim() : null,
        documentUrl,
        verifiedSource,
        notes ? notes.trim() : null
      ]
    );

    res.status(201).json({
      success: true,
      message: 'Vaccination record saved.',
      vaccination_id: result.insertId
    });
  } catch (error) {
    console.error('[VaccinationRoutes] Add error:', error);
    res.status(500).json({ success: false, error: 'Failed to record vaccination.' });
  }
});

// 3. Update vaccination record
router.put('/:id', requireAuth, upload.single('document'), async (req, res) => {
  try {
    const id = req.params.id;
    const userId = req.session.user.id;

    // Verify ownership
    const [existing] = await query(
      `SELECT v.* FROM vaccinations v
       JOIN pets p ON v.pet_id = p.id
       WHERE v.id = ? AND p.user_id = ?`,
      [id, userId]
    );

    if (existing.length === 0) {
      return res.status(404).json({ success: false, error: 'Vaccination record not found or unauthorized.' });
    }

    const {
      vaccine_name,
      administered_date,
      next_due_date,
      clinic_name,
      batch_number,
      notes
    } = req.body;

    const documentUrl = req.file ? `/uploads/${req.file.filename}` : existing[0].document_url;

    await query(
      `UPDATE vaccinations SET
        vaccine_name = ?, administered_date = ?, next_due_date = ?,
        clinic_name = ?, batch_number = ?, document_url = ?, notes = ?
       WHERE id = ?`,
      [
        vaccine_name ? vaccine_name.trim() : existing[0].vaccine_name,
        administered_date || existing[0].administered_date,
        next_due_date || null,
        clinic_name ? clinic_name.trim() : null,
        batch_number ? batch_number.trim() : null,
        documentUrl,
        notes ? notes.trim() : null,
        id
      ]
    );

    res.json({ success: true, message: 'Vaccination record updated successfully.' });
  } catch (error) {
    console.error('[VaccinationRoutes] Update error:', error);
    res.status(500).json({ success: false, error: 'Failed to update vaccination.' });
  }
});

// 4. Delete vaccination record
router.delete('/:id', requireAuth, async (req, res) => {
  try {
    const id = req.params.id;
    const userId = req.session.user.id;

    const [result] = await query(
      `DELETE v FROM vaccinations v
       JOIN pets p ON v.pet_id = p.id
       WHERE v.id = ? AND p.user_id = ?`,
      [id, userId]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({ success: false, error: 'Record not found or unauthorized.' });
    }

    res.json({ success: true, message: 'Vaccination record deleted.' });
  } catch (error) {
    console.error('[VaccinationRoutes] Delete error:', error);
    res.status(500).json({ success: false, error: 'Failed to delete record.' });
  }
});

module.exports = router;
