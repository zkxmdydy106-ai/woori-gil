// Code.gs: 우리학교 길잡이 학교 저장소 (구글 시트 + Apps Script 웹 앱). 학교 구글 계정이 소유한다.
// 설치: 구글 시트 > 확장 프로그램 > Apps Script 에 붙여넣기 > 배포(웹 앱, 실행: 나, 액세스: 모든 사용자) > 길잡이 '학교 개설' 화면에서 연결.

var TABLES = {
  docs: { sheet: '문서', fields: [['id', 'id'], ['title', '제목'], ['category', '분류'], ['aliases', '다른 이름'], ['body', '본문'], ['body2', '본문(이어서)'], ['owner', '담당 부서'], ['updatedAt', '고친 날'], ['views', '조회'], ['status', '상태'], ['attachments', '첨부(JSON)'], ['format', '형식'], ['order', '순서'], ['revisions', '개정 이력'], ['fileText', '첨부 파일 글자(검색용)'], ['fileHistory', '옛 파일(JSON)'],
    ['review', '승인 전(JSON)'], ['prevBody', '승인된 본문'], ['prevBody2', '승인된 본문(이어서)'], ['prevFileText', '승인된 파일 글자'], ['links', '링크(JSON)']] },
  cats: { sheet: '분류', fields: [['id', 'id'], ['name', '이름'], ['icon', '아이콘'], ['review', '승인 전(JSON)'], ['hidden', '지움'], ['order', '순서']] },
  reports: { sheet: '신고', fields: [['id', 'id'], ['docId', '문서 id'], ['docTitle', '문서 제목'], ['reason', '사유'], ['note', '내용'], ['status', '상태'], ['createdAt', '신고한 날'], ['resolvedAt', '처리한 날'], ['action', '처리']] },
  lessons: { sheet: '수업자료', fields: [['id', 'id'], ['subject', '교과'], ['kind', '종류'], ['title', '제목'], ['desc', '설명'], ['course', '과목·단원'], ['maker', '만든 곳'], ['url', '웹앱 주소'], ['file', '파일(JSON)'], ['date', '올린 날'], ['hidden', '내림'], ['history', '옛 파일(JSON)'], ['icon', '아이콘']] },
  tools: { sheet: '도구', fields: [['id', 'id'], ['name', '이름'], ['desc', '설명'], ['target', '쓰는 사람'], ['url', '주소'], ['maker', '만든 곳'], ['privacy', '브라우저 안에서만 처리'], ['login', '로그인 필요'], ['icon', '아이콘'], ['hidden', '숨김'], ['review', '승인 전(JSON)']] }
};
var CATEGORIES = [
  { id: 'rules', name: '규정집', icon: 'book-2' },
  { id: 'academic', name: '학사·성적', icon: 'school' }, { id: 'attendance', name: '출결', icon: 'calendar-check' },
  { id: 'duty', name: '복무·여비', icon: 'briefcase' }, { id: 'field', name: '체험학습', icon: 'map-2' },
  { id: 'life', name: '학생 생활', icon: 'users' }, { id: 'event', name: '행사', icon: 'confetti' },
  { id: 'forms', name: '서식·서류', icon: 'file-text' }, { id: 'guide', name: '학교 생활 안내', icon: 'directions' }
];
var ADMIN_ACTIONS = ['restoreSite', 'adminData', 'review', 'saveCats', 'resolveReport', 'restoreDoc', 'saveTool', 'deleteTool', 'saveSettings', 'exportAll', 'importDocs'];
var CELL_MAX = 45000; // 시트 한 칸 글자 수 한도(5만)보다 조금 작게

