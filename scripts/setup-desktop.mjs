import {readFile,writeFile,mkdir,access,copyFile,rm} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {randomBytes} from 'node:crypto';

const root=fileURLToPath(new URL('../',import.meta.url));
const args=process.argv.slice(2),sourceIndex=args.indexOf('--source');
if(sourceIndex<0||!args[sourceIndex+1])throw Error('Usage: npm run setup:desktop -- --source /path/to/t3code [--remove]');
const source=resolve(args[sourceIndex+1]),remove=args.includes('--remove');
const entries=[
  ['apps/web/src/main.tsx',"import {startQuestCompanion} from './quest-companion/renderer';\nvoid startQuestCompanion().catch(() => console.warn('Quest companion unavailable'));\n"],
  ['apps/desktop/src/main.ts',"import './quest-companion/native.ts';\n"],
  ['apps/desktop/src/preload.ts',"import './quest-companion/preload.ts';\n"],
];
const files=[['renderer.ts','apps/web/src/quest-companion/renderer.ts'],['client.mjs','apps/web/src/quest-companion/client.mjs'],['client.d.mts','apps/web/src/quest-companion/client.d.mts'],['native.ts','apps/desktop/src/quest-companion/native.ts'],['preload.ts','apps/desktop/src/quest-companion/preload.ts']];
const changes=[];
for(const [name,prefix] of entries){const path=join(source,name),body=await readFile(path,'utf8');changes.push([path,remove?body.replace(prefix,''):body.startsWith(prefix)?body:prefix+body]);}
// Preflight every managed file before modifying a checkout. Never overwrite a user's edits.
for(const [name,destination] of files){
  const original=await readFile(join(root,'integrations/t3code',name),'utf8');
  try{const current=await readFile(join(source,destination),'utf8');if(current!==original)throw Error('Integration file has local edits: '+destination);}catch(error){if(error.code!=='ENOENT')throw error;}
}
for(const [path,body] of changes)await writeFile(path,body);
for(const [name,destination] of files){
  const path=join(source,destination);if(remove){await rm(path,{force:true});continue;}
  await mkdir(resolve(path,'..'),{recursive:true});await copyFile(join(root,'integrations/t3code',name),path);
}
if(remove){console.log('Removed the Quest integration hooks. Rebuild T3 Code to apply.');}
else{
  const directory=join(root,'.state');await mkdir(directory,{recursive:true,mode:0o700});
  const config=join(directory,'desktop-link.json');
  try{await access(config);}catch(error){if(error.code!=='ENOENT')throw error;await writeFile(config,JSON.stringify({url:'ws://127.0.0.1:8788/desktop',token:randomBytes(32).toString('hex')})+'\n',{mode:0o600,flag:'wx'});}
  console.log('Installed source hooks. Build this T3 desktop checkout, then launch it with T3_QUEST_LINK_FILE pointing to:');
  console.log(config);
  console.log('Run npm run start:desktop in t3-quest. Keep the integrated T3 app open. No environment pairing is required.');
}
