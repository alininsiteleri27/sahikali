// ========================================
// FIREBASE CONFIGURATION
// ========================================
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { 
    getAuth, 
    createUserWithEmailAndPassword, 
    signInWithEmailAndPassword, 
    onAuthStateChanged, 
    signOut,
    updatePassword,
    setPersistence,
    inMemoryPersistence,
    sendPasswordResetEmail
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
    deleteDoc
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";
import {
    getDatabase,
    ref,
    set,
    onValue,
    onDisconnect,
    serverTimestamp as rtdbServerTimestamp
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-database.js";

// Firebase Config (ASLA BOZMA!)
const firebaseConfig = {
    apiKey: "AIzaSyDyGNrzw1a55LHv-LP5gjuPpFWmHu1a6yU",
    authDomain: "ali23-cfd02.firebaseapp.com",
    projectId: "ali23-cfd02",
    storageBucket: "ali23-cfd02.firebasestorage.app",
    messagingSenderId: "759021285078",
    appId: "1:759021285078:web:f7673f89125ff3dad66377",
    databaseURL: "https://ali23-cfd02-default-rtdb.europe-west1.firebasedatabase.app"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const rtdb = getDatabase(app);

// Oturum sadece sayfa açıkken geçerli olsun (yenileyince logout)
setPersistence(auth, inMemoryPersistence).catch((err) => {
    console.error('Auth persistence hatası:', err);
});

// ========================================
// GLOBAL STATE
// ========================================
let currentUser = null;
let userMultiplier = 1;
let adCooldown = false;
let lastChatDoc = null;
let chatLoadedCount = 5;
let currentDmRecipient = null;
let chessGame = null;
let game2048 = null;
let isUserAdmin = false;
let chatUnsubscribe = null;

// ========================================
// AUTH & USER MANAGEMENT
// ========================================
onAuthStateChanged(auth, async (user) => {
    if (user) {
        currentUser = user;
        await initializeUser(user);
        document.getElementById('loginScreen').style.display = 'none';
        document.getElementById('mainApp').classList.add('show');
        loadUserData();
        setupPresence(user.uid);
        loadChat();
        loadDmUsers();
    } else {
        document.getElementById('loginScreen').style.display = 'flex';
        document.getElementById('mainApp').classList.remove('show');
    }
});

async function initializeUser(user) {
    const userRef = doc(db, 'users', user.uid);
    const userSnap = await getDoc(userRef);
    
    if (!userSnap.exists()) {
        await setDoc(userRef, {
            email: user.email,
            username: user.email.split('@')[0],
            score: 100,
            createdAt: serverTimestamp(),
            role: 'user',
            profileImage: '',
            multiplier: 1,
            banned: false,
            muted: false,
            muteUntil: null
        });
    }
    
    // Check admin status
    const userData = (await getDoc(userRef)).data();
    isUserAdmin = userData.role === 'admin';
    
    if (isUserAdmin) {
        document.querySelectorAll('.admin-only').forEach(el => el.style.display = 'flex');
    }
}

async function loadUserData() {
    const userRef = doc(db, 'users', currentUser.uid);
    
    onSnapshot(userRef, (docSnap) => {
        const data = docSnap.data();
        if (!data) return;
        
        // Check if banned
        if (data.banned) {
            alert('Hesabınız yasaklanmış. Lütfen yönetici ile iletişime geçin.');
            signOut(auth);
            return;
        }
        
        document.getElementById('headerUsername').textContent = data.username;
        document.getElementById('headerEmail').textContent = data.email;
        document.getElementById('userScore').textContent = data.score;
        document.getElementById('dropdownUsername').textContent = data.username;
        document.getElementById('dropdownEmail').textContent = data.email;
        
        if (data.profileImage) {
            document.getElementById('profileImage').src = data.profileImage;
            document.getElementById('profileImage').style.display = 'block';
            document.getElementById('profileEmoji').style.display = 'none';
        }
        
        userMultiplier = data.multiplier || 1;
        if (userMultiplier > 1) {
            document.getElementById('activeMultiplier').style.display = 'block';
            document.getElementById('multiplierValue').textContent = `x${userMultiplier}`;
        }
    });
}

// Login/Register
let isRegisterMode = false;

document.getElementById('loginToggle').addEventListener('click', () => {
    isRegisterMode = !isRegisterMode;
    if (isRegisterMode) {
        document.getElementById('loginTitle').textContent = '📝 Kayıt Ol';
        document.getElementById('loginButton').textContent = 'Kayıt Ol';
        document.getElementById('loginToggle').textContent = 'Hesabın var mı? Giriş yap';
        document.getElementById('loginUsername').style.display = 'block';
    } else {
        document.getElementById('loginTitle').textContent = '🎮 Giriş Yap';
        document.getElementById('loginButton').textContent = 'Giriş Yap';
        document.getElementById('loginToggle').textContent = 'Hesabın yok mu? Kayıt ol';
        document.getElementById('loginUsername').style.display = 'none';
    }
});

document.getElementById('loginButton').addEventListener('click', async () => {
    const email = document.getElementById('loginEmail').value;
    const password = document.getElementById('loginPassword').value;
    const username = document.getElementById('loginUsername').value;
    const errorEl = document.getElementById('loginError');
    
    if (!email || !password) {
        errorEl.textContent = 'Lütfen tüm alanları doldurun';
        return;
    }
    
    if (password.length < 6) {
        errorEl.textContent = 'Şifre en az 6 karakter olmalı';
        return;
    }
    
    try {
        if (isRegisterMode) {
            if (!username) {
                errorEl.textContent = 'Kullanıcı adı gerekli';
                return;
            }
            await createUserWithEmailAndPassword(auth, email, password);
        } else {
            await signInWithEmailAndPassword(auth, email, password);
        }
        errorEl.textContent = '';
    } catch (error) {
        errorEl.textContent = error.message;
    }
});

// ========================================
// PRESENCE SYSTEM (Online/Offline)
// ========================================
function setupPresence(uid) {
    const presenceRef = ref(rtdb, `presence/${uid}`);
    const userStatusRef = ref(rtdb, `status/${uid}`);
    
    set(presenceRef, {
        online: true,
        lastSeen: rtdbServerTimestamp()
    });
    
    onDisconnect(presenceRef).set({
        online: false,
        lastSeen: rtdbServerTimestamp()
    });
}

// ========================================
// PROFILE & SETTINGS
// ========================================
document.getElementById('profileIcon').addEventListener('click', () => {
    document.getElementById('dropdown').classList.toggle('active');
});

document.addEventListener('click', (e) => {
    if (!e.target.closest('.profile-section')) {
        document.getElementById('dropdown').classList.remove('active');
    }
});

document.getElementById('logoutBtn').addEventListener('click', () => {
    signOut(auth);
});

// Theme Toggle
const themeToggle = document.getElementById('themeToggle');
const savedTheme = localStorage.getItem('theme') || 'light';

if (savedTheme === 'dark') {
    document.body.classList.add('dark-mode');
    themeToggle.classList.add('active');
    document.getElementById('themeLabel').textContent = 'Light Mode';
}

themeToggle.addEventListener('click', () => {
    document.body.classList.toggle('dark-mode');
    themeToggle.classList.toggle('active');
    
    if (document.body.classList.contains('dark-mode')) {
        localStorage.setItem('theme', 'dark');
        document.getElementById('themeLabel').textContent = 'Light Mode';
    } else {
        localStorage.setItem('theme', 'light');
        document.getElementById('themeLabel').textContent = 'Dark Mode';
    }
});

// Edit Profile
document.getElementById('editProfileBtn').addEventListener('click', () => {
    document.getElementById('dropdown').classList.remove('active');
    document.getElementById('profileModal').style.display = 'flex';
});

document.getElementById('profileImageUrl').addEventListener('input', (e) => {
    const url = e.target.value;
    const preview = document.getElementById('profilePreview');
    if (url) {
        preview.src = url;
        preview.style.display = 'block';
    } else {
        preview.style.display = 'none';
    }
});

document.getElementById('saveProfileBtn').addEventListener('click', async () => {
    const imageUrl = document.getElementById('profileImageUrl').value;
    const newUsername = document.getElementById('newUsername').value;
    const newPass = document.getElementById('newPassword').value;
    const messageEl = document.getElementById('profileMessage');
    
    try {
        const userRef = doc(db, 'users', currentUser.uid);
        const updates = {};
        
        if (imageUrl) updates.profileImage = imageUrl;
        if (newUsername) updates.username = newUsername;
        
        if (Object.keys(updates).length > 0) {
            await updateDoc(userRef, updates);
        }
        
        if (newPass && newPass.length >= 6) {
            await updatePassword(currentUser, newPass);
        }
        
        messageEl.className = 'profile-message success';
        messageEl.textContent = '✅ Profil güncellendi!';
        
        setTimeout(() => {
            document.getElementById('profileModal').style.display = 'none';
            messageEl.textContent = '';
        }, 2000);
    } catch (error) {
        messageEl.className = 'profile-message error';
        messageEl.textContent = error.message;
    }
});

// ========================================
// ADMIN PANEL
// ========================================
document.getElementById('adminPanelBtn')?.addEventListener('click', () => {
    document.getElementById('dropdown').classList.remove('active');
    document.getElementById('adminModal').style.display = 'flex';
    loadAdminUsers();
    loadPresenceData();
});

// Admin Tabs
document.querySelectorAll('.admin-tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
        document.querySelectorAll('.admin-tab-btn').forEach(b => b.classList.remove('active'));
        document.querySelectorAll('.admin-tab-content').forEach(c => c.classList.remove('active'));
        
        btn.classList.add('active');
        const tabName = btn.dataset.tab;
        document.getElementById(`admin${tabName.charAt(0).toUpperCase() + tabName.slice(1)}Tab`).classList.add('active');
        
        if (tabName === 'presence') {
            loadPresenceData();
        }
    });
});

