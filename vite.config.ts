import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'

function offlineShell(): Plugin {
  return {
    name: 'walkmanbox-offline-shell',
    apply: 'build',
    generateBundle(_options, bundle) {
      const assets = ['./', './index.html', ...Object.keys(bundle).filter(file => /\.(?:js|css|woff2?)$/.test(file)).map(file => `./${file}`)]
      const cacheName = `walkmanbox-shell-${Date.now()}`
      const source = `const CACHE=${JSON.stringify(cacheName)};const ASSETS=${JSON.stringify(assets)};self.addEventListener('install',event=>event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(ASSETS)).then(()=>self.skipWaiting())));self.addEventListener('activate',event=>event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(key=>key.startsWith('walkmanbox-shell-')&&key!==CACHE).map(key=>caches.delete(key)))).then(()=>self.clients.claim())));self.addEventListener('fetch',event=>{const request=event.request;if(request.method!=='GET'||new URL(request.url).origin!==self.location.origin)return;if(request.mode==='navigate'){event.respondWith(fetch(request).catch(()=>caches.match('./index.html')));return}event.respondWith(caches.match(request).then(cached=>cached||fetch(request).then(response=>{if(response.ok){const copy=response.clone();caches.open(CACHE).then(cache=>cache.put(request,copy))}return response})))})`
      this.emitFile({ type: 'asset', fileName: 'sw.js', source })
    },
  }
}

export default defineConfig({
  base: './',
  plugins: [react(), offlineShell()],
})
