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
let isUserAdmin = false;
let chatUnsubscribe = null;

// ========================================
// AUTH & USER MANAGEMENT
// ========================================
onAuthStateChanged(auth, async (user) => {
    // New Discord-like Ids
    const authOverlay = document.getElementById('auth-overlay');
    const appDashboard = document.getElementById('app-dashboard');
    const bootScreen = document.getElementById('boot-screen');

    if (user) {
        // Logged In
        currentUser = user;

        // Ensure boot screen is gone
        if (bootScreen) {
            bootScreen.style.opacity = '0';
            setTimeout(() => bootScreen.style.display = 'none', 500);
        }

        // Hide Auth, Show App
        if (authOverlay) authOverlay.classList.add('hidden');
        if (appDashboard) appDashboard.classList.remove('hidden');

        await initializeUser(user);
        loadUserData();
        setupPresence(user.uid);

        // Load Chat
        loadChat();
    } else {
        // Logged Out
        if (authOverlay) authOverlay.classList.remove('hidden');
        if (appDashboard) appDashboard.classList.add('hidden');
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
            profileImage: 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="150" height="150"%3E%3Crect width="150" height="150" fill="%23444"/%3E%3C/svg%3E',
            multiplier: 1,
            banned: false,
            muted: false,
            muteUntil: null
        });
    }

    // Check admin/founder status
    const userData = (await getDoc(userRef)).data();

    // 300 IQ Logic: Normalize Role
    const roleRaw = userData.role || 'user';
    isUserAdmin = roleRaw === 'admin' || roleRaw === 'founder' || roleRaw === 'KURUCU';

    const navAdmin = document.getElementById('navAdmin');
    if (isUserAdmin && navAdmin) {
        navAdmin.style.display = 'flex';
        // Global admin items if any
        document.querySelectorAll('.admin-only').forEach(el => el.classList.remove('hidden'));
    }
}

// ... (existing helper functions)

// Load Users for Admin (Updated for Founder)
async function loadAdminUsers() {
    const listEl = document.getElementById('adminUserList');
    listEl.innerHTML = '<div class="loading">Yükleniyor...</div>';

    const usersQuery = query(collection(db, 'users'), orderBy('score', 'desc'));
    const snapshot = await getDocs(usersQuery);

    // Get current user role for comparison
    const currentUserRef = doc(db, 'users', currentUser.uid);
    const currentUserSnap = await getDoc(currentUserRef);
    const currentUserRole = currentUserSnap.data().role;

    listEl.innerHTML = '';
    snapshot.forEach(docSnap => {
        const data = docSnap.data();
        const role = data.role || 'user';

        const item = document.createElement('div');
        item.className = 'admin-user-item';
        // Add special styling if founder
        if (role === 'KURUCU') {
            item.style.borderLeft = '4px solid var(--founder-color)';
            item.style.background = 'linear-gradient(90deg, rgba(139, 92, 246, 0.05) 0%, transparent 100%)';
        }

        item.innerHTML = `
            <div class="admin-user-info-section">
                <div class="user-avatar">
                    ${data.profileImage ? `<img src="${data.profileImage}" alt="">` : '👤'}
                </div>
                <div class="admin-user-details">
                    <div class="admin-user-name">
                        ${data.username}
                        ${role === 'KURUCU' ? '<span style="font-size:12px; margin-left:5px">👑</span>' : ''}
                    </div>
                    <div class="admin-user-email">${data.email}</div>
                    <div class="admin-user-score">💎 ${data.score}</div>
                    <div class="admin-user-badges">
                        ${role === 'KURUCU' ? '<span class="admin-badge founder">KURUCU</span>' : ''}
                        ${role === 'admin' ? '<span class="admin-badge admin">Admin</span>' : ''}
                        ${data.banned ? '<span class="admin-badge banned">Banned</span>' : ''}
                        ${data.muted ? '<span class="admin-badge muted">Muted</span>' : ''}
                    </div>
                </div>
            </div>
            <div class="admin-user-actions">
                <button class="admin-action-quick-btn" onclick="openAdminAction('${docSnap.id}', '${data.username}', ${data.banned}, ${data.muted}, '${role}')">
                    ⚙️ İşlemler
                </button>
            </div>
        `;
        listEl.appendChild(item);
    });
}
window.loadAdminUsers = loadAdminUsers; // Make it global for search

