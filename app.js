// ==================== ПУТЬ К УСПЕХУ — ЛОКАЛЬНАЯ ВЕРСИЯ ====================

// ===== ХРАНИЛИЩЕ =====
const ACCOUNTS_KEY = 'game_accounts';
const SESSION_KEY = 'game_session';
const MARKET_KEY = 'game_market_prices';
const AUCTIONS_KEY = 'game_auctions';

window.currentUserKey = null;
window.userData = null;
window.settings = {
    vibration: true, tooltips: true, music: true,
    bgColor1: '#1a0a2e', bgColor2: '#0d1b3e', bgColor3: '#2e0a1f',
    bgBlobCount: 2, notifPosition: 'top-right'
};

window.CONFIG = {
    START_USDT: 100, START_STAMINA: 100, BASE_MAX_STAMINA: 100,
    START_POWER: 100, START_MULTIPLIER: 1.0, CLICK_REWARD: 0.00001,
    MINER_WORK_HOURS: 2, MINER_REWARD_PER_MIN: 0.00001, STAMINA_RECOVERY_SEC: 30
};

window.ANTI_CHEAT = { history: [], blocked: false };

// ===== АККАУНТЫ (localStorage) =====
function getAccounts() {
    try { return JSON.parse(localStorage.getItem(ACCOUNTS_KEY)) || {}; }
    catch (e) { return {}; }
}
function saveAccounts(accounts) {
    localStorage.setItem(ACCOUNTS_KEY, JSON.stringify(accounts));
}
function hashPassword(pass) {
    let hash = 0;
    const str = pass + '_put_k_uspehu_salt';
    for (let i = 0; i < str.length; i++) {
        hash = ((hash << 5) - hash) + str.charCodeAt(i);
        hash |= 0;
    }
    return String(hash);
}
function defaultPlayerData(nick) {
    return {
        nick,
        usdt: CONFIG.START_USDT, stamina: CONFIG.START_STAMINA,
        maxStamina: CONFIG.BASE_MAX_STAMINA, power: CONFIG.START_POWER,
        multiplier: CONFIG.START_MULTIPLIER, level: 0,
        balances: { BTC: 0, ETH: 0, LTC: 0, BNB: 0, TRX: 0, XRP: 0, GOLD: 0, SILVER: 0, PLAT: 0, DIAMOND: 0, SAPPHIRE: 0, RUBY: 0 },
        businesses: [], activeInvestments: [],
        bank: { deposit: 0, depositDate: null, loan: 0, loanDate: null },
        miner: { running: false, startTime: null, currency: 'BTC' },
        transactions: [],
        lastActiveMs: Date.now(),
        createdAt: new Date().toISOString()
    };
}
function savePlayerData() {
    if (!window.currentUserKey || !window.userData) return;
    const accounts = getAccounts();
    if (accounts[window.currentUserKey]) {
        accounts[window.currentUserKey].data = window.userData;
        saveAccounts(accounts);
    }
}

// ===== НАСТРОЙКИ =====
function applyBackgroundColors() {
    document.documentElement.style.setProperty('--bg-color-1', window.settings.bgColor1);
    document.documentElement.style.setProperty('--bg-color-2', window.settings.bgColor2);
    document.documentElement.style.setProperty('--bg-color-3', window.settings.bgColor3);
    const blob2 = document.querySelector('.blob-2');
    const blob3 = document.querySelector('.blob-3');
    if (blob2) blob2.style.display = window.settings.bgBlobCount >= 2 ? 'block' : 'none';
    if (blob3) blob3.style.display = window.settings.bgBlobCount >= 3 ? 'block' : 'none';
}
function saveSettingsToStorage() { localStorage.setItem('gameSettings', JSON.stringify(window.settings)); }
function loadSettings() {
    const saved = localStorage.getItem('gameSettings');
    if (saved) { window.settings = { ...window.settings, ...JSON.parse(saved) }; applyBackgroundColors(); }
}
loadSettings();

