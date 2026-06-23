// main.js — выполняется в main процессе
module.exports = {
    activate: function(plugin) {
        console.log(`🎛️ Плагин "${plugin.name}" активирован`);
        
        // Можно добавить свои обработчики IPC
        // Например, для сохранения настроек громкости
    },
    
    deactivate: function(plugin) {
        console.log(`🎛️ Плагин "${plugin.name}" деактивирован`);
    }
};