// Admin Search (Updated for Founder)
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
        const role = data.role || 'user';

        if (data.username.toLowerCase().includes(searchTerm) || data.email.toLowerCase().includes(searchTerm)) {
            const item = document.createElement('div');
            item.className = 'admin-user-item';
            if (role === 'KURUCU') {
                item.style.borderLeft = '4px solid var(--founder-color)';
                item.style.background = 'linear-gradient(90deg, rgba(139, 92, 246, 0.05) 0%, transparent 100%)';
            }

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
                            ${role === 'KURUCU' ? '<span class="admin-badge founder">KURUCU</span>' : ''}
                            ${role === 'admin' ? '<span class="admin-badge admin">Admin</span>' : ''}
                            ${data.banned ? '<span class="admin-badge banned">Banned</span>' : ''}
                            ${data.muted ? '<span class="admin-badge muted">Muted</span>' : ''}
                        </div>
                    </div>
                </div>
                <div class="admin-user-actions">
                    <button class="admin-action-quick-btn" onclick="openAdminAction('${docSnap.id}', '${data.username}', ${data.banned}, ${data.muted}, '${role}')">
                        ⚙️ İşlemler
                    </button>
                </div>
            `;
            listEl.appendChild(item);
        }
    });
});

// Admin Actions (Hierarchy Logic)
window.openAdminAction = async (uid, username, isBanned, isMuted, targetRole) => {
    // Get current user role
    const currentUserSnap = await getDoc(doc(db, 'users', currentUser.uid));
    const myRole = currentUserSnap.data().role;
    const isMeFounder = myRole === 'KURUCU';

    // Hiyerarşi Kontrolü:
    // 1. Founder'a kimse işlem yapamaz (kendisi hariç, o da UI'da disabled olabilir ama burada logic önemli).
    // 2. Admin, başka bir Admin'e işlem yapamaz.
    // 3. User'a herkes işlem yapabilir.

    let canAct = false;

    if (uid === currentUser.uid) {
        // Kendine işlem
        alert("Kendine işlem yapamazsın!");
        return;
    }

    if (isMeFounder) {
        // Founder herkese işlem yapabilir (başka founder varsa o hariç, ama tek founder varsayıyoruz şimdilik veya eşitler)
        canAct = true;
    } else {
        // Admins
        if (targetRole === 'admin' || targetRole === 'KURUCU') {
            alert("Yetkiniz bu kullanıcıyı yönetmeye yetmiyor! (Admin/Founder koruması)");
            return;
        }
        canAct = true;
    }

    if (!canAct) return;

    document.getElementById('adminActionModal').style.display = 'flex';
    document.getElementById('actionUserName').textContent = username + (targetRole === 'KURUCU' ? ' (Kurucu)' : (targetRole === 'admin' ? ' (Admin)' : ''));
    document.getElementById('adminActionModal').dataset.uid = uid;

    // Show/hide permission based buttons
    document.getElementById('banUserBtn').style.display = isBanned ? 'none' : 'block';
    document.getElementById('unbanUserBtn').style.display = isBanned ? 'block' : 'none';
    document.getElementById('muteUserBtn').style.display = isMuted ? 'none' : 'block';
    document.getElementById('unmuteUserBtn').style.display = isMuted ? 'block' : 'none';

    // Founder Options Visibility
    if (isMeFounder) {
        document.getElementById('founderOptions').style.display = 'block';
        document.getElementById('userRoleSelect').value = targetRole || 'user';
    } else {
        document.getElementById('founderOptions').style.display = 'none';
    }

    // Hide sub-options
    document.getElementById('muteOptions').style.display = 'none';
    document.getElementById('passwordResetOptions').style.display = 'none';
    document.getElementById('adminActionMessage').textContent = '';
};

// Founder: Update Role
document.getElementById('updateRoleBtn').addEventListener('click', async () => {
    const uid = document.getElementById('adminActionModal').dataset.uid;
    const newRole = document.getElementById('userRoleSelect').value;
    const messageEl = document.getElementById('adminActionMessage');

    try {
        await updateDoc(doc(db, 'users', uid), { role: newRole });
        messageEl.className = 'admin-message success';
        messageEl.textContent = `✅ Rol güncellendi: ${newRole.toUpperCase()}`;

        // Refresh list
        setTimeout(() => {
            loadAdminUsers();
        }, 1000);
    } catch (error) {
        messageEl.className = 'admin-message error';
        messageEl.textContent = error.message;
    }
});

// Founder: Update Score
document.getElementById('updateScoreBtn').addEventListener('click', async () => {
    const uid = document.getElementById('adminActionModal').dataset.uid;
    const amount = parseInt(document.getElementById('scoreAmount').value);
    const messageEl = document.getElementById('adminActionMessage');

    if (isNaN(amount) || amount === 0) {
        messageEl.className = 'admin-message error';
        messageEl.textContent = 'Geçerli bir miktar girin';
        return;
    }

    try {
        await updateDoc(doc(db, 'users', uid), {
            score: increment(amount)
        });
        messageEl.className = 'admin-message success';
        messageEl.textContent = `✅ Puan güncellendi: ${amount > 0 ? '+' : ''}${amount}`;

        // Refresh list
        setTimeout(() => {
            loadAdminUsers();
        }, 1000);
    } catch (error) {
        messageEl.className = 'admin-message error';
        messageEl.textContent = error.message;
    }
});

// ========================================
// UI & DATA LOADING
// ========================================
async function loadUserData() {
    const userRef = doc(db, 'users', currentUser.uid);

    onSnapshot(userRef, (docSnap) => {
        const data = docSnap.data();
        if (!data) return;

        if (data.banned) {
            alert('Yasaklandınız.');
            signOut(auth);
            return;
        }

        // Sidebar User Components (Bottom Left)
        const elUsername = document.getElementById('sidebarUsername');
        const elDiscriminator = document.getElementById('sidebarRole');
        const elAvatar = document.getElementById('sidebarAvatar');

        if (elUsername) elUsername.textContent = data.username;
        if (elDiscriminator) {
            // Fake Discriminator like Discord
            const uidSuffix = currentUser.uid.substring(0, 4).toUpperCase();
            elDiscriminator.textContent = `#${uidSuffix} • ${data.role || 'User'}`;
        }
        if (elAvatar && data.profileImage) elAvatar.src = data.profileImage;

        userMultiplier = data.multiplier || 1;

        // Trigger global member refresh
        loadMemberSidebar();
    });
}

