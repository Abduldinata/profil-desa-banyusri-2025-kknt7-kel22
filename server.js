require('dotenv').config();

const nodemailer = require('nodemailer');
const express = require('express');
const cors = require('cors');
const app = express();
app.use(cors({
  origin: 'https://profil-desa-banyusri-2025-kknt7-kel.vercel.app'
}));

const bodyParser = require('body-parser');
const { Pool } = require('pg');
const bcrypt = require('bcrypt');
const PORT = process.env.PORT || 8080;

const jwt = require('jsonwebtoken');
const SECRET_KEY = process.env.JWT_SECRET || 'rahasiaDesaBanyusri';

// Koneksi PostgreSQL
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

// Auto-buat tabel pengaduan
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

// Auto-buat tabel admin
// Pastikan tabel admin ada untuk menyimpan akun admin
(async () => {
  try {
    // Buat tabel admin jika belum ada
    await pool.query(`
      CREATE TABLE IF NOT EXISTS admin (
        id SERIAL PRIMARY KEY,
        username VARCHAR(50) UNIQUE NOT NULL,
        password TEXT NOT NULL
      )
    `);
    console.log("✅ Tabel admin berhasil dibuat atau sudah ada.");
  } catch (err) {
    console.error("❌ Gagal membuat tabel admin:", err);
  }
})();

// Middleware
app.use(cors());
app.use(bodyParser.json());

// Simpan OTP sementara
const otpStore = {};

