// =========================================================================
// GOOGLE SHEETS HYBRID API CONFIGURATION
// Ganti teks di bawah ini dengan URL Web App dari Apps Script kamu:
// Contoh: 'https://script.google.com/macros/s/AKfycbx.../exec'
// =========================================================================
const SCRIPT_URL = 'PASTE_YOUR_GOOGLE_APPS_SCRIPT_URL_HERE';

// Data States
let myLibrary = [];
let myWishlist = [];
let myHabits = [];

// Filtering & App States
let currentFilter = 'All';
let searchQuery = '';
let currentSort = 'newest';
let currentJournalBookId = null; 

let timerInterval;
let seconds = 0;
let isTimerRunning = false;

let streak = parseInt(localStorage.getItem('readingStreak')) || 0;
let lastReadDate = localStorage.getItem('lastReadDate') || null;
let readingGoal = parseInt(localStorage.getItem('readingGoal')) || 0;
let totalTimeRead = parseInt(localStorage.getItem('totalTimeRead')) || 0;

function escapeHtml(str) {
    if (!str) return '';
    return String(str)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}

// Initialize
function init() {
    // 1. Load data cepat dari LocalStorage dulu (Local First)
    try {
        const storedLibrary = localStorage.getItem('rt_library');
        const oldLibrary = localStorage.getItem('readingTrackerBooks');

        if (storedLibrary) myLibrary = JSON.parse(storedLibrary);
        else if (oldLibrary) myLibrary = JSON.parse(oldLibrary);

        const storedWishlist = localStorage.getItem('rt_wishlist');
        if (storedWishlist) myWishlist = JSON.parse(storedWishlist);

        const storedHabits = localStorage.getItem('rt_habits');
        if (storedHabits) myHabits = JSON.parse(storedHabits);
    } catch (e) {
        console.error("Error reading localStorage:", e);
    }

    // Inisialisasi Tema (Default Light)
    const currentTheme = localStorage.getItem('theme');
    if (currentTheme === 'dark') {
        document.body.setAttribute('data-theme', 'dark');
    } else {
        document.body.removeAttribute('data-theme');
        localStorage.setItem('theme', 'light');
    }

    if (readingGoal > 0 && document.getElementById('goal-input')) {
        document.getElementById('goal-input').value = readingGoal;
    }
    if (document.getElementById('habit-date')) {
        document.getElementById('habit-date').value = new Date().toISOString().split('T')[0];
    }

    renderBooks();
    renderWishlist();
    renderHabits();

    // 2. Sinkronkan dari Cloud (Google Sheets) di latar belakang
    syncFromCloud();
}

function saveDataLocalOnly() {
    localStorage.setItem('rt_library', JSON.stringify(myLibrary));
    localStorage.setItem('rt_wishlist', JSON.stringify(myWishlist));
    localStorage.setItem('rt_habits', JSON.stringify(myHabits));
}

function saveData() {
    saveDataLocalOnly();
    syncToCloud();
}

// Background Sync Ke Google Sheets
function syncToCloud() {
    if (!SCRIPT_URL || SCRIPT_URL.trim() === '' || SCRIPT_URL.includes('PASTE_YOUR_GOOGLE')) return;

    const payload = {
        library: myLibrary.map(b => ({
            ...b,
            quotes: JSON.stringify(b.quotes || [])
        })),
        wishlist: myWishlist,
        habits: myHabits,
        meta: {
            streak: streak,
            lastReadDate: lastReadDate || "",
            readingGoal: readingGoal,
            totalTimeRead: totalTimeRead
        }
    };

    fetch(SCRIPT_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify(payload)
    })
    .then(() => console.log('Cloud sync successfully completed.'))
    .catch(err => console.warn('Cloud sync error/offline:', err));
}

