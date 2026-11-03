// 随手账 Service Worker
//
// 策略（改了这里记得同步 CACHE_VERSION）：
//   · 页面（导航请求）→ 网络优先，断网时回退缓存里的 index.html
//     这样部署新版本后，用户刷新一次就能拿到新页面，不会被旧缓存锁死
//   · 静态资源（css/js/图标）→ 先用缓存立即渲染，同时后台悄悄取新版
//     下次打开就是新的，既快又跟得上更新
//   · 只处理同源 GET，不碰外部请求

const CACHE_VERSION = 'suishouzhang-v50';
const CORE = [
  './',
  './index.html',
  './style.css',
  './app.js',
  './sync.js',
  './auto.js',
  './favicon.svg',
  './manifest.webmanifest',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/apple-touch-icon.png'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_VERSION).then((cache) => {
      // 单个资源失败不该让整个安装挂掉
      return Promise.all(
        CORE.map((url) => cache.add(url).catch(() => null))
      );
    }).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(
        keys.filter((k) => k !== CACHE_VERSION).map((k) => caches.delete(k))
      ))
      .then(() => self.clients.claim())
  );
});

function isDocument(request) {
  return request.mode === 'navigate' ||
    request.destination === 'document' ||
    (request.headers.get('accept') || '').includes('text/html');
}

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  if (!req.url.startsWith(self.location.origin)) return;

  // 页面：网络优先
  if (isDocument(req)) {
    event.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone();
          caches.open(CACHE_VERSION).then((c) => c.put('./index.html', copy));
          return res;
        })
        .catch(() =>
          caches.match('./index.html').then((hit) => hit || caches.match('./'))
        )
    );
    return;
  }

  /* 代码资源（js/css）：网络优先。
     原来这里是"缓存优先 + 后台更新"，踩过一次真坑：
     部署后 SW 先装好、GitHub Pages 还没构建完，于是把**旧的 app.js** 缓存进了新版本号，
     用户拿到 v40 的 SW + 老代码，界面上看不到新功能，还以为没发版。
     js/css 只有几百 KB，网络优先的代价可以接受；断网时再回落到缓存，离线照样能用。 */
  const isCode = /\.(js|css)$/.test(new URL(req.url).pathname);

  if (isCode) {
    event.respondWith(
      fetch(req, { cache: 'no-store' })
        .then((res) => {
          if (res && res.ok) {
            const copy = res.clone();
            caches.open(CACHE_VERSION).then((c) => c.put(req, copy));
          }
          return res;
        })
        .catch(() => caches.match(req, { ignoreSearch: true }))
    );
    return;
  }

  // 其它静态资源（图标、字体）：缓存优先 + 后台更新
  event.respondWith(
    caches.match(req, { ignoreSearch: true }).then((hit) => {
      const network = fetch(req)
        .then((res) => {
          if (res && res.ok) {
            const copy = res.clone();
            caches.open(CACHE_VERSION).then((c) => c.put(req, copy));
          }
          return res;
        })
        .catch(() => hit);
      return hit || network;
    })
  );
});
