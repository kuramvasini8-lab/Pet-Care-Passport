-- ============================================================================
-- PetCare Passport - Safe Production Demo Data Cleanup Migration
-- 
-- Explicitly removes ONLY known demo accounts and sample seed records.
-- Legitimate user accounts, real pets, and custom administrators are PRESERVED.
-- ============================================================================

USE `petcare_passport`;

START TRANSACTION;

-- 1. Verify accounts to be preserved vs accounts to be removed
SELECT id, full_name, email, role, status 
FROM users 
WHERE email NOT IN ('admin@petcarepassport.com', 'sarah@example.com', 'mark@example.com');

-- 2. Identify and delete demo user accounts
-- Due to foreign key ON DELETE CASCADE constraints, this automatically cleans:
-- - Demo pets (Luna, Milo, etc.)
-- - Demo digital passports & QR codes
-- - Demo health records & veterinary logs
-- - Demo vaccinations & due dates
-- - Demo daily care routines & tasks
-- - Demo notifications
-- - Demo password reset tokens
DELETE FROM users 
WHERE email IN (
  'admin@petcarepassport.com',
  'sarah@example.com',
  'mark@example.com'
);

-- 3. Delete any orphaned demo pets by known sample public IDs (if any exist)
DELETE FROM pets 
WHERE public_id IN (
  'luna-pass-a9b8c7d6',
  'milo-pass-e1f2g3h4',
  'barnaby-pass-j5k6l7m8',
  'cleo-pass-x1y2z3a4',
  'rocky-pass-99887766'
);

-- 4. Delete demo lost & found notices submitted with demo contact emails
DELETE FROM lost_found_reports 
WHERE contact_email IN (
  'sarah@example.com',
  'jennifer@example.com'
);

-- 5. Delete demo reminder log telemetry entries
DELETE FROM reminders_log 
WHERE recipient_email IN (
  'admin@petcarepassport.com',
  'sarah@example.com',
  'mark@example.com'
);

-- 6. Record cleanup in immutable audit logs
INSERT INTO audit_logs (
  admin_id, 
  admin_name, 
  action_type, 
  target_entity, 
  target_id, 
  reason, 
  details, 
  ip_address
) VALUES (
  NULL, 
  'Production Migration SQL', 
  'DEMO_DATA_CLEANUP', 
  'database', 
  0, 
  'Safe production demo accounts and seed records purged', 
  JSON_OBJECT('status', 'completed', 'cleaned_demo_emails', JSON_ARRAY('admin@petcarepassport.com', 'sarah@example.com', 'mark@example.com')),
  '127.0.0.1'
);

COMMIT;

-- 7. Verification: Confirm 0 demo accounts remain
SELECT COUNT(*) AS demo_users_remaining 
FROM users 
WHERE email IN ('admin@petcarepassport.com', 'sarah@example.com', 'mark@example.com');
