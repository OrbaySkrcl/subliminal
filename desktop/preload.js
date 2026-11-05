/* Kontrol penceresi köprüsü: arayüz yalnızca bu dar API ile ana sürece ulaşır. */
'use strict';

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('esikaltiDesktop', {
  platform: process.platform,
  setConfig: (payload) => ipcRenderer.invoke('overlay:set-config', payload),
  start: () => ipcRenderer.invoke('overlay:start'),
  stop: () => ipcRenderer.invoke('overlay:stop'),
  displays: () => ipcRenderer.invoke('overlay:displays'),
  getLogin: () => ipcRenderer.invoke('app:get-login'),
  setLogin: (on) => ipcRenderer.invoke('app:set-login', !!on),
  onStatus: (cb) => {
    const handler = (_e, st) => cb(st);
    ipcRenderer.on('overlay:status', handler);
    return () => ipcRenderer.removeListener('overlay:status', handler);
  }
});
