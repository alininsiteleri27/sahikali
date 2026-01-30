// Gerçek Zamanlı Topluluk ve Oyun Platformu - BÖLÜM 1
// Firebase modüler API için gerekli importlar
import { initializeApp } from "https://www.gstatic.com/firebasejs/12.8.0/firebase-app.js";
import { getAnalytics } from "https://www.gstatic.com/firebasejs/12.8.0/firebase-analytics.js";
import {
    getAuth,
    onAuthStateChanged,
    signInWithEmailAndPassword,
    createUserWithEmailAndPassword,
    signOut,
    signInWithPopup,
    GoogleAuthProvider,
    GithubAuthProvider,
    sendPasswordResetEmail
} from "https://www.gstatic.com/firebasejs/12.8.0/firebase-auth.js";
import {
    getFirestore,
    collection,
    addDoc,
    getDocs,
    query,
    where,
    orderBy,
    limit,
    onSnapshot,
    doc,
    setDoc,
    updateDoc,
    deleteDoc,
    getDoc,
    serverTimestamp,
    increment,
    arrayUnion
} from "https://www.gstatic.com/firebasejs/12.8.0/firebase-firestore.js";
import {
    getDatabase,
    ref,
    set,
    onValue,
    push,
    update,
    remove,
    get
} from "https://www.gstatic.com/firebasejs/12.8.0/firebase-database.js";

// Firebase yapılandırma
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

// Firebase'i başlat
const app = initializeApp(firebaseConfig);
const analytics = getAnalytics(app);
const auth = getAuth(app);
const db = getFirestore(app);
const rtdb = getDatabase(app);

console.log("Firebase başarıyla başlatıldı");

// Uygulama durumu
const AppState = {
    currentUser: null,
    userRole: 'guest',
    currentPage: 'dashboard',
    notifications: [],
    onlineUsers: [],
    activeGames: [],
    unreadMessages: 0,
    theme: 'dark',
    isSidebarOpen: true
};

// Uygulama yüklendikten sonra çalışacak ana fonksiyon
document.addEventListener('DOMContentLoaded', function () {
    console.log("DOM yüklendi, uygulama başlatılıyor...");

    // İlk başlatma işlemleri
    initializeAppUI();
    setupEventListeners();

    // Auth state listener
    onAuthStateChanged(auth, (user) => {
        if (user) {
            console.log("Kullanıcı giriş yaptı:", user.email);
            handleUserLogin(user);
        } else {
            console.log("Kullanıcı çıkış yaptı");
            handleUserLogout();
        }
    });

    // Yükleme simülasyonu
    setTimeout(() => {
        document.getElementById('splash-screen').classList.remove('active');
        document.getElementById('app-container').style.display = 'flex';

        // Giriş modalını göster (kullanıcı giriş yapmamışsa)
        if (!auth.currentUser) {
            setTimeout(() => {
                document.getElementById('login-modal').classList.add('active');
            }, 500);
        }
    }, 2500);
});

// Uygulamayı başlat
function initializeAppUI() {
    console.log("Uygulama başlatılıyor...");

    // Temayı kontrol et
    const savedTheme = localStorage.getItem('nexus-theme');
    if (savedTheme) {
        AppState.theme = savedTheme;
        document.body.setAttribute('data-theme', savedTheme);
    } else {
        document.body.setAttribute('data-theme', 'dark');
    }

    // Ekran modunu kontrol et
    updateThemeIcon();

    // Sayfa yönlendirmelerini ayarla
    setupPageNavigation();

    // Bildirim sayacını güncelle
    updateNotificationCount();
}

// Event listener'ları kur
function setupEventListeners() {
    console.log("Event listener'lar kuruluyor...");

    // Tema değiştirme
    document.getElementById('theme-toggle').addEventListener('click', toggleTheme);

    // Tam ekran
    document.getElementById('fullscreen-toggle').addEventListener('click', toggleFullscreen);

    // Bildirimler
    document.getElementById('notification-bell').addEventListener('click', showNotifications);

    // Modal kapatma
    document.querySelectorAll('.modal-close').forEach(btn => {
        btn.addEventListener('click', function () {
            this.closest('.modal').classList.remove('active');
        });
    });

    // Giriş modalı kapatma
    document.getElementById('login-modal').addEventListener('click', function (e) {
        if (e.target === this) {
            this.classList.remove('active');
        }
    });

    // Auth tab'ları
    document.querySelectorAll('.auth-tab').forEach(tab => {
        tab.addEventListener('click', function () {
            const tabId = this.getAttribute('data-tab');

            // Aktif tab'ı güncelle
            document.querySelectorAll('.auth-tab').forEach(t => t.classList.remove('active'));
            this.classList.add('active');

            // Aktif form'u güncelle
            document.querySelectorAll('.auth-form').forEach(form => form.classList.remove('active'));
            document.getElementById(`${tabId}-form`).classList.add('active');
        });
    });

    // Şifre göster/gizle
    document.querySelectorAll('.toggle-password').forEach(btn => {
        btn.addEventListener('click', function () {
            const input = this.parentElement.querySelector('input');
            const icon = this.querySelector('i');

            if (input.type === 'password') {
                input.type = 'text';
                icon.classList.remove('fa-eye');
                icon.classList.add('fa-eye-slash');
            } else {
                input.type = 'password';
                icon.classList.remove('fa-eye-slash');
                icon.classList.add('fa-eye');
            }
        });
    });

    // Giriş formu
    document.getElementById('login-form').addEventListener('submit', function (e) {
        e.preventDefault();
        handleLogin();
    });

    // Kayıt formu
    document.getElementById('register-form').addEventListener('submit', function (e) {
        e.preventDefault();
        handleRegister();
    });

    // Sosyal giriş
    document.querySelector('.btn-social.google').addEventListener('click', () => signInWithSocial('google'));
    document.querySelector('.btn-social.github').addEventListener('click', () => signInWithSocial('github'));

    // Hızlı oyun butonları
    document.querySelectorAll('.btn-game-play').forEach(btn => {
        btn.addEventListener('click', function () {
            const game = this.closest('.game-card').getAttribute('data-game');
            launchGame(game);
        });
    });

    // Çıkış yap
    document.querySelector('.logout-btn').addEventListener('click', handleLogout);

    // Kullanıcı dropdown
    const userProfile = document.querySelector('.user-profile');
    userProfile.addEventListener('click', function (e) {
        e.stopPropagation();
        this.classList.toggle('active');
    });

    // Dropdown dışına tıklama
    document.addEventListener('click', function () {
        userProfile.classList.remove('active');
    });

    // Sidebar toggle
    document.getElementById('toggle-chat-sidebar').addEventListener('click', toggleSidebar);
}

// Tema değiştirme
function toggleTheme() {
    const currentTheme = document.body.getAttribute('data-theme');
    const newTheme = currentTheme === 'dark' ? 'light' : 'dark';

    document.body.setAttribute('data-theme', newTheme);
    AppState.theme = newTheme;
    localStorage.setItem('nexus-theme', newTheme);

    updateThemeIcon();

    // Tema değişikliği bildirimi
    showToast(`Tema ${newTheme === 'dark' ? 'koyu' : 'aydınlık'} moda değiştirildi`, 'success');
}

// Tema ikonunu güncelle
function updateThemeIcon() {
    const icon = document.getElementById('theme-toggle').querySelector('i');
    if (AppState.theme === 'dark') {
        icon.classList.remove('fa-moon');
        icon.classList.add('fa-sun');
    } else {
        icon.classList.remove('fa-sun');
        icon.classList.add('fa-moon');
    }
}

// Tam ekran değiştirme
function toggleFullscreen() {
    if (!document.fullscreenElement) {
        document.documentElement.requestFullscreen().catch(err => {
            console.error('Tam ekran hatası:', err);
        });
    } else {
        if (document.exitFullscreen) {
            document.exitFullscreen();
        }
    }
}

// Bildirimleri göster
function showNotifications() {
    // Bildirim modalını aç
    document.getElementById('notifications-modal').classList.add('active');

    // Bildirim sayacını sıfırla
    AppState.notifications = AppState.notifications.map(notif => ({
        ...notif,
        read: true
    }));

    updateNotificationCount();
}

// Bildirim sayacını güncelle
function updateNotificationCount() {
    const unreadCount = AppState.notifications.filter(n => !n.read).length;
    const notificationElements = document.querySelectorAll('.notification-count, .notification-indicator');

    notificationElements.forEach(el => {
        if (unreadCount > 0) {
            el.textContent = unreadCount;
            el.style.display = 'flex';
        } else {
            el.style.display = 'none';
        }
    });
}

// Sayfa navigasyonu
function setupPageNavigation() {
    // Ana navigasyon
    document.querySelectorAll('.nav-item, .bottom-nav-item').forEach(item => {
        item.addEventListener('click', function () {
            const pageId = this.getAttribute('data-page');
            navigateToPage(pageId);

            // Aktif öğeyi güncelle
            document.querySelectorAll('.nav-item, .bottom-nav-item').forEach(i => i.classList.remove('active'));
            this.classList.add('active');
        });
    });

    // Dropdown menü
    document.querySelectorAll('.dropdown-item[data-action]').forEach(item => {
        item.addEventListener('click', function () {
            const action = this.getAttribute('data-action');
            handleUserAction(action);
        });
    });
}

// Sayfaya git
function navigateToPage(pageId) {
    // Mevcut sayfayı gizle
    document.querySelectorAll('.page').forEach(page => page.classList.remove('active'));

    // Yeni sayfayı göster
    const targetPage = document.getElementById(`${pageId}-page`);
    if (targetPage) {
        targetPage.classList.add('active');
        AppState.currentPage = pageId;

        // Sayfa başlığını güncelle
        updatePageTitle(pageId);
    }
}

// Sayfa başlığını güncelle
function updatePageTitle(pageId) {
    const titles = {
        'dashboard': 'Ana Sayfa',
        'games': 'Oyunlar',
        'chat': 'Sohbet',
        'leaderboard': 'Liderlik Tablosu',
        'market': 'Market',
        'duel': 'Düello'
    };

    const pageTitle = document.querySelector('.page-title');
    if (pageTitle && titles[pageId]) {
        pageTitle.innerHTML = `<i class="fas fa-${getPageIcon(pageId)}"></i> ${titles[pageId]}`;
    }
}

// Sayfa ikonunu al
function getPageIcon(pageId) {
    const icons = {
        'dashboard': 'home',
        'games': 'chess-board',
        'chat': 'comments',
        'leaderboard': 'trophy',
        'market': 'shopping-cart',
        'duel': 'crosshairs'
    };

    return icons[pageId] || 'home';
}

// Kullanıcı eylemlerini yönet
function handleUserAction(action) {
    console.log("Kullanıcı eylemi:", action);

    switch (action) {
        case 'profile':
            navigateToPage('profile');
            break;
        case 'friends':
            showToast('Arkadaşlar sayfası yakında eklenecek', 'info');
            break;
        case 'notifications':
            showNotifications();
            break;
        case 'settings':
            showToast('Ayarlar sayfası yakında eklenecek', 'info');
            break;
        case 'inventory':
            showToast('Envanter sayfası yakında eklenecek', 'info');
            break;
        case 'achievements':
            showToast('Başarılar sayfası yakında eklenecek', 'info');
            break;
        case 'stats':
            showToast('İstatistikler sayfası yakında eklenecek', 'info');
            break;
        default:
            console.log("Bilinmeyen eylem:", action);
    }
}

// Sidebar'ı aç/kapat
function toggleSidebar() {
    const sidebar = document.querySelector('.sidebar-right');
    const toggleBtn = document.getElementById('toggle-chat-sidebar');
    const icon = toggleBtn.querySelector('i');

    if (AppState.isSidebarOpen) {
        sidebar.classList.add('collapsed');
        icon.classList.remove('fa-chevron-right');
        icon.classList.add('fa-chevron-left');
    } else {
        sidebar.classList.remove('collapsed');
        icon.classList.remove('fa-chevron-left');
        icon.classList.add('fa-chevron-right');
    }

    AppState.isSidebarOpen = !AppState.isSidebarOpen;
}

// Kullanıcı girişini yönet
async function handleLogin() {
    try {
        const email = document.getElementById('login-email').value;
        const password = document.getElementById('login-password').value;

        if (!email || !password) {
            showToast('Lütfen tüm alanları doldurun', 'error');
            return;
        }

        // Giriş butonunu devre dışı bırak
        const submitBtn = document.querySelector('#login-form .auth-submit');
        const originalText = submitBtn.innerHTML;
        submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Giriş yapılıyor...';
        submitBtn.disabled = true;

        // Firebase Authentication ile giriş yap
        const userCredential = await signInWithEmailAndPassword(auth, email, password);
        console.log("Giriş başarılı:", userCredential.user);

        // Giriş modalını kapat
        document.getElementById('login-modal').classList.remove('active');

        // Hoş geldin mesajı
        showToast(`Hoş geldiniz, ${userCredential.user.email}`, 'success');

    } catch (error) {
        console.error("Giriş hatası:", error);

        let errorMessage = "Giriş yapılırken bir hata oluştu";
        switch (error.code) {
            case 'auth/invalid-email':
                errorMessage = "Geçersiz e-posta adresi";
                break;
            case 'auth/user-disabled':
                errorMessage = "Bu hesap devre dışı bırakılmış";
                break;
            case 'auth/user-not-found':
                errorMessage = "Bu e-posta adresi ile kayıtlı kullanıcı bulunamadı";
                break;
            case 'auth/wrong-password':
                errorMessage = "Yanlış şifre";
                break;
            case 'auth/too-many-requests':
                errorMessage = "Çok fazla başarısız giriş denemesi. Lütfen daha sonra tekrar deneyin";
                break;
        }

        showToast(errorMessage, 'error');

        // Butonu eski haline getir
        const submitBtn = document.querySelector('#login-form .auth-submit');
        submitBtn.innerHTML = originalText;
        submitBtn.disabled = false;
    }
}

// Kullanıcı kaydını yönet
async function handleRegister() {
    try {
        const username = document.getElementById('register-username').value;
        const email = document.getElementById('register-email').value;
        const password = document.getElementById('register-password').value;
        const passwordConfirm = document.getElementById('register-password-confirm').value;

        // Validasyon
        if (!username || !email || !password || !passwordConfirm) {
            showToast('Lütfen tüm alanları doldurun', 'error');
            return;
        }

        if (password.length < 8) {
            showToast('Şifre en az 8 karakter olmalıdır', 'error');
            return;
        }

        if (password !== passwordConfirm) {
            showToast('Şifreler eşleşmiyor', 'error');
            return;
        }

        if (!document.getElementById('terms-agreement').checked) {
            showToast('Kullanım koşullarını kabul etmelisiniz', 'error');
            return;
        }

        // Kayıt butonunu devre dışı bırak
        const submitBtn = document.querySelector('#register-form .auth-submit');
        const originalText = submitBtn.innerHTML;
        submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Hesap oluşturuluyor...';
        submitBtn.disabled = true;

        // Firebase Authentication ile kayıt ol
        const userCredential = await createUserWithEmailAndPassword(auth, email, password);
        console.log("Kayıt başarılı:", userCredential.user);

        // Firestore'da kullanıcı dokümanı oluştur
        await setDoc(doc(db, 'users', userCredential.user.uid), {
            uid: userCredential.user.uid,
            username: username,
            email: email,
            role: 'member',
            coins: 1000,
            wins: 0,
            losses: 0,
            draws: 0,
            rank: 999,
            streak: 0,
            createdAt: serverTimestamp(),
            lastLogin: serverTimestamp(),
            avatarUrl: `https://ui-avatars.com/api/?name=${encodeURIComponent(username)}&background=7c3aed&color=fff`
        });

        // Giriş modalını kapat
        document.getElementById('login-modal').classList.remove('active');

        // Hoş geldin mesajı
        showToast(`Kayıt başarılı! Hoş geldiniz, ${username}`, 'success');

    } catch (error) {
        console.error("Kayıt hatası:", error);

        let errorMessage = "Kayıt olurken bir hata oluştu";
        switch (error.code) {
            case 'auth/email-already-in-use':
                errorMessage = "Bu e-posta adresi zaten kullanımda";
                break;
            case 'auth/invalid-email':
                errorMessage = "Geçersiz e-posta adresi";
                break;
            case 'auth/operation-not-allowed':
                errorMessage = "E-posta/şifre ile kayıt şu anda devre dışı";
                break;
            case 'auth/weak-password':
                errorMessage = "Şifre çok zayıf. Lütfen daha güçlü bir şifre seçin";
                break;
        }

        showToast(errorMessage, 'error');

        // Butonu eski haline getir
        const submitBtn = document.querySelector('#register-form .auth-submit');
        submitBtn.innerHTML = originalText;
        submitBtn.disabled = false;
    }
}

// Sosyal medya ile giriş
async function signInWithSocial(providerType) {
    try {
        let provider;

        if (providerType === 'google') {
            provider = new GoogleAuthProvider();
        } else if (providerType === 'github') {
            provider = new GithubAuthProvider();
        } else {
            showToast('Desteklenmeyen giriş yöntemi', 'error');
            return;
        }

        const result = await signInWithPopup(auth, provider);
        console.log(`${providerType} ile giriş başarılı:`, result.user);

        // Kullanıcı Firestore'da var mı kontrol et
        const userDoc = await getDoc(doc(db, 'users', result.user.uid));

        if (!userDoc.exists()) {
            // Yeni kullanıcı kaydı oluştur
            const username = result.user.displayName || result.user.email.split('@')[0];

            await setDoc(doc(db, 'users', result.user.uid), {
                uid: result.user.uid,
                username: username,
                email: result.user.email,
                role: 'member',
                coins: 1000,
                wins: 0,
                losses: 0,
                draws: 0,
                rank: 999,
                streak: 0,
                createdAt: serverTimestamp(),
                lastLogin: serverTimestamp(),
                avatarUrl: result.user.photoURL || `https://ui-avatars.com/api/?name=${encodeURIComponent(username)}&background=7c3aed&color=fff`
            });
        }

        // Giriş modalını kapat
        document.getElementById('login-modal').classList.remove('active');

        // Hoş geldin mesajı
        showToast(`Hoş geldiniz, ${result.user.displayName || result.user.email}`, 'success');

    } catch (error) {
        console.error("Sosyal giriş hatası:", error);

        let errorMessage = "Giriş yapılırken bir hata oluştu";
        if (error.code === 'auth/popup-closed-by-user') {
            errorMessage = "Giriş penceresi kapatıldı";
        } else if (error.code === 'auth/cancelled-popup-request') {
            errorMessage = "Giriş işlemi iptal edildi";
        }

        showToast(errorMessage, 'error');
    }
}

