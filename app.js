import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { getAuth, createUserWithEmailAndPassword, signInWithEmailAndPassword, signOut, onAuthStateChanged, setPersistence, browserLocalPersistence, GoogleAuthProvider, signInWithPopup, signInAnonymously } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import { initializeFirestore, persistentLocalCache, persistentMultipleTabManager, doc, setDoc, getDoc, updateDoc, collection, query, where, getDocs, getDocsFromServer, deleteDoc, runTransaction, increment, addDoc } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

const firebaseConfig = {
    apiKey: "AIzaSyAAL1zpUJuZET0ZDoQQGeiIIFruUocf8pY",
    authDomain: "business-21bba.firebaseapp.com",
    projectId: "business-21bba",
    storageBucket: "business-21bba.firebasestorage.app",
    messagingSenderId: "54951370679",
    appId: "1:54951370679:web:cc72b88921c90d2f7ad232",
    measurementId: "G-CXKVPKQHHG"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = initializeFirestore(app, {
    localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() })
});

// ==================== ЗАЩИТА ОТ СБОЕВ ====================
// Ловим необработанные ошибки, чтобы игра не ломалась
window.addEventListener('unhandledrejection', (e) => {
    console.warn('Поймана ошибка (не критично):', e.reason);
    e.preventDefault();
});

window.addEventListener('offline', () => {
    window.notify("📡 Нет соединения — игра работает оффлайн", "error");
});

window.addEventListener('online', () => {
    window.notify("📡 Соединение восстановлено", "success");
});

// Запись с повторными попытками (если сеть мигнула)
async function safeWrite(ref, data, retries = 3) {
    for (let i = 0; i < retries; i++) {
        try {
            await updateDoc(ref, data);
            return true;
        } catch (e) {
            console.warn(`Запись ${i + 1} не удалась:`, e.code || e.message);
            if (i < retries - 1) await new Promise(r => setTimeout(r, 600 * (i + 1)));
        }
    }
    return false;
}

// ==================== ОЧЕРЕДЬ ЗАПИСЕЙ (кликер) ====================
// Клики копятся локально и отправляются в базу раз в 2.5 сек,
// а не каждый клик — это убирает 90% сбоев и ошибок базы
window.pendingChanges = { stamina: 0, usdt: 0 };
let saveTimer = null;

function queueChange(reward) {
    window.pendingChanges.stamina -= 1;
    window.pendingChanges.usdt += reward;
    if (!saveTimer) saveTimer = setTimeout(flushChanges, 2500);
}

async function flushChanges() {
    saveTimer = null;
    const ch = window.pendingChanges;
    if (ch.stamina === 0 && ch.usdt === 0) return;
    window.pendingChanges = { stamina: 0, usdt: 0 };
    const ok = await safeWrite(doc(db, "users", window.currentUser.uid), {
        stamina: increment(ch.stamina),
        usdt: increment(ch.usdt)
    });
    if (!ok) { // не удалось — вернём в очередь и попробуем позже
        window.pendingChanges.stamina += ch.stamina;
        window.pendingChanges.usdt += ch.usdt;
        saveTimer = setTimeout(flushChanges, 5000);
    }
}

// Сохраняем сразу, если игрок сворачивает вкладку
document.addEventListener('visibilitychange', () => { if (document.hidden) flushChanges(); });

window.currentUser = null;
window.userData = null;
window.settings = {
    vibration: true,
    tooltips: true,
    music: true,
    bgColor1: '#1a0a2e',
    bgColor2: '#0d1b3e',
    bgColor3: '#2e0a1f',
    bgBlobCount: 2,
    notifPosition: 'top-right'
};

window.CONFIG = {
    START_USDT: 100, START_STAMINA: 100, BASE_MAX_STAMINA: 100,
    START_POWER: 100, START_MULTIPLIER: 1.0, CLICK_REWARD: 0.00001, MINER_WORK_HOURS: 2
};

window.ANTI_CHEAT = { history: [], blocked: false };

// ==================== НАСТРОЙКИ ФОНА ====================
function applyBackgroundColors() {
    document.documentElement.style.setProperty('--bg-color-1', window.settings.bgColor1);
    document.documentElement.style.setProperty('--bg-color-2', window.settings.bgColor2);
    document.documentElement.style.setProperty('--bg-color-3', window.settings.bgColor3);
    const blob2 = document.querySelector('.blob-2');
    const blob3 = document.querySelector('.blob-3');
    if (blob2) blob2.style.display = window.settings.bgBlobCount >= 2 ? 'block' : 'none';
    if (blob3) blob3.style.display = window.settings.bgBlobCount >= 3 ? 'block' : 'none';
}

function saveSettingsToStorage() {
    localStorage.setItem('gameSettings', JSON.stringify(window.settings));
}

function loadSettings() {
    const saved = localStorage.getItem('gameSettings');
    if (saved) {
        window.settings = { ...window.settings, ...JSON.parse(saved) };
        applyBackgroundColors();
    }
}

loadSettings();

// ==================== УСТРОЙСТВО ====================
async function getDeviceInfo() {
    let ip = "unknown";
    try {
        const res = await fetch("https://api.ipify.org?format=json");
        ip = (await res.json()).ip;
    } catch (e) {
        try {
            const res = await fetch("https://ipapi.co/json/");
            ip = (await res.json()).ip;
        } catch (e2) { console.warn("IP недоступен"); }
    }
    return { ip, userAgent: navigator.userAgent, platform: navigator.platform, language: navigator.language };
}

async function checkDeviceMatch(savedDevice) {
    if (!savedDevice) return { match: false, reason: "Нет данных устройства" };
    const current = await getDeviceInfo();
    if (savedDevice.ip !== current.ip) return { match: false, reason: "IP-адрес изменился" };
    if (savedDevice.userAgent !== current.userAgent) return { match: false, reason: "Устройство или браузер изменились" };
    return { match: true };
}

// ==================== НАВИГАЦИЯ ====================
window.navigateTo = (pageName) => {
    document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
    document.getElementById(`page-${pageName}`).classList.add('active');
    const backBtn = document.getElementById('back-btn');
    const pageTitle = document.getElementById('page-title');
    if (pageName === 'home') {
        backBtn.style.display = 'none';
        pageTitle.innerHTML = '<span class="title-oval">Главная</span>';
    } else {
        backBtn.style.display = 'flex';
        const titles = {
            clicker: 'Кликер', miner: 'Майнер', market: 'Рынок',
            invest: 'Инвестиции', business: 'Бизнесы', bank: 'Банк',
            theft: 'Крипто-Рейд', auction: 'Аукционы', top: 'Топ', profile: 'Профиль'
        };
        pageTitle.innerHTML = `<span class="title-oval">${titles[pageName] || pageName}</span>`;
    }
    if (pageName === 'market') renderMarket();
    if (pageName === 'invest') renderInvestments();
    if (pageName === 'business') renderBusinesses();
    if (pageName === 'bank') renderBank();
    if (pageName === 'top') loadTopData();
    if (pageName === 'profile') renderProfile();
    if (pageName === 'auction') renderAuctions();
};

window.goHome = () => window.navigateTo('home');

