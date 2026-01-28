// Firebase imports
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { 
    getAuth, 
    createUserWithEmailAndPassword, 
    signInWithEmailAndPassword,
    onAuthStateChanged,
    signOut,
    updateProfile,
    updatePassword
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import { 
    getDatabase, 
    ref, 
    set, 
    get, 
    onValue,
    push,
    update,
    serverTimestamp,
    query,
    orderByChild,
    limitToLast
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-database.js";

// Firebase configuration
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

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const database = getDatabase(app);

// Global variables
let currentUser = null;
let isLoginMode = true;
let adCooldown = false;
const AD_COOLDOWN_TIME = 1200; // 20 dakika (saniye cinsinden)
let currentMultiplier = 1;
let allUsers = [];

// DOM Elements
const loginScreen = document.getElementById('loginScreen');
const mainApp = document.getElementById('mainApp');
const loginButton = document.getElementById('loginButton');
const loginToggle = document.getElementById('loginToggle');
const loginEmail = document.getElementById('loginEmail');
const loginPassword = document.getElementById('loginPassword');
const loginUsername = document.getElementById('loginUsername');
const loginError = document.getElementById('loginError');
const loginTitle = document.getElementById('loginTitle');

// Header elements
const profileIcon = document.getElementById('profileIcon');
const profileImage = document.getElementById('profileImage');
const profileEmoji = document.getElementById('profileEmoji');
const dropdown = document.getElementById('dropdown');
const logoutBtn = document.getElementById('logoutBtn');
const themeToggle = document.getElementById('themeToggle');
const themeToggleItem = document.getElementById('themeToggleItem');
const userScore = document.getElementById('userScore');
const headerUsername = document.getElementById('headerUsername');
const headerEmail = document.getElementById('headerEmail');
const dropdownUsername = document.getElementById('dropdownUsername');
const dropdownEmail = document.getElementById('dropdownEmail');
const editProfileBtn = document.getElementById('editProfileBtn');
const marketBtn = document.getElementById('marketBtn');
const leaderboardBtn = document.getElementById('leaderboardBtn');

// Game cards
const coinFlipCard = document.getElementById('coinFlipCard');
const rpsCard = document.getElementById('rpsCard');
const spinWheelCard = document.getElementById('spinWheelCard');
const chessCard = document.getElementById('chessCard');

// Chat elements
const chatMessages = document.getElementById('chatMessages');
const chatInput = document.getElementById('chatInput');
const chatSend = document.getElementById('chatSend');
const chatToggleMobile = document.getElementById('chatToggleMobile');
const chatSidebar = document.getElementById('chatSidebar');

// Ad elements
const watchAdBtn = document.getElementById('watchAdBtn');
const adCooldownDiv = document.getElementById('adCooldown');
const adTimer = document.getElementById('adTimer');

// Leaderboard elements
const userSearchInput = document.getElementById('userSearchInput');
const leaderboardList = document.getElementById('leaderboardList');
const searchResultsList = document.getElementById('searchResultsList');

// Session Management - Logout on page refresh
sessionStorage.setItem('shouldLogout', 'true');

// Initialize app
document.addEventListener('DOMContentLoaded', () => {
    checkThemePreference();
    setupEventListeners();
    checkAdCooldown();
});

// Auth state observer
onAuthStateChanged(auth, (user) => {
    if (user) {
        // Check if should logout on refresh
        if (sessionStorage.getItem('shouldLogout') === 'true') {
            sessionStorage.removeItem('shouldLogout');
            signOut(auth);
            return;
        }
        
        currentUser = user;
        showMainApp();
        loadUserData();
        listenToChat();
        listenToScore();
        listenToMultiplier();
        loadAllUsers();
    } else {
        currentUser = null;
        showLoginScreen();
    }
});

// Setup event listeners
function setupEventListeners() {
    // Login/Register
    if (loginButton) loginButton.addEventListener('click', handleAuth);
    if (loginToggle) loginToggle.addEventListener('click', toggleLoginMode);
    
    // Profile dropdown
    if (profileIcon) profileIcon.addEventListener('click', toggleDropdown);
    if (logoutBtn) logoutBtn.addEventListener('click', handleLogout);
    if (editProfileBtn) editProfileBtn.addEventListener('click', () => openGameModal('profileModal'));
    if (marketBtn) marketBtn.addEventListener('click', () => openGameModal('marketModal'));
    if (leaderboardBtn) leaderboardBtn.addEventListener('click', () => {
        openGameModal('leaderboardModal');
        loadTopUsers();
    });
    
    if (themeToggleItem) {
        themeToggleItem.addEventListener('click', (e) => {
            e.stopPropagation();
            toggleTheme();
        });
    }
    
    // Close dropdown when clicking outside
    document.addEventListener('click', (e) => {
        if (dropdown && profileIcon && !dropdown.contains(e.target) && !profileIcon.contains(e.target)) {
            dropdown.classList.remove('active');
        }
    });
    
    // Game cards
    if (coinFlipCard) coinFlipCard.addEventListener('click', () => openGameModal('coinFlipModal'));
    if (rpsCard) rpsCard.addEventListener('click', () => openGameModal('rpsModal'));
    if (spinWheelCard) spinWheelCard.addEventListener('click', () => openGameModal('spinWheelModal'));
    if (chessCard) chessCard.addEventListener('click', () => openGameModal('chessModal'));
    
    // Chat
    if (chatSend) chatSend.addEventListener('click', sendMessage);
    if (chatInput) {
        chatInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') sendMessage();
        });
    }
    
    // Chat mobile toggle
    if (chatToggleMobile) {
        chatToggleMobile.addEventListener('click', () => {
            chatSidebar.classList.toggle('minimized');
            chatToggleMobile.textContent = chatSidebar.classList.contains('minimized') ? '▲' : '▼';
        });
    }
    
    // Ad button
    if (watchAdBtn) watchAdBtn.addEventListener('click', watchAd);
    
    // Leaderboard tabs
    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            
            const tab = btn.dataset.tab;
            if (tab === 'top') {
                document.getElementById('topUsersTab').style.display = 'block';
                document.getElementById('searchResultsTab').style.display = 'none';
                loadTopUsers();
            } else {
                document.getElementById('topUsersTab').style.display = 'none';
                document.getElementById('searchResultsTab').style.display = 'block';
            }
        });
    });
    
    // User search
    if (userSearchInput) {
        userSearchInput.addEventListener('input', (e) => {
            searchUsers(e.target.value);
        });
    }
    
    // Modal close buttons
    document.querySelectorAll('.modal-close').forEach(btn => {
        btn.addEventListener('click', (e) => {
            closeGameModal(e.target.dataset.modal);
        });
    });
    
    // Profile edit
    const saveProfileBtn = document.getElementById('saveProfileBtn');
    if (saveProfileBtn) saveProfileBtn.addEventListener('click', saveProfile);
    
    const profileImageUrl = document.getElementById('profileImageUrl');
    if (profileImageUrl) {
        profileImageUrl.addEventListener('input', (e) => {
            const preview = document.getElementById('profilePreview');
            if (e.target.value) {
                preview.src = e.target.value;
                preview.style.display = 'block';
            } else {
                preview.style.display = 'none';
            }
        });
    }
    
    // Market box purchases
    document.querySelectorAll('.buy-box-btn').forEach(btn => {
        btn.addEventListener('click', () => buyBox(btn.dataset.box));
    });
    
    // Coin Flip
    document.querySelectorAll('#coinFlipModal .choice-btn').forEach(btn => {
        btn.addEventListener('click', () => playCoinFlip(btn.dataset.choice));
    });
    
    // RPS
    document.querySelectorAll('#rpsModal .choice-btn').forEach(btn => {
        btn.addEventListener('click', () => playRPS(btn.dataset.choice));
    });
    
    // Spin Wheel
    const spinBtn = document.getElementById('spinBtn');
    if (spinBtn) spinBtn.addEventListener('click', spinWheel);
    
    // Chess
    const chessStartBtn = document.getElementById('chessStartBtn');
    if (chessStartBtn) chessStartBtn.addEventListener('click', startChessGame);
    
    // Initialize wheel after DOM is ready
    setTimeout(initWheel, 100);
}

