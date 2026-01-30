
/* ==========================================================================
   NEXUS CORE ENGINE
   Handles Auth, Routing, Roles, Chat, and Game Logic
   ========================================================================== */

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { getAuth, onAuthStateChanged, signInWithEmailAndPassword, createUserWithEmailAndPassword, signOut, updateProfile }
    from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import { getDatabase, ref, set, get, update, push, onValue, serverTimestamp, query, limitToLast }
    from "https://www.gstatic.com/firebasejs/10.7.1/firebase-database.js";

// --- FIREBASE CONFIG ---
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

const fbApp = initializeApp(firebaseConfig);
const auth = getAuth(fbApp);
const db = getDatabase(fbApp);

/* ==========================================================================
   STATE MANAGEMENT
   ========================================================================== */
const STATE = {
    user: null,          // Firebase Auth User
    profile: null,       // DB User Data
    currentView: 'home',
    audio: {
        click: document.getElementById('sfx-click'),
        success: document.getElementById('sfx-success'),
        error: document.getElementById('sfx-error'),
        msg: document.getElementById('sfx-msg')
    }
};

/* ==========================================================================
   MODULES
   ========================================================================== */

// --- ROUTER ---
const Router = {
    go(viewId) {
        // Hide all views
        document.querySelectorAll('.view').forEach(el => el.classList.remove('active'));
        // Show target
        const target = document.getElementById(`view-${viewId}`);
        if (target) target.classList.add('active');

        // Update Nav State (Desktop & Mobile)
        document.querySelectorAll('.nav-btn, .mob-link').forEach(el => el.classList.remove('active'));

        // Find links targeting this view
        const links = document.querySelectorAll(`[onclick="app.router.go('${viewId}')"]`);
        links.forEach(l => l.classList.add('active'));

        STATE.currentView = viewId;
        Utils.playSound('click');

        // Specific Loaders
        if (viewId === 'chat') Chat.scrollToBottom();
    }
};

// --- AUTH SYSTEM ---
const Auth = {
    init() {
        onAuthStateChanged(auth, async (user) => {
            if (user) {
                console.log("Logged in:", user.uid);
                STATE.user = user;
                await this.loadProfile(user.uid);
            } else {
                console.log("Logged out");
                STATE.user = null;
                STATE.profile = null;
                UI.showAuth();
            }
        });

        this.bindEvents();
    },

    bindEvents() {
        // Toggle Login/Reg
        document.querySelectorAll('.switch-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                document.querySelectorAll('.switch-btn').forEach(b => b.classList.remove('active'));
                e.target.classList.add('active');

                document.querySelectorAll('.auth-form').forEach(f => f.classList.remove('active'));
                const target = e.target.dataset.target; // login or register
                document.getElementById(`form-${target}`).classList.add('active');
            });
        });

        // Login Submit
        document.getElementById('form-login').addEventListener('submit', async (e) => {
            e.preventDefault();
            const email = document.getElementById('login-email').value;
            const pass = document.getElementById('login-pass').value;

            try {
                await signInWithEmailAndPassword(auth, email, pass);
                // Listener handles rest
            } catch (err) {
                Utils.toast(err.message, 'error');
            }
        });

        // Register Submit
        document.getElementById('form-register').addEventListener('submit', async (e) => {
            e.preventDefault();
            const email = document.getElementById('reg-email').value;
            const pass = document.getElementById('reg-pass').value;
            const username = document.getElementById('reg-user').value;

            try {
                const cred = await createUserWithEmailAndPassword(auth, email, pass);
                // Create DB Profile
                const newUser = {
                    username: username,
                    email: email,
                    role: 'member', // Default
                    xp: 0,
                    level: 1,
                    points: 100,
                    avatar: `https://ui-avatars.com/api/?name=${username}&background=random`,
                    createdAt: serverTimestamp()
                };
                await set(ref(db, 'users/' + cred.user.uid), newUser);
                await updateProfile(cred.user, { displayName: username });

                Utils.toast("Hesap oluşturuldu!", 'success');
            } catch (err) {
                Utils.toast(err.message, 'error');
            }
        });
    },

    async loadProfile(uid) {
        // Show Loader
        document.getElementById('app-loader').style.display = 'flex';

        try {
            const snap = await get(ref(db, 'users/' + uid));
            if (snap.exists()) {
                STATE.profile = snap.val();
                STATE.profile.uid = uid;

                // Update Last Login
                update(ref(db, 'users/' + uid), { lastLogin: serverTimestamp(), isOnline: true });

                UI.renderApp();
            } else {
                // Fallback if DB missing
                STATE.profile = { username: "Ghost", role: "member", points: 0, avatar: "" };
                UI.renderApp();
            }
        } catch (e) {
            console.error(e);
            Utils.toast("Profil yüklenemedi", 'error');
        }

        document.getElementById('app-loader').style.display = 'none';
    },

    logout() {
        if (STATE.user) {
            update(ref(db, 'users/' + STATE.user.uid), { isOnline: false });
        }
        signOut(auth);
    }
};

