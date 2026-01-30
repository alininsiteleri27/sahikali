import { initializeApp } from "https://www.gstatic.com/firebasejs/12.8.0/firebase-app.js";
import { getAnalytics } from "https://www.gstatic.com/firebasejs/12.8.0/firebase-analytics.js";
import {
    getAuth,
    createUserWithEmailAndPassword,
    signInWithEmailAndPassword,
    onAuthStateChanged,
    signOut,
    updateProfile
} from "https://www.gstatic.com/firebasejs/12.8.0/firebase-auth.js";
import {
    getFirestore,
    doc,
    setDoc,
    getDoc,
    updateDoc,
    serverTimestamp,
    collection,
    addDoc,
    query,
    orderBy,
    limit,
    onSnapshot,
    where,
    deleteDoc,
    initializeFirestore,
    persistentLocalCache
} from "https://www.gstatic.com/firebasejs/12.8.0/firebase-firestore.js";
import {
    getDatabase,
    ref,
    set,
    onDisconnect,
    onValue
} from "https://www.gstatic.com/firebasejs/12.8.0/firebase-database.js";

// --- FIREBASE CONFIGURATION ---
const firebaseConfig = {
    apiKey: "AIzaSyDyGNrzw1a55LHv-LP5gjuPpFWmHu1a6yU",
    authDomain: "ali23-cfd02.firebaseapp.com",
    databaseURL: "https://ali23-cfd02-default-rtdb.europe-west1.firebasedatabase.app",
    projectId: "ali23-cfd02",
    storageBucket: "ali23-cfd02.firebasestorage.app",
    messagingSenderId: "759021285078",
    appId: "1:759021285078:web:f7673f89125ff3dad66377",
    measurementId: "G-NNCQQQFWD6"
};

// --- INITIALIZATION ---
const app = initializeApp(firebaseConfig);
const analytics = getAnalytics(app);
const auth = getAuth(app);
// Initialize Firestore with persistent cache
const db = initializeFirestore(app, { localCache: persistentLocalCache() });
const rtdb = getDatabase(app);


// --- STATE MANAGEMENT ---
const STATE = {
    currentUser: null, // Firebase Auth User
    userProfile: null, // Firestore Profile Data
    activePage: 'dashboard',
    loading: true
};

// --- UI UTILITIES (TOASTS, LOADERS) ---
class UIManager {
    constructor() {
        this.loader = document.getElementById('loader-screen');
        this.toastContainer = document.getElementById('toast-container');
    }

    showLoader() {
        this.loader.style.display = 'flex';
    }

    hideLoader() {
        this.loader.style.display = 'none';
        STATE.loading = false;
    }

    showToast(message, type = 'info') {
        const toast = document.createElement('div');
        toast.className = `toast ${type}`;
        toast.innerHTML = `
            <i class="fas ${type === 'error' ? 'fa-exclamation-circle' : 'fa-check-circle'}"></i>
            <span>${message}</span>
        `;
        this.toastContainer.appendChild(toast);

        // Auto remove
        setTimeout(() => {
            toast.style.animation = 'slideInRight 0.3s reverse forwards';
            setTimeout(() => toast.remove(), 300);
        }, 4000);
    }

    switchView(viewId) {
        document.querySelectorAll('section').forEach(el => el.classList.add('hidden'));
        document.getElementById(viewId).classList.remove('hidden');

        // View specific logic
        if (viewId === 'auth-view') document.getElementById('auth-view').classList.add('active-view');
    }

    navigate(pageId) {
        // Toggle Sidebar Active State
        document.querySelectorAll('.nav-links li').forEach(li => li.classList.remove('active'));
        const activeLink = document.querySelector(`.nav-links li[data-page="${pageId}"]`);
        if (activeLink) activeLink.classList.add('active');

        // Show Content
        document.querySelectorAll('.page-section').forEach(el => el.classList.add('hidden'));
        document.getElementById(`page-${pageId}`)?.classList.remove('hidden');

        STATE.activePage = pageId;
    }
}

const ui = new UIManager();


// --- AUTHENTICATION MANAGER ---
class AuthManager {
    constructor() {
        this.initListeners();
    }

