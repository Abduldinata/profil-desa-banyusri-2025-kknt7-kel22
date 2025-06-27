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

app.put('/admin/pengaduan/:id/status', async (req, res) => {
  const { id } = req.params;
  const { status } = req.body;

  try {
    // Ambil data pengaduan dulu (untuk email pelapor)
    const result = await pool.query('SELECT * FROM pengaduan WHERE id = $1', [id]);
    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Pengaduan tidak ditemukan' });
    }

    const data = result.rows[0];

    // Update status di database
    await pool.query('UPDATE pengaduan SET status = $1 WHERE id = $2', [status, id]);

    // Kirim email ke pelapor
    const transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS
      }
    });

    await transporter.sendMail({
      from: process.env.EMAIL_USER,
      to: data.email,
      subject: `Status Pengaduan Anda Telah Diperbarui - Desa Banyusri`,
      text: `
Halo ${data.nama},

Pengaduan Anda dengan judul:
📋 "${data.judul_pengaduan}"

Telah diperbarui statusnya menjadi: 🏷️ ${status.toUpperCase()}

Terima kasih atas partisipasi Anda untuk kemajuan Desa Banyusri 🙏

Salam,
Admin Sistem Pengaduan Desa Banyusri
      `
    });

    res.json({ success: true, message: 'Status berhasil diperbarui & email terkirim.' });

  } catch (err) {
    console.error('❌ Gagal ubah status / kirim email:', err);
    res.status(500).json({ success: false, message: 'Gagal memperbarui status atau kirim email' });
  }
});


// Jalankan server
app.listen(PORT, () => {
  console.log(`🚀 Server berjalan di port ${PORT}`);
});
// Tangani error global
process.on('uncaughtException', (error) => {
  console.error('❌ Uncaught Exception:', error);
});