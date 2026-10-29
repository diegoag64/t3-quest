// @effect-diagnostics nodeBuiltinImport:off - Optional Electron IPC bootstrap reads only the explicit companion configuration, before the application Effect runtime starts.
import {ipcMain} from 'electron';
import {readFile,stat} from 'node:fs/promises';

// Explicitly opt in for this launch. Do not inspect T3's connection catalog or secrets.
const linkFile=process.env.T3_QUEST_LINK_FILE;
if(linkFile)ipcMain.handle('quest-companion:configuration',async event=>{
  const frame=event.senderFrame;
  if(!frame||frame!==event.sender.mainFrame)return null;
  const origin=new URL(frame.url);
  const trusted=(['t3code:','t3code-dev:'].includes(origin.protocol)&&origin.hostname==='app')||(['http:','https:'].includes(origin.protocol)&&['127.0.0.1','localhost'].includes(origin.hostname));
  if(!trusted)return null;
  const info=await stat(linkFile);
  if(!info.isFile()||info.size>4096||(process.platform!=='win32'&&(info.mode&0o077)!==0))throw Error('Companion configuration must be private.');
  const config=JSON.parse(await readFile(linkFile,'utf8'));
  const url=new URL(config.url);
  if(url.protocol!=='ws:'||url.hostname!=='127.0.0.1'||url.pathname!=='/desktop'||url.search||url.hash||url.username||url.password||! /^[a-f0-9]{64}$/.test(config.token))throw Error('Invalid companion configuration');
  return {url:config.url,token:config.token};
});