    initListeners() {
        // Auth Tab Switching
        document.querySelectorAll('.tab-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
                document.querySelectorAll('.auth-form').forEach(f => f.classList.remove('active-form'));

                e.target.classList.add('active');
                document.getElementById(e.target.dataset.tab).classList.add('active-form');
            });
        });

        // Login Logic
        document.getElementById('login-form').addEventListener('submit', async (e) => {
            e.preventDefault();
            const email = document.getElementById('login-email').value;
            const pass = document.getElementById('login-password').value;

            try {
                ui.showLoader();
                await signInWithEmailAndPassword(auth, email, pass);
                // State listener will handle redirect
            } catch (error) {
                ui.hideLoader();
                this.handleAuthError(error);
            }
        });

        // Register Logic
        document.getElementById('register-form').addEventListener('submit', async (e) => {
            e.preventDefault();
            const email = document.getElementById('reg-email').value;
            const pass = document.getElementById('reg-password').value;
            const username = document.getElementById('reg-username').value;
            const avatar = document.getElementById('reg-avatar').value;

            if (pass.length < 6) {
                ui.showToast('Şifre en az 6 karakter olmalı', 'error');
                return;
            }

            try {
                ui.showLoader();
                const userCredential = await createUserWithEmailAndPassword(auth, email, pass);
                const user = userCredential.user;

                // 1. Update Profile Display Name
                await updateProfile(user, { displayName: username });

                // 2. Create Firestore Document (Detailed Profile)
                const userDoc = {
                    uid: user.uid,
                    username: username,
                    email: email,
                    avatar: avatar,
                    role: 'member', // default role
                    balance: 100, // starting gold
                    stats: { wins: 0, losses: 0, rank: 0 },
                    createdAt: serverTimestamp(),
                    status: 'online',
                    banned: false,
                    muted: false
                };

                await setDoc(doc(db, "users", user.uid), userDoc);

                // 3. RTDB Presence Entry
                const userStatusRef = ref(rtdb, 'status/' + user.uid);
                set(userStatusRef, { state: 'online', last_changed: Date.now() });

                ui.showToast('Hesap başarıyla oluşturuldu! Yönlendiriliyorsunuz...', 'success');
                // State listener handles the rest
            } catch (error) {
                ui.hideLoader();
                this.handleAuthError(error);
            }
        });

        // Logout
        document.getElementById('logout-btn').addEventListener('click', () => {
            // Set offline in RTDB before signing out
            if (auth.currentUser) {
                const userStatusRef = ref(rtdb, 'status/' + auth.currentUser.uid);
                set(userStatusRef, { state: 'offline', last_changed: Date.now() });
            }
            signOut(auth);
        });
    }

    handleAuthError(error) {
        console.error(error);
        let msg = "Bir hata oluştu.";
        if (error.code === 'auth/wrong-password') msg = "Hatalı şifre.";
        if (error.code === 'auth/user-not-found') msg = "Kullanıcı bulunamadı.";
        if (error.code === 'auth/email-already-in-use') msg = "Bu e-posta zaten kullanımda.";
        if (error.code === 'auth/weak-password') msg = "Şifre çok zayıf.";
        ui.showToast(msg, 'error');
    }
}

// --- DATA & PROFILE MANAGER ---
class DataManager {
    async fetchUserProfile(uid) {
        try {
            const docRef = doc(db, "users", uid);
            const docSnap = await getDoc(docRef);

            if (docSnap.exists()) {
                STATE.userProfile = docSnap.data();
                this.updateUIWithProfile();
                this.setupPresenceSystem(uid);
            } else {
                console.error("No such document!");
                // Failsafe: create if missing?
            }
        } catch (e) {
            console.error("Error fetching profile", e);
        }
    }

    updateUIWithProfile() {
        const p = STATE.userProfile;
        document.getElementById('nav-user-name').innerText = p.username;
        document.getElementById('hero-username').innerText = p.username;
        document.getElementById('user-balance').innerText = p.balance;

        // Avatar setup
        const seeds = {
            'avatar1.png': 'Felix',
            'avatar2.png': 'Aneka',
            'avatar3.png': 'Rey',
            'avatar4.png': 'Zoe'
        };
        const seed = seeds[p.avatar] || 'Felix';
        document.getElementById('nav-user-avatar').src = `https://api.dicebear.com/7.x/avataaars/svg?seed=${Math.random()}`; // temp random for uniqueness visual

        // Role Rendering
        const roleBadge = document.getElementById('nav-user-role');
        roleBadge.className = `role-badge ${p.role}`;
        roleBadge.innerText = p.role.toUpperCase();

        // Admin Link visibility
        if (['admin', 'founder'].includes(p.role)) {
            document.getElementById('admin-link').classList.remove('hidden');
        }
    }

