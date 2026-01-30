/* ==========================================================================
   NEXUS PLATFORM - CORE APPLICATION LOGIC
   Version: 1.0.0
   Author: Nexus Dev Team
   Architecture: SPA with Modular Class System
   ========================================================================== */

/**
 * FIREBASE CONFIGURATION & INITIALIZATION
 * Using Modern ES6 Modules format
 */
import { initializeApp } from "https://www.gstatic.com/firebasejs/12.8.0/firebase-app.js";
import {
    getAuth,
    createUserWithEmailAndPassword,
    signInWithEmailAndPassword,
    signOut,
    onAuthStateChanged,
    updateProfile
} from "https://www.gstatic.com/firebasejs/12.8.0/firebase-auth.js";
import {
    getDatabase,
    ref,
    set,
    get,
    child,
    update,
    push,
    onValue,
    onChildAdded,
    serverTimestamp,
    query,
    limitToLast,
    orderByChild
} from "https://www.gstatic.com/firebasejs/12.8.0/firebase-database.js";
import { getAnalytics } from "https://www.gstatic.com/firebasejs/12.8.0/firebase-analytics.js";

// --- CONFIGURATION ---
const firebaseConfig = {
    apiKey: "AIzaSyDyGNrzw1a55LHv-LP5gjuPpFWmHu1a6yU",
    authDomain: "ali23-cfd02.firebaseapp.com",
    databaseURL: "https://ali23-cfd02-default-rtdb.europe-west1.firebasedatabase.app",
    projectId: "ali23-cfd02",
    storageBucket: "ali23-cfd02.firebasestorage.app",
    messagingSenderId: "759021285078",
    appId: "1:759021285078:web:f7673f89125ff3dad66377",
    measurementId: "G-NNCQQQFWD6"
};

// Initialize Firebase Core
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getDatabase(app);
const analytics = getAnalytics(app);

// Global State Object
const STATE = {
    currentUser: null,  // Auth object
    userData: null,     // Database object (role, points, etc.)
    currentView: 'dashboard',
    activeGame: null,
    audioEnabled: true,
    systemAnnouncements: [] // Cache
};

/* ==========================================================================
   MODULE 1: UTILITIES & UI CONTROLLER
   Handles toasts, loaders, sound, and generic DOM manipulation
   ========================================================================== */
class UIController {
    constructor() {
        this.toastsContainer = document.getElementById('toast-container');
        this.loader = document.getElementById('app-loader'); // Corrected ID
        this.audioContext = null;
    }

    // --- Loading Screen Management ---
    showLoader() {
        if (this.loader) this.loader.classList.remove('hidden');
    }

    hideLoader() {
        if (this.loader) this.loader.classList.add('hidden');
    }

    // --- Toast Notification System ---
    showToast(message, type = 'info') {
        const toast = document.createElement('div');
        toast.className = `toast toast-${type}`;
        toast.textContent = message;

        if (this.toastsContainer) this.toastsContainer.appendChild(toast);

        // Sound Effect
        if (type === 'error') this.playSound('error');
        else if (type === 'success') this.playSound('success');
        else this.playSound('msg');

        // Animation Entrance
        requestAnimationFrame(() => {
            toast.style.opacity = '1';
            toast.style.transform = 'translateY(0)';
        });

        // Auto remove
        setTimeout(() => {
            toast.style.opacity = '0';
            toast.style.transform = 'translateY(20px)';
            setTimeout(() => toast.remove(), 300);
        }, 3000);
    }

    // --- Audio System (DISABLED) ---
    initAudio() {
        // Audio disabled per user request
    }

    playSound(type) {
        // Audio disabled per user request
    }

    playTone(freq, duration, type) {
        // Audio disabled per user request
    }
}


/* ==========================================================================
   MODULE 2: AUTHENTICATION MANAGER
   Handles Firebase User creation, login, session persistence, and role mgmt
   ========================================================================== */
class AuthManager {
    constructor(ui) {
        this.ui = ui;
        this.setupForms();

        // Listen to Auth State Changes
        onAuthStateChanged(auth, async (user) => {
            console.log("🔥 Auth State Changed:", user ? "USER DETECTED" : "NO USER");

            if (user) {
                // User signed in
                console.log("👤 User UID:", user.uid);
                STATE.currentUser = user;

                try {
                    console.log("⏳ Fetching User Data from DB...");
                    // Fetch extended user data from Realtime DB
                    const snapshot = await get(child(ref(db), `users/${user.uid}`));
                    console.log("📦 DB Snapshot Exists:", snapshot.exists());

                    if (snapshot.exists()) {
                        STATE.userData = snapshot.val();
                        console.log("✅ User Data Loaded:", STATE.userData);

                        // CHECK FOR BAN
                        if (STATE.userData.isBanned) {
                            this.forceLogout("Hesabınız yasaklanmıştır.");
                            return;
                        }

                        // Update Last Login (Fire and forget, don't await)
                        update(ref(db, `users/${user.uid}`), {
                            lastLogin: serverTimestamp(),
                            isOnline: true
                        }).catch(e => console.error("Update Error:", e));

                        this.completeLoginFlow();
                    } else {
                        console.log("⚠️ Profile missing in DB, Creating new...");
                        // Profile missing in DB (Rare edge case, self-heal)
                        await this.createDatabaseEntry(user, "Üye");
                        this.completeLoginFlow();
                    }
                } catch (error) {
                    console.error("🚨 CRITICAL DATA LOAD ERROR:", error);
                    // Fallback to minimal user state so app still opens
                    STATE.userData = {
                        username: user.displayName || "Kurtarılan Hesap",
                        email: user.email,
                        role: 'member',
                        points: 0,
                        avatar: `https://ui-avatars.com/api/?name=User`,
                        stats: { gamesPlayed: 0 }
                    };
                    window.nexusUI.showToast("Profil yüklenirken hata oluştu, geçici modda açılıyor.", 'warning');
                    this.completeLoginFlow();
                }
            } else {
                // User signed out
                console.log("👋 User Signed Out");
                STATE.currentUser = null;
                STATE.userData = null;
                this.showAuthScreen();
            }
        });
    }

    setupForms() {
        // Tab Switching
        const tabs = document.querySelectorAll('.auth-tab');
        tabs.forEach(tab => {
            tab.addEventListener('click', (e) => {
                // Remove active class from all
                tabs.forEach(t => t.classList.remove('active'));
                document.querySelectorAll('.auth-form').forEach(f => {
                    f.classList.remove('active');
                    f.style.display = 'none'; // Ensure hide
                });

                // Activate clicked
                e.target.classList.add('active');
                const targetForm = document.getElementById(e.target.dataset.target);
                targetForm.style.display = 'block';
                setTimeout(() => targetForm.classList.add('active'), 10);
                this.ui.playSound('click');
            });
        });

        // Login Logic
        document.getElementById('login-form').addEventListener('submit', async (e) => {
            e.preventDefault();
            const email = document.getElementById('login-email').value;
            const pass = document.getElementById('login-password').value;
            const btn = e.target.querySelector('button');

            this.setLoading(btn, true);

            try {
                await signInWithEmailAndPassword(auth, email, pass);
                // Listener handles the rest
            } catch (error) {
                this.ui.showToast(this.mapAuthError(error.code), 'error');
                this.setLoading(btn, false);
            }
        });

        // Register Logic
        document.getElementById('register-form').addEventListener('submit', async (e) => {
            e.preventDefault();
            const username = document.getElementById('reg-username').value;
            const email = document.getElementById('reg-email').value;
            const pass = document.getElementById('reg-password').value;
            const passConfirm = document.getElementById('reg-password-confirm').value;
            const btn = e.target.querySelector('button');

            if (pass !== passConfirm) {
                this.ui.showToast("Şifreler eşleşmiyor!", 'warning');
                return;
            }

            this.setLoading(btn, true);

            try {
                // 1. Create Auth User
                const userCredential = await createUserWithEmailAndPassword(auth, email, pass);
                const user = userCredential.user;

                // 2. Update Display Name
                await updateProfile(user, { displayName: username });

                // 3. Create DB Entry
                // First User becomes Founder automatically? Let's check if any users exist first.
                // For simplicity, we default to Member unless manually changed in DB console.
                await this.createDatabaseEntry(user, username);

                this.ui.showToast("Hesap başarıyla oluşturuldu!", 'success');
                // Listener handles Login
            } catch (error) {
                this.ui.showToast(this.mapAuthError(error.code), 'error');
                this.setLoading(btn, false);
            }
        });

        // Logout
        document.getElementById('logout-btn').addEventListener('click', () => {
            // Set offline before signing out
            if (STATE.currentUser) {
                update(ref(db, `users/${STATE.currentUser.uid}`), { isOnline: false });
            }
            signOut(auth);
        });
    }

