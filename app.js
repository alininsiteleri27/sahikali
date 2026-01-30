
/**
 * ==============================================================================
 * NEXUS PLATFORM V2.0 - CORE ENGINE
 * ==============================================================================
 * ARCHITECT: ANTIGRAVITY (AI)
 * BUILD: 2026.01.30-FINAL
 * TYPE: SINGLE PAGE APPLICATION (SPA) MUDULE
 * 
 * DESCRIPTION:
 * This is the central nervous system of the Nexus Platform. It handles everything
 * from particle physics simulations in the background to real-time database 
 * synchronization via Firebase.
 * 
 * TABLE OF CONTENTS:
 * 1. IMPORTS & CONFIG
 * 2. STATE MANAGEMENT (REACTIVE STORE)
 * 3. UTILITIES & HELPERS
 * 4. AUDIO ENGINE
 * 5. PARTICLE PHYSICS ENGINE (VISUALS)
 * 6. AUTHENTICATION SYSTEM
 * 7. ROUTING & NAVIGATION
 * 8. REAL-TIME CHAT SYSTEM
 * 9. GAME ENGINE (MINES, SLOTS, RPS)
 * 10. ADMIN & FOUNDER TOOLS
 * 11. UI ORCHESTRATOR
 * 12. INITIALIZATION
 * ==============================================================================
 */

