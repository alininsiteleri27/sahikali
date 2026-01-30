import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import {
    getAuth, onAuthStateChanged, signInWithEmailAndPassword,
    createUserWithEmailAndPassword, signOut
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import {
    getDatabase, ref, set, get, update, push, onValue,
    serverTimestamp, query, limitToLast, onDisconnect
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-database.js";

// ============================================================================
//    CONFIGURATION
// ============================================================================

const CONFIG = {
    FIREBASE: {
        apiKey: "AIzaSyDyGNrzw1a55LHv-LP5gjuPpFWmHu1a6yU",
        authDomain: "ali23-cfd02.firebaseapp.com",
        databaseURL: "https://ali23-cfd02-default-rtdb.europe-west1.firebasedatabase.app",
        projectId: "ali23-cfd02",
        storageBucket: "ali23-cfd02.firebasestorage.app",
        messagingSenderId: "759021285078",
        appId: "1:759021285078:web:f7673f89125ff3dad66377"
    }
};

const app = initializeApp(CONFIG.FIREBASE);
const auth = getAuth(app);
const db = getDatabase(app);

// ============================================================================
//    DOM HELPER
// ============================================================================

class DOMHelper {
    static get(id) {
        return document.getElementById(id);
    }

    static setText(id, text) {
        const el = this.get(id);
        if (el) el.innerText = text;
    }

    static setHTML(id, html) {
        const el = this.get(id);
        if (el) el.innerHTML = html;
    }

    static show(id) {
        const el = this.get(id);
        if (el) el.classList.remove('hidden');
    }

    static hide(id) {
        const el = this.get(id);
        if (el) el.classList.add('hidden');
    }
}

// ============================================================================
//    STATE MANAGER
// ============================================================================

class StateManager {
    constructor() {
        this.state = {
            user: null,
            profile: null,
            activeView: 'dashboard'
        };
    }

    get(key) {
        return this.state[key];
    }

    set(key, value) {
        this.state[key] = value;
    }
}

const Store = new StateManager();

// ============================================================================
//    AUTHENTICATION
// ============================================================================

const Auth = {
    init() {
        onAuthStateChanged(auth, (user) => {
            if (user) {
                Store.set('user', user);
                this.loadProfile(user.uid);
                UI.closeModal('auth-modal');
            } else {
                Store.set('user', null);
                UI.openModal('auth-modal');
            }
        });

        const form = DOMHelper.get('form-login');
        if (form) {
            form.addEventListener('submit', (e) => {
                e.preventDefault();
                this.login(
                    DOMHelper.get('login-email').value,
                    DOMHelper.get('login-pass').value
                );
            });
        }
    },

    async login(email, pass) {
        try {
            await signInWithEmailAndPassword(auth, email, pass);
        } catch (error) {
            if (error.code === 'auth/user-not-found' || error.code === 'auth/invalid-credential') {
                this.register(email, pass);
            }
        }
    },

    async register(email, pass) {
        try {
            const cred = await createUserWithEmailAndPassword(auth, email, pass);
            await this.createProfile(cred.user, email.split('@')[0]);
        } catch (error) {
            console.error(error);
        }
    },

    async createProfile(user, username) {
        const profile = {
            uid: user.uid,
            username: username,
            email: user.email,
            role: 'member',
            level: 1,
            avatar: `https://ui-avatars.com/api/?name=${username}&background=00c6ff&color=000`,
            messageCount: 0,
            created: serverTimestamp(),
            lastLogin: serverTimestamp()
        };
        await set(ref(db, `users/${user.uid}`), profile);
    },

    loadProfile(uid) {
        onValue(ref(db, `users/${uid}`), (snap) => {
            const data = snap.val();
            if (data) {
                Store.set('profile', { ...data, uid: uid });
                UI.updateDOM();
            }
        });

        // Presence
        const presenceRef = ref(db, `status/${uid}`);
        const connectedRef = ref(db, '.info/connected');
        onValue(connectedRef, (snap) => {
            if (snap.val() === true) {
                const con = push(presenceRef);
                onDisconnect(con).remove();
                set(con, { state: 'online', last: serverTimestamp() });
            }
        });

        // Count online users
        onValue(ref(db, 'status'), (snap) => {
            if (snap.exists()) {
                const count = Object.keys(snap.val()).length;
                DOMHelper.setText('online-counter', count);
                DOMHelper.setText('chat-online-count', count);
                DOMHelper.setText('online-users', count);
            }
        });
    },

    async logout() {
        await signOut(auth);
        location.reload();
    }
};

// ============================================================================
//    UI MANAGER
// ============================================================================

const UI = {
    sidebarCollapsed: false,

    openModal(id) {
        const modal = DOMHelper.get(id);
        if (modal) modal.classList.add('active');
    },

    closeModal(id) {
        const modal = DOMHelper.get(id);
        if (modal) modal.classList.remove('active');
    },

    toggleSidebar() {
        const sidebar = DOMHelper.get('app-sidebar');
        const toggleBtn = document.querySelector('.sidebar-toggle i');

        if (!sidebar) return;

        // Mobil cihazlarda farklı davranış
        if (window.innerWidth <= 768) {
            sidebar.classList.toggle('mobile-active');
            return;
        }

        // Desktop'ta collapse/expand
        this.sidebarCollapsed = !this.sidebarCollapsed;

        if (this.sidebarCollapsed) {
            sidebar.classList.add('collapsed');
            document.body.classList.add('sidebar-collapsed');
            if (toggleBtn) toggleBtn.className = 'ri-menu-unfold-line';
        } else {
            sidebar.classList.remove('collapsed');
            document.body.classList.remove('sidebar-collapsed');
            if (toggleBtn) toggleBtn.className = 'ri-menu-fold-line';
        }
    },

    updateDOM() {
        const p = Store.get('profile');
        if (!p) return;

        // Sidebar
        DOMHelper.setText('sb-username', p.username);
        DOMHelper.setText('sb-level', `LVL ${p.level}`);
        const sbAvatar = DOMHelper.get('sb-avatar');
        if (sbAvatar) sbAvatar.src = p.avatar;

        // Profile page
        DOMHelper.setText('profile-username', p.username);
        DOMHelper.setText('profile-email', p.email);
        DOMHelper.setText('profile-level', `LVL ${p.level}`);
        DOMHelper.setText('profile-role', p.role === 'admin' ? 'Admin' : 'Üye');
        DOMHelper.setText('profile-messages', p.messageCount || 0);

        const profileAvatar = DOMHelper.get('profile-avatar');
        if (profileAvatar) profileAvatar.src = p.avatar;

        if (p.created) {
            const date = new Date(p.created);
            DOMHelper.setText('profile-joined', date.toLocaleDateString('tr-TR'));
        }

        // Stats
        this.loadStats();
    },

    async loadStats() {
        // Total users
        const usersSnap = await get(ref(db, 'users'));
        if (usersSnap.exists()) {
            const count = Object.keys(usersSnap.val()).length;
            DOMHelper.setText('total-users', count);
        }

        // Total messages
        const messagesSnap = await get(ref(db, 'chats/global'));
        if (messagesSnap.exists()) {
            const count = Object.keys(messagesSnap.val()).length;
            DOMHelper.setText('total-messages', count);
        }
    }
};

// ============================================================================
//    ROUTER
// ============================================================================

const Router = {
    go(viewId) {
        Store.set('activeView', viewId);

        // Hide all views
        document.querySelectorAll('.view-section').forEach(el => {
            el.classList.remove('active');
        });

        // Show target view
        const target = DOMHelper.get(`view-${viewId}`);
        if (target) target.classList.add('active');

        // Update nav
        document.querySelectorAll('.nav-link').forEach(el => {
            el.classList.remove('active');
        });
        const nav = document.querySelector(`.nav-link[data-page="${viewId}"]`);
        if (nav) nav.classList.add('active');

        // Update title
        const titles = {
            'dashboard': 'ANA SAYFA',
            'chat': 'SOHBET',
            'profile': 'PROFİLİM'
        };
        DOMHelper.setText('page-title-text', titles[viewId] || 'SAHIKALI');
    }
};

// ============================================================================
//    CHAT SYSTEM
// ============================================================================

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

    renderMessage(msg, container) {
        const div = document.createElement('div');
        div.className = 'msg-row';

        const time = msg.ts ? new Date(msg.ts).toLocaleTimeString('tr-TR', {
            hour: '2-digit',
            minute: '2-digit'
        }) : '';

        div.innerHTML = `
            <img src="${msg.avatar || 'https://ui-avatars.com/api/?name=User&background=666&color=fff'}" 
                 class="msg-avatar" alt="${msg.name}">
            <div class="msg-content">
                <div class="msg-header">
                    <span class="msg-user">${this.escapeHTML(msg.name)}</span>
                    <span class="msg-time">${time}</span>
                </div>
                <div class="msg-text">${this.escapeHTML(msg.msg)}</div>
            </div>
        `;
        container.appendChild(div);
    },

    send() {
        const input = DOMHelper.get('chat-msg-input');
        if (!input) return;
        const text = input.value.trim();
        if (!text) return;

        const p = Store.get('profile');
        if (!p) return;

        push(ref(db, 'chats/global'), {
            uid: p.uid,
            name: p.username,
            msg: text,
            avatar: p.avatar,
            ts: serverTimestamp()
        });

        // Update message count
        update(ref(db, `users/${p.uid}`), {
            messageCount: (p.messageCount || 0) + 1
        });

        input.value = '';
    },

    escapeHTML(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }
};

// ============================================================================
//    INITIALIZATION
// ============================================================================

window.app = {
    auth: Auth,
    ui: UI,
    router: Router,
    chat: Chat
};

document.addEventListener('DOMContentLoaded', () => {
    // Hide loader
    setTimeout(() => {
        const loader = DOMHelper.get('loader-overlay');
        if (loader) {
            loader.style.opacity = '0';
            setTimeout(() => loader.remove(), 500);
        }
    }, 1000);

    // Initialize
    Auth.init();
    Chat.init();

    console.log('%c🚀 SAHIKALI', 'font-size: 24px; font-weight: bold; color: #00c6ff;');
    console.log('%cModern Community Platform', 'font-size: 14px; color: #ae00ff;');
});
