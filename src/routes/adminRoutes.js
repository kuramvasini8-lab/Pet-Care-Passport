/**
 * Dedicated Administrator Dashboard & Management Routes
 * Protected strictly by server-side requireAdmin RBAC middleware.
 */
const express = require('express');
const router = express.Router();
const os = require('os');
const { query, checkDbHealth } = require('../config/db');
const { requireAdmin } = require('../middleware/auth');
const { logAdminAction } = require('../services/auditService');
const { sendTransactionalEmail } = require('../services/emailService');

// Apply requireAdmin to ALL administrative routes
router.use(requireAdmin);

// ============================================================================
// 1. ADMIN OVERVIEW (Real Database Analytics)
// ============================================================================
router.get('/overview', async (req, res) => {
  try {
    // 1. Total users
    const [userCount] = await query('SELECT COUNT(*) as count FROM users');
    // 2. Total registered pets
    const [petCount] = await query('SELECT COUNT(*) as count FROM pets WHERE is_archived = false');
    // 3. Adoption listings breakdown
    const [listingStats] = await query(`
      SELECT 
        SUM(CASE WHEN status = 'approved' THEN 1 ELSE 0 END) as active_listings,
        SUM(CASE WHEN status = 'pending_approval' THEN 1 ELSE 0 END) as pending_listings,
        SUM(CASE WHEN status IN ('rejected', 'suspended') THEN 1 ELSE 0 END) as rejected_suspended_listings
      FROM adoption_listings
    `);
    // 4. Open reports & complaints
    const [reportCount] = await query(`SELECT COUNT(*) as count FROM reports_and_complaints WHERE status IN ('open', 'under_review')`);
    // 5. Lost & found needing review
    const [lfCount] = await query(`SELECT COUNT(*) as count FROM lost_found_reports WHERE status = 'pending_review'`);
    // 6. Appointments breakdown
    const [aptStats] = await query(`
      SELECT 
        COUNT(*) as total_appointments,
        SUM(CASE WHEN status = 'upcoming' THEN 1 ELSE 0 END) as upcoming_appointments,
        SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) as completed_appointments,
        SUM(CASE WHEN status = 'cancelled' THEN 1 ELSE 0 END) as cancelled_appointments
      FROM appointments
    `);
    // 7. Failed reminder processing attempts
    const [failedReminders] = await query(`SELECT COUNT(*) as count FROM reminders_log WHERE status = 'failed'`);
    // 8. Recent administrative audit activity
    const [recentAudits] = await query(`SELECT * FROM audit_logs ORDER BY created_at DESC LIMIT 6`);

    res.json({
      success: true,
      stats: {
        total_users: userCount[0].count,
        total_pets: petCount[0].count,
        active_listings: listingStats[0].active_listings || 0,
        pending_listings: listingStats[0].pending_listings || 0,
        rejected_suspended_listings: listingStats[0].rejected_suspended_listings || 0,
        open_reports: reportCount[0].count,
        lost_found_pending: lfCount[0].count,
        appointments: {
          total: aptStats[0].total_appointments,
          upcoming: aptStats[0].upcoming_appointments || 0,
          completed: aptStats[0].completed_appointments || 0,
          cancelled: aptStats[0].cancelled_appointments || 0
        },
        failed_reminders: failedReminders[0].count
      },
      recent_activity: recentAudits
    });
  } catch (error) {
    console.error('[AdminRoutes] Overview error:', error);
    res.status(500).json({ success: false, error: 'Failed to retrieve administrative statistics.' });
  }
});

// ============================================================================
// 2. USER MANAGEMENT
// ============================================================================
router.get('/users', async (req, res) => {
  try {
    const { search, role, status } = req.query;

    let sql = `
      SELECT id, full_name, email, phone, role, status, suspension_reason, created_at,
             (SELECT COUNT(*) FROM pets WHERE user_id = users.id AND is_archived = false) as pet_count,
             (SELECT COUNT(*) FROM adoption_listings WHERE user_id = users.id) as listing_count
      FROM users
      WHERE 1=1
    `;
    const params = [];

    if (search && search.trim() !== '') {
      sql += ' AND (full_name LIKE ? OR email LIKE ?)';
      params.push(`%${search.trim()}%`, `%${search.trim()}%`);
    }
    if (role && ['user', 'admin'].includes(role)) {
      sql += ' AND role = ?';
      params.push(role);
    }
    if (status && ['active', 'suspended'].includes(status)) {
      sql += ' AND status = ?';
      params.push(status);
    }

    sql += ' ORDER BY created_at DESC';

    const [users] = await query(sql, params);

    res.json({ success: true, users });
  } catch (error) {
    console.error('[AdminRoutes] List users error:', error);
    res.status(500).json({ success: false, error: 'Failed to load user accounts.' });
  }
});