// ===== НАВИГАЦИЯ =====
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
            auction: 'Аукционы', profile: 'Профиль'
        };
        pageTitle.innerHTML = `<span class="title-oval">${titles[pageName] || pageName}</span>`;
    }
    if (pageName === 'market') renderMarket();
    if (pageName === 'invest') renderInvestments();
    if (pageName === 'business') renderBusinesses();
    if (pageName === 'bank') renderBank();
    if (pageName === 'profile') renderProfile();
    if (pageName === 'auction') renderAuctions();
    if (pageName === 'clicker') updateClickerStats();
};
window.goHome = () => window.navigateTo('home');

// ===== АВТОРИЗАЦИЯ =====
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
function showError(msg) { document.getElementById('auth-error').textContent = msg; }

window.togglePassword = (inputId, btn) => {
    const input = document.getElementById(inputId);
    if (input.type === 'password') { input.type = 'text'; btn.textContent = '🙈'; }
    else { input.type = 'password'; btn.textContent = '👁'; }
};

window.register = () => {
    const nick = document.getElementById('reg-nick').value.trim();
    const pass = document.getElementById('reg-password').value;
    const passConf = document.getElementById('reg-password-confirm').value;
    showError('');
    if (!nick || nick.length < 2 || nick.length > 20) return showError("Ник от 2 до 20 символов");
    if (pass.length < 4) return showError("Пароль минимум 4 символа");
    if (pass !== passConf) return showError("Пароли не совпадают");
    const accounts = getAccounts();
    const key = nick.toLowerCase();
    if (accounts[key]) return showError("Этот ник уже занят");
    accounts[key] = { password: hashPassword(pass), data: defaultPlayerData(nick) };
    saveAccounts(accounts);
    startSession(key);
};

window.login = () => {
    const nick = document.getElementById('login-nick').value.trim();
    const pass = document.getElementById('login-password').value;
    showError('');
    if (!nick || !pass) return showError("Заполните все поля");
    const accounts = getAccounts();
    const key = nick.toLowerCase();
    const acc = accounts[key];
    if (!acc) return showError("Игрок с таким ником не найден");
    if (acc.password !== hashPassword(pass)) return showError("Неверный пароль");
    startSession(key);
};

function startSession(key) {
    localStorage.setItem(SESSION_KEY, key);
    enterGame();
}

function enterGame() {
    const key = localStorage.getItem(SESSION_KEY);
    const accounts = getAccounts();
    if (!key || !accounts[key]) return false;
    window.currentUserKey = key;
    window.userData = accounts[key].data;
    recoverStamina();
    document.getElementById('auth-screen').style.display = 'none';
    document.getElementById('game-screen').style.display = 'flex';
    updateUI();
    checkOfflineMiner();
    if (window.settings.music) applyMusic();
    showDiscordNotification("С возвращением!", `${window.userData.nick}, рады видеть вас снова!`, "👋");
    return true;
}

window.logout = () => {
    savePlayerData();
    localStorage.removeItem(SESSION_KEY);
    window.currentUserKey = null;
    window.userData = null;
    document.getElementById('game-screen').style.display = 'none';
    document.getElementById('auth-screen').style.display = 'flex';
    document.getElementById('login-nick').value = '';
    document.getElementById('login-password').value = '';
    showLogin();
};

// Автосохранение
setInterval(savePlayerData, 5000);
document.addEventListener('visibilitychange', () => { if (document.hidden) savePlayerData(); });
window.addEventListener('beforeunload', savePlayerData);

// ===== СТАМИНА =====
function recoverStamina() {
    const p = window.userData;
    if (!p) return;
    const now = Date.now();
    const last = p.lastActiveMs || now;
    const deltaSec = (now - last) / 1000;
    if (deltaSec > 0 && p.stamina < p.maxStamina) {
        p.stamina = Math.min(p.maxStamina, p.stamina + deltaSec / CONFIG.STAMINA_RECOVERY_SEC);
    }
    p.lastActiveMs = now;
}

// ===== UI =====
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

// ===== АНТИ-ЧИТ =====
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

// ===== КЛИКЕР =====
function updateClickerStats() {
    if (!window.userData) return;
    document.getElementById('click-power').textContent = window.userData.power;
    document.getElementById('click-mult').textContent = window.userData.multiplier.toFixed(1);
    document.getElementById('clicker-stamina').textContent = `${Math.floor(window.userData.stamina)}/${window.userData.maxStamina}`;
}

