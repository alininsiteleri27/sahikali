// ============================================================
// APP.JS - BÖLÜM 2.1
// Firebase + Auth + App Başlatma
// ============================================================

import { 
  getDatabase, ref, onValue, set, push, update, remove 
} from "https://www.gstatic.com/firebasejs/12.8.0/firebase-database.js";

import {
  getAuth, signInWithEmailAndPassword, createUserWithEmailAndPassword,
  sendPasswordResetEmail, signOut, onAuthStateChanged, updateProfile
} from "https://www.gstatic.com/firebasejs/12.8.0/firebase-auth.js";

// -------------------- GLOBAL VARIABLES --------------------
const auth = getAuth();
const db = getDatabase();

let currentUser = null;
let currentUserRole = "ÜYE"; // default
let appInitialized = false;

// DOM ELEMENTS
const globalLoader = document.getElementById("global-loader");
const authModal = document.getElementById("auth-modal");
const loginForm = document.getElementById("login-form");
const registerForm = document.getElementById("register-form");
const forgotForm = document.getElementById("forgot-form");
const appShell = document.getElementById("app");
const logoutBtn = document.getElementById("logout-btn");

// -------------------- UTILITY FUNCTIONS --------------------
function showElement(el) {
  el.classList.remove("hidden");
}

function hideElement(el) {
  el.classList.add("hidden");
}

function showLoader() {
  showElement(globalLoader);
}

function hideLoader() {
  hideElement(globalLoader);
}

// Error message helper
function showError(el, msg) {
  el.textContent = msg;
  showElement(el);
}

function clearError(el) {
  el.textContent = "";
  hideElement(el);
}

// -------------------- AUTH MODAL SWITCH --------------------
document.querySelectorAll(".auth-switch span").forEach(span => {
  span.addEventListener("click", e => {
    const target = e.target.getAttribute("data-switch");
    if (target === "login") {
      hideElement(registerForm);
      hideElement(forgotForm);
      showElement(loginForm);
    } else if (target === "register") {
      hideElement(loginForm);
      hideElement(forgotForm);
      showElement(registerForm);
    } else if (target === "forgot") {
      hideElement(loginForm);
      hideElement(registerForm);
      showElement(forgotForm);
    }
  });
});

// -------------------- LOGIN FUNCTION --------------------
const loginBtn = document.getElementById("login-btn");
const loginEmail = document.getElementById("login-email");
const loginPassword = document.getElementById("login-password");
const loginError = document.getElementById("login-error");

loginBtn.addEventListener("click", async () => {
  clearError(loginError);
  const email = loginEmail.value.trim();
  const password = loginPassword.value.trim();

  if (!email || !password) {
    showError(loginError, "E-posta ve şifre gerekli.");
    return;
  }

  try {
    showLoader();
    const userCredential = await signInWithEmailAndPassword(auth, email, password);
    currentUser = userCredential.user;
    console.log("Giriş başarılı:", currentUser.uid);
  } catch (error) {
    console.error(error);
    showError(loginError, "E-posta veya şifre hatalı.");
  } finally {
    hideLoader();
  }
});

// -------------------- REGISTER FUNCTION --------------------
const registerBtn = document.getElementById("register-btn");
const registerUsername = document.getElementById("register-username");
const registerEmail = document.getElementById("register-email");
const registerPassword = document.getElementById("register-password");
const registerPasswordConfirm = document.getElementById("register-password-confirm");
const registerError = document.getElementById("register-error");

registerBtn.addEventListener("click", async () => {
  clearError(registerError);
  const username = registerUsername.value.trim();
  const email = registerEmail.value.trim();
  const password = registerPassword.value.trim();
  const passwordConfirm = registerPasswordConfirm.value.trim();

  if (!username || !email || !password || !passwordConfirm) {
    showError(registerError, "Tüm alanlar doldurulmalı.");
    return;
  }
  if (password !== passwordConfirm) {
    showError(registerError, "Şifreler eşleşmiyor.");
    return;
  }

  try {
    showLoader();
    const userCredential = await createUserWithEmailAndPassword(auth, email, password);
    currentUser = userCredential.user;
    await updateProfile(currentUser, { displayName: username });

    // Save initial user data in DB
    await set(ref(db, `users/${currentUser.uid}`), {
      username,
      email,
      role: "ÜYE",
      points: 0,
      money: 0,
      avatar: "https://via.placeholder.com/40",
      online: true,
      lastLogin: Date.now()
    });

    console.log("Kayıt başarılı:", currentUser.uid);
  } catch (error) {
    console.error(error);
    showError(registerError, "Kayıt başarısız. E-posta kullanılabilir mi?");
  } finally {
    hideLoader();
  }
});

