import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import {fileURLToPath, pathToFileURL} from 'node:url';
import {join} from 'node:path';

const root=fileURLToPath(new URL('../',import.meta.url));
const assets=new Map([
  ...['panel.css','panel.js','codex.svg','claude.svg','vendor/marked.js','vendor/purify.js'].map(name=>['/'+name,'app/src/main/assets/ui/'+name]),
  ['/preview-client.mjs','scripts/preview-client.mjs'],['/fixture.mjs','tests/fixtures/workspace.mjs'],
]);
export function previewServer(){
  return createServer(async(req,res)=>{
    const url=new URL(req.url,'http://localhost');
    if(req.method!=='GET'){res.writeHead(405);res.end();return;}
    if(url.pathname==='/'){
      res.setHeader('Content-Type','text/html');
      res.end('<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>T3 Quest · synthetic preview</title><link rel="stylesheet" href="/panel.css"></head><body><div id="app"></div><script src="/vendor/marked.js"></script><script src="/vendor/purify.js"></script><script src="/panel.js"></script><script type="module" src="/preview-client.mjs"></script></body></html>');return;
    }
    const file=assets.get(url.pathname);if(!file){res.writeHead(404);res.end();return;}
    try{res.setHeader('Content-Type',file.endsWith('.css')?'text/css':file.endsWith('.svg')?'image/svg+xml':'text/javascript');res.setHeader('Cache-Control','no-store');res.end(await readFile(join(root,file)));}
    catch{res.writeHead(500);res.end('Preview asset unavailable');}
  });
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
  previewServer().listen(8790,'127.0.0.1',()=>console.log('Synthetic Quest preview: http://127.0.0.1:8790 (no real messages, audio, or credentials)'));
}