// Suspend or Reactivate Account
router.put('/users/:id/status', async (req, res) => {
  try {
    const targetUserId = req.params.id;
    const { status, reason } = req.body;
    const adminUser = req.session.user;

    if (!['active', 'suspended'].includes(status)) {
      return res.status(400).json({ success: false, error: 'Status must be active or suspended.' });
    }

    if (status === 'suspended' && (!reason || reason.trim() === '')) {
      return res.status(400).json({ success: false, error: 'A documented administrative reason is required to suspend an account.' });
    }

    // Prevent admin from suspending themselves
    if (parseInt(targetUserId, 10) === adminUser.id) {
      return res.status(400).json({ success: false, error: 'You cannot suspend your own administrative account.' });
    }

    const [targetUser] = await query('SELECT full_name, email, status FROM users WHERE id = ?', [targetUserId]);
    if (targetUser.length === 0) {
      return res.status(404).json({ success: false, error: 'User not found.' });
    }

    await query(
      'UPDATE users SET status = ?, suspension_reason = ? WHERE id = ?',
      [status, status === 'suspended' ? reason.trim() : null, targetUserId]
    );

    // Record in Audit Log
    await logAdminAction({
      adminId: adminUser.id,
      adminName: adminUser.full_name,
      actionType: status === 'suspended' ? 'USER_SUSPEND' : 'USER_REACTIVATE',
      targetEntity: 'users',
      targetId: targetUserId,
      reason: reason ? reason.trim() : 'Account reactivated by administrator',
      details: { previousStatus: targetUser[0].status, newStatus: status, userEmail: targetUser[0].email },
      ipAddress: req.ip
    });

    res.json({
      success: true,
      message: `Account for ${targetUser[0].full_name} (${targetUser[0].email}) is now ${status}.`
    });
  } catch (error) {
    console.error('[AdminRoutes] Update user status error:', error);
    res.status(500).json({ success: false, error: 'Failed to modify account status.' });
  }
});

// ============================================================================
// 3. ADOPTION LISTING MODERATION
// ============================================================================
router.get('/moderation/listings', async (req, res) => {
  try {
    const { status } = req.query;

    let sql = `
      SELECT l.*, p.name as pet_name, p.species, p.breed, p.dob_or_age, p.sex,
             p.color_marks, p.photo_url, p.is_sterilized, p.allergies, p.medical_conditions,
             u.full_name as owner_name, u.email as owner_email, u.phone as owner_phone,
             admin.full_name as moderator_name
      FROM adoption_listings l
      JOIN pets p ON l.pet_id = p.id
      JOIN users u ON l.user_id = u.id
      LEFT JOIN users admin ON l.moderated_by = admin.id
      WHERE 1=1
    `;
    const params = [];

    if (status && status.trim() !== '') {
      sql += ' AND l.status = ?';
      params.push(status.trim());
    }

    sql += ' ORDER BY l.created_at DESC';

    const [listings] = await query(sql, params);

    res.json({ success: true, listings });
  } catch (error) {
    console.error('[AdminRoutes] Moderation listings error:', error);
    res.status(500).json({ success: false, error: 'Failed to load moderation listings.' });
  }
});

