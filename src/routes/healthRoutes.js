/**
 * Health Records & Medical Vault Routes (Pet Owner Dashboard)
 */
const express = require('express');
const router = express.Router();
const path = require('path');
const { query } = require('../config/db');
const { requireAuth } = require('../middleware/auth');
const upload = require('../middleware/upload');

// 1. Get health records for a pet (Ownership checked)
router.get('/:petId', requireAuth, async (req, res) => {
  try {
    const petId = req.params.petId;
    const userId = req.session.user.id;

    // Verify ownership
    const [pets] = await query('SELECT id, name FROM pets WHERE id = ? AND user_id = ?', [petId, userId]);
    if (pets.length === 0) {
      return res.status(404).json({ success: false, error: 'Pet not found or unauthorized.' });
    }

    const [records] = await query(
      `SELECT * FROM health_records
       WHERE pet_id = ?
       ORDER BY date DESC, created_at DESC`,
      [petId]
    );

    res.json({
      success: true,
      pet: pets[0],
      records,
      disclaimer: 'Owner-entered health entries are self-reported records for reference and do not constitute independent veterinary diagnosis.'
    });
  } catch (error) {
    console.error('[HealthRoutes] Get records error:', error);
    res.status(500).json({ success: false, error: 'Failed to retrieve health records.' });
  }
});

// 2. Add a new health record
router.post('/:petId', requireAuth, upload.single('document'), async (req, res) => {
  try {
    const petId = req.params.petId;
    const userId = req.session.user.id;

    // Verify pet ownership
    const [pets] = await query('SELECT id, name FROM pets WHERE id = ? AND user_id = ?', [petId, userId]);
    if (pets.length === 0) {
      return res.status(404).json({ success: false, error: 'Pet not found or unauthorized.' });
    }

    const {
      record_type,
      title,
      date,
      veterinarian_name,
      clinic_name,
      description,
      treatment_plan,
      follow_up_instructions,
      entry_source
    } = req.body;

    if (!record_type || !title || !date) {
      return res.status(400).json({ success: false, error: 'Record type, title, and date are required.' });
    }

    // Default to owner_entered unless clinic verification procedure is established
    const verifiedSource = (entry_source === 'clinic_verified') ? 'clinic_verified' : 'owner_entered';

    const documentUrl = req.file ? `/uploads/${req.file.filename}` : null;
    const documentName = req.file ? req.file.originalname : null;

    const [result] = await query(
      `INSERT INTO health_records (
        pet_id, record_type, title, date, veterinarian_name, clinic_name,
        description, treatment_plan, follow_up_instructions, entry_source,
        document_url, document_name
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        petId,
        record_type,
        title.trim(),
        date,
        veterinarian_name ? veterinarian_name.trim() : null,
        clinic_name ? clinic_name.trim() : null,
        description ? description.trim() : null,
        treatment_plan ? treatment_plan.trim() : null,
        follow_up_instructions ? follow_up_instructions.trim() : null,
        verifiedSource,
        documentUrl,
        documentName
      ]
    );

    res.status(201).json({
      success: true,
      message: 'Health record added successfully.',
      record_id: result.insertId
    });
  } catch (error) {
    console.error('[HealthRoutes] Add record error:', error);
    res.status(500).json({ success: false, error: 'Failed to add health record.' });
  }
});

// 3. Update an existing health record (Ownership verified via pet ownership)
router.put('/record/:recordId', requireAuth, upload.single('document'), async (req, res) => {
  try {
    const recordId = req.params.recordId;
    const userId = req.session.user.id;

    // Verify ownership via join
    const [existing] = await query(
      `SELECT hr.* FROM health_records hr
       JOIN pets p ON hr.pet_id = p.id
       WHERE hr.id = ? AND p.user_id = ?`,
      [recordId, userId]
    );

    if (existing.length === 0) {
      return res.status(404).json({ success: false, error: 'Health record not found or unauthorized.' });
    }

    const {
      record_type,
      title,
      date,
      veterinarian_name,
      clinic_name,
      description,
      treatment_plan,
      follow_up_instructions
    } = req.body;

    const documentUrl = req.file ? `/uploads/${req.file.filename}` : existing[0].document_url;
    const documentName = req.file ? req.file.originalname : existing[0].document_name;

    await query(
      `UPDATE health_records SET
        record_type = ?, title = ?, date = ?, veterinarian_name = ?,
        clinic_name = ?, description = ?, treatment_plan = ?,
        follow_up_instructions = ?, document_url = ?, document_name = ?
       WHERE id = ?`,
      [
        record_type || existing[0].record_type,
        title ? title.trim() : existing[0].title,
        date || existing[0].date,
        veterinarian_name ? veterinarian_name.trim() : null,
        clinic_name ? clinic_name.trim() : null,
        description ? description.trim() : null,
        treatment_plan ? treatment_plan.trim() : null,
        follow_up_instructions ? follow_up_instructions.trim() : null,
        documentUrl,
        documentName,
        recordId
      ]
    );

    res.json({ success: true, message: 'Health record updated successfully.' });
  } catch (error) {
    console.error('[HealthRoutes] Update record error:', error);
    res.status(500).json({ success: false, error: 'Failed to update health record.' });
  }
});

// 4. Delete health record (Ownership verified)
router.delete('/record/:recordId', requireAuth, async (req, res) => {
  try {
    const recordId = req.params.recordId;
    const userId = req.session.user.id;

    const [result] = await query(
      `DELETE hr FROM health_records hr
       JOIN pets p ON hr.pet_id = p.id
       WHERE hr.id = ? AND p.user_id = ?`,
      [recordId, userId]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({ success: false, error: 'Health record not found or unauthorized.' });
    }

    res.json({ success: true, message: 'Health record removed.' });
  } catch (error) {
    console.error('[HealthRoutes] Delete record error:', error);
    res.status(500).json({ success: false, error: 'Failed to delete health record.' });
  }
});

module.exports = router;
