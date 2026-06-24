// ============================================================
// RENDERER.JS — ИСПРАВЛЕННЫЙ (кнопки управления работают)
// ============================================================

console.log('[API Tester] Renderer started');

// ============================================================
// СОСТОЯНИЕ
// ============================================================

let state = {
    isPlaying: false,
    accentColor: '#1DB954',
    track: '—',
    artist: '—',
    artwork: null,
    volume: 50
};

// ============================================================
// DOM
// ============================================================

const el = {
    trackName: document.getElementById('trackName'),
    trackArtist: document.getElementById('trackArtist'),
    statusText: document.getElementById('statusText'),
    statusDot: document.getElementById('statusDot'),
    artwork: document.getElementById('artwork'),
    artworkPlaceholder: document.getElementById('artworkPlaceholder'),
    playBtn: document.getElementById('playBtn'),
    prevBtn: document.getElementById('prevBtn'),
    nextBtn: document.getElementById('nextBtn'),
    stopBtn: document.getElementById('stopBtn'),
    volumeSlider: document.getElementById('volumeSlider'),
    volumeDisplay: document.getElementById('volumeDisplay'),
    testStatusBtn: document.getElementById('testStatusBtn'),
    testMediaBtn: document.getElementById('testMediaBtn'),
    testArtworkBtn: document.getElementById('testArtworkBtn'),
    testColorBtn: document.getElementById('testColorBtn'),
    testAllBtn: document.getElementById('testAllBtn'),
    logArea: document.getElementById('logArea'),
    clearLogBtn: document.getElementById('clearLogBtn'),
    exportLogBtn: document.getElementById('exportLogBtn')
};

// ============================================================
// ЛОГГЕР
// ============================================================

function log(message, type = 'info') {
    const entry = document.createElement('div');
    entry.className = `log-entry ${type}`;
    const time = new Date().toLocaleTimeString();
    entry.innerHTML = `<span class="time">[${time}]</span> ${message}`;
    el.logArea.prepend(entry);
    while (el.logArea.children.length > 100) {
        el.logArea.removeChild(el.logArea.lastChild);
    }
}

function logSuccess(msg) { log(`✅ ${msg}`, 'success'); }
function logError(msg) { log(`❌ ${msg}`, 'error'); }
function logWarn(msg) { log(`⚠️ ${msg}`, 'warning'); }
function logInfo(msg) { log(`ℹ️ ${msg}`, 'info'); }

// ============================================================
// ПРИМЕНЕНИЕ АКЦЕНТНОГО ЦВЕТА
// ============================================================

function applyAccentColor(color) {
    if (!color) return;
    state.accentColor = color;
    document.documentElement.style.setProperty('--accent', color);
    el.playBtn.style.background = color;
}

// ============================================================
// ОБНОВЛЕНИЕ UI
// ============================================================

function updateUI(status) {
    if (!status) return;
    
    if (status.track !== undefined) {
        state.track = status.track || '—';
        el.trackName.textContent = state.track;
    }
    if (status.artist !== undefined) {
        state.artist = status.artist || '—';
        el.trackArtist.textContent = state.artist;
    }
    
    if (status.isPlaying !== undefined) {
        state.isPlaying = status.isPlaying;
        if (state.isPlaying) {
            el.statusText.textContent = '▶ Играет';
            el.statusDot.className = 'dot playing';
            el.playBtn.textContent = '⏸';
        } else {
            el.statusText.textContent = '⏸ Пауза';
            el.statusDot.className = 'dot paused';
            el.playBtn.textContent = '▶';
        }
    }
    
    if (status.accentColor) {
        applyAccentColor(status.accentColor);
    }
    
    if (status.artwork) {
        el.artwork.src = status.artwork;
        el.artwork.style.display = 'block';
        el.artworkPlaceholder.style.display = 'none';
        state.artwork = status.artwork;
    }
}

// ============================================================
// ПОДПИСКА НА СТАТУС (через window.parent.electronAPI)
// ============================================================