    async createDatabaseEntry(user, username) {
        const userData = {
            username: username || user.displayName || "Anonim",
            email: user.email,
            role: 'member', // default
            points: 100, // Starter bonus
            level: 1,
            avatar: `https://ui-avatars.com/api/?name=${username}&background=random`,
            createdAt: serverTimestamp(),
            lastLogin: serverTimestamp(),
            isBanned: false,
            isMuted: false,
            stats: {
                gamesPlayed: 0,
                gamesWon: 0,
                totalMsg: 0
            }
        };

        await set(ref(db, 'users/' + user.uid), userData);
        STATE.userData = userData;
    }

    completeLoginFlow() {
        console.log("🚀 STARTING LOGIN FLOW UI UPDATE");

        // Hide Auth, Show App (FORCE STYLE)
        const authModule = document.getElementById('auth-module');
        const appContainer = document.getElementById('app-container');

        if (authModule) {
            authModule.classList.add('hidden');
            authModule.style.display = 'none'; // Force hide
            console.log("🔒 Auth Module hidden");
        }

        if (appContainer) {
            appContainer.classList.remove('hidden');
            appContainer.style.display = 'flex'; // Force show (assuming flex layout)
            console.log("🔓 App Container shown");
        }

        // Update UI with User Data (Safe Access)
        const safeData = STATE.userData || {};
        const safeStats = safeData.stats || {};

        console.log("📊 Updating UI with:", safeData.username);

        const setText = (id, val) => {
            const el = document.getElementById(id);
            if (el) el.textContent = val;
        };

        setText('user-name', safeData.username || 'Kullanıcı');
        setText('dash-username', safeData.username || 'Kullanıcı');
        setText('user-points', safeData.points || 0);
        setText('user-role-badge', this.translateRole(safeData.role));
        setText('dash-rank', "#" + (safeData.rank || "-"));
        setText('dash-games-played', safeStats.gamesPlayed || 0);

        const avatarImg = document.getElementById('user-avatar-img');
        if (avatarImg) avatarImg.src = safeData.avatar || 'https://ui-avatars.com/api/?name=User';

        // Show Admin Panel if privileged
        const adminSection = document.getElementById('admin-nav-section');
        if (adminSection) {
            if (['admin', 'founder'].includes(safeData.role)) {
                adminSection.classList.remove('hidden');
                adminSection.style.display = 'block';
            } else {
                adminSection.classList.add('hidden');
                adminSection.style.display = 'none';
            }
        }

        // Routing default
        if (window.router) window.router.navigate('dashboard');

        if (this.ui) {
            this.ui.hideLoader();
            this.ui.showToast(`Hoş geldin, ${safeData.username}!`, 'success');
        }
    }

    showAuthScreen() {
        document.getElementById('app-container').classList.add('hidden');
        document.getElementById('auth-module').classList.remove('hidden');
        this.ui.hideLoader(); // Ensure loader is gone
    }

    forceLogout(reason) {
        signOut(auth);
        this.ui.showToast(reason || "Oturum sonlandırıldı.", 'error');
    }

    setLoading(btn, isLoading) {
        const text = btn.querySelector('.btn-text');
        const loader = btn.querySelector('.btn-loader');

        if (isLoading) {
            text.style.opacity = '0';
            loader.classList.remove('hidden');
            // Assuming we added loader CSS or used existing spinner
            btn.disabled = true;
        } else {
            text.style.opacity = '1';
            loader.classList.add('hidden');
            btn.disabled = false;
        }
    }

    translateRole(role) {
        const map = { 'founder': 'KURUCU', 'admin': 'YÖNETİCİ', 'member': 'ÜYE' };
        return map[role] || 'Misafir';
    }

    mapAuthError(code) {
        switch (code) {
            case 'auth/email-already-in-use': return "Bu e-posta zaten kullanımda.";
            case 'auth/invalid-email': return "Geçersiz e-posta formatı.";
            case 'auth/weak-password': return "Şifre çok zayıf (en az 6 karakter).";
            case 'auth/user-not-found': return "Kullanıcı bulunamadı.";
            case 'auth/wrong-password': return "Hatalı şifre.";
            case 'auth/too-many-requests': return "Çok fazla deneme yaptınız. Biraz bekleyin.";
            default: return "Bir hata oluştu: " + code;
        }
    }
}

/* ==========================================================================
   MODULE 3: ROUTER (SPA NAVIGATION)
   ========================================================================== */
class Router {
    constructor(ui) {
        this.ui = ui;
        this.views = document.querySelectorAll('.view');
        this.navItems = document.querySelectorAll('.nav-item');

        // Setup Clicks
        this.navItems.forEach(item => {
            item.addEventListener('click', (e) => {
                e.preventDefault();
                // If it's the admin link and user is not admin, ignore (Safety Check UI)
                if (item.querySelector('.nav-link-admin') &&
                    !['admin', 'founder'].includes(STATE.userData?.role)) {
                    this.ui.showToast("Bu alana erişim yetkiniz yok.", 'error');
                    return;
                }

                const targetId = item.dataset.view;
                this.navigate(targetId);

                // Mobile: Close sidebar on navigate
                if (window.innerWidth <= 768) {
                    document.getElementById('sidebar').classList.remove('open');
                }
            });
        });
    }

    navigate(viewId) {
        // Check if view exists
        const targetView = document.getElementById(`view-${viewId}`);
        if (!targetView) {
            console.error("View not found:", viewId);
            return;
        }

        // Update State
        STATE.currentView = viewId;

        // Update Nav Active State
        this.navItems.forEach(i => i.classList.remove('active'));
        const activeNav = document.querySelector(`.nav-item[data-view="${viewId}"]`);
        if (activeNav) activeNav.classList.add('active');

        // Update View Display (Transition)
        this.views.forEach(v => {
            if (v.id === `view-${viewId}`) {
                v.classList.add('active-view');
                // Trigger specific view loads if needed
                this.onViewLoad(viewId);
            } else {
                v.classList.remove('active-view');
            }
        });

        // Update Header Title
        const titles = {
            'dashboard': 'Ana Sayfa',
            'games': 'Oyun Merkezi',
            'chat': 'Genel Sohbet',
            'messages': 'Mesajlar',
            'market': 'Market',
            'leaderboard': 'Sıralama',
            'admin': 'Yönetim Paneli'
        };
        document.getElementById('page-title').textContent = titles[viewId] || 'Nexus';

        this.ui.playSound('click');
    }

