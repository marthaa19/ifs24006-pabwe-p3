/**
 * PABWE — Praktikum 3
 * Studi kasus: "Rapi" — Expense Tracker, Bookmark Manager, Quiz App
 * dalam satu halaman, dipisah lewat tab.
 *
 * Struktur file ini (dipisah per fitur dengan komentar):
 *   1. UTILITAS UMUM
 *   2. TAB SWITCHER (state tab disimpan di query string URL, bukan localStorage)
 *   3. MODAL UMUM (buka/tutup + modal konfirmasi hapus yang dipakai bersama)
 *   4. EXPENSE TRACKER      -> localStorage key: "rapi-p3-expenses"
 *   5. BOOKMARK MANAGER     -> localStorage key: "rapi-p3-bookmarks"
 *   6. QUIZ APP             -> localStorage key: "rapi-p3-quiz-highscore"
 *   7. INISIALISASI
 */

/* ======================================================================
   1. UTILITAS UMUM
   ====================================================================== */

/** Ambil satu elemen lewat CSS selector. */
function $(selector, scope) {
  return (scope || document).querySelector(selector);
}

/** Ambil banyak elemen lewat CSS selector, dikembalikan sebagai array biasa. */
function $all(selector, scope) {
  return Array.from((scope || document).querySelectorAll(selector));
}

/** Buat id unik sederhana berbasis waktu + angka acak. */
function buatId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

/** Format angka menjadi "Rp 15.000". */
function formatRupiah(angka) {
  const n = Number(angka) || 0;
  return "Rp " + n.toLocaleString("id-ID");
}

/** Format string tanggal "2026-09-26" menjadi "26 Sep 2026". */
function formatTanggal(isoDate) {
  if (!isoDate) return "-";
  const d = new Date(isoDate + "T00:00:00");
  if (isNaN(d.getTime())) return isoDate;
  return d.toLocaleDateString("id-ID", { day: "numeric", month: "short", year: "numeric" });
}

/** Tampilkan / sembunyikan pesan error kecil di bawah sebuah field form. */
function setFieldError(fieldId, pesan) {
  const errEl = $(`[data-error-for="${fieldId}"]`);
  const inputEl = document.getElementById(fieldId);
  if (!errEl || !inputEl) return;
  if (pesan) {
    errEl.textContent = pesan;
    errEl.classList.remove("hidden");
    inputEl.classList.add("border-expense", "ring-2", "ring-expense/30");
  } else {
    errEl.classList.add("hidden");
    inputEl.classList.remove("border-expense", "ring-2", "ring-expense/30");
  }
}

/* ======================================================================
   2. TAB SWITCHER — state aktif disimpan & dipulihkan lewat query URL
      contoh: index.html?tab=bookmark
   ====================================================================== */

const DAFTAR_TAB = ["expense", "bookmark", "quiz"];
const TAB_DEFAULT = "expense";

/** Baca tab aktif dari query string URL saat ini. */
function bacaTabDariURL() {
  const params = new URLSearchParams(window.location.search);
  const tab = params.get("tab");
  return DAFTAR_TAB.includes(tab) ? tab : TAB_DEFAULT;
}

/**
 * Tampilkan panel sesuai tab yang dipilih dan perbarui query string URL.
 * @param {string} tab - salah satu dari DAFTAR_TAB
 * @param {boolean} perbaruiURL - jika false, hanya mengubah tampilan tanpa push history
 *                                 (dipakai saat load awal / navigasi back-forward)
 */
function tampilkanTab(tab, perbaruiURL = true) {
  if (!DAFTAR_TAB.includes(tab)) tab = TAB_DEFAULT;

  $all(".tab-btn").forEach((btn) => {
    const aktif = btn.dataset.tab === tab;
    btn.classList.toggle("is-active", aktif);
    btn.setAttribute("aria-selected", String(aktif));
  });

  $all(".tab-panel").forEach((panel) => {
    panel.hidden = panel.id !== `panel-${tab}`;
  });

  if (perbaruiURL) {
    const url = new URL(window.location.href);
    url.searchParams.set("tab", tab);
    window.history.pushState({ tab }, "", url);
  }
}

