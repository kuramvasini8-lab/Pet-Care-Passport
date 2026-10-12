/**
 * Authentication & Profile Routes
 */
const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const { query } = require('../config/db');
const { requireAuth } = require('../middleware/auth');

/**
 * Validate password complexity pattern:
 * - Minimum 8 characters
 * - At least 1 uppercase letter (A-Z)
 * - At least 1 lowercase letter (a-z)
 * - At least 1 numeric digit (0-9)
 * - At least 1 special symbol (!@#$%^&*...)
 */
function validatePasswordPattern(password) {
  if (!password || typeof password !== 'string') {
    return { valid: false, error: 'Password is required.' };
  }
  if (password.length < 8) {
    return { valid: false, error: 'Password must be at least 8 characters long.' };
  }
  if (!/[A-Z]/.test(password)) {
    return { valid: false, error: 'Password must contain at least one uppercase letter (A-Z).' };
  }
  if (!/[a-z]/.test(password)) {
    return { valid: false, error: 'Password must contain at least one lowercase letter (a-z).' };
  }
  if (!/\d/.test(password)) {
    return { valid: false, error: 'Password must contain at least one numeric digit (0-9).' };
  }
  if (!/[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(password)) {
    return { valid: false, error: 'Password must contain at least one special symbol (e.g. !@#$%^&*).' };
  }
  return { valid: true };
}

// Register
router.post('/register', async (req, res) => {
  try {
    const { full_name, email, password, confirm_password, phone } = req.body;

    if (!full_name || !email || !password) {
      return res.status(400).json({ success: false, error: 'Full name, email, and password are required.' });
    }

    if (confirm_password !== undefined && password !== confirm_password) {
      return res.status(400).json({ success: false, error: 'Password and Confirm Password do not match.' });
    }

    const pwdCheck = validatePasswordPattern(password);
    if (!pwdCheck.valid) {
      return res.status(400).json({ success: false, error: pwdCheck.error });
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
       VALUES (?, 'Welcome to PetCare Passport', 'Your account is ready! Start by adding your pet and managing their digital care passport.', 'system', '/owner/pets.html')`,
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

// Change Password (Authenticated User)
router.put('/password', requireAuth, async (req, res) => {
  try {
    const { current_password, new_password, confirm_password } = req.body;
    const userId = req.session.user.id;

    if (!current_password || !new_password) {
      return res.status(400).json({ success: false, error: 'Current and new passwords are required.' });
    }

    if (confirm_password !== undefined && new_password !== confirm_password) {
      return res.status(400).json({ success: false, error: 'New password and confirm password do not match.' });
    }

    const pwdCheck = validatePasswordPattern(new_password);
    if (!pwdCheck.valid) {
      return res.status(400).json({ success: false, error: pwdCheck.error });
    }

    const [users] = await query('SELECT password_hash FROM users WHERE id = ?', [userId]);
    const isMatch = await bcrypt.compare(current_password, users[0].password_hash);
    if (!isMatch) {
      return res.status(400).json({ success: false, error: 'Incorrect current password.' });
    }

    const newHash = await bcrypt.hash(new_password, 10);
    await query('UPDATE users SET password_hash = ? WHERE id = ?', [newHash, userId]);

    // Insert security notification
    await query(
      `INSERT INTO notifications (user_id, title, message, type, link)
       VALUES (?, 'Password Changed', 'Your account password was updated successfully.', 'system', '/owner/profile.html')`,
      [userId]
    );

    res.json({ success: true, message: 'Password updated successfully.' });
  } catch (error) {
    console.error('[Auth] Change password error:', error);
    res.status(500).json({ success: false, error: 'Failed to update password.' });
  }
});

// Forgot Password - Request Reset Link & Token
router.post('/forgot-password', async (req, res) => {
  try {
    const { email } = req.body;

    if (!email || !email.trim()) {
      return res.status(400).json({ success: false, error: 'Please enter your registered email address.' });
    }

    const cleanEmail = email.trim().toLowerCase();
    const [users] = await query('SELECT id, full_name, email, status FROM users WHERE email = ?', [cleanEmail]);

    if (users.length === 0) {
      return res.status(404).json({ success: false, error: 'No account found matching this email address.' });
    }

    const user = users[0];
    if (user.status === 'suspended') {
      return res.status(403).json({ success: false, error: 'Account is suspended. Please contact platform administrators.' });
    }

    // Generate secure 64-char token & 1 hour expiry
    const resetToken = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1 hour

    // Invalidate any previous unused tokens for this user
    await query('UPDATE password_resets SET used = 1 WHERE user_id = ? AND used = 0', [user.id]);

    // Store in password_resets
    await query(
      'INSERT INTO password_resets (user_id, email, token, expires_at) VALUES (?, ?, ?, ?)',
      [user.id, user.email, resetToken, expiresAt]
    );

    // Record notification
    await query(
      `INSERT INTO notifications (user_id, title, message, type, link)
       VALUES (?, 'Password Reset Requested', 'A password reset request was initiated for your account.', 'system', '/login.html')`,
      [user.id]
    );

    res.json({
      success: true,
      message: 'Password reset link generated successfully. You can now reset your password.',
      reset_token: resetToken,
      reset_link: `/reset-password.html?token=${resetToken}`,
      email: user.email
    });
  } catch (error) {
    console.error('[Auth] Forgot password error:', error);
    res.status(500).json({ success: false, error: 'Failed to initiate password reset.' });
  }
});

// Reset Password - Validate Token and Update Password
router.post('/reset-password', async (req, res) => {
  try {
    const { token, new_password, confirm_password } = req.body;

    if (!token || !token.trim()) {
      return res.status(400).json({ success: false, error: 'Password reset token is required.' });
    }

    if (!new_password) {
      return res.status(400).json({ success: false, error: 'Please enter a new password.' });
    }

    if (confirm_password !== undefined && new_password !== confirm_password) {
      return res.status(400).json({ success: false, error: 'New password and confirm password do not match.' });
    }

    const pwdCheck = validatePasswordPattern(new_password);
    if (!pwdCheck.valid) {
      return res.status(400).json({ success: false, error: pwdCheck.error });
    }

    const [resets] = await query(
      'SELECT id, user_id, email, expires_at, used FROM password_resets WHERE token = ?',
      [token.trim()]
    );

    if (resets.length === 0) {
      return res.status(400).json({ success: false, error: 'Invalid or unrecognized password reset token.' });
    }

    const resetRecord = resets[0];

    if (resetRecord.used) {
      return res.status(400).json({ success: false, error: 'This password reset link has already been used. Please request a new one.' });
    }

    if (new Date(resetRecord.expires_at) < new Date()) {
      return res.status(400).json({ success: false, error: 'This password reset link has expired. Please request a fresh reset link.' });
    }

    // Hash and update password
    const newHash = await bcrypt.hash(new_password, 10);
    await query('UPDATE users SET password_hash = ? WHERE id = ?', [newHash, resetRecord.user_id]);

    // Mark reset record as used
    await query('UPDATE password_resets SET used = 1 WHERE id = ?', [resetRecord.id]);

    // Log notification
    await query(
      `INSERT INTO notifications (user_id, title, message, type, link)
       VALUES (?, 'Password Reset Complete', 'Your account password was successfully reset. You may now log in.', 'system', '/login.html')`,
      [resetRecord.user_id]
    );

    res.json({
      success: true,
      message: 'Password successfully reset! You can now log in with your new credentials.'
    });
  } catch (error) {
    console.error('[Auth] Reset password error:', error);
    res.status(500).json({ success: false, error: 'Failed to reset password.' });
  }
});

module.exports = router;
