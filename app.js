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
    deleteDoc,
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
        initEnhancements();
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

document.querySelectorAll('.admin-tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
        document.querySelectorAll('.admin-tab-btn').forEach(b => b.classList.remove('active'));
        document.querySelectorAll('.admin-tab-content').forEach(c => c.classList.remove('active'));

        btn.classList.add('active');
        const tabName = btn.dataset.tab;
        const tabId = `admin${tabName.charAt(0).toUpperCase() + tabName.slice(1)}Tab`;
        const tabEl = document.getElementById(tabId);
        if (tabEl) tabEl.classList.add('active');

        if (tabName === 'presence') loadPresenceData();
        else if (tabName === 'dashboard') loadAdminDashboard();
        else if (tabName === 'analytics') loadAdminAnalytics();
    });
});

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
                <button class="admin-action-quick-btn" onclick="openAdminAction('${docSnap.id}', '${data.username}', ${!!data.banned}, ${!!data.muted})">
                    ⚙️ İşlemler
                </button>
            </div>
        `;
        listEl.appendChild(item);
    });
}

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
                            ${data.role === 'admin' ? '<span class="admin-badge admin">Admin</span>' : ''}
                            ${data.banned ? '<span class="admin-badge banned">Banned</span>' : ''}
                            ${data.muted ? '<span class="admin-badge muted">Muted</span>' : ''}
                        </div>
                    </div>
                </div>
                <div class="admin-user-actions">
                    <button class="admin-action-quick-btn" onclick="openAdminAction('${docSnap.id}', '${data.username}', ${!!data.banned}, ${!!data.muted})">
                        ⚙️ İşlemler
                    </button>
                </div>
            `;
            listEl.appendChild(item);
        }
    });
});

window.openAdminAction = (uid, username, isBanned, isMuted) => {
    document.getElementById('adminActionModal').style.display = 'flex';
    document.getElementById('actionUserName').textContent = username;
    document.getElementById('adminActionModal').dataset.uid = uid;

    document.getElementById('banUserBtn').style.display = isBanned ? 'none' : 'block';
    document.getElementById('unbanUserBtn').style.display = isBanned ? 'block' : 'none';
    document.getElementById('muteUserBtn').style.display = isMuted ? 'none' : 'block';
    document.getElementById('unmuteUserBtn').style.display = isMuted ? 'block' : 'none';

    document.getElementById('muteOptions').style.display = 'none';
    document.getElementById('passwordResetOptions').style.display = 'none';
    document.getElementById('adminActionMessage').textContent = '';
};

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

document.getElementById('resetPasswordBtn').addEventListener('click', () => {
    document.getElementById('passwordResetOptions').style.display = 'block';
    const input = document.getElementById('newPasswordInput');
    if (input) {
        input.disabled = true;
        input.placeholder = 'Mail ile sıfırlama linki gönderilecek';
    }
});

