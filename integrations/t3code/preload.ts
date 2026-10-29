import {contextBridge,ipcRenderer} from 'electron';
contextBridge.exposeInMainWorld('questCompanion',{configuration:()=>ipcRenderer.invoke('quest-companion:configuration').catch(()=>null)});