function initTabSwitcher() {
  $all(".tab-btn").forEach((btn) => {
    btn.addEventListener("click", () => tampilkanTab(btn.dataset.tab, true));
  });

  // Dukung tombol back/forward browser mengikuti query string tab
  window.addEventListener("popstate", () => tampilkanTab(bacaTabDariURL(), false));

  // Tampilkan tab sesuai URL saat halaman pertama kali dibuka
  tampilkanTab(bacaTabDariURL(), false);
}

/* ======================================================================
   3. MODAL UMUM
   ====================================================================== */

function bukaModal(modalEl) {
  modalEl.classList.remove("hidden");
  document.body.classList.add("overflow-hidden");
}

function tutupModal(modalEl) {
  modalEl.classList.add("hidden");
  document.body.classList.remove("overflow-hidden");
}

/** Pasang event umum: tombol close (data-modal-close) + klik backdrop + tombol Escape. */
function initModalUmum() {
  $all("[data-modal-close]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const modal = document.getElementById(btn.dataset.modalClose);
      if (modal) tutupModal(modal);
    });
  });

  $all(".modal-backdrop").forEach((modal) => {
    modal.addEventListener("click", (e) => {
      if (e.target === modal) tutupModal(modal);
    });
  });

  document.addEventListener("keydown", (e) => {
    if (e.key !== "Escape") return;
    $all(".modal-backdrop").forEach((modal) => {
      if (!modal.classList.contains("hidden")) tutupModal(modal);
    });
  });
}

// Modal konfirmasi (dipakai bersama oleh fitur Expense & Bookmark untuk aksi hapus)
const confirmModal = document.getElementById("confirm-modal");
const confirmMessageEl = document.getElementById("confirm-message");
let _confirmCallback = null;

/** Tampilkan modal konfirmasi dengan pesan kustom lalu jalankan callback jika ditekan "Hapus". */
function mintaKonfirmasi(pesan, callback) {
  confirmMessageEl.textContent = pesan;
  _confirmCallback = callback;
  bukaModal(confirmModal);
}

document.getElementById("confirm-yes").addEventListener("click", () => {
  if (typeof _confirmCallback === "function") _confirmCallback();
  _confirmCallback = null;
  tutupModal(confirmModal);
});

document.getElementById("confirm-no").addEventListener("click", () => {
  _confirmCallback = null;
  tutupModal(confirmModal);
});

/* ======================================================================
   4. EXPENSE TRACKER (Catatan Pengeluaran Harian)
   ====================================================================== */

const EXPENSE_KEY = "rapi-p3-expenses";

/** @type {{id:string, judul:string, kategori:string, jumlah:number, tipe:string, tanggal:string, dibuatPada:number}[]} */
let daftarTransaksi = muatTransaksi();

function muatTransaksi() {
  try {
    return JSON.parse(localStorage.getItem(EXPENSE_KEY)) || [];
  } catch {
    return [];
  }
}

function simpanTransaksi() {
  localStorage.setItem(EXPENSE_KEY, JSON.stringify(daftarTransaksi));
}

// Referensi elemen DOM Expense Tracker
const expenseForm = document.getElementById("expense-form");
const expenseModal = document.getElementById("expense-modal");
const expenseModalTitle = document.getElementById("expense-modal-title");
const expenseEditIdInput = document.getElementById("expense-edit-id");
const expenseListEl = document.getElementById("expense-list");
const expenseEmptyEl = document.getElementById("expense-empty");
const expenseSearchInput = document.getElementById("expense-search");
const expenseFilterTipe = document.getElementById("expense-filter-tipe");
const expenseFilterKategori = document.getElementById("expense-filter-kategori");
const expenseSortSelect = document.getElementById("expense-sort");

/** Buka modal Expense dalam mode tambah (data=null) atau ubah (data terisi). */
function bukaModalExpense(data) {
  expenseForm.reset();
  ["expense-judul", "expense-jumlah", "expense-tanggal"].forEach((id) => setFieldError(id, ""));

  if (data) {
    expenseModalTitle.textContent = "Ubah Transaksi";
    expenseEditIdInput.value = data.id;
    document.getElementById("expense-judul").value = data.judul;
    document.getElementById("expense-kategori").value = data.kategori;
    document.getElementById("expense-tipe").value = data.tipe;
    document.getElementById("expense-jumlah").value = data.jumlah;
    document.getElementById("expense-tanggal").value = data.tanggal;
  } else {
    expenseModalTitle.textContent = "Tambah Transaksi";
    expenseEditIdInput.value = "";
    document.getElementById("expense-tanggal").value = new Date().toISOString().slice(0, 10);
  }
  bukaModal(expenseModal);
}

