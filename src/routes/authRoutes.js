/**
 * Authentication & Profile Routes
 */
const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const { query } = require('../config/db');
const { requireAuth } = require('../middleware/auth');

// Register
router.post('/register', async (req, res) => {
  try {
    const { full_name, email, password, phone } = req.body;

    if (!full_name || !email || !password) {
      return res.status(400).json({ success: false, error: 'Full name, email, and password are required.' });
    }

    if (password.length < 6) {
      return res.status(400).json({ success: false, error: 'Password must be at least 6 characters long.' });
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return res.status(400).json({ success: false, error: 'Please enter a valid email address.' });
    }

    // Check if user already exists
    const [existing] = await query('SELECT id FROM users WHERE email = ?', [email.trim().toLowerCase()]);
    if (existing.length > 0) {
      return res.status(409).json({ success: false, error: 'An account with this email address already exists.' });
    }

    const passwordHash = await bcrypt.hash(password, 10);
    const [result] = await query(
      `INSERT INTO users (full_name, email, password_hash, phone, role, status)
       VALUES (?, ?, ?, ?, 'user', 'active')`,
      [full_name.trim(), email.trim().toLowerCase(), passwordHash, phone ? phone.trim() : null]
    );

    const user = {
      id: result.insertId,
      full_name: full_name.trim(),
      email: email.trim().toLowerCase(),
      phone: phone ? phone.trim() : null,
      role: 'user',
      status: 'active'
    };

    req.session.user = user;

    // Send welcome notification
    await query(
      `INSERT INTO notifications (user_id, title, message, type, link)
       VALUES (?, 'Welcome to PetCare Passport', 'Your account is ready! Start by adding your pet or exploring our adoption section.', 'system', '/owner/pets.html')`,
      [user.id]
    );

    res.status(201).json({
      success: true,
      message: 'Account registered successfully.',
      user
    });
  } catch (error) {
    console.error('[Auth] Register error:', error);
    res.status(500).json({ success: false, error: 'Server error during registration.' });
  }
});

// Login
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ success: false, error: 'Please provide both email and password.' });
    }

    const [users] = await query(
      'SELECT id, full_name, email, password_hash, phone, role, status, suspension_reason FROM users WHERE email = ?',
      [email.trim().toLowerCase()]
    );

    if (users.length === 0) {
      return res.status(401).json({ success: false, error: 'Invalid email or password.' });
    }

    const userRecord = users[0];

    if (userRecord.status === 'suspended') {
      return res.status(403).json({
        success: false,
        error: `Account suspended: ${userRecord.suspension_reason || 'Administrative suspension.'}`
      });
    }

    const isMatch = await bcrypt.compare(password, userRecord.password_hash);
    if (!isMatch) {
      return res.status(401).json({ success: false, error: 'Invalid email or password.' });
    }

    const sessionUser = {
      id: userRecord.id,
      full_name: userRecord.full_name,
      email: userRecord.email,
      phone: userRecord.phone,
      role: userRecord.role,
      status: userRecord.status
    };

    req.session.user = sessionUser;

    res.json({
      success: true,
      message: 'Login successful.',
      user: sessionUser
    });
  } catch (error) {
    console.error('[Auth] Login error:', error);
    res.status(500).json({ success: false, error: 'Server error during login.' });
  }
});

// Logout
router.post('/logout', (req, res) => {
  req.session.destroy(err => {
    if (err) {
      return res.status(500).json({ success: false, error: 'Could not log out.' });
    }
    res.clearCookie('connect.sid');
    res.json({ success: true, message: 'Logged out successfully.' });
  });
});

// Current User State
router.get('/me', (req, res) => {
  if (req.session && req.session.user) {
    return res.json({
      success: true,
      authenticated: true,
      user: req.session.user
    });
  }
  res.json({
    success: true,
    authenticated: false,
    user: null
  });
});

// Update Profile
router.put('/profile', requireAuth, async (req, res) => {
  try {
    const { full_name, phone } = req.body;
    const userId = req.session.user.id;

    if (!full_name || full_name.trim() === '') {
      return res.status(400).json({ success: false, error: 'Full name cannot be empty.' });
    }

    await query(
      'UPDATE users SET full_name = ?, phone = ? WHERE id = ?',
      [full_name.trim(), phone ? phone.trim() : null, userId]
    );

    req.session.user.full_name = full_name.trim();
    req.session.user.phone = phone ? phone.trim() : null;

    res.json({
      success: true,
      message: 'Profile updated successfully.',
      user: req.session.user
    });
  } catch (error) {
    console.error('[Auth] Update profile error:', error);
    res.status(500).json({ success: false, error: 'Failed to update profile.' });
  }
});

// Change Password
router.put('/password', requireAuth, async (req, res) => {
  try {
    const { current_password, new_password } = req.body;
    const userId = req.session.user.id;

    if (!current_password || !new_password) {
      return res.status(400).json({ success: false, error: 'Current and new passwords are required.' });
    }

    if (new_password.length < 6) {
      return res.status(400).json({ success: false, error: 'New password must be at least 6 characters.' });
    }

    const [users] = await query('SELECT password_hash FROM users WHERE id = ?', [userId]);
    const isMatch = await bcrypt.compare(current_password, users[0].password_hash);
    if (!isMatch) {
      return res.status(400).json({ success: false, error: 'Incorrect current password.' });
    }

    const newHash = await bcrypt.hash(new_password, 10);
    await query('UPDATE users SET password_hash = ? WHERE id = ?', [newHash, userId]);

    res.json({ success: true, message: 'Password updated successfully.' });
  } catch (error) {
    console.error('[Auth] Change password error:', error);
    res.status(500).json({ success: false, error: 'Failed to update password.' });
  }
});

module.exports = router;
