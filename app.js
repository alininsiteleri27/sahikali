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
let isUserFounder = false;  // YENİ: Founder rolü
let chatUnsubscribe = null;
let game2048 = null;  // YENİ: 2048 oyunu
let dmUnreadCounts = {};  // YENİ: DM bildirim sayıları
let dmReceiptsUnsubscribe = null;
let dmUnsubscribers = {};

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
        listenToDmNotifications();  // YENİ: DM bildirimlerini dinle
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
    isUserFounder = userData.role === 'founder';  // YENİ: Founder kontrolü

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
});// ========================================
// ADMIN PANEL - YENİ: Founder Koruması Eklendi
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
                        ${data.role === 'founder' ? '<span class="admin-badge founder">Founder</span>' : ''}
                        ${data.role === 'admin' ? '<span class="admin-badge admin">Admin</span>' : ''}
                        ${data.banned ? '<span class="admin-badge banned">Banned</span>' : ''}
                        ${data.muted ? '<span class="admin-badge muted">Muted</span>' : ''}
                    </div>
                </div>
            </div>
            <div class="admin-user-actions">
                <button class="admin-action-quick-btn" onclick="openAdminAction('${docSnap.id}', '${data.username}', ${!!data.banned}, ${!!data.muted}, '${data.role || 'user'}')">
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
                            ${data.role === 'founder' ? '<span class="admin-badge founder">Founder</span>' : ''}
                            ${data.role === 'admin' ? '<span class="admin-badge admin">Admin</span>' : ''}
                            ${data.banned ? '<span class="admin-badge banned">Banned</span>' : ''}
                            ${data.muted ? '<span class="admin-badge muted">Muted</span>' : ''}
                        </div>
                    </div>
                </div>
                <div class="admin-user-actions">
                    <button class="admin-action-quick-btn" onclick="openAdminAction('${docSnap.id}', '${data.username}', ${!!data.banned}, ${!!data.muted}, '${data.role || 'user'}')">
                        ⚙️ İşlemler
                    </button>
                </div>
            `;
            listEl.appendChild(item);
        }
    });
});

// YENİ: Admin Koruma Sistemi - Adminler birbirini yönetemez
window.openAdminAction = async (uid, username, isBanned, isMuted, targetRole) => {
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
    document.getElementById('adminActionModal').dataset.uid = uid;

    document.getElementById('banUserBtn').style.display = isBanned ? 'none' : 'block';
    document.getElementById('unbanUserBtn').style.display = isBanned ? 'block' : 'none';
    document.getElementById('muteUserBtn').style.display = isMuted ? 'none' : 'block';
    document.getElementById('unmuteUserBtn').style.display = isMuted ? 'block' : 'none';

    // YENİ: Founder God Mode yetkiler
    if (currentRole === 'founder') {
        document.getElementById('founderGodActions').style.display = 'block';
    } else {
        document.getElementById('founderGodActions').style.display = 'none';
    }

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

// YENİ: Founder God Mode Actions
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
});// ========================================
// CHAT SYSTEM (Global + DM) - YENİ: DM Bildirimleri Eklendi
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

// YENİ: VS daveti butonu
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

    let messageContent = msg.message;
    if (msg.isVsRequest) {
        messageContent = `${msg.message} <button class="vs-accept-btn" onclick="acceptVsRequest('${msg.userId}', '${msg.username}')">✅ Kabul Et</button>`;
    }

    msgEl.innerHTML = `
        <div class="message-header">
            <div class="message-user">${msg.username}</div>
            ${(isUserAdmin || isUserFounder) ? `<button class="chat-delete-btn">Sil</button>` : ''}
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

    messagesEl.appendChild(msgEl);
}

window.acceptVsRequest = async (senderId, senderName) => {
    alert(`VS isteği kabul edildi! ${senderName} ile eşleşiyorsun...`);
    // VS lobisine yönlendirme yapılabilir
};

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
// DM (Direct Messages) - YENİ: Bildirim Sistemi
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

    // YENİ: Son mesaj zamanlarını al ve sırala
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

