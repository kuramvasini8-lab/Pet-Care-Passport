/**
 * Daily Care & Medication Management Routes (Pet Owner Dashboard)
 */
const express = require('express');
const router = express.Router();
const { query } = require('../config/db');
const { requireAuth } = require('../middleware/auth');

// 1. Get daily care tasks (all pets for user or filtered by pet)
router.get('/', requireAuth, async (req, res) => {
  try {
    const userId = req.session.user.id;
    const petId = req.query.petId;

    let sql = `
      SELECT t.*, p.name as pet_name, p.species, p.photo_url as pet_photo
      FROM daily_care_tasks t
      JOIN pets p ON t.pet_id = p.id
      WHERE p.user_id = ? AND p.is_archived = false
    `;
    const params = [userId];

    if (petId) {
      sql += ' AND t.pet_id = ?';
      params.push(petId);
    }

    sql += ' ORDER BY t.is_completed ASC, t.due_time ASC, t.created_at DESC';

    const [tasks] = await query(sql, params);

    res.json({
      success: true,
      tasks,
      disclaimer: 'Care schedules and medication instructions are self-managed by the pet owner. PetCare Passport does not prescribe medications or calculate dosages.'
    });
  } catch (error) {
    console.error('[CareRoutes] List tasks error:', error);
    res.status(500).json({ success: false, error: 'Failed to retrieve daily care tasks.' });
  }
});

// 2. Add care task
router.post('/:petId', requireAuth, async (req, res) => {
  try {
    const petId = req.params.petId;
    const userId = req.session.user.id;

    // Verify ownership
    const [pets] = await query('SELECT id FROM pets WHERE id = ? AND user_id = ?', [petId, userId]);
    if (pets.length === 0) {
      return res.status(404).json({ success: false, error: 'Pet not found or unauthorized.' });
    }

    const {
      task_type,
      title,
      description,
      dosage_instruction,
      frequency,
      due_date,
      due_time
    } = req.body;

    if (!task_type || !title) {
      return res.status(400).json({ success: false, error: 'Task type and title are required.' });
    }

    const [result] = await query(
      `INSERT INTO daily_care_tasks (
        pet_id, task_type, title, description, dosage_instruction,
        frequency, due_date, due_time, is_completed
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, false)`,
      [
        petId,
        task_type,
        title.trim(),
        description ? description.trim() : null,
        dosage_instruction ? dosage_instruction.trim() : null,
        frequency || 'daily',
        due_date || null,
        due_time || null
      ]
    );

    res.status(201).json({
      success: true,
      message: 'Care task created.',
      task_id: result.insertId
    });
  } catch (error) {
    console.error('[CareRoutes] Add task error:', error);
    res.status(500).json({ success: false, error: 'Failed to add care task.' });
  }
});

// 3. Toggle task completion
router.put('/:id/toggle', requireAuth, async (req, res) => {
  try {
    const taskId = req.params.id;
    const userId = req.session.user.id;

    // Verify ownership
    const [existing] = await query(
      `SELECT t.* FROM daily_care_tasks t
       JOIN pets p ON t.pet_id = p.id
       WHERE t.id = ? AND p.user_id = ?`,
      [taskId, userId]
    );

    if (existing.length === 0) {
      return res.status(404).json({ success: false, error: 'Task not found or unauthorized.' });
    }

    const newStatus = !existing[0].is_completed;
    const completedAt = newStatus ? new Date() : null;

    await query(
      'UPDATE daily_care_tasks SET is_completed = ?, completed_at = ? WHERE id = ?',
      [newStatus, completedAt, taskId]
    );

    res.json({
      success: true,
      message: newStatus ? 'Task marked as completed! 🐾' : 'Task marked as pending.',
      is_completed: newStatus
    });
  } catch (error) {
    console.error('[CareRoutes] Toggle task error:', error);
    res.status(500).json({ success: false, error: 'Failed to update task status.' });
  }
});

// 4. Update task details
router.put('/:id', requireAuth, async (req, res) => {
  try {
    const taskId = req.params.id;
    const userId = req.session.user.id;

    const [existing] = await query(
      `SELECT t.* FROM daily_care_tasks t
       JOIN pets p ON t.pet_id = p.id
       WHERE t.id = ? AND p.user_id = ?`,
      [taskId, userId]
    );

    if (existing.length === 0) {
      return res.status(404).json({ success: false, error: 'Task not found or unauthorized.' });
    }

    const {
      task_type,
      title,
      description,
      dosage_instruction,
      frequency,
      due_date,
      due_time
    } = req.body;

    await query(
      `UPDATE daily_care_tasks SET
        task_type = ?, title = ?, description = ?, dosage_instruction = ?,
        frequency = ?, due_date = ?, due_time = ?
       WHERE id = ?`,
      [
        task_type || existing[0].task_type,
        title ? title.trim() : existing[0].title,
        description ? description.trim() : null,
        dosage_instruction ? dosage_instruction.trim() : null,
        frequency || existing[0].frequency,
        due_date || existing[0].due_date,
        due_time || existing[0].due_time,
        taskId
      ]
    );

    res.json({ success: true, message: 'Care task updated.' });
  } catch (error) {
    console.error('[CareRoutes] Update task error:', error);
    res.status(500).json({ success: false, error: 'Failed to update task.' });
  }
});

// 5. Delete task
router.delete('/:id', requireAuth, async (req, res) => {
  try {
    const taskId = req.params.id;
    const userId = req.session.user.id;

    const [result] = await query(
      `DELETE t FROM daily_care_tasks t
       JOIN pets p ON t.pet_id = p.id
       WHERE t.id = ? AND p.user_id = ?`,
      [taskId, userId]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({ success: false, error: 'Task not found or unauthorized.' });
    }

    res.json({ success: true, message: 'Care task removed.' });
  } catch (error) {
    console.error('[CareRoutes] Delete task error:', error);
    res.status(500).json({ success: false, error: 'Failed to delete task.' });
  }
});

module.exports = router;