document.addEventListener('DOMContentLoaded', () => {
    const clickBtn = document.getElementById('click-btn');
    if (clickBtn) {
        const handleClick = (e) => {
            if (!window.userData) return;
            recoverStamina();
            if (window.userData.stamina < 1) { window.notify("Нет стамины!", "error"); updateClickerStats(); return; }
            const rect = clickBtn.getBoundingClientRect();
            const x = e.clientX || (e.touches ? e.touches[0].clientX : rect.left + rect.width / 2);
            const y = e.clientY || (e.touches ? e.touches[0].clientY : rect.top + rect.height / 2);
            if (!window.validateClick(x, y)) return;
            const reward = window.userData.power * window.userData.multiplier * CONFIG.CLICK_REWARD;
            window.userData.stamina -= 1;
            window.userData.usdt += reward;
            window.userData.lastActiveMs = Date.now();
            updateUI();
            updateClickerStats();
            const effect = document.createElement('div');
            effect.className = 'click-effect';
            effect.textContent = `+${reward.toFixed(6)}`;
            effect.style.left = `${x}px`;
            effect.style.top = `${y}px`;
            document.body.appendChild(effect);
            setTimeout(() => effect.remove(), 1000);
            savePlayerData();
        };
        clickBtn.addEventListener('mousedown', handleClick);
        clickBtn.addEventListener('touchstart', (e) => { e.preventDefault(); handleClick(e); }, { passive: false });
    }

    // МАЙНЕР кнопка
    const minerBtn = document.getElementById('miner-toggle-btn');
    if (minerBtn) minerBtn.addEventListener('click', () => {
        if (!window.userData) return;
        const m = window.userData.miner;
        if (m.running) {
            // Остановка с начислением за отработанное время
            const start = new Date(m.startTime).getTime();
            const minutes = Math.floor((Date.now() - start) / 60000);
            const reward = minutes * CONFIG.MINER_REWARD_PER_MIN * window.userData.multiplier;
            if (reward > 0) {
                window.userData.balances[m.currency] = (window.userData.balances[m.currency] || 0) + reward;
                addTransaction(`Майнер: +${reward.toFixed(6)} ${m.currency}`, 0);
                window.notify(`⛏ +${reward.toFixed(6)} ${m.currency}`, "success");
            }
            m.running = false;
            m.startTime = null;
            document.getElementById('miner-progress').style.width = '0%';
            document.getElementById('miner-time-left').textContent = '0 мин';
            document.getElementById('miner-status').textContent = '🔴 Остановлен';
            minerBtn.textContent = '▶️ Запустить';
        } else {
            m.running = true;
            m.startTime = new Date().toISOString();
            m.currency = document.getElementById('miner-currency').value;
            document.getElementById('miner-status').textContent = '🟢 Работает';
            minerBtn.textContent = '⏹ Остановить';
            window.notify("Майнер запущен!", "success");
        }
        savePlayerData();
    });

    // Кнопка создания бизнеса
    const bizBtn = document.getElementById('create-business-btn');
    if (bizBtn) bizBtn.addEventListener('click', () => {
        if ((window.userData.businesses || []).length >= 2) return window.notify("Максимум 2 бизнеса", "error");
        let html = '<h3 style="margin-bottom: 15px;">Создать бизнес</h3>';
        BUSINESS_TYPES.forEach(s => {
            html += `<div class="list-item" onclick="createBiz('${s.id}')" style="cursor:pointer; margin:8px 0;"><b>${s.icon} ${s.name}</b><br><small>Цена: ${s.cost} | Доход: ${s.income}/день</small></div>`;
        });
        document.getElementById('modal-body').innerHTML = html;
        document.getElementById('modal').classList.add('active');
    });

    // Живой таймер майнера
    setInterval(() => {
        if (!window.userData) return;
        const m = window.userData.miner;
        if (m && m.running && m.startTime) {
            const elapsed = (Date.now() - new Date(m.startTime).getTime()) / 1000;
            const maxSec = CONFIG.MINER_WORK_HOURS * 3600;
            if (elapsed >= maxSec) {
                const reward = (maxSec / 60) * CONFIG.MINER_REWARD_PER_MIN * window.userData.multiplier;
                window.userData.balances[m.currency] = (window.userData.balances[m.currency] || 0) + reward;
                addTransaction(`Майнер: +${reward.toFixed(6)} ${m.currency}`, 0);
                m.running = false;
                m.startTime = null;
                savePlayerData();
                showDiscordNotification("Майнер завершил!", `+${reward.toFixed(6)} ${m.currency}`, "⛏");
                document.getElementById('miner-status').textContent = '🔴 Остановлен';
                document.getElementById('miner-toggle-btn').textContent = '▶️ Запустить';
                document.getElementById('miner-progress').style.width = '100%';
            } else {
                document.getElementById('miner-progress').style.width = `${(elapsed / maxSec) * 100}%`;
                document.getElementById('miner-time-left').textContent = `${Math.ceil((maxSec - elapsed) / 60)} мин`;
            }
        }
    }, 1000);
});

