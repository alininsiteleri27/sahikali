   
// ========================================
// VS SYSTEM LOGIC
// ========================================
document.getElementById('chatVsBtn')?.addEventListener('click', () => {
    document.getElementById('vsRequestModal').style.display = 'flex';
});

document.getElementById('sendVsRequestBtn')?.addEventListener('click', async () => {
    const game = document.getElementById('vsGameSelect').value;
    const bet = parseInt(document.getElementById('vsBetAmount').value);
    
    if (bet < 50) {
        alert('Minimum bahis 50 olmalıdır!');
        return;
    }

    const userRef = doc(db, 'users', currentUser.uid);
    const userSnap = await getDoc(userRef);
    const userData = userSnap.data();
    
    if (userData.score < bet) {
        alert('Yetersiz bakiye!');
        return;
    }
    
    // Send VS Request to Chat
    try {
        await addDoc(collection(db, 'chat'), {
            username: userData.username,
            userId: currentUser.uid,
            role: userData.role || 'user',
            isVsRequest: true,
            game: game,
            bet: bet,
            status: 'pending',
            timestamp: serverTimestamp(),
            message: `VS İsteği: ${game} (${bet})` // Fallback
        });
        
        document.getElementById('vsRequestModal').style.display = 'none';
    } catch (error) {
        alert('İstek gönderilemedi: ' + error.message);
    }
});

window.acceptVsRequest = async (msgId, game, bet, challengerId) => {
    if (currentUser.uid === challengerId) {
        alert('Kendi isteğini kabul edemezsin!');
        return;
    }

    const userRef = doc(db, 'users', currentUser.uid);
    const userSnap = await getDoc(userRef);
    const userData = userSnap.data();
    
    if (userData.score < bet) {
        alert('Yetersiz bakiye! Bu maça girmek için puanın yetmiyor.');
        return;
    }
    
    if (!confirm(`${bet} Puan bahisle maça girmek istiyor musun?`)) return;
    
    try {
        // 1. Update Chat Message
        const chatRef = doc(db, 'chat', msgId);
        await updateDoc(chatRef, {
            status: 'accepted',
            acceptedBy: currentUser.uid,
            acceptedByName: userData.username
        });
        
        // 2. Deduct Balance from Acceptor
        await updateDoc(userRef, {
            score: increment(-bet)
        });
        
        // 3. Show Success
        alert(`✅ Maç Kabul Edildi! Başarılar!`);
        
        // Open game modal
        if (game === 'chess') {
            document.getElementById('chessModal').style.display = 'flex';
        } else if (game === '2048') {
            document.getElementById('game2048Modal').style.display = 'flex';
        }
        
    } catch (error) {
        console.error(error);
        alert('Hata oluştu: ' + error.message);
    }
};