// ==================== АВТОРИЗАЦИЯ ====================
window.showRegister = () => {
    document.getElementById('login-form').style.display = 'none';
    document.getElementById('register-form').style.display = 'block';
    document.getElementById('auth-error').textContent = '';
};

window.showLogin = () => {
    document.getElementById('register-form').style.display = 'none';
    document.getElementById('login-form').style.display = 'block';
    document.getElementById('auth-error').textContent = '';
};

function showError(msg) {
    let friendlyMsg = msg;
    if (msg.includes('auth/invalid-email')) friendlyMsg = '❌ Неверный формат Email. Пример: user@example.com';
    else if (msg.includes('auth/user-not-found')) friendlyMsg = '❌ Пользователь с таким Email не найден.';
    else if (msg.includes('auth/wrong-password')) friendlyMsg = '❌ Неверный пароль.';
    else if (msg.includes('auth/email-already-in-use')) friendlyMsg = '❌ Этот Email уже зарегистрирован.';
    else if (msg.includes('auth/weak-password')) friendlyMsg = '❌ Пароль слишком слабый (мин. 6 символов).';
    else if (msg.includes('auth/too-many-requests')) friendlyMsg = '⏳ Слишком много попыток. Подождите.';
    document.getElementById('auth-error').textContent = friendlyMsg;
}

async function createNewProfile(user, nick, email, isAnonymous = false) {
    await setDoc(doc(db, "users", user.uid), {
        nick, email, isAnonymous,
        lastActiveMs: Date.now(),
        usdt: 100, stamina: 100, maxStamina: 100, power: 100, multiplier: 1.0, level: 0,
        balances: { BTC: 0, ETH: 0, LTC: 0, BNB: 0, TRX: 0, XRP: 0, GOLD: 0, SILVER: 0, PLAT: 0, DIAMOND: 0, SAPPHIRE: 0, RUBY: 0 },
        businesses: [], activeInvestments: [],
        bank: { deposit: 0, depositDate: null, loan: 0, loanDate: null },
        miner: { running: false, startTime: null, currency: 'BTC' },
        transactions: [],
        device: await getDeviceInfo(),
        createdAt: new Date().toISOString()
    });
}

window.register = async () => {
    const nick = document.getElementById('reg-nick').value.trim();
    const email = document.getElementById('reg-email').value.trim();
    const pass = document.getElementById('reg-password').value;
    const passConf = document.getElementById('reg-password-confirm').value;
    document.getElementById('auth-error').textContent = '';
    if (!nick || nick.length < 2 || nick.length > 20) return showError("Ник от 2 до 20 символов");
    if (!email || !email.includes('@')) return showError("Введите корректный Email");
    if (pass.length < 6) return showError("Пароль минимум 6 символов");
    if (pass !== passConf) return showError("Пароли не совпадают");
    try {
        const userCred = await createUserWithEmailAndPassword(auth, email, pass);
        await createNewProfile(userCred.user, nick, email);
    } catch (e) { showError(e.message); }
};

window.login = async () => {
    const email = document.getElementById('login-email').value.trim();
    const pass = document.getElementById('login-password').value;
    document.getElementById('auth-error').textContent = '';
    if (!email || !pass) return showError("Заполните все поля");
    try { await signInWithEmailAndPassword(auth, email, pass); }
    catch (e) { showError(e.message); }
};

window.signInWithGoogle = async () => {
    document.getElementById('auth-error').textContent = '';
    try {
        const provider = new GoogleAuthProvider();
        const result = await signInWithPopup(auth, provider);
        const user = result.user;
        const docSnap = await getDoc(doc(db, "users", user.uid));
        if (!docSnap.exists()) {
            await createNewProfile(user, user.displayName || user.email.split('@')[0], user.email);
        }
    } catch (e) { showError(e.message); }
};

window.signInAnonymously = async () => {
    document.getElementById('auth-error').textContent = '';
    try {
        const result = await signInAnonymously(auth);
        const num = await takePlayerNumber();
        await createNewProfile(result.user, "player_" + num, null, true);
    } catch (e) { showError(e.message); }
};

// Выдаёт свободный номер: сначала освобождённый, иначе следующий
async function takePlayerNumber() {
    const metaRef = doc(db, "global", "meta");
    let assigned = null;
    await runTransaction(db, async (tx) => {
        const snap = await tx.get(metaRef);
        let meta = snap.exists() ? snap.data() : { nextPlayerNumber: 1, freeNumbers: [] };
        if (!meta.freeNumbers) meta.freeNumbers = [];
        if (!meta.nextPlayerNumber) meta.nextPlayerNumber = 1;
        if (meta.freeNumbers.length > 0) {
            assigned = meta.freeNumbers.shift();
        } else {
            assigned = meta.nextPlayerNumber;
            meta.nextPlayerNumber += 1;
        }
        tx.set(metaRef, meta);
    });
    return assigned;
}

// Удаляет анонимов, мёртвых 30+ дней, и освобождает их номера
async function cleanupOldAnonymous() {
    try {
        const last = localStorage.getItem('lastCleanup');
        if (last && Date.now() - parseInt(last) < 24 * 60 * 60 * 1000) return;
        localStorage.setItem('lastCleanup', String(Date.now()));
        const cutoff = Date.now() - 30 * 24 * 60 * 60 * 1000;
        const snap = await getDocs(query(collection(db, "users"), where("lastActiveMs", "<", cutoff)));
        const freed = [];
        for (const d of snap.docs) {
            const data = d.data();
            if (data.isAnonymous && data.nick && data.nick.startsWith("player_")) {
                try {
                    await deleteDoc(d.ref);
                    const n = parseInt(data.nick.split("_")[1]);
                    if (!isNaN(n)) freed.push(n);
                } catch (e) {}
            }
        }
        if (freed.length) {
            await runTransaction(db, async (tx) => {
                const s = await tx.get(doc(db, "global", "meta"));
                let meta = s.exists() ? s.data() : { nextPlayerNumber: 1, freeNumbers: [] };
                meta.freeNumbers = [...(meta.freeNumbers || []), ...freed].sort((a, b) => a - b);
                tx.set(doc(db, "global", "meta"), meta);
            });
        }
    } catch (e) { console.warn("Очистка:", e); }
}

window.logout = async () => {
    await signOut(auth);
    document.getElementById('login-email').value = '';
    document.getElementById('login-password').value = '';
};

window.togglePassword = (inputId, btn) => {
    const input = document.getElementById(inputId);
    if (input.type === 'password') { input.type = 'text'; btn.textContent = '🙈'; }
    else { input.type = 'password'; btn.textContent = '👁'; }
};

