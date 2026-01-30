import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import {
    getAuth, onAuthStateChanged, signInWithEmailAndPassword,
    createUserWithEmailAndPassword, signOut, updateProfile,
    sendPasswordResetEmail, GoogleAuthProvider
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import {
    getDatabase, ref, set, get, update, push, onValue, remove,
    serverTimestamp, query, limitToLast, orderByChild, startAt, onDisconnect
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-database.js";

const CONFIG = {
    FIREBASE: {
        apiKey: "AIzaSyDyGNrzw1a55LHv-LP5gjuPpFWmHu1a6yU",
        authDomain: "ali23-cfd02.firebaseapp.com",
        databaseURL: "https://ali23-cfd02-default-rtdb.europe-west1.firebasedatabase.app",
        projectId: "ali23-cfd02",
        storageBucket: "ali23-cfd02.firebasestorage.app",
        messagingSenderId: "759021285078",
        appId: "1:759021285078:web:f7673f89125ff3dad66377"
    },
    GAME: {
        START_CREDITS: 1000,
        DAILY_BONUS: 500,
        LEVEL_XP_BASE: 1000,
        XP_MULTIPLIER: 1.25,
        MAX_LEVEL: 100
    },
    SYSTEM: {
        VERSION: '6.0.1-PATCH',
        ENV: 'PROD',
        MAINTENANCE: false,
        DEBUG: true
    }
};

const app = initializeApp(CONFIG.FIREBASE);
const auth = getAuth(app);
const db = getDatabase(app);

class DOMHelper {
    static get(id) {
        const el = document.getElementById(id);
        if (!el && CONFIG.SYSTEM.DEBUG) {
            console.warn(`[DOM] Element not found: #${id}`);
        }
        return el;
    }

    static setHTML(id, html) {
        const el = this.get(id);
        if (el) el.innerHTML = html;
    }

    static setText(id, text) {
        const el = this.get(id);
        if (el) el.innerText = text;
    }

    static on(id, event, handler) {
        const el = this.get(id);
        if (el) el.addEventListener(event, handler);
    }

    static show(id) {
        const el = this.get(id);
        if (el) el.classList.remove('hidden');
    }

    static hide(id) {
        const el = this.get(id);
        if (el) el.classList.add('hidden');
    }

    static val(id) {
        const el = this.get(id);
        return el ? el.value : '';
    }
}

class StateManager {
    constructor() {
        this.state = {
            user: null,
            profile: null,
            settings: this._loadSettings(),
            activeView: 'dashboard',
            activeModal: null,
            overlayGame: null,
            notifications: [],
            chat: {
                channels: ['global', 'trade', 'support'],
                activeChannel: 'global',
                history: []
            },
            market: {
                items: [],
                cart: []
            },
            onlineUsers: {},
            systemStatus: 'online'
        };
        this.subscribers = new Set();
    }

    _loadSettings() {
        const saved = localStorage.getItem('nexus_settings');
        return saved ? JSON.parse(saved) : {
            audio: { master: 0.5, sfx: true, music: false },
            graphics: { quality: 'high', particles: true, animations: true },
            theme: { color: 'cyan', mode: 'dark' },
            privacy: { showLevel: true, showInventory: true }
        }
    }

    saveSettings() {
        localStorage.setItem('nexus_settings', JSON.stringify(this.state.settings));
        this.notify('settings');
    }

    commit(key, value) {
        this.state[key] = value;
        this.notify(key);
    }

    get(key) {
        return this.state[key];
    }

    subscribe(callback) {
        this.subscribers.add(callback);
    }

    notify(key) {
        this.subscribers.forEach(cb => cb(this.state, key));
    }
}

const Store = new StateManager();

class AudioEngine {
    constructor() {
        this.ctx = new (window.AudioContext || window.webkitAudioContext)();
        this.masterGain = this.ctx.createGain();
        this.masterGain.connect(this.ctx.destination);
        this.updateVolume();

        this.buffers = {};
        this.enabled = Store.get('settings').audio.sfx;
    }

    updateVolume() {
        this.masterGain.gain.value = Store.get('settings').audio.master;
    }

    playTone(freq, type = 'sine', duration = 0.1, vol = 0.1, slide = 0) {
        if (!this.enabled || this.ctx.state === 'suspended') this.ctx.resume();

        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();

        osc.connect(gain);
        gain.connect(this.masterGain);

        osc.type = type;
        osc.frequency.setValueAtTime(freq, this.ctx.currentTime);
        if (slide !== 0) {
            osc.frequency.exponentialRampToValueAtTime(freq + slide, this.ctx.currentTime + duration);
        }

        gain.gain.setValueAtTime(vol, this.ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + duration);

        osc.start();
        osc.stop(this.ctx.currentTime + duration);
    }

    sfx = {
        click: () => this.playTone(800, 'sine', 0.05, 0.05),
        hover: () => this.playTone(400, 'triangle', 0.03, 0.02),
        success: () => {
            this.playTone(440, 'triangle', 0.1, 0.1);
            setTimeout(() => this.playTone(554.37, 'triangle', 0.1, 0.1), 100);
        },
        error: () => {
            this.playTone(150, 'sawtooth', 0.2, 0.2, -50);
        },
        win: () => {
            [0, 100, 200, 300].forEach((t, i) => {
                setTimeout(() => {
                    this.playTone(440 + (i * 100), 'square', 0.2, 0.1);
                }, t);
            });
        },
        spin: () => {
            const now = this.ctx.currentTime;
            const osc = this.ctx.createOscillator();
            const gain = this.ctx.createGain();
            osc.connect(gain);
            gain.connect(this.masterGain);
            osc.frequency.setValueAtTime(200, now);
            osc.frequency.linearRampToValueAtTime(800, now + 1);
            gain.gain.value = 0.05;
            osc.start();
            osc.stop(now + 0.1);
        },
        explosion: () => {
            const bufferSize = this.ctx.sampleRate * 0.5;
            const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
            const data = buffer.getChannelData(0);
            for (let i = 0; i < bufferSize; i++) data[i] = Math.random() * 2 - 1;

            const noise = this.ctx.createBufferSource();
            noise.buffer = buffer;
            const filter = this.ctx.createBiquadFilter();
            filter.type = 'lowpass';
            filter.frequency.value = 1000;

            const gain = this.ctx.createGain();
            gain.gain.setValueAtTime(0.5, this.ctx.currentTime);
            gain.gain.exponentialRampToValueAtTime(0.01, this.ctx.currentTime + 0.5);

            noise.connect(filter);
            filter.connect(gain);
            gain.connect(this.masterGain);
            noise.start();
        }
    }
}

const AudioFX = new AudioEngine();

class ParticleSystem {
    constructor(canvasId) {
        this.canvas = document.getElementById(canvasId);
        if (!this.canvas) return;
        this.ctx = this.canvas.getContext('2d');
        this.particles = [];
        this.mouse = { x: 0, y: 0, active: false };
        this.config = { count: 80, color: '#00f2ff', linkDist: 150 };

        this.resize();
        window.addEventListener('resize', () => this.resize());
        window.addEventListener('mousemove', (e) => this.mouseMove(e));

        if (Store.get('settings').graphics.particles) {
            this.init();
            this.animate();
        }
    }

    resize() {
        this.w = this.canvas.width = window.innerWidth;
        this.h = this.canvas.height = window.innerHeight;
    }

    mouseMove(e) {
        this.mouse.x = e.clientX;
        this.mouse.y = e.clientY;
        this.mouse.active = true;
    }

    init() {
        for (let i = 0; i < this.config.count; i++) {
            this.particles.push({
                x: Math.random() * this.w,
                y: Math.random() * this.h,
                vx: (Math.random() - 0.5) * 0.5,
                vy: (Math.random() - 0.5) * 0.5,
                size: Math.random() * 2
            });
        }
    }

    animate() {
        this.ctx.clearRect(0, 0, this.w, this.h);

        for (let i = 0; i < this.particles.length; i++) {
            let p = this.particles[i];

            p.x += p.vx;
            p.y += p.vy;

            if (p.x < 0 || p.x > this.w) p.vx *= -1;
            if (p.y < 0 || p.y > this.h) p.vy *= -1;

            if (this.mouse.active) {
                let dx = this.mouse.x - p.x;
                let dy = this.mouse.y - p.y;
                let dist = Math.sqrt(dx * dx + dy * dy);
                if (dist < 200) {
                    p.vx += dx * 0.0001;
                    p.vy += dy * 0.0001;
                }
            }

            this.ctx.fillStyle = `rgba(0, 242, 255, ${0.5})`;
            this.ctx.beginPath();
            this.ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
            this.ctx.fill();

            for (let j = i + 1; j < this.particles.length; j++) {
                let p2 = this.particles[j];
                let dx = p.x - p2.x;
                let dy = p.y - p2.y;
                let dist = Math.sqrt(dx * dx + dy * dy);

                if (dist < this.config.linkDist) {
                    this.ctx.strokeStyle = `rgba(0, 242, 255, ${0.1 * (1 - dist / this.config.linkDist)})`;
                    this.ctx.beginPath();
                    this.ctx.moveTo(p.x, p.y);
                    this.ctx.lineTo(p2.x, p2.y);
                    this.ctx.stroke();
                }
            }
        }
        requestAnimationFrame(() => this.animate());
    }
}

const UI = {
    toast(msg, type = 'info', duration = 3000) {
        let container = document.getElementById('toast-wrapper');
        if (!container) container = this.createToastWrapper();

        const el = document.createElement('div');
        el.className = `toast toast-${type}`;
        el.innerHTML = `
            <div class="flex items-center gap-3">
                <i class="ri-${type === 'success' ? 'checkbox-circle' : type === 'error' ? 'error-warning' : 'information'}-fill text-xl"></i>
                <span class="font-mono text-sm">${msg}</span>
            </div>
        `;
        container.appendChild(el);

        requestAnimationFrame(() => el.classList.add('show'));

        if (type === 'error') AudioFX.sfx.error();
        else if (type === 'success') AudioFX.sfx.success();
        else AudioFX.sfx.click();

        setTimeout(() => {
            el.classList.remove('show');
            setTimeout(() => el.remove(), 300);
        }, duration);
    },

    createToastWrapper() {
        const div = document.createElement('div');
        div.id = 'toast-wrapper';
        div.className = 'fixed top-5 right-5 z-[5000] flex flex-col gap-2 pointer-events-none';
        document.body.appendChild(div);
        return div;
    },

    modal: {
        open(id) {
            const m = DOMHelper.get(id);
            if (m) {
                m.classList.add('active');
                Store.commit('activeModal', id);
                AudioFX.sfx.hover();
            }
        },
        close(id) {
            const m = DOMHelper.get(id);
            if (m) {
                m.classList.remove('active');
                Store.commit('activeModal', null);
            }
        },
        toggle(id) {
            const m = DOMHelper.get(id);
            if (m) {
                if (m.classList.contains('active')) this.close(id);
                else this.open(id);
            }
        }
    },

    formatNumber(num) {
        return new Intl.NumberFormat('tr-TR').format(Math.floor(num || 0));
    },

    updateDOM() {
        const p = Store.get('profile');
        if (!p) return;

        DOMHelper.setText('header-balance', this.formatNumber(p.points));
        DOMHelper.setText('header-lvl', `LVL ${p.level}`);

        DOMHelper.setText('sb-username', p.username);
        DOMHelper.setText('sb-level', `LVL ${p.level}`);

        const sbImg = DOMHelper.get('sb-avatar');
        if (sbImg) sbImg.src = p.avatar || `https://ui-avatars.com/api/?name=${p.username}&background=random`;

        if (Store.get('activeView') === 'dashboard') {
            DOMHelper.setText('dash-username', p.username);
            DOMHelper.setText('dash-wins', this.formatNumber(p.points));
            DOMHelper.setText('dash-games', p.stats?.games || 0);
        }

        if (Store.get('activeView') === 'profile') {
            DOMHelper.setText('pf-name', p.username);
            DOMHelper.setText('pf-id', `ID: ${p.uid.substring(0, 8)}`);
            DOMHelper.setText('pf-lvl', p.level);
            DOMHelper.setText('pf-stat-games', this.formatNumber(p.stats?.games || 0));
            DOMHelper.setText('pf-stat-high', this.formatNumber(p.stats?.maxWin || 0));

            const pfImg = DOMHelper.get('pf-avatar');
            if (pfImg) pfImg.src = p.avatar || `https://ui-avatars.com/api/?name=${p.username}&background=random&size=128`;
        }
    }
};

const Auth = {
    init() {
        onAuthStateChanged(auth, (user) => {
            if (user) {
                Store.commit('user', user);
                this.loadProfile(user.uid);
                UI.modal.close('auth-modal');
            } else {
                Store.commit('user', null);
                UI.modal.open('auth-modal');
            }
        });

        const form = DOMHelper.get('form-login');
        if (form) {
            form.addEventListener('submit', (e) => {
                e.preventDefault();
                this.login(
                    DOMHelper.val('login-email'),
                    DOMHelper.val('login-pass')
                );
            });
        }
    },

    async login(email, pass) {
        try {
            await signInWithEmailAndPassword(auth, email, pass);
            UI.toast('Giriş Başarılı', 'success');
        } catch (error) {
            if (error.code === 'auth/user-not-found' || error.code === 'auth/invalid-credential') {
                this.register(email, pass);
            } else {
                UI.toast(error.message, 'error');
            }
        }
    },

    async register(email, pass) {
        try {
            const cred = await createUserWithEmailAndPassword(auth, email, pass);
            await this.createProfile(cred.user, email.split('@')[0]);
            UI.toast('Hesap Oluşturuldu', 'success');
        } catch (error) {
            UI.toast(error.message, 'error');
        }
    },

    async createProfile(user, username) {
        const profile = {
            uid: user.uid,
            username: username,
            email: user.email,
            role: 'member',
            points: CONFIG.GAME.START_CREDITS,
            xp: 0,
            level: 1,
            avatar: `https://ui-avatars.com/api/?name=${username}`,
            stats: { wins: 0, losses: 0, games: 0, maxWin: 0 },
            inventory: {},
            created: serverTimestamp(),
            lastLogin: serverTimestamp()
        };
        await set(ref(db, `users/${user.uid}`), profile);
    },

    loadProfile(uid) {
        onValue(ref(db, `users/${uid}`), (snap) => {
            const data = snap.val();
            if (data) {
                Store.commit('profile', { ...data, uid: uid });
                UI.updateDOM();
            }
        });

        const presenceRef = ref(db, `status/${uid}`);
        const connectedRef = ref(db, '.info/connected');
        onValue(connectedRef, (snap) => {
            if (snap.val() === true) {
                const con = push(presenceRef);
                onDisconnect(con).remove();
                set(con, { state: 'online', last_changed: serverTimestamp() });

                DOMHelper.setText('online-counter', '1'); // Fallback
            }
        });

        // Count Online
        onValue(ref(db, 'status'), (snap) => {
            if (snap.exists()) {
                const count = Object.keys(snap.val()).length;
                DOMHelper.setText('online-counter', count);
            }
        });
    },

    logout() {
        signOut(auth);
        window.location.reload();
    }
};

const GameEngine = {
    Mines: {
        active: false,
        grid: [],
        revealed: [],
        bet: 0,
        mines: 3,
        multiplier: 1.0,

        start() {
            const betInput = DOMHelper.val('m-bet-inp');
            const bet = parseInt(betInput || 100);

            const minesInput = DOMHelper.val('m-mines-rng');
            const mines = parseInt(minesInput || 3);

            const p = Store.get('profile');

            if (bet > p.points) return UI.toast('Bakiye Yetersiz', 'error');
            if (bet <= 0) return UI.toast('Geçersiz Tutar', 'error');

            GameEngine.tx(bet * -1);

            this.active = true;
            this.bet = bet;
            this.mines = mines;
            this.multiplier = 1.0;
            this.revealed = new Array(25).fill(false);
            this.grid = new Array(25).fill(0);

            let placed = 0;
            while (placed < mines) {
                let r = Math.floor(Math.random() * 25);
                if (this.grid[r] === 0) {
                    this.grid[r] = 1;
                    placed++;
                }
            }

            this.render();
            DOMHelper.hide('btn-m-play');
            DOMHelper.show('btn-m-cashout');
        },

        render() {
            const container = DOMHelper.get('m-grid-target');
            if (!container) return;
            container.innerHTML = '';

            for (let i = 0; i < 25; i++) {
                const tile = document.createElement('div');
                tile.className = 'mine-tile';
                if (this.revealed[i]) {
                    tile.classList.add('revealed');
                    if (this.grid[i] === 1) tile.classList.add('bomb');
                    else tile.classList.add('gem');
                } else {
                    tile.onclick = () => this.click(i, tile);
                }
                container.appendChild(tile);
            }
        },

        click(i) {
            if (!this.active || this.revealed[i]) return;

            this.revealed[i] = true;

            if (this.grid[i] === 1) {
                AudioFX.sfx.explosion();
                AudioFX.sfx.error();
                this.active = false;
                this.revealAll();
                UI.toast('PATLADIN!', 'error');
                this.resetUI();
            } else {
                AudioFX.sfx.success();

                const safeTotal = 25 - this.mines;
                const revealedSafe = this.revealed.filter((r, idx) => r && this.grid[idx] === 0).length;
                this.multiplier = this.calcMulti(revealedSafe, this.mines);

                const win = Math.floor(this.bet * this.multiplier);
                DOMHelper.setText('gm-win-amount', UI.formatNumber(win));

                this.render();

                if (revealedSafe === safeTotal) this.cashout();
            }
        },

        calcMulti(hits, mines) {
            let m = 1.0;
            for (let i = 0; i < hits; i++) m *= (25 - i) / (25 - i - mines);
            return m;
        },

        revealAll() {
            for (let i = 0; i < 25; i++) this.revealed[i] = true;
            this.render();
        },

        cashout() {
            if (!this.active) return;
            const win = Math.floor(this.bet * this.multiplier);
            GameEngine.tx(win);
            this.active = false;
            AudioFX.sfx.win();
            UI.toast(`KAZANDIN: +${win}`, 'success');
            this.revealAll();
            this.resetUI();
        },

        resetUI() {
            setTimeout(() => {
                DOMHelper.show('btn-m-play');
                DOMHelper.hide('btn-m-cashout');
            }, 2000);
        }
    },

    Slots: {
        spinning: false,
        reels: [[], [], []],
        symbols: [
            { id: 'cherry', icon: '🍒', val: 2 },
            { id: 'lemon', icon: '🍋', val: 3 },
            { id: 'grape', icon: '🍇', val: 5 },
            { id: 'bell', icon: '🔔', val: 10 },
            { id: 'diamond', icon: '💎', val: 25 },
            { id: 'seven', icon: '7️⃣', val: 50 },
            { id: 'bar', icon: '🎰', val: 100 }
        ],

        spin() {
            if (this.spinning) return;

            const betInput = DOMHelper.val('s-bet');
            const bet = parseInt(betInput || 50);
            const p = Store.get('profile');

            if (bet > p.points) return UI.toast('Bakiye Yetersiz');

            GameEngine.tx(bet * -1);
            this.spinning = true;
            AudioFX.sfx.spin();

            [1, 2, 3].forEach((id, idx) => {
                const el = DOMHelper.get(`rs-${id}`);
                // Mock spin animation
                el.innerHTML = this.symbols.map(s => `<div class="reel-item">${s.icon}</div>`).join('') +
                    this.symbols.map(s => `<div class="reel-item">${s.icon}</div>`).join('');

                el.style.transition = `transform ${1000 + idx * 500}ms cubic-bezier(0.45, 0.05, 0.55, 0.95)`;
                el.style.transform = 'translateY(-1000px)';

                setTimeout(() => {
                    const result = this.symbols[Math.floor(Math.random() * this.symbols.length)];
                    this.reels[idx] = result;
                    el.style.transition = 'none';
                    el.style.transform = 'translateY(0)';
                    el.innerHTML = `<div class="reel-item">${result.icon}</div>`;
                    AudioFX.sfx.click();
                }, 1000 + (idx * 500));
            });

            setTimeout(() => {
                this.checkWin(bet);
                this.spinning = false;
            }, 2600);
        },

        checkWin(bet) {
            const [r1, r2, r3] = this.reels;
            let win = 0;
            // Guard against empty reels if error
            if (!r1 || !r2 || !r3) return;

            if (r1.id === r2.id && r2.id === r3.id) {
                win = bet * r1.val;
                UI.toast(`JACKPOT! ${r1.icon} x3 (+${win})`, 'success');
                AudioFX.sfx.win();
            } else if (r1.id === r2.id || r2.id === r3.id || r1.id === r3.id) {
                win = Math.floor(bet * 1.5);
                UI.toast('İkili Eşleşme! (+' + win + ')');
            } else {
                UI.toast('Kazanamadın.', 'info');
            }

            if (win > 0) GameEngine.tx(win);
        }
    },

    tx(amount) {
        if (!Store.get('user')) return;

        const uid = Store.get('user').uid;
        const p = Store.get('profile');
        const updates = {
            points: p.points + amount,
            'stats/games': (p.stats.games || 0) + 1
        };

        if (amount > 0) {
            updates['stats/wins'] = (p.stats.wins || 0) + 1;
            if (amount > (p.stats.maxWin || 0)) updates['stats/maxWin'] = amount;

            updates.xp = (p.xp || 0) + Math.floor(amount / 10);
            if (updates.xp >= (p.level * CONFIG.GAME.LEVEL_XP_BASE)) {
                updates.level = (p.level || 1) + 1;
                UI.toast(`SEVİYE ATLADIN! LVL ${updates.level}`, 'success');
            }
        } else {
            updates['stats/losses'] = (p.stats.losses || 0) + 1;
        }

        update(ref(db, `users/${uid}`), updates);
    }
};

const Chat = {
    init() {
        this.listen();

        const form = DOMHelper.get('chat-form');
        if (form) {
            form.addEventListener('submit', (e) => {
                e.preventDefault();
                this.send();
            });
        }
    },

    listen() {
        const q = query(ref(db, 'chats/global'), limitToLast(50));
        onValue(q, (snap) => {
            const container = DOMHelper.get('chat-messages');
            if (!container) return;
            container.innerHTML = '';

            snap.forEach(child => {
                this.renderMessage(child.val(), container);
            });
            container.scrollTop = container.scrollHeight;
        });
    },

    send() {
        const input = DOMHelper.get('chat-msg-input');
        if (!input) return;
        const text = input.value.trim();
        if (!text) return;

        if (text.startsWith('/')) {
            this.processCommand(text);
            input.value = '';
            return;
        }

        const p = Store.get('profile');
        if (!p) return UI.toast('Giriş Yapmalısın', 'error');

        push(ref(db, 'chats/global'), {
            uid: p.uid,
            name: p.username,
            msg: text,
            role: p.role,
            ts: serverTimestamp()
        });

        input.value = '';
    },

    renderMessage(data, container) {
        const isMe = Store.get('user')?.uid === data.uid;
        const div = document.createElement('div');
        div.className = `msg-row ${isMe ? 'mine' : ''} fade-in`;

        div.innerHTML = `
            <img src="https://ui-avatars.com/api/?name=${data.name}&background=random" class="msg-avatar">
            <div class="msg-content">
                <div class="msg-header">
                    <span class="msg-user ${data.role}">${data.name}</span>
                </div>
                <div class="msg-text">${this.escapeHtml(data.msg)}</div>
            </div>
        `;
        container.appendChild(div);
    },

    processCommand(cmd) {
        const [command, ...args] = cmd.split(' ');

        switch (command.toLowerCase()) {
            case '/clear':
                const c = DOMHelper.get('chat-messages');
                if (c) c.innerHTML = '';
                UI.toast('Sohbet temizlendi');
                break;
            case '/roll':
                const max = args[0] || 100;
                const roll = Math.floor(Math.random() * max) + 1;
                this.sendSystem(`${Store.get('profile').username} zar attı: ${roll} (1-${max})`);
                break;
            default:
                UI.toast('Bilinmeyen komut', 'error');
        }
    },

    sendSystem(msg) {
        push(ref(db, 'chats/global'), {
            uid: 'SYSTEM',
            name: 'SİSTEM',
            msg: msg,
            role: 'mod',
            ts: serverTimestamp()
        });
    },

    escapeHtml(text) {
        return text ? text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;") : '';
    }
};

const Router = {
    go(viewId) {
        Store.commit('activeView', viewId);

        document.querySelectorAll('.view-section').forEach(el => el.classList.remove('active'));
        const target = DOMHelper.get(`view-${viewId}`);
        if (target) target.classList.add('active');

        document.querySelectorAll('.nav-link').forEach(el => el.classList.remove('active'));
        const nav = document.querySelector(`.nav-link[data-page="${viewId}"]`);
        if (nav) nav.classList.add('active');

        const titles = {
            'dashboard': 'KOMUTA MERKEZİ',
            'games': 'OYUN ARENASI',
            'market': 'PAZAR YERİ',
            'chat': 'İLETİŞİM',
            'profile': 'PROFİL'
        }
        DOMHelper.setText('page-title-text', titles[viewId] || 'SİSTEM');

        AudioFX.sfx.hover();
        UI.updateDOM();
    }
};

document.addEventListener('DOMContentLoaded', () => {
    Auth.init();
    Chat.init();
    new ParticleSystem('particle-canvas');

    window.app = {
        router: Router,
        game: {
            launch(id) {
                UI.modal.open('game-modal');
                DOMHelper.setText('gm-title', id.toUpperCase());
                DOMHelper.setText('gm-win-amount', '0');

                const stage = DOMHelper.get('game-stage');
                if (stage) stage.innerHTML = '';

                if (id === 'mines') {
                    const tpl = DOMHelper.get('tpl-mines').content.cloneNode(true);
                    stage.appendChild(tpl);
                    GameEngine.Mines.resetUI();
                } else if (id === 'slots') {
                    const tpl = DOMHelper.get('tpl-slots').content.cloneNode(true);
                    stage.appendChild(tpl);
                    DOMHelper.setHTML('rs-1', '<div class="reel-item">7️⃣</div>');
                    DOMHelper.setHTML('rs-2', '<div class="reel-item">7️⃣</div>');
                    DOMHelper.setHTML('rs-3', '<div class="reel-item">7️⃣</div>');
                } else if (id === 'roulette') {
                    const tpl = DOMHelper.get('tpl-roulette').content.cloneNode(true);
                    stage.appendChild(tpl);
                }
            },
            close() {
                UI.modal.close('game-modal');
            },
            mines: GameEngine.Mines,
            slots: GameEngine.Slots,
            roulette: {
                bet(t) { UI.toast('Bahis Alındı: ' + t); },
                spin() { UI.toast('Dönüyor...'); },
                setChip(v) { UI.toast('Jeton: ' + v); }
            }
        },
        ui: UI,
        auth: Auth
    };

    setTimeout(() => {
        const loader = DOMHelper.get('loader-overlay');
        if (loader) {
            loader.style.opacity = '0';
            setTimeout(() => loader.remove(), 500);
        }
    }, 1500);

    Router.go('dashboard');
});

// ====================================================================================================
//    EXTENDED FEATURES: NOTIFICATION SYSTEM
// ====================================================================================================
const NotificationManager = {
    notifications: [],
    unreadCount: 0,

    init() {
        this.loadNotifications();
        this.listenForNew();
    },

    loadNotifications() {
        const uid = Store.get('user')?.uid;
        if (!uid) return;

        const q = query(ref(db, `notifications/${uid}`), limitToLast(20));
        onValue(q, (snap) => {
            this.notifications = [];
            snap.forEach(child => {
                this.notifications.push({ id: child.key, ...child.val() });
            });
            this.updateUI();
        });
    },

    listenForNew() {
        const uid = Store.get('user')?.uid;
        if (!uid) return;

        const notifRef = ref(db, `notifications/${uid}`);
        onValue(notifRef, (snap) => {
            this.unreadCount = 0;
            snap.forEach(child => {
                if (!child.val().read) this.unreadCount++;
            });
            this.updateBadge();
        });
    },

    updateBadge() {
        const dot = DOMHelper.get('notif-dot');
        if (dot) {
            if (this.unreadCount > 0) {
                dot.classList.remove('hidden');
            } else {
                dot.classList.add('hidden');
            }
        }
    },

    updateUI() {
        const container = DOMHelper.get('notif-list');
        if (!container) return;

        container.innerHTML = '';
        if (this.notifications.length === 0) {
            container.innerHTML = '<div class="text-center text-gray-500 py-8">Bildirim yok</div>';
            return;
        }

        this.notifications.reverse().forEach(notif => {
            const div = document.createElement('div');
            div.className = `notif-item ${notif.read ? 'read' : 'unread'}`;
            div.innerHTML = `
                <div class="flex items-start gap-3">
                    <i class="ri-${this.getIcon(notif.type)}-line text-xl text-${this.getColor(notif.type)}"></i>
                    <div class="flex-1">
                        <div class="font-bold text-sm">${notif.title}</div>
                        <div class="text-xs text-gray-400">${notif.message}</div>
                        <div class="text-xs text-gray-600 mt-1">${this.formatTime(notif.timestamp)}</div>
                    </div>
                </div>
            `;
            div.onclick = () => this.markAsRead(notif.id);
            container.appendChild(div);
        });
    },

    getIcon(type) {
        const icons = {
            'achievement': 'trophy',
            'message': 'mail',
            'system': 'information',
            'win': 'medal',
            'gift': 'gift'
        };
        return icons[type] || 'notification';
    },

    getColor(type) {
        const colors = {
            'achievement': 'accent',
            'message': 'primary',
            'system': 'info',
            'win': 'success',
            'gift': 'warning'
        };
        return colors[type] || 'gray-400';
    },

    formatTime(ts) {
        if (!ts) return 'Şimdi';
        const date = new Date(ts);
        const now = new Date();
        const diff = now - date;
        const minutes = Math.floor(diff / 60000);
        if (minutes < 1) return 'Az önce';
        if (minutes < 60) return `${minutes} dakika önce`;
        const hours = Math.floor(minutes / 60);
        if (hours < 24) return `${hours} saat önce`;
        return date.toLocaleDateString('tr-TR');
    },

    markAsRead(id) {
        const uid = Store.get('user')?.uid;
        if (!uid) return;
        update(ref(db, `notifications/${uid}/${id}`), { read: true });
    },

    send(userId, type, title, message) {
        const notifRef = push(ref(db, `notifications/${userId}`));
        set(notifRef, {
            type: type,
            title: title,
            message: message,
            timestamp: serverTimestamp(),
            read: false
        });
    }
};

// ====================================================================================================
//    EXTENDED FEATURES: DIRECT MESSAGING SYSTEM
// ====================================================================================================
const DMManager = {
    conversations: [],
    activeConversation: null,

    init() {
        this.loadConversations();
    },

    loadConversations() {
        const uid = Store.get('user')?.uid;
        if (!uid) return;

        const convRef = ref(db, `conversations/${uid}`);
        onValue(convRef, (snap) => {
            this.conversations = [];
            snap.forEach(child => {
                this.conversations.push({ id: child.key, ...child.val() });
            });
            this.renderConversationList();
        });
    },

    renderConversationList() {
        const container = DOMHelper.get('dm-conversation-list');
        if (!container) return;

        container.innerHTML = '';
        if (this.conversations.length === 0) {
            container.innerHTML = '<div class="text-center text-gray-500 py-8">Mesaj yok</div>';
            return;
        }

        this.conversations.forEach(conv => {
            const div = document.createElement('div');
            div.className = `dm-conv-item ${conv.unread ? 'unread' : ''}`;
            div.innerHTML = `
                <img src="${conv.avatar || 'https://ui-avatars.com/api/?name=' + conv.name}" class="w-12 h-12 rounded-full">
                <div class="flex-1">
                    <div class="font-bold">${conv.name}</div>
                    <div class="text-xs text-gray-400 truncate">${conv.lastMessage || 'Mesaj yok'}</div>
                </div>
                ${conv.unread ? '<div class="w-3 h-3 bg-primary rounded-full"></div>' : ''}
            `;
            div.onclick = () => this.openConversation(conv.id);
            container.appendChild(div);
        });
    },

    openConversation(convId) {
        this.activeConversation = convId;
        this.loadMessages(convId);
        DOMHelper.show('dm-chat-area');
    },

    loadMessages(convId) {
        const uid = Store.get('user')?.uid;
        if (!uid) return;

        const msgRef = query(ref(db, `messages/${convId}`), limitToLast(50));
        onValue(msgRef, (snap) => {
            const container = DOMHelper.get('dm-messages');
            if (!container) return;

            container.innerHTML = '';
            snap.forEach(child => {
                const msg = child.val();
                const div = document.createElement('div');
                div.className = `dm-message ${msg.senderId === uid ? 'mine' : 'theirs'}`;
                div.innerHTML = `
                    <div class="dm-bubble">
                        <div class="text-sm">${this.escapeHtml(msg.text)}</div>
                        <div class="text-xs text-gray-500 mt-1">${this.formatTime(msg.timestamp)}</div>
                    </div>
                `;
                container.appendChild(div);
            });
            container.scrollTop = container.scrollHeight;
        });
    },

    sendMessage(text) {
        if (!this.activeConversation || !text.trim()) return;

        const uid = Store.get('user')?.uid;
        const msgRef = push(ref(db, `messages/${this.activeConversation}`));
        set(msgRef, {
            senderId: uid,
            text: text.trim(),
            timestamp: serverTimestamp()
        });

        // Update last message in conversation
        update(ref(db, `conversations/${uid}/${this.activeConversation}`), {
            lastMessage: text.trim(),
            lastTimestamp: serverTimestamp()
        });
    },

    escapeHtml(text) {
        return text ? text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;") : '';
    },

    formatTime(ts) {
        if (!ts) return '';
        const date = new Date(ts);
        return date.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' });
    }
};

// ====================================================================================================
//    EXTENDED FEATURES: ACHIEVEMENT SYSTEM
// ====================================================================================================
const AchievementManager = {
    achievements: [
        { id: 'first_win', name: 'İlk Kan', desc: 'İlk oyununu kazan', icon: '🏆', points: 100 },
        { id: 'win_10', name: 'Kazanan', desc: '10 oyun kazan', icon: '🎯', points: 500 },
        { id: 'win_100', name: 'Efsane', desc: '100 oyun kazan', icon: '👑', points: 5000 },
        { id: 'millionaire', name: 'Milyoner', desc: '1.000.000 puana ulaş', icon: '💰', points: 10000 },
        { id: 'level_10', name: 'Yükselen Yıldız', desc: 'Seviye 10\'a ulaş', icon: '⭐', points: 1000 },
        { id: 'level_50', name: 'Usta', desc: 'Seviye 50\'ye ulaş', icon: '🌟', points: 5000 },
        { id: 'chat_100', name: 'Konuşkan', desc: '100 mesaj gönder', icon: '💬', points: 500 },
        { id: 'daily_7', name: 'Sadık', desc: '7 gün üst üste giriş yap', icon: '📅', points: 1000 }
    ],

    check(profile) {
        if (!profile) return;

        const unlocked = profile.achievements || [];
        const stats = profile.stats || {};

        // Check achievements
        if (stats.wins >= 1 && !unlocked.includes('first_win')) {
            this.unlock('first_win', profile.uid);
        }
        if (stats.wins >= 10 && !unlocked.includes('win_10')) {
            this.unlock('win_10', profile.uid);
        }
        if (stats.wins >= 100 && !unlocked.includes('win_100')) {
            this.unlock('win_100', profile.uid);
        }
        if (profile.points >= 1000000 && !unlocked.includes('millionaire')) {
            this.unlock('millionaire', profile.uid);
        }
        if (profile.level >= 10 && !unlocked.includes('level_10')) {
            this.unlock('level_10', profile.uid);
        }
        if (profile.level >= 50 && !unlocked.includes('level_50')) {
            this.unlock('level_50', profile.uid);
        }
    },

    unlock(achievementId, userId) {
        const achievement = this.achievements.find(a => a.id === achievementId);
        if (!achievement) return;

        // Add to user's achievements
        const userRef = ref(db, `users/${userId}`);
        get(userRef).then(snap => {
            const data = snap.val();
            const achievements = data.achievements || [];
            if (!achievements.includes(achievementId)) {
                achievements.push(achievementId);
                update(userRef, {
                    achievements: achievements,
                    points: (data.points || 0) + achievement.points
                });

                // Send notification
                NotificationManager.send(userId, 'achievement', 'Başarım Kazanıldı!',
                    `${achievement.icon} ${achievement.name} - +${achievement.points} puan`);

                // Show toast
                UI.toast(`🎉 Başarım: ${achievement.name}`, 'success');
                AudioFX.sfx.win();
            }
        });
    },

    renderList() {
        const container = DOMHelper.get('achievement-list');
        if (!container) return;

        const profile = Store.get('profile');
        const unlocked = profile?.achievements || [];

        container.innerHTML = '';
        this.achievements.forEach(ach => {
            const isUnlocked = unlocked.includes(ach.id);
            const div = document.createElement('div');
            div.className = `achievement-card ${isUnlocked ? 'unlocked' : 'locked'}`;
            div.innerHTML = `
                <div class="text-4xl mb-2 ${isUnlocked ? '' : 'grayscale opacity-50'}">${ach.icon}</div>
                <div class="font-bold">${ach.name}</div>
                <div class="text-xs text-gray-400">${ach.desc}</div>
                <div class="text-accent text-sm mt-2">+${ach.points} puan</div>
            `;
            container.appendChild(div);
        });
    }
};

// ====================================================================================================
//    EXTENDED FEATURES: LEADERBOARD MANAGER
// ====================================================================================================
const LeaderboardManager = {
    topPlayers: [],

    init() {
        this.loadLeaderboard();
    },

    loadLeaderboard() {
        const leaderboardRef = query(ref(db, 'users'), orderByChild('points'), limitToLast(100));
        onValue(leaderboardRef, (snap) => {
            this.topPlayers = [];
            snap.forEach(child => {
                this.topPlayers.push({ uid: child.key, ...child.val() });
            });
            this.topPlayers.reverse(); // Highest first
            this.render();
        });
    },

    render() {
        const container = DOMHelper.get('leaderboard-list');
        if (!container) return;

        container.innerHTML = '';
        this.topPlayers.slice(0, 50).forEach((player, index) => {
            const rank = index + 1;
            const isMe = player.uid === Store.get('user')?.uid;

            const div = document.createElement('div');
            div.className = `leaderboard-row ${isMe ? 'highlight' : ''}`;
            div.innerHTML = `
                <div class="rank rank-${rank <= 3 ? rank : 'other'}">#${rank}</div>
                <img src="${player.avatar || 'https://ui-avatars.com/api/?name=' + player.username}" 
                     class="w-10 h-10 rounded-full border-2 border-gray-700">
                <div class="flex-1">
                    <div class="font-bold">${player.username} ${isMe ? '(Sen)' : ''}</div>
                    <div class="text-xs text-gray-400">Seviye ${player.level || 1}</div>
                </div>
                <div class="text-right">
                    <div class="font-mono font-bold text-accent">${UI.formatNumber(player.points)}</div>
                    <div class="text-xs text-gray-400">${player.stats?.wins || 0} galibiyet</div>
                </div>
            `;
            container.appendChild(div);
        });
    }
};

// ====================================================================================================
//    EXTENDED FEATURES: THEME CUSTOMIZER
// ====================================================================================================
const ThemeCustomizer = {
    themes: {
        cyan: { primary: '#00f2ff', secondary: '#ae00ff', accent: '#f59e0b' },
        purple: { primary: '#a855f7', secondary: '#ec4899', accent: '#fbbf24' },
        green: { primary: '#10b981', secondary: '#06b6d4', accent: '#f59e0b' },
        red: { primary: '#ef4444', secondary: '#f97316', accent: '#fbbf24' },
        blue: { primary: '#3b82f6', secondary: '#8b5cf6', accent: '#f59e0b' }
    },

    apply(themeName) {
        const theme = this.themes[themeName];
        if (!theme) return;

        const root = document.documentElement;
        root.style.setProperty('--c-primary-500', theme.primary);
        root.style.setProperty('--c-secondary-500', theme.secondary);
        root.style.setProperty('--c-accent-500', theme.accent);

        // Save preference
        const settings = Store.get('settings');
        settings.theme.color = themeName;
        Store.saveSettings();

        UI.toast(`Tema değiştirildi: ${themeName.toUpperCase()}`, 'success');
    },

    renderPicker() {
        const container = DOMHelper.get('theme-picker');
        if (!container) return;

        container.innerHTML = '';
        Object.keys(this.themes).forEach(name => {
            const theme = this.themes[name];
            const btn = document.createElement('button');
            btn.className = 'theme-swatch';
            btn.style.background = `linear-gradient(135deg, ${theme.primary}, ${theme.secondary})`;
            btn.onclick = () => this.apply(name);
            btn.title = name.toUpperCase();
            container.appendChild(btn);
        });
    }
};

// ====================================================================================================
//    EXTENDED FEATURES: ADMIN PANEL FUNCTIONS
// ====================================================================================================
const AdminPanel = {
    isAdmin() {
        const profile = Store.get('profile');
        return profile && (profile.role === 'admin' || profile.role === 'founder');
    },

    isFounder() {
        const profile = Store.get('profile');
        return profile && profile.role === 'founder';
    },

    init() {
        if (this.isAdmin()) {
            DOMHelper.show('nav-admin');
        }
    },

    banUser(userId, reason) {
        if (!this.isAdmin()) return UI.toast('Yetkiniz yok', 'error');

        update(ref(db, `users/${userId}`), {
            banned: true,
            banReason: reason,
            bannedAt: serverTimestamp()
        });

        UI.toast('Kullanıcı banlandı', 'success');
        this.logAction('BAN_USER', userId, reason);
    },

    muteUser(userId, duration) {
        if (!this.isAdmin()) return UI.toast('Yetkiniz yok', 'error');

        const until = Date.now() + (duration * 60000); // duration in minutes
        update(ref(db, `users/${userId}`), {
            muted: true,
            mutedUntil: until
        });

        UI.toast(`Kullanıcı ${duration} dakika susturuldu`, 'success');
        this.logAction('MUTE_USER', userId, `${duration} minutes`);
    },

    giveCredits(userId, amount) {
        if (!this.isAdmin()) return UI.toast('Yetkiniz yok', 'error');

        get(ref(db, `users/${userId}`)).then(snap => {
            const data = snap.val();
            if (data) {
                update(ref(db, `users/${userId}`), {
                    points: (data.points || 0) + amount
                });
                UI.toast(`${amount} kredi verildi`, 'success');
                this.logAction('GIVE_CREDITS', userId, amount);
            }
        });
    },

    deleteMessage(messageId) {
        if (!this.isAdmin()) return UI.toast('Yetkiniz yok', 'error');

        remove(ref(db, `chats/global/${messageId}`));
        UI.toast('Mesaj silindi', 'success');
        this.logAction('DELETE_MESSAGE', messageId);
    },

    lockChat(locked) {
        if (!this.isFounder()) return UI.toast('Sadece kurucu yapabilir', 'error');

        set(ref(db, 'system/chatLocked'), locked);
        UI.toast(locked ? 'Chat kilitlendi' : 'Chat kilidi açıldı', locked ? 'warning' : 'success');
        this.logAction('LOCK_CHAT', locked);
    },

    setRole(userId, role) {
        if (!this.isFounder()) return UI.toast('Sadece kurucu yapabilir', 'error');

        update(ref(db, `users/${userId}`), { role: role });
        UI.toast(`Rol değiştirildi: ${role}`, 'success');
        this.logAction('SET_ROLE', userId, role);
    },

    logAction(action, target, details = '') {
        const uid = Store.get('user')?.uid;
        if (!uid) return;

        push(ref(db, 'admin_logs'), {
            adminId: uid,
            action: action,
            target: target,
            details: details,
            timestamp: serverTimestamp()
        });
    },

    viewLogs() {
        const logsRef = query(ref(db, 'admin_logs'), limitToLast(100));
        onValue(logsRef, (snap) => {
            const container = DOMHelper.get('admin-logs');
            if (!container) return;

            container.innerHTML = '';
            snap.forEach(child => {
                const log = child.val();
                const div = document.createElement('div');
                div.className = 'admin-log-entry';
                div.innerHTML = `
                    <span class="text-danger">[${log.action}]</span>
                    <span class="text-gray-400">${log.adminId.substring(0, 8)}</span>
                    → <span class="text-primary">${log.target}</span>
                    ${log.details ? `<span class="text-gray-500">(${log.details})</span>` : ''}
                `;
                container.appendChild(div);
            });
        });
    }
};

// ====================================================================================================
//    EXTENDED GAME ENGINES: BLACKJACK
// ====================================================================================================
GameEngine.Blackjack = {
    deck: [],
    playerHand: [],
    dealerHand: [],
    bet: 0,
    gameActive: false,

    init() {
        this.createDeck();
        this.shuffle();
    },

    createDeck() {
        const suits = ['♠', '♥', '♦', '♣'];
        const values = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];
        this.deck = [];

        for (let suit of suits) {
            for (let value of values) {
                this.deck.push({ suit, value, numValue: this.getCardValue(value) });
            }
        }
    },

    getCardValue(value) {
        if (value === 'A') return 11;
        if (['J', 'Q', 'K'].includes(value)) return 10;
        return parseInt(value);
    },

    shuffle() {
        for (let i = this.deck.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [this.deck[i], this.deck[j]] = [this.deck[j], this.deck[i]];
        }
    },

    deal() {
        return this.deck.pop();
    },

    calculateHand(hand) {
        let total = 0;
        let aces = 0;

        for (let card of hand) {
            total += card.numValue;
            if (card.value === 'A') aces++;
        }

        while (total > 21 && aces > 0) {
            total -= 10;
            aces--;
        }

        return total;
    },

    start(betAmount) {
        const profile = Store.get('profile');
        if (betAmount > profile.points) return UI.toast('Yetersiz bakiye', 'error');

        GameEngine.tx(betAmount * -1);
        this.bet = betAmount;
        this.gameActive = true;

        this.createDeck();
        this.shuffle();

        this.playerHand = [this.deal(), this.deal()];
        this.dealerHand = [this.deal(), this.deal()];

        this.render();
        AudioFX.sfx.click();

        // Check for blackjack
        if (this.calculateHand(this.playerHand) === 21) {
            this.stand();
        }
    },

    hit() {
        if (!this.gameActive) return;

        this.playerHand.push(this.deal());
        this.render();
        AudioFX.sfx.click();

        const total = this.calculateHand(this.playerHand);
        if (total > 21) {
            this.bust();
        } else if (total === 21) {
            this.stand();
        }
    },

    stand() {
        if (!this.gameActive) return;

        // Dealer draws until 17
        while (this.calculateHand(this.dealerHand) < 17) {
            this.dealerHand.push(this.deal());
        }

        this.render();
        this.checkWinner();
    },

    checkWinner() {
        const playerTotal = this.calculateHand(this.playerHand);
        const dealerTotal = this.calculateHand(this.dealerHand);

        let winAmount = 0;

        if (dealerTotal > 21) {
            winAmount = this.bet * 2;
            UI.toast(`Krupiye patladı! +${winAmount}`, 'success');
            AudioFX.sfx.win();
        } else if (playerTotal > dealerTotal) {
            winAmount = this.bet * 2;
            UI.toast(`Kazandın! +${winAmount}`, 'success');
            AudioFX.sfx.win();
        } else if (playerTotal === dealerTotal) {
            winAmount = this.bet;
            UI.toast('Berabere', 'info');
        } else {
            UI.toast('Kaybettin', 'error');
            AudioFX.sfx.error();
        }

        if (winAmount > 0) GameEngine.tx(winAmount);
        this.gameActive = false;
    },

    bust() {
        UI.toast('Patladın!', 'error');
        AudioFX.sfx.error();
        this.gameActive = false;
        this.render();
    },

    render() {
        const playerContainer = DOMHelper.get('bj-player-hand');
        const dealerContainer = DOMHelper.get('bj-dealer-hand');
        if (!playerContainer || !dealerContainer) return;

        playerContainer.innerHTML = this.playerHand.map(card =>
            `<div class="playing-card ${['♥', '♦'].includes(card.suit) ? 'red' : 'black'}">
                <div class="card-value">${card.value}</div>
                <div class="card-suit">${card.suit}</div>
            </div>`
        ).join('');

        dealerContainer.innerHTML = this.dealerHand.map((card, i) => {
            if (i === 1 && this.gameActive) {
                return '<div class="playing-card back">?</div>';
            }
            return `<div class="playing-card ${['♥', '♦'].includes(card.suit) ? 'red' : 'black'}">
                <div class="card-value">${card.value}</div>
                <div class="card-suit">${card.suit}</div>
            </div>`;
        }).join('');

        DOMHelper.setText('bj-player-total', this.calculateHand(this.playerHand));
        DOMHelper.setText('bj-dealer-total', this.gameActive ? '?' : this.calculateHand(this.dealerHand));
    }
};

// ====================================================================================================
//    EXTENDED GAME ENGINES: PLINKO
// ====================================================================================================
GameEngine.Plinko = {
    rows: 12,
    multipliers: [0.2, 0.5, 1, 1.5, 2, 3, 5, 3, 2, 1.5, 1, 0.5, 0.2],
    ball: null,
    bet: 0,

    start(betAmount) {
        const profile = Store.get('profile');
        if (betAmount > profile.points) return UI.toast('Yetersiz bakiye', 'error');

        GameEngine.tx(betAmount * -1);
        this.bet = betAmount;

        this.dropBall();
    },

    dropBall() {
        let position = this.rows / 2;
        const path = [];

        // Simulate ball path
        for (let i = 0; i < this.rows; i++) {
            const direction = Math.random() > 0.5 ? 1 : -1;
            position += direction * 0.5;
            path.push(position);
        }

        // Animate ball drop
        this.animateDrop(path);
    },

    animateDrop(path) {
        const canvas = DOMHelper.get('plinko-canvas');
        if (!canvas) return;

        let step = 0;
        const interval = setInterval(() => {
            if (step >= path.length) {
                clearInterval(interval);
                this.calculateWin(Math.round(path[path.length - 1]));
                return;
            }

            // Draw ball at current position
            this.drawBall(canvas, path[step], step);
            AudioFX.sfx.click();
            step++;
        }, 100);
    },

    drawBall(canvas, x, y) {
        const ctx = canvas.getContext('2d');
        ctx.clearRect(0, 0, canvas.width, canvas.height);

        // Draw pegs
        for (let row = 0; row < this.rows; row++) {
            for (let col = 0; col <= row; col++) {
                ctx.fillStyle = '#666';
                ctx.beginPath();
                ctx.arc(50 + col * 40, 50 + row * 40, 3, 0, Math.PI * 2);
                ctx.fill();
            }
        }

        // Draw ball
        ctx.fillStyle = '#00f2ff';
        ctx.beginPath();
        ctx.arc(50 + x * 40, 50 + y * 40, 8, 0, Math.PI * 2);
        ctx.fill();
    },

    calculateWin(slot) {
        const multiplier = this.multipliers[slot] || 1;
        const winAmount = Math.floor(this.bet * multiplier);

        if (winAmount > this.bet) {
            UI.toast(`${multiplier}x! Kazanç: +${winAmount}`, 'success');
            AudioFX.sfx.win();
        } else {
            UI.toast(`${multiplier}x - ${winAmount}`, 'info');
        }

        GameEngine.tx(winAmount);
    }
};

// ====================================================================================================
//    EXTENDED GAME ENGINES: KENO
// ====================================================================================================
GameEngine.Keno = {
    selectedNumbers: [],
    drawnNumbers: [],
    bet: 0,

    selectNumber(num) {
        if (this.selectedNumbers.includes(num)) {
            this.selectedNumbers = this.selectedNumbers.filter(n => n !== num);
        } else if (this.selectedNumbers.length < 10) {
            this.selectedNumbers.push(num);
        } else {
            UI.toast('Maksimum 10 sayı seçebilirsin', 'warning');
        }
        this.renderBoard();
    },

    start(betAmount) {
        if (this.selectedNumbers.length === 0) {
            return UI.toast('En az 1 sayı seç', 'error');
        }

        const profile = Store.get('profile');
        if (betAmount > profile.points) return UI.toast('Yetersiz bakiye', 'error');

        GameEngine.tx(betAmount * -1);
        this.bet = betAmount;

        this.draw();
    },

    draw() {
        this.drawnNumbers = [];
        const numbers = Array.from({ length: 80 }, (_, i) => i + 1);

        // Draw 20 random numbers
        for (let i = 0; i < 20; i++) {
            const index = Math.floor(Math.random() * numbers.length);
            this.drawnNumbers.push(numbers[index]);
            numbers.splice(index, 1);
        }

        this.animateDraw();
    },

    animateDraw() {
        let revealed = 0;
        const interval = setInterval(() => {
            if (revealed >= this.drawnNumbers.length) {
                clearInterval(interval);
                this.checkWin();
                return;
            }

            this.renderBoard(revealed);
            AudioFX.sfx.click();
            revealed++;
        }, 200);
    },

    checkWin() {
        const matches = this.selectedNumbers.filter(n => this.drawnNumbers.includes(n)).length;
        const multipliers = [0, 0, 0, 1, 2, 5, 10, 20, 50, 100, 500];
        const multiplier = multipliers[matches] || 0;
        const winAmount = Math.floor(this.bet * multiplier);

        if (matches > 0) {
            UI.toast(`${matches} eşleşme! ${multiplier}x = +${winAmount}`, 'success');
            AudioFX.sfx.win();
            GameEngine.tx(winAmount);
        } else {
            UI.toast('Eşleşme yok', 'error');
            AudioFX.sfx.error();
        }
    },

    renderBoard(revealedCount = 0) {
        const container = DOMHelper.get('keno-board');
        if (!container) return;

        container.innerHTML = '';
        for (let i = 1; i <= 80; i++) {
            const btn = document.createElement('button');
            btn.className = 'keno-number';
            btn.textContent = i;

            if (this.selectedNumbers.includes(i)) {
                btn.classList.add('selected');
            }

            if (revealedCount > 0 && this.drawnNumbers.slice(0, revealedCount).includes(i)) {
                btn.classList.add('drawn');
                if (this.selectedNumbers.includes(i)) {
                    btn.classList.add('match');
                }
            }

            btn.onclick = () => this.selectNumber(i);
            container.appendChild(btn);
        }
    }
};

// ====================================================================================================
//    MOBILE OPTIMIZATIONS
// ====================================================================================================
const MobileOptimizer = {
    init() {
        this.detectMobile();
        this.setupGestures();
        this.optimizePerformance();
    },

    detectMobile() {
        const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
        if (isMobile) {
            document.body.classList.add('mobile');
            this.adjustForMobile();
        }
    },

    adjustForMobile() {
        // Reduce particle count
        const settings = Store.get('settings');
        if (settings.graphics.particles) {
            settings.graphics.particles = false;
            Store.saveSettings();
        }

        // Add mobile navigation
        this.createMobileNav();
    },

    createMobileNav() {
        const nav = document.createElement('div');
        nav.className = 'mobile-bottom-nav';
        nav.innerHTML = `
            <button onclick="app.router.go('dashboard')" class="mobile-nav-btn">
                <i class="ri-home-line"></i>
                <span>Ana Sayfa</span>
            </button>
            <button onclick="app.router.go('games')" class="mobile-nav-btn">
                <i class="ri-gamepad-line"></i>
                <span>Oyunlar</span>
            </button>
            <button onclick="app.router.go('chat')" class="mobile-nav-btn">
                <i class="ri-chat-3-line"></i>
                <span>Chat</span>
            </button>
            <button onclick="app.router.go('profile')" class="mobile-nav-btn">
                <i class="ri-user-line"></i>
                <span>Profil</span>
            </button>
        `;
        document.body.appendChild(nav);
    },

    setupGestures() {
        let touchStartX = 0;
        let touchEndX = 0;

        document.addEventListener('touchstart', e => {
            touchStartX = e.changedTouches[0].screenX;
        });

        document.addEventListener('touchend', e => {
            touchEndX = e.changedTouches[0].screenX;
            this.handleSwipe();
        });
    },

    handleSwipe() {
        // Implement swipe navigation if needed
    },

    optimizePerformance() {
        // Disable animations on low-end devices
        if (navigator.hardwareConcurrency && navigator.hardwareConcurrency < 4) {
            const settings = Store.get('settings');
            settings.graphics.animations = false;
            Store.saveSettings();
            document.body.classList.add('low-performance');
        }
    }
};

// ====================================================================================================
//    EXTENDED APP INITIALIZATION
// ====================================================================================================
window.addEventListener('load', () => {
    // Initialize extended features
    NotificationManager.init();
    DMManager.init();
    LeaderboardManager.init();
    AdminPanel.init();
    ThemeCustomizer.renderPicker();
    MobileOptimizer.init();

    // Apply saved theme
    const savedTheme = Store.get('settings').theme.color;
    if (savedTheme) {
        ThemeCustomizer.apply(savedTheme);
    }

    // Check achievements periodically
    setInterval(() => {
        const profile = Store.get('profile');
        if (profile) {
            AchievementManager.check(profile);
        }
    }, 10000); // Every 10 seconds

    // Update online counter
    setInterval(() => {
        const count = Math.floor(Math.random() * 50) + 10; // Mock online count
        DOMHelper.setText('online-counter', count);
    }, 5000);
});

// Extend window.app object
if (window.app) {
    window.app.notifications = NotificationManager;
    window.app.dm = DMManager;
    window.app.achievements = AchievementManager;
    window.app.leaderboard = LeaderboardManager;
    window.app.theme = ThemeCustomizer;
    window.app.admin = AdminPanel;
    window.app.chat = Chat;
    window.app.game.blackjack = GameEngine.Blackjack;
    window.app.game.plinko = GameEngine.Plinko;
    window.app.game.keno = GameEngine.Keno;
}

// ====================================================================================================
//    UTILITY FUNCTIONS & HELPERS
// ====================================================================================================

/**
 * Format number with thousand separators
 * @param {number} num - Number to format
 * @returns {string} Formatted number
 */
function formatNumber(num) {
    return num.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

/**
 * Generate random ID
 * @returns {string} Random ID
 */
function generateId() {
    return Date.now().toString(36) + Math.random().toString(36).substring(2);
}

/**
 * Debounce function
 * @param {Function} func - Function to debounce
 * @param {number} wait - Wait time in ms
 * @returns {Function} Debounced function
 */
function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
        const later = () => {
            clearTimeout(timeout);
            func(...args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
}

/**
 * Throttle function
 * @param {Function} func - Function to throttle
 * @param {number} limit - Time limit in ms
 * @returns {Function} Throttled function
 */
function throttle(func, limit) {
    let inThrottle;
    return function (...args) {
        if (!inThrottle) {
            func.apply(this, args);
            inThrottle = true;
            setTimeout(() => inThrottle = false, limit);
        }
    };
}

/**
 * Deep clone object
 * @param {Object} obj - Object to clone
 * @returns {Object} Cloned object
 */
function deepClone(obj) {
    return JSON.parse(JSON.stringify(obj));
}

/**
 * Check if user is online
 * @returns {boolean} Online status
 */
function isOnline() {
    return navigator.onLine;
}

/**
 * Get device type
 * @returns {string} Device type (mobile, tablet, desktop)
 */
function getDeviceType() {
    const ua = navigator.userAgent;
    if (/(tablet|ipad|playbook|silk)|(android(?!.*mobi))/i.test(ua)) {
        return "tablet";
    }
    if (/Mobile|Android|iP(hone|od)|IEMobile|BlackBerry|Kindle|Silk-Accelerated|(hpw|web)OS|Opera M(obi|ini)/.test(ua)) {
        return "mobile";
    }
    return "desktop";
}

/**
 * Copy text to clipboard
 * @param {string} text - Text to copy
 */
async function copyToClipboard(text) {
    try {
        await navigator.clipboard.writeText(text);
        UI.toast('Kopyalandı!', 'success');
    } catch (err) {
        UI.toast('Kopyalama başarısız', 'error');
    }
}

/**
 * Validate email
 * @param {string} email - Email to validate
 * @returns {boolean} Valid or not
 */
function isValidEmail(email) {
    const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return re.test(email);
}

/**
 * Validate username
 * @param {string} username - Username to validate
 * @returns {boolean} Valid or not
 */
function isValidUsername(username) {
    return username.length >= 3 && username.length <= 20 && /^[a-zA-Z0-9_]+$/.test(username);
}

/**
 * Get time ago string
 * @param {number} timestamp - Timestamp
 * @returns {string} Time ago string
 */
function getTimeAgo(timestamp) {
    const now = Date.now();
    const diff = now - timestamp;
    const seconds = Math.floor(diff / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);

    if (days > 0) return `${days} gün önce`;
    if (hours > 0) return `${hours} saat önce`;
    if (minutes > 0) return `${minutes} dakika önce`;
    return 'Az önce';
}

/**
 * Calculate level from XP
 * @param {number} xp - Experience points
 * @returns {number} Level
 */
function calculateLevel(xp) {
    return Math.floor(Math.sqrt(xp / CONFIG.GAME.LEVEL_XP_BASE)) + 1;
}

/**
 * Calculate XP needed for next level
 * @param {number} currentLevel - Current level
 * @returns {number} XP needed
 */
function xpForNextLevel(currentLevel) {
    return Math.pow(currentLevel, 2) * CONFIG.GAME.LEVEL_XP_BASE;
}

/**
 * Get random element from array
 * @param {Array} arr - Array
 * @returns {*} Random element
 */
function randomElement(arr) {
    return arr[Math.floor(Math.random() * arr.length)];
}

/**
 * Shuffle array
 * @param {Array} arr - Array to shuffle
 * @returns {Array} Shuffled array
 */
function shuffleArray(arr) {
    const newArr = [...arr];
    for (let i = newArr.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [newArr[i], newArr[j]] = [newArr[j], newArr[i]];
    }
    return newArr;
}

/**
 * Sleep function
 * @param {number} ms - Milliseconds to sleep
 * @returns {Promise} Promise that resolves after ms
 */
function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Log to console with timestamp (debug mode only)
 * @param {...any} args - Arguments to log
 */
function debugLog(...args) {
    if (CONFIG.SYSTEM.DEBUG) {
        console.log(`[${new Date().toISOString()}]`, ...args);
    }
}

/**
 * Export utility functions to window
 */
window.utils = {
    formatNumber,
    generateId,
    debounce,
    throttle,
    deepClone,
    isOnline,
    getDeviceType,
    copyToClipboard,
    isValidEmail,
    isValidUsername,
    getTimeAgo,
    calculateLevel,
    xpForNextLevel,
    randomElement,
    shuffleArray,
    sleep,
    debugLog
};

// ====================================================================================================
//    CONSOLE WELCOME MESSAGE
// ====================================================================================================
console.log('%c🚀 SAHIKALI PLATFORM', 'font-size: 24px; font-weight: bold; color: #00f2ff; text-shadow: 0 0 10px #00f2ff;');
console.log('%cVersion: ' + CONFIG.SYSTEM.VERSION, 'font-size: 14px; color: #ae00ff;');
console.log('%cEnvironment: ' + CONFIG.SYSTEM.ENV, 'font-size: 12px; color: #888;');
console.log('%c⚠️ Bu konsolu kullanarak sisteme zarar verebilirsiniz!', 'font-size: 12px; color: #ff0055; font-weight: bold;');
console.log('%cBilmediğiniz kodları buraya yapıştırmayın!', 'font-size: 12px; color: #ff0055;');

debugLog('Application initialized successfully');
debugLog('Device type:', getDeviceType());
debugLog('Online status:', isOnline());

