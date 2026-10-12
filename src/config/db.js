const mysql = require('mysql2/promise');
const path = require('path');
const fs = require('fs');

require('dotenv').config({
    path: path.join(__dirname, '../../.env')
});

// ==========================================
// SSL CONFIGURATION
// ==========================================

const caPath = process.env.MYSQL_SSL_CA
    ? path.resolve(__dirname, '../../', process.env.MYSQL_SSL_CA)
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

const sslConfig = {
    ca: fs.readFileSync(caPath, 'utf8'),
    rejectUnauthorized: true
};

// ==========================================
// MYSQL CONNECTION POOL
// ==========================================

const pool = mysql.createPool({
    host: process.env.MYSQL_HOST,
    port: parseInt(process.env.MYSQL_PORT || '3306', 10),
    user: process.env.MYSQL_USER,
    password: process.env.MYSQL_PASSWORD,
    database: process.env.MYSQL_DATABASE || 'defaultdb',

    ssl: sslConfig,

    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0,
    decimalNumbers: true,
    dateStrings: true,
    timezone: 'Z',
    charset: 'utf8mb4'
});

// ==========================================
// DATABASE HEALTH CHECK
// ==========================================

async function checkDbHealth() {
    try {
        const start = Date.now();

        const [rows] = await pool.query(
            'SELECT 1 AS alive, NOW() AS server_time'
        );

        return {
            status: 'healthy',
            connected: true,
            latencyMs: Date.now() - start,
            serverTime: rows[0].server_time,
            database: process.env.MYSQL_DATABASE || 'defaultdb',
            host: process.env.MYSQL_HOST,
            port: parseInt(process.env.MYSQL_PORT || '3306', 10)
        };
    } catch (error) {
        console.error(
            '[Database Health Check]',
            error.message
        );

        return {
            status: 'unhealthy',
            connected: false,
            error: 'Database connection failed.'
        };
    }
}

// ==========================================
// EXPORTS
// ==========================================

module.exports = {
    pool,
    query: (sql, params) => pool.query(sql, params),
    execute: (sql, params) => pool.execute(sql, params),
    checkDbHealth
};