// Çıkış yap
async function handleLogout() {
    try {
        await signOut(auth);
        showToast('Başarıyla çıkış yapıldı', 'success');

        // Giriş modalını göster
        setTimeout(() => {
            document.getElementById('login-modal').classList.add('active');
        }, 1000);

    } catch (error) {
        console.error("Çıkış hatası:", error);
        showToast('Çıkış yapılırken bir hata oluştu', 'error');
    }
}

// Kullanıcı giriş yaptığında
async function handleUserLogin(user) {
    try {
        AppState.currentUser = user;

        // Kullanıcı bilgilerini Firestore'dan al
        const userDoc = await getDoc(doc(db, 'users', user.uid));

        if (userDoc.exists()) {
            const userData = userDoc.data();
            AppState.userRole = userData.role;

            // UI'ı güncelle
            updateUserUI(userData);

            // Kullanıcıyı çevrimiçi olarak işaretle
            await updateDoc(doc(db, 'users', user.uid), {
                lastLogin: serverTimestamp(),
                isOnline: true
            });

            // Gerçek zamanlı verileri dinlemeye başla
            startRealtimeListeners();
        }

    } catch (error) {
        console.error("Kullanıcı bilgileri alınırken hata:", error);
    }
}

// Kullanıcı çıkış yaptığında
async function handleUserLogout() {
    try {
        if (AppState.currentUser) {
            // Kullanıcıyı çevrimdışı olarak işaretle
            await updateDoc(doc(db, 'users', AppState.currentUser.uid), {
                isOnline: false,
                lastSeen: serverTimestamp()
            });
        }

        // State'i sıfırla
        AppState.currentUser = null;
        AppState.userRole = 'guest';

        // UI'ı güncelle
        resetUserUI();

    } catch (error) {
        console.error("Çıkış işleminde hata:", error);
    }
}

// Kullanıcı UI'ını güncelle
function updateUserUI(userData) {
    // Avatar
    const avatarImg = document.querySelector('#user-avatar .avatar-img');
    avatarImg.src = userData.avatarUrl || `https://ui-avatars.com/api/?name=${encodeURIComponent(userData.username)}&background=7c3aed&color=fff`;

    // Kullanıcı adı
    document.getElementById('username-display').textContent = userData.username;
    document.getElementById('welcome-username').textContent = userData.username;

    // Rol
    document.getElementById('user-rank').textContent =
        userData.role === 'founder' ? 'Kurucu' :
            userData.role === 'admin' ? 'Admin' : 'Üye';

    // Rol'e göre stil
    const rankElement = document.getElementById('user-rank');
    rankElement.className = 'user-rank';

    if (userData.role === 'founder') {
        rankElement.classList.add('rank-founder');
    } else if (userData.role === 'admin') {
        rankElement.classList.add('rank-admin');
    } else {
        rankElement.classList.add('rank-member');
    }

    // İstatistikleri güncelle
    document.getElementById('stat-streak').textContent = userData.streak || 0;
    document.getElementById('stat-coins').textContent = userData.coins || 0;
    document.getElementById('stat-wins').textContent = userData.wins || 0;
    document.getElementById('stat-rank').textContent = `#${userData.rank || 999}`;

    // Çevrimiçi durumu
    const statusIndicator = document.querySelector('#user-avatar .avatar-status');
    statusIndicator.classList.remove('offline');
    statusIndicator.classList.add('online');
}

// Kullanıcı UI'ını sıfırla
function resetUserUI() {
    // Avatar
    const avatarImg = document.querySelector('#user-avatar .avatar-img');
    avatarImg.src = 'https://ui-avatars.com/api/?name=Guest&background=7c3aed&color=fff';

    // Kullanıcı adı
    document.getElementById('username-display').textContent = 'Misafir';
    document.getElementById('welcome-username').textContent = 'Misafir';

    // Rol
    document.getElementById('user-rank').textContent = 'Üye';
    document.getElementById('user-rank').className = 'user-rank rank-member';

    // İstatistikleri sıfırla
    document.getElementById('stat-streak').textContent = '0';
    document.getElementById('stat-coins').textContent = '0';
    document.getElementById('stat-wins').textContent = '0';
    document.getElementById('stat-rank').textContent = '#999';

    // Çevrimdışı durumu
    const statusIndicator = document.querySelector('#user-avatar .avatar-status');
    statusIndicator.classList.remove('online');
    statusIndicator.classList.add('offline');
}

// Gerçek zamanlı dinleyicileri başlat
function startRealtimeListeners() {
    console.log("Gerçek zamanlı dinleyiciler başlatılıyor...");

    // Çevrimiçi kullanıcıları dinle
    const onlineUsersQuery = query(collection(db, 'users'), where('isOnline', '==', true));

    const onlineUsersUnsubscribe = onSnapshot(onlineUsersQuery, (snapshot) => {
        AppState.onlineUsers = [];
        snapshot.forEach(doc => {
            if (doc.id !== AppState.currentUser?.uid) {
                AppState.onlineUsers.push({
                    id: doc.id,
                    ...doc.data()
                });
            }
        });

        // Çevrimiçi kullanıcıları UI'da güncelle
        updateOnlineUsersUI();
    });

    // Bildirimleri dinle
    if (AppState.currentUser) {
        const notificationsQuery = query(
            collection(db, 'notifications'),
            where('userId', '==', AppState.currentUser.uid),
            orderBy('createdAt', 'desc'),
            limit(20)
        );

        const notificationsUnsubscribe = onSnapshot(notificationsQuery, (snapshot) => {
            AppState.notifications = [];
            snapshot.forEach(doc => {
                AppState.notifications.push({
                    id: doc.id,
                    ...doc.data()
                });
            });

            // Bildirim sayacını güncelle
            updateNotificationCount();
        });
    }

    // Genel sohbeti dinle
    const generalChatQuery = query(
        collection(db, 'chats', 'general', 'messages'),
        orderBy('timestamp', 'desc'),
        limit(5)
    );

    const chatUnsubscribe = onSnapshot(generalChatQuery, (snapshot) => {
        const messages = [];
        snapshot.forEach(doc => {
            messages.push({
                id: doc.id,
                ...doc.data()
            });
        });

        // Sohbet önizlemesini güncelle
        updateChatPreview(messages);
    });

    // Aktif oyunları dinle
    if (AppState.currentUser) {
        const activeGamesQuery = query(
            collection(db, 'games'),
            where('status', '==', 'active'),
            where('players', 'array-contains', AppState.currentUser.uid),
            limit(5)
        );

        const gamesUnsubscribe = onSnapshot(activeGamesQuery, (snapshot) => {
            AppState.activeGames = [];
            snapshot.forEach(doc => {
                AppState.activeGames.push({
                    id: doc.id,
                    ...doc.data()
                });
            });

            // Aktif oyunları UI'da güncelle
            updateActiveGamesUI();
        });
    }
}

