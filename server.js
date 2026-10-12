/**
 * PetCare Passport - Full-Stack Express Server
 * Powering Three Distinct User Experiences:
 * 1. Pet Owner Dashboard
 * 2. Adopter / Visitor Experience
 * 3. Administrator Dashboard
 */
const express = require('express');
const session = require('express-session');
const MySQLStore = require('express-mysql-session')(session);
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const path = require('path');
const cors = require('cors');
require('dotenv').config({ path: path.join(__dirname, '.env') });

const { pool, checkDbHealth } = require('./src/config/db');
const { processSystemReminders } = require('./src/services/reminderService');

// Route modules
const authRoutes = require('./src/routes/authRoutes');
const petRoutes = require('./src/routes/petRoutes');
const passportRoutes = require('./src/routes/passportRoutes');
const healthRoutes = require('./src/routes/healthRoutes');
const vaccinationRoutes = require('./src/routes/vaccinationRoutes');
const dailyCareRoutes = require('./src/routes/dailyCareRoutes');
const appointmentRoutes = require('./src/routes/appointmentRoutes');
const adoptionRoutes = require('./src/routes/adoptionRoutes');
const lostFoundRoutes = require('./src/routes/lostFoundRoutes');
const adminRoutes = require('./src/routes/adminRoutes');
const aiRoutes = require('./src/routes/aiRoutes');
const notificationRoutes = require('./src/routes/notificationRoutes');
const ownerOverviewRoutes = require('./src/routes/ownerOverviewRoutes');
const reportRoutes = require('./src/routes/reportRoutes');

const app = express();
const PORT = parseInt(process.env.PORT || '3000', 10);

// ----------------------------------------------------------------------------
// 1. SECURITY & MIDDLEWARE
// ----------------------------------------------------------------------------
app.use(helmet({
  contentSecurityPolicy: false, // Allows CDN resources (Chart.js, fonts) & inline styles for dashboard graphics
  crossOriginResourcePolicy: { policy: 'cross-origin' }
}));

app.use(cors({
  origin: true,
  credentials: true
}));

app.use(express.json({ limit: '15mb' }));
app.use(express.urlencoded({ extended: true, limit: '15mb' }));

// Rate limit sensitive authentication endpoints
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 120, // 120 requests per window
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, error: 'Too many requests from this IP. Please try again later.' }
});
app.use('/api/auth/login', authLimiter);
app.use('/api/auth/register', authLimiter);

// ----------------------------------------------------------------------------
// 2. PERSISTENT SESSION CONFIGURATION
// ----------------------------------------------------------------------------
const sessionStoreOptions = {
  host: process.env.MYSQL_HOST || 'localhost',
  port: parseInt(process.env.MYSQL_PORT || '3366', 10),
  user: process.env.MYSQL_USER || 'root',
  password: process.env.MYSQL_PASSWORD || '',
  database: process.env.MYSQL_DATABASE || 'petcare_passport',
  clearExpired: true,
  checkExpirationInterval: 15 * 60 * 1000,
  expiration: 24 * 60 * 60 * 1000,
  createDatabaseTable: true
};

const sessionStore = new MySQLStore(sessionStoreOptions);

app.use(session({
  key: 'petcare_session_id',
  secret: process.env.SESSION_SECRET || 'petcare_default_secret_key_849204_2026',
  store: sessionStore,
  resave: false,
  saveUninitialized: false,
  cookie: {
    maxAge: 24 * 60 * 60 * 1000, // 24 hours
    httpOnly: true, // Prevents client-side JS theft
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax'
  }
}));

// ----------------------------------------------------------------------------
// 3. STATIC FILES
// ----------------------------------------------------------------------------
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));
app.use(express.static(path.join(__dirname, 'public')));

// ----------------------------------------------------------------------------
// 4. API ROUTES
// ----------------------------------------------------------------------------
app.use('/api/auth', authRoutes);
app.use('/api/pets', petRoutes);
app.use('/api/passports', passportRoutes);
app.use('/api/health', healthRoutes);
app.use('/api/vaccinations', vaccinationRoutes);
app.use('/api/care', dailyCareRoutes);
app.use('/api/appointments', appointmentRoutes);
app.use('/api/adoptions', adoptionRoutes);
app.use('/api/lost-found', lostFoundRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/ai', aiRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api/owner', ownerOverviewRoutes);
app.use('/api/reports', reportRoutes);

// Health check endpoint
app.get('/api/health-check', async (req, res) => {
  const dbHealth = await checkDbHealth();
  res.json({
    success: true,
    status: dbHealth.connected ? 'online' : 'degraded',
    appName: 'PetCare Passport',
    database: dbHealth,
    timestamp: new Date().toISOString()
  });
});

// Fallback for 404 API calls
app.use('/api', (req, res) => {
  res.status(404).json({ success: false, error: 'Endpoint not found.' });
});

// Global error handler
app.use((err, req, res, next) => {
  console.error('[Global Error]', err);
  res.status(500).json({
    success: false,
    error: process.env.NODE_ENV === 'production' ? 'Internal server error.' : err.message
  });
});

// ----------------------------------------------------------------------------
// 5. SERVER STARTUP & BACKGROUND SERVICES
// ----------------------------------------------------------------------------
if (process.env.NODE_ENV !== 'test') {
  app.listen(PORT, async () => {
    console.log('================================================================');
    console.log(`🐾 PetCare Passport Server running on http://localhost:${PORT}`);
    console.log(`   Environment: ${process.env.NODE_ENV || 'development'}`);
    console.log(`   Database: ${process.env.MYSQL_DATABASE || 'petcare_passport'} (port ${process.env.MYSQL_PORT || 3366})`);
    console.log('================================================================');

    // Run initial reminder check
    try {
      const remResult = await processSystemReminders();
      console.log(`[ReminderEngine] Startup evaluation completed: ${remResult.notificationsGenerated || 0} reminders processed.`);
    } catch (e) {
      console.warn('[ReminderEngine] Startup evaluation notice:', e.message);
    }
  });

  // Run reminder check every 30 minutes
  setInterval(async () => {
    try {
      await processSystemReminders();
    } catch (err) {
      console.error('[ReminderEngine] Interval check error:', err.message);
    }
  }, 30 * 60 * 1000);
}

module.exports = app;