// Load Users for Admin
async function loadAdminUsers() {
    const listEl = document.getElementById('adminUserList');
    listEl.innerHTML = '<div class="loading">Yükleniyor...</div>';
    
    const usersQuery = query(collection(db, 'users'), orderBy('score', 'desc'));
    const snapshot = await getDocs(usersQuery);
    
    listEl.innerHTML = '';
    snapshot.forEach(docSnap => {
        const data = docSnap.data();
        const item = document.createElement('div');
        item.className = 'admin-user-item';
        item.innerHTML = `
            <div class="admin-user-info-section">
                <div class="user-avatar">
                    ${data.profileImage ? `<img src="${data.profileImage}" alt="">` : '👤'}
                </div>
                <div class="admin-user-details">
                    <div class="admin-user-name">${data.username}</div>
                    <div class="admin-user-email">${data.email}</div>
                    <div class="admin-user-score">💎 ${data.score}</div>
                    <div class="admin-user-badges">
                        ${data.role === 'admin' ? '<span class="admin-badge admin">Admin</span>' : ''}
                        ${data.banned ? '<span class="admin-badge banned">Banned</span>' : ''}
                        ${data.muted ? '<span class="admin-badge muted">Muted</span>' : ''}
                    </div>
                </div>
            </div>
            <div class="admin-user-actions">
                <button class="admin-action-quick-btn" onclick="openAdminAction('${docSnap.id}', '${data.username}', ${data.banned}, ${data.muted})">
                    ⚙️ İşlemler
                </button>
            </div>
        `;
        listEl.appendChild(item);
    });
}

// Admin Search
document.getElementById('adminUserSearch').addEventListener('input', async (e) => {
    const searchTerm = e.target.value.toLowerCase();
    if (!searchTerm) {
        loadAdminUsers();
        return;
    }
    
    const listEl = document.getElementById('adminUserList');
    const usersQuery = query(collection(db, 'users'));
    const snapshot = await getDocs(usersQuery);
    
    listEl.innerHTML = '';
    snapshot.forEach(docSnap => {
        const data = docSnap.data();
        if (data.username.toLowerCase().includes(searchTerm) || data.email.toLowerCase().includes(searchTerm)) {
            const item = document.createElement('div');
            item.className = 'admin-user-item';
            item.innerHTML = `
                <div class="admin-user-info-section">
                    <div class="user-avatar">
                        ${data.profileImage ? `<img src="${data.profileImage}" alt="">` : '👤'}
                    </div>
                    <div class="admin-user-details">
                        <div class="admin-user-name">${data.username}</div>
                        <div class="admin-user-email">${data.email}</div>
                        <div class="admin-user-score">💎 ${data.score}</div>
                        <div class="admin-user-badges">
                            ${data.role === 'founder' ? '<span class="admin-badge founder">Kurucu</span>' : ''}
                            ${data.role === 'admin' ? '<span class="admin-badge admin">Admin</span>' : ''}
                            ${data.banned ? '<span class="admin-badge banned">Banned</span>' : ''}
                            ${data.muted ? '<span class="admin-badge muted">Muted</span>' : ''}
                        </div>
                    </div>
                </div>
                <div class="admin-user-actions">
                    <button class="admin-action-quick-btn" onclick="openAdminAction('${docSnap.id}', '${data.username}', ${data.banned}, ${data.muted})">
                        ⚙️ İşlemler
                    </button>
                </div>
            `;
            listEl.appendChild(item);
        }
    });
});

// Admin Actions
window.openAdminAction = (uid, username, isBanned, isMuted) => {
    document.getElementById('adminActionModal').style.display = 'flex';
    document.getElementById('actionUserName').textContent = username;
    document.getElementById('adminActionModal').dataset.uid = uid;
    
    // Show/hide buttons
    document.getElementById('banUserBtn').style.display = isBanned ? 'none' : 'block';
    document.getElementById('unbanUserBtn').style.display = isBanned ? 'block' : 'none';
    document.getElementById('muteUserBtn').style.display = isMuted ? 'none' : 'block';
    document.getElementById('unmuteUserBtn').style.display = isMuted ? 'block' : 'none';
    
    // Hide options
    document.getElementById('muteOptions').style.display = 'none';
    document.getElementById('passwordResetOptions').style.display = 'none';
    document.getElementById('adminActionMessage').textContent = '';
};

// Ban User
document.getElementById('banUserBtn').addEventListener('click', async () => {
    const uid = document.getElementById('adminActionModal').dataset.uid;
    const messageEl = document.getElementById('adminActionMessage');
    
    try {
        await updateDoc(doc(db, 'users', uid), { banned: true });
        messageEl.className = 'admin-message success';
        messageEl.textContent = '✅ Kullanıcı yasaklandı';
        setTimeout(() => {
            document.getElementById('adminActionModal').style.display = 'none';
            loadAdminUsers();
        }, 1500);
    } catch (error) {
        messageEl.className = 'admin-message error';
        messageEl.textContent = error.message;
    }
});

// Unban User
document.getElementById('unbanUserBtn').addEventListener('click', async () => {
    const uid = document.getElementById('adminActionModal').dataset.uid;
    const messageEl = document.getElementById('adminActionMessage');
    
    try {
        await updateDoc(doc(db, 'users', uid), { banned: false });
        messageEl.className = 'admin-message success';
        messageEl.textContent = '✅ Yasak kaldırıldı';
        setTimeout(() => {
            document.getElementById('adminActionModal').style.display = 'none';
            loadAdminUsers();
        }, 1500);
    } catch (error) {
        messageEl.className = 'admin-message error';
        messageEl.textContent = error.message;
    }
});

// Mute User
document.getElementById('muteUserBtn').addEventListener('click', () => {
    document.getElementById('muteOptions').style.display = 'block';
});

document.getElementById('confirmMuteBtn').addEventListener('click', async () => {
    const uid = document.getElementById('adminActionModal').dataset.uid;
    const duration = parseInt(document.getElementById('muteDuration').value);
    const messageEl = document.getElementById('adminActionMessage');
    
    try {
        const muteUntil = Date.now() + duration;
        await updateDoc(doc(db, 'users', uid), { 
            muted: true,
            muteUntil: muteUntil
        });
        messageEl.className = 'admin-message success';
        messageEl.textContent = '✅ Kullanıcı susturuldu';
        setTimeout(() => {
            document.getElementById('adminActionModal').style.display = 'none';
            loadAdminUsers();
        }, 1500);
    } catch (error) {
        messageEl.className = 'admin-message error';
        messageEl.textContent = error.message;
    }
});

// Unmute User
document.getElementById('unmuteUserBtn').addEventListener('click', async () => {
    const uid = document.getElementById('adminActionModal').dataset.uid;
    const messageEl = document.getElementById('adminActionMessage');
    
    try {
        await updateDoc(doc(db, 'users', uid), { 
            muted: false,
            muteUntil: null
        });
        messageEl.className = 'admin-message success';
        messageEl.textContent = '✅ Susturma kaldırıldı';
        setTimeout(() => {
            document.getElementById('adminActionModal').style.display = 'none';
            loadAdminUsers();
        }, 1500);
    } catch (error) {
        messageEl.className = 'admin-message error';
        messageEl.textContent = error.message;
    }
});

// Reset Password (email ile gerçek sıfırlama linki)
document.getElementById('resetPasswordBtn').addEventListener('click', () => {
    document.getElementById('passwordResetOptions').style.display = 'block';
    // İsteğe bağlı: input'u pasif hale getirebilirsin
    const input = document.getElementById('newPasswordInput');
    if (input) {
        input.disabled = true;
        input.placeholder = 'Bu alan kullanılmıyor, mail ile link gönderilecek';
    }
});

document.getElementById('confirmResetBtn').addEventListener('click', async () => {
    const messageEl = document.getElementById('adminActionMessage');
    const uid = document.getElementById('adminActionModal').dataset.uid;

    try {
        // Firestore'dan kullanıcının email'ini al
        const userSnap = await getDoc(doc(db, 'users', uid));
        if (!userSnap.exists()) {
            messageEl.className = 'admin-message error';
            messageEl.textContent = 'Kullanıcı bulunamadı.';
            return;
        }

        const email = userSnap.data().email;
        if (!email) {
            messageEl.className = 'admin-message error';
            messageEl.textContent = 'Bu kullanıcı için e-posta bulunamadı.';
            return;
        }

        // Firebase Auth üzerinden reset maili gönder
        await sendPasswordResetEmail(auth, email);

        messageEl.className = 'admin-message success';
        messageEl.textContent = `✅ Şifre sıfırlama bağlantısı ${email} adresine gönderildi.`;
    } catch (error) {
        console.error(error);
        messageEl.className = 'admin-message error';
        messageEl.textContent = error.message || 'Şifre sıfırlama linki gönderilirken hata oluştu.';
    }
});