onAuthStateChanged(auth, async (user) => {
    const authScreen = document.getElementById('auth-screen');
    const gameScreen = document.getElementById('game-screen');
    if (user) {
        window.currentUser = user;
        try {
            const docSnap = await getDoc(doc(db, "users", user.uid));
            if (docSnap.exists()) {
                window.userData = docSnap.data();
                authScreen.style.display = 'none';
                gameScreen.style.display = 'flex';
                updateUI();
                checkOfflineMiner();
                if (window.settings.music) applyMusic();
                showDiscordNotification("С возвращением!", `${window.userData.nick}, рады видеть вас снова!`, "👋");
                                updateDoc(doc(db, "users", user.uid), { lastActiveMs: Date.now() }).catch(() => {});
                cleanupOldAnonymous();
                // Проверка устройства в фоне — не задерживает вход
                checkDeviceMatch(window.userData.device).then(async (check) => {
                    if (!check.match) {
                        await signOut(auth);
                        showError(`⚠️ ${check.reason}. Войдите заново.`);
                    } else {
                        const currentDevice = await getDeviceInfo();
                        if (JSON.stringify(window.userData.device) !== JSON.stringify(currentDevice)) {
                            safeWrite(doc(db, "users", user.uid), { device: currentDevice });
                        }
                    }
                });
            } else {
                await signOut(auth);
                showError("Ошибка загрузки профиля.");
            }
        } catch (error) {
            console.error('Ошибка:', error);
            showError("Ошибка подключения к базе данных.");
        }
    } else {
        window.currentUser = null;
        window.userData = null;
        gameScreen.style.display = 'none';
        authScreen.style.display = 'flex';
    }
});

// ==================== UI ====================
window.updateUI = () => {
    if (!window.userData) return;
    document.getElementById('usdt-display').textContent = window.userData.usdt.toFixed(2);
    document.getElementById('player-nick').textContent = window.userData.nick;
};

window.notify = (msg, type = 'info') => {
    const div = document.createElement('div');
    div.className = `notification notify-${type} notif-${window.settings.notifPosition}`;
    div.textContent = msg;
    document.body.appendChild(div);
    setTimeout(() => div.remove(), 3000);
};

function showDiscordNotification(title, message, icon = '🔔') {
    const notif = document.getElementById('discord-notification');
    document.getElementById('discord-notif-title').textContent = title;
    document.getElementById('discord-notif-message').textContent = message;
    document.getElementById('discord-notif-icon').textContent = icon;
    notif.className = `discord-notification notif-${window.settings.notifPosition}`;
    notif.classList.add('show');
    if (window.settings.vibration && navigator.vibrate) navigator.vibrate(200);
    setTimeout(() => notif.classList.remove('show'), 5000);
}

// ==================== АНТИ-ЧИТ ====================
window.validateClick = (x, y) => {
    if (window.ANTI_CHEAT.blocked) return false;
    const now = performance.now();
    window.ANTI_CHEAT.history.push({ time: now });
    if (window.ANTI_CHEAT.history.length > 10) window.ANTI_CHEAT.history.shift();
    if (window.ANTI_CHEAT.history.length >= 2) {
        const prev = window.ANTI_CHEAT.history[window.ANTI_CHEAT.history.length - 2];
        if (now - prev.time <= 1.0) { blockInput("Слишком высокая скорость кликов!"); return false; }
    }
    return true;
};

function blockInput(reason) {
    window.ANTI_CHEAT.blocked = true;
    window.notify(`⚠️ ${reason} Блок 10 сек.`, "error");
    document.body.style.pointerEvents = 'none';
    setTimeout(() => {
        window.ANTI_CHEAT.blocked = false;
        document.body.style.pointerEvents = 'auto';
        window.ANTI_CHEAT.history = [];
    }, 10000);
}

// ==================== КЛИКЕР ====================
document.addEventListener('DOMContentLoaded', () => {
    const clickBtn = document.getElementById('click-btn');
    if (clickBtn) {
        const handleClick = (e) => {
            if (!window.userData || window.userData.stamina <= 0) { window.notify("Нет стамины!", "error"); return; }
            const rect = clickBtn.getBoundingClientRect();
            const x = e.clientX || (e.touches ? e.touches[0].clientX : rect.left + rect.width / 2);
            const y = e.clientY || (e.touches ? e.touches[0].clientY : rect.top + rect.height / 2);
            if (!window.validateClick(x, y)) return;
            const reward = window.userData.power * window.userData.multiplier * window.CONFIG.CLICK_REWARD;
            window.userData.stamina -= 1;
            window.userData.usdt += reward;
            window.updateUI();
            const effect = document.createElement('div');
            effect.className = 'click-effect';
            effect.textContent = `+${reward.toFixed(6)}`;
            effect.style.left = `${x}px`;
            effect.style.top = `${y}px`;
            document.body.appendChild(effect);
            setTimeout(() => effect.remove(), 1000);
            queueChange(reward);
        };
        clickBtn.addEventListener('mousedown', handleClick);
        clickBtn.addEventListener('touchstart', (e) => { e.preventDefault(); handleClick(e); }, { passive: false });
    }
});

// ==================== МАЙНЕР ====================
function checkOfflineMiner() {
    if (!window.userData.miner || !window.userData.miner.running || !window.userData.miner.startTime) return;
    const now = Date.now();
    const start = new Date(window.userData.miner.startTime).getTime();
    const elapsed = (now - start) / 1000;
    const maxSec = window.CONFIG.MINER_WORK_HOURS * 3600;
    if (elapsed >= maxSec) {
        window.userData.miner.running = false;
        window.userData.miner.startTime = null;
        updateDoc(doc(db, "users", window.currentUser.uid), { miner: { running: false, startTime: null, currency: window.userData.miner.currency } });
        showDiscordNotification("Майнер завершил!", "Забрать награду в разделе Майнер", "⛏");
    } else {
        const progress = (elapsed / maxSec) * 100;
        const remaining = Math.ceil((maxSec - elapsed) / 60);
        document.getElementById('miner-progress').style.width = `${progress}%`;
        document.getElementById('miner-time-left').textContent = `${remaining} мин`;
        document.getElementById('miner-status').textContent = "🟢 Работает";
        document.getElementById('miner-toggle-btn').textContent = "⏹ Остановить";
    }
}

document.addEventListener('DOMContentLoaded', () => {
    const btn = document.getElementById('miner-toggle-btn');
    if (btn) btn.addEventListener('click', async () => {
        if (!window.userData.miner) window.userData.miner = { running: false, startTime: null, currency: 'BTC' };
        if (window.userData.miner.running) {
            window.userData.miner.running = false;
            window.userData.miner.startTime = null;
            document.getElementById('miner-progress').style.width = '0%';
            document.getElementById('miner-time-left').textContent = '0 мин';
            document.getElementById('miner-status').textContent = '🔴 Остановлен';
            document.getElementById('miner-toggle-btn').textContent = '▶️ Запустить';
        } else {
            window.userData.miner.running = true;
            window.userData.miner.startTime = new Date().toISOString();
            window.userData.miner.currency = document.getElementById('miner-currency').value;
            document.getElementById('miner-status').textContent = '🟢 Работает';
            document.getElementById('miner-toggle-btn').textContent = '⏹ Остановить';
            window.notify("Майнер запущен!", "success");
        }
        await updateDoc(doc(db, "users", window.currentUser.uid), { miner: window.userData.miner });
    });
});

