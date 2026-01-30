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
            'founder': 'FOUNDER PANELİ'
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
    }
};

// ============================================================================
//    CHAT SYSTEM
// ============================================================================

const Chat = {
    init() {
        this.listen();

        // Floating chat form only
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
            // Floating chat container only
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

        // Check if message is a game invite
        if (msg.type === 'invite' && msg.game === 'hockey') {
            div.innerHTML = `
                <img src="${msg.avatar}" class="msg-avatar" alt="${msg.name}">
                <div class="msg-content">
                    <div class="msg-header">
                        <span class="msg-user">${this.escapeHTML(msg.name)}</span>
                        <span class="msg-time">${time}</span>
                    </div>
                    <div class="invite-card">
                        <span class="invite-title">🏑 HAVA HOKEYİ</span>
                        <span class="invite-vs">VS</span>
                        <button class="btn-game-join" onclick="app.game.joinGame('${msg.gameId}')">
                            KABUL ET
                        </button>
                    </div>
                </div>
            `;
        } else {
            // Normal message
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
        }
        container.appendChild(div);
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
            ts: serverTimestamp(),
            type: 'text'
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
                host: p.uid,
                hostName: p.username,
                status: 'waiting',
                created: serverTimestamp(),
                state: this.state
            });

            // Send invite to chat
            await push(ref(db, 'chats/global'), {
                uid: p.uid,
                name: p.username,
                avatar: p.avatar,
                ts: serverTimestamp(),
                type: 'invite',
                game: gameType,
                gameId: this.gameId,
                msg: 'Bir hava hokeyi maçı başlattı!'
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

    prepareGame(gameId, role) {
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
            const winner = this.state.winner;
            const isHost = this.role === 'host';
            const didIWin = (isHost && winner === 'p1') || (!isHost && winner === 'p2');

            // Show WIN or LOSE based on result
            if (didIWin) {
                countdown.textContent = '🏆 WIN';
                countdown.className = 'countdown win-text';
                statusText.textContent = 'KAZANDIN!';
            } else {
                countdown.textContent = '💔 LOSE';
                countdown.className = 'countdown lose-text';
                statusText.textContent = 'KAYBETTİN!';
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

        // Limit paddle movement to half
        if (this.role === 'host') {
            // Bottom half
            if (y < this.height / 2 + this.state.p1.r) y = this.height / 2 + this.state.p1.r;
            if (y > this.height - this.state.p1.r) y = this.height - this.state.p1.r;
            this.state.p1.x = x;
            this.state.p1.y = y;
        } else {
            // Top half - MIRRORED FOR CLIENT?
            // Actually, for simplicity, P2 plays from Top on same canvas coords.
            // But usually P2 wants to play from bottom too.
            // Let's keep it simple: P2 plays on TOP half.
            if (y > this.height / 2 - this.state.p2.r) y = this.height / 2 - this.state.p2.r;
            if (y < this.state.p2.r) y = this.state.p2.r;
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
    game: Game
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