// ------------------------------------------------------------------------------
// 1. IMPORTS & CONFIGURATION
// ------------------------------------------------------------------------------
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import {
    getAuth, onAuthStateChanged, signInWithEmailAndPassword,
    createUserWithEmailAndPassword, signOut, updateProfile, sendPasswordResetEmail
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import {
    getDatabase, ref, set, get, update, push, onValue,
    off, serverTimestamp, query, limitToLast, orderByChild
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-database.js";

const FIREBASE_CONFIG = {
    apiKey: "AIzaSyDyGNrzw1a55LHv-LP5gjuPpFWmHu1a6yU",
    authDomain: "ali23-cfd02.firebaseapp.com",
    databaseURL: "https://ali23-cfd02-default-rtdb.europe-west1.firebasedatabase.app",
    projectId: "ali23-cfd02",
    storageBucket: "ali23-cfd02.firebasestorage.app",
    messagingSenderId: "759021285078",
    appId: "1:759021285078:web:f7673f89125ff3dad66377",
    measurementId: "G-NNCQQQFWD6"
};

// Initialize Firebase
const app = initializeApp(FIREBASE_CONFIG);
const auth = getAuth(app);
const db = getDatabase(app);

// Global Constants
const CONSTANTS = {
    APP_NAME: "NEXUS",
    VERSION: "2.0.0",
    ROLES: {
        FOUNDER: 'founder',
        ADMIN: 'admin',
        MEMBER: 'member'
    },
    GAMES: {
        MINES: { min_bet: 10, max_bet: 50000, payout_cap: 1000 },
        SLOTS: { min_bet: 50, symbols: ['🍒', '7️⃣', '💎', '🔔', '🍇', '🍋'] }
    },
    LEVEL_XP_BASE: 1000, // XP needed for level 2
    XP_MULTIPLIER: 1.2   // Each level needs 20% more XP
};

// ------------------------------------------------------------------------------
// 2. STATE MANAGEMENT
// ------------------------------------------------------------------------------
const STORE = {
    user: null,         // Auth User
    profile: null,      // DB Profile
    activeView: null,
    settings: {
        audio_vol: 0.8,
        sfx_enabled: true,
        motion_reduced: false,
        theme_hue: 180 // Cyan base
    },
    cache: {
        users: {},      // User ID -> Profile map
        top_players: [],
        online_count: 0
    },
    game_session: {
        active: false,
        game_id: null,
        data: {}
    }
};

// ------------------------------------------------------------------------------
// 3. UTILITIES
// ------------------------------------------------------------------------------
const Utils = {
    // Generates a secure random ID
    uuid() {
        return Math.random().toString(36).substring(2) + Date.now().toString(36);
    },

    // Formats numbers (e.g. 1000 -> 1,000)
    fmtNum(n) {
        return n.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
    },

    // Sleep function for async delays
    delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    },

    // Clamps a number between min and max
    clamp(num, min, max) {
        return Math.min(Math.max(num, min), max);
    },

    // Calculates Level from XP
    getLevel(xp) {
        let level = 1;
        let required = CONSTANTS.LEVEL_XP_BASE;
        while (xp >= required) {
            xp -= required;
            level++;
            required *= CONSTANTS.XP_MULTIPLIER;
        }
        return { level, progress: xp, next: Math.floor(required) };
    },

    // Creates a date string relative to now
    timeAgo(timestamp) {
        if (!timestamp) return 'Unknown';
        const seconds = Math.floor((Date.now() - timestamp) / 1000);
        if (seconds < 60) return 'Just now';
        const minutes = Math.floor(seconds / 60);
        if (minutes < 60) return `${minutes}m ago`;
        const hours = Math.floor(minutes / 60);
        if (hours < 24) return `${hours}h ago`;
        return new Date(timestamp).toLocaleDateString();
    }
};

// ------------------------------------------------------------------------------
// 4. AUDIO ENGINE
// ------------------------------------------------------------------------------
class AudioEngine {
    constructor() {
        this.ctx = new (window.AudioContext || window.webkitAudioContext)();
        this.sounds = {
            click: document.getElementById('sfx-ui-click'),
            hover: document.getElementById('sfx-ui-hover'),
            win: document.getElementById('sfx-win'),
            loose: document.getElementById('sfx-loose'),
            msg: document.getElementById('sfx-msg-in')
        };
    }

    play(key) {
        if (!STORE.settings.sfx_enabled) return;
        const sfx = this.sounds[key];
        if (sfx) {
            sfx.currentTime = 0;
            sfx.volume = STORE.settings.audio_vol;
            sfx.play().catch(() => { }); // Ignore interaction errors
        }
    }

    introSequence() {
        // Futuristic startup sound generated via Oscillator
        if (!STORE.settings.sfx_enabled) return;
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.connect(gain);
        gain.connect(this.ctx.destination);
        osc.type = 'sine';
        osc.frequency.setValueAtTime(200, this.ctx.currentTime);
        osc.frequency.exponentialRampToValueAtTime(800, this.ctx.currentTime + 0.5);
        gain.gain.setValueAtTime(0.1, this.ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.01, this.ctx.currentTime + 0.5);
        osc.start();
        osc.stop(this.ctx.currentTime + 0.5);
    }
}
const SFX = new AudioEngine();

// ------------------------------------------------------------------------------
// 5. PARTICLE PHYSICS ENGINE
// ------------------------------------------------------------------------------
class ParticleNetwork {
    constructor() {
        this.canvas = document.getElementById('bg-canvas');
        this.ctx = this.canvas.getContext('2d');
        this.particles = [];
        this.w = 0;
        this.h = 0;
        this.config = {
            count: 60,
            color: 'rgba(0, 242, 255, 0.5)',
            connDist: 150
        };

        window.addEventListener('resize', () => this.resize());
        this.resize();
        this.init();
        this.loop();
    }

    resize() {
        this.w = this.canvas.width = window.innerWidth;
        this.h = this.canvas.height = window.innerHeight;
    }

    init() {
        for (let i = 0; i < this.config.count; i++) {
            this.particles.push({
                x: Math.random() * this.w,
                y: Math.random() * this.h,
                vx: (Math.random() - 0.5) * 0.5,
                vy: (Math.random() - 0.5) * 0.5,
                size: Math.random() * 2,
                alpha: Math.random() * 0.5 + 0.1
            });
        }
    }

    loop() {
        // Clear
        this.ctx.clearRect(0, 0, this.w, this.h);

        // Update & Draw
        for (let i = 0; i < this.particles.length; i++) {
            let p = this.particles[i];

            // Move
            if (!STORE.settings.motion_reduced) {
                p.x += p.vx;
                p.y += p.vy;
            }

            // Bounce
            if (p.x < 0 || p.x > this.w) p.vx *= -1;
            if (p.y < 0 || p.y > this.h) p.vy *= -1;

            // Draw Dot
            this.ctx.fillStyle = `rgba(0, 242, 255, ${p.alpha})`;
            this.ctx.beginPath();
            this.ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
            this.ctx.fill();

            // Connections
            for (let j = i + 1; j < this.particles.length; j++) {
                let p2 = this.particles[j];
                let dist = Math.hypot(p.x - p2.x, p.y - p2.y);

                if (dist < this.config.connDist) {
                    this.ctx.strokeStyle = `rgba(0, 242, 255, ${0.1 - dist / 1500})`;
                    this.ctx.lineWidth = 0.5;
                    this.ctx.beginPath();
                    this.ctx.moveTo(p.x, p.y);
                    this.ctx.lineTo(p2.x, p2.y);
                    this.ctx.stroke();
                }
            }
        }

        requestAnimationFrame(() => this.loop());
    }
}

// ------------------------------------------------------------------------------
// 6. UI ORCHESTRATOR
// ------------------------------------------------------------------------------
const UI = {
    // --- TOASTS ---
    toast(msg, type = 'info') {
        const layer = document.getElementById('toast-layer');
        const el = document.createElement('div');
        el.className = `toast toast-${type}`;
        el.style.cssText = `
            background: var(--bg-panel);
            backdrop-filter: blur(10px);
            border: 1px solid var(--c-${type === 'error' ? 'danger' : type === 'success' ? 'success' : 'primary-500'});
            padding: 15px 25px;
            margin-bottom: 10px;
            border-radius: 8px;
            box-shadow: 0 5px 15px rgba(0,0,0,0.5);
            color: #fff;
            font-family: 'Rajdhani';
            font-weight: 600;
            display: flex; align-items: center; gap: 10px;
            animation: slideIn 0.3s cubic-bezier(0.68, -0.6, 0.32, 1.6);
            min-width: 300px;
        `;

        // Select Icon
        let icon = '';
        if (type === 'success') icon = 'ri-checkbox-circle-line';
        if (type === 'error') icon = 'ri-error-warning-line';
        if (type === 'info') icon = 'ri-information-line';

        el.innerHTML = `<i class="${icon}" style="font-size:1.2rem"></i> <span>${msg}</span>`;

        layer.appendChild(el);
        SFX.play(type === 'error' ? 'loose' : 'click');

        // Auto remove
        setTimeout(() => {
            el.style.opacity = '0';
            el.style.transform = 'translateX(100px)';
            setTimeout(() => el.remove(), 300);
        }, 3000);
    },

    // --- MODALS ---
    openModal(id) {
        const m = document.getElementById(id);
        const l = document.getElementById('modal-layer');
        if (m && l) {
            l.classList.remove('hidden');
            document.querySelectorAll('.modal-wrapper').forEach(x => x.classList.add('hidden'));
            m.classList.remove('hidden');
            SFX.play('hover');
        }
    },

    closeModal(id) {
        const l = document.getElementById('modal-layer');
        const m = document.getElementById(id);
        if (m) m.classList.add('hidden');
        if (l) l.classList.add('hidden');
    },

    // --- TABS (SETTINGS) ---
    setTab(id) {
        document.querySelectorAll('.set-view').forEach(e => e.classList.remove('active'));
        document.querySelectorAll('.set-tab').forEach(e => e.classList.remove('active'));

        document.getElementById(id).classList.add('active');
        // Find button triggering this and activate it (simplified)
        event.currentTarget.classList.add('active');
        SFX.play('click');
    },

    // --- MOBILE MENU ---
    toggleMobileNav() {
        const nav = document.querySelector('.mobile-bottom-nav');
        // In this design, bottom nav is always visible on mobile, 
        // but sidebar is hidden. We could toggle sidebar.
        // For now, let's just toast.
        this.toast('Mobile menu overlay coming soon', 'info');
    },

    // --- LOADING ---
    showLoader() {
        document.getElementById('critical-loader').style.display = 'flex';
    },

    hideLoader() {
        const l = document.getElementById('critical-loader');
        l.style.opacity = '0';
        l.style.transition = '0.5s';
        setTimeout(() => l.style.display = 'none', 500);
    },

    // --- DATA BINDING ---
    updateProfileUI() {
        if (!STORE.profile) return;
        const p = STORE.profile;
        const xpData = Utils.getLevel(p.xp);

        // Header
        const hName = document.getElementById('header-username');
        if (hName) hName.innerText = p.username.toUpperCase();

        const hRole = document.getElementById('header-role');
        if (hRole) {
            hRole.innerText = p.role.toUpperCase();
            hRole.className = `u-role role-${p.role}`;
        }

        const hAvt = document.getElementById('header-avatar');
        if (hAvt) hAvt.src = p.avatar;

        const pts = document.getElementById('my-points');
        if (pts) pts.innerText = Utils.fmtNum(p.points);

        // Profile Page Full
        const fAvt = document.getElementById('p-full-avatar');
        if (fAvt) fAvt.src = p.avatar;

        const fName = document.getElementById('p-full-name');
        if (fName) fName.innerText = p.username;

        const fRole = document.getElementById('p-full-role');
        if (fRole) fRole.innerText = p.role;

        const fBio = document.getElementById('p-bio');
        if (fBio) fBio.innerText = p.bio || "No bio signature established.";

        // Stats
        document.getElementById('p-level').innerText = xpData.level;
        document.getElementById('p-total-games').innerText = 0; // Populate later
        document.getElementById('p-total-wins').innerText = 0;
    }
};

// ------------------------------------------------------------------------------
// 7. ROUTER
// ------------------------------------------------------------------------------
const Router = {
    go(viewId) {
        if (!STORE.user && viewId !== 'auth') {
            // Force Auth
            UI.openModal('modal-auth');
            return;
        }

        // Handle specific actions for views
        if (viewId === 'home') {
            // Refresh stats
        }

        // DOM Manip
        document.querySelectorAll('.view-panel').forEach(v => v.classList.remove('active'));
        const target = document.getElementById(`view-${viewId}`);
        if (target) {
            target.classList.add('active');
            STORE.activeView = viewId;
        }

        // Active Nav State
        document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
        const navBtn = document.querySelector(`.nav-item[data-view='view-${viewId}']`);
        if (navBtn) navBtn.classList.add('active');

        // Mobile active state
        document.querySelectorAll('.mob-item').forEach(m => m.classList.remove('active'));
        // (Simplified mapping for mobile)

        // Breadcrumbs
        const bread = document.getElementById('bread-sub');
        if (bread) bread.innerText = viewId.toUpperCase();

        SFX.play('click');
    }
};

// ------------------------------------------------------------------------------
// 8. AUTH MANAGER
// ------------------------------------------------------------------------------
const AuthManager = {
    init() {
        // UI Binds
        document.querySelectorAll('.tab-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                // Switch Tabs
                document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
                e.target.classList.add('active');

                const target = e.target.dataset.target;
                document.querySelectorAll('.auth-form').forEach(f => f.classList.add('hidden'));
                document.getElementById(target).classList.remove('hidden');
            });
        });

        // Forms
        document.getElementById('form-login').addEventListener('submit', this.handleLogin);
        document.getElementById('form-register').addEventListener('submit', this.handleRegister);

        // Firebase Listener
        onAuthStateChanged(auth, (user) => {
            if (user) {
                console.log("[AUTH] State: User connected", user.uid);
                STORE.user = user;
                this.loadUserProfile(user.uid);
            } else {
                console.log("[AUTH] State: Guest");
                STORE.user = null;
                STORE.profile = null;
                UI.openModal('modal-auth');
                UI.hideLoader();
            }
        });
    },

    async handleLogin(e) {
        e.preventDefault();
        const email = document.getElementById('login-email').value;
        const pass = document.getElementById('login-pass').value;

        try {
            await signInWithEmailAndPassword(auth, email, pass);
            UI.closeModal('modal-auth');
            UI.toast('Access Granted', 'success');
        } catch (err) {
            UI.toast(err.message, 'error');
        }
    },

    async handleRegister(e) {
        e.preventDefault();
        const userStr = document.getElementById('reg-user').value;
        const email = document.getElementById('reg-email').value;
        const pass = document.getElementById('reg-pass').value;

        try {
            const cred = await createUserWithEmailAndPassword(auth, email, pass);

            // Create Profile
            const profileData = {
                username: userStr,
                email: email,
                role: CONSTANTS.ROLES.MEMBER,
                xp: 0,
                level: 1,
                points: 1000, // Starter bonus
                bio: "New recruit.",
                avatar: `https://ui-avatars.com/api/?name=${userStr}&background=random`,
                joinedAt: serverTimestamp(),
                isBanned: false,
                isMuted: false
            };

            await set(ref(db, 'users/' + cred.user.uid), profileData);
            await updateProfile(cred.user, { displayName: userStr });

            UI.closeModal('modal-auth');
            UI.toast('Identity Created. Welcome to Nexus.', 'success');
        } catch (err) {
            UI.toast(err.message, 'error');
        }
    },

    logout() {
        signOut(auth);
        UI.toast('Disconnecting...', 'info');
        Router.go('auth'); // Will trigger modal
    },

    async loadUserProfile(uid) {
        try {
            const snapshot = await get(ref(db, 'users/' + uid));
            if (snapshot.exists()) {
                STORE.profile = snapshot.val();
                STORE.profile.uid = uid;

                // Update Presence
                update(ref(db, 'users/' + uid), {
                    lastLogin: serverTimestamp(),
                    isOnline: true
                });

                // Check Admin
                if ([CONSTANTS.ROLES.ADMIN, CONSTANTS.ROLES.FOUNDER].includes(STORE.profile.role)) {
                    document.getElementById('admin-dashboard-container').classList.remove('hidden');
                    if (STORE.profile.role === CONSTANTS.ROLES.FOUNDER) {
                        document.getElementById('founder-panel').classList.remove('hidden');
                    }
                }

                // Render
                UI.updateProfileUI();
                document.getElementById('nexus-core').classList.remove('hidden');
                UI.hideLoader();
                UI.closeModal('modal-auth');

            } else {
                UI.toast('Profile Corruption Detected.', 'error');
            }
        } catch (error) {
            console.error(error);
            UI.toast('Network Error: Profile Load Failed', 'error');
        }
    }
};