// ==================== РЫНОК ====================
const ASSETS = [
    { id: 'BTC', name: 'Bitcoin', icon: '₿', minPrice: 30, type: 'crypto' },
    { id: 'ETH', name: 'Ethereum', icon: 'Ξ', minPrice: 30, type: 'crypto' },
    { id: 'LTC', name: 'Litecoin', icon: 'Ł', minPrice: 30, type: 'crypto' },
    { id: 'BNB', name: 'Binance', icon: '🔶', minPrice: 30, type: 'crypto' },
    { id: 'TRX', name: 'Tron', icon: '🔴', minPrice: 30, type: 'crypto' },
    { id: 'XRP', name: 'Ripple', icon: '✕', minPrice: 30, type: 'crypto' },
    { id: 'GOLD', name: 'Золото', icon: '🥇', minPrice: 50, type: 'metal' },
    { id: 'SILVER', name: 'Серебро', icon: '🥈', minPrice: 50, type: 'metal' },
    { id: 'PLAT', name: 'Платина', icon: '⬜', minPrice: 50, type: 'metal' },
    { id: 'DIAMOND', name: 'Алмаз', icon: '💎', minPrice: 50, type: 'metal' },
    { id: 'SAPPHIRE', name: 'Сапфир', icon: '🔷', minPrice: 50, type: 'metal' },
    { id: 'RUBY', name: 'Рубин', icon: '🔴', minPrice: 50, type: 'metal' }
];

let currentMarketFilter = 'all';

window.filterMarket = (filter) => {
    currentMarketFilter = filter;
    document.querySelectorAll('.filter-btn').forEach(btn => btn.classList.remove('active'));
    event.target.classList.add('active');
    renderMarket();
};

async function renderMarket() {
    const list = document.getElementById('market-list');
    list.innerHTML = '<p style="text-align:center; color: var(--text-secondary);">Загрузка...</p>';
    try {
        const marketRef = doc(db, "global", "market_prices");
        let marketData = {};
        const snap = await getDoc(marketRef);
        if (snap.exists()) marketData = snap.data();
        else {
            ASSETS.forEach(a => { marketData[a.id] = { price: a.minPrice, prevPrice: a.minPrice }; });
            await setDoc(marketRef, marketData);
        }
        list.innerHTML = '';
        const filtered = currentMarketFilter === 'all' ? ASSETS : ASSETS.filter(a => a.type === currentMarketFilter);
        for (const asset of filtered) {
            const data = marketData[asset.id] || { price: asset.minPrice, prevPrice: asset.minPrice };
            const price = data.price, prevPrice = data.prevPrice;
            const userBalance = window.userData.balances?.[asset.id] || 0;
            const trend = price > prevPrice ? '🔼' : (price < prevPrice ? '🔽' : '➡️');
            const trendColor = price > prevPrice ? 'var(--success-color)' : (price < prevPrice ? 'var(--error-color)' : 'var(--text-secondary)');
            const div = document.createElement('div');
            div.className = 'market-item';
            div.innerHTML = `
                <div class="market-info">
                    <div class="market-name">${asset.icon} ${asset.name}</div>
                    <div class="market-price" style="color: ${trendColor};">${trend} ${price.toFixed(2)} USDT</div>
                    <div class="market-balance">Баланс: ${userBalance.toFixed(6)}</div>
                </div>
                <div class="market-actions">
                    <button class="market-btn buy" onclick="tradeAsset('${asset.id}', 'buy', ${price})">Купить</button>
                    <button class="market-btn sell" onclick="tradeAsset('${asset.id}', 'sell', ${price})">Продать</button>
                </div>`;
            list.appendChild(div);
        }
    } catch (error) {
        list.innerHTML = `<p style="text-align:center; color: var(--error-color);">Ошибка: ${error.message}</p>`;
    }
}

window.tradeAsset = async (assetId, action, currentPrice) => {
    const amountStr = prompt(`Количество ${assetId} для ${action === 'buy' ? 'покупки' : 'продажи'}:`);
    if (!amountStr) return;
    const amount = parseFloat(amountStr.replace(',', '.'));
    if (isNaN(amount) || amount <= 0) return window.notify("Неверное количество", "error");
    const totalCost = amount * currentPrice;
    if (action === 'buy') {
        if (window.userData.usdt < totalCost) return window.notify("Недостаточно USDT", "error");
        await updateDoc(doc(db, "users", window.currentUser.uid), { usdt: increment(-totalCost), [`balances.${assetId}`]: increment(amount) });
        window.userData.usdt -= totalCost;
        if (!window.userData.balances) window.userData.balances = {};
        window.userData.balances[assetId] = (window.userData.balances[assetId] || 0) + amount;
        addTransaction(`Покупка ${amount} ${assetId}`, -totalCost);
        window.notify(`✅ Куплено ${amount} ${assetId}`, "success");
    } else {
        const currentBal = window.userData.balances?.[assetId] || 0;
        if (currentBal < amount) return window.notify(`Недостаточно ${assetId}`, "error");
        await updateDoc(doc(db, "users", window.currentUser.uid), { usdt: increment(totalCost), [`balances.${assetId}`]: increment(-amount) });
        window.userData.usdt += totalCost;
        window.userData.balances[assetId] -= amount;
        addTransaction(`Продажа ${amount} ${assetId}`, totalCost);
        window.notify(`✅ Продано ${amount} ${assetId}`, "success");
    }
    window.updateUI();
    renderMarket();
};

function addTransaction(description, amount) {
    if (!window.userData.transactions) window.userData.transactions = [];
    window.userData.transactions.unshift({ desc: description, amount, date: new Date().toISOString() });
    if (window.userData.transactions.length > 50) window.userData.transactions.pop();
    updateDoc(doc(db, "users", window.currentUser.uid), { transactions: window.userData.transactions });
}

// ==================== ИНВЕСТИЦИИ ====================
const ENTERPRISES = [
    { id: 'school', name: 'Школа', logo: '🏫' }, { id: 'wb', name: 'Wildberries', logo: '🟣' },
    { id: 'ozon', name: 'Ozon', logo: '🔵' }, { id: 'ai', name: 'AI', logo: '🤖' },
    { id: 'hospital', name: 'Больница', logo: '🏥' }, { id: 'apple', name: 'Apple', logo: '🍎' },
    { id: 'samsung', name: 'Samsung', logo: '📱' }, { id: 'tesla', name: 'Tesla', logo: '⚡' },
    { id: 'google', name: 'Google', logo: '🔍' }, { id: 'amazon', name: 'Amazon', logo: '📦' }
];

function getCurrentInvestments() {
    const period = Math.floor(Date.now() / (3 * 24 * 60 * 60 * 1000));
    const seed = period * 12345;
    const shuffled = [...ENTERPRISES].sort((a, b) => Math.sin(seed + a.id.length) - Math.sin(seed + b.id.length));
    return shuffled.slice(0, 5).map((ent, i) => ({ ...ent, winChance: 10 + i * 10, profitPercent: 80 - i * 10, maxBet: 3000 + i * 500, minBet: 500 }));
}