// -------------------- FORGOT PASSWORD FUNCTION --------------------
const forgotBtn = document.getElementById("forgot-btn");
const forgotEmail = document.getElementById("forgot-email");
const forgotError = document.getElementById("forgot-error");
const forgotSuccess = document.getElementById("forgot-success");

forgotBtn.addEventListener("click", async () => {
  clearError(forgotError);
  hideElement(forgotSuccess);

  const email = forgotEmail.value.trim();
  if (!email) {
    showError(forgotError, "E-posta gerekli.");
    return;
  }

  try {
    showLoader();
    await sendPasswordResetEmail(auth, email);
    forgotSuccess.textContent = "Şifre sıfırlama maili gönderildi!";
    showElement(forgotSuccess);
  } catch (error) {
    console.error(error);
    showError(forgotError, "Mail gönderilemedi.");
  } finally {
    hideLoader();
  }
});

// -------------------- LOGOUT FUNCTION --------------------
logoutBtn.addEventListener("click", async () => {
  try {
    showLoader();
    await signOut(auth);
    currentUser = null;
    hideElement(appShell);
    showElement(authModal);
    console.log("Çıkış yapıldı.");
  } catch (error) {
    console.error(error);
    alert("Çıkış yapılamadı.");
  } finally {
    hideLoader();
  }
});

// -------------------- AUTH STATE CHANGE --------------------
onAuthStateChanged(auth, async (user) => {
  if (user) {
    currentUser = user;
    const snapshot = await ref(db, `users/${user.uid}`);
    // Load role from database
    onValue(ref(db, `users/${user.uid}/role`), (snap) => {
      currentUserRole = snap.val() || "ÜYE";
      console.log("Role:", currentUserRole);
    });
    hideElement(authModal);
    showElement(appShell);
    appInitialized = true;
    console.log("App initialized for user:", user.uid);
  } else {
    currentUser = null;
    hideElement(appShell);
    showElement(authModal);
  }
});
// ============================================================
// APP.JS - BÖLÜM 2.2
// Chat ve DM Fonksiyonları
// ============================================================

const chatMessagesContainer = document.getElementById("chat-messages");
const chatInput = document.getElementById("chat-message-input");
const sendMessageBtn = document.getElementById("send-message-btn");

const dmListContainer = document.getElementById("dm-list");

// -------------------- SEND CHAT MESSAGE --------------------
sendMessageBtn.addEventListener("click", async () => {
  const msg = chatInput.value.trim();
  if (!msg || !currentUser) return;

  try {
    const chatRef = ref(db, "chats/general");
    const newMsgRef = push(chatRef);
    await set(newMsgRef, {
      senderId: currentUser.uid,
      senderName: currentUser.displayName || "Anon",
      text: msg,
      timestamp: Date.now(),
      readBy: [currentUser.uid]
    });
    chatInput.value = "";
  } catch (error) {
    console.error("Mesaj gönderilemedi:", error);
    alert("Mesaj gönderilemedi!");
  }
});

// -------------------- LISTEN GENERAL CHAT --------------------
const generalChatRef = ref(db, "chats/general");
onValue(generalChatRef, (snapshot) => {
  chatMessagesContainer.innerHTML = ""; // temizle
  snapshot.forEach(child => {
    const msg = child.val();
    const msgDiv = document.createElement("div");
    msgDiv.classList.add("message");
    msgDiv.dataset.msgId = child.key;

    if (msg.senderId === currentUser.uid) msgDiv.classList.add("outgoing");
    else msgDiv.classList.add("incoming");

    msgDiv.innerHTML = `
      <img src="${msg.avatar || 'https://via.placeholder.com/32'}" class="message-avatar" />
      <div class="message-body">
        <span class="message-user">${msg.senderName}</span>
        <span class="message-text">${msg.text}</span>
        <span class="message-time">${new Date(msg.timestamp).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</span>
        ${msg.senderId === currentUser.uid ? '<span class="message-status double-tick"></span>' : ''}
      </div>
    `;
    chatMessagesContainer.appendChild(msgDiv);
  });
  // Scroll auto
  chatMessagesContainer.scrollTop = chatMessagesContainer.scrollHeight;
});

