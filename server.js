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
const jwt = require('jsonwebtoken');
const PORT = process.env.PORT || 8080;

// Gunakan crypto untuk generate secret yang aman
const crypto = require('crypto');
const jwtSecret = crypto.randomBytes(64).toString('hex');
const SECRET_KEY = process.env.JWT_SECRET;
if (!SECRET_KEY) {
  console.error('❌ JWT_SECRET required!');
  process.exit(1);
}

// Koneksi PostgreSQL
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

// Middleware
app.use(cors());
app.use(bodyParser.json());

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
        status VARCHAR(50) DEFAULT 'Menunggu',
        tanggal TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    console.log("✅ Tabel pengaduan berhasil dibuat atau sudah ada.");
  } catch (error) {
    console.error("❌ Gagal membuat tabel pengaduan:", error);
  }
})();

// Auto-buat tabel admin
(async () => {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS admin (
        id SERIAL PRIMARY KEY,
        username VARCHAR(50) UNIQUE NOT NULL,
        password TEXT NOT NULL
      )
    `);
    console.log("✅ Tabel admin berhasil dibuat atau sudah ada.");
    
    // Buat admin default jika belum ada
    const adminExists = await pool.query('SELECT * FROM admin WHERE username = $1', ['admin']);
    if (adminExists.rows.length === 0) {
      const hashedPassword = await bcrypt.hash('admin123', 10);
      await pool.query('INSERT INTO admin (username, password) VALUES ($1, $2)', ['admin', hashedPassword]);
      console.log("✅ Admin default berhasil dibuat: username=admin, password=admin123");
    }
  } catch (err) {
    console.error("❌ Gagal membuat tabel admin:", err);
  }
})();

// Middleware untuk autentikasi JWT
function verifikasiAdmin(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ success: false, message: 'Token tidak ada' });
  }

  const token = authHeader.split(' ')[1];
  try {
    const decoded = jwt.verify(token, SECRET_KEY);
    req.admin = decoded;
    next();
  } catch (err) {
    return res.status(403).json({ success: false, message: 'Token tidak valid' });
  }
}

// Simpan OTP sementara dengan expiry
const otpStore = {};

// ✅ ENDPOINT KIRIM OTP YANG SUDAH DIPERBAIKI
app.post('/kirim-otp', async (req, res) => {
  const { email } = req.body;

  // Validasi input
  if (!email || !email.includes('@')) {
    return res.status(400).json({ 
      success: false, 
      message: 'Email tidak valid' 
    });
  }

  // Generate OTP
  const otp = Math.floor(100000 + Math.random() * 900000);
  otpStore[email] = {
    code: otp,
    timestamp: Date.now(),
    expires: Date.now() + (5 * 60 * 1000) // 5 menit
  };

  try {
    // Validasi environment variables
    if (!process.env.EMAIL_USER || !process.env.EMAIL_PASS) {
      console.error('❌ Environment variables EMAIL_USER atau EMAIL_PASS tidak ditemukan');
      return res.status(500).json({ 
        success: false, 
        message: 'Konfigurasi email tidak lengkap' 
      });
    }

    // ✅ PERBAIKAN: Gunakan createTransport (bukan createTransporter)
    const transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS // Harus menggunakan App Password dari Gmail
      }
    });

    // Verifikasi koneksi transporter
    await transporter.verify();
    console.log('✅ Koneksi email berhasil diverifikasi');

    // Kirim email OTP
    const mailOptions = {
      from: `"Desa Banyusri" <${process.env.EMAIL_USER}>`,
      to: email,
      subject: '🔐 Kode OTP Verifikasi - Desa Banyusri',
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #ddd; border-radius: 8px;">
          <h2 style="color: #2c3e50; text-align: center;">🏘️ Desa Banyusri</h2>
          <h3 style="color: #3498db;">Kode Verifikasi OTP</h3>
          
          <p>Halo,</p>
          <p>Anda telah meminta kode verifikasi untuk mengakses layanan pengaduan online Desa Banyusri.</p>
          
          <div style="background: #f8f9fa; padding: 20px; border-radius: 5px; text-align: center; margin: 20px 0;">
            <h1 style="color: #2c3e50; font-size: 32px; margin: 0; letter-spacing: 3px;">${otp}</h1>
          </div>
          
          <p><strong>Catatan penting:</strong></p>
          <ul>
            <li>Kode ini akan kedaluwarsa dalam <strong>5 menit</strong></li>
            <li>Jangan bagikan kode ini kepada siapapun</li>
            <li>Gunakan kode ini hanya untuk verifikasi di website resmi Desa Banyusri</li>
          </ul>
          
          <p>Jika Anda tidak merasa meminta kode ini, abaikan email ini.</p>
          
          <hr style="margin: 20px 0;">
          <p style="font-size: 12px; color: #666;">
            Email otomatis dari Sistem Pengaduan Online Desa Banyusri<br>
            Kecamatan Wonosegoro, Kabupaten Boyolali
          </p>
        </div>
      `
    };

    await transporter.sendMail(mailOptions);

    console.log(`✅ OTP berhasil dikirim ke ${email}: ${otp}`);
    res.json({ 
      success: true, 
      message: 'Kode OTP berhasil dikirim ke email Anda. Silakan cek inbox atau folder spam.' 
    });

  } catch (error) {
    console.error('❌ Error detail saat kirim OTP:', error);
    
    // Berikan response error yang lebih spesifik
    let errorMessage = 'Gagal mengirim OTP';
    
    if (error.code === 'EAUTH') {
      errorMessage = 'Autentikasi email gagal. Periksa username dan App Password Gmail.';
    } else if (error.code === 'ECONNECTION') {
      errorMessage = 'Tidak dapat terhubung ke server email.';
    } else if (error.response && error.response.includes('Invalid login')) {
      errorMessage = 'Login email tidak valid. Periksa username dan password.';
    }
    
    res.status(500).json({ 
      success: false, 
      message: errorMessage,
      debug: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// ✅ ENDPOINT VERIFIKASI OTP YANG SUDAH DIPERBAIKI
app.post('/verifikasi-otp', (req, res) => {
  const { email, otp } = req.body;

  if (!email || !otp) {
    return res.status(400).json({ 
      success: false, 
      message: 'Email dan OTP harus diisi' 
    });
  }

  const storedOtp = otpStore[email];
  
  if (!storedOtp) {
    return res.status(400).json({ 
      success: false, 
      message: 'OTP tidak ditemukan atau sudah kadaluarsa' 
    });
  }

  // Cek apakah OTP sudah kedaluwarsa
  if (Date.now() > storedOtp.expires) {
    delete otpStore[email];
    return res.status(400).json({ 
      success: false, 
      message: 'OTP sudah kedaluwarsa. Silakan minta kode baru.' 
    });
  }

  // Verifikasi OTP
  if (storedOtp.code.toString() === otp.toString()) {
    delete otpStore[email];
    return res.json({ 
      success: true, 
      message: 'OTP berhasil diverifikasi.' 
    });
  }

  return res.status(400).json({ 
    success: false, 
    message: 'Kode OTP tidak valid.' 
  });
});

// Endpoint simpan pengaduan dan kirim ke email desa (DIPERBAIKI)
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

    // ✅ PERBAIKAN: Kirim email ke admin/balai desa
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
    const token = jwt.sign({ id: admin.id, username: admin.username }, SECRET_KEY, { expiresIn: '8h' });
    res.json({ success: true, token, username: admin.username });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: 'Kesalahan server' });
  }
});