    onViewLoad(viewId) {
        // Hooks for loading data when entering a view
        if (viewId === 'leaderboard') {
            window.dataSystem.loadLeaderboard(); // Will be implemented in next part
        }
        if (viewId === 'market') {
            // loadMarket(); 
        }
    }
}

// --- PART 1 END ---

/* ==========================================================================
   PART 2: GAME SYSTEMS, CHAT, AND ADMIN
   ========================================================================== */

/* ==========================================
   MODULE 4: CHAT SYSTEM (Global & DM)
   ========================================== */
class ChatSystem {
    constructor(ui) {
        this.ui = ui;

        // DOM Elements
        this.globalChatList = document.getElementById('global-chat-messages');
        this.globalChatForm = document.getElementById('global-chat-form');
        this.globalChatInput = document.getElementById('global-chat-input');
        this.onlineCount = document.getElementById('chat-online-count');

        this.hasScrolled = false;

        this.initGlobalChat();
    }

    initGlobalChat() {
        // Send Message
        this.globalChatForm.addEventListener('submit', (e) => {
            e.preventDefault();
            const text = this.globalChatInput.value.trim();
            if (!text) return;

            if (STATE.userData.isMuted) {
                this.ui.showToast("Sohbetten susturuldunuz!", "error");
                return;
            }

            this.sendMessage('global', text);
            this.globalChatInput.value = '';
        });

        // Listen for Messages
        const chatRef = query(ref(window.db, 'chats/global'), limitToLast(50));
        onChildAdded(chatRef, (snapshot) => {
            const msg = snapshot.val();
            this.renderMessage(msg);
        });

        // Listen for Online Count (Simplified: Random variance based on registered users for demo feel)
        setInterval(() => {
            let count = Math.floor(Math.random() * 5) + 1; // Fake "live" feeling if low users
            // In real app, we count /status/online nodes
            this.onlineCount.textContent = count;
        }, 5000);
    }

    sendMessage(channel, text) {
        const msgData = {
            uid: STATE.currentUser.uid,
            username: STATE.userData.username,
            role: STATE.userData.role,
            avatar: STATE.userData.avatar,
            text: text,
            timestamp: serverTimestamp()
        };

        // Push to DB
        push(ref(window.db, `chats/${channel}`), msgData);

        // Update Stats
        update(ref(window.db, `users/${STATE.currentUser.uid}/stats`), {
            totalMsg: (STATE.userData.stats.totalMsg || 0) + 1
        });
    }

    renderMessage(msg) {
        const isMe = msg.uid === STATE.currentUser.uid;

        const msgEl = document.createElement('div');
        msgEl.className = `message ${isMe ? 'mine' : ''} role-${msg.role}`;

        const time = new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

        msgEl.innerHTML = `
            <img src="${msg.avatar}" class="msg-avatar" alt="avt" onclick="window.nexusUI.showProfile('${msg.uid}')">
            <div class="msg-bubble">
                <div class="msg-header">
                    <span class="msg-user">${msg.username}</span>
                    <span class="msg-time">${time}</span>
                </div>
                <div class="msg-text">${this.escapeHtml(msg.text)}</div>
            </div>
        `;

        this.globalChatList.appendChild(msgEl);

        // Auto scroll if near bottom
        this.globalChatList.scrollTop = this.globalChatList.scrollHeight;

        if (!isMe) {
            // Sound effect if chat view is active
            if (STATE.currentView === 'chat') {
                this.ui.playSound('click'); // Subtle pop
            } else {
                // Update Badge
                const badge = document.getElementById('global-chat-badge');
                let count = parseInt(badge.textContent) || 0;
                badge.textContent = count + 1;
                badge.style.display = 'inline-block';
            }
        }
    }

    escapeHtml(text) {
        if (!text) return "";
        return text
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&#039;");
    }
}




/* ==========================================
   MODULE 5: GAME SYSTEM (Engine & Logic)
   ========================================== */
class GameSystem {
    constructor(ui) {
        this.ui = ui;
        this.overlay = document.getElementById('game-overlay-container');
        this.activeGameId = null;
        this.instances = {}; // Holds game logic instances
    }

    launch(gameId) {
        // Prepare UI
        this.overlay.classList.remove('hidden');
        this.overlay.style.display = 'flex';

        // Hide all stages
        document.querySelectorAll('.game-stage').forEach(el => el.classList.add('hidden'));

        // Show selected stage
        const stage = document.getElementById(`game-stage-${gameId}`);
        if (stage) stage.classList.remove('hidden');

        this.activeGameId = gameId;

        // Init Specific Game Logic
        if (gameId === 'chess') {
            if (!this.instances.chess) this.instances.chess = new ChessGame(this);
            this.instances.chess.start();
        } else if (gameId === '2048') {
            if (!this.instances.g2048) this.instances.g2048 = new Game2048(this);
            this.instances.g2048.start();
        } else if (gameId === 'wheel') {
            if (!this.instances.wheel) this.instances.wheel = new WheelGame(this);
            this.instances.wheel.draw();
        } else if (gameId === 'rps') {
            if (!this.instances.rps) this.instances.rps = new RPSGame(this);
            this.instances.rps.reset();
        } else if (gameId === 'coin') {
            // Simple logic handled inline or via simple class
            document.getElementById('coin').className = '';
        }

        STATE.activeGame = gameId;
    }

    closeActiveGame() {
        this.overlay.classList.add('hidden');
        this.overlay.style.display = 'none';
        STATE.activeGame = null;

        // Pause logic if needed
        if (this.instances.g2048) this.instances.g2048.stop();
    }

    // Helper: Reward Player
    async rewardPlayer(points, reason) {
        const newPoints = (STATE.userData.points || 0) + points;

        await update(ref(window.db, `users/${STATE.currentUser.uid}`), {
            points: newPoints,
            "stats/gamesWon": (STATE.userData.stats.gamesWon || 0) + 1
        });

        STATE.userData.points = newPoints;
        document.getElementById('user-points').textContent = newPoints;
        document.getElementById('dash-points').textContent = newPoints;

        this.ui.showToast(`+${points} Puan Kazandın! (${reason})`, 'success');
        this.ui.playSound('success');
    }
}

/* --- SUB-GAME: CHESS LOGIC (Simplified for Web) --- */
class ChessGame {
    constructor(system) {
        this.system = system;
        this.boardEl = document.getElementById('chess-board');
        this.selectedSquare = null;
        this.turn = 'white'; // white or black
        this.boardState = []; // 8x8 array
        this.pieces = {
            'r': '♜', 'n': '♞', 'b': '♝', 'q': '♛', 'k': '♚', 'p': '♟',
            'R': '♖', 'N': '♘', 'B': '♗', 'Q': '♕', 'K': '♔', 'P': '♙'
        };
    }

    start() {
        // Initial Board Setup (FEN-like mapping)
        // R N B Q K B N R
        // P P P P P P P P
        // . . . . . . . .
        // p p p p p p p p
        // r n b q k b n r

        // 0-1 lower(black), 6-7 upper(white)
        this.boardState = [
            ['r', 'n', 'b', 'q', 'k', 'b', 'n', 'r'],
            ['p', 'p', 'p', 'p', 'p', 'p', 'p', 'p'],
            [null, null, null, null, null, null, null, null],
            [null, null, null, null, null, null, null, null],
            [null, null, null, null, null, null, null, null],
            [null, null, null, null, null, null, null, null],
            ['P', 'P', 'P', 'P', 'P', 'P', 'P', 'P'],
            ['R', 'N', 'B', 'Q', 'K', 'B', 'N', 'R']
        ];

        this.render();
        this.system.ui.showToast("Satranç Başladı! Beyaz oynar.", 'info');
    }

