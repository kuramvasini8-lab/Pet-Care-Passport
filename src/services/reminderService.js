/**
 * Automated Reminder Engine & Notification Scheduler
 * Monitors vaccination deadlines, upcoming appointments, and daily care tasks.
 */
const { query } = require('../config/db');
const { sendTransactionalEmail } = require('./emailService');

async function processSystemReminders() {
  const results = {
    vaccinationsChecked: 0,
    vaccinationsDueOrOverdue: 0,
    appointmentsChecked: 0,
    notificationsGenerated: 0
  };

  try {
    // 1. Check Vaccinations due within 14 days or overdue
    const [vaccRows] = await query(`
      SELECT v.id as vacc_id, v.vaccine_name, v.next_due_date, p.id as pet_id, p.name as pet_name, u.id as user_id, u.email as user_email
      FROM vaccinations v
      JOIN pets p ON v.pet_id = p.id
      JOIN users u ON p.user_id = u.id
      WHERE v.next_due_date IS NOT NULL
        AND v.next_due_date <= DATE_ADD(CURDATE(), INTERVAL 14 DAY)
        AND p.is_archived = false
    `);

    results.vaccinationsChecked = vaccRows.length;

    for (const v of vaccRows) {
      results.vaccinationsDueOrOverdue++;
      const isOverdue = new Date(v.next_due_date) < new Date();
      const statusText = isOverdue ? 'is OVERDUE' : 'is due soon';
      const dueDateFormatted = typeof v.next_due_date === 'string' ? v.next_due_date.slice(0, 10) : new Date(v.next_due_date).toISOString().split('T')[0];
      const message = `${v.vaccine_name} for ${v.pet_name} ${statusText} (Due Date: ${dueDateFormatted}). Please schedule a veterinary appointment.`;

      // Check if notification already created in last 7 days to avoid spam
      const [existing] = await query(`
        SELECT id FROM notifications
        WHERE user_id = ? AND type = 'reminder' AND message LIKE ? AND created_at >= DATE_SUB(NOW(), INTERVAL 7 DAY)
      `, [v.user_id, `%${v.vaccine_name}%`]);

      if (existing.length === 0) {
        await query(`
          INSERT INTO notifications (user_id, title, message, type, link)
          VALUES (?, ?, ?, 'reminder', '/owner/vaccinations.html')
        `, [v.user_id, title, message]);

        results.notificationsGenerated++;

        // Send transactional email & log in reminders_log
        await sendTransactionalEmail({
          to: v.user_email,
          subject: title,
          text: message,
          html: `<div style="font-family:sans-serif;padding:16px;">
            <h2 style="color:#d97706;">🐾 ${title}</h2>
            <p>${message}</p>
            <p><a href="http://localhost:3000/owner/vaccinations.html" style="background:#0284c7;color:#fff;padding:8px 16px;text-decoration:none;border-radius:6px;">View Vaccinations</a></p>
          </div>`,
          referenceType: 'vaccination',
          referenceId: v.vacc_id
        });
      }
    }

    // 2. Check Upcoming Appointments within 3 days
    const [aptRows] = await query(`
      SELECT a.id as apt_id, a.appointment_date, a.clinic_name, a.purpose, p.name as pet_name, u.id as user_id, u.email as user_email
      FROM appointments a
      JOIN pets p ON a.pet_id = p.id
      JOIN users u ON a.user_id = u.id
      WHERE a.status = 'upcoming'
        AND a.appointment_date BETWEEN NOW() AND DATE_ADD(NOW(), INTERVAL 3 DAY)
    `);

    results.appointmentsChecked = aptRows.length;

    for (const a of aptRows) {
      const aptDateStr = typeof a.appointment_date === 'string'
        ? new Date(a.appointment_date.replace(' ', 'T')).toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' })
        : new Date(a.appointment_date).toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' });
      const title = `Upcoming Appointment: ${a.pet_name}`;
      const message = `Reminder: ${a.pet_name} has an appointment scheduled at ${a.clinic_name} for "${a.purpose}" on ${aptDateStr}.`;

      const [existingApt] = await query(`
        SELECT id FROM notifications
        WHERE user_id = ? AND type = 'reminder' AND message LIKE ? AND created_at >= DATE_SUB(NOW(), INTERVAL 3 DAY)
      `, [a.user_id, `%${a.clinic_name}%`]);

      if (existingApt.length === 0) {
        await query(`
          INSERT INTO notifications (user_id, title, message, type, link)
          VALUES (?, ?, ?, 'reminder', '/owner/appointments.html')
        `, [a.user_id, title, message]);

        results.notificationsGenerated++;

        await sendTransactionalEmail({
          to: a.user_email,
          subject: title,
          text: message,
          html: `<div style="font-family:sans-serif;padding:16px;">
            <h2 style="color:#0284c7;">🐾 ${title}</h2>
            <p>${message}</p>
            <p><a href="http://localhost:3000/owner/appointments.html" style="background:#0284c7;color:#fff;padding:8px 16px;text-decoration:none;border-radius:6px;">View Appointments</a></p>
          </div>`,
          referenceType: 'appointment',
          referenceId: a.apt_id
        });
      }
    }

    return { success: true, ...results };
  } catch (err) {
    console.error('[ReminderEngine] Execution error:', err.message);
    return { success: false, error: err.message };
  }
}

module.exports = {
  processSystemReminders
};