document.getElementById("btn-add-expense").addEventListener("click", () => bukaModalExpense(null));

/** Validasi form transaksi. Mengembalikan true jika semua field valid. */
function validasiFormExpense(judul, jumlah, tanggal) {
  let valid = true;
  if (!judul.trim()) {
    setFieldError("expense-judul", "Judul wajib diisi.");
    valid = false;
  } else {
    setFieldError("expense-judul", "");
  }

  if (!Number.isFinite(jumlah) || jumlah <= 0) {
    setFieldError("expense-jumlah", "Masukkan angka lebih dari 0.");
    valid = false;
  } else {
    setFieldError("expense-jumlah", "");
  }

  if (!tanggal) {
    setFieldError("expense-tanggal", "Tanggal wajib diisi.");
    valid = false;
  } else {
    setFieldError("expense-tanggal", "");
  }

  return valid;
}

expenseForm.addEventListener("submit", (e) => {
  e.preventDefault();

  const judul = document.getElementById("expense-judul").value;
  const kategori = document.getElementById("expense-kategori").value;
  const tipe = document.getElementById("expense-tipe").value;
  const jumlah = Number(document.getElementById("expense-jumlah").value);
  const tanggal = document.getElementById("expense-tanggal").value;

  if (!validasiFormExpense(judul, jumlah, tanggal)) return;

  const editId = expenseEditIdInput.value;
  if (editId) {
    const idx = daftarTransaksi.findIndex((t) => t.id === editId);
    if (idx !== -1) {
      daftarTransaksi[idx] = { ...daftarTransaksi[idx], judul: judul.trim(), kategori, tipe, jumlah, tanggal };
    }
  } else {
    daftarTransaksi.push({
      id: buatId(),
      judul: judul.trim(),
      kategori,
      tipe,
      jumlah,
      tanggal,
      dibuatPada: Date.now()
    });
  }

  simpanTransaksi();
  perbaruiOpsiKategoriFilter();
  renderExpense();
  tutupModal(expenseModal);
});

function hapusTransaksi(id) {
  mintaKonfirmasi("Yakin ingin menghapus transaksi ini?", () => {
    daftarTransaksi = daftarTransaksi.filter((t) => t.id !== id);
    simpanTransaksi();
    renderExpense();
  });
}

/** Perbarui pilihan pada dropdown filter kategori berdasarkan kategori yang benar-benar terpakai. */
function perbaruiOpsiKategoriFilter() {
  const kategoriTerpakai = Array.from(new Set(daftarTransaksi.map((t) => t.kategori))).sort();
  const nilaiTerpilih = expenseFilterKategori.value;
  expenseFilterKategori.innerHTML = '<option value="semua">Semua Kategori</option>';
  kategoriTerpakai.forEach((kat) => {
    const opt = document.createElement("option");
    opt.value = kat;
    opt.textContent = kat;
    expenseFilterKategori.appendChild(opt);
  });
  if (kategoriTerpakai.includes(nilaiTerpilih)) expenseFilterKategori.value = nilaiTerpilih;
}

/** Terapkan pencarian, filter, dan pengurutan atas daftarTransaksi. */
function ambilTransaksiTampil() {
  const kataKunci = expenseSearchInput.value.trim().toLowerCase();
  const tipeFilter = expenseFilterTipe.value;
  const kategoriFilter = expenseFilterKategori.value;
  const urutan = expenseSortSelect.value;

  let hasil = daftarTransaksi.filter((t) => {
    const cocokKataKunci = !kataKunci || t.judul.toLowerCase().includes(kataKunci);
    const cocokTipe = tipeFilter === "semua" || t.tipe === tipeFilter;
    const cocokKategori = kategoriFilter === "semua" || t.kategori === kategoriFilter;
    return cocokKataKunci && cocokTipe && cocokKategori;
  });

  hasil = hasil.slice().sort((a, b) => {
    switch (urutan) {
      case "terlama":
        return a.tanggal.localeCompare(b.tanggal) || a.dibuatPada - b.dibuatPada;
      case "terbesar":
        return b.jumlah - a.jumlah;
      case "terkecil":
        return a.jumlah - b.jumlah;
      case "terbaru":
      default:
        return b.tanggal.localeCompare(a.tanggal) || b.dibuatPada - a.dibuatPada;
    }
  });

  return hasil;
}