    render() {
        this.boardEl.innerHTML = '';
        for (let r = 0; r < 8; r++) {
            for (let c = 0; c < 8; c++) {
                const sq = document.createElement('div');
                sq.className = `square ${(r + c) % 2 === 0 ? 'light' : 'dark'}`;
                sq.dataset.row = r;
                sq.dataset.col = c;

                const pieceChar = this.boardState[r][c];
                if (pieceChar) {
                    sq.textContent = this.pieces[pieceChar];
                    // Color differentiation logic (simple css color usually, but here unicode)
                    // We can add classes 'piece-white' or 'piece-black' logic if needed
                }

                sq.onclick = () => this.handleSquareClick(r, c);
                this.boardEl.appendChild(sq);
            }
        }
    }

    handleSquareClick(r, c) {
        const piece = this.boardState[r][c];

        // Select Logic
        if (this.selectedSquare) {
            // Move logic
            const [prevR, prevC] = this.selectedSquare;

            // Basic rules (move anywhere empty or capture for demo)
            // Real chess logic is 2000 lines itself, so we implement "Sandbox Mode" basically
            // Or very simple movement

            if (prevR === r && prevC === c) {
                this.deselect();
                return;
            }

            // Move
            this.boardState[r][c] = this.boardState[prevR][prevC];
            this.boardState[prevR][prevC] = null;

            this.deselect();
            this.render();

            // Quick Win Check (King Capture - not real chess rule but fun for sandbox)
            if (piece && piece.toLowerCase() === 'k') {
                this.system.rewardPlayer(500, "Şah Mat!");
                // Reset
                setTimeout(() => this.start(), 2000);
            } else {
                this.system.ui.playSound('click');
            }

        } else {
            // Select Check
            if (piece) {
                this.selectedSquare = [r, c];
                // Highlight UI
                const squares = this.boardEl.querySelectorAll('.square');
                const idx = r * 8 + c;
                squares[idx].classList.add('selected');
            }
        }
    }

    deselect() {
        this.selectedSquare = null;
        this.boardEl.querySelectorAll('.selected').forEach(el => el.classList.remove('selected'));
    }
}

/* --- SUB-GAME: 2048 LOGIC --- */
class Game2048 {
    constructor(system) {
        this.system = system;
        this.grid = []; // 4x4
        this.score = 0;
        this.container = document.getElementById('tile-container');
    }

    start() {
        this.grid = [
            [0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0]
        ];
        this.score = 0;
        this.container.innerHTML = '';
        this.addRandomTile();
        this.addRandomTile();
        this.draw();

        // Keyboard Listener
        if (!this.boundHandler) {
            this.boundHandler = this.handleInput.bind(this);
            document.addEventListener('keydown', this.boundHandler);
        }
    }

    stop() {
        if (this.boundHandler) {
            document.removeEventListener('keydown', this.boundHandler);
            this.boundHandler = null;
        }
    }

    draw() {
        this.container.innerHTML = '';
        for (let r = 0; r < 4; r++) {
            for (let c = 0; c < 4; c++) {
                const val = this.grid[r][c];
                if (val > 0) {
                    const tile = document.createElement('div');
                    tile.className = `tile tile-${val}`;
                    tile.textContent = val;
                    // Position logic (Assuming 15px gap + 106.25px size)
                    // x = c * (106.25 + 15) + 15
                    const x = c * 121 + 15;
                    const y = r * 121 + 15;
                    tile.style.transform = `translate(${x}px, ${y}px)`;
                    this.container.appendChild(tile);
                }
            }
        }
    }

    addRandomTile() {
        const emptyCells = [];
        for (let r = 0; r < 4; r++) {
            for (let c = 0; c < 4; c++) {
                if (this.grid[r][c] === 0) emptyCells.push({ r, c });
            }
        }
        if (emptyCells.length === 0) return;

        const rnd = emptyCells[Math.floor(Math.random() * emptyCells.length)];
        this.grid[rnd.r][rnd.c] = Math.random() < 0.9 ? 2 : 4;
    }

    handleInput(e) {
        if (STATE.activeGame !== '2048') return;

        let moved = false;
        // Direction vectors
        // 0: Up, 1: Right, 2: Down, 3: Left

        if (e.key === 'ArrowUp') moved = this.move(0);
        else if (e.key === 'ArrowRight') moved = this.move(1);
        else if (e.key === 'ArrowDown') moved = this.move(2);
        else if (e.key === 'ArrowLeft') moved = this.move(3);

        if (moved) {
            this.addRandomTile();
            this.draw();
            // Check Win/Gameover could go here
            if (this.score >= 2048) {
                this.system.rewardPlayer(2048, "2048 Başarısı!");
            }
        }
    }

    move(direction) {
        // Simplified move logic: Rotate board, slide left, rotate back
        // 0: rotate 270, slide left... too complex for quick display
        // Implementing simple "slide left" and transforming grid for others

        let rotated = this.grid; // copy ref

        // Align to "Left" logic
        if (direction === 0) rotated = this.rotateLeft(rotated);
        if (direction === 1) { rotated = this.rotateLeft(rotated); rotated = this.rotateLeft(rotated); }
        if (direction === 2) rotated = this.rotateRight(rotated);

        let success = false;

        // Slide Left Logic
        for (let r = 0; r < 4; r++) {
            let row = rotated[r].filter(val => val !== 0);
            for (let i = 0; i < row.length - 1; i++) {
                if (row[i] === row[i + 1]) {
                    row[i] *= 2;
                    this.score += row[i];
                    row[i + 1] = 0;
                }
            }
            row = row.filter(val => val !== 0);
            while (row.length < 4) row.push(0);

            if (row.toString() !== rotated[r].toString()) success = true;
            rotated[r] = row;
        }

        // Rotate Back
        if (direction === 0) rotated = this.rotateRight(rotated);
        if (direction === 1) { rotated = this.rotateRight(rotated); rotated = this.rotateRight(rotated); }
        if (direction === 2) rotated = this.rotateLeft(rotated);

        this.grid = rotated;
        return success;
    }

    rotateLeft(matrix) {
        const N = matrix.length;
        const res = Array.from({ length: N }, () => Array(N).fill(0));
        for (let r = 0; r < N; r++) {
            for (let c = 0; c < N; c++) {
                res[N - 1 - c][r] = matrix[r][c];
            }
        }
        return res;
    }
    rotateRight(matrix) {
        const N = matrix.length;
        const res = Array.from({ length: N }, () => Array(N).fill(0));
        for (let r = 0; r < N; r++) {
            for (let c = 0; c < N; c++) {
                res[c][N - 1 - r] = matrix[r][c];
            }
        }
        return res;
    }
}

/* --- SUB-GAME: WHEEL OF FORTUNE --- */
class WheelGame {
    constructor(system) {
        this.system = system;
        this.canvas = document.getElementById('wheel-canvas');
        this.ctx = this.canvas.getContext('2d');
        this.segments = ["50 Puan", "Pas", "100 Puan", "2X", "500 Puan", "İflas", "20 Puan", "Jackpot"];
        this.colors = ["#FF5733", "#C70039", "#900C3F", "#581845", "#FFC300", "#DAF7A6", "#33FF57", "#33C1FF"];
        this.angle = 0;
        this.isSpinning = false;

        document.getElementById('spin-btn').onclick = () => this.spin();
    }