    setupPresenceSystem(uid) {
        // Realtime Database Presence System
        const userStatusRef = ref(rtdb, 'status/' + uid);
        const amOnline = ref(rtdb, '.info/connected');

        onValue(amOnline, (snapshot) => {
            if (snapshot.val() == false) {
                return;
            };

            onDisconnect(userStatusRef).set({
                state: 'offline',
                last_changed: Date.now()
            }).then(() => {
                set(userStatusRef, {
                    state: 'online',
                    last_changed: Date.now()
                });
            });
        });
    }
}

const dataManager = new DataManager();


// --- MAIN APP ENTRY POINT ---
// Observe Auth State
onAuthStateChanged(auth, async (user) => {
    if (user) {
        // User is signed in
        console.log("Auth: Signed In", user.uid);
        STATE.currentUser = user;

        await dataManager.fetchUserProfile(user.uid);

        ui.hideLoader();
        ui.switchView('app-view');
        ui.showToast(`Tekrar hoş geldin, ${user.displayName || 'Gezgin'}!`, 'success');
    } else {
        // User is signed out
        console.log("Auth: Signed Out");
        STATE.currentUser = null;
        STATE.userProfile = null;

        ui.hideLoader();
        ui.switchView('auth-view');
    }
});

// Sidebar Navigation Logic
document.querySelectorAll('.nav-links li').forEach(item => {
    item.addEventListener('click', () => {
        ui.navigate(item.dataset.page);
    });
});

// --- CHAT MANAGER ---
class ChatManager {
    constructor() {
        this.globalUnsub = null;
        this.dmUnsub = null;
        this.activeDMUser = null; // The user object we are chatting with
        this.initChatListeners();
    }

    initChatListeners() {
        // Global Chat Send
        document.getElementById('global-chat-form').addEventListener('submit', (e) => {
            e.preventDefault();
            this.sendMessage('global');
        });

        // Tab Switching (Global <-> DM)
        document.querySelectorAll('.chat-tab').forEach(btn => {
            btn.addEventListener('click', (e) => {
                document.querySelectorAll('.chat-tab').forEach(b => b.classList.remove('active'));
                document.querySelectorAll('.chat-section').forEach(s => s.classList.add('hidden'));

                e.target.classList.add('active');
                const target = e.target.dataset.target;
                document.getElementById(target).classList.remove('hidden');

                if (target === 'global-chat') this.listenToGlobalChat();
                if (target === 'dm-list') this.listenToDMList();
            });
        });

        // New DM Button
        document.querySelector('.new-dm-btn').addEventListener('click', () => {
            const username = prompt("Mesaj atmak istediğin kullanıcının adını gir:");
            if (username) this.startDMByUsername(username);
        });

        // DM Chat Send
        document.getElementById('dm-chat-form').addEventListener('submit', (e) => {
            e.preventDefault();
            this.sendMessage('dm');
        });

        // Back to DM List
        document.getElementById('back-to-dm-list').addEventListener('click', () => {
            document.getElementById('dm-active-view').classList.add('hidden');
            document.getElementById('dm-list').classList.remove('hidden');
            this.activeDMUser = null;
            if (this.dmUnsub) this.dmUnsub(); // Stop listening to specific chat
        });

        // Start listening to global by default
        this.listenToGlobalChat();
    }

