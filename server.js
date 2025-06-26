require('dotenv').config();

const express = require('express');
const nodemailer = require('nodemailer');
const cors = require('cors');
const bodyParser = require('body-parser');
const { Pool } = require('pg');

const app = express();
const PORT = process.env.PORT || 8080;

// Koneksi PostgreSQL
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

// Buat tabel pengaduan jika belum ada
(async () => {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS pengaduan (
        id SERIAL PRIMARY KEY,
        nama VARCHAR(100),
        nik VARCHAR(20),
        telepon VARCHAR(20),
        email VARCHAR(100),
        alamat TEXT,
        jenis_pengaduan VARCHAR(100),
        judul_pengaduan VARCHAR(200),
        isi_pengaduan TEXT,
        harapan TEXT,
        tanggal TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    console.log("✅ Tabel pengaduan berhasil dibuat atau sudah ada.");
  } catch (error) {
    console.error("❌ Gagal membuat tabel pengaduan:", error);
  }
})();

// Middleware
app.use(cors());
app.use(bodyParser.json());

// Penyimpanan OTP sementara
const otpStore = {};

// Kirim OTP ke email
app.post('/kirim-otp', async (req, res) => {
  const { email } = req.body;

  if (!email || !email.includes('@')) {
    return res.status(400).json({ success: false, message: 'Email tidak valid' });
  }

  const otp = Math.floor(100000 + Math.random() * 900000); // 6 digit
  otpStore[email] = otp;

  try {
    const transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS
      }
    });

    await transporter.sendMail({
      from: process.env.EMAIL_USER,
      to: email,
      subject: 'Kode OTP Verifikasi - Desa Banyusri',
      text: `Kode verifikasi Anda adalah: ${otp}`
    });

    res.json({ success: true, message: 'Kode OTP berhasil dikirim.' });
  } catch (error) {
    console.error('❌ Gagal kirim OTP:', error);
    res.status(500).json({ success: false, message: 'Gagal mengirim OTP.' });
  }
});

// Verifikasi OTP
app.post('/verifikasi-otp', (req, res) => {
  const { email, otp } = req.body;

  if (otpStore[email] && otpStore[email].toString() === otp) {
    delete otpStore[email]; // OTP hanya bisa sekali pakai
    return res.json({ success: true, message: 'OTP berhasil diverifikasi.' });
  }

  return res.status(400).json({ success: false, message: 'OTP tidak valid atau sudah kadaluarsa.' });
});

// Simpan pengaduan ke database
app.post('/kirim-pengaduan', async (req, res) => {
  const data = req.body;

  try {
    await pool.query(`
      INSERT INTO pengaduan (nama, nik, telepon, email, alamat, jenis_pengaduan, judul_pengaduan, isi_pengaduan, harapan)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
    `, [
      data.nama,
      data.nik,
      data.telepon,
      data.email,
      data.alamat,
      data.jenis_pengaduan,
      data.judul_pengaduan,
      data.isi_pengaduan,
      data.harapan
    ]);

    res.json({ success: true, message: 'Pengaduan berhasil disimpan.' });
  } catch (error) {
    console.error('❌ Gagal menyimpan pengaduan:', error);
    res.status(500).json({ success: false, message: 'Gagal menyimpan pengaduan.' });
  }
});

// Jalankan server
app.listen(PORT, () => {
  console.log(`🚀 Server berjalan di port ${PORT}`);
});
// Tangani error global
app.use((err, req, res, next) => {
  console.error('❌ Terjadi kesalahan:', err);
  res.status(500).json({ success: false, message: 'Terjadi kesalahan pada server.' });
});