// SIMULATED MEMBER LIST
async function loadMemberSidebar() {
    const container = document.getElementById('memberListContainer');
    if (!container) return;

    const q = query(collection(db, 'users'), orderBy('score', 'desc'), limit(15));
    const snap = await getDocs(q);

    container.innerHTML = '';
    let onlineCount = 0;

    snap.forEach(d => {
        const u = d.data();
        const role = u.role || 'user';
        onlineCount++;

        const div = document.createElement('div');
        div.className = `member-item ${role === 'KURUCU' ? 'founder-glow' : ''}`;
        div.innerHTML = `
            <div class="avatar-wrapper">
                <img src="${u.profileImage || 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="32" height="32"%3E%3Crect width="32" height="32" fill="%237289da"/%3E%3C/svg%3E'}" alt="">
                <div class="status-indicator online"></div>
            </div>
            <div class="member-info">
                <span class="name ${role === 'KURUCU' ? 'founder-color' : ''}">${u.username}</span>
                <span class="activity">${u.multiplier > 1 ? `x${u.multiplier} Boost!` : 'Takılıyor...'}</span>
            </div>
        `;
        div.onclick = () => alert("Profil: " + u.username);
        container.appendChild(div);
    });

    const countEl = document.getElementById('onlineCountRaw');
    if (countEl) countEl.textContent = onlineCount;
}

// ========================================
// LOGIN / REGISTER LOGIC
// ========================================
// Switch Forms
document.getElementById('toRegister').onclick = () => {
    document.getElementById('login-form').classList.remove('active');
    document.getElementById('register-form').classList.add('active');
};
document.getElementById('toLogin').onclick = () => {
    document.getElementById('register-form').classList.remove('active');
    document.getElementById('login-form').classList.add('active');
};

// Handle Login
document.getElementById('loginButton').onclick = async () => {
    const email = document.getElementById('loginEmail').value;
    const password = document.getElementById('loginPassword').value;

    if (!email || !password) return alert("Lütfen bilgileri girin.");

    try {
        await signInWithEmailAndPassword(auth, email, password);
    } catch (e) {
        alert("Giriş Hatası: " + e.message);
    }
};

// Handle Register
document.getElementById('registerButton').onclick = async () => {
    const user = document.getElementById('regUsername').value;
    const email = document.getElementById('regEmail').value;
    const pass = document.getElementById('regPassword').value;

    if (!user || !email || !pass) return alert("Hepsini doldur!");
    if (pass.length < 6) return alert("Şifre en az 6 hane olmalı.");

    try {
        const cred = await createUserWithEmailAndPassword(auth, email, pass);
        // Create Initial Doc immediately
        await setDoc(doc(db, 'users', cred.user.uid), {
            username: user,
            email: email,
            score: 100,
            role: 'user',
            createdAt: serverTimestamp(),
            profileImage: 'https://via.placeholder.com/150',
            multiplier: 1
        });
    } catch (e) {
        alert("Kayıt Hatası: " + e.message);
    }
};

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
// REFACTORED CHAT & MULTIPLAYER
// ========================================

// 1. Challenge Modal controls
document.getElementById('openChallengeBtn').addEventListener('click', () => {
    document.getElementById('createChallengeModal').style.display = 'flex';
});

document.getElementById('challengeGameType').addEventListener('change', (e) => {
    const isCoin = e.target.value === 'coin';
    document.getElementById('coinSideSelector').style.display = isCoin ? 'block' : 'none';
});

let selectedCoinSide = 'heads';
window.selectCoinSide = (side) => {
    selectedCoinSide = side;
    document.getElementById('btnSideHeads').style.background = side === 'heads' ? 'var(--accent-color)' : 'rgba(255,255,255,0.1)';
    document.getElementById('btnSideTails').style.background = side === 'tails' ? 'var(--accent-color)' : 'rgba(255,255,255,0.1)';
};

