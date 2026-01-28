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

    // Gun.js Chat Sistemi
    let gun, chat;
    const CHAT_ROOM = 'cybersosyal_global_chat';
    
    function initChat() {
        try {
            // Public Gun.js peers
            gun = Gun({
                peers: [
                    'https://gun-manhattan.herokuapp.com/gun',
                    'https://gun-us.herokuapp.com/gun',
                    'https://gun-eu.herokuapp.com/gun'
                ]
            });
            
            chat = gun.get(CHAT_ROOM);
            
            // Mesajları dinle
            chat.map().on((message, id) => {
                if (message && id !== 'currentUser' && message.sender && message.text && message.timestamp) {
                    addMessageToChat(message.sender, message.text, message.timestamp, message.sender === currentUser?.email);
                }
            });
            
            console.log('Gun.js sohbet başlatıldı');
        } catch (error) {
            console.error('Gun.js başlatma hatası:', error);
            showAlert('Sohbet sistemi başlatılamadı', 'error');
        }
    }

    // Kullanıcı Yönetimi
    let currentUser = null;
    const ENCRYPTION_KEY = 'cybersosyal_2024_key';
    
    function encryptData(data) {
        try {
            const jsonString = JSON.stringify(data);
            const encrypted = CryptoJS.AES.encrypt(jsonString, ENCRYPTION_KEY).toString();
            return encrypted;
        } catch (error) {
            console.error('Şifreleme hatası:', error);
            return null;
        }
    }
    
    function decryptData(encryptedData) {
        try {
            const bytes = CryptoJS.AES.decrypt(encryptedData, ENCRYPTION_KEY);
            const decrypted = bytes.toString(CryptoJS.enc.Utf8);
            return JSON.parse(decrypted);
        } catch (error) {
            console.error('Şifre çözme hatası:', error);
            return null;
        }
    }
    
    function hashPassword(password) {
        return CryptoJS.SHA256(password).toString();
    }
    
    function showAlert(message, type = 'info') {
        const colors = {
            success: '#00ff88',
            error: '#ff0055',
            info: '#00aaff',
            warning: '#ffaa00'
        };
        
        const alertDiv = document.createElement('div');
        alertDiv.className = 'alert-message';
        alertDiv.textContent = message;
        alertDiv.style.cssText = `
            position: fixed;
            top: 20px;
            right: 20px;
            padding: 15px 25px;
            background: rgba(10, 15, 35, 0.95);
            color: white;
            border-left: 4px solid ${colors[type] || colors.info};
            border-radius: 5px;
            z-index: 10000;
            box-shadow: 0 5px 15px rgba(0,0,0,0.3);
            animation: slideIn 0.3s ease;
        `;
        
        document.body.appendChild(alertDiv);
        
        setTimeout(() => {
            alertDiv.style.animation = 'slideOut 0.3s ease';
            setTimeout(() => alertDiv.remove(), 300);
        }, 3000);
        
        // CSS animasyonları
        const style = document.createElement('style');
        style.textContent = `
            @keyframes slideIn {
                from { transform: translateX(100%); opacity: 0; }
                to { transform: translateX(0); opacity: 1; }
            }
            @keyframes slideOut {
                from { transform: translateX(0); opacity: 1; }
                to { transform: translateX(100%); opacity: 0; }
            }
        `;
        document.head.appendChild(style);
    }
    
    function registerUser(email, password) {
        if (!email || !password) {
            showAlert('Lütfen tüm alanları doldurun', 'error');
            return false;
        }
        
        if (password.length < 6) {
            showAlert('Şifre en az 6 karakter olmalıdır', 'error');
            return false;
        }
        
        const userKey = `user_${email}`;
        if (localStorage.getItem(userKey)) {
            showAlert('Bu e-posta adresi zaten kayıtlı', 'error');
            return false;
        }
        
        const hashedPassword = hashPassword(password);
        const now = new Date().toLocaleString('tr-TR');
        
        const userData = {
            email,
            passwordHash: hashedPassword,
            registrationDate: now,
            lastLogin: now,
            points: 100, // Yeni kullanıcıya başlangıç puanı
            gamesPlayed: 0,
            gamesWon: 0
        };
        
        const encryptedData = encryptData(userData);
        if (!encryptedData) {
            showAlert('Kayıt işlemi başarısız', 'error');
            return false;
        }
        
        localStorage.setItem(userKey, encryptedData);
        localStorage.setItem('currentUser', email);
        
        currentUser = userData;
        showAlert('Kayıt başarılı! Hoş geldiniz!', 'success');
        switchToMainScreen();
        updateUI();
        return true;
    }
    
    function loginUser(email, password) {
        if (!email || !password) {
            showAlert('Lütfen tüm alanları doldurun', 'error');
            return false;
        }
        
        const userKey = `user_${email}`;
        const encryptedData = localStorage.getItem(userKey);
        
        if (!encryptedData) {
            showAlert('Kullanıcı bulunamadı', 'error');
            return false;
        }
        
        const userData = decryptData(encryptedData);
        if (!userData) {
            showAlert('Geçersiz kullanıcı verisi', 'error');
            return false;
        }
        
        const hashedPassword = hashPassword(password);
        if (hashedPassword !== userData.passwordHash) {
            showAlert('Hatalı şifre', 'error');
            return false;
        }
        
        // Son giriş tarihini güncelle
        userData.lastLogin = new Date().toLocaleString('tr-TR');
        localStorage.setItem(userKey, encryptData(userData));
        localStorage.setItem('currentUser', email);
        
        currentUser = userData;
        showAlert('Giriş başarılı!', 'success');
        switchToMainScreen();
        updateUI();
        return true;
    }
    
    function logoutUser() {
        currentUser = null;
        localStorage.removeItem('currentUser');
        switchToLoginScreen();
        showAlert('Çıkış yapıldı', 'info');
    }
    
    function switchToMainScreen() {
        loginScreen.classList.remove('active');
        mainScreen.classList.add('active');
        initChat(); // Sohbeti başlat
    }
    
    function switchToLoginScreen() {
        mainScreen.classList.remove('active');
        loginScreen.classList.add('active');
        emailInput.value = '';
        passwordInput.value = '';
    }
    
    function updateUI() {
        if (!currentUser) return;
        
        userPuan.textContent = currentUser.points;
        profilePuan.textContent = currentUser.points;
        profileEmail.textContent = currentUser.email;
        profileRegDate.textContent = currentUser.registrationDate;
        profileLastLogin.textContent = currentUser.lastLogin;
    }
    
    function updateUserPoints(points) {
        if (!currentUser) return;
        
        currentUser.points += points;
        const userKey = `user_${currentUser.email}`;
        localStorage.setItem(userKey, encryptData(currentUser));
        updateUI();
    }
    
    // Çarkıfelek Oyunu
    let isSpinning = false;
    const wheelPrizes = [5, 10, 15, 5, 10, 15];
    
    spinWheelBtn.addEventListener('click', function() {
        if (isSpinning) return;
        
        if (currentUser.points < 5) {
            showAlert('Yetersiz puan! En az 5 puan gereklidir.', 'error');
            return;
        }
        
        isSpinning = true;
        updateUserPoints(-5); // Çevirmek için 5 puan kullan
        
        const randomRotation = 1080 + Math.floor(Math.random() * 360); // 3-4 tam tur
        wheel.style.transform = `rotate(${randomRotation}deg)`;
        wheel.style.transition = 'transform 3s cubic-bezier(0.17, 0.67, 0.83, 0.67)`;
        
        setTimeout(() => {
            const normalizedRotation = randomRotation % 360;
            const sectionIndex = Math.floor(normalizedRotation / 60);
            const prize = wheelPrizes[sectionIndex];
            
            wheelResult.textContent = `🎉 Tebrikler! ${prize} puan kazandınız!`;
            updateUserPoints(prize);
            
            setTimeout(() => {
                wheel.style.transition = 'none';
                wheel.style.transform = 'rotate(0deg)';
                setTimeout(() => {
                    wheel.style.transition = 'transform 3s cubic-bezier(0.17, 0.67, 0.83, 0.67)';
                    isSpinning = false;
                }, 50);
            }, 2000);
        }, 3000);
    });
    
    // Taş Kağıt Makas Oyunu
    const rpsChoices = ['rock', 'paper', 'scissors'];
    const rpsIcons = {
        rock: '<i class="fas fa-hand-rock"></i>',
        paper: '<i class="fas fa-hand-paper"></i>',
        scissors: '<i class="fas fa-hand-scissors"></i>'
    };
    
    rpsBtns.forEach(btn => {
        btn.addEventListener('click', function() {
            if (!currentUser) return;
            
            const playerChoice = this.dataset.choice;
            const botChoice = rpsChoices[Math.floor(Math.random() * 3)];
            
            playerChoiceEl.innerHTML = rpsIcons[playerChoice];
            botChoiceEl.innerHTML = rpsIcons[botChoice];
            
            let result;
            if (playerChoice === botChoice) {
                result = 'Berabere!';
                rpsOutcome.innerHTML = `<span style="color: #ffaa00">${result}</span>`;
                showAlert('Berabere! Tekrar deneyin.', 'warning');
            } else if (
                (playerChoice === 'rock' && botChoice === 'scissors') ||
                (playerChoice === 'paper' && botChoice === 'rock') ||
                (playerChoice === 'scissors' && botChoice === 'paper')
            ) {
                result = 'Kazandınız! +5 Puan';
                rpsOutcome.innerHTML = `<span style="color: #00ff88">${result}</span>`;
                updateUserPoints(5);
                showAlert('Tebrikler! 5 puan kazandınız!', 'success');
            } else {
                result = 'Kaybettiniz!';
                rpsOutcome.innerHTML = `<span style="color: #ff0055">${result}</span>`;
                showAlert('Maalesef kaybettiniz. Tekrar deneyin!', 'error');
            }
        });
    });
    
    // Sohbet İşlevleri
    function addMessageToChat(sender, text, timestamp, isOwn = false) {
        const messageDiv = document.createElement('div');
        messageDiv.className = `message ${isOwn ? 'own' : ''}`;
        
        const time = new Date(timestamp).toLocaleTimeString('tr-TR', {
            hour: '2-digit',
            minute: '2-digit'
        });
        
        messageDiv.innerHTML = `
            <div class="message-header">
                <span class="message-sender">${isOwn ? 'Sen' : sender}</span>
                <span class="message-time">${time}</span>
            </div>
            <div class="message-text">${text}</div>
        `;
        
        chatMessages.appendChild(messageDiv);
        chatMessages.scrollTop = chatMessages.scrollHeight;
    }
    
    sendMessageBtn.addEventListener('click', sendMessage);
    messageInput.addEventListener('keypress', function(e) {
        if (e.key === 'Enter') sendMessage();
    });
    
    function sendMessage() {
        const message = messageInput.value.trim();
        if (!message || !currentUser || !gun) return;
        
        if (message.length > 200) {
            showAlert('Mesaj çok uzun (max 200 karakter)', 'error');
            return;
        }
        
        const chatMessage = {
            sender: currentUser.email,
            text: message,
            timestamp: new Date().toISOString()
        };
        
        try {
            chat.set(chatMessage);
            messageInput.value = '';
            addMessageToChat(currentUser.email, message, chatMessage.timestamp, true);
        } catch (error) {
            console.error('Mesaj gönderme hatası:', error);
            showAlert('Mesaj gönderilemedi', 'error');
        }
    }
    
    // Modal İşlemleri
    profileBtn.addEventListener('click', function() {
        if (!currentUser) return;
        profileModal.style.display = 'flex';
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
    
    // Diğer butonlar
    document.getElementById('friendsBtn').addEventListener('click', function() {
        showAlert('Arkadaşlar özelliği yakında gelecek!', 'info');
    });
    
    document.getElementById('marketBtn').addEventListener('click', function() {
        showAlert('Market özelliği yakında gelecek!', 'info');
    });
    
    // Giriş/Kayıt Butonları
    loginBtn.addEventListener('click', function() {
        const email = emailInput.value.trim();
        const password = passwordInput.value;
        loginUser(email, password);
    });
    
    registerBtn.addEventListener('click', function() {
        const email = emailInput.value.trim();
        const password = passwordInput.value;
        registerUser(email, password);
    });
    
    // Sayfa yüklendiğinde otomatik giriş kontrolü
    function checkAutoLogin() {
        const savedUserEmail = localStorage.getItem('currentUser');
        if (savedUserEmail) {
            const userKey = `user_${savedUserEmail}`;
            const encryptedData = localStorage.getItem(userKey);
            
            if (encryptedData) {
                const userData = decryptData(encryptedData);
                if (userData) {
                    currentUser = userData;
                    switchToMainScreen();
                    updateUI();
                    return;
                }
            }
        }
        switchToLoginScreen();
    }
    
    // Uygulamayı başlat
    checkAutoLogin();
    
    // Demo kullanıcı ekleme (isteğe bağlı)
    function addDemoUsers() {
        const demoUsers = [
            { email: 'demo@cybersosyal.com', password: 'demo123' },
            { email: 'test@cybersosyal.com', password: 'test123' }
        ];
        
        demoUsers.forEach(user => {
            const userKey = `user_${user.email}`;
            if (!localStorage.getItem(userKey)) {
                registerUser(user.email, user.password);
            }
        });
    }
    
    // Sayfa yüklendiğinde demo kullanıcıları ekle
    setTimeout(addDemoUsers, 1000);
});