// Leaderboard Functions
async function loadAllUsers() {
    const usersRef = ref(database, 'users');
    onValue(usersRef, (snapshot) => {
        allUsers = [];
        snapshot.forEach((childSnapshot) => {
            const userData = childSnapshot.val();
            allUsers.push({
                uid: childSnapshot.key,
                username: userData.username || 'Kullanıcı',
                score: userData.score || 0,
                profileImage: userData.profileImage || null
            });
        });
        
        // Sort by score descending
        allUsers.sort((a, b) => b.score - a.score);
    });
}

async function loadTopUsers() {
    leaderboardList.innerHTML = '<div class="loading">Yükleniyor...</div>';
    
    // Wait a bit for allUsers to be populated
    setTimeout(() => {
        if (allUsers.length === 0) {
            leaderboardList.innerHTML = '<div class="search-placeholder">Henüz kullanıcı yok</div>';
            return;
        }
        
        const topUsers = allUsers.slice(0, 100); // Top 100
        displayUsers(topUsers, leaderboardList);
    }, 500);
}

function searchUsers(searchTerm) {
    if (!searchTerm.trim()) {
        searchResultsList.innerHTML = '<div class="search-placeholder">Kullanıcı adı girin...</div>';
        return;
    }
    
    const term = searchTerm.toLowerCase();
    const results = allUsers.filter(user => 
        user.username.toLowerCase().includes(term)
    );
    
    if (results.length === 0) {
        searchResultsList.innerHTML = '<div class="search-placeholder">Kullanıcı bulunamadı</div>';
    } else {
        displayUsers(results, searchResultsList);
    }
}

function displayUsers(users, container) {
    container.innerHTML = '';
    
    users.forEach((user, index) => {
        const item = document.createElement('div');
        item.className = 'leaderboard-item';
        
        // Add rank class for top 3
        const globalRank = allUsers.findIndex(u => u.uid === user.uid) + 1;
        if (globalRank === 1) item.classList.add('rank-1');
        else if (globalRank === 2) item.classList.add('rank-2');
        else if (globalRank === 3) item.classList.add('rank-3');
        
        const rankDisplay = globalRank;
        let rankEmoji = '';
        if (globalRank === 1) rankEmoji = '🥇';
        else if (globalRank === 2) rankEmoji = '🥈';
        else if (globalRank === 3) rankEmoji = '🥉';
        
        item.innerHTML = `
            <div class="rank-number">${rankEmoji || rankDisplay}</div>
            <div class="user-avatar">
                ${user.profileImage ? 
                    `<img src="${user.profileImage}" alt="${user.username}">` : 
                    '👤'
                }
            </div>
            <div class="user-info">
                <div class="user-name">${escapeHtml(user.username)}</div>
                <div class="user-score">💎 ${user.score}</div>
            </div>
        `;
        
        container.appendChild(item);
    });
}