/** Buat satu baris kartu transaksi lewat DOM (bukan innerHTML) sesuai data. */
function buatKartuTransaksi(t) {
  const isIncome = t.tipe === "Pemasukan";

  const kartu = document.createElement("div");
  kartu.className =
    "flex items-center justify-between gap-3 bg-surface border border-line rounded-lg pl-4 pr-3 py-3 border-l-4 " +
    (isIncome ? "border-l-income" : "border-l-expense");

  const kiri = document.createElement("div");
  kiri.className = "min-w-0";

  const judulEl = document.createElement("p");
  judulEl.className = "font-medium text-sm truncate";
  judulEl.textContent = t.judul;

  const metaEl = document.createElement("p");
  metaEl.className = "text-xs text-ink/50 mt-0.5";
  metaEl.textContent = `${t.kategori} • ${formatTanggal(t.tanggal)}`;

  kiri.append(judulEl, metaEl);

  const kanan = document.createElement("div");
  kanan.className = "flex items-center gap-3 shrink-0";

  const jumlahEl = document.createElement("p");
  jumlahEl.className = "font-display font-semibold text-sm " + (isIncome ? "text-income" : "text-expense");
  jumlahEl.textContent = (isIncome ? "+ " : "− ") + formatRupiah(t.jumlah);

  const aksiWrap = document.createElement("div");
  aksiWrap.className = "flex items-center gap-1";

  const btnEdit = document.createElement("button");
  btnEdit.type = "button";
  btnEdit.className = "p-1.5 rounded-md text-ink/50 hover:bg-paper hover:text-ink";
  btnEdit.setAttribute("aria-label", "Ubah transaksi");
  btnEdit.dataset.action = "edit";
  btnEdit.dataset.id = t.id;
  btnEdit.innerHTML =
    '<svg class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z"/></svg>';

  const btnHapus = document.createElement("button");
  btnHapus.type = "button";
  btnHapus.className = "p-1.5 rounded-md text-ink/50 hover:bg-expense/10 hover:text-expense";
  btnHapus.setAttribute("aria-label", "Hapus transaksi");
  btnHapus.dataset.action = "delete";
  btnHapus.dataset.id = t.id;
  btnHapus.innerHTML =
    '<svg class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18M8 6V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2m3 0-1 14a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1L5 6"/></svg>';

  aksiWrap.append(btnEdit, btnHapus);
  kanan.append(jumlahEl, aksiWrap);
  kartu.append(kiri, kanan);
  return kartu;
}

function renderExpense() {
  const dataTampil = ambilTransaksiTampil();

  expenseListEl.innerHTML = "";
  if (dataTampil.length === 0) {
    expenseEmptyEl.classList.remove("hidden");
  } else {
    expenseEmptyEl.classList.add("hidden");
    dataTampil.forEach((t) => expenseListEl.appendChild(buatKartuTransaksi(t)));
  }

  perbaruiRingkasanSaldo();
}

function perbaruiRingkasanSaldo() {
  const totalMasuk = daftarTransaksi.filter((t) => t.tipe === "Pemasukan").reduce((sum, t) => sum + t.jumlah, 0);
  const totalKeluar = daftarTransaksi.filter((t) => t.tipe === "Pengeluaran").reduce((sum, t) => sum + t.jumlah, 0);

  document.getElementById("summary-income").textContent = formatRupiah(totalMasuk);
  document.getElementById("summary-expense").textContent = formatRupiah(totalKeluar);
  document.getElementById("summary-balance").textContent = formatRupiah(totalMasuk - totalKeluar);
}

