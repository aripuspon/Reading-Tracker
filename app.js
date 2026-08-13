// =========================================================================
// GOOGLE SHEETS HYBRID API CONFIGURATION
// Tempel URL Google Apps Script kamu di sini:
// =========================================================================
const SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbyNdzf0IHZZ2dDid2q6obDJ2G2S-DjUdscdcctYmXr2w116J2CUbP7XaUJcO66mk4gGnA/exec'; 

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

let readingGoal = parseInt(localStorage.getItem('readingGoal')) || 0;

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

    // Sinkronkan dari Cloud jika SCRIPT_URL ada
    if (SCRIPT_URL && SCRIPT_URL.trim() !== '' && !SCRIPT_URL.includes('PASTE_YOUR_GOOGLE')) {
        syncFromCloud();
    }
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
            readingGoal: readingGoal
        }
    };

    fetch(SCRIPT_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify(payload)
    })
    .catch(err => console.warn('Cloud sync offline:', err));
}

// Ambil Data Terbaru dari Google Sheets saat Web Dibuka
async function syncFromCloud() {
    if (!SCRIPT_URL || SCRIPT_URL.trim() === '' || SCRIPT_URL.includes('PASTE_YOUR_GOOGLE')) return;

    try {
        const response = await fetch(SCRIPT_URL);
        if (!response.ok) return;

        const data = await response.json();
        if (!data) return;

        const isCloudEmpty = (!data.library || data.library.length === 0) &&
                             (!data.wishlist || data.wishlist.length === 0) &&
                             (!data.habits || data.habits.length === 0);

        if (isCloudEmpty) {
            if (myLibrary.length > 0 || myWishlist.length > 0 || myHabits.length > 0) {
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
                    startDate: b.startDate ? String(b.startDate).split('T')[0] : null,
                    finishDate: b.finishDate ? String(b.finishDate).split('T')[0] : null,
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
                date: h.date ? String(h.date).split('T')[0] : '',
                minutes: parseInt(h.minutes) || 0,
                pages: parseInt(h.pages) || 0
            }));
            updated = true;
        }

        if (data.meta) {
            if (data.meta.readingGoal !== undefined && data.meta.readingGoal !== "") {
                readingGoal = parseInt(data.meta.readingGoal) || 0;
                localStorage.setItem('readingGoal', readingGoal);
            }
        }

        if (updated) {
            saveDataLocalOnly();
            renderBooks();
            renderWishlist();
            renderHabits();
        }
    } catch (err) {
        console.warn('Sync failed:', err);
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

    // Dynamic Streak Calculation based ONLY on myHabits data
    let calculatedStreak = 0;
    if (myHabits && myHabits.length > 0) {
        // Ambil list tanggal unik (bersih tanpa jam) dari yg terbaru ke terlama
        const uniqueDates = [...new Set(myHabits.map(h => String(h.date).split('T')[0]))].sort((a, b) => a < b ? 1 : (a > b ? -1 : 0));
        
        let checkDate = new Date();
        checkDate.setHours(0,0,0,0);
        
        // Fungsi pembantu untuk konversi string YYYY-MM-DD ke format jam 00:00 lokal
        const parseDateLocal = (dStr) => {
            const p = dStr.split('-');
            return new Date(p[0], p[1]-1, p[2]);
        };
        
        let firstLogDate = parseDateLocal(uniqueDates[0]);
        let diffDaysFirst = Math.floor((checkDate - firstLogDate) / (1000 * 60 * 60 * 24));
        
        // Jika ada log di hari ini (0) atau kemarin (1), hitung streak mundur.
        if (diffDaysFirst <= 1) {
            calculatedStreak = 1;
            let referenceDate = firstLogDate;
            for (let i = 1; i < uniqueDates.length; i++) {
                let prevDate = parseDateLocal(uniqueDates[i]);
                let diff = Math.round((referenceDate - prevDate) / (1000 * 60 * 60 * 24));
                
                if (diff === 1) {
                    calculatedStreak++;
                    referenceDate = prevDate;
                } else if (diff > 1) {
                    break; // Streak terputus
                }
            }
        }
    }

    document.getElementById('stat-finished').innerText = finishedBooks.length;
    document.getElementById('stat-pages').innerText = totalPages;
    document.getElementById('stat-rating').innerText = `${avgRating} 🌟`;
    document.getElementById('streak-count').innerText = calculatedStreak;

    const goalProgressBar = document.getElementById('goal-progress-bar');
    if (readingGoal > 0) {
        const percent = Math.min(Math.round((finishedBooks.length / readingGoal) * 100), 100);
        document.getElementById('goal-text').innerText = `${finishedBooks.length} of ${readingGoal} books completed`;
        goalProgressBar.style.width = `${percent}%`;
    } else {
        document.getElementById('goal-text').innerText = `Set a goal above!`;
        goalProgressBar.style.width = `0%`;
    }
}

