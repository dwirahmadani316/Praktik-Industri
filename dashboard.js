/* ============================================================
   DASHBOARD.JS — Logika untuk dashboard.html (pengguna/anak magang)
   ============================================================ */

// ===================== VARIABEL GLOBAL =====================
let currentUser = null;
let currentProfile = null;
let todayDocId = null;
let historyData = [];
let unsubToday = null;
let unsubHistory = null;
let clockInterval = null;

// --- KONFIGURASI LOKASI ABSEN (Kemenkes CPI Makassar) ---
// Silakan sesuaikan titik koordinat ini jika kurang pas
const TARGET_LAT = -5.140338; // Contoh latitude Kemenkes CPI
const TARGET_LNG = 119.400927; // Contoh longitude Kemenkes CPI
const MAX_RADIUS_METER = 3000; // Jarak maksimal 50 meter dari titik

// ===================== INISIALISASI HALAMAN =====================
document.addEventListener("DOMContentLoaded", async () => {
  const { user, profile } = await requireAuth("user");
  currentUser = user;
  currentProfile = profile;
  todayDocId = `${user.uid}_${AppUtils.todayStr()}`;

  document.getElementById("navUserName").textContent = profile.nama;
  document.getElementById("welcomeName").textContent = profile.nama;
  document.getElementById("todayDateLabel").textContent = AppUtils.displayDate(AppUtils.todayStr());

  // Set default filter ke bulan saat ini
  const curMonth = String(new Date().getMonth() + 1).padStart(2, "0");
  document.getElementById("filterBulanUser").value = curMonth;

  startLiveClock();
  listenTodayStatus();
  listenHistory();

  document.getElementById("btnAbsenMasuk").addEventListener("click", absenMasuk);
  document.getElementById("btnAbsenPulang").addEventListener("click", absenPulang);
  document.getElementById("formIzinSakit").addEventListener("submit", submitIzinSakit);
  document.getElementById("btnLogout").addEventListener("click", logoutUser);
  document.getElementById("btnLogoutMobile").addEventListener("click", logoutUser);
  
  document.getElementById("filterBulanUser").addEventListener("change", applyUserFilters);
  document.getElementById("filterTahunUser").addEventListener("change", applyUserFilters);

  const tglInput = document.getElementById("izinTanggal");
  tglInput.min = AppUtils.todayStr();
  tglInput.value = AppUtils.todayStr();
});

window.addEventListener("beforeunload", () => {
  if (unsubToday) unsubToday();
  if (unsubHistory) unsubHistory();
  if (clockInterval) clearInterval(clockInterval);
});

// ===================== JAM REALTIME =====================
function startLiveClock() {
  const clockEl = document.getElementById("liveClock");
  clockEl.textContent = AppUtils.nowTimeStr();
  clockInterval = setInterval(() => {
    clockEl.textContent = AppUtils.nowTimeStr();
  }, 1000);
}

// ===================== TAMPILAN KARTU ABSEN HARI INI =====================
function listenTodayStatus() {
  unsubToday = db.collection(COL_ATTENDANCE).doc(todayDocId).onSnapshot(
    (snap) => renderTodayCard(snap.exists ? snap.data() : null),
    (err) => console.error(err)
  );
}

function renderTodayCard(data) {
  const statusEl = document.getElementById("todayStatusBadge");
  const jamMasukEl = document.getElementById("todayJamMasuk");
  const jamPulangEl = document.getElementById("todayJamPulang");
  const btnMasuk = document.getElementById("btnAbsenMasuk");
  const btnPulang = document.getElementById("btnAbsenPulang");
  const inputKet = document.getElementById("inputKeteranganAbsen");
  const fotoInput = document.getElementById("inputFotoAbsen");

  if (!data) {
    statusEl.innerHTML = '<span class="badge bg-secondary">Belum Absen</span>';
    jamMasukEl.textContent = "-";
    jamPulangEl.textContent = "-";
    inputKet.value = "";
    inputKet.disabled = false;
    fotoInput.disabled = false;
    btnMasuk.disabled = false;
    btnPulang.disabled = true;
    return;
  }

  statusEl.innerHTML = AppUtils.badgeStatus(data.status);
  jamMasukEl.textContent = data.jamMasuk || "-";
  jamPulangEl.textContent = data.jamPulang || "-";
  
  if (data.keterangan) inputKet.value = data.keterangan;

  if (data.status === "Izin" || data.status === "Sakit" || data.status === "Alfa") {
    btnMasuk.disabled = true;
    btnPulang.disabled = true;
    inputKet.disabled = true;
    if(fotoInput) fotoInput.disabled = true;
  } else {
    btnMasuk.disabled = !!data.jamMasuk;
    btnPulang.disabled = !data.jamMasuk || !!data.jamPulang;
    inputKet.disabled = !!data.jamPulang;
    if(fotoInput) fotoInput.disabled = !!data.jamMasuk; // Kunci input foto jika sudah absen masuk
  }
}