// Decision on Adoption Listing (Approve, Reject, Request Changes, Suspend, Restore)
router.put('/moderation/listings/:id', async (req, res) => {
  try {
    const listingId = req.params.id;
    const { action, reason, moderation_notes } = req.body;
    const adminUser = req.session.user;

    const validActions = ['approve', 'reject', 'request_changes', 'suspend', 'restore'];
    if (!validActions.includes(action)) {
      return res.status(400).json({ success: false, error: 'Invalid moderation action.' });
    }

    if (['reject', 'request_changes', 'suspend'].includes(action) && (!reason || reason.trim() === '')) {
      return res.status(400).json({ success: false, error: 'A documented reason is required for rejection, revision requests, or suspension.' });
    }

    const [existing] = await query(
      `SELECT l.*, p.name as pet_name, u.id as owner_id, u.email as owner_email
       FROM adoption_listings l
       JOIN pets p ON l.pet_id = p.id
       JOIN users u ON l.user_id = u.id
       WHERE l.id = ?`,
      [listingId]
    );

    if (existing.length === 0) {
      return res.status(404).json({ success: false, error: 'Listing not found.' });
    }

    const listing = existing[0];

    // PREVENT USER FROM APPROVING OWN LISTING (Even if admin!)
    if (listing.owner_id === adminUser.id && action === 'approve') {
      return res.status(403).json({
        success: false,
        error: 'Platform Integrity Violation: Administrators cannot approve their own adoption listings. Another administrator must review this.'
      });
    }

    let targetStatus = listing.status;
    let notifTitle = '';
    let notifMsg = '';

    switch (action) {
      case 'approve':
        targetStatus = 'approved';
        notifTitle = `Adoption Listing Approved: ${listing.pet_name}`;
        notifMsg = `Great news! Your adoption listing for ${listing.pet_name} has been approved and is now live in the Adopt a Pet section.`;
        break;
      case 'reject':
        targetStatus = 'rejected';
        notifTitle = `Adoption Listing Rejected: ${listing.pet_name}`;
        notifMsg = `Your adoption listing for ${listing.pet_name} was rejected. Reason: ${reason.trim()}`;
        break;
      case 'request_changes':
        targetStatus = 'changes_requested';
        notifTitle = `Changes Requested: ${listing.pet_name}`;
        notifMsg = `An administrator requested revisions to your listing for ${listing.pet_name}: "${reason.trim()}". Please update and resubmit.`;
        break;
      case 'suspend':
        targetStatus = 'suspended';
        notifTitle = `Adoption Listing Suspended: ${listing.pet_name}`;
        notifMsg = `Your listing for ${listing.pet_name} has been suspended pending review. Reason: ${reason.trim()}`;
        break;
      case 'restore':
        targetStatus = 'approved';
        notifTitle = `Adoption Listing Restored: ${listing.pet_name}`;
        notifMsg = `Your listing for ${listing.pet_name} has been restored to active status.`;
        break;
    }

    await query(
      `UPDATE adoption_listings SET
        status = ?, moderation_notes = ?, moderated_by = ?, moderated_at = NOW()
       WHERE id = ?`,
      [targetStatus, reason ? reason.trim() : (moderation_notes || null), adminUser.id, listingId]
    );

    // Notify listing owner in-app
    await query(
      `INSERT INTO notifications (user_id, title, message, type, link)
       VALUES (?, ?, ?, 'moderation', '/owner/rehoming.html')`,
      [listing.owner_id, notifTitle, notifMsg]
    );

    // Send email notification to owner
    await sendTransactionalEmail({
      to: listing.owner_email,
      subject: notifTitle,
      text: notifMsg,
      html: `<div style="font-family:sans-serif;padding:16px;">
        <h2>🐾 ${notifTitle}</h2>
        <p>${notifMsg}</p>
        <p><a href="http://localhost:3000/owner/rehoming.html" style="background:#0284c7;color:#fff;padding:8px 16px;text-decoration:none;border-radius:6px;">Open Rehoming Dashboard</a></p>
      </div>`,
      referenceType: 'email_notification',
      referenceId: listingId
    });

    // Audit log
    await logAdminAction({
      adminId: adminUser.id,
      adminName: adminUser.full_name,
      actionType: `MODERATE_LISTING_${action.toUpperCase()}`,
      targetEntity: 'adoption_listings',
      targetId: listingId,
      reason: reason ? reason.trim() : `Decision: ${action}`,
      details: {
        petName: listing.pet_name,
        previousStatus: listing.status,
        newStatus: targetStatus,
        ownerEmail: listing.owner_email
      },
      ipAddress: req.ip
    });

    res.json({
      success: true,
      message: `Listing moderation status updated to: ${targetStatus}.`,
      status: targetStatus
    });
  } catch (error) {
    console.error('[AdminRoutes] Moderation action error:', error);
    res.status(500).json({ success: false, error: 'Failed to process moderation action.' });
  }
});

// Official Pet Adoption Health & Identity Verification (Admin Portal)
router.put('/moderation/listings/:id/verify', async (req, res) => {
  try {
    const listingId = req.params.id;
    const { verification_notes, checklist } = req.body;
    const adminUser = req.session.user;

    const [existing] = await query(
      `SELECT l.*, p.name as pet_name, p.microchip_number, u.id as owner_id, u.email as owner_email
       FROM adoption_listings l
       JOIN pets p ON l.pet_id = p.id
       JOIN users u ON l.user_id = u.id
       WHERE l.id = ?`,
      [listingId]
    );

    if (existing.length === 0) {
      return res.status(404).json({ success: false, error: 'Adoption listing not found.' });
    }

    const listing = existing[0];
    const notes = verification_notes ? verification_notes.trim() : 'Official identity, health records, and owner verification completed.';

    await query(
      `UPDATE adoption_listings SET
        is_verified = true,
        verified_by = ?,
        verified_at = NOW(),
        verification_notes = ?
       WHERE id = ?`,
      [adminUser.id, notes, listingId]
    );

    // Audit log
    await logAdminAction({
      adminId: adminUser.id,
      adminName: adminUser.full_name,
      actionType: 'VERIFY_PET_ADOPTION',
      targetEntity: 'adoption_listings',
      targetId: listingId,
      reason: notes,
      details: {
        petName: listing.pet_name,
        checklist: checklist || ['identity_verified', 'vaccinations_verified', 'sterilization_verified'],
        verifiedAt: new Date().toISOString()
      },
      ipAddress: req.ip
    });

    // Notify pet owner in-app
    await query(
      `INSERT INTO notifications (user_id, title, message, type, link)
       VALUES (?, ?, ?, 'moderation', '/owner/rehoming.html')`,
      [
        listing.owner_id,
        `Adoption Verified: ${listing.pet_name}`,
        `Congratulations! Your adoption listing for ${listing.pet_name} has received the official Platform Verified badge.`
      ]
    );

    res.json({
      success: true,
      message: `Pet adoption listing for ${listing.pet_name} is now officially verified by Platform Administration.`,
      is_verified: true
    });
  } catch (error) {
    console.error('[AdminRoutes] Adoption verification error:', error);
    res.status(500).json({ success: false, error: 'Failed to verify pet adoption listing.' });
  }
});

