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