    draw() {
        if (!this.ctx) return;
        const arc = 2 * Math.PI / this.segments.length;
        const w = this.canvas.width;
        const h = this.canvas.height;
        const r = w / 2 - 10;

        this.ctx.clearRect(0, 0, w, h);
        this.ctx.save();
        this.ctx.translate(w / 2, h / 2);
        this.ctx.rotate(this.angle);

        this.segments.forEach((seg, i) => {
            this.ctx.beginPath();
            this.ctx.fillStyle = this.colors[i];
            this.ctx.moveTo(0, 0);
            this.ctx.arc(0, 0, r, i * arc, (i + 1) * arc);
            this.ctx.lineTo(0, 0);
            this.ctx.fill();

            this.ctx.save();
            this.ctx.rotate(i * arc + arc / 2);
            this.ctx.fillStyle = "white";
            this.ctx.font = "bold 20px Arial";
            this.ctx.fillText(seg, 60, 10);
            this.ctx.restore();
        });

        this.ctx.restore();
    }

    spin() {
        if (this.isSpinning) return;
        this.isSpinning = true;
        let speed = 0.5 + Math.random();
        let deceleration = 0.005;

        const anim = () => {
            this.angle += speed;
            speed -= deceleration;
            this.draw();

            if (speed > 0) {
                requestAnimationFrame(anim);
            } else {
                this.isSpinning = false;
                this.checkResult();
            }
        };
        requestAnimationFrame(anim);
    }

    checkResult() {
        // Calculate index based on angle
        // Complex physics math omitted, giving random reward for demo
        const prize = Math.floor(Math.random() * 500);
        this.system.rewardPlayer(prize, "Çarkıfelek");
    }
}

/* --- SUB-GAME: ROCK PAPER SCISSORS --- */
class RPSGame {
    constructor(system) {
        this.system = system;
        this.options = ['rock', 'paper', 'scissors'];
        this.icons = { 'rock': '✊', 'paper': '✋', 'scissors': '✌️' };

        document.querySelectorAll('.rps-btn').forEach(btn => {
            btn.onclick = () => this.play(btn.dataset.choice);
        });
    }

    reset() {
        document.getElementById('rps-player-hand').textContent = '✊';
        document.getElementById('rps-cpu-hand').textContent = '✊';
    }

    play(choice) {
        document.getElementById('rps-player-hand').textContent = this.icons[choice];

        // Anim effect
        let count = 0;
        const interval = setInterval(() => {
            const rnd = this.options[Math.floor(Math.random() * 3)];
            document.getElementById('rps-cpu-hand').textContent = this.icons[rnd];
            count++;
            if (count > 10) {
                clearInterval(interval);
                this.finish(choice, rnd);
            }
        }, 100);
    }

    finish(player, cpu) {
        let result = 'draw';
        if (player === cpu) result = 'draw';
        else if (
            (player === 'rock' && cpu === 'scissors') ||
            (player === 'paper' && cpu === 'rock') ||
            (player === 'scissors' && cpu === 'paper')
        ) {
            result = 'win';
        } else {
            result = 'loss';
        }

        if (result === 'win') {
            this.system.rewardPlayer(50, "RPS Galibiyeti");
        } else if (result === 'loss') {
            this.system.ui.showToast("Kaybettin!", "error");
        } else {
            this.system.ui.showToast("Berabere!", "warning");
        }
    }
}

/* ==========================================
   MODULE 6: ADMIN SYSTEM
   ========================================== */
class AdminSystem {
    constructor(ui) {
        this.ui = ui;
    }

    async banUser() {
        const input = document.getElementById('admin-target-user').value;
        if (!input) return;

        // Very powerful, use with care. 
        // We find user by matching username or ID from a search result
        // For now, simulating via toast as we need a User Search API
        this.ui.showToast(`Kullanıcı ${input} yasaklanıyor...`, 'warning');

        // Real implementation would queries DB for email/username -> gets UID -> updates isBanned:true
        // update(ref(window.db, `users/${uid}`), { isBanned: true });
    }

    toggleGame(game, status) {
        this.ui.showToast(`${game} oyunu ${status ? 'açıldı' : 'bakıma alındı'}.`, 'info');
        // update(ref(window.db, `settings/games/${game}`), { enabled: status });
    }

    sendAnnouncement() {
        const txt = document.getElementById('admin-announce-text').value;
        if (txt) {
            // Push to global announcements
            push(ref(window.db, `announcements`), {
                text: txt,
                by: STATE.userData.username,
                time: serverTimestamp()
            });
            this.ui.showToast("Duyuru yayınlandı!", 'success');
        }
    }
}

/* ==========================================
   MODULE 7: DATA SYSTEM (Leaderboards, etc)
   ========================================== */
class DataSystem {
    constructor() {
        // Auto load initial data
    }

    async loadLeaderboard() {
        const table = document.getElementById('leaderboard-body');
        table.innerHTML = '<tr><td colspan="4">Yükleniyor...</td></tr>';
        try {
            // Client-side sorting fallback to avoid "Index not defined" error
            const snapshot = await get(ref(window.db, 'users'));
            if (snapshot.exists()) {
                const users = [];
                snapshot.forEach(childSnap => {
                    users.push(childSnap.val());
                });

                // Sort by points descending
                users.sort((a, b) => (b.points || 0) - (a.points || 0));

                // Take top 100
                this.renderLeaderboard(users.slice(0, 100));
            } else {
                this.renderLeaderboard([]);
            }
        } catch (error) {
            console.error("Leaderboard Error:", error);
            window.nexusUI.showToast("Sıralama yüklenemedi", 'error');
        }
    }