// Revoke Adoption Verification
router.put('/moderation/listings/:id/unverify', async (req, res) => {
  try {
    const listingId = req.params.id;
    const { reason } = req.body;
    const adminUser = req.session.user;

    await query(
      `UPDATE adoption_listings SET
        is_verified = false,
        verification_notes = ?
       WHERE id = ?`,
      [reason || 'Verification revoked by administrator.', listingId]
    );

    await logAdminAction({
      adminId: adminUser.id,
      adminName: adminUser.full_name,
      actionType: 'UNVERIFY_PET_ADOPTION',
      targetEntity: 'adoption_listings',
      targetId: listingId,
      reason: reason || 'Verification status revoked',
      details: null,
      ipAddress: req.ip
    });

    res.json({ success: true, message: 'Verification status revoked.' });
  } catch (error) {
    console.error('[AdminRoutes] Unverify error:', error);
    res.status(500).json({ success: false, error: 'Failed to revoke verification.' });
  }
});

// Adoption Applications Oversight (Platform-Wide)
router.get('/moderation/applications', async (req, res) => {
  try {
    const { status } = req.query;

    let sql = `
      SELECT app.*, l.title as listing_title, p.name as pet_name, p.photo_url as pet_photo,
             owner.full_name as owner_name, owner.email as owner_email,
             applicant.full_name as applicant_name, applicant.email as applicant_email, applicant.phone as applicant_phone
      FROM adoption_applications app
      JOIN adoption_listings l ON app.listing_id = l.id
      JOIN pets p ON l.pet_id = p.id
      JOIN users owner ON l.user_id = owner.id
      JOIN users applicant ON app.applicant_id = applicant.id
      WHERE 1=1
    `;
    const params = [];

    if (status && status.trim() !== '') {
      sql += ' AND app.status = ?';
      params.push(status.trim());
    }

    sql += ' ORDER BY app.created_at DESC';

    const [applications] = await query(sql, params);

    res.json({ success: true, applications });
  } catch (error) {
    console.error('[AdminRoutes] List applications error:', error);
    res.status(500).json({ success: false, error: 'Failed to retrieve adoption applications.' });
  }
});

// Adjudicate / Update Adoption Application Status (Admin)
router.put('/moderation/applications/:id', async (req, res) => {
  try {
    const appId = req.params.id;
    const { status, status_reason } = req.body;
    const adminUser = req.session.user;

    const validStatuses = ['submitted', 'under_review', 'more_info_requested', 'accepted', 'declined'];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({ success: false, error: 'Invalid application status.' });
    }

    const [existing] = await query(
      `SELECT app.*, p.name as pet_name, app.applicant_id, applicant.email as applicant_email
       FROM adoption_applications app
       JOIN adoption_listings l ON app.listing_id = l.id
       JOIN pets p ON l.pet_id = p.id
       JOIN users applicant ON app.applicant_id = applicant.id
       WHERE app.id = ?`,
      [appId]
    );

    if (existing.length === 0) {
      return res.status(404).json({ success: false, error: 'Application not found.' });
    }

    const application = existing[0];

    await query(
      `UPDATE adoption_applications SET status = ?, status_reason = ? WHERE id = ?`,
      [status, status_reason ? status_reason.trim() : null, appId]
    );

    // Notify applicant
    await query(
      `INSERT INTO notifications (user_id, title, message, type, link)
       VALUES (?, ?, ?, 'application', '/adopter/applications.html')`,
      [
        application.applicant_id,
        `Adoption Application Update: ${application.pet_name}`,
        `Your application for ${application.pet_name} status is now: ${status.replace('_', ' ').toUpperCase()}.${status_reason ? ' Notes: ' + status_reason.trim() : ''}`
      ]
    );

    // Audit log
    await logAdminAction({
      adminId: adminUser.id,
      adminName: adminUser.full_name,
      actionType: 'MODERATE_ADOPTION_APPLICATION',
      targetEntity: 'adoption_applications',
      targetId: appId,
      reason: status_reason ? status_reason.trim() : `Status set to ${status}`,
      details: { previousStatus: application.status, newStatus: status, petName: application.pet_name },
      ipAddress: req.ip
    });

    res.json({ success: true, message: `Application status updated to ${status}.` });
  } catch (error) {
    console.error('[AdminRoutes] Update application error:', error);
    res.status(500).json({ success: false, error: 'Failed to update application.' });
  }
});

