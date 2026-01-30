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
//    INITIALIZATION
// ============================================================================

window.app = {
    auth: Auth,
    ui: UI,
    router: Router,
    chat: Chat,
    profile: Profile,
    settings: Settings,
    founder: Founder
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

    console.log('%c🚀 SAHIKALI', 'font-size: 24px; font-weight: bold; color: #00c6ff;');
    console.log('%cModern Community Platform', 'font-size: 14px; color: #ae00ff;');
});