// Endpoint kirim OTP ke email user
app.post('/kirim-otp', async (req, res) => {
  const { email } = req.body;

  if (!email || !email.includes('@')) {
    return res.status(400).json({ success: false, message: 'Email tidak valid' });
  }

  const otp = Math.floor(100000 + Math.random() * 900000);
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

// Endpoint verifikasi OTP
app.post('/verifikasi-otp', (req, res) => {
  const { email, otp } = req.body;

  if (otpStore[email] && otpStore[email].toString() === otp) {
    delete otpStore[email];
    return res.json({ success: true, message: 'OTP berhasil diverifikasi.' });
  }

  return res.status(400).json({ success: false, message: 'OTP tidak valid atau sudah kadaluarsa.' });
});

// Endpoint simpan pengaduan dan kirim ke email desa
app.post('/kirim-pengaduan', async (req, res) => {
  const data = req.body;

  try {
    // Simpan ke database
    await pool.query(`
      INSERT INTO pengaduan
        (nama, nik, telepon, email, alamat, jenis_pengaduan, judul_pengaduan, isi_pengaduan, harapan)
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

    // Kirim email ke admin/balai desa
    const transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS
      }
    });

    await transporter.sendMail({
      from: process.env.EMAIL_USER,
      to: process.env.EMAIL_DESTINATION,
      subject: `Pengaduan Baru dari ${data.nama}`,
      text: `
PENGADUAN BARU MASUK

🧑 Nama: ${data.nama}
🪪 NIK: ${data.nik}
📞 Telepon: ${data.telepon}
📧 Email: ${data.email || 'Tidak diisi'}
📍 Alamat: ${data.alamat}

📌 Jenis: ${data.jenis_pengaduan}
📋 Judul: ${data.judul_pengaduan}
📝 Isi: ${data.isi_pengaduan}
🎯 Harapan: ${data.harapan || 'Tidak diisi'}

📅 Tanggal: ${new Date().toLocaleDateString('id-ID')}
🕒 Waktu: ${new Date().toLocaleTimeString('id-ID')}
      `
    });

    res.json({ success: true, message: 'Pengaduan berhasil disimpan dan dikirim ke email desa.' });
  } catch (error) {
    console.error('❌ Gagal menyimpan/kirim email:', error);
    res.status(500).json({ success: false, message: 'Gagal menyimpan/kirim email pengaduan.' });
  }
});

// Ambil semua pengaduan untuk admin
app.get('/admin/pengaduan', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM pengaduan ORDER BY tanggal DESC');
    res.json({ success: true, data: result.rows });
  } catch (err) {
    console.error('❌ Gagal ambil data pengaduan:', err);
    res.status(500).json({ success: false, message: 'Gagal ambil data pengaduan' });
  }
});

// Ambil detail pengaduan berdasarkan ID
app.put('/admin/pengaduan/:id/status', async (req, res) => {
  const { id } = req.params;
  const { status } = req.body;

  try {
    const result = await pool.query('SELECT * FROM pengaduan WHERE id = $1', [id]);
    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Pengaduan tidak ditemukan' });
    }

    const data = result.rows[0];

    await pool.query('UPDATE pengaduan SET status = $1 WHERE id = $2', [status, id]);

    const transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS
      }
    });

    await transporter.sendMail({
      from: `"Pengaduan Desa Banyusri" <${process.env.EMAIL_USER}>`,
      to: data.email,
      subject: `📬 Status Pengaduan Anda: ${status.toUpperCase()}`,
      html: `
        <div style="font-family:sans-serif;max-width:600px;margin:auto;padding:1.5rem;border:1px solid #eee;border-radius:8px;">
          <h2 style="color:#2c3e50;">📋 Pengaduan Anda Telah Diperbarui</h2>
          <p>Halo <strong>${data.nama}</strong>,</p>

          <p>Pengaduan Anda dengan judul:</p>
          <blockquote style="background:#f9f9f9;padding:10px;border-left:4px solid #3498db;">
            ${data.judul_pengaduan}
          </blockquote>

          <p>Status terbaru:</p>
          <p>
            <span style="background:#3498db;color:#fff;padding:8px 14px;border-radius:5px;font-weight:bold;">
              ${status.toUpperCase()}
            </span>
          </p>

          <p style="margin-top:1rem;">Terima kasih atas partisipasi Anda untuk kemajuan <strong>Desa Banyusri</strong> 🙏</p>

          <hr style="margin:2rem 0;">
          <p style="font-size:0.85rem;color:#666;">Email ini dikirim otomatis oleh Sistem Pengaduan Online Desa Banyusri. Jangan balas email ini.</p>
        </div>
      `
    });

    res.json({ success: true, message: 'Status berhasil diperbarui & email terkirim.' });

  } catch (err) {
    console.error('❌ Gagal ubah status / kirim email:', err);
    res.status(500).json({ success: false, message: 'Gagal memperbarui status atau kirim email' });
  }
});

// Endpoint untuk login admin
app.post('/admin/login', async (req, res) => {
  const { username, password } = req.body;
  try {
    const result = await pool.query('SELECT * FROM admin WHERE username = $1', [username]);
    if (result.rows.length === 0) {
      return res.status(401).json({ success: false, message: 'Username tidak ditemukan' });
    }

    const admin = result.rows[0];
    const valid = await bcrypt.compare(password, admin.password);
    if (!valid) {
      return res.status(401).json({ success: false, message: 'Password salah' });
    }

    // Buat JWT token
    const token = jwt.sign({ id: admin.id, username: admin.username }, SECRET_KEY, { expiresIn: '1h' });
    res.json({ success: true, token });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: 'Kesalahan server' });
  }
});
// Middleware untuk autentikasi JWT
function verifikasiAdmin(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ success: false, message: 'Token tidak ada' });
  }

// Ambil token dari header
  app.get('/admin/pengaduan', verifikasiAdmin, async (req, res) => {
  const result = await pool.query('SELECT * FROM pengaduan ORDER BY tanggal DESC');
  res.json({ success: true, data: result.rows });
});

app.put('/admin/pengaduan/:id/status', verifikasiAdmin, async (req, res) => {
  const { id } = req.params;
  const { status } = req.body;

  try {
    await pool.query('UPDATE pengaduan SET status = $1 WHERE id = $2', [status, id]);
    res.json({ success: true, message: 'Status diperbarui' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: 'Gagal update status' });
  }
});


  const token = authHeader.split(' ')[1];
  try {
    const decoded = jwt.verify(token, SECRET_KEY);
    req.admin = decoded;
    next();
  } catch (err) {
    return res.status(403).json({ success: false, message: 'Token tidak valid' });
  }
}

// Jalankan server
app.listen(PORT, () => {
  console.log(`🚀 Server berjalan di port ${PORT}`);
});
// Tangani error global
process.on('uncaughtException', (error) => {
  console.error('❌ Uncaught Exception:', error);
});