// ============================================================================
// 4. LOST & FOUND MODERATION
// ============================================================================
router.get('/lost-found', async (req, res) => {
  try {
    const { status, type } = req.query;

    let sql = `
      SELECT lf.*, u.full_name as submitter_name
      FROM lost_found_reports lf
      LEFT JOIN users u ON lf.user_id = u.id
      WHERE 1=1
    `;
    const params = [];

    if (status) {
      sql += ' AND lf.status = ?';
      params.push(status);
    }
    if (type) {
      sql += ' AND lf.report_type = ?';
      params.push(type);
    }

    sql += ' ORDER BY lf.created_at DESC';

    const [reports] = await query(sql, params);

    res.json({ success: true, reports });
  } catch (error) {
    console.error('[AdminRoutes] Lost & Found list error:', error);
    res.status(500).json({ success: false, error: 'Failed to load lost-and-found records.' });
  }
});

router.put('/lost-found/:id/status', async (req, res) => {
  try {
    const reportId = req.params.id;
    const { status, admin_notes } = req.body;
    const adminUser = req.session.user;

    const validStatuses = ['published', 'suspended', 'closed', 'reunited'];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({ success: false, error: 'Invalid status value.' });
    }

    const [existing] = await query('SELECT * FROM lost_found_reports WHERE id = ?', [reportId]);
    if (existing.length === 0) {
      return res.status(404).json({ success: false, error: 'Report not found.' });
    }

    await query(
      'UPDATE lost_found_reports SET status = ?, admin_notes = ? WHERE id = ?',
      [status, admin_notes ? admin_notes.trim() : null, reportId]
    );

    await logAdminAction({
      adminId: adminUser.id,
      adminName: adminUser.full_name,
      actionType: 'MODERATE_LOST_FOUND',
      targetEntity: 'lost_found_reports',
      targetId: reportId,
      reason: admin_notes ? admin_notes.trim() : `Status changed to ${status}`,
      details: { previousStatus: existing[0].status, newStatus: status },
      ipAddress: req.ip
    });

    res.json({ success: true, message: `Lost & Found report status updated to ${status}.` });
  } catch (error) {
    console.error('[AdminRoutes] Update lost-found status error:', error);
    res.status(500).json({ success: false, error: 'Failed to update report status.' });
  }
});

// ============================================================================
// 5. REPORTS & COMPLAINTS MANAGEMENT
// ============================================================================
router.get('/reports', async (req, res) => {
  try {
    const { status, category } = req.query;

    let sql = `
      SELECT r.*, u.full_name as submitter_name, resolver.full_name as resolved_by_name
      FROM reports_and_complaints r
      LEFT JOIN users u ON r.user_id = u.id
      LEFT JOIN users resolver ON r.resolved_by = resolver.id
      WHERE 1=1
    `;
    const params = [];

    if (status) {
      sql += ' AND r.status = ?';
      params.push(status);
    }
    if (category) {
      sql += ' AND r.category = ?';
      params.push(category);
    }

    sql += ' ORDER BY r.created_at DESC';

    const [reports] = await query(sql, params);

    res.json({ success: true, reports });
  } catch (error) {
    console.error('[AdminRoutes] Reports list error:', error);
    res.status(500).json({ success: false, error: 'Failed to retrieve reports and complaints.' });
  }
});

router.put('/reports/:id', async (req, res) => {
  try {
    const reportId = req.params.id;
    const { status, admin_notes } = req.body;
    const adminUser = req.session.user;

    const validStatuses = ['open', 'under_review', 'resolved', 'dismissed'];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({ success: false, error: 'Invalid complaint status.' });
    }

    await query(
      `UPDATE reports_and_complaints SET
        status = ?, admin_notes = ?, resolved_by = ?, resolved_at = NOW()
       WHERE id = ?`,
      [status, admin_notes ? admin_notes.trim() : null, adminUser.id, reportId]
    );

    await logAdminAction({
      adminId: adminUser.id,
      adminName: adminUser.full_name,
      actionType: 'RESOLVE_COMPLAINT',
      targetEntity: 'reports_and_complaints',
      targetId: reportId,
      reason: admin_notes ? admin_notes.trim() : `Status marked as ${status}`,
      details: { newStatus: status },
      ipAddress: req.ip
    });

    res.json({ success: true, message: `Report marked as ${status}.` });
  } catch (error) {
    console.error('[AdminRoutes] Update complaint error:', error);
    res.status(500).json({ success: false, error: 'Failed to update complaint.' });
  }
});