// ===================== UTILITAS LOKASI & KOMPRESOR FOTO =====================
function hitungJarakSpheris(lat1, lon1, lat2, lon2) {
  const R = 6371000;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
            Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
            Math.sin(dLon/2) * Math.sin(dLon/2);
  return R * (2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a)));
}

function compressImage(file, quality = 0.6) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = (event) => {
      const img = new Image();
      img.src = event.target.result;
      img.onload = () => {
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        const MAX_WIDTH = 600;
        const MAX_HEIGHT = 600;
        let width = img.width;
        let height = img.height;

        if (width > height) {
          if (width > MAX_WIDTH) { height *= MAX_WIDTH / width; width = MAX_WIDTH; }
        } else {
          if (height > MAX_HEIGHT) { width *= MAX_HEIGHT / height; height = MAX_HEIGHT; }
        }

        canvas.width = width;
        canvas.height = height;
        ctx.drawImage(img, 0, 0, width, height);

        canvas.toBlob((blob) => {
          resolve(new File([blob], file.name, { type: 'image/jpeg', lastModified: Date.now() }));
        }, 'image/jpeg', quality);
      };
    };
    reader.onerror = (error) => reject(error);
  });
}

// ===================== LOGIKA ABSEN MASUK =====================
async function absenMasuk() {
  const btn = document.getElementById("btnAbsenMasuk");
  const fotoInput = document.getElementById("inputFotoAbsen");
  const keterangan = document.getElementById("inputKeteranganAbsen").value.trim();

  // 1. Wajib ada foto
  if (!fotoInput || !fotoInput.files || fotoInput.files.length === 0) {
    Swal.fire("Gagal Absen", "Wajib mengambil foto selfie di lokasi terlebih dahulu.", "warning");
    return;
  }

  btn.disabled = true;
  btn.innerHTML = '<span class="spinner-border spinner-border-sm me-2"></span>Cek Lokasi...';

  if (!navigator.geolocation) {
    Swal.fire("Gagal", "Browser Anda tidak mendukung GPS.", "error");
    btn.disabled = false;
    btn.innerHTML = '<i class="fa-solid fa-arrow-right-to-bracket me-2"></i>Absen Masuk';
    return;
  }

  // 2. Ambil Lokasi GPS
  navigator.geolocation.getCurrentPosition(async (position) => {
    const userLat = position.coords.latitude;
    const userLng = position.coords.longitude;
    const jarak = hitungJarakSpheris(userLat, userLng, TARGET_LAT, TARGET_LNG);

    if (jarak > MAX_RADIUS_METER) {
      Swal.fire("Diluar Jangkauan!", `Anda berjarak ${Math.round(jarak)} meter dari Kemenkes CPI. Maksimal jarak absen adalah ${MAX_RADIUS_METER} meter.`, "error");
      btn.disabled = false;
      btn.innerHTML = '<i class="fa-solid fa-arrow-right-to-bracket me-2"></i>Absen Masuk';
      return;
    }

    btn.innerHTML = '<span class="spinner-border spinner-border-sm me-2"></span>Memproses Foto...';
    try {
      // 3. Kompresi Foto
      const fileAsli = fotoInput.files[0];
      const fileKompresi = await compressImage(fileAsli, 0.6);

btn.innerHTML = '<span class="spinner-border spinner-border-sm me-2"></span>Mengunggah...';
      
      // --- LOGIKA BARU: UPLOAD KE IMGBB ---
      const IMGBB_API_KEY = "b77a673aa78f17561c9d2836eaef125e"; // Ganti dengan API Key yang Anda salin!
      const formData = new FormData();
      formData.append("image", fileKompresi);

      const response = await fetch(`https://api.imgbb.com/1/upload?key=${IMGBB_API_KEY}`, {
        method: "POST",
        body: formData
      });
      const dataImgbb = await response.json();

      if (!dataImgbb.success) {
        throw new Error("Gagal mengunggah foto ke server");
      }
      
      const fotoUrl = dataImgbb.data.url;

      // 4. Simpan ke Database
      btn.innerHTML = '<span class="spinner-border spinner-border-sm me-2"></span>Mencatat...';
      const ref = db.collection(COL_ATTENDANCE).doc(todayDocId);
      
      await ref.set({
        uid: currentUser.uid,
        nama: currentProfile.nama,
        tanggal: AppUtils.todayStr(),
        jamMasuk: AppUtils.nowTimeStr(),
        jamPulang: null,
        status: "Hadir",
        keterangan: keterangan,
        fotoMasukUrl: fotoUrl,
        koordinatMasuk: `${userLat},${userLng}`,
        updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
        createdAt: firebase.firestore.FieldValue.serverTimestamp()
      }, { merge: true });

      Swal.fire("Absen Berhasil", "Lokasi dan Foto berhasil diverifikasi.", "success");
      
      // Kosongkan input foto setelah berhasil
      fotoInput.value = "";

    } catch (err) {
      console.error(err);
      Swal.fire("Gagal", "Terjadi kesalahan sistem saat memproses foto/database.", "error");
    } finally {
      btn.disabled = false;
      btn.innerHTML = '<i class="fa-solid fa-arrow-right-to-bracket me-2"></i>Absen Masuk';
    }

  }, (error) => {
    Swal.fire("Akses Lokasi Ditolak", "Izinkan akses GPS di browser Anda untuk melakukan absensi.", "error");
    btn.disabled = false;
    btn.innerHTML = '<i class="fa-solid fa-arrow-right-to-bracket me-2"></i>Absen Masuk';
  }, { enableHighAccuracy: true });
}

