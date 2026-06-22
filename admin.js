/* ============================================================
   ADMIN.JS — Logika untuk admin.html
   ============================================================ */
let allAttendance = [];
let filteredAttendance = [];
let usersList = []; // semua dokumen di koleksi `users`
let dt; // instance DataTables
let unsubAttendance = null;
let unsubUsers = null;

document.addEventListener("DOMContentLoaded", async () => {
  const { profile } = await requireAuth("admin");
  document.getElementById("navAdminName").textContent = profile.nama;

  document.getElementById("btnLogout").addEventListener("click", logoutUser);
  document.getElementById("btnLogoutMobile").addEventListener("click", logoutUser);

  initDataTable();
  listenAttendance();
  listenUsers();
  bindFilterEvents();
  bindModalEvents();
});

window.addEventListener("beforeunload", () => {
  if (unsubAttendance) unsubAttendance();
  if (unsubUsers) unsubUsers();
});

// ===================== DATATABLES =====================
function initDataTable() {
  dt = $("#attendanceTable").DataTable({
    data: [],
    columns: [
      { data: "nama", title: "Nama" },
      { data: "tanggal", title: "Tanggal", render: (d) => AppUtils.displayDate(d) },
      { data: "jamMasuk", title: "Jam Masuk", render: (d) => d || "-" },
      { data: "jamPulang", title: "Jam Pulang", render: (d) => d || "-" },
      { data: "status", title: "Status", render: (d) => AppUtils.badgeStatus(d) },
      {
        data: null,
        title: "Aksi",
        orderable: false,
        searchable: false,
        render: (data, type, row) => `
          <button class="btn btn-sm btn-outline-primary btn-edit-row me-1" data-id="${row.id}" title="Edit">
            <i class="fa-solid fa-pen"></i>
          </button>
          <button class="btn btn-sm btn-outline-danger btn-delete-row" data-id="${row.id}" title="Hapus">
            <i class="fa-solid fa-trash"></i>
          </button>`
      }
    ],
    order: [[1, "desc"]],
    pageLength: 10,
    language: {
      search: "Cari:",
      lengthMenu: "Tampilkan _MENU_ data",
      info: "Menampilkan _START_ - _END_ dari _TOTAL_ data",
      infoEmpty: "Tidak ada data",
      infoFiltered: "(disaring dari _MAX_ total data)",
      zeroRecords: "Data tidak ditemukan",
      emptyTable: "Belum ada data absensi",
      paginate: { previous: "Sebelumnya", next: "Berikutnya" }
    }
  });

  $("#attendanceTable tbody").on("click", ".btn-edit-row", function () {
    openEditModal($(this).data("id"));
  });
  $("#attendanceTable tbody").on("click", ".btn-delete-row", function () {
    deleteAttendance($(this).data("id"));
  });
}

// ===================== LOAD DATA REALTIME =====================
function listenAttendance() {
  unsubAttendance = db.collection(COL_ATTENDANCE).onSnapshot(
    (qs) => {
      allAttendance = [];
      qs.forEach((doc) => allAttendance.push({ id: doc.id, ...doc.data() }));
      allAttendance.sort((a, b) => b.tanggal.localeCompare(a.tanggal));
      populateYearOptions();
      applyFilters();
    },
    (err) => console.error(err)
  );
}

function listenUsers() {
  unsubUsers = db.collection(COL_USERS).onSnapshot(
    (qs) => {
      usersList = [];
      qs.forEach((doc) => usersList.push({ uid: doc.id, ...doc.data() }));
      renderUsersTable();
      populateAlfaUserSelect();
    },
    (err) => console.error(err)
  );
}

// ===================== FILTER TABEL =====================
function populateYearOptions() {
  const years = Array.from(new Set(allAttendance.map((d) => d.tanggal.slice(0, 4)))).sort((a, b) => b - a);
  const optionsHtml = years.map((y) => `<option value="${y}">${y}</option>`).join("");

  const selFilter = document.getElementById("filterTahun");
  const curFilter = selFilter.value;
  selFilter.innerHTML = '<option value="">Semua Tahun</option>' + optionsHtml;
  if (years.includes(curFilter)) selFilter.value = curFilter;

  const selExport = document.getElementById("exportTahun");
  const curExport = selExport.value;
  selExport.innerHTML = '<option value="" disabled selected>Pilih Tahun</option>' + optionsHtml;
  if (years.includes(curExport)) selExport.value = curExport;
}

function bindFilterEvents() {
  ["filterBulan", "filterTahun", "filterStatus"].forEach((id) => {
    document.getElementById(id).addEventListener("change", applyFilters);
  });
  document.getElementById("btnResetFilter").addEventListener("click", () => {
    document.getElementById("filterBulan").value = "";
    document.getElementById("filterTahun").value = "";
    document.getElementById("filterStatus").value = "";
    applyFilters();
  });
}

