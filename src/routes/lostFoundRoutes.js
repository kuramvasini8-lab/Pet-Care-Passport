/**
 * Lost & Found Reporting and Recovery Routes
 */
const express = require('express');
const router = express.Router();
const { query } = require('../config/db');
const { requireAuth } = require('../middleware/auth');
const upload = require('../middleware/upload');

// 1. Browse Published Lost & Found Reports (Public)
router.get(['/public', '/reports'], async (req, res) => {
  try {
    const { type, species, location, search } = req.query;

    let sql = `
      SELECT id, report_type, pet_name, species, breed, color_markings,
             date_lost_or_found, general_location, description, photo_url,
             contact_name, status, created_at
      FROM lost_found_reports
      WHERE status IN ('published', 'reunited')
    `;
    const params = [];

    if (type && ['lost', 'found'].includes(type)) {
      sql += ' AND report_type = ?';
      params.push(type);
    }
    if (species && species.trim() !== '') {
      sql += ' AND species = ?';
      params.push(species.trim());
    }
    if (location && location.trim() !== '') {
      sql += ' AND general_location LIKE ?';
      params.push(`%${location.trim()}%`);
    }
    if (search && search.trim() !== '') {
      sql += ' AND (pet_name LIKE ? OR description LIKE ? OR color_markings LIKE ?)';
      const s = `%${search.trim()}%`;
      params.push(s, s, s);
    }

    sql += ' ORDER BY date_lost_or_found DESC, created_at DESC';

    const [reports] = await query(sql, params);

    res.json({ success: true, reports });
  } catch (error) {
    console.error('[LostFoundRoutes] Public browse error:', error);
    res.status(500).json({ success: false, error: 'Failed to retrieve lost and found reports.' });
  }
});

// 2. View Single Report Details & Sightings (Public)
router.get('/public/:id', async (req, res) => {
  try {
    const id = req.params.id;

    const [rows] = await query(
      `SELECT id, report_type, pet_name, species, breed, color_markings,
              date_lost_or_found, general_location, description, photo_url,
              contact_name, contact_phone, contact_email, status, created_at
       FROM lost_found_reports
       WHERE id = ? AND status IN ('published', 'reunited')`,
      [id]
    );

    if (rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Report not found or not published.' });
    }

    const [sightings] = await query(
      `SELECT id, reporter_name, sighting_date, location, notes, created_at
       FROM lost_found_sightings
       WHERE report_id = ?
       ORDER BY sighting_date DESC`,
      [id]
    );

    res.json({ success: true, report: rows[0], sightings });
  } catch (error) {
    console.error('[LostFoundRoutes] Report details error:', error);
    res.status(500).json({ success: false, error: 'Failed to load report.' });
  }
});

// 3. Submit New Lost or Found Report (Public / Authenticated)
router.post('/submit', upload.single('photo'), async (req, res) => {
  try {
    const userId = req.session?.user?.id || null;
    const {
      report_type,
      pet_name,
      species,
      breed,
      color_markings,
      date_lost_or_found,
      general_location,
      description,
      contact_name,
      contact_phone,
      contact_email
    } = req.body;

    if (!report_type || !species || !color_markings || !date_lost_or_found || !general_location || !contact_name || !contact_email) {
      return res.status(400).json({
        success: false,
        error: 'Please complete all required fields (report type, species, markings, date, location, contact name and email).'
      });
    }

    const photoUrl = req.file ? `/uploads/${req.file.filename}` : '/assets/images/default-pet.jpg';

    const [result] = await query(
      `INSERT INTO lost_found_reports (
        user_id, report_type, pet_name, species, breed, color_markings,
        date_lost_or_found, general_location, description, photo_url,
        contact_name, contact_phone, contact_email, status
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'published')`,
      [
        userId,
        report_type,
        pet_name ? pet_name.trim() : null,
        species.trim(),
        breed ? breed.trim() : null,
        color_markings.trim(),
        date_lost_or_found,
        general_location.trim(),
        description ? description.trim() : '',
        photoUrl,
        contact_name.trim(),
        contact_phone ? contact_phone.trim() : '',
        contact_email.trim().toLowerCase()
      ]
    );

    res.status(201).json({
      success: true,
      message: 'Lost & Found report published! We hope for a swift and happy reunion. 🐾',
      report_id: result.insertId
    });
  } catch (error) {
    console.error('[LostFoundRoutes] Submit error:', error);
    res.status(500).json({ success: false, error: 'Failed to submit report.' });
  }
});

// 4. Submit Sighting for a Lost Pet (Public)
router.post('/public/:id/sighting', async (req, res) => {
  try {
    const reportId = req.params.id;
    const { reporter_name, reporter_contact, sighting_date, location, notes } = req.body;

    if (!reporter_name || !location || !notes) {
      return res.status(400).json({ success: false, error: 'Name, location, and notes are required for a sighting report.' });
    }

    const [reports] = await query('SELECT id, pet_name, contact_email, user_id FROM lost_found_reports WHERE id = ?', [reportId]);
    if (reports.length === 0) {
      return res.status(404).json({ success: false, error: 'Report not found.' });
    }

    const [result] = await query(
      `INSERT INTO lost_found_sightings (
        report_id, reporter_name, reporter_contact, sighting_date, location, notes
      ) VALUES (?, ?, ?, ?, ?, ?)`,
      [
        reportId,
        reporter_name.trim(),
        reporter_contact ? reporter_contact.trim() : 'Anonymous',
        sighting_date || new Date(),
        location.trim(),
        notes.trim()
      ]
    );

    // If report has registered user, send notification
    if (reports[0].user_id) {
      await query(
        `INSERT INTO notifications (user_id, title, message, type, link)
         VALUES (?, 'New Sighting Reported!', ?, 'reminder', '/lost-found.html')`,
        [reports[0].user_id, `Someone reported a sighting of ${reports[0].pet_name || 'your pet'} at ${location.trim()}.`]
      );
    }

    res.status(201).json({
      success: true,
      message: 'Sighting recorded. Thank you for helping reunite a pet!'
    });
  } catch (error) {
    console.error('[LostFoundRoutes] Sighting error:', error);
    res.status(500).json({ success: false, error: 'Failed to record sighting.' });
  }
});

// 5. Mark Report as Reunited (Authenticated report owner)
router.put('/:id/reunited', requireAuth, async (req, res) => {
  try {
    const reportId = req.params.id;
    const userId = req.session.user.id;

    const [result] = await query(
      'UPDATE lost_found_reports SET status = "reunited" WHERE id = ? AND user_id = ?',
      [reportId, userId]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({ success: false, error: 'Report not found or unauthorized.' });
    }

    res.json({ success: true, message: 'Pet marked as reunited! 🎉 What wonderful news!' });
  } catch (error) {
    console.error('[LostFoundRoutes] Reunited error:', error);
    res.status(500).json({ success: false, error: 'Failed to update report.' });
  }
});

module.exports = router;