// ---------------- TAB 1: LIBRARY ---------------- //
document.getElementById('add-book-form').addEventListener('submit', function(e) {
    if (e) e.preventDefault();
    
    const titleVal = document.getElementById('title').value;
    const authorVal = document.getElementById('author').value;
    const pagesVal = parseInt(document.getElementById('pages').value) || 0;
    const genreVal = document.getElementById('genre').value;
    const statusVal = document.getElementById('status').value;
    const todayStr = new Date().toISOString().split('T')[0];
    
    const newBook = {
        id: Date.now().toString(),
        title: titleVal,
        author: authorVal,
        genre: genreVal,
        pages: pagesVal,
        pagesRead: statusVal === 'Finished' ? pagesVal : 0,
        status: statusVal,
        rating: 0, review: '', quotes: [],
        startDate: (statusVal === 'Currently Reading' || statusVal === 'Finished') ? todayStr : null,
        finishDate: statusVal === 'Finished' ? todayStr : null
    };

    myLibrary.push(newBook);
    saveData();
    this.reset();
    renderBooks();
    return false;
});

function renderBooks() {
    const container = document.getElementById('books-container');
    if (!container) return;
    container.innerHTML = '';
    
    let filtered = currentFilter === 'All' ? [...myLibrary] : myLibrary.filter(b => b.status === currentFilter);
    if (searchQuery) {
        filtered = filtered.filter(b => 
            (b.title && b.title.toLowerCase().includes(searchQuery)) || 
            (b.author && b.author.toLowerCase().includes(searchQuery))
        );
    }

    switch (currentSort) {
        case 'title': filtered.sort((a, b) => (a.title || '').localeCompare(b.title || '')); break;
        case 'rating': filtered.sort((a, b) => (b.rating || 0) - (a.rating || 0)); break;
        case 'progress': filtered.sort((a, b) => ((b.pages>0?b.pagesRead/b.pages:0) - (a.pages>0?a.pagesRead/a.pages:0))); break;
        default: filtered.sort((a, b) => parseInt(b.id || 0) - parseInt(a.id || 0)); break;
    }

    if (filtered.length === 0) {
        container.innerHTML = `<div class="empty-message">No books found. Add a book above!</div>`;
    } else {
        filtered.forEach(book => {
            const pages = parseInt(book.pages) || 0;
            const pagesRead = parseInt(book.pagesRead) || 0;
            const percentage = pages > 0 ? Math.min(Math.round((pagesRead / pages) * 100), 100) : 0;
            const stars = (book.rating && book.rating > 0) ? `<div style="color: #f1c40f;">${'&#9733;'.repeat(book.rating)}</div>` : '';
            
            const startDisplay = book.startDate ? String(book.startDate).split('T')[0] : '-';
            const finishDisplay = book.finishDate ? String(book.finishDate).split('T')[0] : '-';

            const card = document.createElement('div');
            card.classList.add('book-card');
            card.innerHTML = `
                <div class="book-info">
                    <h3>${escapeHtml(book.title)}</h3>
                    <p><strong>Author:</strong> ${escapeHtml(book.author)}</p>
                    <span class="status-badge">${escapeHtml(book.status)}</span>
                    ${stars}
                    <div class="meta-grid">
                        <span>🏷️ ${escapeHtml(book.genre || '-')}</span>
                        <span>🚀 Start: ${escapeHtml(startDisplay)}</span>
                        <span>🏁 Fin: ${escapeHtml(finishDisplay)}</span>
                    </div>
                    <div class="progress-container"><div class="progress-bar" style="width: ${percentage}%"></div></div>
                    <span class="progress-text">${pagesRead} / ${pages} pages (${percentage}%)</span>
                </div>
                <div class="card-actions">
                    <button class="btn-action btn-update" onclick="openUpdateModal('${book.id}')">Update</button>
                    <button class="btn-action btn-journal" onclick="openJournalModal('${book.id}')">Journal</button>
                    <button class="btn-action btn-delete" onclick="deleteBook('${book.id}')">Delete</button>
                </div>
            `;
            container.appendChild(card);
        });
    }
    renderStats();
}

