/**
 * Database connection pool using mysql2/promise
 */
const mysql = require('mysql2/promise');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../../.env') });

const pool = mysql.createPool({
  host: process.env.MYSQL_HOST || 'localhost',
  port: parseInt(process.env.MYSQL_PORT || '3366', 10),
  user: process.env.MYSQL_USER || 'root',
  password: process.env.MYSQL_PASSWORD || '',
  database: process.env.MYSQL_DATABASE || 'petcare_passport',
  waitForConnections: true,
  connectionLimit: 15,
  queueLimit: 0,
  decimalNumbers: true,
  timezone: '+00:00',
  charset: 'utf8mb4'
});

// Diagnostic check helper
async function checkDbHealth() {
  try {
    const start = Date.now();
    const [rows] = await pool.query('SELECT 1 as alive, NOW() as server_time');
    const latencyMs = Date.now() - start;
    return {
      status: 'healthy',
      connected: true,
      latencyMs,
      serverTime: rows[0].server_time,
      database: process.env.MYSQL_DATABASE || 'petcare_passport',
      host: process.env.MYSQL_HOST || 'localhost',
      port: parseInt(process.env.MYSQL_PORT || '3366', 10)
    };
  } catch (error) {
    return {
      status: 'unhealthy',
      connected: false,
      error: error.message
    };
  }
}

module.exports = {
  pool,
  query: (sql, params) => pool.query(sql, params),
  execute: (sql, params) => pool.execute(sql, params),
  checkDbHealth
};
