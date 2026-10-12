/**
 * Appointment Management Routes (Pet Owner Dashboard)
 */
const express = require('express');
const router = express.Router();
const { query } = require('../config/db');
const { requireAuth } = require('../middleware/auth');

// 1. List user's appointments
router.get('/', requireAuth, async (req, res) => {
  try {
    const userId = req.session.user.id;
    const { status, petId } = req.query;

    let sql = `
      SELECT a.*, p.name as pet_name, p.species, p.photo_url as pet_photo
      FROM appointments a
      JOIN pets p ON a.pet_id = p.id
      WHERE a.user_id = ?
    `;
    const params = [userId];

    if (status) {
      sql += ' AND a.status = ?';
      params.push(status);
    }
    if (petId) {
      sql += ' AND a.pet_id = ?';
      params.push(petId);
    }

    sql += ' ORDER BY a.appointment_date ASC';

    const [appointments] = await query(sql, params);

    res.json({
      success: true,
      appointments,
      disclaimer: 'Note: These records are maintained by the pet owner for personal scheduling and organization. They do not constitute official clinic confirmations unless verified directly with the clinic.'
    });
  } catch (error) {
    console.error('[AppointmentRoutes] List error:', error);
    res.status(500).json({ success: false, error: 'Failed to retrieve appointments.' });
  }
});

// 2. Add an appointment record
router.post('/', requireAuth, async (req, res) => {
  try {
    const userId = req.session.user.id;
    const {
      pet_id,
      clinic_name,
      veterinarian_name,
      appointment_date,
      purpose,
      notes,
      follow_up_notes
    } = req.body;

    if (!pet_id || !clinic_name || !appointment_date || !purpose) {
      return res.status(400).json({ success: false, error: 'Pet, clinic name, date, and purpose are required.' });
    }

    // Verify pet ownership
    const [pets] = await query('SELECT id, name FROM pets WHERE id = ? AND user_id = ?', [pet_id, userId]);
    if (pets.length === 0) {
      return res.status(404).json({ success: false, error: 'Pet not found or unauthorized.' });
    }

    const [result] = await query(
      `INSERT INTO appointments (
        pet_id, user_id, clinic_name, veterinarian_name,
        appointment_date, purpose, status, notes, follow_up_notes
      ) VALUES (?, ?, ?, ?, ?, ?, 'upcoming', ?, ?)`,
      [
        pet_id,
        userId,
        clinic_name.trim(),
        veterinarian_name ? veterinarian_name.trim() : null,
        appointment_date,
        purpose.trim(),
        notes ? notes.trim() : null,
        follow_up_notes ? follow_up_notes.trim() : null
      ]
    );

    res.status(201).json({
      success: true,
      message: 'Appointment record scheduled.',
      appointment_id: result.insertId
    });
  } catch (error) {
    console.error('[AppointmentRoutes] Add error:', error);
    res.status(500).json({ success: false, error: 'Failed to schedule appointment.' });
  }
});

// 3. Update / Reschedule / Complete / Cancel appointment
router.put('/:id', requireAuth, async (req, res) => {
  try {
    const id = req.params.id;
    const userId = req.session.user.id;

    // Verify ownership
    const [existing] = await query('SELECT * FROM appointments WHERE id = ? AND user_id = ?', [id, userId]);
    if (existing.length === 0) {
      return res.status(404).json({ success: false, error: 'Appointment not found or unauthorized.' });
    }

    const {
      clinic_name,
      veterinarian_name,
      appointment_date,
      purpose,
      status,
      notes,
      follow_up_notes
    } = req.body;

    await query(
      `UPDATE appointments SET
        clinic_name = ?, veterinarian_name = ?, appointment_date = ?,
        purpose = ?, status = ?, notes = ?, follow_up_notes = ?
       WHERE id = ? AND user_id = ?`,
      [
        clinic_name ? clinic_name.trim() : existing[0].clinic_name,
        veterinarian_name ? veterinarian_name.trim() : null,
        appointment_date || existing[0].appointment_date,
        purpose ? purpose.trim() : existing[0].purpose,
        status || existing[0].status,
        notes ? notes.trim() : null,
        follow_up_notes ? follow_up_notes.trim() : null,
        id,
        userId
      ]
    );

    res.json({ success: true, message: 'Appointment updated successfully.' });
  } catch (error) {
    console.error('[AppointmentRoutes] Update error:', error);
    res.status(500).json({ success: false, error: 'Failed to update appointment.' });
  }
});

// 4. Delete appointment
router.delete('/:id', requireAuth, async (req, res) => {
  try {
    const id = req.params.id;
    const userId = req.session.user.id;

    const [result] = await query('DELETE FROM appointments WHERE id = ? AND user_id = ?', [id, userId]);
    if (result.affectedRows === 0) {
      return res.status(404).json({ success: false, error: 'Appointment not found or unauthorized.' });
    }

    res.json({ success: true, message: 'Appointment record deleted.' });
  } catch (error) {
    console.error('[AppointmentRoutes] Delete error:', error);
    res.status(500).json({ success: false, error: 'Failed to delete appointment.' });
  }
});

module.exports = router;
