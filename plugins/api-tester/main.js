// ============================================================
// MAIN.JS — ФОНОВЫЙ ПРОЦЕСС (как у реальных плагинов)
// ============================================================

console.log('[API Tester] Main process started');

// Подписываемся на статус из renderer
try {
    if (window.parent && window.parent.electronAPI) {
        window.parent.electronAPI.onPluginStatus((event, status) => {
            console.log('[Main] Статус из renderer:', status);
            
            // Пересылаем в renderer через IPC
            if (window.ipcRenderer) {
                window.ipcRenderer.send('status-update', status);
            }
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
            switch (cmd.action) {
                case 'getStatus':
                    if (window.parent && window.parent.electronAPI) {
                        const status = await window.parent.electronAPI.getPluginStatus();
                        window.ipcRenderer.send('status-update', status);
                    }
                    break;
                    
                case 'playPause':
                    await fetch('http://localhost:9876/playpause', { method: 'POST' });
                    break;
                    
                case 'next':
                    await fetch('http://localhost:9876/next', { method: 'POST' });
                    break;
                    
                case 'prev':
                    await fetch('http://localhost:9876/prev', { method: 'POST' });
                    break;
                    
                case 'stop':
                    await fetch('http://localhost:9876/stop', { method: 'POST' });
                    break;
                    
                case 'setVolume':
                    const vol = Math.min(100, Math.max(0, cmd.payload || 50));
                    await fetch(`http://localhost:9876/set-volume`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ volume: vol / 100 })
                    });
                    window.ipcRenderer.send('volume-update', vol);
                    break;
                    
                case 'getMedia':
                    if (window.parent && window.parent.electronAPI) {
                        const media = await window.parent.electronAPI.getMediaFromFiles();
                        window.ipcRenderer.send('media-data', media);
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