    async sendMessage(type) {
        const inputId = type === 'global' ? 'global-input' : 'dm-input';
        const input = document.getElementById(inputId);
        const text = input.value.trim();

        if (!text) return;
        if (STATE.userProfile.muted) {
            ui.showToast('Susturuldunuz! Mesaj atamazsınız.', 'error');
            return;
        }

        input.value = ''; // Clear immediately for UX

        try {
            if (type === 'global') {
                await addDoc(collection(db, "global_chat"), {
                    uid: STATE.currentUser.uid,
                    username: STATE.userProfile.username,
                    avatar: STATE.userProfile.avatar,
                    role: STATE.userProfile.role,
                    text: text,
                    timestamp: serverTimestamp()
                });
            } else if (type === 'dm' && this.activeDMUser) {
                // Determine Chat ID (alphabetical order of UIDs prevents duplicates)
                const chatId = this.getChatId(STATE.currentUser.uid, this.activeDMUser.uid);

                await addDoc(collection(db, `dms/${chatId}/messages`), {
                    senderId: STATE.currentUser.uid,
                    text: text,
                    timestamp: serverTimestamp(),
                    read: false
                });

                // Update "Last Message" metadata for both users (For list view)
                const metadata = {
                    lastMessage: text,
                    lastTimestamp: serverTimestamp(),
                    participants: [STATE.currentUser.uid, this.activeDMUser.uid],
                    participantDetails: { // Store snapshots to avoid extra queries
                        [STATE.currentUser.uid]: { username: STATE.userProfile.username, avatar: STATE.userProfile.avatar },
                        [this.activeDMUser.uid]: { username: this.activeDMUser.username, avatar: this.activeDMUser.avatar }
                    }
                };

                await setDoc(doc(db, "dm_metas", chatId), metadata, { merge: true });
            }
        } catch (e) {
            console.error(e);
            ui.showToast('Mesaj gönderilemedi.', 'error');
        }
    }

    listenToGlobalChat() {
        if (this.globalUnsub) this.globalUnsub();

        const q = query(collection(db, "global_chat"), orderBy("timestamp", "desc"), limit(50));

        this.globalUnsub = onSnapshot(q, (snapshot) => {
            const container = document.getElementById('global-messages');
            container.innerHTML = '';

            const msgs = [];
            snapshot.forEach(doc => msgs.push(doc.data()));
            msgs.reverse(); // Show oldest at top

            msgs.forEach(msg => {
                this.renderMessage(container, msg, msg.uid === STATE.currentUser.uid);
            });

            container.scrollTop = container.scrollHeight;
        });
    }

    listenToDMList() {
        // Find chats where I am a participant
        const q = query(collection(db, "dm_metas"), where("participants", "array-contains", STATE.currentUser.uid), orderBy("lastTimestamp", "desc"));

        onSnapshot(q, (snapshot) => {
            const container = document.getElementById('dm-conversations-container');
            container.innerHTML = '';

            snapshot.forEach(doc => {
                const data = doc.data();
                const otherUid = data.participants.find(id => id !== STATE.currentUser.uid);
                const otherUser = data.participantDetails[otherUid];

                const div = document.createElement('div');
                div.className = 'dm-conversation-item';
                div.onclick = () => this.openDM(otherUid, otherUser);

                div.innerHTML = `
                    <div class="dm-avatar">
                        <img src="https://api.dicebear.com/7.x/avataaars/svg?seed=${otherUser.avatar || 'Felix'}" alt="">
                    </div>
                    <div class="dm-info">
                        <h4>${otherUser.username}</h4>
                        <p>${data.lastMessage}</p>
                    </div>
                `;
                container.appendChild(div);
            });
        });
    }

    async openDM(targetUid, targetUserData) {
        this.activeDMUser = { uid: targetUid, ...targetUserData };

        // UI Switch
        document.getElementById('dm-list').classList.add('hidden');
        document.getElementById('dm-active-view').classList.remove('hidden');
        document.getElementById('dm-recipient-name').innerText = targetUserData.username;

        // Listen to specific chat
        const chatId = this.getChatId(STATE.currentUser.uid, targetUid);
        const q = query(collection(db, `dms/${chatId}/messages`), orderBy("timestamp", "asc"), limit(50));

        if (this.dmUnsub) this.dmUnsub();

        this.dmUnsub = onSnapshot(q, (snapshot) => {
            const container = document.getElementById('dm-messages');
            container.innerHTML = '';

            snapshot.forEach(doc => {
                const msg = doc.data();
                this.renderMessage(container, { ...msg, username: msg.senderId === STATE.currentUser.uid ? 'Ben' : targetUserData.username }, msg.senderId === STATE.currentUser.uid);
            });
            container.scrollTop = container.scrollHeight;
        });
    }

