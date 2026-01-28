// Firebase imports
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { 
    getAuth, 
    createUserWithEmailAndPassword, 
    signInWithEmailAndPassword,
    onAuthStateChanged,
    signOut,
    updateProfile
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import { 
    getDatabase, 
    ref, 
    set, 
    get, 
    onValue,
    push,
    update,
    serverTimestamp
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
const AD_COOLDOWN_TIME = 60; // seconds

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
const dropdown = document.getElementById('dropdown');
const logoutBtn = document.getElementById('logoutBtn');
const themeToggle = document.getElementById('themeToggle');
const themeToggleItem = document.getElementById('themeToggleItem');
const userScore = document.getElementById('userScore');
const headerUsername = document.getElementById('headerUsername');
const headerEmail = document.getElementById('headerEmail');
const dropdownUsername = document.getElementById('dropdownUsername');
const dropdownEmail = document.getElementById('dropdownEmail');

// Game cards
const coinFlipCard = document.getElementById('coinFlipCard');
const rpsCard = document.getElementById('rpsCard');
const spinWheelCard = document.getElementById('spinWheelCard');

// Chat elements
const chatMessages = document.getElementById('chatMessages');
const chatInput = document.getElementById('chatInput');
const chatSend = document.getElementById('chatSend');

// Ad elements
const watchAdBtn = document.getElementById('watchAdBtn');
const adCooldownDiv = document.getElementById('adCooldown');
const adTimer = document.getElementById('adTimer');

// Initialize app
document.addEventListener('DOMContentLoaded', () => {
    checkThemePreference();
    setupEventListeners();
});

// Auth state observer
onAuthStateChanged(auth, (user) => {
    if (user) {
        currentUser = user;
        showMainApp();
        loadUserData();
        listenToChat();
        listenToScore();
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
    
    // Chat
    if (chatSend) chatSend.addEventListener('click', sendMessage);
    if (chatInput) {
        chatInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') sendMessage();
        });
    }
    
    // Ad button
    if (watchAdBtn) watchAdBtn.addEventListener('click', watchAd);
    
    // Modal close buttons
    document.querySelectorAll('.modal-close').forEach(btn => {
        btn.addEventListener('click', (e) => {
            closeGameModal(e.target.dataset.modal);
        });
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
    
    // Initialize wheel after DOM is ready
    setTimeout(initWheel, 100);
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
                createdAt: serverTimestamp()
            });
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
}

function listenToScore() {
    if (!currentUser) return;
    
    const scoreRef = ref(database, 'users/' + currentUser.uid + '/score');
    onValue(scoreRef, (snapshot) => {
        const score = snapshot.val() || 0;
        userScore.textContent = score;
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

// Ad watch function
async function watchAd() {
    if (adCooldown) return;
    
    // Simulate ad watching
    watchAdBtn.disabled = true;
    watchAdBtn.textContent = 'Reklam izleniyor...';
    
    setTimeout(async () => {
        const currentScore = await getCurrentScore();
        await updateScore(currentScore + 50);
        
        watchAdBtn.textContent = '+50 Puan Kazandın! 🎉';
        
        // Start cooldown
        startAdCooldown();
        
        setTimeout(() => {
            watchAdBtn.textContent = '+50 Puan Kazan';
        }, 2000);
    }, 3000);
}

function startAdCooldown() {
    adCooldown = true;
    let timeLeft = AD_COOLDOWN_TIME;
    
    adCooldownDiv.style.display = 'block';
    watchAdBtn.style.display = 'none';
    
    const interval = setInterval(() => {
        timeLeft--;
        adTimer.textContent = timeLeft;
        
        if (timeLeft <= 0) {
            clearInterval(interval);
            adCooldown = false;
            adCooldownDiv.style.display = 'none';
            watchAdBtn.style.display = 'block';
            watchAdBtn.disabled = false;
        }
    }, 1000);
}

// Game modal functions
function openGameModal(modalId) {
    document.getElementById(modalId).style.display = 'flex';
    
    // Initialize wheel if opening wheel modal
    if (modalId === 'spinWheelModal' && !wheelCtx) {
        setTimeout(initWheel, 100);
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
    
    // Disable buttons
    const buttons = document.querySelectorAll('#coinFlipModal .choice-btn');
    buttons.forEach(btn => btn.disabled = true);
    
    // Simulate coin flip
    showGameResult('coinResult', '🪙 Atılıyor...', '');
    
    setTimeout(async () => {
        const result = Math.random() < 0.5 ? 'heads' : 'tails';
        const won = result === choice;
        
        const resultText = result === 'heads' ? 'Yazı 📄' : 'Tura 🪙';
        
        if (won) {
            const winAmount = betAmount * 2;
            await updateScore(currentScore - betAmount + winAmount);
            showGameResult('coinResult', `${resultText} geldi! +${betAmount} puan kazandın! 🎉`, 'win');
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
            const winAmount = betAmount * 2;
            await updateScore(currentScore - betAmount + winAmount);
            showGameResult('rpsResult', `Bilgisayar: ${icons[computerChoice]} - Kazandın! +${betAmount} puan 🎉`, 'win');
        } else if (result === 'lose') {
            await updateScore(currentScore - betAmount);
            showGameResult('rpsResult', `Bilgisayar: ${icons[computerChoice]} - Kaybettin! -${betAmount} puan 😢`, 'lose');
        } else {
            showGameResult('rpsResult', `Bilgisayar: ${icons[computerChoice]} - Berabere! Puanın iade edildi`, '');
        }
        
        buttons.forEach(btn => btn.disabled = false);
    }, 1500);
}

// Spin Wheel Game
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
    let currentRotation = 0;
    
    // Random result
    const resultIndex = Math.floor(Math.random() * wheelSegments.length);
    const targetRotation = (2 * Math.PI * 5) + (resultIndex * (2 * Math.PI / wheelSegments.length));
    
    function animate() {
        const elapsed = Date.now() - startTime;
        const progress = Math.min(elapsed / spinDuration, 1);
        
        // Easing function
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
    const winAmount = Math.floor(betAmount * result.multiplier);
    const netChange = winAmount - betAmount;
    
    await updateScore(currentScore + netChange);
    
    if (netChange > 0) {
        showGameResult('wheelResult', `${result.text} geldi! +${netChange} puan kazandın! 🎉`, 'win');
    } else if (netChange < 0) {
        showGameResult('wheelResult', `${result.text} geldi! ${netChange} puan kaybettin 😢`, 'lose');
    } else {
        showGameResult('wheelResult', `${result.text} geldi! Puanın iade edildi`, '');
    }
    
    isSpinning = false;
    document.getElementById('spinBtn').disabled = false;
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