// Event delegation: tombol ubah/hapus pada daftar transaksi (dirender dinamis)
expenseListEl.addEventListener("click", (e) => {
  const tombol = e.target.closest("[data-action]");
  if (!tombol) return;
  const id = tombol.dataset.id;

  if (tombol.dataset.action === "edit") {
    const data = daftarTransaksi.find((t) => t.id === id);
    if (data) bukaModalExpense(data);
  } else if (tombol.dataset.action === "delete") {
    hapusTransaksi(id);
  }
});

// Pencarian, filter, dan pengurutan langsung merender ulang
[expenseSearchInput, expenseFilterTipe, expenseFilterKategori, expenseSortSelect].forEach((el) => {
  el.addEventListener("input", renderExpense);
  el.addEventListener("change", renderExpense);
});

function initExpenseTracker() {
  perbaruiOpsiKategoriFilter();
  renderExpense();
}

/* ======================================================================
   5. BOOKMARK MANAGER
   ====================================================================== */

const BOOKMARK_KEY = "rapi-p3-bookmarks";

/** @type {{id:string, nama:string, url:string, kategori:string, catatan:string, dibuatPada:number}[]} */
let daftarBookmark = muatBookmark();

function muatBookmark() {
  try {
    return JSON.parse(localStorage.getItem(BOOKMARK_KEY)) || [];
  } catch {
    return [];
  }
}

function simpanBookmark() {
  localStorage.setItem(BOOKMARK_KEY, JSON.stringify(daftarBookmark));
}

// Referensi elemen DOM Bookmark Manager
const bookmarkForm = document.getElementById("bookmark-form");
const bookmarkModal = document.getElementById("bookmark-modal");
const bookmarkModalTitle = document.getElementById("bookmark-modal-title");
const bookmarkEditIdInput = document.getElementById("bookmark-edit-id");
const bookmarkListEl = document.getElementById("bookmark-list");
const bookmarkEmptyEl = document.getElementById("bookmark-empty");
const bookmarkSearchInput = document.getElementById("bookmark-search");
const bookmarkSortSelect = document.getElementById("bookmark-sort");

function bukaModalBookmark(data) {
  bookmarkForm.reset();
  ["bookmark-nama", "bookmark-url", "bookmark-kategori"].forEach((id) => setFieldError(id, ""));

  if (data) {
    bookmarkModalTitle.textContent = "Ubah Bookmark";
    bookmarkEditIdInput.value = data.id;
    document.getElementById("bookmark-nama").value = data.nama;
    document.getElementById("bookmark-url").value = data.url;
    document.getElementById("bookmark-kategori").value = data.kategori;
    document.getElementById("bookmark-catatan").value = data.catatan || "";
  } else {
    bookmarkModalTitle.textContent = "Tambah Bookmark";
    bookmarkEditIdInput.value = "";
  }
  bukaModal(bookmarkModal);
}

document.getElementById("btn-add-bookmark").addEventListener("click", () => bukaModalBookmark(null));

/** Validasi sederhana: URL wajib diawali http:// atau https:// */
function urlValid(url) {
  return /^https?:\/\/.+/i.test(url.trim());
}

function validasiFormBookmark(nama, url, kategori) {
  let valid = true;

  if (!nama.trim()) {
    setFieldError("bookmark-nama", "Nama wajib diisi.");
    valid = false;
  } else {
    setFieldError("bookmark-nama", "");
  }

  if (!urlValid(url)) {
    setFieldError("bookmark-url", "URL harus diawali http:// atau https://");
    valid = false;
  } else {
    setFieldError("bookmark-url", "");
  }

  if (!kategori.trim()) {
    setFieldError("bookmark-kategori", "Kategori wajib diisi.");
    valid = false;
  } else {
    setFieldError("bookmark-kategori", "");
  }

  return valid;
}