// --- CHAT SYSTEM ---
const Chat = {
    channel: 'global',

    init() {
        // Listen to Global Chat
        const chatRef = query(ref(db, 'chats/global'), limitToLast(50));
        onValue(chatRef, (snap) => {
            const data = snap.val();
            const feed = document.getElementById('chat-feed');
            const mini = document.getElementById('mini-chat-stream');

            feed.innerHTML = '';
            mini.innerHTML = '';

            if (!data) return;

            Object.values(data).forEach(msg => {
                this.renderMsg(msg, feed, false);
                this.renderMsg(msg, mini, true);
            });

            this.scrollToBottom();
        });

        // Send
        document.getElementById('chat-form').addEventListener('submit', (e) => {
            e.preventDefault();
            const inp = document.getElementById('msg-input');
            const text = inp.value.trim();
            if (!text) return;

            if (STATE.profile.isMuted) {
                Utils.toast("Sessize alındınız!", 'error');
                return;
            }

            push(ref(db, 'chats/global'), {
                uid: STATE.user.uid,
                username: STATE.profile.username,
                text: text,
                role: STATE.profile.role,
                avatar: STATE.profile.avatar,
                timestamp: serverTimestamp()
            });

            inp.value = '';
        });
    },

    renderMsg(msg, container, isMini) {
        const isMe = msg.uid === STATE.user?.uid;

        if (isMini) {
            const el = document.createElement('div');
            el.className = 'mini-msg';
            el.innerHTML = `<b>${msg.username}:</b> ${msg.text}`;
            container.appendChild(el);
        } else {
            const el = document.createElement('div');
            el.className = `msg-line ${isMe ? 'mine' : ''} role-${msg.role}`;

            let badgeHTML = '';
            if (msg.role === 'admin') badgeHTML = '🛡️';
            if (msg.role === 'founder') badgeHTML = '👑';

            el.innerHTML = `
                <img src="${msg.avatar}" class="u-avatar" style="width:30px;height:30px;">
                <div class="msg-content">
                    <div class="msg-header">${badgeHTML} ${msg.username}</div>
                    ${msg.text}
                </div>
            `;
            container.appendChild(el);
        }
    },

    scrollToBottom() {
        const feed = document.getElementById('chat-feed');
        feed.scrollTop = feed.scrollHeight;
    },

    switchTab(tab) {
        document.querySelectorAll('.btn-tab').forEach(b => b.classList.remove('active'));
        if (tab === 'dm') Utils.toast("DM Özelliği yakında aktif!", 'info');
        // Logic to switch view would go here
    }
};

// --- BACKGROUND ANIMATION (NEW) ---
const BgAnimation = {
    canvas: null,
    ctx: null,
    particles: [],

    init() {
        this.canvas = document.getElementById('bg-canvas');
        if (!this.canvas) return;
        this.ctx = this.canvas.getContext('2d');
        this.resize();
        window.addEventListener('resize', () => this.resize());

        // create particles
        for (let i = 0; i < 50; i++) {
            this.particles.push({
                x: Math.random() * this.canvas.width,
                y: Math.random() * this.canvas.height,
                vx: (Math.random() - 0.5) * 0.5,
                vy: (Math.random() - 0.5) * 0.5,
                size: Math.random() * 2 + 1,
                alpha: Math.random() * 0.5 + 0.1
            });
        }
        this.animate();
    },

    resize() {
        this.canvas.width = window.innerWidth;
        this.canvas.height = window.innerHeight;
    },

    animate() {
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

        this.particles.forEach(p => {
            p.x += p.vx;
            p.y += p.vy;

            if (p.x < 0) p.x = this.canvas.width;
            if (p.x > this.canvas.width) p.x = 0;
            if (p.y < 0) p.y = this.canvas.height;
            if (p.y > this.canvas.height) p.y = 0;

            this.ctx.fillStyle = `rgba(0, 242, 255, ${p.alpha})`;
            this.ctx.beginPath();
            this.ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
            this.ctx.fill();

            // Connect near particles
            this.particles.forEach(p2 => {
                const dx = p.x - p2.x;
                const dy = p.y - p2.y;
                const dist = Math.sqrt(dx * dx + dy * dy);
                if (dist < 100) {
                    this.ctx.strokeStyle = `rgba(112, 0, 255, ${0.1 - dist / 1000})`;
                    this.ctx.lineWidth = 0.5;
                    this.ctx.beginPath();
                    this.ctx.moveTo(p.x, p.y);
                    this.ctx.lineTo(p2.x, p2.y);
                    this.ctx.stroke();
                }
            });
        });

        requestAnimationFrame(() => this.animate());
    }
};

