// api.js: 우리학교 길잡이 학교 저장소 (Cloudflare Pages Functions + D1 + KV)
// 예전 구글 시트 저장소(src/apps-script/Code.gs)와 같은 요청·응답 형식을 쓴다. 화면(store.js SheetsStore)은 그대로.
//  - D1(DB): 문서·분류·수업 자료·도구·신고·설정·관리자 토큰
//  - KV(FILES): 올린 파일 내용 (파일 정보는 D1 files 표)
// 표마다 id + data(JSON) 로 둔다. data 의 칸 이름은 예전 시트의 칸 이름과 같다.

const TABLES = ['docs', 'cats', 'reports', 'lessons', 'tools'];
const CATEGORIES = [
  { id: 'rules', name: '규정집', icon: 'book-2' },
  { id: 'academic', name: '학사·성적', icon: 'school' }, { id: 'attendance', name: '출결', icon: 'calendar-check' },
  { id: 'duty', name: '복무·여비', icon: 'briefcase' }, { id: 'field', name: '체험학습', icon: 'map-2' },
  { id: 'life', name: '학생 생활', icon: 'users' }, { id: 'event', name: '행사', icon: 'confetti' },
  { id: 'forms', name: '서식·서류', icon: 'file-text' }, { id: 'guide', name: '학교 생활 안내', icon: 'directions' }
];
const ADMIN_ACTIONS = ['missDel', 'restoreSite', 'adminData', 'review', 'saveCats', 'resolveReport', 'restoreDoc', 'saveTool', 'deleteTool', 'saveSettings', 'exportAll', 'importDocs'];
const BODY_MAX = 300000;

class Fail extends Error { constructor(msg, code) { super(msg); this.code = code || ''; } }
const fail = (msg, code) => { throw new Fail(msg, code); };
const json = (o, status) => new Response(JSON.stringify(o), { status: status || 200, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' } });
const str = (v, max) => String(v == null ? '' : v).slice(0, max || 200);
const parseJ = (s, d) => { try { return s ? (typeof s === 'string' ? JSON.parse(s) : s) : d; } catch (e) { return d; } };
const splitList = (s) => String(s || '').split(/[,，]/).map((x) => x.trim()).filter(Boolean);
const uid = (p) => p + crypto.randomUUID().replace(/-/g, '').slice(0, 10);
const today = () => new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 10);   // 한국 날짜
const day = (v) => String(v || '').slice(0, 10);

/* ───── DB ───── */
function Db(env) {
  const D = env.DB;
  const cache = {};
  return {
    async all(t) { if (cache[t]) return cache[t]; const r = await D.prepare(`SELECT data FROM ${t} ORDER BY rowid`).all(); return (cache[t] = r.results.map((x) => JSON.parse(x.data))); },
    async find(t, id) { if (!id) return null; const r = await D.prepare(`SELECT data FROM ${t} WHERE id = ?`).bind(String(id)).first(); return r ? JSON.parse(r.data) : null; },
    async save(t, o) { delete cache[t]; await D.prepare(`INSERT INTO ${t} (id, data) VALUES (?, ?) ON CONFLICT(id) DO UPDATE SET data = excluded.data`).bind(String(o.id), JSON.stringify(o)).run(); },
    async insert(t, o) { return this.save(t, o); },
    async remove(t, id) { delete cache[t]; await D.prepare(`DELETE FROM ${t} WHERE id = ?`).bind(String(id)).run(); },
    async prop(k) { const r = await D.prepare('SELECT v FROM props WHERE k = ?').bind(k).first(); return r ? r.v : null; },
    async setProp(k, v) { await D.prepare('INSERT INTO props (k, v) VALUES (?, ?) ON CONFLICT(k) DO UPDATE SET v = excluded.v').bind(k, String(v)).run(); },
    async meta(k) { const r = await D.prepare('SELECT v, exp FROM meta WHERE k = ?').bind(k).first(); if (!r) return null; if (r.exp && r.exp < Date.now()) return null; return r.v; },
    async setMeta(k, v, ttlSec) { await D.prepare('INSERT INTO meta (k, v, exp) VALUES (?, ?, ?) ON CONFLICT(k) DO UPDATE SET v = excluded.v, exp = excluded.exp').bind(k, String(v), Date.now() + ttlSec * 1000).run(); }
  };
}

/* ───── 비밀번호 (예전 저장소와 같은 방식: base64(SHA-256(salt|pw))) ───── */
async function hash(pw, salt) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(salt + '|' + pw));
  let s = ''; new Uint8Array(buf).forEach((b) => { s += String.fromCharCode(b); }); return btoa(s);
}
async function rateLimit(db, ip) {
  const k = 'rl_' + (ip || 'x') + '_' + Math.floor(Date.now() / 3600e3);
  const n = Number(await db.meta(k) || 0);
  if (n >= 120) fail('짧은 시간에 너무 많이 올렸어요. 잠시 뒤 다시 해 주세요.', 'RATE');
  await db.setMeta(k, n + 1, 3600);
}
async function guard(db, kind) { if (Number(await db.meta('fail_' + kind) || 0) >= 30) fail('틀린 시도가 많아 10분 동안 막았어요. 잠시 뒤 다시 해 주세요.', 'LOCKED'); }
async function strike(db, kind) { await db.setMeta('fail_' + kind, Number(await db.meta('fail_' + kind) || 0) + 1, 600); }

