// app.js - FIREBASE İLE TAM ENTEGRE - DÜZELTMELİ SÜRÜM

// ========== FIREBASE IMPORTLARI (EN ÜSTTE OLMALI) ==========
import { 
    getAuth, 
    createUserWithEmailAndPassword, 
    signInWithEmailAndPassword, 
    signOut, 
    onAuthStateChanged 
} from "https://www.gstatic.com/firebasejs/12.8.0/firebase-auth.js";

import { 
    getFirestore, 
    doc, 
    setDoc, 
    getDoc, 
    updateDoc, 
    collection, 
    addDoc, 
    query, 
    orderBy, 
    limit,
    onSnapshot 
} from "https://www.gstatic.com/firebasejs/12.8.0/firebase-firestore.js";

import { initializeApp } from "https://www.gstatic.com/firebasejs/12.8.0/firebase-app.js";

// ========== FIREBASE KONFİGÜRASYONU ==========
const firebaseConfig = {
    apiKey: "AIzaSyDyGNrzw1a55LHv-LP5gjuPpFWmHu1a6yU",
    authDomain: "ali23-cfd02.firebaseapp.com",
    projectId: "ali23-cfd02",
    storageBucket: "ali23-cfd02.firebasestorage.app",
    messagingSenderId: "759021285078",
    appId: "1:759021285078:web:f7673f89125ff3dad66377",
    measurementId: "G-NNCQQQFWD6"
};

// ========== FIREBASE BAŞLATMA ==========
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