// --- GAME SYSTEM ---
const Game = {
    activeGame: null,
    minesState: { active: false, bet: 0, mines: 3, revealed: [], grid: [], multiplier: 1.0 },

    launch(gameId) {
        STATE.activeGame = gameId;
        const overlay = document.getElementById('game-overlay');
        const frame = document.getElementById('game-frame');
        const title = document.getElementById('active-game-title');

        overlay.classList.remove('hidden');
        setTimeout(() => overlay.classList.add('active'), 10);
        title.textContent = gameId.toUpperCase();

        frame.innerHTML = '';

        // GAME ROUTING
        if (gameId === 'mines') {
            this.renderMinesSetup(frame);
        } else if (gameId === 'rps') {
            this.renderRPS(frame);
        } else {
            frame.innerHTML = `<h1 class="neon-text-blue">${gameId} Yakında!</h1><p>Demo Modu</p>`;
        }
    },

    close() {
        if (this.minesState.active) {
            if (!confirm("Oyun devam ediyor! Çıkarsan kaybedersin.")) return;
            this.minesState.active = false;
        }
        const overlay = document.getElementById('game-overlay');
        overlay.classList.remove('active');
        setTimeout(() => overlay.classList.add('hidden'), 300);
        STATE.activeGame = null;
    },

    // --- MINES GAME LOGIC ---
    renderMinesSetup(container) {
        if (!STATE.profile) return;

        container.innerHTML = `
            <div class="mines-interface">
                <div class="mines-sidebar glass">
                    <div class="control-group">
                        <label>Bahis Miktarı</label>
                        <input type="number" id="mines-bet" value="100" min="10" max="${STATE.profile.points}">
                    </div>
                    <div class="control-group">
                        <label>Mayın Sayısı (1-24)</label>
                        <input type="number" id="mines-count" value="3" min="1" max="24">
                    </div>
                    <div style="margin-top:20px;">
                        <div style="color:var(--c-text-muted); font-size:0.9rem;">Sonraki Çarpan: <span id="mines-next-mult" style="color:#fff;">1.13x</span></div>
                        <button id="btn-mines-start" class="btn btn-primary btn-block" onclick="app.game.startMines()">OYUNA BAŞLA</button>
                        <button id="btn-mines-cashout" class="btn btn-success btn-block hidden" onclick="app.game.cashoutMines()">NAKİT ÇEK (<span id="cashout-val">0</span>)</button>
                    </div>
                </div>
                <div class="mines-grid" id="mines-grid-area">
                    ${Array(25).fill('<div class="mine-tile"></div>').join('')}
                </div>
            </div>
        `;
    },

    startMines() {
        const bet = parseInt(document.getElementById('mines-bet').value);
        const mines = parseInt(document.getElementById('mines-count').value);

        if (bet > STATE.profile.points) { Utils.toast("Yetersiz bakiye!", 'error'); return; }
        if (mines < 1 || mines > 24) { Utils.toast("Geçersiz mayın sayısı.", 'error'); return; }

        // Deduct bet
        this.reward(-bet);

        this.minesState = {
            active: true,
            bet: bet,
            minesCount: mines,
            grid: this.generateMinesGrid(mines), // 0: safe, 1: bomb
            revealed: Array(25).fill(false),
            multiplier: 1.0,
            step: 0
        };

        // UI Updates
        document.getElementById('btn-mines-start').classList.add('hidden');
        document.getElementById('btn-mines-cashout').classList.remove('hidden');
        document.getElementById('cashout-val').textContent = bet;

        this.renderMinesGrid();
    },

    generateMinesGrid(count) {
        let arr = Array(25).fill(0);
        let placed = 0;
        while (placed < count) {
            let idx = Math.floor(Math.random() * 25);
            if (arr[idx] === 0) {
                arr[idx] = 1;
                placed++;
            }
        }
        return arr;
    },

    renderMinesGrid() {
        const area = document.getElementById('mines-grid-area');
        area.innerHTML = '';

        this.minesState.grid.forEach((val, idx) => {
            const tile = document.createElement('div');
            tile.className = 'mine-tile';
            if (this.minesState.revealed[idx]) {
                tile.classList.add('revealed');
                if (val === 1) {
                    tile.classList.add('bomb');
                    tile.innerHTML = '💣';
                } else {
                    tile.classList.add('gem');
                    tile.innerHTML = '💎';
                }
            } else {
                tile.onclick = () => this.clickMineTile(idx);
            }
            area.appendChild(tile);
        });
    },

    clickMineTile(idx) {
        if (!this.minesState.active) return;

        // Reveal
        this.minesState.revealed[idx] = true;

        if (this.minesState.grid[idx] === 1) {
            // BOMB
            Utils.playSound('error');
            this.minesState.active = false;
            // Reveal all
            this.minesState.revealed = this.minesState.grid.map(() => true);
            this.renderMinesGrid();
            Utils.toast("MAYINA BASTIN! Kaybettin.", 'error');
            document.getElementById('btn-mines-cashout').textContent = "KAYBETTİN";
            document.getElementById('btn-mines-cashout').disabled = true;
            setTimeout(() => this.renderMinesSetup(document.getElementById('game-frame')), 2500);
        } else {
            // GEM
            Utils.playSound('success');
            this.minesState.step++;
            this.calculateMultiplier();
            this.renderMinesGrid();
        }
    },

    calculateMultiplier() {
        // Simple multiplier logic based on probability
        const risk = 1 + (this.minesState.minesCount / 25);
        this.minesState.multiplier *= (risk + 0.05); // slightly generous

        const currentWin = Math.floor(this.minesState.bet * this.minesState.multiplier);

        document.getElementById('cashout-val').textContent = currentWin;
        document.getElementById('mines-next-mult').textContent = (this.minesState.multiplier * (risk + 0.05)).toFixed(2) + 'x';
    },

    cashoutMines() {
        if (!this.minesState.active) return;
        const win = Math.floor(this.minesState.bet * this.minesState.multiplier);
        this.reward(win);
        this.minesState.active = false;

        // Show Win Screen
        const frame = document.getElementById('game-frame');
        const overlay = document.createElement('div');
        overlay.className = 'win-overlay';
        overlay.innerHTML = `
            <h2 style="color:#fff;">KAZANDIN!</h2>
            <div class="win-amount">+${win}</div>
        `;
        frame.appendChild(overlay);
        Utils.playSound('success');

        setTimeout(() => this.renderMinesSetup(frame), 2500);
    },

    // --- RPS LOGIC ---
    renderRPS(frame) {
        frame.innerHTML = `
            <div style="text-align:center;">
                <h1>TAŞ KAĞIT MAKAS</h1>
                <div style="font-size:3rem; margin:30px; letter-spacing:20px;">✊✋✌️</div>
                <div style="display:flex; gap:10px; justify-content:center;">
                    <button class="btn btn-primary" onclick="app.game.playRPS('r')">TAŞ</button>
                    <button class="btn btn-primary" onclick="app.game.playRPS('p')">KAĞIT</button>
                    <button class="btn btn-primary" onclick="app.game.playRPS('s')">MAKAS</button>
                </div>
                <div id="rps-result" style="margin-top:30px; font-weight:bold; font-size:1.2rem; min-height:30px; color:var(--c-primary);">Seçimini yap...</div>
            </div>
        `;
    },

    playRPS(choice) {
        const opts = ['r', 'p', 's'];
        const cpu = opts[Math.floor(Math.random() * 3)];
        const map = { r: '✊', p: '✋', s: '✌️' };

        const resEl = document.getElementById('rps-result');
        resEl.textContent = "Rakip seçiyor...";

        setTimeout(() => {
            if (choice === cpu) {
                resEl.textContent = `BERABERE! Sen: ${map[choice]} | PC: ${map[cpu]}`;
                resEl.style.color = '#fff';
            } else if (
                (choice === 'r' && cpu === 's') ||
                (choice === 'p' && cpu === 'r') ||
                (choice === 's' && cpu === 'p')
            ) {
                resEl.textContent = `KAZANDIN! Sen: ${map[choice]} | PC: ${map[cpu]}`;
                resEl.style.color = 'var(--c-success)';
                this.reward(50);
            } else {
                resEl.textContent = `KAYBETTİN... Sen: ${map[choice]} | PC: ${map[cpu]}`;
                resEl.style.color = 'var(--c-danger)';
                Utils.playSound('error');
            }
        }, 300);
    },

    reward(amount) {
        if (!STATE.user) return;
        const newPts = (STATE.profile.points || 0) + amount;
        update(ref(db, 'users/' + STATE.user.uid), { points: newPts });
        STATE.profile.points = newPts;
        if (amount > 0) Utils.toast(`+${amount} Puan!`, 'success');
        UI.updateStats();
    },

    claimDaily() {
        const btn = document.getElementById('btn-claim-reward');
        if (!btn || btn.disabled) return;
        btn.disabled = true;
        btn.textContent = "Alındı";
        this.reward(50);
    }
};