// ============================================================================
// 6. APPOINTMENT OVERSIGHT (Platform-Wide)
// ============================================================================
router.get('/appointments', async (req, res) => {
  try {
    const { search, status, clinic } = req.query;

    let sql = `
      SELECT a.*, p.name as pet_name, p.species, u.full_name as owner_name, u.email as owner_email, u.phone as owner_phone
      FROM appointments a
      JOIN pets p ON a.pet_id = p.id
      JOIN users u ON a.user_id = u.id
      WHERE 1=1
    `;
    const params = [];

    if (search && search.trim() !== '') {
      sql += ' AND (p.name LIKE ? OR a.clinic_name LIKE ? OR u.full_name LIKE ?)';
      params.push(`%${search.trim()}%`, `%${search.trim()}%`, `%${search.trim()}%`);
    }
    if (status && status.trim() !== '') {
      sql += ' AND a.status = ?';
      params.push(status.trim());
    }
    if (clinic && clinic.trim() !== '') {
      sql += ' AND a.clinic_name LIKE ?';
      params.push(`%${clinic.trim()}%`);
    }

    sql += ' ORDER BY a.appointment_date DESC';

    const [appointments] = await query(sql, params);

    res.json({
      success: true,
      appointments,
      oversight_disclaimer: 'Oversight records are aggregated from user entries. Unless an official clinic API booking integration is established, administrators cannot confirm clinic bookings.'
    });
  } catch (error) {
    console.error('[AdminRoutes] Appointments oversight error:', error);
    res.status(500).json({ success: false, error: 'Failed to load appointment records.' });
  }
});

// Audited Administrative Modification of Appointment Record
router.put('/appointments/:id', async (req, res) => {
  try {
    const appointmentId = req.params.id;
    const { status, appointment_date, admin_reason, admin_notes } = req.body;
    const adminUser = req.session.user;

    if (!admin_reason || admin_reason.trim() === '') {
      return res.status(400).json({
        success: false,
        error: 'Mandatory Policy: Any administrative modification of an appointment record requires a documented administrative reason.'
      });
    }

    const [existing] = await query(
      `SELECT a.*, p.name as pet_name, u.id as owner_id, u.email as owner_email
       FROM appointments a
       JOIN pets p ON a.pet_id = p.id
       JOIN users u ON a.user_id = u.id
       WHERE a.id = ?`,
      [appointmentId]
    );

    if (existing.length === 0) {
      return res.status(404).json({ success: false, error: 'Appointment not found.' });
    }

    const apt = existing[0];

    await query(
      `UPDATE appointments SET
        status = ?, appointment_date = ?, admin_notes = ?, last_modified_by_admin = true
       WHERE id = ?`,
      [
        status || apt.status,
        appointment_date || apt.appointment_date,
        admin_notes ? admin_notes.trim() : apt.admin_notes,
        appointmentId
      ]
    );

    // Notify pet owner of administrative correction
    await query(
      `INSERT INTO notifications (user_id, title, message, type, link)
       VALUES (?, 'Administrative Update on Appointment', ?, 'system', '/owner/appointments.html')`,
      [apt.owner_id, `Your appointment record for ${apt.pet_name} was administratively updated. Reason: ${admin_reason.trim()}`]
    );

    // Audit log
    await logAdminAction({
      adminId: adminUser.id,
      adminName: adminUser.full_name,
      actionType: 'ADMIN_MODIFY_APPOINTMENT',
      targetEntity: 'appointments',
      targetId: appointmentId,
      reason: admin_reason.trim(),
      details: {
        petName: apt.pet_name,
        previousStatus: apt.status,
        newStatus: status || apt.status,
        ownerEmail: apt.owner_email
      },
      ipAddress: req.ip
    });

    res.json({
      success: true,
      message: 'Appointment record administratively updated and recorded in audit log.'
    });
  } catch (error) {
    console.error('[AdminRoutes] Modify appointment error:', error);
    res.status(500).json({ success: false, error: 'Failed to modify appointment record.' });
  }
});

// ============================================================================
// 7. CLINIC DIRECTORY MANAGEMENT
// ============================================================================
router.get('/clinics', async (req, res) => {
  try {
    const [clinics] = await query('SELECT * FROM clinics ORDER BY is_verified DESC, name ASC');
    res.json({ success: true, clinics });
  } catch (error) {
    console.error('[AdminRoutes] Clinics list error:', error);
    res.status(500).json({ success: false, error: 'Failed to retrieve clinics.' });
  }
});

