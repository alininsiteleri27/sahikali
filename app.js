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
let dmUnreadCounts = {};
let dmReceiptsUnsubscribe = null;
let game2048 = null;
let vsLobbyUsers = [];
let vsLobbyUnsubscribe = null;
let activeVsInvites = {};

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
        setupVsLobbyListeners();
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
            muteUntil: null,
            vsWins: 0,
            vsLosses: 0,
            lastActive: serverTimestamp()
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
        lastSeen: rtdbServerTimestamp(),
        username: document.getElementById('headerUsername')?.textContent || 'User'
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
// ADMIN PANEL with FOUNDER SUPPORT
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
        else if (tabName === 'founder') loadFounderTools();
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
                        ${data.role === 'founder' ? '<span class="admin-badge founder">Kurucu</span>' : ''}
                        ${data.role === 'admin' ? '<span class="admin-badge admin">Admin</span>' : ''}
                        ${data.banned ? '<span class="admin-badge banned">Banned</span>' : ''}
                        ${data.muted ? '<span class="admin-badge muted">Muted</span>' : ''}
                    </div>
                </div>
            </div>
            <div class="admin-user-actions">
                <button class="admin-action-quick-btn" onclick="openAdminAction('${docSnap.id}', '${data.username}', '${data.role}', ${!!data.banned}, ${!!data.muted})">
                    ⚙️ İşlemler
                </button>
            </div>
        `;
        listEl.appendChild(item);
    });
}

window.openAdminAction = (uid, username, role, isBanned, isMuted) => {
    // Admin koruması: Admin başka admin'e işlem yapamaz (founder hariç)
    if ((role === 'admin' || role === 'founder') && !isUserFounder) {
        alert('❌ Adminler başka adminler üzerinde işlem yapamaz!');
        return;
    }

    document.getElementById('adminActionModal').style.display = 'flex';
    document.getElementById('actionUserName').textContent = username;
    document.getElementById('adminActionModal').dataset.uid = uid;
    document.getElementById('adminActionModal').dataset.role = role;

    const isSelf = uid === currentUser.uid;
    const canTakeAction = isUserFounder || (isUserAdmin && role !== 'admin' && role !== 'founder');

    document.getElementById('banUserBtn').style.display = (canTakeAction && !isBanned && !isSelf) ? 'block' : 'none';
    document.getElementById('unbanUserBtn').style.display = (canTakeAction && isBanned) ? 'block' : 'none';
    document.getElementById('muteUserBtn').style.display = (canTakeAction && !isMuted && !isSelf) ? 'block' : 'none';
    document.getElementById('unmuteUserBtn').style.display = (canTakeAction && isMuted) ? 'block' : 'none';
    document.getElementById('resetPasswordBtn').style.display = canTakeAction ? 'block' : 'none';
    document.getElementById('promoteToAdminBtn').style.display = (isUserFounder && role === 'user') ? 'block' : 'none';
    document.getElementById('demoteFromAdminBtn').style.display = (isUserFounder && role === 'admin') ? 'block' : 'none';
    document.getElementById('godModeBtn').style.display = (isUserFounder && !isSelf) ? 'block' : 'none';

    document.getElementById('muteOptions').style.display = 'none';
    document.getElementById('passwordResetOptions').style.display = 'none';
    document.getElementById('adminActionMessage').textContent = '';
};

// Founder özel işlemleri
document.getElementById('promoteToAdminBtn')?.addEventListener('click', async () => {
    const uid = document.getElementById('adminActionModal').dataset.uid;
    const messageEl = document.getElementById('adminActionMessage');

    try {
        await updateDoc(doc(db, 'users', uid), { role: 'admin' });
        messageEl.className = 'admin-message success';
        messageEl.textContent = '✅ Kullanıcı admin yapıldı';
        setTimeout(() => {
            document.getElementById('adminActionModal').style.display = 'none';
            loadAdminUsers();
        }, 1500);
    } catch (error) {
        messageEl.className = 'admin-message error';
        messageEl.textContent = error.message;
    }
});

document.getElementById('demoteFromAdminBtn')?.addEventListener('click', async () => {
    const uid = document.getElementById('adminActionModal').dataset.uid;
    const messageEl = document.getElementById('adminActionMessage');

    try {
        await updateDoc(doc(db, 'users', uid), { role: 'user' });
        messageEl.className = 'admin-message success';
        messageEl.textContent = '✅ Admin yetkisi alındı';
        setTimeout(() => {
            document.getElementById('adminActionModal').style.display = 'none';
            loadAdminUsers();
        }, 1500);
    } catch (error) {
        messageEl.className = 'admin-message error';
        messageEl.textContent = error.message;
    }
});

document.getElementById('godModeBtn')?.addEventListener('click', async () => {
    const uid = document.getElementById('adminActionModal').dataset.uid;
    const messageEl = document.getElementById('adminActionMessage');

    try {
        await updateDoc(doc(db, 'users', uid), {
            score: 999999,
            multiplier: 10,
            role: 'user' // Founder isterse admin'den de alabilir
        });
        messageEl.className = 'admin-message success';
        messageEl.textContent = '✅ God Mode uygulandı!';
        setTimeout(() => {
            document.getElementById('adminActionModal').style.display = 'none';
            loadAdminUsers();
        }, 1500);
    } catch (error) {
        messageEl.className = 'admin-message error';
        messageEl.textContent = error.message;
    }
});

// Orijinal admin işlemleri (koruma ile)
document.getElementById('banUserBtn').addEventListener('click', async () => {
    const uid = document.getElementById('adminActionModal').dataset.uid;
    const role = document.getElementById('adminActionModal').dataset.role;
    const messageEl = document.getElementById('adminActionMessage');

    if ((role === 'admin' || role === 'founder') && !isUserFounder) {
        messageEl.className = 'admin-message error';
        messageEl.textContent = '❌ Adminler banlanamaz!';
        return;
    }

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
    const role = document.getElementById('adminActionModal').dataset.role;
    const duration = parseInt(document.getElementById('muteDuration').value);
    const messageEl = document.getElementById('adminActionMessage');

    if ((role === 'admin' || role === 'founder') && !isUserFounder) {
        messageEl.className = 'admin-message error';
        messageEl.textContent = '❌ Adminler susturulamaz!';
        return;
    }

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

function loadFounderTools() {
    const founderTab = document.getElementById('adminFounderTab');
    if (!founderTab) return;

    founderTab.innerHTML = `
        <div class="founder-tools">
            <h3>🔱 Kurucu Araçları</h3>
            <div class="founder-actions">
                <button class="founder-btn" onclick="founderGivePoints()">
                    💎 Toplu Puan Dağıt
                </button>
                <button class="founder-btn" onclick="founderResetEconomy()">
                    🔄 Ekonomiyi Sıfırla
                </button>
                <button class="founder-btn" onclick="founderViewAllChats()">
                    👁️ Tüm Mesajları Gör
                </button>
                <button class="founder-btn" onclick="founderSystemBroadcast()">
                    📢 Sistem Duyurusu
                </button>
            </div>
            <div class="founder-stats">
                <h4>Sistem İstatistikleri</h4>
                <div id="founderStats">Yükleniyor...</div>
            </div>
        </div>
    `;

    loadFounderStats();
}

async function loadFounderStats() {
    const statsEl = document.getElementById('founderStats');
    if (!statsEl) return;

    const usersSnap = await getDocs(collection(db, 'users'));
    let totalScore = 0;
    let adminCount = 0;
    let bannedCount = 0;

    usersSnap.forEach(doc => {
        const data = doc.data();
        totalScore += data.score || 0;
        if (data.role === 'admin' || data.role === 'founder') adminCount++;
        if (data.banned) bannedCount++;
    });

    statsEl.innerHTML = `
        <div class="stat-grid">
            <div class="stat-item">Toplam Kullanıcı: ${usersSnap.size}</div>
            <div class="stat-item">Toplam Puan: ${totalScore}</div>
            <div class="stat-item">Admin Sayısı: ${adminCount}</div>
            <div class="stat-item">Yasaklı: ${bannedCount}</div>
            <div class="stat-item">Online: ${document.getElementById('onlineCount')?.textContent || 0}</div>
        </div>
    `;
}

window.founderGivePoints = async function() {
    const amount = prompt('Her kullanıcıya verilecek puan miktarı:', '100');
    if (!amount) return;

    const usersSnap = await getDocs(collection(db, 'users'));
    const batch = [];

    usersSnap.forEach(doc => {
        batch.push(updateDoc(doc.ref, {
            score: increment(parseInt(amount))
        }));
    });

    await Promise.all(batch);
    alert(`✅ ${usersSnap.size} kullanıcıya ${amount} puan dağıtıldı!`);
};

window.founderResetEconomy = async function() {
    if (!confirm('TÜM kullanıcıların puanları sıfırlanacak! Emin misiniz?')) return;

    const usersSnap = await getDocs(collection(db, 'users'));
    const batch = [];

    usersSnap.forEach(doc => {
        batch.push(updateDoc(doc.ref, {
            score: 100,
            multiplier: 1
        }));
    });

    await Promise.all(batch);
    alert('✅ Ekonomi sıfırlandı! Tüm kullanıcılar 100 puana döndü.');
};

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

// ========================================
// CHAT SYSTEM with VS INVITE BUTTON
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

// Global Chat'e VS Davet Butonu Ekle
function addVsInviteButton() {
    const chatInputContainer = document.querySelector('#globalChatTab .chat-input-container');
    if (!chatInputContainer) return;

    // Buton zaten eklenmiş mi kontrol et
    if (document.getElementById('vsInviteBtn')) return;

    const vsInviteBtn = document.createElement('button');
    vsInviteBtn.id = 'vsInviteBtn';
    vsInviteBtn.className = 'vs-invite-btn';
    vsInviteBtn.innerHTML = '⚔️ VS Davet';
    vsInviteBtn.title = 'VS için rakip ara';
    vsInviteBtn.style.marginRight = '8px';
    vsInviteBtn.style.padding = '8px 12px';
    vsInviteBtn.style.borderRadius = '8px';
    vsInviteBtn.style.background = 'var(--bg-gradient-alt)';
    vsInviteBtn.style.color = 'white';
    vsInviteBtn.style.border = 'none';
    vsInviteBtn.style.cursor = 'pointer';
    vsInviteBtn.style.fontWeight = '600';
    vsInviteBtn.style.transition = 'all 0.3s';

    vsInviteBtn.addEventListener('mouseenter', () => {
        vsInviteBtn.style.transform = 'scale(1.05)';
    });
    vsInviteBtn.addEventListener('mouseleave', () => {
        vsInviteBtn.style.transform = 'scale(1)';
    });

    vsInviteBtn.addEventListener('click', async () => {
        await sendVsInviteToChat();
    });

    chatInputContainer.insertBefore(vsInviteBtn, chatInputContainer.firstChild);
}

async function sendVsInviteToChat() {
    const userRef = doc(db, 'users', currentUser.uid);
    const userSnap = await getDoc(userRef);
    const userData = userSnap.data();

    const inviteMessage = `⚔️ ${userData.username}, VS için rakip arıyor! Katılmak isteyen?`;
    
    await addDoc(collection(db, 'chat'), {
        username: 'Sistem',
        message: inviteMessage,
        timestamp: serverTimestamp(),
        userId: 'system',
        vsInvite: true,
        inviterId: currentUser.uid,
        inviterName: userData.username
    });

    // Bildirim göster
    showNotification('VS daveti global chat\'e gönderildi!');
}

// Chat mesajlarını yükle
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

    // VS davet butonunu ekle
    addVsInviteButton();
}

function appendChatMessage(msg) {
    const messagesEl = document.getElementById('chatMessages');
    const msgEl = document.createElement('div');
    msgEl.className = 'chat-message';
    msgEl.dataset.msgId = msg.id;

    const time = msg.timestamp
        ? new Date(msg.timestamp.toMillis()).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })
        : '';

    // VS davet mesajı özel formatı
    if (msg.vsInvite && msg.inviterId !== currentUser.uid) {
        msgEl.innerHTML = `
            <div class="message-header">
                <div class="message-user">${msg.username}</div>
            </div>
            <div class="message-text">${msg.message}</div>
            <div class="vs-invite-actions">
                <button class="vs-join-btn" data-inviter-id="${msg.inviterId}" data-inviter-name="${msg.inviterName}">
                    ✅ Katıl
                </button>
            </div>
            <div class="message-time">${time}</div>
        `;
    } else {
        msgEl.innerHTML = `
            <div class="message-header">
                <div class="message-user">${msg.username}</div>
                ${(isUserAdmin || isUserFounder) ? `<button class="chat-delete-btn">Sil</button>` : ''}
            </div>
            <div class="message-text">${msg.message}</div>
            <div class="message-time">${time}</div>
        `;
    }

    // VS katıl butonu event'i
    const joinBtn = msgEl.querySelector('.vs-join-btn');
    if (joinBtn) {
        joinBtn.addEventListener('click', async () => {
            const inviterId = joinBtn.dataset.inviterId;
            const inviterName = joinBtn.dataset.inviterName;
            
            // VS lobisine yönlendir
            document.getElementById('vsLobbyModal').style.display = 'flex';
            document.getElementById('vsLobbyTitle').textContent = `⚔️ ${inviterName} ile VS`;
            
            // Davet eden kişiye DM gönder
            await sendVsInviteDm(inviterId, inviterName);
        });
    }

    // Admin silme butonu
    if ((isUserAdmin || isUserFounder)) {
        const deleteBtn = msgEl.querySelector('.chat-delete-btn');
        if (deleteBtn) {
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
    }

    messagesEl.appendChild(msgEl);
}

async function sendVsInviteDm(inviterId, inviterName) {
    const conversationId = [currentUser.uid, inviterId].sort().join('_');
    const messagesRef = collection(db, 'dm', conversationId, 'messages');
    
    const userRef = doc(db, 'users', currentUser.uid);
    const userSnap = await getDoc(userRef);
    const userData = userSnap.data();

    await addDoc(messagesRef, {
        senderId: currentUser.uid,
        username: userData.username,
        message: `VS davetinizi kabul etmek istiyorum! Hadi oynayalım.`,
        timestamp: serverTimestamp(),
        isVsInvite: true
    });

    // Davet eden kişiye bildirim
    showNotification(`${userData.username}, VS davetinize cevap verdi!`);
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
// DM SYSTEM with NOTIFICATION
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

    const userItems = [];

    snapshot.forEach(docSnap => {
        if (docSnap.id === currentUser.uid) return;

        const data = docSnap.data();
        const isOnline = !!(presenceData[docSnap.id] && presenceData[docSnap.id].online);
        const unread = dmUnreadCounts[docSnap.id] || 0;
        const hasUnread = unread > 0;
        
        const item = document.createElement('div');
        item.className = 'dm-user-item';
        item.dataset.recipientId = docSnap.id;
        item.dataset.lastActivity = data.lastActive?.toMillis?.() || 0;
        item.dataset.unread = unread;
        
        item.innerHTML = `
            <div class="dm-user-avatar">
                ${data.profileImage ? `<img src="${data.profileImage}" alt="">` : '👤'}
            </div>
            <div class="dm-user-info">
                <div class="dm-user-name-display">${data.username}</div>
                <div class="dm-user-status dm-user-status--${isOnline ? 'online' : 'offline'}">
                    ${isOnline ? '🟢 Çevrimiçi' : '⚫ Çevrimdışı'}
                </div>
                ${hasUnread ? `<span class="dm-unread-dot">${unread}</span>` : ''}
            </div>
        `;
        
        item.addEventListener('click', () => openDmConversation(docSnap.id, data.username));
        
        userItems.push({
            element: item,
            lastActive: data.lastActive?.toMillis?.() || 0,
            unread: unread,
            isOnline: isOnline
        });
    });

    // Sıralama: Okunmamış mesajlar ve en aktif olanlar üstte
    userItems.sort((a, b) => {
        if (a.unread > 0 && b.unread === 0) return -1;
        if (a.unread === 0 && b.unread > 0) return 1;
        if (a.unread > 0 && b.unread > 0) return b.unread - a.unread;
        if (a.isOnline && !b.isOnline) return -1;
        if (!a.isOnline && b.isOnline) return 1;
        return b.lastActive - a.lastActive;
    });

    userItems.forEach(item => {
        listEl.appendChild(item.element);
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

    // Okunmamış mesaj sayısını sıfırla
    dmUnreadCounts[recipientId] = 0;
    updateDmUnreadBadge();
    
    // DM listesini yeniden sırala
    loadDmUsers();
    
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

    // Alıcıya okunmamış mesaj bildirimi ekle
    dmUnreadCounts[currentDmRecipient] = (dmUnreadCounts[currentDmRecipient] || 0) + 1;
    updateDmUnreadBadge();
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

// DM dinleyici - yeni mesaj geldiğinde bildirim
function setupDmListener() {
    const dmRef = collection(db, 'dm');
    onSnapshot(dmRef, (snapshot) => {
        snapshot.docChanges().forEach(change => {
            if (change.type === 'added') {
                const conversationId = change.doc.id;
                const userIds = conversationId.split('_');
                
                if (userIds.includes(currentUser.uid)) {
                    const otherUserId = userIds.find(id => id !== currentUser.uid);
                    
                    // Eğer o DM'de değilsek, okunmamış sayısını arttır
                    if (otherUserId && otherUserId !== currentDmRecipient) {
                        dmUnreadCounts[otherUserId] = (dmUnreadCounts[otherUserId] || 0) + 1;
                        updateDmUnreadBadge();
                        loadDmUsers(); // Listeyi yeniden sırala
                    }
                }
            }
        });
    });
}

// ========================================
// AD SYSTEM with BALANCED ECONOMY
// ========================================
document.getElementById('watchAdBtn').addEventListener('click', async () => {
    if (adCooldown) return;

    const btn = document.getElementById('watchAdBtn');
    btn.disabled = true;
    btn.textContent = 'Reklam gösteriliyor...';

    setTimeout(async () => {
        const userRef = doc(db, 'users', currentUser.uid);
        // Daha dengeli puan: 20 puan (eski: 50)
        await updateDoc(userRef, { score: increment(20) });

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
                btn.textContent = '+20 Puan Kazan';
                document.getElementById('adCooldown').style.display = 'none';
                adCooldown = false;
            }
        }, 1000);
    }, 3000);
});

// ========================================
// MARKET SYSTEM with BALANCED ECONOMY
// ========================================
document.getElementById('marketBtn').addEventListener('click', () => {
    document.getElementById('marketModal').style.display = 'flex';
    loadInventory();
});

// Denge: Kutu fiyatları arttı, ödüller azaldı
const BOX_PRICES = { bronze: 100, silver: 300, gold: 800, epic: 500, legendary: 1200, daily: 0 };

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
    // Denge: Ödüller daha düşük, şanslar daha az
    if (type === 'daily') {
        const score = Math.floor(Math.random() * 151) + 30; // 30-180 (eski: 50-300)
        if (rand < 0.03) return { scoreReward: score, multiplier: 2, message: `📅 ${score} Puan + x2!` }; // %3 şans
        return { scoreReward: score, message: `📅 ${score} Puan kazandın!` };
    }
    if (type === 'bronze') {
        const score = Math.floor(Math.random() * 101) + 30; // 30-130 (eski: 50-200)
        if (rand < 0.05) return { scoreReward: score, multiplier: 2, message: `🎉 ${score} Puan + x2 Katlayıcı!` }; // %5 şans
        return { scoreReward: score, message: `✨ ${score} Puan kazandın!` };
    }
    if (type === 'silver') {
        const score = Math.floor(Math.random() * 201) + 100; // 100-300 (eski: 200-500)
        if (rand < 0.03) return { scoreReward: score, multiplier: 5, message: `🔥 ${score} Puan + x5 Katlayıcı!` }; // %3 şans
        if (rand < 0.15) return { scoreReward: score, multiplier: 2, message: `🎉 ${score} Puan + x2 Katlayıcı!` }; // %12 şans
        return { scoreReward: score, message: `✨ ${score} Puan kazandın!` };
    }
    if (type === 'gold') {
        const score = Math.floor(Math.random() * 601) + 300; // 300-900 (eski: 500-1500)
        if (rand < 0.02) return { scoreReward: score, multiplier: 10, message: `💥 ${score} Puan + x10 MEGA Katlayıcı!` }; // %2 şans
        if (rand < 0.08) return { scoreReward: score, multiplier: 5, message: `🔥 ${score} Puan + x5 Katlayıcı!` }; // %6 şans
        if (rand < 0.2) return { scoreReward: score, multiplier: 2, message: `🎉 ${score} Puan + x2 Katlayıcı!` }; // %12 şans
        return { scoreReward: score, message: `✨ ${score} Puan kazandın!` };
    }
    if (type === 'epic') {
        const score = Math.floor(Math.random() * 301) + 200; // 200-500 (eski: 300-800)
        if (rand < 0.04) return { scoreReward: score, multiplier: 10, message: `💜 ${score} Puan + x10 Epic!` }; // %4 şans
        if (rand < 0.12) return { scoreReward: score, multiplier: 5, message: `💜 ${score} Puan + x5!` }; // %8 şans
        if (rand < 0.25) return { scoreReward: score, multiplier: 2, message: `💜 ${score} Puan + x2!` }; // %13 şans
        return { scoreReward: score, message: `💜 ${score} Puan kazandın!` };
    }
    if (type === 'legendary') {
        const score = Math.floor(Math.random() * 801) + 500; // 500-1300 (eski: 800-2000)
        if (rand < 0.03) return { scoreReward: score, multiplier: 10, message: `🌈 ${score} Puan + x10 Legendary!` }; // %3 şans
        if (rand < 0.1) return { scoreReward: score, multiplier: 5, message: `🌈 ${score} Puan + x5!` }; // %7 şans
        if (rand < 0.25) return { scoreReward: score, multiplier: 2, message: `🌈 ${score} Puan + x2!` }; // %15 şans
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
// 2048 GAME
// ========================================
document.getElementById('game2048Card')?.addEventListener('click', () => {
    document.getElementById('game2048Modal').style.display = 'flex';
    init2048Game();
});

class Game2048 {
    constructor() {
        this.grid = Array(4).fill().map(() => Array(4).fill(0));
        this.score = 0;
        this.gameOver = false;
        this.init();
    }

    init() {
        // İki başlangıç numarası ekle
        this.addRandomTile();
        this.addRandomTile();
        this.render();
    }

    addRandomTile() {
        const emptyCells = [];
        for (let i = 0; i < 4; i++) {
            for (let j = 0; j < 4; j++) {
                if (this.grid[i][j] === 0) {
                    emptyCells.push({ x: i, y: j });
                }
            }
        }
        
        if (emptyCells.length > 0) {
            const cell = emptyCells[Math.floor(Math.random() * emptyCells.length)];
            this.grid[cell.x][cell.y] = Math.random() < 0.9 ? 2 : 4;
        }
    }

    render() {
        const board = document.getElementById('game2048Board');
        if (!board) return;
        
        board.innerHTML = '';
        board.className = 'game-2048-board';
        
        for (let i = 0; i < 4; i++) {
            for (let j = 0; j < 4; j++) {
                const tile = document.createElement('div');
                tile.className = 'game-2048-tile';
                const value = this.grid[i][j];
                
                if (value !== 0) {
                    tile.textContent = value;
                    tile.classList.add(`tile-${value}`);
                }
                
                board.appendChild(tile);
            }
        }
        
        document.getElementById('game2048Score').textContent = `Puan: ${this.score}`;
    }

    move(direction) {
        if (this.gameOver) return false;
        
        let moved = false;
        const oldGrid = this.grid.map(row => [...row]);
        
        switch(direction) {
            case 'left':
                moved = this.moveLeft();
                break;
            case 'right':
                this.grid = this.grid.map(row => row.reverse());
                moved = this.moveLeft();
                this.grid = this.grid.map(row => row.reverse());
                break;
            case 'up':
                this.grid = this.transpose();
                moved = this.moveLeft();
                this.grid = this.transpose();
                break;
            case 'down':
                this.grid = this.transpose();
                this.grid = this.grid.map(row => row.reverse());
                moved = this.moveLeft();
                this.grid = this.grid.map(row => row.reverse());
                this.grid = this.transpose();
                break;
        }
        
        if (moved) {
            this.addRandomTile();
            this.render();
            
            if (this.checkGameOver()) {
                this.gameOver = true;
                this.endGame();
            }
            
            return true;
        }
        
        return false;
    }

    moveLeft() {
        let moved = false;
        
        for (let i = 0; i < 4; i++) {
            // Sıkıştır
            const row = this.grid[i].filter(cell => cell !== 0);
            
            // Birleştir
            for (let j = 0; j < row.length - 1; j++) {
                if (row[j] === row[j + 1]) {
                    row[j] *= 2;
                    this.score += row[j];
                    row.splice(j + 1, 1);
                }
            }
            
            // Doldur
            while (row.length < 4) {
                row.push(0);
            }
            
            // Değişiklik kontrolü
            if (!this.grid[i].every((val, idx) => val === row[idx])) {
                moved = true;
            }
            
            this.grid[i] = row;
        }
        
        return moved;
    }

    transpose() {
        return this.grid[0].map((_, colIndex) => this.grid.map(row => row[colIndex]));
    }

    checkGameOver() {
        // Boş hücre kontrolü
        for (let i = 0; i < 4; i++) {
            for (let j = 0; j < 4; j++) {
                if (this.grid[i][j] === 0) return false;
            }
        }
        
        // Birleştirilebilir komşu kontrolü
        for (let i = 0; i < 4; i++) {
            for (let j = 0; j < 4; j++) {
                const current = this.grid[i][j];
                
                // Sağ kontrol
                if (j < 3 && this.grid[i][j + 1] === current) return false;
                // Alt kontrol
                if (i < 3 && this.grid[i + 1][j] === current) return false;
            }
        }
        
        return true;
    }

    async endGame() {
        const scoreElement = document.getElementById('game2048Score');
        scoreElement.innerHTML = `Oyun Bitti! Puan: ${this.score} <button id="claim2048Score">💎 Puanı Al</button>`;
        
        // Puan kazanma butonu
        document.getElementById('claim2048Score')?.addEventListener('click', async () => {
            if (this.score > 0) {
                const userRef = doc(db, 'users', currentUser.uid);
                // Denge: 2048 puanları daha düşük çarpan
                const pointsEarned = Math.floor(this.score * 0.1); // %10'u kadar puan
                await updateDoc(userRef, { score: increment(pointsEarned) });
                showNotification(`🎉 2048 puanınız kazanıldı: +${pointsEarned} puan!`);
                
                // Oyunu resetle
                this.reset();
            }
        });
    }

    reset() {
        this.grid = Array(4).fill().map(() => Array(4).fill(0));
        this.score = 0;
        this.gameOver = false;
        this.init();
    }
}

function init2048Game() {
    game2048 = new Game2048();
    
    // Klavye kontrolleri
    document.addEventListener('keydown', handle2048KeyPress);
    
    // Mobil için dokunma kontrolleri
    setup2048TouchControls();
}

function handle2048KeyPress(e) {
    if (!game2048 || !document.getElementById('game2048Modal').style.display === 'flex') return;
    
    switch(e.key) {
        case 'ArrowLeft':
            game2048.move('left');
            break;
        case 'ArrowRight':
            game2048.move('right');
            break;
        case 'ArrowUp':
            game2048.move('up');
            break;
        case 'ArrowDown':
            game2048.move('down');
            break;
    }
}

function setup2048TouchControls() {
    let startX, startY;
    const board = document.getElementById('game2048Board');
    
    if (!board) return;
    
    board.addEventListener('touchstart', (e) => {
        startX = e.touches[0].clientX;
        startY = e.touches[0].clientY;
    });
    
    board.addEventListener('touchmove', (e) => {
        e.preventDefault();
    });
    
    board.addEventListener('touchend', (e) => {
        if (!startX || !startY || !game2048) return;
        
        const endX = e.changedTouches[0].clientX;
        const endY = e.changedTouches[0].clientY;
        const diffX = endX - startX;
        const diffY = endY - startY;
        
        if (Math.abs(diffX) > Math.abs(diffY)) {
            // Yatay hareket
            if (Math.abs(diffX) > 30) {
                game2048.move(diffX > 0 ? 'right' : 'left');
            }
        } else {
            // Dikey hareket
            if (Math.abs(diffY) > 30) {
                game2048.move(diffY > 0 ? 'down' : 'up');
            }
        }
        
        startX = null;
        startY = null;
    });
}

// ========================================
// IMPROVED CHESS BOT
// ========================================
class ImprovedChessGame {
    constructor(betAmount, difficulty) {
        this.betAmount = betAmount;
        this.difficulty = difficulty;
        this.board = this.initializeBoard();
        this.currentTurn = 'white';
        this.selectedSquare = null;
        this.gameOver = false;
        this.castlingRights = {
            white: { king: false, queen: false },
            black: { king: false, queen: false }
        };
        this.enPassantTarget = null;
        this.halfMoveClock = 0;
        this.fullMoveNumber = 1;
        this.moveHistory = [];
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
                this.makeMove(this.selectedSquare.row, this.selectedSquare.col, row, col);
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

    makeMove(fromRow, fromCol, toRow, toCol) {
        const piece = this.board[fromRow][fromCol];
        const capturedPiece = this.board[toRow][toCol];
        
        // Rok kontrolü
        if (piece === '♔' && Math.abs(toCol - fromCol) === 2) {
            if (toCol === 6) { // Kısa rok
                this.board[7][5] = this.board[7][7];
                this.board[7][7] = '';
            } else if (toCol === 2) { // Uzun rok
                this.board[7][3] = this.board[7][0];
                this.board[7][0] = '';
            }
            this.castlingRights.white = { king: false, queen: false };
        }
        
        if (piece === '♚' && Math.abs(toCol - fromCol) === 2) {
            if (toCol === 6) {
                this.board[0][5] = this.board[0][7];
                this.board[0][7] = '';
            } else if (toCol === 2) {
                this.board[0][3] = this.board[0][0];
                this.board[0][0] = '';
            }
            this.castlingRights.black = { king: false, queen: false };
        }

        // Geçerken alma
        if (piece === '♙' && this.enPassantTarget && toRow === this.enPassantTarget.row && toCol === this.enPassantTarget.col) {
            this.board[toRow + 1][toCol] = '';
        }
        if (piece === '♟' && this.enPassantTarget && toRow === this.enPassantTarget.row && toCol === this.enPassantTarget.col) {
            this.board[toRow - 1][toCol] = '';
        }

        // Geçerken alma hedefini güncelle
        this.enPassantTarget = null;
        if (piece === '♙' && fromRow === 6 && toRow === 4) {
            this.enPassantTarget = { row: 5, col: fromCol };
        }
        if (piece === '♟' && fromRow === 1 && toRow === 3) {
            this.enPassantTarget = { row: 2, col: fromCol };
        }

        // Rok haklarını güncelle
        if (piece === '♖') {
            if (fromRow === 7 && fromCol === 0) this.castlingRights.white.queen = false;
            if (fromRow === 7 && fromCol === 7) this.castlingRights.white.king = false;
        }
        if (piece === '♜') {
            if (fromRow === 0 && fromCol === 0) this.castlingRights.black.queen = false;
            if (fromRow === 0 && fromCol === 7) this.castlingRights.black.king = false;
        }
        if (piece === '♔') {
            this.castlingRights.white = { king: false, queen: false };
        }
        if (piece === '♚') {
            this.castlingRights.black = { king: false, queen: false };
        }

        // Taşı hareket ettir
        this.board[toRow][toCol] = piece;
        this.board[fromRow][fromCol] = '';

        // Piyon terfisi
        if (piece === '♙' && toRow === 0) this.board[toRow][toCol] = '♕';
        if (piece === '♟' && toRow === 7) this.board[toRow][toCol] = '♛';

        // Hamle geçmişine ekle
        this.moveHistory.push({
            from: { row: fromRow, col: fromCol },
            to: { row: toRow, col: toCol },
            piece: piece,
            captured: capturedPiece
        });

        this.halfMoveClock = (piece === '♙' || piece === '♟' || capturedPiece) ? 0 : this.halfMoveClock + 1;
        
        if (this.currentTurn === 'black') {
            this.fullMoveNumber++;
        }
    }

    botMove() {
        const depthMap = { easy: 1, medium: 2, hard: 3, master: 4 };
        const depth = depthMap[this.difficulty] || 2;
        const bestMove = this.minimax(depth, -Infinity, Infinity, true);

        if (bestMove.move) {
            this.makeMove(bestMove.move.from.row, bestMove.move.from.col, bestMove.move.to.row, bestMove.to.col);
            this.currentTurn = 'white';
            this.render();

            if (this.isCheckmate('white')) this.endGame(false);
            else if (this.isStalemate('white')) this.endGame(false, true);
        }
    }

    minimax(depth, alpha, beta, maximizingPlayer) {
        if (depth === 0) return { score: this.evaluateBoard() };

        const moves = this.getAllValidMoves(maximizingPlayer ? 'black' : 'white');
        if (moves.length === 0) {
            if (this.isCheckmate(maximizingPlayer ? 'black' : 'white')) {
                return { score: maximizingPlayer ? -10000 : 10000 };
            }
            return { score: 0 };
        }

        if (maximizingPlayer) {
            let maxEval = -Infinity;
            let bestMove = null;
            
            for (const move of moves) {
                const tempBoard = this.board.map(row => [...row]);
                const tempEnPassant = this.enPassantTarget;
                const tempCastling = JSON.parse(JSON.stringify(this.castlingRights));
                
                this.makeMove(move.from.row, move.from.col, move.to.row, move.to.col);
                const ev = this.minimax(depth - 1, alpha, beta, false).score;
                
                // Geri al
                this.board = tempBoard;
                this.enPassantTarget = tempEnPassant;
                this.castlingRights = tempCastling;
                this.moveHistory.pop();
                this.currentTurn = 'white';
                
                if (ev > maxEval) {
                    maxEval = ev;
                    bestMove = move;
                }
                alpha = Math.max(alpha, ev);
                if (beta <= alpha) break;
            }
            return { score: maxEval, move: bestMove };
        } else {
            let minEval = Infinity;
            let bestMove = null;
            
            for (const move of moves) {
                const tempBoard = this.board.map(row => [...row]);
                const tempEnPassant = this.enPassantTarget;
                const tempCastling = JSON.parse(JSON.stringify(this.castlingRights));
                
                this.makeMove(move.from.row, move.from.col, move.to.row, move.to.col);
                const ev = this.minimax(depth - 1, alpha, beta, true).score;
                
                // Geri al
                this.board = tempBoard;
                this.enPassantTarget = tempEnPassant;
                this.castlingRights = tempCastling;
                this.moveHistory.pop();
                this.currentTurn = 'black';
                
                if (ev < minEval) {
                    minEval = ev;
                    bestMove = move;
                }
                beta = Math.min(beta, ev);
                if (beta <= alpha) break;
            }
            return { score: minEval, move: bestMove };
        }
    }

    getAllValidMoves(color) {
        const moves = [];
        for (let r = 0; r < 8; r++) {
            for (let c = 0; c < 8; c++) {
                const piece = this.board[r][c];
                if (!piece) continue;
                const isPieceBlack = this.isBlackPiece(piece);
                if ((color === 'black' && !isPieceBlack) || (color === 'white' && isPieceBlack)) continue;
                
                const validMoves = this.getValidMoves(r, c);
                validMoves.forEach(move => {
                    moves.push({ from: { row: r, col: c }, to: move });
                });
            }
        }
        return moves;
    }

    // ... (Diğer satranç metodları aynı kalacak, sadece bot geliştirildi)

    evaluateBoard() {
        const pieceValues = {
            '♙': 100, '♘': 320, '♗': 330, '♖': 500, '♕': 900, '♔': 20000,
            '♟': -100, '♞': -320, '♝': -330, '♜': -500, '♛': -900, '♚': -20000
        };

        let score = 0;
        
        // Parça değerleri
        for (let r = 0; r < 8; r++) {
            for (let c = 0; c < 8; c++) {
                const piece = this.board[r][c];
                if (piece) {
                    score += pieceValues[piece] || 0;
                    
                    // Pozisyon bonusları
                    if (this.isWhitePiece(piece)) {
                        score += this.getPositionBonus(piece, r, c, true);
                    } else {
                        score -= this.getPositionBonus(piece, r, c, false);
                    }
                }
            }
        }
        
        // Merkez kontrolü bonusu
        score += this.controlCenterBonus();
        
        // Rok bonusu
        if (this.castlingRights.white.king || this.castlingRights.white.queen) score += 50;
        if (this.castlingRights.black.king || this.castlingRights.black.queen) score -= 50;
        
        return score;
    }

    getPositionBonus(piece, row, col, isWhite) {
        const pawnTable = [
            [0, 0, 0, 0, 0, 0, 0, 0],
            [50, 50, 50, 50, 50, 50, 50, 50],
            [10, 10, 20, 30, 30, 20, 10, 10],
            [5, 5, 10, 25, 25, 10, 5, 5],
            [0, 0, 0, 20, 20, 0, 0, 0],
            [5, -5, -10, 0, 0, -10, -5, 5],
            [5, 10, 10, -20, -20, 10, 10, 5],
            [0, 0, 0, 0, 0, 0, 0, 0]
        ];
        
        const knightTable = [
            [-50, -40, -30, -30, -30, -30, -40, -50],
            [-40, -20, 0, 0, 0, 0, -20, -40],
            [-30, 0, 10, 15, 15, 10, 0, -30],
            [-30, 5, 15, 20, 20, 15, 5, -30],
            [-30, 0, 15, 20, 20, 15, 0, -30],
            [-30, 5, 10, 15, 15, 10, 5, -30],
            [-40, -20, 0, 5, 5, 0, -20, -40],
            [-50, -40, -30, -30, -30, -30, -40, -50]
        ];
        
        let table;
        if (piece === '♙' || piece === '♟') table = pawnTable;
        else if (piece === '♘' || piece === '♞') table = knightTable;
        else return 0;
        
        const r = isWhite ? 7 - row : row;
        return table[r][col];
    }

    controlCenterBonus() {
        let bonus = 0;
        const center = [[3,3], [3,4], [4,3], [4,4]];
        
        center.forEach(([r, c]) => {
            const piece = this.board[r][c];
            if (piece) {
                if (this.isWhitePiece(piece)) bonus += 10;
                else bonus -= 10;
            }
        });
        
        return bonus;
    }
}

// Satranç kartı event listener'ı
document.getElementById('chessCard').addEventListener('click', () => {
    document.getElementById('chessModal').style.display = 'flex';
    document.getElementById('chessStartBtn').style.display = 'block';
    document.getElementById('chessBetAmount').disabled = false;
    document.getElementById('chessDifficulty').disabled = false;
    document.getElementById('chessStatus').textContent = 'Oyunu Başlat';
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

    chessGame = new ImprovedChessGame(betAmount, difficulty);
    chessGame.render();
});

// ========================================
// VS LOBBY SYSTEM
// ========================================
function setupVsLobbyListeners() {
    const vsCards = ['vsCoinCard', 'vsRpsCard', 'vsChessCard', 'vs2048Card'];
    
    vsCards.forEach((id, idx) => {
        const card = document.getElementById(id);
        if (!card) return;
        
        card.addEventListener('click', () => {
            const modes = ['coin', 'rps', 'chess', '2048'];
            const mode = modes[idx];
            openVsLobby(mode);
        });
    });

    // VS lobi içindeki tab butonları
    document.querySelectorAll('.vs-tab-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.vs-tab-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            const tab = btn.dataset.vsTab;
            
            document.getElementById('vsLobbyFind').style.display = tab === 'find' ? 'block' : 'none';
            document.getElementById('vsLobbyRank').style.display = tab === 'rank' ? 'block' : 'none';
            document.getElementById('vsLobbyHistory').style.display = tab === 'history' ? 'block' : 'none';
            
            if (tab === 'rank') loadVsRankings();
            if (tab === 'history') loadVsHistory();
        });
    });

    // VS ara butonu
    document.getElementById('vsFindBtn')?.addEventListener('click', async () => {
        const mode = document.getElementById('vsLobbyModal').dataset.vsMode;
        const bet = parseInt(document.getElementById('vsBetAmount')?.value || 10);
        
        await findVsMatch(mode, bet);
    });

    // VS lobi mesaj gönderme
    const sendBtn = document.getElementById('vsLobbySend');
    const input = document.getElementById('vsLobbyInput');
    
    if (sendBtn && input) {
        sendBtn.addEventListener('click', () => {
            const msg = input.value.trim();
            if (!msg) return;
            
            const username = document.getElementById('headerUsername')?.textContent || 'Oyuncu';
            sendVsLobbyMessage(msg, username);
            input.value = '';
        });
        
        input.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                const msg = input.value.trim();
                if (!msg) return;
                
                const username = document.getElementById('headerUsername')?.textContent || 'Oyuncu';
                sendVsLobbyMessage(msg, username);
                input.value = '';
            }
        });
    }
}

function openVsLobby(mode) {
    const modal = document.getElementById('vsLobbyModal');
    if (!modal) return;
    
    modal.style.display = 'flex';
    modal.dataset.vsMode = mode;
    
    const titles = {
        'coin': '🪙 Yazı Tura VS',
        'rps': '✊ Taş-Kağıt-Makas VS',
        'chess': '♟️ Satranç VS',
        '2048': '🔢 2048 VS'
    };
    
    document.getElementById('vsLobbyTitle').textContent = titles[mode] || '⚔️ VS Lobi';
    
    // Lobi kullanıcılarını yükle
    loadVsLobbyUsers();
    
    // Lobi mesajlarını dinle
    listenVsLobbyMessages();
}

async function loadVsLobbyUsers() {
    const listEl = document.getElementById('vsLobbyUsers');
    if (!listEl) return;
    
    listEl.innerHTML = '<div class="loading">Kullanıcılar yükleniyor...</div>';
    
    const presenceRef = ref(rtdb, 'presence');
    onValue(presenceRef, async (snapshot) => {
        const presenceData = snapshot.val() || {};
        const usersSnapshot = await getDocs(collection(db, 'users'));
        
        vsLobbyUsers = [];
        listEl.innerHTML = '';
        
        usersSnapshot.forEach(docSnap => {
            if (docSnap.id === currentUser.uid) return;
            
            const userData = docSnap.data();
            const presence = presenceData[docSnap.id];
            const isOnline = presence && presence.online;
            
            if (isOnline) {
                vsLobbyUsers.push({
                    id: docSnap.id,
                    username: userData.username,
                    profileImage: userData.profileImage,
                    score: userData.score
                });
                
                const item = document.createElement('div');
                item.className = 'vs-lobby-user';
                item.innerHTML = `
                    <div class="vs-user-avatar">
                        ${userData.profileImage ? `<img src="${userData.profileImage}" alt="">` : '👤'}
                    </div>
                    <div class="vs-user-info">
                        <div class="vs-user-name">${userData.username}</div>
                        <div class="vs-user-score">💎 ${userData.score}</div>
                    </div>
                    <button class="vs-challenge-btn" data-user-id="${docSnap.id}" data-username="${userData.username}">
                        ⚔️ Meydan Oku
                    </button>
                `;
                
                listEl.appendChild(item);
            }
        });
        
        // Meydan okuma butonlarına event ekle
        document.querySelectorAll('.vs-challenge-btn').forEach(btn => {
            btn.addEventListener('click', async () => {
                const userId = btn.dataset.userId;
                const username = btn.dataset.username;
                const mode = document.getElementById('vsLobbyModal').dataset.vsMode;
                
                await sendVsChallenge(userId, username, mode);
            });
        });
        
        if (vsLobbyUsers.length === 0) {
            listEl.innerHTML = '<div class="search-placeholder">Online kullanıcı bulunamadı</div>';
        }
    });
}

async function findVsMatch(mode, bet) {
    const userRef = doc(db, 'users', currentUser.uid);
    const userSnap = await getDoc(userRef);
    
    if (userSnap.data().score < bet) {
        alert('Yetersiz bakiye.');
        return;
    }
    
    const lobbyRef = collection(db, 'vsLobby');
    const q = query(
        lobbyRef, 
        where('mode', '==', mode), 
        where('bet', '==', bet), 
        where('hostId', '!=', currentUser.uid),
        where('status', '==', 'waiting'),
        limit(1)
    );
    
    const snap = await getDocs(q);
    
    if (!snap.empty) {
        const lobbyDoc = snap.docs[0];
        const userData = userSnap.data();
        
        await runTransaction(db, async (tx) => {
            const snap2 = await tx.get(lobbyDoc.ref);
            if (snap2.data().status !== 'waiting') throw new Error('already matched');
            
            tx.update(lobbyDoc.ref, { 
                opponentId: currentUser.uid, 
                opponentName: userData.username,
                status: 'matched',
                matchedAt: serverTimestamp()
            });
        });
        
        showNotification('Eşleşme bulundu! Maç başlıyor.');
        startVsMatch(mode, bet, lobbyDoc.id);
        
    } else {
        // Yeni lobi oluştur
        const userData = userSnap.data();
        await addDoc(lobbyRef, { 
            hostId: currentUser.uid, 
            hostName: userData.username, 
            mode, 
            bet, 
            status: 'waiting', 
            createdAt: serverTimestamp() 
        });
        
        document.getElementById('vsLobbyMessages').innerHTML = 
            '<div class="chat-welcome">Eşleşme aranıyor... Başka bir oyuncu katılsın.</div>';
    }
}

async function sendVsChallenge(userId, username, mode) {
    const bet = parseInt(document.getElementById('vsBetAmount')?.value || 10);
    
    // Önce kendi bakiyesini kontrol et
    const userRef = doc(db, 'users', currentUser.uid);
    const userSnap = await getDoc(userRef);
    
    if (userSnap.data().score < bet) {
        alert('Yetersiz bakiye.');
        return;
    }
    
    // Karşı tarafa DM gönder
    const conversationId = [currentUser.uid, userId].sort().join('_');
    const messagesRef = collection(db, 'dm', conversationId, 'messages');
    
    const userData = userSnap.data();
    await addDoc(messagesRef, {
        senderId: currentUser.uid,
        username: userData.username,
        message: `⚔️ ${mode.toUpperCase()} VS maçı teklifi! Bahis: ${bet} 💎. Kabul ediyor musun?`,
        timestamp: serverTimestamp(),
        isVsChallenge: true,
        mode: mode,
        bet: bet
    });
    
    showNotification(`${username}'a VS daveti gönderildi!`);
}