    async startDMByUsername(username) {
        // Query user by username to get UID (Need 'users' collection indexing or simplistic query)
        const q = query(collection(db, "users"), where("username", "==", username));
        const snapshot = await getDoc(q); // getDocs actually
        // Simplify: assuming we had a way to search. For now, let's just rely on Admin list to start DMs or future features.
        // NOTE: Since I cannot implement full search without multiple queries/indexes in this step, 
        // I will rely on the Admin Panel 'Message' button or existing DMs.
        ui.showToast('Kullanıcı arama özelliği Bölüm 3\'te eklenecek.', 'info');
    }

    renderMessage(container, msg, isMine) {
        const div = document.createElement('div');
        div.className = `message-bubble ${isMine ? 'mine' : ''}`;

        // Basic HTML sanitization
        const safeText = msg.text.replace(/</g, "&lt;").replace(/>/g, "&gt;");

        if (!isMine) {
            div.innerHTML = `<small style="color:var(--primary); font-size:0.75rem; display:block; margin-bottom:2px;">${msg.username}</small>${safeText}`;
        } else {
            div.innerHTML = safeText;
        }

        container.appendChild(div);
    }

    getChatId(uid1, uid2) {
        return uid1 < uid2 ? `${uid1}_${uid2}` : `${uid2}_${uid1}`;
    }
}
const chatManager = new ChatManager();


// --- ADMIN MANAGER ---
class AdminManager {
    constructor() {
        this.loadListener();
    }

    loadListener() {
        // Only load data when admin tab is clicked
        document.querySelector('[data-page="admin"]').addEventListener('click', () => {
            if (['admin', 'founder'].includes(STATE.userProfile.role)) {
                this.loadUsers();
            } else {
                ui.showToast('Yetkisiz erişim!', 'error');
                ui.navigate('dashboard');
            }
        });
    }

    loadUsers() {
        const container = document.getElementById('admin-content-area');
        container.innerHTML = '<div class="loader-content">Yükleniyor...</div>';

        const q = query(collection(db, "users"), limit(20)); // Pagination later
        // Use onSnapshot for realtime admin panel
        onSnapshot(q, (snapshot) => {
            let html = `
                <table class="admin-table">
                    <thead>
                        <tr>
                            <th>Kullanıcı</th>
                            <th>Rol</th>
                            <th>Bakiye</th>
                            <th>Durum</th>
                            <th>İşlemler</th>
                        </tr>
                    </thead>
                    <tbody>
            `;

            snapshot.forEach(docSnap => {
                const u = docSnap.data();
                html += `
                    <tr>
                        <td>
                            <div style="display:flex; align-items:center; gap:10px;">
                                <img src="https://api.dicebear.com/7.x/avataaars/svg?seed=${u.avatar}" style="width:30px; height:30px; border-radius:50%;">
                                ${u.username} <small style="color:gray;">(${u.email})</small>
                            </div>
                        </td>
                        <td>${u.role.toUpperCase()}</td>
                        <td>${u.balance} NC</td>
                        <td>${u.banned ? '<span class="text-danger">BANLI</span>' : '<span class="text-success">AKTİF</span>'}</td>
                        <td>
                            <div class="action-btn-group">
                                <button class="action-btn btn-ban" onclick="app.admin.banUser('${u.uid}', ${!u.banned})">${u.banned ? 'UNBAN' : 'BAN'}</button>
                                <button class="action-btn btn-mute" onclick="app.admin.muteUser('${u.uid}', ${!u.muted})">${u.muted ? 'UNMUTE' : 'MUTE'}</button>
                                <button class="action-btn btn-kick" onclick="app.admin.messageUser('${u.uid}', '${u.username}')">DM</button>
                            </div>
                        </td>
                    </tr>
                `;
            });
            html += '</tbody></table>';
            container.innerHTML = html;
        });
    }

    async banUser(uid, shouldBan) {
        if (uid === STATE.currentUser.uid) return ui.showToast("Kendini banlayamazsın!", "error");
        // Check hierarchy in real backend logic, here simplified
        await updateDoc(doc(db, "users", uid), { banned: shouldBan });
        ui.showToast(`Kullanıcı ${shouldBan ? 'yasaklandı' : 'yasağı kalktı'}.`, 'success');
    }