// Authentication functions
async function handleAuth() {
    const email = loginEmail.value.trim();
    const password = loginPassword.value.trim();
    const username = loginUsername.value.trim();
    
    loginError.textContent = '';
    
    if (!email || !password) {
        loginError.textContent = 'Email ve şifre gerekli!';
        return;
    }
    
    if (!isLoginMode && !username) {
        loginError.textContent = 'Kullanıcı adı gerekli!';
        return;
    }
    
    if (password.length < 6) {
        loginError.textContent = 'Şifre en az 6 karakter olmalı!';
        return;
    }
    
    loginButton.disabled = true;
    
    try {
        if (isLoginMode) {
            // Login
            await signInWithEmailAndPassword(auth, email, password);
            // Clear logout flag on successful login
            sessionStorage.removeItem('shouldLogout');
        } else {
            // Register
            const userCredential = await createUserWithEmailAndPassword(auth, email, password);
            const user = userCredential.user;
            
            // Update profile with username
            await updateProfile(user, { displayName: username });
            
            // Create user in database with starting score
            await set(ref(database, 'users/' + user.uid), {
                username: username,
                email: email,
                score: 20,
                multiplier: 1,
                createdAt: serverTimestamp()
            });
            
            // Clear logout flag on successful registration
            sessionStorage.removeItem('shouldLogout');
        }
    } catch (error) {
        console.error('Auth error:', error);
        let errorMessage = 'Bir hata oluştu!';
        
        if (error.code === 'auth/email-already-in-use') {
            errorMessage = 'Bu email zaten kullanımda!';
        } else if (error.code === 'auth/invalid-email') {
            errorMessage = 'Geçersiz email adresi!';
        } else if (error.code === 'auth/wrong-password' || error.code === 'auth/user-not-found') {
            errorMessage = 'Email veya şifre hatalı!';
        } else if (error.code === 'auth/invalid-credential') {
            errorMessage = 'Giriş bilgileri hatalı!';
        }
        
        loginError.textContent = errorMessage;
        loginButton.disabled = false;
    }
}

function toggleLoginMode() {
    isLoginMode = !isLoginMode;
    
    if (isLoginMode) {
        loginTitle.textContent = '🎮 Giriş Yap';
        loginButton.textContent = 'Giriş Yap';
        loginToggle.textContent = 'Hesabın yok mu? Kayıt ol';
        loginUsername.style.display = 'none';
    } else {
        loginTitle.textContent = '🎮 Kayıt Ol';
        loginButton.textContent = 'Kayıt Ol';
        loginToggle.textContent = 'Hesabın var mı? Giriş yap';
        loginUsername.style.display = 'block';
    }
    
    loginError.textContent = '';
}

async function handleLogout() {
    try {
        await signOut(auth);
        dropdown.classList.remove('active');
        sessionStorage.setItem('shouldLogout', 'true');
    } catch (error) {
        console.error('Logout error:', error);
    }
}

// Screen functions
function showLoginScreen() {
    loginScreen.style.display = 'flex';
    mainApp.classList.remove('show');
}

function showMainApp() {
    loginScreen.style.display = 'none';
    mainApp.classList.add('show');
}

// User data functions
async function loadUserData() {
    if (!currentUser) return;
    
    const username = currentUser.displayName || 'Kullanıcı';
    const email = currentUser.email;
    
    headerUsername.textContent = username;
    headerEmail.textContent = email;
    dropdownUsername.textContent = username;
    dropdownEmail.textContent = email;
    
    // Load profile image if exists
    const userRef = ref(database, 'users/' + currentUser.uid);
    const snapshot = await get(userRef);
    if (snapshot.exists()) {
        const userData = snapshot.val();
        if (userData.profileImage) {
            profileImage.src = userData.profileImage;
            profileImage.style.display = 'block';
            profileEmoji.style.display = 'none';
        }
    }
}

function listenToScore() {
    if (!currentUser) return;
    
    const scoreRef = ref(database, 'users/' + currentUser.uid + '/score');
    onValue(scoreRef, (snapshot) => {
        const score = snapshot.val() || 0;
        userScore.textContent = score;
    });
}

function listenToMultiplier() {
    if (!currentUser) return;
    
    const multiplierRef = ref(database, 'users/' + currentUser.uid + '/multiplier');
    onValue(multiplierRef, (snapshot) => {
        currentMultiplier = snapshot.val() || 1;
        const activeMultiplierDiv = document.getElementById('activeMultiplier');
        const multiplierValueSpan = document.getElementById('multiplierValue');
        
        if (currentMultiplier > 1) {
            activeMultiplierDiv.style.display = 'block';
            multiplierValueSpan.textContent = `x${currentMultiplier}`;
        } else {
            activeMultiplierDiv.style.display = 'none';
        }
    });
}