function deleteBook(id) {
    if (confirm('Delete this book permanently?')) {
        myLibrary = myLibrary.filter(b => b.id !== id);
        saveData();
        renderBooks();
    }
}

// ---------------- TAB 2: WISHLIST ---------------- //
document.getElementById('wishlist-form').addEventListener('submit', function(e) {
    if (e) e.preventDefault();
    const item = {
        id: Date.now().toString(),
        title: document.getElementById('wl-title').value,
        author: document.getElementById('wl-author').value,
        genre: document.getElementById('wl-genre').value,
        plan: document.getElementById('wl-plan').value
    };
    myWishlist.push(item);
    saveData();
    this.reset();
    renderWishlist();
    return false;
});

function renderWishlist() {
    const container = document.getElementById('wishlist-container');
    if (!container) return;
    container.innerHTML = '';
    if (myWishlist.length === 0) {
        container.innerHTML = `<div class="empty-message">Your wishlist is empty.</div>`;
        return;
    }
    myWishlist.forEach(book => {
        const card = document.createElement('div');
        card.classList.add('book-card');
        card.innerHTML = `
            <div class="book-info">
                <h3>${escapeHtml(book.title)}</h3>
                <p><strong>Author:</strong> ${escapeHtml(book.author)}</p>
                <div class="meta-grid" style="grid-template-columns: 1fr;">
                    <span>🏷️ Genre: ${escapeHtml(book.genre)}</span>
                    <span>🛒 Plan: ${escapeHtml(book.plan)}</span>
                </div>
            </div>
            <div class="card-actions">
                <button class="btn-action btn-update" onclick="moveToLibrary('${book.id}')">Move to Library</button>
                <button class="btn-action btn-delete" onclick="deleteWishlist('${book.id}')">Remove</button>
            </div>
        `;
        container.appendChild(card);
    });
}

function moveToLibrary(id) {
    const item = myWishlist.find(b => b.id === id);
    if(item) {
        const pages = parseInt(prompt("Enter total pages for this book:", "200")) || 200;
        myLibrary.unshift({
            id: Date.now().toString(),
            title: item.title, author: item.author, genre: item.genre,
            pages: pages, pagesRead: 0, status: 'Want to Read',
            rating: 0, review: '', quotes: [], startDate: null, finishDate: null
        });
        myWishlist = myWishlist.filter(b => b.id !== id);
        saveData();
        renderBooks();
        renderWishlist();
        alert('Book moved to Library!');
    }
}

function deleteWishlist(id) {
    if (confirm('Remove from wishlist?')) {
        myWishlist = myWishlist.filter(b => b.id !== id);
        saveData();
        renderWishlist();
    }
}

// ---------------- TAB 3: DAILY HABIT LOG ---------------- //
document.getElementById('habit-form').addEventListener('submit', function(e) {
    if (e) e.preventDefault();
    const log = {
        id: Date.now().toString(),
        date: document.getElementById('habit-date').value,
        minutes: parseInt(document.getElementById('habit-minutes').value) || 0,
        pages: parseInt(document.getElementById('habit-pages').value) || 0
    };
    myHabits.push(log);
    myHabits.sort((a, b) => new Date(b.date) - new Date(a.date)); 
    saveData();
    this.reset();
    document.getElementById('habit-date').value = new Date().toISOString().split('T')[0];
    renderHabits();
    return false;
});