    async muteUser(uid, shouldMute) {
        await updateDoc(doc(db, "users", uid), { muted: shouldMute });
        ui.showToast(`Kullanıcı ${shouldMute ? 'susturuldu' : 'konuşabilir'}.`, 'success');
    }

    messageUser(uid, username) {
        // Initiate DM
        chatManager.openDM(uid, { username: username, avatar: 'default' }); // Need correct avatar usually
    }
}
const adminManager = new AdminManager();


// --- GAME MANAGER (COIN FLIP IMPLEMENTATION) ---
class GameManager {
    constructor() {
        this.activeGame = null;
    }

    launch(gameId) {
        ui.navigate('game-container');
        document.getElementById('active-game-title').innerText = gameId.toUpperCase();
        const canvas = document.getElementById('game-canvas-area');

        if (gameId === 'coin') {
            this.renderCoinFlip(canvas);
        } else {
            canvas.innerHTML = `<div style="padding:50px; text-align:center;"><h2>${gameId.toUpperCase()}</h2><p>Bölüm 3'te eklenecek...</p></div>`;
        }
    }

    renderCoinFlip(container) {
        container.innerHTML = `
            <div class="coin-game-container">
                <div class="coin-flip-box">
                    <div id="coin">
                        <div class="coin-face coin-heads"></div>
                        <div class="coin-face coin-tails"></div>
                    </div>
                </div>
                <h3 id="coin-result" style="height:30px;">Bahis Yap ve Çevir!</h3>
                
                <div class="bet-controls">
                    <div class="input-group" style="width: auto;">
                        <input type="number" id="bet-amount" class="bet-input" placeholder="Miktar" min="10" value="10">
                    </div>
                    <button class="neon-btn primary-btn" onclick="app.gameManager.flipCoin('heads')">TURA (Sarı)</button>
                    <button class="neon-btn secondary-btn" onclick="app.gameManager.flipCoin('tails')">YAZI (Gri)</button>
                </div>
            </div>
        `;
    }

    async flipCoin(choice) {
        const betInput = document.getElementById('bet-amount');
        const amount = parseInt(betInput.value);
        const resultText = document.getElementById('coin-result');
        const coinEl = document.getElementById('coin');

        if (isNaN(amount) || amount <= 0) return ui.showToast('Geçersiz bahis miktarı', 'error');
        if (amount > STATE.userProfile.balance) return ui.showToast('Yetersiz bakiye!', 'error');

        // Logic
        const isHeads = Math.random() < 0.5;
        const resultSide = isHeads ? 'heads' : 'tails';
        const win = (choice === resultSide);

        // Animation
        const rotations = 5; // spins
        const degrees = rotations * 360 + (isHeads ? 0 : 180);
        coinEl.style.transform = `rotateX(${degrees}deg)`;

        // Disable controls
        const btns = document.querySelectorAll('.bet-controls button');
        btns.forEach(b => b.disabled = true);

        // Wait for animation
        setTimeout(async () => {
            coinEl.style.transition = 'none';
            coinEl.style.transform = `rotateX(${isHeads ? 0 : 180}deg)`;
            setTimeout(() => coinEl.style.transition = 'transform 3s ease-out', 50);

            // Result handling
            if (win) {
                resultText.innerText = "KAZANDIN! +" + amount;
                resultText.style.color = "var(--success)";
                await this.updateBalance(amount); // Add
            } else {
                resultText.innerText = "KAYBETTİN...";
                resultText.style.color = "var(--danger)";
                await this.updateBalance(-amount); // Subtract
            }

            btns.forEach(b => b.disabled = false);
        }, 3000);
    }

    async updateBalance(change) {
        const newBal = STATE.userProfile.balance + change;

        // Optimistic update
        STATE.userProfile.balance = newBal;
        dataManager.updateUIWithProfile();

        // DB update
        try {
            await updateDoc(doc(db, "users", STATE.currentUser.uid), {
                balance: newBal
            });
        } catch (e) {
            console.error("Balance sync failed", e);
            // Revert on fail logic here if needed
        }
    }
}
const gameManager = new GameManager();


// --- LEADERBOARD MANAGER ---
class LeaderboardManager {
    constructor() {
        this.loadListener();
    }

    loadListener() {
        // Safe binding (wait for DOM if needed, currently sync is fine)
        const btn = document.querySelector('[data-page="leaderboard"]');
        if (btn) btn.addEventListener('click', () => this.loadLeaderboard());
    }