function checkOfflineMiner() {
    const m = window.userData.miner;
    if (!m || !m.running || !m.startTime) return;
    const elapsed = (Date.now() - new Date(m.startTime).getTime()) / 1000;
    const maxSec = CONFIG.MINER_WORK_HOURS * 3600;
    if (elapsed >= maxSec) {
        const reward = (maxSec / 60) * CONFIG.MINER_REWARD_PER_MIN * window.userData.multiplier;
        window.userData.balances[m.currency] = (window.userData.balances[m.currency] || 0) + reward;
        addTransaction(`Майнер: +${reward.toFixed(6)} ${m.currency}`, 0);
        m.running = false;
        m.startTime = null;
        savePlayerData();
        showDiscordNotification("Майнер завершил!", `+${reward.toFixed(6)} ${m.currency}`, "⛏");
    } else {
        document.getElementById('miner-progress').style.width = `${(elapsed / maxSec) * 100}%`;
        document.getElementById('miner-time-left').textContent = `${Math.ceil((maxSec - elapsed) / 60)} мин`;
        document.getElementById('miner-status').textContent = '🟢 Работает';
        document.getElementById('miner-toggle-btn').textContent = '⏹ Остановить';
    }
}

// ===== ТРАНЗАКЦИИ =====
function addTransaction(desc, amount) {
    if (!window.userData.transactions) window.userData.transactions = [];
    window.userData.transactions.unshift({ desc, amount, date: new Date().toISOString() });
    if (window.userData.transactions.length > 50) window.userData.transactions.pop();
}

// ===== РЫНОК (localStorage) =====
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

function getMarketData() {
    try {
        const d = JSON.parse(localStorage.getItem(MARKET_KEY));
        if (d) return d;
    } catch (e) {}
    const init = {};
    ASSETS.forEach(a => { init[a.id] = { price: a.minPrice, prevPrice: a.minPrice }; });
    localStorage.setItem(MARKET_KEY, JSON.stringify(init));
    return init;
}
function saveMarketData(d) { localStorage.setItem(MARKET_KEY, JSON.stringify(d)); }

window.filterMarket = (filter) => {
    currentMarketFilter = filter;
    document.querySelectorAll('.filter-btn').forEach(btn => btn.classList.remove('active'));
    event.target.classList.add('active');
    renderMarket();
};

function renderMarket() {
    const list = document.getElementById('market-list');
    const marketData = getMarketData();
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
}

window.tradeAsset = (assetId, action, currentPrice) => {
    const amountStr = prompt(`Количество ${assetId} для ${action === 'buy' ? 'покупки' : 'продажи'}:`);
    if (!amountStr) return;
    const amount = parseFloat(amountStr.replace(',', '.'));
    if (isNaN(amount) || amount <= 0) return window.notify("Неверное количество", "error");
    const totalCost = amount * currentPrice;
    const marketData = getMarketData();
    if (action === 'buy') {
        if (window.userData.usdt < totalCost) return window.notify("Недостаточно USDT", "error");
        window.userData.usdt -= totalCost;
        window.userData.balances[assetId] = (window.userData.balances[assetId] || 0) + amount;
        // Покупка двигает цену вверх
        marketData[assetId] = { price: Math.max(ASSETS.find(a=>a.id===assetId).minPrice, currentPrice * 1.02), prevPrice: currentPrice };
        addTransaction(`Покупка ${amount} ${assetId}`, -totalCost);
        window.notify(`✅ Куплено ${amount} ${assetId}`, "success");
    } else {
        const currentBal = window.userData.balances?.[assetId] || 0;
        if (currentBal < amount) return window.notify(`Недостаточно ${assetId}`, "error");
        window.userData.usdt += totalCost;
        window.userData.balances[assetId] -= amount;
        // Продажа двигает цену вниз
        marketData[assetId] = { price: Math.max(ASSETS.find(a=>a.id===assetId).minPrice, currentPrice * 0.98), prevPrice: currentPrice };
        addTransaction(`Продажа ${amount} ${assetId}`, totalCost);
        window.notify(`✅ Продано ${amount} ${assetId}`, "success");
    }
    saveMarketData(marketData);
    savePlayerData();
    updateUI();
    renderMarket();
};