function renderHabits() {
    const tbody = document.getElementById('habit-table-body');
    if (!tbody) return;
    tbody.innerHTML = '';
    if(myHabits.length === 0) {
        tbody.innerHTML = `<tr><td colspan="4" style="text-align:center; opacity:0.6;">No habits logged yet.</td></tr>`;
        
        // Memanggil renderStats() secara manual di sini untuk memastikan nilai streak 0 kalau log kosong
        renderStats();
        return;
    }
    myHabits.forEach(log => {
        const logDate = log.date ? String(log.date).split('T')[0] : '';
        tbody.innerHTML += `
            <tr>
                <td>${escapeHtml(logDate)}</td>
                <td>${log.minutes} min</td>
                <td>${log.pages} pg</td>
                <td><button class="btn-del-row" onclick="deleteHabit('${log.id}')">X</button></td>
            </tr>
        `;
    });
    
    // Refresh statistik (streak akan terhitung ulang berdasarkan habit saat ini)
    renderStats();
}

function deleteHabit(id) {
    if(confirm('Delete this record?')) {
        myHabits = myHabits.filter(h => h.id !== id);
        saveData();
        renderHabits();
    }
}

// ---------------- MODALS & UTILS ---------------- //
const progressModal = document.getElementById('progress-modal');

function openUpdateModal(id) {
    const book = myLibrary.find(b => b.id === id);
    if (!book) return;
    document.getElementById('update-book-id').value = id;
    document.getElementById('update-title').value = book.title;
    document.getElementById('update-author').value = book.author;
    document.getElementById('update-genre').value = book.genre;
    document.getElementById('update-status').value = book.status;
    
    const pagesReadInput = document.getElementById('update-pages-read');
    pagesReadInput.value = book.pagesRead;
    pagesReadInput.max = book.pages;
    
    document.getElementById('update-pages-total').value = book.pages;
    document.getElementById('update-start-date').value = book.startDate ? String(book.startDate).split('T')[0] : '';
    document.getElementById('update-finish-date').value = book.finishDate ? String(book.finishDate).split('T')[0] : '';
    
    progressModal.style.display = 'block';
}

document.getElementById('update-progress-form').addEventListener('submit', function(e) {
    if (e) e.preventDefault();
    const id = document.getElementById('update-book-id').value;
    const bookIndex = myLibrary.findIndex(b => b.id === id);
    
    if (bookIndex !== -1) {
        const book = myLibrary[bookIndex];
        const todayStr = new Date().toISOString().split('T')[0];
        
        book.title = document.getElementById('update-title').value;
        book.author = document.getElementById('update-author').value;
        book.genre = document.getElementById('update-genre').value;
        book.status = document.getElementById('update-status').value;
        
        const newTotalPages = parseInt(document.getElementById('update-pages-total').value) || 1;
        const newPagesRead = parseInt(document.getElementById('update-pages-read').value) || 0;
        
        book.pages = newTotalPages;
        book.pagesRead = newPagesRead;
        
        const startVal = document.getElementById('update-start-date').value;
        const finishVal = document.getElementById('update-finish-date').value;
        book.startDate = startVal ? startVal : null;
        book.finishDate = finishVal ? finishVal : null;

        // Auto-correction logic
        if (newPagesRead >= book.pages) {
            book.status = 'Finished';
            book.pagesRead = book.pages;
            if (!book.finishDate) book.finishDate = todayStr;
        } else if (newPagesRead > 0 && book.status === 'Want to Read') {
            book.status = 'Currently Reading';
            if (!book.startDate) book.startDate = todayStr;
        }

        saveData();
        renderBooks();
        progressModal.style.display = 'none';
    }
    return false;
});

function openJournalModal(id) {
    currentJournalBookId = id;
    const book = myLibrary.find(b => b.id === id);
    if (!book) return;
    document.getElementById('journal-book-title').innerText = `Journal: ${book.title}`;
    document.getElementById('journal-review').value = book.review || '';
    renderStars(book.rating || 0);
    renderQuotes(book);
    document.getElementById('journal-modal').style.display = 'block';
}

function renderStars(rating) {
    document.querySelectorAll('.star').forEach(star => {
        star.classList.toggle('active', parseInt(star.dataset.value) <= rating);
    });
}