// 2. Create Challenge
document.getElementById('sendChallengeBtn').addEventListener('click', async () => {
    const gameType = document.getElementById('challengeGameType').value;
    const bet = parseInt(document.getElementById('challengeBetAmount').value);

    // Validate
    const userRef = doc(db, 'users', currentUser.uid);
    const userSnap = await getDoc(userRef);
    const currentScore = userSnap.data().score;

    if (bet > currentScore) {
        alert("Yetersiz bakiye!");
        return;
    }

    document.getElementById('createChallengeModal').style.display = 'none';

    // 1. Deduct bet from host immediately (escrow)
    await updateDoc(userRef, { score: increment(-bet) });

    // 2. Create Game Document
    const gameRef = await addDoc(collection(db, 'active_games'), {
        hostUid: currentUser.uid,
        hostName: currentUser.displayName || userSnap.data().username,
        hostAvatar: userSnap.data().profileImage || '',
        gameType: gameType, // 'rps' or 'coin'
        betAmount: bet,
        status: 'waiting', // waiting, playing, finished
        createdAt: serverTimestamp(),
        // Specifics
        hostValidSide: selectedCoinSide, // for coin
        moves: {} // for rps: { uid: 'rock' }
    });

    // 3. Send Message to Chat
    await addDoc(collection(db, 'chat'), {
        type: 'challenge',
        gameId: gameRef.id,
        gameType: gameType,
        betAmount: bet,
        hostName: userSnap.data().username,
        timestamp: serverTimestamp()
    });
});

// 3. Render Challenge Card in Chat (Override appendChatMessage logic)
function appendChatMessage(msg) {
    const messagesEl = document.getElementById('chatMessages');
    const div = document.createElement('div');

    if (msg.type === 'challenge') {
        // Special Challenge Card
        const gameName = msg.gameType === 'rps' ? 'Taş-Kağıt-Makas' : 'Yazı-Tura';
        const icon = msg.gameType === 'rps' ? '✊' : '🪙';

        div.className = 'challenge-card';
        div.innerHTML = `
            <div class="challenge-header">
                <div class="challenge-title">
                    <span style="font-size: 20px">${icon}</span>
                    ${gameName}
                </div>
                <div class="challenge-bet">💎 ${msg.betAmount}</div>
            </div>
            <div style="font-size: 14px; margin-bottom: 10px; opacity: 0.8">
                <strong>${msg.hostName}</strong> bir düello başlattı!
            </div>
            <div class="challenge-actions">
                <button class="challenge-btn join" onclick="joinChallenge('${msg.gameId}', ${msg.betAmount})">KABUL ET & OYNA</button>
            </div>
        `;
    } else {
        // Standard Message
        div.className = 'chat-message';

        // Admin/Founder highlight
        if (msg.role === 'admin') div.style.borderLeft = '3px solid var(--success-color)';
        if (msg.role === 'KURUCU') {
            div.style.borderLeft = '3px solid var(--founder-color)';
            div.style.background = 'linear-gradient(90deg, rgba(139, 92, 246, 0.1) 0%, transparent 100%)';
        }

        const time = msg.timestamp ? new Date(msg.timestamp.toDate()).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' }) : '';

        let badges = '';
        if (msg.role === 'admin') badges += '<span class="admin-badge admin" style="font-size:9px; padding:2px 4px;">ADMIN</span> ';
        if (msg.role === 'KURUCU') badges += '<span class="admin-badge founder" style="font-size:9px; padding:2px 4px;">KURUCU</span> ';

        div.innerHTML = `
            <div class="message-header">
                <span class="message-user" style="${msg.role === 'KURUCU' ? 'color:var(--founder-color)' : ''}">${badges}${msg.username}</span>
                <div style="display:flex; align-items:center;">
                    <span class="message-time">${time}</span>
                    ${isUserAdmin ? `<button class="chat-delete-btn" onclick="deleteMessage('${msg.id}')">🗑️</button>` : ''}
                </div>
            </div>
            <div class="message-text">${(msg.message || msg.text)}</div>
        `;
    }

    messagesEl.appendChild(div);
    if (autoScroll) messagesEl.scrollTop = messagesEl.scrollHeight;
}

// 4. Join Challenge Logic
window.joinChallenge = async (gameId, bet) => {
    if (!currentUser) {
        alert("Giriş yapmalısınız!");
        return;
    }

    try {
        const gameRef = doc(db, 'active_games', gameId);
        const gameSnap = await getDoc(gameRef);

        if (!gameSnap.exists()) {
            alert("Bu oyun artık mevcut değil.");
            return;
        }

        const gameData = gameSnap.data();

        if (gameData.status !== 'waiting') {
            alert("Bu oyun zaten başlamış veya bitmiş.");
            return;
        }

        if (gameData.hostUid === currentUser.uid) {
            alert("Kendi oyununa katılamazsın! Bekle...");
            // Open modal for host to wait
            openMultiplayerModal(gameId);
            return;
        }

        // Check Guest Balance
        const userRef = doc(db, 'users', currentUser.uid);
        const userSnap = await getDoc(userRef);
        if (userSnap.data().score < bet) {
            alert("Yetersiz bakiye!");
            return;
        }

        // Deduct bet from guest
        await updateDoc(userRef, { score: increment(-bet) });

        // Update Game to 'playing'
        await updateDoc(gameRef, {
            guestUid: currentUser.uid,
            guestName: currentUser.displayName || userSnap.data().username,
            guestAvatar: userSnap.data().profileImage || '',
            status: 'playing'
        });

        openMultiplayerModal(gameId); // Open for guest

    } catch (e) {
        console.error("Join error:", e);
        alert("Hata oluştu: " + e.message);
    }
};