// ===================== LOGIKA ABSEN PULANG =====================
async function absenPulang() {
  const btn = document.getElementById("btnAbsenPulang");
  const keterangan = document.getElementById("inputKeteranganAbsen").value.trim();
  btn.disabled = true;
  
  try {
    const ref = db.collection(COL_ATTENDANCE).doc(todayDocId);
    const snap = await ref.get();
    
    if (!snap.exists || !snap.data().jamMasuk) {
      AppUtils.toast("warning", "Anda belum absen masuk hari ini");
      return;
    }
    if (snap.data().jamPulang) {
      AppUtils.toast("info", "Anda sudah absen pulang hari ini");
      return;
    }
    
    await ref.update({
      jamPulang: AppUtils.nowTimeStr(),
      keterangan: keterangan || snap.data().keterangan || "",
      updatedAt: firebase.firestore.FieldValue.serverTimestamp()
    });
    
    Swal.fire({
      icon: "success",
      title: "Absen Pulang Berhasil",
      text: `Jam pulang dicatat pukul ${AppUtils.nowTimeStr()}`,
      confirmButtonColor: "#1656c7"
    });
  } catch (err) {
    console.error(err);
    Swal.fire("Gagal", "Terjadi kesalahan saat absen pulang.", "error");
  } finally {
    btn.disabled = false;
  }
}