bookmarkForm.addEventListener("submit", (e) => {
  e.preventDefault();

  const nama = document.getElementById("bookmark-nama").value;
  const url = document.getElementById("bookmark-url").value.trim();
  const kategori = document.getElementById("bookmark-kategori").value;
  const catatan = document.getElementById("bookmark-catatan").value;

  if (!validasiFormBookmark(nama, url, kategori)) return;

  const editId = bookmarkEditIdInput.value;
  if (editId) {
    const idx = daftarBookmark.findIndex((b) => b.id === editId);
    if (idx !== -1) {
      daftarBookmark[idx] = { ...daftarBookmark[idx], nama: nama.trim(), url, kategori: kategori.trim(), catatan: catatan.trim() };
    }
  } else {
    daftarBookmark.push({
      id: buatId(),
      nama: nama.trim(),
      url,
      kategori: kategori.trim(),
      catatan: catatan.trim(),
      dibuatPada: Date.now()
    });
  }

  simpanBookmark();
  renderBookmark();
  tutupModal(bookmarkModal);
});

function hapusBookmark(id) {
  mintaKonfirmasi("Yakin ingin menghapus bookmark ini?", () => {
    daftarBookmark = daftarBookmark.filter((b) => b.id !== id);
    simpanBookmark();
    renderBookmark();
  });
}

function ambilBookmarkTampil() {
  const kataKunci = bookmarkSearchInput.value.trim().toLowerCase();
  const urutan = bookmarkSortSelect.value;

  let hasil = daftarBookmark.filter((b) => {
    if (!kataKunci) return true;
    return (
      b.nama.toLowerCase().includes(kataKunci) ||
      b.url.toLowerCase().includes(kataKunci) ||
      b.kategori.toLowerCase().includes(kataKunci)
    );
  });

  hasil = hasil.slice().sort((a, b) => {
    switch (urutan) {
      case "az":
        return a.nama.localeCompare(b.nama);
      case "za":
        return b.nama.localeCompare(a.nama);
      case "terbaru":
      default:
        return b.dibuatPada - a.dibuatPada;
    }
  });

  return hasil;
}

function buatKartuBookmark(b) {
  const kartu = document.createElement("div");
  kartu.className = "bg-surface border border-line rounded-lg p-4 flex flex-col gap-2";

  const baris1 = document.createElement("div");
  baris1.className = "flex items-start justify-between gap-2";

  const info = document.createElement("div");
  info.className = "min-w-0";

  const link = document.createElement("a");
  link.href = b.url;
  link.target = "_blank";
  link.rel = "noopener noreferrer";
  link.className = "font-medium text-sm text-brand-dark hover:underline break-words";
  link.textContent = b.nama;

  const urlText = document.createElement("p");
  urlText.className = "text-xs text-ink/45 truncate mt-0.5";
  urlText.textContent = b.url;

  info.append(link, urlText);

  const badge = document.createElement("span");
  badge.className = "shrink-0 text-xs font-medium bg-brand-light text-brand-dark px-2 py-1 rounded-full";
  badge.textContent = b.kategori;

  baris1.append(info, badge);

  const catatanEl = document.createElement("p");
  catatanEl.className = "text-sm text-ink/60";
  catatanEl.textContent = b.catatan || "Tidak ada catatan.";

  const baris3 = document.createElement("div");
  baris3.className = "flex items-center justify-end gap-1 mt-1";

  const btnEdit = document.createElement("button");
  btnEdit.type = "button";
  btnEdit.className = "p-1.5 rounded-md text-ink/50 hover:bg-paper hover:text-ink";
  btnEdit.setAttribute("aria-label", "Ubah bookmark");
  btnEdit.dataset.action = "edit";
  btnEdit.dataset.id = b.id;
  btnEdit.innerHTML =
    '<svg class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z"/></svg>';

  const btnHapus = document.createElement("button");
  btnHapus.type = "button";
  btnHapus.className = "p-1.5 rounded-md text-ink/50 hover:bg-expense/10 hover:text-expense";
  btnHapus.setAttribute("aria-label", "Hapus bookmark");
  btnHapus.dataset.action = "delete";
  btnHapus.dataset.id = b.id;
  btnHapus.innerHTML =
    '<svg class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18M8 6V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2m3 0-1 14a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1L5 6"/></svg>';

  baris3.append(btnEdit, btnHapus);
  kartu.append(baris1, catatanEl, baris3);
  return kartu;
}

