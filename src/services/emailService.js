/**
 * Transactional Email Service (Resend HTTP API + Audit Logging)
 */
const { query } = require('../config/db');

async function sendTransactionalEmail({
  to,
  subject,
  html,
  text = '',
  referenceType = 'email_notification',
  referenceId = 0
}) {
  const apiKey = process.env.RESEND_API_KEY;
  const fromEmail = process.env.EMAIL_FROM || 'PetCare Passport <notifications@petcarepassport.com>';

  // Log creation in reminders_log
  let logId = null;
  try {
    const [result] = await query(
      `INSERT INTO reminders_log (type, reference_id, recipient_email, status, retry_count)
       VALUES (?, ?, ?, 'processing', 0)`,
      [referenceType, referenceId, to]
    );
    logId = result.insertId;
  } catch (err) {
    console.error('[EmailService] Failed to record initial email log:', err.message);
  }

  // If no API key configured, run in local simulation mode
  if (!apiKey || apiKey.trim() === '') {
    console.log(`[EmailService (Simulation)] To: ${to} | Subject: "${subject}"`);
    console.log(`[EmailService (Simulation)] Content preview: ${text.slice(0, 120)}...`);
    
    if (logId) {
      await query(
        `UPDATE reminders_log SET status = 'accepted_by_provider' WHERE id = ?`,
        [logId]
      );
    }
    return {
      success: true,
      simulated: true,
      message: 'Email simulated (No RESEND_API_KEY provided in .env)'
    };
  }

  // Real Resend HTTP API call
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000); // 8-second timeout

    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey.trim()}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        from: fromEmail,
        to: [to],
        subject,
        html,
        text
      }),
      signal: controller.signal
    });

    clearTimeout(timeout);
    const data = await response.json();

    if (!response.ok) {
      const errorMsg = data.message || `HTTP ${response.status}: Failed to dispatch email`;
      if (logId) {
        await query(
          `UPDATE reminders_log SET status = 'failed', error_message = ? WHERE id = ?`,
          [errorMsg, logId]
        );
      }
      return { success: false, error: errorMsg };
    }

    if (logId) {
      await query(
        `UPDATE reminders_log SET status = 'accepted_by_provider' WHERE id = ?`,
        [logId]
      );
    }

    return { success: true, providerId: data.id };
  } catch (err) {
    const errorMsg = err.name === 'AbortError' ? 'Email request timed out after 8s' : err.message;
    console.error('[EmailService] Dispatch failed:', errorMsg);
    if (logId) {
      await query(
        `UPDATE reminders_log SET status = 'failed', error_message = ? WHERE id = ?`,
        [errorMsg, logId]
      );
    }
    return { success: false, error: errorMsg };
  }
}

module.exports = {
  sendTransactionalEmail
};
