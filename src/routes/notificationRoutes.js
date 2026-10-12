/**
 * In-App Notifications Routes
 */
const express = require('express');
const router = express.Router();
const { query } = require('../config/db');
const { requireAuth } = require('../middleware/auth');

// Get all notifications for user
router.get('/', requireAuth, async (req, res) => {
  try {
    const userId = req.session.user.id;
    const [notifications] = await query(
      'SELECT * FROM notifications WHERE user_id = ? ORDER BY created_at DESC LIMIT 50',
      [userId]
    );

    const [unreadCount] = await query(
      'SELECT COUNT(*) as count FROM notifications WHERE user_id = ? AND is_read = false',
      [userId]
    );

    res.json({
      success: true,
      notifications,
      unread_count: unreadCount[0].count
    });
  } catch (error) {
    console.error('[NotificationRoutes] List error:', error);
    res.status(500).json({ success: false, error: 'Failed to retrieve notifications.' });
  }
});

// Get unread notification count
router.get('/unread-count', requireAuth, async (req, res) => {
  try {
    const userId = req.session.user.id;
    const [unreadCount] = await query(
      'SELECT COUNT(*) as count FROM notifications WHERE user_id = ? AND is_read = false',
      [userId]
    );
    res.json({ success: true, count: unreadCount[0].count });
  } catch (error) {
    console.error('[NotificationRoutes] Count error:', error);
    res.status(500).json({ success: false, error: 'Failed to count notifications.' });
  }
});

// Mark single notification as read
router.put('/:id/read', requireAuth, async (req, res) => {
  try {
    const id = req.params.id;
    const userId = req.session.user.id;

    await query('UPDATE notifications SET is_read = true WHERE id = ? AND user_id = ?', [id, userId]);

    res.json({ success: true, message: 'Notification marked as read.' });
  } catch (error) {
    console.error('[NotificationRoutes] Read error:', error);
    res.status(500).json({ success: false, error: 'Failed to update notification.' });
  }
});

// Mark all as read
router.put('/read-all', requireAuth, async (req, res) => {
  try {
    const userId = req.session.user.id;
    await query('UPDATE notifications SET is_read = true WHERE user_id = ?', [userId]);

    res.json({ success: true, message: 'All notifications marked as read.' });
  } catch (error) {
    console.error('[NotificationRoutes] Read all error:', error);
    res.status(500).json({ success: false, error: 'Failed to update notifications.' });
  }
});

module.exports = router;