async function renderInvestments() {
    const list = document.getElementById('investments-list');
    list.innerHTML = '';
    getCurrentInvestments().forEach(inv => {
        const card = document.createElement('div');
        card.className = 'investment-card';
        card.innerHTML = `
            <div class="investment-logo">${inv.logo}</div>
            <div class="investment-name">${inv.name}</div>
            <div class="investment-stats">Шанс: ${inv.winChance}%<br>Доход: +${inv.profitPercent}%<br>Лимит: ${inv.minBet}-${inv.maxBet}</div>
            <input type="number" class="investment-input" id="inv-amount-${inv.id}" placeholder="Сумма" min="${inv.minBet}" max="${inv.maxBet}">
            <button class="invest-btn" onclick="makeInvestment('${inv.id}', ${inv.winChance}, ${inv.profitPercent}, ${inv.maxBet})">Инвестировать</button>`;
        list.appendChild(card);
    });
    const activeList = document.getElementById('active-investments-list');
    activeList.innerHTML = '';
    (window.userData.activeInvestments || []).forEach((act, idx) => {
        const msLeft = new Date(act.startTime).getTime() + 18 * 60 * 60 * 1000 - Date.now();
        const hoursLeft = Math.max(0, Math.ceil(msLeft / (1000 * 60 * 60)));
        const div = document.createElement('div');
        div.className = 'list-item';
        div.innerHTML = `<div><strong>${act.name}</strong><br><small>Вложено: ${act.amount} USDT. Осталось: ${hoursLeft} ч.</small></div>${msLeft <= 0 ? `<button class="btn-primary" style="width:auto;" onclick="resolveInvestment(${idx})">Забрать</button>` : '<small>⏳ Ожидание</small>'}`;
        activeList.appendChild(div);
    });
}

window.makeInvestment = async (id, chance, profit, maxBet) => {
    const input = document.getElementById(`inv-amount-${id}`);
    const amount = parseFloat(input.value.replace(',', '.'));
    if (!amount || amount < 500 || amount > maxBet) return window.notify(`Сумма от 500 до ${maxBet}`, "error");
    if (window.userData.usdt < amount) return window.notify("Недостаточно USDT", "error");
    const newInv = { id, name: ENTERPRISES.find(e => e.id === id).name, amount, chance, profit, startTime: new Date().toISOString() };
    const active = [...(window.userData.activeInvestments || []), newInv];
    await updateDoc(doc(db, "users", window.currentUser.uid), { activeInvestments: active, usdt: increment(-amount) });
    window.userData.usdt -= amount;
    window.userData.activeInvestments = active;
    addTransaction(`Инвестиция в ${newInv.name}`, -amount);
    window.updateUI();
    renderInvestments();
    window.notify("Инвестиция размещена!", "success");
};

window.resolveInvestment = async (index) => {
    const actives = window.userData.activeInvestments;
    const inv = actives[index];
    const isWin = Math.random() * 100 < inv.chance;
    if (isWin) {
        const total = inv.amount * (1 + inv.profit / 100);
        await updateDoc(doc(db, "users", window.currentUser.uid), { activeInvestments: actives.filter((_, i) => i !== index), usdt: increment(total) });
        window.userData.usdt += total;
        addTransaction(`Прибыль от ${inv.name}`, total);
        showDiscordNotification("Инвестиция успешна!", `+${total.toFixed(2)} USDT`, "💰");
    } else {
        await updateDoc(doc(db, "users", window.currentUser.uid), { activeInvestments: actives.filter((_, i) => i !== index) });
        addTransaction(`Убыток от ${inv.name}`, -inv.amount);
        showDiscordNotification("Инвестиция провалилась", `-${inv.amount.toFixed(2)} USDT`, "📉");
    }
    window.userData.activeInvestments = actives.filter((_, i) => i !== index);
    window.updateUI();
    renderInvestments();
};

// ==================== БИЗНЕСЫ ====================
const BUSINESS_TYPES = [
    { id: 'it', name: 'IT-стартап', icon: '💻', cost: 2000, income: 100 },
    { id: 'restaurant', name: 'Ресторан', icon: '🍽️', cost: 3000, income: 150 },
    { id: 'auto', name: 'Автосервис', icon: '🔧', cost: 2500, income: 120 },
    { id: 'fitness', name: 'Фитнес-клуб', icon: '💪', cost: 4000, income: 200 },
    { id: 'beauty', name: 'Салон красоты', icon: '💇', cost: 3500, income: 180 }
];

async function renderBusinesses() {
    const list = document.getElementById('businesses-list');
    list.innerHTML = '';
    const bizs = window.userData.businesses || [];
    document.getElementById('create-business-btn').style.display = bizs.length >= 2 ? 'none' : 'block';
    bizs.forEach((biz, index) => {
        const bizType = BUSINESS_TYPES.find(t => t.id === biz.type);
        if (!bizType) return;
        const div = document.createElement('div');
        div.className = 'list-item';
        div.style.flexDirection = 'column';
        div.style.alignItems = 'flex-start';
        div.innerHTML = `<strong>${bizType.icon} ${bizType.name} - ${biz.name}</strong><small>${biz.isBroken ? "🚨 СЛОМАН (600 USDT)" : `Доход: ${bizType.income * biz.level} USDT/день`} | Вложено: ${biz.totalInvested} USDT</small><div style="margin-top:10px; display:flex; gap:10px;">${biz.isBroken ? `<button class="btn-secondary" onclick="repairBusiness(${index})">🔧 Починить</button>` : ''}<button class="btn-secondary" onclick="sellBusiness(${index})">💸 Продать (40%)</button></div>`;
        list.appendChild(div);
    });
}

document.addEventListener('DOMContentLoaded', () => {
    const btn = document.getElementById('create-business-btn');
    if (btn) btn.addEventListener('click', () => {
        if ((window.userData.businesses || []).length >= 2) return window.notify("Максимум 2 бизнеса", "error");
        let html = '<h3 style="margin-bottom: 15px;">Создать бизнес</h3>';
        BUSINESS_TYPES.forEach(s => {
            html += `<div class="list-item" onclick="createBiz('${s.id}')" style="cursor:pointer; margin:8px 0;"><b>${s.icon} ${s.name}</b><br><small>Цена: ${s.cost} | Доход: ${s.income}/день</small></div>`;
        });
        document.getElementById('modal-body').innerHTML = html;
        document.getElementById('modal').classList.add('active');
    });
});

window.createBiz = async (typeId) => {
    const name = prompt("Название бизнеса:");
    if (!name) return;
    const bizType = BUSINESS_TYPES.find(t => t.id === typeId);
    if (window.userData.usdt < bizType.cost) return window.notify("Недостаточно средств", "error");
    const newBiz = { type: typeId, name, level: 1, totalInvested: bizType.cost, isBroken: false, lastCheckTime: new Date().toISOString() };
    const bizs = [...(window.userData.businesses || []), newBiz];
    await updateDoc(doc(db, "users", window.currentUser.uid), { businesses: bizs, usdt: increment(-bizType.cost) });
    window.userData.usdt -= bizType.cost;
    window.userData.businesses = bizs;
    addTransaction(`Бизнес "${name}"`, -bizType.cost);
    window.closeModal();
    window.updateUI();
    renderBusinesses();
    window.notify("Бизнес создан!", "success");
};

