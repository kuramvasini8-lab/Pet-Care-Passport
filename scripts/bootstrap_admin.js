/**
 * PetCare Passport - Secure Server-Side Administrator Bootstrap
 * 
 * Securely provisions the initial administrator account.
 * Idempotent: Does NOT reset passwords or create duplicate administrators on redeployment.
 * 
 * Usage:
 *   node scripts/bootstrap_admin.js --email admin@example.com --password "SecurePass123!" --name "Lead Admin"
 * 
 * Or via environment variables:
 *   ADMIN_BOOTSTRAP_EMAIL=admin@example.com
 *   ADMIN_BOOTSTRAP_PASSWORD=SecurePass123!
 *   ADMIN_BOOTSTRAP_NAME="Lead Admin"
 *   node scripts/bootstrap_admin.js
 */
const mysql = require('mysql2/promise');
const bcrypt = require('bcryptjs');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

const DB_CONFIG = {
  host: process.env.MYSQL_HOST || 'localhost',
  port: parseInt(process.env.MYSQL_PORT || '3366', 10),
  user: process.env.MYSQL_USER || 'root',
  password: process.env.MYSQL_PASSWORD || '',
  database: process.env.MYSQL_DATABASE || 'petcare_passport'
};

function parseArgs() {
  const args = process.argv.slice(2);
  const options = {};
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--email' && args[i + 1]) {
      options.email = args[++i];
    } else if (args[i] === '--password' && args[i + 1]) {
      options.password = args[++i];
    } else if (args[i] === '--name' && args[i + 1]) {
      options.name = args[++i];
    } else if (args[i] === '--phone' && args[i + 1]) {
      options.phone = args[++i];
    } else if (args[i] === '--force') {
      options.force = true;
    }
  }
  return options;
}

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

async function bootstrapAdmin() {
  const cliArgs = parseArgs();
  const email = (cliArgs.email || process.env.ADMIN_BOOTSTRAP_EMAIL || '').trim().toLowerCase();
  const password = cliArgs.password || process.env.ADMIN_BOOTSTRAP_PASSWORD || '';
  const fullName = (cliArgs.name || process.env.ADMIN_BOOTSTRAP_NAME || 'Platform Administrator').trim();
  const phone = (cliArgs.phone || process.env.ADMIN_BOOTSTRAP_PHONE || null);
  const force = !!cliArgs.force;

  if (!email || !password) {
    console.error('================================================================');
    console.error('❌ Error: Administrator email and password are required.');
    console.error('================================================================');
    console.error('Usage:');
    console.error('  node scripts/bootstrap_admin.js --email admin@example.com --password "SecurePass123!"');
    console.error('');
    console.error('Or set environment variables before running:');
    console.error('  ADMIN_BOOTSTRAP_EMAIL=admin@example.com');
    console.error('  ADMIN_BOOTSTRAP_PASSWORD=SecurePass123!');
    console.error('  ADMIN_BOOTSTRAP_NAME="Your Name"');
    console.error('================================================================');
    process.exit(1);
  }

  // Validate email format
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(email)) {
    console.error(`❌ Error: Invalid email format: '${email}'`);
    process.exit(1);
  }

  // Validate password complexity
  const pwdCheck = validatePasswordPattern(password);
  if (!pwdCheck.valid) {
    console.error(`❌ Error: Password complexity check failed: ${pwdCheck.error}`);
    process.exit(1);
  }

  console.log(`[AdminBootstrap] Connecting to database at ${DB_CONFIG.host}:${DB_CONFIG.port}...`);
  const conn = await mysql.createConnection(DB_CONFIG);

  try {
    // 1. Idempotency Check: Does this specific email already exist?
    const [existingUser] = await conn.query(
      'SELECT id, email, role, status FROM users WHERE email = ?',
      [email]
    );

    if (existingUser.length > 0) {
      const user = existingUser[0];
      console.log('================================================================');
      console.log(`ℹ️ Account '${email}' already exists (ID: ${user.id}, Role: ${user.role}, Status: ${user.status}).`);
      console.log('🔒 Security Policy: Existing credentials preserved.');
      console.log('   The administrator password was NOT reset and no duplicate account was created.');
      console.log('================================================================');
      return;
    }

    // 2. Duplicate Admin Check: Does another administrator already exist on the platform?
    const [existingAdmins] = await conn.query(
      "SELECT id, email, full_name FROM users WHERE role = 'admin'"
    );

    if (existingAdmins.length > 0 && !force) {
      console.log('================================================================');
      console.log(`ℹ️ Platform already has an active administrator: ${existingAdmins[0].email} (${existingAdmins[0].full_name}).`);
      console.log('🔒 Security Policy: Duplicate administrator accounts are prevented.');
      console.log('   If you explicitly intend to create an additional administrator, pass --force.');
      console.log('================================================================');
      return;
    }

    // 3. Hash password and insert administrator
    const passwordHash = await bcrypt.hash(password, 10);
    const [result] = await conn.query(
      `INSERT INTO users (full_name, email, password_hash, phone, role, status)
       VALUES (?, ?, ?, ?, 'admin', 'active')`,
      [fullName, email, passwordHash, phone]
    );

    const adminId = result.insertId;

    // 4. Record audit log
    await conn.query(
      `INSERT INTO audit_logs (admin_id, admin_name, action_type, target_entity, target_id, reason, details, ip_address)
       VALUES (?, ?, 'ADMIN_BOOTSTRAP', 'users', ?, 'Initial administrator account bootstrap created', ?, '127.0.0.1')`,
      [
        adminId,
        fullName,
        adminId,
        JSON.stringify({ email, fullName, bootstrapTimestamp: new Date().toISOString() })
      ]
    );

    console.log('================================================================');
    console.log(`✅ Success! Initial Administrator account provisioned.`);
    console.log(`   User ID:    ${adminId}`);
    console.log(`   Name:       ${fullName}`);
    console.log(`   Email:      ${email}`);
    console.log(`   Role:       admin`);
    console.log(`   Status:     active`);
    console.log('================================================================');
  } finally {
    await conn.end();
  }
}

bootstrapAdmin().catch(err => {
  console.error('[AdminBootstrap] Bootstrap failed:', err);
  process.exit(1);
});
