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
let isUserFounder = false;
let chatUnsubscribe = null;
let game2048 = null;
let dmUnreadCounts = {};
let dmReceiptsUnsubscribe = null;
let dmUnsubscribers = {};
let currentDmMessagesUnsubscribe = null;

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
        listenToDmNotifications();
    } else {
        document.getElementById('loginScreen').style.display = 'flex';
        document.getElementById('mainApp').classList.remove('show');
        // Clean up all listeners
        if (chatUnsubscribe) chatUnsubscribe();
        Object.values(dmUnsubscribers).forEach(unsub => unsub());
        dmUnsubscribers = {};
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
    isUserFounder = userData.role === 'founder';

    if (isUserAdmin || isUserFounder) {
        document.querySelectorAll('.admin-only').forEach(el => el.style.display = 'flex');
    }
    if (isUserFounder) {
        document.querySelectorAll('.founder-only').forEach(el => el.style.display = 'flex');
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
            document.getElementById('dropdownAvatarImage').src = data.profileImage;
            document.getElementById('dropdownAvatarImage').style.display = 'block';
            document.getElementById('dropdownAvatarEmoji').style.display = 'none';
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
    const username = document.getElementById('loginUsernameInput').value;
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
    themeToggle.querySelector('.toggle-circle').style.left = '26px';
}

themeToggle.addEventListener('click', () => {
    document.body.classList.toggle('dark-mode');
    themeToggle.classList.toggle('active');

    if (document.body.classList.contains('dark-mode')) {
        localStorage.setItem('theme', 'dark');
        themeToggle.querySelector('.toggle-circle').style.left = '26px';
    } else {
        localStorage.setItem('theme', 'light');
        themeToggle.querySelector('.toggle-circle').style.left = '2px';
    }
});

document.getElementById('editProfileBtn').addEventListener('click', () => {
    document.getElementById('dropdown').classList.remove('active');
    document.getElementById('profileModal').style.display = 'flex';
});

document.getElementById('profileImageUrl').addEventListener('input', (e) => {
    const url = e.target.value;
    const preview = document.getElementById('profilePreview');
    const emojiPreview = document.getElementById('profileEmojiPreview');
    if (url) {
        preview.src = url;
        preview.style.display = 'block';
        emojiPreview.style.display = 'none';
    } else {
        preview.style.display = 'none';
        emojiPreview.style.display = 'block';
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

document.getElementById('cancelProfileBtn').addEventListener('click', () => {
    document.getElementById('profileModal').style.display = 'none';
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

document.querySelectorAll('.admin-tab').forEach(btn => {
    btn.addEventListener('click', () => {
        document.querySelectorAll('.admin-tab').forEach(b => b.classList.remove('active'));
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
                        ${data.role === 'founder' ? '<span class="admin-badge founder">Founder</span>' : ''}
                        ${data.role === 'admin' ? '<span class="admin-badge admin">Admin</span>' : ''}
                        ${data.banned ? '<span class="admin-badge banned">Banned</span>' : ''}
                        ${data.muted ? '<span class="admin-badge muted">Muted</span>' : ''}
                    </div>
                </div>
            </div>
            <div class="admin-user-actions">
                <button class="admin-action-quick-btn" data-uid="${docSnap.id}" data-username="${data.username}" data-banned="${!!data.banned}" data-muted="${!!data.muted}" data-role="${data.role || 'user'}">
                    ⚙️ İşlemler
                </button>
            </div>
        `;
        listEl.appendChild(item);
    });

    // Add event listeners to all admin action buttons
    document.querySelectorAll('.admin-action-quick-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const uid = btn.dataset.uid;
            const username = btn.dataset.username;
            const isBanned = btn.dataset.banned === 'true';
            const isMuted = btn.dataset.muted === 'true';
            const targetRole = btn.dataset.role;
            openAdminAction(uid, username, isBanned, isMuted, targetRole);
        });
    });
}

async function openAdminAction(uid, username, isBanned, isMuted, targetRole) {
    const currentUserRef = doc(db, 'users', currentUser.uid);
    const currentUserData = (await getDoc(currentUserRef)).data();
    const currentRole = currentUserData.role || 'user';

    // Admin koruma sistemi
    if (currentRole === 'admin' && (targetRole === 'admin' || targetRole === 'founder')) {
        alert('Adminler diğer adminleri veya kurucuları yönetemez!');
        return;
    }

    if (currentRole !== 'founder' && targetRole === 'founder') {
        alert('Sadece kurucu, kurucu rolündeki kullanıcıları yönetebilir!');
        return;
    }

    document.getElementById('adminActionModal').style.display = 'flex';
    document.getElementById('actionUserName').textContent = username;
    document.getElementById('actionUserId').textContent = uid;
    document.getElementById('adminActionModal').dataset.uid = uid;

    document.getElementById('banUserBtn').style.display = isBanned ? 'none' : 'block';
    document.getElementById('unbanUserBtn').style.display = isBanned ? 'block' : 'none';
    document.getElementById('muteUserBtn').style.display = isMuted ? 'none' : 'block';
    document.getElementById('unmuteUserBtn').style.display = isMuted ? 'block' : 'none';

    // Founder God Mode yetkiler
    if (currentRole === 'founder') {
        document.getElementById('founderGodActions').style.display = 'block';
    } else {
        document.getElementById('founderGodActions').style.display = 'none';
    }

    document.getElementById('muteOptions').style.display = 'none';
    document.getElementById('passwordResetOptions').style.display = 'none';
    document.getElementById('adminActionMessage').textContent = '';
}

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
        const muteUntil = Date.now() + (duration * 60000);
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

// Founder God Mode Actions
document.getElementById('setAdminBtn')?.addEventListener('click', async () => {
    const uid = document.getElementById('adminActionModal').dataset.uid;
    const messageEl = document.getElementById('adminActionMessage');
    try {
        await updateDoc(doc(db, 'users', uid), { role: 'admin' });
        messageEl.className = 'admin-message success';
        messageEl.textContent = '✅ Kullanıcı admin yapıldı';
        setTimeout(() => { document.getElementById('adminActionModal').style.display = 'none'; loadAdminUsers(); }, 1500);
    } catch (error) {
        messageEl.className = 'admin-message error';
        messageEl.textContent = error.message;
    }
});

document.getElementById('removeAdminBtn')?.addEventListener('click', async () => {
    const uid = document.getElementById('adminActionModal').dataset.uid;
    const messageEl = document.getElementById('adminActionMessage');
    try {
        await updateDoc(doc(db, 'users', uid), { role: 'user' });
        messageEl.className = 'admin-message success';
        messageEl.textContent = '✅ Admin yetkisi kaldırıldı';
        setTimeout(() => { document.getElementById('adminActionModal').style.display = 'none'; loadAdminUsers(); }, 1500);
    } catch (error) {
        messageEl.className = 'admin-message error';
        messageEl.textContent = error.message;
    }
});

document.getElementById('givePointsBtn')?.addEventListener('click', async () => {
    const uid = document.getElementById('adminActionModal').dataset.uid;
    const messageEl = document.getElementById('adminActionMessage');
    const amount = parseInt(prompt('Kaç puan vermek istiyorsun?', '1000'));
    if (!amount || amount <= 0) return;
    try {
        await updateDoc(doc(db, 'users', uid), { score: increment(amount) });
        messageEl.className = 'admin-message success';
        messageEl.textContent = `✅ ${amount} puan verildi`;
        setTimeout(() => { document.getElementById('adminActionModal').style.display = 'none'; loadAdminUsers(); }, 1500);
    } catch (error) {
        messageEl.className = 'admin-message error';
        messageEl.textContent = error.message;
    }
});

document.getElementById('takePointsBtn')?.addEventListener('click', async () => {
    const uid = document.getElementById('adminActionModal').dataset.uid;
    const messageEl = document.getElementById('adminActionMessage');
    const amount = parseInt(prompt('Kaç puan almak istiyorsun?', '1000'));
    if (!amount || amount <= 0) return;
    try {
        await updateDoc(doc(db, 'users', uid), { score: increment(-amount) });
        messageEl.className = 'admin-message success';
        messageEl.textContent = `✅ ${amount} puan alındı`;
        setTimeout(() => { document.getElementById('adminActionModal').style.display = 'none'; loadAdminUsers(); }, 1500);
    } catch (error) {
        messageEl.className = 'admin-message error';
        messageEl.textContent = error.message;
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

        document.getElementById('onlineCountAdmin').textContent = onlineCount;
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
        document.querySelectorAll('.leaderboard-tab').forEach(b => b.classList.remove('active'));
        document.getElementById('topUsersTab').style.display = 'block';
        document.getElementById('searchResultsTab').style.display = 'none';
        document.querySelectorAll('.leaderboard-tab')[0].classList.add('active');
        return;
    }

    document.querySelectorAll('.leaderboard-tab').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.leaderboard-tab')[1].classList.add('active');
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

document.querySelectorAll('.leaderboard-tab').forEach(btn => {
    btn.addEventListener('click', () => {
        document.querySelectorAll('.leaderboard-tab').forEach(b => b.classList.remove('active'));
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
document.querySelectorAll('.chat-tab').forEach(btn => {
    btn.addEventListener('click', () => {
        document.querySelectorAll('.chat-tab').forEach(b => b.classList.remove('active'));
        document.querySelectorAll('.chat-tab-content').forEach(c => c.classList.remove('active'));

        btn.classList.add('active');
        const tabName = btn.dataset.tab;
        document.getElementById(`${tabName}ChatTab`).classList.add('active');

        if (tabName === 'dm') {
            loadDmUsers();
        }
    });
});

document.getElementById('sendVsRequestBtn')?.addEventListener('click', async () => {
    const userRef = doc(db, 'users', currentUser.uid);
    const userSnap = await getDoc(userRef);
    const userData = userSnap.data();

    await addDoc(collection(db, 'chat'), {
        username: userData.username,
        message: '⚔️ VS gelmek isteyen var mı?',
        timestamp: serverTimestamp(),
        userId: currentUser.uid,
        isVsRequest: true
    });
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
            document.getElementById('loadMoreBtn').style.display = 'block';
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

    let messageContent = msg.message;
    if (msg.isVsRequest) {
        messageContent = `${msg.message} <button class="vs-accept-btn" data-sender-id="${msg.userId}" data-sender-name="${msg.username}">✅ Kabul Et</button>`;
    }

    msgEl.innerHTML = `
        <div class="message-header">
            <div class="message-user">${msg.username}</div>
            ${(isUserAdmin || isUserFounder) ? `<button class="chat-delete-btn" data-msg-id="${msg.id}">Sil</button>` : ''}
        </div>
        <div class="message-text">${messageContent}</div>
        <div class="message-time">${time}</div>
    `;

    if (isUserAdmin || isUserFounder) {
        const deleteBtn = msgEl.querySelector('.chat-delete-btn');
        deleteBtn?.addEventListener('click', async (e) => {
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

    // Add event listener to VS accept button
    const vsAcceptBtn = msgEl.querySelector('.vs-accept-btn');
    if (vsAcceptBtn) {
        vsAcceptBtn.addEventListener('click', async (e) => {
            const senderId = e.target.dataset.senderId;
            const senderName = e.target.dataset.senderName;
            alert(`VS isteği kabul edildi! ${senderName} ile eşleşiyorsun...`);
            // VS lobisine yönlendirme yapılabilir
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
        document.getElementById('loadMoreBtn').style.display = 'none';
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
    listEl.innerHTML = '<div class="loading">Kullanıcıları yükleniyor...</div>';

    const usersQuery = query(collection(db, 'users'));
    const snapshot = await getDocs(usersQuery);
    const presenceRef = ref(rtdb, 'presence');

    listEl.innerHTML = '';
    const presenceData = await new Promise((resolve) => {
        onValue(presenceRef, (s) => resolve(s.val() || {}), { onlyOnce: true });
    });

    // Son mesaj zamanlarını al ve sırala
    const lastMessages = {};
    for (const docSnap of snapshot.docs) {
        if (docSnap.id === currentUser.uid) continue;
        const conversationId = [currentUser.uid, docSnap.id].sort().join('_');
        const lastMsgQuery = query(collection(db, 'dm', conversationId, 'messages'), orderBy('timestamp', 'desc'), limit(1));
        const lastMsgSnap = await getDocs(lastMsgQuery);
        if (!lastMsgSnap.empty) {
            const lastMsg = lastMsgSnap.docs[0].data();
            lastMessages[docSnap.id] = lastMsg.timestamp?.toMillis() || 0;
        } else {
            lastMessages[docSnap.id] = 0;
        }
    }

    // Kullanıcıları son mesaj zamanına göre sırala
    const userList = [];
    snapshot.forEach(docSnap => {
        if (docSnap.id === currentUser.uid) return;
        userList.push({ id: docSnap.id, data: docSnap.data(), lastMessageTime: lastMessages[docSnap.id] || 0 });
    });
    userList.sort((a, b) => b.lastMessageTime - a.lastMessageTime);

    userList.forEach(({ id, data }) => {
        const isOnline = !!(presenceData[id] && presenceData[id].online);
        const unread = dmUnreadCounts[id] || 0;
        const item = document.createElement('div');
        item.className = 'dm-user-item';
        item.dataset.recipientId = id;
        item.innerHTML = `
            <div class="dm-user-avatar">
                ${data.profileImage ? `<img src="${data.profileImage}" alt="">` : '👤'}
            </div>
            <div class="dm-user-info">
                <div class="dm-user-name-display">
                    ${data.username}
                    ${unread > 0 ? `<span class="dm-unread-dot">${unread}</span>` : ''}
                </div>
                <div class="dm-user-status dm-user-status--${isOnline ? 'online' : 'offline'}">
                    ${isOnline ? '🟢 Çevrimiçi' : '⚫ Çevrimdışı'}
                </div>
            </div>
        `;
        item.addEventListener('click', () => openDmConversation(id, data.username));
        listEl.appendChild(item);
    });
}

// DM bildirimlerini dinle
function listenToDmNotifications() {
    const usersQuery = query(collection(db, 'users'));
    getDocs(usersQuery).then(snapshot => {
        snapshot.forEach(docSnap => {
            if (docSnap.id === currentUser.uid) return;
            const conversationId = [currentUser.uid, docSnap.id].sort().join('_');
            const messagesRef = collection(db, 'dm', conversationId, 'messages');

            const unsubscribe = onSnapshot(query(messagesRef, orderBy('timestamp', 'desc'), limit(1)), (snap) => {
                if (snap.empty) return;
                const lastMsg = snap.docs[0].data();
                if (lastMsg.senderId !== currentUser.uid && currentDmRecipient !== docSnap.id) {
                    // Yeni mesaj geldi, okunmadı olarak işaretle
                    dmUnreadCounts[docSnap.id] = (dmUnreadCounts[docSnap.id] || 0) + 1;
                    updateDmUnreadBadge();
                    loadDmUsers(); // Listeyi güncelle
                }
            });

            dmUnsubscribers[docSnap.id] = unsubscribe;
        });
    });
}

function openDmConversation(recipientId, recipientName) {
    // Önceki dinleyicileri temizle
    if (currentDmMessagesUnsubscribe) {
        currentDmMessagesUnsubscribe();
        currentDmMessagesUnsubscribe = null;
    }
    if (dmReceiptsUnsubscribe) {
        dmReceiptsUnsubscribe();
        dmReceiptsUnsubscribe = null;
    }

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

    dmUnreadCounts[recipientId] = 0; // Okundu olarak işaretle
    updateDmUnreadBadge();
    loadDmMessages(recipientId);
    loadDmUsers(); // Listeyi güncelle
}

document.getElementById('dmBackBtn').addEventListener('click', () => {
    document.getElementById('dmUserList').style.display = 'block';
    document.getElementById('dmConversation').style.display = 'none';
    currentDmRecipient = null;
    if (currentDmMessagesUnsubscribe) {
        currentDmMessagesUnsubscribe();
        currentDmMessagesUnsubscribe = null;
    }
    if (dmReceiptsUnsubscribe) {
        dmReceiptsUnsubscribe();
        dmReceiptsUnsubscribe = null;
    }
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

    // Mesajları dinle
    currentDmMessagesUnsubscribe = onSnapshot(query(messagesRef, orderBy('timestamp', 'asc')), async (snapshot) => {
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

        // Mesajları okundu olarak işaretle
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

    // Okundu bilgilerini dinle
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
                if (!readSpan) { 
                    readSpan = document.createElement('span'); 
                    readSpan.className = 'message-read'; 
                    meta.appendChild(readSpan); 
                }
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
        await updateDoc(userRef, { score: increment(30) });

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
                btn.textContent = '+30 Puan Kazan';
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
        const score = Math.floor(Math.random() * 101) + 20;
        if (rand < 0.02) return { scoreReward: score, multiplier: 2, message: `📅 ${score} Puan + x2!` };
        return { scoreReward: score, message: `📅 ${score} Puan kazandın!` };
    }
    if (type === 'bronze') {
        const score = Math.floor(Math.random() * 81) + 20;
        if (rand < 0.05) return { scoreReward: score, multiplier: 2, message: `🎉 ${score} Puan + x2 Katlayıcı!` };
        return { scoreReward: score, message: `✨ ${score} Puan kazandın!` };
    }
    if (type === 'silver') {
        const score = Math.floor(Math.random() * 151) + 100;
        if (rand < 0.03) return { scoreReward: score, multiplier: 5, message: `🔥 ${score} Puan + x5 Katlayıcı!` };
        if (rand < 0.10) return { scoreReward: score, multiplier: 2, message: `🎉 ${score} Puan + x2 Katlayıcı!` };
        return { scoreReward: score, message: `✨ ${score} Puan kazandın!` };
    }
    if (type === 'gold') {
        const score = Math.floor(Math.random() * 401) + 200;
        if (rand < 0.02) return { scoreReward: score, multiplier: 10, message: `💥 ${score} Puan + x10 MEGA Katlayıcı!` };
        if (rand < 0.08) return { scoreReward: score, multiplier: 5, message: `🔥 ${score} Puan + x5 Katlayıcı!` };
        if (rand < 0.15) return { scoreReward: score, multiplier: 2, message: `🎉 ${score} Puan + x2 Katlayıcı!` };
        return { scoreReward: score, message: `✨ ${score} Puan kazandın!` };
    }
    if (type === 'epic') {
        const score = Math.floor(Math.random() * 251) + 150;
        if (rand < 0.04) return { scoreReward: score, multiplier: 10, message: `💜 ${score} Puan + x10 Epic!` };
        if (rand < 0.12) return { scoreReward: score, multiplier: 5, message: `💜 ${score} Puan + x5!` };
        if (rand < 0.20) return { scoreReward: score, multiplier: 2, message: `💜 ${score} Puan + x2!` };
        return { scoreReward: score, message: `💜 ${score} Puan kazandın!` };
    }
    if (type === 'legendary') {
        const score = Math.floor(Math.random() * 501) + 400;
        if (rand < 0.03) return { scoreReward: score, multiplier: 10, message: `🌈 ${score} Puan + x10 Legendary!` };
        if (rand < 0.10) return { scoreReward: score, multiplier: 5, message: `🌈 ${score} Puan + x5!` };
        if (rand < 0.20) return { scoreReward: score, multiplier: 2, message: `🌈 ${score} Puan + x2!` };
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
// MODAL CLOSING & UTILITIES
// ========================================
document.querySelectorAll('.modal-close, .modal-backdrop').forEach(el => {
    el.addEventListener('click', (e) => {
        if (e.target === el || e.target.classList.contains('modal-close')) {
            const modal = e.target.closest('.modal');
            if (modal) {
                modal.style.display = 'none';
                
                if (modal.id === 'game2048Modal') {
                    game2048 = null;
                }
                if (modal.id === 'chessModal') {
                    chessGame = null;
                }
                if (modal.id === 'dmConversation') {
                    document.getElementById('dmUserList').style.display = 'block';
                    document.getElementById('dmConversation').style.display = 'none';
                    currentDmRecipient = null;
                    if (currentDmMessagesUnsubscribe) {
                        currentDmMessagesUnsubscribe();
                        currentDmMessagesUnsubscribe = null;
                    }
                    if (dmReceiptsUnsubscribe) {
                        dmReceiptsUnsubscribe();
                        dmReceiptsUnsubscribe = null;
                    }
                }
            }
        }
    });
});

document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
        document.querySelectorAll('.modal').forEach(modal => {
            if (modal.style.display === 'flex') {
                modal.style.display = 'none';
            }
        });
    }
});

// ========================================
// INITIALIZATION COMPLETE
// ========================================
console.log('🚀 Uygulama başlatıldı! Tüm sistemler çalışıyor.');
