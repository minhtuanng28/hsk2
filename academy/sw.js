const C='academy-v25';
self.addEventListener('install',e=>{self.skipWaiting()});
self.addEventListener('activate',e=>{e.waitUntil(caches.keys().then(ks=>Promise.all(ks.filter(k=>k.startsWith('academy-')&&k!==C).map(k=>caches.delete(k)))).then(()=>self.clients.claim()))});
self.addEventListener('fetch',e=>{
  if(e.request.method!=='GET')return;
  const u=new URL(e.request.url);
  if(/\.(png|webmanifest|ico|svg)$/.test(u.pathname))return;
  if(u.origin===location.origin&&u.pathname.includes('/academy/')){
    e.respondWith(fetch(e.request).then(r=>{const c=r.clone();caches.open(C).then(x=>x.put(e.request,c));return r}).catch(()=>caches.match(e.request,{ignoreSearch:true}).then(r=>r||caches.match('./'))));
  }
});
self.addEventListener('push',e=>{let p={};try{p=e.data?e.data.json():{}}catch(_){p={data:{body:e.data?e.data.text():''}}}
 const d=Object.assign({},p.notification||{},p.data||{});const title=d.title||'Học viện của Tuấn';
 e.waitUntil(self.registration.showNotification(title,{body:d.body||'',icon:'icon-192.png',badge:'icon-192.png',tag:d.tag||'acad',renotify:true,data:{link:d.link||'./'}}))});
self.addEventListener('notificationclick',e=>{e.notification.close();const link=(e.notification.data&&e.notification.data.link)||'./';
 e.waitUntil(self.clients.matchAll({type:'window',includeUncontrolled:true}).then(cs=>{for(const c of cs){if(c.url.includes('/academy/')&&'focus' in c){if(link.includes('room=')&&c.navigate)c.navigate(link).catch(()=>{});return c.focus()}}return self.clients.openWindow(link)}))});