// Load Presence Data
async function loadPresenceData() {
    const presenceListEl = document.getElementById('presenceList');
    presenceListEl.innerHTML = '<div class="loading">Yükleniyor...</div>';
    
    const presenceRef = ref(rtdb, 'presence');
    onValue(presenceRef, async (snapshot) => {
        const presenceData = snapshot.val() || {};
        const usersSnapshot = await getDocs(collection(db, 'users'));
        
        let onlineCount = 0;
        let offlineCount = 0;
        
        presenceListEl.innerHTML = '';
        
        usersSnapshot.forEach(docSnap => {
            const userData = docSnap.data();
            const presence = presenceData[docSnap.id];
            const isOnline = presence && presence.online;
            
            if (isOnline) onlineCount++;
            else offlineCount++;
            
            const item = document.createElement('div');
            item.className = 'presence-item';
            item.innerHTML = `
                <div class="presence-user-info">
                    <div class="presence-status-dot ${isOnline ? 'online' : 'offline'}"></div>
                    <div>
                        <div class="presence-user-name">${userData.username}</div>
                        ${!isOnline && presence ? `<div class="presence-last-seen">Son görülme: ${new Date(presence.lastSeen).toLocaleString('tr-TR')}</div>` : ''}
                    </div>
                </div>
            `;
            presenceListEl.appendChild(item);
        });
        
        document.getElementById('onlineCount').textContent = onlineCount;
        document.getElementById('offlineCount').textContent = offlineCount;
        document.getElementById('totalCount').textContent = usersSnapshot.size;
    });
}

// ========================================
// LEADERBOARD
// ========================================
document.getElementById('leaderboardBtn').addEventListener('click', () => {
    document.getElementById('leaderboardModal').style.display = 'flex';
    loadLeaderboard();
});

async function loadLeaderboard() {
    const listEl = document.getElementById('leaderboardList');
    listEl.innerHTML = '<div class="loading">Yükleniyor...</div>';
    
    const leaderboardQuery = query(
        collection(db, 'users'),
        orderBy('score', 'desc'),
        limit(50)
    );
    
    const snapshot = await getDocs(leaderboardQuery);
    listEl.innerHTML = '';
    
    let rank = 1;
    snapshot.forEach(docSnap => {
        const data = docSnap.data();
        const item = document.createElement('div');
        item.className = `leaderboard-item ${rank <= 3 ? `rank-${rank}` : ''}`;
        item.innerHTML = `
            <div class="rank-number">#${rank}</div>
            <div class="user-avatar">
                ${data.profileImage ? `<img src="${data.profileImage}" alt="">` : '👤'}
            </div>
            <div class="user-info">
                <div class="user-name">${data.username}</div>
            </div>
            <div class="user-score">💎 ${data.score}</div>
        `;
        listEl.appendChild(item);
        rank++;
    });
}

// Leaderboard Search
document.getElementById('userSearchInput').addEventListener('input', async (e) => {
    const searchTerm = e.target.value.toLowerCase();
    
    if (!searchTerm) {
        document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
        document.getElementById('topUsersTab').style.display = 'block';
        document.getElementById('searchResultsTab').style.display = 'none';
        document.querySelectorAll('.tab-btn')[0].classList.add('active');
        return;
    }
    
    // Switch to search tab
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.tab-btn')[1].classList.add('active');
    document.getElementById('topUsersTab').style.display = 'none';
    document.getElementById('searchResultsTab').style.display = 'block';
    
    const resultsEl = document.getElementById('searchResultsList');
    resultsEl.innerHTML = '<div class="loading">Aranıyor...</div>';
    
    const usersQuery = query(collection(db, 'users'));
    const snapshot = await getDocs(usersQuery);
    
    resultsEl.innerHTML = '';
    let found = false;
    
    snapshot.forEach(docSnap => {
        const data = docSnap.data();
        if (data.username.toLowerCase().includes(searchTerm)) {
            found = true;
            const item = document.createElement('div');
            item.className = 'leaderboard-item';
            item.innerHTML = `
                <div class="user-avatar">
                    ${data.profileImage ? `<img src="${data.profileImage}" alt="">` : '👤'}
                </div>
                <div class="user-info">
                    <div class="user-name">${data.username}</div>
                </div>
                <div class="user-score">💎 ${data.score}</div>
            `;
            resultsEl.appendChild(item);
        }
    });
    
    if (!found) {
        resultsEl.innerHTML = '<div class="search-placeholder">Kullanıcı bulunamadı</div>';
    }
});

// Leaderboard Tabs
document.querySelectorAll('.leaderboard-tabs .tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
        document.querySelectorAll('.leaderboard-tabs .tab-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        
        if (btn.dataset.tab === 'top') {
            document.getElementById('topUsersTab').style.display = 'block';
            document.getElementById('searchResultsTab').style.display = 'none';
        } else {
            document.getElementById('topUsersTab').style.display = 'none';
            document.getElementById('searchResultsTab').style.display = 'block';
        }
    });
});

// ========================================
// CHAT SYSTEM (Global + DM)
// ========================================

// Chat Tabs
document.querySelectorAll('.chat-tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
        document.querySelectorAll('.chat-tab-btn').forEach(b => b.classList.remove('active'));
        document.querySelectorAll('.chat-tab-content').forEach(c => c.classList.remove('active'));
        
        btn.classList.add('active');
        const tabName = btn.dataset.tab;
        document.getElementById(`${tabName}ChatTab`).classList.add('active');
        
        if (tabName === 'dm') {
            loadDmUsers();
        }
    });
});

// Load Global Chat
async function loadChat() {
    const messagesEl = document.getElementById('chatMessages');

    // Eski listener varsa iptal et
    if (chatUnsubscribe) {
        chatUnsubscribe();
        chatUnsubscribe = null;
    }

    const baseQuery = query(
        collection(db, 'chat'),
        orderBy('timestamp', 'desc'),
        limit(chatLoadedCount)
    );

    const snapshot = await getDocs(baseQuery);

    if (snapshot.docs.length > 0) {
        lastChatDoc = snapshot.docs[snapshot.docs.length - 1];

        if (snapshot.docs.length >= chatLoadedCount) {
            document.getElementById('chatLoadMore').style.display = 'block';
        }
    }

    messagesEl.innerHTML = '';

    const messages = [];
    snapshot.forEach(docSnap => {
        messages.push({ id: docSnap.id, ...docSnap.data() });
    });

    messages.reverse().forEach(msg => {
        appendChatMessage(msg);
    });

    messagesEl.scrollTop = messagesEl.scrollHeight;

    // Tüm listeyi real-time dinleyen listener
    chatUnsubscribe = onSnapshot(
        query(collection(db, 'chat'), orderBy('timestamp', 'asc')),
        (snap) => {
            messagesEl.innerHTML = '';
            snap.forEach(docSnap => {
                appendChatMessage({ id: docSnap.id, ...docSnap.data() });
            });
            messagesEl.scrollTop = messagesEl.scrollHeight;
        }
    );
}

function appendChatMessage(msg) {
    const messagesEl = document.getElementById('chatMessages');
    const msgEl = document.createElement('div');
    msgEl.className = 'chat-message';
    msgEl.dataset.msgId = msg.id;
    
    const time = msg.timestamp
        ? new Date(msg.timestamp.toMillis()).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })
        : '';
    
    msgEl.innerHTML = `
        <div class="message-header">
            <div class="message-user">${msg.username}</div>
            ${isUserAdmin ? `<button class="chat-delete-btn">Sil</button>` : ''}
        </div>
        <div class="message-text">${msg.message}</div>
        <div class="message-time">${time}</div>
    `;

    if (isUserAdmin) {
        const deleteBtn = msgEl.querySelector('.chat-delete-btn');
        deleteBtn.addEventListener('click', async (e) => {
            e.stopPropagation();
            try {
                await deleteDoc(doc(db, 'chat', msg.id));
                msgEl.remove();
            } catch (err) {
                console.error('Mesaj silme hatası:', err);
                alert('Mesaj silinirken hata oluştu.');
            }
        });
    }

    messagesEl.appendChild(msgEl);
}

// Load More Chat
document.getElementById('loadMoreBtn').addEventListener('click', async () => {
    if (!lastChatDoc) return;
    
    chatLoadedCount += 5;
    
    const chatQuery = query(
        collection(db, 'chat'),
        orderBy('timestamp', 'desc'),
        startAfter(lastChatDoc),
        limit(5)
    );
    
    const snapshot = await getDocs(chatQuery);
    
    if (snapshot.docs.length > 0) {
        lastChatDoc = snapshot.docs[snapshot.docs.length - 1];
        
        const messages = [];
        snapshot.forEach(docSnap => {
            messages.push({ id: docSnap.id, ...docSnap.data() });
        });
        
        const messagesEl = document.getElementById('chatMessages');
        messages.reverse().forEach(msg => {
            const msgEl = document.createElement('div');
            msgEl.className = 'chat-message';
            msgEl.dataset.msgId = msg.id;
            
            const time = msg.timestamp
                ? new Date(msg.timestamp.toMillis()).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })
                : '';
            
            msgEl.innerHTML = `
                <div class="message-user">${msg.username}</div>
                <div class="message-text">${msg.message}</div>
                <div class="message-time">${time}</div>
            `;
            messagesEl.insertBefore(msgEl, messagesEl.firstChild);
        });
    } else {
        document.getElementById('chatLoadMore').style.display = 'none';
    }
});

