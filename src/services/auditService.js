/**
 * Administrative Audit Logging Service
 */
const { query } = require('../config/db');

async function logAdminAction({
  adminId,
  adminName,
  actionType,
  targetEntity,
  targetId = null,
  reason = null,
  details = null,
  ipAddress = '127.0.0.1'
}) {
  try {
    const detailsStr = typeof details === 'object' ? JSON.stringify(details) : (details || null);
    await query(
      `INSERT INTO audit_logs (admin_id, admin_name, action_type, target_entity, target_id, reason, details, ip_address)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [adminId || null, adminName || 'System', actionType, targetEntity, targetId, reason, detailsStr, ipAddress]
    );
  } catch (error) {
    console.error('[AuditService] Failed to record audit log:', error.message);
  }
}

module.exports = {
  logAdminAction
};
