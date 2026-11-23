const C='health-v2';
self.addEventListener('install',e=>{e.waitUntil(caches.open(C).then(c=>c.addAll(['./','./manifest.webmanifest','./icon-192.png'])).catch(()=>{}));self.skipWaiting()});
self.addEventListener('activate',e=>{e.waitUntil(caches.keys().then(ks=>Promise.all(ks.filter(k=>k!==C).map(k=>caches.delete(k)))).then(()=>self.clients.claim()))});
self.addEventListener('fetch',e=>{const u=new URL(e.request.url);if(e.request.method!=='GET'||u.origin!==location.origin||!u.pathname.includes('/health/'))return;
 e.respondWith(fetch(e.request).then(r=>{if(r.ok){const cp=r.clone();caches.open(C).then(c=>c.put(e.request,cp))}return r}).catch(()=>caches.match(e.request).then(r=>r||caches.match('./'))))});
self.addEventListener('push',e=>{let p={};try{p=e.data?e.data.json():{}}catch(_){p={data:{body:e.data?e.data.text():''}}}
 const d=Object.assign({},p.notification||{},p.data||{});
 e.waitUntil(self.registration.showNotification(d.title||'Sức khoẻ',{body:d.body||'',icon:'icon-192.png',badge:'icon-192.png',tag:d.tag||'health',renotify:true,data:{link:d.link||'./'}}))});
self.addEventListener('notificationclick',e=>{e.notification.close();const link=(e.notification.data&&e.notification.data.link)||'./';
 e.waitUntil(self.clients.matchAll({type:'window',includeUncontrolled:true}).then(cs=>{for(const c of cs){if(c.url.includes('/health/')&&'focus' in c)return c.focus()}return self.clients.openWindow(link)}))});