// Send Global Chat
async function sendChatMessage() {
    const input = document.getElementById('chatInput');
    const message = input.value.trim();
    
    if (!message) return;
    
    // Check if muted
    const userRef = doc(db, 'users', currentUser.uid);
    const userSnap = await getDoc(userRef);
    const userData = userSnap.data();
    
    if (userData.muted && userData.muteUntil > Date.now()) {
        alert('Susturulduğunuz için mesaj gönderemezsiniz.');
        return;
    }
    
    // Clear mute if expired
    if (userData.muted && userData.muteUntil <= Date.now()) {
        await updateDoc(userRef, { muted: false, muteUntil: null });
    }
    
    await addDoc(collection(db, 'chat'), {
        username: userData.username,
        message: message,
        timestamp: serverTimestamp(),
        userId: currentUser.uid
    });
    
    input.value = '';
}

document.getElementById('chatSend').addEventListener('click', sendChatMessage);
document.getElementById('chatInput').addEventListener('keypress', (e) => {
    if (e.key === 'Enter') sendChatMessage();
});

// ========================================
// DM (Direct Messages)
// ========================================
async function loadDmUsers() {
    const listEl = document.getElementById('dmUserList');
    listEl.innerHTML = '<div class="chat-welcome">Kullanıcıları yükleniyor...</div>';
    
    const usersQuery = query(collection(db, 'users'));
    const snapshot = await getDocs(usersQuery);
    
    listEl.innerHTML = '';
    snapshot.forEach(docSnap => {
        if (docSnap.id === currentUser.uid) return; // Skip self
        
        const data = docSnap.data();
        const item = document.createElement('div');
        item.className = 'dm-user-item';
        item.innerHTML = `
            <div class="dm-user-avatar">
                ${data.profileImage ? `<img src="${data.profileImage}" alt="">` : '👤'}
            </div>
            <div class="dm-user-info">
                <div class="dm-user-name-display">${data.username}</div>
                <div class="dm-user-status">${data.email}</div>
            </div>
        `;
        item.addEventListener('click', () => openDmConversation(docSnap.id, data.username));
        listEl.appendChild(item);
    });
}

function openDmConversation(recipientId, recipientName) {
    currentDmRecipient = recipientId;
    document.getElementById('dmUserName').textContent = recipientName;
    document.getElementById('dmUserList').style.display = 'none';
    document.getElementById('dmConversation').style.display = 'flex';
    
    loadDmMessages(recipientId);
}

document.getElementById('dmBackBtn').addEventListener('click', () => {
    document.getElementById('dmUserList').style.display = 'block';
    document.getElementById('dmConversation').style.display = 'none';
    currentDmRecipient = null;
});

async function loadDmMessages(recipientId) {
    const messagesEl = document.getElementById('dmMessages');
    messagesEl.innerHTML = '';
    
    const conversationId = [currentUser.uid, recipientId].sort().join('_');
    
    const dmQuery = query(
        collection(db, 'dm', conversationId, 'messages'),
        orderBy('timestamp', 'asc')
    );
    
    onSnapshot(dmQuery, (snapshot) => {
        messagesEl.innerHTML = '';
        snapshot.forEach(docSnap => {
            const msg = docSnap.data();
            const msgEl = document.createElement('div');
            msgEl.className = 'chat-message';
            
            const time = msg.timestamp
                ? new Date(msg.timestamp.toMillis()).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })
                : '';
            
            msgEl.innerHTML = `
                <div class="message-user">${msg.senderId === currentUser.uid ? 'Sen' : msg.username}</div>
                <div class="message-text">${msg.message}</div>
                <div class="message-time">${time}</div>
            `;
            messagesEl.appendChild(msgEl);
        });
        messagesEl.scrollTop = messagesEl.scrollHeight;
    });
}

async function sendDmMessage() {
    if (!currentDmRecipient) return;
    
    const input = document.getElementById('dmInput');
    const message = input.value.trim();
    
    if (!message) return;
    
    // Check if muted
    const userRef = doc(db, 'users', currentUser.uid);
    const userSnap = await getDoc(userRef);
    const userData = userSnap.data();
    
    if (userData.muted && userData.muteUntil > Date.now()) {
        alert('Susturulduğunuz için mesaj gönderemezsiniz.');
        return;
    }
    
    const conversationId = [currentUser.uid, currentDmRecipient].sort().join('_');
    
    await addDoc(collection(db, 'dm', conversationId, 'messages'), {
        senderId: currentUser.uid,
        username: userData.username,
        message: message,
        timestamp: serverTimestamp()
    });
    
    input.value = '';
}

document.getElementById('dmSend').addEventListener('click', sendDmMessage);
document.getElementById('dmInput').addEventListener('keypress', (e) => {
    if (e.key === 'Enter') sendDmMessage();
});

// Mobile Chat Toggle
document.getElementById('chatToggleMobile').addEventListener('click', () => {
    document.getElementById('chatSidebar').classList.toggle('minimized');
});

// ========================================
// AD SYSTEM
// ========================================
document.getElementById('watchAdBtn').addEventListener('click', async () => {
    if (adCooldown) return;
    
    const btn = document.getElementById('watchAdBtn');
    btn.disabled = true;
    btn.textContent = 'Reklam gösteriliyor...';
    
    setTimeout(async () => {
        const userRef = doc(db, 'users', currentUser.uid);
        await updateDoc(userRef, {
            score: increment(50)
        });
        
        btn.style.display = 'none';
        document.getElementById('adCooldown').style.display = 'block';
        
        let timeLeft = 300; // 5 minutes
        adCooldown = true;
        
        const timer = setInterval(() => {
            timeLeft--;
            const minutes = Math.floor(timeLeft / 60);
            const seconds = timeLeft % 60;
            document.getElementById('adTimer').textContent = `${minutes}:${seconds.toString().padStart(2, '0')}`;
            
            if (timeLeft <= 0) {
                clearInterval(timer);
                btn.style.display = 'block';
                btn.disabled = false;
                btn.textContent = '+50 Puan Kazan';
                document.getElementById('adCooldown').style.display = 'none';
                adCooldown = false;
            }
        }, 1000);
    }, 3000);
});

// ========================================
// MARKET SYSTEM
// ========================================
document.getElementById('marketBtn').addEventListener('click', () => {
    document.getElementById('marketModal').style.display = 'flex';
});

document.querySelectorAll('.buy-box-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
        const boxType = btn.dataset.box;
        const prices = { bronze: 50, silver: 150, gold: 400 };
        const price = prices[boxType];
        
        const userRef = doc(db, 'users', currentUser.uid);
        const userSnap = await getDoc(userRef);
        const currentScore = userSnap.data().score;
        
        if (currentScore < price) {
            showBoxResult('Yetersiz bakiye!', 'error');
            return;
        }
        
        await updateDoc(userRef, {
            score: increment(-price)
        });
        
        const result = openBox(boxType);
        showBoxResult(result.message, 'success');
        
        if (result.scoreReward) {
            await updateDoc(userRef, {
                score: increment(result.scoreReward)
            });
        }
        
        if (result.multiplier) {
            await updateDoc(userRef, {
                multiplier: result.multiplier
            });
        }
    });
});

function openBox(type) {
    const rand = Math.random();
    
    if (type === 'bronze') {
        const score = Math.floor(Math.random() * 151) + 50;
        if (rand < 0.1) {
            return { scoreReward: score, multiplier: 2, message: `🎉 ${score} Puan + x2 Katlayıcı!` };
        }
        return { scoreReward: score, message: `✨ ${score} Puan kazandın!` };
    }
    
    if (type === 'silver') {
        const score = Math.floor(Math.random() * 301) + 200;
        if (rand < 0.05) {
            return { scoreReward: score, multiplier: 5, message: `🔥 ${score} Puan + x5 Katlayıcı!` };
        } else if (rand < 0.2) {
            return { scoreReward: score, multiplier: 2, message: `🎉 ${score} Puan + x2 Katlayıcı!` };
        }
        return { scoreReward: score, message: `✨ ${score} Puan kazandın!` };
    }
    
    if (type === 'gold') {
        const score = Math.floor(Math.random() * 1001) + 500;
        if (rand < 0.05) {
            return { scoreReward: score, multiplier: 10, message: `💥 ${score} Puan + x10 MEGA Katlayıcı!` };
        } else if (rand < 0.15) {
            return { scoreReward: score, multiplier: 5, message: `🔥 ${score} Puan + x5 Katlayıcı!` };
        } else if (rand < 0.3) {
            return { scoreReward: score, multiplier: 2, message: `🎉 ${score} Puan + x2 Katlayıcı!` };
        }
        return { scoreReward: score, message: `✨ ${score} Puan kazandın!` };
    }
}

function showBoxResult(message, type) {
    const resultEl = document.getElementById('boxResult');
    resultEl.className = `box-result ${type}`;
    resultEl.textContent = message;
    
    setTimeout(() => {
        resultEl.textContent = '';
        resultEl.className = 'box-result';
    }, 5000);
}

// ========================================
// SIMPLE GAMES (Coin, RPS, Wheel)
// ========================================

// Coin Flip
document.getElementById('coinFlipCard').addEventListener('click', () => {
    document.getElementById('coinFlipModal').style.display = 'flex';
});

