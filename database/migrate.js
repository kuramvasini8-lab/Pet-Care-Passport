const mysql = require('mysql2/promise');
const fs = require('fs');
const path = require('path');

require('dotenv').config({
    path: path.join(__dirname, '../.env')
});

// ==========================================
// AIVEN SSL CERTIFICATE CONFIGURATION
// ==========================================

const caCertificatePath = process.env.MYSQL_SSL_CA
    ? path.resolve(__dirname, '..', process.env.MYSQL_SSL_CA)
    : null;

if (!caCertificatePath) {
    throw new Error(
        'MYSQL_SSL_CA is missing. Add MYSQL_SSL_CA=certs/ca.pem to your .env file.'
    );
}

if (!fs.existsSync(caCertificatePath)) {
    throw new Error(
        `Aiven CA certificate not found at: ${caCertificatePath}`
    );
}

const sslConfig = {
    ca: fs.readFileSync(caCertificatePath, 'utf8'),
    rejectUnauthorized: true
};

// ==========================================
// DATABASE CONFIGURATION
// ==========================================

const DB_CONFIG = {
    host: process.env.MYSQL_HOST,
    port: parseInt(process.env.MYSQL_PORT || '3306', 10),
    user: process.env.MYSQL_USER,
    password: process.env.MYSQL_PASSWORD,
    database: process.env.MYSQL_DATABASE || 'defaultdb',
    ssl: sslConfig,
    multipleStatements: true,
    charset: 'utf8mb4'
};

// ==========================================
// DATABASE MIGRATION
// ==========================================

async function migrate() {
    let dbConn;

    try {
        // Validate environment variables.
        if (
            !DB_CONFIG.host ||
            !DB_CONFIG.user ||
            !DB_CONFIG.password
        ) {
            throw new Error(
                'Missing MySQL configuration. Check your .env file.'
            );
        }

        if (
            !Number.isInteger(DB_CONFIG.port) ||
            DB_CONFIG.port < 1 ||
            DB_CONFIG.port > 65535
        ) {
            throw new Error('MYSQL_PORT must be a valid port number.');
        }

        console.log('================================================');
        console.log('[Migration] Connecting to Aiven MySQL...');
        console.log('================================================');

        // Connect to the configured database.
        dbConn = await mysql.createConnection(DB_CONFIG);

        // Verify the selected database.
        const [databaseRows] = await dbConn.query(
            'SELECT DATABASE() AS database_name'
        );

        const activeDatabase = databaseRows[0].database_name;

        if (activeDatabase !== DB_CONFIG.database) {
            throw new Error(
                `Connected to unexpected database: ${activeDatabase}`
            );
        }

        console.log(
            `[Migration] Connected to database: ${activeDatabase}`
        );

        // Read the schema file.
        const schemaPath = path.join(__dirname, 'schema.sql');

        if (!fs.existsSync(schemaPath)) {
            throw new Error(
                `Schema file not found: ${schemaPath}`
            );
        }

        let schemaSql = fs.readFileSync(schemaPath, 'utf8');

        // Remove statements that create or select the old database.
        // The connection already targets the configured Aiven database.
        schemaSql = schemaSql
            .replace(
                /^\s*CREATE\s+DATABASE\s+IF\s+NOT\s+EXISTS\s+`?petcare_passport`?[^;]*;\s*/gim,
                ''
            )
            .replace(
                /^\s*USE\s+`?petcare_passport`?\s*;\s*/gim,
                ''
            );

        // Prevent accidental database creation or selection.
        if (
            /\bCREATE\s+DATABASE\b/i.test(schemaSql) ||
            /\bUSE\s+`?petcare_passport`?\s*;/i.test(schemaSql)
        ) {
            throw new Error(
                'The schema contains an unexpected database creation or selection statement. Review database/schema.sql.'
            );
        }

        // Apply the schema.
        console.log('[Migration] Applying database schema...');

        await dbConn.query(schemaSql);

        console.log('[Migration] Schema applied successfully.');

        // List the tables created or already present.
        const [tables] = await dbConn.query('SHOW TABLES');

        console.log(
            `[Migration] Tables found in ${activeDatabase}: ${tables.length}`
        );

        // Verify that the expected users table exists.
        const [userTable] = await dbConn.query(
            `SHOW TABLES LIKE 'users'`
        );

        if (userTable.length === 0) {
            throw new Error(
                'The users table was not found after migration. Check database/schema.sql.'
            );
        }

        // Check existing account count without displaying account details.
        const [userCount] = await dbConn.query(
            'SELECT COUNT(*) AS count FROM users'
        );

        console.log(
            `[Migration] Existing user accounts: ${userCount[0].count}`
        );

        console.log('================================================');
        console.log('[Migration] Completed successfully.');
        console.log(`[Migration] Database: ${activeDatabase}`);
        console.log(`[Migration] Total tables: ${tables.length}`);
        console.log(
            '[Migration] No demo clinics or demo accounts were inserted.'
        );
        console.log('================================================');

    } catch (error) {
        console.error('================================================');
        console.error('[Migration] Failed:', error.message);
        console.error('================================================');

        process.exitCode = 1;

    } finally {
        if (dbConn) {
            await dbConn.end().catch((error) => {
                console.error(
                    '[Migration] Error closing database connection:',
                    error.message
                );
            });
        }
    }
}

migrate();