// ===================== IZIN / SAKIT =====================
async function submitIzinSakit(e) {
  e.preventDefault();
  const tanggal = document.getElementById("izinTanggal").value;
  const status = document.getElementById("izinStatus").value;
  const keterangan = document.getElementById("izinKeterangan").value.trim();
  if (!tanggal || !status) return;

  const submitBtn = document.getElementById("btnSubmitIzin");
  submitBtn.disabled = true;

  const ref = db.collection(COL_ATTENDANCE).doc(`${currentUser.uid}_${tanggal}`);
  try {
    const snap = await ref.get();
    if (snap.exists && snap.data().jamMasuk) {
      Swal.fire("Tidak Bisa Diajukan", "Anda sudah tercatat Hadir pada tanggal tersebut.", "warning");
      return;
    }
    await ref.set({
      uid: currentUser.uid,
      nama: currentProfile.nama,
      tanggal,
      jamMasuk: null,
      jamPulang: null,
      status,
      keterangan,
      updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
      createdAt: snap.exists ? snap.data().createdAt : firebase.firestore.FieldValue.serverTimestamp()
    }, { merge: true });

    bootstrap.Modal.getInstance(document.getElementById("modalIzinSakit")).hide();
    e.target.reset();
    document.getElementById("izinTanggal").value = AppUtils.todayStr();
    Swal.fire({
      icon: "success",
      title: "Pengajuan Terkirim",
      text: `Status ${status} berhasil diajukan untuk tanggal ${AppUtils.displayDate(tanggal)}.`,
      confirmButtonColor: "#1656c7"
    });
  } catch (err) {
    console.error(err);
    Swal.fire("Gagal", "Terjadi kesalahan saat mengirim pengajuan.", "error");
  } finally {
    submitBtn.disabled = false;
  }
}

// ===================== RIWAYAT & FILTER TABEL =====================
function listenHistory() {
  unsubHistory = db.collection(COL_ATTENDANCE)
    .where("uid", "==", currentUser.uid)
    .onSnapshot((qs) => {
        historyData = [];
        qs.forEach((doc) => historyData.push({ id: doc.id, ...doc.data() }));
        historyData.sort((a, b) => b.tanggal.localeCompare(a.tanggal));
        
        populateUserYears();
        applyUserFilters();
      },
      (err) => console.error(err)
    );
}

function populateUserYears() {
  const years = Array.from(new Set(historyData.map((d) => d.tanggal.slice(0, 4)))).sort((a, b) => b - a);
  const selTahun = document.getElementById("filterTahunUser");
  const currentYear = String(new Date().getFullYear());
  
  if (years.length === 0) {
    selTahun.innerHTML = `<option value="${currentYear}">${currentYear}</option>`;
    return;
  }
  
  const curFilter = selTahun.value;
  selTahun.innerHTML = '<option value="">Semua Tahun</option>' + years.map((y) => `<option value="${y}">${y}</option>`).join("");
  
  if (!curFilter && years.includes(currentYear)) {
    selTahun.value = currentYear;
  } else if (years.includes(curFilter)) {
    selTahun.value = curFilter;
  }
}

function applyUserFilters() {
  const bulan = document.getElementById("filterBulanUser").value;
  const tahun = document.getElementById("filterTahunUser").value;

  const filteredData = historyData.filter((d) => {
    if (bulan && d.tanggal.slice(5, 7) !== bulan) return false;
    if (tahun && d.tanggal.slice(0, 4) !== tahun) return false;
    return true;
  });

  renderHistoryTable(filteredData);
  renderStats(filteredData);
}

function renderHistoryTable(data) {
  const tbody = document.getElementById("historyTableBody");
  if (data.length === 0) {
    tbody.innerHTML = `<tr><td colspan="5" class="text-center text-muted py-4">Belum ada data absensi untuk periode ini</td></tr>`;
    return;
  }
  tbody.innerHTML = data.map((d) => `
    <tr>
      <td>${AppUtils.displayDate(d.tanggal)}</td>
      <td><span class="badge bg-light text-dark border"><i class="fa-regular fa-clock text-primary me-1"></i> ${d.jamMasuk || "-"}</span></td>
      <td><span class="badge bg-light text-dark border"><i class="fa-regular fa-clock text-danger me-1"></i> ${d.jamPulang || "-"}</span></td>
      <td>${AppUtils.badgeStatus(d.status)}</td>
      <td class="text-muted small">${d.keterangan || "-"}</td>
    </tr>`
  ).join("");
}

function renderStats(data) {
  const counts = { Hadir: 0, Izin: 0, Sakit: 0, Alfa: 0 };
  data.forEach((d) => {
    if (counts[d.status] !== undefined) counts[d.status]++;
  });
  
  document.getElementById("statHadir").textContent = counts.Hadir;
  document.getElementById("statIzin").textContent = counts.Izin;
  document.getElementById("statSakit").textContent = counts.Sakit;
  document.getElementById("statAlfa").textContent = counts.Alfa;
}
