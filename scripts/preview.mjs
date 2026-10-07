import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fixtureRequest } from './fixture.mjs';
const root=path.resolve(import.meta.dirname,'../extension/app');
http.createServer(async(req,res)=>{
  const url=new URL(req.url,'http://127.0.0.1');
  if(url.pathname==='/fixture/request'){
    let chunks=[],bytes=0;for await(const chunk of req){bytes+=chunk.length;if(bytes>2_000_000){res.writeHead(413);res.end();return;}chunks.push(chunk);}
    res.setHeader('Content-Type','application/json; charset=utf-8');
    try{res.end(JSON.stringify(fixtureRequest(JSON.parse(Buffer.concat(chunks).toString()))));}catch(e){res.end(JSON.stringify({error:e.message}));}return;
  }
  const file=path.resolve(root,'.'+(url.pathname==='/'?'/index.html':decodeURIComponent(url.pathname)));
  if(!file.startsWith(root+path.sep)||!fs.existsSync(file)||!fs.statSync(file).isFile()){res.writeHead(404);res.end();return;}
  const mime={'.js':'text/javascript','.mjs':'text/javascript','.css':'text/css','.html':'text/html','.wasm':'application/wasm','.gz':'application/octet-stream','.json':'application/json','.ttf':'font/ttf','.txt':'text/plain'};
  res.setHeader('Content-Type',mime[path.extname(file)]||'application/octet-stream');res.setHeader('Cache-Control','no-store');res.setHeader('Content-Security-Policy',"script-src 'self' 'wasm-unsafe-eval'; object-src 'self'; worker-src 'self'; frame-src 'self' blob:; connect-src 'self'");fs.createReadStream(file).pipe(res);
}).listen(8790,'127.0.0.1',()=>console.log('ok-online judge preview: http://127.0.0.1:8790/'));