// Ambil semua pengaduan untuk admin (dengan autentikasi)
app.get('/admin/pengaduan', verifikasiAdmin, async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM pengaduan ORDER BY tanggal DESC');
    res.json({ success: true, data: result.rows });
  } catch (err) {
    console.error('❌ Gagal ambil data pengaduan:', err);
    res.status(500).json({ success: false, message: 'Gagal ambil data pengaduan' });
  }
});

// Update status pengaduan (dengan autentikasi) - DIPERBAIKI
app.put('/admin/pengaduan/:id/status', verifikasiAdmin, async (req, res) => {
  const { id } = req.params;
  const { status } = req.body;

  try {
    const result = await pool.query('SELECT * FROM pengaduan WHERE id = $1', [id]);
    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Pengaduan tidak ditemukan' });
    }

    const data = result.rows[0];

    await pool.query('UPDATE pengaduan SET status = $1 WHERE id = $2', [status, id]);

    // Kirim email notifikasi jika ada email
    if (data.email) {
      try {
        // ✅ PERBAIKAN: createTransport bukan createTransporter
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
      } catch (emailError) {
        console.log('⚠️ Gagal kirim email notifikasi:', emailError);
      }
    }

    res.json({ success: true, message: 'Status berhasil diperbarui.' });

  } catch (err) {
    console.error('❌ Gagal ubah status:', err);
    res.status(500).json({ success: false, message: 'Gagal memperbarui status' });
  }
});

// Endpoint untuk mendapatkan statistik dashboard
app.get('/admin/stats', verifikasiAdmin, async (req, res) => {
  try {
    // Gunakan satu query untuk konsistensi data
    const result = await pool.query(`
      SELECT 
        COUNT(*) as total,
        COUNT(CASE WHEN UPPER(TRIM(COALESCE(status, 'MENUNGGU'))) = 'MENUNGGU' THEN 1 END) as menunggu,
        COUNT(CASE WHEN UPPER(TRIM(COALESCE(status, ''))) = 'DIPROSES' THEN 1 END) as diproses,
        COUNT(CASE WHEN UPPER(TRIM(COALESCE(status, ''))) = 'SELESAI' THEN 1 END) as selesai
      FROM pengaduan
    `);

    const stats = result.rows[0];
    
    // Debug logging
    console.log('📊 Stats raw data:', stats);
    
    const data = {
      total: parseInt(stats.total) || 0,
      menunggu: parseInt(stats.menunggu) || 0,
      diproses: parseInt(stats.diproses) || 0,
      selesai: parseInt(stats.selesai) || 0
    };
    
    console.log('📊 Stats processed:', data);

    res.json({
      success: true,
      data: data
    });
    
  } catch (err) {
    console.error('❌ Gagal ambil statistik:', err);
    res.status(500).json({ 
      success: false, 
      message: 'Gagal ambil statistik',
      error: process.env.NODE_ENV === 'development' ? err.message : undefined
    });
  }
});

// ✅ Cleanup expired OTPs setiap 10 menit
setInterval(() => {
  const now = Date.now();
  Object.keys(otpStore).forEach(email => {
    if (otpStore[email].expires < now) {
      delete otpStore[email];
      console.log(`🧹 OTP untuk ${email} sudah dihapus karena kedaluwarsa`);
    }
  });
}, 10 * 60 * 1000);

// Jalankan server
app.listen(PORT, () => {
  console.log(`🚀 Server berjalan di port ${PORT}`);
});

// Tangani error global
process.on('uncaughtException', (error) => {
  console.error('❌ Uncaught Exception:', error);
});