// ========== ANA UYGULAMA KODU ==========
document.addEventListener('DOMContentLoaded', function() {
    
    // DOM Elementleri
    const loginScreen = document.getElementById('loginScreen');
    const mainScreen = document.getElementById('mainScreen');
    const profileModal = document.getElementById('profileModal');
    const emailInput = document.getElementById('emailInput');
    const passwordInput = document.getElementById('passwordInput');
    const loginBtn = document.getElementById('loginBtn');
    const registerBtn = document.getElementById('registerBtn');
    const profileBtn = document.getElementById('profileBtn');
    const closeModalBtn = document.getElementById('closeModalBtn');
    const logoutBtn = document.getElementById('logoutBtn');
    const spinWheelBtn = document.getElementById('spinWheelBtn');
    const wheel = document.getElementById('wheel');
    const wheelResult = document.getElementById('wheelResult');
    const userPuan = document.getElementById('userPuan');
    const rpsBtns = document.querySelectorAll('.rps-btn');
    const playerChoiceEl = document.getElementById('playerChoice');
    const botChoiceEl = document.getElementById('botChoice');
    const rpsOutcome = document.getElementById('rpsOutcome');
    const chatMessages = document.getElementById('chatMessages');
    const messageInput = document.getElementById('messageInput');
    const sendMessageBtn = document.getElementById('sendMessageBtn');
    const profileEmail = document.getElementById('profileEmail');
    const profileRegDate = document.getElementById('profileRegDate');
    const profileLastLogin = document.getElementById('profileLastLogin');
    const profilePuan = document.getElementById('profilePuan');

    // Global değişkenler
    let currentUser = null;
    let currentUserData = null;
    let gun = null;
    let isSpinning = false;

    // ========== FIREBASE İŞLEMLERİ ==========
    
    async function registerUser(email, password) {
        try {
            showAlert('Kayıt yapılıyor...', 'info');
            
            // 1. Firebase Authentication'da kullanıcı oluştur
            const userCredential = await createUserWithEmailAndPassword(auth, email, password);
            const user = userCredential.user;
            
            // 2. Firestore'da kullanıcı belgesi oluştur
            const userData = {
                email: email,
                createdAt: new Date().toISOString(),
                lastLogin: new Date().toISOString(),
                points: 100,
                gamesPlayed: 0,
                gamesWon: 0,
                displayName: email.split('@')[0]
            };
            
            await setDoc(doc(db, "users", user.uid), userData);
            
            // 3. Global kullanıcı verilerini güncelle
            currentUser = user;
            currentUserData = userData;
            
            showAlert('🎉 Kayıt başarılı! Hoş geldiniz!', 'success');
            switchToMainScreen();
            updateUI();
            
            return true;
            
        } catch (error) {
            console.error('Kayıt hatası:', error);
            handleFirebaseError(error);
            return false;
        }
    }
    
    async function loginUser(email, password) {
        try {
            showAlert('Giriş yapılıyor...', 'info');
            
            // 1. Firebase Authentication ile giriş
            const userCredential = await signInWithEmailAndPassword(auth, email, password);
            const user = userCredential.user;
            
            // 2. Firestore'dan kullanıcı verilerini çek
            const userDoc = await getDoc(doc(db, "users", user.uid));
            
            if (userDoc.exists()) {
                currentUserData = userDoc.data();
                
                // 3. Son giriş tarihini güncelle
                await updateDoc(doc(db, "users", user.uid), {
                    lastLogin: new Date().toISOString()
                });
                
                currentUserData.lastLogin = new Date().toISOString();
            } else {
                // Eğer belge yoksa, oluştur
                currentUserData = {
                    email: email,
                    createdAt: new Date().toISOString(),
                    lastLogin: new Date().toISOString(),
                    points: 100,
                    gamesPlayed: 0,
                    gamesWon: 0,
                    displayName: email.split('@')[0]
                };
                await setDoc(doc(db, "users", user.uid), currentUserData);
            }
            
            currentUser = user;
            showAlert('✅ Giriş başarılı!', 'success');
            switchToMainScreen();
            updateUI();
            
            return true;
            
        } catch (error) {
            console.error('Giriş hatası:', error);
            handleFirebaseError(error);
            return false;
        }
    }
    
    async function logoutUser() {
        try {
            await signOut(auth);
            currentUser = null;
            currentUserData = null;
            switchToLoginScreen();
            showAlert('Çıkış yapıldı', 'info');
        } catch (error) {
            console.error('Çıkış hatası:', error);
            showAlert('Çıkış yapılamadı: ' + error.message, 'error');
        }
    }
    
    async function updateUserPoints(pointsChange, gameType = '') {
        if (!currentUser || !currentUserData) return false;
        
        try {
            const newPoints = currentUserData.points + pointsChange;
            
            if (newPoints < 0) {
                showAlert('Yetersiz puan!', 'error');
                return false;
            }
            
            // Firestore'da güncelle
            await updateDoc(doc(db, "users", currentUser.uid), {
                points: newPoints,
                lastActivity: new Date().toISOString()
            });
            
            // Oyun istatistiklerini güncelle
            if (gameType) {
                const updateData = {
                    gamesPlayed: (currentUserData.gamesPlayed || 0) + 1
                };
                
                if (pointsChange > 0) {
                    updateData.gamesWon = (currentUserData.gamesWon || 0) + 1;
                }
                
                await updateDoc(doc(db, "users", currentUser.uid), updateData);
                
                // Oyun geçmişine kaydet
                await addDoc(collection(db, "gameHistory"), {
                    userId: currentUser.uid,
                    gameType: gameType,
                    pointsChange: pointsChange,
                    playedAt: new Date().toISOString(),
                    userEmail: currentUserData.email
                });
            }
            
            // Local veriyi güncelle
            currentUserData.points = newPoints;
            updateUI();
            return true;
            
        } catch (error) {
            console.error('Puan güncelleme hatası:', error);
            return false;
        }
    }
    
    function handleFirebaseError(error) {
        let message = 'Bir hata oluştu';
        
        switch(error.code) {
            case 'auth/email-already-in-use':
                message = 'Bu e-posta adresi zaten kayıtlı';
                break;
            case 'auth/invalid-email':
                message = 'Geçersiz e-posta adresi';
                break;
            case 'auth/operation-not-allowed':
                message = 'Bu işlem şu anda devre dışı';
                break;
            case 'auth/weak-password':
                message = 'Şifre en az 6 karakter olmalıdır';
                break;
            case 'auth/user-disabled':
                message = 'Bu hesap devre dışı bırakılmış';
                break;
            case 'auth/user-not-found':
                message = 'Kullanıcı bulunamadı';
                break;
            case 'auth/wrong-password':
                message = 'Hatalı şifre';
                break;
            default:
                message = error.message || 'Bilinmeyen hata';
        }
        
        showAlert(message, 'error');
    }

    // ========== ARAYÜZ İŞLEMLERİ ==========
    
    function showAlert(message, type = 'info') {
        // Mevcut alert'leri temizle
        document.querySelectorAll('.alert-message').forEach(alert => alert.remove());
        
        const alertDiv = document.createElement('div');
        alertDiv.className = 'alert-message';
        alertDiv.textContent = message;
        
        // Stiller
        const styles = {
            position: 'fixed',
            top: '20px',
            right: '20px',
            padding: '15px 25px',
            background: 'rgba(10, 15, 35, 0.95)',
            color: 'white',
            borderRadius: '8px',
            zIndex: '10000',
            boxShadow: '0 5px 20px rgba(0,0,0,0.5)',
            fontFamily: "'Exo 2', sans-serif",
            fontSize: '16px',
            borderLeft: '4px solid',
            transform: 'translateX(150%)',
            transition: 'transform 0.5s cubic-bezier(0.68, -0.55, 0.265, 1.55)'
        };
        
        // Türüne göre renk
        const colors = {
            success: '#00ff88',
            error: '#ff0055',
            warning: '#ffaa00',
            info: '#00aaff'
        };
        
        Object.assign(alertDiv.style, styles);
        alertDiv.style.borderLeftColor = colors[type] || colors.info;
        
        document.body.appendChild(alertDiv);
        
        // Animasyon
        setTimeout(() => {
            alertDiv.style.transform = 'translateX(0)';
        }, 10);
        
        // 4 saniye sonra kaldır
        setTimeout(() => {
            alertDiv.style.transform = 'translateX(150%)';
            setTimeout(() => {
                if (alertDiv.parentNode) {
                    alertDiv.parentNode.removeChild(alertDiv);
                }
            }, 500);
        }, 4000);
    }
    
    function switchToMainScreen() {
        loginScreen.classList.remove('active');
        mainScreen.classList.add('active');
        initChat();
        loadChatHistory();
    }
    
    function switchToLoginScreen() {
        mainScreen.classList.remove('active');
        profileModal.style.display = 'none';
        loginScreen.classList.add('active');
        emailInput.value = '';
        passwordInput.value = '';
    }
    
    function updateUI() {
        if (!currentUserData) return;
        
        userPuan.textContent = currentUserData.points;
        profilePuan.textContent = currentUserData.points;
        profileEmail.textContent = currentUserData.email;
        
        // Tarih formatı
        const formatDate = (dateString) => {
            try {
                const date = new Date(dateString);
                return date.toLocaleDateString('tr-TR') + ' ' + 
                       date.toLocaleTimeString('tr-TR', {hour: '2-digit', minute:'2-digit'});
            } catch (e) {
                return dateString || '-';
            }
        };
        
        profileRegDate.textContent = formatDate(currentUserData.createdAt);
        profileLastLogin.textContent = formatDate(currentUserData.lastLogin);
    }

    // ========== ÇARKIFELEK OYUNU ==========
    
    spinWheelBtn.addEventListener('click', async function() {
        if (isSpinning) return;
        
        if (!currentUser) {
            showAlert('Önce giriş yapmalısınız!', 'error');
            return;
        }
        
        if (currentUserData.points < 5) {
            showAlert('Yetersiz puan! Çarkı çevirmek için 5 puan gereklidir.', 'error');
            return;
        }
        
        // 5 puan kes
        const success = await updateUserPoints(-5, 'wheel_spin_cost');
        if (!success) return;
        
        isSpinning = true;
        spinWheelBtn.disabled = true;
        spinWheelBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Çark Dönüyor...';
        
        // Rastgele dönüş
        const randomRotation = 1080 + Math.floor(Math.random() * 720);
        wheel.style.transition = 'transform 3s cubic-bezier(0.2, 0.8, 0.3, 1)';
        wheel.style.transform = `rotate(${randomRotation}deg)`;
        
        // Sonuç hesapla
        setTimeout(async () => {
            const normalizedRotation = randomRotation % 360;
            const sectionIndex = Math.floor(normalizedRotation / 60);
            const prizes = [5, 10, 15, 5, 10, 15];
            const prize = prizes[sectionIndex];
            
            wheelResult.textContent = `🎉 Tebrikler! ${prize} puan kazandınız!`;
            wheelResult.style.color = '#00ff88';
            wheelResult.style.fontWeight = 'bold';
            
            // Kazanılan puanı ekle
            await updateUserPoints(prize, 'wheel_spin_win');
            
            // Çarkı resetle
            setTimeout(() => {
                wheel.style.transition = 'none';
                wheel.style.transform = 'rotate(0deg)';
                
                setTimeout(() => {
                    wheel.style.transition = 'transform 3s cubic-bezier(0.2, 0.8, 0.3, 1)';
                    isSpinning = false;
                    spinWheelBtn.disabled = false;
                    spinWheelBtn.innerHTML = '<i class="fas fa-redo-alt"></i> Çarkı Çevir (5 Puan)';
                    
                    setTimeout(() => {
                        wheelResult.textContent = '';
                    }, 3000);
                }, 50);
            }, 1000);
        }, 3000);
    });

    // ========== TAŞ KAĞIT MAKAS OYUNU ==========
    
    const rpsChoices = ['rock', 'paper', 'scissors'];
    const rpsIcons = {
        rock: '<i class="fas fa-hand-rock"></i>',
        paper: '<i class="fas fa-hand-paper"></i>',
        scissors: '<i class="fas fa-hand-scissors"></i>'
    };
    
    rpsBtns.forEach(btn => {
        btn.addEventListener('click', async function() {
            if (!currentUser) {
                showAlert('Önce giriş yapmalısınız!', 'error');
                return;
            }
            
            const playerChoice = this.dataset.choice;
            const botChoice = rpsChoices[Math.floor(Math.random() * 3)];
            
            playerChoiceEl.innerHTML = rpsIcons[playerChoice];
            botChoiceEl.innerHTML = rpsIcons[botChoice];
            
            let result, resultColor, pointsChange = 0;
            
            if (playerChoice === botChoice) {
                result = 'Berabere!';
                resultColor = '#ffaa00';
                showAlert('Berabere! Tekrar deneyin.', 'warning');
            } else if (
                (playerChoice === 'rock' && botChoice === 'scissors') ||
                (playerChoice === 'paper' && botChoice === 'rock') ||
                (playerChoice === 'scissors' && botChoice === 'paper')
            ) {
                result = 'Kazandınız! +5 Puan';
                resultColor = '#00ff88';
                pointsChange = 5;
                showAlert('🎉 Tebrikler! 5 puan kazandınız!', 'success');
            } else {
                result = 'Kaybettiniz!';
                resultColor = '#ff0055';
                showAlert('Maalesef kaybettiniz. Tekrar deneyin!', 'error');
            }
            
            rpsOutcome.innerHTML = `<span style="color: ${resultColor}; font-weight: bold;">${result}</span>`;
            
            // Puanları güncelle
            if (pointsChange !== 0) {
                await updateUserPoints(pointsChange, 'rock_paper_scissors');
            }
        });
    });

    // ========== GLOBAL SOHBET (Gun.js) ==========
    
    function initChat() {
        try {
            // Gun.js başlat
            gun = Gun({
                peers: [
                    'https://gun-manhattan.herokuapp.com/gun',
                    'https://gun-us.herokuapp.com/gun'
                ]
            });
            
            // Chat odası
            const chatRoom = gun.get('cybersosyal_chat_room_v2');
            
            // Yeni mesajları dinle
            chatRoom.map().on((data, key) => {
                if (data && data.sender && data.message && data.timestamp) {
                    // Kendi mesajımızı tekrar gösterme
                    if (data.sender !== currentUserData?.email) {
                        addMessageToChat(data.sender, data.message, data.timestamp, false);
                    }
                }
            });
            
            console.log('Gun.js sohbet başlatıldı');
            
        } catch (error) {
            console.warn('Gun.js başlatılamadı:', error);
            showAlert('Sohbet sistemi başlatılamadı', 'warning');
        }
    }
    
    function loadChatHistory() {
        // Firestore'dan eski mesajları yükle
        try {
            const chatRef = collection(db, "chatMessages");
            const q = query(chatRef, orderBy("timestamp", "desc"));
            
            onSnapshot(q, (snapshot) => {
                // Önce temizle
                const existingMessages = chatMessages.querySelectorAll('.message:not(.chat-welcome)');
                existingMessages.forEach(msg => msg.remove());
                
                // Yeni mesajları ekle (tersten sıralı)
                const messages = [];
                snapshot.forEach((doc) => {
                    messages.push(doc.data());
                });
                
                // Tarihe göre sırala (en eskiden en yeniye)
                messages.sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
                
                // Sadece son 20 mesajı göster
                const recentMessages = messages.slice(-20);
                
                recentMessages.forEach(data => {
                    addMessageToChat(data.sender, data.message, data.timestamp, data.sender === currentUserData?.email);
                });
            });
        } catch (error) {
            console.log("Firestore chat history yüklenemedi:", error);
        }
    }
    
    function addMessageToChat(sender, message, timestamp, isOwn = false) {
        // Eğer bu mesaj zaten ekliyse, ekleme
        const existingMessages = chatMessages.querySelectorAll('.message');
        for (let msg of existingMessages) {
            const msgSender = msg.querySelector('.message-sender')?.textContent;
            const msgText = msg.querySelector('.message-text')?.textContent;
            if (msgSender === (isOwn ? 'Sen' : sender.split('@')[0]) && 
                msgText === (message.length > 100 ? message.substring(0, 100) + '...' : message)) {
                return;
            }
        }
        
        const messageDiv = document.createElement('div');
        messageDiv.className = `message ${isOwn ? 'own' : ''}`;
        
        const time = new Date(timestamp).toLocaleTimeString('tr-TR', {
            hour: '2-digit',
            minute: '2-digit'
        });
        
        const displayName = isOwn ? 'Sen' : sender.split('@')[0];
        const shortMessage = message.length > 100 ? message.substring(0, 100) + '...' : message;
        
        messageDiv.innerHTML = `
            <div class="message-header">
                <span class="message-sender">${displayName}</span>
                <span class="message-time">${time}</span>
            </div>
            <div class="message-text">${shortMessage}</div>
        `;
        
        chatMessages.appendChild(messageDiv);
        chatMessages.scrollTop = chatMessages.scrollHeight;
    }
    
    async function sendMessage() {
        const message = messageInput.value.trim();
        
        if (!message) {
            showAlert('Mesaj yazın!', 'error');
            return;
        }
        
        if (!currentUser || !currentUserData) {
            showAlert('Önce giriş yapmalısınız!', 'error');
            return;
        }
        
        const timestamp = new Date().toISOString();
        const chatData = {
            sender: currentUserData.email,
            message: message,
            timestamp: timestamp
        };
        
        try {
            // 1. Gun.js ile gönder (real-time)
            if (gun) {
                gun.get('cybersosyal_chat_room_v2').set(chatData);
            }
            
            // 2. Firestore'a kaydet (backup için)
            await addDoc(collection(db, "chatMessages"), {
                ...chatData,
                userId: currentUser.uid
            });
            
            // 3. Ekranda göster
            addMessageToChat(currentUserData.email, message, timestamp, true);
            
            // 4. Input'u temizle
            messageInput.value = '';
            messageInput.focus();
            
        } catch (error) {
            console.error('Mesaj gönderme hatası:', error);
            showAlert('Mesaj gönderilemedi', 'error');
        }
    }
    
    // Mesaj gönderme event'leri
    sendMessageBtn.addEventListener('click', sendMessage);
    messageInput.addEventListener('keypress', function(e) {
        if (e.key === 'Enter') sendMessage();
    });

    // ========== MODAL İŞLEMLERİ ==========
    
    profileBtn.addEventListener('click', function() {
        if (!currentUser) {
            showAlert('Önce giriş yapmalısınız!', 'error');
            return;
        }
        profileModal.style.display = 'flex';
        updateUI();
    });
    
    closeModalBtn.addEventListener('click', function() {
        profileModal.style.display = 'none';
    });
    
    logoutBtn.addEventListener('click', function() {
        profileModal.style.display = 'none';
        logoutUser();
    });
    
    // Pencere dışına tıklayınca modalı kapat
    window.addEventListener('click', function(event) {
        if (event.target === profileModal) {
            profileModal.style.display = 'none';
        }
    });
    
    // Diğer modal butonları
    document.getElementById('friendsBtn').addEventListener('click', function() {
        showAlert('👥 Arkadaşlar özelliği yakında eklenecek!', 'info');
    });
    
    document.getElementById('marketBtn').addEventListener('click', function() {
        showAlert('🛒 Market özelliği yakında eklenecek!', 'info');
    });

    // ========== GİRİŞ/KAYIT BUTONLARI ==========
    
    loginBtn.addEventListener('click', function() {
        const email = emailInput.value.trim();
        const password = passwordInput.value;
        if (email && password) loginUser(email, password);
        else showAlert('Lütfen tüm alanları doldurun', 'error');
    });
    
    registerBtn.addEventListener('click', function() {
        const email = emailInput.value.trim();
        const password = passwordInput.value;
        if (email && password) registerUser(email, password);
        else showAlert('Lütfen tüm alanları doldurun', 'error');
    });
    
    // Enter tuşu ile giriş
    passwordInput.addEventListener('keypress', function(e) {
        if (e.key === 'Enter') {
            const email = emailInput.value.trim();
            const password = passwordInput.value;
            if (email && password) loginUser(email, password);
        }
    });

    // ========== FIREBASE AUTH DURUM TAKİBİ ==========
    
    // Kullanıcı oturum durumunu izle
    onAuthStateChanged(auth, async (user) => {
        console.log('Auth state changed:', user ? 'User logged in' : 'User logged out');
        
        if (user) {
            // Kullanıcı oturum açmış
            try {
                const userDoc = await getDoc(doc(db, "users", user.uid));
                if (userDoc.exists()) {
                    currentUser = user;
                    currentUserData = userDoc.data();
                    
                    // Eksik verileri kontrol et
                    if (!currentUserData.points) currentUserData.points = 100;
                    if (!currentUserData.createdAt) currentUserData.createdAt = new Date().toISOString();
                    if (!currentUserData.lastLogin) currentUserData.lastLogin = new Date().toISOString();
                    
                    switchToMainScreen();
                    updateUI();
                } else {
                    // Belge yoksa oluştur
                    currentUserData = {
                        email: user.email,
                        createdAt: new Date().toISOString(),
                        lastLogin: new Date().toISOString(),
                        points: 100,
                        gamesPlayed: 0,
                        gamesWon: 0,
                        displayName: user.email.split('@')[0]
                    };
                    await setDoc(doc(db, "users", user.uid), currentUserData);
                    currentUser = user;
                    switchToMainScreen();
                    updateUI();
                }
            } catch (error) {
                console.error('Kullanıcı verisi yüklenemedi:', error);
                showAlert('Kullanıcı verileri yüklenemedi', 'error');
            }
        } else {
            // Kullanıcı oturum açmamış
            currentUser = null;
            currentUserData = null;
            switchToLoginScreen();
        }
    });

    // ========== DEMO HESAP OLUŞTURMA ==========
    
    function createDemoButton() {
        // Demo hesap oluşturma butonu (geliştirme için)
        const demoBtn = document.createElement('button');
        demoBtn.innerHTML = '<i class="fas fa-user-secret"></i> Demo Giriş';
        demoBtn.style.cssText = `
            position: fixed;
            bottom: 20px;
            left: 20px;
            padding: 10px 20px;
            background: linear-gradient(45deg, #ff00ff, #00f3ff);
            color: white;
            border: none;
            border-radius: 10px;
            cursor: pointer;
            z-index: 9999;
            opacity: 0.8;
            font-family: 'Exo 2', sans-serif;
            font-weight: 600;
            box-shadow: 0 0 15px rgba(255, 0, 255, 0.5);
            transition: all 0.3s;
            display: flex;
            align-items: center;
            gap: 8px;
        `;
        
        demoBtn.onmouseover = () => demoBtn.style.opacity = '1';
        demoBtn.onmouseout = () => demoBtn.style.opacity = '0.8';
        
        demoBtn.onclick = async () => {
            emailInput.value = 'demo@cybersosyal.com';
            passwordInput.value = 'demo123';
            
            // Demo hesabı oluştur veya giriş yap
            try {
                await loginUser('demo@cybersosyal.com', 'demo123');
            } catch (error) {
                // Eğer kullanıcı yoksa, kayıt ol
                await registerUser('demo@cybersosyal.com', 'demo123');
            }
        };
        
        if (loginScreen.classList.contains('active')) {
            document.body.appendChild(demoBtn);
            setTimeout(() => {
                if (demoBtn.parentNode) {
                    demoBtn.parentNode.removeChild(demoBtn);
                }
            }, 30000); // 30 saniye sonra kaldır
        }
    }
    
    // Demo butonunu oluştur
    setTimeout(createDemoButton, 1000);
    
    // Sayfa yüklendiğinde input'a focus
    setTimeout(() => {
        if (loginScreen.classList.contains('active')) {
            emailInput.focus();
        }
    }, 500);
    
    console.log('Uygulama başlatıldı! Firebase aktif.');
});