router.post('/clinics', async (req, res) => {
  try {
    const { name, phone, email, address, city, website, hours, services, is_verified } = req.body;
    const adminUser = req.session.user;

    if (!name || !phone || !address || !city) {
      return res.status(400).json({ success: false, error: 'Name, phone, address, and city are required.' });
    }

    const [result] = await query(
      `INSERT INTO clinics (name, phone, email, address, city, website, hours, services, is_verified)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        name.trim(),
        phone.trim(),
        email ? email.trim() : null,
        address.trim(),
        city.trim(),
        website ? website.trim() : null,
        hours ? hours.trim() : null,
        services ? services.trim() : null,
        is_verified === true || is_verified === 'true'
      ]
    );

    await logAdminAction({
      adminId: adminUser.id,
      adminName: adminUser.full_name,
      actionType: 'ADD_CLINIC',
      targetEntity: 'clinics',
      targetId: result.insertId,
      reason: 'Clinic directory addition',
      details: { clinicName: name },
      ipAddress: req.ip
    });

    res.status(201).json({ success: true, message: 'Clinic added to directory.', clinic_id: result.insertId });
  } catch (error) {
    console.error('[AdminRoutes] Add clinic error:', error);
    res.status(500).json({ success: false, error: 'Failed to add clinic.' });
  }
});

router.put('/clinics/:id', async (req, res) => {
  try {
    const clinicId = req.params.id;
    const { name, phone, email, address, city, website, hours, services, is_verified } = req.body;
    const adminUser = req.session.user;

    await query(
      `UPDATE clinics SET
        name = ?, phone = ?, email = ?, address = ?, city = ?,
        website = ?, hours = ?, services = ?, is_verified = ?
       WHERE id = ?`,
      [
        name.trim(),
        phone.trim(),
        email ? email.trim() : null,
        address.trim(),
        city.trim(),
        website ? website.trim() : null,
        hours ? hours.trim() : null,
        services ? services.trim() : null,
        is_verified === true || is_verified === 'true',
        clinicId
      ]
    );

    await logAdminAction({
      adminId: adminUser.id,
      adminName: adminUser.full_name,
      actionType: 'UPDATE_CLINIC',
      targetEntity: 'clinics',
      targetId: clinicId,
      reason: 'Clinic directory update',
      details: { clinicName: name },
      ipAddress: req.ip
    });

    res.json({ success: true, message: 'Clinic directory record updated.' });
  } catch (error) {
    console.error('[AdminRoutes] Update clinic error:', error);
    res.status(500).json({ success: false, error: 'Failed to update clinic.' });
  }
});

router.delete('/clinics/:id', async (req, res) => {
  try {
    const clinicId = req.params.id;
    const adminUser = req.session.user;

    await query('DELETE FROM clinics WHERE id = ?', [clinicId]);

    await logAdminAction({
      adminId: adminUser.id,
      adminName: adminUser.full_name,
      actionType: 'DELETE_CLINIC',
      targetEntity: 'clinics',
      targetId: clinicId,
      reason: 'Clinic directory removal',
      details: null,
      ipAddress: req.ip
    });

    res.json({ success: true, message: 'Clinic removed from directory.' });
  } catch (error) {
    console.error('[AdminRoutes] Delete clinic error:', error);
    res.status(500).json({ success: false, error: 'Failed to delete clinic.' });
  }
});

// ============================================================================
// 8. NOTIFICATION & REMINDER MONITORING
// ============================================================================
router.get('/reminders', async (req, res) => {
  try {
    const { status, type } = req.query;

    let sql = 'SELECT * FROM reminders_log WHERE 1=1';
    const params = [];

    if (status && status.trim() !== '') {
      sql += ' AND status = ?';
      params.push(status.trim());
    }
    if (type && type.trim() !== '') {
      sql += ' AND type = ?';
      params.push(type.trim());
    }

    sql += ' ORDER BY created_at DESC LIMIT 100';

    const [logs] = await query(sql, params);

    // Summary count
    const [counts] = await query(`
      SELECT 
        COUNT(*) as total,
        SUM(CASE WHEN status = 'delivered' THEN 1 ELSE 0 END) as delivered,
        SUM(CASE WHEN status = 'accepted_by_provider' THEN 1 ELSE 0 END) as accepted,
        SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) as failed,
        SUM(CASE WHEN status = 'processing' THEN 1 ELSE 0 END) as processing
      FROM reminders_log
    `);

    res.json({ success: true, logs, summary: counts[0] });
  } catch (error) {
    console.error('[AdminRoutes] Reminders monitoring error:', error);
    res.status(500).json({ success: false, error: 'Failed to retrieve reminder logs.' });
  }
});

// Retry Failed Reminder / Email
router.post('/reminders/:id/retry', async (req, res) => {
  try {
    const logId = req.params.id;
    const adminUser = req.session.user;

    const [existing] = await query('SELECT * FROM reminders_log WHERE id = ?', [logId]);
    if (existing.length === 0) {
      return res.status(404).json({ success: false, error: 'Reminder record not found.' });
    }

    const log = existing[0];
    const newRetryCount = (log.retry_count || 0) + 1;

    // Retry sending
    const sendResult = await sendTransactionalEmail({
      to: log.recipient_email || 'test@example.com',
      subject: `[Retry #${newRetryCount}] PetCare Passport Notification`,
      text: 'Notification retry attempted by system administrator.',
      referenceType: log.type,
      referenceId: log.reference_id
    });

    const newStatus = sendResult.success ? 'accepted_by_provider' : 'failed';
    const errorMsg = sendResult.success ? null : (sendResult.error || 'Retry failed');

    await query(
      'UPDATE reminders_log SET status = ?, error_message = ?, retry_count = ? WHERE id = ?',
      [newStatus, errorMsg, newRetryCount, logId]
    );

    await logAdminAction({
      adminId: adminUser.id,
      adminName: adminUser.full_name,
      actionType: 'RETRY_REMINDER',
      targetEntity: 'reminders_log',
      targetId: logId,
      reason: `Manual retry attempt #${newRetryCount}`,
      details: { outcome: newStatus },
      ipAddress: req.ip
    });

    res.json({
      success: true,
      message: `Retry attempted: ${newStatus}`,
      status: newStatus
    });
  } catch (error) {
    console.error('[AdminRoutes] Retry reminder error:', error);
    res.status(500).json({ success: false, error: 'Failed to retry reminder processing.' });
  }
});