// 5. Multiplayer Modal & Game Loop
let activeGameUnsub = null;
let currentActiveGameId = null;

function openMultiplayerModal(gameId) {
    document.getElementById('mpGameModal').style.display = 'flex';
    currentActiveGameId = gameId;

    // Reset UI
    document.getElementById('mpCoinArea').style.display = 'none';
    document.getElementById('mpRpsArea').style.display = 'none';
    document.getElementById('mpResultDisplay').textContent = '';
    document.getElementById('mpStatusText').textContent = 'Bağlanıyor...';
    document.getElementById('mpCoin').className = 'coin';

    if (activeGameUnsub) activeGameUnsub();

    activeGameUnsub = onSnapshot(doc(db, 'active_games', gameId), (docSnap) => {
        if (!docSnap.exists()) return;
        const data = docSnap.data();

        // Update Player Info
        document.getElementById('mpHostName').textContent = data.hostName;
        document.getElementById('mpGuestName').textContent = data.guestName || 'Bekleniyor...';
        document.getElementById('mpHostAvatar').src = data.hostAvatar || 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="80" height="80"%3E%3Crect width="80" height="80" fill="%23333"/%3E%3C/svg%3E';
        document.getElementById('mpGuestAvatar').src = data.guestAvatar || 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="80" height="80"%3E%3Crect width="80" height="80" fill="%23333"/%3E%3C/svg%3E';

        // STATUS HANDLER
        if (data.status === 'waiting') {
            document.getElementById('mpStatusText').textContent = 'Rakip Bekleniyor...';
        }
        else if (data.status === 'playing') {
            handlePlayingState(data, gameId);
        }
        else if (data.status === 'finished') {
            handleFinishedState(data);
        }
    });
}

function handlePlayingState(data, gameId) {
    const isMeHost = data.hostUid === currentUser.uid;
    const isMeGuest = data.guestUid === currentUser.uid;

    if (data.gameType === 'coin') {
        // Coin Flip Logic
        document.getElementById('mpCoinArea').style.display = 'block';
        document.getElementById('mpStatusText').textContent = 'Yazı Tura atılıyor...';

        // Host has already picked side in setup.
        // We trigger animation and result determination.
        // Only HOST calculates random result to avoid conflicts, updates DB.

        if (isMeHost && !data.result) {
            setTimeout(async () => {
                const isHeads = Math.random() < 0.5;
                const resultSide = isHeads ? 'heads' : 'tails';

                // Determine Winner
                // Host picked 'hostValidSide'
                let winnerUid = '';
                if (data.hostValidSide === resultSide) winnerUid = data.hostUid;
                else winnerUid = data.guestUid;

                await updateDoc(doc(db, 'active_games', gameId), {
                    result: resultSide,
                    winnerUid: winnerUid,
                    status: 'finished'
                });
            }, 1000);
        }
    }
    else if (data.gameType === 'rps') {
        document.getElementById('mpRpsArea').style.display = 'block';

        const myMove = data.moves ? data.moves[currentUser.uid] : null;

        if (!myMove) {
            document.getElementById('mpStatusText').textContent = 'Hamleni Seç!';
            document.getElementById('mpRpsControls').style.pointerEvents = 'auto';
            document.getElementById('mpRpsControls').style.opacity = '1';
        } else {
            document.getElementById('mpStatusText').textContent = 'Rakip bekleniyor...';
            document.getElementById('mpRpsControls').style.pointerEvents = 'none';
            document.getElementById('mpRpsControls').style.opacity = '0.5';
        }

        // If both moved, logic runs on cloud or via client trigger. 
        // Let's make the last mover trigger finish.
        const moves = data.moves || {};
        if (moves[data.hostUid] && moves[data.guestUid] && !data.winnerUid) {
            // Both moved. Resolve.
            if (isMeHost) { // Only one person needs to resolve
                resolveRps(gameId, moves[data.hostUid], moves[data.guestUid], data.hostUid, data.guestUid);
            }
        }
    }
}

async function resolveRps(gameId, hostMove, guestMove, hostUid, guestUid) {
    let winnerUid = null; // null = draw

    if (hostMove === guestMove) winnerUid = 'draw';
    else if (
        (hostMove === 'rock' && guestMove === 'scissors') ||
        (hostMove === 'paper' && guestMove === 'rock') ||
        (hostMove === 'scissors' && guestMove === 'paper')
    ) {
        winnerUid = hostUid;
    } else {
        winnerUid = guestUid;
    }

    await updateDoc(doc(db, 'active_games', gameId), {
        status: 'finished',
        winnerUid: winnerUid,
        movesRes: { host: hostMove, guest: guestMove }
    });
}