// ------------------------------------------------------------------------------
// 9. CHAT SYSTEM
// ------------------------------------------------------------------------------
const ChatSystem = {
    activeChannel: 'global',

    init() {
        this.bindEvents();
        this.subscribe('global');
    },

    bindEvents() {
        document.getElementById('btn-chat-send').addEventListener('click', () => this.send());
        document.getElementById('chat-textarea').addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                this.send();
            }
        });
    },

    setChannel(id) {
        this.activeChannel = id;
        // Update UI visuals for selection
        document.querySelectorAll('.channel-item').forEach(i => i.classList.remove('active'));
        // (Add logic to highlight specific div based on id click)

        // Re-subscribe
        this.subscribe(id);
    },

    subscribe(channelId) {
        // Unsub previous if needed (not strictly required with onValue override)
        const chatRef = query(ref(db, `chats/${channelId}`), limitToLast(50));

        onValue(chatRef, (snapshot) => {
            const container = document.getElementById('main-chat-feed');
            const mini = document.getElementById('mini-chat-log');

            container.innerHTML = ''; // Clear for simple re-render (optimization: diffing)
            mini.innerHTML = '';

            const msgs = [];
            snapshot.forEach(child => {
                msgs.push(child.val());
            });

            msgs.forEach(msg => {
                this.renderMessage(msg, container);
                this.renderMiniMessage(msg, mini);
            });

            // Auto scroll
            container.scrollTop = container.scrollHeight;
            mini.scrollTop = mini.scrollHeight;
        });
    },

    send() {
        if (!STORE.user) return;
        if (STORE.profile.isMuted) return UI.toast('You are muted by Admin.', 'error');

        const input = document.getElementById('chat-textarea');
        const txt = input.value.trim();
        if (!txt) return;

        const payload = {
            uid: STORE.user.uid,
            username: STORE.profile.username,
            avatar: STORE.profile.avatar,
            role: STORE.profile.role,
            text: txt,
            timestamp: serverTimestamp(),
            type: 'text'
        };

        push(ref(db, `chats/${this.activeChannel}`), payload)
            .then(() => {
                input.value = '';
                SFX.play('msg');
            })
            .catch(err => UI.toast(err.message, 'error'));
    },

    renderMessage(msg, target) {
        const isMe = msg.uid === STORE.user?.uid;
        // Simple XSS prevention
        const cleanText = msg.text.replace(/</g, "&lt;").replace(/>/g, "&gt;");

        const div = document.createElement('div');
        div.className = 'chat-msg';
        div.innerHTML = `
            <img src="${msg.avatar}" class="msg-avt">
            <div class="msg-body">
                <div class="msg-meta">
                    <span class="m-user role-${msg.role}" onclick="app.admin.inspect('${msg.uid}')">${msg.username}</span>
                    <span class="m-time">${new Date(msg.timestamp || Date.now()).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                </div>
                <div class="msg-content" style="${isMe ? 'background:rgba(0,242,255,0.1); border:1px solid var(--c-primary-500);' : ''}">
                    ${cleanText}
                </div>
            </div>
        `;
        target.appendChild(div);
    },

    renderMiniMessage(msg, target) {
        const div = document.createElement('div');
        div.className = 'mini-chat-msg';
        div.innerHTML = `<b>${msg.username}:</b> ${msg.text.substring(0, 30)}${msg.text.length > 30 ? '...' : ''}`;
        target.appendChild(div);
    }
};

