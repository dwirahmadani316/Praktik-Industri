/* ============================================================
   DASHBOARD.JS — Logika untuk dashboard.html (pengguna/anak magang)
   ============================================================ */
let currentUser = null;
let currentProfile = null;
let todayDocId = null;
let historyData = [];
let unsubToday = null;
let unsubHistory = null;

document.addEventListener("DOMContentLoaded", async () => {
  const { user, profile } = await requireAuth("user");
  currentUser = user;
  currentProfile = profile;
  todayDocId = `${user.uid}_${AppUtils.todayStr()}`;

  document.getElementById("navUserName").textContent = profile.nama;
  document.getElementById("welcomeName").textContent = profile.nama;
  document.getElementById("todayDateLabel").textContent = AppUtils.displayDate(AppUtils.todayStr());

  listenTodayStatus();
  listenHistory();

  document.getElementById("btnAbsenMasuk").addEventListener("click", absenMasuk);
  document.getElementById("btnAbsenPulang").addEventListener("click", absenPulang);
  document.getElementById("formIzinSakit").addEventListener("submit", submitIzinSakit);
  document.getElementById("btnLogout").addEventListener("click", logoutUser);
  document.getElementById("btnLogoutMobile").addEventListener("click", logoutUser);

  const tglInput = document.getElementById("izinTanggal");
  tglInput.min = AppUtils.todayStr();
  tglInput.value = AppUtils.todayStr();
});

// Hentikan listener saat halaman ditutup agar tidak terjadi leak
window.addEventListener("beforeunload", () => {
  if (unsubToday) unsubToday();
  if (unsubHistory) unsubHistory();
});

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

  if (!data) {
    statusEl.innerHTML = '<span class="badge bg-secondary">Belum Absen</span>';
    jamMasukEl.textContent = "-";
    jamPulangEl.textContent = "-";
    btnMasuk.disabled = false;
    btnPulang.disabled = true;
    return;
  }

  statusEl.innerHTML = AppUtils.badgeStatus(data.status);
  jamMasukEl.textContent = data.jamMasuk || "-";
  jamPulangEl.textContent = data.jamPulang || "-";

  if (data.status === "Izin" || data.status === "Sakit") {
    btnMasuk.disabled = true;
    btnPulang.disabled = true;
  } else {
    btnMasuk.disabled = !!data.jamMasuk;
    btnPulang.disabled = !data.jamMasuk || !!data.jamPulang;
  }
}

async function absenMasuk() {
  const btn = document.getElementById("btnAbsenMasuk");
  btn.disabled = true;
  try {
    const ref = db.collection(COL_ATTENDANCE).doc(todayDocId);
    const snap = await ref.get();
    if (snap.exists) {
      const d = snap.data();
      if (d.jamMasuk) {
        AppUtils.toast("info", "Anda sudah absen masuk hari ini");
        return;
      }
      if (d.status === "Izin" || d.status === "Sakit") {
        AppUtils.toast("warning", `Anda sudah mengajukan ${d.status} untuk hari ini`);
        return;
      }
    }
    await ref.set(
      {
        uid: currentUser.uid,
        nama: currentProfile.nama,
        tanggal: AppUtils.todayStr(),
        jamMasuk: AppUtils.nowTimeStr(),
        jamPulang: snap.exists ? snap.data().jamPulang || null : null,
        status: "Hadir",
        keterangan: "",
        updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
        createdAt: snap.exists ? snap.data().createdAt : firebase.firestore.FieldValue.serverTimestamp()
      },
      { merge: true }
    );
    Swal.fire({
      icon: "success",
      title: "Absen Masuk Berhasil",
      text: `Jam masuk dicatat pukul ${AppUtils.nowTimeStr()}`,
      confirmButtonColor: "#1656c7"
    });
  } catch (err) {
    console.error(err);
    Swal.fire("Gagal", "Terjadi kesalahan saat absen masuk.", "error");
  } finally {
    btn.disabled = false;
  }
}

async function absenPulang() {
  const btn = document.getElementById("btnAbsenPulang");
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
    await ref.set(
      {
        uid: currentUser.uid,
        nama: currentProfile.nama,
        tanggal,
        jamMasuk: null,
        jamPulang: null,
        status,
        keterangan,
        updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
        createdAt: snap.exists ? snap.data().createdAt : firebase.firestore.FieldValue.serverTimestamp()
      },
      { merge: true }
    );

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

function listenHistory() {
  unsubHistory = db
    .collection(COL_ATTENDANCE)
    .where("uid", "==", currentUser.uid)
    .onSnapshot(
      (qs) => {
        historyData = [];
        qs.forEach((doc) => historyData.push({ id: doc.id, ...doc.data() }));
        historyData.sort((a, b) => b.tanggal.localeCompare(a.tanggal));
        renderHistoryTable();
        renderStats();
      },
      (err) => console.error(err)
    );
}

function renderHistoryTable() {
  const tbody = document.getElementById("historyTableBody");
  if (historyData.length === 0) {
    tbody.innerHTML = `<tr><td colspan="5" class="text-center text-muted py-4">Belum ada data absensi</td></tr>`;
    return;
  }
  tbody.innerHTML = historyData
    .map(
      (d) => `
    <tr>
      <td>${AppUtils.displayDate(d.tanggal)}</td>
      <td>${d.jamMasuk || "-"}</td>
      <td>${d.jamPulang || "-"}</td>
      <td>${AppUtils.badgeStatus(d.status)}</td>
      <td class="text-muted small">${d.keterangan || "-"}</td>
    </tr>`
    )
    .join("");
}

function renderStats() {
  const counts = { Hadir: 0, Izin: 0, Sakit: 0, Alfa: 0 };
  historyData.forEach((d) => {
    if (counts[d.status] !== undefined) counts[d.status]++;
  });
  document.getElementById("statHadir").textContent = counts.Hadir;
  document.getElementById("statIzin").textContent = counts.Izin;
  document.getElementById("statSakit").textContent = counts.Sakit;
  document.getElementById("statAlfa").textContent = counts.Alfa;
}