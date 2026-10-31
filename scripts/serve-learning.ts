import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { resolve, sep, extname } from 'node:path';
const root=resolve(process.argv[2]??'dist/learning');
const port=Number(process.env.PORT??4322);
if (!Number.isInteger(port) || port < 0 || port > 65535) throw new Error('PORT must be an integer between 0 and 65535');
await readFile(resolve(root,'chapter.html')); // Build first; fail clearly if output is absent.
const server=createServer(async(req,res)=> {
  try {
    const url=new URL(req.url??'/','http://localhost');
    const path=decodeURIComponent(url.pathname==='/'?'/chapter.html':url.pathname);
    const file=resolve(root,'.'+path);
    if(!file.startsWith(root+sep)||!['.html','.png'].includes(extname(file))) {res.writeHead(404);res.end('Not found');return;}
    const data=await readFile(file);
    res.writeHead(200,{'Content-Type':extname(file)==='.html'?'text/html; charset=utf-8':'image/png','Cache-Control':'no-store'});res.end(data);
  } catch {res.writeHead(404);res.end('Not found');}
});
let candidate=port;
server.on('error',(error: NodeJS.ErrnoException)=> {
  if (error.code==='EADDRINUSE' && candidate < 65535) {
    candidate++;
    server.listen(candidate,'127.0.0.1');
    return;
  }
  throw error;
});
server.listen(candidate,'127.0.0.1',()=> {
  const address=server.address();
  if (address && typeof address !== 'string') console.log(`Learning demo: http://127.0.0.1:${address.port} (Ctrl+C to stop)`);
});