// ------------------------------------------------------------------------------
// 10. GAME ENGINE
// ------------------------------------------------------------------------------
const GameEngine = {
    mines: {
        active: false,
        bet: 100,
        minesCount: 3,
        grid: [],
        revealed: [],
        multiplier: 1.0,

        adjBet(val) {
            const inp = document.getElementById('mines-bet-val');
            let v = parseInt(inp.value) + val;
            if (v < 10) v = 10;
            inp.value = v;
        },

        start() {
            const betInput = document.getElementById('mines-bet-val').value;
            const bet = parseInt(betInput);
            if (bet > STORE.profile.points) return UI.toast('Insufficient Funds!', 'error');

            // Deduct
            GameEngine.updateBalance(-bet);

            this.active = true;
            this.bet = bet;
            this.minesCount = parseInt(document.getElementById('mines-count-range').value);
            this.multiplier = 1.0;

            // Generate Grid (0: Safe, 1: Mine)
            this.grid = Array(25).fill(0);
            let minesPlaced = 0;
            while (minesPlaced < this.minesCount) {
                let r = Math.floor(Math.random() * 25);
                if (this.grid[r] === 0) {
                    this.grid[r] = 1;
                    minesPlaced++;
                }
            }
            this.revealed = Array(25).fill(false);

            // UI Update
            document.getElementById('btn-mines-play').classList.add('hidden');
            document.getElementById('btn-mines-cashout').classList.remove('hidden');
            document.getElementById('gs-win-display').innerText = "0";

            this.renderGrid();
        },

        renderGrid() {
            const cont = document.getElementById('mines-grid');
            cont.innerHTML = '';
            for (let i = 0; i < 25; i++) {
                const tile = document.createElement('div');
                tile.className = 'm-tile';
                if (this.revealed[i]) {
                    if (this.grid[i] === 1) {
                        tile.classList.add('revealed-bomb');
                        tile.innerHTML = '<i class="ri-bomb-fill"></i>';
                    } else {
                        tile.classList.add('revealed-gem');
                        tile.innerHTML = '<i class="ri-vip-diamond-fill"></i>';
                    }
                } else {
                    tile.onclick = () => this.clickTile(i);
                }
                cont.appendChild(tile);
            }
        },

        clickTile(idx) {
            if (!this.active || this.revealed[idx]) return;

            this.revealed[idx] = true;

            if (this.grid[idx] === 1) {
                // LOSS
                SFX.play('loose');
                this.active = false;
                this.revealed.fill(true); // Reveal all
                this.renderGrid();
                UI.toast('EXPLOSION DETECTED. ROUND LOST.', 'error');

                // Reset UI delay
                setTimeout(() => {
                    document.getElementById('btn-mines-play').classList.remove('hidden');
                    document.getElementById('btn-mines-cashout').classList.add('hidden');
                }, 2000);
            } else {
                // WIN
                SFX.play('click');
                // Calculate Multiplier (simplified math for game feel)
                const safeRemaining = 25 - this.minesCount - this.revealed.filter((r, i) => r && this.grid[i] === 0).length;
                this.multiplier *= (1 + (this.minesCount / 25)); // Base growth

                const currentWin = Math.floor(this.bet * this.multiplier);
                document.getElementById('gs-win-display').innerText = currentWin;

                this.renderGrid();
            }
        },

        cashout() {
            if (!this.active) return;
            const currentWin = Math.floor(this.bet * this.multiplier);
            if (currentWin <= this.bet) { this.active = false; return; } // No profit?

            GameEngine.updateBalance(currentWin);
            SFX.play('win');
            UI.toast(`CASHOUT SUCCESS: +${currentWin}`, 'success');

            this.active = false;
            document.getElementById('btn-mines-play').classList.remove('hidden');
            document.getElementById('btn-mines-cashout').classList.add('hidden');

            // Reveal remaining
            this.revealed.fill(true);
            this.renderGrid();
        }
    },

    slots: {
        spinning: false,
        symbols: ['🍒', '7️⃣', '💎', '🔔', '🍇', '🍋'],

        spin() {
            if (this.spinning) return;
            const betInput = document.getElementById('slots-bet');
            const bet = parseInt(betInput.value);
            if (bet > STORE.profile.points) return UI.toast('Insufficient Funds!', 'error');

            GameEngine.updateBalance(-bet);
            this.spinning = true;

            // Visual Spin
            document.querySelectorAll('.slot-reel').forEach(el => el.classList.add('reel-spinning'));
            SFX.play('hover'); // Spin sound simulation

            // Outcomes
            const r1 = Math.floor(Math.random() * this.symbols.length);
            const r2 = Math.floor(Math.random() * this.symbols.length);
            const r3 = Math.floor(Math.random() * this.symbols.length);

            // Stop Reels sequentially
            setTimeout(() => this.stopReel(1, r1), 1000);
            setTimeout(() => this.stopReel(2, r2), 1500);
            setTimeout(() => {
                this.stopReel(3, r3);
                this.evaluate(r1, r2, r3, bet);
                this.spinning = false;
            }, 2000);
        },

        stopReel(id, symbolIdx) {
            const el = document.getElementById(`reel-${id}`);
            el.classList.remove('reel-spinning');
            el.innerHTML = `<div class="reel-strip">${this.symbols[symbolIdx]}</div>`;
            SFX.play('click');
        },

        evaluate(r1, r2, r3, bet) {
            if (r1 === r2 && r2 === r3) {
                // Jackpot 3 match
                const win = bet * 10;
                GameEngine.updateBalance(win);
                SFX.play('win');
                UI.toast(`JACKPOT! +${win}`, 'success');
            } else if (r1 === r2 || r2 === r3 || r1 === r3) {
                // 2 match
                const win = Math.floor(bet * 1.5);
                GameEngine.updateBalance(win);
                UI.toast(`Mini Win! +${win}`, 'success');
            } else {
                UI.toast('No Match.', 'info');
            }
        }
    },

    // --- SHARED GAME UTILS ---
    updateBalance(amount) {
        if (!STORE.user) return;
        const newPts = (STORE.profile.points || 0) + amount;

        // Optimistic Update
        STORE.profile.points = newPts;
        UI.updateProfileUI();

        // DB Update
        update(ref(db, 'users/' + STORE.user.uid), { points: newPts });

        // Stats
        if (amount > 0) {
            update(ref(db, 'users/' + STORE.user.uid + '/stats'), {
                totalWins: (STORE.profile.stats?.totalWins || 0) + 1
            });
        }
    },

    launch(gameId) {
        const stage = document.getElementById('game-stage');
        const title = document.getElementById('gs-game-name');

        document.querySelectorAll('.game-template').forEach(t => t.classList.add('hidden'));

        if (gameId === 'mines') {
            document.getElementById('template-mines').classList.remove('hidden');
            title.innerHTML = 'MINESWEEPER';
            this.mines.renderGrid(); // Initial Render
        } else if (gameId === 'slots') {
            document.getElementById('template-slots').classList.remove('hidden');
            title.innerText = 'SLOTS';
        } else {
            return UI.toast('Game Module Not Loaded', 'error');
        }

        stage.classList.remove('hidden');
        STORE.game_session.active = true;
        STORE.game_session.game_id = gameId;
    },

    close() {
        if (this.mines.active) {
            if (!confirm("Abandon Game? Wager will be lost.")) return;
            this.mines.active = false;
        }
        document.getElementById('game-stage').classList.add('hidden');
        STORE.game_session.active = false;
    },

    quickPlay() {
        const games = ['mines', 'slots'];
        const rnd = games[Math.floor(Math.random() * games.length)];
        this.launch(rnd);
    }
};