function listenVsLobbyMessages() {
    const messagesEl = document.getElementById('vsLobbyMessages');
    if (!messagesEl) return;
    
    messagesEl.innerHTML = '';
    
    const messagesRef = collection(db, 'vsLobbyChat');
    const q = query(messagesRef, orderBy('timestamp', 'desc'), limit(20));
    
    onSnapshot(q, (snapshot) => {
        messagesEl.innerHTML = '';
        
        const messages = [];
        snapshot.forEach(doc => {
            messages.push({ id: doc.id, ...doc.data() });
        });
        
        messages.reverse().forEach(msg => {
            const msgEl = document.createElement('div');
            msgEl.className = 'vs-lobby-message';
            msgEl.innerHTML = `
                <strong>${msg.username}:</strong> ${msg.message}
            `;
            messagesEl.appendChild(msgEl);
        });
        
        messagesEl.scrollTop = messagesEl.scrollHeight;
    });
}

async function sendVsLobbyMessage(message, username) {
    await addDoc(collection(db, 'vsLobbyChat'), {
        userId: currentUser.uid,
        username: username,
        message: message,
        timestamp: serverTimestamp()
    });
}

async function loadVsRankings() {
    const list = document.getElementById('vsRankList');
    if (!list) return;
    
    list.innerHTML = '<div class="loading">Yükleniyor...</div>';
    
    const snap = await getDocs(
        query(collection(db, 'users'), orderBy('vsWins', 'desc'), limit(20))
    );
    
    list.innerHTML = '';
    let rank = 1;
    
    snap.forEach(d => {
        const data = d.data();
        const div = document.createElement('div');
        div.className = 'vs-rank-item';
        div.innerHTML = `
            <div class="vs-rank-number">#${rank}</div>
            <div class="vs-rank-name">${data.username || 'Oyuncu'}</div>
            <div class="vs-rank-stats">${data.vsWins || 0}G / ${data.vsLosses || 0}K</div>
        `;
        list.appendChild(div);
        rank++;
    });
    
    if (snap.empty) {
        list.innerHTML = '<div class="search-placeholder">Henüz VS sıralama yok.</div>';
    }
}

