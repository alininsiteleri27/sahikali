import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import {
    getAuth, onAuthStateChanged, signInWithEmailAndPassword,
    createUserWithEmailAndPassword, signOut
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import {
    getDatabase, ref, set, get, update, push, onValue,
    serverTimestamp, query, limitToLast, onDisconnect, runTransaction
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-database.js";

// ============================================================================
//    CONFIGURATION
// ============================================================================

const CONFIG = {
    FIREBASE: {
        apiKey: "AIzaSyCJhRPk_bsMT8TPDJIhNeScBmYTFubhdy8",
        authDomain: "sahikali-eaf86.firebaseapp.com",
        databaseURL: "https://sahikali-eaf86-default-rtdb.europe-west1.firebasedatabase.app",
        projectId: "sahikali-eaf86",
        storageBucket: "sahikali-eaf86.firebasestorage.app",
        messagingSenderId: "333730663577",
        appId: "1:333730663577:web:d1678f63c2068668d3bc08",
        measurementId: "G-RTHK8FT4BC"
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
        // Check if this is the first user (founder)
        const usersSnapshot = await get(ref(db, 'users'));
        const isFirstUser = !usersSnapshot.exists();

        const profile = {
            uid: user.uid,
            username: username,
            email: user.email,
            role: isFirstUser ? 'founder' : 'member',
            level: 1,
            avatar: `https://ui-avatars.com/api/?name=${username}&background=00c6ff&color=000`,
            messageCount: 0,
            points: 0,
            created: serverTimestamp(),
            lastLogin: serverTimestamp()
        };
        await set(ref(db, `users/${user.uid}`), profile);

        if (isFirstUser) {
            console.log('🛡️ İlk kullanıcı Founder olarak oluşturuldu!');
        }
    },

    loadProfile(uid) {
        console.log('📡 Profil yükleniyor...');
        onValue(ref(db, `users/${uid}`), (snap) => {
            const data = snap.val();
            if (data) {
                Store.set('profile', { ...data, uid: uid });
                UI.updateDOM();
                console.log('✅ Profil yüklendi:', data.username);
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
        if (modal) {
            modal.classList.add('active');
            // Prevent body scroll when modal is open
            document.body.classList.add('modal-open');
        }

        // If opening user settings modal, load current avatar
        if (id === 'user-settings-modal') {
            const profile = Store.get('profile');
            if (profile && profile.avatar) {
                const preview = DOMHelper.get('settings-avatar-preview');
                const input = DOMHelper.get('settings-avatar-url');

                if (preview) preview.src = profile.avatar;
                if (input) input.value = profile.avatar;
            }
        }
    },

    closeModal(id) {
        const modal = DOMHelper.get(id);
        if (modal) {
            modal.classList.remove('active');
            // Re-enable body scroll when modal is closed
            document.body.classList.remove('modal-open');
        }
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

    closeSidebar() {
        const sidebar = DOMHelper.get('app-sidebar');
        if (!sidebar) return;

        // Mobilde sidebar'ı kapat
        if (window.innerWidth <= 768) {
            sidebar.classList.remove('mobile-active');
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

        // Show/Hide Founder Panel
        const founderLink = document.querySelector('.founder-only');
        if (founderLink) {
            if (p.role === 'founder') {
                founderLink.style.display = 'flex';
            } else {
                founderLink.style.display = 'none';
            }
        }

        // Profile page
        DOMHelper.setText('profile-username', p.username);
        DOMHelper.setText('profile-email', p.email);
        DOMHelper.setText('profile-level', `LVL ${p.level}`);

        // Update role display
        let roleText = 'Üye';
        if (p.role === 'founder') roleText = 'Founder';
        else if (p.role === 'admin') roleText = 'Admin';

        DOMHelper.setText('profile-role', roleText);
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
        DOMHelper.setText('profile-role-info', roleText);

        if (p.lastLogin) {
            const lastLogin = new Date(p.lastLogin);
            DOMHelper.setText('profile-last-login', lastLogin.toLocaleDateString('tr-TR'));
        }

        // Stats
        this.loadStats();

        // Load founder stats if on founder page
        if (p.role === 'founder' && Store.get('activeView') === 'founder') {
            Founder.loadStats();
            Founder.loadComplaints();
        }
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
            'profile': 'PROFİLİM',
            'founder': 'FOUNDER PANELİ',
            'members': 'ÜYELER'
        };
        DOMHelper.setText('page-title-text', titles[viewId] || 'SAHIKALI');

        // Close sidebar on mobile
        UI.closeSidebar();

        // Load founder stats if navigating to founder page
        const profile = Store.get('profile');
        if (viewId === 'founder' && profile && profile.role === 'founder') {
            setTimeout(() => {
                Founder.loadStats();
                Founder.loadComplaints();
            }, 100);
        }

        // Load members if navigating to members page
        if (viewId === 'members') {
            setTimeout(() => {
                Members.loadMembers();
            }, 100);
        }
    }
};

// ============================================================================
//    CHAT SYSTEM
// ============================================================================

const Chat = {
    activeTab: 'global', // 'global' or 'dm'
    activeDM: null, // target user uid
    dmList: [],

    init() {
        this.listenGlobal();

        // Init logic for DMs
        onAuthStateChanged(auth, (user) => {
            if (user) {
                // Wait for profile store
                setTimeout(() => this.listenDMList(), 1000);
            } else {
                this.dmList = [];
                this.renderDMList();
            }
        });

        // Global Chat Form
        const globalForm = DOMHelper.get('floating-chat-form');
        if (globalForm) {
            globalForm.addEventListener('submit', (e) => {
                e.preventDefault();
                this.sendGlobal();
            });
        }

        // DM Chat Form
        const dmForm = DOMHelper.get('dm-chat-form');
        if (dmForm) {
            dmForm.addEventListener('submit', (e) => {
                e.preventDefault();
                this.sendDM();
            });
        }
    },

    switchTab(tab) {
        this.activeTab = tab;

        // Update Tabs UI
        document.querySelectorAll('.chat-tab').forEach(t => t.classList.remove('active'));
        const tabBtn = DOMHelper.get(`tab-${tab}`);
        if (tabBtn) tabBtn.classList.add('active');

        // Update Sections UI
        document.querySelectorAll('.chat-section').forEach(s => s.classList.remove('active'));
        const section = DOMHelper.get(`section-${tab}`);
        if (section) section.classList.add('active');

        // Scroll adjustments
        if (tab === 'global') {
            const container = DOMHelper.get('floating-chat-messages');
            if (container) container.scrollTop = container.scrollHeight;
        } else {
            // If switching to DM tab, update list view
            // If we are already in a chat, show it, else show list
            if (!this.activeDM) {
                this.showDMList();
            }
        }
    },

    listenGlobal() {
        const q = query(ref(db, 'chats/global'), limitToLast(50));
        onValue(q, (snap) => {
            const container = DOMHelper.get('floating-chat-messages');
            if (container) {
                container.innerHTML = '';
                snap.forEach(child => {
                    this.renderMessage(child.val(), container);
                });
                container.scrollTop = container.scrollHeight;
            }
        });
    },

    listenDMList() {
        const user = Store.get('profile');
        if (!user) return;

        const dmRef = ref(db, `user-chats/${user.uid}`);
        onValue(dmRef, (snap) => {
            if (!snap.exists()) {
                this.dmList = [];
                this.renderDMList();
                this.updateBadges();
                return;
            }

            const data = snap.val();
            this.dmList = Object.entries(data)
                .map(([uid, info]) => ({ uid, ...info }))
                .sort((a, b) => b.lastUpdate - a.lastUpdate);

            this.updateBadges();

            // Only re-render list if we are viewing the list
            if (this.activeTab === 'dm' && !this.activeDM) {
                this.renderDMList();
            }
        });
    },

    updateBadges() {
        const totalUnread = this.dmList.reduce((acc, chat) => acc + (chat.unread || 0), 0);

        const dmBadge = DOMHelper.get('dm-total-badge');
        if (dmBadge) {
            dmBadge.textContent = totalUnread;
            if (totalUnread > 0) dmBadge.classList.remove('hidden');
            else dmBadge.classList.add('hidden');
        }

        const mainBadge = DOMHelper.get('chat-badge');
        if (mainBadge) {
            mainBadge.textContent = totalUnread;
            if (totalUnread > 0) {
                mainBadge.style.display = 'flex';
                mainBadge.classList.remove('hidden');
            } else {
                mainBadge.style.display = 'none';
                mainBadge.classList.add('hidden');
            }
        }
    },

    renderDMList() {
        const container = DOMHelper.get('dm-list');
        if (!container) return;

        if (this.dmList.length === 0) {
            container.innerHTML = '<p class="text-muted text-center p-3">Henüz mesajınız yok.</p>';
            return;
        }

        container.innerHTML = this.dmList.map(chat => {
            const unreadClass = chat.unread > 0 ? 'unread' : '';

            return `
                <div class="dm-list-item ${unreadClass}" onclick="app.chat.openDM('${chat.uid}', '${chat.username}', '${chat.avatar}')">
                    <img src="${chat.avatar || 'https://ui-avatars.com/api/?name=' + chat.username}" class="dm-avatar" alt="${chat.username}">
                    <div class="dm-info">
                        <div class="dm-name" style="align-items: center;">
                            ${chat.username}
                             ${chat.unread > 0 ? '<div class="unread-dot"></div>' : ''}
                        </div>
                    </div>
                </div>
            `;
        }).join('');
    },

    showDMList() {
        this.activeDM = null;
        this.activeDMListener = null; // We might want to keep it detailed, but for simplicity reset

        DOMHelper.get('dm-chat-view').classList.add('hidden');
        DOMHelper.get('dm-list-view').classList.remove('hidden');
        this.renderDMList();
    },

    startDM(targetUid, username, avatar) {
        // Switch to DM tab
        if (!UI.floatingChatOpen) UI.toggleFloatingChat();
        this.switchTab('dm');
        this.openDM(targetUid, username, avatar);
    },

    openDM(targetUid, username, avatar) {
        this.activeDM = targetUid;

        // UI Updates
        DOMHelper.get('dm-list-view').classList.add('hidden');
        DOMHelper.get('dm-chat-view').classList.remove('hidden');
        DOMHelper.setText('dm-chat-username', username);

        // Listen Messages
        this.listenDMMessages(targetUid);

        // Reset unread count
        const myUid = Store.get('profile').uid;
        update(ref(db, `user-chats/${myUid}/${targetUid}`), {
            unread: 0
        });
    },

    closeDM() {
        this.showDMList();
    },

    listenDMMessages(targetUid) {
        const myUid = Store.get('profile').uid;
        const roomId = [myUid, targetUid].sort().join('_');
        const container = DOMHelper.get('dm-messages');

        // Unsubscribe previous listener if needed (Firebase JS SDK handles overwrite but good practice)

        const q = query(ref(db, `chats/dm/${roomId}`), limitToLast(50));

        onValue(q, (snap) => {
            if (!container || this.activeDM !== targetUid) return;

            container.innerHTML = '';
            if (!snap.exists()) {
                container.innerHTML = '<p class="text-muted text-center p-3">Mesajlaşmaya başlayın!</p>';
                return;
            }

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

        // Check if message is a game invite
        if (msg.type === 'invite' && (msg.game === 'hockey' || msg.game === 'chess')) {
            const gameInfo = {
                'hockey': { icon: '🏑', title: 'HAVA HOKEYİ' },
                'chess': { icon: '♟️', title: 'SATRANÇ' }
            };
            const info = gameInfo[msg.game];

            div.innerHTML = `
                <img src="${msg.avatar}" class="msg-avatar" alt="${msg.name}">
                <div class="msg-content">
                    <div class="msg-header">
                        <span class="msg-user">${this.escapeHTML(msg.name)}</span>
                        <span class="msg-time">${time}</span>
                    </div>
                    <div class="invite-card">
                        <span class="invite-title">${info.icon} ${info.title}</span>
                        <span class="invite-vs">VS</span>
                        <button class="btn-game-join" onclick="app.game.joinGame('${msg.gameId}')">
                            KABUL ET
                        </button>
                    </div>
                </div>
            `;
        } else {
            div.innerHTML = `
                <img src="${msg.avatar || 'https://ui-avatars.com/api/?name=User'}" class="msg-avatar" alt="${msg.name}">
                <div class="msg-content">
                    <div class="msg-header">
                        <span class="msg-user">${this.escapeHTML(msg.name)}</span>
                        <span class="msg-time">${time}</span>
                    </div>
                    <div class="msg-text">${this.escapeHTML(msg.msg)}</div>
                </div>
            `;
        }
        container.appendChild(div);
    },

    async sendGlobal() {
        const input = DOMHelper.get('floating-chat-input');
        if (!input) return;
        const text = input.value.trim();
        if (!text) return;

        const p = Store.get('profile');
        if (!p) return;

        await push(ref(db, 'chats/global'), {
            uid: p.uid,
            name: p.username,
            avatar: p.avatar,
            msg: text,
            ts: serverTimestamp(),
            type: 'text'
        });

        // Update stats
        runTransaction(ref(db, `users/${p.uid}/messageCount`), (count) => (count || 0) + 1);

        input.value = '';
    },

    async sendDM() {
        const input = DOMHelper.get('dm-chat-input');
        if (!input) return;
        const text = input.value.trim();
        if (!text || !this.activeDM) return;

        const myProfile = Store.get('profile');
        const targetUid = this.activeDM;
        const targetUsername = DOMHelper.get('dm-chat-username').textContent;
        const roomId = [myProfile.uid, targetUid].sort().join('_');

        // Push Message
        await push(ref(db, `chats/dm/${roomId}`), {
            uid: myProfile.uid,
            name: myProfile.username,
            avatar: myProfile.avatar,
            msg: text,
            ts: serverTimestamp(),
            type: 'text'
        });

        // Update My List (reset unread)
        update(ref(db, `user-chats/${myProfile.uid}/${targetUid}`), {
            username: targetUsername,
            avatar: 'https://ui-avatars.com/api/?name=' + targetUsername,
            lastMessage: text,
            lastUpdate: serverTimestamp(),
            unread: 0
        });

        // Update Target List (increment unread)
        const targetRef = ref(db, `user-chats/${targetUid}/${myProfile.uid}`);
        await runTransaction(targetRef, (data) => {
            if (!data) {
                return {
                    username: myProfile.username,
                    avatar: myProfile.avatar,
                    lastMessage: text,
                    lastUpdate: serverTimestamp(),
                    unread: 1
                };
            }
            data.lastMessage = text;
            data.lastUpdate = serverTimestamp();
            data.unread = (data.unread || 0) + 1;

            // Ensure username/avatar are current
            data.username = myProfile.username;
            data.avatar = myProfile.avatar;

            return data;
        });

        input.value = '';
    },

    escapeHTML(text) {
        if (!text) return '';
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
    },

    // ============================================================================
    //    PROFILE PICTURE MANAGEMENT
    // ============================================================================

    async updateAvatar() {
        const input = DOMHelper.get('settings-avatar-url');
        if (!input) return;

        const avatarUrl = input.value.trim();
        if (!avatarUrl) {
            alert('Lütfen profil fotoğrafı URL\'si girin!');
            return;
        }

        // Validate URL format
        try {
            new URL(avatarUrl);
        } catch (error) {
            alert('Geçersiz URL formatı! Lütfen geçerli bir URL girin.');
            return;
        }

        const user = Store.get('user');
        if (!user) return;

        try {
            await update(ref(db, `users/${user.uid}`), {
                avatar: avatarUrl
            });

            // Update preview
            const preview = DOMHelper.get('settings-avatar-preview');
            if (preview) preview.src = avatarUrl;

            alert('✅ Profil fotoğrafı başarıyla güncellendi!');
            console.log('Avatar updated:', avatarUrl);
        } catch (error) {
            console.error(error);
            alert('❌ Profil fotoğrafı güncellenirken hata oluştu!');
        }
    },

    useGravatar() {
        const user = Store.get('user');
        const profile = Store.get('profile');
        if (!user || !profile) return;

        // Generate Gravatar URL from email
        const email = profile.email || user.email;
        if (!email) {
            alert('E-posta adresi bulunamadı!');
            return;
        }

        // Create MD5 hash of email (simple implementation)
        const gravatarUrl = `https://www.gravatar.com/avatar/${this.md5(email.toLowerCase().trim())}?s=200&d=identicon`;

        const input = DOMHelper.get('settings-avatar-url');
        const preview = DOMHelper.get('settings-avatar-preview');

        if (input) input.value = gravatarUrl;
        if (preview) preview.src = gravatarUrl;

        console.log('Gravatar URL set:', gravatarUrl);
    },

    useUIAvatar() {
        const profile = Store.get('profile');
        if (!profile) return;

        const username = profile.username || 'User';
        const uiAvatarUrl = `https://ui-avatars.com/api/?name=${encodeURIComponent(username)}&background=00c6ff&color=000&size=200&bold=true`;

        const input = DOMHelper.get('settings-avatar-url');
        const preview = DOMHelper.get('settings-avatar-preview');

        if (input) input.value = uiAvatarUrl;
        if (preview) preview.src = uiAvatarUrl;

        console.log('UI Avatar URL set:', uiAvatarUrl);
    },

    // Simple MD5 hash implementation for Gravatar
    md5(string) {
        // This is a simplified version - in production, use a proper crypto library
        // For now, we'll use a basic hash that works for demonstration
        let hash = 0;
        for (let i = 0; i < string.length; i++) {
            const char = string.charCodeAt(i);
            hash = ((hash << 5) - hash) + char;
            hash = hash & hash;
        }
        return Math.abs(hash).toString(16);
    }
};

// ============================================================================
//    SETTINGS & THEMES
// ============================================================================

const Settings = {
    currentTheme: 'dark-cyber',

    init() {
        // Load saved theme
        const savedTheme = localStorage.getItem('theme') || 'dark-cyber';
        this.changeTheme(savedTheme);
    },

    changeTheme(themeName) {
        // Remove all theme checks
        document.querySelectorAll('.theme-check').forEach(check => {
            check.classList.remove('active');
        });

        // Add active check to selected theme
        const check = document.getElementById(`check-${themeName}`);
        if (check) check.classList.add('active');

        // Apply theme to HTML element
        document.documentElement.setAttribute('data-theme', themeName);

        // Save theme preference
        localStorage.setItem('theme', themeName);
        this.currentTheme = themeName;

        console.log(`✨ Tema değiştirildi: ${themeName}`);
    },

    async sendComplaint() {
        const typeSelect = DOMHelper.get('complaint-type');
        const messageInput = DOMHelper.get('complaint-message');

        if (!typeSelect || !messageInput) return;

        const type = typeSelect.value;
        const message = messageInput.value.trim();

        if (!message) {
            alert('Lütfen mesajınızı yazın!');
            return;
        }

        const user = Store.get('user');
        const profile = Store.get('profile');

        if (!user || !profile) {
            alert('Şikayet göndermek için giriş yapmalısınız!');
            return;
        }

        try {
            // Get type label
            const typeLabels = {
                'bug': '🐛 Hata Bildirimi',
                'suggestion': '💡 Öneri',
                'complaint': '⚠️ Şikayet',
                'other': '📝 Diğer'
            };

            // Send complaint to database
            const complaintData = {
                type: type,
                typeLabel: typeLabels[type],
                message: message,
                from: {
                    uid: user.uid,
                    username: profile.username,
                    email: profile.email
                },
                timestamp: serverTimestamp(),
                status: 'pending',
                read: false
            };

            await push(ref(db, 'complaints'), complaintData);

            alert('✅ Mesajınız başarıyla gönderildi! Kurucumuz en kısa sürede inceleyecektir.');

            // Clear form
            messageInput.value = '';
            typeSelect.value = 'bug';

            // Close modal
            UI.closeModal('settings-modal');
        } catch (error) {
            console.error('Şikayet gönderme hatası:', error);
            alert('❌ Mesaj gönderilirken bir hata oluştu. Lütfen tekrar deneyin.');
        }
    }
};

// ============================================================================
//    FOUNDER PANEL
// ============================================================================

const Founder = {
    // Helper: Get user by email or UID
    async getUserByIdentifier(identifier) {
        const usersRef = ref(db, 'users');
        const snapshot = await get(usersRef);

        if (!snapshot.exists()) return null;

        const users = snapshot.val();

        // Check if it's a direct UID
        if (users[identifier]) {
            return { uid: identifier, ...users[identifier] };
        }

        // Search by email
        for (const [uid, userData] of Object.entries(users)) {
            if (userData.email === identifier) {
                return { uid, ...userData };
            }
        }

        return null;
    },

    // 1. Make Admin
    async makeAdmin() {
        const identifier = DOMHelper.get('founder-user-id')?.value.trim();
        if (!identifier) {
            alert('Lütfen kullanıcı email veya ID girin!');
            return;
        }

        try {
            const user = await this.getUserByIdentifier(identifier);
            if (!user) {
                alert('Kullanıcı bulunamadı!');
                return;
            }

            await update(ref(db, `users/${user.uid}`), { role: 'admin' });
            alert(`✅ ${user.username} artık Admin!`);
            DOMHelper.get('founder-user-id').value = '';
        } catch (error) {
            console.error(error);
            alert('❌ Hata oluştu!');
        }
    },

    // 2. Remove Admin
    async removeAdmin() {
        const identifier = DOMHelper.get('founder-user-id')?.value.trim();
        if (!identifier) {
            alert('Lütfen kullanıcı email veya ID girin!');
            return;
        }

        try {
            const user = await this.getUserByIdentifier(identifier);
            if (!user) {
                alert('Kullanıcı bulunamadı!');
                return;
            }

            await update(ref(db, `users/${user.uid}`), { role: 'member' });
            alert(`✅ ${user.username} artık normal üye!`);
            DOMHelper.get('founder-user-id').value = '';
        } catch (error) {
            console.error(error);
            alert('❌ Hata oluştu!');
        }
    },

    // 3. Ban User
    async banUser() {
        const identifier = DOMHelper.get('founder-user-id')?.value.trim();
        if (!identifier) {
            alert('Lütfen kullanıcı email veya ID girin!');
            return;
        }

        const reason = prompt('Ban nedeni:');
        if (!reason) return;

        try {
            const user = await this.getUserByIdentifier(identifier);
            if (!user) {
                alert('Kullanıcı bulunamadı!');
                return;
            }

            await update(ref(db, `users/${user.uid}`), {
                banned: true,
                banReason: reason,
                bannedAt: serverTimestamp()
            });

            alert(`✅ ${user.username} banlandı!`);
            DOMHelper.get('founder-user-id').value = '';
        } catch (error) {
            console.error(error);
            alert('❌ Hata oluştu!');
        }
    },

    // 4. Kick User (Force Logout)
    async kickUser() {
        const identifier = DOMHelper.get('founder-user-id')?.value.trim();
        if (!identifier) {
            alert('Lütfen kullanıcı email veya ID girin!');
            return;
        }

        try {
            const user = await this.getUserByIdentifier(identifier);
            if (!user) {
                alert('Kullanıcı bulunamadı!');
                return;
            }

            // Remove from online status
            await set(ref(db, `status/${user.uid}`), null);

            alert(`✅ ${user.username} oturumu kapatıldı!`);
            DOMHelper.get('founder-user-id').value = '';
        } catch (error) {
            console.error(error);
            alert('❌ Hata oluştu!');
        }
    },

    // 5. Delete User
    async deleteUser() {
        const identifier = DOMHelper.get('founder-user-id')?.value.trim();
        if (!identifier) {
            alert('Lütfen kullanıcı email veya ID girin!');
            return;
        }

        const confirm = window.confirm('Bu kullanıcıyı kalıcı olarak silmek istediğinizden emin misiniz?');
        if (!confirm) return;

        try {
            const user = await this.getUserByIdentifier(identifier);
            if (!user) {
                alert('Kullanıcı bulunamadı!');
                return;
            }

            // Delete user data
            await set(ref(db, `users/${user.uid}`), null);
            await set(ref(db, `status/${user.uid}`), null);

            alert(`✅ ${user.username} silindi!`);
            DOMHelper.get('founder-user-id').value = '';
        } catch (error) {
            console.error(error);
            alert('❌ Hata oluştu!');
        }
    },

    // 6. Add Points
    async addPoints() {
        const identifier = DOMHelper.get('founder-points-user')?.value.trim();
        const amount = parseInt(DOMHelper.get('founder-points-amount')?.value);

        if (!identifier || !amount) {
            alert('Lütfen tüm alanları doldurun!');
            return;
        }

        try {
            const user = await this.getUserByIdentifier(identifier);
            if (!user) {
                alert('Kullanıcı bulunamadı!');
                return;
            }

            const currentPoints = user.points || 0;
            await update(ref(db, `users/${user.uid}`), {
                points: currentPoints + amount
            });

            alert(`✅ ${user.username} kullanıcısına ${amount} puan eklendi!`);
            DOMHelper.get('founder-points-user').value = '';
            DOMHelper.get('founder-points-amount').value = '';
        } catch (error) {
            console.error(error);
            alert('❌ Hata oluştu!');
        }
    },

    // 7. Remove Points
    async removePoints() {
        const identifier = DOMHelper.get('founder-points-user')?.value.trim();
        const amount = parseInt(DOMHelper.get('founder-points-amount')?.value);

        if (!identifier || !amount) {
            alert('Lütfen tüm alanları doldurun!');
            return;
        }

        try {
            const user = await this.getUserByIdentifier(identifier);
            if (!user) {
                alert('Kullanıcı bulunamadı!');
                return;
            }

            const currentPoints = user.points || 0;
            await update(ref(db, `users/${user.uid}`), {
                points: Math.max(0, currentPoints - amount)
            });

            alert(`✅ ${user.username} kullanıcısından ${amount} puan kaldırıldı!`);
            DOMHelper.get('founder-points-user').value = '';
            DOMHelper.get('founder-points-amount').value = '';
        } catch (error) {
            console.error(error);
            alert('❌ Hata oluştu!');
        }
    },

    // 8. Disable Chat
    async disableChat() {
        try {
            await set(ref(db, 'settings/chatEnabled'), false);
            alert('✅ Global chat kapatıldı!');
        } catch (error) {
            console.error(error);
            alert('❌ Hata oluştu!');
        }
    },

    // 9. Enable Chat
    async enableChat() {
        try {
            await set(ref(db, 'settings/chatEnabled'), true);
            alert('✅ Global chat açıldı!');
        } catch (error) {
            console.error(error);
            alert('❌ Hata oluştu!');
        }
    },

    // 10. Clear Chat
    async clearChat() {
        const confirm = window.confirm('Tüm mesajları silmek istediğinizden emin misiniz?');
        if (!confirm) return;

        try {
            await set(ref(db, 'chats/global'), null);
            alert('✅ Tüm mesajlar silindi!');
        } catch (error) {
            console.error(error);
            alert('❌ Hata oluştu!');
        }
    },

    // 11. Delete Message
    async deleteMessage() {
        const messageId = DOMHelper.get('founder-message-id')?.value.trim();
        if (!messageId) {
            alert('Lütfen mesaj ID girin!');
            return;
        }

        try {
            await set(ref(db, `chats/global/${messageId}`), null);
            alert('✅ Mesaj silindi!');
            DOMHelper.get('founder-message-id').value = '';
        } catch (error) {
            console.error(error);
            alert('❌ Hata oluştu!');
        }
    },

    // 12. Send Announcement
    async sendAnnouncement() {
        const title = DOMHelper.get('founder-announcement-title')?.value.trim();
        const message = DOMHelper.get('founder-announcement-message')?.value.trim();
        const type = DOMHelper.get('founder-announcement-type')?.value;

        if (!title || !message) {
            alert('Lütfen tüm alanları doldurun!');
            return;
        }

        try {
            await push(ref(db, 'announcements'), {
                title,
                message,
                type,
                timestamp: serverTimestamp(),
                active: true
            });

            alert('✅ Duyuru yayınlandı!');
            DOMHelper.get('founder-announcement-title').value = '';
            DOMHelper.get('founder-announcement-message').value = '';
        } catch (error) {
            console.error(error);
            alert('❌ Hata oluştu!');
        }
    },

    // 13. Send Warning (DM)
    async sendWarning() {
        const identifier = DOMHelper.get('founder-dm-user')?.value.trim();
        const message = DOMHelper.get('founder-dm-message')?.value.trim();

        if (!identifier || !message) {
            alert('Lütfen tüm alanları doldurun!');
            return;
        }

        try {
            const user = await this.getUserByIdentifier(identifier);
            if (!user) {
                alert('Kullanıcı bulunamadı!');
                return;
            }

            await push(ref(db, `warnings/${user.uid}`), {
                message,
                from: 'Founder',
                timestamp: serverTimestamp(),
                read: false
            });

            alert(`✅ ${user.username} kullanıcısına uyarı gönderildi!`);
            DOMHelper.get('founder-dm-user').value = '';
            DOMHelper.get('founder-dm-message').value = '';
        } catch (error) {
            console.error(error);
            alert('❌ Hata oluştu!');
        }
    },

    // 14. Enable Maintenance
    async enableMaintenance() {
        const message = DOMHelper.get('founder-maintenance-message')?.value.trim();
        if (!message) {
            alert('Lütfen bakım mesajı girin!');
            return;
        }

        try {
            await set(ref(db, 'settings/maintenance'), {
                enabled: true,
                message,
                startedAt: serverTimestamp()
            });

            alert('✅ Bakım modu açıldı!');
        } catch (error) {
            console.error(error);
            alert('❌ Hata oluştu!');
        }
    },

    // 15. Disable Maintenance
    async disableMaintenance() {
        try {
            await set(ref(db, 'settings/maintenance'), {
                enabled: false
            });

            alert('✅ Bakım modu kapatıldı!');
        } catch (error) {
            console.error(error);
            alert('❌ Hata oluştu!');
        }
    },

    // 16. Load Complaints
    async loadComplaints() {
        try {
            const complaintsRef = ref(db, 'complaints');
            const snapshot = await get(complaintsRef);

            const container = DOMHelper.get('complaints-list');
            if (!container) return;

            if (!snapshot.exists()) {
                container.innerHTML = '<p class="text-muted">Henüz şikayet yok.</p>';
                return;
            }

            const complaints = [];
            snapshot.forEach(child => {
                complaints.push({ id: child.key, ...child.val() });
            });

            // Sort by timestamp (newest first)
            complaints.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));

            container.innerHTML = complaints.map(c => `
                <div class="complaint-item">
                    <div class="complaint-header">
                        <span class="complaint-type">${c.typeLabel || c.type}</span>
                        <span class="complaint-time">${c.timestamp ? new Date(c.timestamp).toLocaleString('tr-TR') : ''}</span>
                    </div>
                    <div class="complaint-from">
                        👤 ${c.from?.username || 'Anonim'} (${c.from?.email || 'N/A'})
                    </div>
                    <div class="complaint-message">${c.message}</div>
                    <div class="complaint-actions">
                        <button class="btn btn-success btn-sm" onclick="app.founder.resolveComplaint('${c.id}')">
                            <i class="ri-check-line"></i> Çözüldü
                        </button>
                        <button class="btn btn-danger btn-sm" onclick="app.founder.deleteComplaint('${c.id}')">
                            <i class="ri-delete-bin-line"></i> Sil
                        </button>
                    </div>
                </div>
            `).join('');

        } catch (error) {
            console.error(error);
            alert('❌ Şikayetler yüklenirken hata oluştu!');
        }
    },

    // 17. Resolve Complaint
    async resolveComplaint(id) {
        try {
            await update(ref(db, `complaints/${id}`), {
                status: 'resolved',
                resolvedAt: serverTimestamp()
            });
            alert('✅ Şikayet çözüldü olarak işaretlendi!');
            this.loadComplaints();
        } catch (error) {
            console.error(error);
            alert('❌ Hata oluştu!');
        }
    },

    // 18. Delete Complaint
    async deleteComplaint(id) {
        const confirm = window.confirm('Bu şikayeti silmek istediğinizden emin misiniz?');
        if (!confirm) return;

        try {
            await set(ref(db, `complaints/${id}`), null);
            alert('✅ Şikayet silindi!');
            this.loadComplaints();
        } catch (error) {
            console.error(error);
            alert('❌ Hata oluştu!');
        }
    },

    // Load Stats
    async loadStats() {
        try {
            // Total users
            const usersSnap = await get(ref(db, 'users'));
            if (usersSnap.exists()) {
                const users = usersSnap.val();
                const totalUsers = Object.keys(users).length;
                const admins = Object.values(users).filter(u => u.role === 'admin').length;
                const banned = Object.values(users).filter(u => u.banned).length;

                DOMHelper.setText('founder-total-users', totalUsers);
                DOMHelper.setText('founder-total-admins', admins);
                DOMHelper.setText('founder-banned-users', banned);
            }

            // Total messages
            const messagesSnap = await get(ref(db, 'chats/global'));
            if (messagesSnap.exists()) {
                DOMHelper.setText('founder-total-messages', Object.keys(messagesSnap.val()).length);
            }
        } catch (error) {
            console.error(error);
        }
    }
};

// ============================================================================
//    MEMBERS MODULE
// ============================================================================

const Members = {
    allMembers: [],
    filteredMembers: [],
    onlineUserIds: [],
    currentFilter: 'all',
    searchQuery: '',

    async loadMembers() {
        try {
            // Get all users
            const usersSnap = await get(ref(db, 'users'));
            if (!usersSnap.exists()) {
                this.renderEmpty('Henüz üye yok.');
                return;
            }

            // Get online status
            const statusSnap = await get(ref(db, 'status'));
            this.onlineUserIds = statusSnap.exists() ? Object.keys(statusSnap.val()) : [];

            // Convert to array
            const users = usersSnap.val();
            this.allMembers = Object.entries(users).map(([uid, data]) => ({
                uid,
                ...data,
                isOnline: this.onlineUserIds.includes(uid)
            }));

            // Sort by online status, then by role
            this.allMembers.sort((a, b) => {
                if (a.isOnline !== b.isOnline) return b.isOnline - a.isOnline;
                const roleOrder = { founder: 0, admin: 1, member: 2 };
                return (roleOrder[a.role] || 2) - (roleOrder[b.role] || 2);
            });

            // Update stats
            DOMHelper.setText('members-total', this.allMembers.length);
            DOMHelper.setText('members-online', this.onlineUserIds.length);

            // Apply current filter
            this.applyFilters();

        } catch (error) {
            console.error('Üyeler yükleme hatası:', error);
            this.renderEmpty('Üyeler yüklenirken hata oluştu!');
        }
    },

    applyFilters() {
        let filtered = [...this.allMembers];

        // Apply role filter
        if (this.currentFilter !== 'all') {
            if (this.currentFilter === 'online') {
                filtered = filtered.filter(m => m.isOnline);
            } else {
                filtered = filtered.filter(m => m.role === this.currentFilter);
            }
        }

        // Apply search filter
        if (this.searchQuery) {
            const query = this.searchQuery.toLowerCase();
            filtered = filtered.filter(m =>
                m.username.toLowerCase().includes(query) ||
                m.email.toLowerCase().includes(query)
            );
        }

        this.filteredMembers = filtered;
        DOMHelper.setText('members-showing', filtered.length);
        this.renderMembersList();
    },

    searchMembers() {
        const input = DOMHelper.get('members-search');
        if (!input) return;
        this.searchQuery = input.value.trim();
        this.applyFilters();
    },

    filterByRole(role) {
        this.currentFilter = role;

        // Update filter buttons
        document.querySelectorAll('.filter-btn').forEach(btn => {
            btn.classList.remove('active');
        });
        const activeBtn = document.querySelector(`.filter-btn[data-role="${role}"]`);
        if (activeBtn) activeBtn.classList.add('active');

        this.applyFilters();
    },

    renderMembersList() {
        const grid = DOMHelper.get('members-list-container');
        if (!grid) return;

        // Update stats
        const onlineCount = this.filteredMembers.filter(m => this.onlineUserIds.includes(m.uid)).length;
        DOMHelper.setText('members-total', this.allMembers.length);
        DOMHelper.setText('members-online', onlineCount);
        DOMHelper.setText('members-showing', this.filteredMembers.length);

        if (this.filteredMembers.length === 0) {
            grid.innerHTML = '<p class="text-muted text-center w-full p-4">Üye bulunamadı.</p>';
            return;
        }

        const currentUser = Store.get('profile');

        grid.innerHTML = this.filteredMembers.map(member => {
            const isOnline = this.onlineUserIds.includes(member.uid);
            const statusClass = isOnline ? 'online' : 'offline';
            const statusText = isOnline ? 'Çevrimiçi' : 'Çevrimdışı';
            const isMe = currentUser && currentUser.uid === member.uid;

            return `
                <div class="member-list-item">
                    <div class="member-avatar-wrapper">
                        <img src="${member.avatar || 'https://ui-avatars.com/api/?name=' + member.username}" 
                             class="member-avatar" alt="${member.username}">
                    </div>
                    <div class="member-info">
                        <div class="member-details">
                            <span class="member-username">${member.username}</span>
                            <span class="member-status ${statusClass}">${statusText}</span>
                        </div>
                        <div class="member-actions">
                            ${!isMe ? `
                                <button class="btn-dm" onclick="app.chat.startDM('${member.uid}', '${member.username}', '${member.avatar}')">
                                    <i class="ri-message-2-line"></i> DM
                                </button>
                            ` : ''}
                        </div>
                    </div>
                </div>
            `;
        }).join('');
    },

    renderEmpty(message) {
        const container = DOMHelper.get('members-grid');
        if (container) {
            container.innerHTML = `<p class="text-muted">${message}</p>`;
        }
        DOMHelper.setText('members-total', '0');
        DOMHelper.setText('members-online', '0');
        DOMHelper.setText('members-showing', '0');
    },

    escapeHTML(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }
};

// ============================================================================
//    AIR HOCKEY GAME
// ============================================================================

const Game = {
    canvas: null,
    ctx: null,
    gameId: null,
    role: null, // 'host' or 'client'
    playerId: null,
    running: false,
    countdownRunning: false,
    width: 400,
    height: 600,
    // Physics State
    state: {
        puck: { x: 200, y: 300, vx: 0, vy: 0, r: 15 },
        p1: { x: 200, y: 550, r: 25, score: 0 },
        p2: { x: 200, y: 50, r: 25, score: 0 },
        status: 'waiting', // waiting, countdown, playing, finished
        winner: null // 'p1' or 'p2'
    },
    // Local input
    input: { x: 0, y: 0 },
    lastUpdate: 0,
    wsRef: null,

    init() {
        this.canvas = DOMHelper.get('hockey-canvas');
        this.ctx = this.canvas.getContext('2d');

        // Input Listeners
        if (this.canvas) {
            this.canvas.addEventListener('mousemove', (e) => this.handleInput(e));
            this.canvas.addEventListener('touchmove', (e) => {
                e.preventDefault(); // Prevent scroll while playing
                this.handleInput(e);
            }, { passive: false });
        }

        // Game Loop
        this.loop = this.loop.bind(this);
    },

    openGameMenu() {
        UI.openModal('game-select-modal');
    },

    async sendInvite(gameType = 'hockey') {
        // Close game menu first
        UI.closeModal('game-select-modal');

        const p = Store.get('profile');
        if (!p) {
            alert('Önce giriş yapmalısın!');
            return;
        }

        try {
            // Create game room
            const newGameRef = push(ref(db, 'games'));
            this.gameId = newGameRef.key;

            await set(newGameRef, {
                gameType: gameType,
                host: p.uid,
                hostName: p.username,
                status: 'waiting',
                created: serverTimestamp(),
                state: this.state
            });

            // Send invite to chat
            const gameMessages = {
                'hockey': 'Bir hava hokeyi maçı başlattı!',
                'chess': 'Bir satranç maçı başlattı!'
            };

            await push(ref(db, 'chats/global'), {
                uid: p.uid,
                name: p.username,
                avatar: p.avatar,
                ts: serverTimestamp(),
                type: 'invite',
                game: gameType,
                gameId: this.gameId,
                msg: gameMessages[gameType] || 'Bir oyun başlattı!'
            });

            // Join as host
            this.prepareGame(this.gameId, 'host');

        } catch (error) {
            console.error('Oyun oluşturma hatası:', error);
            alert('Hata oluştu!');
        }
    },

    async joinGame(gameId) {
        const p = Store.get('profile');
        if (!p) {
            alert('Önce giriş yapmalısın!');
            return;
        }

        try {
            const gameRef = ref(db, `games/${gameId}`);
            const snap = await get(gameRef);

            if (!snap.exists()) {
                alert('Oyun bulunamadı!');
                return;
            }

            const gameData = snap.val();
            if (gameData.status !== 'waiting') {
                alert('Bu oyun çoktan başladı veya bitti!');
                return;
            }

            // Cannot play against yourself
            if (gameData.host === p.uid) {
                // Re-join as host if accidentally closed
                this.prepareGame(gameId, 'host');
                return;
            }

            // Update game to add client
            await update(gameRef, {
                client: p.uid,
                clientName: p.username,
                status: 'countdown',
                startTime: Date.now() + 3000 // Start after 3s
            });

            this.prepareGame(gameId, 'client');

        } catch (error) {
            console.error(error);
        }
    },

    async prepareGame(gameId, role) {
        // Check game type first
        const gameRef = ref(db, `games/${gameId}`);
        const snap = await get(gameRef);

        if (!snap.exists()) return;

        const gameData = snap.val();

        // If it's a chess game, delegate to Chess module
        if (gameData.gameType === 'chess') {
            // Convert role: host = white, client = black
            const chessRole = role === 'host' ? 'white' : 'black';
            Chess.prepareGame(gameId, chessRole);
            return;
        }

        // Otherwise, it's hockey - continue with existing logic
        this.gameId = gameId;
        this.role = role;
        this.running = true;
        this.countdownRunning = false;
        this.playerId = Store.get('profile').uid;

        // Reset state
        this.state = {
            puck: { x: 200, y: 300, vx: 0, vy: 0, r: 15 },
            p1: { x: 200, y: 550, r: 25, score: 0 },
            p2: { x: 200, y: 50, r: 25, score: 0 },
            status: 'waiting',
            winner: null
        };

        // Open Modal
        UI.openModal('hockey-modal');

        // Initialize canvas context if not done
        if (!this.ctx) this.init();

        // Start Listening
        this.sync();

        // Start Loop
        requestAnimationFrame(this.loop);
    },

    sync() {
        if (!this.gameId) return;

        const gameRef = ref(db, `games/${this.gameId}`);

        onValue(gameRef, (snap) => {
            const data = snap.val();
            if (!data) return;

            // Sync names
            DOMHelper.setText('game-p1-name', data.hostName);
            DOMHelper.setText('game-p2-name', data.clientName || 'Bekleniyor...');

            // Get status from root level (more reliable)
            const currentStatus = data.status || 'waiting';

            // Sync State
            if (data.state) {
                // Determine which parts to sync based on role
                // Client syncs everything from host except their own paddle
                if (this.role === 'client') {
                    this.state.puck = data.state.puck || this.state.puck;
                    this.state.p1 = data.state.p1 || this.state.p1;
                    // Dont overwrite local p2 input immediately to avoid jitter, 
                    // process physics on host
                    if (data.state.p1) {
                        this.state.p1.score = data.state.p1.score || 0;
                    }
                    if (data.state.p2) {
                        this.state.p2.score = data.state.p2.score || 0;
                    }
                } else {
                    // Host syncs Client paddle
                    if (data.state.p2) {
                        this.state.p2.x = data.state.p2.x;
                        this.state.p2.y = data.state.p2.y;
                    }
                }
            }

            // Always sync status and winner to local state
            this.state.status = currentStatus;
            if (data.state && data.state.winner) {
                this.state.winner = data.state.winner;
            }

            // Update UI based on status
            this.updateUI(currentStatus);
        });
    },

    updateUI(status) {
        DOMHelper.setText('game-p1-score', this.state.p1.score);
        DOMHelper.setText('game-p2-score', this.state.p2.score);

        const overlay = DOMHelper.get('game-overlay');
        const countdown = DOMHelper.get('game-countdown');
        const statusText = DOMHelper.get('game-status-text');

        if (status === 'waiting') {
            overlay.classList.remove('hidden');
            countdown.textContent = '⏳';
            statusText.textContent = 'RAKIP BEKLENİYOR';
        } else if (status === 'countdown') {
            overlay.classList.remove('hidden');
            statusText.textContent = 'HAZIRLAN!';

            // Simple countdown animation simulation
            let count = 3;
            // Need interval? No, let's just use CSS anim or js timeout
            // This runs on every sync tick, so be careful not to restart anim
            const prev = countdown.textContent;
            if (prev === '⏳') {
                this.runCountdownAnim();
            }

        } else if (status === 'playing') {
            overlay.classList.add('hidden');
            statusText.textContent = 'OYNANIYOR';
            DOMHelper.get('game-rematch-btn').classList.add('hidden');
        } else if (status === 'finished') {
            overlay.classList.remove('hidden');

            // Determine if current player won or lost
            const winner = this.state.winner; // 'p1' or 'p2'
            const isHost = this.role === 'host';

            // Host is P1, Client is P2
            const didIWin = (isHost && winner === 'p1') || (!isHost && winner === 'p2');

            // Show WIN or LOSE based on result
            if (didIWin) {
                countdown.innerHTML = '<div class="win-emoji">🏆</div><div class="win-text">KAZANDIN!</div>';
                countdown.className = 'countdown win-result';
                statusText.textContent = 'ZAFER SENIN!';
            } else {
                countdown.innerHTML = '<div class="lose-emoji">💔</div><div class="lose-text">KAYBETTİN!</div>';
                countdown.className = 'countdown lose-result';
                statusText.textContent = 'BİR SONRAKI SEFERE!';
            }

            // NO REMATCH - One time game
            DOMHelper.get('game-rematch-btn').classList.add('hidden');

        } else if (status === 'aborted') {
            overlay.classList.remove('hidden');
            countdown.textContent = '❌';
            countdown.className = 'countdown';
            statusText.textContent = 'RAKİP AYRILDI';
            DOMHelper.get('game-rematch-btn').classList.add('hidden');
        }
    },

    runCountdownAnim() {
        // Prevent multiple countdowns
        if (this.countdownRunning) return;
        this.countdownRunning = true;

        const countdown = DOMHelper.get('game-countdown');
        let count = 3;
        countdown.textContent = count;

        const int = setInterval(() => {
            count--;
            if (count <= 0) {
                clearInterval(int);
                countdown.textContent = 'GO!';

                // Start game after showing GO! for 500ms
                setTimeout(() => {
                    if (this.role === 'host') {
                        // Update both status locations
                        update(ref(db, `games/${this.gameId}`), {
                            status: 'playing',
                            'state/status': 'playing'
                        });
                    }
                    this.countdownRunning = false;
                }, 500);
            } else {
                countdown.textContent = count;
            }
        }, 1000);
    },

    handleInput(e) {
        if (!this.running || !this.ctx) return;

        const rect = this.canvas.getBoundingClientRect();
        let x, y;

        if (e.touches && e.touches.length > 0) {
            x = e.touches[0].clientX - rect.left;
            y = e.touches[0].clientY - rect.top;
        } else {
            x = e.clientX - rect.left;
            y = e.clientY - rect.top;
        }

        // Scale coords
        x = x * (this.width / rect.width);
        y = y * (this.height / rect.height);

        // Mirror coordinates for client so they play from bottom on their screen
        if (this.role === 'client') {
            x = this.width - x;
            y = this.height - y;
        }

        // Limit paddle movement to half
        if (this.role === 'host') {
            // P1 - Bottom half
            if (y < this.height / 2 + this.state.p1.r) y = this.height / 2 + this.state.p1.r;
            if (y > this.height - this.state.p1.r) y = this.height - this.state.p1.r;
            if (x < this.state.p1.r) x = this.state.p1.r;
            if (x > this.width - this.state.p1.r) x = this.width - this.state.p1.r;
            this.state.p1.x = x;
            this.state.p1.y = y;
        } else {
            // P2 - Top half (in world coordinates)
            if (y > this.height / 2 - this.state.p2.r) y = this.height / 2 - this.state.p2.r;
            if (y < this.state.p2.r) y = this.state.p2.r;
            if (x < this.state.p2.r) x = this.state.p2.r;
            if (x > this.width - this.state.p2.r) x = this.width - this.state.p2.r;
            this.state.p2.x = x;
            this.state.p2.y = y;
        }

        // Send input to firebase
        this.sendInput();
    },

    async sendInput() {
        if (!this.gameId) return;

        // Optimization: Throttle (20 FPS)
        const now = Date.now();
        if (this.lastInputSync && now - this.lastInputSync < 50) return;
        this.lastInputSync = now;

        if (this.role === 'host') {
            update(ref(db, `games/${this.gameId}/state/p1`), { x: this.state.p1.x, y: this.state.p1.y });
        } else {
            update(ref(db, `games/${this.gameId}/state/p2`), { x: this.state.p2.x, y: this.state.p2.y });
        }
    },

    loop() {
        if (!this.running) return;

        this.update();
        this.draw();

        requestAnimationFrame(this.loop);
    },

    update() {
        // Host calculates physics
        if (this.role === 'host') {
            const { puck, p1, p2, status } = this.state;

            if (status !== 'playing') return;

            // Puck Movement
            puck.x += puck.vx;
            puck.y += puck.vy;

            // Friction
            puck.vx *= 0.99;
            puck.vy *= 0.99;

            // Wall Collisions
            if (puck.x - puck.r < 0 || puck.x + puck.r > this.width) {
                puck.vx = -puck.vx;
                puck.x = Math.max(puck.r, Math.min(this.width - puck.r, puck.x));
            }
            if (puck.y - puck.r < 0 || puck.y + puck.r > this.height) {
                // Goal Check
                if (puck.x > this.width / 3 && puck.x < (this.width / 3) * 2) {
                    // Top goal (y < 0) = P2's goal = P1 SCORES
                    // Bottom goal (y > height) = P1's goal = P2 SCORES
                    this.goal(puck.y < this.height / 2 ? 'p1' : 'p2');
                    return;
                }
                puck.vy = -puck.vy;
                puck.y = Math.max(puck.r, Math.min(this.height - puck.r, puck.y));
            }

            // Paddle Collisions
            this.checkPaddleCollision(p1, puck);
            this.checkPaddleCollision(p2, puck);

            // Sync Puck state to Firebase (Throttled)
            const now = Date.now();
            if (!this.lastPuckSync || now - this.lastPuckSync > 50) { // 20 updates per second
                update(ref(db, `games/${this.gameId}/state/puck`), this.state.puck);
                // Also sync P1 position regularly just in case
                update(ref(db, `games/${this.gameId}/state/p1`), { x: this.state.p1.x, y: this.state.p1.y });
                this.lastPuckSync = now;
            }
        }
    },

    checkPaddleCollision(paddle, puck) {
        const dx = puck.x - paddle.x;
        const dy = puck.y - paddle.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        const minDist = paddle.r + puck.r;

        if (dist < minDist) {
            const angle = Math.atan2(dy, dx);
            const force = 15; // Bounce force
            puck.vx = Math.cos(angle) * force;
            puck.vy = Math.sin(angle) * force;

            // Push puck out
            const pushOut = minDist - dist + 1;
            puck.x += Math.cos(angle) * pushOut;
            puck.y += Math.sin(angle) * pushOut;
        }
    },

    goal(scorer) {
        // Award point to scorer
        if (scorer === 'p1') {
            this.state.p1.score++;
        } else {
            this.state.p2.score++;
        }

        // Reset Puck to center
        this.state.puck.x = this.width / 2;
        this.state.puck.y = this.height / 2;
        this.state.puck.vx = 0;
        this.state.puck.vy = 0;

        // Check Winner - First to 3 wins
        if (this.state.p1.score >= 3 || this.state.p2.score >= 3) {
            this.state.status = 'finished';

            // Determine winner
            const winner = this.state.p1.score >= 3 ? 'p1' : 'p2';
            this.state.winner = winner;

            // Sync everything including root status
            update(ref(db, `games/${this.gameId}`), {
                status: 'finished',
                winner: winner
            });

            update(ref(db, `games/${this.gameId}/state`), {
                p1: this.state.p1,
                p2: this.state.p2,
                puck: this.state.puck,
                status: 'finished',
                winner: winner
            });
        } else {
            // Just sync scores and puck position
            update(ref(db, `games/${this.gameId}/state`), {
                p1: this.state.p1,
                p2: this.state.p2,
                puck: this.state.puck
            });
        }
    },

    draw() {
        const ctx = this.ctx;
        if (!ctx) return;

        // Save context state
        ctx.save();

        // Rotate canvas for client (p2) so they always play from bottom
        if (this.role === 'client') {
            ctx.translate(this.width / 2, this.height / 2);
            ctx.rotate(Math.PI); // 180 degrees
            ctx.translate(-this.width / 2, -this.height / 2);
        }

        // Clear
        ctx.fillStyle = '#050508';
        ctx.fillRect(0, 0, this.width, this.height);

        // Draw Field
        ctx.strokeStyle = '#222';
        ctx.lineWidth = 4;
        ctx.beginPath();
        ctx.moveTo(0, this.height / 2);
        ctx.lineTo(this.width, this.height / 2);
        ctx.stroke();

        ctx.beginPath();
        ctx.arc(this.width / 2, this.height / 2, 50, 0, Math.PI * 2);
        ctx.stroke();

        // Draw Goals - More visible with colors and glow
        const goalWidth = this.width / 3;
        const goalHeight = 15;
        const goalX = this.width / 3;

        // Top Goal (P2's goal) - Purple
        ctx.fillStyle = '#1a0a2e';
        ctx.fillRect(goalX, 0, goalWidth, goalHeight);

        // Goal border and glow
        ctx.strokeStyle = '#ae00ff';
        ctx.lineWidth = 3;
        ctx.shadowBlur = 15;
        ctx.shadowColor = '#ae00ff';
        ctx.strokeRect(goalX, 0, goalWidth, goalHeight);
        ctx.shadowBlur = 0;

        // Goal net pattern
        ctx.strokeStyle = '#ae00ff';
        ctx.lineWidth = 1;
        ctx.globalAlpha = 0.3;
        for (let i = 0; i < 5; i++) {
            ctx.beginPath();
            ctx.moveTo(goalX + (goalWidth / 5) * i, 0);
            ctx.lineTo(goalX + (goalWidth / 5) * i, goalHeight);
            ctx.stroke();
        }
        ctx.globalAlpha = 1;

        // Bottom Goal (P1's goal) - Cyan
        ctx.fillStyle = '#0a1a2e';
        ctx.fillRect(goalX, this.height - goalHeight, goalWidth, goalHeight);

        // Goal border and glow
        ctx.strokeStyle = '#00c6ff';
        ctx.lineWidth = 3;
        ctx.shadowBlur = 15;
        ctx.shadowColor = '#00c6ff';
        ctx.strokeRect(goalX, this.height - goalHeight, goalWidth, goalHeight);
        ctx.shadowBlur = 0;

        // Goal net pattern
        ctx.strokeStyle = '#00c6ff';
        ctx.lineWidth = 1;
        ctx.globalAlpha = 0.3;
        for (let i = 0; i < 5; i++) {
            ctx.beginPath();
            ctx.moveTo(goalX + (goalWidth / 5) * i, this.height - goalHeight);
            ctx.lineTo(goalX + (goalWidth / 5) * i, this.height);
            ctx.stroke();
        }
        ctx.globalAlpha = 1;

        // Draw Score on Canvas
        ctx.font = 'bold 24px Inter, sans-serif';
        ctx.textAlign = 'center';

        // P1 Score (bottom)
        ctx.fillStyle = '#00c6ff';
        ctx.shadowBlur = 10;
        ctx.shadowColor = '#00c6ff';
        ctx.fillText(this.state.p1.score, 30, this.height - 30);

        // P2 Score (top)
        ctx.fillStyle = '#ae00ff';
        ctx.shadowColor = '#ae00ff';
        ctx.fillText(this.state.p2.score, 30, 50);
        ctx.shadowBlur = 0;

        // Draw Players
        this.drawCircle(this.state.p1.x, this.state.p1.y, this.state.p1.r, '#00c6ff');
        this.drawCircle(this.state.p2.x, this.state.p2.y, this.state.p2.r, '#ae00ff');

        // Draw Puck
        this.drawCircle(this.state.puck.x, this.state.puck.y, this.state.puck.r, '#fff');

        // Restore context
        this.finishDraw();
    },

    drawCircle(x, y, r, color) {
        this.ctx.beginPath();
        this.ctx.arc(x, y, r, 0, Math.PI * 2);
        this.ctx.fillStyle = color;
        this.ctx.fill();
        this.ctx.shadowBlur = 15;
        this.ctx.shadowColor = color;
        this.ctx.stroke();
        this.ctx.shadowBlur = 0;

        // Restore context after drawing
        if (this.role === 'client') {
            this.ctx.restore();
            this.ctx.save();
            this.ctx.translate(this.width / 2, this.height / 2);
            this.ctx.rotate(Math.PI);
            this.ctx.translate(-this.width / 2, -this.height / 2);
        }
    },

    finishDraw() {
        // Restore context state at end of draw
        this.ctx.restore();
    },

    quitGame() {
        this.running = false;
        UI.closeModal('hockey-modal');

        // If game is active, notify other player
        if (this.gameId && this.state.status !== 'finished') {
            update(ref(db, `games/${this.gameId}`), {
                status: 'aborted'
            });
        }
    },

    rematch() {
        // Reset Logic - Only Host can restart
        if (this.role === 'host') {
            this.state.p1.score = 0;
            this.state.p2.score = 0;
            this.state.status = 'countdown';
            this.state.winner = null;
            update(ref(db, `games/${this.gameId}/state`), this.state);

            // Also reset root status
            update(ref(db, `games/${this.gameId}`), {
                status: 'playing',
                winner: null
            });
        }
    },

    toggleFullscreen() {
        const container = DOMHelper.get('game-container');
        const btn = DOMHelper.get('game-fullscreen-btn');

        if (!document.fullscreenElement &&
            !document.webkitFullscreenElement &&
            !document.mozFullScreenElement) {
            // Enter fullscreen
            if (container.requestFullscreen) {
                container.requestFullscreen();
            } else if (container.webkitRequestFullscreen) {
                container.webkitRequestFullscreen();
            } else if (container.mozRequestFullScreen) {
                container.mozRequestFullScreen();
            } else if (container.msRequestFullscreen) {
                container.msRequestFullscreen();
            }

            // Change icon to exit fullscreen
            if (btn) {
                btn.innerHTML = '<i class="ri-fullscreen-exit-line"></i>';
            }
            container.classList.add('fullscreen');
        } else {
            // Exit fullscreen
            if (document.exitFullscreen) {
                document.exitFullscreen();
            } else if (document.webkitExitFullscreen) {
                document.webkitExitFullscreen();
            } else if (document.mozCancelFullScreen) {
                document.mozCancelFullScreen();
            } else if (document.msExitFullscreen) {
                document.msExitFullscreen();
            }

            // Change icon back to fullscreen
            if (btn) {
                btn.innerHTML = '<i class="ri-fullscreen-line"></i>';
            }
            container.classList.remove('fullscreen');
        }
    }
};

// ============================================================================
//    CHESS GAME - COMPLETE IMPLEMENTATION
// ============================================================================

const Chess = {
    gameId: null,
    role: null, // 'white' or 'black'
    playerId: null,
    board: [],
    selectedPiece: null,
    currentTurn: 'white',
    gameStatus: 'waiting',
    moveHistory: [],
    capturedPieces: { white: [], black: [] },

    // Track special moves
    castlingRights: {
        white: { kingSide: true, queenSide: true },
        black: { kingSide: true, queenSide: true }
    },
    enPassantTarget: null, // { row, col } if en passant is possible
    kingPositions: { white: [7, 4], black: [0, 4] },

    // Chess pieces Unicode symbols
    pieces: {
        white: { king: '♔', queen: '♕', rook: '♖', bishop: '♗', knight: '♘', pawn: '♙' },
        black: { king: '♚', queen: '♛', rook: '♜', bishop: '♝', knight: '♞', pawn: '♟' }
    },

    initBoard() {
        // Initialize 8x8 board
        this.board = [];
        for (let row = 0; row < 8; row++) {
            this.board[row] = [];
            for (let col = 0; col < 8; col++) {
                this.board[row][col] = null;
            }
        }

        // Place pieces
        // Black pieces (top)
        this.board[0] = [
            { type: 'rook', color: 'black', moved: false },
            { type: 'knight', color: 'black', moved: false },
            { type: 'bishop', color: 'black', moved: false },
            { type: 'queen', color: 'black', moved: false },
            { type: 'king', color: 'black', moved: false },
            { type: 'bishop', color: 'black', moved: false },
            { type: 'knight', color: 'black', moved: false },
            { type: 'rook', color: 'black', moved: false }
        ];
        for (let col = 0; col < 8; col++) {
            this.board[1][col] = { type: 'pawn', color: 'black', moved: false };
        }

        // White pieces (bottom)
        for (let col = 0; col < 8; col++) {
            this.board[6][col] = { type: 'pawn', color: 'white', moved: false };
        }
        this.board[7] = [
            { type: 'rook', color: 'white', moved: false },
            { type: 'knight', color: 'white', moved: false },
            { type: 'bishop', color: 'white', moved: false },
            { type: 'queen', color: 'white', moved: false },
            { type: 'king', color: 'white', moved: false },
            { type: 'bishop', color: 'white', moved: false },
            { type: 'knight', color: 'white', moved: false },
            { type: 'rook', color: 'white', moved: false }
        ];

        // Reset special move tracking
        this.castlingRights = {
            white: { kingSide: true, queenSide: true },
            black: { kingSide: true, queenSide: true }
        };
        this.enPassantTarget = null;
        this.kingPositions = { white: [7, 4], black: [0, 4] };
    },

    renderBoard() {
        const boardEl = document.getElementById('chess-board');
        if (!boardEl) return;

        boardEl.innerHTML = '';

        // Add coordinate labels
        const files = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'];
        const ranks = ['8', '7', '6', '5', '4', '3', '2', '1'];

        for (let row = 0; row < 8; row++) {
            for (let col = 0; col < 8; col++) {
                const square = document.createElement('div');
                square.className = 'chess-square';
                square.dataset.row = row;
                square.dataset.col = col;

                // Checkerboard pattern
                if ((row + col) % 2 === 0) {
                    square.classList.add('light');
                } else {
                    square.classList.add('dark');
                }

                // Add coordinate labels
                if (col === 0) {
                    const rankLabel = document.createElement('span');
                    rankLabel.className = 'rank-label';
                    rankLabel.textContent = ranks[row];
                    square.appendChild(rankLabel);
                }
                if (row === 7) {
                    const fileLabel = document.createElement('span');
                    fileLabel.className = 'file-label';
                    fileLabel.textContent = files[col];
                    square.appendChild(fileLabel);
                }

                const piece = this.board[row][col];
                if (piece) {
                    const pieceEl = document.createElement('div');
                    pieceEl.className = `chess-piece ${piece.color}`;
                    pieceEl.textContent = this.pieces[piece.color][piece.type];
                    pieceEl.dataset.piece = piece.type;
                    square.appendChild(pieceEl);
                }

                square.addEventListener('click', () => this.handleSquareClick(row, col));
                boardEl.appendChild(square);
            }
        }

        // Highlight king if in check
        const kingPos = this.kingPositions[this.currentTurn];
        if (this.isInCheck(this.currentTurn)) {
            const kingSquare = document.querySelector(`[data-row="${kingPos[0]}"][data-col="${kingPos[1]}"]`);
            if (kingSquare) kingSquare.classList.add('in-check');
        }
    },

    handleSquareClick(row, col) {
        if (this.gameStatus !== 'playing') return;
        if (this.currentTurn !== this.role) return;

        const piece = this.board[row][col];

        if (this.selectedPiece) {
            // Try to move
            if (this.isValidMove(this.selectedPiece.row, this.selectedPiece.col, row, col)) {
                this.makeMove(this.selectedPiece.row, this.selectedPiece.col, row, col);
                this.selectedPiece = null;
                this.clearHighlights();
            } else {
                // Select different piece
                if (piece && piece.color === this.role) {
                    this.selectPiece(row, col);
                } else {
                    this.selectedPiece = null;
                    this.clearHighlights();
                }
            }
        } else {
            // Select piece
            if (piece && piece.color === this.role) {
                this.selectPiece(row, col);
            }
        }
    },

    selectPiece(row, col) {
        this.selectedPiece = { row, col };
        this.clearHighlights();

        const square = document.querySelector(`[data-row="${row}"][data-col="${col}"]`);
        if (square) square.classList.add('selected');

        // Highlight valid moves
        for (let r = 0; r < 8; r++) {
            for (let c = 0; c < 8; c++) {
                if (this.isValidMove(row, col, r, c)) {
                    const targetSquare = document.querySelector(`[data-row="${r}"][data-col="${c}"]`);
                    if (targetSquare) {
                        targetSquare.classList.add('valid-move');
                        // Add attack indicator if capturing
                        if (this.board[r][c]) {
                            targetSquare.classList.add('attack-move');
                        }
                    }
                }
            }
        }
    },

    clearHighlights() {
        document.querySelectorAll('.chess-square').forEach(sq => {
            sq.classList.remove('selected', 'valid-move', 'attack-move', 'in-check');
        });
    },

    isValidMove(fromRow, fromCol, toRow, toCol) {
        const piece = this.board[fromRow][fromCol];
        if (!piece) return false;

        // Can't capture own piece
        const target = this.board[toRow][toCol];
        if (target && target.color === piece.color) return false;

        // Check basic move validity
        if (!this.isBasicMoveValid(fromRow, fromCol, toRow, toCol)) return false;

        // Simulate move and check if it puts/keeps king in check
        return !this.wouldBeInCheck(fromRow, fromCol, toRow, toCol, piece.color);
    },

    isBasicMoveValid(fromRow, fromCol, toRow, toCol) {
        const piece = this.board[fromRow][fromCol];
        const target = this.board[toRow][toCol];
        const rowDiff = toRow - fromRow;
        const colDiff = toCol - fromCol;

        switch (piece.type) {
            case 'pawn':
                return this.isValidPawnMove(piece, fromRow, fromCol, toRow, toCol, rowDiff, colDiff);
            case 'rook':
                return this.isValidRookMove(fromRow, fromCol, toRow, toCol, rowDiff, colDiff);
            case 'knight':
                return (Math.abs(rowDiff) === 2 && Math.abs(colDiff) === 1) ||
                    (Math.abs(rowDiff) === 1 && Math.abs(colDiff) === 2);
            case 'bishop':
                return this.isValidBishopMove(fromRow, fromCol, toRow, toCol, rowDiff, colDiff);
            case 'queen':
                return this.isValidRookMove(fromRow, fromCol, toRow, toCol, rowDiff, colDiff) ||
                    this.isValidBishopMove(fromRow, fromCol, toRow, toCol, rowDiff, colDiff);
            case 'king':
                // Normal king move
                if (Math.abs(rowDiff) <= 1 && Math.abs(colDiff) <= 1) return true;
                // Castling
                return this.isValidCastling(piece, fromRow, fromCol, toRow, toCol, rowDiff, colDiff);
            default:
                return false;
        }
    },

    isValidPawnMove(piece, fromRow, fromCol, toRow, toCol, rowDiff, colDiff) {
        const direction = piece.color === 'white' ? -1 : 1;
        const startRow = piece.color === 'white' ? 6 : 1;

        // Move forward one square
        if (colDiff === 0 && rowDiff === direction && !this.board[toRow][toCol]) {
            return true;
        }

        // Move forward two squares from starting position
        if (colDiff === 0 && fromRow === startRow && rowDiff === 2 * direction) {
            if (!this.board[toRow][toCol] && !this.board[fromRow + direction][fromCol]) {
                return true;
            }
        }

        // Capture diagonally
        if (Math.abs(colDiff) === 1 && rowDiff === direction) {
            if (this.board[toRow][toCol]) return true;

            // En passant
            if (this.enPassantTarget &&
                this.enPassantTarget.row === toRow &&
                this.enPassantTarget.col === toCol) {
                return true;
            }
        }

        return false;
    },

    isValidRookMove(fromRow, fromCol, toRow, toCol, rowDiff, colDiff) {
        if (rowDiff !== 0 && colDiff !== 0) return false;
        return this.isPathClear(fromRow, fromCol, toRow, toCol);
    },

    isValidBishopMove(fromRow, fromCol, toRow, toCol, rowDiff, colDiff) {
        if (Math.abs(rowDiff) !== Math.abs(colDiff)) return false;
        return this.isPathClear(fromRow, fromCol, toRow, toCol);
    },

    isValidCastling(piece, fromRow, fromCol, toRow, toCol, rowDiff, colDiff) {
        // Must be king's first move
        if (piece.moved) return false;

        // Must be on same row
        if (rowDiff !== 0) return false;

        // Must be castling move (2 squares)
        if (Math.abs(colDiff) !== 2) return false;

        const color = piece.color;
        const kingSide = colDiff > 0;

        // Check castling rights
        if (kingSide && !this.castlingRights[color].kingSide) return false;
        if (!kingSide && !this.castlingRights[color].queenSide) return false;

        // Check if king is in check
        if (this.isInCheck(color)) return false;

        // Check if path is clear and not under attack
        const step = kingSide ? 1 : -1;
        for (let c = fromCol + step; c !== toCol + step; c += step) {
            // Path must be clear
            if (this.board[fromRow][c] && c !== fromCol) return false;

            // Squares king moves through must not be under attack
            if (c !== toCol + step && this.isSquareUnderAttack(fromRow, c, color)) {
                return false;
            }
        }

        // Check if rook exists and hasn't moved
        const rookCol = kingSide ? 7 : 0;
        const rook = this.board[fromRow][rookCol];
        if (!rook || rook.type !== 'rook' || rook.moved) return false;

        return true;
    },

    isPathClear(fromRow, fromCol, toRow, toCol) {
        const rowStep = toRow > fromRow ? 1 : toRow < fromRow ? -1 : 0;
        const colStep = toCol > fromCol ? 1 : toCol < fromCol ? -1 : 0;

        let row = fromRow + rowStep;
        let col = fromCol + colStep;

        while (row !== toRow || col !== toCol) {
            if (this.board[row][col]) return false;
            row += rowStep;
            col += colStep;
        }

        return true;
    },

    wouldBeInCheck(fromRow, fromCol, toRow, toCol, color) {
        // Simulate the move
        const piece = this.board[fromRow][fromCol];
        const captured = this.board[toRow][toCol];
        this.board[toRow][toCol] = piece;
        this.board[fromRow][fromCol] = null;

        // Update king position temporarily if moving king
        let oldKingPos = null;
        if (piece.type === 'king') {
            oldKingPos = [...this.kingPositions[color]];
            this.kingPositions[color] = [toRow, toCol];
        }

        const inCheck = this.isInCheck(color);

        // Undo the move
        this.board[fromRow][fromCol] = piece;
        this.board[toRow][toCol] = captured;
        if (oldKingPos) {
            this.kingPositions[color] = oldKingPos;
        }

        return inCheck;
    },

    isInCheck(color) {
        const kingPos = this.kingPositions[color];
        return this.isSquareUnderAttack(kingPos[0], kingPos[1], color);
    },

    isSquareUnderAttack(row, col, byColor) {
        const enemyColor = byColor === 'white' ? 'black' : 'white';

        // Check all enemy pieces
        for (let r = 0; r < 8; r++) {
            for (let c = 0; c < 8; c++) {
                const piece = this.board[r][c];
                if (piece && piece.color === enemyColor) {
                    // For pawns, check diagonal attacks only
                    if (piece.type === 'pawn') {
                        const direction = piece.color === 'white' ? -1 : 1;
                        const rowDiff = row - r;
                        const colDiff = Math.abs(col - c);
                        if (rowDiff === direction && colDiff === 1) {
                            return true;
                        }
                    } else if (this.isBasicMoveValid(r, c, row, col)) {
                        return true;
                    }
                }
            }
        }

        return false;
    },

    async makeMove(fromRow, fromCol, toRow, toCol) {
        const piece = this.board[fromRow][fromCol];
        const captured = this.board[toRow][toCol];
        let specialMove = null;

        // Handle en passant capture
        if (piece.type === 'pawn' && this.enPassantTarget &&
            toRow === this.enPassantTarget.row && toCol === this.enPassantTarget.col) {
            const capturedPawnRow = piece.color === 'white' ? toRow + 1 : toRow - 1;
            const capturedPawn = this.board[capturedPawnRow][toCol];
            this.board[capturedPawnRow][toCol] = null;
            this.capturedPieces[piece.color].push(capturedPawn);
            specialMove = 'en-passant';
        }

        // Handle castling
        if (piece.type === 'king' && Math.abs(toCol - fromCol) === 2) {
            const kingSide = toCol > fromCol;
            const rookFromCol = kingSide ? 7 : 0;
            const rookToCol = kingSide ? toCol - 1 : toCol + 1;

            // Move rook
            const rook = this.board[fromRow][rookFromCol];
            this.board[fromRow][rookToCol] = rook;
            this.board[fromRow][rookFromCol] = null;
            rook.moved = true;

            specialMove = kingSide ? 'castle-kingside' : 'castle-queenside';
        }

        // Capture piece
        if (captured) {
            this.capturedPieces[piece.color].push(captured);
            this.updateCapturedPieces();
        }

        // Move piece
        this.board[toRow][toCol] = piece;
        this.board[fromRow][fromCol] = null;
        piece.moved = true;

        // Update king position
        if (piece.type === 'king') {
            this.kingPositions[piece.color] = [toRow, toCol];

            // Disable castling after king moves
            this.castlingRights[piece.color].kingSide = false;
            this.castlingRights[piece.color].queenSide = false;
        }

        // Update castling rights on rook move
        if (piece.type === 'rook') {
            if (fromRow === 0 && fromCol === 0) this.castlingRights.black.queenSide = false;
            if (fromRow === 0 && fromCol === 7) this.castlingRights.black.kingSide = false;
            if (fromRow === 7 && fromCol === 0) this.castlingRights.white.queenSide = false;
            if (fromRow === 7 && fromCol === 7) this.castlingRights.white.kingSide = false;
        }

        // Update en passant target
        this.enPassantTarget = null;
        if (piece.type === 'pawn' && Math.abs(toRow - fromRow) === 2) {
            this.enPassantTarget = {
                row: piece.color === 'white' ? fromRow - 1 : fromRow + 1,
                col: fromCol
            };
        }

        // Pawn promotion (auto-queen for now)
        if (piece.type === 'pawn' && (toRow === 0 || toRow === 7)) {
            piece.type = 'queen';
            specialMove = 'promotion';
        }

        // Record move
        const move = {
            from: { row: fromRow, col: fromCol },
            to: { row: toRow, col: toCol },
            piece: this.board[toRow][toCol].type,
            captured: captured ? captured.type : null,
            special: specialMove
        };
        this.moveHistory.push(move);
        this.updateMoveHistory();

        // Switch turn
        this.currentTurn = this.currentTurn === 'white' ? 'black' : 'white';
        this.updateTurnIndicator();

        // Sync to Firebase
        await this.syncGameState();

        // Re-render
        this.renderBoard();

        // Check for checkmate/stalemate
        this.checkGameEnd();
    },

    updateCapturedPieces() {
        const whiteEl = document.getElementById('captured-white');
        const blackEl = document.getElementById('captured-black');

        if (whiteEl) {
            whiteEl.innerHTML = this.capturedPieces.white.map(p =>
                `<span class="captured-piece">${this.pieces.white[p.type]}</span>`
            ).join('');
        }

        if (blackEl) {
            blackEl.innerHTML = this.capturedPieces.black.map(p =>
                `<span class="captured-piece">${this.pieces.black[p.type]}</span>`
            ).join('');
        }
    },

    updateMoveHistory() {
        const listEl = document.getElementById('chess-moves-list');
        if (!listEl) return;

        if (this.moveHistory.length === 0) {
            listEl.innerHTML = '<p class="text-muted">Henüz hamle yapılmadı</p>';
            return;
        }

        listEl.innerHTML = this.moveHistory.map((move, idx) => {
            const moveNum = Math.floor(idx / 2) + 1;
            const notation = this.getMoveNotation(move);
            const isWhiteMove = idx % 2 === 0;
            return `<div class="move-item ${isWhiteMove ? 'white-move' : 'black-move'}">${isWhiteMove ? moveNum + '. ' : ''}${notation}</div>`;
        }).join('');

        listEl.scrollTop = listEl.scrollHeight;
    },

    getMoveNotation(move) {
        const cols = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'];
        const from = cols[move.from.col] + (8 - move.from.row);
        const to = cols[move.to.col] + (8 - move.to.row);

        if (move.special === 'castle-kingside') return 'O-O';
        if (move.special === 'castle-queenside') return 'O-O-O';

        const pieceSymbol = move.piece === 'pawn' ? '' : move.piece[0].toUpperCase();
        const capture = move.captured ? 'x' : '-';
        const result = `${pieceSymbol}${from}${capture}${to}`;

        if (move.special === 'promotion') return result + '=Q';
        return result;
    },

    updateTurnIndicator() {
        const turnEl = document.getElementById('chess-turn');
        if (turnEl) {
            const isCheck = this.isInCheck(this.currentTurn);
            const checkText = isCheck ? ' (ŞAH!)' : '';
            turnEl.textContent = (this.currentTurn === 'white' ? 'Beyazın Sırası' : 'Siyahın Sırası') + checkText;
            turnEl.className = `turn-indicator ${this.currentTurn} ${isCheck ? 'check' : ''}`;
        }
    },

    hasAnyValidMoves(color) {
        for (let fromRow = 0; fromRow < 8; fromRow++) {
            for (let fromCol = 0; fromCol < 8; fromCol++) {
                const piece = this.board[fromRow][fromCol];
                if (piece && piece.color === color) {
                    for (let toRow = 0; toRow < 8; toRow++) {
                        for (let toCol = 0; toCol < 8; toCol++) {
                            if (this.isValidMove(fromRow, fromCol, toRow, toCol)) {
                                return true;
                            }
                        }
                    }
                }
            }
        }
        return false;
    },

    checkGameEnd() {
        const currentColor = this.currentTurn;
        const hasValidMoves = this.hasAnyValidMoves(currentColor);

        if (!hasValidMoves) {
            if (this.isInCheck(currentColor)) {
                // Checkmate
                const winner = currentColor === 'white' ? 'black' : 'white';
                this.endGame(winner, 'checkmate');
            } else {
                // Stalemate
                this.endGame(null, 'stalemate');
            }
        }
    },

    async endGame(winner, reason) {
        this.gameStatus = 'ended';

        const resultEl = document.getElementById('chess-result');
        const overlayEl = document.getElementById('chess-overlay');

        if (resultEl && overlayEl) {
            let html = '';

            if (reason === 'checkmate') {
                const winnerText = winner === 'white' ? 'Beyaz' : 'Siyah';
                const didIWin = winner === this.role;
                html = `
                    <h2 class="${didIWin ? 'win' : 'lose'}">${didIWin ? '🎉 ŞAH MAT - KAZANDIN!' : '😢 ŞAH MAT - KAYBETTİN!'}</h2>
                    <p>${winnerText} oyunu kazandı!</p>
                `;
            } else if (reason === 'stalemate') {
                html = `
                    <h2 class="draw">🤝 PAT - BERABERE!</h2>
                    <p>Yasal hamle kalmadı.</p>
                `;
            } else if (reason === 'resignation') {
                const winnerText = winner === 'white' ? 'Beyaz' : 'Siyah';
                html = `
                    <h2>${winner === this.role ? '🎉 KAZANDIN!' : '😢 KAYBETTİN!'}</h2>
                    <p>${winnerText} pes etti!</p>
                `;
            }

            resultEl.innerHTML = html;
            overlayEl.classList.remove('hidden');
        }

        // Update Firebase
        await update(ref(db, `games/${this.gameId}`), {
            status: 'ended',
            winner: winner,
            endReason: reason
        });
    },

    async syncGameState() {
        if (!this.gameId) return;

        await update(ref(db, `games/${this.gameId}`), {
            board: this.board,
            currentTurn: this.currentTurn,
            moveHistory: this.moveHistory,
            capturedPieces: this.capturedPieces,
            castlingRights: this.castlingRights,
            enPassantTarget: this.enPassantTarget,
            kingPositions: this.kingPositions
        });
    },

    prepareGame(gameId, role) {
        this.gameId = gameId;
        this.role = role;
        this.playerId = Store.get('profile').uid;
        this.gameStatus = 'playing';
        this.currentTurn = 'white';
        this.moveHistory = [];
        this.capturedPieces = { white: [], black: [] };

        // Initialize board
        this.initBoard();

        // Open modal
        UI.openModal('chess-modal');

        // Set player info
        this.updatePlayerInfo();

        // Render board
        this.renderBoard();

        // Start syncing
        this.sync();
    },

    async updatePlayerInfo() {
        const gameRef = ref(db, `games/${this.gameId}`);
        const snap = await get(gameRef);

        if (!snap.exists()) return;

        const data = snap.val();

        // Get user profiles
        const hostSnap = await get(ref(db, `users/${data.host}`));
        const clientSnap = data.client ? await get(ref(db, `users/${data.client}`)) : null;

        const hostData = hostSnap.val();
        const clientData = clientSnap ? clientSnap.val() : null;

        // White is always host, black is client
        document.getElementById('chess-white-name').textContent = hostData?.username || 'Oyuncu 1';
        document.getElementById('chess-black-name').textContent = clientData?.username || 'Bekleniyor...';

        if (hostData?.avatar) {
            document.getElementById('chess-white-avatar').src = hostData.avatar;
        }
        if (clientData?.avatar) {
            document.getElementById('chess-black-avatar').src = clientData.avatar;
        }
    },

    sync() {
        if (!this.gameId) return;

        const gameRef = ref(db, `games/${this.gameId}`);

        onValue(gameRef, (snap) => {
            const data = snap.val();
            if (!data) return;

            // Update game state from Firebase
            if (data.board) {
                this.board = data.board;
                this.renderBoard();
            }

            if (data.currentTurn) {
                this.currentTurn = data.currentTurn;
                this.updateTurnIndicator();
            }

            if (data.moveHistory) {
                this.moveHistory = data.moveHistory;
                this.updateMoveHistory();
            }

            if (data.capturedPieces) {
                this.capturedPieces = data.capturedPieces;
                this.updateCapturedPieces();
            }

            if (data.castlingRights) {
                this.castlingRights = data.castlingRights;
            }

            if (data.enPassantTarget) {
                this.enPassantTarget = data.enPassantTarget;
            }

            if (data.kingPositions) {
                this.kingPositions = data.kingPositions;
            }

            if (data.status === 'ended' && data.winner !== undefined) {
                this.endGame(data.winner, data.endReason || 'unknown');
            }

            this.updatePlayerInfo();
        });
    },

    async quitGame() {
        if (this.gameId) {
            await set(ref(db, `games/${this.gameId}`), null);
        }

        this.gameId = null;
        this.gameStatus = 'waiting';
        UI.closeModal('chess-modal');
    },

    async resign() {
        const confirmResign = window.confirm('Pes etmek istediğinizden emin misiniz?');
        if (!confirmResign) return;

        const winner = this.role === 'white' ? 'black' : 'white';
        await this.endGame(winner, 'resignation');
    },

    async offerDraw() {
        alert('Beraberlik teklifi özelliği yakında eklenecek!');
    },

    async requestRematch() {
        alert('Tekrar oynama özelliği yakında eklenecek!');
    }
};

// ============================================================================
//    NOTIFICATIONS MODULE
// ============================================================================

const Notifications = {
    list: [],
    unreadCount: 0,
    isOpen: false,

    init() {
        this.listenAnnouncements();

        // Listen for auth changes to get user specific warnings
        onAuthStateChanged(auth, (user) => {
            if (user) {
                this.listenUserWarnings(user.uid);
            } else {
                // Clear user warnings on logout
                this.list = this.list.filter(l => l.category !== 'warning');
                this.updateBadge();
                this.render();
            }
        });
    },

    listenAnnouncements() {
        const q = query(ref(db, 'announcements'), limitToLast(20));
        onValue(q, (snap) => {
            const data = snap.val();
            if (!data) return;

            const announcements = Object.entries(data).map(([id, val]) => ({
                id,
                ...val,
                category: 'announcement',
                icon: val.type === 'danger' ? 'ri-error-warning-line'
                    : val.type === 'warning' ? 'ri-alert-line'
                        : val.type === 'success' ? 'ri-checkbox-circle-line'
                            : 'ri-information-line'
            }));

            this.mergeNotifications(announcements);
        });
    },

    listenUserWarnings(uid) {
        const q = query(ref(db, `warnings/${uid}`), limitToLast(20));
        onValue(q, (snap) => {
            const data = snap.val();
            if (!data) return;

            const warnings = Object.entries(data).map(([id, val]) => ({
                id,
                ...val,
                category: 'warning',
                type: 'danger',
                title: '⚠️ Özel Uyarı',
                icon: 'ri-alarm-warning-line'
            }));

            this.mergeNotifications(warnings);
        });
    },

    mergeNotifications(newItems) {
        newItems.forEach(item => {
            const exists = this.list.find(x => x.id === item.id);
            if (!exists) {
                this.list.push({ ...item });
            }
        });

        // Sort by timestamp descending
        this.list.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));

        this.updateBadge();
        this.render();
    },

    updateBadge() {
        const lastReadTime = localStorage.getItem('last_notif_read_time') || 0;
        this.unreadCount = this.list.filter(n => (n.timestamp || 0) > lastReadTime).length;

        const badge = DOMHelper.get('notif-badge');
        if (badge) {
            badge.textContent = this.unreadCount;
            if (this.unreadCount > 0) badge.classList.remove('hidden');
            else badge.classList.add('hidden');
        }
    },

    render() {
        const container = DOMHelper.get('notification-list');
        if (!container) return;

        if (this.list.length === 0) {
            container.innerHTML = '<p class="text-muted text-center p-4">Bildirim yok.</p>';
            return;
        }

        const lastReadTime = localStorage.getItem('last_notif_read_time') || 0;

        container.innerHTML = this.list.map(notif => {
            const isUnread = (notif.timestamp || 0) > lastReadTime;
            const time = notif.timestamp ? new Date(notif.timestamp).toLocaleDateString('tr-TR') : '';
            const iconClass = notif.type || 'info';

            return `
                <div class="notification-item ${isUnread ? 'unread' : ''}">
                    <div class="notification-icon ${iconClass}">
                        <i class="${notif.icon}"></i>
                    </div>
                    <div class="notification-content">
                        <div class="notif-title">${notif.title}</div>
                        <div class="notif-message">${notif.message}</div>
                        <div class="notif-time">${time}</div>
                    </div>
                </div>
            `;
        }).join('');
    },

    toggleDropdown() {
        const dropdown = DOMHelper.get('notification-dropdown');
        if (dropdown) {
            dropdown.classList.toggle('active');
        }
    },

    markAllRead() {
        const now = Date.now();
        localStorage.setItem('last_notif_read_time', now);
        this.updateBadge();
        this.render();
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
    profile: Profile,
    settings: Settings,
    founder: Founder,
    members: Members,
    game: Game,
    chess: Chess,
    notifications: Notifications // Added Notifications
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
    Settings.init();  // Initialize theme first
    Auth.init();
    Chat.init();
    Game.init();
    Notifications.init(); // Initialize Notifications

    // Avatar URL input listener for live preview
    const avatarUrlInput = DOMHelper.get('settings-avatar-url');
    if (avatarUrlInput) {
        avatarUrlInput.addEventListener('input', (e) => {
            const preview = DOMHelper.get('settings-avatar-preview');
            const url = e.target.value.trim();

            if (preview && url) {
                // Validate URL format
                try {
                    new URL(url);
                    preview.src = url;
                } catch (error) {
                    // Invalid URL, keep current preview
                }
            }
        });
    }

    // Close modal when clicking outside (on overlay)
    document.querySelectorAll('.modal-overlay').forEach(overlay => {
        overlay.addEventListener('click', (e) => {
            // Only close if clicking directly on overlay, not on modal content
            if (e.target === overlay) {
                const modalId = overlay.id;
                if (modalId) {
                    UI.closeModal(modalId);
                }
            }
        });
    });


    // Close modal with ESC key
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            // Find and close any active modal
            const activeModal = document.querySelector('.modal-overlay.active');
            if (activeModal) {
                UI.closeModal(activeModal.id);
            }

            // Also close sidebar on mobile if open
            const sidebar = DOMHelper.get('app-sidebar');
            if (sidebar && sidebar.classList.contains('mobile-active')) {
                UI.closeSidebar();
            }
        }
    });

    // Close sidebar when clicking on backdrop (mobile)
    const sidebar = DOMHelper.get('app-sidebar');
    if (sidebar) {
        sidebar.addEventListener('click', (e) => {
            // Only close if clicking on the backdrop (::before pseudo-element area)
            if (e.target === sidebar && sidebar.classList.contains('mobile-active')) {
                UI.closeSidebar();
            }
        });
    }

    console.log('%c🚀 SAHIKALI', 'font-size: 24px; font-weight: bold; color: #00c6ff;');
    console.log('%cModern Community Platform', 'font-size: 14px; color: #ae00ff;');
});
// ============================================================================
//    PERFORMANCE & BUG FIX UTILITIES
// ============================================================================

/**
 * Performance optimizations and bug fixes
 */
const PerformanceBoost = {
    // Debounce function for expensive operations
    debounce(func, wait) {
        let timeout;
        return function executedFunction(...args) {
            const later = () => {
                clearTimeout(timeout);
                func(...args);
            };
            clearTimeout(timeout);
            timeout = setTimeout(later, wait);
        };
    },

    // Throttle function for scroll/resize events
    throttle(func, limit) {
        let inThrottle;
        return function (...args) {
            if (!inThrottle) {
                func.apply(this, args);
                inThrottle = true;
                setTimeout(() => inThrottle = false, limit);
            }
        };
    },

    // Request Animation Frame wrapper
    raf(callback) {
        return window.requestAnimationFrame(callback);
    },

    // Cancel Animation Frame wrapper
    cancelRaf(id) {
        return window.cancelAnimationFrame(id);
    },

    // Lazy load images
    lazyLoadImages() {
        const images = document.querySelectorAll('img[data-src]');
        const imageObserver = new IntersectionObserver((entries, observer) => {
            entries.forEach(entry => {
                if (entry.isIntersecting) {
                    const img = entry.target;
                    img.src = img.dataset.src;
                    img.removeAttribute('data-src');
                    observer.unobserve(img);
                }
            });
        });

        images.forEach(img => imageObserver.observe(img));
    },

    // Smooth scroll to element
    smoothScrollTo(elementId) {
        const element = document.getElementById(elementId);
        if (element) {
            element.scrollIntoView({
                behavior: 'smooth',
                block: 'start'
            });
        }
    },

    // Optimize animations with will-change
    optimizeElement(element) {
        if (element) {
            element.style.willChange = 'transform';
            // Remove after animation
            setTimeout(() => {
                element.style.willChange = 'auto';
            }, 1000);
        }
    },

    // Add ripple effect to buttons
    addRippleEffect(button, event) {
        const ripple = document.createElement('span');
        const rect = button.getBoundingClientRect();
        const size = Math.max(rect.width, rect.height);
        const x = event.clientX - rect.left - size / 2;
        const y = event.clientY - rect.top - size / 2;

        ripple.style.width = ripple.style.height = `${size}px`;
        ripple.style.left = `${x}px`;
        ripple.style.top = `${y}px`;
        ripple.classList.add('ripple');

        button.appendChild(ripple);

        setTimeout(() => {
            ripple.remove();
        }, 600);
    },

    // Initialize all button ripples
    initButtonRipples() {
        document.querySelectorAll('.btn, button').forEach(button => {
            button.addEventListener('click', (e) => {
                // Don't add ripple if already happening
                if (!button.querySelector('.ripple')) {
                    this.addRippleEffect(button, e);
                }
            });
        });
    },

    // Fix iOS hover states
    fixiOSHover() {
        if (/iPad|iPhone|iPod/.test(navigator.userAgent)) {
            document.addEventListener('touchstart', function () { }, true);
        }
    },

    // Prevent double-tap zoom on buttons
    preventDoubleTapZoom() {
        let lastTouchEnd = 0;
        document.addEventListener('touchend', (event) => {
            const now = Date.now();
            if (now - lastTouchEnd <= 300) {
                event.preventDefault();
            }
            lastTouchEnd = now;
        }, false);
    },

    // Memory leak prevention - cleanup listeners
    cleanupListeners(element) {
        if (element) {
            const clone = element.cloneNode(true);
            element.parentNode.replaceChild(clone, element);
            return clone;
        }
    },

    // Initialize all optimizations
    init() {
        console.log('ğŸš€ Initializing Performance Boost...');

        // Fix iOS issues
        this.fixiOSHover();
        this.preventDoubleTapZoom();

        // Init button effects
        this.initButtonRipples();

        // Lazy load images
        this.lazyLoadImages();

        // Optimize scroll performance
        const optimizedScroll = this.throttle(() => {
            // Scroll handler
        }, 100);

        window.addEventListener('scroll', optimizedScroll, { passive: true });

        console.log('âœ… Performance Boost Active!');
    }
};

// Auto-initialize on DOMContentLoaded
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        PerformanceBoost.init();
    });
} else {
    PerformanceBoost.init();
}

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
    module.exports = PerformanceBoost;
}
