/**
 * PetCare Passport - Full-Stack Express Server
 *
 * Three user experiences:
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
const fs = require('fs');
const cors = require('cors');

require('dotenv').config({
    path: path.join(__dirname, '.env')
});

// ==========================================
// ENVIRONMENT VALIDATION
// ==========================================

const requiredEnvironmentVariables = [
    'MYSQL_HOST',
    'MYSQL_USER',
    'MYSQL_PASSWORD',
    'SESSION_SECRET'
];

for (const variable of requiredEnvironmentVariables) {
    if (!process.env[variable]) {
        throw new Error(
            `Required environment variable ${variable} is missing.`
        );
    }
}

const PORT = parseInt(process.env.PORT || '3000', 10);

if (!Number.isInteger(PORT) || PORT < 1 || PORT > 65535) {
    throw new Error('PORT must be a valid port number.');
}

// ==========================================
// AIVEN MYSQL SSL CONFIGURATION
// ==========================================

const caPath = process.env.MYSQL_SSL_CA
    ? path.resolve(__dirname, process.env.MYSQL_SSL_CA)
    : null;

if (!caPath) {
    throw new Error(
        'MYSQL_SSL_CA is missing from the environment configuration.'
    );
}

if (!fs.existsSync(caPath)) {
    throw new Error(
        `MySQL CA certificate not found at: ${caPath}`
    );
}

const sessionSsl = {
    ca: fs.readFileSync(caPath, 'utf8'),
    rejectUnauthorized: true
};

// ==========================================
// DATABASE AND SERVICE IMPORTS
// ==========================================

const { pool, checkDbHealth } = require('./src/config/db');

const {
    processSystemReminders
} = require('./src/services/reminderService');

// ==========================================
// ROUTE MODULES
// ==========================================

const authRoutes = require('./src/routes/authRoutes');
const petRoutes = require('./src/routes/petRoutes');
const passportRoutes = require('./src/routes/passportRoutes');
const healthRoutes = require('./src/routes/healthRoutes');
const vaccinationRoutes = require('./src/routes/vaccinationRoutes');
const dailyCareRoutes = require('./src/routes/dailyCareRoutes');
const lostFoundRoutes = require('./src/routes/lostFoundRoutes');
const adminRoutes = require('./src/routes/adminRoutes');
const aiRoutes = require('./src/routes/aiRoutes');
const notificationRoutes = require('./src/routes/notificationRoutes');
const ownerOverviewRoutes = require('./src/routes/ownerOverviewRoutes');
const reportRoutes = require('./src/routes/reportRoutes');

// ==========================================
// EXPRESS APPLICATION
// ==========================================

const app = express();

app.disable('x-powered-by');

// ==========================================
// SECURITY MIDDLEWARE
// ==========================================

app.use(
    helmet({
        contentSecurityPolicy: false,
        crossOriginResourcePolicy: {
            policy: 'cross-origin'
        }
    })
);

// Configure CORS.
//
// For production, set ALLOWED_ORIGINS to a comma-separated list
// of trusted frontend origins. If omitted, the application uses
// same-origin access rather than allowing arbitrary origins.

const allowedOrigins = process.env.ALLOWED_ORIGINS
    ? process.env.ALLOWED_ORIGINS
        .split(',')
        .map(origin => origin.trim())
        .filter(Boolean)
    : [];

app.use(
    cors({
        origin: (origin, callback) => {
            if (
                !origin ||
                allowedOrigins.length === 0 ||
                allowedOrigins.includes(origin)
            ) {
                return callback(null, true);
            }

            return callback(
                new Error('Origin not allowed by CORS.')
            );
        },
        credentials: true
    })
);

app.use(
    express.json({
        limit: '15mb'
    })
);

app.use(
    express.urlencoded({
        extended: true,
        limit: '15mb'
    })
);

// ==========================================
// RATE LIMITING
// ==========================================

const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 120,
    standardHeaders: true,
    legacyHeaders: false,
    message: {
        success: false,
        error: 'Too many requests from this IP. Please try again later.'
    }
});

app.use('/api/auth/login', authLimiter);
app.use('/api/auth/register', authLimiter);
app.use('/api/auth/forgot-password', authLimiter);
app.use('/api/auth/reset-password', authLimiter);

// ==========================================
// MYSQL SESSION STORE
// ==========================================

const sessionStoreOptions = {
    host: process.env.MYSQL_HOST,
    port: parseInt(process.env.MYSQL_PORT || '3306', 10),
    user: process.env.MYSQL_USER,
    password: process.env.MYSQL_PASSWORD,
    database: process.env.MYSQL_DATABASE || 'defaultdb',

    ssl: sessionSsl,

    clearExpired: true,
    checkExpirationInterval: 15 * 60 * 1000,
    expiration: 24 * 60 * 60 * 1000,
    createDatabaseTable: true
};

const sessionStore = new MySQLStore(sessionStoreOptions);

sessionStore.on('error', error => {
    console.error(
        '[Session Store Error]',
        error.message
    );
});

app.use(
    session({
        key: 'petcare_session_id',
        secret: process.env.SESSION_SECRET,
        store: sessionStore,
        resave: false,
        saveUninitialized: false,
        cookie: {
            maxAge: 24 * 60 * 60 * 1000,
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production',
            sameSite: 'lax'
        }
    })
);

// ==========================================
// STATIC FILES
// ==========================================

app.use(
    '/uploads',
    express.static(
        path.join(__dirname, 'uploads')
    )
);

app.use(
    express.static(
        path.join(__dirname, 'public')
    )
);

// Public passport viewing route.
app.get('/passport-view', (req, res) => {
    res.sendFile(
        path.join(
            __dirname,
            'public',
            'passport-view.html'
        )
    );
});

// ==========================================
// API ROUTES
// ==========================================

app.use('/api/auth', authRoutes);
app.use('/api/pets', petRoutes);
app.use('/api/passports', passportRoutes);
app.use('/api/health', healthRoutes);
app.use('/api/vaccinations', vaccinationRoutes);
app.use('/api/care', dailyCareRoutes);
app.use('/api/lost-found', lostFoundRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/ai', aiRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api/owner', ownerOverviewRoutes);
app.use('/api/reports', reportRoutes);

// ==========================================
// HEALTH CHECK
// ==========================================

app.get('/api/health-check', async (req, res) => {
    const dbHealth = await checkDbHealth();

    const healthy = dbHealth.connected === true;

    res.status(healthy ? 200 : 503).json({
        success: healthy,
        status: healthy ? 'online' : 'degraded',
        appName: 'PetCare Passport',
        database: dbHealth,
        timestamp: new Date().toISOString()
    });
});

// ==========================================
// API 404 HANDLER
// ==========================================

app.use('/api', (req, res) => {
    res.status(404).json({
        success: false,
        error: 'Endpoint not found.'
    });
});

// ==========================================
// GLOBAL ERROR HANDLER
// ==========================================

app.use((err, req, res, next) => {
    console.error('[Global Error]', err.message);

    if (res.headersSent) {
        return next(err);
    }

    const statusCode =
        err.statusCode ||
        err.status ||
        500;

    res.status(statusCode).json({
        success: false,
        error: process.env.NODE_ENV === 'production'
            ? 'An error occurred while processing the request.'
            : err.message
    });
});

// ==========================================
// SERVER STARTUP
// ==========================================

let server;
let reminderInterval;

async function startServer() {
    try {
        // Verify database connectivity before accepting requests.
        const dbHealth = await checkDbHealth();

        if (!dbHealth.connected) {
            throw new Error(
                'Database health check failed. Verify the Aiven connection settings.'
            );
        }

        server = app.listen(PORT, () => {
            console.log('================================================');
            console.log('PetCare Passport server started successfully.');
            console.log(`Port: ${PORT}`);
            console.log(
                `Environment: ${process.env.NODE_ENV || 'development'}`
            );
            console.log(
                `Database: ${process.env.MYSQL_DATABASE || 'defaultdb'}`
            );
            console.log('================================================');
        });

        // Avoid crashing the application if reminders fail.
        try {
            const result = await processSystemReminders();

            console.log(
                '[ReminderEngine] Startup evaluation completed:',
                result?.notificationsGenerated || 0,
                'reminders processed.'
            );
        } catch (error) {
            console.warn(
                '[ReminderEngine] Startup evaluation notice:',
                error.message
            );
        }

        // Run the reminder service every 30 minutes.
        reminderInterval = setInterval(async () => {
            try {
                await processSystemReminders();
            } catch (error) {
                console.error(
                    '[ReminderEngine] Interval check error:',
                    error.message
                );
            }
        }, 30 * 60 * 1000);

        if (typeof reminderInterval.unref === 'function') {
            reminderInterval.unref();
        }

    } catch (error) {
        console.error(
            '[Startup Error]',
            error.message
        );

        if (server) {
            server.close();
        }

        process.exitCode = 1;
    }
}

// ==========================================
// GRACEFUL SHUTDOWN
// ==========================================

async function shutdown(signal) {
    console.log(`[Shutdown] Received ${signal}.`);

    if (reminderInterval) {
        clearInterval(reminderInterval);
    }

    if (server) {
        server.close();
    }

    try {
        await sessionStore.close();
    } catch (error) {
        console.error(
            '[Shutdown] Session store closure notice:',
            error.message
        );
    }

    try {
        await pool.end();
    } catch (error) {
        console.error(
            '[Shutdown] Database pool closure notice:',
            error.message
        );
    }

    process.exit(0);
}

process.on('SIGTERM', () => {
    shutdown('SIGTERM');
});

process.on('SIGINT', () => {
    shutdown('SIGINT');
});

// ==========================================
// START APPLICATION
// ==========================================

if (process.env.NODE_ENV !== 'test') {
    startServer();
}

module.exports = app;