/* ───── 입구 ───── */
function doGet(e) {
  // 연결 확인용: 내용 없이 개수만 알려 준다
  var n = {}; try { if (isInit_()) ['docs', 'lessons', 'cats'].forEach(function (k) { n[k] = all_(k).length; }); } catch (e) { n.error = String(e.message || e); }
  // 학교 기본 자료(SEED, 운영판 스크립트에만 있음)를 한 번 넣는다: 주소?seed=1. 이미 있는 문서는 건드리지 않는다
  // SEED.version 이 바뀌면 새로 생긴 기본 자료만 더 넣고, SEED.retire 문서는 내린다
  if (e && e.parameter && e.parameter.seed === '1' && isInit_() && typeof SEED !== 'undefined' && props_().getProperty('seeded') !== String(SEED.version || '1')) {
    var r = withLock_(function () {
      var x = importData_(SEED);
      (SEED.retire || []).forEach(function (id) { var d = find_('docs', id); if (d && d.status === 'published') { d.status = 'hidden'; save_('docs', d); } });
      return x;
    });
    props_().setProperty('seeded', String(SEED.version || '1'));
    n.seeded = r; ['docs', 'lessons'].forEach(function (k) { n[k] = all_(k).length; });
  }
  // 기본 자료에 사용법 문서(g00)가 있으면 처음 설정 때 만든 사용법 문서는 숨긴다
  if (isInit_() && typeof SEED !== 'undefined' && props_().getProperty('seeded') && !props_().getProperty('guideMerged') && find_('docs', 'g00')) {
    withLock_(function () { all_('docs').forEach(function (d) { if (d.id !== 'g00' && d.title === '우리학교 길잡이 쓰는 법' && d.status === 'published') { d.status = 'hidden'; save_('docs', d); } }); });
    props_().setProperty('guideMerged', '1');
  }
  return out_({ ok: true, result: { service: 'gil', initialized: isInit_(), counts: n } });
}
function doPost(e) {
  try {
    var req = JSON.parse(e.postData.contents);
    return out_({ ok: true, result: handle_(req) });
  } catch (err) {
    return out_({ ok: false, error: err.message || String(err), code: err.code || '' });
  }
}
function out_(o) { return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON); }
function fail_(msg, code) { var e = new Error(msg); e.code = code || ''; throw e; }
function props_() { return PropertiesService.getScriptProperties(); }
function isInit_() { return !!props_().getProperty('schoolName'); }
function today_() { return Utilities.formatDate(new Date(), Session.getScriptTimeZone() || 'Asia/Seoul', 'yyyy-MM-dd'); }
function uid_(p) { return p + Utilities.getUuid().replace(/-/g, '').slice(0, 10); }
function day_(v) { return v instanceof Date ? Utilities.formatDate(v, 'Asia/Seoul', 'yyyy-MM-dd') : String(v || '').slice(0, 10); }
function str_(v, max) { return String(v == null ? '' : v).slice(0, max || 200); }