async function loadVsHistory() {
    const list = document.getElementById('vsHistoryList');
    if (!list) return;
    
    list.innerHTML = '<div class="loading">Yükleniyor...</div>';
    
    const snap = await getDocs(
        query(
            collection(db, 'vsMatches'),
            where('playerIds', 'array-contains', currentUser.uid),
            orderBy('createdAt', 'desc'),
            limit(20)
        )
    );
    
    list.innerHTML = '';
    
    snap.forEach(d => {
        const data = d.data();
        const div = document.createElement('div');
        div.className = 'vs-history-item';
        
        const won = data.winnerId === currentUser.uid;
        const isDraw = data.result === 'draw';
        
        let resultText = '';
        if (isDraw) resultText = '🤝 Berabere';
        else if (won) resultText = '✅ Kazandın';
        else resultText = '❌ Kaybettin';
        
        div.innerHTML = `
            <div class="vs-history-mode">${data.mode || '?'}</div>
            <div class="vs-history-result">${resultText}</div>
            <div class="vs-history-bet">${data.bet || 0} 💎</div>
        `;
        list.appendChild(div);
    });
    
    if (snap.empty) {
        list.innerHTML = '<div class="search-placeholder">Henüz VS maçı yok.</div>';
    }
}

// ========================================
// WHEEL FIX with EXACT SEGMENT REWARD
// ========================================
const WHEEL_SEGMENTS_FIXED = [
    { label: 'x0', mult: 0, color: '#FF6B6B' },
    { label: 'x1', mult: 1, color: '#4ECDC4' },
    { label: 'x1.5', mult: 1.5, color: '#45B7D1' },
    { label: 'x2', mult: 2, color: '#FFA07A' },
    { label: 'x3', mult: 3, color: '#98D8C8' },
    { label: 'x5', mult: 5, color: '#F7DC6F' },
    { label: 'x10', mult: 10, color: '#BB8FCE' },
    { label: 'x2', mult: 2, color: '#85C1E2' }
];

