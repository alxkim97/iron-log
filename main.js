const { app, BrowserWindow, ipcMain, Menu } = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');

const isDev = process.argv.includes('--dev');
const DATA_DIR = path.join(os.homedir(), 'Documents', 'IronLog');
const BACKUP_DIR = path.join(DATA_DIR, 'backups');
const DATA_FILE = path.join(DATA_DIR, 'ironlog-data.json');

// Ensure data directory exists
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}
if (!fs.existsSync(BACKUP_DIR)) {
  fs.mkdirSync(BACKUP_DIR, { recursive: true });
}

let mainWindow;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1000,
    minHeight: 700,
    icon: path.join(__dirname, 'assets', 'icon.ico'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
      enableRemoteModule: false,
      sandbox: true
    }
  });

  const startUrl = isDev
    ? 'http://localhost:3000'
    : `file://${path.join(__dirname, 'index.html')}`;

  mainWindow.loadFile(path.join(__dirname, 'index.html'));

  if (isDev) {
    mainWindow.webContents.openDevTools();
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

// IPC: Load data from file
ipcMain.handle('load-data', async () => {
  try {
    if (fs.existsSync(DATA_FILE)) {
      const data = fs.readFileSync(DATA_FILE, 'utf-8');
      return JSON.parse(data);
    }
    return null;
  } catch (error) {
    console.error('Error loading data:', error);
    return null;
  }
});

// IPC: Save data to file
ipcMain.handle('save-data', async (event, data) => {
  try {
    // Write main data file
    fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2), 'utf-8');

    // Auto-backup: save timestamped copy to backups folder
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const backupFile = path.join(BACKUP_DIR, `ironlog-backup-${timestamp}.json`);
    fs.writeFileSync(backupFile, JSON.stringify(data, null, 2), 'utf-8');

    // Keep only last 10 backups
    const files = fs.readdirSync(BACKUP_DIR)
      .filter(f => f.startsWith('ironlog-backup-'))
      .sort()
      .reverse();
    
    for (let i = 10; i < files.length; i++) {
      fs.unlinkSync(path.join(BACKUP_DIR, files[i]));
    }

    return { success: true };
  } catch (error) {
    console.error('Error saving data:', error);
    return { success: false, error: error.message };
  }
});

// IPC: Get data directory path
ipcMain.handle('get-data-dir', async () => {
  return DATA_DIR;
});

// IPC: Export data to file
ipcMain.handle('export-data', async (event, data, filename) => {
  try {
    const exportPath = path.join(DATA_DIR, filename || `ironlog-export-${Date.now()}.json`);
    fs.writeFileSync(exportPath, JSON.stringify(data, null, 2), 'utf-8');
    return { success: true, path: exportPath };
  } catch (error) {
    console.error('Error exporting data:', error);
    return { success: false, error: error.message };
  }
});

// IPC: Import data from file
ipcMain.handle('import-data', async (event, filePath) => {
  try {
    const data = fs.readFileSync(filePath, 'utf-8');
    return { success: true, data: JSON.parse(data) };
  } catch (error) {
    console.error('Error importing data:', error);
    return { success: false, error: error.message };
  }
});

function createMenu() {
  Menu.setApplicationMenu(null);
}

app.on('ready', () => {
  createWindow();
  createMenu();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (mainWindow === null) {
    createWindow();
  }
});

// Auto-backup on quit
app.on('before-quit', (event) => {
  // Graceful shutdown
  if (mainWindow) {
    mainWindow.webContents.send('app-quitting');
  }
});