window.repairBusiness = async (index) => {
    if (window.userData.usdt < 600) return window.notify("Нужно 600 USDT", "error");
    const bizs = window.userData.businesses;
    bizs[index].isBroken = false;
    await updateDoc(doc(db, "users", window.currentUser.uid), { businesses: bizs, usdt: increment(-600) });
    window.userData.usdt -= 600;
    window.userData.businesses = bizs;
    addTransaction("Ремонт бизнеса", -600);
    window.updateUI();
    renderBusinesses();
    window.notify("Отремонтирован!", "success");
};

window.sellBusiness = async (index) => {
    const bizs = window.userData.businesses;
    const refund = bizs[index].totalInvested * 0.4;
    bizs.splice(index, 1);
    await updateDoc(doc(db, "users", window.currentUser.uid), { businesses: bizs, usdt: increment(refund) });
    window.userData.usdt += refund;
    window.userData.businesses = bizs;
    addTransaction("Продажа бизнеса", refund);
    window.updateUI();
    renderBusinesses();
    window.notify(`Продан за ${refund.toFixed(2)} USDT`, "success");
};

// ==================== БАНК ====================
async function renderBank() {
    const bankData = window.userData.bank || { deposit: 0, loan: 0 };
    document.getElementById('bank-deposit').textContent = bankData.deposit.toFixed(2) + ' USDT';
    document.getElementById('bank-loan').textContent = bankData.loan.toFixed(2) + ' USDT';
}

window.bankAction = async (action) => {
    const bankData = window.userData.bank || { deposit: 0, depositDate: null, loan: 0, loanDate: null };
    const now = Date.now();
    if (action === 'deposit') {
        if (window.userData.usdt < 100) return window.notify("Минимум 100 USDT", "error");
        await updateDoc(doc(db, "users", window.currentUser.uid), { usdt: increment(-100), "bank.deposit": increment(100), "bank.depositDate": now });
        window.userData.usdt -= 100;
        window.userData.bank = { ...bankData, deposit: bankData.deposit + 100, depositDate: now };
        addTransaction("Вклад", -100);
        window.notify("✅ Вложено 100 USDT!", "success");
    } else if (action === 'withdraw') {
        if (bankData.deposit <= 0) return window.notify("Нет депозита", "error");
        const days = (now - bankData.depositDate) / 86400000;
        if (days < 7) return window.notify(`Мин. 7 дней. Осталось: ${Math.ceil(7 - days)}`, "error");
        const total = bankData.deposit * Math.pow(1.02, days);
        await updateDoc(doc(db, "users", window.currentUser.uid), { usdt: increment(total), "bank.deposit": 0, "bank.depositDate": null });
        window.userData.usdt += total;
        window.userData.bank.deposit = 0;
        addTransaction("Снятие вклада", total);
        window.notify(`✅ +${total.toFixed(2)} USDT`, "success");
    } else if (action === 'loan') {
        if (bankData.loan > 0) return window.notify("Сначала погасите кредит", "error");
        await updateDoc(doc(db, "users", window.currentUser.uid), { usdt: increment(1000), "bank.loan": 1000, "bank.loanDate": now });
        window.userData.usdt += 1000;
        window.userData.bank = { ...bankData, loan: 1000, loanDate: now };
        addTransaction("Кредит", 1000);
        window.notify("✅ Кредит получен!", "success");
    } else if (action === 'payLoan') {
        if (bankData.loan <= 0) return window.notify("Нет кредита", "error");
        const days = (now - bankData.loanDate) / 86400000;
        const debt = bankData.loan * Math.pow(1.05, days);
        if (window.userData.usdt < debt) return window.notify(`Нужно ${debt.toFixed(2)} USDT`, "error");
        await updateDoc(doc(db, "users", window.currentUser.uid), { usdt: increment(-debt), "bank.loan": 0, "bank.loanDate": null });
        window.userData.usdt -= debt;
        window.userData.bank.loan = 0;
        addTransaction("Погашение кредита", -debt);
        window.notify(`✅ Погашено ${debt.toFixed(2)} USDT`, "success");
    }
    window.updateUI();
    renderBank();
};

// ==================== КРАЖА ====================
document.addEventListener('DOMContentLoaded', () => {
    const btn = document.getElementById('theft-search-btn');
    if (btn) btn.addEventListener('click', async () => {
        if (window.userData.usdt < 10) return window.notify("Нужно 10 USDT", "error");
        document.getElementById('theft-search-btn').style.display = 'none';
        document.getElementById('theft-animation').style.display = 'block';
        await updateDoc(doc(db, "users", window.currentUser.uid), { usdt: increment(-10) });
        window.userData.usdt -= 10;
        window.updateUI();
        const statusText = document.getElementById('theft-status-text');
        await new Promise(r => setTimeout(r, 1500));
        statusText.textContent = "Сканирование уязвимостей...";
        await new Promise(r => setTimeout(r, 1500));
        statusText.textContent = "Жертва найдена!";
        await new Promise(r => setTimeout(r, 1500));
        const victimNick = "Игрок_" + Math.floor(Math.random() * 9999);
        const victimBalance = 500 + Math.floor(Math.random() * 2000);
        document.getElementById('theft-animation').style.display = 'none';
        const resultDiv = document.getElementById('theft-result');
        resultDiv.style.display = 'block';
        resultDiv.innerHTML = `<h3>🎯 Жертва: ${victimNick}</h3><p>Баланс: ~${victimBalance} USDT</p><p>Риск:</p><div style="display:flex; gap:10px; flex-wrap:wrap; margin-top:10px;"><button class="btn-secondary" onclick="executeTheft(1, 40, ${victimBalance})">1% (40%)</button><button class="btn-secondary" onclick="executeTheft(3, 18, ${victimBalance})">3% (18%)</button><button class="btn-secondary" onclick="executeTheft(5, 5, ${victimBalance})">5% (5%)</button></div><button class="btn-secondary" style="margin-top:15px;" onclick="resetTheftUI()">Отмена</button>`;
    });
});

window.executeTheft = async (percent, chance, victimBal) => {
    const isWin = Math.random() * 100 < chance;
    const amount = victimBal * (percent / 100);
    if (isWin) {
        await updateDoc(doc(db, "users", window.currentUser.uid), { usdt: increment(amount) });
        window.userData.usdt += amount;
        addTransaction("Кража", amount);
        showDiscordNotification("Кража успешна!", `+${amount.toFixed(2)} USDT`, "⚔️");
    } else {
        const penalty = window.userData.usdt * (percent / 100);
        await updateDoc(doc(db, "users", window.currentUser.uid), { usdt: increment(-penalty) });
        window.userData.usdt -= penalty;
        addTransaction("Провал кражи", -penalty);
        window.notify(`❌ -${penalty.toFixed(2)} USDT`, "error");
    }
    window.updateUI();
    resetTheftUI();
};

window.resetTheftUI = () => {
    document.getElementById('theft-animation').style.display = 'none';
    document.getElementById('theft-result').style.display = 'none';
    document.getElementById('theft-search-btn').style.display = 'block';
};