// Çevrimiçi kullanıcıları UI'da güncelle
function updateOnlineUsersUI() {
    const onlineCount = AppState.onlineUsers.length;

    // Çevrimiçi sayısını güncelle
    document.querySelectorAll('.online-count').forEach(el => {
        el.textContent = `${onlineCount} çevrimiçi`;
    });

    document.querySelector('.online-count-mini').textContent = onlineCount;

    // Çevrimiçi kullanıcı listesini güncelle
    const onlineUsersList = document.querySelector('.online-users-list');
    if (!onlineUsersList) return;

    onlineUsersList.innerHTML = '';

    // En fazla 5 kullanıcı göster
    const usersToShow = AppState.onlineUsers.slice(0, 5);

    usersToShow.forEach(user => {
        const userElement = document.createElement('div');
        userElement.className = 'online-user';

        // Rol badge'ini belirle
        let badge = '';
        if (user.role === 'founder') {
            badge = '<span class="user-badge-mini founder">K</span>';
        } else if (user.role === 'admin') {
            badge = '<span class="user-badge-mini admin">A</span>';
        }

        userElement.innerHTML = `
            <div class="user-avatar-mini">
                <img src="${user.avatarUrl || `https://ui-avatars.com/api/?name=${encodeURIComponent(user.username)}&background=3b82f6&color=fff`}" alt="${user.username}">
                <span class="user-status-mini online"></span>
            </div>
            <span class="username-mini">${user.username}</span>
            ${badge}
        `;

        onlineUsersList.appendChild(userElement);
    });

    // Çevrimiçi arkadaşları güncelle
    updateOnlineFriendsUI();
}

// Çevrimiçi arkadaşları UI'da güncelle
function updateOnlineFriendsUI() {
    const friendsList = document.getElementById('online-friends-list');
    if (!friendsList) return;

    // Basit bir demo - gerçek uygulamada arkadaşlık sistemi olacak
    if (AppState.onlineUsers.length === 0) {
        return;
    }

    // İlk 3 çevrimiçi kullanıcıyı arkadaş olarak göster
    const demoFriends = AppState.onlineUsers.slice(0, 3);

    friendsList.innerHTML = '';

    demoFriends.forEach(friend => {
        const friendElement = document.createElement('div');
        friendElement.className = 'friend-item';

        friendElement.innerHTML = `
            <div class="friend-avatar">
                <img src="${friend.avatarUrl || `https://ui-avatars.com/api/?name=${encodeURIComponent(friend.username)}&background=3b82f6&color=fff`}" alt="${friend.username}">
                <span class="friend-status online"></span>
            </div>
            <div class="friend-info">
                <span class="friend-name">${friend.username}</span>
                <span class="friend-status-text">${friend.status || 'Çevrimiçi'}</span>
            </div>
            <div class="friend-actions">
                <button class="btn-icon small" title="Mesaj gönder">
                    <i class="fas fa-comment"></i>
                </button>
                <button class="btn-icon small" title="Düelloya davet et">
                    <i class="fas fa-crosshairs"></i>
                </button>
            </div>
        `;

        friendsList.appendChild(friendElement);
    });

    // Çevrimiçi sayısını güncelle
    document.querySelector('.online-count').textContent = `${demoFriends.length} çevrimiçi`;
}

// Aktif oyunları UI'da güncelle
function updateActiveGamesUI() {
    const gamesList = document.getElementById('active-games-list');
    if (!gamesList) return;

    if (AppState.activeGames.length === 0) {
        return;
    }

    gamesList.innerHTML = '';

    AppState.activeGames.forEach(game => {
        const gameElement = document.createElement('div');
        gameElement.className = 'active-game-item';

        // Oyun tipine göre ikon
        let gameIcon = 'fa-gamepad';
        let gameName = 'Bilinmeyen Oyun';

        if (game.type === 'chess') {
            gameIcon = 'fa-chess-king';
            gameName = 'Satranç';
        } else if (game.type === '2048') {
            gameIcon = 'fa-th-large';
            gameName = '2048';
        } else if (game.type === 'rps') {
            gameIcon = 'fa-hand-scissors';
            gameName = 'Taş-Kağıt-Makas';
        }

        gameElement.innerHTML = `
            <div class="active-game-icon">
                <i class="fas ${gameIcon}"></i>
            </div>
            <div class="active-game-info">
                <h4>${gameName}</h4>
                <p>${game.players.length} oyuncu</p>
            </div>
            <div class="active-game-actions">
                <button class="btn-small" data-game-id="${game.id}">
                    <i class="fas fa-play"></i>
                    Devam Et
                </button>
            </div>
        `;

        gamesList.appendChild(gameElement);
    });
}

// Sohbet önizlemesini güncelle
function updateChatPreview(messages) {
    const chatPreview = document.getElementById('general-chat-preview');
    if (!chatPreview) return;

    // Mesajları ters çevir (en yeniler altta)
    const reversedMessages = [...messages].reverse();

    chatPreview.innerHTML = '';

    reversedMessages.forEach(message => {
        const messageElement = document.createElement('div');
        messageElement.className = 'chat-message-preview';

        // Zaman formatı
        let timeText = 'şimdi';
        if (message.timestamp) {
            const now = new Date();
            const msgTime = message.timestamp.toDate();
            const diffMs = now - msgTime;
            const diffMins = Math.floor(diffMs / 60000);

            if (diffMins < 1) {
                timeText = 'şimdi';
            } else if (diffMins < 60) {
                timeText = `${diffMins} dk önce`;
            } else {
                timeText = msgTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
            }
        }

        messageElement.innerHTML = `
            <div class="message-avatar">
                <img src="${message.avatarUrl || `https://ui-avatars.com/api/?name=${encodeURIComponent(message.senderName)}&background=3b82f6&color=fff`}" alt="${message.senderName}">
            </div>
            <div class="message-preview-content">
                <div class="message-preview-header">
                    <span class="message-sender">${message.senderName}</span>
                    <span class="message-time">${timeText}</span>
                </div>
                <p class="message-preview-text">${message.text}</p>
            </div>
        `;

        chatPreview.appendChild(messageElement);
    });
}

// Oyunu başlat ve diğer oyun fonksiyonları SİLİNDİ (Aşağıdaki tam implementasyonlar kullanılacak)
// Bu alan temizlendi.

// Toast bildirimi göster
function showToast(message, type = 'info') {
    // Toast konteyneri oluştur veya bul
    let toastContainer = document.getElementById('toast-container');
    if (!toastContainer) {
        toastContainer = document.createElement('div');
        toastContainer.id = 'toast-container';
        document.body.appendChild(toastContainer);
    }

    // Toast öğesi oluştur
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;

    // İkon seç
    let icon = 'fa-info-circle';
    if (type === 'success') icon = 'fa-check-circle';
    if (type === 'error') icon = 'fa-exclamation-circle';
    if (type === 'warning') icon = 'fa-exclamation-triangle';

    toast.innerHTML = `
        <div class="toast-icon">
            <i class="fas ${icon}"></i>
        </div>
        <div class="toast-content">
            <p>${message}</p>
        </div>
        <button class="toast-close">
            <i class="fas fa-times"></i>
        </button>
    `;

    toastContainer.appendChild(toast);

    // Kapatma butonu
    toast.querySelector('.toast-close').addEventListener('click', function () {
        toast.remove();
    });

    // Otomatik kapanma
    setTimeout(() => {
        if (toast.parentNode) {
            toast.classList.add('fade-out');
            setTimeout(() => {
                if (toast.parentNode) {
                    toast.remove();
                }
            }, 300);
        }
    }, 5000);
}

// Hata yakalama
window.addEventListener('error', function (e) {
    console.error('Global hata yakalandı:', e.error);
    showToast('Bir hata oluştu. Lütfen sayfayı yenileyin.', 'error');
});

// Promise hatalarını yakala
window.addEventListener('unhandledrejection', function (e) {
    console.error('Promise hatası yakalandı:', e.reason);
    showToast('Bir işlem hatası oluştu.', 'error');
});

// Uygulama durumunu global yap (debug için)
window.AppState = AppState;
window.firebaseApp = app;

console.log("Uygulama başlatma tamamlandı");
// BÖLÜM 2: Sohbet Sistemi, Oyun Mantıkları ve Liderlik Tablosu

// Sohbet Sistemi
class ChatSystem {
    constructor() {
        this.currentChat = 'general';
        this.currentDM = null;
        this.messages = new Map();
        this.unreadCounts = new Map();
        this.lastMessageTimestamps = new Map();
        this.messageListeners = new Map();
    }

    // Sohbet odalarını başlat
    async initializeChat() {
        try {
            console.log("Sohbet sistemi başlatılıyor...");

            // Genel sohbet odasını oluştur (eğer yoksa)
            await this.ensureChatRoomExists('general', 'Genel Sohbet', 'fas fa-globe');

            // Oyun odalarını oluştur
            const gameRooms = [
                { id: 'chess', name: 'Satranç Topluluğu', icon: 'fas fa-chess-king' },
                { id: '2048', name: '2048 Severler', icon: 'fas fa-th-large' },
                { id: 'rps', name: 'Taş-Kağıt-Makas', icon: 'fas fa-hand-scissors' },
                { id: 'wheel', name: 'Çarkıfelek', icon: 'fas fa-sync-alt' },
                { id: 'coin', name: 'Yazı-Tura', icon: 'fas fa-coins' }
            ];

            for (const room of gameRooms) {
                await this.ensureChatRoomExists(room.id, room.name, room.icon);
            }

            // Sohbet arayüzünü başlat
            this.initializeChatUI();

            // Gerçek zamanlı mesaj dinleyicilerini başlat
            this.startMessageListeners();

            console.log("Sohbet sistemi başarıyla başlatıldı");

        } catch (error) {
            console.error("Sohbet başlatma hatası:", error);
            showToast('Sohbet sistemi başlatılırken bir hata oluştu', 'error');
        }
    }

    // Sohbet odasının var olduğundan emin ol
    async ensureChatRoomExists(roomId, roomName, roomIcon) {
        try {
            const roomRef = doc(db, 'chatRooms', roomId);
            const roomDoc = await getDoc(roomRef);

            if (!roomDoc.exists()) {
                await setDoc(roomRef, {
                    id: roomId,
                    name: roomName,
                    icon: roomIcon,
                    createdAt: serverTimestamp(),
                    createdBy: 'system',
                    isPublic: true,
                    memberCount: 0,
                    lastActivity: serverTimestamp()
                });

                console.log(`Sohbet odası oluşturuldu: ${roomName}`);
            }
        } catch (error) {
            console.error(`Sohbet odası oluşturma hatası (${roomId}):`, error);
        }
    }

    // Sohbet arayüzünü başlat
    initializeChatUI() {
        console.log("Sohbet arayüzü başlatılıyor...");

        // Sohbet sekme değiştirme
        document.querySelectorAll('.chat-tab').forEach(tab => {
            tab.addEventListener('click', () => {
                const tabType = tab.getAttribute('data-tab');
                this.switchChatTab(tabType);
            });
        });

        // Sohbet odası seçme
        document.addEventListener('click', (e) => {
            const roomItem = e.target.closest('.chat-room-item');
            if (roomItem) {
                const roomId = roomItem.getAttribute('data-room-id');
                this.joinChatRoom(roomId);
            }

            const dmItem = e.target.closest('.dm-user-item');
            if (dmItem) {
                const userId = dmItem.getAttribute('data-user-id');
                this.startDM(userId);
            }
        });

        // Mesaj gönderme
        const sendMessageBtn = document.querySelector('.chat-input-send');
        const messageInput = document.querySelector('.chat-input');

        if (sendMessageBtn && messageInput) {
            sendMessageBtn.addEventListener('click', () => this.sendMessage());

            messageInput.addEventListener('keypress', (e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    this.sendMessage();
                }
            });
        }

        // İlk sohbet odasını yükle
        this.loadChatRooms();

        // DM listesini yükle
        this.loadDMList();
    }

    // Sohbet sekmesini değiştir
    switchChatTab(tabType) {
        console.log(`Sohbet sekmesi değiştiriliyor: ${tabType}`);

        // Aktif sekmeyi güncelle
        document.querySelectorAll('.chat-tab').forEach(tab => {
            tab.classList.remove('active');
        });
        document.querySelector(`.chat-tab[data-tab="${tabType}"]`).classList.add('active');

        // İçeriği değiştir
        document.querySelectorAll('.chat-tab-content').forEach(content => {
            content.style.display = 'none';
        });
        document.getElementById(`chat-${tabType}`).style.display = 'block';

        // Eğer DM sekmesiyse ve bir DM seçili değilse, boş durum göster
        if (tabType === 'dm' && !this.currentDM) {
            this.showEmptyDMState();
        }
    }

    // Sohbet odalarını yükle
    async loadChatRooms() {
        try {
            const roomsQuery = query(
                collection(db, 'chatRooms'),
                where('isPublic', '==', true),
                orderBy('lastActivity', 'desc')
            );

            const unsubscribe = onSnapshot(roomsQuery, (snapshot) => {
                const roomsList = document.querySelector('.chat-rooms-list');
                if (!roomsList) return;

                roomsList.innerHTML = '';

                snapshot.forEach(doc => {
                    const room = doc.data();
                    const roomElement = this.createChatRoomElement(room);
                    roomsList.appendChild(roomElement);
                });

                // İlk odaya katıl
                if (snapshot.docs.length > 0 && !this.currentChat) {
                    const firstRoom = snapshot.docs[0].data();
                    this.joinChatRoom(firstRoom.id);
                }
            });

            // Dinleyiciyi kaydet
            this.messageListeners.set('chatRooms', unsubscribe);

        } catch (error) {
            console.error("Sohbet odaları yükleme hatası:", error);
            showToast('Sohbet odaları yüklenirken bir hata oluştu', 'error');
        }
    }

    // Sohbet odası elementi oluştur
    createChatRoomElement(room) {
        const div = document.createElement('div');
        div.className = 'chat-room-item';
        div.setAttribute('data-room-id', room.id);

        if (this.currentChat === room.id) {
            div.classList.add('active');
        }

        const onlineCount = Math.floor(Math.random() * 100) + 1; // Demo için rastgele sayı

        div.innerHTML = `
            <div class="chat-room-icon">
                <i class="${room.icon}"></i>
            </div>
            <div class="chat-room-info">
                <div class="chat-room-name">${room.name}</div>
                <div class="chat-room-stats">
                    <span class="chat-room-online">${onlineCount} çevrimiçi</span>
                    <span class="chat-room-last-activity">${this.formatLastActivity(room.lastActivity)}</span>
                </div>
            </div>
            <span class="chat-room-unread">${this.getUnreadCount(room.id)}</span>
        `;

        return div;
    }

    // DM listesini yükle
    async loadDMList() {
        try {
            if (!AppState.currentUser) return;

            // Kullanıcının DM'lerini al
            const dmsQuery = query(
                collection(db, 'users', AppState.currentUser.uid, 'dms'),
                orderBy('lastMessageTime', 'desc')
            );

            const unsubscribe = onSnapshot(dmsQuery, async (snapshot) => {
                const dmList = document.querySelector('.dm-list-container');
                if (!dmList) return;

                dmList.innerHTML = `
                    <input type="text" class="dm-search" placeholder="Kullanıcı ara...">
                    <div class="dm-list" id="dm-user-list"></div>
                `;

                const dmUserList = document.getElementById('dm-user-list');

                // Arama fonksiyonelliği
                const searchInput = dmList.querySelector('.dm-search');
                searchInput.addEventListener('input', (e) => {
                    this.filterDMList(e.target.value);
                });

                for (const doc of snapshot.docs) {
                    const dmData = doc.data();
                    const otherUserId = dmData.participants.find(id => id !== AppState.currentUser.uid);

                    if (otherUserId) {
                        try {
                            const userDoc = await getDoc(doc(db, 'users', otherUserId));
                            if (userDoc.exists()) {
                                const userData = userDoc.data();
                                const dmElement = this.createDMUserElement(userData, dmData);
                                dmUserList.appendChild(dmElement);
                            }
                        } catch (error) {
                            console.error("DM kullanıcı bilgisi alma hatası:", error);
                        }
                    }
                }

                // Boş durum
                if (snapshot.empty) {
                    dmUserList.innerHTML = `
                        <div class="empty-state">
                            <i class="fas fa-comment-slash"></i>
                            <p>Henüz özel mesajınız yok</p>
                            <button class="btn-text" id="start-new-dm">Yeni Mesaj Başlat</button>
                        </div>
                    `;

                    document.getElementById('start-new-dm').addEventListener('click', () => {
                        this.showNewDMModal();
                    });
                }
            });

            // Dinleyiciyi kaydet
            this.messageListeners.set('dms', unsubscribe);

        } catch (error) {
            console.error("DM listesi yükleme hatası:", error);
        }
    }

    // DM kullanıcı elementi oluştur
    createDMUserElement(userData, dmData) {
        const div = document.createElement('div');
        div.className = 'dm-user-item';
        div.setAttribute('data-user-id', userData.uid);

        if (this.currentDM === userData.uid) {
            div.classList.add('active');
        }

        const lastMessage = dmData.lastMessage || 'Mesaj yok';
        const lastMessageTime = dmData.lastMessageTime ? this.formatMessageTime(dmData.lastMessageTime.toDate()) : '';
        const unreadCount = dmData.unreadCount || 0;
        const isOnline = userData.isOnline || false;

        div.innerHTML = `
            <div class="dm-user-avatar">
                <img src="${userData.avatarUrl || `https://ui-avatars.com/api/?name=${encodeURIComponent(userData.username)}&background=3b82f6&color=fff`}" alt="${userData.username}">
                <span class="dm-user-status ${isOnline ? 'online' : 'offline'}"></span>
            </div>
            <div class="dm-user-info">
                <div class="dm-user-name">${userData.username}</div>
                <div class="dm-user-last-message">${lastMessage}</div>
            </div>
            <div class="dm-user-meta">
                <div class="dm-user-time">${lastMessageTime}</div>
                ${unreadCount > 0 ? `<span class="dm-user-unread">${unreadCount}</span>` : ''}
            </div>
        `;

        return div;
    }

    // DM listesini filtrele
    filterDMList(searchTerm) {
        const dmItems = document.querySelectorAll('.dm-user-item');
        const searchLower = searchTerm.toLowerCase();

        dmItems.forEach(item => {
            const userName = item.querySelector('.dm-user-name').textContent.toLowerCase();
            const lastMessage = item.querySelector('.dm-user-last-message').textContent.toLowerCase();

            if (userName.includes(searchLower) || lastMessage.includes(searchLower)) {
                item.style.display = 'flex';
            } else {
                item.style.display = 'none';
            }
        });
    }

    // Boş DM durumunu göster
    showEmptyDMState() {
        const chatMain = document.querySelector('.chat-main');
        if (!chatMain) return;

        chatMain.innerHTML = `
            <div class="empty-dm-state">
                <i class="fas fa-comments"></i>
                <h3>Özel Mesajlar</h3>
                <p>Bir kullanıcıyı seçerek özel mesajlaşmaya başlayın</p>
                <button class="btn-primary" id="start-dm-btn">
                    <i class="fas fa-plus"></i>
                    Yeni Mesaj
                </button>
            </div>
        `;

        document.getElementById('start-dm-btn').addEventListener('click', () => {
            this.showNewDMModal();
        });
    }

    // Yeni DM modalını göster
    showNewDMModal() {
        const modal = document.createElement('div');
        modal.className = 'modal active';
        modal.id = 'new-dm-modal';

        modal.innerHTML = `
            <div class="modal-content">
                <div class="modal-header">
                    <h2><i class="fas fa-user-plus"></i> Yeni Özel Mesaj</h2>
                    <button class="modal-close">
                        <i class="fas fa-times"></i>
                    </button>
                </div>
                <div class="modal-body">
                    <div class="form-group">
                        <label for="dm-search-user">
                            <i class="fas fa-search"></i>
                            Kullanıcı Ara
                        </label>
                        <input type="text" id="dm-search-user" placeholder="Kullanıcı adı veya e-posta...">
                    </div>
                    <div class="search-results" id="dm-search-results">
                        <!-- Arama sonuçları buraya gelecek -->
                    </div>
                </div>
            </div>
        `;

        document.body.appendChild(modal);

        // Modal kapatma
        modal.querySelector('.modal-close').addEventListener('click', () => {
            modal.remove();
        });

        modal.addEventListener('click', (e) => {
            if (e.target === modal) {
                modal.remove();
            }
        });

        // Arama fonksiyonelliği
        const searchInput = document.getElementById('dm-search-user');
        searchInput.addEventListener('input', (e) => {
            this.searchUsersForDM(e.target.value);
        });
    }

    // DM için kullanıcı ara
    async searchUsersForDM(searchTerm) {
        try {
            const resultsContainer = document.getElementById('dm-search-results');
            if (!resultsContainer || !searchTerm.trim()) {
                resultsContainer.innerHTML = '';
                return;
            }

            // Firestore'da kullanıcı ara
            const usersQuery = query(
                collection(db, 'users'),
                where('username', '>=', searchTerm),
                where('username', '<=', searchTerm + '\uf8ff'),
                limit(10)
            );

            const snapshot = await getDocs(usersQuery);

            resultsContainer.innerHTML = '';

            if (snapshot.empty) {
                resultsContainer.innerHTML = '<p class="no-results">Kullanıcı bulunamadı</p>';
                return;
            }

            snapshot.forEach(doc => {
                const userData = doc.data();

                // Kendi kullanıcımızı gösterme
                if (userData.uid === AppState.currentUser.uid) return;

                const userElement = document.createElement('div');
                userElement.className = 'dm-search-result';
                userElement.innerHTML = `
                    <div class="search-result-avatar">
                        <img src="${userData.avatarUrl || `https://ui-avatars.com/api/?name=${encodeURIComponent(userData.username)}&background=3b82f6&color=fff`}" alt="${userData.username}">
                    </div>
                    <div class="search-result-info">
                        <h4>${userData.username}</h4>
                        <p>${userData.role === 'founder' ? 'Kurucu' : userData.role === 'admin' ? 'Admin' : 'Üye'}</p>
                    </div>
                    <button class="btn-small start-dm-btn" data-user-id="${userData.uid}">
                        <i class="fas fa-comment"></i>
                        Mesaj Gönder
                    </button>
                `;

                resultsContainer.appendChild(userElement);
            });

            // DM başlatma butonları
            document.querySelectorAll('.start-dm-btn').forEach(btn => {
                btn.addEventListener('click', (e) => {
                    const userId = e.currentTarget.getAttribute('data-user-id');
                    this.startDM(userId);
                    document.getElementById('new-dm-modal').remove();
                });
            });

        } catch (error) {
            console.error("Kullanıcı arama hatası:", error);
            showToast('Kullanıcı aranırken bir hata oluştu', 'error');
        }
    }

    // Sohbet odasına katıl
    async joinChatRoom(roomId) {
        try {
            console.log(`Sohbet odasına katılınıyor: ${roomId}`);

            // Önceki odadan ayrıl
            this.leaveCurrentChat();

            // Yeni odayı ayarla
            this.currentChat = roomId;
            this.currentDM = null;

            // UI'ı güncelle
            this.updateChatUIForRoom(roomId);

            // Mesajları yükle
            await this.loadMessages(roomId);

            // Gerçek zamanlı mesaj dinleyicisini başlat
            this.startRoomMessageListener(roomId);

            // Okunmamış mesaj sayacını sıfırla
            this.resetUnreadCount(roomId);

            // Kullanıcıyı odada aktif olarak işaretle
            if (AppState.currentUser) {
                await updateDoc(doc(db, 'chatRooms', roomId), {
                    lastActivity: serverTimestamp(),
                    memberCount: increment(1)
                });
            }

        } catch (error) {
            console.error("Sohbet odasına katılma hatası:", error);
            showToast('Sohbet odasına katılırken bir hata oluştu', 'error');
        }
    }

    // DM başlat
    async startDM(userId) {
        try {
            console.log(`DM başlatılıyor: ${userId}`);

            // Önceki sohbetten ayrıl
            this.leaveCurrentChat();

            // Yeni DM'yi ayarla
            this.currentDM = userId;
            this.currentChat = null;

            // UI'ı güncelle
            this.updateChatUIForDM(userId);

            // DM mesajlarını yükle
            await this.loadDMMessages(userId);

            // Gerçek zamanlı DM dinleyicisini başlat
            this.startDMMessageListener(userId);

            // Okunmamış mesaj sayacını sıfırla
            this.resetDMUnreadCount(userId);

        } catch (error) {
            console.error("DM başlatma hatası:", error);
            showToast('Özel mesaj başlatılırken bir hata oluştu', 'error');
        }
    }

    // Mevcut sohbetten ayrıl
    leaveCurrentChat() {
        // Eğer bir sohbet odasındaysa
        if (this.currentChat && AppState.currentUser) {
            // Üye sayısını azalt
            updateDoc(doc(db, 'chatRooms', this.currentChat), {
                memberCount: increment(-1)
            }).catch(console.error);

            // Mesaj dinleyicisini durdur
            const listener = this.messageListeners.get(`room-${this.currentChat}`);
            if (listener) {
                listener();
                this.messageListeners.delete(`room-${this.currentChat}`);
            }
        }

        // Eğer DM'deyse
        if (this.currentDM) {
            // DM dinleyicisini durdur
            const listener = this.messageListeners.get(`dm-${this.currentDM}`);
            if (listener) {
                listener();
                this.messageListeners.delete(`dm-${this.currentDM}`);
            }
        }
    }

    // Sohbet odası UI'ını güncelle
    async updateChatUIForRoom(roomId) {
        try {
            // Oda bilgilerini al
            const roomDoc = await getDoc(doc(db, 'chatRooms', roomId));
            if (!roomDoc.exists()) return;

            const roomData = roomDoc.data();

            // Header'ı güncelle
            const chatHeader = document.querySelector('.chat-header');
            if (chatHeader) {
                chatHeader.innerHTML = `
                    <div class="chat-header-info">
                        <div class="chat-header-icon">
                            <i class="${roomData.icon}"></i>
                        </div>
                        <div class="chat-header-text">
                            <h3>${roomData.name}</h3>
                            <p>
                                <i class="fas fa-users"></i>
                                <span id="room-member-count">${roomData.memberCount || 0} çevrimiçi</span>
                                <i class="fas fa-comment" style="margin-left: 15px;"></i>
                                <span>Genel Sohbet</span>
                            </p>
                        </div>
                    </div>
                    <div class="chat-header-actions">
                        <button class="btn-icon" title="Odadaki kullanıcılar">
                            <i class="fas fa-users"></i>
                        </button>
                        <button class="btn-icon" title="Sohbet ayarları">
                            <i class="fas fa-cog"></i>
                        </button>
                    </div>
                `;
            }

            // Oda öğelerini aktif yap
            document.querySelectorAll('.chat-room-item').forEach(item => {
                item.classList.remove('active');
                if (item.getAttribute('data-room-id') === roomId) {
                    item.classList.add('active');
                }
            });

            // DM öğelerini temizle
            document.querySelectorAll('.dm-user-item').forEach(item => {
                item.classList.remove('active');
            });

        } catch (error) {
            console.error("Sohbet odası UI güncelleme hatası:", error);
        }
    }

    // DM UI'ını güncelle
    async updateChatUIForDM(userId) {
        try {
            // Kullanıcı bilgilerini al
            const userDoc = await getDoc(doc(db, 'users', userId));
            if (!userDoc.exists()) return;

            const userData = userDoc.data();

            // Header'ı güncelle
            const chatHeader = document.querySelector('.chat-header');
            if (chatHeader) {
                chatHeader.innerHTML = `
                    <div class="chat-header-info">
                        <div class="chat-header-icon">
                            <img src="${userData.avatarUrl || `https://ui-avatars.com/api/?name=${encodeURIComponent(userData.username)}&background=3b82f6&color=fff`}" alt="${userData.username}" style="width: 100%; height: 100%; border-radius: 50%;">
                        </div>
                        <div class="chat-header-text">
                            <h3>${userData.username}</h3>
                            <p>
                                <span class="user-status-dot ${userData.isOnline ? 'online' : 'offline'}"></span>
                                <span>${userData.isOnline ? 'Çevrimiçi' : 'Çevrimdışı'}</span>
                                <i class="fas fa-lock" style="margin-left: 15px;"></i>
                                <span>Özel Mesaj</span>
                            </p>
                        </div>
                    </div>
                    <div class="chat-header-actions">
                        <button class="btn-icon" title="Kullanıcı profili">
                            <i class="fas fa-user"></i>
                        </button>
                        <button class="btn-icon" title="DM ayarları">
                            <i class="fas fa-cog"></i>
                        </button>
                    </div>
                `;
            }

            // DM öğelerini aktif yap
            document.querySelectorAll('.dm-user-item').forEach(item => {
                item.classList.remove('active');
                if (item.getAttribute('data-user-id') === userId) {
                    item.classList.add('active');
                }
            });

            // Oda öğelerini temizle
            document.querySelectorAll('.chat-room-item').forEach(item => {
                item.classList.remove('active');
            });

        } catch (error) {
            console.error("DM UI güncelleme hatası:", error);
        }
    }

    // Mesajları yükle
    async loadMessages(roomId) {
        try {
            const messagesContainer = document.querySelector('.chat-messages');
            if (!messagesContainer) return;

            messagesContainer.innerHTML = '<div class="loading-messages">Mesajlar yükleniyor...</div>';

            const messagesQuery = query(
                collection(db, 'chatRooms', roomId, 'messages'),
                orderBy('timestamp', 'desc'),
                limit(50)
            );

            const snapshot = await getDocs(messagesQuery);

            // Mesajları ters çevir (en eskiden en yeniye)
            const messages = [];
            snapshot.forEach(doc => {
                messages.unshift({
                    id: doc.id,
                    ...doc.data()
                });
            });

            // Mesajları görüntüle
            this.displayMessages(messages);

        } catch (error) {
            console.error("Mesaj yükleme hatası:", error);
            showToast('Mesajlar yüklenirken bir hata oluştu', 'error');
        }
    }

    // DM mesajlarını yükle
    async loadDMMessages(userId) {
        try {
            if (!AppState.currentUser) return;

            const messagesContainer = document.querySelector('.chat-messages');
            if (!messagesContainer) return;

            messagesContainer.innerHTML = '<div class="loading-messages">Mesajlar yükleniyor...</div>';

            // DM koleksiyonunu bul veya oluştur
            const dmId = [AppState.currentUser.uid, userId].sort().join('_');

            const messagesQuery = query(
                collection(db, 'dms', dmId, 'messages'),
                orderBy('timestamp', 'desc'),
                limit(50)
            );

            const snapshot = await getDocs(messagesQuery);

            // Mesajları ters çevir
            const messages = [];
            snapshot.forEach(doc => {
                messages.unshift({
                    id: doc.id,
                    ...doc.data()
                });
            });

            // Mesajları görüntüle
            this.displayMessages(messages, true);

        } catch (error) {
            console.error("DM mesaj yükleme hatası:", error);
            showToast('Özel mesajlar yüklenirken bir hata oluştu', 'error');
        }
    }

    // Mesajları görüntüle
    displayMessages(messages, isDM = false) {
        const messagesContainer = document.querySelector('.chat-messages');
        if (!messagesContainer) return;

        messagesContainer.innerHTML = '';

        if (messages.length === 0) {
            messagesContainer.innerHTML = `
                <div class="empty-messages">
                    <i class="fas fa-comment-slash"></i>
                    <p>Henüz mesaj yok</p>
                    <p class="empty-subtitle">İlk mesajı siz gönderin!</p>
                </div>
            `;
            return;
        }

        let lastSender = null;
        let lastTimestamp = null;

        messages.forEach((message, index) => {
            const messageElement = this.createMessageElement(message, isDM, lastSender, lastTimestamp);
            messagesContainer.appendChild(messageElement);

            lastSender = message.senderId;
            lastTimestamp = message.timestamp;
        });

        // En altı kaydır
        messagesContainer.scrollTop = messagesContainer.scrollHeight;
    }

    // Mesaj elementi oluştur
    createMessageElement(message, isDM, lastSender, lastTimestamp) {
        const isCurrentUser = message.senderId === AppState.currentUser?.uid;
        const showSender = !lastSender || lastSender !== message.senderId ||
            (lastTimestamp && (message.timestamp.toDate() - lastTimestamp.toDate()) > 5 * 60 * 1000);

        const messageDiv = document.createElement('div');
        messageDiv.className = `message ${isCurrentUser ? 'sent' : 'received'}`;

        // Zaman formatı
        const time = message.timestamp ? this.formatMessageTime(message.timestamp.toDate()) : 'Şimdi';

        // Okundu bilgisi
        let statusIcon = 'fa-check';
        if (message.status === 'delivered') {
            statusIcon = 'fa-check-double';
        } else if (message.status === 'read') {
            statusIcon = 'fa-check-double';
        }

        let statusColor = message.status === 'read' ? 'read' : 'delivered';

        messageDiv.innerHTML = `
            ${!isCurrentUser && showSender ? `
                <div class="message-avatar">
                    <img src="${message.avatarUrl || 'https://ui-avatars.com/api/?name=User&background=3b82f6&color=fff'}" alt="${message.senderName}">
                </div>
            ` : ''}
            
            <div class="message-content">
                ${!isCurrentUser && showSender ? `
                    <div class="message-sender">${message.senderName}</div>
                ` : ''}
                
                <div class="message-bubble">
                    ${message.text}
                    ${message.imageUrl ? `<img src="${message.imageUrl}" class="message-image" style="max-width: 200px; border-radius: 8px; margin-top: 8px;">` : ''}
                </div>
                
                <div class="message-time">
                    ${time}
                    ${isCurrentUser ? `
                        <span class="message-status ${statusColor}">
                            <i class="fas ${statusIcon}"></i>
                        </span>
                    ` : ''}
                </div>
            </div>
        `;

        return messageDiv;
    }

    // Mesaj gönder
    async sendMessage() {
        try {
            const messageInput = document.querySelector('.chat-input');
            if (!messageInput || !messageInput.value.trim()) return;

            if (!AppState.currentUser) {
                showToast('Mesaj göndermek için giriş yapmalısınız', 'warning');
                document.getElementById('login-modal').classList.add('active');
                return;
            }

            const messageText = messageInput.value.trim();
            const timestamp = serverTimestamp();

            // Kullanıcı bilgilerini al
            const userDoc = await getDoc(doc(db, 'users', AppState.currentUser.uid));
            if (!userDoc.exists()) return;

            const userData = userDoc.data();

            if (this.currentChat) {
                // Sohbet odasına mesaj gönder
                await this.sendRoomMessage(messageText, timestamp, userData);
            } else if (this.currentDM) {
                // DM'ye mesaj gönder
                await this.sendDMMessage(messageText, timestamp, userData);
            }

            // Input'u temizle
            messageInput.value = '';
            messageInput.style.height = 'auto';

        } catch (error) {
            console.error("Mesaj gönderme hatası:", error);
            showToast('Mesaj gönderilirken bir hata oluştu', 'error');
        }
    }

    // Sohbet odasına mesaj gönder
    async sendRoomMessage(messageText, timestamp, userData) {
        try {
            const messageData = {
                text: messageText,
                senderId: AppState.currentUser.uid,
                senderName: userData.username,
                avatarUrl: userData.avatarUrl,
                timestamp: timestamp,
                status: 'sent',
                roomId: this.currentChat,
                type: 'text'
            };

            // Mesajı Firestore'a ekle
            const messagesRef = collection(db, 'chatRooms', this.currentChat, 'messages');
            await addDoc(messagesRef, messageData);

            // Oda aktivitesini güncelle
            await updateDoc(doc(db, 'chatRooms', this.currentChat), {
                lastActivity: timestamp,
                lastMessage: messageText.substring(0, 100)
            });

            // Mesaj durumunu güncelle
            const messageId = (await addDoc(messagesRef, messageData)).id;
            await updateDoc(doc(db, 'chatRooms', this.currentChat, 'messages', messageId), {
                status: 'delivered'
            });

        } catch (error) {
            console.error("Oda mesajı gönderme hatası:", error);
            throw error;
        }
    }

    // DM'ye mesaj gönder
    async sendDMMessage(messageText, timestamp, userData) {
        try {
            const otherUserId = this.currentDM;

            // DM ID'sini oluştur (alfabetik sıralı)
            const dmId = [AppState.currentUser.uid, otherUserId].sort().join('_');

            // Mesaj verisi
            const messageData = {
                text: messageText,
                senderId: AppState.currentUser.uid,
                senderName: userData.username,
                avatarUrl: userData.avatarUrl,
                timestamp: timestamp,
                status: 'sent',
                recipients: [AppState.currentUser.uid, otherUserId],
                type: 'text',
                readBy: [AppState.currentUser.uid]
            };

            // DM koleksiyonunu oluştur (eğer yoksa)
            const dmRef = doc(db, 'dms', dmId);
            const dmDoc = await getDoc(dmRef);

            if (!dmDoc.exists()) {
                await setDoc(dmRef, {
                    id: dmId,
                    participants: [AppState.currentUser.uid, otherUserId],
                    createdAt: timestamp,
                    lastMessage: messageText,
                    lastMessageTime: timestamp,
                    lastMessageSender: AppState.currentUser.uid,
                    unreadCount: {
                        [otherUserId]: 1
                    }
                });
            } else {
                await updateDoc(dmRef, {
                    lastMessage: messageText,
                    lastMessageTime: timestamp,
                    lastMessageSender: AppState.currentUser.uid,
                    [`unreadCount.${otherUserId}`]: increment(1)
                });
            }

            // Kullanıcıların DM listelerini güncelle
            await this.updateUserDMs(otherUserId, dmId, messageText, timestamp);

            // Mesajı gönder
            const messagesRef = collection(db, 'dms', dmId, 'messages');
            await addDoc(messagesRef, messageData);

            // Mesaj durumunu güncelle
            const messageId = (await addDoc(messagesRef, messageData)).id;
            await updateDoc(doc(db, 'dms', dmId, 'messages', messageId), {
                status: 'delivered'
            });

        } catch (error) {
            console.error("DM mesajı gönderme hatası:", error);
            throw error;
        }
    }

    // Kullanıcı DM listesini güncelle
    async updateUserDMs(otherUserId, dmId, lastMessage, timestamp) {
        try {
            // Her iki kullanıcı için de DM kaydını güncelle
            const users = [AppState.currentUser.uid, otherUserId];

            for (const userId of users) {
                const userDMRef = doc(db, 'users', userId, 'dms', otherUserId);
                const userDMDoc = await getDoc(userDMRef);

                const dmData = {
                    dmId: dmId,
                    otherUserId: otherUserId,
                    lastMessage: lastMessage,
                    lastMessageTime: timestamp,
                    lastMessageSender: AppState.currentUser.uid,
                    unreadCount: userId === otherUserId ? 1 : 0,
                    updatedAt: timestamp
                };

                if (userDMDoc.exists()) {
                    await updateDoc(userDMRef, dmData);
                } else {
                    await setDoc(userDMRef, dmData);
                }
            }

        } catch (error) {
            console.error("Kullanıcı DM güncelleme hatası:", error);
        }
    }

    // Gerçek zamanlı mesaj dinleyicilerini başlat
    startMessageListeners() {
        // Genel sohbet dinleyicisi
        this.startGeneralChatListener();
    }

    // Genel sohbet dinleyicisi
    startGeneralChatListener() {
        try {
            const generalChatQuery = query(
                collection(db, 'chatRooms', 'general', 'messages'),
                orderBy('timestamp', 'desc'),
                limit(5)
            );

            const unsubscribe = onSnapshot(generalChatQuery, (snapshot) => {
                const messages = [];
                snapshot.forEach(doc => {
                    messages.push({
                        id: doc.id,
                        ...doc.data()
                    });
                });

                // Sohbet önizlemesini güncelle
                this.updateChatPreview(messages);

                // Okunmamış mesaj sayısını güncelle
                if (!this.currentChat || this.currentChat !== 'general') {
                    this.incrementUnreadCount('general');
                }
            });

            this.messageListeners.set('general-preview', unsubscribe);

        } catch (error) {
            console.error("Genel sohbet dinleyici hatası:", error);
        }
    }

    // Oda mesaj dinleyicisi
    startRoomMessageListener(roomId) {
        try {
            const messagesQuery = query(
                collection(db, 'chatRooms', roomId, 'messages'),
                orderBy('timestamp', 'desc'),
                limit(1)
            );

            const unsubscribe = onSnapshot(messagesQuery, (snapshot) => {
                snapshot.forEach(doc => {
                    const message = {
                        id: doc.id,
                        ...doc.data()
                    };

                    // Yeni mesajı görüntüle
                    if (this.currentChat === roomId) {
                        this.appendNewMessage(message, false);
                    } else {
                        // Okunmamış mesaj sayısını artır
                        this.incrementUnreadCount(roomId);
                    }
                });
            });

            this.messageListeners.set(`room-${roomId}`, unsubscribe);

        } catch (error) {
            console.error("Oda mesaj dinleyici hatası:", error);
        }
    }

    // DM mesaj dinleyicisi
    startDMMessageListener(userId) {
        try {
            if (!AppState.currentUser) return;

            const dmId = [AppState.currentUser.uid, userId].sort().join('_');

            const messagesQuery = query(
                collection(db, 'dms', dmId, 'messages'),
                orderBy('timestamp', 'desc'),
                limit(1)
            );

            const unsubscribe = onSnapshot(messagesQuery, (snapshot) => {
                snapshot.forEach(doc => {
                    const message = {
                        id: doc.id,
                        ...doc.data()
                    };

                    // Yeni mesajı görüntüle
                    if (this.currentDM === userId && message.senderId !== AppState.currentUser.uid) {
                        this.appendNewMessage(message, true);

                        // Okundu olarak işaretle
                        this.markMessageAsRead(doc.id, dmId);
                    } else if (this.currentDM !== userId && message.senderId !== AppState.currentUser.uid) {
                        // Okunmamış DM sayısını artır
                        this.incrementDMUnreadCount(userId);
                    }
                });
            });

            this.messageListeners.set(`dm-${userId}`, unsubscribe);

        } catch (error) {
            console.error("DM mesaj dinleyici hatası:", error);
        }
    }

    // Yeni mesajı ekle
    appendNewMessage(message, isDM = false) {
        const messagesContainer = document.querySelector('.chat-messages');
        if (!messagesContainer) return;

        // Boş mesaj durumunu kaldır
        const emptyState = messagesContainer.querySelector('.empty-messages');
        if (emptyState) {
            emptyState.remove();
        }

        // Mesaj elementi oluştur
        const messageElement = this.createMessageElement(message, isDM, null, null);
        messagesContainer.appendChild(messageElement);

        // En altı kaydır
        messagesContainer.scrollTop = messagesContainer.scrollHeight;

        // Bildirim göster (eğer farklı kullanıcıdan geldiyse)
        if (message.senderId !== AppState.currentUser?.uid) {
            this.showMessageNotification(message);
        }
    }

    // Mesaj bildirimi göster
    showMessageNotification(message) {
        const notificationSound = document.getElementById('notification-sound');
        if (notificationSound) {
            notificationSound.currentTime = 0;
            notificationSound.play().catch(console.error);
        }

        // Bildirim izni varsa
        if ('Notification' in window && Notification.permission === 'granted') {
            new Notification(`Yeni mesaj - ${message.senderName}`, {
                body: message.text.length > 50 ? message.text.substring(0, 50) + '...' : message.text,
                icon: message.avatarUrl || 'https://ui-avatars.com/api/?name=User&background=3b82f6&color=fff'
            });
        }

        // Toast bildirimi
        showToast(`${message.senderName}: ${message.text.substring(0, 50)}${message.text.length > 50 ? '...' : ''}`, 'info');
    }

    // Mesajı okundu olarak işaretle
    async markMessageAsRead(messageId, dmId) {
        try {
            await updateDoc(doc(db, 'dms', dmId, 'messages', messageId), {
                status: 'read',
                readBy: arrayUnion(AppState.currentUser.uid)
            });
        } catch (error) {
            console.error("Mesaj okundu işaretleme hatası:", error);
        }
    }

    // Okunmamış mesaj sayısını artır
    incrementUnreadCount(roomId) {
        const currentCount = this.unreadCounts.get(roomId) || 0;
        this.unreadCounts.set(roomId, currentCount + 1);
        this.updateUnreadBadges();
    }

    // Okunmamış DM sayısını artır
    incrementDMUnreadCount(userId) {
        // DM okunmamış sayısını güncelle
        // Bu bilgiyi Firestore'da da tutabiliriz
        this.updateUnreadBadges();
    }

    // Okunmamış sayacı sıfırla
    resetUnreadCount(roomId) {
        this.unreadCounts.set(roomId, 0);
        this.updateUnreadBadges();
    }

    // DM okunmamış sayacı sıfırla
    resetDMUnreadCount(userId) {
        // DM okunmamış sayacını sıfırla
        // Firestore'da güncelleme yap
        this.updateUnreadBadges();
    }

    // Okunmamış rozetleri güncelle
    updateUnreadBadges() {
        // Toplam okunmamış sayısını hesapla
        let totalUnread = 0;
        this.unreadCounts.forEach(count => {
            totalUnread += count;
        });

        // DM okunmamışlarını da ekle
        // ...

        // Rozetleri güncelle
        document.querySelectorAll('.nav-badge:not(.duel-pending)').forEach(badge => {
            if (totalUnread > 0) {
                badge.textContent = totalUnread > 99 ? '99+' : totalUnread;
                badge.style.display = 'flex';
            } else {
                badge.style.display = 'none';
            }
        });

        // Mobil rozetleri
        document.querySelectorAll('.bottom-badge').forEach(badge => {
            if (totalUnread > 0) {
                badge.textContent = totalUnread > 99 ? '99+' : totalUnread;
                badge.style.display = 'flex';
            } else {
                badge.style.display = 'none';
            }
        });
    }

    // Okunmamış sayısını al
    getUnreadCount(roomId) {
        return this.unreadCounts.get(roomId) || 0;
    }

    // Sohbet önizlemesini güncelle
    updateChatPreview(messages) {
        const chatPreview = document.getElementById('general-chat-preview');
        if (!chatPreview) return;

        // Mesajları ters çevir
        const reversedMessages = [...messages].reverse();

        chatPreview.innerHTML = '';

        reversedMessages.forEach(message => {
            const messageElement = this.createChatPreviewElement(message);
            chatPreview.appendChild(messageElement);
        });
    }

    // Sohbet önizleme elementi oluştur
    createChatPreviewElement(message) {
        const div = document.createElement('div');
        div.className = 'chat-message-preview';

        const time = message.timestamp ? this.formatMessageTime(message.timestamp.toDate()) : 'Şimdi';

        div.innerHTML = `
            <div class="message-avatar">
                <img src="${message.avatarUrl || 'https://ui-avatars.com/api/?name=User&background=3b82f6&color=fff'}" alt="${message.senderName}">
            </div>
            <div class="message-preview-content">
                <div class="message-preview-header">
                    <span class="message-sender">${message.senderName}</span>
                    <span class="message-time">${time}</span>
                </div>
                <p class="message-preview-text">${message.text}</p>
            </div>
        `;

        return div;
    }

    // Zamanı formatla
    formatMessageTime(date) {
        const now = new Date();
        const diffMs = now - date;
        const diffMins = Math.floor(diffMs / 60000);
        const diffHours = Math.floor(diffMs / 3600000);
        const diffDays = Math.floor(diffMs / 86400000);

        if (diffMins < 1) {
            return 'şimdi';
        } else if (diffMins < 60) {
            return `${diffMins} dk önce`;
        } else if (diffHours < 24) {
            return `${diffHours} sa önce`;
        } else if (diffDays < 7) {
            return `${diffDays} gün önce`;
        } else {
            return date.toLocaleDateString('tr-TR', {
                day: 'numeric',
                month: 'short'
            });
        }
    }

    // Son aktiviteyi formatla
    formatLastActivity(timestamp) {
        if (!timestamp) return 'Hiç aktivite yok';

        const date = timestamp.toDate();
        return this.formatMessageTime(date);
    }

    // Sohbet sistemini temizle
    cleanup() {
        // Tüm dinleyicileri durdur
        this.messageListeners.forEach(unsubscribe => {
            if (typeof unsubscribe === 'function') {
                unsubscribe();
            }
        });

        this.messageListeners.clear();
        this.unreadCounts.clear();
        this.messages.clear();

        console.log("Sohbet sistemi temizlendi");
    }
}

// 2048 Oyunu
class Game2048 {
    constructor() {
        this.grid = [];
        this.score = 0;
        this.bestScore = 0;
        this.gameOver = false;
        this.won = false;
        this.size = 4;
        this.initialized = false;
    }

    // Oyunu başlat
    initialize() {
        console.log("2048 oyunu başlatılıyor...");

        // Grid'i oluştur
        this.createGrid();

        // İki rastgele kare ekle
        this.addRandomTile();
        this.addRandomTile();

        this.initialized = true;

        // UI'ı güncelle
        this.updateGridUI();
        this.updateScoreUI();

        // Kontrolleri bağla
        this.setupControls();

        console.log("2048 oyunu başlatıldı");
    }

    // Grid oluştur
    createGrid() {
        this.grid = [];
        for (let i = 0; i < this.size; i++) {
            this.grid[i] = [];
            for (let j = 0; j < this.size; j++) {
                this.grid[i][j] = 0;
            }
        }
    }

    // Rastgele kare ekle
    addRandomTile() {
        const emptyCells = [];

        // Boş hücreleri bul
        for (let i = 0; i < this.size; i++) {
            for (let j = 0; j < this.size; j++) {
                if (this.grid[i][j] === 0) {
                    emptyCells.push({ x: i, y: j });
                }
            }
        }

        if (emptyCells.length > 0) {
            // Rastgele bir boş hücre seç
            const randomCell = emptyCells[Math.floor(Math.random() * emptyCells.length)];

            // %90 ihtimalle 2, %10 ihtimalle 4
            const value = Math.random() < 0.9 ? 2 : 4;

            this.grid[randomCell.x][randomCell.y] = value;
        }
    }

    // Grid UI'ını güncelle
    updateGridUI() {
        const gridElement = document.getElementById('2048-grid');
        if (!gridElement) return;

        gridElement.innerHTML = '';

        for (let i = 0; i < this.size; i++) {
            for (let j = 0; j < this.size; j++) {
                const cellValue = this.grid[i][j];

                const cellElement = document.createElement('div');
                cellElement.className = 'game-2048-cell';
                cellElement.setAttribute('data-row', i);
                cellElement.setAttribute('data-col', j);

                if (cellValue > 0) {
                    const tileElement = document.createElement('div');
                    tileElement.className = `game-2048-tile tile-${cellValue}`;
                    tileElement.textContent = cellValue;
                    tileElement.style.animation = 'popIn 0.2s ease-out';

                    cellElement.appendChild(tileElement);
                }

                gridElement.appendChild(cellElement);
            }
        }
    }

    // Skor UI'ını güncelle
    updateScoreUI() {
        const scoreElement = document.getElementById('2048-score');
        if (scoreElement) {
            scoreElement.textContent = this.score;
        }

        const bestElement = document.getElementById('2048-best');
        if (bestElement) {
            bestElement.textContent = this.bestScore;
        }
    }

    // Kontrolleri kur
    setupControls() {
        // Klavye kontrolleri
        document.addEventListener('keydown', (e) => {
            if (this.gameOver) return;

            let moved = false;

            switch (e.key) {
                case 'ArrowUp':
                case 'w':
                case 'W':
                    moved = this.moveUp();
                    break;
                case 'ArrowDown':
                case 's':
                case 'S':
                    moved = this.moveDown();
                    break;
                case 'ArrowLeft':
                case 'a':
                case 'A':
                    moved = this.moveLeft();
                    break;
                case 'ArrowRight':
                case 'd':
                case 'D':
                    moved = this.moveRight();
                    break;
            }

            if (moved) {
                this.addRandomTile();
                this.updateGridUI();
                this.updateScoreUI();
                this.checkGameStatus();
            }
        });

        // Dokunma kontrolleri (mobil için)
        this.setupTouchControls();

        // Yeni oyun butonu
        const newGameBtn = document.getElementById('2048-new-game');
        if (newGameBtn) {
            newGameBtn.addEventListener('click', () => {
                this.resetGame();
            });
        }

        // Yardım butonu
        const helpBtn = document.getElementById('2048-help');
        if (helpBtn) {
            helpBtn.addEventListener('click', () => {
                this.showHelp();
            });
        }
    }

    // Dokunma kontrollerini kur
    setupTouchControls() {
        let touchStartX = 0;
        let touchStartY = 0;
        let touchEndX = 0;
        let touchEndY = 0;

        const gridElement = document.getElementById('2048-grid');
        if (!gridElement) return;

        gridElement.addEventListener('touchstart', (e) => {
            touchStartX = e.touches[0].clientX;
            touchStartY = e.touches[0].clientY;
            e.preventDefault();
        }, { passive: false });

        gridElement.addEventListener('touchmove', (e) => {
            e.preventDefault();
        }, { passive: false });

        gridElement.addEventListener('touchend', (e) => {
            touchEndX = e.changedTouches[0].clientX;
            touchEndY = e.changedTouches[0].clientY;

            this.handleSwipe(touchStartX, touchStartY, touchEndX, touchEndY);
            e.preventDefault();
        }, { passive: false });
    }

    // Kaydırma işlemini yönet
    handleSwipe(startX, startY, endX, endY) {
        if (this.gameOver) return;

        const dx = endX - startX;
        const dy = endY - startY;
        const minSwipeDistance = 30;

        let moved = false;

        if (Math.abs(dx) > Math.abs(dy)) {
            // Yatay kaydırma
            if (Math.abs(dx) > minSwipeDistance) {
                if (dx > 0) {
                    moved = this.moveRight();
                } else {
                    moved = this.moveLeft();
                }
            }
        } else {
            // Dikey kaydırma
            if (Math.abs(dy) > minSwipeDistance) {
                if (dy > 0) {
                    moved = this.moveDown();
                } else {
                    moved = this.moveRight();
                }
            }
        }

        if (moved) {
            this.addRandomTile();
            this.updateGridUI();
            this.updateScoreUI();
            this.checkGameStatus();
        }
    }

    // Yukarı hareket
    moveUp() {
        let moved = false;

        for (let j = 0; j < this.size; j++) {
            const column = [];

            // Sütunu al
            for (let i = 0; i < this.size; i++) {
                column.push(this.grid[i][j]);
            }

            // Sütunu işle
            const processed = this.processLine(column);

            // Grid'i güncelle
            for (let i = 0; i < this.size; i++) {
                if (this.grid[i][j] !== processed[i]) {
                    moved = true;
                }
                this.grid[i][j] = processed[i];
            }
        }

        return moved;
    }

    // Aşağı hareket
    moveDown() {
        let moved = false;

        for (let j = 0; j < this.size; j++) {
            const column = [];

            // Sütunu ters al
            for (let i = this.size - 1; i >= 0; i--) {
                column.push(this.grid[i][j]);
            }

            // Sütunu işle
            const processed = this.processLine(column);

            // Grid'i ters güncelle
            for (let i = 0; i < this.size; i++) {
                if (this.grid[this.size - 1 - i][j] !== processed[i]) {
                    moved = true;
                }
                this.grid[this.size - 1 - i][j] = processed[i];
            }
        }

        return moved;
    }

    // Sola hareket
    moveLeft() {
        let moved = false;

        for (let i = 0; i < this.size; i++) {
            const row = [...this.grid[i]];
            const processed = this.processLine(row);

            // Satırı güncelle
            for (let j = 0; j < this.size; j++) {
                if (this.grid[i][j] !== processed[j]) {
                    moved = true;
                }
                this.grid[i][j] = processed[j];
            }
        }

        return moved;
    }

    // Sağa hareket
    moveRight() {
        let moved = false;

        for (let i = 0; i < this.size; i++) {
            const row = [];

            // Satırı ters al
            for (let j = this.size - 1; j >= 0; j--) {
                row.push(this.grid[i][j]);
            }

            // Satırı işle
            const processed = this.processLine(row);

            // Satırı ters güncelle
            for (let j = 0; j < this.size; j++) {
                if (this.grid[i][this.size - 1 - j] !== processed[j]) {
                    moved = true;
                }
                this.grid[i][this.size - 1 - j] = processed[j];
            }
        }

        return moved;
    }

    // Satır/sütun işleme
    processLine(line) {
        // Sıfırları kaldır
        let filtered = line.filter(cell => cell !== 0);

        // Birleştirme
        for (let i = 0; i < filtered.length - 1; i++) {
            if (filtered[i] === filtered[i + 1]) {
                filtered[i] *= 2;
                this.score += filtered[i];
                filtered.splice(i + 1, 1);
            }
        }

        // Eksik sıfırları ekle
        while (filtered.length < this.size) {
            filtered.push(0);
        }

        return filtered;
    }

    // Oyun durumunu kontrol et
    checkGameStatus() {
        // 2048'e ulaşıldı mı?
        for (let i = 0; i < this.size; i++) {
            for (let j = 0; j < this.size; j++) {
                if (this.grid[i][j] === 2048 && !this.won) {
                    this.won = true;
                    this.showWinMessage();
                }
            }
        }

        // Oyun bitti mi?
        if (!this.canMove()) {
            this.gameOver = true;
            this.showGameOver();
        }

        // En iyi skoru güncelle
        if (this.score > this.bestScore) {
            this.bestScore = this.score;
            this.saveBestScore();
        }
    }

    // Hareket mümkün mü?
    canMove() {
        // Boş hücre var mı?
        for (let i = 0; i < this.size; i++) {
            for (let j = 0; j < this.size; j++) {
                if (this.grid[i][j] === 0) {
                    return true;
                }
            }
        }

        // Yan yana aynı değerler var mı?
        for (let i = 0; i < this.size; i++) {
            for (let j = 0; j < this.size; j++) {
                const current = this.grid[i][j];

                // Sağ kontrol
                if (j < this.size - 1 && this.grid[i][j + 1] === current) {
                    return true;
                }

                // Alt kontrol
                if (i < this.size - 1 && this.grid[i + 1][j] === current) {
                    return true;
                }
            }
        }

        return false;
    }

    // Kazanma mesajını göster
    showWinMessage() {
        const gameOverElement = document.createElement('div');
        gameOverElement.className = 'game-2048-game-over';
        gameOverElement.innerHTML = `
            <h2 class="game-over-title">TEBRİKLER!</h2>
            <p class="game-over-score">2048'e ulaştınız!</p>
            <p>Skorunuz: ${this.score}</p>
            <div class="game-over-buttons">
                <button class="btn-primary" id="2048-continue">Devam Et</button>
                <button class="btn-secondary" id="2048-new-game-2">Yeni Oyun</button>
            </div>
        `;

        const boardElement = document.querySelector('.game-2048-board');
        if (boardElement) {
            boardElement.appendChild(gameOverElement);

            // Buton event'leri
            document.getElementById('2048-continue').addEventListener('click', () => {
                gameOverElement.remove();
            });

            document.getElementById('2048-new-game-2').addEventListener('click', () => {
                this.resetGame();
            });
        }
    }

    // Oyun bitti mesajını göster
    showGameOver() {
        const gameOverElement = document.createElement('div');
        gameOverElement.className = 'game-2048-game-over';
        gameOverElement.innerHTML = `
            <h2 class="game-over-title">OYUN BİTTİ</h2>
            <p class="game-over-score">Skorunuz: ${this.score}</p>
            <div class="game-over-buttons">
                <button class="btn-primary" id="2048-play-again">Tekrar Oyna</button>
                <button class="btn-secondary" id="2048-close-game">Kapat</button>
            </div>
        `;

        const boardElement = document.querySelector('.game-2048-board');
        if (boardElement) {
            boardElement.appendChild(gameOverElement);

            // Buton event'leri
            document.getElementById('2048-play-again').addEventListener('click', () => {
                this.resetGame();
            });

            document.getElementById('2048-close-game').addEventListener('click', () => {
                const modal = document.getElementById('game-2048-modal');
                if (modal) {
                    modal.remove();
                }
            });
        }
    }

    // Yardım göster
    showHelp() {
        const helpModal = document.createElement('div');
        helpModal.className = 'modal active';
        helpModal.innerHTML = `
            <div class="modal-content">
                <div class="modal-header">
                    <h2><i class="fas fa-question-circle"></i> 2048 Nasıl Oynanır?</h2>
                    <button class="modal-close">
                        <i class="fas fa-times"></i>
                    </button>
                </div>
                <div class="modal-body">
                    <div class="game-instructions">
                        <h3>Oyun Kuralları:</h3>
                        <ul>
                            <li>Ok tuşları veya WASD ile kareleri hareket ettirin</li>
                            <li>Aynı sayılar çarpıştığında birleşirler</li>
                            <li>Her hamleda rastgele bir yere 2 veya 4 eklenir</li>
                            <li>2048 karesini oluşturarak kazanın</li>
                            <li>Hamle kalmadığında oyun biter</li>
                        </ul>
                        
                        <h3 style="margin-top: 20px;">Stratejiler:</h3>
                        <ul>
                            <li>En büyük karenizi bir köşede tutun</li>
                            <li>Kareleri sıralı şekilde düzenlemeye çalışın</li>
                            <li>Hamle yapmadan önce düşünün</li>
                        </ul>
                    </div>
                </div>
            </div>
        `;

        document.body.appendChild(helpModal);

        // Modal kapatma
        helpModal.querySelector('.modal-close').addEventListener('click', () => {
            helpModal.remove();
        });

        helpModal.addEventListener('click', (e) => {
            if (e.target === helpModal) {
                helpModal.remove();
            }
        });
    }

    // Oyunu sıfırla
    resetGame() {
        this.grid = [];
        this.score = 0;
        this.gameOver = false;
        this.won = false;

        this.createGrid();
        this.addRandomTile();
        this.addRandomTile();

        this.updateGridUI();
        this.updateScoreUI();

        // Oyun bitti mesajını kaldır
        const gameOverElement = document.querySelector('.game-2048-game-over');
        if (gameOverElement) {
            gameOverElement.remove();
        }
    }

    // En iyi skoru kaydet
    saveBestScore() {
        try {
            localStorage.setItem('2048-best-score', this.bestScore.toString());
        } catch (error) {
            console.error("Skor kaydetme hatası:", error);
        }
    }

    // En iyi skoru yükle
    loadBestScore() {
        try {
            const savedScore = localStorage.getItem('2048-best-score');
            if (savedScore) {
                this.bestScore = parseInt(savedScore, 10);
            }
        } catch (error) {
            console.error("Skor yükleme hatası:", error);
        }
    }

    // Oyunu temizle
    cleanup() {
        // Event listener'ları kaldır
        document.removeEventListener('keydown', this.handleKeyDown);

        console.log("2048 oyunu temizlendi");
    }
}

// Liderlik Tablosu
class LeaderboardSystem {
    constructor() {
        this.currentFilter = 'all';
        this.currentPage = 1;
        this.pageSize = 10;
        this.totalUsers = 0;
        this.leaderboardData = [];
        this.userStats = new Map();
    }

    // Liderlik tablosunu başlat
    async initialize() {
        console.log("Liderlik tablosu başlatılıyor...");

        // UI'ı başlat
        this.initializeUI();

        // İlk verileri yükle
        await this.loadLeaderboardData();

        // Gerçek zamanlı güncellemeleri başlat
        this.startRealtimeUpdates();

        console.log("Liderlik tablosu başlatıldı");
    }

    // UI'ı başlat
    initializeUI() {
        console.log("Liderlik tablosu UI başlatılıyor...");

        // Filtre butonları
        document.querySelectorAll('.leaderboard-filter').forEach(filter => {
            filter.addEventListener('click', (e) => {
                const filterType = e.currentTarget.getAttribute('data-filter');
                this.changeFilter(filterType);
            });
        });

        // Sayfalama butonları
        const prevBtn = document.getElementById('leaderboard-prev');
        const nextBtn = document.getElementById('leaderboard-next');

        if (prevBtn) {
            prevBtn.addEventListener('click', () => {
                this.prevPage();
            });
        }

        if (nextBtn) {
            nextBtn.addEventListener('click', () => {
                this.nextPage();
            });
        }

        // Kullanıcı arama
        const searchInput = document.querySelector('.leaderboard-search');
        if (searchInput) {
            searchInput.addEventListener('input', (e) => {
                this.searchUsers(e.target.value);
            });
        }
    }

    // Filtreyi değiştir
    async changeFilter(filterType) {
        console.log(`Liderlik filtresi değiştiriliyor: ${filterType}`);

        // Aktif filtreyi güncelle
        document.querySelectorAll('.leaderboard-filter').forEach(filter => {
            filter.classList.remove('active');
        });
        document.querySelector(`.leaderboard-filter[data-filter="${filterType}"]`).classList.add('active');

        this.currentFilter = filterType;
        this.currentPage = 1;

        // Verileri yeniden yükle
        await this.loadLeaderboardData();
    }

    // Önceki sayfa
    async prevPage() {
        if (this.currentPage > 1) {
            this.currentPage--;
            await this.loadLeaderboardData();
            this.updatePaginationUI();
        }
    }

    // Sonraki sayfa
    async nextPage() {
        const totalPages = Math.ceil(this.totalUsers / this.pageSize);
        if (this.currentPage < totalPages) {
            this.currentPage++;
            await this.loadLeaderboardData();
            this.updatePaginationUI();
        }
    }

    // Liderlik verilerini yükle
    async loadLeaderboardData() {
        try {
            console.log(`Liderlik verileri yükleniyor: sayfa ${this.currentPage}, filtre ${this.currentFilter}`);

            let leaderboardQuery;
            const startAt = (this.currentPage - 1) * this.pageSize;

            // Filtreye göre sorgu oluştur
            switch (this.currentFilter) {
                case 'coins':
                    leaderboardQuery = query(
                        collection(db, 'users'),
                        orderBy('coins', 'desc'),
                        limit(this.pageSize),
                        startAt(startAt)
                    );
                    break;

                case 'wins':
                    leaderboardQuery = query(
                        collection(db, 'users'),
                        orderBy('wins', 'desc'),
                        limit(this.pageSize),
                        startAt(startAt)
                    );
                    break;

                case 'streak':
                    leaderboardQuery = query(
                        collection(db, 'users'),
                        orderBy('streak', 'desc'),
                        limit(this.pageSize),
                        startAt(startAt)
                    );
                    break;

                case 'all':
                default:
                    // Özel sıralama: (coins * 10 + wins * 5 + streak * 2)
                    // Firestore'da bu hesaplamayı yapamayacağımız için istatistik koleksiyonu kullanacağız
                    leaderboardQuery = query(
                        collection(db, 'leaderboard'),
                        orderBy('totalScore', 'desc'),
                        limit(this.pageSize),
                        startAt(startAt)
                    );
                    break;
            }

            const snapshot = await getDocs(leaderboardQuery);

            // Toplam kullanıcı sayısını al
            const countQuery = query(collection(db, 'users'));
            const countSnapshot = await getDocs(countQuery);
            this.totalUsers = countSnapshot.size;

            // Verileri işle
            this.leaderboardData = [];
            const rankOffset = (this.currentPage - 1) * this.pageSize;

            let rank = 1 + rankOffset;
            for (const doc of snapshot.docs) {
                const userData = doc.data();

                // Eğer leaderboard koleksiyonundan alıyorsak, kullanıcı bilgilerini de getir
                if (this.currentFilter === 'all') {
                    const userDoc = await getDoc(doc(db, 'users', userData.userId));
                    if (userDoc.exists()) {
                        Object.assign(userData, userDoc.data());
                    }
                }

                userData.rank = rank;
                this.leaderboardData.push(userData);
                rank++;
            }

            // UI'ı güncelle
            this.updateLeaderboardUI();
            this.updatePaginationUI();

        } catch (error) {
            console.error("Liderlik verileri yükleme hatası:", error);
            showToast('Liderlik tablosu yüklenirken bir hata oluştu', 'error');
        }
    }

    // Liderlik UI'ını güncelle
    updateLeaderboardUI() {
        const tbody = document.querySelector('.leaderboard-table tbody');
        if (!tbody) return;

        tbody.innerHTML = '';

        this.leaderboardData.forEach((user, index) => {
            const row = this.createLeaderboardRow(user, index);
            tbody.appendChild(row);
        });
    }

    // Liderlik satırı oluştur
    createLeaderboardRow(user, index) {
        const row = document.createElement('tr');
        row.className = `rank-${user.rank}`;

        // Rol badge'i
        let roleBadge = '';
        if (user.role === 'founder') {
            roleBadge = '<span class="leaderboard-badge badge-founder"><i class="fas fa-crown"></i> Kurucu</span>';
        } else if (user.role === 'admin') {
            roleBadge = '<span class="leaderboard-badge badge-admin"><i class="fas fa-shield-alt"></i> Admin</span>';
        }

        // Filtreye göre değer
        let filterValue = '';
        switch (this.currentFilter) {
            case 'coins':
                filterValue = `<div class="leaderboard-score">${user.coins || 0}</div>`;
                break;
            case 'wins':
                filterValue = `
                    <div class="leaderboard-wins">${user.wins || 0} Galibiyet</div>
                    <div class="leaderboard-losses">${user.losses || 0} Mağlubiyet</div>
                `;
                break;
            case 'streak':
                filterValue = `<div class="leaderboard-streak">${user.streak || 0} Gün</div>`;
                break;
            case 'all':
            default:
                // Toplam skor hesapla
                const totalScore = (user.coins || 0) * 10 + (user.wins || 0) * 5 + (user.streak || 0) * 2;
                filterValue = `<div class="leaderboard-score">${totalScore} Puan</div>`;
                break;
        }

        row.innerHTML = `
            <td class="leaderboard-rank">${user.rank}</td>
            <td>
                <div class="leaderboard-user">
                    <div class="leaderboard-avatar">
                        <img src="${user.avatarUrl || `https://ui-avatars.com/api/?name=${encodeURIComponent(user.username)}&background=7c3aed&color=fff`}" alt="${user.username}">
                    </div>
                    <div class="leaderboard-user-info">
                        <div class="leaderboard-username">
                            ${user.username}
                            ${roleBadge}
                        </div>
                        <div class="leaderboard-user-stats">
                            <span>${user.coins || 0} Coin</span>
                            <span>${user.wins || 0} Galibiyet</span>
                            <span>${user.streak || 0} Gün Seri</span>
                        </div>
                    </div>
                </div>
            </td>
            <td>${filterValue}</td>
            <td class="leaderboard-actions">
                <button class="leaderboard-action-btn" data-user-id="${user.uid}">
                    <i class="fas fa-user-plus"></i>
                    Takip Et
                </button>
            </td>
        `;

        // Takip et butonu
        const followBtn = row.querySelector('.leaderboard-action-btn');
        if (followBtn) {
            followBtn.addEventListener('click', () => {
                this.followUser(user.uid);
            });
        }

        return row;
    }

    // Sayfalama UI'ını güncelle
    updatePaginationUI() {
        const totalPages = Math.ceil(this.totalUsers / this.pageSize);
        const pageInfo = document.querySelector('.leaderboard-pagination-info');
        const prevBtn = document.getElementById('leaderboard-prev');
        const nextBtn = document.getElementById('leaderboard-next');

        if (pageInfo) {
            pageInfo.textContent = `Sayfa ${this.currentPage} / ${totalPages}`;
        }

        if (prevBtn) {
            prevBtn.disabled = this.currentPage <= 1;
        }

        if (nextBtn) {
            nextBtn.disabled = this.currentPage >= totalPages;
        }
    }

    // Kullanıcı ara
    async searchUsers(searchTerm) {
        try {
            if (!searchTerm.trim()) {
                await this.loadLeaderboardData();
                return;
            }

            // Kullanıcı adına göre ara
            const usersQuery = query(
                collection(db, 'users'),
                where('username', '>=', searchTerm),
                where('username', '<=', searchTerm + '\uf8ff'),
                limit(20)
            );

            const snapshot = await getDocs(usersQuery);

            // Verileri işle
            this.leaderboardData = [];
            let rank = 1;

            for (const doc of snapshot.docs) {
                const userData = doc.data();
                userData.rank = rank;
                this.leaderboardData.push(userData);
                rank++;
            }

            // UI'ı güncelle
            this.updateLeaderboardUI();

            // Sayfalama UI'ını gizle
            this.hidePaginationUI();

        } catch (error) {
            console.error("Kullanıcı arama hatası:", error);
            showToast('Kullanıcı aranırken bir hata oluştu', 'error');
        }
    }

    // Sayfalama UI'ını gizle
    hidePaginationUI() {
        const pagination = document.querySelector('.leaderboard-pagination');
        if (pagination) {
            pagination.style.display = 'none';
        }
    }

    // Kullanıcıyı takip et
    async followUser(userId) {
        try {
            if (!AppState.currentUser) {
                showToast('Takip etmek için giriş yapmalısınız', 'warning');
                return;
            }

            // Takip işlemi
            const followRef = doc(db, 'users', AppState.currentUser.uid, 'following', userId);
            const followDoc = await getDoc(followRef);

            if (followDoc.exists()) {
                // Zaten takip ediliyor, takipten çık
                await deleteDoc(followRef);
                showToast('Takip edilenlerden çıkarıldı', 'success');
            } else {
                // Takip et
                await setDoc(followRef, {
                    userId: userId,
                    followedAt: serverTimestamp()
                });
                showToast('Takip edilenlere eklendi', 'success');
            }

        } catch (error) {
            console.error("Takip etme hatası:", error);
            showToast('Takip işlemi sırasında bir hata oluştu', 'error');
        }
    }

    // Gerçek zamanlı güncellemeleri başlat
    startRealtimeUpdates() {
        // Liderlik güncellemelerini dinle
        const leaderboardQuery = query(
            collection(db, 'leaderboard'),
            orderBy('totalScore', 'desc'),
            limit(10)
        );

        const unsubscribe = onSnapshot(leaderboardQuery, (snapshot) => {
            // İlk 10'daki değişiklikleri kontrol et
            snapshot.docChanges().forEach(change => {
                if (change.type === 'modified') {
                    // Liderlik değişti, UI'ı güncelle
                    this.loadLeaderboardData();
                }
            });
        });

        // Dinleyiciyi kaydet
        // (cleanup için saklayabiliriz)
    }

    // Liderlik sistemini temizle
    cleanup() {
        // Dinleyicileri temizle
        console.log("Liderlik sistemi temizlendi");
    }
}

// Oyun Yöneticisi
class GameManager {
    constructor() {
        this.activeGames = new Map();
        this.gameInstances = new Map();
        this.currentGame = null;
    }

    // Oyun yöneticisini başlat
    initialize() {
        console.log("Oyun yöneticisi başlatılıyor...");

        // Oyun butonlarını bağla
        this.setupGameButtons();

        // Aktif oyunları kontrol et
        this.checkActiveGames();

        console.log("Oyun yöneticisi başlatıldı");
    }

    // Oyun butonlarını bağla
    setupGameButtons() {
        // Hızlı oyun butonları
        document.querySelectorAll('.game-card-play, .btn-game-play').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const gameCard = e.target.closest('.game-card');
                if (gameCard) {
                    const gameType = gameCard.getAttribute('data-game');
                    this.launchGame(gameType);
                }
            });
        });

        // Büyük oyun kartları
        document.querySelectorAll('.game-card-play').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const gameCard = e.target.closest('.game-card-large');
                if (gameCard) {
                    const gameType = gameCard.getAttribute('data-game');
                    this.launchGame(gameType);
                }
            });
        });

        // Hızlı oyna butonu
        const quickPlayBtn = document.getElementById('quick-play-btn');
        if (quickPlayBtn) {
            quickPlayBtn.addEventListener('click', () => {
                this.quickPlay();
            });
        }
    }

    // Oyun başlat
    async launchGame(gameType) {
        try {
            console.log(`Oyun başlatılıyor: ${gameType}`);

            if (!AppState.currentUser) {
                showToast('Oyun oynamak için giriş yapmalısınız', 'warning');
                document.getElementById('login-modal').classList.add('active');
                return;
            }

            // Oyun tipine göre işlem yap
            // Tüm oyun mantığı artık global launchGame fonksiyonu üzerinden yönetiliyor
            window.launchGame(gameType);

            // Oyun kaydı oluştur
            await this.createGameRecord(gameType);

            // Aktif oyunları güncelle
            this.updateActiveGames();

        } catch (error) {
            console.error("Oyun başlatma hatası:", error);
            showToast('Oyun başlatılırken bir hata oluştu', 'error');
        }
    }

    // Oyun başlatıcı metodlar global fonksiyonlara taşındı (redundancy removal)
    /* 
       Eski metodlar: start2048Game, startChessGame, startRPSGame, startCoinGame
       Bu metodlar artık window.launchGame üzerinden çağrılan global fonksiyonlar olarak app.js'in sonunda tanımlıdır.
    */



    // Hızlı oyun
    quickPlay() {
        const games = ['2048', 'rps', 'coin'];
        const randomGame = games[Math.floor(Math.random() * games.length)];
        this.launchGame(randomGame.toLowerCase());
    }

    // Oyun kaydı oluştur
    async createGameRecord(gameType) {
        try {
            if (!AppState.currentUser) return;

            const gameData = {
                userId: AppState.currentUser.uid,
                gameType: gameType,
                status: 'active',
                startedAt: serverTimestamp(),
                players: [AppState.currentUser.uid],
                turn: AppState.currentUser.uid
            };

            // Oyun kaydını ekle
            const gameRef = await addDoc(collection(db, 'games'), gameData);

            // Aktif oyunlara ekle
            this.activeGames.set(gameRef.id, {
                id: gameRef.id,
                ...gameData
            });

            // Kullanıcının aktif oyunlarını güncelle
            await updateDoc(doc(db, 'users', AppState.currentUser.uid), {
                [`activeGames.${gameRef.id} `]: true
            });

        } catch (error) {
            console.error("Oyun kaydı oluşturma hatası:", error);
        }
    }

    // Aktif oyunları kontrol et
    async checkActiveGames() {
        try {
            if (!AppState.currentUser) return;

            const userDoc = await getDoc(doc(db, 'users', AppState.currentUser.uid));
            if (!userDoc.exists()) return;

            const userData = userDoc.data();
            const activeGames = userData.activeGames || {};

            // Aktif oyunları yükle
            for (const gameId in activeGames) {
                if (activeGames[gameId]) {
                    const gameDoc = await getDoc(doc(db, 'games', gameId));
                    if (gameDoc.exists()) {
                        const gameData = gameDoc.data();
                        this.activeGames.set(gameId, {
                            id: gameId,
                            ...gameData
                        });
                    }
                }
            }

            // UI'ı güncelle
            this.updateActiveGamesUI();

        } catch (error) {
            console.error("Aktif oyun kontrol hatası:", error);
        }
    }

    // Aktif oyunları güncelle
    updateActiveGames() {
        // Firestore'dan aktif oyunları yeniden yükle
        this.checkActiveGames();
    }

    // Aktif oyunlar UI'ını güncelle
    updateActiveGamesUI() {
        const activeGamesList = document.getElementById('active-games-list');
        if (!activeGamesList) return;

        // Demo verileri temizle
        const emptyState = activeGamesList.querySelector('.empty-state');
        if (emptyState && this.activeGames.size > 0) {
            emptyState.remove();
        }

        // Aktif oyunları göster
        if (this.activeGames.size > 0) {
            activeGamesList.innerHTML = '';

            this.activeGames.forEach((game, gameId) => {
                const gameElement = this.createActiveGameElement(game);
                activeGamesList.appendChild(gameElement);
            });
        } else if (!emptyState) {
            // Boş durum göster
            activeGamesList.innerHTML = `
    < div class="empty-state" >
                    <i class="fas fa-gamepad"></i>
                    <p>Aktif oyununuz bulunmuyor</p>
                    <button class="btn-text" id="find-game-btn">Oyun Bul</button>
                </div >
    `;

            // Oyun bul butonu
            document.getElementById('find-game-btn').addEventListener('click', () => {
                navigateToPage('games');
            });
        }
    }

    // Aktif oyun elementi oluştur
    createActiveGameElement(game) {
        const div = document.createElement('div');
        div.className = 'active-game-item';

        // Oyun bilgileri
        let gameName = '';
        let gameIcon = 'fa-gamepad';

        switch (game.gameType) {
            case '2048':
                gameName = '2048';
                gameIcon = 'fa-th-large';
                break;
            case 'chess':
                gameName = 'Satranç';
                gameIcon = 'fa-chess-king';
                break;
            case 'rps':
                gameName = 'Taş-Kağıt-Makas';
                gameIcon = 'fa-hand-scissors';
                break;
            case 'coin':
                gameName = 'Yazı-Tura';
                gameIcon = 'fa-coins';
                break;
            case 'wheel':
                gameName = 'Çarkıfelek';
                gameIcon = 'fa-sync-alt';
                break;
        }

        div.innerHTML = `
    < div class="active-game-icon" >
        <i class="fas ${gameIcon}"></i>
            </div >
            <div class="active-game-info">
                <h4>${gameName}</h4>
                <p>${game.players.length} oyuncu</p>
            </div>
            <div class="active-game-actions">
                <button class="btn-small" data-game-id="${game.id}">
                    <i class="fas fa-play"></i>
                    Devam Et
                </button>
            </div>
`;

        // Devam et butonu
        const continueBtn = div.querySelector('.btn-small');
        continueBtn.addEventListener('click', () => {
            this.continueGame(game.id, game.gameType);
        });

        return div;
    }

    // Oyuna devam et
    continueGame(gameId, gameType) {
        // Oyun tipine göre modal aç
        this.launchGame(gameType);

        // Oyun durumunu yükle
        // (Bu kısım oyun tipine göre özelleştirilecek)
        showToast(`${gameType} oyununa devam ediliyor...`, 'info');
    }

    // Oyun puanı ekle
    async addGamePoints(gameType, points) {
        try {
            if (!AppState.currentUser) return;

            // Kullanıcının puanlarını güncelle
            await updateDoc(doc(db, 'users', AppState.currentUser.uid), {
                coins: increment(points),
                totalPoints: increment(points)
            });

            // Liderlik tablosunu güncelle
            await this.updateLeaderboardScore(points);

            // Kullanıcı istatistiklerini güncelle
            await updateDoc(doc(db, 'users', AppState.currentUser.uid, 'gameStats', gameType), {
                pointsEarned: increment(points),
                lastEarned: serverTimestamp()
            });

            // UI'ı güncelle
            this.updateUserStats();

            // Bildirim göster
            showToast(`+ ${points} puan kazandınız!`, 'success');

        } catch (error) {
            console.error("Puan ekleme hatası:", error);
        }
    }

    // Liderlik skorunu güncelle
    async updateLeaderboardScore(points) {
        try {
            if (!AppState.currentUser) return;

            const leaderboardRef = doc(db, 'leaderboard', AppState.currentUser.uid);
            const leaderboardDoc = await getDoc(leaderboardRef);

            const updateData = {
                userId: AppState.currentUser.uid,
                totalScore: increment(points * 10), // Puanları 10 ile çarp
                lastUpdated: serverTimestamp()
            };

            if (leaderboardDoc.exists()) {
                await updateDoc(leaderboardRef, updateData);
            } else {
                // Kullanıcı bilgilerini al
                const userDoc = await getDoc(doc(db, 'users', AppState.currentUser.uid));
                if (userDoc.exists()) {
                    const userData = userDoc.data();
                    Object.assign(updateData, {
                        username: userData.username,
                        avatarUrl: userData.avatarUrl,
                        role: userData.role,
                        coins: userData.coins || 0,
                        wins: userData.wins || 0,
                        streak: userData.streak || 0
                    });
                }

                await setDoc(leaderboardRef, updateData);
            }

        } catch (error) {
            console.error("Liderlik skoru güncelleme hatası:", error);
        }
    }

    // Kullanıcı istatistiklerini güncelle
    updateUserStats() {
        // Dashboard'daki istatistikleri güncelle
        const user = AppState.currentUser;
        if (user) {
            // Firestore'dan güncel verileri al
            getDoc(doc(db, 'users', user.uid)).then(doc => {
                if (doc.exists()) {
                    const userData = doc.data();

                    document.getElementById('stat-coins').textContent = userData.coins || 0;
                    document.getElementById('stat-wins').textContent = userData.wins || 0;
                    document.getElementById('stat-streak').textContent = userData.streak || 0;

                    // Global sıralamayı güncelle
                    this.updateGlobalRank(user.uid);
                }
            }).catch(console.error);
        }
    }

    // Global sıralamayı güncelle
    async updateGlobalRank(userId) {
        try {
            // Liderlik tablosunda sıralama yap
            const leaderboardQuery = query(
                collection(db, 'leaderboard'),
                orderBy('totalScore', 'desc')
            );

            const snapshot = await getDocs(leaderboardQuery);

            let rank = 1;
            let userRank = 999;

            for (const doc of snapshot.docs) {
                if (doc.id === userId) {
                    userRank = rank;
                    break;
                }
                rank++;
            }

            // UI'ı güncelle
            document.getElementById('stat-rank').textContent = `#${userRank} `;

            // Kullanıcının rank'ını kaydet
            await updateDoc(doc(db, 'users', userId), {
                rank: userRank
            });

        } catch (error) {
            console.error("Global sıralama güncelleme hatası:", error);
        }
    }

    // Oyun yöneticisini temizle
    cleanup() {
        // Aktif oyunları temizle
        this.activeGames.clear();

        // Oyun instance'larını temizle
        this.gameInstances.forEach(game => {
            if (game.cleanup) {
                game.cleanup();
            }
        });
        this.gameInstances.clear();

        console.log("Oyun yöneticisi temizlendi");
    }
}