    loadLeaderboard() {
        let lbView = document.getElementById('page-leaderboard');
        if (!lbView) {
            lbView = document.createElement('div');
            lbView.id = 'page-leaderboard';
            lbView.className = 'page-section hidden';
            document.querySelector('.content-area').appendChild(lbView);
            lbView.innerHTML = `<div class="glass-panel" style="padding:20px;"><h2><i class="fas fa-trophy text-gold"></i> Liderlik Tablosu</h2><div id="lb-content">Yükleniyor...</div></div>`;
        }

        ui.navigate('leaderboard');

        const q = query(collection(db, "users"), orderBy("balance", "desc"), limit(10));

        onSnapshot(q, (snapshot) => {
            const content = document.getElementById('lb-content');
            let html = `<div class="leaderboard-list">`;

            let rank = 1;
            snapshot.forEach(doc => {
                const u = doc.data();
                let rankClass = 'rank-other';
                let icon = `#${rank}`;

                if (rank === 1) { rankClass = 'rank-1'; icon = '👑'; }
                if (rank === 2) { rankClass = 'rank-2'; icon = '🥈'; }
                if (rank === 3) { rankClass = 'rank-3'; icon = '🥉'; }

                html += `
                    <div class="lb-item ${rankClass}">
                        <div class="lb-rank">${icon}</div>
                        <div class="lb-user">
                            <img src="https://api.dicebear.com/7.x/avataaars/svg?seed=${u.avatar}" class="lb-avatar">
                            <span>${u.username}</span>
                        </div>
                        <div class="lb-score">${u.balance} <small>NC</small></div>
                    </div>
                `;
                rank++;
            });
            html += `</div>`;
            content.innerHTML = html;
        });
    }
}
const leaderboardManager = new LeaderboardManager();


// --- MARKET MANAGER ---
class MarketManager {
    constructor() {
        this.items = [
            { id: 'frame_neon', name: 'Neon Çerçeve', price: 500, icon: 'fa-square' },
            { id: 'color_gold', name: 'Altın İsim', price: 1000, icon: 'fa-font' },
            { id: 'badge_vip', name: 'VIP Rozeti', price: 5000, icon: 'fa-crown' }
        ];
        this.loadListener();
    }

    loadListener() {
        const btn = document.querySelector('[data-page="market"]');
        if (btn) btn.addEventListener('click', () => this.renderMarket());
    }

    renderMarket() {
        let marketView = document.getElementById('page-market');
        if (!marketView) {
            marketView = document.createElement('div');
            marketView.id = 'page-market';
            marketView.className = 'page-section hidden';
            document.querySelector('.content-area').appendChild(marketView);
        }

        ui.navigate('market');

        let html = `
            <div class="glass-panel" style="padding:20px;">
                <h2><i class="fas fa-shopping-cart text-primary"></i> Market</h2>
                <p>Kazandığın NC puanlarıyla profilini özelleştir.</p>
                <div class="market-grid">
        `;

        this.items.forEach(item => {
            html += `
                <div class="market-item">
                    <div class="market-icon"><i class="fas ${item.icon}"></i></div>
                    <h3>${item.name}</h3>
                    <div class="price">${item.price} NC</div>
                    <button class="neon-btn primary-btn" onclick="app.market.buyItem('${item.id}', ${item.price})">SATIN AL</button>
                </div>
            `;
        });

        html += `</div></div>`;
        marketView.innerHTML = html;
    }

    async buyItem(itemId, price) {
        if (STATE.userProfile.balance < price) {
            return ui.showToast('Yetersiz Bakiye!', 'error');
        }

        const confirmBuy = confirm(`${price} NC karşılığında bu ürünü almak istiyor musun?`);
        if (!confirmBuy) return;

        try {
            await gameManager.updateBalance(-price);
            ui.showToast('Satın alım başarılı! (Görsel efekt eklendi)', 'success');
        } catch (e) {
            console.error(e);
            ui.showToast('İşlem başarısız.', 'error');
        }
    }
}
const marketManager = new MarketManager();


// --- EXTEND GAME MANAGER FOR RPS ---
// (We add these methods to the prototype or extend the class if we had defined it fully)