// -------------------- DM SYSTEM --------------------
async function sendDM(toUserId, message) {
  if (!currentUser) return;
  try {
    const dmRef = ref(db, `dm/${currentUser.uid}/${toUserId}`);
    const newMsgRef = push(dmRef);
    await set(newMsgRef, {
      senderId: currentUser.uid,
      senderName: currentUser.displayName || "Anon",
      text: message,
      timestamp: Date.now(),
      read: false
    });
    // Aynı mesajı alıcı taraf için de kaydet
    const dmRefRecipient = ref(db, `dm/${toUserId}/${currentUser.uid}`);
    const newMsgRefRecipient = push(dmRefRecipient);
    await set(newMsgRefRecipient, {
      senderId: currentUser.uid,
      senderName: currentUser.displayName || "Anon",
      text: message,
      timestamp: Date.now(),
      read: false
    });
  } catch (error) {
    console.error("DM gönderilemedi:", error);
    alert("Mesaj gönderilemedi!");
  }
}

// -------------------- LISTEN DMS --------------------
function listenDMs() {
  try {
    const userDMRef = ref(db, `dm/${currentUser.uid}`);
    onValue(userDMRef, snapshot => {
      dmListContainer.innerHTML = "";
      snapshot.forEach(dmPartnerSnap => {
        const partnerId = dmPartnerSnap.key;
        const messages = dmPartnerSnap.val();
        const lastMsgKey = Object.keys(messages).pop();
        const lastMsg = messages[lastMsgKey];

        const li = document.createElement("li");
        li.classList.add("dm-item");
        li.dataset.userId = partnerId;
        li.innerHTML = `
          <img src="https://via.placeholder.com/32" />
          <span class="dm-user">${lastMsg.senderName}</span>
          <span class="dm-last-msg">${lastMsg.text}</span>
          <span class="dm-badge ${lastMsg.read ? 'hidden' : ''}"></span>
        `;
        li.addEventListener("click", () => openDMModal(partnerId));
        dmListContainer.appendChild(li);
      });
    });
  } catch (error) {
    console.error("DM listen hatası:", error);
  }
}

// -------------------- OPEN DM MODAL --------------------
const dmModal = document.getElementById("dm-modal");
const dmModalBody = document.getElementById("dm-modal-body");
function openDMModal(partnerId) {
  try {
    showElement(dmModal);
    dmModalBody.innerHTML = "";
    const dmRef = ref(db, `dm/${currentUser.uid}/${partnerId}`);
    onValue(dmRef, snapshot => {
      dmModalBody.innerHTML = "";
      snapshot.forEach(msgSnap => {
        const msg = msgSnap.val();
        const div = document.createElement("div");
        div.classList.add("dm-message");
        div.classList.add(msg.senderId === currentUser.uid ? "outgoing" : "incoming");
        div.innerHTML = `
          <span class="dm-message-user">${msg.senderName}</span>
          <span class="dm-message-text">${msg.text}</span>
          <span class="dm-message-time">${new Date(msg.timestamp).toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'})}</span>
        `;
        dmModalBody.appendChild(div);
      });
      dmModalBody.scrollTop = dmModalBody.scrollHeight;
    });
  } catch (error) {
    console.error("DM modal açılamadı:", error);
  }
}

// -------------------- SEND DM MESSAGE --------------------
const dmInput = document.getElementById("dm-message-input");
const dmSendBtn = document.getElementById("dm-send-btn");
dmSendBtn.addEventListener("click", () => {
  const partnerId = dmModal.dataset.partnerId;
  const msg = dmInput.value.trim();
  if (!msg || !partnerId) return;
  sendDM(partnerId, msg);
  dmInput.value = "";
});

// -------------------- MARK DM AS READ --------------------
function markDMRead(partnerId) {
  try {
    const dmRef = ref(db, `dm/${currentUser.uid}/${partnerId}`);
    onValue(dmRef, snapshot => {
      snapshot.forEach(msgSnap => {
        if (!msgSnap.val().read && msgSnap.val().senderId !== currentUser.uid) {
          update(ref(db, `dm/${currentUser.uid}/${partnerId}/${msgSnap.key}`), { read: true });
        }
      });
    });
  } catch (error) {
    console.error("DM okundu işareti hatası:", error);
  }
}