document.querySelectorAll('.star').forEach(star => {
    star.addEventListener('click', (e) => {
        const rating = parseInt(e.target.dataset.value);
        const book = myLibrary.find(b => b.id === currentJournalBookId);
        if (book) { book.rating = rating; saveData(); renderStars(rating); renderBooks(); }
    });
});

document.getElementById('btn-save-review').addEventListener('click', () => {
    const book = myLibrary.find(b => b.id === currentJournalBookId);
    if (book) { book.review = document.getElementById('journal-review').value; saveData(); alert('Saved!'); }
});

document.getElementById('add-quote-form').addEventListener('submit', function(e) {
    if (e) e.preventDefault();
    const book = myLibrary.find(b => b.id === currentJournalBookId);
    if (book) {
        if (!book.quotes) book.quotes = [];
        book.quotes.push({ id: Date.now().toString(), text: document.getElementById('quote-text').value, page: document.getElementById('quote-page').value });
        saveData(); this.reset(); renderQuotes(book);
    }
    return false;
});

function renderQuotes(book) {
    const list = document.getElementById('quotes-list');
    if (!list) return;
    list.innerHTML = (book.quotes && book.quotes.length) ? book.quotes.map(q => `
        <li class="quote-item">
            <div><span class="quote-text-content">"${escapeHtml(q.text)}"</span><span class="quote-page-info">Page ${escapeHtml(q.page)}</span></div>
            <button class="btn-delete-quote" onclick="deleteQuote('${q.id}')">&times;</button>
        </li>`).join('') : '<p style="opacity: 0.6;">No quotes added.</p>';
}

window.deleteQuote = function(quoteId) {
    const book = myLibrary.find(b => b.id === currentJournalBookId);
    if (book && book.quotes) { book.quotes = book.quotes.filter(q => q.id !== quoteId); saveData(); renderQuotes(book); }
};

document.getElementById('close-progress').onclick = () => progressModal.style.display = 'none';
document.getElementById('close-journal').onclick = () => document.getElementById('journal-modal').style.display = 'none';
window.onclick = e => { if (e.target === progressModal) progressModal.style.display = 'none'; if (e.target === document.getElementById('journal-modal')) document.getElementById('journal-modal').style.display = 'none'; };

// Filter & Sort Listeners
document.querySelectorAll('.filter-btn').forEach(btn => btn.addEventListener('click', e => {
    currentFilter = e.target.dataset.status;
    document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
    e.target.classList.add('active');
    renderBooks();
}));
document.getElementById('search-bar').addEventListener('input', e => { searchQuery = e.target.value.toLowerCase(); renderBooks(); });
document.getElementById('sort-select').addEventListener('change', e => { currentSort = e.target.value; renderBooks(); });

// Timer Logic (Murni Stopwatch Visual)
function formatTime(secs) { return `${String(Math.floor(secs/3600)).padStart(2,'0')}:${String(Math.floor((secs%3600)/60)).padStart(2,'0')}:${String(secs%60).padStart(2,'0')}`; }

document.getElementById('btn-start-timer').addEventListener('click', () => {
    if (!isTimerRunning) {
        isTimerRunning = true; 
        timerInterval = setInterval(() => {
            seconds++; 
            document.getElementById('timer-display').innerText = formatTime(seconds);
        }, 1000);
    }
});

document.getElementById('btn-pause-timer').addEventListener('click', () => { 
    isTimerRunning = false; 
    clearInterval(timerInterval); 
});

document.getElementById('btn-reset-timer').addEventListener('click', () => { 
    isTimerRunning = false; 
    clearInterval(timerInterval); 
    seconds = 0; 
    document.getElementById('timer-display').innerText = formatTime(seconds); 
});

// Theme
document.getElementById('theme-toggle').addEventListener('click', () => {
    const isDark = document.body.getAttribute('data-theme') === 'dark';
    if (isDark) {
        document.body.removeAttribute('data-theme');
        localStorage.setItem('theme', 'light');
    } else {
        document.body.setAttribute('data-theme', 'dark');
        localStorage.setItem('theme', 'dark');
    }
});

// Export / Import
document.getElementById('btn-export').addEventListener('click', ()
