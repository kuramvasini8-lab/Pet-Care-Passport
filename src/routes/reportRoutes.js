/**
 * Reports & Platform Integrity Complaints Submission Route
 */
const express = require('express');
const router = express.Router();
const { query } = require('../config/db');

router.post('/', async (req, res) => {
  try {
    const userId = req.session?.user?.id || null;
    const { category, target_id, reporter_email, subject, details } = req.body;

    if (!category || !reporter_email || !subject || !details) {
      return res.status(400).json({
        success: false,
        error: 'Category, contact email, subject, and details are required.'
      });
    }

    const [result] = await query(
      `INSERT INTO reports_and_complaints (
        user_id, category, target_id, reporter_email, subject, details, status
      ) VALUES (?, ?, ?, ?, ?, ?, 'open')`,
      [
        userId,
        category,
        target_id ? parseInt(target_id, 10) : null,
        reporter_email.trim().toLowerCase(),
        subject.trim(),
        details.trim()
      ]
    );

    res.status(201).json({
      success: true,
      message: 'Thank you for reporting. Your submission has been escalated to our platform moderation team for investigation.',
      report_id: result.insertId
    });
  } catch (error) {
    console.error('[ReportRoutes] Submit complaint error:', error);
    res.status(500).json({ success: false, error: 'Failed to record report.' });
  }
});

module.exports = router;