document.querySelectorAll('#coinFlipModal .choice-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
        const choice = btn.dataset.choice;
        const betAmount = parseInt(document.getElementById('coinBetAmount').value);
        
        if (betAmount < 10) {
            showGameResult('coinResult', 'Minimum bahis 10!', 'lose');
            return;
        }
        
        const userRef = doc(db, 'users', currentUser.uid);
        const userSnap = await getDoc(userRef);
        const currentScore = userSnap.data().score;
        
        if (currentScore < betAmount) {
            showGameResult('coinResult', 'Yetersiz bakiye!', 'lose');
            return;
        }
        
        const result = Math.random() < 0.5 ? 'heads' : 'tails';
        const won = result === choice;
        
        if (won) {
            const winAmount = Math.floor(betAmount * 1.8 * userMultiplier);
            await updateDoc(userRef, {
                score: increment(winAmount - betAmount)
            });
            showGameResult('coinResult', `🎉 Kazandın! +${winAmount - betAmount} Puan`, 'win');
        } else {
            await updateDoc(userRef, {
                score: increment(-betAmount)
            });
            showGameResult('coinResult', `😢 Kaybettin! -${betAmount} Puan`, 'lose');
        }
    });
});

// Rock Paper Scissors
document.getElementById('rpsCard').addEventListener('click', () => {
    document.getElementById('rpsModal').style.display = 'flex';
});

document.querySelectorAll('#rpsModal .choice-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
        const choice = btn.dataset.choice;
        const betAmount = parseInt(document.getElementById('rpsBetAmount').value);
        
        if (betAmount < 10) {
            showGameResult('rpsResult', 'Minimum bahis 10!', 'lose');
            return;
        }
        
        const userRef = doc(db, 'users', currentUser.uid);
        const userSnap = await getDoc(userRef);
        const currentScore = userSnap.data().score;
        
        if (currentScore < betAmount) {
            showGameResult('rpsResult', 'Yetersiz bakiye!', 'lose');
            return;
        }
        
        const choices = ['rock', 'paper', 'scissors'];
        const botChoice = choices[Math.floor(Math.random() * 3)];
        
        const wins = {
            rock: 'scissors',
            paper: 'rock',
            scissors: 'paper'
        };
        
        let result = 'draw';
        if (wins[choice] === botChoice) result = 'win';
        else if (wins[botChoice] === choice) result = 'lose';
        
        if (result === 'win') {
            const winAmount = Math.floor(betAmount * 1.9 * userMultiplier);
            await updateDoc(userRef, {
                score: increment(winAmount - betAmount)
            });
            showGameResult('rpsResult', `🎉 Kazandın! +${winAmount - betAmount} Puan`, 'win');
        } else if (result === 'lose') {
            await updateDoc(userRef, {
                score: increment(-betAmount)
            });
            showGameResult('rpsResult', `😢 Kaybettin! -${betAmount} Puan`, 'lose');
        } else {
            showGameResult('rpsResult', `🤝 Berabere! Bahis iade edildi`, 'win');
        }
    });
});

// Spin Wheel
document.getElementById('spinWheelCard').addEventListener('click', () => {
    document.getElementById('spinWheelModal').style.display = 'flex';
    drawWheel();
});

function drawWheel() {
    const canvas = document.getElementById('wheelCanvas');
    const ctx = canvas.getContext('2d');

    // Önce temizle ve dönüşü sıfırla
    canvas.style.transform = 'rotate(0deg)';
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    const segments = 8;
    const colors = ['#FF6B6B', '#4ECDC4', '#45B7D1', '#FFA07A', '#98D8C8', '#F7DC6F', '#BB8FCE', '#85C1E2'];
    const prizes = ['x0.5', 'x1', 'x1.5', 'x2', 'x3', 'x0', 'x1.2', 'x5'];
    
    const centerX = canvas.width / 2;
    const centerY = canvas.height / 2;
    const radius = 140;
    const anglePerSegment = (2 * Math.PI) / segments;
    
    for (let i = 0; i < segments; i++) {
        ctx.beginPath();
        ctx.moveTo(centerX, centerY);
        ctx.arc(centerX, centerY, radius, i * anglePerSegment, (i + 1) * anglePerSegment);
        ctx.closePath();
        ctx.fillStyle = colors[i];
        ctx.fill();
        ctx.stroke();
        
        ctx.save();
        ctx.translate(centerX, centerY);
        ctx.rotate(i * anglePerSegment + anglePerSegment / 2);
        ctx.textAlign = 'center';
        ctx.fillStyle = 'white';
        ctx.font = 'bold 18px Arial';
        ctx.fillText(prizes[i], radius / 1.5, 8);
        ctx.restore();
    }
}

document.getElementById('spinBtn').addEventListener('click', async () => {
    const betAmount = parseInt(document.getElementById('wheelBetAmount').value);
    
    if (betAmount < 10) {
        showGameResult('wheelResult', 'Minimum bahis 10!', 'lose');
        return;
    }
    
    const userRef = doc(db, 'users', currentUser.uid);
    const userSnap = await getDoc(userRef);
    const currentScore = userSnap.data().score;
    
    if (currentScore < betAmount) {
        showGameResult('wheelResult', 'Yetersiz bakiye!', 'lose');
        return;
    }
    
    const btn = document.getElementById('spinBtn');
    btn.disabled = true;
    btn.textContent = 'Çevriliyor...';
    
    const canvas = document.getElementById('wheelCanvas');
    const multipliers = [0.5, 1, 1.5, 2, 3, 0, 1.2, 5];
    // Rastgele bir açı belirle (5-10 tam tur + rastgele bitiş açısı)
    const extraSpins = 5 + Math.floor(Math.random() * 5);
    const randomAngle = Math.floor(Math.random() * 360);
    const totalRotation = (extraSpins * 360) + randomAngle;
    
    // Sonucun ne olacağını hesapla
    const segmentAngle = 360 / multipliers.length;
    // Canvas döndüğünde, ibre (saat 12 yönü / 270 derece) hangi dilime denk gelecek?
    // Canvas saat yönünde dönüyor (pozitif açı).
    // Başlangıçta 0 derece.
    // 270 derecedeki (üstteki) dilimi bulmak için:
    // İbre sabittir, çark döner.
    // Çark X derece döndüğünde, ibrenin altındaki dilim: (270 - (X % 360) + 360) % 360
    const finalAngle = totalRotation % 360;
    const pointerAngle = (270 - finalAngle + 360) % 360;
    const winningIndex = Math.floor(pointerAngle / segmentAngle);
    const result = multipliers[winningIndex];

    // Bahsi önce düş
    await updateDoc(userRef, {
        score: increment(-betAmount)
    });
    
    // Spin animation
    let currentRotation = 0;
    const spinTime = 4000; // Biraz daha uzun dönsün
    const startTime = Date.now();
    
    // Easing function for smooth stop
    const easeOutCubic = (t) => 1 - Math.pow(1 - t, 3);
    
    const spin = setInterval(async () => {
        const elapsed = Date.now() - startTime;
        const rawProgress = Math.min(elapsed / spinTime, 1);
        const easedProgress = easeOutCubic(rawProgress);
        
        currentRotation = easedProgress * totalRotation;
        canvas.style.transform = `rotate(${currentRotation}deg)`;
        
        if (rawProgress >= 1) {
            clearInterval(spin);
            
            const winAmount = Math.floor(betAmount * result * userMultiplier);
            
            if (result > 0) {
                await updateDoc(userRef, {
                    score: increment(winAmount)
                });
                showGameResult('wheelResult', `🎉 x${result}! +${winAmount} Puan`, 'win');
            } else {
                showGameResult('wheelResult', `😢 Kaybettin! -${betAmount} Puan`, 'lose');
            }
            
            btn.disabled = false;
            btn.textContent = 'ÇEVİR!';
        }
    }, 16);
});

function showGameResult(elementId, message, type) {
    const resultEl = document.getElementById(elementId);
    resultEl.className = `game-result ${type}`;
    resultEl.textContent = message;
    
    setTimeout(() => {
        resultEl.textContent = '';
        resultEl.className = 'game-result';
    }, 5000);
}

// ========================================
// CHESS ENGINE
// ========================================
document.getElementById('chessCard').addEventListener('click', () => {
    document.getElementById('chessModal').style.display = 'flex';
});

document.getElementById('chessStartBtn').addEventListener('click', async () => {
    const betAmount = parseInt(document.getElementById('chessBetAmount').value);
    const difficulty = document.getElementById('chessDifficulty').value;
    
    if (betAmount < 50) {
        showGameResult('chessResult', 'Minimum bahis 50!', 'lose');
        return;
    }
    
    const userRef = doc(db, 'users', currentUser.uid);
    const userSnap = await getDoc(userRef);
    const currentScore = userSnap.data().score;
    
    if (currentScore < betAmount) {
        showGameResult('chessResult', 'Yetersiz bakiye!', 'lose');
        return;
    }
    
    await updateDoc(userRef, { score: increment(-betAmount) });
    
    document.getElementById('chessBetDisplay').textContent = betAmount;
    document.getElementById('chessStartBtn').style.display = 'none';
    document.getElementById('chessBetAmount').disabled = true;
    document.getElementById('chessDifficulty').disabled = true;
    
    chessGame = new ChessGame(betAmount, difficulty);
    chessGame.render();
});

class ChessGame {
    constructor(betAmount, difficulty) {
        this.betAmount = betAmount;
        this.difficulty = difficulty;
        this.board = this.initializeBoard();
        this.currentTurn = 'white';
        this.selectedSquare = null;
        this.gameOver = false;
        this.whiteKingMoved = false;
        this.blackKingMoved = false;
        this.whiteRookAMoved = false;
        this.whiteRookHMoved = false;
        this.blackRookAMoved = false;
        this.blackRookHMoved = false;
        this.enPassantTarget = null;
    }
    
