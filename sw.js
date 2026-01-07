/* sw.js: 更新まわりの挙動を単純化するため、キャッシュは行わない */
self.addEventListener('install', (event) => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener('fetch', (event) => {
  // 何もせずネットワークへ
});