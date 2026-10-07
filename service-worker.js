const PREFIX='rauchfrei-personal:'+self.registration.scope+':';
const CACHE=PREFIX+'1.0.0';
const FILES=['./','./index.html','./rauchfrei-v1.0.0.js','./manifest.webmanifest','./icons/icon-192.png','./icons/icon-512.png'];
self.addEventListener('install',event=>event.waitUntil(caches.open(CACHE).then(c=>c.addAll(FILES)).then(()=>self.skipWaiting())));
self.addEventListener('activate',event=>event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>(k.startsWith(PREFIX)&&k!==CACHE)||k==='rauchfrei-v08').map(k=>caches.delete(k)))).then(()=>self.clients.claim())));
self.addEventListener('fetch',event=>{
  const r=event.request,u=new URL(r.url),scope=new URL(self.registration.scope);
  if(r.method!=='GET'||u.origin!==scope.origin||!u.pathname.startsWith(scope.pathname))return;
  const known=FILES.some(f=>new URL(f,self.registration.scope).href===u.href);
  if(!known)return;
  event.respondWith((async()=>{
    const c=await caches.open(CACHE),cached=await c.match(r);
    if(r.mode!=='navigate'&&cached)return cached;
    try{const response=await fetch(r);if(response.ok){try{await c.put(r,response.clone());}catch{}return response;}if(cached)return cached;return response;}
    catch(error){if(cached)return cached;throw error;}
  })());
});