    initializeBoard() {
        return [
            ['♜', '♞', '♝', '♛', '♚', '♝', '♞', '♜'],
            ['♟', '♟', '♟', '♟', '♟', '♟', '♟', '♟'],
            ['', '', '', '', '', '', '', ''],
            ['', '', '', '', '', '', '', ''],
            ['', '', '', '', '', '', '', ''],
            ['', '', '', '', '', '', '', ''],
            ['♙', '♙', '♙', '♙', '♙', '♙', '♙', '♙'],
            ['♖', '♘', '♗', '♕', '♔', '♗', '♘', '♖']
        ];
    }
    
    render() {
        const boardEl = document.getElementById('chessBoard');
        boardEl.innerHTML = '';
        
        for (let row = 0; row < 8; row++) {
            for (let col = 0; col < 8; col++) {
                const square = document.createElement('div');
                square.className = `chess-square ${(row + col) % 2 === 0 ? 'light' : 'dark'}`;
                square.textContent = this.board[row][col];
                square.dataset.row = row;
                square.dataset.col = col;
                
                if (this.selectedSquare && this.selectedSquare.row === row && this.selectedSquare.col === col) {
                    square.classList.add('selected');
                }
                
                square.addEventListener('click', () => this.handleSquareClick(row, col));
                boardEl.appendChild(square);
            }
        }
        
        this.updateStatus();
    }
    
    handleSquareClick(row, col) {
        if (this.gameOver || this.currentTurn === 'black') return;
        
        const piece = this.board[row][col];
        
        if (this.selectedSquare) {
            const validMoves = this.getValidMoves(this.selectedSquare.row, this.selectedSquare.col);
            const isValidMove = validMoves.some(move => move.row === row && move.col === col);
            
            if (isValidMove) {
                this.movePiece(this.selectedSquare.row, this.selectedSquare.col, row, col);
                this.selectedSquare = null;
                this.currentTurn = 'black';
                this.render();
                
                if (this.isCheckmate('black')) {
                    this.endGame(true);
                } else if (this.isStalemate('black')) {
                    this.endGame(false, true);
                } else {
                    setTimeout(() => this.botMove(), 500);
                }
            } else if (piece && this.isWhitePiece(piece)) {
                this.selectedSquare = { row, col };
                this.render();
                this.highlightValidMoves(row, col);
            } else {
                this.selectedSquare = null;
                this.render();
            }
        } else if (piece && this.isWhitePiece(piece)) {
            this.selectedSquare = { row, col };
            this.render();
            this.highlightValidMoves(row, col);
        }
    }
    
    highlightValidMoves(row, col) {
        const validMoves = this.getValidMoves(row, col);
        const squares = document.querySelectorAll('.chess-square');
        
        validMoves.forEach(move => {
            const index = move.row * 8 + move.col;
            squares[index].classList.add('valid-move');
        });
    }
    
    movePiece(fromRow, fromCol, toRow, toCol) {
        const piece = this.board[fromRow][fromCol];
        
        // Castling
        if (piece === '♔' && Math.abs(toCol - fromCol) === 2) {
            if (toCol === 6) { // Kingside
                this.board[7][5] = this.board[7][7];
                this.board[7][7] = '';
            } else if (toCol === 2) { // Queenside
                this.board[7][3] = this.board[7][0];
                this.board[7][0] = '';
            }
            this.whiteKingMoved = true;
        }
        
        if (piece === '♚' && Math.abs(toCol - fromCol) === 2) {
            if (toCol === 6) {
                this.board[0][5] = this.board[0][7];
                this.board[0][7] = '';
            } else if (toCol === 2) {
                this.board[0][3] = this.board[0][0];
                this.board[0][0] = '';
            }
            this.blackKingMoved = true;
        }
        
        // En passant
        if (piece === '♙' && this.enPassantTarget && toRow === this.enPassantTarget.row && toCol === this.enPassantTarget.col) {
            this.board[toRow + 1][toCol] = '';
        }
        if (piece === '♟' && this.enPassantTarget && toRow === this.enPassantTarget.row && toCol === this.enPassantTarget.col) {
            this.board[toRow - 1][toCol] = '';
        }
        
        // Set en passant target
        this.enPassantTarget = null;
        if (piece === '♙' && fromRow === 6 && toRow === 4) {
            this.enPassantTarget = { row: 5, col: fromCol };
        }
        if (piece === '♟' && fromRow === 1 && toRow === 3) {
            this.enPassantTarget = { row: 2, col: fromCol };
        }
        
        // Track rook moves
        if (piece === '♖') {
            if (fromRow === 7 && fromCol === 0) this.whiteRookAMoved = true;
            if (fromRow === 7 && fromCol === 7) this.whiteRookHMoved = true;
        }
        if (piece === '♜') {
            if (fromRow === 0 && fromCol === 0) this.blackRookAMoved = true;
            if (fromRow === 0 && fromCol === 7) this.blackRookHMoved = true;
        }
        
        // Track king moves
        if (piece === '♔') this.whiteKingMoved = true;
        if (piece === '♚') this.blackKingMoved = true;
        
        this.board[toRow][toCol] = piece;
        this.board[fromRow][fromCol] = '';
        
        // Pawn promotion
        if (piece === '♙' && toRow === 0) this.board[toRow][toCol] = '♕';
        if (piece === '♟' && toRow === 7) this.board[toRow][toCol] = '♛';
    }

    getValidMoves(row, col) {
        const piece = this.board[row][col];
        if (!piece) return [];

        const isWhite = this.isWhitePiece(piece);
        const color = isWhite ? 'white' : 'black';

        // Önce ham (kurallı ama "şah güvenliği" kontrolsüz) hareketleri al
        const pseudoMoves = this.getPseudoMoves(row, col, { forAttack: false });

        // Sonra her hareketi simüle edip şahı tehdit altında bırakmayanları filtrele
        const legalMoves = [];

        for (const move of pseudoMoves) {
            const backupBoard = this.board.map(r => [...r]);

            this.board[move.row][move.col] = piece;
            this.board[row][col] = '';

            const kingInCheck = this.isInCheck(color);

            // tahtayı geri al
            this.board = backupBoard;

            if (!kingInCheck) {
                legalMoves.push(move);
            }
        }

        return legalMoves;
    }

    getPseudoMoves(row, col, options = { forAttack: false }) {
        const piece = this.board[row][col];
        const moves = [];
        const isWhite = this.isWhitePiece(piece);
        const forAttack = options.forAttack;

        const pawnMoves = (r, c) => {
            const direction = isWhite ? -1 : 1;
            const startRow = isWhite ? 6 : 1;

            // Piyon saldırı karelerini bul (hem saldırı hesabında hem normalde lazım)
            for (let dc of [-1, 1]) {
                const nr = r + direction;
                const nc = c + dc;
                if (!this.isInBounds(nr, nc)) continue;
                const target = this.board[nr][nc];
                if (forAttack) {
                    // Saldırı hesabında sadece çapraz kareleri dikkate al
                    moves.push({ row: nr, col: nc });
                } else {
                    // Normal hamlede, karşı renk taş varsa çapraz yiyebilir
                    if (target && this.isWhitePiece(target) !== isWhite) {
                        moves.push({ row: nr, col: nc });
                    }
                }
            }

            if (forAttack) return; // Saldırı modunda ileri gitmeyi ekleme

            // İleri tek kare
            if (this.isInBounds(r + direction, c) && !this.board[r + direction][c]) {
                moves.push({ row: r + direction, col: c });

                // Başlangıçtan çift kare
                if (r === startRow && !this.board[r + 2 * direction][c]) {
                    moves.push({ row: r + 2 * direction, col: c });
                }
            }

            // En passant
            if (this.enPassantTarget && r + direction === this.enPassantTarget.row) {
                if (c + 1 === this.enPassantTarget.col || c - 1 === this.enPassantTarget.col) {
                    moves.push({ row: this.enPassantTarget.row, col: this.enPassantTarget.col });
                }
            }
        };

        const knightMoves = (r, c) => {
            const deltas = [[-2, -1], [-2, 1], [-1, -2], [-1, 2], [1, -2], [1, 2], [2, -1], [2, 1]];
            deltas.forEach(([dr, dc]) => {
                const nr = r + dr, nc = c + dc;
                if (this.isInBounds(nr, nc)) {
                    const target = this.board[nr][nc];
                    if (!target || this.isWhitePiece(target) !== isWhite) {
                        moves.push({ row: nr, col: nc });
                    }
                }
            });
        };

        const slidingMoves = (r, c, directions) => {
            directions.forEach(([dr, dc]) => {
                let nr = r + dr, nc = c + dc;
                while (this.isInBounds(nr, nc)) {
                    const target = this.board[nr][nc];
                    if (!target) {
                        moves.push({ row: nr, col: nc });
                    } else {
                        if (this.isWhitePiece(target) !== isWhite) {
                            moves.push({ row: nr, col: nc });
                        }
                        break;
                    }
                    nr += dr;
                    nc += dc;
                }
            });
        };

        const kingMoves = (r, c) => {
            const deltas = [[-1, -1], [-1, 0], [-1, 1], [0, -1], [0, 1], [1, -1], [1, 0], [1, 1]];
            deltas.forEach(([dr, dc]) => {
                const nr = r + dr, nc = c + dc;
                if (this.isInBounds(nr, nc)) {
                    const target = this.board[nr][nc];
                    if (!target || this.isWhitePiece(target) !== isWhite) {
                        moves.push({ row: nr, col: nc });
                    }
                }
            });

            if (forAttack) return; // Saldırı hesabında rok karelerini eklemeye gerek yok

            // Rok (castling) hamlelerini de burada ekliyoruz
            if (isWhite && !this.whiteKingMoved && !this.isInCheck('white')) {
                if (!this.whiteRookHMoved && !this.board[7][5] && !this.board[7][6]) {
                    moves.push({ row: 7, col: 6 }); // kısa rok
                }
                if (!this.whiteRookAMoved && !this.board[7][1] && !this.board[7][2] && !this.board[7][3]) {
                    moves.push({ row: 7, col: 2 }); // uzun rok
                }
            }

            if (!isWhite && !this.blackKingMoved && !this.isInCheck('black')) {
                if (!this.blackRookHMoved && !this.board[0][5] && !this.board[0][6]) {
                    moves.push({ row: 0, col: 6 });
                }
                if (!this.blackRookAMoved && !this.board[0][1] && !this.board[0][2] && !this.board[0][3]) {
                    moves.push({ row: 0, col: 2 });
                }
            }
        };

        if (piece === '♙' || piece === '♟') pawnMoves(row, col);
        else if (piece === '♘' || piece === '♞') knightMoves(row, col);
        else if (piece === '♗' || piece === '♝') slidingMoves(row, col, [[-1, -1], [-1, 1], [1, -1], [1, 1]]);
        else if (piece === '♖' || piece === '♜') slidingMoves(row, col, [[-1, 0], [1, 0], [0, -1], [0, 1]]);
        else if (piece === '♕' || piece === '♛') slidingMoves(row, col, [[-1, -1], [-1, 0], [-1, 1], [0, -1], [0, 1], [1, -1], [1, 0], [1, 1]]);
        else if (piece === '♔' || piece === '♚') kingMoves(row, col);

        return moves;
    }
    