async function updateScore(newScore) {
    if (!currentUser) return;
    
    try {
        await update(ref(database, 'users/' + currentUser.uid), {
            score: newScore
        });
    } catch (error) {
        console.error('Score update error:', error);
    }
}

async function getCurrentScore() {
    if (!currentUser) return 0;
    
    try {
        const snapshot = await get(ref(database, 'users/' + currentUser.uid + '/score'));
        return snapshot.val() || 0;
    } catch (error) {
        console.error('Get score error:', error);
        return 0;
    }
}

async function applyMultiplier(winAmount) {
    if (currentMultiplier > 1) {
        const multipliedAmount = Math.floor(winAmount * currentMultiplier);
        // Reset multiplier after use
        await update(ref(database, 'users/' + currentUser.uid), {
            multiplier: 1
        });
        return multipliedAmount;
    }
    return winAmount;
}

// Profile Edit Functions
async function saveProfile() {
    if (!currentUser) return;
    
    const profileImageUrl = document.getElementById('profileImageUrl').value.trim();
    const newUsername = document.getElementById('newUsername').value.trim();
    const newPassword = document.getElementById('newPassword').value.trim();
    const profileMessage = document.getElementById('profileMessage');
    
    profileMessage.textContent = '';
    profileMessage.className = 'profile-message';
    
    try {
        const updates = {};
        
        // Update profile image
        if (profileImageUrl) {
            updates.profileImage = profileImageUrl;
            profileImage.src = profileImageUrl;
            profileImage.style.display = 'block';
            profileEmoji.style.display = 'none';
        }
        
        // Update username
        if (newUsername) {
            await updateProfile(currentUser, { displayName: newUsername });
            updates.username = newUsername;
            headerUsername.textContent = newUsername;
            dropdownUsername.textContent = newUsername;
        }
        
        // Update database
        if (Object.keys(updates).length > 0) {
            await update(ref(database, 'users/' + currentUser.uid), updates);
        }
        
        // Update password
        if (newPassword) {
            if (newPassword.length < 6) {
                profileMessage.textContent = 'Şifre en az 6 karakter olmalı!';
                profileMessage.classList.add('error');
                return;
            }
            await updatePassword(currentUser, newPassword);
        }
        
        profileMessage.textContent = '✅ Profil başarıyla güncellendi!';
        profileMessage.classList.add('success');
        
        // Clear inputs
        setTimeout(() => {
            document.getElementById('profileImageUrl').value = '';
            document.getElementById('newUsername').value = '';
            document.getElementById('newPassword').value = '';
            document.getElementById('profilePreview').style.display = 'none';
        }, 2000);
        
    } catch (error) {
        console.error('Profile update error:', error);
        profileMessage.textContent = '❌ Hata: ' + error.message;
        profileMessage.classList.add('error');
    }
}

// Market System - Loot Boxes
async function buyBox(boxType) {
    const currentScore = await getCurrentScore();
    const boxResult = document.getElementById('boxResult');
    
    const boxes = {
        bronze: {
            price: 50,
            minPoints: 50,
            maxPoints: 200,
            multipliers: [
                { value: 2, chance: 0.1 }
            ]
        },
        silver: {
            price: 150,
            minPoints: 200,
            maxPoints: 500,
            multipliers: [
                { value: 2, chance: 0.2 },
                { value: 5, chance: 0.05 }
            ]
        },
        gold: {
            price: 400,
            minPoints: 500,
            maxPoints: 1500,
            multipliers: [
                { value: 2, chance: 0.3 },
                { value: 5, chance: 0.15 },
                { value: 10, chance: 0.05 }
            ]
        }
    };
    
    const box = boxes[boxType];
    
    if (currentScore < box.price) {
        boxResult.textContent = '❌ Yetersiz puan!';
        boxResult.className = 'box-result error';
        return;
    }
    
    // Deduct box price
    await updateScore(currentScore - box.price);
    
    // Determine reward
    const rand = Math.random();
    let totalMultiplierChance = box.multipliers.reduce((sum, m) => sum + m.chance, 0);
    
    if (rand < totalMultiplierChance) {
        // Got a multiplier
        let cumulativeChance = 0;
        for (const mult of box.multipliers) {
            cumulativeChance += mult.chance;
            if (rand < cumulativeChance) {
                await update(ref(database, 'users/' + currentUser.uid), {
                    multiplier: mult.value
                });
                boxResult.textContent = `🎉 x${mult.value} Katlayıcı kazandın! Bir sonraki oyunda geçerli olacak!`;
                boxResult.className = 'box-result success';
                return;
            }
        }
    } else {
        // Got points
        const points = Math.floor(Math.random() * (box.maxPoints - box.minPoints + 1)) + box.minPoints;
        const newScore = await getCurrentScore();
        await updateScore(newScore + points);
        boxResult.textContent = `💎 ${points} puan kazandın!`;
        boxResult.className = 'box-result success';
    }
}

// Theme functions
function toggleTheme() {
    document.body.classList.toggle('dark-mode');
    themeToggle.classList.toggle('active');
    
    const isDark = document.body.classList.contains('dark-mode');
    localStorage.setItem('darkMode', isDark);
    document.getElementById('themeLabel').textContent = isDark ? 'Light Mode' : 'Dark Mode';
}