window.makeMpMove = async (move) => {
    if (!currentActiveGameId) return;

    const gameRef = doc(db, 'active_games', currentActiveGameId);
    // Use dot notation to update nested map key
    await updateDoc(gameRef, {
        [`moves.${currentUser.uid}`]: move
    });
};

function handleFinishedState(data) {
    const isMeWinner = data.winnerUid === currentUser.uid;
    const isDraw = data.winnerUid === 'draw';

    const resultText = document.getElementById('mpResultDisplay');

    // Animations
    if (data.gameType === 'coin') {
        const coin = document.getElementById('mpCoin');
        // Remove old classes to re-trigger?
        coin.className = 'coin';
        void coin.offsetWidth; // trigger reflow

        if (data.result === 'heads') coin.classList.add('flipping'); // ends on front (heads)
        else coin.style.animation = 'flipCoinTails 3s ease-out forwards';

        setTimeout(() => {
            showEndText();
            distributePrizes(data);
        }, 3000);
    }
    else {
        // RPS
        showEndText();
        distributePrizes(data);
    }

    function showEndText() {
        if (isDraw) {
            resultText.textContent = "🤝 BERABERE!";
            resultText.style.color = '#ccc';
        } else if (isMeWinner) {
            resultText.textContent = "🎉 KAZANDIN! +" + (data.betAmount * 2);
            resultText.style.color = '#10b981';
            triggerConfetti();
        } else {
            resultText.innerHTML = "💀 KAYBETTİN...";
            resultText.style.color = '#ef4444';
        }
    }
}

let prizesDistributedFor = [];

async function distributePrizes(data) {
    // Client-side prize distribution security check:
    // Only the winner should claim their prize to avoid double writes, 
    // OR we let the host handle it if it includes the guest.
    // Simplest reliable way without Cloud Functions:
    // The WINNER writes the update. DRAW: Both get refund.

    if (prizesDistributedFor.includes(data.id)) return; // Local check

    // We can't easily prevent double claiming without backend logic, 
    // but we will rely on the fact that only the involved client runs this.

    // IMPORTANT: In a real app, use Cloud Functions!
    const userRef = doc(db, 'users', currentUser.uid);

    const myAlreadyProcessed = localStorage.getItem(`game_${currentActiveGameId}`);
    if (myAlreadyProcessed) return;

    if (data.winnerUid === currentUser.uid) {
        // I won, total pool is bet * 2
        await updateDoc(userRef, { score: increment(data.betAmount * 2) });
        localStorage.setItem(`game_${currentActiveGameId}`, 'true');
    } else if (data.winnerUid === 'draw') {
        // Refund
        await updateDoc(userRef, { score: increment(data.betAmount) });
        localStorage.setItem(`game_${currentActiveGameId}`, 'true');
    }
}

window.closeMpGame = () => {
    document.getElementById('mpGameModal').style.display = 'none';
    if (activeGameUnsub) activeGameUnsub();
    currentActiveGameId = null;
}

function triggerConfetti() {
    // Simple visual flair if requested, or just CSS
}

window.deleteMessage = async (msgId) => {
    if (!confirm('Bu mesajı silmek istiyor musun?')) return;
    await deleteDoc(doc(db, 'chat', msgId));
}
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
// CHAT SYSTEM (GLOBAL STANDARD)
// ========================================

document.getElementById('globalChatSend').onclick = sendMessage;
document.getElementById('globalChatInput').addEventListener('keypress', (e) => {
    if (e.key === 'Enter') sendMessage();
});

// Tab Switching
document.getElementById('tabGlobal').onclick = () => {
    document.getElementById('tabGlobal').classList.add('active');
    document.getElementById('tabDm').classList.remove('active');
    document.getElementById('viewGlobal').classList.remove('hidden');
    document.getElementById('viewDm').classList.add('hidden');
};

document.getElementById('tabDm').onclick = () => {
    document.getElementById('tabDm').classList.add('active');
    document.getElementById('tabGlobal').classList.remove('active');
    document.getElementById('viewDm').classList.remove('hidden');
    document.getElementById('viewGlobal').classList.add('hidden');
    loadDmUsers();
};

async function sendMessage() {
    const input = document.getElementById('globalChatInput');
    const text = input.value.trim();
    if (!text) return;

    if (currentUser.muted) return alert("Susturuldunuz.");

    await addDoc(collection(db, 'chat'), {
        userId: currentUser.uid,
        username: currentUser.displayName || document.getElementById('sidebarUsername').textContent,
        message: text, // Standardized key
        timestamp: serverTimestamp(),
        role: document.getElementById('sidebarRole').textContent
    });

    input.value = '';
}







// ========================================
// DM SYSTEM
// ========================================



async function openDm(targetUid, username) {
    currentDmRecipient = targetUid;
    document.getElementById('dmUserList').classList.add('hidden');
    document.getElementById('dmConversation').classList.remove('hidden');
    document.getElementById('currentDmUser').textContent = username;

    loadDmMessages(targetUid);
}

