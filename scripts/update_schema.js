const { pool } = require('../src/config/db');

async function run() {
  try {
    const [colsList] = await pool.query("SHOW COLUMNS FROM adoption_listings LIKE 'is_verified'");
    if (colsList.length === 0) {
      await pool.query("ALTER TABLE adoption_listings ADD COLUMN is_verified BOOLEAN DEFAULT FALSE");
      await pool.query("ALTER TABLE adoption_listings ADD COLUMN verified_by INT NULL");
      await pool.query("ALTER TABLE adoption_listings ADD COLUMN verified_at DATETIME NULL");
      await pool.query("ALTER TABLE adoption_listings ADD COLUMN verification_notes TEXT NULL");
      console.log('Added verification columns to adoption_listings');
    } else {
      console.log('verification columns already exist in adoption_listings');
    }

    const [colsPet] = await pool.query("SHOW COLUMNS FROM pets LIKE 'is_missing'");
    if (colsPet.length === 0) {
      await pool.query("ALTER TABLE pets ADD COLUMN is_missing BOOLEAN DEFAULT FALSE");
      await pool.query("ALTER TABLE pets ADD COLUMN missing_since DATETIME NULL");
      await pool.query("ALTER TABLE pets ADD COLUMN missing_notes TEXT NULL");
      console.log('Added is_missing columns to pets');
    } else {
      console.log('is_missing already exists in pets');
    }
  } catch (e) {
    console.error('Error adding columns:', e);
  } finally {
    process.exit(0);
  }
}

run();