function listenToStatus() {
    try {
        const api = window.parent && window.parent.electronAPI;
        
        if (api) {
            if (api.onPluginStatus) {
                api.onPluginStatus((event, status) => {
                    logInfo(`Статус: "${status.track || '—'}" — ${status.artist || '—'}`);
                    updateUI(status);
                });
            }
            
            if (api.getPluginStatus) {
                api.getPluginStatus().then(status => {
                    if (status) {
                        logInfo(`Начальный статус: "${status.track || '—'}"`);
                        updateUI(status);
                    }
                }).catch(() => {});
            }
            
            logSuccess('✅ Подключен к статусу MusicHub');
        } else {
            logWarn('⚠️ electronAPI не доступен');
        }
    } catch (e) {
        logError(`Ошибка подключения: ${e.message}`);
    }
}

// ============================================================
// ПОЛУЧЕНИЕ ОБЛОЖКИ
// ============================================================

const ARTWORK_URL = 'http://127.0.0.1:3456/artwork';

async function updateArtwork() {
    try {
        const response = await fetch(ARTWORK_URL);
        if (response.ok) {
            const blob = await response.blob();
            const url = URL.createObjectURL(blob);
            el.artwork.src = url;
            el.artwork.style.display = 'block';
            el.artworkPlaceholder.style.display = 'none';
            state.artwork = url;
            return url;
        }
    } catch (e) {}
    return null;
}

// ============================================================
// ⭐ УПРАВЛЕНИЕ — ИСПРАВЛЕНО! Используем electronAPI
// ============================================================

function getApi() {
    return window.parent && window.parent.electronAPI;
}

async function sendCommand(action) {
    const api = getApi();
    
    // Карта команд для electronAPI
    const commandMap = {
        'playPause': 'mediaPlayPause',
        'next': 'mediaNext',
        'prev': 'mediaPrevious',
        'stop': 'mediaStop'
    };
    
    const methodName = commandMap[action];
    
    try {
        // 1. Пытаемся через electronAPI (как в реальных плагинах)
        if (api && api[methodName]) {
            const result = await api[methodName]();
            if (result !== false) {
                logSuccess(`Команда ${action} отправлена через electronAPI`);
                return true;
            }
        }
        
        // 2. Fallback: через fetch на порт 9876
        const endpoints = {
            playPause: '/playpause',
            next: '/next',
            prev: '/prev',
            stop: '/stop'
        };
        
        const endpoint = endpoints[action];
        if (endpoint) {
            await fetch(`http://localhost:9876${endpoint}`, { method: 'POST' });
            logSuccess(`Команда ${action} отправлена через fetch`);
            return true;
        }
        
        logError(`Команда ${action} не найдена`);
        return false;
    } catch (e) {
        logError(`Ошибка ${action}: ${e.message}`);
        return false;
    }
}

async function setVolume(percent) {
    const vol = Math.min(100, Math.max(0, percent));
    state.volume = vol;
    el.volumeDisplay.textContent = vol + '%';
    
    const api = getApi();
    
    try {
        // 1. Пытаемся через electronAPI
        if (api && api.setMusicHubVolume) {
            await api.setMusicHubVolume(vol / 100);
            logSuccess(`Громкость: ${vol}% (через electronAPI)`);
            return true;
        }
        
        // 2. Fallback: через fetch
        await fetch('http://localhost:9876/set-volume', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ volume: vol / 100 })
        });
        logSuccess(`Громкость: ${vol}% (через fetch)`);
        return true;
    } catch (e) {
        logError(`Ошибка громкости: ${e.message}`);
        return false;
    }
}

// ============================================================
// ТЕСТЫ API
// ============================================================

async function testGetStatus() {
    logInfo('📊 Запрос статуса через getPluginStatus()...');
    try {
        const api = getApi();
        if (api && api.getPluginStatus) {
            const status = await api.getPluginStatus();
            logSuccess(`Статус: "${status.track}" — ${status.artist} (${status.isPaused ? 'пауза' : 'играет'})`);
            updateUI(status);
        } else {
            logError('getPluginStatus не доступен');
        }
    } catch (e) {
        logError(`Ошибка: ${e.message}`);
    }
}