function applyFilters() {
  const bulan = document.getElementById("filterBulan").value;
  const tahun = document.getElementById("filterTahun").value;
  const status = document.getElementById("filterStatus").value;

  filteredAttendance = allAttendance.filter((d) => {
    if (bulan && d.tanggal.slice(5, 7) !== bulan) return false;
    if (tahun && d.tanggal.slice(0, 4) !== tahun) return false;
    if (status && d.status !== status) return false;
    return true;
  });

  dt.clear();
  dt.rows.add(filteredAttendance);
  dt.draw();
  renderAdminStats();
}

function renderAdminStats() {
  const counts = { Hadir: 0, Izin: 0, Sakit: 0, Alfa: 0 };
  filteredAttendance.forEach((d) => {
    if (counts[d.status] !== undefined) counts[d.status]++;
  });
  document.getElementById("statHadirAdmin").textContent = counts.Hadir;
  document.getElementById("statIzinAdmin").textContent = counts.Izin;
  document.getElementById("statSakitAdmin").textContent = counts.Sakit;
  document.getElementById("statAlfaAdmin").textContent = counts.Alfa;
}

// ===================== MODAL BINDING =====================
function bindModalEvents() {
  document.getElementById("formEdit").addEventListener("submit", submitEdit);
  document.getElementById("formAlfa").addEventListener("submit", submitAlfa);
  document.getElementById("formUser").addEventListener("submit", submitUser);
  document.getElementById("exportFilterType").addEventListener("change", toggleExportFields);
  document.getElementById("btnDoExport").addEventListener("click", doExport);
  document.getElementById("btnTambahUser").addEventListener("click", openAddUserModal);

  document.getElementById("alfaTanggal").max = AppUtils.todayStr();
}

// ===================== EDIT ABSENSI =====================
function openEditModal(id) {
  const row = allAttendance.find((d) => d.id === id);
  if (!row) return;
  document.getElementById("editDocId").value = id;
  document.getElementById("editNama").value = row.nama;
  document.getElementById("editTanggalDisplay").value = AppUtils.displayDate(row.tanggal);
  document.getElementById("editJamMasuk").value = (row.jamMasuk || "").slice(0, 5);
  document.getElementById("editJamPulang").value = (row.jamPulang || "").slice(0, 5);
  document.getElementById("editStatus").value = row.status;
  document.getElementById("editKeterangan").value = row.keterangan || "";
  new bootstrap.Modal(document.getElementById("modalEdit")).show();
}

async function submitEdit(e) {
  e.preventDefault();
  const id = document.getElementById("editDocId").value;
  const jamMasuk = document.getElementById("editJamMasuk").value;
  const jamPulang = document.getElementById("editJamPulang").value;
  const status = document.getElementById("editStatus").value;
  const keterangan = document.getElementById("editKeterangan").value.trim();
  const btn = document.getElementById("btnSubmitEdit");
  btn.disabled = true;

  try {
    await db.collection(COL_ATTENDANCE).doc(id).update({
      jamMasuk: jamMasuk ? `${jamMasuk}:00` : null,
      jamPulang: jamPulang ? `${jamPulang}:00` : null,
      status,
      keterangan,
      updatedAt: firebase.firestore.FieldValue.serverTimestamp()
    });
    bootstrap.Modal.getInstance(document.getElementById("modalEdit")).hide();
    AppUtils.toast("success", "Data absensi berhasil diperbarui");
  } catch (err) {
    console.error(err);
    Swal.fire("Gagal", "Terjadi kesalahan saat memperbarui data.", "error");
  } finally {
    btn.disabled = false;
  }
}

function deleteAttendance(id) {
  const row = allAttendance.find((d) => d.id === id);
  Swal.fire({
    title: "Hapus data absensi?",
    html: row ? `Data <b>${row.nama}</b> tanggal <b>${AppUtils.displayDate(row.tanggal)}</b> akan dihapus permanen.` : "Data akan dihapus permanen.",
    icon: "warning",
    showCancelButton: true,
    confirmButtonText: "Ya, hapus",
    cancelButtonText: "Batal",
    confirmButtonColor: "#dc3545",
    cancelButtonColor: "#9ca3af"
  }).then(async (res) => {
    if (!res.isConfirmed) return;
    try {
      await db.collection(COL_ATTENDANCE).doc(id).delete();
      AppUtils.toast("success", "Data berhasil dihapus");
    } catch (err) {
      console.error(err);
      Swal.fire("Gagal", "Terjadi kesalahan saat menghapus data.", "error");
    }
  });
}