// ==================== АУКЦИОНЫ ====================
async function renderAuctions() {
    const list = document.getElementById('auction-list');
    list.innerHTML = '<p style="text-align:center; color: var(--text-secondary);">Загрузка...</p>';
    try {
        const auctionsRef = collection(db, "auctions");
        const q = query(auctionsRef, where("status", "==", "active"));
        const snapshot = await getDocs(q);
        list.innerHTML = '';
        if (snapshot.empty) {
            await addDoc(auctionsRef, { currentBid: 100, highestBidderId: null, highestBidderNick: null, endTime: new Date(Date.now() + 7200000), status: "active" });
            return renderAuctions();
        }
        snapshot.forEach(docSnap => {
            const data = docSnap.data();
            const hoursLeft = Math.max(0, Math.ceil((data.endTime.toDate().getTime() - Date.now()) / 3600000));
            const div = document.createElement('div');
            div.className = 'list-item';
            div.style.flexDirection = 'column';
            div.style.alignItems = 'flex-start';
            div.innerHTML = `<strong>🔒 Кошелёк #${docSnap.id.substr(0, 6)}</strong><small>Ставка: <b>${data.currentBid.toFixed(2)} USDT</b></small><small>Лидер: ${data.highestBidderNick || 'Нет'}</small><small style="color: var(--error-color);">⏳ ${hoursLeft} ч.</small><small style="color: var(--text-secondary); font-size: 11px;">⚠️ Ставка невозвратна!</small><div style="display:flex; gap:10px; margin-top:10px; width:100%;"><input type="number" id="bid-input-${docSnap.id}" placeholder="Ставка" style="flex:1;"><button class="btn-primary" style="width:auto;" onclick="placeBid('${docSnap.id}', ${data.currentBid})">Ставка</button></div>`;
            list.appendChild(div);
        });
    } catch (error) {
        list.innerHTML = `<p style="text-align:center; color: var(--error-color);">Ошибка: ${error.message}</p>`;
    }
}

window.placeBid = async (auctionId, currentBid) => {
    const input = document.getElementById(`bid-input-${auctionId}`);
    const newBid = parseFloat(input.value.replace(',', '.'));
    if (isNaN(newBid) || newBid <= currentBid) return window.notify(`Ставка выше ${currentBid}`, "error");
    if (window.userData.usdt < newBid) return window.notify("Недостаточно USDT", "error");
    await updateDoc(doc(db, "auctions", auctionId), { currentBid: newBid, highestBidderId: window.currentUser.uid, highestBidderNick: window.userData.nick, endTime: new Date(Date.now() + 3600000) });
    await updateDoc(doc(db, "users", window.currentUser.uid), { usdt: increment(-newBid) });
    window.userData.usdt -= newBid;
    addTransaction("Ставка на аукционе", -newBid);
    window.updateUI();
    renderAuctions();
    window.notify(`✅ Ставка ${newBid} USDT!`, "success");
};

// ==================== ТОП ====================
window.switchTop = (type) => {
    document.querySelectorAll('.top-toggle-btn').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.top-list').forEach(l => l.classList.remove('active'));
    document.getElementById(`btn-${type}`).classList.add('active');
    document.getElementById(`top-${type}-list`).classList.add('active');
};

async function loadTopData() {
    const playersList = document.getElementById('top-players-list');
    playersList.innerHTML = '<p style="text-align:center; color: var(--text-secondary);">Загрузка...</p>';
    try {
        let snapshot;
        try {
            snapshot = await getDocsFromServer(query(collection(db, "users")));
        } catch (e) {
            snapshot = await getDocs(query(collection(db, "users")));
        }
        let players = [];
        snapshot.forEach(docSnap => { const d = docSnap.data(); players.push({ nick: d.nick, usdt: d.usdt }); });
        players.sort((a, b) => b.usdt - a.usdt);
        players = players.slice(0, 10);
        playersList.innerHTML = '';
        players.forEach((p, idx) => {
            const div = document.createElement('div');
            div.className = 'list-item';
            div.innerHTML = `<span>#${idx + 1} ${p.nick}</span><span style="color: var(--money-color); font-weight: 700;">${p.usdt.toFixed(2)} USDT</span>`;
            playersList.appendChild(div);
        });
    } catch (error) {
        playersList.innerHTML = `<p style="text-align:center; color: var(--error-color);">Ошибка: ${error.message}</p>`;
    }
    document.getElementById('top-clans-list').innerHTML = '<p style="text-align:center; color: var(--text-secondary);">Кланы скоро</p>';
}

// ==================== ПРОФИЛЬ ====================
async function renderProfile() {
    if (!window.userData) return;
    document.getElementById('profile-nick').textContent = window.userData.nick;
    document.getElementById('profile-level').textContent = window.userData.level;
    document.getElementById('profile-usdt').textContent = window.userData.usdt.toFixed(2);
}

window.openSettings = () => {
    const html = `
        <h3 style="margin-bottom: 20px;">⚙️ Настройки</h3>
        <div class="settings-row">
            <span class="settings-label">Вибрация:</span>
            <label style="display: flex; align-items: center; gap: 8px; cursor: pointer;">
                <input type="checkbox" id="setting-vibration" ${window.settings.vibration ? 'checked' : ''}>
                <span>Вкл</span>
            </label>
        </div>
        <div class="settings-row">
            <span class="settings-label">Подсказки:</span>
            <label style="display: flex; align-items: center; gap: 8px; cursor: pointer;">
                <input type="checkbox" id="setting-tooltips" ${window.settings.tooltips ? 'checked' : ''}>
                <span>Вкл</span>
            </label>
        </div>
        <div class="settings-row">
            <span class="settings-label">Цветов фона:</span>
            <div class="color-toggle">
                <button class="color-toggle-btn ${window.settings.bgBlobCount === 1 ? 'active' : ''}" onclick="setBlobCount(1)">1</button>
                <button class="color-toggle-btn ${window.settings.bgBlobCount === 2 ? 'active' : ''}" onclick="setBlobCount(2)">2</button>
                <button class="color-toggle-btn ${window.settings.bgBlobCount === 3 ? 'active' : ''}" onclick="setBlobCount(3)">3</button>
            </div>
        </div>
        <div class="settings-row">
            <span class="settings-label">Цвета:</span>
            <div class="color-picker-row">
                <div class="color-circle" style="background: ${window.settings.bgColor1};">
                    <input type="color" id="color1-picker" value="${window.settings.bgColor1}">
                </div>
                <div class="color-circle ${window.settings.bgBlobCount < 2 ? 'hidden' : ''}" style="background: ${window.settings.bgColor2};">
                    <input type="color" id="color2-picker" value="${window.settings.bgColor2}">
                </div>
                <div class="color-circle ${window.settings.bgBlobCount < 3 ? 'hidden' : ''}" style="background: ${window.settings.bgColor3};">
                    <input type="color" id="color3-picker" value="${window.settings.bgColor3}">
                </div>
            </div>
        </div>
        <div class="settings-row">
            <span class="settings-label">Позиция уведомлений:</span>
            <div class="color-toggle" id="notif-pos-toggle">
                <button class="color-toggle-btn ${window.settings.notifPosition === 'top-left' ? 'active' : ''}" onclick="setNotifPosition('top-left')">↖ Верх лево</button>
                <button class="color-toggle-btn ${window.settings.notifPosition === 'top-right' ? 'active' : ''}" onclick="setNotifPosition('top-right')">↗ Верх право</button>
                <button class="color-toggle-btn ${window.settings.notifPosition === 'bottom-left' ? 'active' : ''}" onclick="setNotifPosition('bottom-left')">↙ Низ лево</button>
                <button class="color-toggle-btn ${window.settings.notifPosition === 'bottom-right' ? 'active' : ''}" onclick="setNotifPosition('bottom-right')">↘ Низ право</button>
            </div>
        </div>
        <button class="btn-primary" onclick="saveSettings()">Сохранить</button>
    `;
    document.getElementById('modal-body').innerHTML = html;
    document.getElementById('modal').classList.add('active');

    document.getElementById('color1-picker').addEventListener('input', (e) => { e.target.parentElement.style.background = e.target.value; });
    document.getElementById('color2-picker').addEventListener('input', (e) => { e.target.parentElement.style.background = e.target.value; });
    document.getElementById('color3-picker').addEventListener('input', (e) => { e.target.parentElement.style.background = e.target.value; });
};