/* ───── 입구 ───── */
export async function onRequestPost({ request, env }) {
  try {
    const req = await request.json();
    req._ip = request.headers.get('cf-connecting-ip') || '';
    return json({ ok: true, result: await handle(env, req) });
  } catch (err) {
    return json({ ok: false, error: err instanceof Fail ? err.message : '요청을 처리하지 못했어요. (' + (err && err.message || err) + ')', code: err.code || '' });
  }
}
export async function onRequestGet({ env }) {
  const db = Db(env);
  const n = {};
  for (const t of ['docs', 'lessons', 'cats']) n[t] = (await db.all(t)).length;
  return json({ ok: true, result: { service: 'gil', store: 'cloudflare', initialized: !!(await db.prop('schoolName')), counts: n } });
}

async function handle(env, req) {
  const db = Db(env);
  const a = req.action, p = req.payload || {};
  if (a === 'migrate') return migrate(env, db, req);
  const isInit = !!(await db.prop('schoolName'));
  // 접속 코드: 처음 설정에서 코드를 정한 학교(requireCode=1)만 묻는다. 예전부터 코드 없이 쓰던 학교는 그대로
  const needsCode = isInit && (await db.prop('requireCode')) === '1';
  if (a === 'info') return { schoolName: (await db.prop('schoolName')) || '', initialized: isInit, needsCode };
  if (a === 'setup') return setup(db, p, isInit);
  if (!isInit) fail('아직 학교 정보가 없어요. 길잡이의 학교 개설 화면에서 연결해 주세요.', 'NOT_INIT');
  if (a === 'adminLogin') return adminLogin(db, p.pw);
  if (ADMIN_ACTIONS.includes(a)) { await checkToken(db, req.token); return admin(db, a, p); }
  if (needsCode) {
    await guard(db, 'code');
    if (String(req.code || '') !== String((await db.prop('accessCode')) || '')) { await strike(db, 'code'); fail('접속 코드가 맞지 않아요.', 'BAD_CODE'); }
  }
  // 학교 코드 없이 누구나 읽고 고친다. 쓰기는 같은 곳(IP)에서 한 시간에 120번까지
  if (['saveDoc', 'report', 'uploadFile', 'addLesson', 'updateLesson', 'removeLesson', 'saveSite', 'removeSite', 'saveSiteOrder', 'tempFile', 'thumb', 'proposeTool'].includes(a)) await rateLimit(db, req._ip);
  if (a === 'load') { const d = await load(db); d.neis = !!(env.NEIS_KEY && env.NEIS_SCHUL); return d; }
  if (a === 'neis') return neis(env, p);
  if (a === 'hit') { const t = p.kind === 'lesson' ? 'lessons' : 'docs'; const d = await db.find(t, p.id); if (d) { d.views = (Number(d.views) || 0) + 1; await db.save(t, d); } return true; }
  if (a === 'miss') return addMiss(db, p.q);
  if (a === 'thumb') return saveThumb(env, p);
  // 도구 탭: 누구나 더하고 고친다. 바로 보이고 관리자가 확인하기 전까지 '승인 전'
  if (a === 'proposeTool') {
    const n = toolIn(p), old = p.id ? await db.find('tools', str(p.id, 40)) : null;
    if (old && !old.hidden) { const r = parseJ(old.review, null); n.id = old.id; n.review = JSON.stringify(r && r.type ? Object.assign(r, { at: today() }) : { type: 'edit', at: today(), base: toolOut(old) }); }
    else { n.id = uid('t'); n.review = JSON.stringify({ type: 'new', at: today() }); }
    await db.save('tools', n); return { id: n.id };
  }
  if (a === 'frame') return frameOk(String(p.url || ''));
  if (a === 'saveDoc') return saveDoc(db, p);
  if (a === 'report') return report(db, p);
  if (a === 'uploadFile') return uploadFile(env, p);
  if (a === 'getFile') return getFile(env, p);
  // 사이트에서 고친 엑셀을 Excel 뷰어로 보여 주려고 잠깐 올려 둔다 (1시간 뒤 지워짐)
  if (a === 'tempFile') {
    const b64 = String(p.b64 || '');
    if (!/\.xlsx$/i.test(String(p.name || '')) || !b64) fail('엑셀(xlsx) 파일만 돼요.');
    if (b64.length > 14 * 1024 * 1024) fail('10MB가 넘는 파일은 Excel 화면으로 볼 수 없어요.');
    const id = 'tmp_' + uid('x') + Math.random().toString(36).slice(2, 10);
    await env.FILES.put(id, Uint8Array.from(atob(b64), (c) => c.charCodeAt(0)), { expirationTtl: 3600 });
    return { id };
  }
  if (a === 'addLesson') { const l = lessonIn(p); l.id = uid('l'); l.date = today(); await db.insert('lessons', l); return true; }
  if (a === 'updateLesson') {
    const l = await db.find('lessons', p.id); if (!l) fail('자료를 찾을 수 없어요.');
    const n = lessonIn(p.item || {}, !!l.file);
    if (n.file && l.file) { const h = parseJ(l.history, []); h.push(parseJ(l.file, {})); l.history = JSON.stringify(h.slice(-10)); const f = JSON.parse(n.file); f.ver = (parseJ(l.file, {}).ver || 1) + 1; n.file = JSON.stringify(f); }
    ['subject', 'kind', 'title', 'desc', 'course', 'maker', 'url', 'icon'].forEach((k) => { l[k] = n[k]; });
    if (n.file) l.file = n.file;
    if (l.kind === 'app' && !n.file && !n.url && !l.file) fail('웹앱 파일을 올리거나 https:// 주소를 넣어 주세요.');
    l.date = today(); await db.save('lessons', l); return true;
  }
  if (a === 'removeLesson') { const l = await db.find('lessons', p.id); if (l) { l.hidden = 'O'; await db.save('lessons', l); } return true; }
  if (a === 'saveSite' || a === 'removeSite') {
    const e = parseJ(await db.prop('siteEdits'), {});
    const key = str(p.key, 60) || uid('s');
    e[key] = a === 'removeSite' ? Object.assign({}, e[key] || {}, { hidden: true, at: today() }) : siteIn(p);   // 빼도 내용은 남겨 관리자가 되살린다
    if (Object.keys(e).length > 300) fail('사이트를 더 넣을 수 없어요. 관리자에게 알려 주세요.');
    await db.setProp('siteEdits', JSON.stringify(e)); return { key };
  }
  if (a === 'saveSiteOrder') {
    const o = parseJ(await db.prop('siteOrder'), {});
    const g = str(p.group, 20).trim(); if (!g) fail('묶음을 알 수 없어요.');
    o[g] = (p.keys || []).slice(0, 80).map((k) => str(k, 60));
    if (Object.keys(o).length > 60) fail('묶음이 너무 많아요.');
    await db.setProp('siteOrder', JSON.stringify(o)); return true;
  }
  fail('알 수 없는 요청이에요.');
}
// 유용한 사이트: 기본 목록(sites.js)에서 고치거나 더한 것만 key 별로 저장한다
function siteIn(p) {
  const url = str(p.url, 300).trim();
  if (!/^https:\/\//i.test(url)) fail('주소는 https:// 로 시작해야 해요.');
  const name = str(p.name, 30).trim(); if (!name) fail('사이트 이름을 적어 주세요.');
  return { group: str(p.group, 20).trim() || '기타', for: str(p.for, 20).trim() || '공통', icon: /^[a-z0-9-]{2,30}$/.test(String(p.icon || '')) ? p.icon : '', name, url, desc: str(p.desc, 80).trim(), at: today() };
}

/* ───── 나이스(NEIS) 급식·학사일정: 키는 서버 비밀값(NEIS_KEY)에만, 학교 코드는 wrangler.toml [vars] ─────
   from~to(YYYYMMDD, 31일까지)의 급식과 학사일정을 한 번에 돌려준다. 같은 요청은 30분 동안 Cloudflare 캐시에서 */
const ALLERGY = ['', '난류', '우유', '메밀', '땅콩', '대두', '밀', '고등어', '게', '새우', '돼지고기', '복숭아', '토마토', '아황산류', '호두', '닭고기', '쇠고기', '오징어', '조개류', '잣'];
async function neis(env, p) {
  if (!env.NEIS_KEY || !env.NEIS_SCHUL) fail('나이스 연결이 아직 안 되어 있어요.');
  const ymd = (v) => String(v || '').replace(/\D/g, '').slice(0, 8);
  const from = ymd(p.from), to = ymd(p.to);
  if (from.length !== 8 || to.length !== 8 || to < from) fail('날짜를 확인해 주세요.');
  const span = (Date.UTC(+to.slice(0, 4), +to.slice(4, 6) - 1, +to.slice(6)) - Date.UTC(+from.slice(0, 4), +from.slice(4, 6) - 1, +from.slice(6))) / 864e5;
  if (span > 31) fail('한 번에 31일까지 볼 수 있어요.');
  const cache = caches.default, ck = new Request('https://neis.cache/' + env.NEIS_SCHUL + '/' + from + '-' + to);
  const hit = await cache.match(ck); if (hit) return hit.json();
  const q = 'KEY=' + encodeURIComponent(String(env.NEIS_KEY).trim()) + '&Type=json&pIndex=1&pSize=200&ATPT_OFCDC_SC_CODE=' + encodeURIComponent(env.NEIS_ATPT || '') + '&SD_SCHUL_CODE=' + encodeURIComponent(env.NEIS_SCHUL);
  const get = async (svc, extra) => {
    const r = await fetch('https://open.neis.go.kr/hub/' + svc + '?' + q + extra, { cf: { cacheTtl: 0 } });
    const j = await r.json().catch(() => ({}));
    const block = j[svc];
    if (!block) { const code = j.RESULT && j.RESULT.CODE; if (code === 'INFO-200') return []; fail('나이스에서 정보를 받지 못했어요. (' + (j.RESULT && j.RESULT.MESSAGE || r.status) + ')'); }
    return (block[1] && block[1].row) || [];
  };
  const [mrows, srows] = await Promise.all([get('mealServiceDietInfo', '&MLSV_FROM_YMD=' + from + '&MLSV_TO_YMD=' + to), get('SchoolSchedule', '&AA_FROM_YMD=' + from + '&AA_TO_YMD=' + to)]);
  const meals = mrows.map((m) => ({
    date: m.MLSV_YMD, type: m.MMEAL_SC_NM, kcal: String(m.CAL_INFO || '').replace(/\s*kcal/i, '').trim(),
    dishes: String(m.DDISH_NM || '').split(/<br\s*\/?>/i).map((x) => x.trim()).filter(Boolean).map((x) => {
      const mm = /^(.*?)\s*\(([\d.\s]+)\)\s*$/.exec(x);
      const nums = mm ? mm[2].split('.').map((n) => +n).filter((n) => n > 0 && n < ALLERGY.length) : [];
      return { name: (mm ? mm[1] : x).replace(/\s+/g, ' ').trim(), allergy: nums.map((n) => ALLERGY[n]) };
    })
  }));
  const grades = (e) => ['ONE', 'TW', 'THREE'].map((k, i) => (e[k + '_GRADE_EVENT_YN'] === 'Y' ? i + 1 : 0)).filter(Boolean);
  const events = srows.filter((e) => e.EVENT_NM && e.EVENT_NM !== '토요휴업일').map((e) => ({ date: e.AA_YMD, name: e.EVENT_NM, kind: e.SBTR_DD_SC_NM === '해당없음' ? '' : e.SBTR_DD_SC_NM, grades: grades(e) }));
  const out = { from, to, meals, events };
  await cache.put(ck, new Response(JSON.stringify(out), { headers: { 'content-type': 'application/json', 'cache-control': 'max-age=1800' } }));
  return out;
}

/* ───── 처음 연결 ───── */
async function setup(db, p, isInit) {
  if (isInit) fail('이미 만들어진 저장소예요. 학교 이름·코드는 관리자 화면에서 바꿀 수 있어요.', 'ALREADY');
  const name = str(p.schoolName, 30).trim(), code = str(p.accessCode, 30).trim(), pw = String(p.adminPassword || '');
  if (!name) fail('학교 이름을 적어 주세요.');
  if (pw.length < 8) fail('관리자 비밀번호는 8자 이상으로 해 주세요.');
  const salt = crypto.randomUUID();
  if (code && code.length < 4) fail('접속 코드는 4자 이상으로 해 주세요.');
  await db.setProp('accessCode', code); await db.setProp('salt', salt); await db.setProp('pwHash', await hash(pw, salt));
  if (code) await db.setProp('requireCode', '1');   // 새로 만든 학교는 접속 코드를 정말로 묻는다
  await db.setProp('schoolName', name);
  return { ok: true };
}

/* ───── 읽기 ───── */
async function load(db) {
  return {
    school: { name: await db.prop('schoolName') },
    categories: await cats(db),
    docs: (await db.all('docs')).filter((d) => d.status === 'published').map(docOut),
    tools: (await db.all('tools')).map(toolOut),
    subjects: parseJ(await db.prop('subjects'), null),
    hiddenClassTools: parseJ(await db.prop('hiddenClassTools'), []),
    siteEdits: parseJ(await db.prop('siteEdits'), {}),
    siteOrder: parseJ(await db.prop('siteOrder'), {}),
    lessons: (await db.all('lessons')).filter((l) => !l.hidden).map((l) => ({ id: l.id, subject: l.subject, kind: l.kind, title: l.title, desc: l.desc, course: l.course, maker: l.maker, url: l.url, icon: l.icon || '', file: parseJ(l.file, null), date: day(l.date), views: Number(l.views) || 0 })),
    forms: {}
  };
}
async function cats(db) {
  const rows = await db.all('cats'), byId = {};
  rows.forEach((r) => { byId[r.id] = r; });
  const list = CATEGORIES.map((c, i) => { const r = byId[c.id]; return r ? { id: c.id, name: r.name || c.name, icon: r.icon || c.icon, hidden: r.hidden, order: Number(r.order) || (i + 1) } : { id: c.id, name: c.name, icon: c.icon, order: i + 1 }; });
  rows.forEach((r) => { if (!CATEGORIES.some((c) => c.id === r.id)) list.push({ id: r.id, name: r.name, icon: r.icon || 'folder', hidden: r.hidden, order: Number(r.order) || 900, review: parseJ(r.review, null) }); });
  return list.filter((c) => !c.hidden).sort((a, b) => a.order - b.order).map((c) => ({ id: c.id, name: c.name, icon: c.icon, review: c.review || null }));
}
function lessonIn(p, hasFile) {
  const f = p.file ? { name: str(p.file.name, 100), ftype: str(p.file.ftype, 6), fileId: str(p.file.fileId, 80), url: str(p.file.url, 300), size: Number(p.file.size) || 0, text: str(p.file.text, 40000) } : null;
  if (p.kind === 'app' && !f && !hasFile && !/^https:\/\//i.test(String(p.url || '')) && !/^(lessons|apps)\//.test(String(p.url || ''))) fail('웹앱 파일을 올리거나 https:// 주소를 넣어 주세요.');
  return { subject: str(p.subject, 20), kind: p.kind === 'app' ? 'app' : 'file', title: str(p.title, 60), desc: str(p.desc, 120), course: str(p.course, 40), maker: str(p.maker, 30), url: str(p.url, 500), icon: /^[a-z0-9-]{2,30}$/.test(String(p.icon || '')) ? p.icon : '', file: f ? JSON.stringify(f) : '' };
}
function docOut(d) {
  return {
    id: d.id, title: d.title, category: d.category, aliases: splitList(d.aliases), body: String(d.body || '') + String(d.body2 || ''), owner: d.owner, updatedAt: day(d.updatedAt), views: Number(d.views) || 0, status: d.status, attachments: parseJ(d.attachments, []),
    format: d.format || '', order: Number(d.order) || 0, revisions: String(d.revisions || '').split(' | ').filter(Boolean), fileText: String(d.fileText || ''), links: parseJ(d.links, []), review: reviewOut(d)
  };
}
function reviewOut(d) {
  const r = parseJ(d.review, null);
  if (r && r.type === 'edit' && r.base) r.base.body = String(d.prevBody || '') + String(d.prevBody2 || '');
  return r;
}
const toolOut = (t) => ({ id: t.id, name: t.name, desc: t.desc, target: t.target, url: t.url, maker: t.maker, icon: t.icon || '', hidden: !!t.hidden, privacy: t.privacy === true || t.privacy === 'TRUE' || t.privacy === 'O', login: t.login === true || t.login === 'TRUE' || t.login === 'O', local: /^(tools|apps)\//.test(String(t.url || '')), review: parseJ(t.review, null) });
// 도구 칸 정리 (관리자·선생님 공통)
function toolIn(p) {
  const url = str(p.url, 500).trim();
  if (!/^https:\/\//i.test(url) && !/^(tools|apps)\//.test(url)) fail('주소는 https:// 로 시작해야 해요.');
  const name = str(p.name, 30).trim(); if (!name) fail('도구 이름을 적어 주세요.');
  return { name, desc: str(p.desc, 80).trim(), target: str(p.target, 10), url, maker: str(p.maker, 30).trim(), privacy: p.privacy ? 'O' : '', login: p.login ? 'O' : '', icon: /^[a-z0-9-]{2,30}$/.test(String(p.icon || '')) ? p.icon : '', hidden: '' };
}

/* ───── 파일: 내용은 KV, 정보는 D1 files 표 ───── */
async function uploadFile(env, p) {
  const name = str(p.name, 100), b64 = String(p.b64 || '');
  if (!name || !b64) fail('파일이 비어 있어요.');
  if (b64.length > 28 * 1024 * 1024) fail('파일은 20MB까지 올릴 수 있어요.');
  if (!/\.(pdf|hwp|hwpx|xlsx|html?|png|jpe?g|gif|webp)$/i.test(name)) fail('PDF·한글·엑셀(xlsx)·이미지·웹앱(html) 파일만 올릴 수 있어요.');
  const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
  const id = uid('f');
  await env.FILES.put(id, bytes);
  await env.DB.prepare('INSERT INTO files (id, name, mime, size) VALUES (?, ?, ?, ?)').bind(id, name, str(p.mime || 'application/octet-stream', 100), bytes.length).run();
  return { fileId: id };
}
async function getFile(env, p) {
  const id = String(p.id || '');
  const info = await env.DB.prepare('SELECT name, mime FROM files WHERE id = ?').bind(id).first();
  if (!info) fail('파일을 찾을 수 없어요.');
  const buf = await env.FILES.get(id, 'arrayBuffer');
  if (!buf) fail('파일을 찾을 수 없어요.');
  const u8 = new Uint8Array(buf); let s = '';
  for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode.apply(null, u8.subarray(i, i + 0x8000));
  return { name: info.name, mime: info.mime, b64: btoa(s) };
}

/* ───── 검색 미리보기 그림: 화면에서 원본 파일로 만든 첫 쪽 그림(jpeg)을 한 번만 받아 둔다 (/t/f/<id> 로 내줌) ───── */
async function saveThumb(env, p) {
  const id = String(p.id || ''), data = String(p.data || '');
  if (!/^[A-Za-z0-9_-]{4,90}$/.test(id)) fail('잘못된 그림이에요.');
  const m = /^data:image\/jpeg;base64,([A-Za-z0-9+/=]+)$/.exec(data);
  // p<쪽>-<파일 id>: 한글 파일 쪽 그림(사파리에서 보기·인쇄용, 더 크다)
  const base = id.replace(/^p\d{1,2}-/, '');
  if (!m || m[1].length > (base !== id ? 1000000 : 300000)) fail('그림이 너무 커요.');
  // 올린 파일(files 표에 있는 것)이나 사이트에 든 서식(form-…)만
  if (!/^form-/.test(base) && !(await env.DB.prepare('SELECT id FROM files WHERE id = ?').bind(base).first())) fail('없는 파일이에요.');
  if (await env.FILES.get('thumb:' + id, 'arrayBuffer')) return true;   // 이미 있으면 그대로
  await env.FILES.put('thumb:' + id, Uint8Array.from(atob(m[1]), (c) => c.charCodeAt(0)));
  return true;
}
// 이 사이트를 다른 사이트 안(칸)에 띄워도 되는지: X-Frame-Options·CSP frame-ancestors 를 본다.
// 로그인(특히 구글 로그인)이 필요한 웹앱은 칸 안에서 로그인이 막히므로(브라우저가 다른 사이트 안의 로그인 쿠키를 막음) login: true. 하루 동안 기억
const LOGIN_RE = /accounts\.google\.com\/(o\/oauth2|signin|gsi)|gsi\/client|signInWith(Popup|Redirect)|GoogleAuthProvider|(구글|Google)\s?계정으로|(로그인|log\s?in|sign\s?in)[^<]{0,20}(필요|하세요|해\s?주세요|required)/i;
async function frameOk(url) {
  if (!/^https:\/\/[^\s]{4,500}$/i.test(url)) return { frame: false, login: false };
  const cache = caches.default, ck = new Request('https://frame2.cache/' + encodeURIComponent(url));
  const hit = await cache.match(ck); if (hit) return hit.json();
  let frame = true, login = /^https:\/\/script\.google\.com\//i.test(url);   // 학교 구글 앱스 스크립트 웹앱은 늘 로그인
  try {
    const r = await fetch(url, { redirect: 'follow', headers: { 'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36', accept: 'text/html,*/*' } });
    const x = (r.headers.get('x-frame-options') || '').toLowerCase();
    const fa = /frame-ancestors([^;]*)/i.exec(r.headers.get('content-security-policy') || '');
    if (/deny|sameorigin/.test(x)) frame = false;
    if (fa && !/(^|\s)(\*|https:)(\s|$)/.test(fa[1].trim())) frame = false;   // 'self'·'none'·자기 주소만 허락하면 못 띄움
    if (/accounts\.google\.com/.test(r.url || '')) login = true;              // 열자마자 구글 로그인으로 넘어가는 앱
    if (/html/i.test(r.headers.get('content-type') || '')) { const t = (await r.text()).slice(0, 300000); if (LOGIN_RE.test(t)) login = true; }
    else { try { if (r.body) await r.body.cancel(); } catch (e) { /* 그냥 둔다 */ } }
  } catch (e) { /* 확인을 못 하면 일단 띄워 본다 */ }
  const out = { frame, login };
  await cache.put(ck, new Response(JSON.stringify(out), { headers: { 'content-type': 'application/json', 'cache-control': 'max-age=86400' } }));
  return out;
}

/* ───── 선생님이 바로 올리기·고치기 ───── */
async function saveDoc(db, p) {
  const title = str(p.title, 60).trim(), body = String(p.body || '').slice(0, BODY_MAX);
  let files = (p.files || []).slice(0, 5);
  if (!title || (body.length < 10 && !files.length)) fail('제목과 내용을 적어 주세요.');
  if (/\b\d{6}\s?-\s?[1-4]\d{6}\b/.test(body)) fail('주민등록번호로 보이는 내용은 올릴 수 없어요.');
  const aliases = (p.aliases || []).slice(0, 15).map((x) => str(x, 30)).join(', ');
  const reason = str(p.reason, 200), d0 = today();
  const links = linksIn(p.links);
  files = files.map((f) => ({ name: str(f.name, 100), ftype: str(f.ftype, 6), fileId: str(f.fileId, 80), size: Number(f.size) || 0, text: str(f.text, 20000), replace: typeof f.replace === 'number' ? f.replace : null }));
  let category = str(p.category, 20);
  if (p.newCategory) {
    const name = str(p.newCategory, 20).trim();
    let c = (await cats(db)).filter((x) => x.name === name)[0];
    if (!c) { c = { id: uid('c'), name, icon: /^[a-z0-9-]{2,30}$/.test(String(p.newCategoryIcon || '')) ? p.newCategoryIcon : 'folder', review: JSON.stringify({ at: d0 }), hidden: '' }; await db.insert('cats', c); }
    category = c.id;
  }
  let d = p.type === 'edit' ? await db.find('docs', p.docId) : null;
  if (d) {
    let r = parseJ(d.review, null);
    if (!r) {
      r = { type: 'edit', base: { title: d.title, category: d.category, aliases: splitList(d.aliases), attachments: parseJ(d.attachments, []), fileHistory: parseJ(d.fileHistory, []), links: parseJ(d.links, []) } };
      d.prevBody = String(d.body || '') + String(d.body2 || ''); d.prevBody2 = ''; d.prevFileText = d.fileText || '';
    }
    r.at = d0; if (reason) r.reason = reason;
    d.review = JSON.stringify(r);
    Object.assign(d, { title, category, aliases, body, body2: '', updatedAt: d0 });
    if (links) d.links = JSON.stringify(links);
    const rm = (p.removeAtt || []).map(Number);
    if (rm.length) {
      const atts = parseJ(d.attachments, []), hist = parseJ(d.fileHistory, []);
      d.attachments = JSON.stringify(atts.filter((a, k) => { if (rm.includes(k)) { hist.push(a); return false; } return true; }));
      d.fileHistory = JSON.stringify(hist.slice(-20));
    }
  } else {
    d = { id: uid('d'), title, category, aliases, body, owner: '', updatedAt: d0, views: 0, status: 'published', attachments: '[]', links: JSON.stringify(links || []), review: JSON.stringify({ type: 'new', at: d0, reason }) };
  }
  attachFiles(d, files);
  await db.save('docs', d);
  return { id: d.id };
}
// 문서에 붙이는 링크: 이름 + https 주소, 10개까지 (이름이 없으면 주소의 사이트 이름)
function linksIn(list) {
  if (!Array.isArray(list)) return null;
  return list.slice(0, 10).map((l) => {
    let url = str(l && l.url, 500).trim(); if (url && !/^https?:\/\//i.test(url)) url = 'https://' + url;
    if (!/^https?:\/\//i.test(url)) return null;
    let name = str(l.name, 40).trim(); if (!name) { try { name = new URL(url).hostname.replace(/^www\./, ''); } catch (e) { name = url.slice(0, 40); } }
    return { name, url };
  }).filter(Boolean);
}
async function report(db, p) {
  await db.insert('reports', { id: uid('r'), docId: str(p.docId, 40), docTitle: str(p.docTitle, 60), reason: str(p.reason, 40), note: str(p.note, 500), status: 'open', createdAt: today(), resolvedAt: '', action: '' });
  return true;
}
// 같은 이름 파일은 새 판으로 바꾸고 옛 판은 fileHistory 에 남긴다
function attachFiles(d, files) {
  if (!files || !files.length) return;
  const atts = parseJ(d.attachments, []), hist = parseJ(d.fileHistory, []);
  files.forEach((f) => {
    const att = { kind: 'file', name: f.name, ftype: f.ftype, fileId: f.fileId, size: f.size, date: today(), ver: 1 };
    if (f.replace !== null && f.replace !== undefined && atts[f.replace]) {
      att.name = atts[f.replace].name; att.fileName = f.name; att.ver = (atts[f.replace].ver || 1) + 1;
      hist.push(atts[f.replace]); atts[f.replace] = att; return;
    }
    const i = atts.findIndex((a) => a.kind === 'file' && a.name === f.name);
    if (i >= 0) { att.ver = (atts[i].ver || 1) + 1; hist.push(atts[i]); atts[i] = att; } else atts.push(att);
  });
  d.attachments = JSON.stringify(atts); d.fileHistory = JSON.stringify(hist.slice(-20));
  d.fileText = (String(d.fileText || '') + ' ' + files.map((f) => f.text || '').join(' ')).slice(-200000);
}

/* ───── 관리자 ───── */
async function adminLogin(db, pw) {
  await guard(db, 'admin');
  if ((await hash(String(pw || ''), await db.prop('salt'))) !== (await db.prop('pwHash'))) { await strike(db, 'admin'); fail('비밀번호가 맞지 않아요.', 'BAD_PW'); }
  const token = crypto.randomUUID();
  await db.setMeta('adm_' + token, '1', 21600);   // 6시간
  return token;
}
async function checkToken(db, t) { if (!t || !(await db.meta('adm_' + t))) fail('관리자 확인이 끝났어요. 다시 로그인해 주세요.', 'BAD_TOKEN'); }

// 못 찾은 검색어: 낱말·횟수·날짜만 남긴다 (누가 찾았는지는 남기지 않음). 이름·연락처처럼 보이는 말은 저장하지 않고, 180일 지나면 지운다
function missTerm(q) {
  const t = String(q || '').replace(/\s+/g, ' ').trim().toLowerCase();
  if (t.length < 2 || t.length > 30 || /[ㄱ-ㅎㅏ-ㅣ]/.test(t) || /@|https?:|\d{5,}|\d{2,4}-\d{3,4}/.test(t)) return '';
  return t.split(' ').some((w) => /^[김이박최정강조윤장임한오서신권황안송류전홍][가-힣]{2}(선생님?|쌤|학생|교사|교감|교장|부장)?$/.test(w)) ? '' : t;
}
function freshMisses(m) {
  const from = new Date(Date.now() - 180 * 864e5).toISOString().slice(0, 10), out = {};
  for (const [t, v] of Object.entries(m || {})) if (v && String(v.last) >= from) out[t] = v;
  return out;
}
async function addMiss(db, q) {
  const t = missTerm(q); if (!t) return true;
  const m = freshMisses(parseJ(await db.prop('misses'), {}));
  m[t] = { n: ((m[t] && m[t].n) || 0) + 1, last: today() };
  const keys = Object.keys(m).sort((a, b) => m[b].n - m[a].n || String(m[b].last).localeCompare(String(m[a].last)));
  await db.setProp('misses', JSON.stringify(Object.fromEntries(keys.slice(0, 300).map((k) => [k, m[k]]))));
  return true;
}

async function admin(db, a, p) {
  if (a === 'missDel') {
    const m = p.all ? {} : parseJ(await db.prop('misses'), {});
    if (!p.all) delete m[String(p.term || '')];
    await db.setProp('misses', JSON.stringify(m)); return true;
  }
  if (a === 'adminData') {
    return { misses: freshMisses(parseJ(await db.prop('misses'), {})), categories: await cats(db), reports: (await db.all('reports')).slice().reverse().slice(0, 200), docs: (await db.all('docs')).map(docOut),
      settings: { schoolName: await db.prop('schoolName'), accessCode: await db.prop('accessCode'), hiddenClassTools: parseJ(await db.prop('hiddenClassTools'), []) } };
  }
  if (a === 'review') {
    if (p.kind === 'tool') {
      const t = await db.find('tools', p.id); if (!t) return true;
      const r = parseJ(t.review, null);
      if (r && !p.approve) { if (r.type === 'new') t.hidden = 'O'; else if (r.base) Object.assign(t, toolIn(r.base)); }
      t.review = ''; await db.save('tools', t); return true;
    }
    if (p.kind === 'cat') {
      const c = await db.find('cats', p.id); if (!c) return true;
      if (p.approve) c.review = ''; else c.hidden = 'O';
      await db.save('cats', c);
      if (!p.approve) for (const x of await db.all('docs')) if (x.category === c.id) { x.category = 'guide'; await db.save('docs', x); }
      return true;
    }
    const d = await db.find('docs', p.id); if (!d) return true;
    const r = parseJ(d.review, null);
    if (r && !p.approve) {
      if (r.type === 'new') d.status = 'hidden';
      else if (r.base) {
        d.title = r.base.title; d.category = r.base.category; d.aliases = (r.base.aliases || []).join(', ');
        d.body = String(d.prevBody || '') + String(d.prevBody2 || ''); d.body2 = '';
        d.attachments = JSON.stringify(r.base.attachments || []); d.fileHistory = JSON.stringify(r.base.fileHistory || []); d.fileText = d.prevFileText || '';
        if (r.base.links) d.links = JSON.stringify(r.base.links);
      }
    }
    Object.assign(d, { review: '', prevBody: '', prevBody2: '', prevFileText: '' });
    await db.save('docs', d); return true;
  }
  if (a === 'resolveReport') {
    const r = await db.find('reports', p.id); if (!r) return true;
    r.status = 'resolved'; r.action = p.action === 'hide' ? 'hide' : 'keep'; r.resolvedAt = today(); await db.save('reports', r);
    if (r.action === 'hide') { const hd = await db.find('docs', r.docId); if (hd) { hd.status = 'hidden'; await db.save('docs', hd); } }
    return true;
  }
  if (a === 'restoreDoc') { const rd = await db.find('docs', p.docId); if (rd) { rd.status = 'published'; await db.save('docs', rd); } return true; }
  if (a === 'saveTool') { await db.save('tools', Object.assign(toolIn(p), { id: str(p.id, 40) || uid('t'), review: '' })); return true; }   // 관리자가 저장하면 바로 승인
  if (a === 'deleteTool') { const dt = (await db.find('tools', p.id)) || { id: str(p.id, 40), name: '', desc: '', target: '', url: '', maker: '', privacy: '', login: '', icon: '' }; dt.hidden = 'O'; await db.save('tools', dt); return true; }
  if (a === 'saveCats') {
    const keep = {};
    const list = (p.list || []).slice(0, 60);
    for (let i = 0; i < list.length; i++) {
      const c = list[i], id = str(c.id, 40); if (!id) continue; keep[id] = true;
      const r = (await db.find('cats', id)) || { id, review: '', hidden: '' };
      r.name = str(c.name, 20).trim() || r.name; r.icon = str(c.icon, 30) || r.icon || 'folder'; r.order = String(i + 1); r.hidden = '';
      await db.save('cats', r);
    }
    for (const c of await cats(db)) {
      if (keep[c.id] || c.id === 'rules' || c.id === 'guide') continue;
      const r = (await db.find('cats', c.id)) || { id: c.id, name: c.name, icon: c.icon, review: '' }; r.hidden = 'O'; await db.save('cats', r);
      for (const x of await db.all('docs')) if (x.category === c.id) { x.category = 'guide'; await db.save('docs', x); }
    }
    return true;
  }
  if (a === 'saveSettings') {
    if (p.schoolName) await db.setProp('schoolName', str(p.schoolName, 30).trim());
    if (p.accessCode) { if (String(p.accessCode).length < 4) fail('접속 코드는 4자 이상으로 해 주세요.'); await db.setProp('accessCode', str(p.accessCode, 30).trim()); }
    if (p.adminPassword) { if (String(p.adminPassword).length < 8) fail('관리자 비밀번호는 8자 이상으로 해 주세요.'); await db.setProp('pwHash', await hash(String(p.adminPassword), await db.prop('salt'))); }
    if (p.subjects) await db.setProp('subjects', JSON.stringify((p.subjects || []).slice(0, 30).map((x) => str(x, 20))));
    if (p.hiddenClassTools) await db.setProp('hiddenClassTools', JSON.stringify((p.hiddenClassTools || []).slice(0, 30).map((x) => str(x, 20))));
    return true;
  }
  if (a === 'importDocs') return importData(db, p);
  // 유용한 사이트 되살리기(show) · 기본 사이트를 원래대로(reset)
  if (a === 'restoreSite') {
    const e = parseJ(await db.prop('siteEdits'), {}), key = str(p.key, 60), x = e[key];
    if (!x) return true;
    if (p.mode === 'reset' || (key.startsWith('d:') && !x.name)) delete e[key]; else delete x.hidden;
    await db.setProp('siteEdits', JSON.stringify(e)); return true;
  }
  if (a === 'exportAll') {
    return { format: 'gil-export/1', exportedAt: new Date().toISOString(), school: { name: await db.prop('schoolName') }, categories: await cats(db), docs: (await db.all('docs')).map(docOut),
      lessons: (await db.all('lessons')).map((l) => ({ id: l.id, subject: l.subject, kind: l.kind, title: l.title, desc: l.desc, course: l.course, maker: l.maker, url: l.url, file: parseJ(l.file, null), hidden: l.hidden })), tools: (await db.all('tools')).map(toolOut), forms: {} };
  }
  fail('알 수 없는 요청이에요.');
}

// 자료 넣기 (관리자 '자료 가져오기', 기본 자료). onlyNew 면 이미 있는 문서는 건드리지 않는다
async function importData(db, p) {
  if (!p || p.format !== 'gil-export/1' || !p.docs || (!p.docs.length && !(p.lessons || []).length)) fail('길잡이에서 내보낸 파일(.json)이 아니에요.');
  let added = 0, updated = 0;
  for (const c of p.categories || []) {
    if (!c || !c.id || CATEGORIES.some((x) => x.id === c.id) || (await db.find('cats', str(c.id, 40)))) continue;
    await db.insert('cats', { id: str(c.id, 40), name: str(c.name, 20), icon: str(c.icon || 'folder', 30), review: '', hidden: '' });
  }
  for (const d of p.docs) {
    if (!d || !d.id || !d.title) continue;
    const old = await db.find('docs', str(d.id, 40));
    if (p.onlyNew && old) continue;
    await db.save('docs', { id: str(d.id, 40), title: str(d.title, 80), category: str(d.category, 20), aliases: (d.aliases || []).join(', '), body: String(d.body || '').slice(0, BODY_MAX),
      owner: str(d.owner, 30), updatedAt: str(d.updatedAt || today(), 10), views: Number(d.views) || 0, status: d.status === 'hidden' ? 'hidden' : 'published', attachments: JSON.stringify(d.attachments || []),
      format: str(d.format, 10), order: Number(d.order) || 0, revisions: (d.revisions || []).join(' | '), links: JSON.stringify(d.links || []) });
    if (old) updated++; else added++;
  }
  for (const l of p.lessons || []) {
    if (!l || !l.id || (await db.find('lessons', l.id))) continue;
    const row = lessonIn(l); row.id = str(l.id, 40); row.date = today(); await db.insert('lessons', row); added++;
  }
  return { added, updated };
}

// 예전 구글 시트 저장소에서 옮겨 오기: 비밀 열쇠(MIGRATE_KEY)가 설정돼 있을 때만 열린다. 옮긴 뒤 열쇠를 지운다
async function migrate(env, db, req) {
  if (!env.MIGRATE_KEY || req.key !== env.MIGRATE_KEY) fail('알 수 없는 요청이에요.');
  const p = req.payload || {};
  for (const [k, v] of Object.entries(p.props || {})) if (v != null) await db.setProp(k, v);
  let rows = 0;
  for (const [t, list] of Object.entries(p.tables || {})) {
    if (!TABLES.includes(t)) continue;
    for (const r of list) if (r && r.id) { await db.save(t, r); rows++; }
  }
  for (const f of p.files || []) {
    const bytes = Uint8Array.from(atob(f.b64), (c) => c.charCodeAt(0));
    await env.FILES.put(f.id, bytes);
    await env.DB.prepare('INSERT INTO files (id, name, mime, size) VALUES (?, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET name = excluded.name, mime = excluded.mime, size = excluded.size').bind(f.id, f.name, f.mime, bytes.length).run();
  }
  return { rows, files: (p.files || []).length };
}
