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
    floatingChatOpen: false,

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

        // Desktop'ta tamamen gizle/göster
        this.sidebarCollapsed = !this.sidebarCollapsed;

        if (this.sidebarCollapsed) {
            sidebar.classList.add('collapsed');
            document.body.classList.add('sidebar-collapsed');
            if (toggleBtn) toggleBtn.className = 'ri-menu-line';
        } else {
            sidebar.classList.remove('collapsed');
            document.body.classList.remove('sidebar-collapsed');
            if (toggleBtn) toggleBtn.className = 'ri-menu-fold-line';
        }
    },

    toggleFloatingChat() {
        const chatWindow = DOMHelper.get('floating-chat-window');
        if (!chatWindow) return;

        this.floatingChatOpen = !this.floatingChatOpen;

        if (this.floatingChatOpen) {
            chatWindow.classList.add('active');
        } else {
            chatWindow.classList.remove('active');
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

        // Account info
        DOMHelper.setText('profile-uid', p.uid || '-');
        DOMHelper.setText('profile-email-info', p.email || '-');
        DOMHelper.setText('profile-role-info', p.role === 'admin' ? 'Admin' : 'Üye');

        if (p.lastLogin) {
            const lastLogin = new Date(p.lastLogin);
            DOMHelper.setText('profile-last-login', lastLogin.toLocaleDateString('tr-TR'));
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

        // Floating chat form
        const floatingForm = DOMHelper.get('floating-chat-form');
        if (floatingForm) {
            floatingForm.addEventListener('submit', (e) => {
                e.preventDefault();
                this.sendFloating();
            });
        }
    },

    listen() {
        const q = query(ref(db, 'chats/global'), limitToLast(50));
        onValue(q, (snap) => {
            // Main chat container
            const container = DOMHelper.get('chat-messages');
            if (container) {
                container.innerHTML = '';
                snap.forEach(child => {
                    this.renderMessage(child.val(), container);
                });
                container.scrollTop = container.scrollHeight;
            }

            // Floating chat container
            const floatingContainer = DOMHelper.get('floating-chat-messages');
            if (floatingContainer) {
                floatingContainer.innerHTML = '';
                snap.forEach(child => {
                    this.renderMessage(child.val(), floatingContainer);
                });
                floatingContainer.scrollTop = floatingContainer.scrollHeight;
            }
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

    sendFloating() {
        const input = DOMHelper.get('floating-chat-input');
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
//    PROFILE MANAGEMENT
// ============================================================================

const Profile = {
    async updateUsername() {
        const input = DOMHelper.get('settings-username');
        if (!input) return;

        const newUsername = input.value.trim();
        if (!newUsername) {
            alert('Lütfen yeni kullanıcı adını girin!');
            return;
        }

        const user = Store.get('user');
        if (!user) return;

        try {
            await update(ref(db, `users/${user.uid}`), {
                username: newUsername,
                avatar: `https://ui-avatars.com/api/?name=${newUsername}&background=00c6ff&color=000`
            });
            alert('Kullanıcı adı başarıyla güncellendi!');
            input.value = '';
        } catch (error) {
            console.error(error);
            alert('Kullanıcı adı güncellenirken hata oluştu!');
        }
    },

    async updateEmail() {
        const input = DOMHelper.get('settings-email');
        if (!input) return;

        const newEmail = input.value.trim();
        if (!newEmail) {
            alert('Lütfen yeni e-posta adresini girin!');
            return;
        }

        const user = Store.get('user');
        if (!user) return;

        try {
            const { updateEmail } = await import('https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js');
            await updateEmail(auth.currentUser, newEmail);
            await update(ref(db, `users/${user.uid}`), {
                email: newEmail
            });
            alert('E-posta başarıyla güncellendi!');
            input.value = '';
        } catch (error) {
            console.error(error);
            if (error.code === 'auth/requires-recent-login') {
                alert('Bu işlem için tekrar giriş yapmanız gerekiyor!');
            } else {
                alert('E-posta güncellenirken hata oluştu!');
            }
        }
    },

    async updatePassword() {
        const currentPass = DOMHelper.get('settings-current-pass');
        const newPass = DOMHelper.get('settings-new-pass');
        const confirmPass = DOMHelper.get('settings-new-pass-confirm');

        if (!currentPass || !newPass || !confirmPass) return;

        const current = currentPass.value;
        const newPassword = newPass.value;
        const confirm = confirmPass.value;

        if (!current || !newPassword || !confirm) {
            alert('Lütfen tüm alanları doldurun!');
            return;
        }

        if (newPassword !== confirm) {
            alert('Yeni şifreler eşleşmiyor!');
            return;
        }

        if (newPassword.length < 6) {
            alert('Şifre en az 6 karakter olmalıdır!');
            return;
        }

        const user = Store.get('user');
        if (!user) return;

        try {
            const { updatePassword, EmailAuthProvider, reauthenticateWithCredential } = await import('https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js');

            // Re-authenticate user
            const credential = EmailAuthProvider.credential(user.email, current);
            await reauthenticateWithCredential(auth.currentUser, credential);

            // Update password
            await updatePassword(auth.currentUser, newPassword);

            alert('Şifre başarıyla güncellendi!');
            currentPass.value = '';
            newPass.value = '';
            confirmPass.value = '';
        } catch (error) {
            console.error(error);
            if (error.code === 'auth/wrong-password') {
                alert('Mevcut şifre yanlış!');
            } else {
                alert('Şifre güncellenirken hata oluştu!');
            }
        }
    },

    async deleteAccount() {
        const confirm = window.confirm(
            'Hesabınızı silmek istediğinizden emin misiniz?\n\nBu işlem GERİ ALINAMAZ!\n\nTüm verileriniz kalıcı olarak silinecektir.'
        );

        if (!confirm) return;

        const doubleConfirm = window.prompt(
            'Hesabınızı silmek için "SİL" yazın:'
        );

        if (doubleConfirm !== 'SİL') {
            alert('İşlem iptal edildi.');
            return;
        }

        const user = Store.get('user');
        if (!user) return;

        try {
            // Delete user data from database
            await set(ref(db, `users/${user.uid}`), null);
            await set(ref(db, `status/${user.uid}`), null);

            // Delete auth account
            const { deleteUser } = await import('https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js');
            await deleteUser(auth.currentUser);

            alert('Hesabınız başarıyla silindi. Güle güle!');
            location.reload();
        } catch (error) {
            console.error(error);
            if (error.code === 'auth/requires-recent-login') {
                alert('Bu işlem için tekrar giriş yapmanız gerekiyor!');
            } else {
                alert('Hesap silinirken hata oluştu!');
            }
        }
    }
};

// ============================================================================
//    INITIALIZATION
// ============================================================================

window.app = {
    auth: Auth,
    ui: UI,
    router: Router,
    chat: Chat,
    profile: Profile
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