function checkThemePreference() {
    const isDark = localStorage.getItem('darkMode') === 'true';
    if (isDark) {
        document.body.classList.add('dark-mode');
        themeToggle.classList.add('active');
        document.getElementById('themeLabel').textContent = 'Light Mode';
    }
}

function toggleDropdown() {
    dropdown.classList.toggle('active');
}

// Chat functions
function listenToChat() {
    const chatRef = ref(database, 'chat');
    
    onValue(chatRef, (snapshot) => {
        chatMessages.innerHTML = '';
        
        const messages = [];
        snapshot.forEach((childSnapshot) => {
            messages.push({
                id: childSnapshot.key,
                ...childSnapshot.val()
            });
        });
        
        // Sort by timestamp and show last 50 messages
        messages.sort((a, b) => a.timestamp - b.timestamp);
        const recentMessages = messages.slice(-50);
        
        if (recentMessages.length === 0) {
            chatMessages.innerHTML = '<div class="chat-welcome">Global chat\'e hoş geldin! 🎮</div>';
        } else {
            recentMessages.forEach(msg => {
                displayMessage(msg);
            });
        }
        
        chatMessages.scrollTop = chatMessages.scrollHeight;
    });
}

function displayMessage(msg) {
    const messageDiv = document.createElement('div');
    messageDiv.className = 'chat-message';
    
    const time = msg.timestamp ? new Date(msg.timestamp).toLocaleTimeString('tr-TR', {
        hour: '2-digit',
        minute: '2-digit'
    }) : '';
    
    messageDiv.innerHTML = `
        <div class="message-user">${escapeHtml(msg.username)}</div>
        <div class="message-text">${escapeHtml(msg.message)}</div>
        <div class="message-time">${time}</div>
    `;
    
    chatMessages.appendChild(messageDiv);
}

async function sendMessage() {
    const message = chatInput.value.trim();
    
    if (!message || !currentUser) return;
    
    try {
        const chatRef = ref(database, 'chat');
        await push(chatRef, {
            username: currentUser.displayName || 'Kullanıcı',
            message: message,
            timestamp: serverTimestamp(),
            userId: currentUser.uid
        });
        
        chatInput.value = '';
    } catch (error) {
        console.error('Send message error:', error);
    }
}

// Ad watch function - 20 minute cooldown
async function watchAd() {
    if (adCooldown) return;
    
    watchAdBtn.disabled = true;
    watchAdBtn.textContent = 'Reklam izleniyor...';
    
    setTimeout(async () => {
        const currentScore = await getCurrentScore();
        await updateScore(currentScore + 50);
        
        watchAdBtn.textContent = '+50 Puan Kazandın! 🎉';
        
        // Start cooldown and save to localStorage
        startAdCooldown();
        
        setTimeout(() => {
            if (!adCooldown) {
                watchAdBtn.textContent = '+50 Puan Kazan';
            }
        }, 2000);
    }, 3000);
}

function startAdCooldown() {
    adCooldown = true;
    const endTime = Date.now() + (AD_COOLDOWN_TIME * 1000);
    localStorage.setItem('adCooldownEnd', endTime);
    
    updateAdTimer();
}

function updateAdTimer() {
    const endTime = parseInt(localStorage.getItem('adCooldownEnd'));
    if (!endTime) return;
    
    const interval = setInterval(() => {
        const now = Date.now();
        const timeLeft = Math.max(0, Math.floor((endTime - now) / 1000));
        
        if (timeLeft <= 0) {
            clearInterval(interval);
            adCooldown = false;
            adCooldownDiv.style.display = 'none';
            watchAdBtn.style.display = 'block';
            watchAdBtn.disabled = false;
            localStorage.removeItem('adCooldownEnd');
        } else {
            adCooldownDiv.style.display = 'block';
            watchAdBtn.style.display = 'none';
            const minutes = Math.floor(timeLeft / 60);
            const seconds = timeLeft % 60;
            adTimer.textContent = `${minutes}:${seconds.toString().padStart(2, '0')}`;
        }
    }, 1000);
}

function checkAdCooldown() {
    const endTime = parseInt(localStorage.getItem('adCooldownEnd'));
    if (endTime && Date.now() < endTime) {
        adCooldown = true;
        updateAdTimer();
    }
}

// Game modal functions
function openGameModal(modalId) {
    document.getElementById(modalId).style.display = 'flex';
    
    // Initialize wheel if opening wheel modal
    if (modalId === 'spinWheelModal' && !wheelCtx) {
        setTimeout(initWheel, 100);
    }
    
    // Initialize chess if opening chess modal
    if (modalId === 'chessModal') {
        resetChessGame();
    }
}

function closeGameModal(modalId) {
    document.getElementById(modalId).style.display = 'none';
    
    // Clear results
    const results = document.querySelectorAll('.game-result');
    results.forEach(result => {
        result.textContent = '';
        result.className = 'game-result';
    });
    
    // Clear box result
    const boxResult = document.getElementById('boxResult');
    if (boxResult) {
        boxResult.textContent = '';
        boxResult.className = 'box-result';
    }
}