// YENİ: DM bildirimlerini dinle
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
                    loadDmUsers(); // Listeyi güncelle (en üste çıkar)
                }
            });

            dmUnsubscribers[docSnap.id] = unsubscribe;
        });
    });
}

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

    dmUnreadCounts[recipientId] = 0; // Okundu olarak işaretle
    updateDmUnreadBadge();
    loadDmMessages(recipientId);
    loadDmUsers(); // Listeyi güncelle (kırmızı noktayı kaldır)
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
// AD SYSTEM - BALANCED (30 puan)
// ========================================
document.getElementById('watchAdBtn').addEventListener('click', async () => {
    if (adCooldown) return;

    const btn = document.getElementById('watchAdBtn');
    btn.disabled = true;
    btn.textContent = 'Reklam gösteriliyor...';

    setTimeout(async () => {
        const userRef = doc(db, 'users', currentUser.uid);
        await updateDoc(userRef, { score: increment(30) }); // 50 -> 30 (daha dengeli)

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
});// ========================================
// MARKET SYSTEM - BALANCED ECONOMY (Daha Az Puan)
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

// YENİ: BALANCED - Daha az puan veren kutu sistemi
function openBox(type) {
    const rand = Math.random();
    if (type === 'daily') {
        const score = Math.floor(Math.random() * 101) + 20; // 20-120 (eski: 50-300)
        if (rand < 0.02) return { scoreReward: score, multiplier: 2, message: `📅 ${score} Puan + x2!` };
        return { scoreReward: score, message: `📅 ${score} Puan kazandın!` };
    }
    if (type === 'bronze') {
        const score = Math.floor(Math.random() * 81) + 20; // 20-100 (eski: 50-200)
        if (rand < 0.05) return { scoreReward: score, multiplier: 2, message: `🎉 ${score} Puan + x2 Katlayıcı!` };
        return { scoreReward: score, message: `✨ ${score} Puan kazandın!` };
    }
    if (type === 'silver') {
        const score = Math.floor(Math.random() * 151) + 100; // 100-250 (eski: 200-500)
        if (rand < 0.03) return { scoreReward: score, multiplier: 5, message: `🔥 ${score} Puan + x5 Katlayıcı!` };
        if (rand < 0.10) return { scoreReward: score, multiplier: 2, message: `🎉 ${score} Puan + x2 Katlayıcı!` };
        return { scoreReward: score, message: `✨ ${score} Puan kazandın!` };
    }
    if (type === 'gold') {
        const score = Math.floor(Math.random() * 401) + 200; // 200-600 (eski: 500-1500)
        if (rand < 0.02) return { scoreReward: score, multiplier: 10, message: `💥 ${score} Puan + x10 MEGA Katlayıcı!` };
        if (rand < 0.08) return { scoreReward: score, multiplier: 5, message: `🔥 ${score} Puan + x5 Katlayıcı!` };
        if (rand < 0.15) return { scoreReward: score, multiplier: 2, message: `🎉 ${score} Puan + x2 Katlayıcı!` };
        return { scoreReward: score, message: `✨ ${score} Puan kazandın!` };
    }
    if (type === 'epic') {
        const score = Math.floor(Math.random() * 251) + 150; // 150-400 (eski: 300-800)
        if (rand < 0.04) return { scoreReward: score, multiplier: 10, message: `💜 ${score} Puan + x10 Epic!` };
        if (rand < 0.12) return { scoreReward: score, multiplier: 5, message: `💜 ${score} Puan + x5!` };
        if (rand < 0.20) return { scoreReward: score, multiplier: 2, message: `💜 ${score} Puan + x2!` };
        return { scoreReward: score, message: `💜 ${score} Puan kazandın!` };
    }
    if (type === 'legendary') {
        const score = Math.floor(Math.random() * 501) + 400; // 400-900 (eski: 800-2000)
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
// SIMPLE GAMES - BALANCED (Daha Az Kazanç)
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
            const winAmount = Math.floor(betAmount * 1.5 * userMultiplier); // 1.8 -> 1.5 (daha dengeli)
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
    if (rev) { 
        rev.classList.remove('rps-reveal-container--active'); 
        rev.querySelector('#rpsPlayerChoice').textContent = ''; 
        rev.querySelector('#rpsBotChoice').textContent = ''; 
    }
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
            const winAmount = Math.floor(betAmount * 1.6 * userMultiplier); // 1.9 -> 1.6 (daha dengeli)
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

// ========================================
// WHEEL - FIXED (Tam durduğu dilim kazanır) + BALANCED
// ========================================
document.getElementById('spinWheelCard').addEventListener('click', () => {
    document.getElementById('spinWheelModal').style.display = 'flex';
    drawWheel();
});

const WHEEL_SEGMENTS = [
    { label: 'x0', mult: 0 },
    { label: 'x1', mult: 1 },
    { label: 'x1.2', mult: 1.2 },
    { label: 'x1.5', mult: 1.5 },
    { label: 'x2', mult: 2 },
    { label: 'x3', mult: 3 },
    { label: 'x5', mult: 5 },
    { label: 'x1.5', mult: 1.5 }
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

    await updateDoc(userRef, { score: increment(-betAmount) });

    const segmentIndex = Math.floor(Math.random() * WHEEL_SEGMENTS.length);
    const seg = WHEEL_SEGMENTS[segmentIndex];

    const canvas = document.getElementById('wheelCanvas');
    const anglePerSeg = (360 / WHEEL_SEGMENTS.length);
    
    // FIXED: Tam durduğu dilimin ödülünü al
    const targetAngle = 360 * 5 + (segmentIndex * anglePerSeg);
    const spinTime = 3000;
    const startTime = Date.now();

    const spin = setInterval(() => {
        const elapsed = Date.now() - startTime;
        const progress = Math.min(elapsed / spinTime, 1);
        const ease = 1 - Math.pow(1 - progress, 3);
        const rotation = ease * targetAngle;
        canvas.style.transform = `rotate(${rotation}deg)`;

        if (progress >= 1) {
            clearInterval(spin);
            
            // FIXED: Tam durduğu segmentin ödülünü ver
            const resultMult = seg.mult;
            const winAmount = resultMult > 0 ? Math.floor(betAmount * resultMult * userMultiplier) : 0;
            
            if (resultMult > 0) {
                updateDoc(userRef, { score: increment(winAmount) }).then(() => {
                    showGameResult('wheelResult', `🎉 ${seg.label}! +${winAmount} Puan`, 'win');
                    playCelebrationAnimation('win');
                });
            } else {
                showGameResult('wheelResult', `😢 Kaybettin! -${betAmount} Puan`, 'lose');
                playCelebrationAnimation('lose');
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
}// ========================================
// 2048 GAME - YENİ: Tam Oyun Sistemi
// ========================================
document.getElementById('game2048Card')?.addEventListener('click', () => {
    document.getElementById('game2048Modal').style.display = 'flex';
    init2048();
});

function init2048() {
    game2048 = {
        grid: Array(16).fill(0),
        score: 0,
        bestScore: localStorage.getItem('2048_best') || 0
    };
    
    document.getElementById('game2048Score').textContent = '0';
    document.getElementById('game2048BestScore').textContent = game2048.bestScore;
    
    render2048Grid();
    addRandomTile();
    addRandomTile();
    
    document.getElementById('game2048Modal').focus();
}

function render2048Grid() {
    const gridEl = document.getElementById('game2048Grid');
    gridEl.innerHTML = '';
    
    for (let i = 0; i < 16; i++) {
        const cell = document.createElement('div');
        cell.className = 'game2048-cell';
        const value = game2048.grid[i];
        if (value > 0) {
            cell.textContent = value;
            cell.classList.add(`game2048-tile-${value}`);
        }
        gridEl.appendChild(cell);
    }
}

function addRandomTile() {
    const emptyCells = game2048.grid.map((val, idx) => val === 0 ? idx : -1).filter(idx => idx !== -1);
    if (emptyCells.length === 0) return;
    
    const randomCell = emptyCells[Math.floor(Math.random() * emptyCells.length)];
    game2048.grid[randomCell] = Math.random() < 0.9 ? 2 : 4;
}

function move2048(direction) {
    let moved = false;
    const size = 4;
    
    for (let i = 0; i < size; i++) {
        let row = [];
        for (let j = 0; j < size; j++) {
            let index;
            if (direction === 'left') index = i * size + j;
            else if (direction === 'right') index = i * size + (size - 1 - j);
            else if (direction === 'up') index = j * size + i;
            else index = (size - 1 - j) * size + i;
            row.push({ value: game2048.grid[index], index });
        }
        
        let filtered = row.filter(cell => cell.value > 0);
        let newRow = [];
        
        for (let j = 0; j < filtered.length; j++) {
            if (j < filtered.length - 1 && filtered[j].value === filtered[j + 1].value) {
                const mergedValue = filtered[j].value * 2;
                newRow.push({ value: mergedValue, index: filtered[j].index });
                game2048.score += mergedValue;
                j++;
                moved = true;
            } else {
                newRow.push(filtered[j]);
            }
            if (j < filtered.length - 1 && filtered[j].value !== filtered[j + 1].value) {
                moved = moved || (filtered[j].index !== newRow[newRow.length - 1].index);
            }
        }
        
        while (newRow.length < size) {
            newRow.push({ value: 0, index: -1 });
        }
        
        for (let j = 0; j < size; j++) {
            const targetIndex = row[j].index;
            if (targetIndex !== -1) {
                game2048.grid[targetIndex] = newRow[j].value;
                moved = moved || (game2048.grid[targetIndex] !== row[j].value);
            }
        }
    }
    
    if (moved) {
        addRandomTile();
        render2048Grid();
        update2048Score();
        check2048GameOver();
    }
}

function update2048Score() {
    document.getElementById('game2048Score').textContent = game2048.score;
    if (game2048.score > game2048.bestScore) {
        game2048.bestScore = game2048.score;
        localStorage.setItem('2048_best', game2048.bestScore);
        document.getElementById('game2048BestScore').textContent = game2048.bestScore;
    }
    
    if (game2048.score > 0) {
        document.getElementById('game2048Score').classList.add('game2048-score--updated');
        setTimeout(() => {
            document.getElementById('game2048Score').classList.remove('game2048-score--updated');
        }, 300);
    }
}

function check2048GameOver() {
    const hasEmpty = game2048.grid.some(cell => cell === 0);
    if (hasEmpty) return;
    
    for (let i = 0; i < 16; i++) {
        const row = Math.floor(i / 4);
        const col = i % 4;
        
        if (col < 3 && game2048.grid[i] === game2048.grid[i + 1]) return;
        if (row < 3 && game2048.grid[i] === game2048.grid[i + 4]) return;
    }
    
    setTimeout(() => {
        alert(`Oyun Bitti! Skorunuz: ${game2048.score}`);
        if (confirm('Yeniden başlamak ister misiniz?')) {
            init2048();
        }
    }, 300);
}

// 2048 klavye kontrolleri
document.addEventListener('keydown', (e) => {
    if (document.getElementById('game2048Modal').style.display !== 'flex') return;
    
    switch(e.key) {
        case 'ArrowUp': e.preventDefault(); move2048('up'); break;
        case 'ArrowDown': e.preventDefault(); move2048('down'); break;
        case 'ArrowLeft': e.preventDefault(); move2048('left'); break;
        case 'ArrowRight': e.preventDefault(); move2048('right'); break;
    }
});

// 2048 mobil kontrolleri
document.getElementById('game2048Up')?.addEventListener('click', () => move2048('up'));
document.getElementById('game2048Down')?.addEventListener('click', () => move2048('down'));
document.getElementById('game2048Left')?.addEventListener('click', () => move2048('left'));
document.getElementById('game2048Right')?.addEventListener('click', () => move2048('right'));

document.getElementById('game2048Restart')?.addEventListener('click', () => {
    if (confirm('Oyunu yeniden başlatmak istediğinize emin misiniz?')) {
        init2048();
    }
});

// ========================================
// CHESS GAME - Temel Implementasyon
// ========================================
document.getElementById('chessCard')?.addEventListener('click', () => {
    document.getElementById('chessModal').style.display = 'flex';
    initChess();
});

function initChess() {
    chessGame = {
        board: createInitialChessBoard(),
        currentPlayer: 'white',
        selectedPiece: null,
        validMoves: []
    };
    
    renderChessBoard();
}

function createInitialChessBoard() {
    const board = Array(64).fill(null);
    
    const piecesOrder = [
        'rook', 'knight', 'bishop', 'queen', 'king', 'bishop', 'knight', 'rook'
    ];
    
    for (let i = 0; i < 8; i++) {
        board[i] = { type: piecesOrder[i], color: 'black' };
        board[i + 8] = { type: 'pawn', color: 'black' };
        board[i + 48] = { type: 'pawn', color: 'white' };
        board[i + 56] = { type: piecesOrder[i], color: 'white' };
    }
    
    return board;
}

function renderChessBoard() {
    const boardEl = document.getElementById('chessBoard');
    boardEl.innerHTML = '';
    
    for (let row = 0; row < 8; row++) {
        for (let col = 0; col < 8; col++) {
            const index = row * 8 + col;
            const cell = document.createElement('div');
            cell.className = `chess-cell ${(row + col) % 2 === 0 ? 'chess-cell-light' : 'chess-cell-dark'}`;
            cell.dataset.index = index;
            
            const piece = chessGame.board[index];
            if (piece) {
                const pieceEl = document.createElement('div');
                pieceEl.className = `chess-piece chess-piece-${piece.color} chess-piece-${piece.type}`;
                pieceEl.textContent = getChessPieceSymbol(piece.type);
                cell.appendChild(pieceEl);
            }
            
            if (chessGame.validMoves.includes(index)) {
                cell.classList.add('chess-cell-valid');
            }
            
            cell.addEventListener('click', () => handleChessCellClick(index));
            boardEl.appendChild(cell);
        }
    }
    
    document.getElementById('chessCurrentPlayer').textContent = 
        chessGame.currentPlayer === 'white' ? 'Beyaz' : 'Siyah';
}

function getChessPieceSymbol(type) {
    const symbols = {
        king: '♔',
        queen: '♕',
        rook: '♖',
        bishop: '♗',
        knight: '♘',
        pawn: '♙'
    };
    return symbols[type] || '';
}

function handleChessCellClick(index) {
    const piece = chessGame.board[index];
    
    if (chessGame.selectedPiece === null) {
        if (piece && piece.color === chessGame.currentPlayer) {
            chessGame.selectedPiece = index;
            chessGame.validMoves = calculateValidMoves(index, piece);
            renderChessBoard();
        }
    } else {
        if (chessGame.validMoves.includes(index)) {
            moveChessPiece(chessGame.selectedPiece, index);
            chessGame.currentPlayer = chessGame.currentPlayer === 'white' ? 'black' : 'white';
        }
        chessGame.selectedPiece = null;
        chessGame.validMoves = [];
        renderChessBoard();
        checkChessGameStatus();
    }
}

function calculateValidMoves(index, piece) {
    const moves = [];
    const row = Math.floor(index / 8);
    const col = index % 8;
    
    switch(piece.type) {
        case 'pawn':
            const direction = piece.color === 'white' ? -1 : 1;
            const forward1 = index + (direction * 8);
            if (forward1 >= 0 && forward1 < 64 && !chessGame.board[forward1]) {
                moves.push(forward1);
                
                const isStartRow = (piece.color === 'white' && row === 6) || 
                                 (piece.color === 'black' && row === 1);
                if (isStartRow) {
                    const forward2 = index + (direction * 16);
                    if (!chessGame.board[forward2]) {
                        moves.push(forward2);
                    }
                }
            }
            
            const leftDiag = index + (direction * 8) - 1;
            const rightDiag = index + (direction * 8) + 1;
            
            if (Math.floor(leftDiag / 8) === row + direction && 
                chessGame.board[leftDiag] && 
                chessGame.board[leftDiag].color !== piece.color) {
                moves.push(leftDiag);
            }
            
            if (Math.floor(rightDiag / 8) === row + direction && 
                chessGame.board[rightDiag] && 
                chessGame.board[rightDiag].color !== piece.color) {
                moves.push(rightDiag);
            }
            break;
            
        case 'rook':
            addLinearMoves(moves, index, [[-1,0],[1,0],[0,-1],[0,1]]);
            break;
            
        case 'knight':
            const knightMoves = [[-2,-1],[-2,1],[-1,-2],[-1,2],[1,-2],[1,2],[2,-1],[2,1]];
            knightMoves.forEach(([dr, dc]) => {
                const newRow = row + dr;
                const newCol = col + dc;
                if (newRow >= 0 && newRow < 8 && newCol >= 0 && newCol < 8) {
                    const newIndex = newRow * 8 + newCol;
                    const targetPiece = chessGame.board[newIndex];
                    if (!targetPiece || targetPiece.color !== piece.color) {
                        moves.push(newIndex);
                    }
                }
            });
            break;
    }
    
    return moves;
}

function addLinearMoves(moves, index, directions) {
    const row = Math.floor(index / 8);
    const col = index % 8;
    const piece = chessGame.board[index];
    
    directions.forEach(([dr, dc]) => {
        let newRow = row + dr;
        let newCol = col + dc;
        
        while (newRow >= 0 && newRow < 8 && newCol >= 0 && newCol < 8) {
            const newIndex = newRow * 8 + newCol;
            const targetPiece = chessGame.board[newIndex];
            
            if (!targetPiece) {
                moves.push(newIndex);
            } else {
                if (targetPiece.color !== piece.color) {
                    moves.push(newIndex);
                }
                break;
            }
            
            newRow += dr;
            newCol += dc;
        }
    });
}

function moveChessPiece(from, to) {
    chessGame.board[to] = chessGame.board[from];
    chessGame.board[from] = null;
    
    document.getElementById('chessMoveSound')?.play();
    
    if (chessGame.board[to]?.type === 'pawn') {
        const row = Math.floor(to / 8);
        if (row === 0 || row === 7) {
            chessGame.board[to].type = 'queen';
        }
    }
}

function checkChessGameStatus() {
    const kings = chessGame.board.map((piece, idx) => piece?.type === 'king' ? piece.color : null)
        .filter(color => color !== null);
    
    if (kings.length < 2) {
        setTimeout(() => {
            const winner = kings[0] === 'white' ? 'Beyaz' : 'Siyah';
            alert(`${winner} kazandı!`);
            if (confirm('Yeni oyuna başlamak ister misiniz?')) {
                initChess();
            }
        }, 100);
    }
}

document.getElementById('chessRestart')?.addEventListener('click', () => {
    if (confirm('Satranç oyununu yeniden başlatmak istediğinize emin misiniz?')) {
        initChess();
    }
});

// ========================================
// ENHANCEMENTS SYSTEM
// ========================================
function initEnhancements() {
    loadEnhancements();
    setupEnhancementListeners();
}

async function loadEnhancements() {
    const userRef = doc(db, 'users', currentUser.uid);
    const userSnap = await getDoc(userRef);
    const userData = userSnap.data();
    
    if (userData.enhancements) {
        Object.entries(userData.enhancements).forEach(([id, level]) => {
            const enhBtn = document.querySelector(`[data-enhancement-id="${id}"]`);
            if (enhBtn) {
                enhBtn.dataset.level = level;
                updateEnhancementButton(id, level);
            }
        });
    }
}

function setupEnhancementListeners() {
    document.querySelectorAll('.enhancement-btn').forEach(btn => {
        btn.addEventListener('click', async () => {
            const id = btn.dataset.enhancementId;
            const currentLevel = parseInt(btn.dataset.level || 0);
            const maxLevel = parseInt(btn.dataset.maxLevel || 3);
            
            if (currentLevel >= maxLevel) {
                showEnhancementResult('Bu geliştirme maksimum seviyede!', 'error');
                return;
            }
            
            const cost = calculateEnhancementCost(id, currentLevel);
            const userRef = doc(db, 'users', currentUser.uid);
            const userSnap = await getDoc(userRef);
            const userData = userSnap.data();
            
            if (userData.score < cost) {
                showEnhancementResult('Yetersiz puan!', 'error');
                return;
            }
            
            try {
                await updateDoc(userRef, {
                    score: increment(-cost),
                    [`enhancements.${id}`]: currentLevel + 1
                });
                
                const newLevel = currentLevel + 1;
                btn.dataset.level = newLevel;
                updateEnhancementButton(id, newLevel);
                applyEnhancementEffect(id, newLevel);
                
                showEnhancementResult(`Geliştirme başarıyla yükseltildi! (Seviye ${newLevel})`, 'success');
            } catch (error) {
                showEnhancementResult('Hata oluştu: ' + error.message, 'error');
            }
        });
    });
}

function calculateEnhancementCost(id, level) {
    const baseCosts = {
        'click-power': 100,
        'ad-boost': 250,
        'wheel-luck': 500,
        'chat-speed': 150
    };
    
    return baseCosts[id] * (level + 1);
}

function updateEnhancementButton(id, level) {
    const btn = document.querySelector(`[data-enhancement-id="${id}"]`);
    if (!btn) return;
    
    const maxLevel = parseInt(btn.dataset.maxLevel || 3);
    const cost = calculateEnhancementCost(id, level);
    
    btn.querySelector('.enhancement-level').textContent = `Seviye ${level}/${maxLevel}`;
    btn.querySelector('.enhancement-cost').textContent = `${cost} Puan`;
    
    if (level >= maxLevel) {
        btn.disabled = true;
        btn.innerHTML = '<span class="enhancement-max">Maksimum Seviye</span>';
    }
}

function applyEnhancementEffect(id, level) {
    switch(id) {
        case 'click-power':
            userMultiplier = 1 + (level * 0.5);
            document.getElementById('multiplierValue').textContent = `x${userMultiplier}`;
            break;
        case 'ad-boost':
            const adBtn = document.getElementById('watchAdBtn');
            if (adBtn) {
                const baseReward = 30;
                const newReward = baseReward + (level * 10);
                adBtn.textContent = `+${newReward} Puan Kazan`;
                adBtn.dataset.reward = newReward;
            }
            break;
    }
}

function showEnhancementResult(message, type) {
    const resultEl = document.getElementById('enhancementResult');
    if (!resultEl) return;
    
    resultEl.className = `enhancement-result enhancement-result-${type}`;
    resultEl.textContent = message;
    
    setTimeout(() => {
        resultEl.textContent = '';
        resultEl.className = 'enhancement-result';
    }, 3000);
}

// ========================================
// ADMIN DASHBOARD & ANALYTICS
// ========================================
async function loadAdminDashboard() {
    const statsEl = document.getElementById('adminStats');
    if (!statsEl) return;
    
    statsEl.innerHTML = '<div class="loading">İstatistikler yükleniyor...</div>';
    
    try {
        const usersSnap = await getDocs(collection(db, 'users'));
        const chatSnap = await getDocs(collection(db, 'chat'));
        const presenceRef = ref(rtdb, 'presence');
        
        const presenceData = await new Promise((resolve) => {
            onValue(presenceRef, (s) => resolve(s.val() || {}), { onlyOnce: true });
        });
        
        const onlineUsers = Object.values(presenceData).filter(p => p.online).length;
        const totalScore = usersSnap.docs.reduce((sum, doc) => sum + (doc.data().score || 0), 0);
        const avgScore = usersSnap.size > 0 ? Math.round(totalScore / usersSnap.size) : 0;
        
        statsEl.innerHTML = `
            <div class="admin-stat-card">
                <div class="admin-stat-icon">👥</div>
                <div class="admin-stat-value">${usersSnap.size}</div>
                <div class="admin-stat-label">Toplam Kullanıcı</div>
            </div>
            <div class="admin-stat-card">
                <div class="admin-stat-icon">🟢</div>
                <div class="admin-stat-value">${onlineUsers}</div>
                <div class="admin-stat-label">Çevrimiçi Kullanıcı</div>
            </div>
            <div class="admin-stat-card">
                <div class="admin-stat-icon">💎</div>
                <div class="admin-stat-value">${totalScore}</div>
                <div class="admin-stat-label">Toplam Puan</div>
            </div>
            <div class="admin-stat-card">
                <div class="admin-stat-icon">📊</div>
                <div class="admin-stat-value">${avgScore}</div>
                <div class="admin-stat-label">Ortalama Puan</div>
            </div>
            <div class="admin-stat-card">
                <div class="admin-stat-icon">💬</div>
                <div class="admin-stat-value">${chatSnap.size}</div>
                <div class="admin-stat-label">Toplam Mesaj</div>
            </div>
        `;
    } catch (error) {
        statsEl.innerHTML = `<div class="error">İstatistikler yüklenemedi: ${error.message}</div>`;
    }
}

async function loadAdminAnalytics() {
    const chartEl = document.getElementById('adminAnalyticsChart');
    if (!chartEl) return;
    
    chartEl.innerHTML = '<div class="loading">Analizler yükleniyor...</div>';
    
    setTimeout(() => {
        chartEl.innerHTML = `
            <div class="analytics-placeholder">
                <div class="analytics-chart">
                    <!-- Basit bir çubuk grafik simülasyonu -->
                    <div class="analytics-bar" style="height: 80%;" title="Pazartesi: 80 kullanıcı"></div>
                    <div class="analytics-bar" style="height: 65%;" title="Salı: 65 kullanıcı"></div>
                    <div class="analytics-bar" style="height: 90%;" title="Çarşamba: 90 kullanıcı"></div>
                    <div class="analytics-bar" style="height: 70%;" title="Perşembe: 70 kullanıcı"></div>
                    <div class="analytics-bar" style="height: 95%;" title="Cuma: 95 kullanıcı"></div>
                    <div class="analytics-bar" style="height: 100%;" title="Cumartesi: 100 kullanıcı"></div>
                    <div class="analytics-bar" style="height: 85%;" title="Pazar: 85 kullanıcı"></div>
                </div>
                <div class="analytics-labels">
                    <span>Pzt</span><span>Sal</span><span>Çar</span><span>Per</span><span>Cum</span><span>Cmt</span><span>Paz</span>
                </div>
                <div class="analytics-title">Son 7 Günlük Aktif Kullanıcı</div>
            </div>
        `;
    }, 1000);
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
                if (modal.id === 'dmConversation' && dmReceiptsUnsubscribe) {
                    dmReceiptsUnsubscribe();
                    dmReceiptsUnsubscribe = null;
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
// MOBILE MENU TOGGLE
// ========================================
document.getElementById('mobileMenuToggle')?.addEventListener('click', () => {
    document.getElementById('mobileSidebar').classList.toggle('mobile-sidebar--active');
});

document.getElementById('mobileSidebarOverlay')?.addEventListener('click', () => {
    document.getElementById('mobileSidebar').classList.remove('mobile-sidebar--active');
});

// ========================================
// INITIALIZATION COMPLETE
// ========================================
console.log('🚀 Uygulama başlatıldı!');