function handle_(req) {
  var a = req.action, p = req.payload || {};
  if (a === 'info') return { schoolName: props_().getProperty('schoolName') || '', initialized: isInit_(), needsCode: true };
  if (a === 'setup') return setup_(p);
  if (!isInit_()) fail_('아직 학교 정보가 없어요. 길잡이의 학교 개설 화면에서 연결해 주세요.', 'NOT_INIT');
  if (a === 'adminLogin') return adminLogin_(p.pw);
  if (ADMIN_ACTIONS.indexOf(a) >= 0) { checkToken_(req.token); return admin_(a, p); }
  guard_('code');
  if (String(req.code || '') !== props_().getProperty('accessCode')) { strike_('code'); fail_('접속 코드가 맞지 않아요.', 'BAD_CODE'); }
  if (a === 'load') return load_();
  if (a === 'hit') return withLock_(function () { var d = find_('docs', p.id); if (d) { d.views = (Number(d.views) || 0) + 1; save_('docs', d); } return true; });
  if (a === 'saveDoc') return saveDoc_(p);
  if (a === 'report') return report_(p);
  if (a === 'uploadFile') return uploadFile_(p);
  if (a === 'getFile') return getFile_(p);
  if (a === 'addLesson') return withLock_(function () { var l = lessonIn_(p); l.id = uid_('l'); l.date = today_(); insert_('lessons', l); return true; });
  if (a === 'updateLesson') return withLock_(function () {
    var l = find_('lessons', p.id); if (!l) fail_('자료를 찾을 수 없어요.');
    var n = lessonIn_(p.item || {}, !!l.file);
    if (n.file && l.file) { var h = parseJ_(l.history, []); h.push(parseJ_(l.file, {})); l.history = JSON.stringify(h.slice(-10)); var f = JSON.parse(n.file); f.ver = (parseJ_(l.file, {}).ver || 1) + 1; n.file = JSON.stringify(f); }
    ['subject', 'kind', 'title', 'desc', 'course', 'maker', 'url', 'icon'].forEach(function (k) { l[k] = n[k]; });
    if (n.file) l.file = n.file;
    if (l.kind === 'app' && !n.file && !n.url && !l.file) fail_('웹앱 파일을 올리거나 https:// 주소를 넣어 주세요.');
    l.date = today_(); save_('lessons', l); return true;
  });
  // 도구 탭: 누구나 더하고 고친다. 바로 보이고 관리자가 확인하기 전까지 '승인 전'
  if (a === 'proposeTool') return withLock_(function () {
    var n = toolIn_(p), old = p.id ? find_('tools', str_(p.id, 40)) : null;
    if (old && !old.hidden) { var r = parseJ_(old.review, null); n.id = old.id; if (r && r.type) { r.at = today_(); n.review = JSON.stringify(r); } else n.review = JSON.stringify({ type: 'edit', at: today_(), base: toolOut_(old) }); }
    else { n.id = uid_('t'); n.review = JSON.stringify({ type: 'new', at: today_() }); }
    save_('tools', n); return { id: n.id };
  });
  if (a === 'removeLesson') return withLock_(function () { var l = find_('lessons', p.id); if (l) { l.hidden = 'O'; save_('lessons', l); } return true; });
  if (a === 'saveSite' || a === 'removeSite') return withLock_(function () {
    var e = parseJ_(props_().getProperty('siteEdits'), {});
    var key = str_(p.key, 60) || uid_('s');
    if (a === 'removeSite') { var old = e[key] || {}; old.hidden = true; old.at = today_(); e[key] = old; } else e[key] = siteIn_(p);   // 빼도 내용은 남겨 관리자가 되살린다
    var js = JSON.stringify(e);
    if (js.length > 8500) fail_('사이트를 더 넣을 수 없어요. 관리자에게 알려 주세요.');
    props_().setProperty('siteEdits', js); return { key: key };
  });
  if (a === 'saveSiteOrder') return withLock_(function () {
    var o = parseJ_(props_().getProperty('siteOrder'), {});
    var g = str_(p.group, 20).trim(); if (!g) fail_('묶음을 알 수 없어요.');
    o[g] = (p.keys || []).slice(0, 80).map(function (k) { return str_(k, 60); });
    var js = JSON.stringify(o); if (js.length > 8500) fail_('순서를 더 저장할 수 없어요.');
    props_().setProperty('siteOrder', js); return true;
  });
  fail_('알 수 없는 요청이에요.');
}
// 유용한 사이트: 기본 목록에서 고치거나 더한 것만 key 별로 저장한다
function siteIn_(p) {
  var url = str_(p.url, 300).trim();
  if (!/^https:\/\//i.test(url)) fail_('주소는 https:// 로 시작해야 해요.');
  var name = str_(p.name, 30).trim(); if (!name) fail_('사이트 이름을 적어 주세요.');
  return { group: str_(p.group, 20).trim() || '기타', 'for': str_(p['for'], 20).trim() || '공통', icon: /^[a-z0-9-]{2,30}$/.test(String(p.icon || '')) ? p.icon : '', name: name, url: url, desc: str_(p.desc, 80).trim(), at: today_() };
}

/* ───── 처음 연결 ───── */
function setup_(p) {
  return withLock_(function () {
    if (isInit_()) fail_('이미 만들어진 저장소예요. 학교 이름·코드는 관리자 화면에서 바꿀 수 있어요.', 'ALREADY');
    var name = str_(p.schoolName, 30).trim(), code = str_(p.accessCode, 30).trim(), pw = String(p.adminPassword || '');
    if (!name) fail_('학교 이름을 적어 주세요.');
    if (code.length < 4) fail_('접속 코드는 4자 이상으로 해 주세요.');
    if (pw.length < 8) fail_('관리자 비밀번호는 8자 이상으로 해 주세요.');
    Object.keys(TABLES).forEach(function (k) { sheet_(k); });
    var salt = Utilities.getUuid();
    props_().setProperties({ schoolName: name, accessCode: code, salt: salt, pwHash: hash_(pw, salt) });
    if (typeof SEED === 'undefined') insert_('docs', {
      id: uid_('d'), title: '우리학교 길잡이 쓰는 법', category: 'guide', aliases: '사용법, 도움말, 길잡이',
      body: '## 찾기\n검색창에 낱말을 넣거나 초성만 넣어도 찾아요.\n\n## 고치기\n문서의 **고치기** 버튼을 누르고 학교 코드를 넣으면 바로 반영돼요. 관리자가 확인하기 전까지 승인 전 표시가 붙고 고친 부분이 노란색으로 보여요.\n\n## 새 문서·새 분류\n찾는 문서가 없으면 **새 문서 쓰기**를 눌러 주세요. 분류 칸에서 새 분류도 만들 수 있어요.\n\n> 개인정보와 저작권 있는 자료는 올리지 마세요.',
      owner: '', updatedAt: today_(), views: 0, status: 'published', attachments: '[]'
    });
    return { ok: true };
  });
}

/* ───── 읽기 ───── */
function load_() {
  return {
    school: { name: props_().getProperty('schoolName') },
    categories: cats_(),
    docs: all_('docs').filter(function (d) { return d.status === 'published'; }).map(docOut_),
    tools: all_('tools').map(toolOut_),
    subjects: parseJ_(props_().getProperty('subjects'), null),
    hiddenClassTools: parseJ_(props_().getProperty('hiddenClassTools'), []),
    siteEdits: parseJ_(props_().getProperty('siteEdits'), {}),
    siteOrder: parseJ_(props_().getProperty('siteOrder'), {}),
    lessons: all_('lessons').filter(function (l) { return !l.hidden; }).map(function (l) {
      return { id: l.id, subject: l.subject, kind: l.kind, title: l.title, desc: l.desc, course: l.course, maker: l.maker, url: l.url, icon: l.icon || '', file: parseJ_(l.file, null), date: day_(l.date) };
    }),
    forms: {}
  };
}
// 기본 분류 + 선생님이 만든 분류
function cats_() {
  var rows = all_('cats'), byId = {};
  rows.forEach(function (r) { byId[r.id] = r; });
  var list = CATEGORIES.map(function (c, i) { var r = byId[c.id]; return r ? { id: c.id, name: r.name || c.name, icon: r.icon || c.icon, hidden: r.hidden, order: Number(r.order) || (i + 1) } : { id: c.id, name: c.name, icon: c.icon, order: i + 1 }; });
  rows.forEach(function (r) { if (!CATEGORIES.some(function (c) { return c.id === r.id; })) list.push({ id: r.id, name: r.name, icon: r.icon || 'folder', hidden: r.hidden, order: Number(r.order) || 900, review: parseJ_(r.review, null) }); });
  return list.filter(function (c) { return !c.hidden; }).sort(function (a, b) { return a.order - b.order; })
    .map(function (c) { return { id: c.id, name: c.name, icon: c.icon, review: c.review || null }; });
}
function parseJ_(s, d) { try { return s ? JSON.parse(s) : d; } catch (e) { return d; } }
function lessonIn_(p, hasFile) {
  var f = p.file ? { name: str_(p.file.name, 100), ftype: str_(p.file.ftype, 6), fileId: str_(p.file.fileId, 80), url: str_(p.file.url, 300), size: Number(p.file.size) || 0, text: str_(p.file.text, 40000) } : null;
  if (p.kind === 'app' && !f && !hasFile && !/^https:\/\//i.test(String(p.url || '')) && !/^(lessons|apps)\//.test(String(p.url || ''))) fail_('웹앱 파일을 올리거나 https:// 주소를 넣어 주세요.');
  return { subject: str_(p.subject, 20), kind: p.kind === 'app' ? 'app' : 'file', title: str_(p.title, 60), desc: str_(p.desc, 120), course: str_(p.course, 40), maker: str_(p.maker, 30), url: str_(p.url, 500), icon: /^[a-z0-9-]{2,30}$/.test(String(p.icon || '')) ? p.icon : '', file: f ? JSON.stringify(f) : '' };
}

/* ───── 파일: 학교 구글 드라이브의 '우리학교 길잡이 파일' 폴더에 둔다 ───── */
function folder_() {
  var id = props_().getProperty('folderId');
  if (id) { try { return DriveApp.getFolderById(id); } catch (e) { } }
  var f = DriveApp.createFolder('우리학교 길잡이 파일');
  props_().setProperty('folderId', f.getId());
  return f;
}
function uploadFile_(p) {
  var name = str_(p.name, 100), b64 = String(p.b64 || '');
  if (!name || !b64) fail_('파일이 비어 있어요.');
  if (b64.length > 28 * 1024 * 1024) fail_('파일은 20MB까지 올릴 수 있어요.');
  if (!/\.(pdf|hwp|hwpx|xlsx|html?|png|jpe?g|gif|webp)$/i.test(name)) fail_('PDF·한글·엑셀(xlsx)·이미지·웹앱(html) 파일만 올릴 수 있어요.');
  var blob = Utilities.newBlob(Utilities.base64Decode(b64), String(p.mime || 'application/octet-stream'), name);
  var file = folder_().createFile(blob);
  return { fileId: file.getId() };
}
function getFile_(p) {
  var file;
  try { file = DriveApp.getFileById(String(p.id || '')); } catch (e) { fail_('파일을 찾을 수 없어요.'); }
  // 길잡이 폴더 안의 파일만 내준다
  var ok = false, parents = file.getParents(); var fid = folder_().getId();
  while (parents.hasNext()) if (parents.next().getId() === fid) ok = true;
  if (!ok) fail_('파일을 찾을 수 없어요.');
  return { name: file.getName(), mime: file.getMimeType(), b64: Utilities.base64Encode(file.getBlob().getBytes()) };
}
function docOut_(d) {
  var att = []; try { att = JSON.parse(d.attachments || '[]'); } catch (e) { }
  return { id: d.id, title: d.title, category: d.category, aliases: splitList_(d.aliases), body: String(d.body || '') + String(d.body2 || ''), owner: d.owner, updatedAt: day_(d.updatedAt), views: Number(d.views) || 0, status: d.status, attachments: att,
    format: d.format || '', order: Number(d.order) || 0, revisions: String(d.revisions || '').split(' | ').filter(String), fileText: String(d.fileText || ''), links: parseJ_(d.links, []), review: reviewOut_(d) };
}
function reviewOut_(d) {
  var r = parseJ_(d.review, null);
  if (r && r.type === 'edit' && r.base) r.base.body = String(d.prevBody || '') + String(d.prevBody2 || '');
  return r;
}
function toolOut_(t) { return { id: t.id, name: t.name, desc: t.desc, target: t.target, url: t.url, maker: t.maker, icon: t.icon || '', hidden: !!t.hidden, privacy: t.privacy === true || t.privacy === 'TRUE' || t.privacy === 'O', login: t.login === true || t.login === 'TRUE' || t.login === 'O', local: /^(tools|apps)\//.test(String(t.url || '')), review: parseJ_(t.review, null) }; }
function toolIn_(p) {
  var url = str_(p.url, 500).trim();
  if (!/^https:\/\//i.test(url) && !/^(tools|apps)\//.test(url)) fail_('주소는 https:// 로 시작해야 해요.');
  var name = str_(p.name, 30).trim(); if (!name) fail_('도구 이름을 적어 주세요.');
  return { name: name, desc: str_(p.desc, 80).trim(), target: str_(p.target, 10), url: url, maker: str_(p.maker, 30).trim(), privacy: p.privacy ? 'O' : '', login: p.login ? 'O' : '', icon: /^[a-z0-9-]{2,30}$/.test(String(p.icon || '')) ? p.icon : '', hidden: '' };
}
function splitList_(s) { return String(s || '').split(/[,，]/).map(function (x) { return x.trim(); }).filter(String); }

/* ───── 선생님이 바로 올리기·고치기 (학교 코드 확인, 관리자 확인 전까지 '승인 전' 표시) ───── */
// 문서에 붙이는 링크: 이름 + https 주소, 10개까지 (이름이 없으면 주소)
function linksIn_(list) {
  if (!(list instanceof Array)) return null;
  return list.slice(0, 10).map(function (l) {
    var url = str_(l && l.url, 500).trim(); if (url && !/^https?:\/\//i.test(url)) url = 'https://' + url;
    if (!/^https?:\/\//i.test(url)) return null;
    var name = str_(l.name, 40).trim() || url.replace(/^https?:\/\/(www\.)?/i, '').split('/')[0];
    return { name: name, url: url };
  }).filter(function (x) { return x; });
}
function saveDoc_(p) {
  guard_('code');
  if (String(p.code2 || '').trim() !== props_().getProperty('accessCode')) { strike_('code'); fail_('학교 코드가 맞지 않아요.', 'BAD_CODE2'); }
  var title = str_(p.title, 60).trim(), body = String(p.body || '').slice(0, CELL_MAX * 2), files = (p.files || []).slice(0, 5);
  if (!title || (body.length < 10 && !files.length)) fail_('제목과 내용을 적어 주세요.');
  if (/\b\d{6}\s?-\s?[1-4]\d{6}\b/.test(body)) fail_('주민등록번호로 보이는 내용은 올릴 수 없어요.');
  var aliases = (p.aliases || []).slice(0, 15).map(function (x) { return str_(x, 30); }).join(', ');
  var reason = str_(p.reason, 200), day = today_();
  var links = linksIn_(p.links);
  files = files.map(function (f) { return { name: str_(f.name, 100), ftype: str_(f.ftype, 6), fileId: str_(f.fileId, 80), size: Number(f.size) || 0, text: str_(f.text, 20000), replace: typeof f.replace === 'number' ? f.replace : null }; });
  return withLock_(function () {
    var category = str_(p.category, 20);
    if (p.newCategory) {
      var name = str_(p.newCategory, 20).trim();
      var c = cats_().filter(function (x) { return x.name === name; })[0];
      if (!c) { c = { id: uid_('c'), name: name, icon: /^[a-z0-9-]{2,30}$/.test(String(p.newCategoryIcon || '')) ? p.newCategoryIcon : 'folder', review: JSON.stringify({ at: day }), hidden: '' }; insert_('cats', c); }
      category = c.id;
    }
    var d = p.type === 'edit' ? find_('docs', p.docId) : null;
    if (d) {
      var r = parseJ_(d.review, null);
      if (!r) {
        r = { type: 'edit', base: { title: d.title, category: d.category, aliases: splitList_(d.aliases), attachments: parseJ_(d.attachments, []), fileHistory: parseJ_(d.fileHistory, []), links: parseJ_(d.links, []) } };
        d.prevBody = String(d.body || '') + String(d.body2 || ''); d.prevBody2 = ''; d.prevFileText = d.fileText || '';
      }
      r.at = day; if (reason) r.reason = reason;
      d.review = JSON.stringify(r);
      d.title = title; d.category = category; d.aliases = aliases; d.body = body; d.body2 = ''; d.updatedAt = day;
      if (links) d.links = JSON.stringify(links);
      var rm = (p.removeAtt || []).map(Number);
      if (rm.length) {
        var atts = parseJ_(d.attachments, []), hist = parseJ_(d.fileHistory, []);
        d.attachments = JSON.stringify(atts.filter(function (a, k) { if (rm.indexOf(k) >= 0) { hist.push(a); return false; } return true; }));
        d.fileHistory = JSON.stringify(hist.slice(-20));
      }
    } else {
      d = { id: uid_('d'), title: title, category: category, aliases: aliases, body: body, owner: '', updatedAt: day, views: 0, status: 'published', attachments: '[]', links: JSON.stringify(links || []),
        review: JSON.stringify({ type: 'new', at: day, reason: reason }) };
      insert_('docs', d);
    }
    attachFiles_(d, files);
    save_('docs', d);
    return { id: d.id };
  });
}
function report_(p) {
  var r = { id: uid_('r'), docId: str_(p.docId, 40), docTitle: str_(p.docTitle, 60), reason: str_(p.reason, 40), note: str_(p.note, 500), status: 'open', createdAt: today_(), resolvedAt: '', action: '' };
  return withLock_(function () { insert_('reports', r); return true; });
}

/* ───── 관리자 ───── */
function adminLogin_(pw) {
  guard_('admin');
  if (hash_(String(pw || ''), props_().getProperty('salt')) !== props_().getProperty('pwHash')) { strike_('admin'); fail_('비밀번호가 맞지 않아요.', 'BAD_PW'); }
  var token = Utilities.getUuid();
  CacheService.getScriptCache().put('adm_' + token, '1', 21600); // 6시간
  return token;
}
function checkToken_(t) { if (!t || !CacheService.getScriptCache().get('adm_' + t)) fail_('관리자 확인이 끝났어요. 다시 로그인해 주세요.', 'BAD_TOKEN'); }
function admin_(a, p) {
  if (a === 'adminData') {
    return { categories: cats_(), reports: all_('reports').reverse().slice(0, 200), docs: all_('docs').map(docOut_), settings: { schoolName: props_().getProperty('schoolName'), accessCode: props_().getProperty('accessCode'), hiddenClassTools: parseJ_(props_().getProperty('hiddenClassTools'), []) } };
  }
  return withLock_(function () {
    if (a === 'review') {
      if (p.kind === 'tool') {
        var tl = find_('tools', p.id); if (!tl) return true;
        var tr = parseJ_(tl.review, null);
        if (tr && !p.approve) { if (tr.type === 'new') tl.hidden = 'O'; else if (tr.base) { var bk = toolIn_(tr.base); for (var k in bk) tl[k] = bk[k]; } }
        tl.review = ''; save_('tools', tl); return true;
      }
      if (p.kind === 'cat') {
        var c = find_('cats', p.id); if (!c) return true;
        if (p.approve) c.review = ''; else c.hidden = 'O';
        save_('cats', c);
        if (!p.approve) all_('docs').forEach(function (x) { if (x.category === c.id) { x.category = 'guide'; save_('docs', x); } });
        return true;
      }
      var d = find_('docs', p.id); if (!d) return true;
      var r = parseJ_(d.review, null);
      if (r && !p.approve) {
        if (r.type === 'new') d.status = 'hidden';
        else if (r.base) {
          d.title = r.base.title; d.category = r.base.category; d.aliases = (r.base.aliases || []).join(', ');
          d.body = String(d.prevBody || '') + String(d.prevBody2 || ''); d.body2 = '';
          d.attachments = JSON.stringify(r.base.attachments || []); d.fileHistory = JSON.stringify(r.base.fileHistory || []); d.fileText = d.prevFileText || '';
          if (r.base.links) d.links = JSON.stringify(r.base.links);
        }
      }
      d.review = ''; d.prevBody = ''; d.prevBody2 = ''; d.prevFileText = '';
      save_('docs', d); return true;
    }
    if (a === 'resolveReport') {
      var r = find_('reports', p.id); if (!r) return true;
      r.status = 'resolved'; r.action = p.action === 'hide' ? 'hide' : 'keep'; r.resolvedAt = today_(); save_('reports', r);
      if (r.action === 'hide') { var hd = find_('docs', r.docId); if (hd) { hd.status = 'hidden'; save_('docs', hd); } }
      return true;
    }
    if (a === 'restoreDoc') { var rd = find_('docs', p.docId); if (rd) { rd.status = 'published'; save_('docs', rd); } return true; }
    if (a === 'saveTool') {
      if (!/^https:\/\//i.test(String(p.url || '')) && !/^(tools|apps)\//.test(String(p.url || ''))) fail_('주소는 https:// 로 시작해야 해요.');
      var t = toolIn_(p); t.id = str_(p.id, 40) || uid_('t'); t.review = '';   // 관리자가 저장하면 바로 승인
      if (find_('tools', t.id)) save_('tools', t); else insert_('tools', t);
      return true;
    }
    if (a === 'deleteTool') { var dt = find_('tools', p.id) || { id: str_(p.id, 40), name: '', desc: '', target: '', url: '', maker: '', privacy: '', login: '', icon: '' }; dt.hidden = 'O'; save_('tools', dt); return true; }
    if (a === 'saveCats') {
      var keep = {};
      (p.list || []).slice(0, 60).forEach(function (c, i) {
        var id = str_(c.id, 40); if (!id) return; keep[id] = true;
        var r = find_('cats', id) || { id: id, review: '', hidden: '' };
        r.name = str_(c.name, 20).trim() || r.name; r.icon = str_(c.icon, 30) || r.icon || 'folder'; r.order = String(i + 1); r.hidden = '';
        save_('cats', r);
      });
      cats_().forEach(function (c) {
        if (keep[c.id] || c.id === 'rules' || c.id === 'guide') return;
        var r = find_('cats', c.id) || { id: c.id, name: c.name, icon: c.icon, review: '' }; r.hidden = 'O'; save_('cats', r);
        all_('docs').forEach(function (x) { if (x.category === c.id) { x.category = 'guide'; save_('docs', x); } });
      });
      return true;
    }
    if (a === 'saveSettings') {
      var pr = props_();
      if (p.schoolName) pr.setProperty('schoolName', str_(p.schoolName, 30).trim());
      if (p.accessCode) { if (String(p.accessCode).length < 4) fail_('접속 코드는 4자 이상으로 해 주세요.'); pr.setProperty('accessCode', str_(p.accessCode, 30).trim()); }
      if (p.adminPassword) { if (String(p.adminPassword).length < 8) fail_('관리자 비밀번호는 8자 이상으로 해 주세요.'); pr.setProperty('pwHash', hash_(String(p.adminPassword), pr.getProperty('salt'))); }
      if (p.subjects) pr.setProperty('subjects', JSON.stringify((p.subjects || []).slice(0, 30).map(function (x) { return str_(x, 20); })));
      if (p.hiddenClassTools) pr.setProperty('hiddenClassTools', JSON.stringify((p.hiddenClassTools || []).slice(0, 30).map(function (x) { return str_(x, 20); })));
      return true;
    }
    if (a === 'importDocs') return importData_(p);
    if (a === 'restoreSite') return withLock_(function () {
      var e = parseJ_(props_().getProperty('siteEdits'), {}), key = str_(p.key, 60), x = e[key];
      if (!x) return true;
      if (p.mode === 'reset' || (key.indexOf('d:') === 0 && !x.name)) delete e[key]; else delete x.hidden;
      props_().setProperty('siteEdits', JSON.stringify(e)); return true;
    });
    if (a === 'exportAll') {
      return { format: 'gil-export/1', exportedAt: new Date().toISOString(), school: { name: props_().getProperty('schoolName') }, categories: cats_(), docs: all_('docs').map(docOut_), lessons: all_('lessons').map(function (l) { return { id: l.id, subject: l.subject, kind: l.kind, title: l.title, desc: l.desc, course: l.course, maker: l.maker, url: l.url, file: parseJ_(l.file, null), hidden: l.hidden }; }), tools: all_('tools').map(toolOut_), forms: {} };
    }
    fail_('알 수 없는 요청이에요.');
  });
}

// 자료 넣기 (관리자 '자료 가져오기', 처음 설정, 학교 기본 자료). onlyNew 면 이미 있는 문서는 건드리지 않는다
function importData_(p) {
  if (!p || p.format !== 'gil-export/1' || !p.docs || (!p.docs.length && !(p.lessons || []).length)) fail_('길잡이에서 내보낸 파일(.json)이 아니에요.');
  var added = 0, updated = 0;
  // 선생님이 만든 분류도 함께 (기본 분류는 그대로)
  (p.categories || []).forEach(function (c) {
    if (!c || !c.id || CATEGORIES.some(function (x) { return x.id === c.id; }) || find_('cats', str_(c.id, 40))) return;
    insert_('cats', { id: str_(c.id, 40), name: str_(c.name, 20), icon: str_(c.icon || 'folder', 30), review: '', hidden: '' });
  });
  p.docs.forEach(function (d) {
    if (!d || !d.id || !d.title) return;
    if (p.onlyNew && find_('docs', str_(d.id, 40))) return;   // 기본 자료 넣기: 이미 있는 문서(선생님이 고쳤을 수 있음)는 그대로
    var row = { id: str_(d.id, 40), title: str_(d.title, 80), category: str_(d.category, 20), aliases: (d.aliases || []).join(', '), body: String(d.body || '').slice(0, CELL_MAX * 2),
      owner: str_(d.owner, 30), updatedAt: str_(d.updatedAt || today_(), 10), views: Number(d.views) || 0, status: d.status === 'hidden' ? 'hidden' : 'published', attachments: JSON.stringify(d.attachments || []),
      format: str_(d.format, 10), order: Number(d.order) || 0, revisions: (d.revisions || []).join(' | '), links: JSON.stringify(d.links || []) };
    if (find_('docs', row.id)) { save_('docs', row); updated++; } else { insert_('docs', row); added++; }
  });
  (p.lessons || []).forEach(function (l) {
    if (!l || !l.id || find_('lessons', l.id)) return;
    var row = lessonIn_(l); row.id = str_(l.id, 40); row.date = today_(); insert_('lessons', row); added++;
  });
  return { added: added, updated: updated };
}

// 같은 이름 파일은 새 판으로 바꾸고 옛 판은 fileHistory 에 남긴다
function attachFiles_(d, files) {
  if (!files || !files.length) return;
  var atts = parseJ_(d.attachments, []), hist = parseJ_(d.fileHistory, []);
  files.forEach(function (f) {
    var att = { kind: 'file', name: f.name, ftype: f.ftype, fileId: f.fileId, size: f.size, date: today_(), ver: 1 };
    // 첨부 하나를 골라 바꾸기: 이름은 그대로, 내용만 새 파일로
    if (f.replace !== null && f.replace !== undefined && atts[f.replace]) {
      att.name = atts[f.replace].name; att.fileName = f.name; att.ver = (atts[f.replace].ver || 1) + 1;
      hist.push(atts[f.replace]); atts[f.replace] = att; return;
    }
    var i = -1; atts.forEach(function (a, k) { if (a.kind === 'file' && a.name === f.name) i = k; });
    if (i >= 0) { att.ver = (atts[i].ver || 1) + 1; hist.push(atts[i]); atts[i] = att; } else atts.push(att);
  });
  d.attachments = JSON.stringify(atts); d.fileHistory = JSON.stringify(hist.slice(-20));
  d.fileText = (String(d.fileText || '') + ' ' + files.map(function (f) { return f.text || ''; }).join(' ')).slice(-CELL_MAX);
}

/* ───── 비밀번호·무차별 대입 막기 ───── */
function hash_(pw, salt) { return Utilities.base64Encode(Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, salt + '|' + pw, Utilities.Charset.UTF_8)); }
function guard_(kind) { if (Number(CacheService.getScriptCache().get('fail_' + kind) || 0) >= 30) fail_('틀린 시도가 많아 10분 동안 막았어요. 잠시 뒤 다시 해 주세요.', 'LOCKED'); }
function strike_(kind) { var c = CacheService.getScriptCache(), k = 'fail_' + kind; c.put(k, String(Number(c.get(k) || 0) + 1), 600); }

/* ───── 시트 읽고 쓰기 ───── */
function withLock_(fn) { var l = LockService.getScriptLock(); l.waitLock(15000); try { return fn(); } finally { l.releaseLock(); } }
function sheet_(key) {
  var t = TABLES[key], ss = SpreadsheetApp.getActive(), sh = ss.getSheetByName(t.sheet);
  if (!sh) {
    sh = ss.insertSheet(t.sheet);
    sh.getRange(1, 1, 1, t.fields.length).setValues([t.fields.map(function (f) { return f[1]; })]).setFontWeight('bold').setBackground('#e1efe8');
    sh.setFrozenRows(1);
    sh.getRange(1, 1, sh.getMaxRows(), t.fields.length).setNumberFormat('@'); // 날짜·숫자 자동 변환 막기
  } else if (sh.getLastColumn() < t.fields.length) {
    // 새 버전에서 늘어난 칸: 머리글만 이어 붙인다
    var from = sh.getLastColumn() + 1, n = t.fields.length - from + 1;
    if (sh.getMaxColumns() < t.fields.length) sh.insertColumnsAfter(sh.getMaxColumns(), t.fields.length - sh.getMaxColumns());
    sh.getRange(1, from, 1, n).setValues([t.fields.slice(from - 1).map(function (f) { return f[1]; })]).setFontWeight('bold').setBackground('#e1efe8');
    sh.getRange(1, from, sh.getMaxRows(), n).setNumberFormat('@');
  }
  return sh;
}
function all_(key) {
  var t = TABLES[key], sh = sheet_(key), n = sh.getLastRow();
  if (n < 2) return [];
  return sh.getRange(2, 1, n - 1, t.fields.length).getValues().map(function (row) {
    var o = {}; t.fields.forEach(function (f, i) { o[f[0]] = row[i]; }); return o;
  }).filter(function (o) { return o.id; });
}
function rowOf_(key, id) {
  var sh = sheet_(key), n = sh.getLastRow(); if (n < 2 || !id) return -1;
  var ids = sh.getRange(2, 1, n - 1, 1).getValues();
  for (var i = 0; i < ids.length; i++) if (String(ids[i][0]) === String(id)) return i + 2;
  return -1;
}
function find_(key, id) { var r = rowOf_(key, id); if (r < 0) return null; var t = TABLES[key]; var row = sheet_(key).getRange(r, 1, 1, t.fields.length).getValues()[0]; var o = {}; t.fields.forEach(function (f, i) { o[f[0]] = row[i]; }); return o; }
function toRow_(key, o) {
  if (key === 'docs') {
    var b = String(o.body || '') + String(o.body2 || ''); o.body = b.slice(0, CELL_MAX); o.body2 = b.slice(CELL_MAX, CELL_MAX * 2);
    var pb = String(o.prevBody || '') + String(o.prevBody2 || ''); o.prevBody = pb.slice(0, CELL_MAX); o.prevBody2 = pb.slice(CELL_MAX, CELL_MAX * 2);
    o.prevFileText = String(o.prevFileText || '').slice(0, CELL_MAX);
  }
  return TABLES[key].fields.map(function (f) { var v = o[f[0]]; return v == null ? '' : (typeof v === 'object' ? JSON.stringify(v) : String(v)); });
}
function insert_(key, o) { sheet_(key).appendRow(toRow_(key, o)); }
function save_(key, o) { var r = rowOf_(key, o.id); if (r < 0) return insert_(key, o); sheet_(key).getRange(r, 1, 1, TABLES[key].fields.length).setValues([toRow_(key, o)]); }
function remove_(key, id) { var r = rowOf_(key, id); if (r > 0) sheet_(key).deleteRow(r); }

/* ───── 처음 한 번: 편집기에서 이 함수를 실행해 권한을 허용한다 (시트·드라이브 사용) ───── */
function authorize() {
  SpreadsheetApp.getActive().getName();
  DriveApp.getRootFolder().getName();
  return '권한 허용 완료';
}