// --- ADMIN SYSTEM ---
const Admin = {
    check() {
        if (!STATE.profile) return false;
        return ['admin', 'founder'].includes(STATE.profile.role);
    },

    banUser() {
        const id = document.getElementById('adm-user-id').value;
        if (id) {
            update(ref(db, 'users/' + id), { isBanned: true }); // Mock logic as we can't auth-ban easily
            Utils.toast("Kullanıcı yasaklandı.", 'success');
        }
    },

    nukeChat() {
        if (STATE.profile.role !== 'founder') return;
        set(ref(db, 'chats/global'), {});
        Utils.toast("Sohbet temizlendi.", 'warning');
    },

    addMoneyAll() {
        Utils.toast("Tüm kullanıcılara puan dağıtıldı!", 'success');
    }
};

// --- UI MANAGER ---
const UI = {
    showAuth() {
        document.getElementById('auth-screen').classList.remove('hidden');
        document.getElementById('app-structure').classList.add('hidden');
    },

    renderApp() {
        // Hide Auth
        document.getElementById('auth-screen').classList.add('hidden');
        document.getElementById('app-structure').classList.remove('hidden');

        // Fill Data
        this.updateStats();

        document.getElementById('header-avatar').src = STATE.profile.avatar;
        document.getElementById('p-avatar').src = STATE.profile.avatar;
        document.querySelectorAll('.u-name').forEach(el => el.textContent = STATE.profile.username);

        // Role Badges
        const role = STATE.profile.role.toUpperCase();
        document.getElementById('role-badge').textContent = role;
        document.getElementById('p-role-badge').textContent = role;

        // Show Admin Panel Logic
        if (['admin', 'founder'].includes(STATE.profile.role)) {
            document.getElementById('admin-panel').classList.remove('hidden');
            if (STATE.profile.role === 'founder') {
                document.getElementById('founder-controls').classList.remove('hidden');
            }
        }

        // Greeting
        const homeUser = document.getElementById('home-user');
        if (homeUser) homeUser.textContent = STATE.profile.username;

        // Populate Leaderboard (Mock)
        const lb = document.getElementById('home-leaderboard');
        lb.innerHTML = '';
        for (let i = 1; i <= 5; i++) {
            lb.innerHTML += `
                <div style="display:flex; justify-content:space-between; padding:10px; border-bottom:1px solid rgba(255,255,255,0.1);">
                    <span>${i}. Oyuncu_${Math.floor(Math.random() * 1000)}</span>
                    <span style="color:gold">${1000 - i * 50} Puan</span>
                </div>
             `;
        }
    },

    updateStats() {
        if (!STATE.profile) return;
        Utils.setText('p-points', STATE.profile.points);
        Utils.setText('p-xp', STATE.profile.xp);
        Utils.setText('p-lvl', STATE.profile.level);
    }
};

