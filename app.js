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
        this.loader = document.getElementById('app-loader');
        this.toastContainer = document.getElementById('toast-container');
        this.sidebar = document.getElementById('sidebar');
        this.audioContext = null;
        this.sounds = {};

        this.initListeners();
    }

    initListeners() {
        // Sidebar Toggle for Mobile
        const sidebarToggle = document.getElementById('sidebar-toggle');
        const mobileMenuBtn = document.getElementById('mobile-menu-btn');

        [sidebarToggle, mobileMenuBtn].forEach(btn => {
            if (btn) btn.addEventListener('click', () => {
                this.sidebar.classList.toggle('open');
            });
        });

        // Close sidebar when clicking outside on mobile
        document.addEventListener('click', (e) => {
            if (window.innerWidth <= 768 &&
                !this.sidebar.contains(e.target) &&
                !mobileMenuBtn.contains(e.target) &&
                this.sidebar.classList.contains('open')) {
                this.sidebar.classList.remove('open');
            }
        });
    }

    // --- Loading Screen Management ---
    hideLoader() {
        if (this.loader.classList.contains('active')) {
            this.loader.style.opacity = '0';
            setTimeout(() => {
                this.loader.classList.remove('active');
                this.loader.style.display = 'none';
            }, 500);
        }
    }

    showLoader(message = "Yükleniyor...") {
        document.getElementById('loading-text').textContent = message;
        this.loader.style.display = 'flex';
        this.loader.style.opacity = '1';
        this.loader.classList.add('active');
    }

    // --- Toast Notification System ---
    showToast(message, type = 'info', duration = 4000) {
        // Types: info, success, error, warning
        const toast = document.createElement('div');
        toast.className = `toast toast-${type} fade-in-up`;

        let icon = 'ℹ️';
        if (type === 'success') icon = '✅';
        if (type === 'error') icon = '🛑';
        if (type === 'warning') icon = '⚠️';

        toast.innerHTML = `
            <div class="toast-content">
                <span class="toast-icon">${icon}</span>
                <span class="toast-msg">${message}</span>
            </div>
            <div class="toast-progress"></div>
        `;

        // Inject Styles dynamically if not present (Self-contained)
        if (!document.getElementById('toast-styles')) {
            const style = document.createElement('style');
            style.id = 'toast-styles';
            style.textContent = `
                .toast-container { position: fixed; top: 20px; right: 20px; z-index: var(--z-toast); display: flex; flex-direction: column; gap: 10px; }
                .toast { min-width: 300px; padding: 16px; background: rgba(20, 20, 25, 0.9); backdrop-filter: blur(10px); border: 1px solid rgba(255,255,255,0.1); border-radius: 8px; box-shadow: 0 5px 20px rgba(0,0,0,0.5); color: white; position: relative; overflow: hidden; }
                .toast-success { border-left: 4px solid var(--c-success); }
                .toast-error { border-left: 4px solid var(--c-error); }
                .toast-content { display: flex; align-items: center; gap: 12px; font-size: 0.9rem; }
                .toast-progress { position: absolute; bottom: 0; left: 0; height: 3px; background: rgba(255,255,255,0.2); width: 100%; animation: toastTimer ${duration}ms linear forwards; }
                @keyframes toastTimer { from { width: 100%; } to { width: 0%; } }
            `;
            document.head.appendChild(style);
        }

        this.toastContainer.appendChild(toast);
        this.playSound(type === 'error' ? 'error' : 'notification');

        setTimeout(() => {
            toast.style.opacity = '0';
            toast.style.transform = 'translateX(50px)';
            setTimeout(() => toast.remove(), 300);
        }, duration);
    }

    // --- Audio System ---
    initAudio() {
        // Browser requires interaction before playing audio
        if (!this.audioContext) {
            const AudioContext = window.AudioContext || window.webkitAudioContext;
            this.audioContext = new AudioContext();
            // In a real app, we would load buffers here. For now, we use simulated beeps/synthetic sounds or placeholder logic
        }
    }

    playSound(type) {
        if (!STATE.audioEnabled) return;
        // Simple synthetic sounds for demo purposes (No external assets required)
        if (this.audioContext) {
            // Setup Oscillator
            const osc = this.audioContext.createOscillator();
            const gain = this.audioContext.createGain();
            osc.connect(gain);
            gain.connect(this.audioContext.destination);

            const now = this.audioContext.currentTime;

            if (type === 'click') {
                osc.type = 'sine';
                osc.frequency.setValueAtTime(800, now);
                osc.frequency.exponentialRampToValueAtTime(300, now + 0.1);
                gain.gain.setValueAtTime(0.1, now);
                gain.gain.exponentialRampToValueAtTime(0.01, now + 0.1);
                osc.start(now);
                osc.stop(now + 0.1);
            } else if (type === 'success') {
                osc.type = 'triangle';
                osc.frequency.setValueAtTime(400, now);
                osc.frequency.linearRampToValueAtTime(600, now + 0.1);
                gain.gain.setValueAtTime(0.1, now);
                gain.gain.linearRampToValueAtTime(0, now + 0.3);
                osc.start(now);
                osc.stop(now + 0.3);
            } else if (type === 'error') {
                osc.type = 'sawtooth';
                osc.frequency.setValueAtTime(150, now);
                osc.frequency.linearRampToValueAtTime(100, now + 0.2);
                gain.gain.setValueAtTime(0.1, now);
                gain.gain.linearRampToValueAtTime(0, now + 0.2);
                osc.start(now);
                osc.stop(now + 0.2);
            }
        }
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
            if (user) {
                // User signed in
                console.log("Auth: User detected", user.uid);
                STATE.currentUser = user;

                // Fetch extended user data from Realtime DB
                const snapshot = await get(child(ref(db), `users/${user.uid}`));

                if (snapshot.exists()) {
                    STATE.userData = snapshot.val();

                    // CHECK FOR BAN
                    if (STATE.userData.isBanned) {
                        this.forceLogout("Hesabınız yasaklanmıştır.");
                        return;
                    }

                    // Update Last Login
                    update(ref(db, `users/${user.uid}`), {
                        lastLogin: serverTimestamp(),
                        isOnline: true
                    });

                    // Setup Disconnect Hook (Set isOnline false on close)
                    // Note: onDisconnect is tricky in modular SDK, we handle it via presence system later

                    this.completeLoginFlow();
                } else {
                    // Profile missing in DB (Rare edge case, self-heal)
                    this.createDatabaseEntry(user, "Üye");
                    this.completeLoginFlow();
                }
            } else {
                // User signed out
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
        // Hide Auth, Show App
        document.getElementById('auth-module').classList.add('hidden');
        document.getElementById('app-container').classList.remove('hidden');

        // Update UI with User Data
        document.getElementById('user-name').textContent = STATE.userData.username;
        document.getElementById('dash-username').textContent = STATE.userData.username;
        document.getElementById('user-points').textContent = STATE.userData.points;
        document.getElementById('user-role-badge').textContent = this.translateRole(STATE.userData.role);
        document.getElementById('dash-rank').textContent = "#" + (STATE.userData.rank || "-"); // Calculated later
        document.getElementById('dash-games-played').textContent = STATE.userData.stats.gamesPlayed;
        document.getElementById('user-avatar-img').src = STATE.userData.avatar;

        // Show Admin Panel if privileged
        if (['admin', 'founder'].includes(STATE.userData.role)) {
            document.getElementById('admin-nav-section').classList.remove('hidden');
        } else {
            document.getElementById('admin-nav-section').classList.add('hidden');
        }

        // Initialize user interaction for audio
        this.ui.initAudio();

        // Routing default
        window.router.navigate('dashboard');
        this.ui.hideLoader();
        this.ui.showToast(`Hoş geldin, ${STATE.userData.username}!`, 'success');
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

// --- INITIALIZATION HOOK ---
// We attach classes to window so they can be accessed globally if needed (debugging)
// and to allow Part 2 to extend them easily.

const ui = new UIController();
const authManager = new AuthManager(ui);
window.router = new Router(ui);
window.nexusUI = ui; // Expose for other modules
window.db = db;      // Expose for other modules
window.STATE = STATE; // Shared State

console.log("NEXUS Core System Initialized.");

// End of Part 1 - Core & Auth

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

        const q = query(ref(window.db, 'users'), orderByChild('points'), limitToLast(10));
        const snapshot = await get(q);

        if (snapshot.exists()) {
            const users = [];
            snapshot.forEach(child => {
                users.push(child.val());
            });
            users.reverse(); // Highest first

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

console.log("NEXUS Full Systems Loaded.");

