// ========================================
// SECURITY & UTILITIES
// ========================================
const Security = {
    escapeHtml: (text) => {
        if (!text) return '';
        const map = {
            '&': '&amp;',
            '<': '&lt;',
            '>': '&gt;',
            '"': '&quot;',
            "'": '&#039;'
        };
        return text.replace(/[&<>"']/g, m => map[m]);
    },
    
    sanitizeInput: (input) => {
        return input
            .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
            .replace(/javascript:/gi, '')
            .replace(/on\w+=/gi, '')
            .trim();
    },
    
    isValidUrl: (url) => {
        try {
            const urlObj = new URL(url);
            return ['http:', 'https:'].includes(urlObj.protocol) && 
                   /\.(jpg|jpeg|png|gif|webp|svg)$/i.test(urlObj.pathname);
        } catch {
            return false;
        }
    }
};

class RateLimiter {
    constructor(limit, windowMs) {
        this.limits = new Map();
        this.limit = limit;
        this.windowMs = windowMs;
    }
    
    canProceed(key) {
        const now = Date.now();
        const userLimits = this.limits.get(key) || [];
        const validLimits = userLimits.filter(time => now - time < this.windowMs);
        
        if (validLimits.length >= this.limit) {
            return false;
        }
        
        validLimits.push(now);
        this.limits.set(key, validLimits);
        return true;
    }
}

class CacheManager {
    constructor(namespace) {
        this.namespace = namespace;
    }
    
    set(key, data, ttl = 300000) { // 5 minutes default
        const item = {
            data,
            expiry: Date.now() + ttl
        };
        localStorage.setItem(`${this.namespace}:${key}`, JSON.stringify(item));
    }
    
    get(key) {
        const item = localStorage.getItem(`${this.namespace}:${key}`);
        if (!item) return null;
        
        const parsed = JSON.parse(item);
        if (Date.now() > parsed.expiry) {
            this.delete(key);
            return null;
        }
        
        return parsed.data;
    }
    
    delete(key) {
        localStorage.removeItem(`${this.namespace}:${key}`);
    }
}

// ========================================
// UI UTILITIES
// ========================================
const UI = {
    showToast: (message, type = 'info', duration = 3000) => {
        const container = document.getElementById('toastContainer');
        if (!container) return;
        
        const toast = document.createElement('div');
        toast.className = `toast ${type}`;
        toast.innerHTML = `
            <span class="toast-icon">${type === 'success' ? '✅' : type === 'error' ? '❌' : 'ℹ️'}</span>
            <span class="toast-message">${Security.escapeHtml(message)}</span>
        `;
        
        container.appendChild(toast);
        
        setTimeout(() => {
            toast.style.animation = 'slideInRight 0.3s ease-out reverse';
            setTimeout(() => toast.remove(), 300);
        }, duration);
    },
    
    showLoading: () => {
        const overlay = document.getElementById('loadingOverlay');
        if (overlay) overlay.style.display = 'flex';
    },
    
    hideLoading: () => {
        const overlay = document.getElementById('loadingOverlay');
        if (overlay) overlay.style.display = 'none';
    },
    
    disableInputs: (disable = true) => {
        document.querySelectorAll('button, input, select, textarea').forEach(el => {
            el.disabled = disable;
        });
    }
};

// ========================================
// ERROR HANDLER
// ========================================
const ErrorHandler = {
    handle: async (error, context = 'Unknown') => {
        console.error(`[${context}]`, error);
        
        // Firebase Analytics'e gönder (opsiyonel)
        if (typeof gtag !== 'undefined') {
            gtag('event', 'exception', {
                description: error.message,
                fatal: false
            });
        }
        
        // Kullanıcı dostu mesaj
        const userMessages = {
            'permission-denied': 'Bu işlem için yetkiniz yok.',
            'unauthenticated': 'Lütfen tekrar giriş yapın.',
            'auth/wrong-password': 'Hatalı şifre.',
            'auth/user-not-found': 'Kullanıcı bulunamadı.',
            'auth/email-already-in-use': 'Bu email zaten kullanımda.',
            'default': 'Bir hata oluştu. Lütfen tekrar deneyin.'
        };
        
        const message = userMessages[error.code] || error.message || userMessages.default;
        UI.showToast(message, 'error');
        
        return Promise.reject(error);
    }
};

// ========================================
// FIREBASE CONFIGURATION (ENV KULLANIMI)
// ========================================
// NOT: Gerçek deployment için .env dosyası kullan!
const firebaseConfig = {
    apiKey: "AIzaSyDyGNrzw1a55LHv-LP5gjuPpFWmHu1a6yU",
    authDomain: "ali23-cfd02.firebaseapp.com",
    projectId: "ali23-cfd02",
    storageBucket: "ali23-cfd02.firebasestorage.app",
    messagingSenderId: "759021285078",
    appId: "1:759021285078:web:f7673f89125ff3dad66377",
    databaseURL: "https://ali23-cfd02-default-rtdb.europe-west1.firebasedatabase.app"
};

// Import statements (same as before)
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { 
    getAuth, 
    createUserWithEmailAndPassword, 
    signInWithEmailAndPassword, 
    onAuthStateChanged, 
    signOut,
    updatePassword
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import { 
    getFirestore, 
    doc, 
    setDoc, 
    getDoc, 
    updateDoc, 
    increment,
    collection,
    query,
    orderBy,
    limit,
    getDocs,
    where,
    onSnapshot,
    serverTimestamp,
    addDoc,
    startAfter,
    Timestamp,
    runTransaction
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";
import {
    getDatabase,
    ref,
    set,
    onValue,
    onDisconnect,
    serverTimestamp as rtdbServerTimestamp
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-database.js";

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const rtdb = getDatabase(app);

// ========================================
// GLOBAL STATE WITH BETTER MANAGEMENT
// ========================================
const State = {
    currentUser: null,
    userData: null,
    userMultiplier: 1,
    adCooldown: false,
    chatLimit: 20,
    currentDmRecipient: null,
    chessGame: null,
    isUserAdmin: false,
    unsubscribeListeners: [],
    chatLimiter: new RateLimiter(10, 60000), // 10 messages per minute
    gameLimiter: new RateLimiter(30, 60000), // 30 games per minute
    cache: new CacheManager('satrancApp'),
    
    cleanup: function() {
        this.unsubscribeListeners.forEach(unsub => unsub());
        this.unsubscribeListeners = [];
    },
    
    updateUserData: function(data) {
        this.userData = data;
        this.userMultiplier = data.multiplier || 1;
        this.isUserAdmin = data.role === 'admin';
    }
};

// ========================================
// ENHANCED AUTH & USER MANAGEMENT
// ========================================
onAuthStateChanged(auth, async (user) => {
    try {
        if (user) {
            State.currentUser = user;
            UI.showLoading();
            
            await initializeUser(user);
            await loadUserData();
            
            document.getElementById('loginScreen').style.display = 'none';
            document.getElementById('mainApp').style.display = 'block';
            document.getElementById('mainApp').setAttribute('aria-hidden', 'false');
            
            setupPresence(user.uid);
            loadChat();
            loadDmUsers();
            
            UI.hideLoading();
        } else {
            State.cleanup();
            document.getElementById('loginScreen').style.display = 'flex';
            document.getElementById('mainApp').style.display = 'none';
            document.getElementById('mainApp').setAttribute('aria-hidden', 'true');
        }
    } catch (error) {
        ErrorHandler.handle(error, 'Auth State Change');
        UI.hideLoading();
    }
});

async function initializeUser(user) {
    try {
        const userRef = doc(db, 'users', user.uid);
        const userSnap = await getDoc(userRef);
        
        if (!userSnap.exists()) {
            await setDoc(userRef, {
                email: Security.escapeHtml(user.email),
                username: Security.escapeHtml(user.email.split('@')[0]),
                score: 100,
                createdAt: serverTimestamp(),
                role: 'user',
                profileImage: '',
                multiplier: 1,
                banned: false,
                muted: false,
                muteUntil: null,
                lastLogin: serverTimestamp()
            });
        } else {
            await updateDoc(userRef, {
                lastLogin: serverTimestamp()
            });
        }
        
        // Add listener for user data
        const unsub = onSnapshot(userRef, (doc) => {
            if (doc.exists()) {
                const data = doc.data();
                State.updateUserData(data);
                updateUI(data);
                
                // Check if banned
                if (data.banned) {
                    UI.showToast('Hesabınız yasaklanmış. Yönetici ile iletişime geçin.', 'error');
                    setTimeout(() => signOut(auth), 3000);
                    return;
                }
                
                // Check mute status
                if (data.muted && data.muteUntil && data.muteUntil > Date.now()) {
                    UI.showToast(`Susturulmuşsunuz. Süre: ${new Date(data.muteUntil).toLocaleString('tr-TR')}`, 'warning');
                } else if (data.muted) {
                    updateDoc(userRef, { muted: false, muteUntil: null });
                }
            }
        });
        
        State.unsubscribeListeners.push(unsub);
    } catch (error) {
        ErrorHandler.handle(error, 'Initialize User');
    }
}

function updateUI(data) {
    document.getElementById('headerUsername').textContent = Security.escapeHtml(data.username);
    document.getElementById('headerEmail').textContent = Security.escapeHtml(data.email);
    document.getElementById('userScore').textContent = data.score;
    document.getElementById('dropdownUsername').textContent = Security.escapeHtml(data.username);
    document.getElementById('dropdownEmail').textContent = Security.escapeHtml(data.email);
    
    if (data.profileImage && Security.isValidUrl(data.profileImage)) {
        const profileImg = document.getElementById('profileImage');
        profileImg.src = data.profileImage;
        profileImg.style.display = 'block';
        document.getElementById('profileEmoji').style.display = 'none';
    }
    
    if (State.isUserAdmin) {
        document.querySelectorAll('.admin-only').forEach(el => el.style.display = 'flex');
    }
}

async function loadUserData() {
    try {
        const cached = State.cache.get(`user_${State.currentUser.uid}`);
        if (cached) {
            State.updateUserData(cached);
            updateUI(cached);
        }
    } catch (error) {
        ErrorHandler.handle(error, 'Load User Data');
    }
}

// Enhanced Login/Register
let isRegisterMode = false;

document.getElementById('loginToggle').addEventListener('click', () => {
    isRegisterMode = !isRegisterMode;
    const usernameField = document.getElementById('loginUsername');
    const loginTitle = document.getElementById('loginTitle');
    const loginButton = document.getElementById('loginButton');
    const loginToggle = document.getElementById('loginToggle');
    
    if (isRegisterMode) {
        loginTitle.textContent = '📝 Kayıt Ol';
        loginButton.textContent = 'Kayıt Ol';
        loginToggle.textContent = 'Hesabın var mı? Giriş yap';
        usernameField.style.display = 'block';
        usernameField.focus();
    } else {
        loginTitle.textContent = '🎮 Giriş Yap';
        loginButton.textContent = 'Giriş Yap';
        loginToggle.textContent = 'Hesabın yok mu? Kayıt ol';
        usernameField.style.display = 'none';
        document.getElementById('loginEmail').focus();
    }
});

document.getElementById('loginToggle').addEventListener('keypress', (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        document.getElementById('loginToggle').click();
    }
});

document.getElementById('loginButton').addEventListener('click', async () => {
    await handleAuth();
});

async function handleAuth() {
    const email = document.getElementById('loginEmail').value.trim();
    const password = document.getElementById('loginPassword').value.trim();
    const username = document.getElementById('loginUsername').value.trim();
    const errorEl = document.getElementById('loginError');
    
    if (!email || !password) {
        errorEl.textContent = 'Lütfen tüm alanları doldurun';
        return;
    }
    
    if (password.length < 6) {
        errorEl.textContent = 'Şifre en az 6 karakter olmalı';
        return;
    }
    
    if (isRegisterMode && !username) {
        errorEl.textContent = 'Kullanıcı adı gerekli';
        return;
    }
    
    try {
        UI.showLoading();
        UI.disableInputs(true);
        
        if (isRegisterMode) {
            const userCred = await createUserWithEmailAndPassword(auth, email, password);
            await setDoc(doc(db, 'users', userCred.user.uid), {
                email: Security.escapeHtml(email),
                username: Security.escapeHtml(username),
                score: 100,
                createdAt: serverTimestamp(),
                role: 'user',
                profileImage: '',
                multiplier: 1,
                banned: false,
                muted: false,
                muteUntil: null
            });
            UI.showToast('✅ Kayıt başarılı!', 'success');
        } else {
            await signInWithEmailAndPassword(auth, email, password);
            UI.showToast('✅ Giriş başarılı!', 'success');
        }
        
        errorEl.textContent = '';
    } catch (error) {
        ErrorHandler.handle(error, 'Authentication');
        errorEl.textContent = error.message;
    } finally {
        UI.hideLoading();
        UI.disableInputs(false);
    }
}

// Enter key support for login
document.getElementById('loginPassword').addEventListener('keypress', (e) => {
    if (e.key === 'Enter') handleAuth();
});

// ========================================
// ENHANCED PRESENCE SYSTEM
// ========================================
function setupPresence(uid) {
    try {
        const presenceRef = ref(rtdb, `presence/${uid}`);
        const userStatusRef = ref(rtdb, `status/${uid}`);
        
        set(presenceRef, {
            online: true,
            lastSeen: rtdbServerTimestamp(),
            userAgent: navigator.userAgent,
            platform: navigator.platform
        });
        
        onDisconnect(presenceRef).set({
            online: false,
            lastSeen: rtdbServerTimestamp()
        });
        
        // Update every 30 seconds to show user is still online
        setInterval(() => {
            if (State.currentUser) {
                set(presenceRef, {
                    online: true,
                    lastSeen: rtdbServerTimestamp()
                });
            }
        }, 30000);
    } catch (error) {
        ErrorHandler.handle(error, 'Setup Presence');
    }
}

// ========================================
// ENHANCED CHAT SYSTEM WITH RATE LIMITING
// ========================================
async function loadChat() {
    try {
        const messagesEl = document.getElementById('chatMessages');
        const cached = State.cache.get('chat_messages');
        
        if (cached) {
            messagesEl.innerHTML = cached;
        }
        
        const chatQuery = query(
            collection(db, 'chat'),
            orderBy('timestamp', 'desc'),
            limit(State.chatLimit)
        );
        
        const unsub = onSnapshot(chatQuery, (snapshot) => {
            messagesEl.innerHTML = '';
            const messages = [];
            
            snapshot.forEach(doc => {
                messages.push({ id: doc.id, ...doc.data() });
            });
            
            messages.reverse().forEach(msg => {
                appendChatMessage(msg);
            });
            
            // Cache messages
            State.cache.set('chat_messages', messagesEl.innerHTML, 60000);
            
            messagesEl.scrollTop = messagesEl.scrollHeight;
        });
        
        State.unsubscribeListeners.push(unsub);
    } catch (error) {
        ErrorHandler.handle(error, 'Load Chat');
    }
}

function appendChatMessage(msg) {
    const messagesEl = document.getElementById('chatMessages');
    const msgEl = document.createElement('div');
    msgEl.className = 'chat-message';
    msgEl.dataset.msgId = msg.id;
    
    const time = msg.timestamp ? 
        new Date(msg.timestamp.toMillis()).toLocaleTimeString('tr-TR', { 
            hour: '2-digit', 
            minute: '2-digit' 
        }) : '';
    
    msgEl.innerHTML = `
        <div class="message-user">${Security.escapeHtml(msg.username)}</div>
        <div class="message-text">${Security.escapeHtml(msg.message)}</div>
        <div class="message-time">${time}</div>
    `;
    messagesEl.appendChild(msgEl);
}

async function sendChatMessage() {
    if (!State.chatLimiter.canProceed(State.currentUser.uid)) {
        UI.showToast('Çok hızlı mesaj gönderiyorsunuz. Lütfen bekleyin.', 'warning');
        return;
    }
    
    const input = document.getElementById('chatInput');
    const message = Security.sanitizeInput(input.value.trim());
    
    if (!message || message.length < 1 || message.length > 200) {
        UI.showToast('Mesaj 1-200 karakter arasında olmalıdır.', 'warning');
        return;
    }
    
    try {
        if (State.userData.muted) {
            if (State.userData.muteUntil && State.userData.muteUntil > Date.now()) {
                UI.showToast('Susturulduğunuz için mesaj gönderemezsiniz.', 'error');
                return;
            } else {
                await updateDoc(doc(db, 'users', State.currentUser.uid), { 
                    muted: false, 
                    muteUntil: null 
                });
            }
        }
        
        await addDoc(collection(db, 'chat'), {
            username: State.userData.username,
            message: message,
            timestamp: serverTimestamp(),
            userId: State.currentUser.uid,
            type: 'global'
        });
        
        input.value = '';
    } catch (error) {
        ErrorHandler.handle(error, 'Send Chat Message');
    }
}

// Chat event listeners
document.getElementById('chatSend').addEventListener('click', sendChatMessage);
document.getElementById('chatInput').addEventListener('keypress', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        sendChatMessage();
    }
});

// ========================================
// ENHANCED ADMIN PANEL
// ========================================
document.getElementById('adminPanelBtn')?.addEventListener('click', () => {
    document.getElementById('dropdown').classList.remove('active');
    document.getElementById('adminModal').style.display = 'flex';
    loadAdminUsers();
    loadPresenceData();
});

async function loadAdminUsers() {
    try {
        const listEl = document.getElementById('adminUserList');
        listEl.innerHTML = '<div class="loading">Yükleniyor...</div>';
        
        const usersQuery = query(collection(db, 'users'), orderBy('createdAt', 'desc'));
        const snapshot = await getDocs(usersQuery);
        
        listEl.innerHTML = '';
        snapshot.forEach(doc => {
            const data = doc.data();
            const item = document.createElement('div');
            item.className = 'admin-user-item';
            item.innerHTML = `
                <div class="admin-user-info-section">
                    <div class="user-avatar">
                        ${data.profileImage && Security.isValidUrl(data.profileImage) ? 
                          `<img src="${Security.escapeHtml(data.profileImage)}" alt="${Security.escapeHtml(data.username)}">` : 
                          '👤'}
                    </div>
                    <div class="admin-user-details">
                        <div class="admin-user-name">${Security.escapeHtml(data.username)}</div>
                        <div class="admin-user-email">${Security.escapeHtml(data.email)}</div>
                        <div class="admin-user-score">💎 ${data.score}</div>
                        <div class="admin-user-badges">
                            ${data.role === 'admin' ? '<span class="admin-badge admin">Admin</span>' : ''}
                            ${data.banned ? '<span class="admin-badge banned">Banned</span>' : ''}
                            ${data.muted ? '<span class="admin-badge muted">Muted</span>' : ''}
                        </div>
                    </div>
                </div>
                <div class="admin-user-actions">
                    <button class="admin-action-quick-btn" onclick="openAdminAction('${doc.id}', '${Security.escapeHtml(data.username)}', ${data.banned}, ${data.muted})">
                        ⚙️ İşlemler
                    </button>
                </div>
            `;
            listEl.appendChild(item);
        });
    } catch (error) {
        ErrorHandler.handle(error, 'Load Admin Users');
    }
}

// Enhanced admin search
document.getElementById('adminUserSearch').addEventListener('input', debounce(async (e) => {
    const searchTerm = e.target.value.toLowerCase().trim();
    
    if (searchTerm.length < 2) {
        loadAdminUsers();
        return;
    }
    
    try {
        const listEl = document.getElementById('adminUserList');
        listEl.innerHTML = '<div class="loading">Aranıyor...</div>';
        
        const usersQuery = query(collection(db, 'users'));
        const snapshot = await getDocs(usersQuery);
        
        listEl.innerHTML = '';
        let found = false;
        
        snapshot.forEach(doc => {
            const data = doc.data();
            const username = data.username.toLowerCase();
            const email = data.email.toLowerCase();
            
            if (username.includes(searchTerm) || email.includes(searchTerm)) {
                found = true;
                const item = document.createElement('div');
                item.className = 'admin-user-item';
                item.innerHTML = `
                    <div class="admin-user-info-section">
                        <div class="user-avatar">
                            ${data.profileImage && Security.isValidUrl(data.profileImage) ? 
                              `<img src="${Security.escapeHtml(data.profileImage)}" alt="">` : 
                              '👤'}
                        </div>
                        <div class="admin-user-details">
                            <div class="admin-user-name">${Security.escapeHtml(data.username)}</div>
                            <div class="admin-user-email">${Security.escapeHtml(data.email)}</div>
                            <div class="admin-user-score">💎 ${data.score}</div>
                            <div class="admin-user-badges">
                                ${data.role === 'admin' ? '<span class="admin-badge admin">Admin</span>' : ''}
                                ${data.banned ? '<span class="admin-badge banned">Banned</span>' : ''}
                                ${data.muted ? '<span class="admin-badge muted">Muted</span>' : ''}
                            </div>
                        </div>
                    </div>
                    <div class="admin-user-actions">
                        <button class="admin-action-quick-btn" onclick="openAdminAction('${doc.id}', '${Security.escapeHtml(data.username)}', ${data.banned}, ${data.muted})">
                            ⚙️ İşlemler
                        </button>
                    </div>
                `;
                listEl.appendChild(item);
            }
        });
        
        if (!found) {
            listEl.innerHTML = '<div class="loading">Kullanıcı bulunamadı</div>';
        }
    } catch (error) {
        ErrorHandler.handle(error, 'Admin Search');
    }
}, 300));

// Debounce utility
function debounce(func, wait) {
    let timeout;
    return (...args) => {
        clearTimeout(timeout);
        timeout = setTimeout(() => func(...args), wait);
    };
}

// Admin actions with transaction safety
window.openAdminAction = (uid, username, isBanned, isMuted) => {
    document.getElementById('adminActionModal').style.display = 'flex';
    document.getElementById('actionUserName').textContent = Security.escapeHtml(username);
    document.getElementById('adminActionModal').dataset.uid = uid;
    document.getElementById('adminActionModal').dataset.username = username;
    
    document.getElementById('banUserBtn').style.display = isBanned ? 'none' : 'block';
    document.getElementById('unbanUserBtn').style.display = isBanned ? 'block' : 'none';
    document.getElementById('muteUserBtn').style.display = isMuted ? 'none' : 'block';
    document.getElementById('unmuteUserBtn').style.display = isMuted ? 'block' : 'none';
    document.getElementById('muteOptions').style.display = 'none';
    document.getElementById('passwordResetOptions').style.display = 'none';
};

// Enhanced ban/unban with transactions
document.getElementById('banUserBtn').addEventListener('click', async () => {
    const uid = document.getElementById('adminActionModal').dataset.uid;
    const username = document.getElementById('adminActionModal').dataset.username;
    
    try {
        await runTransaction(db, async (transaction) => {
            const userRef = doc(db, 'users', uid);
            const userDoc = await transaction.get(userRef);
            
            if (!userDoc.exists()) {
                throw new Error('Kullanıcı bulunamadı');
            }
            
            transaction.update(userRef, { 
                banned: true,
                bannedAt: serverTimestamp(),
                bannedBy: State.currentUser.uid
            });
        });
        
        UI.showToast(`✅ ${Security.escapeHtml(username)} yasaklandı`, 'success');
        setTimeout(() => {
            document.getElementById('adminActionModal').style.display = 'none';
            loadAdminUsers();
        }, 1500);
    } catch (error) {
        ErrorHandler.handle(error, 'Ban User');
    }
});

// Similar enhancements for mute/unmute...

// ========================================
// ENHANCED GAMES WITH VALIDATION
// ========================================
document.getElementById('coinFlipCard').addEventListener('click', () => {
    document.getElementById('coinFlipModal').style.display = 'flex';
});

document.querySelectorAll('#coinFlipModal .choice-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
        if (!State.gameLimiter.canProceed(State.currentUser.uid)) {
            UI.showToast('Çok hızlı oynuyorsunuz. Lütfen bekleyin.', 'warning');
            return;
        }
        
        const choice = btn.dataset.choice;
        const betInput = document.getElementById('coinBetAmount');
        let betAmount = parseInt(betInput.value);
        
        // Input validation
        if (isNaN(betAmount) || betAmount < 10) {
            UI.showToast('Minimum bahis 10 puan!', 'warning');
            betInput.value = 10;
            return;
        }
        
        if (betAmount > 1000) {
            UI.showToast('Maksimum bahis 1000 puan!', 'warning');
            betInput.value = 1000;
            return;
        }
        
        try {
            await runTransaction(db, async (transaction) => {
                const userRef = doc(db, 'users', State.currentUser.uid);
                const userDoc = await transaction.get(userRef);
                
                if (!userDoc.exists()) {
                    throw new Error('Kullanıcı bulunamadı');
                }
                
                const userData = userDoc.data();
                if (userData.score < betAmount) {
                    throw new Error('Yetersiz bakiye!');
                }
                
                const result = Math.random() < 0.5 ? 'heads' : 'tails';
                const won = result === choice;
                
                if (won) {
                    const winAmount = Math.floor(betAmount * 1.8 * State.userMultiplier);
                    transaction.update(userRef, {
                        score: increment(winAmount - betAmount)
                    });
                    UI.showToast(`🎉 Kazandın! +${winAmount - betAmount} Puan`, 'success');
                } else {
                    transaction.update(userRef, {
                        score: increment(-betAmount)
                    });
                    UI.showToast(`😢 Kaybettin! -${betAmount} Puan`, 'error');
                }
            });
        } catch (error) {
            ErrorHandler.handle(error, 'Coin Flip Game');
        }
    });
});