// Coin Flip Game
async function playCoinFlip(choice) {
    const betAmount = parseInt(document.getElementById('coinBetAmount').value);
    const currentScore = await getCurrentScore();
    
    if (betAmount < 10) {
        showGameResult('coinResult', 'Minimum bahis 10 puan!', 'lose');
        return;
    }
    
    if (betAmount > currentScore) {
        showGameResult('coinResult', 'Yetersiz puan!', 'lose');
        return;
    }
    
    const buttons = document.querySelectorAll('#coinFlipModal .choice-btn');
    buttons.forEach(btn => btn.disabled = true);
    
    showGameResult('coinResult', '🪙 Atılıyor...', '');
    
    setTimeout(async () => {
        const result = Math.random() < 0.5 ? 'heads' : 'tails';
        const won = result === choice;
        
        const resultText = result === 'heads' ? 'Yazı 📄' : 'Tura 🪙';
        
        if (won) {
            let winAmount = betAmount;
            winAmount = await applyMultiplier(winAmount);
            await updateScore(currentScore - betAmount + (betAmount + winAmount));
            showGameResult('coinResult', `${resultText} geldi! +${winAmount} puan kazandın! 🎉`, 'win');
        } else {
            await updateScore(currentScore - betAmount);
            showGameResult('coinResult', `${resultText} geldi! -${betAmount} puan kaybettin 😢`, 'lose');
        }
        
        buttons.forEach(btn => btn.disabled = false);
    }, 1500);
}

// Rock Paper Scissors Game
async function playRPS(playerChoice) {
    const betAmount = parseInt(document.getElementById('rpsBetAmount').value);
    const currentScore = await getCurrentScore();
    
    if (betAmount < 10) {
        showGameResult('rpsResult', 'Minimum bahis 10 puan!', 'lose');
        return;
    }
    
    if (betAmount > currentScore) {
        showGameResult('rpsResult', 'Yetersiz puan!', 'lose');
        return;
    }
    
    const buttons = document.querySelectorAll('#rpsModal .choice-btn');
    buttons.forEach(btn => btn.disabled = true);
    
    showGameResult('rpsResult', '🤔 Düşünüyor...', '');
    
    setTimeout(async () => {
        const choices = ['rock', 'paper', 'scissors'];
        const computerChoice = choices[Math.floor(Math.random() * 3)];
        
        const icons = {
            rock: '🪨',
            paper: '📄',
            scissors: '✂️'
        };
        
        let result = '';
        if (playerChoice === computerChoice) {
            result = 'draw';
        } else if (
            (playerChoice === 'rock' && computerChoice === 'scissors') ||
            (playerChoice === 'paper' && computerChoice === 'rock') ||
            (playerChoice === 'scissors' && computerChoice === 'paper')
        ) {
            result = 'win';
        } else {
            result = 'lose';
        }
        
        if (result === 'win') {
            let winAmount = betAmount;
            winAmount = await applyMultiplier(winAmount);
            await updateScore(currentScore - betAmount + (betAmount + winAmount));
            showGameResult('rpsResult', `Bilgisayar: ${icons[computerChoice]} - Kazandın! +${winAmount} puan 🎉`, 'win');
        } else if (result === 'lose') {
            await updateScore(currentScore - betAmount);
            showGameResult('rpsResult', `Bilgisayar: ${icons[computerChoice]} - Kaybettin! -${betAmount} puan 😢`, 'lose');
        } else {
            showGameResult('rpsResult', `Bilgisayar: ${icons[computerChoice]} - Berabere! Puanın iade edildi`, '');
        }
        
        buttons.forEach(btn => btn.disabled = false);
    }, 1500);
}

// Spin Wheel Game - FIXED
let wheelCanvas, wheelCtx;
let isSpinning = false;
const wheelSegments = [
    { text: '0.5x', multiplier: 0.5, color: '#f5576c' },
    { text: '1.5x', multiplier: 1.5, color: '#4ecdc4' },
    { text: '0x', multiplier: 0, color: '#ff6b6b' },
    { text: '2x', multiplier: 2, color: '#95e1d3' },
    { text: '0.5x', multiplier: 0.5, color: '#f5576c' },
    { text: '3x', multiplier: 3, color: '#feca57' },
    { text: '0x', multiplier: 0, color: '#ff6b6b' },
    { text: '5x', multiplier: 5, color: '#48dbfb' }
];

function initWheel() {
    wheelCanvas = document.getElementById('wheelCanvas');
    if (!wheelCanvas) {
        console.log('Wheel canvas not found, will initialize when modal opens');
        return;
    }
    
    wheelCtx = wheelCanvas.getContext('2d');
    drawWheel(0);
}