document.getElementById('confirmResetBtn').addEventListener('click', async () => {
    const messageEl = document.getElementById('adminActionMessage');
    const uid = document.getElementById('adminActionModal').dataset.uid;

    try {
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

        await sendPasswordResetEmail(auth, email);

        messageEl.className = 'admin-message success';
        messageEl.textContent = `✅ Şifre sıfırlama bağlantısı ${email} adresine gönderildi.`;
    } catch (error) {
        console.error(error);
        messageEl.className = 'admin-message error';
        messageEl.textContent = error.message || 'Şifre sıfırlama linki gönderilirken hata oluştu.';
    }
});

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
            const lastSeen = presence && presence.lastSeen;
            const lastSeenStr = (lastSeen && typeof lastSeen === 'number') ? new Date(lastSeen).toLocaleString('tr-TR') : '';
            item.innerHTML = `
                <div class="presence-user-info">
                    <div class="presence-status-dot ${isOnline ? 'online' : 'offline'}"></div>
                    <div>
                        <div class="presence-user-name">${userData.username}</div>
                        ${!isOnline && lastSeenStr ? `<div class="presence-last-seen">Son görülme: ${lastSeenStr}</div>` : ''}
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

document.getElementById('userSearchInput').addEventListener('input', async (e) => {
    const searchTerm = e.target.value.toLowerCase();

    if (!searchTerm) {
        document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
        document.getElementById('topUsersTab').style.display = 'block';
        document.getElementById('searchResultsTab').style.display = 'none';
        document.querySelectorAll('.tab-btn')[0].classList.add('active');
        return;
    }

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

document.getElementById('chatDmBtn')?.addEventListener('click', () => {
    document.querySelectorAll('.chat-tab-btn').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.chat-tab-content').forEach(c => c.classList.remove('active'));
    document.querySelector('.chat-tab-btn[data-tab="dm"]').classList.add('active');
    document.getElementById('dmChatTab').classList.add('active');
    loadDmUsers();
});

async function loadChat() {
    const messagesEl = document.getElementById('chatMessages');

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

async function sendChatMessage() {
    const input = document.getElementById('chatInput');
    const message = input.value.trim();

    if (!message) return;

    const userRef = doc(db, 'users', currentUser.uid);
    const userSnap = await getDoc(userRef);
    const userData = userSnap.data();

    if (userData.muted && userData.muteUntil > Date.now()) {
        alert('Susturulduğunuz için mesaj gönderemezsiniz.');
        return;
    }

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
    const presenceRef = ref(rtdb, 'presence');

    listEl.innerHTML = '';
    const presenceData = await new Promise((resolve) => {
        onValue(presenceRef, (s) => resolve(s.val() || {}), { onlyOnce: true });
    });

    snapshot.forEach(docSnap => {
        if (docSnap.id === currentUser.uid) return;

        const data = docSnap.data();
        const isOnline = !!(presenceData[docSnap.id] && presenceData[docSnap.id].online);
        const unread = dmUnreadCounts[docSnap.id] || 0;
        const item = document.createElement('div');
        item.className = 'dm-user-item';
        item.dataset.recipientId = docSnap.id;
        item.innerHTML = `
            <div class="dm-user-avatar">
                ${data.profileImage ? `<img src="${data.profileImage}" alt="">` : '👤'}
            </div>
            <div class="dm-user-info">
                <div class="dm-user-name-display">${data.username}</div>
                <div class="dm-user-status dm-user-status--${isOnline ? 'online' : 'offline'}">
                    ${isOnline ? '🟢 Çevrimiçi' : '⚫ Çevrimdışı'}
                </div>
                ${unread ? `<span class="dm-unread-dot">${unread}</span>` : ''}
            </div>
        `;
        item.addEventListener('click', () => openDmConversation(docSnap.id, data.username));
        listEl.appendChild(item);
    });
}

let dmUnreadCounts = {};
let dmReceiptsUnsubscribe = null;

function openDmConversation(recipientId, recipientName) {
    currentDmRecipient = recipientId;
    document.getElementById('dmUserName').textContent = recipientName;
    document.getElementById('dmUserList').style.display = 'none';
    document.getElementById('dmConversation').style.display = 'flex';

    const onlineRef = ref(rtdb, `presence/${recipientId}`);
    onValue(onlineRef, (s) => {
        const v = s.val();
        const el = document.getElementById('dmUserOnline');
        if (el) el.textContent = v && v.online ? '🟢 Çevrimiçi' : '⚫ Çevrimdışı';
    });

    dmUnreadCounts[recipientId] = 0;
    updateDmUnreadBadge();
    loadDmMessages(recipientId);
}

document.getElementById('dmBackBtn').addEventListener('click', () => {
    document.getElementById('dmUserList').style.display = 'block';
    document.getElementById('dmConversation').style.display = 'none';
    currentDmRecipient = null;
    if (dmReceiptsUnsubscribe) { dmReceiptsUnsubscribe(); dmReceiptsUnsubscribe = null; }
});

async function loadDmMessages(recipientId) {
    const messagesEl = document.getElementById('dmMessages');
    messagesEl.innerHTML = '';

    const conversationId = [currentUser.uid, recipientId].sort().join('_');
    const messagesRef = collection(db, 'dm', conversationId, 'messages');
    const receiptsRef = collection(db, 'dm', conversationId, 'receipts');

    const receiptsSnapshot = await getDocs(receiptsRef);
    const readByRecipient = {};
    receiptsSnapshot.forEach(d => {
        const dta = d.data();
        if (dta.readBy === recipientId) readByRecipient[dta.messageId] = true;
    });

    onSnapshot(query(messagesRef, orderBy('timestamp', 'asc')), async (snapshot) => {
        messagesEl.innerHTML = '';
        snapshot.forEach(docSnap => {
            const msg = docSnap.data();
            const msgEl = document.createElement('div');
            msgEl.className = 'chat-message';
            msgEl.dataset.msgId = docSnap.id;

            const time = msg.timestamp
                ? new Date(msg.timestamp.toMillis()).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })
                : '';
            const isOwn = msg.senderId === currentUser.uid;
            const read = readByRecipient[docSnap.id];
            const check = isOwn ? (read ? '✓✓' : '✓') : '';

            msgEl.innerHTML = `
                <div class="message-user">${isOwn ? 'Sen' : msg.username}</div>
                <div class="message-text">${msg.message}</div>
                <div class="message-meta">
                    <span class="message-time">${time}</span>
                    ${check ? `<span class="message-read">${check}</span>` : ''}
                </div>
            `;
            messagesEl.appendChild(msgEl);
        });
        messagesEl.scrollTop = messagesEl.scrollHeight;

        for (const docSnap of snapshot.docs) {
            const msg = docSnap.data();
            if (msg.senderId !== recipientId) continue;
            const recRef = doc(db, 'dm', conversationId, 'receipts', docSnap.id);
            try {
                const recSnap = await getDoc(recRef);
                if (recSnap.exists() && !recSnap.data().readBy) {
                    await updateDoc(recRef, { readBy: currentUser.uid });
                }
            } catch (_) {}
        }
    });

    dmReceiptsUnsubscribe = onSnapshot(receiptsRef, (snap) => {
        snap.forEach(d => {
            const dta = d.data();
            if (dta.readBy === recipientId) readByRecipient[dta.messageId] = true;
        });
        document.querySelectorAll('#dmMessages .chat-message').forEach((el) => {
            const mid = el.dataset.msgId;
            const meta = el.querySelector('.message-meta');
            if (!meta) return;
            let readSpan = meta.querySelector('.message-read');
            if (readByRecipient[mid]) {
                if (!readSpan) { readSpan = document.createElement('span'); readSpan.className = 'message-read'; meta.appendChild(readSpan); }
                readSpan.textContent = '✓✓';
            }
        });
    });
}

async function sendDmMessage() {
    if (!currentDmRecipient) return;

    const input = document.getElementById('dmInput');
    const message = input.value.trim();

    if (!message) return;

    const userRef = doc(db, 'users', currentUser.uid);
    const userSnap = await getDoc(userRef);
    const userData = userSnap.data();

    if (userData.muted && userData.muteUntil > Date.now()) {
        alert('Susturulduğunuz için mesaj gönderemezsiniz.');
        return;
    }

    const conversationId = [currentUser.uid, currentDmRecipient].sort().join('_');
    const messagesRef = collection(db, 'dm', conversationId, 'messages');

    const ref = await addDoc(messagesRef, {
        senderId: currentUser.uid,
        username: userData.username,
        message: message,
        timestamp: serverTimestamp()
    });

    input.value = '';

    await setDoc(doc(db, 'dm', conversationId, 'receipts', ref.id), {
        messageId: ref.id,
        readBy: null,
        sentAt: serverTimestamp()
    });
}

document.getElementById('dmSend').addEventListener('click', sendDmMessage);
document.getElementById('dmInput').addEventListener('keypress', (e) => {
    if (e.key === 'Enter') sendDmMessage();
});

function updateDmUnreadBadge() {
    const total = Object.values(dmUnreadCounts).reduce((a, b) => a + b, 0);
    const badge = document.getElementById('dmUnreadBadge');
    if (!badge) return;
    if (total) {
        badge.style.display = 'inline';
        badge.textContent = total > 99 ? '99+' : total;
    } else {
        badge.style.display = 'none';
    }
}

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
        await updateDoc(userRef, { score: increment(50) });

        btn.style.display = 'none';
        document.getElementById('adCooldown').style.display = 'block';

        let timeLeft = 300;
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
    loadInventory();
});

const BOX_PRICES = { bronze: 50, silver: 150, gold: 400, epic: 250, legendary: 600, daily: 0 };

document.querySelectorAll('.buy-box-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
        const boxType = btn.dataset.box;
        const price = BOX_PRICES[boxType];

        if (boxType === 'daily') {
            await claimDailyBox();
            return;
        }

        const userRef = doc(db, 'users', currentUser.uid);
        const userSnap = await getDoc(userRef);
        const currentScore = userSnap.data().score;

        if (currentScore < price) {
            showBoxResult('Yetersiz bakiye!', 'error');
            return;
        }

        await updateDoc(userRef, { score: increment(-price) });

        const result = openBox(boxType);
        await playBoxOpenAnimation(boxType, result);
        showBoxResult(result.message, 'success');

        if (result.scoreReward) {
            await updateDoc(userRef, { score: increment(result.scoreReward) });
        }
        if (result.multiplier) {
            await updateDoc(userRef, { multiplier: result.multiplier });
        }
        loadInventory();
    });
});

async function claimDailyBox() {
    const userRef = doc(db, 'users', currentUser.uid);
    const claimRef = doc(db, 'dailyBoxClaims', currentUser.uid);
    const claimSnap = await getDoc(claimRef);
    const now = Date.now();
    const dayMs = 86400000;
    const last = (claimSnap.data() || {}).lastClaim || 0;
    if (now - last < dayMs) {
        const next = Math.ceil((last + dayMs - now) / 60000);
        showBoxResult(`Günlük kutu ${next} dakika sonra tekrar açılabilir.`, 'error');
        return;
    }
    await setDoc(claimRef, { lastClaim: now });
    const result = openBox('daily');
    await playBoxOpenAnimation('daily', result);
    showBoxResult(result.message, 'success');
    if (result.scoreReward) await updateDoc(userRef, { score: increment(result.scoreReward) });
    if (result.multiplier) await updateDoc(userRef, { multiplier: result.multiplier });
    loadInventory();
}

function openBox(type) {
    const rand = Math.random();
    if (type === 'daily') {
        const score = Math.floor(Math.random() * 251) + 50;
        if (rand < 0.05) return { scoreReward: score, multiplier: 2, message: `📅 ${score} Puan + x2!` };
        return { scoreReward: score, message: `📅 ${score} Puan kazandın!` };
    }
    if (type === 'bronze') {
        const score = Math.floor(Math.random() * 151) + 50;
        if (rand < 0.1) return { scoreReward: score, multiplier: 2, message: `🎉 ${score} Puan + x2 Katlayıcı!` };
        return { scoreReward: score, message: `✨ ${score} Puan kazandın!` };
    }
    if (type === 'silver') {
        const score = Math.floor(Math.random() * 301) + 200;
        if (rand < 0.05) return { scoreReward: score, multiplier: 5, message: `🔥 ${score} Puan + x5 Katlayıcı!` };
        if (rand < 0.2) return { scoreReward: score, multiplier: 2, message: `🎉 ${score} Puan + x2 Katlayıcı!` };
        return { scoreReward: score, message: `✨ ${score} Puan kazandın!` };
    }
    if (type === 'gold') {
        const score = Math.floor(Math.random() * 1001) + 500;
        if (rand < 0.05) return { scoreReward: score, multiplier: 10, message: `💥 ${score} Puan + x10 MEGA Katlayıcı!` };
        if (rand < 0.15) return { scoreReward: score, multiplier: 5, message: `🔥 ${score} Puan + x5 Katlayıcı!` };
        if (rand < 0.3) return { scoreReward: score, multiplier: 2, message: `🎉 ${score} Puan + x2 Katlayıcı!` };
        return { scoreReward: score, message: `✨ ${score} Puan kazandın!` };
    }
    if (type === 'epic') {
        const score = Math.floor(Math.random() * 501) + 300;
        if (rand < 0.08) return { scoreReward: score, multiplier: 10, message: `💜 ${score} Puan + x10 Epic!` };
        if (rand < 0.2) return { scoreReward: score, multiplier: 5, message: `💜 ${score} Puan + x5!` };
        if (rand < 0.35) return { scoreReward: score, multiplier: 2, message: `💜 ${score} Puan + x2!` };
        return { scoreReward: score, message: `💜 ${score} Puan kazandın!` };
    }
    if (type === 'legendary') {
        const score = Math.floor(Math.random() * 1201) + 800;
        if (rand < 0.05) return { scoreReward: score, multiplier: 10, message: `🌈 ${score} Puan + x10 Legendary!` };
        if (rand < 0.15) return { scoreReward: score, multiplier: 5, message: `🌈 ${score} Puan + x5!` };
        if (rand < 0.35) return { scoreReward: score, multiplier: 2, message: `🌈 ${score} Puan + x2!` };
        return { scoreReward: score, message: `🌈 ${score} Puan kazandın!` };
    }
    return { message: 'Bilinmeyen kutu.' };
}

function showBoxResult(message, type) {
    const resultEl = document.getElementById('boxResult');
    resultEl.className = `box-result ${type}`;
    resultEl.textContent = message;
    setTimeout(() => { resultEl.textContent = ''; resultEl.className = 'box-result'; }, 5000);
}

async function playBoxOpenAnimation(boxType, result) {
    const modal = document.getElementById('boxOpenModal');
    const rewardEl = document.getElementById('boxOpenReward');
    const lid = document.getElementById('boxOpenLid');
    const glow = document.getElementById('boxOpenGlow');
    if (!modal || !rewardEl) return;
    rewardEl.textContent = result.message || '';
    rewardEl.className = 'box-open-reward';
    modal.style.display = 'flex';
    lid.classList.add('box-open-lid--open');
    glow.classList.add('box-open-glow--active');
    await new Promise(r => setTimeout(r, 1800));
    lid.classList.remove('box-open-lid--open');
    glow.classList.remove('box-open-glow--active');
    modal.style.display = 'none';
}

async function loadInventory() {
    const grid = document.getElementById('inventoryGrid');
    if (!grid) return;
    const invRef = collection(db, 'users', currentUser.uid, 'inventory');
    const snap = await getDocs(invRef);
    grid.innerHTML = '';
    snap.forEach(d => {
        const dta = d.data();
        const div = document.createElement('div');
        div.className = 'inventory-item';
        div.innerHTML = `<span class="inventory-name">${dta.name || 'Öğe'}</span><span class="inventory-qty">${dta.qty || 1}</span>`;
        grid.appendChild(div);
    });
    if (snap.empty) grid.innerHTML = '<div class="inventory-empty">Envanterde öğe yok.</div>';
}

// ========================================
// SIMPLE GAMES (Coin, RPS, Wheel)
// ========================================
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

        showGameLoading(true);
        await playCoinFlipAnimation(choice, result);
        showGameLoading(false);

        if (won) {
            const winAmount = Math.floor(betAmount * 1.8 * userMultiplier);
            await updateDoc(userRef, { score: increment(winAmount - betAmount) });
            showGameResult('coinResult', `🎉 Kazandın! +${winAmount - betAmount} Puan`, 'win');
            playCelebrationAnimation('win');
        } else {
            await updateDoc(userRef, { score: increment(-betAmount) });
            showGameResult('coinResult', `😢 Kaybettin! -${betAmount} Puan`, 'lose');
            playCelebrationAnimation('lose');
        }
    });
});

document.getElementById('rpsCard').addEventListener('click', () => {
    document.getElementById('rpsModal').style.display = 'flex';
    const rev = document.getElementById('rpsRevealContainer');
    if (rev) { rev.classList.remove('rps-reveal-container--active'); rev.querySelector('#rpsPlayerChoice').textContent = ''; rev.querySelector('#rpsBotChoice').textContent = ''; }
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
        const wins = { rock: 'scissors', paper: 'rock', scissors: 'paper' };
        let result = 'draw';
        if (wins[choice] === botChoice) result = 'win';
        else if (wins[botChoice] === choice) result = 'lose';

        showGameLoading(true);
        await playRpsRevealAnimation(choice, botChoice);
        showGameLoading(false);

        if (result === 'win') {
            const winAmount = Math.floor(betAmount * 1.9 * userMultiplier);
            await updateDoc(userRef, { score: increment(winAmount - betAmount) });
            showGameResult('rpsResult', `🎉 Kazandın! +${winAmount - betAmount} Puan`, 'win');
            playCelebrationAnimation('win');
        } else if (result === 'lose') {
            await updateDoc(userRef, { score: increment(-betAmount) });
            showGameResult('rpsResult', `😢 Kaybettin! -${betAmount} Puan`, 'lose');
            playCelebrationAnimation('lose');
        } else {
            showGameResult('rpsResult', `🤝 Berabere! Bahis iade edildi`, 'win');
        }
    });
});

document.getElementById('spinWheelCard').addEventListener('click', () => {
    document.getElementById('spinWheelModal').style.display = 'flex';
    drawWheel();
});

const WHEEL_SEGMENTS = [
    { label: 'x0', mult: 0 },
    { label: 'x1', mult: 1 },
    { label: 'x1.5', mult: 1.5 },
    { label: 'x2', mult: 2 },
    { label: 'x3', mult: 3 },
    { label: 'x5', mult: 5 },
    { label: 'x10', mult: 10 },
    { label: 'x2', mult: 2 }
];
const WHEEL_COLORS = ['#FF6B6B', '#4ECDC4', '#45B7D1', '#FFA07A', '#98D8C8', '#F7DC6F', '#BB8FCE', '#85C1E2'];

function drawWheel() {
    const canvas = document.getElementById('wheelCanvas');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    canvas.style.transform = 'rotate(0deg)';
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    const segments = WHEEL_SEGMENTS.length;
    const centerX = canvas.width / 2;
    const centerY = canvas.height / 2;
    const radius = 140;
    const anglePerSegment = (2 * Math.PI) / segments;

    for (let i = 0; i < segments; i++) {
        ctx.beginPath();
        ctx.moveTo(centerX, centerY);
        ctx.arc(centerX, centerY, radius, i * anglePerSegment, (i + 1) * anglePerSegment);
        ctx.closePath();
        ctx.fillStyle = WHEEL_COLORS[i];
        ctx.fill();
        ctx.stroke();
        ctx.save();
        ctx.translate(centerX, centerY);
        ctx.rotate(i * anglePerSegment + anglePerSegment / 2);
        ctx.textAlign = 'center';
        ctx.fillStyle = '#fff';
        ctx.font = 'bold 18px Arial';
        ctx.fillText(WHEEL_SEGMENTS[i].label, radius / 1.5, 8);
        ctx.restore();
    }
}

function updateWheelPrizePrediction() {
    const el = document.getElementById('wheelPrizeText');
    if (!el) return;
    const bet = parseInt(document.getElementById('wheelBetAmount')?.value || 10);
    const idx = Math.floor(Math.random() * WHEEL_SEGMENTS.length);
    const seg = WHEEL_SEGMENTS[idx];
    const win = seg.mult > 0 ? Math.floor(bet * seg.mult * userMultiplier) : 0;
    el.textContent = seg.mult > 0 ? `±${win} puan (${seg.label})` : 'Kayıp';
}

document.getElementById('wheelBetAmount')?.addEventListener('input', updateWheelPrizePrediction);

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

    const segmentIndex = Math.floor(Math.random() * WHEEL_SEGMENTS.length);
    const seg = WHEEL_SEGMENTS[segmentIndex];
    const resultMult = seg.mult;

    await updateDoc(userRef, { score: increment(-betAmount) });

    const canvas = document.getElementById('wheelCanvas');
    const anglePerSeg = (2 * Math.PI) / WHEEL_SEGMENTS.length;
    const targetRotation = 360 * 5 + (segmentIndex * anglePerSeg + anglePerSeg / 2) * (180 / Math.PI);
    const spinTime = 3000;
    const startTime = Date.now();

    const spin = setInterval(() => {
        const elapsed = Date.now() - startTime;
        const progress = Math.min(elapsed / spinTime, 1);
        const ease = 1 - Math.pow(1 - progress, 3);
        const rotation = ease * targetRotation;
        canvas.style.transform = `rotate(${rotation}deg)`;

        if (progress >= 1) {
            clearInterval(spin);
            const winAmount = resultMult > 0 ? Math.floor(betAmount * resultMult * userMultiplier) : 0;
            if (resultMult > 0) {
                updateDoc(userRef, { score: increment(winAmount) }).then(() => {
                    showGameResult('wheelResult', `🎉 ${seg.label}! +${winAmount} Puan`, 'win');
                });
            } else {
                showGameResult('wheelResult', `😢 Kaybettin! -${betAmount} Puan`, 'lose');
            }
            btn.disabled = false;
            btn.textContent = 'ÇEVİR!';
            updateWheelPrizePrediction();
        }
    }, 16);
});

function showGameResult(elementId, message, type) {
    const resultEl = document.getElementById(elementId);
    if (!resultEl) return;
    resultEl.className = `game-result ${type}`;
    resultEl.textContent = message;
    setTimeout(() => { resultEl.textContent = ''; resultEl.className = 'game-result'; }, 5000);
}

function showGameLoading(show) {
    const overlay = document.getElementById('gameLoadingOverlay');
    if (overlay) overlay.style.display = show ? 'flex' : 'none';
}

function playCoinFlipAnimation(choice, result) {
    const coin = document.getElementById('coin3d');
    if (!coin) return Promise.resolve();
    coin.classList.remove('coin-3d--flip');
    coin.offsetHeight;
    coin.dataset.result = result;
    coin.classList.add('coin-3d--flip');
    return new Promise(r => setTimeout(r, 1200)).then(() => coin.classList.remove('coin-3d--flip'));
}

function playRpsRevealAnimation(player, bot) {
    const container = document.getElementById('rpsRevealContainer');
    const pc = document.getElementById('rpsPlayerChoice');
    const bc = document.getElementById('rpsBotChoice');
    const icons = { rock: '🪨', paper: '📄', scissors: '✂️' };
    if (pc) pc.textContent = icons[player] || '';
    if (bc) bc.textContent = icons[bot] || '';
    if (container) container.classList.add('rps-reveal-container--active');
    return new Promise(r => setTimeout(r, 1000));
}

function playCelebrationAnimation(outcome) {
    document.body.classList.add(`celebration-${outcome}`);
    setTimeout(() => document.body.classList.remove(`celebration-${outcome}`), 1500);
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
        if (!boardEl) return;
        boardEl.innerHTML = '';
        boardEl.className = 'chess-board chess-board--8x8';

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
            if (squares[index]) squares[index].classList.add('valid-move');
        });
    }

    movePiece(fromRow, fromCol, toRow, toCol) {
        const piece = this.board[fromRow][fromCol];

        if (piece === '♔' && Math.abs(toCol - fromCol) === 2) {
            if (toCol === 6) { this.board[7][5] = this.board[7][7]; this.board[7][7] = ''; }
            else if (toCol === 2) { this.board[7][3] = this.board[7][0]; this.board[7][0] = ''; }
            this.whiteKingMoved = true;
        }
        if (piece === '♚' && Math.abs(toCol - fromCol) === 2) {
            if (toCol === 6) { this.board[0][5] = this.board[0][7]; this.board[0][7] = ''; }
            else if (toCol === 2) { this.board[0][3] = this.board[0][0]; this.board[0][0] = ''; }
            this.blackKingMoved = true;
        }

        if (piece === '♙' && this.enPassantTarget && toRow === this.enPassantTarget.row && toCol === this.enPassantTarget.col) {
            this.board[toRow + 1][toCol] = '';
        }
        if (piece === '♟' && this.enPassantTarget && toRow === this.enPassantTarget.row && toCol === this.enPassantTarget.col) {
            this.board[toRow - 1][toCol] = '';
        }

        this.enPassantTarget = null;
        if (piece === '♙' && fromRow === 6 && toRow === 4) this.enPassantTarget = { row: 5, col: fromCol };
        if (piece === '♟' && fromRow === 1 && toRow === 3) this.enPassantTarget = { row: 2, col: fromCol };

        if (piece === '♖') {
            if (fromRow === 7 && fromCol === 0) this.whiteRookAMoved = true;
            if (fromRow === 7 && fromCol === 7) this.whiteRookHMoved = true;
        }
        if (piece === '♜') {
            if (fromRow === 0 && fromCol === 0) this.blackRookAMoved = true;
            if (fromRow === 0 && fromCol === 7) this.blackRookHMoved = true;
        }
        if (piece === '♔') this.whiteKingMoved = true;
        if (piece === '♚') this.blackKingMoved = true;

        this.board[toRow][toCol] = piece;
        this.board[fromRow][fromCol] = '';

        if (piece === '♙' && toRow === 0) this.board[toRow][toCol] = '♕';
        if (piece === '♟' && toRow === 7) this.board[toRow][toCol] = '♛';
    }

    getValidMoves(row, col) {
        const piece = this.board[row][col];
        if (!piece) return [];
        const isWhite = this.isWhitePiece(piece);
        const color = isWhite ? 'white' : 'black';
        const pseudoMoves = this.getPseudoMoves(row, col, { forAttack: false });
        const legalMoves = [];

        for (const move of pseudoMoves) {
            const backupBoard = this.board.map(r => [...r]);
            this.board[move.row][move.col] = piece;
            this.board[row][col] = '';
            const kingInCheck = this.isInCheck(color);
            this.board = backupBoard;
            if (!kingInCheck) legalMoves.push(move);
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
            for (let dc of [-1, 1]) {
                const nr = r + direction, nc = c + dc;
                if (!this.isInBounds(nr, nc)) continue;
                const target = this.board[nr][nc];
                if (forAttack) moves.push({ row: nr, col: nc });
                else if (target && this.isWhitePiece(target) !== isWhite) moves.push({ row: nr, col: nc });
            }
            if (forAttack) return;
            if (this.isInBounds(r + direction, c) && !this.board[r + direction][c]) {
                moves.push({ row: r + direction, col: c });
                if (r === startRow && !this.board[r + 2 * direction][c]) moves.push({ row: r + 2 * direction, col: c });
            }
            if (this.enPassantTarget && r + direction === this.enPassantTarget.row && (c + 1 === this.enPassantTarget.col || c - 1 === this.enPassantTarget.col)) {
                moves.push({ row: this.enPassantTarget.row, col: this.enPassantTarget.col });
            }
        };

        const knightMoves = (r, c) => {
            [[-2,-1],[-2,1],[-1,-2],[-1,2],[1,-2],[1,2],[2,-1],[2,1]].forEach(([dr, dc]) => {
                const nr = r + dr, nc = c + dc;
                if (this.isInBounds(nr, nc)) {
                    const target = this.board[nr][nc];
                    if (!target || this.isWhitePiece(target) !== isWhite) moves.push({ row: nr, col: nc });
                }
            });
        };

        const slidingMoves = (r, c, directions) => {
            directions.forEach(([dr, dc]) => {
                let nr = r + dr, nc = c + dc;
                while (this.isInBounds(nr, nc)) {
                    const target = this.board[nr][nc];
                    if (!target) moves.push({ row: nr, col: nc });
                    else {
                        if (this.isWhitePiece(target) !== isWhite) moves.push({ row: nr, col: nc });
                        break;
                    }
                    nr += dr; nc += dc;
                }
            });
        };

        const kingMoves = (r, c) => {
            [[-1,-1],[-1,0],[-1,1],[0,-1],[0,1],[1,-1],[1,0],[1,1]].forEach(([dr, dc]) => {
                const nr = r + dr, nc = c + dc;
                if (this.isInBounds(nr, nc)) {
                    const target = this.board[nr][nc];
                    if (!target || this.isWhitePiece(target) !== isWhite) moves.push({ row: nr, col: nc });
                }
            });
            if (forAttack) return;
            if (isWhite && !this.whiteKingMoved && !this.isInCheck('white')) {
                if (!this.whiteRookHMoved && !this.board[7][5] && !this.board[7][6]) moves.push({ row: 7, col: 6 });
                if (!this.whiteRookAMoved && !this.board[7][1] && !this.board[7][2] && !this.board[7][3]) moves.push({ row: 7, col: 2 });
            }
            if (!isWhite && !this.blackKingMoved && !this.isInCheck('black')) {
                if (!this.blackRookHMoved && !this.board[0][5] && !this.board[0][6]) moves.push({ row: 0, col: 6 });
                if (!this.blackRookAMoved && !this.board[0][1] && !this.board[0][2] && !this.board[0][3]) moves.push({ row: 0, col: 2 });
            }
        };

        if (['♙','♟'].includes(piece)) pawnMoves(row, col);
        else if (['♘','♞'].includes(piece)) knightMoves(row, col);
        else if (['♗','♝'].includes(piece)) slidingMoves(row, col, [[-1,-1],[-1,1],[1,-1],[1,1]]);
        else if (['♖','♜'].includes(piece)) slidingMoves(row, col, [[-1,0],[1,0],[0,-1],[0,1]]);
        else if (['♕','♛'].includes(piece)) slidingMoves(row, col, [[-1,-1],[-1,0],[-1,1],[0,-1],[0,1],[1,-1],[1,0],[1,1]]);
        else if (['♔','♚'].includes(piece)) kingMoves(row, col);
        return moves;
    }

    isWhitePiece(p) { return ['♙','♘','♗','♖','♕','♔'].includes(p); }
    isBlackPiece(p) { return ['♟','♞','♝','♜','♛','♚'].includes(p); }
    isInBounds(r, c) { return r >= 0 && r < 8 && c >= 0 && c < 8; }

    findKing(color) {
        const king = color === 'white' ? '♔' : '♚';
        for (let r = 0; r < 8; r++)
            for (let c = 0; c < 8; c++)
                if (this.board[r][c] === king) return { row: r, col: c };
        return null;
    }

    isSquareAttacked(row, col, byColor) {
        for (let r = 0; r < 8; r++) {
            for (let c = 0; c < 8; c++) {
                const piece = this.board[r][c];
                if (!piece) continue;
                const isPieceWhite = this.isWhitePiece(piece);
                if ((byColor === 'white' && !isPieceWhite) || (byColor === 'black' && isPieceWhite)) continue;
                const attackMoves = this.getPseudoMoves(r, c, { forAttack: true });
                if (attackMoves.some(m => m.row === row && m.col === col)) return true;
            }
        }
        return false;
    }

    isInCheck(color) {
        const kingPos = this.findKing(color);
        return kingPos ? this.isSquareAttacked(kingPos.row, kingPos.col, color === 'white' ? 'black' : 'white') : false;
    }

    isCheckmate(color) {
        if (!this.isInCheck(color)) return false;
        for (let r = 0; r < 8; r++)
            for (let c = 0; c < 8; c++) {
                const piece = this.board[r][c];
                if (!piece) continue;
                const isPieceWhite = this.isWhitePiece(piece);
                if ((color === 'white' && !isPieceWhite) || (color === 'black' && isPieceWhite)) continue;
                if (this.getValidMoves(r, c).length > 0) return false;
            }
        return true;
    }

    isStalemate(color) {
        if (this.isInCheck(color)) return false;
        for (let r = 0; r < 8; r++)
            for (let c = 0; c < 8; c++) {
                const piece = this.board[r][c];
                if (!piece) continue;
                const isPieceWhite = this.isWhitePiece(piece);
                if ((color === 'white' && !isPieceWhite) || (color === 'black' && isPieceWhite)) continue;
                if (this.getValidMoves(r, c).length > 0) return false;
            }
        return true;
    }

    botMove() {
        const depthMap = { easy: 1, medium: 2, hard: 3, master: 4 };
        const depth = depthMap[this.difficulty] || 2;
        const bestMove = this.minimax(depth, -Infinity, Infinity, true);

        if (bestMove.move) {
            this.movePiece(bestMove.move.from.row, bestMove.move.from.col, bestMove.move.to.row, bestMove.to.col);
            this.currentTurn = 'white';
            this.render();

            if (this.isCheckmate('white')) this.endGame(false);
            else if (this.isStalemate('white')) this.endGame(false, true);
        }
    }

    minimax(depth, alpha, beta, maximizingPlayer) {
        if (depth === 0) return { score: this.evaluateBoard() };

        const moves = [];
        for (let r = 0; r < 8; r++) {
            for (let c = 0; c < 8; c++) {
                const piece = this.board[r][c];
                if (!piece) continue;
                const isPieceBlack = this.isBlackPiece(piece);
                if ((maximizingPlayer && !isPieceBlack) || (!maximizingPlayer && isPieceBlack)) continue;
                this.getValidMoves(r, c).forEach(move => moves.push({ from: { row: r, col: c }, to: move }));
            }
        }
        if (moves.length === 0) {
            if (this.isCheckmate(maximizingPlayer ? 'black' : 'white')) return { score: maximizingPlayer ? -10000 : 10000 };
            return { score: 0 };
        }

        if (maximizingPlayer) {
            let maxEval = -Infinity, bestMove = null;
            for (const move of moves) {
                const temp = this.board.map(r => [...r]);
                this.movePiece(move.from.row, move.from.col, move.to.row, move.to.col);
                const ev = this.minimax(depth - 1, alpha, beta, false).score;
                this.board = temp;
                if (ev > maxEval) { maxEval = ev; bestMove = move; }
                alpha = Math.max(alpha, ev);
                if (beta <= alpha) break;
            }
            return { score: maxEval, move: bestMove };
        } else {
            let minEval = Infinity, bestMove = null;
            for (const move of moves) {
                const temp = this.board.map(r => [...r]);
                this.movePiece(move.from.row, move.from.col, move.to.row, move.to.col);
                const ev = this.minimax(depth - 1, alpha, beta, true).score;
                this.board = temp;
                if (ev < minEval) { minEval = ev; bestMove = move; }
                beta = Math.min(beta, ev);
                if (beta <= alpha) break;
            }
            return { score: minEval, move: bestMove };
        }
    }

    evaluateBoard() {
        const v = { '♙':1,'♘':3,'♗':3,'♖':5,'♕':9,'♔':0,'♟':-1,'♞':-3,'♝':-3,'♜':-5,'♛':-9,'♚':0 };
        let s = 0;
        for (let r = 0; r < 8; r++) for (let c = 0; c < 8; c++) if (this.board[r][c]) s += v[this.board[r][c]] || 0;
        return s;
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
            playCelebrationAnimation('win');
        } else {
            showGameResult('chessResult', '😢 Kaybettin! Bot kazandı', 'lose');
            playCelebrationAnimation('lose');
        }

        document.getElementById('chessStartBtn').style.display = 'block';
        document.getElementById('chessBetAmount').disabled = false;
        document.getElementById('chessDifficulty').disabled = false;
    }

    updateStatus() {
        const statusEl = document.getElementById('chessStatus');
        if (!statusEl || this.gameOver) return;
        if (this.currentTurn === 'white') {
            statusEl.textContent = this.isInCheck('white') ? 'Şah! – Senin sıran' : 'Senin sıran (Beyaz)';
        } else {
            statusEl.textContent = this.isInCheck('black') ? 'Şah! – Bot düşünüyor...' : 'Bot düşünüyor...';
        }
    }
}

// ========================================
// MODAL CLOSE HANDLERS
// ========================================
document.querySelectorAll('.modal-close').forEach(btn => {
    btn.addEventListener('click', () => {
        const modalId = btn.dataset.modal;
        const el = document.getElementById(modalId);
        if (el) el.style.display = 'none';
    });
});

document.querySelectorAll('.game-modal').forEach(modal => {
    modal.addEventListener('click', (e) => {
        if (e.target === modal) modal.style.display = 'none';
    });
});

// ========================================
// ENHANCEMENTS INIT (VS, Admin Dashboard/Analytics, etc.)
// ========================================
function initEnhancements() {
    updateWheelPrizePrediction();
    setupVsLobby();
    setupAdminDashboardAndAnalytics();
    document.getElementById('spinWheelModal')?.addEventListener('click', () => {
        if (document.getElementById('spinWheelModal').style.display === 'flex') updateWheelPrizePrediction();
    });
}

function setupVsLobby() {
    const modal = document.getElementById('vsLobbyModal');
    if (!modal) return;

    ['vsCoinCard', 'vsRpsCard', 'vsChessCard'].forEach((id, idx) => {
        const card = document.getElementById(id);
        if (!card) return;
        const modes = ['coin', 'rps', 'chess'];
        card.addEventListener('click', () => {
            modal.style.display = 'flex';
            document.getElementById('vsLobbyTitle').textContent = modes[idx] === 'coin' ? '🪙 Yazı Tura VS' : modes[idx] === 'rps' ? '✊ Taş-Kağıt-Makas VS' : '♟️ Satranç VS';
            modal.dataset.vsMode = modes[idx];
        });
    });

    document.querySelectorAll('.vs-tab-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.vs-tab-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            const t = btn.dataset.vsTab;
            document.getElementById('vsLobbyFind').style.display = t === 'find' ? 'block' : 'none';
            document.getElementById('vsLobbyRank').style.display = t === 'rank' ? 'block' : 'none';
            document.getElementById('vsLobbyHistory').style.display = t === 'history' ? 'block' : 'none';
            if (t === 'rank') loadVsRankings();
            if (t === 'history') loadVsHistory();
        });
    });

    document.getElementById('vsFindBtn')?.addEventListener('click', async () => {
        const mode = modal.dataset.vsMode;
        const bet = parseInt(document.getElementById('vsBetAmount')?.value || 10);
        const userRef = doc(db, 'users', currentUser.uid);
        const userSnap = await getDoc(userRef);
        if (userSnap.data().score < bet) {
            alert('Yetersiz bakiye.');
            return;
        }
        const lobbyRef = collection(db, 'vsLobby');
        const q = query(lobbyRef, where('mode', '==', mode), where('bet', '==', bet), where('hostId', '!=', currentUser.uid), limit(1));
        const snap = await getDocs(q);
        if (!snap.empty) {
            const lobbyDoc = snap.docs[0];
            const opponentName = (await getDoc(userRef)).data().username;
            await runTransaction(db, async (tx) => {
                const snap2 = await tx.get(lobbyDoc.ref);
                if (snap2.data().status !== 'waiting') throw new Error('already matched');
                tx.update(lobbyDoc.ref, { opponentId: currentUser.uid, opponentName, status: 'matched' });
            });
            alert('Eşleşme bulundu! Maç başlıyor.');
            modal.style.display = 'none';
            return;
        }
        const userData = (await getDoc(userRef)).data();
        await addDoc(lobbyRef, { hostId: currentUser.uid, hostName: userData.username, mode, bet, status: 'waiting', createdAt: serverTimestamp() });
        document.getElementById('vsLobbyMessages').innerHTML = '<div class="chat-welcome">Eşleşme aranıyor... Başka bir oyuncu katılsın.</div>';
    });

    const sendBtn = document.getElementById('vsLobbySend');
    const input = document.getElementById('vsLobbyInput');
    if (sendBtn && input) {
        sendBtn.addEventListener('click', () => {
            const msg = input.value.trim();
            if (!msg) return;
            addDoc(collection(db, 'vsLobbyChat'), { userId: currentUser.uid, username: (document.getElementById('headerUsername')?.textContent) || 'Oyuncu', message: msg, timestamp: serverTimestamp() });
            input.value = '';
        });
    }
}

async function loadVsRankings() {
    const list = document.getElementById('vsRankList');
    if (!list) return;
    list.innerHTML = '<div class="loading">Yükleniyor...</div>';
    const snap = await getDocs(query(collection(db, 'vsRankings'), orderBy('wins', 'desc'), limit(20)));
    list.innerHTML = '';
    let r = 1;
    snap.forEach(d => {
        const dta = d.data();
        const div = document.createElement('div');
        div.className = 'vs-rank-item';
        div.innerHTML = `#${r} ${dta.username || 'Oyuncu'} – ${dta.wins || 0}G / ${dta.losses || 0}K`;
        list.appendChild(div);
        r++;
    });
    if (snap.empty) list.innerHTML = '<div class="search-placeholder">Henüz VS sıralama yok.</div>';
}