function renderBookmark() {
  const dataTampil = ambilBookmarkTampil();

  bookmarkListEl.innerHTML = "";
  if (dataTampil.length === 0) {
    bookmarkEmptyEl.classList.remove("hidden");
  } else {
    bookmarkEmptyEl.classList.add("hidden");
    dataTampil.forEach((b) => bookmarkListEl.appendChild(buatKartuBookmark(b)));
  }
}

bookmarkListEl.addEventListener("click", (e) => {
  const tombol = e.target.closest("[data-action]");
  if (!tombol) return;
  const id = tombol.dataset.id;

  if (tombol.dataset.action === "edit") {
    const data = daftarBookmark.find((b) => b.id === id);
    if (data) bukaModalBookmark(data);
  } else if (tombol.dataset.action === "delete") {
    hapusBookmark(id);
  }
});

[bookmarkSearchInput, bookmarkSortSelect].forEach((el) => {
  el.addEventListener("input", renderBookmark);
  el.addEventListener("change", renderBookmark);
});

function initBookmarkManager() {
  renderBookmark();
}

/* ======================================================================
   6. QUIZ APP (Kuis Interaktif)
   ====================================================================== */

const QUIZ_HIGHSCORE_KEY = "rapi-p3-quiz-highscore";

// Soal disimpan sebagai array of object, bukan hardcode per elemen HTML
const soalKuis = [
  {
    pertanyaan: "Tag HTML apa yang digunakan untuk membuat tautan (link)?",
    opsi: ["<link>", "<a>", "<href>", "<nav>"],
    jawabanBenar: 1
  },
  {
    pertanyaan: "Properti CSS mana yang mengatur jarak di dalam elemen (antara isi dan border)?",
    opsi: ["margin", "padding", "gap", "spacing"],
    jawabanBenar: 1
  },
  {
    pertanyaan: "Method JavaScript untuk memilih satu elemen pertama yang cocok dengan selector CSS adalah…",
    opsi: ["getElementById()", "querySelectorAll()", "querySelector()", "getElementsByTag()"],
    jawabanBenar: 2
  },
  {
    pertanyaan: "Untuk menyimpan data agar tetap ada setelah halaman di-refresh, kita bisa memakai…",
    opsi: ["sessionOnly", "localStorage", "console.log", "cache API saja"],
    jawabanBenar: 1
  },
  {
    pertanyaan: "Method array untuk membuat array baru berisi hanya elemen yang lolos suatu kondisi adalah…",
    opsi: ["map()", "forEach()", "filter()", "reduce()"],
    jawabanBenar: 2
  },
  {
    pertanyaan: "Nilai CSS `display: flex` paling sering digunakan untuk…",
    opsi: [
      "Menyembunyikan elemen dari halaman",
      "Mengatur tata letak elemen dalam satu baris/kolom secara fleksibel",
      "Mengubah warna teks",
      "Menambahkan animasi otomatis"
    ],
    jawabanBenar: 1
  }
];

// State kuis berjalan
let quizState = {
  indexSoal: 0,
  skor: 0,
  terkunci: false
};

// Referensi elemen DOM Quiz App
const quizStartScreen = document.getElementById("quiz-start-screen");
const quizQuestionScreen = document.getElementById("quiz-question-screen");
const quizResultScreen = document.getElementById("quiz-result-screen");
const quizHighscoreDisplay = document.getElementById("quiz-highscore-display");
const quizProgressText = document.getElementById("quiz-progress-text");
const quizScoreLive = document.getElementById("quiz-score-live");
const quizProgressBar = document.getElementById("quiz-progress-bar");
const quizQuestionText = document.getElementById("quiz-question-text");
const quizOptionsEl = document.getElementById("quiz-options");
const btnQuizNext = document.getElementById("btn-quiz-next");
const quizScoreText = document.getElementById("quiz-score-text");
const quizResultMessage = document.getElementById("quiz-result-message");
const quizFinalHighscore = document.getElementById("quiz-final-highscore");

function ambilHighScore() {
  return parseInt(localStorage.getItem(QUIZ_HIGHSCORE_KEY) || "0", 10);
}

/** Simpan skor baru jika lebih tinggi dari rekor sebelumnya. Mengembalikan true jika rekor baru. */
function simpanHighScoreJikaLebihBaik(skor) {
  const rekorSaatIni = ambilHighScore();
  if (skor > rekorSaatIni) {
    localStorage.setItem(QUIZ_HIGHSCORE_KEY, String(skor));
    return true;
  }
  return false;
}