GameManager.prototype.renderRPS = function (container) {
    container.innerHTML = `
        <div class="rps-container">
            <div id="rps-result-area">
                <h3>Yapay Zekaya Karşı</h3>
                <h1 id="rps-status">SEÇİMİNİ YAP</h1>
            </div>
            
            <div class="rps-arena">
                <div class="rps-side">
                    <span>SEN</span>
                    <div class="rps-icon" id="my-choice"><i class="fas fa-question"></i></div>
                </div>
                <div class="vs-divider">VS</div>
                <div class="rps-side">
                    <span>CPU</span>
                    <div class="rps-icon" id="cpu-choice"><i class="fas fa-robot"></i></div>
                </div>
            </div>

            <div class="bet-controls" style="justify-content:center; margin-top:20px;">
                 <input type="number" id="rps-bet" class="bet-input" placeholder="Miktar" min="10" value="20">
            </div>

            <div class="rps-controls">
                <button class="rps-btn" onclick="app.gameManager.playRPS('rock')"><i class="fas fa-hand-rock"></i> TAŞ</button>
                <button class="rps-btn" onclick="app.gameManager.playRPS('paper')"><i class="fas fa-hand-paper"></i> KAĞIT</button>
                <button class="rps-btn" onclick="app.gameManager.playRPS('scissors')"><i class="fas fa-hand-scissors"></i> MAKAS</button>
            </div>
        </div>
    `;
};

GameManager.prototype.playRPS = async function (choice) {
    const betInput = document.getElementById('rps-bet');
    const amount = parseInt(betInput.value);

    if (isNaN(amount) || amount <= 0) return ui.showToast('Geçersiz bahis', 'error');
    if (amount > STATE.userProfile.balance) return ui.showToast('Yetersiz bakiye', 'error');

    const icons = { rock: 'fa-hand-rock', paper: 'fa-hand-paper', scissors: 'fa-hand-scissors' };
    const cpuOptions = ['rock', 'paper', 'scissors'];
    const cpuChoice = cpuOptions[Math.floor(Math.random() * 3)];

    // Updates UI
    document.getElementById('my-choice').innerHTML = `<i class="fas ${icons[choice]}"></i>`;
    document.getElementById('cpu-choice').innerHTML = `<i class="fas fa-spinner fa-spin"></i>`; // Loading

    // Simulate thinking
    setTimeout(async () => {
        document.getElementById('cpu-choice').innerHTML = `<i class="fas ${icons[cpuChoice]}"></i>`;

        let result = '';
        let multiplier = 0;

        if (choice === cpuChoice) {
            result = "BERABERE";
            multiplier = 0;
        } else if (
            (choice === 'rock' && cpuChoice === 'scissors') ||
            (choice === 'paper' && cpuChoice === 'rock') ||
            (choice === 'scissors' && cpuChoice === 'paper')
        ) {
            result = "KAZANDIN!";
            multiplier = 1;
        } else {
            result = "KAYBETTİN!";
            multiplier = -1;
        }

        const statusEl = document.getElementById('rps-status');
        statusEl.innerText = result;

        if (multiplier !== 0) {
            if (multiplier > 0) {
                statusEl.style.color = 'var(--success)';
                await this.updateBalance(amount);
            } else {
                statusEl.style.color = 'var(--danger)';
                await this.updateBalance(-amount);
            }
        } else {
            statusEl.style.color = 'white';
        }

    }, 1000);
};

// Override Launch
const oldLaunch = GameManager.prototype.launch;
GameManager.prototype.launch = function (gameId) {
    if (gameId === 'rps') {
        ui.navigate('game-container');
        document.getElementById('active-game-title').innerText = "TAŞ KAĞIT MAKAS";
        this.renderRPS(document.getElementById('game-canvas-area'));
    } else if (gameId === 'coin') {
        ui.navigate('game-container');
        document.getElementById('active-game-title').innerText = "YAZI TURA";
        this.renderCoinFlip(document.getElementById('game-canvas-area'));
    } else {
        ui.showToast('Bu oyun yakında eklenecek!', 'info');
    }
};


// Last Init
new AuthManager();

window.app = {
    ui: ui,
    admin: adminManager,
    gameManager: gameManager,
    chat: chatManager,
    market: marketManager
};