// ===== ИНВЕСТИЦИИ =====
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

function renderInvestments() {
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

window.makeInvestment = (id, chance, profit, maxBet) => {
    const input = document.getElementById(`inv-amount-${id}`);
    const amount = parseFloat(input.value.replace(',', '.'));
    if (!amount || amount < 500 || amount > maxBet) return window.notify(`Сумма от 500 до ${maxBet}`, "error");
    if (window.userData.usdt < amount) return window.notify("Недостаточно USDT", "error");
    const newInv = { id, name: ENTERPRISES.find(e => e.id === id).name, amount, chance, profit, startTime: new Date().toISOString() };
    window.userData.activeInvestments = [...(window.userData.activeInvestments || []), newInv];
    window.userData.usdt -= amount;
    addTransaction(`Инвестиция в ${newInv.name}`, -amount);
    savePlayerData();
    updateUI();
    renderInvestments();
    window.notify("Инвестиция размещена!", "success");
};

window.resolveInvestment = (index) => {
    const actives = window.userData.activeInvestments;
    const inv = actives[index];
    const isWin = Math.random() * 100 < inv.chance;
    if (isWin) {
        const total = inv.amount * (1 + inv.profit / 100);
        window.userData.usdt += total;
        addTransaction(`Прибыль от ${inv.name}`, total);
        showDiscordNotification("Инвестиция успешна!", `+${total.toFixed(2)} USDT`, "💰");
    } else {
        addTransaction(`Убыток от ${inv.name}`, -inv.amount);
        showDiscordNotification("Инвестиция провалилась", `-${inv.amount.toFixed(2)} USDT`, "📉");
    }
    window.userData.activeInvestments = actives.filter((_, i) => i !== index);
    savePlayerData();
    updateUI();
    renderInvestments();
};

// ===== БИЗНЕСЫ =====
const BUSINESS_TYPES = [
    { id: 'it', name: 'IT-стартап', icon: '💻', cost: 2000, income: 100 },
    { id: 'restaurant', name: 'Ресторан', icon: '🍽️', cost: 3000, income: 150 },
    { id: 'auto', name: 'Автосервис', icon: '🔧', cost: 2500, income: 120 },
    { id: 'fitness', name: 'Фитнес-клуб', icon: '💪', cost: 4000, income: 200 },
    { id: 'beauty', name: 'Салон красоты', icon: '💇', cost: 3500, income: 180 }
];

function renderBusinesses() {
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

window.createBiz = (typeId) => {
    const name = prompt("Название бизнеса:");
    if (!name) return;
    const bizType = BUSINESS_TYPES.find(t => t.id === typeId);
    if (window.userData.usdt < bizType.cost) return window.notify("Недостаточно средств", "error");
    const newBiz = { type: typeId, name, level: 1, totalInvested: bizType.cost, isBroken: false };
    window.userData.businesses = [...(window.userData.businesses || []), newBiz];
    window.userData.usdt -= bizType.cost;
    addTransaction(`Бизнес "${name}"`, -bizType.cost);
    closeModal();
    savePlayerData();
    updateUI();
    renderBusinesses();
    window.notify("Бизнес создан!", "success");
};

window.repairBusiness = (index) => {
    if (window.userData.usdt < 600) return window.notify("Нужно 600 USDT", "error");
    window.userData.businesses[index].isBroken = false;
    window.userData.usdt -= 600;
    addTransaction("Ремонт бизнеса", -600);
    savePlayerData();
    updateUI();
    renderBusinesses();
    window.notify("Отремонтирован!", "success");
};

window.sellBusiness = (index) => {
    const refund = window.userData.businesses[index].totalInvested * 0.4;
    window.userData.businesses.splice(index, 1);
    window.userData.usdt += refund;
    addTransaction("Продажа бизнеса", refund);
    savePlayerData();
    updateUI();
    renderBusinesses();
    window.notify(`Продан за ${refund.toFixed(2)} USDT`, "success");
};

// ===== БАНК =====
function renderBank() {
    const bankData = window.userData.bank || { deposit: 0, loan: 0 };
    document.getElementById('bank-deposit').textContent = bankData.deposit.toFixed(2) + ' USDT';
    document.getElementById('bank-loan').textContent = bankData.loan.toFixed(2) + ' USDT';
}

window.bankAction = (action) => {
    const bankData = window.userData.bank || { deposit: 0, depositDate: null, loan: 0, loanDate: null };
    const now = Date.now();
    if (action === 'deposit') {
        if (window.userData.usdt < 100) return window.notify("Минимум 100 USDT", "error");
        window.userData.usdt -= 100;
        window.userData.bank = { ...bankData, deposit: bankData.deposit + 100, depositDate: now };
        addTransaction("Вклад", -100);
        window.notify("✅ Вложено 100 USDT!", "success");
    } else if (action === 'withdraw') {
        if (bankData.deposit <= 0) return window.notify("Нет депозита", "error");
        const days = (now - bankData.depositDate) / 86400000;
        if (days < 7) return window.notify(`Мин. 7 дней. Осталось: ${Math.ceil(7 - days)}`, "error");
        const total = bankData.deposit * Math.pow(1.02, days);
        window.userData.usdt += total;
        window.userData.bank = { ...bankData, deposit: 0, depositDate: null };
        addTransaction("Снятие вклада", total);
        window.notify(`✅ +${total.toFixed(2)} USDT`, "success");
    } else if (action === 'loan') {
        if (bankData.loan > 0) return window.notify("Сначала погасите кредит", "error");
        window.userData.usdt += 1000;
        window.userData.bank = { ...bankData, loan: 1000, loanDate: now };
        addTransaction("Кредит", 1000);
        window.notify("✅ Кредит получен!", "success");
    } else if (action === 'payLoan') {
        if (bankData.loan <= 0) return window.notify("Нет кредита", "error");
        const days = (now - bankData.loanDate) / 86400000;
        const debt = bankData.loan * Math.pow(1.05, days);
        if (window.userData.usdt < debt) return window.notify(`Нужно ${debt.toFixed(2)} USDT`, "error");
        window.userData.usdt -= debt;
        window.userData.bank = { ...bankData, loan: 0, loanDate: null };
        addTransaction("Погашение кредита", -debt);
        window.notify(`✅ Погашено ${debt.toFixed(2)} USDT`, "success");
    }
    savePlayerData();
    updateUI();
    renderBank();
};

// ===== АУКЦИОНЫ (localStorage) =====
function getAuctions() {
    try { return JSON.parse(localStorage.getItem(AUCTIONS_KEY)) || []; } catch (e) { return []; }
}
function saveAuctions(list) { localStorage.setItem(AUCTIONS_KEY, JSON.stringify(list)); }

function checkAuctions() {
    const list = getAuctions();
    let changed = false;
    const now = Date.now();
    list.forEach(a => {
        if (a.status === 'active' && a.endTime <= now) {
            a.status = 'ended';
            changed = true;
            if (a.highestBidderKey) {
                const accounts = getAccounts();
                const acc = accounts[a.highestBidderKey];
                if (acc) {
                    const contents = a.currentBid * (0.8 + Math.random() * 0.7);
                    acc.data.usdt += contents;
                    if (!acc.data.transactions) acc.data.transactions = [];
                    acc.data.transactions.unshift({ desc: 'Выигрыш аукциона', amount: contents, date: new Date().toISOString() });
                    saveAccounts(accounts);
                    if (a.highestBidderKey === window.currentUserKey) {
                        window.userData = acc.data;
                        showDiscordNotification("Аукцион завершён!", `В кошельке ${contents.toFixed(2)} USDT`, "🔨");
                    }
                }
            }
        }
    });
    if (changed) saveAuctions(list);
}

function renderAuctions() {
    checkAuctions();
    let auctions = getAuctions();
    let active = auctions.filter(a => a.status === 'active');
    if (active.length === 0) {
        auctions.push({
            id: 'a' + Date.now(),
            currentBid: 100,
            highestBidderKey: null,
            highestBidderNick: null,
            endTime: Date.now() + 2 * 60 * 60 * 1000,
            status: 'active'
        });
        saveAuctions(auctions);
        active = auctions.filter(a => a.status === 'active');
    }
    const list = document.getElementById('auction-list');
    list.innerHTML = '';
    active.forEach(a => {
        const hoursLeft = Math.max(0, Math.ceil((a.endTime - Date.now()) / 3600000));
        const div = document.createElement('div');
        div.className = 'list-item';
        div.style.flexDirection = 'column';
        div.style.alignItems = 'flex-start';
        div.innerHTML = `<strong>🔒 Кошелёк #${a.id.substr(-6)}</strong><small>Ставка: <b>${a.currentBid.toFixed(2)} USDT</b></small><small>Лидер: ${a.highestBidderNick || 'Нет'}</small><small style="color: var(--error-color);">⏳ ${hoursLeft} ч.</small><small style="color: var(--text-secondary); font-size: 11px;">⚠️ Ставка невозвратна!</small><div style="display:flex; gap:10px; margin-top:10px; width:100%;"><input type="number" id="bid-input-${a.id}" placeholder="Ставка" style="flex:1;"><button class="btn-primary" style="width:auto;" onclick="placeBid('${a.id}', ${a.currentBid})">Ставка</button></div>`;
        list.appendChild(div);
    });
}

window.placeBid = (auctionId, currentBid) => {
    const input = document.getElementById(`bid-input-${auctionId}`);
    const newBid = parseFloat(input.value.replace(',', '.'));
    if (isNaN(newBid) || newBid <= currentBid) return window.notify(`Ставка выше ${currentBid}`, "error");
    if (window.userData.usdt < newBid) return window.notify("Недостаточно USDT", "error");
    const auctions = getAuctions();
    const a = auctions.find(x => x.id === auctionId);
    if (!a || a.status !== 'active') return window.notify("Аукцион завершён", "error");
    a.currentBid = newBid;
    a.highestBidderKey = window.currentUserKey;
    a.highestBidderNick = window.userData.nick;
    a.endTime = Date.now() + 60 * 60 * 1000;
    saveAuctions(auctions);
    window.userData.usdt -= newBid;
    addTransaction("Ставка на аукционе", -newBid);
    savePlayerData();
    updateUI();
    renderAuctions();
    window.notify(`✅ Ставка ${newBid} USDT!`, "success");
};

// ===== ПРОФИЛЬ / НАСТРОЙКИ =====
function renderProfile() {
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
                <button class="color-toggle-btn ${window.settings.notifPosition === 'top-left' ? 'active' : ''}" onclick="setNotifPosition('top-left')">↖</button>
                <button class="color-toggle-btn ${window.settings.notifPosition === 'top-right' ? 'active' : ''}" onclick="setNotifPosition('top-right')">↗</button>
                <button class="color-toggle-btn ${window.settings.notifPosition === 'bottom-left' ? 'active' : ''}" onclick="setNotifPosition('bottom-left')">↙</button>
                <button class="color-toggle-btn ${window.settings.notifPosition === 'bottom-right' ? 'active' : ''}" onclick="setNotifPosition('bottom-right')">↘</button>
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
    window.settings.bgColor1 = document.getElementById('color1-picker').value;
    window.settings.bgColor2 = document.getElementById('color2-picker').value;
    window.settings.bgColor3 = document.getElementById('color3-picker').value;
    applyBackgroundColors();
    saveSettingsToStorage();
    closeModal();
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

// ===== МУЗЫКА =====
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

// ===== СТАРТ =====
// Если есть сохранённая сессия — входим сразу, без ввода пароля
if (!enterGame()) {
    // сессии нет — показываем экран входа (он виден по умолчанию)
}

console.log('✅ Путь к успеху (локальная версия) загружен!');