function tampilkanSkorTerbaikAwal() {
  const rekor = ambilHighScore();
  quizHighscoreDisplay.textContent = `${rekor} / ${soalKuis.length}`;
}

function mulaiKuis() {
  quizState = { indexSoal: 0, skor: 0, terkunci: false };
  quizStartScreen.classList.add("hidden");
  quizResultScreen.classList.add("hidden");
  quizQuestionScreen.classList.remove("hidden");
  renderSoalKuis();
}

function renderSoalKuis() {
  const soal = soalKuis[quizState.indexSoal];
  const nomor = quizState.indexSoal + 1;
  const total = soalKuis.length;

  quizProgressText.textContent = `Soal ${nomor} dari ${total}`;
  quizScoreLive.textContent = `Skor: ${quizState.skor}`;
  quizProgressBar.style.width = `${(nomor / total) * 100}%`;
  quizQuestionText.textContent = soal.pertanyaan;

  quizOptionsEl.innerHTML = "";
  soal.opsi.forEach((teksOpsi, idx) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className =
      "quiz-option text-left px-4 py-3 rounded-lg border border-line bg-surface text-sm hover:border-quizc hover:bg-quizc/5 transition-colors";
    btn.textContent = teksOpsi;
    btn.dataset.index = String(idx);
    btn.addEventListener("click", () => pilihJawaban(idx));
    quizOptionsEl.appendChild(btn);
  });

  quizState.terkunci = false;
  btnQuizNext.classList.add("hidden");
}

function pilihJawaban(indexTerpilih) {
  if (quizState.terkunci) return;
  quizState.terkunci = true;

  const soal = soalKuis[quizState.indexSoal];
  const tombolOpsi = $all(".quiz-option", quizOptionsEl);

  tombolOpsi.forEach((btn, idx) => {
    btn.disabled = true;
    if (idx === soal.jawabanBenar) {
      btn.classList.add("border-income", "bg-income/10", "text-income");
    } else if (idx === indexTerpilih) {
      btn.classList.add("border-expense", "bg-expense/10", "text-expense");
    } else {
      btn.classList.add("opacity-50");
    }
  });

  if (indexTerpilih === soal.jawabanBenar) {
    quizState.skor += 1;
    quizScoreLive.textContent = `Skor: ${quizState.skor}`;
  }

  const soalTerakhir = quizState.indexSoal === soalKuis.length - 1;
  btnQuizNext.textContent = soalTerakhir ? "Lihat Hasil" : "Soal Berikutnya";
  btnQuizNext.classList.remove("hidden");
}

btnQuizNext.addEventListener("click", () => {
  const soalTerakhir = quizState.indexSoal === soalKuis.length - 1;
  if (soalTerakhir) {
    selesaikanKuis();
  } else {
    quizState.indexSoal += 1;
    renderSoalKuis();
  }
});

function selesaikanKuis() {
  quizQuestionScreen.classList.add("hidden");
  quizResultScreen.classList.remove("hidden");

  const total = soalKuis.length;
  const rekorBaru = simpanHighScoreJikaLebihBaik(quizState.skor);

  quizScoreText.textContent = `${quizState.skor} / ${total}`;
  quizResultMessage.textContent = rekorBaru
    ? "Rekor baru! Skor terbaikmu berhasil dipecahkan."
    : "Terus berlatih untuk memecahkan rekor terbaikmu.";
  quizFinalHighscore.textContent = `${ambilHighScore()} / ${total}`;
  tampilkanSkorTerbaikAwal();
}

document.getElementById("btn-quiz-start").addEventListener("click", mulaiKuis);
document.getElementById("btn-quiz-restart").addEventListener("click", mulaiKuis);

function initQuizApp() {
  tampilkanSkorTerbaikAwal();
}

/* ======================================================================
   7. INISIALISASI
   ====================================================================== */

document.addEventListener("DOMContentLoaded", () => {
  initModalUmum();
  initTabSwitcher();
  initExpenseTracker();
  initBookmarkManager();
  initQuizApp();
});