function drawWheelFixed() {
    const canvas = document.getElementById('wheelCanvas');
    if (!canvas) return;
    
    const ctx = canvas.getContext('2d');
    canvas.style.transform = 'rotate(0deg)';
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    const segments = WHEEL_SEGMENTS_FIXED.length;
    const centerX = canvas.width / 2;
    const centerY = canvas.height / 2;
    const radius = 140;
    const anglePerSegment = (2 * Math.PI) / segments;

    for (let i = 0; i < segments; i++) {
        ctx.beginPath();
        ctx.moveTo(centerX, centerY);
        ctx.arc(centerX, centerY, radius, i * anglePerSegment, (i + 1) * anglePerSegment);
        ctx.closePath();
        ctx.fillStyle = WHEEL_SEGMENTS_FIXED[i].color;
        ctx.fill();
        ctx.stroke();
        
        ctx.save();
        ctx.translate(centerX, centerY);
        ctx.rotate(i * anglePerSegment + anglePerSegment / 2);
        ctx.textAlign = 'center';
        ctx.fillStyle = '#fff';
        ctx.font = 'bold 18px Arial';
        ctx.fillText(WHEEL_SEGMENTS_FIXED[i].label, radius / 1.5, 8);
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

    // Önce bahsi kes
    await updateDoc(userRef, { score: increment(-betAmount) });

    // Rastgele segment seç (FIXED: Sadece bir segment kazanılacak)
    const segmentIndex = Math.floor(Math.random() * WHEEL_SEGMENTS_FIXED.length);
    const seg = WHEEL_SEGMENTS_FIXED[segmentIndex];
    const resultMult = seg.mult;

    const canvas = document.getElementById('wheelCanvas');
    const anglePerSeg = (2 * Math.PI) / WHEEL_SEGMENTS_FIXED.length;
    
    // Segmentin tam ortasına gelecek şekilde hesapla
    const targetRotation = 360 * 5 + (segmentIndex * (360 / WHEEL_SEGMENTS_FIXED.length)) + (360 / WHEEL_SEGMENTS_FIXED.length / 2);
    const spinTime = 3000;
    const startTime = Date.now();

    const spin = setInterval(() => {
        const elapsed = Date.now() - startTime;
        const progress = Math.min(elapsed / spinTime, 1);
        
        // Yavaşlama efekti için easing fonksiyonu
        const easeOut = 1 - Math.pow(1 - progress, 3);
        const rotation = easeOut * targetRotation;
        
        canvas.style.transform = `rotate(${rotation}deg)`;

        if (progress >= 1) {
            clearInterval(spin);
            
            // FIXED: Tam olarak durduğu dilimin ödülünü ver
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

// ========================================
// UTILITY FUNCTIONS
// ========================================
function showNotification(message, type = 'info') {
    // Mevcut bildirimleri temizle
    const oldNotification = document.querySelector('.notification');
    if (oldNotification) oldNotification.remove();

    const notification = document.createElement('div');
    notification.className = `notification notification-${type}`;
    notification.textContent = message;
    notification.style.cssText = `
        position: fixed;
        top: 20px;
        right: 20px;
        padding: 12px 20px;
        background: ${type === 'success' ? 'var(--success-color)' : type === 'error' ? 'var(--error-color)' : 'var(--accent-color)'};
        color: white;
        border-radius: 8px;
        z-index: 9999;
        font-weight: 600;
        box-shadow: 0 4px 12px rgba(0,0,0,0.2);
        animation: slideInRight 0.3s ease;
    `;

    document.body.appendChild(notification);

    setTimeout(() => {
        notification.style.animation = 'slideOutRight 0.3s ease';
        setTimeout(() => notification.remove(), 300);
    }, 3000);
}

// Animasyon için CSS ekle
const style = document.createElement('style');
style.textContent = `
    @keyframes slideInRight {
        from { transform: translateX(100%); opacity: 0; }
        to { transform: translateX(0); opacity: 1; }
    }
    @keyframes slideOutRight {
        from { transform: translateX(0); opacity: 1; }
        to { transform: translateX(100%); opacity: 0; }
    }
`;
document.head.appendChild(style);

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

function updateWheelPrizePrediction() {
    const el = document.getElementById('wheelPrizeText');
    if (!el) return;
    const bet = parseInt(document.getElementById('wheelBetAmount')?.value || 10);
    const idx = Math.floor(Math.random() * WHEEL_SEGMENTS_FIXED.length);
    const seg = WHEEL_SEGMENTS_FIXED[idx];
    const win = seg.mult > 0 ? Math.floor(bet * seg.mult * userMultiplier) : 0;
    el.textContent = seg.mult > 0 ? `±${win} puan (${seg.label})` : 'Kayıp';
}

// ========================================
// INIT ENHANCEMENTS
// ========================================
function initEnhancements() {
    updateWheelPrizePrediction();
    drawWheelFixed();
    setupVsLobbyListeners();
    setupAdminDashboardAndAnalytics();
    setupDmListener();
    
    // Wheel modal açıldığında güncelle
    document.getElementById('spinWheelModal')?.addEventListener('click', () => {
        if (document.getElementById('spinWheelModal').style.display === 'flex') {
            updateWheelPrizePrediction();
        }
    });
    
    // Wheel bet değiştiğinde güncelle
    document.getElementById('wheelBetAmount')?.addEventListener('input', updateWheelPrizePrediction);
}

function setupAdminDashboardAndAnalytics() {
    // Admin dashboard ve analytics kodları
    window.loadAdminDashboard = async function() {
        const configRef = doc(db, 'config', 'featureToggles');
        const listEl = document.getElementById('adminFeatureToggleList');
        if (!listEl) return;

        listEl.innerHTML = '<div class="loading">Yükleniyor...</div>';
        const snap = await getDoc(configRef);
        const data = snap.exists() ? snap.data() : { 
            vsMode: true, 
            dailyBox: true, 
            epicBox: true, 
            legendaryBox: true,
            chatEnabled: true,
            gamesEnabled: true,
            marketEnabled: true
        };
        
        listEl.innerHTML = '';
        
        const features = [
            { key: 'vsMode', label: 'VS Modu' },
            { key: 'dailyBox', label: 'Günlük Kutu' },
            { key: 'epicBox', label: 'Epic Kutu' },
            { key: 'legendaryBox', label: 'Legendary Kutu' },
            { key: 'chatEnabled', label: 'Chat Sistemi' },
            { key: 'gamesEnabled', label: 'Oyunlar' },
            { key: 'marketEnabled', label: 'Market' }
        ];
        
        features.forEach(feature => {
            const div = document.createElement('div');
            div.className = 'feature-toggle-item';
            div.innerHTML = `
                <span>${feature.label}</span>
                <label class="feature-toggle-switch">
                    <input type="checkbox" ${data[feature.key] !== false ? 'checked' : ''} data-feature="${feature.key}">
                    <span class="feature-toggle-slider"></span>
                </label>
            `;
            
            div.querySelector('input').addEventListener('change', async (e) => {
                await setDoc(configRef, { [feature.key]: e.target.checked }, { merge: true });
                showNotification(`${feature.label} ${e.target.checked ? 'açıldı' : 'kapatıldı'}`);
            });
            
            listEl.appendChild(div);
        });
    };

    window.loadAdminAnalytics = async function() {
        const statsEl = document.getElementById('adminAnalyticsStats');
        if (!statsEl) return;
        
        statsEl.innerHTML = '<div class="loading">Yükleniyor...</div>';
        
        const usersSnap = await getDocs(collection(db, 'users'));
        let totalScore = 0;
        let totalVsWins = 0;
        let totalVsLosses = 0;
        
        usersSnap.forEach(d => { 
            totalScore += d.data().score || 0;
            totalVsWins += d.data().vsWins || 0;
            totalVsLosses += d.data().vsLosses || 0;
        });
        
        const chatSnap = await getDocs(query(collection(db, 'chat'), limit(1000)));
        const totalMessages = chatSnap.size;
        
        statsEl.innerHTML = `
            <div class="analytics-grid">
                <div class="stat-card">
                    <div class="stat-value">${usersSnap.size}</div>
                    <div class="stat-label">Toplam kullanıcı</div>
                </div>
                <div class="stat-card">
                    <div class="stat-value">${totalScore}</div>
                    <div class="stat-label">Toplam puan</div>
                </div>
                <div class="stat-card">
                    <div class="stat-value">${totalMessages}</div>
                    <div class="stat-label">Chat mesajı</div>
                </div>
                <div class="stat-card">
                    <div class="stat-value">${totalVsWins}/${totalVsLosses}</div>
                    <div class="stat-label">VS Galibiyet/Mağlubiyet</div>
                </div>
            </div>
        `;
    };
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

// DOM yüklendiğinde VS butonunu ekle
document.addEventListener('DOMContentLoaded', () => {
    addVsInviteButton();
});
