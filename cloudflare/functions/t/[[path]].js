// 검색 결과의 작은 미리보기 그림
//  /t/f/<id> : 올린 파일·서식의 첫 쪽 그림 (화면에서 원본으로 만들어 올린 것, KV 'thumb:<id>')
//  /t/s?u=<https 주소> : 사이트·웹앱 화면 그림. 처음이면 공개 화면 찍기 서비스(microlink, 안 되면 WordPress mshots)로
//    480×360 으로 찍어 30일 보관. 못 찍으면 404 → 화면은 그림 칸을 숨기고, 다음에 다시 물어본다
const SHOTS = [
  (u) => 'https://api.microlink.io/?url=' + encodeURIComponent(u) + '&screenshot=true&meta=false&viewport.width=1024&viewport.height=768&viewport.deviceScaleFactor=0.5&screenshot.type=jpeg&embed=screenshot.url',
  (u) => 'https://s.wordpress.com/mshots/v1/' + encodeURIComponent(u) + '?w=480&h=360'
];
const img = (buf, cc) => new Response(buf, { headers: { 'content-type': 'image/jpeg', 'cache-control': cc, 'x-robots-tag': 'noindex' } });
const none = () => new Response('', { status: 404, headers: { 'cache-control': 'no-store' } });

async function sha(s) {
  const d = await crypto.subtle.digest('SHA-1', new TextEncoder().encode(s));
  return [...new Uint8Array(d)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

export async function onRequestGet({ params, env, request }) {
  const parts = [].concat(params.path || []);
  if (parts[0] === 'f') {
    const id = String(parts[1] || '');
    if (!/^[A-Za-z0-9_-]{4,90}$/.test(id)) return none();
    const buf = await env.FILES.get('thumb:' + id, 'arrayBuffer');
    return buf ? img(buf, 'public, max-age=86400') : none();
  }
  if (parts[0] === 's') {
    const u = new URL(request.url).searchParams.get('u') || '';
    if (!/^https:\/\/[^\s]{4,500}$/i.test(u)) return none();
    const key = 'shot:' + (await sha(u));
    const hit = await env.FILES.get(key, 'arrayBuffer');
    if (hit) return img(hit, 'public, max-age=86400');
    // 방금 실패한 주소는 한 시간 동안 다시 찍지 않는다 (무료 찍기 횟수를 아끼려고)
    const cache = caches.default, miss = new Request('https://shot.miss/' + key);
    if (await cache.match(miss)) return none();
    for (const src of SHOTS) {
      try {
        const r = await fetch(src(u), { redirect: 'follow', signal: AbortSignal.timeout(45000) });
        const ct = r.headers.get('content-type') || '';
        if (r.ok && /jpe?g|png|webp/i.test(ct)) {
          const b = await r.arrayBuffer();
          if (b.byteLength > 3000) { await env.FILES.put(key, b, { expirationTtl: 30 * 86400 }); return img(b, 'public, max-age=86400'); }
        }
      } catch (e) { /* 다음 방법 */ }
    }
    // 찍기를 못 하면 그 사이트가 스스로 내건 대표 그림(og:image)을 이틀 동안 대신 쓴다 (그 뒤 다시 찍어 본다)
    try {
      const h = await fetch(u, { redirect: 'follow', headers: { 'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36', accept: 'text/html' }, signal: AbortSignal.timeout(8000) });
      const html = (await h.text()).slice(0, 300000);
      const m = /<meta[^>]+(?:property|name)=["'](?:og:image|twitter:image)["'][^>]*>/i.exec(html);
      const c = m && /content=["']([^"']+)["']/i.exec(m[0]);
      if (c) {
        const iu = new URL(c[1].replace(/&amp;/g, '&'), h.url || u).href;
        const r = await fetch(iu, { signal: AbortSignal.timeout(8000) });
        const ct = r.headers.get('content-type') || '';
        if (r.ok && /jpe?g|png|webp/i.test(ct)) {
          const b = await r.arrayBuffer();
          if (b.byteLength > 2000 && b.byteLength < 600000) { await env.FILES.put(key, b, { expirationTtl: 2 * 86400 }); return new Response(b, { headers: { 'content-type': ct, 'cache-control': 'public, max-age=3600' } }); }
        }
      }
    } catch (e) { /* 없으면 그만 */ }
    await cache.put(miss, new Response('1', { headers: { 'cache-control': 'max-age=900' } }));
    return none();
  }
  return none();
}
