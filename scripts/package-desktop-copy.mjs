// Package an opt-in local copy. Never modify or launch the installed app or its data.
import {cp,mkdir,mkdtemp,readFile,readdir,rm,stat,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {join,resolve} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {tmpdir} from 'node:os';

const root=fileURLToPath(new URL('../',import.meta.url));
const args=process.argv.slice(2);
const argument=name=>{const i=args.indexOf(name);if(i<0||!args[i+1])throw Error('Required: --source /path/to/built/t3code --app /path/to/T3.app');return resolve(args[i+1]);};
const source=argument('--source'),app=argument('--app');
if(process.platform!=='darwin')throw Error('This packaging helper requires macOS.');
const output=join(root,'.tools','T3 Code Quest.app');
try{await stat(output);throw Error('The output app already exists. Move it aside before packaging another copy.');}catch(error){if(error.code!=='ENOENT')throw error;}
const packages=await readdir(join(source,'node_modules/.pnpm'));
const asarPackage=packages.find(p=>p.startsWith('@electron+asar@4.'));
if(!asarPackage)throw Error('Install the T3 checkout dependencies first.');
const asar=await import(pathToFileURL(join(source,'node_modules/.pnpm',asarPackage,'node_modules/@electron/asar/lib/asar.js')));
const original=join(app,'Contents/Resources/app.asar');
const metadata=JSON.parse(asar.extractFile(original,'package.json'));
const revision=execFileSync('git',['rev-parse','HEAD'],{cwd:source,encoding:'utf8'}).trim();
if(!metadata.t3codeCommitHash||!revision.startsWith(metadata.t3codeCommitHash))throw Error('The source revision must match the installed app exactly.');
for(const name of ['renderer.ts','client.mjs','native.ts','preload.ts']){
  const destination=name==='native.ts'||name==='preload.ts'?'desktop':'web';
  if(await readFile(join(root,'integrations/t3code',name),'utf8')!==await readFile(join(source,`apps/${destination}/src/quest-companion`,name),'utf8'))throw Error('Install the current adapter before building.');
}
const main=await readFile(join(source,'apps/desktop/dist-electron/main.cjs'),'utf8');
const preload=await readFile(join(source,'apps/desktop/dist-electron/preload.cjs'),'utf8');
if(!main.includes('quest-companion:configuration')||!preload.includes('questCompanion'))throw Error('Rebuild the desktop entry points first.');
const assets=join(source,'apps/web/dist/assets');
const scripts=await Promise.all((await readdir(assets)).filter(f=>f.endsWith('.js')).map(f=>readFile(join(assets,f),'utf8')));
if(!scripts.some(s=>s.includes('questCompanion')))throw Error('Rebuild the web renderer first.');
const originalMain=asar.extractFile(original,'apps/desktop/dist-electron/main.cjs').toString();
const publicKey=originalMain.match(/pk_live_[A-Za-z0-9]{20,}/)?.[0];
if(publicKey&&(!main.includes(publicKey)||!scripts.some(s=>s.includes(publicKey))))throw Error('Build with the installed app’s public Clerk configuration to preserve T3 Connect support.');
const staging=await mkdtemp(join(tmpdir(),'t3-quest-package-'));
try{
  asar.extractAll(original,staging);
  const client=join(staging,'apps/server/dist/client');
  await rm(client,{recursive:true,force:true});
  await cp(join(source,'apps/web/dist'),client,{recursive:true,filter:p=>!p.endsWith('.map')});
  await writeFile(join(staging,'apps/desktop/dist-electron/main.cjs'),main);
  await writeFile(join(staging,'apps/desktop/dist-electron/preload.cjs'),preload);
  // An ad-hoc local build cannot claim T3 Tools' signing team or Touch ID group.
  const localMetadata={...metadata,t3codeWebAuthn:{...metadata.t3codeWebAuthn,touchIdKeychainAccessGroup:undefined}};
  await writeFile(join(staging,'package.json'),JSON.stringify(localMetadata,null,2)+'\n');
  await mkdir(join(root,'.tools'),{recursive:true});
  execFileSync('ditto',[app,output]);
  const packed=join(output,'Contents/Resources/app.asar');
  await asar.createPackageWithOptions(staging,packed,{unpackDir:'node_modules',unpack:'**/*.node'});
  const hash=createHash('sha256').update(asar.getRawHeader(packed).headerString).digest('hex');
  execFileSync('python3',['-c','import plistlib,sys; p=sys.argv[1]; d=plistlib.load(open(p,"rb")); d["ElectronAsarIntegrity"]={"Resources/app.asar":{"algorithm":"SHA256","hash":sys.argv[2]}}; plistlib.dump(d,open(p,"wb"))',join(output,'Contents/Info.plist'),hash]);
  const entitlements=join(staging,'local-entitlements.plist');
  execFileSync('python3',['-c','import plistlib,sys; plistlib.dump({k:True for k in ["com.apple.security.cs.allow-jit","com.apple.security.cs.allow-unsigned-executable-memory","com.apple.security.cs.disable-library-validation","com.apple.security.device.audio-input","com.apple.security.device.camera"]},open(sys.argv[1],"wb"))',entitlements]);
  execFileSync('codesign',['--force','--deep','--sign','-','--options','runtime','--entitlements',entitlements,output],{stdio:'pipe'});
  execFileSync('codesign',['--verify','--deep','--strict',output],{stdio:'pipe'});
  const quote=s=>"'"+s.replaceAll("'","'\\''")+"'";
  const executable=execFileSync('/usr/libexec/PlistBuddy',['-c','Print :CFBundleExecutable',join(output,'Contents/Info.plist')],{encoding:'utf8'}).trim();
  await writeFile(join(root,'.tools','Launch T3 Quest Desktop.command'),'#!/bin/zsh\n# Quit the ordinary T3 Code app before launching this integration-enabled copy.\nexport T3CODE_DISABLE_AUTO_UPDATE=1\nexport T3_QUEST_LINK_FILE='+quote(join(root,'.state/desktop-link.json'))+'\nexec '+quote(join(output,'Contents/MacOS',executable))+'\n',{mode:0o755});
  console.log('Prepared and verified '+output+'. The installed app is unchanged.');
}finally{await rm(staging,{recursive:true,force:true});}
