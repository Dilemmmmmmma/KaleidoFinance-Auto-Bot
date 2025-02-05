const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('electronAPI', {
    startMining: (wallets) => ipcRenderer.invoke('start-mining', wallets),
    stopMining: (wallets) => ipcRenderer.invoke('stop-mining', wallets),
    onMinerStatusUpdate: (callback) => {
        ipcRenderer.on('miner-status-update', (event, data) => callback(data))
        return () => ipcRenderer.removeListener('miner-status-update', callback)
    },
    onMiningStarted: (callback) => {
        ipcRenderer.on('mining-started', (event, data) => callback(data))
        return () => ipcRenderer.removeListener('mining-started', callback)
    },
    onMiningStopped: (callback) => {
        ipcRenderer.on('mining-stopped', (event, data) => callback(data))
        return () => ipcRenderer.removeListener('mining-stopped', callback)
    }
}) 