// Global instance'lar
let chatSystem = null;
let gameManager = null;
let leaderboardSystem = null;

// BÖLÜM 2 Başlatma Fonksiyonu
function initializePart2() {
    console.log("BÖLÜM 2 başlatılıyor...");

    // Sohbet sistemini başlat
    chatSystem = new ChatSystem();
    chatSystem.initializeChat().then(() => {
        console.log("Sohbet sistemi hazır");
    }).catch(error => {
        console.error("Sohbet sistemi başlatma hatası:", error);
    });

    // Oyun yöneticisini başlat
    gameManager = new GameManager();
    gameManager.initialize();

    // Liderlik sistemini başlat
    leaderboardSystem = new LeaderboardSystem();
    leaderboardSystem.initialize().then(() => {
        console.log("Liderlik sistemi hazır");
    }).catch(error => {
        console.error("Liderlik sistemi başlatma hatası:", error);
    });

    // Sayfa yönlendirmelerini güncelle
    updatePageTemplates();

    console.log("BÖLÜM 2 başlatıldı");
}

// Sayfa şablonlarını güncelle
function updatePageTemplates() {
    // Sohbet sayfasını ekle
    const chatPage = document.getElementById('chat-page');
    if (chatPage && chatPage.innerHTML === '') {
        chatPage.innerHTML = `
    < div class="page-header" >
                <h2 class="page-title">
                    <i class="fas fa-comments"></i>
                    Sohbet
                </h2>
                <div class="page-actions">
                    <button class="btn-secondary" id="create-chat-room">
                        <i class="fas fa-plus-circle"></i>
                        Oda Oluştur
                    </button>
                </div>
            </div >

    <div class="chat-container">
        <!-- Sol Kenar Çubuğu -->
        <div class="chat-sidebar">
            <div class="chat-tabs">
                <button class="chat-tab active" data-tab="rooms">
                    <i class="fas fa-comments"></i>
                    Odalar
                </button>
                <button class="chat-tab" data-tab="dm">
                    <i class="fas fa-envelope"></i>
                    Özel Mesajlar
                    <span class="chat-tab-badge">3</span>
                </button>
            </div>

            <!-- Odalar -->
            <div class="chat-tab-content active" id="chat-rooms">
                <div class="chat-rooms-list">
                    <!-- Odalar dinamik olarak eklenecek -->
                </div>
            </div>

            <!-- Özel Mesajlar -->
            <div class="chat-tab-content" id="chat-dm">
                <div class="dm-list-container">
                    <!-- DM listesi dinamik olarak eklenecek -->
                </div>
            </div>
        </div>

        <!-- Ana Sohbet Alanı -->
        <div class="chat-main">
            <div class="chat-header">
                <div class="chat-header-info">
                    <div class="chat-header-icon">
                        <i class="fas fa-globe"></i>
                    </div>
                    <div class="chat-header-text">
                        <h3>Genel Sohbet</h3>
                        <p>
                            <i class="fas fa-users"></i>
                            <span id="room-member-count">0 çevrimiçi</span>
                            <i class="fas fa-comment" style="margin-left: 15px;"></i>
                            <span>Genel Sohbet</span>
                        </p>
                    </div>
                </div>
                <div class="chat-header-actions">
                    <button class="btn-icon" title="Odadaki kullanıcılar">
                        <i class="fas fa-users"></i>
                    </button>
                    <button class="btn-icon" title="Sohbet ayarları">
                        <i class="fas fa-cog"></i>
                    </button>
                </div>
            </div>

            <div class="chat-messages">
                <!-- Mesajlar dinamik olarak eklenecek -->
            </div>

            <div class="chat-input-container">
                <div class="chat-input-form">
                    <div class="chat-input-attachments">
                        <button class="chat-input-attachment-btn" title="Dosya ekle">
                            <i class="fas fa-paperclip"></i>
                        </button>
                        <button class="chat-input-attachment-btn" title="Emoji ekle">
                            <i class="fas fa-smile"></i>
                        </button>
                    </div>
                    <div class="chat-input-wrapper">
                        <textarea class="chat-input" placeholder="Mesajınızı yazın..."></textarea>
                        <div class="chat-input-actions">
                            <button class="chat-input-send">
                                <i class="fas fa-paper-plane"></i>
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    </div>
`;
    }

    // Oyunlar sayfasını ekle
    const gamesPage = document.getElementById('games-page');
    if (gamesPage && gamesPage.innerHTML === '') {
        gamesPage.innerHTML = `
    < div class="games-header" >
                <h2>Oyunlar</h2>
                <p>Arkadaşlarınızla veya rastgele oyuncularla rekabet edin, puan kazanın ve liderlik tablosunda yükselin!</p>
            </div >
            
            <div class="games-categories">
                <button class="category-btn active" data-category="all">Tümü</button>
                <button class="category-btn" data-category="strategy">Strateji</button>
                <button class="category-btn" data-category="luck">Şans Oyunları</button>
                <button class="category-btn" data-category="puzzle">Bulmaca</button>
                <button class="category-btn" data-category="popular">Popüler</button>
            </div>
            
            <div class="games-grid">
                <!-- Oyun kartları dinamik olarak eklenecek -->
                <div class="game-card-large" data-game="chess">
                    <div class="game-card-image">
                        <img src="https://images.unsplash.com/photo-1586165368502-1bad197a6461?ixlib=rb-1.2.1&auto=format&fit=crop&w=800&q=80" alt="Satranç">
                        <div class="game-card-overlay">
                            <div class="game-card-players">
                                <i class="fas fa-users"></i>
                                <span>1.2k oynuyor</span>
                            </div>
                        </div>
                    </div>
                    <div class="game-card-content">
                        <div class="game-card-header">
                            <div class="game-card-title">
                                <h3>Satranç</h3>
                                <span class="game-card-category">Strateji</span>
                            </div>
                            <div class="game-card-rating">
                                <i class="fas fa-star"></i>
                                <span>4.8</span>
                            </div>
                        </div>
                        <p class="game-card-description">
                            Zekanızı test edin ve stratejik düşünme becerilerinizi geliştirin. Rakibinizin şahını mat ederek zafer kazanın.
                        </p>
                        <div class="game-card-stats">
                            <div class="game-card-stat">
                                <div class="game-card-stat-value">15</div>
                                <div class="game-card-stat-label">Dakika</div>
                            </div>
                            <div class="game-card-stat">
                                <div class="game-card-stat-value">2</div>
                                <div class="game-card-stat-label">Oyuncu</div>
                            </div>
                            <div class="game-card-stat">
                                <div class="game-card-stat-value">%45</div>
                                <div class="game-card-stat-label">Kazanma</div>
                            </div>
                        </div>
                        <div class="game-card-actions">
                            <button class="game-card-play">
                                <i class="fas fa-play"></i>
                                OYNA
                            </button>
                            <button class="game-card-info">
                                <i class="fas fa-info-circle"></i>
                                Detaylar
                            </button>
                        </div>
                    </div>
                </div>
                
                <!-- Diğer oyun kartları benzer şekilde eklenecek -->
            </div>
`;
    }

    // Liderlik sayfasını ekle
    const leaderboardPage = document.getElementById('leaderboard-page');
    if (leaderboardPage && leaderboardPage.innerHTML === '') {
        leaderboardPage.innerHTML = `
    < div class="leaderboard-header" >
                <h2>Liderlik Tablosu</h2>
                <p>En iyi oyuncularla rekabet edin ve zirveye tırmanın!</p>
            </div >
            
            <div class="leaderboard-filters">
                <button class="leaderboard-filter active" data-filter="all">
                    <i class="fas fa-trophy"></i>
                    Genel Sıralama
                </button>
                <button class="leaderboard-filter" data-filter="coins">
                    <i class="fas fa-coins"></i>
                    En Çok Coin
                </button>
                <button class="leaderboard-filter" data-filter="wins">
                    <i class="fas fa-crown"></i>
                    En Çok Galibiyet
                </button>
                <button class="leaderboard-filter" data-filter="streak">
                    <i class="fas fa-fire"></i>
                    En Uzun Seri
                </button>
            </div>
            
            <div class="leaderboard-container">
                <table class="leaderboard-table">
                    <thead>
                        <tr>
                            <th><i class="fas fa-hashtag"></i> Sıra</th>
                            <th><i class="fas fa-user"></i> Oyuncu</th>
                            <th><i class="fas fa-chart-line"></i> Değer</th>
                            <th><i class="fas fa-cog"></i> İşlemler</th>
                        </tr>
                    </thead>
                    <tbody>
                        <!-- Liderlik verileri dinamik olarak eklenecek -->
                    </tbody>
                </table>
                
                <div class="leaderboard-pagination">
                    <button id="leaderboard-prev">
                        <i class="fas fa-chevron-left"></i>
                        Önceki
                    </button>
                    <span class="leaderboard-pagination-info">Sayfa 1 / 10</span>
                    <button id="leaderboard-next">
                        Sonraki
                        <i class="fas fa-chevron-right"></i>
                    </button>
                </div>
            </div>
            
            <div class="points-system">
                <h3><i class="fas fa-star"></i> Puan Kazanma Yolları</h3>
                <div class="points-rules">
                    <div class="point-rule">
                        <div class="point-rule-icon">
                            <i class="fas fa-gamepad"></i>
                        </div>
                        <div class="point-rule-info">
                            <div class="point-rule-action">Oyun Oyna</div>
                            <div class="point-rule-points">+10 Puan</div>
                        </div>
                    </div>
                    <div class="point-rule">
                        <div class="point-rule-icon">
                            <i class="fas fa-trophy"></i>
                        </div>
                        <div class="point-rule-info">
                            <div class="point-rule-action">Oyun Kazan</div>
                            <div class="point-rule-points">+50 Puan</div>
                        </div>
                    </div>
                    <div class="point-rule">
                        <div class="point-rule-icon">
                            <i class="fas fa-fire"></i>
                        </div>
                        <div class="point-rule-info">
                            <div class="point-rule-action">Günlük Seri</div>
                            <div class="point-rule-points">+20 Puan/Gün</div>
                        </div>
                    </div>
                    <div class="point-rule">
                        <div class="point-rule-icon">
                            <i class="fas fa-users"></i>
                        </div>
                        <div class="point-rule-info">
                            <div class="point-rule-action">Arkadaş Davet Et</div>
                            <div class="point-rule-points">+100 Puan</div>
                        </div>
                    </div>
                </div>
            </div>
`;
    }
}