// -------------------- INIT CHAT + DM --------------------
function initChatDM() {
  if (!currentUser) return;
  try {
    listenDMs();
    console.log("Chat ve DM sistemi başlatıldı.");
  } catch (error) {
    console.error("Chat/DM init hatası:", error);
  }
}

// -------------------- RUN AFTER APP INIT --------------------
onAuthStateChanged(auth, user => {
  if (user && appInitialized) {
    initChatDM();
  }
});
// ============================================================
// APP.JS - BÖLÜM 2.3
// Oyunlar & Mini-Game Logic
// ============================================================

const startGameBtns = document.querySelectorAll(".start-game-btn");
const gameModal = document.getElementById("game-modal");
const gameModalTitle = document.getElementById("game-modal-title");
const gameModalBody = document.getElementById("game-modal-body");
const gameModalClose = document.getElementById("game-modal-close");

// -------------------- OPEN GAME MODAL --------------------
startGameBtns.forEach(btn => {
  btn.addEventListener("click", () => {
    const game = btn.dataset.game;
    openGameModal(game);
  });
});

function openGameModal(game) {
  try {
    showElement(gameModal);
    gameModalTitle.textContent = getGameTitle(game);
    gameModalBody.innerHTML = "";

    switch (game) {
      case "chess":
        initChess();
        break;
      case "2048":
        init2048();
        break;
      case "wheel":
        initWheel();
        break;
      case "rps":
        initRPS();
        break;
      case "coinflip":
        initCoinFlip();
        break;
      default:
        gameModalBody.innerHTML = "<p>Oyun bulunamadı!</p>";
    }
  } catch (error) {
    console.error("Game modal açılırken hata:", error);
    gameModalBody.innerHTML = "<p>Oyun yüklenemedi!</p>";
  }
}

function getGameTitle(game) {
  switch (game) {
    case "chess": return "Satranç";
    case "2048": return "2048";
    case "wheel": return "Çarkı Felek";
    case "rps": return "Taş-Kağıt-Makas";
    case "coinflip": return "Yazı-Tura";
    default: return "Oyun";
  }
}

gameModalClose.addEventListener("click", () => {
  hideElement(gameModal);
});

// -------------------- SATRANÇ LOGIC --------------------
function initChess() {
  try {
    const board = document.getElementById("chess-board");
    // Board setup
    board.innerHTML = ""; // Temizle
    const rows = 8, cols = 8;
    for (let i = 0; i < rows; i++) {
      const rowDiv = document.createElement("div");
      rowDiv.classList.add("row");
      for (let j = 0; j < cols; j++) {
        const cell = document.createElement("div");
        cell.classList.add("cell");
        if ((i+j)%2===0) cell.classList.add("white"); else cell.classList.add("black");
        cell.dataset.pos = `${String.fromCharCode(97+j)}${8-i}`;
        rowDiv.appendChild(cell);
      }
      board.appendChild(rowDiv);
    }
    gameModalBody.appendChild(board);
    gameModalBody.appendChild(document.createElement("br"));
    const startBtn = document.createElement("button");
    startBtn.textContent = "Başlat";
    startBtn.classList.add("btn","primary");
    startBtn.addEventListener("click", () => alert("Satranç oyunu başlatıldı!"));
    gameModalBody.appendChild(startBtn);
  } catch(error) {
    console.error("Satranç init hatası:", error);
  }
}

// -------------------- 2048 LOGIC --------------------
function init2048() {
  try {
    const grid = document.getElementById("grid-2048");
    for (let i=0;i<4;i++){
      const row = document.createElement("div"); row.classList.add("grid-row");
      for (let j=0;j<4;j++){
        const cell = document.createElement("div"); cell.classList.add("grid-cell");
        cell.dataset.pos = `${i}-${j}`;
        row.appendChild(cell);
      }
      grid.appendChild(row);
    }
    gameModalBody.appendChild(grid);
    const scoreDisplay = document.createElement("p"); scoreDisplay.textContent = "Skor: 0"; scoreDisplay.id="grid-score";
    gameModalBody.appendChild(scoreDisplay);
  } catch(error){
    console.error("2048 init hatası:", error);
  }
}