    renderLeaderboard(users) {
        const table = document.getElementById('leaderboard-body');
        table.innerHTML = '';
        users.forEach((u, index) => {
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td>#${index + 1}</td>
                <td><div style="display:flex;align-items:center;gap:10px"><img src="${u.avatar}" style="width:24px;border-radius:50%">${u.username}</div></td>
                <td>${u.stats?.gamesWon || 0}</td>
                <td>${u.points} 💠</td>
            `;
            table.appendChild(tr);
        });
    }
}

// --- FINAL INITIALIZATION ---
window.gameSystem = new GameSystem(window.nexusUI);
window.chatSystem = new ChatSystem(window.nexusUI);
window.adminSystem = new AdminSystem(window.nexusUI);
window.dataSystem = new DataSystem();

/* Flip Coin Helper */
window.gameSystem.flipCoin = () => {
    const coin = document.getElementById('coin');
    coin.classList.remove('heads', 'tails');
    setTimeout(() => {
        const result = Math.random() < 0.5 ? 'heads' : 'tails';
        coin.classList.add(result);
        if (result === 'heads') window.gameSystem.rewardPlayer(100, "Yazı Tura Şansı");
    }, 100);
};


/* ==========================================
   MODULE 8: MINESWEEPER GAME LOGIC
   ========================================== */
class MinesweeperGame {
    constructor(system) {
        this.system = system;
        this.bet = 10;
        this.gridSize = 25; // 5x5
        this.minesCount = 5;
        this.minesMap = [];
        this.revealedCount = 0;
        this.active = false;
        this.multiplier = 1.0;

        // Setup Grid
        this.gridEl = document.getElementById('mines-grid');
        document.getElementById('mines-start-btn').onclick = () => this.startGame();
        document.getElementById('mines-cashout-btn').onclick = () => this.cashOut();
    }

    startGame() {
        // Economy Check
        const betInput = document.getElementById('mines-bet');
        this.bet = parseInt(betInput.value);

        if (STATE.userData.points < this.bet) {
            this.system.ui.showToast("Yetersiz Bakiye!", 'error');
            return;
        }

        // Deduct Bet
        const newPoints = STATE.userData.points - this.bet;
        update(ref(window.db, `users/${STATE.currentUser.uid}`), { points: newPoints });
        document.getElementById('user-points').textContent = newPoints;

        this.active = true;
        this.revealedCount = 0;
        this.multiplier = 1.0;
        this.updateStatus();
        this.generateGrid();

        this.system.ui.showToast("Mayın Tarlası Başladı! Bol Şans.", 'info');
    }

    generateGrid() {
        this.minesMap = Array(this.gridSize).fill(false);
        // Place Random Mines
        let placed = 0;
        while (placed < this.minesCount) {
            const idx = Math.floor(Math.random() * this.gridSize);
            if (!this.minesMap[idx]) {
                this.minesMap[idx] = true;
                placed++;
            }
        }

        this.gridEl.innerHTML = '';
        for (let i = 0; i < this.gridSize; i++) {
            const cell = document.createElement('div');
            cell.className = 'mine-cell';
            cell.dataset.idx = i;
            cell.onclick = () => this.clickCell(i, cell);
            this.gridEl.appendChild(cell);
        }
    }

    clickCell(i, cell) {
        if (!this.active || cell.classList.contains('revealed')) return;

        cell.classList.add('revealed');

        if (this.minesMap[i]) {
            // BOOM!
            cell.classList.add('exploded');
            cell.textContent = '💣';
            this.gameOver(false);
        } else {
            // Safe
            cell.classList.add('safe');
            cell.textContent = '💎';
            this.revealedCount++;
            this.multiplier *= 1.2; // Increase Logic
            this.updateStatus();
            this.system.ui.playSound('click');
        }
    }

    cashOut() {
        if (!this.active) return;
        if (this.revealedCount === 0) {
            this.system.ui.showToast("En az bir elmas bulmalısın!", 'warning');
            return;
        }

        const winAmount = Math.floor(this.bet * this.multiplier);
        this.system.rewardPlayer(winAmount, `Mayın Tarlası (x${this.multiplier.toFixed(2)})`);
        this.gameOver(true);
    }

    gameOver(win) {
        this.active = false;
        // Reveal all
        const cells = this.gridEl.children;
        for (let i = 0; i < this.gridSize; i++) {
            const cell = cells[i];
            if (this.minesMap[i]) {
                cell.classList.add('revealed');
                if (!cell.classList.contains('exploded')) cell.textContent = '💣';
            }
        }

        if (!win) {
            this.system.ui.playSound('error');
            this.system.ui.showToast("Oyun Bitti! Mayına bastın.", 'error');
        }
    }

    updateStatus() {
        document.getElementById('mines-status').textContent = `Çarpan: x${this.multiplier.toFixed(2)} | Kazanç: ${Math.floor(this.bet * this.multiplier)}`;
    }
}

/* ==========================================
   MODULE 9: MARKET SYSTEM
   ========================================== */
class MarketSystem {
    constructor() {
        this.items = [
            { id: 'frame_neon', name: 'Neon Çerçeve', price: 500, icon: '🖼️' },
            { id: 'color_gold', name: 'Altın İsim', price: 1000, icon: '👑' },
            { id: 'title_master', name: 'Ünvan: Usta', price: 2000, icon: '🎓' }
        ];
        this.init();
    }

    init() {
        const grid = document.getElementById('market-items-grid');
        if (!grid) return;

        this.items.forEach(item => {
            const el = document.createElement('div');
            el.className = 'market-item';
            el.innerHTML = `
                <div class="item-preview">${item.icon}</div>
                <div class="item-info">
                    <h4>${item.name}</h4>
                    <div class="item-price">${item.price} 💠</div>
                </div>
                <button class="btn btn-primary btn-sm" onclick="window.marketSystem.buy('${item.id}', ${item.price})">SATIN AL</button>
            `;
            grid.appendChild(el);
        });
    }

    async buy(itemId, price) {
        if (STATE.userData.points < price) {
            window.nexusUI.showToast("Yetersiz Puan!", 'error');
            return;
        }

        // Transaction
        const updates = {};
        updates[`users/${STATE.currentUser.uid}/points`] = STATE.userData.points - price;
        updates[`users/${STATE.currentUser.uid}/inventory/${itemId}`] = true;

        try {
            await update(ref(window.db), updates);
            window.nexusUI.showToast("Satın alım başarılı!", 'success');
            window.nexusUI.playSound('success');
        } catch (e) {
            console.error(e);
        }
    }
}


/* ==========================================
   MODULE 11: TETRIS GAME ENGINE (ADVANCED)
   ========================================== */
class TetrisGame {
    constructor(system) {
        this.system = system;
        this.grid = []; // 20x10
        this.score = 0;
        this.lines = 0;
        this.level = 1;
        this.gameOver = false;
        this.paused = false;

        this.currentPiece = null;
        this.ghostPiece = null;
        this.nextPieceType = null;

        this.dropInterval = 1000;
        this.lastTime = 0;
        this.animationId = null;

        this.colors = {
            'I': 'type-I', 'O': 'type-O', 'T': 'type-T',
            'S': 'type-S', 'Z': 'type-Z', 'J': 'type-J', 'L': 'type-L'
        };

        this.tetrominoes = {
            'I': [[1, 1, 1, 1]],
            'J': [[1, 0, 0], [1, 1, 1]],
            'L': [[0, 0, 1], [1, 1, 1]],
            'O': [[1, 1], [1, 1]],
            'S': [[0, 1, 1], [1, 1, 0]],
            'T': [[0, 1, 0], [1, 1, 1]],
            'Z': [[1, 1, 0], [0, 1, 1]]
        };
    }

    start() {
        document.getElementById('tetris-msg-overlay').style.display = 'none';
        this.reset();
        this.spawnPiece();
        this.loop();
    }

    reset() {
        // Create Empty Grid
        this.grid = Array.from({ length: 20 }, () => Array(10).fill(0));
        this.score = 0;
        this.lines = 0;
        this.level = 1;
        this.gameOver = false;
        this.updateStats();
        this.renderGrid();
    }

    spawnPiece() {
        const types = 'IJLOSTZ';
        const type = this.nextPieceType || types[Math.floor(Math.random() * types.length)];
        this.nextPieceType = types[Math.floor(Math.random() * types.length)];

        this.currentPiece = {
            matrix: this.tetrominoes[type],
            pos: { x: 3, y: 0 },
            type: type
        };

        // Check Game Over immediately
        if (this.collide(this.grid, this.currentPiece)) {
            this.gameOver = true;
            this.system.ui.showToast("Oyun Bitti! Skor: " + this.score, 'error');
            document.getElementById('tetris-msg-overlay').style.display = 'flex';
            document.getElementById('tetris-msg-title').textContent = "OYUN BİTTİ";
            cancelAnimationFrame(this.animationId);
        }

        this.renderNext();
    }

    collide(arena, player) {
        const [m, o] = [player.matrix, player.pos];
        for (let y = 0; y < m.length; ++y) {
            for (let x = 0; x < m[y].length; ++x) {
                if (m[y][x] !== 0 &&
                    (arena[y + o.y] && arena[y + o.y][x + o.x]) !== 0) {
                    return true;
                }
            }
        }
        return false;
    }

    merge(arena, player) {
        player.matrix.forEach((row, y) => {
            row.forEach((value, x) => {
                if (value !== 0) {
                    arena[y + player.pos.y][x + player.pos.x] = player.type;
                }
            });
        });
    }

    rotate(matrix, dir) {
        for (let y = 0; y < matrix.length; ++y) {
            for (let x = 0; x < y; ++x) {
                [matrix[x][y], matrix[y][x]] = [matrix[y][x], matrix[x][y]];
            }
        }
        if (dir > 0) matrix.forEach(row => row.reverse());
        else matrix.reverse();
    }

    playerDrop() {
        this.currentPiece.pos.y++;
        if (this.collide(this.grid, this.currentPiece)) {
            this.currentPiece.pos.y--;
            this.merge(this.grid, this.currentPiece);
            this.arenaSweep();
            this.spawnPiece();
        }
        this.lastTime = 0; // Reset Timer
    }

    playerMove(dir) {
        this.currentPiece.pos.x += dir;
        if (this.collide(this.grid, this.currentPiece)) {
            this.currentPiece.pos.x -= dir;
        }
    }

    playerRotate(dir) {
        const pos = this.currentPiece.pos.x;
        let offset = 1;
        this.rotate(this.currentPiece.matrix, dir);
        while (this.collide(this.grid, this.currentPiece)) {
            this.currentPiece.pos.x += offset;
            offset = -(offset + (offset > 0 ? 1 : -1));
            if (offset > this.currentPiece.matrix[0].length) {
                this.rotate(this.currentPiece.matrix, -dir);
                this.currentPiece.pos.x = pos;
                return;
            }
        }
    }

    arenaSweep() {
        let rowCount = 0;
        outer: for (let y = this.grid.length - 1; y > 0; --y) {
            for (let x = 0; x < this.grid[y].length; ++x) {
                if (this.grid[y][x] === 0) {
                    continue outer;
                }
            }
            const row = this.grid.splice(y, 1)[0].fill(0);
            this.grid.unshift(row);
            ++y;
            rowCount++;
        }

        if (rowCount > 0) {
            this.score += rowCount * 100 * this.level;
            this.lines += rowCount;
            this.level = Math.floor(this.lines / 10) + 1;
            this.dropInterval = Math.max(100, 1000 - (this.level * 50));
            this.updateStats();
            this.system.ui.playSound('success'); // Line clear sound
        }
    }

    loop(time = 0) {
        if (this.paused || this.gameOver || STATE.activeGame !== 'tetris') {
            cancelAnimationFrame(this.animationId);
            return;
        }

        const deltaTime = time - this.lastTime;
        this.lastTime = time;

        this.dropCounter = (this.dropCounter || 0) + deltaTime;
        if (this.dropCounter > this.dropInterval) {
            this.playerDrop();
            this.dropCounter = 0;
        }

        this.renderGrid();
        this.animationId = requestAnimationFrame(this.loop.bind(this));
    }

    renderGrid() {
        const container = document.getElementById('tetris-grid');
        container.innerHTML = ''; // Inefficient but simple for DOM tetris

        // Render Static Grid
        for (let y = 0; y < 20; y++) {
            for (let x = 0; x < 10; x++) {
                const val = this.grid[y][x];
                this.createCell(x, y, val, container);
            }
        }

        // Render Active Piece
        if (this.currentPiece) {
            this.currentPiece.matrix.forEach((row, y) => {
                row.forEach((value, x) => {
                    if (value !== 0) {
                        this.createCell(x + this.currentPiece.pos.x, y + this.currentPiece.pos.y, this.currentPiece.type, container, true);
                    }
                });
            });
        }
    }

    createCell(x, y, type, container, isActive = false) {
        const cell = document.createElement('div');
        cell.className = 't-cell';
        cell.style.gridColumnStart = x + 1;
        cell.style.gridRowStart = y + 1;

        if (type !== 0) {
            cell.classList.add('filled');
            cell.classList.add(this.colors[type]);
        }
        container.appendChild(cell);
    }

    renderNext() {
        // Render Preview
    }

    updateStats() {
        document.getElementById('tetris-score').textContent = this.score;
        document.getElementById('tetris-level').textContent = this.level;
        document.getElementById('tetris-lines').textContent = this.lines;
    }
}

// Key Listener for Tetris
document.addEventListener('keydown', event => {
    if (STATE.activeGame !== 'tetris') return;
    const game = window.gameSystem.instances.tetris;
    if (!game || game.gameOver) return;

    if (event.key === 'ArrowLeft') game.playerMove(-1);
    else if (event.key === 'ArrowRight') game.playerMove(1);
    else if (event.key === 'ArrowDown') game.playerDrop();
    else if (event.key === 'ArrowUp') game.playerRotate(1);
});


/* ==========================================
   MODULE 12: CLAN & GUILD SYSTEM
   ========================================== */
class ClanSystem {
    constructor() {
        // Init
    }

    async createClan(name, tag) {
        if (STATE.userData.points < 5000) {
            window.nexusUI.showToast("Klan kurmak için 5000 Puan gerekli!", 'error');
            return;
        }

        const clanId = 'clan_' + Date.now();
        const clanData = {
            id: clanId,
            name: name,
            tag: tag.toUpperCase(),
            owner: STATE.currentUser.uid,
            level: 1,
            points: 0,
            members: {
                [STATE.currentUser.uid]: { role: 'leader', joinedAt: serverTimestamp() }
            },
            createdAt: serverTimestamp()
        };

        // Multi-path update
        const updates = {};
        updates[`clans/${clanId}`] = clanData;
        updates[`users/${STATE.currentUser.uid}/clanId`] = clanId;
        updates[`users/${STATE.currentUser.uid}/points`] = STATE.userData.points - 5000;

        await update(ref(window.db), updates);
        window.nexusUI.showToast(` [${tag}] ${name} Klanı Kuruldu!`, 'success');
        this.openClanModal();
    }

    async openClanModal() {
        const modal = document.getElementById('clan-modal');
        modal.classList.remove('hidden');
        const body = document.getElementById('clan-modal-body');

        // Check if user has clan
        if (STATE.userData.clanId) {
            // Show Clan Dashboard
            const clanRef = child(ref(window.db), `clans/${STATE.userData.clanId}`);
            const snap = await get(clanRef);
            const clan = snap.val();

            body.innerHTML = `
                <div class="clan-dashboard">
                    <div class="clan-sidebar">
                        <div class="clan-banner">
                            <div class="clan-avatar-large">${clan.tag}</div>
                            <div class="clan-info-text">
                                <h1>${clan.name} <span class="clan-level-badge">LVL ${clan.level}</span></h1>
                            </div>
                        </div>
                        <div class="clan-menu-item active">🏠 Genel Bakış</div>
                        <div class="clan-menu-item">👥 Üyeler (${Object.keys(clan.members).length})</div>
                        <div class="clan-menu-item">⚔️ Klan Savaşları</div>
                        <div class="clan-menu-item">🏦 Banka (${clan.points} P)</div>
                    </div>
                    <div class="clan-content">
                        <h3>Klan Duyurusu</h3>
                        <div class="glass-panel" style="padding:15px; margin-bottom:20px; font-style:italic;">
                            "${clan.notice || 'Henüz bir duyuru yok.'}"
                        </div>
                        <!-- Member List Simulation -->
                    </div>
                </div>
             `;
        } else {
            // Show Create / Join
            body.innerHTML = `
                <div style="text-align:center; padding: 50px;">
                    <h2>Bir Klana Ait Değilsin</h2>
                    <p>Güçlü olmak için birlik olmalısın.</p>
                    <div style="margin-top:30px; display:flex; gap:20px; justify-content:center;">
                        <button class="btn btn-primary btn-lg" onclick="document.getElementById('create-clan-form').style.display='block'">Klan Kur (5000 P)</button>
                        <button class="btn btn-secondary btn-lg">Klan Bul</button>
                    </div>
                    
                    <div id="create-clan-form" style="display:none; margin-top:30px; max-width:400px; margin-left:auto; margin-right:auto;">
                        <input type="text" id="new-clan-name" placeholder="Klan Adı" class="game-input" style="margin-bottom:10px;">
                        <input type="text" id="new-clan-tag" placeholder="TAG (3 Harf)" class="game-input" maxlength="3" style="margin-bottom:10px;">
                        <button class="btn btn-success btn-block" onclick="window.clanSystem.createClan(document.getElementById('new-clan-name').value, document.getElementById('new-clan-tag').value)">ONAYLA VE ÖDE</button>
                    </div>
                </div>
             `;
        }
    }

    closeModal() {
        document.getElementById('clan-modal').classList.add('hidden');
    }
}

/* ==========================================
   MODULE 13: GLOBAL MUSIC PLAYER
   ========================================== */
class MusicSystem {
    constructor() {
        this.trackList = [
            { name: "Neon Nights - Synthwave Mix", url: "#" },
            { name: "Cyber City - Deep Bass", url: "#" },
            { name: "Galactic Voyage - LoFi", url: "#" }
        ];
        this.currentTrackIdx = 0;
        this.isPlaying = false;
        // In real app, Audio object would be here
        // this.audio = new Audio();

        this.ui = {
            player: document.getElementById('nexus-music-player'),
            trackName: document.getElementById('music-track-name'),
            playBtn: document.getElementById('music-play-btn')
        };
    }

    toggle() {
        this.ui.player.classList.toggle('collapsed');
    }

    playPause() {
        this.isPlaying = !this.isPlaying;
        this.ui.playBtn.textContent = this.isPlaying ? '⏸' : '▶';
        // Mock Play
        if (this.isPlaying) {
            window.nexusUI.showToast("Müzik Başlatıldı: " + this.trackList[this.currentTrackIdx].name, 'info');
            this.startVisualizer();
        } else {
            this.stopVisualizer();
        }
    }

    next() {
        this.currentTrackIdx = (this.currentTrackIdx + 1) % this.trackList.length;
        this.updateTrackInfo();
    }

    prev() {
        this.currentTrackIdx = (this.currentTrackIdx - 1 + this.trackList.length) % this.trackList.length;
        this.updateTrackInfo();
    }

    updateTrackInfo() {
        this.ui.trackName.textContent = this.trackList[this.currentTrackIdx].name;
        if (this.isPlaying) window.nexusUI.showToast("Çalıyor: " + this.trackList[this.currentTrackIdx].name, 'info');
    }

    startVisualizer() {
        // Activate CSS Animations on bars
        document.querySelectorAll('.visualizer .bar').forEach(bar => {
            bar.style.animationPlayState = 'running';
        });
    }

    stopVisualizer() {
        document.querySelectorAll('.visualizer .bar').forEach(bar => {
            bar.style.animationPlayState = 'paused';
        });
    }

    setVolume(val) {
        // this.audio.volume = val / 100;
    }
}

// --- FINAL APP INITIALIZATION ---
document.addEventListener('DOMContentLoaded', () => {
    console.log("🚀 NEXUS SYSTEM INITIALIZING...");

    // 1. Core UI
    window.nexusUI = new UIController();

    // 2. Systems
    window.router = new Router(window.nexusUI);
    // Ensure GameSystem exists before extensions
    if (typeof GameSystem !== 'undefined') {
        window.gameSystem = new GameSystem(window.nexusUI);
    } else {
        console.error("GameSystem Class Missing!");
    }

    window.chatSystem = new ChatSystem(window.nexusUI);
    window.adminSystem = new AdminSystem(window.nexusUI);
    window.dataSystem = new DataSystem();
    window.marketSystem = new MarketSystem();

    // 3. Extensions (Tetris, Clans, Music)
    window.gameSystem.instances.tetris = new TetrisGame(window.gameSystem);
    window.clanSystem = new ClanSystem();
    window.musicSystem = new MusicSystem();

    // 4. Auth Manager (Starts the Flow)
    window.authManager = new AuthManager(window.nexusUI);

    // 5. Hook Game Launchers
    const originalLaunch = window.gameSystem.launch;
    window.gameSystem.launch = function (id) {
        console.log("Launching Game:", id);

        // Lazy Load Instances if missing
        if (id === 'mines' && !window.gameSystem.instances.mines) window.gameSystem.instances.mines = new MinesweeperGame(window.gameSystem);
        if (id === 'tetris' && !window.gameSystem.instances.tetris) window.gameSystem.instances.tetris = new TetrisGame(window.gameSystem);

        // Custom Logic for Tetris Overlay
        if (id === 'tetris') {
            const container = document.getElementById('game-overlay-container');
            if (container) {
                container.classList.remove('hidden');
                container.style.display = 'flex';
            }
            document.querySelectorAll('.game-stage').forEach(el => el.classList.add('hidden'));
            const stage = document.getElementById('game-stage-tetris');
            if (stage) stage.classList.remove('hidden');
            STATE.activeGame = 'tetris';
            return;
        }

        // Default Logic
        const container = document.getElementById('game-overlay-container');
        if (container) {
            container.classList.remove('hidden');
            container.style.display = 'flex';
        }
        document.querySelectorAll('.game-stage').forEach(el => el.classList.add('hidden'));
        const stage = document.getElementById(`game-stage-${id}`);
        if (stage) stage.classList.remove('hidden');

        STATE.activeGame = id;

        // Auto Start
        if (id === 'chess' && window.gameSystem.instances.chess) window.gameSystem.instances.chess.start();
        else if (id === '2048' && window.gameSystem.instances.g2048) window.gameSystem.instances.g2048.start();
        else if (id === 'wheel' && window.gameSystem.instances.wheel) window.gameSystem.instances.wheel.draw();
        else if (id === 'rps' && window.gameSystem.instances.rps) window.gameSystem.instances.rps.reset();
        else if (id === 'mines' && window.gameSystem.instances.mines) window.gameSystem.instances.mines.startGame();
    };

    // 6. Social Feed
    setTimeout(() => {
        const feed = document.getElementById('global-activity-list');
        if (feed) {
            const activities = [
                { type: 'game', text: "Mehmet satrançta kazandı! (+50P)", time: "2dk önce" },
                { type: 'clan', text: "[TR] Anadolu Klanı seviye atladı!", time: "5dk önce" },
                { type: 'market', text: "Ahmet 'Neon Çerçeve' satın aldı.", time: "10dk önce" },
                { type: 'chat', text: "Sohbet odası rekor kırdı: 154 Online", time: "1sa önce" }
            ];

            feed.innerHTML = '';
            activities.forEach(act => {
                const div = document.createElement('div');
                div.className = 'activity-item';
                div.innerHTML = `
                    <div class="user-avatar-sm" style="font-size:1.2rem; display:flex; align-items:center; justify-content:center;">📢</div>
                    <div>
                        <div style="font-size:0.9rem; color:#fff;">${act.text}</div>
                        <div style="font-size:0.7rem; color:#666;">${act.time}</div>
                    </div>
                `;
                feed.appendChild(div);
            });
        }
    }, 2000);

    console.log("✅ SYSTEM READY");
});