// Sayfa değiştiğinde BÖLÜM 2'yi başlat
document.addEventListener('DOMContentLoaded', function () {
    // BÖLÜM 1 başlatıldıktan sonra BÖLÜM 2'yi hazırla
    setTimeout(() => {
        initializePart2();
    }, 1000);

    // Sayfa değişikliklerini dinle
    const originalNavigateToPage = window.navigateToPage;
    window.navigateToPage = function (pageId) {
        originalNavigateToPage(pageId);

        // Eğer sohbet sayfasına gidiliyorsa, sohbet sistemini başlat
        if (pageId === 'chat' && chatSystem) {
            chatSystem.initializeChat();
        }

        // Eğer oyunlar sayfasına gidiliyorsa, oyun yöneticisini güncelle
        if (pageId === 'games' && gameManager) {
            gameManager.updateActiveGames();
        }

        // Eğer liderlik sayfasına gidiliyorsa, liderlik sistemini güncelle
        if (pageId === 'leaderboard' && leaderboardSystem) {
            leaderboardSystem.loadLeaderboardData();
        }
    };
});

// Uygulama kapatıldığında temizlik yap
window.addEventListener('beforeunload', function () {
    if (chatSystem) {
        chatSystem.cleanup();
    }

    if (gameManager) {
        gameManager.cleanup();
    }

    if (leaderboardSystem) {
        leaderboardSystem.cleanup();
    }
});

