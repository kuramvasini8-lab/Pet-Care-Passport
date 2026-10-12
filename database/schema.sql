-- ============================================================================
-- PetCare Passport - Comprehensive Database Schema (MySQL 8.0+)
-- ============================================================================

USE `defaultdb`;
-- Tables are created safely with IF NOT EXISTS to prevent accidental data loss in production.

-- ----------------------------------------------------------------------------
-- 1. USERS TABLE
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `users` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `full_name` VARCHAR(150) NOT NULL,
  `email` VARCHAR(191) NOT NULL UNIQUE,
  `password_hash` VARCHAR(255) NOT NULL,
  `phone` VARCHAR(50) NULL,
  `role` ENUM('user', 'admin') NOT NULL DEFAULT 'user',
  `status` ENUM('active', 'suspended') NOT NULL DEFAULT 'active',
  `suspension_reason` TEXT NULL,
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX `idx_users_role` (`role`),
  INDEX `idx_users_status` (`status`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ----------------------------------------------------------------------------
-- 1.1 PASSWORD RESETS TABLE
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `password_resets` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `user_id` INT NOT NULL,
  `email` VARCHAR(191) NOT NULL,
  `token` VARCHAR(255) NOT NULL UNIQUE,
  `expires_at` DATETIME NOT NULL,
  `used` TINYINT(1) DEFAULT 0,
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX `idx_pw_resets_token` (`token`),
  INDEX `idx_pw_resets_user` (`user_id`),
  FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ----------------------------------------------------------------------------
-- 2. PETS TABLE
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `pets` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `user_id` INT NOT NULL,
  `public_id` VARCHAR(64) NOT NULL UNIQUE,
  `name` VARCHAR(100) NOT NULL,
  `species` VARCHAR(50) NOT NULL,
  `breed` VARCHAR(100) NULL,
  `dob_or_age` VARCHAR(50) NULL,
  `sex` ENUM('Male', 'Female', 'Unknown') DEFAULT 'Unknown',
  `color_marks` VARCHAR(255) NULL,
  `microchip_number` VARCHAR(100) NULL,
  `weight` DECIMAL(5,2) NULL,
  `blood_group` VARCHAR(20) NULL,
  `is_sterilized` BOOLEAN DEFAULT FALSE,
  `dietary_requirements` TEXT NULL,
  `allergies` TEXT NULL,
  `medical_conditions` TEXT NULL,
  `current_medications` TEXT NULL,
  `special_care` TEXT NULL,
  `notes` TEXT NULL,
  `photo_url` VARCHAR(255) NULL,
  `is_missing` BOOLEAN DEFAULT FALSE,
  `missing_since` DATETIME NULL,
  `missing_notes` TEXT NULL,
  `is_archived` BOOLEAN DEFAULT FALSE,
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT `fk_pets_user` FOREIGN KEY (`user_id`)
    REFERENCES `users` (`id`) ON DELETE CASCADE,
  INDEX `idx_pets_user_id` (`user_id`),
  INDEX `idx_pets_public_id` (`public_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ----------------------------------------------------------------------------
-- 3. PASSPORTS TABLE (Digital Passport Privacy & Controls)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `passports` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `pet_id` INT NOT NULL UNIQUE,
  `is_public_enabled` BOOLEAN DEFAULT TRUE,
  `show_photo` BOOLEAN DEFAULT TRUE,
  `show_name` BOOLEAN DEFAULT TRUE,
  `show_breed` BOOLEAN DEFAULT TRUE,
  `show_emergency_contact` BOOLEAN DEFAULT FALSE,
  `emergency_contact_name` VARCHAR(100) NULL,
  `emergency_contact_phone` VARCHAR(50) NULL,
  `emergency_notes` TEXT NULL,
  `show_medical_alerts` BOOLEAN DEFAULT TRUE,
  `show_allergies` BOOLEAN DEFAULT TRUE,
  `show_vaccinations` BOOLEAN DEFAULT TRUE,
  `qr_code_url` LONGTEXT NULL,
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT `fk_passports_pet` FOREIGN KEY (`pet_id`)
    REFERENCES `pets` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ----------------------------------------------------------------------------
-- 4. HEALTH RECORDS TABLE
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `health_records` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `pet_id` INT NOT NULL,
  `record_type` ENUM('vet_visit', 'treatment', 'surgery', 'condition', 'allergy', 'lab_result', 'other') NOT NULL,
  `title` VARCHAR(200) NOT NULL,
  `date` DATE NOT NULL,
  `veterinarian_name` VARCHAR(150) NULL,
  `clinic_name` VARCHAR(150) NULL,
  `description` TEXT NULL,
  `treatment_plan` TEXT NULL,
  `follow_up_instructions` TEXT NULL,
  `entry_source` ENUM('owner_entered', 'clinic_verified') DEFAULT 'owner_entered',
  `document_url` VARCHAR(255) NULL,
  `document_name` VARCHAR(255) NULL,
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT `fk_health_pet` FOREIGN KEY (`pet_id`)
    REFERENCES `pets` (`id`) ON DELETE CASCADE,
  INDEX `idx_health_pet_date` (`pet_id`, `date`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ----------------------------------------------------------------------------
-- 5. VACCINATIONS TABLE
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `vaccinations` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `pet_id` INT NOT NULL,
  `vaccine_name` VARCHAR(150) NOT NULL,
  `administered_date` DATE NOT NULL,
  `next_due_date` DATE NULL,
  `clinic_name` VARCHAR(150) NULL,
  `batch_number` VARCHAR(100) NULL,
  `document_url` VARCHAR(255) NULL,
  `entry_source` ENUM('owner_entered', 'clinic_verified') DEFAULT 'owner_entered',
  `notes` TEXT NULL,
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT `fk_vaccinations_pet` FOREIGN KEY (`pet_id`)
    REFERENCES `pets` (`id`) ON DELETE CASCADE,
  INDEX `idx_vacc_next_due` (`next_due_date`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ----------------------------------------------------------------------------
-- 6. DAILY CARE TASKS TABLE
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `daily_care_tasks` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `pet_id` INT NOT NULL,
  `task_type` ENUM('medication', 'feeding', 'grooming', 'walking', 'recurring_care', 'follow_up', 'other') NOT NULL,
  `title` VARCHAR(150) NOT NULL,
  `description` TEXT NULL,
  `dosage_instruction` VARCHAR(255) NULL,
  `frequency` ENUM('once', 'daily', 'twice_daily', 'weekly', 'as_needed') DEFAULT 'daily',
  `due_date` DATE NULL,
  `due_time` TIME NULL,
  `is_completed` BOOLEAN DEFAULT FALSE,
  `completed_at` DATETIME NULL,
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT `fk_care_tasks_pet` FOREIGN KEY (`pet_id`)
    REFERENCES `pets` (`id`) ON DELETE CASCADE,
  INDEX `idx_care_pet_completed` (`pet_id`, `is_completed`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ----------------------------------------------------------------------------
-- 7. APPOINTMENTS TABLE
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `appointments` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `pet_id` INT NOT NULL,
  `user_id` INT NOT NULL,
  `clinic_name` VARCHAR(150) NOT NULL,
  `veterinarian_name` VARCHAR(150) NULL,
  `appointment_date` DATETIME NOT NULL,
  `purpose` VARCHAR(255) NOT NULL,
  `status` ENUM('upcoming', 'completed', 'cancelled', 'rescheduled') DEFAULT 'upcoming',
  `notes` TEXT NULL,
  `follow_up_notes` TEXT NULL,
  `admin_notes` TEXT NULL,
  `last_modified_by_admin` BOOLEAN DEFAULT FALSE,
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT `fk_appointments_pet` FOREIGN KEY (`pet_id`)
    REFERENCES `pets` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_appointments_user` FOREIGN KEY (`user_id`)
    REFERENCES `users` (`id`) ON DELETE CASCADE,
  INDEX `idx_appointments_date_status` (`appointment_date`, `status`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ----------------------------------------------------------------------------
-- 8. ADOPTION LISTINGS TABLE
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `adoption_listings` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `pet_id` INT NOT NULL,
  `user_id` INT NOT NULL,
  `title` VARCHAR(200) NOT NULL,
  `description` TEXT NOT NULL,
  `reason_for_rehoming` TEXT NULL,
  `temperament` TEXT NULL,
  `health_summary` TEXT NULL,
  `adoption_requirements` TEXT NULL,
  `general_location` VARCHAR(150) NOT NULL,
  `owner_full_name` VARCHAR(150) NULL,
  `owner_phone` VARCHAR(50) NULL,
  `owner_email` VARCHAR(191) NULL,
  `safe_pickup_location` VARCHAR(255) NULL,
  `compatibility_kids` VARCHAR(50) NULL,
  `compatibility_pets` VARCHAR(50) NULL,
  `adoption_fee` VARCHAR(100) NULL,
  `status` ENUM('pending_approval', 'approved', 'changes_requested', 'rejected', 'suspended', 'adopted', 'closed') DEFAULT 'pending_approval',
  `moderation_notes` TEXT NULL,
  `moderated_by` INT NULL,
  `moderated_at` DATETIME NULL,
  `is_verified` BOOLEAN DEFAULT FALSE,
  `verified_by` INT NULL,
  `verified_at` DATETIME NULL,
  `verification_notes` TEXT NULL,
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT `fk_listings_pet` FOREIGN KEY (`pet_id`)
    REFERENCES `pets` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_listings_user` FOREIGN KEY (`user_id`)
    REFERENCES `users` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_listings_moderator` FOREIGN KEY (`moderated_by`)
    REFERENCES `users` (`id`) ON DELETE SET NULL,
  INDEX `idx_listings_status` (`status`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ----------------------------------------------------------------------------
-- 9. ADOPTION ENQUIRIES TABLE
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `adoption_enquiries` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `listing_id` INT NOT NULL,
  `user_id` INT NULL,
  `inquirer_name` VARCHAR(150) NOT NULL,
  `inquirer_email` VARCHAR(191) NOT NULL,
  `inquirer_phone` VARCHAR(50) NULL,
  `message` TEXT NOT NULL,
  `household_info` TEXT NULL,
  `status` ENUM('new', 'contacted', 'closed') DEFAULT 'new',
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT `fk_enquiries_listing` FOREIGN KEY (`listing_id`)
    REFERENCES `adoption_listings` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_enquiries_user` FOREIGN KEY (`user_id`)
    REFERENCES `users` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ----------------------------------------------------------------------------
-- 10. ADOPTION APPLICATIONS TABLE
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `adoption_applications` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `listing_id` INT NOT NULL,
  `applicant_id` INT NOT NULL,
  `applicant_name` VARCHAR(150) NULL,
  `applicant_phone` VARCHAR(50) NULL,
  `applicant_email` VARCHAR(191) NULL,
  `applicant_address` TEXT NULL,
  `id_proof_type` VARCHAR(100) NULL,
  `id_proof_number` VARCHAR(100) NULL,
  `household_type` VARCHAR(100) NOT NULL,
  `housing_ownership` VARCHAR(50) NULL,
  `owns_other_pets` BOOLEAN DEFAULT FALSE,
  `has_yard` BOOLEAN DEFAULT FALSE,
  `experience_description` TEXT NULL,
  `emergency_vet` VARCHAR(255) NULL,
  `reference_contact` VARCHAR(255) NULL,
  `notes` TEXT NULL,
  `status` ENUM('submitted', 'under_review', 'more_info_requested', 'accepted', 'declined', 'withdrawn') DEFAULT 'submitted',
  `status_reason` TEXT NULL,
  `giver_name` VARCHAR(150) NULL,
  `giver_phone` VARCHAR(50) NULL,
  `giver_email` VARCHAR(191) NULL,
  `giver_address` TEXT NULL,
  `admin_handover_notes` TEXT NULL,
  `contact_shared_at` DATETIME NULL,
  `contact_shared` BOOLEAN DEFAULT FALSE,
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT `fk_applications_listing` FOREIGN KEY (`listing_id`)
    REFERENCES `adoption_listings` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_applications_applicant` FOREIGN KEY (`applicant_id`)
    REFERENCES `users` (`id`) ON DELETE CASCADE,
  INDEX `idx_applications_status` (`status`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ----------------------------------------------------------------------------
-- 11. FAVOURITES TABLE
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `favourites` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `user_id` INT NOT NULL,
  `listing_id` INT NOT NULL,
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT `fk_fav_user` FOREIGN KEY (`user_id`)
    REFERENCES `users` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_fav_listing` FOREIGN KEY (`listing_id`)
    REFERENCES `adoption_listings` (`id`) ON DELETE CASCADE,
  UNIQUE KEY `uq_user_listing_fav` (`user_id`, `listing_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ----------------------------------------------------------------------------
-- 12. LOST & FOUND REPORTS TABLE
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `lost_found_reports` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `user_id` INT NULL,
  `report_type` ENUM('lost', 'found') NOT NULL,
  `pet_name` VARCHAR(100) NULL,
  `species` VARCHAR(50) NOT NULL,
  `breed` VARCHAR(100) NULL,
  `color_markings` VARCHAR(255) NOT NULL,
  `date_lost_or_found` DATE NOT NULL,
  `general_location` VARCHAR(255) NOT NULL,
  `description` TEXT NOT NULL,
  `photo_url` VARCHAR(255) NULL,
  `contact_name` VARCHAR(150) NOT NULL,
  `contact_phone` VARCHAR(50) NOT NULL,
  `contact_email` VARCHAR(191) NOT NULL,
  `status` ENUM('pending_review', 'published', 'reunited', 'suspended', 'closed') DEFAULT 'published',
  `admin_notes` TEXT NULL,
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT `fk_lf_user` FOREIGN KEY (`user_id`)
    REFERENCES `users` (`id`) ON DELETE SET NULL,
  INDEX `idx_lf_status` (`status`),
  INDEX `idx_lf_type` (`report_type`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ----------------------------------------------------------------------------
-- 13. LOST & FOUND SIGHTINGS TABLE
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `lost_found_sightings` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `report_id` INT NOT NULL,
  `reporter_name` VARCHAR(150) NOT NULL,
  `reporter_contact` VARCHAR(150) NOT NULL,
  `sighting_date` DATETIME NOT NULL,
  `location` VARCHAR(255) NOT NULL,
  `notes` TEXT NOT NULL,
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT `fk_sightings_report` FOREIGN KEY (`report_id`)
    REFERENCES `lost_found_reports` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ----------------------------------------------------------------------------
-- 14. REPORTS & COMPLAINTS TABLE
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `reports_and_complaints` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `user_id` INT NULL,
  `category` ENUM('adoption_listing', 'lost_found', 'user_account', 'appointment', 'scam_misleading', 'other') NOT NULL,
  `target_id` INT NULL,
  `reporter_email` VARCHAR(191) NOT NULL,
  `subject` VARCHAR(200) NOT NULL,
  `details` TEXT NOT NULL,
  `status` ENUM('open', 'under_review', 'resolved', 'dismissed') DEFAULT 'open',
  `admin_notes` TEXT NULL,
  `resolved_by` INT NULL,
  `resolved_at` DATETIME NULL,
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT `fk_complaints_user` FOREIGN KEY (`user_id`)
    REFERENCES `users` (`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_complaints_resolver` FOREIGN KEY (`resolved_by`)
    REFERENCES `users` (`id`) ON DELETE SET NULL,
  INDEX `idx_complaints_status` (`status`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ----------------------------------------------------------------------------
-- 15. CLINICS DIRECTORY TABLE
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `clinics` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `name` VARCHAR(150) NOT NULL,
  `phone` VARCHAR(50) NOT NULL,
  `email` VARCHAR(191) NULL,
  `address` VARCHAR(255) NOT NULL,
  `city` VARCHAR(100) NOT NULL,
  `website` VARCHAR(255) NULL,
  `hours` VARCHAR(200) NULL,
  `services` TEXT NULL,
  `is_verified` BOOLEAN DEFAULT FALSE,
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ----------------------------------------------------------------------------
-- 16. NOTIFICATIONS TABLE
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `notifications` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `user_id` INT NOT NULL,
  `title` VARCHAR(150) NOT NULL,
  `message` TEXT NOT NULL,
  `type` ENUM('reminder', 'enquiry', 'application', 'moderation', 'system') DEFAULT 'system',
  `is_read` BOOLEAN DEFAULT FALSE,
  `link` VARCHAR(255) NULL,
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT `fk_notifications_user` FOREIGN KEY (`user_id`)
    REFERENCES `users` (`id`) ON DELETE CASCADE,
  INDEX `idx_notif_user_read` (`user_id`, `is_read`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ----------------------------------------------------------------------------
-- 17. REMINDERS & NOTIFICATION MONITORING LOG
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `reminders_log` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `type` ENUM('vaccination', 'appointment', 'daily_task', 'email_notification') NOT NULL,
  `reference_id` INT NOT NULL,
  `recipient_email` VARCHAR(191) NULL,
  `status` ENUM('created', 'queued', 'processing', 'accepted_by_provider', 'delivered', 'failed') DEFAULT 'created',
  `error_message` TEXT NULL,
  `retry_count` INT DEFAULT 0,
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX `idx_reminders_status` (`status`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ----------------------------------------------------------------------------
-- 18. AUDIT LOGS TABLE
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `audit_logs` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `admin_id` INT NULL,
  `admin_name` VARCHAR(150) NOT NULL,
  `action_type` VARCHAR(100) NOT NULL,
  `target_entity` VARCHAR(100) NOT NULL,
  `target_id` INT NULL,
  `reason` TEXT NULL,
  `details` TEXT NULL,
  `ip_address` VARCHAR(50) NULL,
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT `fk_audit_admin` FOREIGN KEY (`admin_id`)
    REFERENCES `users` (`id`) ON DELETE SET NULL,
  INDEX `idx_audit_entity` (`target_entity`, `target_id`),
  INDEX `idx_audit_created` (`created_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