// ============================================================================
// 9. AUDIT LOGS
// ============================================================================
router.get('/audit-logs', async (req, res) => {
  try {
    const { action, entity } = req.query;

    let sql = 'SELECT * FROM audit_logs WHERE 1=1';
    const params = [];

    if (action && action.trim() !== '') {
      sql += ' AND action_type LIKE ?';
      params.push(`%${action.trim()}%`);
    }
    if (entity && entity.trim() !== '') {
      sql += ' AND target_entity = ?';
      params.push(entity.trim());
    }

    sql += ' ORDER BY created_at DESC LIMIT 100';

    const [logs] = await query(sql, params);

    res.json({ success: true, logs });
  } catch (error) {
    console.error('[AdminRoutes] Audit logs error:', error);
    res.status(500).json({ success: false, error: 'Failed to retrieve audit logs.' });
  }
});

// ============================================================================
// 10. SYSTEM HEALTH
// ============================================================================
router.get('/system-health', async (req, res) => {
  try {
    const dbHealth = await checkDbHealth();

    // Sensitive keys are NEVER exposed!
    const aiConfig = {
      provider: process.env.AI_PROVIDER || 'gemini',
      geminiConfigured: !!(process.env.GEMINI_API_KEY && process.env.GEMINI_API_KEY.trim() !== ''),
      geminiModel: process.env.GEMINI_MODEL || 'gemini-1.5-flash',
      openRouterConfigured: !!(process.env.OPENROUTER_API_KEY && process.env.OPENROUTER_API_KEY.trim() !== ''),
      openRouterModel: process.env.OPENROUTER_MODEL || 'meta-llama/llama-3-8b-instruct'
    };

    const emailConfig = {
      provider: process.env.EMAIL_PROVIDER || 'resend',
      resendConfigured: !!(process.env.RESEND_API_KEY && process.env.RESEND_API_KEY.trim() !== ''),
      fromAddress: process.env.EMAIL_FROM || 'configured'
    };

    const serverUptimeSeconds = Math.floor(process.uptime());
    const memUsage = process.memoryUsage();

    res.json({
      success: true,
      timestamp: new Date().toISOString(),
      database: dbHealth,
      ai_service: aiConfig,
      email_service: emailConfig,
      server: {
        uptime_seconds: serverUptimeSeconds,
        uptime_human: `${Math.floor(serverUptimeSeconds / 3600)}h ${Math.floor((serverUptimeSeconds % 3600) / 60)}m ${serverUptimeSeconds % 60}s`,
        node_version: process.version,
        platform: os.platform(),
        memory: {
          heapUsedMb: Math.round(memUsage.heapUsed / 1024 / 1024 * 100) / 100,
          heapTotalMb: Math.round(memUsage.heapTotal / 1024 / 1024 * 100) / 100,
          rssMb: Math.round(memUsage.rss / 1024 / 1024 * 100) / 100
        }
      }
    });
  } catch (error) {
    console.error('[AdminRoutes] System health error:', error);
    res.status(500).json({ success: false, error: 'Failed to inspect system health.' });
  }
});

module.exports = router;