// --- UTILS ---
const Utils = {
    toast(msg, type = 'info') {
        const c = document.getElementById('toast-container');
        const t = document.createElement('div');
        t.className = 'toast';
        t.style.background = type === 'error' ? 'var(--c-danger)' : 'var(--c-glass-border)';
        t.style.padding = '15px';
        t.style.marginBottom = '10px';
        t.style.backdropFilter = 'blur(10px)';
        t.style.border = '1px solid rgba(255,255,255,0.2)';
        t.textContent = msg;
        c.appendChild(t);
        setTimeout(() => t.remove(), 3000);

        this.playSound(type === 'error' ? 'error' : 'success');
    },

    playSound(key) {
        if (STATE.audio[key]) STATE.audio[key].play().catch(e => { });
    },

    setText(id, val) {
        const el = document.getElementById(id);
        if (el) el.textContent = val;
    }
};

// --- INIT ---
document.addEventListener('DOMContentLoaded', () => {
    Auth.init();
    Chat.init();
    BgAnimation.init(); // START ANIMATION

    // Check initial user null
    setTimeout(() => {
        if (!STATE.user) {
            UI.showAuth();
            document.getElementById('app-loader').style.display = 'none';
        }
    }, 1500);
});

// EXPOSE TO WINDOW
window.app = {
    router: Router,
    auth: Auth,
    game: Game,
    chat: Chat,
    admin: Admin,
    ui: UI
};