document.getElementById('backToDmList').onclick = () => {
    document.getElementById('dmConversation').classList.add('hidden');
    document.getElementById('dmUserList').classList.remove('hidden');
    currentDmRecipient = null;
};

document.getElementById('dmSend').onclick = sendDm;
async function sendDm() {
    if (!currentDmRecipient) return;
    const input = document.getElementById('dmInput');
    const txt = input.value.trim();
    if (!txt) return;

    const chatId = [currentUser.uid, currentDmRecipient].sort().join('_');
    await addDoc(collection(db, 'dm', chatId, 'messages'), {
        senderId: currentUser.uid,
        message: txt,
        timestamp: serverTimestamp()
    });
    input.value = '';
}




// ========================================
// GAME TRIGGER SYSTEM (NEW DISCORD-GRADE)
// ========================================
document.querySelectorAll('.game-trigger').forEach(item => {
    item.addEventListener('click', () => {
        // Visual Active State
        document.querySelectorAll('.channel-item').forEach(c => c.classList.remove('active'));
        item.classList.add('active');

        const gameType = item.dataset.game;
        launchGame(gameType);
    });
});

document.querySelector('.close-game-btn').addEventListener('click', () => {
    document.getElementById('game-overlay').classList.add('hidden');
    // Stop any running animations if needed
});

function launchGame(type) {
    const overlay = document.getElementById('game-overlay');
    const stage = document.getElementById('game-stage');
    overlay.classList.remove('hidden');

    stage.innerHTML = '';

    if (type === 'wheel') {
        stage.innerHTML = `
            <div class="glass-morphism-3 text-center" style="max-width:400px; margin:auto;">
                <h2 style="color:white; margin-bottom:20px;">🎡 Şans Çarkı</h2>
                <canvas id="wheelCanvas" width="300" height="300"></canvas>
                <div class="mt-4" style="margin-top:20px; display:flex; gap:10px; justify-content:center;">
                    <input type="number" id="wheelBetAmount" value="100" class="input-discord" style="width:100px; background:#111; color:white; padding:10px; border:none; border-radius:4px;">
                    <button id="spinBtn" class="btn-discord" style="width:auto; padding:0 30px;">ÇEVİR</button>
                </div>
                <div id="wheelResult" class="mt-4 font-bold" style="margin-top:20px; height:20px;"></div>
            </div>
        `;
        drawWheel();
        // Dynamic Binding
        document.getElementById('spinBtn').onclick = handleSpin;
    }
    else if (type === 'coin') {
        stage.innerHTML = `
             <div class="glass-morphism-3 text-center" style="max-width:400px; margin:auto;">
                <h2 style="color:white; margin-bottom:20px;">🪙 Yazı Tura</h2>
                <div class="flex gap-4 mt-4" style="display:flex; gap:20px; justify-content:center; margin-bottom:20px;">
                    <button class="btn-discord" onclick="window.playCoin('heads')" style="background:#eab308">YAZI</button>
                    <button class="btn-discord" onclick="window.playCoin('tails')" style="background:#a855f7">TURA</button>
                </div>
                <input type="number" id="coinBet" value="50" class="input-discord" style="width:100px; background:#111; color:white; padding:10px; border:none; border-radius:4px; text-align:center;">
                <div id="coinRes" class="mt-4 text-xl" style="margin-top:20px; font-weight:bold;">Seçimini yap!</div>
            </div>
        `;
    }
    else if (type === 'rps') {
        stage.innerHTML = `
            <div class="glass-morphism-3 text-center" style="max-width:400px; margin:auto;">
                <h2 style="color:white; margin-bottom:20px;">✊ Taş Kağıt Makas</h2>
                <div class="flex gap-4 mt-4" style="display:flex; gap:20px; justify-content:center; font-size:40px; margin-bottom:20px;">
                    <div style="cursor:pointer;" onclick="window.playRps('rock')">🪨</div>
                    <div style="cursor:pointer;" onclick="window.playRps('paper')">📄</div>
                    <div style="cursor:pointer;" onclick="window.playRps('scissors')">✂️</div>
                </div>
                <input type="number" id="rpsBetAmount" value="50" class="input-discord mt-4" style="width:100px; background:#111; color:white; padding:10px; border:none; border-radius:4px; text-align:center;">
                <div id="rpsResult" class="mt-4 text-xl" style="margin-top:20px; font-weight:bold;">Hamleni yap!</div>
            </div>
        `;
    }
    else if (type === 'chess') {
        stage.innerHTML = `
            <div class="glass-morphism-3 text-center" style="max-width:600px; margin:auto;">
                <h2 style="color:white; margin-bottom:20px;">♟️ Satranç Pro</h2>
                <div id="chessBoard" class="chess-board" style="margin:auto;"></div>
                <div id="chessControls" style="margin-top:20px;">
                    <input type="number" id="chessBetAmount" value="100" class="input-discord" style="width:100px; padding:5px;">
                    <select id="chessDifficulty" style="padding:5px; background:#333; color:white; border:none;">
                        <option value="medium">Orta</option>
                        <option value="hard">Zor</option>
                    </select>
                    <button id="chessStartBtn" class="btn-discord" style="width:auto; padding:5px 20px;">BAŞLA</button>
                    <div id="chessResult" style="margin-top:10px;"></div>
                </div>
            </div>
        `;
        // Re-bind Chess
        document.getElementById('chessStartBtn').onclick = startChessGame;
    }
}

