const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  loadData: () => ipcRenderer.invoke('load-data'),
  saveData: (data) => ipcRenderer.invoke('save-data', data),
  getDataDir: () => ipcRenderer.invoke('get-data-dir'),
  exportData: (data, filename) => ipcRenderer.invoke('export-data', data, filename),
  importData: (filePath) => ipcRenderer.invoke('import-data', filePath),
  onAppQuitting: (callback) => ipcRenderer.on('app-quitting', callback),
  onMenuPushCloud: (callback) => ipcRenderer.on('menu-push-cloud', callback),
  onMenuPullCloud: (callback) => ipcRenderer.on('menu-pull-cloud', callback),
});
