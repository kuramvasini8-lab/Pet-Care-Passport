/**
 * Pet Owner Dashboard Overview Aggregator Route
 * Computes all real database-backed metrics for the Pet Owner Dashboard.
 */
const express = require('express');
const router = express.Router();
const { query } = require('../config/db');
const { requireAuth } = require('../middleware/auth');

router.get('/overview', requireAuth, async (req, res) => {
  try {
    const userId = req.session.user.id;

    // 1. Total registered pets
    const [pets] = await query(
      `SELECT p.id, p.name, p.species, p.breed, p.photo_url, p.public_id,
              pass.is_public_enabled, pass.qr_code_url
       FROM pets p
       LEFT JOIN passports pass ON pass.pet_id = p.id
       WHERE p.user_id = ? AND p.is_archived = false
       ORDER BY p.created_at DESC`,
      [userId]
    );

    const totalPets = pets.length;

    // 2. Vaccinations Due Soon and Overdue (Calculated dynamically from entered dates!)
    const [vaccRows] = await query(
      `SELECT v.*, p.name as pet_name
       FROM vaccinations v
       JOIN pets p ON v.pet_id = p.id
       WHERE p.user_id = ? AND p.is_archived = false AND v.next_due_date IS NOT NULL`,
      [userId]
    );

    let overdueVaccinations = 0;
    let dueSoonVaccinations = 0;
    const now = new Date();
    now.setHours(0, 0, 0, 0);

    const urgentVaccines = [];

    vaccRows.forEach(v => {
      const due = new Date(v.next_due_date);
      due.setHours(0, 0, 0, 0);
      const diffDays = Math.ceil((due - now) / (1000 * 60 * 60 * 24));

      if (diffDays < 0) {
        overdueVaccinations++;
        urgentVaccines.push({
          ...v,
          statusLabel: `Overdue by ${Math.abs(diffDays)} days`,
          isOverdue: true
        });
      } else if (diffDays <= 30) {
        dueSoonVaccinations++;
        urgentVaccines.push({
          ...v,
          statusLabel: `Due in ${diffDays} days`,
          isOverdue: false
        });
      }
    });

    // 3. Active daily care tasks
    const [activeTasks] = await query(
      `SELECT t.*, p.name as pet_name
       FROM daily_care_tasks t
       JOIN pets p ON t.pet_id = p.id
       WHERE p.user_id = ? AND p.is_archived = false AND t.is_completed = false
       ORDER BY t.due_time ASC LIMIT 5`,
      [userId]
    );

    // 4. Recent health records
    const [recentHealth] = await query(
      `SELECT hr.*, p.name as pet_name
       FROM health_records hr
       JOIN pets p ON hr.pet_id = p.id
       WHERE p.user_id = ? AND p.is_archived = false
       ORDER BY hr.date DESC, hr.created_at DESC LIMIT 5`,
      [userId]
    );

    // 5. Recent notifications
    const [recentNotifs] = await query(
      `SELECT * FROM notifications
       WHERE user_id = ?
       ORDER BY created_at DESC LIMIT 5`,
      [userId]
    );

    const payload = {
      total_pets: totalPets,
      pets,
      upcoming_appointments_count: 0,
      upcoming_appointments: [],
      vaccinations_overdue_count: overdueVaccinations,
      vaccinations_due_soon_count: dueSoonVaccinations,
      urgent_vaccinations: urgentVaccines,
      active_care_tasks_count: activeTasks.length,
      active_care_tasks: activeTasks,
      recent_health_records: recentHealth,
      recent_notifications: recentNotifs,
      adoption_listings: []
    };

    res.json({
      success: true,
      data: payload,
      stats: payload
    });
  } catch (error) {
    console.error('[OwnerOverview] Error:', error);
    res.status(500).json({ success: false, error: 'Failed to aggregate owner dashboard metrics.' });
  }
});

module.exports = router;