async function testGetMedia() {
    logInfo('💾 Запрос медиа через getMediaFromFiles()...');
    try {
        const api = getApi();
        if (api && api.getMediaFromFiles) {
            const media = await api.getMediaFromFiles();
            logSuccess(`Медиа: "${media.title}" — ${media.artist}`);
            if (media.artwork_base64) {
                const url = `data:image/jpeg;base64,${media.artwork_base64}`;
                el.artwork.src = url;
                el.artwork.style.display = 'block';
                el.artworkPlaceholder.style.display = 'none';
                state.artwork = url;
                logSuccess('Обложка загружена из медиа');
            }
            el.trackName.textContent = media.title || '—';
            el.trackArtist.textContent = media.artist || '—';
        } else {
            logError('getMediaFromFiles не доступен');
        }
    } catch (e) {
        logError(`Ошибка: ${e.message}`);
    }
}

async function testGetArtwork() {
    logInfo('🖼️ Запрос обложки через локальный сервер...');
    try {
        const url = await updateArtwork();
        if (url) {
            logSuccess('Обложка загружена с сервера');
        } else {
            logWarn('Обложка не найдена');
        }
    } catch (e) {
        logError(`Ошибка: ${e.message}`);
    }
}

async function testGetColor() {
    logInfo('🎨 Получение акцентного цвета...');
    try {
        const api = getApi();
        if (api && api.getPluginStatus) {
            const status = await api.getPluginStatus();
            const color = status.accentColor || '#1DB954';
            logSuccess(`Акцентный цвет: ${color}`);
            applyAccentColor(color);
        } else {
            logError('Не удалось получить цвет');
        }
    } catch (e) {
        logError(`Ошибка: ${e.message}`);
    }
}

async function testAll() {
    logInfo('🚀 Запуск всех тестов...');
    await testGetStatus();
    await testGetMedia();
    await testGetArtwork();
    await testGetColor();
    logSuccess('✅ Все тесты завершены');
}

// ============================================================
// ОБРАБОТЧИКИ КНОПОК — ИСПРАВЛЕНЫ
// ============================================================

el.playBtn.addEventListener('click', () => {
    logInfo('▶️ Нажата кнопка Play/Pause');
    sendCommand('playPause');
});

el.nextBtn.addEventListener('click', () => {
    logInfo('⏭ Нажата кнопка Next');
    sendCommand('next');
});

el.prevBtn.addEventListener('click', () => {
    logInfo('⏮ Нажата кнопка Prev');
    sendCommand('prev');
});

el.stopBtn.addEventListener('click', () => {
    logInfo('⏹ Нажата кнопка Stop');
    sendCommand('stop');
});

el.volumeSlider.addEventListener('input', (e) => {
    const val = parseInt(e.target.value);
    el.volumeDisplay.textContent = val + '%';
    setVolume(val);
});

el.testStatusBtn.addEventListener('click', testGetStatus);
el.testMediaBtn.addEventListener('click', testGetMedia);
el.testArtworkBtn.addEventListener('click', testGetArtwork);
el.testColorBtn.addEventListener('click', testGetColor);
el.testAllBtn.addEventListener('click', testAll);

el.clearLogBtn.addEventListener('click', () => {
    el.logArea.innerHTML = '';
    logInfo('🧹 Лог очищен');
});

el.exportLogBtn.addEventListener('click', () => {
    const logs = Array.from(el.logArea.querySelectorAll('.log-entry'))
        .map(entry => entry.textContent)
        .join('\n');
    const blob = new Blob([logs], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `api-tester-log-${new Date().toISOString().slice(0,10)}.txt`;
    a.click();
    URL.revokeObjectURL(url);
    logSuccess('Лог экспортирован');
});

// ============================================================
// АВТО-ОБНОВЛЕНИЕ ОБЛОЖКИ
// ============================================================

setInterval(() => {
    if (!state.artwork) {
        updateArtwork();
    }
}, 5000);

// ============================================================
// ИНИЦИАЛИЗАЦИЯ
// ============================================================

logInfo('🚀 API Tester загружен');

setTimeout(listenToStatus, 500);

setTimeout(() => {
    updateArtwork().then(url => {
        if (url) logSuccess('Обложка загружена');
    });
}, 1000);

// ============================================================
// ЭКСПОРТ ДЛЯ КОНСОЛИ
// ============================================================

window.__apiTester = {
    state,
    updateUI,
    applyAccentColor,
    testGetStatus,
    testGetMedia,
    testGetArtwork,
    testGetColor,
    testAll,
    sendCommand,
    setVolume,
    log,
    logSuccess,
    logError,
    logWarn,
    logInfo
};

console.log('[API Tester] Доступен: window.__apiTester');