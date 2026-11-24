/** LOCAL TEST ONLY. Fixed localhost upstreams for same-origin browser QA. Never deploy. */
import { createServer, request } from 'node:http';

createServer((incoming,outgoing)=>{
  const pathname=(incoming.url??'/').split('?')[0];
  if(pathname==='/qa/mobile'){
    outgoing.writeHead(200,{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store'});
    outgoing.end('<!doctype html><html><head><title>Local mobile editor QA</title></head><body style="margin:0;background:#292929"><iframe title="Mobile studio" src="/studio/" width="390" height="844" style="border:0;display:block;margin:20px auto"></iframe></body></html>');
    return;
  }
  const fixture=/^\/(auth|rest|storage)\/v1(?:\/|$)/.test(pathname);
  const port=fixture?54555:4323;
  const upstream=request({
    hostname:'127.0.0.1',port,path:incoming.url,method:incoming.method,
    headers:{...incoming.headers,host:'127.0.0.1:4322'},
  },response=>{
    outgoing.writeHead(response.statusCode??502,response.headers);
    response.pipe(outgoing);
    response.on('error',()=>outgoing.destroy());
  });
  upstream.on('error',error=>{
    if(!outgoing.headersSent)outgoing.writeHead(502,{'Content-Type':'text/plain','Cache-Control':'no-store'});
    outgoing.end(`Local QA upstream unavailable: ${error.message}`);
  });
  incoming.on('aborted',()=>upstream.destroy());
  incoming.pipe(upstream);
}).listen(4322,'127.0.0.1',()=>console.log('LOCAL TEST ONLY proxy http://127.0.0.1:4322 -> Astro4323 / Supabase54555'));