// Similar enhancements for other games...

// ========================================
// ENHANCED MARKET SYSTEM
// ========================================
document.querySelectorAll('.buy-box-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
        const boxType = btn.dataset.box;
        const prices = { bronze: 50, silver: 150, gold: 400 };
        const price = prices[boxType];
        
        try {
            await runTransaction(db, async (transaction) => {
                const userRef = doc(db, 'users', State.currentUser.uid);
                const userDoc = await transaction.get(userRef);
                
                if (!userDoc.exists()) {
                    throw new Error('Kullanıcı bulunamadı');
                }
                
                const currentScore = userDoc.data().score;
                if (currentScore < price) {
                    throw new Error('Yetersiz bakiye!');
                }
                
                // Deduct price
                transaction.update(userRef, {
                    score: increment(-price)
                });
                
                // Calculate rewards
                const result = openBox(boxType);
                
                if (result.scoreReward) {
                    transaction.update(userRef, {
                        score: increment(result.scoreReward)
                    });
                }
                
                if (result.multiplier) {
                    transaction.update(userRef, {
                        multiplier: result.multiplier
                    });
                }
                
                UI.showToast(result.message, 'success');
            });
        } catch (error) {
            ErrorHandler.handle(error, 'Market Purchase');
        }
    });
});

// ========================================
// ENHANCED PROFILE MANAGEMENT
// ========================================
document.getElementById('saveProfileBtn').addEventListener('click', async () => {
    const imageUrl = document.getElementById('profileImageUrl').value.trim();
    const newUsername = Security.sanitizeInput(document.getElementById('newUsername').value.trim());
    const newPass = document.getElementById('newPassword').value;
    
    try {
        const updates = {};
        
        if (imageUrl && Security.isValidUrl(imageUrl)) {
            updates.profileImage = imageUrl;
        } else if (imageUrl) {
            UI.showToast('Geçersiz resim URL formatı!', 'error');
            return;
        }
        
        if (newUsername && newUsername.length >= 3 && newUsername.length <= 20) {
            updates.username = newUsername;
        } else if (newUsername) {
            UI.showToast('Kullanıcı adı 3-20 karakter arasında olmalıdır!', 'error');
            return;
        }
        
        if (newPass && newPass.length >= 6) {
            await updatePassword(auth.currentUser, newPass);
            UI.showToast('✅ Şifre güncellendi!', 'success');
        }
        
        if (Object.keys(updates).length > 0) {
            await updateDoc(doc(db, 'users', State.currentUser.uid), updates);
            UI.showToast('✅ Profil güncellendi!', 'success');
            State.cache.delete(`user_${State.currentUser.uid}`);
        }
        
        setTimeout(() => {
            document.getElementById('profileModal').style.display = 'none';
        }, 2000);
    } catch (error) {
        ErrorHandler.handle(error, 'Update Profile');
    }
});

