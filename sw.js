// 离线资源层：把 assets/art 下的图片请求转接到 base64 分包文本
// （GitHub API 只能安全传文本，图片以 .b64 分片存储在 b64/ 目录）
var CACHE_NAME = 'gokumon-img-v1';
var manifestPromise = null;

function getManifest(scope) {
  if (!manifestPromise) {
    manifestPromise = fetch(scope + 'b64/manifest.json').then(function (r) {
      return r.ok ? r.json() : {};
    }).catch(function () { return {}; });
  }
  return manifestPromise;
}

function mimeOf(path) {
  var p = path.toLowerCase();
  if (p.endsWith('.png')) return 'image/png';
  if (p.endsWith('.webp')) return 'image/webp';
  return 'image/jpeg';
}

self.addEventListener('install', function (e) { self.skipWaiting(); });
self.addEventListener('activate', function (e) { e.waitUntil(self.clients.claim()); });

self.addEventListener('fetch', function (e) {
  var u;
  try { u = new URL(e.request.url); } catch (err) { return; }
  if (!/\.(jpe?g|png|webp)$/i.test(u.pathname)) return; // 非图片，放行
  var scopePath = new URL(self.registration.scope).pathname;
  if (u.pathname.indexOf(scopePath) !== 0) return;
  var rel = u.pathname.slice(scopePath.length); // assets/art/xxx.jpg
  if (rel.indexOf('b64/') === 0) return;

  e.respondWith((async function () {
    var cache = await caches.open(CACHE_NAME);
    var hit = await cache.match(e.request);
    if (hit) return hit;

    var manifest = await getManifest(self.registration.scope);
    var cnt = manifest[rel];
    if (!cnt) return fetch(e.request); // 清单外图片走原路（大概率 404）

    var b64 = '';
    for (var i = 0; i < cnt; i++) {
      var r = await fetch(self.registration.scope + 'b64/' + rel + '.' + i);
      if (!r.ok) return new Response('image part missing', { status: 502 });
      b64 += await r.text();
    }
    var bin = Uint8Array.from(atob(b64), function (c) { return c.charCodeAt(0); });
    var resp = new Response(bin, {
      status: 200,
      headers: { 'Content-Type': mimeOf(rel), 'Cache-Control': 'public, max-age=31536000' }
    });
    cache.put(e.request, resp.clone());
    return resp;
  })());
});