// Hata yakalama
window.addEventListener('error', function (e) {
    console.error('BÖLÜM 2 Global hata:', e.error);

    // Hata bildirimi gönder
    if (AppState.currentUser) {
        const errorData = {
            message: e.error?.message || 'Bilinmeyen hata',
            stack: e.error?.stack || '',
            url: window.location.href,
            userAgent: navigator.userAgent,
            timestamp: new Date().toISOString(),
            userId: AppState.currentUser.uid
        };

        // Firestore'a hata kaydı ekle (isteğe bağlı)
        addDoc(collection(db, 'errors'), errorData).catch(console.error);
    }
});

console.log("BÖLÜM 2 kodları yüklendi ve hazır");

// =========================================
// OYUN MANTIKLARI (BÖLÜM 3)
// =========================================

// --- Satranç Oyunu Mantığı ---
class ChessGame {
    constructor() {
        this.board = null;
        this.selectedSquare = null;
        this.turn = 'white'; // white, black
        this.pieces = {
            'r': '♜', 'n': '♞', 'b': '♝', 'q': '♛', 'k': '♚', 'p': '♟', // Black pieces
            'R': '♖', 'N': '♘', 'B': '♗', 'Q': '♕', 'K': '♔', 'P': '♙'  // White pieces
        };
        // Basit başlangıç pozisyonu (FEN benzeri dizi)
        this.initialPosition = [
            ['r', 'n', 'b', 'q', 'k', 'b', 'n', 'r'],
            ['p', 'p', 'p', 'p', 'p', 'p', 'p', 'p'],
            ['', '', '', '', '', '', '', ''],
            ['', '', '', '', '', '', '', ''],
            ['', '', '', '', '', '', '', ''],
            ['', '', '', '', '', '', '', ''],
            ['P', 'P', 'P', 'P', 'P', 'P', 'P', 'P'],
            ['R', 'N', 'B', 'Q', 'K', 'B', 'N', 'R']
        ];
        this.currentPosition = JSON.parse(JSON.stringify(this.initialPosition));
    }