// -------------------- ÇARKI FELEK --------------------
function initWheel() {
  try {
    const canvas = document.getElementById("wheel-canvas");
    const ctx = canvas.getContext("2d");
    const segments = ["100 Puan","200 Puan","300 Puan","500 Puan","1000 Puan","Boş"];
    const colors = ["#FF3F3F","#FF9A3F","#FFD23F","#3FFF88","#3F9AFF","#AA3FFF"];
    let startAngle = 0;

    function drawWheel() {
      const arc = 2 * Math.PI / segments.length;
      for (let i=0;i<segments.length;i++){
        ctx.beginPath();
        ctx.fillStyle = colors[i];
        ctx.moveTo(125,125);
        ctx.arc(125,125,120,startAngle + i*arc,startAngle + (i+1)*arc);
        ctx.fill();
        ctx.stroke();
        ctx.save();
        ctx.translate(125,125);
        ctx.rotate(startAngle + (i+0.5)*arc);
        ctx.fillStyle = "#fff"; ctx.textAlign="right"; ctx.font="16px Arial";
        ctx.fillText(segments[i],120,0);
        ctx.restore();
      }
    }
    drawWheel();

    const spinBtn = document.createElement("button"); spinBtn.textContent="Çevir"; spinBtn.classList.add("btn","primary");
    spinBtn.addEventListener("click", () => {
      const spinAngle = Math.random()*Math.PI*4 + 2*Math.PI; // 2-6 tur
      let currentAngle = 0;
      const step = spinAngle / 100;
      const anim = setInterval(()=>{
        currentAngle += step;
        ctx.clearRect(0,0,250,250);
        startAngle = currentAngle;
        drawWheel();
        if(currentAngle>=spinAngle) clearInterval(anim);
      },10);
    });
    gameModalBody.appendChild(spinBtn);
  } catch(error){
    console.error("Çarkı Felek init hatası:", error);
  }
}

// -------------------- TAŞ-KAĞIT-MAKAS --------------------
function initRPS() {
  try {
    const resultDiv = document.createElement("div"); resultDiv.id="rps-result"; resultDiv.classList.add("glass");
    resultDiv.innerHTML = `<p>Sen: -</p><p>Rakip: -</p><p>Sonuç: -</p>`;
    gameModalBody.appendChild(resultDiv);

    const options = ["rock","paper","scissors"];
    options.forEach(opt=>{
      const btn = document.createElement("button"); btn.textContent=opt; btn.classList.add("btn","secondary");
      btn.addEventListener("click", ()=>{
        const player = opt;
        const opponent = options[Math.floor(Math.random()*options.length)];
        let winner = "";
        if(player===opponent) winner="Berabere!";
        else if((player==="rock" && opponent==="scissors")||(player==="paper" && opponent==="rock")||(player==="scissors" && opponent==="paper")) winner="Kazandın!";
        else winner="Kaybettin!";
        resultDiv.innerHTML = `<p>Sen: ${player}</p><p>Rakip: ${opponent}</p><p>Sonuç: ${winner}</p>`;
      });
      gameModalBody.appendChild(btn);
    });
  } catch(error){ console.error("RPS init hatası:",error); }
}

// -------------------- YAZI-TURA --------------------
function initCoinFlip() {
  try {
    const coinResult = document.createElement("p"); coinResult.textContent="Sonuç: -"; coinResult.id="coin-result";
    const flipBtn = document.createElement("button"); flipBtn.textContent="At"; flipBtn.classList.add("btn","primary");
    flipBtn.addEventListener("click", ()=>{
      const res = Math.random()<0.5?"Yazı":"Tura";
      coinResult.textContent="Sonuç: "+res;
    });
    gameModalBody.appendChild(flipBtn);
    gameModalBody.appendChild(coinResult);
  } catch(error){ console.error("Coinflip init hatası:",error); }
}
// ============================================================
// APP.JS - BÖLÜM 2.4
// Admin & Founder Logic
// ============================================================

const adminUserList = document.getElementById("admin-user-list");
const economyUserList = document.getElementById("economy-user-list");
const chatLogList = document.getElementById("chat-log-list");

