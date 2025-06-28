// tools/addAdmin.js
const bcrypt = require('bcrypt');
const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

async function tambahAdmin() {
  const username = 'admin'; // Ganti sesuai keinginan
  const plainPassword = 'desa123'; // Ganti sesuai kebutuhan

  try {
    const hashedPassword = await bcrypt.hash(plainPassword, 10);

    await pool.query(
      'INSERT INTO admin (username, password) VALUES ($1, $2)',
      [username, hashedPassword]
    );

    console.log(`✅ Admin '${username}' berhasil ditambahkan!`);
  } catch (error) {
    console.error('❌ Gagal menambahkan admin:', error);
  } finally {
    pool.end();
  }
}

tambahAdmin();