    isWhitePiece(piece) {
        return ['♙', '♘', '♗', '♖', '♕', '♔'].includes(piece);
    }
    
    isBlackPiece(piece) {
        return ['♟', '♞', '♝', '♜', '♛', '♚'].includes(piece);
    }
    
    isInBounds(row, col) {
        return row >= 0 && row < 8 && col >= 0 && col < 8;
    }
    
    findKing(color) {
        const king = color === 'white' ? '♔' : '♚';
        for (let r = 0; r < 8; r++) {
            for (let c = 0; c < 8; c++) {
                if (this.board[r][c] === king) return { row: r, col: c };
            }
        }
        return null;
    }
    
    isSquareAttacked(row, col, byColor) {
        for (let r = 0; r < 8; r++) {
            for (let c = 0; c < 8; c++) {
                const piece = this.board[r][c];
                if (!piece) continue;

                const isPieceWhite = this.isWhitePiece(piece);
                if ((byColor === 'white' && !isPieceWhite) || (byColor === 'black' && isPieceWhite)) {
                    continue;
                }

                // Saldırı için pseudo hamleleri kullan
                const attackMoves = this.getPseudoMoves(r, c, { forAttack: true });
                if (attackMoves.some(m => m.row === row && m.col === col)) {
                    return true;
                }
            }
        }
        return false;
    }
    
    isInCheck(color) {
        const kingPos = this.findKing(color);
        if (!kingPos) return false;
        return this.isSquareAttacked(kingPos.row, kingPos.col, color === 'white' ? 'black' : 'white');
    }
    
    isCheckmate(color) {
        if (!this.isInCheck(color)) return false;
        
        for (let r = 0; r < 8; r++) {
            for (let c = 0; c < 8; c++) {
                const piece = this.board[r][c];
                if (!piece) continue;
                
                const isPieceWhite = this.isWhitePiece(piece);
                if ((color === 'white' && !isPieceWhite) || (color === 'black' && isPieceWhite)) continue;
                
                const moves = this.getValidMoves(r, c);
                if (moves.length > 0) return false;
            }
        }
        return true;
    }
    
    isStalemate(color) {
        if (this.isInCheck(color)) return false;
        
        for (let r = 0; r < 8; r++) {
            for (let c = 0; c < 8; c++) {
                const piece = this.board[r][c];
                if (!piece) continue;
                
                const isPieceWhite = this.isWhitePiece(piece);
                if ((color === 'white' && !isPieceWhite) || (color === 'black' && isPieceWhite)) continue;
                
                const moves = this.getValidMoves(r, c);
                if (moves.length > 0) return false;
            }
        }
        return true;
    }
    
    botMove() {
        const depth = this.difficulty === 'easy' ? 1 : this.difficulty === 'medium' ? 2 : 3;
        // Bot siyahtır, siyahlar negatif puandır. Bu yüzden minimize etmeli (false).
        const bestMove = this.minimax(depth, -Infinity, Infinity, false);
        
        if (bestMove.move) {
            this.movePiece(bestMove.move.from.row, bestMove.move.from.col, bestMove.move.to.row, bestMove.move.to.col);
            this.currentTurn = 'white';
            this.render();
            
            if (this.isCheckmate('white')) {
                this.endGame(false);
            } else if (this.isStalemate('white')) {
                this.endGame(false, true);
            }
        }
    }
    
    minimax(depth, alpha, beta, maximizingPlayer) {
        if (depth === 0) {
            return { score: this.evaluateBoard() };
        }
        
        const moves = [];
        for (let r = 0; r < 8; r++) {
            for (let c = 0; c < 8; c++) {
                const piece = this.board[r][c];
                if (!piece) continue;
                
                const isPieceBlack = this.isBlackPiece(piece);
                if ((maximizingPlayer && !isPieceBlack) || (!maximizingPlayer && isPieceBlack)) continue;
                
                const validMoves = this.getValidMoves(r, c);
                validMoves.forEach(move => {
                    moves.push({ from: { row: r, col: c }, to: move });
                });
            }
        }
        
        if (moves.length === 0) {
            if (this.isCheckmate(maximizingPlayer ? 'black' : 'white')) {
                return { score: maximizingPlayer ? -10000 : 10000 };
            }
            return { score: 0 };
        }
        
        if (maximizingPlayer) {
            let maxEval = -Infinity;
            let bestMove = null;
            
            for (let move of moves) {
                const tempBoard = this.board.map(r => [...r]);
                this.movePiece(move.from.row, move.from.col, move.to.row, move.to.col);
                
                const evaluation = this.minimax(depth - 1, alpha, beta, false).score;
                
                this.board = tempBoard;
                
                if (evaluation > maxEval) {
                    maxEval = evaluation;
                    bestMove = move;
                }
                
                alpha = Math.max(alpha, evaluation);
                if (beta <= alpha) break;
            }
            
            return { score: maxEval, move: bestMove };
        } else {
            let minEval = Infinity;
            let bestMove = null;
            
            for (let move of moves) {
                const tempBoard = this.board.map(r => [...r]);
                this.movePiece(move.from.row, move.from.col, move.to.row, move.to.col);
                
                const evaluation = this.minimax(depth - 1, alpha, beta, true).score;
                
                this.board = tempBoard;
                
                if (evaluation < minEval) {
                    minEval = evaluation;
                    bestMove = move;
                }
                
                beta = Math.min(beta, evaluation);
                if (beta <= alpha) break;
            }
            
            return { score: minEval, move: bestMove };
        }
    }
    
    evaluateBoard() {
        const pieceValues = {
            '♙': 1, '♘': 3, '♗': 3, '♖': 5, '♕': 9, '♔': 0,
            '♟': -1, '♞': -3, '♝': -3, '♜': -5, '♛': -9, '♚': 0
        };
        
        let score = 0;
        for (let r = 0; r < 8; r++) {
            for (let c = 0; c < 8; c++) {
                const piece = this.board[r][c];
                if (piece) score += pieceValues[piece] || 0;
            }
        }
        return score;
    }
    
    async endGame(playerWon, isDraw = false) {
        this.gameOver = true;
        const userRef = doc(db, 'users', currentUser.uid);
        
        if (isDraw) {
            await updateDoc(userRef, { score: increment(this.betAmount) });
            showGameResult('chessResult', '🤝 Berabere! Bahis iade edildi', 'win');
        } else if (playerWon) {
            const winAmount = Math.floor(this.betAmount * 2.5 * userMultiplier);
            await updateDoc(userRef, { score: increment(winAmount) });
            showGameResult('chessResult', `🎉 Kazandın! +${winAmount} Puan`, 'win');
        } else {
            showGameResult('chessResult', `😢 Kaybettin! Bot kazandı`, 'lose');
        }
        
        document.getElementById('chessStartBtn').style.display = 'block';
        document.getElementById('chessBetAmount').disabled = false;
        document.getElementById('chessDifficulty').disabled = false;
    }
    
    updateStatus() {
        const statusEl = document.getElementById('chessStatus');
        if (this.gameOver) return;
        
        if (this.currentTurn === 'white') {
            statusEl.textContent = this.isInCheck('white') ? 'Şah! - Senin Sıran' : 'Senin Sıran (Beyaz)';
        } else {
            statusEl.textContent = this.isInCheck('black') ? 'Şah! - Bot Düşünüyor...' : 'Bot Düşünüyor...';
        }
    }
}

// ========================================
// 2048 GAME LOGIC
// ========================================
class Game2048 {
    constructor() {
        this.grid = Array(4).fill().map(() => Array(4).fill(0));
        this.score = 0;
        this.gameOver = false;
        this.betAmount = 0;
    }

