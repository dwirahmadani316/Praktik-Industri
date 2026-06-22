/* ============================================================
   AUTH.JS
   - Utilitas umum (AppUtils) dipakai oleh dashboard.js & admin.js
   - Guard otentikasi (requireAuth) -> redirect otomatis jika belum
     login atau role tidak sesuai
   - Logout
   - Handler form login (hanya aktif di index.html)
   ============================================================ */

// ===================== UTILITAS UMUM =====================
const AppUtils = {
  // Tanggal hari ini berdasarkan perangkat pengguna -> 'YYYY-MM-DD'
  todayStr() {
    return AppUtils.dateToStr(new Date());
  },
  dateToStr(d) {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${y}-${m}-${day}`;
  },
  // Jam saat ini berdasarkan perangkat pengguna -> 'HH:MM:SS'
  nowTimeStr() {
    const d = new Date();
    const h = String(d.getHours()).padStart(2, "0");
    const m = String(d.getMinutes()).padStart(2, "0");
    const s = String(d.getSeconds()).padStart(2, "0");
    return `${h}:${m}:${s}`;
  },
  // 'YYYY-MM-DD' -> '22 Jun 2026'
  displayDate(str) {
    if (!str) return "-";
    const bulan = ["Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Agu", "Sep", "Okt", "Nov", "Des"];
    const parts = str.split("-");
    if (parts.length !== 3) return str;
    const [y, m, d] = parts;
    return `${parseInt(d, 10)} ${bulan[parseInt(m, 10) - 1]} ${y}`;
  },
  monthName(m) {
    const bulan = ["Januari", "Februari", "Maret", "April", "Mei", "Juni", "Juli", "Agustus", "September", "Oktober", "November", "Desember"];
    return bulan[parseInt(m, 10) - 1] || "-";
  },
  badgeStatus(status) {
    const map = { Hadir: "success", Izin: "warning", Sakit: "info", Alfa: "danger" };
    const cls = map[status] || "secondary";
    return `<span class="badge badge-status bg-${cls}">${status || "-"}</span>`;
  },
  toast(icon, title) {
    Swal.fire({
      toast: true,
      position: "top-end",
      icon,
      title,
      showConfirmButton: false,
      timer: 2600,
      timerProgressBar: true
    });
  }
};

// ===================== AUTH GUARD =====================
/**
 * Memastikan pengguna sudah login & (opsional) memiliki role tertentu.
 * - Belum login            -> redirect ke index.html
 * - Profil Firestore tidak ada -> sign out + redirect ke index.html
 * - Role tidak sesuai       -> redirect ke dashboard yang sesuai
 * Dipakai juga untuk menangani sesi yang berakhir: onAuthStateChanged
 * akan terpicu ulang kapan pun status login berubah (mis. token invalid).
 */
function requireAuth(requiredRole) {
  return new Promise((resolve) => {
    auth.onAuthStateChanged(async (user) => {
      if (!user) {
        window.location.href = "index.html";
        return;
      }
      try {
        const snap = await db.collection(COL_USERS).doc(user.uid).get();
        if (!snap.exists) {
          await auth.signOut();
          Swal.fire({
            icon: "error",
            title: "Akun Belum Terdaftar",
            text: "Profil pengguna tidak ditemukan di sistem. Silakan hubungi admin."
          }).then(() => (window.location.href = "index.html"));
          return;
        }
        const profile = snap.data();
        if (requiredRole && profile.role !== requiredRole) {
          window.location.href = profile.role === "admin" ? "admin.html" : "dashboard.html";
          return;
        }
        resolve({ user, profile });
      } catch (err) {
        console.error(err);
        Swal.fire("Terjadi Kesalahan", "Gagal memuat data profil. Coba muat ulang halaman.", "error");
      }
    });
  });
}

function logoutUser() {
  Swal.fire({
    title: "Keluar dari sistem?",
    text: "Anda akan diarahkan ke halaman login.",
    icon: "question",
    showCancelButton: true,
    confirmButtonText: "Ya, keluar",
    cancelButtonText: "Batal",
    confirmButtonColor: "#1656c7",
    cancelButtonColor: "#9ca3af"
  }).then((res) => {
    if (res.isConfirmed) {
      auth.signOut().then(() => (window.location.href = "index.html"));
    }
  });
}

// ===================== HALAMAN LOGIN (index.html) =====================
document.addEventListener("DOMContentLoaded", () => {
  const loginForm = document.getElementById("loginForm");
  if (!loginForm) return; // file ini di-include di semua halaman, hanya jalankan di halaman login

  // Jika sesi login masih aktif, langsung arahkan ke dashboard yang sesuai
  auth.onAuthStateChanged(async (user) => {
    if (!user) return;
    try {
      const snap = await db.collection(COL_USERS).doc(user.uid).get();
      if (snap.exists) {
        const role = snap.data().role;
        window.location.href = role === "admin" ? "admin.html" : "dashboard.html";
      }
    } catch (e) {
      /* biarkan pengguna login ulang jika gagal memuat profil */
    }
  });

  loginForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    const email = document.getElementById("loginEmail").value.trim();
    const password = document.getElementById("loginPassword").value;
    const btn = document.getElementById("btnLogin");
    const originalHtml = btn.innerHTML;

    btn.disabled = true;
    btn.innerHTML = '<span class="spinner-border spinner-border-sm me-2"></span>Memproses...';

    try {
      const cred = await auth.signInWithEmailAndPassword(email, password);
      const snap = await db.collection(COL_USERS).doc(cred.user.uid).get();
      if (!snap.exists) {
        await auth.signOut();
        throw { code: "profile/not-found" };
      }
      const role = snap.data().role;
      window.location.href = role === "admin" ? "admin.html" : "dashboard.html";
    } catch (err) {
      console.error(err);
      let msg = "Email atau password salah.";
      if (err.code === "profile/not-found") msg = "Profil pengguna tidak ditemukan di sistem. Hubungi admin.";
      else if (err.code === "auth/too-many-requests") msg = "Terlalu banyak percobaan gagal. Coba lagi beberapa saat lagi.";
      else if (err.code === "auth/invalid-email") msg = "Format email tidak valid.";
      else if (err.code === "auth/user-disabled") msg = "Akun ini telah dinonaktifkan. Hubungi admin.";
      Swal.fire("Login Gagal", msg, "error");
      btn.disabled = false;
      btn.innerHTML = originalHtml;
    }
  });
});