    startGame() {
        const modal = document.createElement('div');
        modal.className = 'modal active';
        modal.id = 'chess-game-modal';
        modal.innerHTML = `
    < div class="modal-content game-modal" >
                <div class="modal-header">
                    <h2><i class="fas fa-chess-board"></i> Satranç</h2>
                    <button class="modal-close"><i class="fas fa-times"></i></button>
                </div>
                <div class="modal-body">
                    <div class="chess-container">
                        <div class="game-info">
                            <span id="chess-turn">Sıra: Beyaz</span>
                        </div>
                        <div id="chess-board" class="chess-board"></div>
                        <div class="chess-controls">
                            <button class="btn-secondary" id="chess-reset">Yeniden Başlat</button>
                        </div>
                    </div>
                </div>
            </div >
    `;
        document.body.appendChild(modal);

        this.board = document.getElementById('chess-board');
        this.renderBoard();

        // Event listeners
        modal.querySelector('.modal-close').addEventListener('click', () => modal.remove());
        document.getElementById('chess-reset').addEventListener('click', () => {
            this.currentPosition = JSON.parse(JSON.stringify(this.initialPosition));
            this.turn = 'white';
            this.selectedSquare = null;
            this.renderBoard();
            this.updateStatus();
        });
    }

    renderBoard() {
        this.board.innerHTML = '';
        for (let row = 0; row < 8; row++) {
            for (let col = 0; col < 8; col++) {
                const square = document.createElement('div');
                square.className = `chess - square ${(row + col) % 2 === 0 ? 'white' : 'black'} `;
                square.dataset.row = row;
                square.dataset.col = col;

                const pieceCode = this.currentPosition[row][col];
                if (pieceCode) {
                    square.textContent = this.pieces[pieceCode];
                    // Stil için renk ayarı (basitçe her zaman siyah text, ama CSS ile ayarlanabilir)
                }

                if (this.selectedSquare && this.selectedSquare.row === row && this.selectedSquare.col === col) {
                    square.classList.add('selected');
                }

                square.addEventListener('click', () => this.handleSquareClick(row, col));
                this.board.appendChild(square);
            }
        }
    }

    handleSquareClick(row, col) {
        const clickedPiece = this.currentPosition[row][col];
        const isWhitePiece = clickedPiece && clickedPiece === clickedPiece.toUpperCase();
        const isTurnMatch = (this.turn === 'white' && isWhitePiece) || (this.turn === 'black' && !isWhitePiece && clickedPiece);

        // Seçim yapma
        if (this.selectedSquare === null) {
            if (clickedPiece && isTurnMatch) {
                this.selectedSquare = { row, col };
                this.renderBoard();
            }
        } else {
            // Hareket etme veya seçim değiştirme
            if (this.selectedSquare.row === row && this.selectedSquare.col === col) {
                // Seçimi iptal et
                this.selectedSquare = null;
                this.renderBoard();
            } else if (clickedPiece && isTurnMatch) {
                // Yeni parça seç
                this.selectedSquare = { row, col };
                this.renderBoard();
            } else {
                // Hamle yap (Geçerlilik kontrolü basitleştirildi)
                this.movePiece(this.selectedSquare.row, this.selectedSquare.col, row, col);
            }
        }
    }

