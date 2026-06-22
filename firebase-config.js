/* ============================================================
   FIREBASE CONFIGURATION
   ============================================================ */
const firebaseConfig = {
  apiKey: "AIzaSyDSvWZJeVgIDPeLqvHE7v4lwgAs1w-Y05U",
  authDomain: "absensi-praktik-industri.firebaseapp.com",
  projectId: "absensi-praktik-industri",
  storageBucket: "absensi-praktik-industri.firebasestorage.app",
  messagingSenderId: "1066321977093",
  appId: "1:1066321977093:web:f859c652d4d8e49a38e16c"
};

// Inisialisasi Firebase (Firebase SDK versi "compat")
firebase.initializeApp(firebaseConfig);

// Referensi global yang dipakai di seluruh halaman
const auth = firebase.auth();
const db = firebase.firestore();

// Nama koleksi Firestore
const COL_USERS = "users";
const COL_ATTENDANCE = "attendance";