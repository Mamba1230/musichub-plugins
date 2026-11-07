// ============================================================
// MAIN.JS — ФОНОВЫЙ ПРОЦЕСС ПЛАГИНА (API Tester Pro v2)
// ============================================================

console.log('[API Tester] Main process started');

const HTTP_BASE = 'http://localhost:9876';
const MIN_VOLUME = 1; // громкость не опускаем ниже 1%

// Реальные эндпоинты VolumeController: /media-<команда> (как в основном приложении)
const MEDIA_ENDPOINTS = {
    playPause: '/media-playpause',
    next: '/media-next',
    prev: '/media-previous',
    stop: '/media-stop'
};

function getApi() {
    try { return window.parent && window.parent.electronAPI; } catch (e) { return null; }
}

// Подписываемся на статус и пересылаем в renderer
try {
    const api = getApi();
    if (api && api.onPluginStatus) {
        api.onPluginStatus((event, status) => {
            console.log('[Main] Статус:', status);
            if (window.ipcRenderer) window.ipcRenderer.send('status-update', status);
        });
    }
} catch (e) {
    console.log('[Main] Ошибка подписки на статус:', e);
}

// Обработка команд из renderer
if (window.ipcRenderer) {
    window.ipcRenderer.on('command', async (event, cmd) => {
        console.log('[Main] Команда:', cmd);
        try {
            const api = getApi();
            switch (cmd.action) {
                case 'getStatus':
                    if (api && api.getPluginStatus) {
                        window.ipcRenderer.send('status-update', await api.getPluginStatus());
                    }
                    break;

                case 'playPause':
                case 'next':
                case 'prev':
                case 'stop':
                    await fetch(HTTP_BASE + MEDIA_ENDPOINTS[cmd.action], {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: '{}'
                    });
                    break;

                case 'setVolume': {
                    const vol = Math.min(100, Math.max(MIN_VOLUME, Number(cmd.payload) || 50));
                    await fetch(HTTP_BASE + '/set-volume', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ volume: vol / 100 })
                    });
                    window.ipcRenderer.send('volume-update', vol);
                    break;
                }

                case 'getMedia':
                    if (api && api.getMediaFromFiles) {
                        window.ipcRenderer.send('media-data', await api.getMediaFromFiles());
                    }
                    break;
            }
        } catch (e) {
            console.error('[Main] Ошибка:', e);
            window.ipcRenderer.send('command-error', e.message);
        }
    });
}

console.log('[API Tester] Main process ready');