// -------------------- BAN / MUTE / FORCE LOGOUT --------------------
adminUserList.addEventListener("click", async (e) => {
  if (!currentUser || !["ADMIN","FOUNDER"].includes(currentUserRole)) return;
  const target = e.target;
  const userId = target.dataset.userId;
  if (!userId) return;

  try {
    if (target.classList.contains("ban-btn")) {
      await update(ref(db, `users/${userId}`), { banned: true });
      alert("Kullanıcı banlandı!");
    }
    if (target.classList.contains("mute-btn")) {
      await update(ref(db, `users/${userId}`), { muted: true });
      alert("Kullanıcı susturuldu!");
    }
    if (target.classList.contains("logout-btn") || target.classList.contains("force-logout-btn")) {
      await update(ref(db, `users/${userId}`), { forceLogout: true });
      alert("Kullanıcı oturumu kapatıldı!");
    }
    if (target.classList.contains("promote-btn") && currentUserRole==="FOUNDER") {
      await update(ref(db, `users/${userId}`), { role: "ADMIN" });
      alert("Kullanıcı admin yapıldı!");
    }
    if (target.classList.contains("system-msg-btn") && currentUserRole==="FOUNDER") {
      const msg = prompt("Sistem mesajı girin:");
      if(msg) await push(ref(db, `systemMessages/${userId}`), { text: msg, timestamp: Date.now() });
    }
  } catch(error){
    console.error("Admin işlemi hata:", error);
    alert("İşlem başarısız!");
  }
});

// -------------------- CHAT MANAGEMENT --------------------
chatLogList.addEventListener("click", async (e) => {
  const target = e.target;
  if (!currentUser || !["ADMIN","FOUNDER"].includes(currentUserRole)) return;

  try {
    if(target.classList.contains("delete-msg-btn")){
      const msgId = target.dataset.msgId;
      await remove(ref(db, `chats/general/${msgId}`));
      alert("Mesaj silindi!");
    }
  } catch(error){
    console.error("Mesaj silme hatası:", error);
  }
});

// -------------------- GAME MANAGEMENT --------------------
document.querySelectorAll(".toggle-game-btn").forEach(btn=>{
  btn.addEventListener("click", async ()=>{
    if (!currentUser || !["ADMIN","FOUNDER"].includes(currentUserRole)) return;
    const game = btn.dataset.game;
    try{
      const gameRef = ref(db, `games/${game}/status`);
      onValue(gameRef,snap=>{
        const currentStatus = snap.val() || "open";
        const newStatus = currentStatus==="open"?"closed":"open";
        update(ref(db, `games/${game}`), { status: newStatus });
        alert(`Oyun ${game} artık ${newStatus}`);
      });
    } catch(error){ console.error("Oyun toggle hatası:", error); }
  });
});

// -------------------- ECONOMY MANAGEMENT --------------------
economyUserList.addEventListener("click", async (e)=>{
  const target = e.target;
  const userId = target.dataset.userId;
  if(!userId) return;
  if(!currentUser || !["ADMIN","FOUNDER"].includes(currentUserRole)) return;

  try{
    const userRef = ref(db, `users/${userId}`);
    const snapshot = await userRef.get();
    let userData = snapshot.val() || { points:0, money:0 };

    if(target.classList.contains("add-points-btn")){
      const points = parseInt(prompt("Kaç puan eklensin?"),10)||0;
      await update(userRef, { points: userData.points+points });
      alert(`${points} puan eklendi!`);
    }
    if(target.classList.contains("remove-points-btn")){
      const points = parseInt(prompt("Kaç puan silinsin?"),10)||0;
      await update(userRef, { points: Math.max(0,userData.points-points) });
      alert(`${points} puan silindi!`);
    }
  } catch(error){ console.error("Economy hatası:", error); }
});

// -------------------- SYSTEM LOG --------------------
function addSystemLog(text){
  try{
    const logRef = ref(db, "systemLog");
    const newLogRef = push(logRef);
    set(newLogRef,{ text, timestamp: Date.now() });
  } catch(error){ console.error("System log hatası:", error); }
}

// -------------------- FORCE LOGOUT LISTENER --------------------
const currentUserRef = ref(db, `users/${currentUser?.uid}`);
onValue(currentUserRef, (snap)=>{
  const val = snap.val();
  if(val?.forceLogout){
    alert("Oturumunuz admin tarafından kapatıldı!");
    signOut(auth);
  }
});

// -------------------- MUTE LISTENER --------------------
onValue(ref(db, `users/${currentUser?.uid}/muted`), snap=>{
  if(snap.val()){
    chatInput.disabled = true;
    sendMessageBtn.disabled = true;
    alert("Chatten susturuldunuz!");
  } else {
    chatInput.disabled = false;
    sendMessageBtn.disabled = false;
  }
});
