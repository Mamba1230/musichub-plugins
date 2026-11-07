// ============================================================
// API TESTER PRO v2 — RENDERER
// Вкладки: Плеер · Все API · События · Звук · HTTP
// Список методов строится из реального electronAPI.
// ============================================================
(() => {
'use strict';

console.log('[API Tester] Renderer v2 started');

// ------------------------------------------------------------
// УТИЛИТЫ
// ------------------------------------------------------------
const $  = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

const MIN_VOLUME = 1;                       // как в приложении: ниже 1% не опускаем
const AUDIO_SILENCE_MS = 4000;              // как в приложении
const AUDIO_WS_URL = 'ws://localhost:9876/audio-stream';
const HTTP_BASE = 'http://localhost:9876';
const ARTWORK_URL = 'http://127.0.0.1:3456/artwork';

function getApi() {
    try { if (window.parent && window.parent.electronAPI) return window.parent.electronAPI; } catch (_) {}
    return window.electronAPI || null;
}

function fmt(v, max = 300) {
    const seen = new WeakSet();
    try {
        const s = JSON.stringify(v, (k, x) => {
            if (typeof x === 'string' && x.length > max) return x.slice(0, max) + `…(+${x.length - max} симв.)`;
            if (typeof x === 'function') return '[function]';
            if (x instanceof Error) return `Error: ${x.message}`;
            if (x instanceof ArrayBuffer) return `[ArrayBuffer ${x.byteLength}]`;
            if (x && typeof x === 'object') { if (seen.has(x)) return '[circular]'; seen.add(x); }
            return x;
        }, 2);
        return s === undefined ? String(v) : s;
    } catch (e) { return String(v); }
}

function fmtTime(ms) {
    if (!Number.isFinite(ms) || ms < 0) return '--:--';
    const s = Math.floor(ms / 1000);
    return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

const maskStr = (s) => (s.length <= 8 ? '••••' : s.slice(0, 4) + '••••••' + s.slice(-2));
function maskDeep(v) {
    if (typeof v === 'string') return maskStr(v);
    if (v && typeof v === 'object') {
        const o = Array.isArray(v) ? [] : {};
        for (const k in v) o[k] = maskDeep(v[k]);
        return o;
    }
    return v;
}

function parseArgs(text) {
    const t = (text || '').trim();
    if (!t) return [];
    const v = JSON.parse(t);
    return Array.isArray(v) ? v : [v];
}

function copyText(text) {
    try { navigator.clipboard.writeText(text); return true; } catch (_) { return false; }
}

// ------------------------------------------------------------
// ЛОГ
// ------------------------------------------------------------
const logEl = $('#logArea');
const logLines = [];

function log(message, type = 'info') {
    const t = new Date().toLocaleTimeString();
    logLines.push(`[${t}] ${message}`);
    if (logLines.length > 500) logLines.shift();
    const d = document.createElement('div');
    d.className = `log-entry ${type}`;
    const ts = document.createElement('span');
    ts.className = 'time';
    ts.textContent = `[${t}]`;
    d.append(ts, document.createTextNode(message));
    logEl.prepend(d);
    while (logEl.children.length > 150) logEl.lastChild.remove();
    $('#logCount').textContent = String(logLines.length);
}
const logSuccess = (m) => log(`✅ ${m}`, 'success');
const logError   = (m) => log(`❌ ${m}`, 'error');
const logWarn    = (m) => log(`⚠️ ${m}`, 'warning');
const logInfo    = (m) => log(`ℹ️ ${m}`, 'info');

$('#clearLogBtn').addEventListener('click', () => { logEl.textContent = ''; logLines.length = 0; $('#logCount').textContent = '0'; logInfo('🧹 Лог очищен'); });
$('#exportLogBtn').addEventListener('click', () => {
    const blob = new Blob([logLines.join('\n')], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `api-tester-log-${new Date().toISOString().slice(0, 10)}.txt`;
    a.click();
    URL.revokeObjectURL(url);
    logSuccess('Лог экспортирован');
});
$('#dockToggle').addEventListener('click', () => $('#dock').classList.toggle('collapsed'));

// ------------------------------------------------------------
// ВКЛАДКИ
// ------------------------------------------------------------
const tabInit = {};
function openTab(name) {
    $$('.tab').forEach((b) => b.classList.toggle('active', b.dataset.tab === name));
    $$('.pane').forEach((p) => p.classList.toggle('active', p.id === `pane-${name}`));
    if (!tabInit[name]) { tabInit[name] = true; if (tabHooks[name]) tabHooks[name](); }
}
const tabHooks = {};
$$('.tab').forEach((b) => b.addEventListener('click', () => openTab(b.dataset.tab)));

// ============================================================
// КАТАЛОГ МЕТОДОВ  [имя, категория, риск, подсказка аргументов, описание]
// риск: read — только чтение, ctrl — управление воспроизведением/громкостью,
//       write — меняет настройки/состояние (нужно подтверждение), ai — расходует лимит
// ============================================================
const CATALOG = [
    // Плеер
    ['mediaPlayPause', 'Плеер', 'ctrl', '[]'],
    ['mediaStop', 'Плеер', 'ctrl', '[]'],
    ['mediaNext', 'Плеер', 'ctrl', '[]'],
    ['mediaPrevious', 'Плеер', 'ctrl', '[]'],
    ['mediaSeek', 'Плеер', 'ctrl', '[30000]', 'позиция, мс'],
    ['mediaPing', 'Плеер', 'read', '[]'],
    ['mediaGetState', 'Плеер', 'read', '[]'],
    ['getWindowsMediaInfo', 'Плеер', 'read', '[]'],
    ['getMediaFromFiles', 'Плеер', 'read', '[]'],
    ['getArtworkFromServer', 'Плеер', 'read', '[]', 'base64'],
    ['reloadArtworkPage', 'Плеер', 'ctrl', '[]'],
    ['updateTrackInfo', 'Плеер', 'write', '[{"title":"Test","artist":"Tester"}]'],
    ['updateArtwork', 'Плеер', 'write', '["https://example.com/a.jpg"]'],
    ['updateArtworkForTray', 'Плеер', 'write', '["https://example.com/a.jpg"]'],
    ['updateArtworkBase64', 'Плеер', 'write', '["<base64>", {}]'],
    ['updateArtworkUrl', 'Плеер', 'write', '["https://example.com/a.jpg", {}]'],
    ['updateTabBinding', 'Плеер', 'write', '[{}]'],
    // Громкость
    ['getSystemVolume', 'Громкость', 'read', '[]'],
    ['getSystemMuted', 'Громкость', 'read', '[]'],
    ['setSystemVolume', 'Громкость', 'ctrl', '[50]', '0–100, мин. 1'],
    ['setSystemMute', 'Громкость', 'ctrl', '[false]'],
    ['setMusicHubVolume', 'Громкость', 'ctrl', '[0.5]', '0.01–1'],
    ['setMasterVolume', 'Громкость', 'ctrl', '[0.5]', '0.01–1'],
    ['setAllWebviewsVolume', 'Громкость', 'ctrl', '[0.5]', '0.01–1'],
    ['setYandexVolume', 'Громкость', 'ctrl', '[50]', '%'],
    // Аудио
    ['getAudioDevices', 'Аудио', 'read', '[]'],
    ['getAudioConfig', 'Аудио', 'read', '[]'],
    ['setAudioConfig', 'Аудио', 'write', '[{}]'],
    // Окно и запуск
    ['windowCtrl', 'Окно и запуск', 'write', '["minimize"]', 'minimize / maximize / close'],
    ['setAlwaysOnTop', 'Окно и запуск', 'write', '[true]'],
    ['setAutostart', 'Окно и запуск', 'write', '[false]'],
    ['restoreWindow', 'Окно и запуск', 'write', '[{}]'],
    ['getStartMinimized', 'Окно и запуск', 'read', '[]'],
    ['setStartMinimized', 'Окно и запуск', 'write', '[false]'],
    ['getStartupPage', 'Окно и запуск', 'read', '[]'],
    ['setStartupPage', 'Окно и запуск', 'write', '["home"]'],
    ['openExternal', 'Окно и запуск', 'write', '["https://example.com"]'],
    ['openMusichubUrl', 'Окно и запуск', 'write', '["https://example.com"]'],
    // Трей и Discord
    ['toggleTrayControls', 'Трей и Discord', 'write', '[true]'],
    ['playerStateChanged', 'Трей и Discord', 'write', '[true]'],
    ['toggleDiscordRPC', 'Трей и Discord', 'write', '[true]'],
    ['getDiscordRPCStatus', 'Трей и Discord', 'read', '[]'],
    // Плагины
    ['getPlugins', 'Плагины', 'read', '[]'],
    ['getPluginStore', 'Плагины', 'read', '[false]', 'forceRefresh'],
    ['getCustomStores', 'Плагины', 'read', '[]'],
    ['addCustomStore', 'Плагины', 'write', '["https://example.com/store.json"]'],
    ['removeCustomStore', 'Плагины', 'write', '[0]', 'индекс'],
    ['togglePlugin', 'Плагины', 'write', '["plugin-id", true]'],
    ['installPlugin', 'Плагины', 'write', '["C:/path/to/plugin"]'],
    ['uninstallPlugin', 'Плагины', 'write', '["plugin-id"]'],
    ['installPluginFromStore', 'Плагины', 'write', '["plugin-id", "https://…"]'],
    ['openPluginPopup', 'Плагины', 'write', '["plugin-id"]'],
    ['sendPluginStatus', 'Плагины', 'write', '[{}]'],
    // Расширения
    ['getExtensions', 'Расширения', 'read', '[]'],
    ['openExtensionPopup', 'Расширения', 'write', '["ext-id"]'],
    ['installExtension', 'Расширения', 'write', '["C:/path/to/ext"]'],
    ['uninstallExtension', 'Расширения', 'write', '["ext-id"]'],
    ['installFromChrome', 'Расширения', 'write', '["ext-id"]'],
    // Горячие клавиши
    ['getHotkeysFromStorage', 'Горячие клавиши', 'read', '[]'],
    ['updateHotkeys', 'Горячие клавиши', 'write', '[{}]'],
    ['fallbackHotkeyPressed', 'Горячие клавиши', 'write', '["playpause"]'],
    // Мобильный и локальный API
    ['getLocalIP', 'Мобильный и локальный API', 'read', '[]'],
    ['getLocalApiKey', 'Мобильный и локальный API', 'read', '[]', 'секрет'],
    ['setLocalApiKey', 'Мобильный и локальный API', 'write', '["new-key"]'],
    ['regenerateLocalApiKey', 'Мобильный и локальный API', 'write', '[]'],
    ['sendMobileStatus', 'Мобильный и локальный API', 'write', '[{}]'],
    // AI
    ['getAILimitStatus', 'AI', 'read', '[]'],
    ['getGigaAuthKey', 'AI', 'read', '[]', 'секрет'],
    ['parseAICommand', 'AI', 'ai', '["сделай потише"]'],
    ['executeAICommand', 'AI', 'ai', '[{}]'],
    ['askAI', 'AI', 'ai', '["ping", [], {}]', 'вопрос, история, контекст'],
    ['askAICommentary', 'AI', 'ai', '["ping"]'],
];
const SECRET = new Set(['getLocalApiKey', 'getGigaAuthKey']);
const META = new Map(CATALOG.map(([n, cat, risk, hint, desc]) => [n, { name: n, cat, risk, hint: hint || '[]', desc: desc || '' }]));
const CAT_ORDER = ['Плеер', 'Громкость', 'Аудио', 'Окно и запуск', 'Трей и Discord', 'Плагины', 'Расширения', 'Горячие клавиши', 'Мобильный и локальный API', 'AI', 'Прочее'];
const RISK_LABEL = { read: 'чтение', ctrl: 'управление', write: 'запись', ai: 'AI' };

function metaOf(name) {
    if (META.has(name)) return META.get(name);
    // Метод, которого нет в каталоге: риск угадываем по имени, по умолчанию — осторожно
    const risk = /^(get|is|has)[A-Z]/.test(name) ? 'read' : 'write';
    return { name, cat: 'Прочее', risk, hint: '[]', desc: 'не в каталоге' };
}

// ============================================================
// ВКЛАДКА «ПЛЕЕР»
// ============================================================
const P = { info: null, tl: null, anchor: 0, playing: false, drag: false, appVol: 50, muted: null, hasArt: false };

function applyAccentColor(color) {
    if (!color) return;
    document.documentElement.style.setProperty('--accent', color);
}

function setArt(src) {
    const img = $('#artwork'), ph = $('#artworkPlaceholder');
    if (src) { img.src = src; img.style.display = 'block'; ph.style.display = 'none'; P.hasArt = true; }
    else { img.removeAttribute('src'); img.style.display = 'none'; ph.style.display = 'flex'; P.hasArt = false; }
}

function coverToSrc(c) {
    if (c && typeof c === 'object') c = c.artwork_base64 || c.base64 || c.data || c.cover || c.url || null;
    if (typeof c !== 'string' || !c) return null;
    return /^(data:|https?:|blob:)/.test(c) ? c : `data:image/jpeg;base64,${c}`;
}

function curPos() {
    if (!P.tl) return 0;
    let pos = P.tl.position_ms || 0;
    if (P.playing) pos += Date.now() - P.anchor;
    const { start_ms, end_ms } = P.tl;
    if (end_ms > start_ms) pos = clamp(pos, start_ms, end_ms);
    return pos;
}

function setPlaying(next) {
    next = !!next;
    if (next !== P.playing) {
        if (P.tl) { if (!next) P.tl.position_ms = curPos(); P.anchor = Date.now(); }
        P.playing = next;
    }
    $('#statusText').textContent = next ? '▶ Играет' : '⏸ Пауза';
    $('#statusDot').className = 'dot ' + (next ? 'playing' : 'paused');
    $('#playBtn').textContent = next ? '⏸' : '▶';
    updateChips();
}

function setTimeline(tl) {
    if (!tl) return;
    P.tl = { ...tl };
    P.anchor = Date.now();
}

function applyInfo(info) {
    if (!info || (!info.title && !info.artist)) return;
    P.info = info;
    $('#trackName').textContent = info.title || '—';
    $('#trackArtist').textContent = info.artist || '—';
    $('#trackAlbum').textContent = info.album || '';
    if (info.timeline) setTimeline(info.timeline);
    if (typeof info.is_playing === 'boolean') setPlaying(info.is_playing);
    const art = coverToSrc(info.artwork_base64);
    if (art) setArt(art);
    $('#rawInfo').textContent = fmt(info, 120);
    updateChips();
}

function clearPlayer() {
    P.info = null; P.tl = null;
    $('#trackName').textContent = '—';
    $('#trackArtist').textContent = '—';
    $('#trackAlbum').textContent = '';
    $('#rawInfo').textContent = '—';
    setArt(null);
    setPlaying(false);
}

function updateChips() {
    const row = $('#chipRow');
    row.textContent = '';
    const add = (text, cls = '') => { const s = document.createElement('span'); s.className = `chip ${cls}`; s.textContent = text; row.append(s); };
    const i = P.info;
    add(`Windows: ${P.playing ? 'играет' : 'пауза'}`, P.playing ? 'good' : '');
    const v = audioVerdict();
    add(`Звук: ${v === 'yes' ? 'есть' : v === 'no' ? 'нет' : '—'}`, v === 'yes' ? 'good' : v === 'no' ? 'bad' : '');
    if (P.playing && v === 'no') add('⚠ расхождение: система «играет», звука нет → приложение поставит паузу', 'warn');
    if (!P.playing && v === 'yes') add('ℹ звук идёт, а система говорит «пауза»', 'warn');
    if (i && i.source_name) add(`${i.source_name}${i.source_pid ? ' · pid ' + i.source_pid : ''}`);
    if (i && typeof i.is_own_source === 'boolean') add(i.is_own_source ? 'свой источник' : 'чужой источник', i.is_own_source ? 'good' : 'warn');
}

// прогресс
setInterval(() => {
    const seek = $('#seek');
    const dur = P.tl ? P.tl.end_ms - P.tl.start_ms : 0;
    const seekable = !!P.tl && dur > 0 && P.tl.max_seek_ms > P.tl.min_seek_ms;
    seek.disabled = !seekable;
    if (!P.tl || dur <= 0) { $('#timeCur').textContent = '--:--'; $('#timeTotal').textContent = '--:--'; if (!P.drag) seek.value = 0; return; }
    const off = curPos() - P.tl.start_ms;
    $('#timeTotal').textContent = fmtTime(dur);
    if (!P.drag) { seek.value = Math.round((off / dur) * 1000); $('#timeCur').textContent = fmtTime(off); }
}, 250);

$('#seek').addEventListener('input', (e) => {
    P.drag = true;
    if (P.tl) { const dur = P.tl.end_ms - P.tl.start_ms; $('#timeCur').textContent = fmtTime((e.target.value / 1000) * dur); }
});
$('#seek').addEventListener('change', async (e) => {
    P.drag = false;
    if (!P.tl) return;
    const dur = P.tl.end_ms - P.tl.start_ms;
    const target = Math.round(P.tl.start_ms + (e.target.value / 1000) * dur);
    const api = getApi();
    try {
        if (!api || !api.mediaSeek) throw new Error('mediaSeek недоступен');
        await api.mediaSeek(target);
        P.tl.position_ms = target; P.anchor = Date.now();
        logSuccess(`Перемотка → ${fmtTime(target - P.tl.start_ms)}`);
    } catch (err) { logError(`Перемотка: ${err.message}`); }
});

// управление
const CMD = {
    playPause: ['mediaPlayPause', 'media-playpause'],
    next: ['mediaNext', 'media-next'],
    prev: ['mediaPrevious', 'media-previous'],
    stop: ['mediaStop', 'media-stop'],
};
async function sendCommand(action) {
    const [method, endpoint] = CMD[action];
    const api = getApi();
    try {
        if (api && api[method]) {
            const r = await api[method]();
            if (r !== false) { logSuccess(`${action} → electronAPI.${method}`); return true; }
        }
        const resp = await fetch(`${HTTP_BASE}/${endpoint}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
        logSuccess(`${action} → HTTP /${endpoint} (${resp.status})`);
        return resp.ok;
    } catch (e) { logError(`${action}: ${e.message}`); return false; }
}
$('#playBtn').addEventListener('click', () => sendCommand('playPause'));
$('#nextBtn').addEventListener('click', () => sendCommand('next'));
$('#prevBtn').addEventListener('click', () => sendCommand('prev'));
$('#stopBtn').addEventListener('click', () => sendCommand('stop'));

// громкость приложения (MusicHub)
async function setAppVolume(percent) {
    const p = clamp(Math.round(Number(percent) || MIN_VOLUME), MIN_VOLUME, 100);
    P.appVol = p;
    $('#appVol').value = p;
    $('#appVolDisplay').textContent = `${p}%`;
    const api = getApi();
    try {
        if (api && api.setMusicHubVolume) { await api.setMusicHubVolume(p / 100); return true; }
        await fetch(`${HTTP_BASE}/set-volume`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ volume: p / 100 }) });
        return true;
    } catch (e) { logError(`Громкость: ${e.message}`); return false; }
}
let appVolTimer = null;
$('#appVol').addEventListener('input', (e) => {
    const p = clamp(parseInt(e.target.value, 10) || MIN_VOLUME, MIN_VOLUME, 100);
    $('#appVolDisplay').textContent = `${p}%`;
    clearTimeout(appVolTimer);
    appVolTimer = setTimeout(async () => { if (await setAppVolume(p)) logSuccess(`Громкость MusicHub: ${p}%`); }, 60);
});

// системная громкость
function normVol(v) { return v > 0 && v <= 1 && !Number.isInteger(v) ? v * 100 : v; }
async function refreshSystem() {
    const api = getApi();
    if (!api) return;
    try {
        if (api.getSystemVolume) {
            const r = await api.getSystemVolume();
            const raw = r && typeof r === 'object' ? r.volume : r;
            if (Number.isFinite(raw)) {
                const v = Math.round(normVol(raw));
                $('#sysVol').value = clamp(v, MIN_VOLUME, 100);
                $('#sysVolDisplay').textContent = `${v}%`;
            }
        }
        if (api.getSystemMuted) {
            const r = await api.getSystemMuted();
            const m = typeof r === 'boolean' ? r : (r && (r.muted ?? r.isMuted ?? r.value));
            if (typeof m === 'boolean') { P.muted = m; $('#muteBtn').textContent = `${m ? '🔇' : '🔊'} Mute: ${m ? 'вкл' : 'выкл'}`; }
        }
    } catch (e) { logWarn(`Системный звук: ${e.message}`); }
}
let sysVolTimer = null;
$('#sysVol').addEventListener('input', (e) => {
    const p = clamp(parseInt(e.target.value, 10) || MIN_VOLUME, MIN_VOLUME, 100);
    $('#sysVolDisplay').textContent = `${p}%`;
    clearTimeout(sysVolTimer);
    sysVolTimer = setTimeout(async () => {
        const api = getApi();
        try { if (!api || !api.setSystemVolume) throw new Error('setSystemVolume недоступен'); await api.setSystemVolume(p); logSuccess(`Системная громкость: ${p}%`); }
        catch (err) { logError(`Системная громкость: ${err.message}`); }
    }, 80);
});
$('#muteBtn').addEventListener('click', async () => {
    const api = getApi();
    try {
        if (!api || !api.setSystemMute) throw new Error('setSystemMute недоступен');
        const next = !P.muted;
        await api.setSystemMute(next);
        logSuccess(`Mute: ${next ? 'вкл' : 'выкл'}`);
        setTimeout(refreshSystem, 300);
    } catch (e) { logError(`Mute: ${e.message}`); }
});
$('#sysRefreshBtn').addEventListener('click', refreshSystem);

// подписки плеера
async function initPlayer() {
    const api = getApi();
    if (!api) { logWarn('electronAPI не найден — работают только HTTP-запросы'); return; }
    logSuccess('Подключен к electronAPI MusicHub');

    if (api.onMediaInfo)     api.onMediaInfo((m) => applyInfo(m));
    if (api.onMediaTimeline) api.onMediaTimeline((t) => setTimeline(t));
    if (api.onMediaCover)    api.onMediaCover((c) => { const s = coverToSrc(c); if (s) setArt(s); });
    if (api.onMediaClear)    api.onMediaClear(() => clearPlayer());
    if (api.onPluginStatus) {
        api.onPluginStatus((event, status) => {
            if (!status) return;
            if (status.accentColor) applyAccentColor(status.accentColor);
            if (!P.info) {
                if (status.track !== undefined) $('#trackName').textContent = status.track || '—';
                if (status.artist !== undefined) $('#trackArtist').textContent = status.artist || '—';
                if (status.isPlaying !== undefined) setPlaying(status.isPlaying);
                if (status.artwork) setArt(status.artwork);
            }
        });
    }

    try { if (api.getMediaFromFiles) applyInfo(await api.getMediaFromFiles()); } catch (e) { logWarn(`getMediaFromFiles: ${e.message}`); }
    try {
        if (!P.hasArt && api.getArtworkFromServer) { const s = coverToSrc(await api.getArtworkFromServer()); if (s) setArt(s); }
    } catch (_) {}
    try {
        if (!P.hasArt) {
            const r = await fetch(ARTWORK_URL);
            if (r.ok) setArt(URL.createObjectURL(await r.blob()));
        }
    } catch (_) {}
    try { if (api.getPluginStatus) { const st = await api.getPluginStatus(); if (st && st.accentColor) applyAccentColor(st.accentColor); } } catch (_) {}
    refreshSystem();
}

// ============================================================
// ВКЛАДКА «ВСЕ API»
// ============================================================
const EX = { q: '', risk: 'all' };

function el(tag, cls, text) { const e = document.createElement(tag); if (cls) e.className = cls; if (text !== undefined) e.textContent = text; return e; }

function riskBadge(name) {
    const m = metaOf(name);
    const b = el('span', `risk ${SECRET.has(name) ? 'secret' : m.risk}`, SECRET.has(name) ? 'секрет' : RISK_LABEL[m.risk]);
    return b;
}

async function invoke(name, args) {
    const api = getApi();
    if (!api || typeof api[name] !== 'function') throw new Error('метод недоступен');
    return api[name](...args);
}

function showResult(name, r, out, ms) {
    let shown = r;
    if (SECRET.has(name) && !$('#showSecrets').checked) shown = maskDeep(r);
    out.className = 'out ok';
    out.textContent = (r === undefined ? '✓ выполнено (метод без ответа)' : fmt(shown)) + `\n— ${ms} мс`;
}

function createRow(name) {
    const m = metaOf(name);
    const row = el('div', 'm');
    row.dataset.name = name.toLowerCase();
    row.dataset.risk = SECRET.has(name) ? 'read' : m.risk;

    const head = el('div', 'm-head');
    head.append(riskBadge(name), el('span', 'm-name', name));
    if (m.desc) head.append(el('span', 'm-desc', m.desc));
    const run = el('button', 'btn-s', '▶');
    head.append(run);

    const body = el('div', 'm-body hidden');
    const argsWrap = el('div', 'm-args');
    const args = el('input', 'field');
    args.value = m.hint;
    args.spellcheck = false;
    argsWrap.append(args);
    const out = el('pre', 'out', '');
    body.append(argsWrap, out);
    row.append(head, body);

    let armTimer = null;
    const execute = async () => {
        body.classList.remove('hidden');
        let a;
        try { a = parseArgs(args.value); } catch (e) { out.className = 'out err'; out.textContent = `Некорректный JSON аргументов: ${e.message}`; return; }
        out.className = 'out'; out.textContent = '⏳ …';
        const t0 = performance.now();
        try {
            const r = await invoke(name, a);
            const ms = Math.round(performance.now() - t0);
            showResult(name, r, out, ms);
            logSuccess(`${name}(${a.map((x) => fmt(x, 40).replace(/\s+/g, ' ')).join(', ')}) → ${r === undefined ? 'ok' : fmt(SECRET.has(name) ? '***' : r, 60).replace(/\s+/g, ' ')} · ${ms} мс`);
        } catch (e) {
            out.className = 'out err';
            out.textContent = `Ошибка: ${e.message}`;
            logError(`${name}: ${e.message}`);
        }
    };
    run.addEventListener('click', (ev) => {
        ev.stopPropagation();
        const needConfirm = m.risk === 'write' || m.risk === 'ai';
        if (!needConfirm) return execute();
        if (run.classList.contains('armed')) { clearTimeout(armTimer); run.classList.remove('armed'); run.textContent = '▶'; return execute(); }
        run.classList.add('armed'); run.textContent = 'Точно?';
        armTimer = setTimeout(() => { run.classList.remove('armed'); run.textContent = '▶'; }, 3000);
    });
    head.addEventListener('click', () => body.classList.toggle('hidden'));
    args.addEventListener('keydown', (e) => { if (e.key === 'Enter' && m.risk !== 'write' && m.risk !== 'ai') execute(); });
    return row;
}

function applyExplorerFilter() {
    const q = EX.q.trim().toLowerCase();
    $$('#methodList .cat').forEach((cat) => {
        let visible = 0;
        $$('.m', cat).forEach((row) => {
            const ok = (!q || row.dataset.name.includes(q)) && (EX.risk === 'all' || row.dataset.risk === EX.risk);
            row.classList.toggle('hidden', !ok);
            if (ok) visible++;
        });
        cat.classList.toggle('hidden', visible === 0);
    });
}

function buildExplorer() {
    const api = getApi();
    const list = $('#methodList');
    list.textContent = '';
    if (!api) {
        $('#apiCount').textContent = '0';
        $('#apiStats').textContent = 'electronAPI не найден';
        const n = el('div', 'card'); n.append(el('div', 'hint', 'electronAPI недоступен в этом окне. Плагин видит его через window.parent.electronAPI — проверьте, что popup открыт из MusicHub.'));
        list.append(n);
        return;
    }
    const keys = Object.keys(api).filter((k) => typeof api[k] === 'function');
    const events = keys.filter((k) => /^on[A-Z]/.test(k));
    const methods = keys.filter((k) => !/^on[A-Z]/.test(k) && k !== 'on' && k !== 'send');
    $('#apiCount').textContent = String(methods.length);
    $('#apiStats').textContent = `${methods.length} методов · ${events.length} событий`;

    const groups = new Map();
    methods.forEach((n) => { const c = metaOf(n).cat; if (!groups.has(c)) groups.set(c, []); groups.get(c).push(n); });
    const cats = [...groups.keys()].sort((a, b) => CAT_ORDER.indexOf(a) - CAT_ORDER.indexOf(b));
    cats.forEach((c) => {
        const wrap = el('div', 'cat');
        const head = el('div', 'cat-head');
        head.append(el('span', '', c), el('span', '', String(groups.get(c).length)));
        const items = el('div', 'cat-items');
        groups.get(c).sort().forEach((n) => items.append(createRow(n)));
        head.addEventListener('click', () => items.classList.toggle('hidden'));
        wrap.append(head, items);
        list.append(wrap);
    });

    // Чего ждали, но не нашли (например getPluginStatus из старой версии теста)
    const missing = CATALOG.map((c) => c[0]).filter((n) => !keys.includes(n));
    const legacy = ['getPluginStatus'].filter((n) => !keys.includes(n));
    const parts = [];
    if (missing.length) parts.push(`Из каталога нет в этом окружении: ${missing.join(', ')}.`);
    if (legacy.length) parts.push(`Старый тест использовал ${legacy.join(', ')} — его в electronAPI нет.`);
    $('#missingNote').textContent = parts.join(' ');
    applyExplorerFilter();
}

$('#apiSearch').addEventListener('input', (e) => { EX.q = e.target.value; applyExplorerFilter(); });
$('#riskChips').addEventListener('click', (e) => {
    const b = e.target.closest('button'); if (!b) return;
    $$('#riskChips button').forEach((x) => x.classList.toggle('on', x === b));
    EX.risk = b.dataset.risk;
    applyExplorerFilter();
});
$('#rescanBtn').addEventListener('click', () => { buildExplorer(); buildEvents(); logInfo('API пересканирован'); });

let lastSnapshot = null;
$('#snapshotBtn').addEventListener('click', async () => {
    const api = getApi();
    if (!api) { logError('electronAPI недоступен'); return; }
    const btn = $('#snapshotBtn');
    btn.disabled = true;
    const names = Object.keys(api).filter((n) => typeof api[n] === 'function' && !/^on[A-Z]/.test(n) && metaOf(n).risk === 'read' && !SECRET.has(n)).sort();
    const result = {};
    const out = $('#snapshotOut');
    out.textContent = '';
    $('#snapshotCard').classList.remove('hidden');
    for (let i = 0; i < names.length; i++) {
        const n = names[i];
        $('#snapshotTitle').textContent = `Снимок… ${i + 1}/${names.length}`;
        const t0 = performance.now();
        try {
            const args = parseArgs(metaOf(n).hint);
            result[n] = await Promise.race([invoke(n, args), sleep(5000).then(() => { throw new Error('таймаут 5 с'); })]);
        } catch (e) { result[n] = { __error: e.message }; }
        const d = el('details', 'snap-item');
        const s = el('summary', result[n] && result[n].__error ? 'bad' : '', `${n}  ·  ${Math.round(performance.now() - t0)} мс`);
        const pre = el('pre', 'out', fmt(result[n], 200));
        d.append(s, pre);
        out.append(d);
    }
    lastSnapshot = result;
    const bad = Object.values(result).filter((v) => v && v.__error).length;
    $('#snapshotTitle').textContent = `Снимок: ${names.length} методов, ошибок ${bad}`;
    logSuccess(`Снимок готов: ${names.length} методов, ошибок: ${bad} (ключи исключены)`);
    btn.disabled = false;
});
$('#snapshotCopy').addEventListener('click', () => {
    if (!lastSnapshot) return;
    const text = fmt(lastSnapshot, 400);
    logInfo(copyText(text) ? 'Снимок скопирован' : 'Не удалось скопировать — выделите текст вручную');
});

// ============================================================
// ВКЛАДКА «СОБЫТИЯ»
// ============================================================
const EV = { subs: new Map(), selected: null };   // name -> {count, last, at, log, rowEl}
const EV_QUIET = new Set(['onMediaTimeline']);    // шумные — по умолчанию не пишем в лог
let evSubscribed = false;

function isIpcEvent(x) {
    try { return !!x && typeof x === 'object' && ('sender' in x || 'senderId' in x); } catch (_) { return false; }
}

function buildEvents() {
    const api = getApi();
    const list = $('#eventList');
    list.textContent = '';
    if (!api) { list.append(el('div', 'hint', 'electronAPI недоступен')); return; }
    const names = Object.keys(api).filter((k) => /^on[A-Z]/.test(k) && typeof api[k] === 'function').sort();
    names.forEach((n) => {
        let s = EV.subs.get(n);
        if (!s) {
            s = { count: 0, last: undefined, at: 0, log: !EV_QUIET.has(n) };
            EV.subs.set(n, s);
            try {
                api[n]((...args) => {
                    const payload = args.filter((a) => !isIpcEvent(a));
                    s.count++; s.at = Date.now(); s.last = payload.length <= 1 ? payload[0] : payload;
                    if (s.log) log(`📡 ${n} ${fmt(s.last, 80).replace(/\s+/g, ' ').slice(0, 160)}`, 'info');
                    if (s.rowEl) { s.rowEl.querySelector('.c').textContent = String(s.count); s.rowEl.classList.remove('flash'); void s.rowEl.offsetWidth; s.rowEl.classList.add('flash'); }
                    if (EV.selected === n) showEventLast(n);
                });
            } catch (e) { logError(`Подписка ${n}: ${e.message}`); }
        }
        const row = el('div', 'ev');
        const cb = el('input'); cb.type = 'checkbox'; cb.checked = s.log;
        cb.addEventListener('click', (e) => e.stopPropagation());
        cb.addEventListener('change', () => { s.log = cb.checked; });
        row.append(cb, el('span', 'n', n), el('span', 'c', String(s.count)), el('span', 'ago', s.at ? 'только что' : '—'));
        row.addEventListener('click', () => { EV.selected = n; $$('.ev', list).forEach((r) => r.classList.toggle('sel', r === row)); showEventLast(n); });
        s.rowEl = row;
        row._cb = cb;
        list.append(row);
    });
    evSubscribed = true;
}
function showEventLast(n) {
    const s = EV.subs.get(n);
    $('#eventLastTitle').textContent = `Последнее: ${n}`;
    $('#eventLast').textContent = s && s.count ? `${fmt(s.last, 400)}\n— ${new Date(s.at).toLocaleTimeString()} · всего: ${s.count}` : 'Событий пока не было';
}
setInterval(() => {
    EV.subs.forEach((s) => {
        if (!s.rowEl || !s.at) return;
        const sec = Math.round((Date.now() - s.at) / 1000);
        s.rowEl.querySelector('.ago').textContent = sec < 2 ? 'только что' : sec < 60 ? `${sec} с назад` : `${Math.floor(sec / 60)} мин назад`;
    });
}, 1000);
$('#eventAll').addEventListener('click', () => EV.subs.forEach((s) => { s.log = true; if (s.rowEl) s.rowEl._cb.checked = true; }));
$('#eventNone').addEventListener('click', () => EV.subs.forEach((s) => { s.log = false; if (s.rowEl) s.rowEl._cb.checked = false; }));

// ============================================================
// ВКЛАДКА «ЗВУК»
// ============================================================
const A = {
    ws: null, connected: false, gotPackets: false, connectedAt: 0,
    total: 0, perSec: 0, secCount: 0, peak: 0, rms: 0, maxPeak: 0,
    lastSoundAt: 0, lastLen: 0, lastPcm: 0, winMax: 0, measMax: 0,
    hist: new Array(100).fill(0), threshold: 3, textSeen: 0, manualStop: false,
};

function audioVerdict() {
    if (!A.connected || !A.gotPackets) return 'none';
    const since = Math.max(A.lastSoundAt, A.connectedAt);
    return Date.now() - since > AUDIO_SILENCE_MS ? 'no' : (A.lastSoundAt ? 'yes' : 'none');
}

function packetStats(buf) {
    if (buf.byteLength <= 4) return null;
    const pcmLen = new DataView(buf).getInt32(0, true);
    A.lastPcm = pcmLen;
    if (pcmLen <= 4) return { peak: 0, rms: 0 };
    const count = Math.min(pcmLen >> 1, (buf.byteLength - 4) >> 1);
    const s = new Int16Array(buf, 4, count);
    let peak = 0, sum = 0;
    for (let i = 0; i < s.length; i++) { const v = s[i] < 0 ? -s[i] : s[i]; if (v > peak) peak = v; sum += s[i] * s[i]; }
    return { peak, rms: s.length ? Math.sqrt(sum / s.length) : 0 };
}

function audioConnect() {
    if (A.ws) return;
    A.manualStop = false;
    try {
        const ws = new WebSocket(AUDIO_WS_URL);
        ws.binaryType = 'arraybuffer';
        A.ws = ws;
        ws.onopen = () => { A.connected = true; A.gotPackets = false; A.connectedAt = Date.now(); A.lastSoundAt = 0; $('#audioToggle').textContent = 'Отключить'; logSuccess('Аудиопоток подключён'); };
        ws.onmessage = (ev) => {
            if (!(ev.data instanceof ArrayBuffer)) {
                A.textSeen++;
                if (A.textSeen <= 3) logInfo(`Аудио-WS текст: ${String(ev.data).slice(0, 140)}`);
                return;
            }
            A.gotPackets = true; A.total++; A.secCount++; A.lastLen = ev.data.byteLength;
            const st = packetStats(ev.data);
            if (!st) return;
            A.peak = st.peak; A.rms = st.rms;
            if (st.peak > A.winMax) A.winMax = st.peak;
            if (st.peak > A.measMax) A.measMax = st.peak;
            if (st.peak > A.maxPeak) A.maxPeak = st.peak;
            if (st.peak > A.threshold) A.lastSoundAt = Date.now();
        };
        ws.onclose = () => {
            A.connected = false; A.gotPackets = false; A.ws = null;
            $('#audioToggle').textContent = 'Подключить';
            if (!A.manualStop) { logWarn('Аудиопоток закрыт, повтор через 3 с'); setTimeout(audioConnect, 3000); }
            updateChips();
        };
        ws.onerror = () => {};
    } catch (e) { logError(`Аудио-WS: ${e.message}`); A.ws = null; }
}
function audioDisconnect() { A.manualStop = true; if (A.ws) try { A.ws.close(); } catch (_) {} }

$('#audioToggle').addEventListener('click', () => { if (A.ws) audioDisconnect(); else audioConnect(); });
$('#thrInput').addEventListener('input', (e) => { A.threshold = clamp(parseInt(e.target.value, 10) || 0, 0, 32767); });
$('#maxResetBtn').addEventListener('click', () => { A.maxPeak = 0; });

const dbfs = (peak) => (peak > 0 ? 20 * Math.log10(peak / 32768) : -Infinity);
const meterPos = (peak) => { const d = dbfs(peak); return Number.isFinite(d) ? clamp((d + 90) / 90, 0, 1) : 0; };

function drawAudio() {
    const cv = $('#audioCanvas');
    const ctx = cv.getContext('2d');
    const W = cv.width, H = cv.height;
    ctx.clearRect(0, 0, W, H);
    const accent = getComputedStyle(document.documentElement).getPropertyValue('--accent').trim() || '#1DB954';

    // полоса текущего уровня
    ctx.fillStyle = '#161616'; ctx.fillRect(0, 0, W, 34);
    ctx.fillStyle = accent; ctx.fillRect(0, 0, W * meterPos(A.peak), 34);
    const tx = W * meterPos(A.threshold);
    ctx.strokeStyle = '#ffd93d'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(tx, 0); ctx.lineTo(tx, 34); ctx.stroke();
    ctx.fillStyle = '#ffd93d'; ctx.font = '18px sans-serif'; ctx.fillText('порог', Math.min(tx + 6, W - 56), 24);

    // история 10 с
    const top = 48, h = H - top - 4, bw = W / A.hist.length;
    ctx.fillStyle = '#101010'; ctx.fillRect(0, top, W, h);
    for (let i = 0; i < A.hist.length; i++) {
        const p = A.hist[i];
        ctx.fillStyle = p > A.threshold ? accent : '#444';
        const bh = Math.max(p > 0 ? 2 : 0, meterPos(p) * h);
        ctx.fillRect(i * bw, top + h - bh, bw - 1, bh);
    }
    ctx.strokeStyle = '#ffd93d55'; ctx.lineWidth = 1;
    const ty = top + h - meterPos(A.threshold) * h;
    ctx.beginPath(); ctx.moveTo(0, ty); ctx.lineTo(W, ty); ctx.stroke();
}

setInterval(() => {
    // окно 100 мс → история
    A.hist.push(A.winMax); A.hist.shift(); A.winMax = 0;
    if (!$('#pane-audio').classList.contains('active')) return;
    drawAudio();
    $('#stPeak').textContent = String(A.peak);
    const d = dbfs(A.peak);
    $('#stDb').textContent = Number.isFinite(d) ? d.toFixed(1) : '−∞';
    $('#stMax').textContent = String(A.maxPeak);
    $('#stPkt').textContent = A.lastLen ? `${A.lastLen} Б (pcm ${A.lastPcm})` : '—';
    const v = audioVerdict();
    const vEl = $('#audioVerdict');
    vEl.className = `verdict ${v}`;
    if (!A.connected) { vEl.textContent = '⏳ Нет подключения'; $('#audioSub').textContent = AUDIO_WS_URL; }
    else if (!A.gotPackets) { vEl.textContent = '⚠ Подключено, но пакеты не приходят'; $('#audioSub').textContent = 'Возможно, захват не запущен (/start-capture) — тогда проверка в приложении отключена и верит системе.'; }
    else if (v === 'yes') { vEl.textContent = '🔊 Звук есть'; $('#audioSub').textContent = 'Приложение считает: музыка играет (если система тоже так считает).'; }
    else if (v === 'no') { vEl.textContent = '🔇 Тишина'; $('#audioSub').textContent = 'Больше 4 с тишины → приложение поставит паузу, даже если система говорит «играет».'; }
    else { vEl.textContent = '⏳ Пока тихо'; $('#audioSub').textContent = 'Ожидаем звук после подключения.'; }
    $('#stSilence').textContent = A.connected && A.gotPackets ? ((Date.now() - Math.max(A.lastSoundAt, A.connectedAt)) / 1000).toFixed(1) : '—';
}, 100);
setInterval(() => { A.perSec = A.secCount; A.secCount = 0; $('#stPps').textContent = String(A.perSec); updateChips(); }, 1000);

// тест: пик при 1% и при 30%
async function measurePeak(ms) { A.measMax = 0; await sleep(ms); return A.measMax; }
$('#volTestBtn').addEventListener('click', async () => {
    const out = $('#volTestOut');
    out.classList.remove('hidden');
    if (!A.connected) { audioConnect(); await sleep(1200); }
    if (!A.connected || !A.gotPackets) { out.className = 'out err'; out.textContent = 'Нет аудиопакетов. Подключите поток и включите музыку.'; return; }
    const btn = $('#volTestBtn');
    btn.disabled = true;
    const prev = P.appVol;
    out.className = 'out'; out.textContent = '⏳ Громкость 1%…';
    try {
        await setAppVolume(1); await sleep(600);
        const p1 = await measurePeak(3000);
        out.textContent = `Пик при 1%: ${p1}\n⏳ Громкость 30%…`;
        await setAppVolume(30); await sleep(600);
        const p30 = await measurePeak(3000);
        let verdict;
        if (p30 === 0) verdict = 'При 30% пик 0 — музыка не играет или поток не содержит звук приложения.';
        else if (p1 === 0) verdict = 'При 1% пик 0: поток снимается ПОСЛЕ громкости, и 1% дал цифровой ноль. Проверка по звуку при 1% работать не будет — нужен другой источник уровня.';
        else {
            const ratio = p30 / p1;
            if (ratio >= 8) verdict = `Поток снимается ПОСЛЕ громкости (в ${ratio.toFixed(0)} раз тише при 1%).\nПорог AUDIO_SOUND_PEAK должен быть ниже пика на 1%. Рекомендую ≈ ${Math.max(1, Math.floor(p1 / 3))} (тихие места трека могут быть ещё тише).`;
            else verdict = `Пик почти не зависит от громкости (×${ratio.toFixed(1)}): поток снимается ДО громкости, 1% безопасен, порог 3 подходит.`;
        }
        out.className = 'out ok';
        out.textContent = `Пик при 1%:  ${p1}\nПик при 30%: ${p30}\n\n${verdict}`;
        logSuccess(`Тест громкости: пик 1% = ${p1}, 30% = ${p30}`);
    } catch (e) { out.className = 'out err'; out.textContent = `Ошибка теста: ${e.message}`; }
    finally { await setAppVolume(prev); btn.disabled = false; }
});

// ============================================================
// ВКЛАДКА «HTTP»
// ============================================================
const HTTP_PRESETS = [
    ['GET', `${HTTP_BASE}/audio-devices`, ''],
    ['GET', `${HTTP_BASE}/audio-config`, ''],
    ['GET', `${HTTP_BASE}/capture-status`, ''],
    ['POST', `${HTTP_BASE}/media-ping`, '{}'],
    ['POST', `${HTTP_BASE}/set-volume`, '{"volume":0.5}'],
    ['GET', ARTWORK_URL, ''],
];
function initHttp() {
    const sel = $('#httpPreset');
    sel.append(new Option('— пресеты —', ''));
    HTTP_PRESETS.forEach(([m, u, b], i) => sel.append(new Option(`${m} ${u.replace(/^https?:\/\//, '')}`, String(i))));
    sel.addEventListener('change', () => {
        if (sel.value === '') return;
        const [m, u, b] = HTTP_PRESETS[+sel.value];
        $('#httpMethod').value = m; $('#httpUrl').value = u; $('#httpBody').value = b;
    });
    $('#httpSend').addEventListener('click', async () => {
        const out = $('#httpOut'), img = $('#httpImg');
        const method = $('#httpMethod').value, url = $('#httpUrl').value.trim(), body = $('#httpBody').value.trim();
        img.classList.add('hidden'); out.className = 'out'; out.textContent = '⏳ …';
        const ctl = new AbortController();
        const timer = setTimeout(() => ctl.abort(), 5000);
        const t0 = performance.now();
        try {
            const opts = { method, signal: ctl.signal };
            if (method === 'POST') { opts.headers = { 'Content-Type': 'application/json' }; opts.body = body || '{}'; }
            const r = await fetch(url, opts);
            const ms = Math.round(performance.now() - t0);
            const ct = r.headers.get('content-type') || '';
            let text = '';
            if (ct.startsWith('image/')) { img.src = URL.createObjectURL(await r.blob()); img.classList.remove('hidden'); text = '[изображение]'; }
            else {
                text = await r.text();
                try { text = JSON.stringify(JSON.parse(text), null, 2); } catch (_) {}
                if (text.length > 20000) text = text.slice(0, 20000) + `\n…(+${text.length - 20000} симв.)`;
            }
            out.className = r.ok ? 'out ok' : 'out err';
            out.textContent = `${r.status} ${r.statusText} · ${ms} мс · ${ct || 'без content-type'}\n\n${text}`;
            log(`${method} ${url} → ${r.status} · ${ms} мс`, r.ok ? 'success' : 'error');
        } catch (e) {
            out.className = 'out err';
            out.textContent = e.name === 'AbortError' ? 'Таймаут 5 с' : `Ошибка: ${e.message}`;
            logError(`${method} ${url}: ${e.message}`);
        } finally { clearTimeout(timer); }
    });
}

// ============================================================
// ИНИЦИАЛИЗАЦИЯ
// ============================================================
tabHooks.audio = () => audioConnect();
tabHooks.explorer = () => { /* список уже построен */ };

initHttp();
logInfo('🚀 API Tester Pro v2 загружен');
setTimeout(() => {
    initPlayer();
    buildExplorer();
    buildEvents();     // подписываемся на все on* сразу, чтобы счётчики шли с самого начала
    updateChips();
}, 400);

// ============================================================
// ЭКСПОРТ ДЛЯ КОНСОЛИ
// ============================================================
window.__apiTester = {
    P, A, EV, META, getApi, fmt, log, logSuccess, logError, logWarn, logInfo,
    sendCommand, setAppVolume, buildExplorer, buildEvents, audioConnect, audioDisconnect, openTab,
};
console.log('[API Tester] Доступен: window.__apiTester');
})();