function drawWheel(rotation) {
    const centerX = wheelCanvas.width / 2;
    const centerY = wheelCanvas.height / 2;
    const radius = wheelCanvas.width / 2 - 10;
    
    wheelCtx.clearRect(0, 0, wheelCanvas.width, wheelCanvas.height);
    
    const segmentAngle = (2 * Math.PI) / wheelSegments.length;
    
    wheelSegments.forEach((segment, index) => {
        const startAngle = rotation + index * segmentAngle;
        const endAngle = startAngle + segmentAngle;
        
        // Draw segment
        wheelCtx.beginPath();
        wheelCtx.arc(centerX, centerY, radius, startAngle, endAngle);
        wheelCtx.lineTo(centerX, centerY);
        wheelCtx.fillStyle = segment.color;
        wheelCtx.fill();
        wheelCtx.strokeStyle = '#fff';
        wheelCtx.lineWidth = 2;
        wheelCtx.stroke();
        
        // Draw text
        wheelCtx.save();
        wheelCtx.translate(centerX, centerY);
        wheelCtx.rotate(startAngle + segmentAngle / 2);
        wheelCtx.textAlign = 'center';
        wheelCtx.fillStyle = '#fff';
        wheelCtx.font = 'bold 20px Arial';
        wheelCtx.fillText(segment.text, radius / 1.5, 0);
        wheelCtx.restore();
    });
    
    // Draw center circle
    wheelCtx.beginPath();
    wheelCtx.arc(centerX, centerY, 20, 0, 2 * Math.PI);
    wheelCtx.fillStyle = '#fff';
    wheelCtx.fill();
    wheelCtx.strokeStyle = '#667eea';
    wheelCtx.lineWidth = 3;
    wheelCtx.stroke();
}

async function spinWheel() {
    if (isSpinning) return;
    
    const betAmount = parseInt(document.getElementById('wheelBetAmount').value);
    const currentScore = await getCurrentScore();
    
    if (betAmount < 10) {
        showGameResult('wheelResult', 'Minimum bahis 10 puan!', 'lose');
        return;
    }
    
    if (betAmount > currentScore) {
        showGameResult('wheelResult', 'Yetersiz puan!', 'lose');
        return;
    }
    
    isSpinning = true;
    document.getElementById('spinBtn').disabled = true;
    showGameResult('wheelResult', '🎡 Çark dönüyor...', '');
    
    const spinDuration = 3000;
    const startTime = Date.now();
    
    // Random result index
    const resultIndex = Math.floor(Math.random() * wheelSegments.length);
    
    // Calculate target rotation
    // We want the pointer (at top) to point to the selected segment
    const segmentAngle = (2 * Math.PI) / wheelSegments.length;
    const baseRotations = 2 * Math.PI * 5; // 5 full rotations
    
    // Calculate angle to align selected segment with pointer (top = 3π/2)
    const pointerAngle = (3 * Math.PI) / 2;
    const segmentCenterAngle = resultIndex * segmentAngle + segmentAngle / 2;
    const targetRotation = baseRotations + (pointerAngle - segmentCenterAngle);
    
    let currentRotation = 0;
    
    function animate() {
        const elapsed = Date.now() - startTime;
        const progress = Math.min(elapsed / spinDuration, 1);
        
        // Easing function for smooth deceleration
        const easeOut = 1 - Math.pow(1 - progress, 3);
        currentRotation = targetRotation * easeOut;
        
        drawWheel(currentRotation);
        
        if (progress < 1) {
            requestAnimationFrame(animate);
        } else {
            finishSpin(resultIndex, betAmount, currentScore);
        }
    }
    
    animate();
}

async function finishSpin(resultIndex, betAmount, currentScore) {
    const result = wheelSegments[resultIndex];
    let winAmount = Math.floor(betAmount * result.multiplier);
    
    // Apply user's multiplier if they have one
    if (currentMultiplier > 1 && result.multiplier > 0) {
        winAmount = await applyMultiplier(winAmount);
    }
    
    const netChange = winAmount - betAmount;
    
    await updateScore(currentScore + netChange);
    
    if (netChange > 0) {
        showGameResult('wheelResult', `${result.text} geldi! +${netChange} puan kazandın! 🎉`, 'win');
    } else if (netChange < 0) {
        showGameResult('wheelResult', `${result.text} geldi! ${netChange} puan kaybettin 😢`, 'lose');
    } else {
        showGameResult('wheelResult', `${result.text} geldi! Hiçbir şey kazanmadın`, '');
    }
    
    isSpinning = false;
    document.getElementById('spinBtn').disabled = false;
}

// Chess Game
let chessBoard = [];
let selectedSquare = null;
let currentTurn = 'white';
let chessGameActive = false;
let chessBet = 0;

const chessPieces = {
    white: {
        king: '♔',
        queen: '♕',
        rook: '♖',
        bishop: '♗',
        knight: '♘',
        pawn: '♙'
    },
    black: {
        king: '♚',
        queen: '♛',
        rook: '♜',
        bishop: '♝',
        knight: '♞',
        pawn: '♟'
    }
};