async function loadVsHistory() {
    const list = document.getElementById('vsHistoryList');
    if (!list) return;
    list.innerHTML = '<div class="loading">Yükleniyor...</div>';
    const snap = await getDocs(query(collection(db, 'vsMatches'), where('playerIds', 'array-contains', currentUser.uid), orderBy('createdAt', 'desc'), limit(20)));
    list.innerHTML = '';
    snap.forEach(d => {
        const dta = d.data();
        const div = document.createElement('div');
        div.className = 'vs-history-item';
        const won = dta.winnerId === currentUser.uid;
        div.innerHTML = `${dta.mode || '?'} – ${won ? 'Kazandın' : 'Kaybettin'} – ${dta.bet || 0} 💎`;
        list.appendChild(div);
    });
    if (snap.empty) list.innerHTML = '<div class="search-placeholder">Henüz VS maçı yok.</div>';
}

function setupAdminDashboardAndAnalytics() {
    const configRef = doc(db, 'config', 'featureToggles');
    const listEl = document.getElementById('adminFeatureToggleList');
    if (!listEl) return;

    async function loadDashboard() {
        listEl.innerHTML = '<div class="loading">Yükleniyor...</div>';
        const snap = await getDoc(configRef);
        const data = snap.exists() ? snap.data() : { vsMode: true, dailyBox: true, epicBox: true, legendaryBox: true };
        listEl.innerHTML = '';
        ['vsMode', 'dailyBox', 'epicBox', 'legendaryBox'].forEach(key => {
            const div = document.createElement('div');
            div.className = 'feature-toggle-item';
            const label = { vsMode: 'VS Modu', dailyBox: 'Günlük Kutu', epicBox: 'Epic Kutu', legendaryBox: 'Legendary Kutu' }[key] || key;
            div.innerHTML = `
                <span>${label}</span>
                <label class="feature-toggle-switch">
                    <input type="checkbox" ${data[key] !== false ? 'checked' : ''} data-feature="${key}">
                    <span class="feature-toggle-slider"></span>
                </label>
            `;
            div.querySelector('input').addEventListener('change', async (e) => {
                await setDoc(configRef, { [key]: e.target.checked }, { merge: true });
            });
            listEl.appendChild(div);
        });
    }

    async function loadAnalytics() {
        const statsEl = document.getElementById('adminAnalyticsStats');
        if (!statsEl) return;
        statsEl.innerHTML = '<div class="loading">Yükleniyor...</div>';
        const usersSnap = await getDocs(collection(db, 'users'));
        let totalScore = 0;
        usersSnap.forEach(d => { totalScore += d.data().score || 0; });
        const chatSnap = await getDocs(query(collection(db, 'chat'), limit(1)));
        statsEl.innerHTML = `
            <div class="analytics-grid">
                <div class="stat-card"><div class="stat-value">${usersSnap.size}</div><div class="stat-label">Toplam kullanıcı</div></div>
                <div class="stat-card"><div class="stat-value">${totalScore}</div><div class="stat-label">Toplam puan</div></div>
                <div class="stat-card"><div class="stat-value">–</div><div class="stat-label">Chat mesajı</div></div>
            </div>
        `;
    }

    window.loadAdminDashboard = loadDashboard;
    window.loadAdminAnalytics = loadAnalytics;
}