    movePiece(fromRow, fromCol, toRow, toCol) {
        // Basit hamle mantığı (kural kontrolü yok)
        const piece = this.currentPosition[fromRow][fromCol];
        this.currentPosition[toRow][toCol] = piece;
        this.currentPosition[fromRow][fromCol] = '';

        this.turn = this.turn === 'white' ? 'black' : 'white';
        this.selectedSquare = null;
        this.renderBoard();
        this.updateStatus();
    }

    updateStatus() {
        document.getElementById('chess-turn').textContent = `Sıra: ${this.turn === 'white' ? 'Beyaz' : 'Siyah'} `;
    }
}

// --- Taş-Kağıt-Makas Fonksiyonu ---
window.startRPSGame = function () {
    const modal = document.createElement('div');
    modal.className = 'modal active';
    modal.id = 'rps-game-modal';

    modal.innerHTML = `
    < div class="modal-content game-modal" >
            <div class="modal-header">
                <h2><i class="fas fa-hand-scissors"></i> Taş-Kağıt-Makas</h2>
                <button class="modal-close"><i class="fas fa-times"></i></button>
            </div>
            <div class="modal-body">
                <div class="rps-container">
                    <h3>Seçiminizi Yapın</h3>
                    <div class="rps-choices">
                        <div class="rps-choice-btn" data-choice="rock"><i class="fas fa-hand-rock"></i></div>
                        <div class="rps-choice-btn" data-choice="paper"><i class="fas fa-hand-paper"></i></div>
                        <div class="rps-choice-btn" data-choice="scissors"><i class="fas fa-hand-scissors"></i></div>
                    </div>
                    <div class="rps-result-area" id="rps-result">
                        <p>Sonuç bekleniyor...</p>
                    </div>
                </div>
            </div>
        </div >
    `;
    document.body.appendChild(modal);

    const choices = ['rock', 'paper', 'scissors'];
    const icons = { 'rock': 'fa-hand-rock', 'paper': 'fa-hand-paper', 'scissors': 'fa-hand-scissors' };

    modal.querySelectorAll('.rps-choice-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const userChoice = btn.dataset.choice;
            const botChoice = choices[Math.floor(Math.random() * choices.length)];

            // Sonuç hesaplama
            let result = 'draw';
            if ((userChoice === 'rock' && botChoice === 'scissors') ||
                (userChoice === 'paper' && botChoice === 'rock') ||
                (userChoice === 'scissors' && botChoice === 'paper')) {
                result = 'win';
            } else if (userChoice !== botChoice) {
                result = 'lose';
            }

            const resultTexts = { 'win': 'KAZANDIN! (+10 XP)', 'lose': 'KAYBETTİN!', 'draw': 'BERABERE' };
            const resultColorClass = `rps - result - ${result} `;

            const resultArea = document.getElementById('rps-result');
            resultArea.innerHTML = `
    < div style = "display: flex; justify-content: center; align-items: center; gap: 20px;" >
                    <div>
                        <p>Sen</p>
                        <i class="fas ${icons[userChoice]} fa-3x"></i>
                    </div>
                    <div class="rps-vs">VS</div>
                    <div>
                        <p>Bot</p>
                        <i class="fas ${icons[botChoice]} fa-3x"></i>
                    </div>
                </div >
    <h2 class="${resultColorClass}" style="margin-top: 20px;">${resultTexts[result]}</h2>
`;

            // Eğer kazandıysa istatistik güncelle (Firebase ile bağlantı kurulabilir)
            if (result === 'win' && AppState.currentUser) {
                // Firebase güncellemesi burada yapılabilir
                showToast('Tebrikler! Puan kazandınız.', 'success');
            }
        });
    });

    modal.querySelector('.modal-close').addEventListener('click', () => modal.remove());
};

// --- Yazı-Tura Fonksiyonu ---
window.startCoinGame = function () {
    const modal = document.createElement('div');
    modal.className = 'modal active';
    modal.id = 'coin-game-modal';

    modal.innerHTML = `
    < div class="modal-content game-modal" >
            <div class="modal-header">
                <h2><i class="fas fa-coins"></i> Yazı-Tura</h2>
                <button class="modal-close"><i class="fas fa-times"></i></button>
            </div>
            <div class="modal-body">
                <div class="coin-container">
                    <div class="coin-flip" id="coin-visual">
                        <i class="fas fa-coins"></i>
                    </div>
                    <div style="margin-top: 20px; display: flex; gap: 10px;">
                        <button class="btn-primary" id="btn-heads">YAZI</button>
                        <button class="btn-primary" id="btn-tails">TURA</button>
                    </div>
                    <div id="coin-result" style="margin-top: 20px; font-weight: bold;"></div>
                </div>
            </div>
        </div >
    `;
    document.body.appendChild(modal);

    const coinEl = document.getElementById('coin-visual');
    const resultEl = document.getElementById('coin-result');

    const flipCoin = (prediction) => {
        resultEl.textContent = 'Para dönüyor...';
        coinEl.classList.remove('heads', 'tails', 'animated');
        void coinEl.offsetWidth; // Reflow
        coinEl.classList.add('animated');

        setTimeout(() => {
            const isHeads = Math.random() < 0.5;
            const result = isHeads ? 'heads' : 'tails'; // 'heads' -> YAZI, 'tails' -> TURA

            coinEl.classList.add(result);
            const won = (prediction === result);

            resultEl.innerHTML = `
    < span class="${won ? 'rps-result-win' : 'rps-result-lose'}" >
        ${isHeads ? 'YAZI' : 'TURA'} geldi.${won ? 'KAZANDIN!' : 'KAYBETTİN!'}
                </span >
    `;

            if (won) showToast('Doğru tahmin!', 'success');
        }, 3000); // 3 saniye animasyon
    };

    document.getElementById('btn-heads').addEventListener('click', () => flipCoin('heads'));
    document.getElementById('btn-tails').addEventListener('click', () => flipCoin('tails'));

    modal.querySelector('.modal-close').addEventListener('click', () => modal.remove());
};

// --- Çarkıfelek Fonksiyonu ---
window.startWheelGame = function () {
    const modal = document.createElement('div');
    modal.className = 'modal active';
    modal.id = 'wheel-game-modal';

    modal.innerHTML = `
    < div class="modal-content game-modal" >
            <div class="modal-header">
                <h2><i class="fas fa-sync-alt"></i> Çarkıfelek</h2>
                <button class="modal-close"><i class="fas fa-times"></i></button>
            </div>
            <div class="modal-body">
                <div class="wheel-container">
                    <div class="wheel-wrapper">
                        <div class="wheel-pointer"></div>
                        <canvas id="wheel-canvas" width="300" height="300"></canvas>
                        <div class="wheel-center"></div>
                    </div>
                    <button class="btn-primary" id="spin-btn" style="margin-top: 20px;">
                        Çarkı Çevir
                    </button>
                    <div id="wheel-result" style="margin-top: 15px; font-weight: bold;"></div>
                </div>
            </div>
        </div >
    `;
    document.body.appendChild(modal);

    const canvas = document.getElementById('wheel-canvas');
    const ctx = canvas.getContext('2d');
    const spinBtn = document.getElementById('spin-btn');
    const resultEl = document.getElementById('wheel-result');

    const segments = ['100 Coin', 'Boş', '500 Coin', 'Tekrar', '50 Coin', 'Kaybettin', '200 Coin', 'Jackpot'];
    const colors = ['#f44336', '#e91e63', '#9c27b0', '#673ab7', '#3f51b5', '#2196f3', '#03a9f4', '#00bcd4'];

    let currentAngle = 0;
    let isSpinning = false;
    let arc = Math.PI * 2 / segments.length;

    function drawWheel() {
        ctx.clearRect(0, 0, 300, 300);
        const centerX = 150;
        const centerY = 150;
        const radius = 150;

        for (let i = 0; i < segments.length; i++) {
            const angle = currentAngle + i * arc;
            ctx.beginPath();
            ctx.fillStyle = colors[i];
            ctx.moveTo(centerX, centerY);
            ctx.arc(centerX, centerY, radius, angle, angle + arc);
            ctx.lineTo(centerX, centerY);
            ctx.fill();

            ctx.save();
            ctx.translate(centerX + Math.cos(angle + arc / 2) * (radius - 50),
                centerY + Math.sin(angle + arc / 2) * (radius - 50));
            ctx.rotate(angle + arc / 2 + Math.PI / 2); // Metni merkeze dik yap
            ctx.fillStyle = "white";
            ctx.font = "bold 14px Arial";
            ctx.fillText(segments[i], -ctx.measureText(segments[i]).width / 2, 0);
            ctx.restore();
        }
    }

    drawWheel(); // İlk çizim

    spinBtn.addEventListener('click', () => {
        if (isSpinning) return;
        isSpinning = true;
        resultEl.textContent = "Dönüyor...";

        // Rastgele bir dönüş
        const spinTime = 4000;
        const spinAngleStart = Math.random() * 10 + 20; // Hızlı başlangıç
        let spinAngle = spinAngleStart;
        let start = null;

        function animate(timestamp) {
            if (!start) start = timestamp;
            const progress = timestamp - start;

            if (progress < spinTime) {
                // Yavaşlama efekti
                const easeOut = 1 - Math.pow(progress / spinTime - 1, 4); // Quartic ease-out
                currentAngle += (spinAngle * (1 - progress / spinTime)) * 0.1;
                drawWheel();
                requestAnimationFrame(animate);
            } else {
                isSpinning = false;
                // Sonucu hesapla
                const degrees = (currentAngle * 180 / Math.PI) % 360;
                const index = Math.floor((360 - degrees) / (360 / segments.length)) % segments.length;
                resultEl.textContent = `Sonuç: ${segments[index]} `;
                showToast(`Kazandın: ${segments[index]} `, 'success');
            }
        }

        requestAnimationFrame(animate);
    });

    modal.querySelector('.modal-close').addEventListener('click', () => modal.remove());
};

// --- Global helper for connecting the Chess class to the launch function ---
// launchGame fonksiyonu switch case içinde 'chess' için basitçe navigateToPage yapmıştı
// Bunu düzeltmek için global bir override veya listener ekleyebiliriz ama 
// şimdilik clean bir yöntem olarak button click handler'ı global scope'ta güncelliyoruz.
document.addEventListener('click', (e) => {
    if (e.target.closest('[data-game="chess"] .btn-game-play')) {
        // Eğer satranç "Oyna" butonuna basıldıysa ve navigate yerine modal açmak istiyorsak:
        // Mevcut app.js switch case'i 'navigateToPage' yapıyor.
        // Bunu 'startChessGame' olarak değiştirmek en doğrusu ama app.js'in ortasını değiştirmek riskli olabilir.
        // (Replace yerine append yapıyoruz).
        // Bu yüzden kullanıcı 'Oyunlar' sayfasına gittiğinde orada bir "Başlat" butonu görmeli veya
        // biz switch case'i override etmeliyiz.
        // Neyse, şimdilik basitçe buton çalışıyor mu diye test edelim.
    }
});

// Chess instance
window.chessGameInstance = new ChessGame();

// --- 2048 Oyunu Mantığı ---
window.start2048Game = function () {
    const modal = document.createElement('div');
    modal.className = 'modal active';
    modal.id = 'game-2048-modal';

    modal.innerHTML = `
    < div class="modal-content game-modal" >
            <div class="modal-header">
                <h2><i class="fas fa-th-large"></i> 2048</h2>
                <button class="modal-close"><i class="fas fa-times"></i></button>
            </div>
            <div class="modal-body">
                <div class="game-2048-container">
                    <div class="game-2048-header">
                        <div class="game-score">
                            <span class="score-label">SKOR</span>
                            <span class="score-value" id="2048-score">0</span>
                        </div>
                        <button class="btn-secondary" id="2048-new-game">Yeni Oyun</button>
                    </div>
                    <div class="game-2048-board" id="2048-board"></div>
                    <p style="text-align: center; color: #888; font-size: 0.9rem;">
                        Yön tuşlarını kullanarak sayıları birleştirin ve 2048'e ulaşın!
                    </p>
                </div>
            </div>
        </div >
    `;
    document.body.appendChild(modal);

    let board = [];
    let score = 0;
    const size = 4;
    const boardEl = document.getElementById('2048-board');
    const scoreEl = document.getElementById('2048-score');

    function initGame() {
        board = Array(size).fill().map(() => Array(size).fill(0));
        score = 0;
        updateScore();
        addNewTile();
        addNewTile();
        renderBoard();
    }

    function addNewTile() {
        const emptyTiles = [];
        for (let r = 0; r < size; r++) {
            for (let c = 0; c < size; c++) {
                if (board[r][c] === 0) emptyTiles.push({ r, c });
            }
        }
        if (emptyTiles.length > 0) {
            const { r, c } = emptyTiles[Math.floor(Math.random() * emptyTiles.length)];
            board[r][c] = Math.random() < 0.9 ? 2 : 4;
        }
    }

    function renderBoard() {
        boardEl.innerHTML = '';
        for (let r = 0; r < size; r++) {
            for (let c = 0; c < size; c++) {
                const tile = document.createElement('div');
                tile.className = 'tile';
                const value = board[r][c];
                tile.dataset.value = value;
                tile.textContent = value > 0 ? value : '';
                if (value > 2048) tile.style.background = '#3c3a32';
                boardEl.appendChild(tile);
            }
        }
    }

    function updateScore() {
        scoreEl.textContent = score;
    }

    function move(direction) {
        let moved = false;

        // Basit kaydırma mantığı (daha kompleks versiyonu yerine temel işlevsellik)
        const rotateBoard = (times) => {
            for (let t = 0; t < times; t++) {
                const newBoard = Array(size).fill().map(() => Array(size).fill(0));
                for (let r = 0; r < size; r++) {
                    for (let c = 0; c < size; c++) {
                        newBoard[c][size - 1 - r] = board[r][c];
                    }
                }
                board = newBoard;
            }
        };

        // 0: left, 1: up, 2: right, 3: down
        // Rotate board so we always process as "slide left"
        if (direction === 'ArrowUp') rotateBoard(1); // Left -> Up (Wait, standard rotation for processing?)
        // Let's stick to standard logic:
        // rotate so direction becomes "Left"
        // Up: rotate 270 (3 times) or 90 anti-clockwise? 
        // Let's implement slideLeft directly and rotate board to matching orientation
        // Default slideLeft
        let rotations = 0;
        if (direction === 'ArrowUp') rotations = 3; // 90 deg counter-clockwise visual, effectively logic needs rotation
        if (direction === 'ArrowRight') rotations = 2;
        if (direction === 'ArrowDown') rotations = 1;

        rotateBoard(rotations);

        // Slide Left Logic
        for (let r = 0; r < size; r++) {
            let row = board[r].filter(val => val !== 0);
            for (let i = 0; i < row.length - 1; i++) {
                if (row[i] === row[i + 1]) {
                    row[i] *= 2;
                    score += row[i];
                    row.splice(i + 1, 1);
                }
            }
            while (row.length < size) row.push(0);
            if (row.join(',') !== board[r].join(',')) moved = true;
            board[r] = row;
        }

        // Restore rotation
        rotateBoard((4 - rotations) % 4);

        if (moved) {
            addNewTile();
            renderBoard();
            updateScore();
        }
    }

    document.addEventListener('keydown', (e) => {
        if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key)) {
            e.preventDefault();
            move(e.key);
        }
    });

    document.getElementById('2048-new-game').addEventListener('click', initGame);
    modal.querySelector('.modal-close').addEventListener('click', () => modal.remove());

    initGame();
};


// --- Launch Game Functionality ---

// Global launchGame fonksiyonunu oluştur
// Bu fonksiyon app.js modül scope'unda tanımlanır ve app.js içindeki diğer fonksiyonlar tarafından çağrılabilir.
async function launchGame(gameType) {
    console.log(`Oyun başlatılıyor: ${gameType} `);

    // Basit bir switch case ile oyunları başlat
    switch (gameType) {
        case 'chess':
            if (window.chessGameInstance) {
                window.chessGameInstance.startGame();
            } else {
                console.error("Satranç oyunu yüklenemedi");
                showToast("Satranç şu anda kullanılamıyor", "error");
            }
            break;

        case 'rps':
            if (typeof window.startRPSGame === 'function') {
                window.startRPSGame();
            } else {
                console.error("RPS oyunu bulunamadı");
            }
            break;

        case 'coin':
            if (typeof window.startCoinGame === 'function') {
                window.startCoinGame();
            } else {
                console.error("Yazı-Tura oyunu bulunamadı");
            }
            break;

        case 'wheel':
            if (typeof window.startWheelGame === 'function') {
                window.startWheelGame();
            } else {
                console.error("Çarkıfelek oyunu bulunamadı");
            }
            break;

        case '2048':
            if (typeof window.start2048Game === 'function') {
                window.start2048Game();
            } else {
                console.error("2048 oyunu bulunamadı");
            }
            break;

        default:
            console.warn(`Bilinmeyen oyun türü: ${gameType} `);
            showToast(`${gameType} oyunu henüz aktif değil`, "info");
    }
}

// Window objesine de ekle (eğer global erişim gerekirse)
window.launchGame = launchGame;

// GameManager class'ını patchle
// GameManager instance'ı (gameManager) zaten oluşturulmuş olabilir, ancak class prototype'ını değiştirebiliriz.
if (typeof GameManager !== 'undefined') {
    console.log("GameManager patchleniyor...");
    GameManager.prototype.launchGame = function (gameType) {
        console.log("GameManager üzerinden oyun başlatılıyor:", gameType);
        window.launchGame(gameType);
    };
} else {
    console.warn("GameManager tanımlı değil, patchlenemedi.");
}

// Satranç başlatıcı (üstteki switch case bunu çağırmıyordu, 'games' sayfasına atıyordu.
// O yüzden games sayfasında "Satranç Başlat" butonu olmalı veya biz launchGame'i yamalamalıyız.)
// Bu örnekte direkt çağrılabilir: window.chessGameInstance.startGame()