// Logic implementations mapped to global window functions for simple HTML injection
window.playCoin = async (choice) => {
    const bet = parseInt(document.getElementById('coinBet').value);
    const resEl = document.getElementById('coinRes');

    // Balance Check
    const userRef = doc(db, 'users', currentUser.uid);
    const snap = await getDoc(userRef);
    if (snap.data().score < bet) return resEl.textContent = "Yetersiz Bakiye!";

    const win = Math.random() > 0.5 ? 'heads' : 'tails';
    if (win === choice) {
        const winAmount = bet; // Simple 1x logic for now
        resEl.textContent = "KAZANDIN!";
        resEl.style.color = "#22c55e";
        await updateDoc(userRef, { score: increment(bet) });
    } else {
        resEl.textContent = "KAYBETTİN...";
        resEl.style.color = "#ef4444";
        await updateDoc(userRef, { score: increment(-bet) });
    }
};

window.playRps = async (choice) => {
    const bet = parseInt(document.getElementById('rpsBetAmount').value);
    const resEl = document.getElementById('rpsResult');

    // Balance Check
    const userRef = doc(db, 'users', currentUser.uid);
    const snap = await getDoc(userRef);
    if (snap.data().score < bet) return resEl.textContent = "Yetersiz Bakiye!";

    const choices = ['rock', 'paper', 'scissors'];
    const bot = choices[Math.floor(Math.random() * 3)];

    let result = 'draw';
    if ((choice === 'rock' && bot === 'scissors') || (choice === 'paper' && bot === 'rock') || (choice === 'scissors' && bot === 'paper')) result = 'win';
    else if (choice !== bot) result = 'lose';

    if (result === 'win') {
        resEl.textContent = `Kazandın! Bot: ${bot}`;
        resEl.style.color = "#22c55e";
        await updateDoc(userRef, { score: increment(bet) });
    } else if (result === 'lose') {
        resEl.textContent = `Kaybettin... Bot: ${bot}`;
        resEl.style.color = "#ef4444";
        await updateDoc(userRef, { score: increment(-bet) });
    } else {
        resEl.textContent = `Berabere. Bot: ${bot}`;
        resEl.style.color = "#eab308";
    }
};

window.handleSpin = async () => {
    const betAmount = parseInt(document.getElementById('wheelBetAmount').value);
    const btn = document.getElementById('spinBtn');
    const resultEl = document.getElementById('wheelResult');

    if (betAmount < 10) return resultEl.textContent = 'Min 10!';

    const userRef = doc(db, 'users', currentUser.uid);
    const userSnap = await getDoc(userRef);
    if (userSnap.data().score < betAmount) return resultEl.textContent = 'Yetersiz Bakiye!';

    btn.disabled = true;
    btn.textContent = '...';

    const canvas = document.getElementById('wheelCanvas');
    // Simple mock result for dynamic logic
    const multipliers = [0.5, 1, 1.5, 2, 3, 0, 1.2, 5];
    const result = multipliers[Math.floor(Math.random() * multipliers.length)];

    await updateDoc(userRef, { score: increment(-betAmount) });

    // Quick spin simulation
    let rot = 0;
    const interval = setInterval(() => {
        rot += 20;
        canvas.style.transform = `rotate(${rot}deg)`;
    }, 16);

    setTimeout(async () => {
        clearInterval(interval);
        const win = Math.floor(betAmount * result);
        if (win > 0) await updateDoc(userRef, { score: increment(win) });

        resultEl.textContent = `Sonuç: x${result} (${win} Puan)`;
        btn.disabled = false;
        btn.textContent = 'ÇEVİR';
    }, 2000);
};

// Start Chess Bridge
// [Deleted legacy duplicates of playCoin and startChessGame]

function drawWheel() {
    const canvas = document.getElementById('wheelCanvas');
    const ctx = canvas.getContext('2d');

    // Reset
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

// [Legacy spinBtn listener removed - handled by handleSpin]

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
        const bestMove = this.minimax(depth, -Infinity, Infinity, true);

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
// DOM READY CHECK
// ========================================
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initializeEventListeners);
} else {
    initializeEventListeners();
}

function initializeEventListeners() {
    console.log('✅ DOM Ready - Event listeners initializing...');
    
    // Artık tüm elemanlar hazır, güvenle erişebilirsiniz
    const adminUserSearch = document.getElementById('adminUserSearch');
    if (adminUserSearch) {
        adminUserSearch.addEventListener('input', async (e) => {
            const searchTerm = e.target.value.toLowerCase();
            if (!searchTerm) {
                loadAdminUsers();
                return;
            }
            // ... geri kalan kod
        });
    }
    
    // Diğer tüm addEventListener'ları buraya taşıyın
}