function initializeChessBoard() {
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

async function startChessGame() {
    const betAmount = parseInt(document.getElementById('chessBetAmount').value);
    const currentScore = await getCurrentScore();
    
    if (betAmount < 50) {
        showGameResult('chessResult', 'Minimum bahis 50 puan!', 'lose');
        return;
    }
    
    if (betAmount > currentScore) {
        showGameResult('chessResult', 'Yetersiz puan!', 'lose');
        return;
    }
    
    chessBet = betAmount;
    await updateScore(currentScore - betAmount);
    
    chessGameActive = true;
    currentTurn = 'white';
    chessBoard = initializeChessBoard();
    renderChessBoard();
    
    document.getElementById('chessStartBtn').disabled = true;
    document.getElementById('chessBetDisplay').textContent = chessBet;
    updateChessStatus('Beyaz Hamle');
}

function resetChessGame() {
    chessGameActive = false;
    selectedSquare = null;
    currentTurn = 'white';
    chessBet = 0;
    chessBoard = initializeChessBoard();
    renderChessBoard();
    document.getElementById('chessStartBtn').disabled = false;
    updateChessStatus('Oyunu Başlat');
}

function renderChessBoard() {
    const boardElement = document.getElementById('chessBoard');
    boardElement.innerHTML = '';
    
    for (let row = 0; row < 8; row++) {
        for (let col = 0; col < 8; col++) {
            const square = document.createElement('div');
            square.className = 'chess-square ' + ((row + col) % 2 === 0 ? 'light' : 'dark');
            square.dataset.row = row;
            square.dataset.col = col;
            square.textContent = chessBoard[row][col];
            
            if (chessGameActive) {
                square.addEventListener('click', () => handleSquareClick(row, col));
            }
            
            boardElement.appendChild(square);
        }
    }
}

function handleSquareClick(row, col) {
    if (!chessGameActive) return;
    
    const piece = chessBoard[row][col];
    const isWhitePiece = Object.values(chessPieces.white).includes(piece);
    const isBlackPiece = Object.values(chessPieces.black).includes(piece);
    
    if (selectedSquare === null) {
        // Select piece
        if ((currentTurn === 'white' && isWhitePiece) || (currentTurn === 'black' && isBlackPiece)) {
            selectedSquare = { row, col };
            highlightSquare(row, col);
        }
    } else {
        // Move piece
        const fromRow = selectedSquare.row;
        const fromCol = selectedSquare.col;
        
        if (fromRow === row && fromCol === col) {
            // Deselect
            selectedSquare = null;
            renderChessBoard();
            return;
        }
        
        // Simple move validation (just check if destination is empty or opponent's piece)
        const canMove = piece === '' || 
                       (currentTurn === 'white' && isBlackPiece) ||
                       (currentTurn === 'black' && isWhitePiece);
        
        if (canMove) {
            // Capture king = win
            if (piece === chessPieces.black.king || piece === chessPieces.white.king) {
                chessBoard[row][col] = chessBoard[fromRow][fromCol];
                chessBoard[fromRow][fromCol] = '';
                renderChessBoard();
                endChessGame(currentTurn === 'white');
                return;
            }
            
            // Make move
            chessBoard[row][col] = chessBoard[fromRow][fromCol];
            chessBoard[fromRow][fromCol] = '';
            
            selectedSquare = null;
            renderChessBoard();
            
            // Switch turn
            currentTurn = currentTurn === 'white' ? 'black' : 'white';
            updateChessStatus(currentTurn === 'white' ? 'Beyaz Hamle' : 'Siyah Hamle');
            
            // Computer move
            if (currentTurn === 'black') {
                setTimeout(makeComputerMove, 500);
            }
        } else {
            selectedSquare = null;
            renderChessBoard();
        }
    }
}

function highlightSquare(row, col) {
    renderChessBoard();
    const squares = document.querySelectorAll('.chess-square');
    const index = row * 8 + col;
    squares[index].classList.add('selected');
}

function makeComputerMove() {
    // Simple AI: random valid move
    const blackPieces = [];
    for (let row = 0; row < 8; row++) {
        for (let col = 0; col < 8; col++) {
            if (Object.values(chessPieces.black).includes(chessBoard[row][col])) {
                blackPieces.push({ row, col });
            }
        }
    }
    
    if (blackPieces.length === 0) {
        endChessGame(true);
        return;
    }
    
    // Try random moves until valid
    let moved = false;
    let attempts = 0;
    while (!moved && attempts < 100) {
        attempts++;
        const piece = blackPieces[Math.floor(Math.random() * blackPieces.length)];
        const toRow = Math.floor(Math.random() * 8);
        const toCol = Math.floor(Math.random() * 8);
        
        const targetPiece = chessBoard[toRow][toCol];
        const isWhitePiece = Object.values(chessPieces.white).includes(targetPiece);
        
        if (targetPiece === '' || isWhitePiece) {
            // Capture king = loss
            if (targetPiece === chessPieces.white.king) {
                chessBoard[toRow][toCol] = chessBoard[piece.row][piece.col];
                chessBoard[piece.row][piece.col] = '';
                renderChessBoard();
                endChessGame(false);
                return;
            }
            
            chessBoard[toRow][toCol] = chessBoard[piece.row][piece.col];
            chessBoard[piece.row][piece.col] = '';
            moved = true;
        }
    }
    
    renderChessBoard();
    currentTurn = 'white';
    updateChessStatus('Beyaz Hamle');
}

async function endChessGame(playerWon) {
    chessGameActive = false;
    const currentScore = await getCurrentScore();
    
    if (playerWon) {
        let winAmount = chessBet;
        winAmount = await applyMultiplier(winAmount);
        await updateScore(currentScore + chessBet + winAmount);
        showGameResult('chessResult', `Şah Mat! +${winAmount} puan kazandın! 🎉`, 'win');
    } else {
        showGameResult('chessResult', 'Kaybettin! -' + chessBet + ' puan 😢', 'lose');
    }
    
    updateChessStatus('Oyun Bitti');
    setTimeout(resetChessGame, 3000);
}

function updateChessStatus(text) {
    document.getElementById('chessStatus').textContent = text;
}

// Helper functions
function showGameResult(elementId, message, className) {
    const element = document.getElementById(elementId);
    element.textContent = message;
    element.className = 'game-result ' + className;
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}