// ===================== TANDAI ALFA =====================
function populateAlfaUserSelect() {
  const sel = document.getElementById("alfaUser");
  const nonAdmin = usersList.filter((u) => u.role !== "admin");
  sel.innerHTML =
    '<option value="" disabled selected>-- Pilih Pengguna --</option>' +
    nonAdmin.map((u) => `<option value="${u.uid}">${u.nama} (${u.email})</option>`).join("");
}

async function submitAlfa(e) {
  e.preventDefault();
  const uid = document.getElementById("alfaUser").value;
  const tanggal = document.getElementById("alfaTanggal").value;
  if (!uid || !tanggal) return;

  const user = usersList.find((u) => u.uid === uid);
  const docId = `${uid}_${tanggal}`;
  const btn = document.getElementById("btnSubmitAlfa");
  btn.disabled = true;

  try {
    const ref = db.collection(COL_ATTENDANCE).doc(docId);
    const snap = await ref.get();
    if (snap.exists) {
      const lanjut = await Swal.fire({
        title: "Data sudah ada",
        html: `Sudah ada data absensi untuk <b>${user ? user.nama : uid}</b> pada tanggal <b>${AppUtils.displayDate(
          tanggal
        )}</b> (status: ${snap.data().status}). Timpa dengan status Alfa?`,
        icon: "warning",
        showCancelButton: true,
        confirmButtonText: "Ya, timpa",
        cancelButtonText: "Batal",
        confirmButtonColor: "#dc3545"
      });
      if (!lanjut.isConfirmed) {
        btn.disabled = false;
        return;
      }
    }
    await ref.set(
      {
        uid,
        nama: user ? user.nama : "-",
        tanggal,
        jamMasuk: null,
        jamPulang: null,
        status: "Alfa",
        keterangan: "Ditandai oleh admin",
        updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
        createdAt: snap.exists ? snap.data().createdAt : firebase.firestore.FieldValue.serverTimestamp()
      },
      { merge: true }
    );

    bootstrap.Modal.getInstance(document.getElementById("modalAlfa")).hide();
    e.target.reset();
    AppUtils.toast("success", "Status Alfa berhasil dicatat");
  } catch (err) {
    console.error(err);
    Swal.fire("Gagal", "Terjadi kesalahan saat menandai Alfa.", "error");
  } finally {
    btn.disabled = false;
  }
}

// ===================== EXPORT EXCEL =====================
function toggleExportFields() {
  const type = document.getElementById("exportFilterType").value;
  document.getElementById("exportBulanGroup").classList.toggle("d-none", type !== "bulan");
  document.getElementById("exportTahunGroup").classList.toggle("d-none", !(type === "bulan" || type === "tahun"));
  document.getElementById("exportStatusGroup").classList.toggle("d-none", type !== "status");
}

function doExport() {
  const type = document.getElementById("exportFilterType").value;
  let data = [...allAttendance];
  let namaFile = "Data_Absensi_Semua";

  if (type === "bulan") {
    const bulan = document.getElementById("exportBulan").value;
    const tahun = document.getElementById("exportTahun").value;
    if (!bulan || !tahun) {
      AppUtils.toast("warning", "Pilih bulan dan tahun terlebih dahulu");
      return;
    }
    data = data.filter((d) => d.tanggal.slice(5, 7) === bulan && d.tanggal.slice(0, 4) === tahun);
    namaFile = `Data_Absensi_${AppUtils.monthName(bulan)}_${tahun}`;
  } else if (type === "tahun") {
    const tahun = document.getElementById("exportTahun").value;
    if (!tahun) {
      AppUtils.toast("warning", "Pilih tahun terlebih dahulu");
      return;
    }
    data = data.filter((d) => d.tanggal.slice(0, 4) === tahun);
    namaFile = `Data_Absensi_${tahun}`;
  } else if (type === "status") {
    const status = document.getElementById("exportStatus").value;
    if (!status) {
      AppUtils.toast("warning", "Pilih status terlebih dahulu");
      return;
    }
    data = data.filter((d) => d.status === status);
    namaFile = `Data_Absensi_${status}`;
  }

  if (data.length === 0) {
    Swal.fire("Tidak Ada Data", "Tidak ada data yang sesuai dengan filter yang dipilih.", "info");
    return;
  }

  const rows = data
    .sort((a, b) => a.tanggal.localeCompare(b.tanggal))
    .map((d) => ({
      Nama: d.nama,
      Tanggal: AppUtils.displayDate(d.tanggal),
      "Jam Masuk": d.jamMasuk || "-",
      "Jam Pulang": d.jamPulang || "-",
      Status: d.status
    }));

  const ws = XLSX.utils.json_to_sheet(rows);
  ws["!cols"] = [{ wch: 22 }, { wch: 16 }, { wch: 12 }, { wch: 12 }, { wch: 10 }];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Absensi");
  XLSX.writeFile(wb, `${namaFile}.xlsx`);

  bootstrap.Modal.getInstance(document.getElementById("modalExport")).hide();
  AppUtils.toast("success", "File Excel berhasil diunduh");
}

