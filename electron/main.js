const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const { KaleidoMiningBot } = require('../miner.cjs');

const isDev = process.env.NODE_ENV === 'development';

let mainWindow;

function createWindow() {
    mainWindow = new BrowserWindow({
        width: 1200,
        height: 800,
        webPreferences: {
            nodeIntegration: false,
            contextIsolation: true,
            preload: path.join(__dirname, 'preload.js')
        }
    });

    if (isDev) {
        mainWindow.loadURL('http://localhost:5173');
        mainWindow.webContents.openDevTools();
    } else {
        mainWindow.loadFile(path.join(__dirname, '../dist/index.html'));
    }
}

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
        app.quit();
    }
});

app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
        createWindow();
    }
});

// IPC通信处理
let miners = new Map();

ipcMain.handle('start-mining', async (event, wallets) => {
    try {
        wallets.forEach((wallet, index) => {
            if (!miners.has(wallet)) {
                const miner = new KaleidoMiningBot(wallet, index + 1);
                miners.set(wallet, miner);
                miner.initialize();
                
                miner.on('status-update', (status) => {
                    if (mainWindow && !mainWindow.isDestroyed()) {
                        mainWindow.webContents.send('miner-status-update', { wallet, status });
                    }
                });
            }
        });
        return { success: true };
    } catch (error) {
        console.error('Start mining error:', error);
        return { success: false, error: error.message };
    }
});

ipcMain.handle('stop-mining', async (event, wallets) => {
    try {
        for (const wallet of wallets) {
            const miner = miners.get(wallet);
            if (miner) {
                await miner.stop();
                miners.delete(wallet);
            }
        }
        return { success: true };
    } catch (error) {
        console.error('Stop mining error:', error);
        return { success: false, error: error.message };
    }
}); 
