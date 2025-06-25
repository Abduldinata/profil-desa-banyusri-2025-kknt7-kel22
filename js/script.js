// ========== Firebase Configuration ==========
const firebaseConfig = {
  apiKey: "AIzaSyBdXzA2KMw2wvO-_PWb9DQiOIkc7Yipvgo",
  authDomain: "desa-banyusri-admin.firebaseapp.com",
  projectId: "desa-banyusri-admin",
  storageBucket: "desa-banyusri-admin.appspot.com",
  messagingSenderId: "623445018632",
  appId: "1:623445018632:web:98447c399e7d18c1a969bd"
};

firebase.initializeApp(firebaseConfig);
const db = firebase.firestore();

// ========== Tab Switching ==========
function showTab(tabId) {
  document.querySelectorAll(".tab-content").forEach(el => el.classList.remove("active"));
  document.querySelectorAll(".tab").forEach(el => el.classList.remove("active"));

  document.getElementById(tabId)?.classList.add("active");
  document.querySelector(`.tab[onclick="showTab('${tabId}')"]`)?.classList.add("active");
}

// ========== Load Pengaduan Form Data ==========
async function loadPengaduanData() {
  const loading = document.getElementById("pengaduanLoading");
  const display = document.getElementById("pengaduanData");

  try {
    const doc = await db.collection("desa_banyusri").doc("googleForm").get();
    const data = doc.data();
    const form = data?.value;

    if (form) {
      document.getElementById("currentFormLink").textContent = form;
      document.getElementById("formLastUpdate").textContent = data.lastUpdate || "-";
      document.getElementById("formUpdatedBy").textContent = data.updatedBy || "-";
      document.getElementById("googleFormLink").value = form;

      const previewIframe = document.getElementById("previewIframe");
      previewIframe.src = form.replace("/viewform", "/viewform?embedded=true");
      document.getElementById("formPreview").style.display = "block";
    }

    loading.style.display = "none";
    display.style.display = "block";
  } catch (err) {
    console.error("🔥 Gagal memuat form pengaduan:", err);
  }
}

// ========== Submit Update Pengaduan ==========
document.getElementById("pengaduanForm")?.addEventListener("submit", async (e) => {
  e.preventDefault();
  const link = document.getElementById("googleFormLink").value.trim();

  try {
    await db.collection("desa_banyusri").doc("googleForm").set({
      value: link,
      updatedBy: firebase.auth().currentUser?.email || "anonymous",
      lastUpdate: new Date().toISOString()
    });

    loadPengaduanData();
    alert("✅ Link Form Pengaduan berhasil diperbarui.");
  } catch (err) {
    console.error("❌ Gagal update:", err);
    alert("❌ Gagal memperbarui form.");
  }
});

// ========== Load Kontak ==========
async function loadKontakData() {
  const loading = document.getElementById("kontakLoading");
  const display = document.getElementById("kontakData");

  try {
    const doc = await db.collection("desa_banyusri").doc("contacts").get();
    const data = doc.data()?.value;
    if (!data) return;

    document.getElementById("kepalaDesa").value = data.kepalaDesa || "";
    document.getElementById("sekretarisDesa").value = data.sekretarisDesa || "";
    document.getElementById("whatsappDesa").value = data.whatsappDesa || "";
    document.getElementById("emailDesa").value = data.emailDesa || "";
    document.getElementById("telefonDesa").value = data.telefonDesa || "";
    document.getElementById("alamatDesa").value = data.alamatDesa || "";
    document.getElementById("jamOperasional").value = data.jamOperasional || "";

    display.style.display = "block";
    loading.style.display = "none";
  } catch (err) {
    console.error("🔥 Gagal memuat kontak:", err);
  }
}

// ========== Submit Update Kontak ==========
document.getElementById("kontakForm")?.addEventListener("submit", async (e) => {
  e.preventDefault();

  const contacts = {
    kepalaDesa: document.getElementById("kepalaDesa").value.trim(),
    sekretarisDesa: document.getElementById("sekretarisDesa").value.trim(),
    whatsappDesa: document.getElementById("whatsappDesa").value.trim(),
    emailDesa: document.getElementById("emailDesa").value.trim(),
    telefonDesa: document.getElementById("telefonDesa").value.trim(),
    alamatDesa: document.getElementById("alamatDesa").value.trim(),
    jamOperasional: document.getElementById("jamOperasional").value.trim()
  };

  try {
    await db.collection("desa_banyusri").doc("contacts").set({
      value: contacts,
      updatedBy: firebase.auth().currentUser?.email || "anonymous",
      lastUpdate: new Date().toISOString()
    });

    alert("✅ Kontak berhasil diperbarui.");
  } catch (err) {
    console.error("❌ Gagal update kontak:", err);
    alert("❌ Gagal memperbarui kontak.");
  }
});

// ========== Load Users ==========
async function loadUserList() {
  const loading = document.getElementById("usersLoading");
  const display = document.getElementById("usersData");
  const list = document.getElementById("usersList");

  try {
    const snap = await db.collection("desa_users").get();
    const html = [];

    snap.forEach(doc => {
      const user = doc.data();
      html.push(`<p>👤 ${user.fullName} — <code>${user.role}</code></p>`);
    });

    list.innerHTML = html.join("");
    loading.style.display = "none";
    display.style.display = "block";
  } catch (err) {
    console.error("❌ Gagal memuat users:", err);
  }
}

// ========== Tambah User ==========
document.getElementById("addUserForm")?.addEventListener("submit", async (e) => {
  e.preventDefault();

  const id = document.getElementById("newUsername").value.trim();
  const newUser = {
    username: id,
    password: document.getElementById("newPassword").value.trim(),
    role: document.getElementById("userRole").value,
    fullName: document.getElementById("userFullName").value.trim(),
    createdAt: new Date().toISOString(),
    createdBy: firebase.auth().currentUser?.email || "anonymous",
    active: true
  };

  try {
    await db.collection("desa_users").doc(id).set(newUser);
    alert("✅ User berhasil ditambahkan.");
    loadUserList();
  } catch (err) {
    console.error("❌ Gagal menambah user:", err);
    alert("❌ Gagal menambahkan user.");
  }
});

// ========== Inisialisasi ==========
document.addEventListener("DOMContentLoaded", () => {
  loadPengaduanData();
  loadKontakData();
  loadUserList();
});