window.setBlobCount = (count) => {
    window.settings.bgBlobCount = count;
    document.querySelectorAll('.color-toggle:not(#notif-pos-toggle) .color-toggle-btn').forEach(btn => btn.classList.remove('active'));
    event.target.classList.add('active');
    const circles = document.querySelectorAll('.color-picker-row .color-circle');
    if (circles[1]) circles[1].classList.toggle('hidden', count < 2);
    if (circles[2]) circles[2].classList.toggle('hidden', count < 3);
};

window.setNotifPosition = (pos) => {
    window.settings.notifPosition = pos;
    document.querySelectorAll('#notif-pos-toggle .color-toggle-btn').forEach(btn => btn.classList.remove('active'));
    event.target.classList.add('active');
    window.notify("Пример уведомления", "info");
};

window.saveSettings = () => {
    window.settings.vibration = document.getElementById('setting-vibration').checked;
    window.settings.tooltips = document.getElementById('setting-tooltips').checked;
    window.settings.bgColor1 = document.getElementById('color1-picker').value;
    window.settings.bgColor2 = document.getElementById('color2-picker').value;
    window.settings.bgColor3 = document.getElementById('color3-picker').value;
    applyBackgroundColors();
    saveSettingsToStorage();
    window.closeModal();
    window.notify("Настройки сохранены!", "success");
};

window.openTransactionHistory = () => {
    const transactions = window.userData.transactions || [];
    let html = '<h3 style="margin-bottom: 20px;">📜 История</h3>';
    if (transactions.length === 0) html += '<p style="text-align: center; color: var(--text-secondary);">Нет транзакций</p>';
    else transactions.slice(0, 20).forEach(t => {
        const date = new Date(t.date).toLocaleString('ru-RU');
        const color = t.amount >= 0 ? 'var(--success-color)' : 'var(--error-color)';
        const sign = t.amount >= 0 ? '+' : '';
        html += `<div class="list-item" style="flex-direction: column; align-items: flex-start; margin-bottom: 8px;"><div style="font-weight: 600;">${t.desc}</div><div style="display: flex; justify-content: space-between; width: 100%; margin-top: 5px;"><small style="color: var(--text-secondary);">${date}</small><small style="color: ${color}; font-weight: 700;">${sign}${t.amount.toFixed(2)} USDT</small></div></div>`;
    });
    document.getElementById('modal-body').innerHTML = html;
    document.getElementById('modal').classList.add('active');
};

window.closeModal = () => { document.getElementById('modal').classList.remove('active'); };

// ==================== МУЗЫКА ====================
window.musicState = { ctx: null, master: null, on: false, timer: null };

const CHORDS = [
    [261.63, 329.63, 392.00, 493.88],
    [220.00, 261.63, 329.63, 392.00],
    [174.61, 220.00, 261.63, 349.23],
    [196.00, 246.94, 293.66, 392.00]
];

const MELODY = [523.25, 587.33, 659.25, 783.99, 880.00, 1046.50];

function audioInit() {
    if (window.musicState.ctx) return;
    const Ctx = window.AudioContext || window.webkitAudioContext;
    window.musicState.ctx = new Ctx();
    window.musicState.master = window.musicState.ctx.createGain();
    window.musicState.master.gain.value = 0.14;
    const filter = window.musicState.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 2200;
    window.musicState.master.connect(filter);
    filter.connect(window.musicState.ctx.destination);
}

function pad(freqs, time, dur) {
    const st = window.musicState;
    freqs.forEach(f => {
        [-3, 3].forEach(det => {
            const osc = st.ctx.createOscillator();
            const g = st.ctx.createGain();
            osc.type = 'sine';
            osc.frequency.value = f;
            osc.detune.value = det;
            g.gain.setValueAtTime(0.0001, time);
            g.gain.linearRampToValueAtTime(0.06, time + 2);
            g.gain.setValueAtTime(0.06, time + dur - 2.5);
            g.gain.linearRampToValueAtTime(0.0001, time + dur);
            osc.connect(g); g.connect(st.master);
            osc.start(time); osc.stop(time + dur + 0.1);
        });
    });
}

function pluck(freq, time) {
    const st = window.musicState;
    const osc = st.ctx.createOscillator();
    const g = st.ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.value = freq;
    g.gain.setValueAtTime(0.0001, time);
    g.gain.linearRampToValueAtTime(0.05, time + 0.04);
    g.gain.exponentialRampToValueAtTime(0.0001, time + 2.5);
    osc.connect(g); g.connect(st.master);
    osc.start(time); osc.stop(time + 2.6);
}

function scheduleMusic() {
    const st = window.musicState;
    if (!st.on) return;
    const now = st.ctx.currentTime + 0.1;
    const chordDur = 8;
    CHORDS.forEach((ch, i) => pad(ch, now + i * chordDur, chordDur + 2));
    const total = CHORDS.length * chordDur;
    for (let t = 0; t < total; t += 2) {
        if (Math.random() < 0.5) {
            pluck(MELODY[(Math.random() * MELODY.length) | 0], now + t + Math.random());
        }
    }
    st.timer = setTimeout(scheduleMusic, (total - 0.5) * 1000);
}

function applyMusic() {
    const use = document.getElementById('music-icon-use');
    if (window.settings.music) {
        audioInit();
        window.musicState.ctx.resume().then(() => {
            window.musicState.on = true;
            if (!window.musicState.timer) scheduleMusic();
        });
        if (use) use.setAttribute('href', '#i-music');
    } else {
        window.musicState.on = false;
        clearTimeout(window.musicState.timer);
        window.musicState.timer = null;
        if (window.musicState.ctx) window.musicState.ctx.suspend();
        if (use) use.setAttribute('href', '#i-mute');
    }
}

window.toggleMusic = () => {
    window.settings.music = !window.settings.music;
    applyMusic();
    saveSettingsToStorage();
    window.notify(window.settings.music ? "🎵 Музыка включена" : "🔇 Музыка выключена", "info");
};

document.addEventListener('pointerdown', () => {
    if (window.settings.music && !window.musicState.on) applyMusic();
}, { once: true });

console.log('✅ Путь к успеху загружен!');
