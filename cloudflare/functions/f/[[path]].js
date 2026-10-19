// /f/<파일 id>/<파일 이름>: 올린 파일을 주소로 바로 내준다.
// Microsoft Office 무료 뷰어가 엑셀을 원본(Excel) 그대로 보여 주고 인쇄하려면 공개 주소가 필요해서 둔다.
// id 는 추측할 수 없는 값이다. tmp_ 로 시작하면 사이트에서 고친 뒤 잠깐 올린 파일(1시간 뒤 지워짐)
export async function onRequestGet({ params, env }) {
  const parts = [].concat(params.path || []);
  const id = String(parts[0] || '');
  if (!/^[A-Za-z0-9_-]{6,80}$/.test(id)) return new Response('없는 파일이에요.', { status: 404 });
  const name = decodeURIComponent(parts.slice(1).join('/') || 'file');
  let mime = 'application/octet-stream';
  if (!id.startsWith('tmp_')) {
    const info = await env.DB.prepare('SELECT name, mime FROM files WHERE id = ?').bind(id).first();
    if (!info) return new Response('없는 파일이에요.', { status: 404 });
    mime = info.mime || mime;
  } else if (/\.xlsx$/i.test(name)) mime = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
  const buf = await env.FILES.get(id, 'arrayBuffer');
  if (!buf) return new Response('없는 파일이에요. (잠깐 올린 파일은 1시간 뒤 지워져요)', { status: 404 });
  return new Response(buf, {
    headers: {
      'content-type': mime,
      'content-disposition': "inline; filename*=UTF-8''" + encodeURIComponent(name),
      'cache-control': id.startsWith('tmp_') ? 'private, max-age=600' : 'public, max-age=3600',
      'access-control-allow-origin': '*',
      'x-robots-tag': 'noindex',
      ...(/html/i.test(mime) ? { 'content-security-policy': 'sandbox allow-scripts allow-forms allow-modals allow-popups allow-popups-to-escape-sandbox allow-downloads allow-pointer-lock' } : {})
    }
  });
}
