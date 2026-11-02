// 영상을 일부분씩 내려 준다. Pages 정적 파일은 Range 요청에도 파일 전체(200)를 주는데, 아이폰 사파리는 206 이 아니면 영상을 재생하지 않는다.
export async function onRequest({ request, env }) {
  const res = await env.ASSETS.fetch(new Request(request.url, { method: request.method === 'HEAD' ? 'HEAD' : 'GET' }));
  if (!res.ok) return res;
  const headers = new Headers(res.headers);
  headers.set('Accept-Ranges', 'bytes');
  const m = /^bytes=(\d*)-(\d*)$/.exec(request.headers.get('Range') || '');
  if (!m || (!m[1] && !m[2]) || request.method === 'HEAD') return new Response(res.body, { status: res.status, headers });
  const body = await res.arrayBuffer(), size = body.byteLength;
  const start = m[1] ? Number(m[1]) : Math.max(size - Number(m[2]), 0);
  const end = m[1] && m[2] ? Math.min(Number(m[2]), size - 1) : size - 1;
  if (start >= size || start > end) {
    headers.delete('Content-Length');
    headers.set('Content-Range', `bytes */${size}`);
    return new Response(null, { status: 416, headers });
  }
  headers.set('Content-Range', `bytes ${start}-${end}/${size}`);
  headers.set('Content-Length', String(end - start + 1));
  return new Response(body.slice(start, end + 1), { status: 206, headers });
}
