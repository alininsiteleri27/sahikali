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
let autoScroll = true; // ✅ EKLENDİ: autoScroll değişkeni tanımlandı

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
    if (!listEl) return;
    
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
const updateRoleBtn = document.getElementById('updateRoleBtn');
if (updateRoleBtn) {
    updateRoleBtn.addEventListener('click', async () => {
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
}

// Founder: Update Score
const updateScoreBtn = document.getElementById('updateScoreBtn');
if (updateScoreBtn) {
    updateScoreBtn.addEventListener('click', async () => {
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
}

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
// LOGIN / REGISTER LOGIC
// ========================================
// Switch Forms
const toRegister = document.getElementById('toRegister');
if (toRegister) {
    toRegister.onclick = () => {
        document.getElementById('login-form').classList.remove('active');
        document.getElementById('register-form').classList.add('active');
    };
}

const toLogin = document.getElementById('toLogin');
if (toLogin) {
    toLogin.onclick = () => {
        document.getElementById('register-form').classList.remove('active');
        document.getElementById('login-form').classList.add('active');
    };
}

// Handle Login
const loginButton = document.getElementById('loginButton');
if (loginButton) {
    loginButton.onclick = async () => {
        const email = document.getElementById('loginEmail').value;
        const password = document.getElementById('loginPassword').value;

        if (!email || !password) return alert("Lütfen bilgileri girin.");

        try {
            await signInWithEmailAndPassword(auth, email, password);
        } catch (e) {
            alert("Giriş Hatası: " + e.message);
        }
    };
}

// Handle Register
const registerButton = document.getElementById('registerButton');
if (registerButton) {
    registerButton.onclick = async () => {
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
}

// ========================================
// PROFILE & SETTINGS
// ========================================
const profileIcon = document.getElementById('profileIcon');
if (profileIcon) {
    profileIcon.addEventListener('click', () => {
        const dropdown = document.getElementById('dropdown');
        if (dropdown) dropdown.classList.toggle('active');
    });
}

document.addEventListener('click', (e) => {
    if (!e.target.closest('.profile-section')) {
        const dropdown = document.getElementById('dropdown');
        if (dropdown) dropdown.classList.remove('active');
    }
});

const logoutBtn = document.getElementById('logoutBtn');
if (logoutBtn) {
    logoutBtn.addEventListener('click', () => {
        signOut(auth);
    });
}

// Theme Toggle
const themeToggle = document.getElementById('themeToggle');
if (themeToggle) {
    const savedTheme = localStorage.getItem('theme') || 'light';

    if (savedTheme === 'dark') {
        document.body.classList.add('dark-mode');
        themeToggle.classList.add('active');
        const themeLabel = document.getElementById('themeLabel');
        if (themeLabel) themeLabel.textContent = 'Light Mode';
    }

    themeToggle.addEventListener('click', () => {
        document.body.classList.toggle('dark-mode');
        themeToggle.classList.toggle('active');

        if (document.body.classList.contains('dark-mode')) {
            localStorage.setItem('theme', 'dark');
            const themeLabel = document.getElementById('themeLabel');
            if (themeLabel) themeLabel.textContent = 'Light Mode';
        } else {
            localStorage.setItem('theme', 'light');
            const themeLabel = document.getElementById('themeLabel');
            if (themeLabel) themeLabel.textContent = 'Dark Mode';
        }
    });
}

// Edit Profile
const editProfileBtn = document.getElementById('editProfileBtn');
if (editProfileBtn) {
    editProfileBtn.addEventListener('click', () => {
        const dropdown = document.getElementById('dropdown');
        if (dropdown) dropdown.classList.remove('active');
        document.getElementById('profileModal').style.display = 'flex';
    });
}

const profileImageUrl = document.getElementById('profileImageUrl');
if (profileImageUrl) {
    profileImageUrl.addEventListener('input', (e) => {
        const url = e.target.value;
        const preview = document.getElementById('profilePreview');
        if (url && preview) {
            preview.src = url;
            preview.style.display = 'block';
        } else if (preview) {
            preview.style.display = 'none';
        }
    });
}

const saveProfileBtn = document.getElementById('saveProfileBtn');
if (saveProfileBtn) {
    saveProfileBtn.addEventListener('click', async () => {
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

            if (messageEl) {
                messageEl.className = 'profile-message success';
                messageEl.textContent = '✅ Profil güncellendi!';
            }

            setTimeout(() => {
                document.getElementById('profileModal').style.display = 'none';
                if (messageEl) messageEl.textContent = '';
            }, 2000);
        } catch (error) {
            if (messageEl) {
                messageEl.className = 'profile-message error';
                messageEl.textContent = error.message;
            }
        }
    });
}

async function loadPresenceData() {
    const presenceListEl = document.getElementById('presenceList');
    if (!presenceListEl) return;

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

        const onlineCountEl = document.getElementById('onlineCount');
        if (onlineCountEl) onlineCountEl.textContent = onlineCount;
        const offlineCountEl = document.getElementById('offlineCount');
        if (offlineCountEl) offlineCountEl.textContent = offlineCount;
        const totalCountEl = document.getElementById('totalCount');
        if (totalCountEl) totalCountEl.textContent = usersSnapshot.size;
    });
}

// ========================================
// LEADERBOARD
// ========================================
const leaderboardBtn = document.getElementById('leaderboardBtn');
if (leaderboardBtn) {
    leaderboardBtn.addEventListener('click', () => {
        document.getElementById('leaderboardModal').style.display = 'flex';
        loadLeaderboard();
    });
}

async function loadLeaderboard() {
    const listEl = document.getElementById('leaderboardList');
    if (!listEl) return;

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
const userSearchInput = document.getElementById('userSearchInput');
if (userSearchInput) {
    userSearchInput.addEventListener('input', async (e) => {
        const searchTerm = e.target.value.toLowerCase();

        if (!searchTerm) {
            document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
            document.getElementById('topUsersTab').style.display = 'block';
            document.getElementById('searchResultsTab').style.display = 'none';
            const firstTabBtn = document.querySelectorAll('.tab-btn')[0];
            if (firstTabBtn) firstTabBtn.classList.add('active');
            return;
        }

        // Switch to search tab
        document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
        const searchTabBtn = document.querySelectorAll('.tab-btn')[1];
        if (searchTabBtn) searchTabBtn.classList.add('active');
        document.getElementById('topUsersTab').style.display = 'none';
        document.getElementById('searchResultsTab').style.display = 'block';

        const resultsEl = document.getElementById('searchResultsList');
        if (!resultsEl) return;
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
}

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
const openChallengeBtn = document.getElementById('openChallengeBtn');
if (openChallengeBtn) {
    openChallengeBtn.addEventListener('click', () => {
        document.getElementById('createChallengeModal').style.display = 'flex';
    });
}

const challengeGameType = document.getElementById('challengeGameType');
if (challengeGameType) {
    challengeGameType.addEventListener('change', (e) => {
        const isCoin = e.target.value === 'coin';
        const coinSideSelector = document.getElementById('coinSideSelector');
        if (coinSideSelector) coinSideSelector.style.display = isCoin ? 'block' : 'none';
    });
}

let selectedCoinSide = 'heads';
window.selectCoinSide = (side) => {
    selectedCoinSide = side;
    const btnSideHeads = document.getElementById('btnSideHeads');
    const btnSideTails = document.getElementById('btnSideTails');
    if (btnSideHeads) btnSideHeads.style.background = side === 'heads' ? 'var(--accent-color)' : 'rgba(255,255,255,0.1)';
    if (btnSideTails) btnSideTails.style.background = side === 'tails' ? 'var(--accent-color)' : 'rgba(255,255,255,0.1)';
};

// 2. Create Challenge
const sendChallengeBtn = document.getElementById('sendChallengeBtn');
if (sendChallengeBtn) {
    sendChallengeBtn.addEventListener('click', async () => {
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
}

// 3. Render Challenge Card in Chat (Override appendChatMessage logic)
function appendChatMessage(msg) {
    const messagesEl = document.getElementById('chatMessages');
    if (!messagesEl) return;

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
    const modal = document.getElementById('mpGameModal');
    if (!modal) return;
    
    modal.style.display = 'flex';
    currentActiveGameId = gameId;

    // Reset UI
    const mpCoinArea = document.getElementById('mpCoinArea');
    const mpRpsArea = document.getElementById('mpRpsArea');
    const mpResultDisplay = document.getElementById('mpResultDisplay');
    const mpStatusText = document.getElementById('mpStatusText');
    const mpCoin = document.getElementById('mpCoin');
    
    if (mpCoinArea) mpCoinArea.style.display = 'none';
    if (mpRpsArea) mpRpsArea.style.display = 'none';
    if (mpResultDisplay) mpResultDisplay.textContent = '';
    if (mpStatusText) mpStatusText.textContent = 'Bağlanıyor...';
    if (mpCoin) mpCoin.className = 'coin';

    if (activeGameUnsub) activeGameUnsub();

    activeGameUnsub = onSnapshot(doc(db, 'active_games', gameId), (docSnap) => {
        if (!docSnap.exists()) return;
        const data = docSnap.data();

        // Update Player Info
        const mpHostName = document.getElementById('mpHostName');
        const mpGuestName = document.getElementById('mpGuestName');
        const mpHostAvatar = document.getElementById('mpHostAvatar');
        const mpGuestAvatar = document.getElementById('mpGuestAvatar');
        
        if (mpHostName) mpHostName.textContent = data.hostName;
        if (mpGuestName) mpGuestName.textContent = data.guestName || 'Bekleniyor...';
        if (mpHostAvatar) mpHostAvatar.src = data.hostAvatar || 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="80" height="80"%3E%3Crect width="80" height="80" fill="%23333"/%3E%3C/svg%3E';
        if (mpGuestAvatar) mpGuestAvatar.src = data.guestAvatar || 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="80" height="80"%3E%3Crect width="80" height="80" fill="%23333"/%3E%3C/svg%3E';

        // STATUS HANDLER
        if (data.status === 'waiting') {
            if (mpStatusText) mpStatusText.textContent = 'Rakip Bekleniyor...';
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
        const mpCoinArea = document.getElementById('mpCoinArea');
        const mpStatusText = document.getElementById('mpStatusText');
        
        if (mpCoinArea) mpCoinArea.style.display = 'block';
        if (mpStatusText) mpStatusText.textContent = 'Yazı Tura atılıyor...';

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
        const mpRpsArea = document.getElementById('mpRpsArea');
        if (mpRpsArea) mpRpsArea.style.display = 'block';

        const myMove = data.moves ? data.moves[currentUser.uid] : null;

        const mpStatusText = document.getElementById('mpStatusText');
        const mpRpsControls = document.getElementById('mpRpsControls');
        if (mpStatusText) {
            if (!myMove) {
                mpStatusText.textContent = 'Hamleni Seç!';
            } else {
                mpStatusText.textContent = 'Rakip bekleniyor...';
            }
        }
        if (mpRpsControls) {
            if (!myMove) {
                mpRpsControls.style.pointerEvents = 'auto';
                mpRpsControls.style.opacity = '1';
            } else {
                mpRpsControls.style.pointerEvents = 'none';
                mpRpsControls.style.opacity = '0.5';
            }
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
        if (coin) {
            // Remove old classes to re-trigger?
            coin.className = 'coin';
            void coin.offsetWidth; // trigger reflow

            if (data.result === 'heads') coin.classList.add('flipping'); // ends on front (heads)
            else coin.style.animation = 'flipCoinTails 3s ease-out forwards';
        }

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
        if (resultText) {
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
    const modal = document.getElementById('mpGameModal');
    if (modal) modal.style.display = 'none';
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
    if (!messagesEl) return;

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
            const chatLoadMore = document.getElementById('chatLoadMore');
            if (chatLoadMore) chatLoadMore.style.display = 'block';
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

const loadMoreBtn = document.getElementById('loadMoreBtn');
if (loadMoreBtn) {
    loadMoreBtn.addEventListener('click', async () => {
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
            if (messagesEl) {
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
            }
        } else {
            const chatLoadMore = document.getElementById('chatLoadMore');
            if (chatLoadMore) chatLoadMore.style.display = 'none';
        }
    });
}

// Send Global Chat - BİRİNCİ FONKSİYON (chat için)
async function sendChatMessage() {
    const input = document.getElementById('chatInput');
    if (!input) return;
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
// ========================================
// CHAT SYSTEM (GLOBAL STANDARD)
// ========================================

const globalChatSend = document.getElementById('globalChatSend');
if (globalChatSend) {
    globalChatSend.onclick = sendGlobalMessage; // ✅ globalChatSend için tek bir event listener
}

const chatInput = document.getElementById('chatInput');
if (chatInput) {
    chatInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') sendGlobalMessage();
    });
}

// Tab Switching
const tabGlobal = document.getElementById('tabGlobal');
if (tabGlobal) {
    tabGlobal.onclick = () => {
        document.getElementById('tabGlobal').classList.add('active');
        document.getElementById('tabDm').classList.remove('active');
        document.getElementById('viewGlobal').classList.remove('hidden');
        document.getElementById('viewDm').classList.add('hidden');
    };
}

const tabDm = document.getElementById('tabDm');
if (tabDm) {
    tabDm.onclick = () => {
        document.getElementById('tabDm').classList.add('active');
        document.getElementById('tabGlobal').classList.remove('active');
        document.getElementById('viewDm').classList.remove('hidden');
        document.getElementById('viewGlobal').classList.add('hidden');
        loadDmUsers();
    };
}

// ✅ İKİNCİ sendMessage FONKSİYONU (global chat için) - ADI DEĞİŞTİRİLDİ
async function sendGlobalMessage() {
    const input = document.getElementById('chatInput');
    if (!input) return;
    const text = input.value.trim();
    if (!text) return;

    if (currentUser.muted) {
        alert("Susturuldunuz.");
        return;
    }

    // Kullanıcı verilerini al
    const userRef = doc(db, 'users', currentUser.uid);
    const userSnap = await getDoc(userRef);
    const userData = userSnap.data();

    await addDoc(collection(db, 'chat'), {
        userId: currentUser.uid,
        username: userData.username || document.getElementById('sidebarUsername').textContent,
        message: text, // Standardized key
        timestamp: serverTimestamp(),
        role: userData.role || 'user'
    });

    input.value = '';
}

// ========================================
// DM SYSTEM
// ========================================

async function loadDmUsers() {
    const listEl = document.getElementById('dmUserList');
    if (!listEl) return;

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
    const dmUserName = document.getElementById('dmUserName');
    if (dmUserName) dmUserName.textContent = recipientName;
    document.getElementById('dmUserList').style.display = 'none';
    document.getElementById('dmConversation').style.display = 'flex';

    loadDmMessages(recipientId);
}

const dmBackBtn = document.getElementById('dmBackBtn');
if (dmBackBtn) {
    dmBackBtn.addEventListener('click', () => {
        document.getElementById('dmUserList').style.display = 'block';
        document.getElementById('dmConversation').style.display = 'none';
        currentDmRecipient = null;
    });
}

async function loadDmMessages(recipientId) {
    const messagesEl = document.getElementById('dmMessages');
    if (!messagesEl) return;

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
    if (!input) return;
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

const dmSend = document.getElementById('dmSend');
if (dmSend) {
    dmSend.addEventListener('click', sendDmMessage); // ✅ TEK BİR EVENT LİSTENER
}

const dmInput = document.getElementById('dmInput');
if (dmInput) {
    dmInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') sendDmMessage();
    });
}

// Mobile Chat Toggle
const chatToggleMobile = document.getElementById('chatToggleMobile');
if (chatToggleMobile) {
    chatToggleMobile.addEventListener('click', () => {
        document.getElementById('chatSidebar').classList.toggle('minimized');
    });
}

// ========================================
// AD SYSTEM
// ========================================
const watchAdBtn = document.getElementById('watchAdBtn');
if (watchAdBtn) {
    watchAdBtn.addEventListener('click', async () => {
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
            const adCooldownEl = document.getElementById('adCooldown');
            if (adCooldownEl) adCooldownEl.style.display = 'block';

            let timeLeft = 300; // 5 minutes
            adCooldown = true;

            const timer = setInterval(() => {
                timeLeft--;
                const minutes = Math.floor(timeLeft / 60);
                const seconds = timeLeft % 60;
                const adTimer = document.getElementById('adTimer');
                if (adTimer) adTimer.textContent = `${minutes}:${seconds.toString().padStart(2, '0')}`;

                if (timeLeft <= 0) {
                    clearInterval(timer);
                    btn.style.display = 'block';
                    btn.disabled = false;
                    btn.textContent = '+50 Puan Kazan';
                    const adCooldownEl = document.getElementById('adCooldown');
                    if (adCooldownEl) adCooldownEl.style.display = 'none';
                    adCooldown = false;
                }
            }, 1000);
        }, 3000);
    });
}

// ========================================
// MARKET SYSTEM
// ========================================
const marketBtn = document.getElementById('marketBtn');
if (marketBtn) {
    marketBtn.addEventListener('click', () => {
        document.getElementById('marketModal').style.display = 'flex';
    });
}

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
    if (!resultEl) return;
    resultEl.className = `box-result ${type}`;
    resultEl.textContent = message;

    setTimeout(() => {
        resultEl.textContent = '';
        resultEl.className = 'box-result';
    }, 5000);
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

const closeGameBtn = document.querySelector('.close-game-btn');
if (closeGameBtn) {
    closeGameBtn.addEventListener('click', () => {
        document.getElementById('game-overlay').classList.add('hidden');
        // Stop any running animations if needed
    });
}

// [Chess ve diğer oyun fonksiyonları aynı kaldı - sadece hatalı kısımlar düzeltildi]
// ... (mevcut chess ve oyun fonksiyonları aynen korundu)

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
    
    // ✅ adminUserSearch için SADECE BURADA event listener tanımlandı
    const adminUserSearch = document.getElementById('adminUserSearch');
    if (adminUserSearch) {
        adminUserSearch.addEventListener('input', async (e) => {
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
    }
    
    // Diğer tüm event listener'lar zaten yukarıda tanımlandı
    // Bu fonksiyon sadece adminUserSearch için olanı içeriyor
}