// ========================================
// EVENT LISTENERS & INITIALIZATION
// ========================================
document.addEventListener('DOMContentLoaded', () => {
    // Initialize all tooltips
    document.querySelectorAll('[title]').forEach(el => {
        el.setAttribute('aria-label', el.getAttribute('title'));
    });
    
    // Handle page visibility change
    document.addEventListener('visibilitychange', () => {
        if (document.hidden && State.currentUser) {
            // User switched tabs/windows - update presence
            const presenceRef = ref(rtdb, `presence/${State.currentUser.uid}`);
            set(presenceRef, {
                online: true,
                lastSeen: rtdbServerTimestamp(),
                away: true
            });
        }
    });
    
    // Handle beforeunload for cleanup
    window.addEventListener('beforeunload', () => {
        State.cleanup();
    });
});

// Modal close handlers (enhanced)
document.querySelectorAll('.modal-close').forEach(btn => {
    btn.addEventListener('click', () => {
        const modalId = btn.dataset.modal;
        const modal = document.getElementById(modalId);
        if (modal) {
            modal.style.display = 'none';
            modal.setAttribute('aria-hidden', 'true');
        }
    });
});

document.querySelectorAll('.game-modal').forEach(modal => {
    modal.addEventListener('click', (e) => {
        if (e.target === modal) {
            modal.style.display = 'none';
            modal.setAttribute('aria-hidden', 'true');
        }
    });
});

// Keyboard shortcuts
document.addEventListener('keydown', (e) => {
    // ESC to close modals
    if (e.key === 'Escape') {
        document.querySelectorAll('.game-modal[style*="display: flex"]').forEach(modal => {
            modal.style.display = 'none';
            modal.setAttribute('aria-hidden', 'true');
        });
    }
    
    // Ctrl+Enter to send chat
    if (e.ctrlKey && e.key === 'Enter' && document.activeElement.id === 'chatInput') {
        sendChatMessage();
    }
});

// ========================================
// OFFLINE SUPPORT
// ========================================
// Enable offline persistence
try {
    enableIndexedDbPersistence(db).catch((err) => {
        if (err.code === 'failed-precondition') {
            console.warn('Offline persistence already enabled in another tab');
        } else if (err.code === 'unimplemented') {
            console.warn('Offline persistence not supported');
        }
    });
} catch (error) {
    console.warn('Offline persistence error:', error);
}

// Check online status
window.addEventListener('online', () => {
    UI.showToast('✅ İnternet bağlantısı yenilendi', 'success');
});

window.addEventListener('offline', () => {
    UI.showToast('⚠️ İnternet bağlantısı kesildi', 'warning');
});