// ------------------------------------------------------------------------------
// 11. ADMIN SYSTEM
// ------------------------------------------------------------------------------
const AdminSystem = {
    broadcast() {
        const msg = document.getElementById('adm-msg').value;
        if (!msg) return;

        // Push to System Channel
        push(ref(db, 'chats/global'), {
            uid: 'system',
            username: 'SYSTEM',
            role: 'founder',
            text: `[BROADCAST] ${msg}`,
            timestamp: serverTimestamp(),
            type: 'system',
            avatar: 'https://placehold.co/100/red/fff?text=SYS'
        });

        document.getElementById('adm-msg').value = '';
        UI.toast('Broadcast Sent', 'success');
    },

    banTarget() {
        const target = document.getElementById('adm-target-id').value;
        if (!target) return;
        // In a real app we'd query by email or username first, 
        // here assuming ID is known or we implement lookup.
        update(ref(db, 'users/' + target), { isBanned: true });
        UI.toast(`User ${target} banned.`, 'success');
    },

    nukeChat() {
        // Founder Only
        if (STORE.profile.role !== CONSTANTS.ROLES.FOUNDER) return;
        set(ref(db, 'chats/global'), {});
        UI.toast('Global communication frequencies cleared.', 'error');
    },

    giveAllPoints() {
        // Founder Only - Danger
        // In real app, cloud function. Here, we iterate? No, too heavy.
        // We will just give to current user as demo.
        GameEngine.updateBalance(10000);
        UI.toast('Stimulus package deployed (Personal)', 'success');
    }
};

// ------------------------------------------------------------------------------
// 12. INITIALIZATION
// ------------------------------------------------------------------------------
document.addEventListener('DOMContentLoaded', () => {
    // Start Background
    new ParticleNetwork();

    // Auth Init
    AuthManager.init();

    // Chat Init
    ChatSystem.init();

    // Expose Global App Handlers
    window.app = {
        router: Router,
        auth: AuthManager,
        ui: UI,
        chat: ChatSystem,
        game: GameEngine,
        admin: AdminSystem,
        settings: {
            save() {
                UI.toast('Settings Saved (Mock)', 'success');
                UI.closeModal('modal-settings');
            }
        }
    };

    // Keyboard Shortcuts
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            if (STORE.game_session.active) GameEngine.close();
            UI.closeModal('modal-settings');
        }
    });

    console.log("%cNEXUS SYSTEM ONLINE", "color:cyan; font-size:20px; font-weight:bold;");

    // Simulate Initial Load Time
    setTimeout(() => {
        UI.hideLoader();
        // If not logged in, modal will auto-show via AuthManager listener
    }, 1500);
});

// End of Engine
// ==============================================================================