    async startGame(bet) {
        this.betAmount = bet;
        this.score = 0;
        this.grid = Array(4).fill().map(() => Array(4).fill(0));
        this.gameOver = false;
        
        // Başlangıçta 2 tane sayı ekle
        this.addRandomTile();
        this.addRandomTile();
        
        this.updateView();
        
        // Klavye dinleyicisi ekle
        document.addEventListener('keydown', this.handleInput.bind(this));
    }

    addRandomTile() {
        const emptyCells = [];
        for(let r=0; r<4; r++) {
            for(let c=0; c<4; c++) {
                if(this.grid[r][c] === 0) emptyCells.push({r, c});
            }
        }
        
        if(emptyCells.length > 0) {
            const {r, c} = emptyCells[Math.floor(Math.random() * emptyCells.length)];
            this.grid[r][c] = Math.random() < 0.9 ? 2 : 4;
        }
    }

    handleInput(e) {
        if(this.gameOver) return;
        
        let moved = false;
        switch(e.key) {
            case 'ArrowUp': moved = this.moveUp(); break;
            case 'ArrowDown': moved = this.moveDown(); break;
            case 'ArrowLeft': moved = this.moveLeft(); break;
            case 'ArrowRight': moved = this.moveRight(); break;
            default: return;
        }
        
        if(moved) {
            this.addRandomTile();
            this.updateView();
            
            if(this.checkGameOver()) {
                this.endGame();
            }
        }
    }

    moveLeft() {
        let moved = false;
        for(let r=0; r<4; r++) {
            const row = this.grid[r];
            const newRow = row.filter(val => val !== 0);
            
            for(let i=0; i<newRow.length-1; i++) {
                if(newRow[i] === newRow[i+1]) {
                    newRow[i] *= 2;
                    this.score += newRow[i];
                    newRow.splice(i+1, 1);
                    moved = true;
                }
            }
            
            while(newRow.length < 4) newRow.push(0);
            
            if(JSON.stringify(this.grid[r]) !== JSON.stringify(newRow)) {
                this.grid[r] = newRow;
                moved = true;
            }
        }
        return moved;
    }

    moveRight() {
        let moved = false;
        for(let r=0; r<4; r++) {
            const row = this.grid[r];
            const newRow = row.filter(val => val !== 0);
            
            for(let i=newRow.length-1; i>0; i--) {
                if(newRow[i] === newRow[i-1]) {
                    newRow[i] *= 2;
                    this.score += newRow[i];
                    newRow.splice(i-1, 1);
                    moved = true;
                }
            }
            
            while(newRow.length < 4) newRow.unshift(0);
            
            if(JSON.stringify(this.grid[r]) !== JSON.stringify(newRow)) {
                this.grid[r] = newRow;
                moved = true;
            }
        }
        return moved;
    }

    moveUp() {
        let moved = false;
        for(let c=0; c<4; c++) {
            let col = [this.grid[0][c], this.grid[1][c], this.grid[2][c], this.grid[3][c]];
            const newCol = col.filter(val => val !== 0);
            
            for(let i=0; i<newCol.length-1; i++) {
                if(newCol[i] === newCol[i+1]) {
                    newCol[i] *= 2;
                    this.score += newCol[i];
                    newCol.splice(i+1, 1);
                    moved = true;
                }
            }
            
            while(newCol.length < 4) newCol.push(0);
            
            for(let r=0; r<4; r++) {
                if(this.grid[r][c] !== newCol[r]) {
                    this.grid[r][c] = newCol[r];
                    moved = true;
                }
            }
        }
        return moved;
    }

    moveDown() {
        let moved = false;
        for(let c=0; c<4; c++) {
            let col = [this.grid[0][c], this.grid[1][c], this.grid[2][c], this.grid[3][c]];
            const newCol = col.filter(val => val !== 0);
            
            for(let i=newCol.length-1; i>0; i--) {
                if(newCol[i] === newCol[i-1]) {
                    newCol[i] *= 2;
                    this.score += newCol[i];
                    newCol.splice(i-1, 1);
                    moved = true;
                }
            }
            
            while(newCol.length < 4) newCol.unshift(0);
            
            for(let r=0; r<4; r++) {
                if(this.grid[r][c] !== newCol[r]) {
                    this.grid[r][c] = newCol[r];
                    moved = true;
                }
            }
        }
        return moved;
    }

    checkGameOver() {
        // Boş hücre var mı?
        for(let r=0; r<4; r++) {
            for(let c=0; c<4; c++) {
                if(this.grid[r][c] === 0) return false;
            }
        }
        
        // Yan yana aynı sayılar var mı?
        for(let r=0; r<4; r++) {
            for(let c=0; c<3; c++) {
                if(this.grid[r][c] === this.grid[r][c+1]) return false;
            }
        }
        for(let r=0; r<3; r++) {
            for(let c=0; c<4; c++) {
                if(this.grid[r][c] === this.grid[r+1][c]) return false;
            }
        }
        
        return true;
    }

    updateView() {
        const gridContainer = document.getElementById('game2048Grid');
        gridContainer.innerHTML = '';
        
        for(let r=0; r<4; r++) {
            for(let c=0; c<4; c++) {
                const cell = document.createElement('div');
                cell.className = 'grid-cell';
                
                const value = this.grid[r][c];
                if(value > 0) {
                    const tile = document.createElement('div');
                    tile.className = `tile tile-${value}`;
                    tile.textContent = value;
                    cell.appendChild(tile);
                }
                
                gridContainer.appendChild(cell);
            }
        }
        
        document.getElementById('score2048').textContent = this.score;
    }

    async endGame() {
        this.gameOver = true;
        // Puan hesapla: Skorun %10'u kadar coin kazan
        const winAmount = Math.floor(this.score * 0.1);
        
        if(winAmount > 0) {
            const userRef = doc(db, 'users', currentUser.uid);
            await updateDoc(userRef, {
                score: increment(winAmount)
            });
            alert(`Oyun Bitti! Skor: ${this.score}. Kazanç: ${winAmount} Puan`);
        } else {
            alert(`Oyun Bitti! Skor: ${this.score}.`);
        }
        
        document.getElementById('game2048Modal').style.display = 'none';
    }
}

// ========================================
// MODAL CLOSE HANDLERS
// ========================================
document.querySelectorAll('.modal-close').forEach(btn => {
    btn.addEventListener('click', () => {
        const modalId = btn.dataset.modal;
        document.getElementById(modalId).style.display = 'none';
    });
});

document.querySelectorAll('.game-modal').forEach(modal => {
    modal.addEventListener('click', (e) => {
        if (e.target === modal) {
            modal.style.display = 'none';
        }
    });
});

// ========================================
// VS SYSTEM LOGIC
// ========================================
document.getElementById('chatVsBtn')?.addEventListener('click', () => {
    document.getElementById('vsRequestModal').style.display = 'flex';
});

document.getElementById('sendVsRequestBtn')?.addEventListener('click', async () => {
    const game = document.getElementById('vsGameSelect').value;
    const bet = parseInt(document.getElementById('vsBetAmount').value);
    
    if (bet < 50) {
        alert('Minimum bahis 50 olmalıdır!');
        return;
    }

    const userRef = doc(db, 'users', currentUser.uid);
    const userSnap = await getDoc(userRef);
    const userData = userSnap.data();
    
    if (userData.score < bet) {
        alert('Yetersiz bakiye!');
        return;
    }
    
    // Send VS Request to Chat
    try {
        await addDoc(collection(db, 'chat'), {
            username: userData.username,
            userId: currentUser.uid,
            role: userData.role || 'user',
            isVsRequest: true,
            game: game,
            bet: bet,
            status: 'pending',
            timestamp: serverTimestamp(),
            message: `VS İsteği: ${game} (${bet})` // Fallback
        });
        
        document.getElementById('vsRequestModal').style.display = 'none';
    } catch (error) {
        alert('İstek gönderilemedi: ' + error.message);
    }
});

window.acceptVsRequest = async (msgId, game, bet, challengerId) => {
    if (currentUser.uid === challengerId) {
        alert('Kendi isteğini kabul edemezsin!');
        return;
    }

    const userRef = doc(db, 'users', currentUser.uid);
    const userSnap = await getDoc(userRef);
    const userData = userSnap.data();
    
    if (userData.score < bet) {
        alert('Yetersiz bakiye! Bu maça girmek için puanın yetmiyor.');
        return;
    }
    
    if (!confirm(`${bet} Puan bahisle maça girmek istiyor musun?`)) return;
    
    try {
        // 1. Update Chat Message
        const chatRef = doc(db, 'chat', msgId);
        await updateDoc(chatRef, {
            status: 'accepted',
            acceptedBy: currentUser.uid,
            acceptedByName: userData.username
        });
        
        // 2. Deduct Balance from Acceptor
        await updateDoc(userRef, {
            score: increment(-bet)
        });
        
        // 3. Show Success
        alert(`✅ Maç Kabul Edildi! Başarılar!`);
        
        // Open game modal
        if (game === 'chess') {
            document.getElementById('chessModal').style.display = 'flex';
        } else if (game === '2048') {
            document.getElementById('game2048Modal').style.display = 'flex';
            if (!game2048) game2048 = new Game2048();
            game2048.startGame(bet); // Bahisli oyun başlat
        }
        
    } catch (error) {
        console.error(error);
        alert('Hata oluştu: ' + error.message);
    }
};

// 2048 Game Card Click Listener
document.getElementById('game2048Card')?.addEventListener('click', () => {
    document.getElementById('game2048Modal').style.display = 'flex';
    if (!game2048) game2048 = new Game2048();
    game2048.startGame(0); // Bahissiz pratik modu
});
