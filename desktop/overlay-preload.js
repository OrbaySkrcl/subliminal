/* Overlay penceresi köprüsü: ayarları alır, ölçümleri gönderir. */
'use strict';

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('overlayBridge', {
  onConfig: (cb) => ipcRenderer.on('overlay:config', (_e, payload) => cb(payload)),
  sendStats: (stats) => ipcRenderer.send('overlay:stats', stats)
});
