// ======= server.js Lengkap dengan OTP Verifikasi =======
require('dotenv').config();
const express = require('express');
const nodemailer = require('nodemailer');
const cors = require('cors');
const bodyParser = require('body-parser');

const app = express();
const PORT = 3000;

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false
  }
});

// --- Jalankan ini sekali saat pertama deploy ---
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
    console.log('✅ Tabel pengaduan berhasil dibuat atau sudah ada.');
  } catch (err) {
    console.error('❌ Gagal membuat tabel pengaduan:', err);
  }
})();

app.use(cors({
  origin: 'https://profil-desa-banyusri-2025-kknt7-kel.vercel.app',
  methods: ['GET', 'POST'],
  credentials: false
}));


app.use(bodyParser.json());

// Simpan OTP sementara dalam memory (email -> { kode, waktu })
const otpStore = new Map();

const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS
    }
});

// === Kirim OTP ===
app.post('/kirim-otp', async (req, res) => {
    const { email } = req.body;

    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        return res.status(400).json({ success: false, message: 'Email tidak valid' });
    }

    const kodeOtp = Math.floor(100000 + Math.random() * 900000).toString();

    otpStore.set(email, {
        kode: kodeOtp,
        waktu: Date.now()
    });

    try {
        await transporter.sendMail({
            from: `Verifikasi OTP <${process.env.EMAIL_USER}>`,
            to: email,
            subject: 'Kode Verifikasi Pengaduan Desa Banyusri',
            text: `Kode verifikasi Anda adalah: ${kodeOtp}`
        });
        res.json({ success: true, message: 'Kode OTP dikirim ke email Anda' });
    } catch (err) {
        console.error(err);
        res.status(500).json({ success: false, message: 'Gagal mengirim OTP' });
    }
});

// === Verifikasi OTP ===
app.post('/verifikasi-otp', (req, res) => {
    const { email, otp } = req.body;
    const data = otpStore.get(email);

    if (!data) return res.status(400).json({ success: false, message: 'OTP tidak ditemukan' });

    const selisih = (Date.now() - data.waktu) / 1000;
    if (selisih > 300) {
        otpStore.delete(email);
        return res.status(400).json({ success: false, message: 'OTP kedaluwarsa' });
    }

    if (data.kode === otp) {
        otpStore.delete(email);
        return res.json({ success: true, message: 'OTP valid' });
    } else {
        return res.status(400).json({ success: false, message: 'OTP salah' });
    }
});

// === Kirim Pengaduan ===
app.post('/kirim-pengaduan', async (req, res) => {
    const data = req.body;

    const emailContent = `
PENGADUAN MASYARAKAT DESA BANYUSRI

INFORMASI PENGADU:
- Nama: ${data.nama}
- NIK: ${data.nik}
- Telepon: ${data.telepon}
- Email: ${data.email || 'Tidak disediakan'}
- Alamat: ${data.alamat}

DETAIL PENGADUAN:
- Jenis: ${data.jenis_pengaduan}
- Judul: ${data.judul_pengaduan}
- Isi Pengaduan: ${data.isi_pengaduan}
- Harapan: ${data.harapan || 'Tidak disediakan'}

Tanggal: ${new Date().toLocaleDateString('id-ID')}
Waktu: ${new Date().toLocaleTimeString('id-ID')}
`;

    try {
        await transporter.sendMail({
            from: `Form Pengaduan <${process.env.EMAIL_USER}>`,
            to: process.env.EMAIL_DESTINATION,
            subject: `📢 Pengaduan Baru: ${data.judul_pengaduan}`,
            text: emailContent
        });

        res.json({ success: true, message: 'Pengaduan berhasil dikirim' });
    } catch (err) {
        console.error(err);
        res.status(500).json({ success: false, message: 'Gagal mengirim pengaduan' });
    }
});

app.listen(process.env.PORT || 3000, () => {
  console.log("Server berjalan di port", process.env.PORT || 3000);
});
