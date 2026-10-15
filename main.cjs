const { app, BrowserWindow, ipcMain, dialog } = require('electron')
const path = require('path')
const { autoUpdater } = require('electron-updater')

// Unpackaged runs get their own ID so Windows doesn't borrow the installed
// app's taskbar icon (same fix as WorkLog/Coin).
app.setAppUserModelId(app.isPackaged ? 'com.alex.ironlog' : 'com.alex.ironlog.dev')

const gotSingleInstanceLock = app.requestSingleInstanceLock()
if (!gotSingleInstanceLock) app.quit()

const isDev = process.argv.includes('--dev')
let mainWindow = null

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1320,
    height: 880,
    minWidth: 860,
    minHeight: 600,
    title: 'Iron Log',
    backgroundColor: '#141117',
    show: false,
    autoHideMenuBar: true,
    icon: path.join(__dirname, 'assets', 'icon.ico'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  })
  if (isDev) {
    mainWindow.loadURL('http://localhost:5173')
    mainWindow.webContents.openDevTools()
  } else {
    mainWindow.loadFile(path.join(__dirname, 'dist', 'index.html'))
  }
  mainWindow.once('ready-to-show', () => mainWindow.show())
  mainWindow.on('closed', () => { mainWindow = null })
}

// Auto-update via electron-updater + GitHub Releases. A manual check always
// reports back; the background check stays silent unless it finds something.
let updateDownloaded = false
autoUpdater.autoInstallOnAppQuit = true

autoUpdater.on('update-downloaded', (info) => {
  updateDownloaded = true
  dialog.showMessageBox({
    type: 'info',
    title: 'Iron Log update ready',
    message: `Iron Log ${info.version} has been downloaded.`,
    detail: 'Restart now to install it, or it will install the next time Iron Log closes.',
    buttons: ['Restart Now', 'Later'],
    defaultId: 0,
    cancelId: 1,
  }).then(({ response }) => { if (response === 0) autoUpdater.quitAndInstall() })
})
autoUpdater.on('error', (err) => console.error('autoUpdater error:', err))

// One check at a time, reset in .finally() so a rejection without an 'error'
// event can't leave it stuck (WorkLog learned this the hard way).
let checkInProgress = false
function checkForUpdates(manual) {
  if (isDev) return 'skipped-dev'
  if (updateDownloaded) {
    if (manual) dialog.showMessageBox({ type: 'info', title: 'Iron Log', message: 'Update already downloaded — restart Iron Log to install it.' })
    return
  }
  if (checkInProgress) return
  checkInProgress = true
  const cleanup = () => {
    autoUpdater.off('update-not-available', onNotAvailable)
    autoUpdater.off('update-available', onAvailable)
    autoUpdater.off('error', onError)
  }
  const onAvailable = (info) => {
    cleanup()
    if (manual) dialog.showMessageBox({ type: 'info', title: 'Iron Log', message: `Update found: Iron Log ${info.version}`, detail: "Downloading now — you'll get another prompt when it's ready." })
  }
  const onNotAvailable = () => {
    cleanup()
    if (manual) dialog.showMessageBox({ type: 'info', title: 'Iron Log', message: "You're up to date." })
  }
  const onError = (err) => {
    cleanup()
    if (manual) dialog.showMessageBox({ type: 'error', title: 'Update check failed', message: 'Could not check for updates.', detail: String((err && err.message) || err) })
  }
  autoUpdater.once('update-not-available', onNotAvailable)
  autoUpdater.once('update-available', onAvailable)
  autoUpdater.once('error', onError)
  autoUpdater.checkForUpdates().catch(() => {}).finally(() => { checkInProgress = false })
}

ipcMain.handle('updater:check', () => checkForUpdates(true))
ipcMain.handle('app:get-version', () => app.getVersion())

if (gotSingleInstanceLock) {
  app.on('second-instance', () => {
    if (!mainWindow) return
    if (mainWindow.isMinimized()) mainWindow.restore()
    mainWindow.show()
    mainWindow.focus()
  })
  app.whenReady().then(() => {
    createWindow()
    if (!isDev) {
      setTimeout(() => checkForUpdates(false), 10_000)
      setInterval(() => checkForUpdates(false), 4 * 60 * 60 * 1000)
    }
    app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow() })
  })
}

app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit() })