// Ambil Data Terbaru dari Google Sheets saat Web Dibuka
async function syncFromCloud() {
    if (!SCRIPT_URL || SCRIPT_URL.trim() === '' || SCRIPT_URL.includes('PASTE_YOUR_GOOGLE')) return;

    try {
        const response = await fetch(SCRIPT_URL);
        if (!response.ok) return;

        const data = await response.json();
        if (!data) return;

        // JIKA GOOGLE SHEET KOSONG & LOKAL ADA DATA -> KIRIM DATA LOKAL KE SHEET AUTOMATIS (JANGAN HAPUS LOKAL)
        const isCloudEmpty = (!data.library || data.library.length === 0) &&
                             (!data.wishlist || data.wishlist.length === 0) &&
                             (!data.habits || data.habits.length === 0);

        if (isCloudEmpty) {
            if (myLibrary.length > 0 || myWishlist.length > 0 || myHabits.length > 0) {
                console.log("Cloud is empty, uploading local data to Google Sheets...");
                syncToCloud();
            }
            return; 
        }

        let updated = false;

        if (data.library && Array.isArray(data.library) && data.library.length > 0) {
            myLibrary = data.library.map(b => {
                let quotesArr = [];
                try {
                    quotesArr = typeof b.quotes === 'string' ? JSON.parse(b.quotes || '[]') : (Array.isArray(b.quotes) ? b.quotes : []);
                } catch(e) { quotesArr = []; }

                return {
                    id: String(b.id || Date.now()),
                    title: String(b.title || 'Untitled'),
                    author: String(b.author || 'Unknown'),
                    genre: String(b.genre || 'Others'),
                    pages: parseInt(b.pages) || 0,
                    pagesRead: parseInt(b.pagesRead) || 0,
                    status: String(b.status || 'Want to Read'),
                    rating: parseInt(b.rating) || 0,
                    review: String(b.review || ''),
                    startDate: b.startDate ? String(b.startDate) : null,
                    finishDate: b.finishDate ? String(b.finishDate) : null,
                    quotes: quotesArr
                };
            });
            updated = true;
        }

        if (data.wishlist && Array.isArray(data.wishlist) && data.wishlist.length > 0) {
            myWishlist = data.wishlist.map(w => ({
                id: String(w.id || Date.now()),
                title: String(w.title || 'Untitled'),
                author: String(w.author || 'Unknown'),
                genre: String(w.genre || 'Others'),
                plan: String(w.plan || 'Buy')
            }));
            updated = true;
        }

        if (data.habits && Array.isArray(data.habits) && data.habits.length > 0) {
            myHabits = data.habits.map(h => ({
                id: String(h.id || Date.now()),
                date: String(h.date || ''),
                minutes: parseInt(h.minutes) || 0,
                pages: parseInt(h.pages) || 0
            }));
            updated = true;
        }

        if (data.meta) {
            if (data.meta.streak !== undefined && data.meta.streak !== "") {
                streak = parseInt(data.meta.streak) || 0;
                localStorage.setItem('readingStreak', streak);
            }
            if (data.meta.lastReadDate) {
                lastReadDate = data.meta.lastReadDate;
                localStorage.setItem('lastReadDate', lastReadDate);
            }
            if (data.meta.readingGoal !== undefined && data.meta.readingGoal !== "") {
                readingGoal = parseInt(data.meta.readingGoal) || 0;
                localStorage.setItem('readingGoal', readingGoal);
            }
            if (data.meta.totalTimeRead !== undefined && data.meta.totalTimeRead !== "") {
                totalTimeRead = parseInt(data.meta.totalTimeRead) || 0;
                localStorage.setItem('totalTimeRead', totalTimeRead);
            }
        }

        if (updated) {
            saveDataLocalOnly();
            renderBooks();
            renderWishlist();
            renderHabits();
        }
    } catch (err) {
        console.warn('Sync from cloud failed:', err);
    }
}

// Tab Navigation Logic
document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
        document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
        document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
        
        e.target.classList.add('active');
        document.getElementById(e.target.dataset.tab).classList.add('active');
    });
});

// Gamification Logic
function trackActivity() {
    const today = new Date().toDateString();
    if (lastReadDate !== today) {
        if (lastReadDate) {
            const lastDate = new Date(lastReadDate);
            const currentDate = new Date();
            const diffDays = Math.ceil(Math.abs(currentDate - lastDate) / (1000 * 60 * 60 * 24)); 
            
            if (diffDays === 1) streak++; 
            else if (diffDays > 1) streak = 1; 
        } else streak = 1; 
        
        lastReadDate = today;
        localStorage.setItem('readingStreak', streak);
        localStorage.setItem('lastReadDate', lastReadDate);
    }
    renderStats();
}

document.getElementById('btn-set-goal').addEventListener('click', () => {
    const goal = parseInt(document.getElementById('goal-input').value);
    if (goal > 0) {
        readingGoal = goal;
        localStorage.setItem('readingGoal', readingGoal);
        renderStats();
        saveData();
    }
});

function renderStats() {
    const finishedBooks = myLibrary.filter(b => b.status === 'Finished');
    const totalPages = myLibrary.reduce((sum, book) => sum + (parseInt(book.pagesRead) || 0), 0);
    let avgRating = 0;
    const ratedBooks = finishedBooks.filter(b => b.rating > 0);
    
    if (ratedBooks.length > 0) {
        avgRating = (ratedBooks.reduce((sum, book) => sum + (parseInt(book.rating) || 0), 0) / ratedBooks.length).toFixed(1);
    }

    document.getElementById('stat-finished').innerText = finishedBooks.length;
    document.getElementById('stat-pages').innerText = totalPages;
    document.getElementById('stat-rating').innerText = `${avgRating} 🌟`;
    document.getElementById('streak-count').innerText = streak;
    document.getElementById('stat-time').innerText = formatTime(totalTimeRead);

    const goalProgressBar = document.getElementById('goal-progress-bar');
    if (readingGoal > 0) {
        const percent = Math.min(Math.round((finishedBooks.length / readingGoal) * 100), 100);
        document.getElementById('goal-text').innerText = `${finishedBooks.length} of ${readingGoal} books completed`;
        goalProgressBar.