// ===================== KELOLA PENGGUNA =====================
function renderUsersTable() {
  const tbody = document.getElementById("usersTableBody");
  if (usersList.length === 0) {
    tbody.innerHTML = `<tr><td colspan="4" class="text-center text-muted py-4">Belum ada data pengguna</td></tr>`;
    return;
  }
  tbody.innerHTML = usersList
    .map(
      (u) => `
    <tr>
      <td>${u.nama}</td>
      <td>${u.email}</td>
      <td><span class="badge ${u.role === "admin" ? "bg-primary" : "bg-secondary"}">${u.role === "admin" ? "Admin" : "Pengguna"}</span></td>
      <td>
        <button class="btn btn-sm btn-outline-primary btn-edit-user me-1" data-uid="${u.uid}" title="Edit"><i class="fa-solid fa-pen"></i></button>
        <button class="btn btn-sm btn-outline-danger btn-delete-user" data-uid="${u.uid}" title="Hapus Profil"><i class="fa-solid fa-trash"></i></button>
      </td>
    </tr>`
    )
    .join("");

  tbody.querySelectorAll(".btn-edit-user").forEach((btn) => btn.addEventListener("click", () => openEditUserModal(btn.dataset.uid)));
  tbody.querySelectorAll(".btn-delete-user").forEach((btn) => btn.addEventListener("click", () => deleteUserProfile(btn.dataset.uid)));
}

function openAddUserModal() {
  document.getElementById("formUser").reset();
  document.getElementById("userUid").disabled = false;
  document.getElementById("userModalTitle").textContent = "Tambah Pengguna";
  new bootstrap.Modal(document.getElementById("modalUser")).show();
}

function openEditUserModal(uid) {
  const u = usersList.find((x) => x.uid === uid);
  if (!u) return;
  document.getElementById("formUser").reset();
  document.getElementById("userUid").value = u.uid;
  document.getElementById("userUid").disabled = true;
  document.getElementById("userNama").value = u.nama;
  document.getElementById("userEmail").value = u.email;
  document.getElementById("userRole").value = u.role;
  document.getElementById("userModalTitle").textContent = "Edit Pengguna";
  new bootstrap.Modal(document.getElementById("modalUser")).show();
}

async function submitUser(e) {
  e.preventDefault();
  const uid = document.getElementById("userUid").value.trim();
  const nama = document.getElementById("userNama").value.trim();
  const email = document.getElementById("userEmail").value.trim();
  const role = document.getElementById("userRole").value;
  const btn = document.getElementById("btnSubmitUser");

  if (!uid) {
    AppUtils.toast("warning", "UID wajib diisi");
    return;
  }

  btn.disabled = true;
  try {
    await db.collection(COL_USERS).doc(uid).set({ uid, nama, email, role }, { merge: true });
    bootstrap.Modal.getInstance(document.getElementById("modalUser")).hide();
    AppUtils.toast("success", "Profil pengguna berhasil disimpan");
  } catch (err) {
    console.error(err);
    Swal.fire("Gagal", "Terjadi kesalahan saat menyimpan profil pengguna.", "error");
  } finally {
    btn.disabled = false;
  }
}

function deleteUserProfile(uid) {
  const u = usersList.find((x) => x.uid === uid);
  Swal.fire({
    title: "Hapus profil pengguna?",
    html: `Profil <b>${u ? u.nama : uid}</b> akan dihapus dari Firestore.<br><small class="text-muted">Catatan: akun login (Firebase Authentication) tidak ikut terhapus dan harus dihapus manual lewat Firebase Console.</small>`,
    icon: "warning",
    showCancelButton: true,
    confirmButtonText: "Ya, hapus",
    cancelButtonText: "Batal",
    confirmButtonColor: "#dc3545"
  }).then(async (res) => {
    if (!res.isConfirmed) return;
    try {
      await db.collection(COL_USERS).doc(uid).delete();
      AppUtils.toast("success", "Profil pengguna berhasil dihapus");
    } catch (err) {
      console.error(err);
      Swal.fire("Gagal", "Terjadi kesalahan saat menghapus profil.", "error");
    }
  });
}