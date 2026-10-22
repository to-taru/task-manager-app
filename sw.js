// タスク管理表 Service Worker v1
// 役割：オフラインでもアプリのUIが起動できるようにHTMLとアイコンをキャッシュ
// データ（GitHub API経由のdata.json）はオンライン時のみ取得

const CACHE_NAME = 'task-manager-v2-2026-05-12';
const CORE_ASSETS = [
  './',
  './index.html',
  './manifest.json',
  './icon-192.png',
  './icon-512.png',
  './icon-180.png'
];

// インストール時：基本ファイルをキャッシュ
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(CORE_ASSETS))
      .catch((err) => console.warn('[SW] cache addAll partial fail:', err))
  );
  self.skipWaiting();
});

// 有効化時：古いキャッシュを削除
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))
      )
    )
  );
  self.clients.claim();
});

// フェッチ時の戦略
self.addEventListener('fetch', (event) => {
  const req = event.request;
  const url = new URL(req.url);

  // GETのみ対応
  if (req.method !== 'GET') return;

  // GitHub APIは絶対にキャッシュしない（常に最新が必要）
  if (url.hostname === 'api.github.com') {
    return; // ブラウザ標準動作（フェッチ＝オンライン時のみ成功）
  }

  // /api/* もキャッシュしない（閲覧モードは常に最新データ）
  if (url.pathname.startsWith('/api/')) {
    return;
  }

  // HTMLナビゲーション：ネットワーク優先 → 失敗時キャッシュ
  // （更新が即反映されるように）
  if (req.mode === 'navigate' || (req.headers.get('accept') || '').includes('text/html')) {
    event.respondWith(
      fetch(req)
        .then((res) => {
          const clone = res.clone();
          caches.open(CACHE_NAME).then((c) => c.put(req, clone));
          return res;
        })
        .catch(() =>
          caches.match(req).then((cached) => cached || caches.match('./index.html') || caches.match('./'))
        )
    );
    return;
  }

  // フォント類（Google Fonts）：キャッシュ優先
  if (url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com') {
    event.respondWith(
      caches.match(req).then((cached) => {
        if (cached) return cached;
        return fetch(req).then((res) => {
          if (res.ok) {
            const clone = res.clone();
            caches.open(CACHE_NAME).then((c) => c.put(req, clone));
          }
          return res;
        }).catch(() => cached);
      })
    );
    return;
  }

  // 同一オリジンの静的ファイル：キャッシュ優先
  if (url.origin === self.location.origin) {
    event.respondWith(
      caches.match(req).then((cached) => {
        if (cached) return cached;
        return fetch(req).then((res) => {
          if (res.ok && res.type === 'basic') {
            const clone = res.clone();
            caches.open(CACHE_NAME).then((c) => c.put(req, clone));
          }
          return res;
        });
      })
    );
    return;
  }

  // それ以外はネットワーク
});

// メッセージ受信（強制