/**
 * 생기부 도우미 — Core.js
 * 웹앱(Apps Script)과 체험판(브라우저)이 함께 쓰는 부분: 기록 저장 구조, 이름 지우기, 엑셀 표 만들기.
 *
 * 저장은 STORE_ 가 맡습니다.
 *   - 웹앱: 로그인한 선생님 Drive 의 「생기부 도우미 (내 기록)」 폴더 속 JSON 파일 (Code.js)
 *   - 체험판: 이 브라우저 (local.js)
 * 이 파일은 두 곳에서 그대로 쓰므로 Apps Script 전용 기능(DriveApp 등)을 부르지 않습니다.
 *
 * 저장 단위
 *   settings        { school, extraNames[], extraId, current }
 *   classes         [{ key, name, tag, sourceType, courseId, workIds[], workTitles }]
 *   cls_<수업 키>   { students: [{ aiId, name, sid, email, cid, subCount, selected, status, notes{}, links }] }
 *   sub_<수업 키>   { <aiId>: { titles, links, text } }   ← 과제 내용 (이미 이름을 지운 글)
 */

const NOTE_KEYS = ['영역', '과목_활동명', '활동내용', '질문_사고', '결과_산출물',
  '태도·수업참여', '진로연계', '교사관찰', '성적추이(참고용·본문미기재)', '이전학기생기부'];
const EXPORT_HEAD = ['학번', '이름', '영역', '과목_활동명', '활동내용', '질문_사고', '결과_산출물', '태도', '진로연계', '교사관찰',
  '성적추이(참고용·본문미기재)', '이전학기생기부', '제출물_목록', '제출물_링크'];
const NOTE_MAX = 50000;      // 칸 하나에 적을 수 있는 글자 수
const SUB_MAX = 135000;      // 학생 한 명 과제 내용 (엑셀 칸 3개쯤)

// ─────────────────────────────────────────────
// 설정
// ─────────────────────────────────────────────
function settings_() {
  return Object.assign({ school: '', extraNames: [], extraId: '', current: '' }, STORE_.read('settings') || {});
}

function publicSettings_(s) {
  return { school: s.school, extraNames: (s.extraNames || []).join(', '), hasExtra: !!s.extraId };
}

function saveSettings(o) {
  return withLock_(() => {
    const s = settings_();
    if (o.school !== undefined) s.school = String(o.school).trim().slice(0, 60);
    if (o.extraNames !== undefined) s.extraNames = String(o.extraNames).split(/[,，\n]/).map(x => x.trim()).filter(Boolean).slice(0, 200);
    STORE_.write('settings', s);
    return publicSettings_(s);
  });
}

// ─────────────────────────────────────────────
// 수업
// ─────────────────────────────────────────────
function classes_() { return STORE_.read('classes') || []; }

function getClass_(key) {
  const c = classes_().find(x => x.key === key);
  if (!c) throw new Error('수업을 찾지 못했습니다. 위쪽에서 수업을 다시 골라 주세요.');
  return c;
}

// 번호 앞글자: "2학년 수학Ⅰ (2반)" → "2반", 없으면 수업 이름 앞 6글자
function makeTag_(name, used) {
  let t = (String(name).match(/(\d+)\s*반/) || [])[0];
  t = t ? t.replace(/\s/g, '') : String(name).replace(/[\s()\[\]:*?\/\\]/g, '').slice(0, 6) || '수업';
  let tag = t, n = 2;
  if (used.indexOf(tag) >= 0) {   // 같은 반을 두 과목 가르칠 때: "수학Ⅰ2반", "확통2반"
    const subj = String(name).replace(/\d+\s*학년/g, '').replace(/\(.*?\)/g, '').replace(/[\s()\[\]:*?\/\\]/g, '').slice(0, 2);
    if (subj) tag = subj + t;
  }
  const base = tag;
  while (used.indexOf(tag) >= 0) tag = base + (n++);
  return tag;
}

function upsertClass_(o) {
  const list = classes_();
  let c = list.find(x => x.key === o.key);
  if (!c) {
    c = { key: String(o.key), tag: o.tag || makeTag_(o.name, list.map(x => x.tag)) };
    list.push(c);
  }
  Object.assign(c, { name: o.name, sourceType: o.sourceType, courseId: String(o.courseId || ''),
    workIds: (o.workIds || []).map(String), workTitles: o.workTitles || '' });
  STORE_.write('classes', list);
  const s = settings_(); s.current = c.key; STORE_.write('settings', s);
  return c;
}

function removeClass(key) {
  return withLock_(() => {
    STORE_.write('classes', classes_().filter(c => c.key !== key));
    STORE_.remove('cls_' + key); STORE_.remove('sub_' + key);
    const s = settings_(); if (s.current === key) { s.current = ''; STORE_.write('settings', s); }
    return getInitData('');
  });
}

// ─────────────────────────────────────────────
// 학생 기록
// ─────────────────────────────────────────────
function studentsOf_(cls) {
  const d = STORE_.read('cls_' + cls.key) || { students: [] };
  const pre = cls.tag + '-S';
  let maxN = 0, changed = false;
  d.students.forEach(s => { if (String(s.aiId).indexOf(pre) === 0) maxN = Math.max(maxN, +String(s.aiId).slice(pre.length) || 0); });
  d.students.forEach(s => {
    if (String(s.aiId || '').indexOf(pre) !== 0) { s.aiId = pre + String(++maxN).padStart(2, '0'); changed = true; }
    s.notes = s.notes || {};
  });
  if (changed) STORE_.write('cls_' + cls.key, d);
  return d.students;
}

function saveStudents_(key, list) { STORE_.write('cls_' + key, { students: list }); }
function subsOf_(key) { return STORE_.read('sub_' + key) || {}; }

function hasNotes_(s) {
  return ['활동내용', '질문_사고', '결과_산출물', '태도·수업참여', '교사관찰', '이전학기생기부'].some(h => s.notes && s.notes[h]) || !!s.links;
}

function summary_(s, sub) {
  return { aiId: s.aiId, name: s.name, sid: s.sid || '', selected: !!s.selected, subCount: s.subCount === undefined ? '' : s.subCount,
    status: s.status || '', hasNotes: hasNotes_(s), hasSub: !!(sub && (sub.text || sub.links)) };
}

function sourceLabel_(cls, n) {
  if (cls.sourceType === 'Classroom') return 'Classroom · ' + cls.name + (cls.workTitles ? ' · ' + cls.workTitles : '');
  if (cls.sourceType === '예시') return '예시 학생 ' + n + '명 (가상 자료)';
  return cls.name;
}

// 화면이 처음 부르는 함수
function getInitData(key) {
  const classes = classes_();
  const s = settings_();
  const base = { configured: false, classes: [], settings: publicSettings_(s), user: whoami_() };
  if (!classes.length) return base;
  const cls = classes.find(c => c.key === (key || s.current)) || classes[classes.length - 1];
  if (s.current !== cls.key) { s.current = cls.key; STORE_.write('settings', s); }
  const list = studentsOf_(cls), subs = subsOf_(cls.key);
  return Object.assign(base, {
    configured: list.length > 0,
    classes: classes.map(c => ({ key: c.key, name: c.name, tag: c.tag })),
    current: cls.key, tag: cls.tag, sourceType: cls.sourceType, sourceLabel: sourceLabel_(cls, list.length),
    students: list.map(st => summary_(st, subs[st.aiId]))
  });
}

function getStudent(key, aiId) {
  const cls = getClass_(key);
  const s = studentsOf_(cls).find(x => x.aiId === aiId);
  if (!s) throw new Error(aiId + ' 학생을 찾지 못했습니다.');
  const sub = subsOf_(key)[aiId] || {};
  const notes = {};
  NOTE_KEYS.forEach(k => { notes[k] = s.notes[k] || ''; });
  return { aiId: s.aiId, name: s.name, sid: s.sid || '', status: s.status || '', subCount: s.subCount === undefined ? '' : s.subCount,
    notes: notes, links: s.links || '', sub: { titles: sub.titles || '', links: sub.links || '', text: sub.text || '' } };
}

// 화면에서 적는 대로 저장 (바뀐 칸만 보냅니다)
function saveStudent(key, aiId, patch) {
  return withLock_(() => {
    const cls = getClass_(key);
    const list = studentsOf_(cls);
    const s = list.find(x => x.aiId === aiId);
    if (!s) throw new Error(aiId + ' 학생을 찾지 못했습니다.');
    patch = patch || {};
    if (patch.notes) NOTE_KEYS.forEach(k => { if (patch.notes[k] !== undefined) s.notes[k] = String(patch.notes[k]).slice(0, NOTE_MAX); });
    if (patch.links !== undefined) s.links = String(patch.links).slice(0, 5000);
    if (patch.selected !== undefined) s.selected = !!patch.selected;
    saveStudents_(key, list);
    const subs = subsOf_(key);
    if (patch.sub) {
      const cur = subs[aiId] || {};
      ['titles', 'links', 'text'].forEach(k => { if (patch.sub[k] !== undefined) cur[k] = String(patch.sub[k]).slice(0, SUB_MAX); });
      subs[aiId] = cur;
      STORE_.write('sub_' + key, subs);
    }
    return summary_(s, subs[aiId]);
  });
}

function setSelected(key, ids) {
  return withLock_(() => {
    const cls = getClass_(key);
    const list = studentsOf_(cls);
    const want = {}; (ids || []).forEach(id => { want[id] = true; });
    list.forEach(s => { s.selected = !!want[s.aiId]; });
    saveStudents_(key, list);
    return true;
  });
}

// Classroom 명단을 합칩니다 — 선생님이 적어 둔 기록은 지우지 않습니다
function mergeRoster_(cls, people, defaultSubject) {
  const list = studentsOf_(cls);
  const byCid = {}, byName = {};
  list.forEach((s, i) => { if (s.cid) byCid[s.cid] = i; if (s.name) byName[s.name] = i; });
  people.forEach(p => {
    const idx = byCid[p.cid] !== undefined ? byCid[p.cid] : byName[p.name];
    let s;
    if (idx === undefined) {
      s = { aiId: '', name: p.name, selected: p.count > 0, status: '', notes: { '영역': '교과세특', '과목_활동명': defaultSubject }, links: '' };
      list.push(s);
    } else s = list[idx];
    s.sid = p.sid || s.sid || '';
    s.name = p.name;
    s.email = p.email || s.email || '';
    s.cid = p.cid;
    s.subCount = p.count;
  });
  saveStudents_(cls.key, list);
  studentsOf_(cls);   // 새 학생에게 번호(2반-S01 …)
}

// ─────────────────────────────────────────────
// 예시 학생 (실제 학생이 아닙니다)
// ─────────────────────────────────────────────
function useSample() {
  return withLock_(() => {
    const cls = upsertClass_({ key: 'SAMPLE', name: '예시 학생 (가상)', tag: '예시', sourceType: '예시' });
    const list = SAMPLE_.students.map((s, i) => ({
      aiId: cls.tag + '-S0' + (i + 1), name: s.name, sid: s.sid, email: s.email, cid: '', subCount: 3, selected: true, status: '',
      notes: { '영역': '교과세특', '과목_활동명': '수학Ⅰ', '태도·수업참여': s.attitude, '교사관찰': s.obs, '진로연계': s.career,
        '성적추이(참고용·본문미기재)': s.grade, '이전학기생기부': s.prev },
      links: ''
    }));
    saveStudents_(cls.key, list);
    STORE_.write('sub_' + cls.key, {});
    const st = settings_();
    if (!st.extraNames.length) { st.extraNames = ['박서준']; STORE_.write('settings', st); }
    return getInitData(cls.key);
  });
}

function sampleItems_(me) {
  return Object.keys(SAMPLE_.docs).filter(task => SAMPLE_.docs[task][me.name]).map(task => ({ title: task.replace(/\s/g, ''), text: SAMPLE_.docs[task][me.name] }));
}

// ─────────────────────────────────────────────
// ② 과제 내용 가져오기 — 학생 한 명씩
// ─────────────────────────────────────────────
function everyone_(cls, students) {
  // 다른 수업 학생 이름도 함께 지웁니다 (여러 반을 가르치면 친구 이름이 섞일 수 있어서)
  let all = students.slice();
  classes_().filter(c => c.key !== cls.key).forEach(c => { try { all = all.concat(studentsOf_(c)); } catch (e) {} });
  return all;
}

function stamp_() {
  const d = new Date(), p = n => String(n).padStart(2, '0');
  return (d.getMonth() + 1) + '/' + d.getDate() + ' ' + p(d.getHours()) + ':' + p(d.getMinutes());
}

function fillSubmissions(key, aiId) {
  const cfg = settings_();
  const cls = getClass_(key);
  const students = studentsOf_(cls);
  const me = students.find(s => s.aiId === aiId);
  if (!me) throw new Error(aiId + ' 학생을 찾지 못했습니다.');
  const rules = buildRules_(me, everyone_(cls, students), cfg);
  const counts = newCounts_();
  const skipped = [], warnings = [], parts = [], titles = [], links = [];
  let preview = null;
  const D = t => deidentify_(t, rules, counts);

  collectItems_(cls, me, rules, cfg).forEach(it => {
    if (it.link) { links.push(D(it.title + (it.linkTitle ? ' (' + it.linkTitle + ')' : '')) + ': ' + it.link); return; }
    const got = it.missing ? { ok: false, reason: it.missing } : it.text != null ? { ok: true, text: it.text } : extractText_(it.file, it.extra);
    if (!got.ok) { skipped.push({ title: it.title, reason: got.reason }); return; }
    const after = D(got.text).trim();
    parts.push('■ [' + it.title + ']\n' + after); titles.push(it.title);
    warnings.push.apply(warnings, residualCheck_(after, rules, it.title));
    if (got.ocr) warnings.push(it.title + ' 는 사진·스캔에서 글자를 읽었습니다. 이름이 잘못 읽혀 남아 있을 수 있으니 한 번 봐 주세요.');
    if (!preview) preview = { before: got.text.slice(0, 380), after: after.slice(0, 380) };
  });

  let body = parts.join('\n\n');
  if (body.length > SUB_MAX) { body = body.slice(0, SUB_MAX - 60) + '\n…(너무 길어 뒷부분을 줄였습니다)'; warnings.push(aiId + ' 과제 내용이 너무 길어 뒷부분을 줄였습니다.'); }
  const n = titles.length + links.length;
  withLock_(() => {
    const subs = subsOf_(key);
    subs[aiId] = { titles: titles.join(', '), links: links.join('\n'), text: body };
    STORE_.write('sub_' + key, subs);
    const list = studentsOf_(cls);
    const s = list.find(x => x.aiId === aiId);
    if (s) {
      s.status = (n ? '과제 넣음 ' + n + '개' : '자료 없음') + ' · ' + stamp_();
      if (me._cid && me._cid !== s.cid) s.cid = me._cid;
      saveStudents_(key, list);
    }
  });
  const total = Object.keys(counts).reduce((a, k) => a + counts[k], 0);
  return { aiId: aiId, realName: me.name, n: n, titles: titles, links: links.length, counts: counts, total: total,
    skipped: skipped, warnings: warnings, preview: preview, empty: !n };
}

// ─────────────────────────────────────────────
// ③ 엑셀 만들기 — 적어 둔 기록 + 과제 내용을 한 번 더 이름 지워서 표로
// ─────────────────────────────────────────────
function buildExport(key, ids) {
  const cfg = settings_();
  const cls = getClass_(key);
  const students = studentsOf_(cls);
  const subs = subsOf_(key);
  const all = everyone_(cls, students);
  const want = ids && ids.length ? ids : students.map(s => s.aiId);
  const counts = newCounts_(), warnings = [], noSub = [], empty = [];
  const rows = [];
  want.forEach(id => {
    const me = students.find(s => s.aiId === id);
    if (!me) return;
    const rules = buildRules_(me, all, cfg);
    const D = t => deidentify_(t, rules, counts);
    const n = me.notes || {}, sb = subs[id] || {};
    const teacherLinks = String(me.links || '').split(/[\s,]+/).filter(u => /^https?:\/\//i.test(u)).map(u => '선생님이 적은 링크: ' + u);
    const subLinks = String(sb.links || '').split('\n').filter(Boolean);
    const linkText = teacherLinks.concat(subLinks).join('\n');
    const sub = D(sb.text || '');                    // 선생님이 고치며 이름을 다시 적었을 수도 있어서 한 번 더
    const row = ['', id, D(n['영역']), D(n['과목_활동명']), D(n['활동내용']), D(n['질문_사고']), D(n['결과_산출물']),
      D(n['태도·수업참여']), D(n['진로연계']), D(n['교사관찰']), D(n['성적추이(참고용·본문미기재)']), D(n['이전학기생기부']),
      D(sb.titles || ''), linkText, sub];
    warnings.push.apply(warnings, residualCheck_(row.slice(2, 13).concat([sub]).join('\n'), rules, id));
    if (!sb.text && !sb.links) noSub.push(id);
    if (!sb.text && !sb.links && !linkText && !NOTE_KEYS.filter(h => h !== '영역' && h !== '과목_활동명').some(h => n[h])) empty.push(id);
    rows.push(row);
  });
  const total = Object.keys(counts).reduce((a, k) => a + counts[k], 0);
  return { tag: cls.tag, head: EXPORT_HEAD, rows: rows, counts: counts, total: total, warnings: warnings, noSub: noSub, empty: empty };
}

function newCounts_() { return { 이름: 0, 친구이름: 0, 학번: 0, 이메일: 0, 연락처: 0, 학급정보: 0, 학교: 0 }; }

// ─────────────────────────────────────────────
// 이름 다루기
// ─────────────────────────────────────────────
// 닉네임에서 한글 이름만 꺼냅니다: "st홍길동" → "홍길동", "홍길동(2반)" → "홍길동"
function koreanName_(s) {
  const runs = String(s || '').match(/[가-힣]{2,4}/g);
  if (!runs) return '';
  return runs.sort((a, b) => b.length - a.length)[0];
}

// "20201 김민수", "김민수20201", "2-1-01 김민수" 같은 계정 이름을 학번 + 이름으로 나눕니다
function splitSidName_(full) {
  let m = full.match(/^(\d[\d\-]{3,})\s*(.+)$/);
  if (m) return { sid: m[1], name: m[2].trim() };
  m = full.match(/^(.+?)\s*(\d[\d\-]{3,})$/);
  if (m) return { sid: m[2], name: m[1].trim() };
  return { sid: '', name: full };
}

// ─────────────────────────────────────────────
// 개인정보 지우기 규칙
// ─────────────────────────────────────────────
function buildRules_(me, students, cfg) {
  const pairs = [], names = [], check = [];
  const esc = x => x.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  // 이름 한 글자 사이 띄어쓰기("김 민수", "김민 수")까지 잡는 규칙
  const addPattern = (word, label, kind) => {
    if (!word || word.length < 2) return;
    const src = /^[가-힣]+$/.test(word) ? word.split('').map(esc).join('\\s?') : esc(word);
    names.push({ re: new RegExp(src, 'g'), len: word.length, label: label, kind: kind });
    check.push(word);
  };
  const addName = (full, label, kind) => {
    if (!full) return;
    const raw = String(full).trim();
    const joined = raw.replace(/\s+/g, '');
    const variants = [joined];
    const kn = koreanName_(raw);
    if (kn && kn !== joined) variants.push(kn);
    const tok = raw.split(/\s+/);
    if (tok.length === 2 && /[가-힣]/.test(raw)) variants.push(tok[1] + tok[0]);   // "민수 김" → "김민수"
    if (!/[가-힣]/.test(raw)) variants.push(raw);
    variants.forEach(v => {
      addPattern(v, label, kind);
      if (/^[가-힣]{3,4}$/.test(v)) addPattern(v.slice(1), label, kind);            // 김민수 → 민수
    });
  };
  addName(me.name, me.aiId, '이름');
  let letter = 1;                                                  // 다른 학생 → 학생B, 학생C …
  const next = () => '학생' + (letter < 26 ? String.fromCharCode(65 + letter++) : (letter++));
  const seen = {}; seen[me.name] = true;                           // 다른 수업에 같은 학생이 있으면 한 번만
  students.forEach(s => { if (s.name && !seen[s.name]) { seen[s.name] = true; addName(s.name, next(), '친구이름'); } });
  (cfg.extraNames || []).forEach(n => addName(n, next(), '친구이름'));
  students.forEach(s => { if (s.sid) pairs.push([s.sid, '[삭제]', '학번']); });
  students.forEach(s => { if (s.email) pairs.push([s.email, '[이메일 삭제]', '이메일']); });
  if (cfg.school) pairs.push([cfg.school, '[학교]', '학교']);
  pairs.sort((a, b) => b[0].length - a[0].length);
  names.sort((a, b) => b.len - a.len);                               // 긴 것부터: '김민수' 가 '민수' 보다 먼저
  return {
    pairs: pairs,
    names: names,
    regex: [
      [/[A-Za-z0-9._%+\-]+@[A-Za-z0-9.\-]+\.[A-Za-z]{2,}/g, '[이메일 삭제]', '이메일'],
      [/01[016789][-.\s]?\d{3,4}[-.\s]?\d{4}/g, '[연락처 삭제]', '연락처'],
      [/\d\s*학년\s*\d+\s*반(\s*\d+\s*번)?/g, '[학급정보 삭제]', '학급정보'],
      [/학번\s*[:：]?\s*\d{4,6}/g, '학번 [삭제]', '학번']
    ],
    checkNames: check
  };
}

function deidentify_(text, rules, counts) {
  let t = String(text || '');
  (rules.names || []).forEach(n => {
    t = t.replace(n.re, () => { if (counts) counts[n.kind]++; return n.label; });
  });
  rules.pairs.forEach(p => {
    const n = t.split(p[0]).length - 1;
    if (n > 0) { t = t.split(p[0]).join(p[1]); if (counts) counts[p[2]] += n; }
  });
  rules.regex.forEach(r => { t = t.replace(r[0], () => { if (counts) counts[r[2]]++; return r[1]; }); });
  return t;
}

function residualCheck_(text, rules, fileName) {
  const w = [];
  rules.checkNames.forEach(n => { if (n && text.indexOf(n) >= 0) w.push(fileName + ' 에 이름이 남아 있습니다.'); });
  if (/[A-Za-z0-9._%+\-]+@[A-Za-z0-9.\-]+\.[A-Za-z]{2,}/.test(text)) w.push(fileName + ' 에 이메일 모양 글자가 남아 있습니다.');
  if (/(^|[^\d])[1-3]\d{4}([^\d]|$)/.test(text)) w.push(fileName + ' 에 학번처럼 보이는 5자리 숫자가 있습니다. 눈으로 확인해 주세요.');
  return w;
}

// 20201_김민수_지수함수탐구 → 지수함수탐구
function cleanTitle_(name, rules, me) {
  let t = String(name);
  [me.name, me.sid, me.email, me.email ? me.email.split('@')[0] : ''].filter(Boolean)
    .sort((a, b) => b.length - a.length).forEach(x => { t = t.split(x).join(''); });
  t = deidentify_(t, rules, null);
  return t.replace(/\[삭제\]|S\d{2}/g, '').replace(/[\s_\-–—·]+/g, '_').replace(/^_+|_+$/g, '');
}

function stripExt_(n) { return String(n).replace(/\.[A-Za-z0-9]{1,5}$/, ''); }

// ─────────────────────────────────────────────
// 예시 학생 자료 (가상 인물입니다)
// ─────────────────────────────────────────────
const SAMPLE_ = {
  students: [
    { name: '김민수', sid: '20201', email: 'minsu123@example-school.kr',
      attitude: '모르는 부분을 그냥 넘기지 않고 쉬는 시간에 찾아와 질문함. 모둠에서 계산 확인을 맡음.',
      obs: '지수함수 수업에서 "밑이 1보다 작으면 왜 줄어드는지" 질문함. 표를 만들어 보라는 피드백 뒤 x에 0, 1, 2를 넣은 값을 비교해 스스로 설명함.',
      career: '데이터 분석 관심', grade: '1학기 초 함수 단원 어려워함 → 2학기 들어 서술형 답안이 정확해짐',
      prev: '(1학기) 등차수열 활동에서 계단 개수 규칙을 표로 정리하고 일반항을 말로 설명함.' },
    { name: '이서연', sid: '20214', email: 'seoyeon@example-school.kr',
      attitude: '처음에는 발표를 피했으나 2학기부터 모둠 대표로 풀이를 설명함.',
      obs: '그래프가 x=1 에서 만난다고 잘못 생각했다가 피드백 뒤 직접 값을 계산해 고친 과정을 활동지에 남김.',
      career: '', grade: '', prev: '' },
    { name: '박하준', sid: '20222', email: 'hajun07@example-school.kr',
      attitude: '수업 중 도구 활용에 적극적임.',
      obs: 'GeoGebra 슬라이더로 밑을 바꿔 가며 모둠 친구들에게 그래프 변화를 보여 줌.',
      career: '게임 개발 관심', grade: '', prev: '(1학기) 삼각함수 그래프를 코딩으로 그려 발표함.' }
  ],
  docs: {
    '지수함수 탐구 활동지': {
      '김민수': '2학년 1반 1번 김민수 (학번 20201)\n제출 계정: minsu123@example-school.kr\n\n[활동 1] y=2^x, y=3^x 의 그래프를 모눈종이에 직접 그려 비교하시오.\n- x=0 일 때 두 그래프 모두 (0,1) 을 지난다.\n- x 가 커질수록 y=3^x 가 y=2^x 보다 훨씬 빠르게 커진다.\n\n[활동 2] 밑이 커지면 그래프가 어떻게 달라지는지 설명하시오.\n- 밑이 클수록 x 가 1 늘어날 때 y 가 곱해지는 수가 커지므로 증가 속도가 빨라진다.',
      '이서연': '2학년 1반 14번 이서연 (학번 20214)\n\n[활동 1] (처음 풀이) 두 그래프는 x=1 에서 만난다고 생각했다.\n(수정) 피드백을 받고 다시 계산해 보니 만나는 점은 (0,1) 하나뿐이었다.\n\n[활동 2] 표를 만들어 x=0,1,2,3 일 때 값을 비교했더니 y=3^x 의 값이 매번 더 크게 늘어났다.',
      '박하준': '2학년 1반 22번 박하준 (학번 20222)\n\n[활동 1] GeoGebra 로 밑을 1.5, 2, 3, 5 로 바꿔 가며 변화를 관찰했다.\n[활동 2] 밑이 커질수록 그래프가 y축 쪽으로 가팔라진다. 모둠 친구들에게 슬라이더를 움직이며 설명했다.'
    },
    '인구 증가 모델 보고서': {
      '김민수': '인구 증가 모델 탐구 보고서 — 김민수 (2학년 1반)\n연락처: 010-1234-5678\n\n한 도시 인구 자료(2000~2020년)를 찾아 P(t)=P0·a^t 꼴로 모델을 세웠다. 2020년 모델 값이 실제보다 약 8% 크게 나왔다. 실제 인구는 출생률 감소와 전출 때문에 일정한 비율로 늘지 않기 때문이다. 짧은 기간 예측에는 쓸 만하지만 긴 기간에는 맞지 않는다.',
      '이서연': '인구 증가 모델 보고서 — 이서연\n\n처음에는 일차함수로 계산했다. 상담 뒤 "같은 비율" 로 늘면 지수함수가 맞다는 것을 알고 모델을 다시 세워 두 모델의 예측값을 표로 비교했다.',
      '박하준': '보고서 — 박하준 (hajun07@example-school.kr)\n\n세균 번식 영상 자료로 지수함수 모델을 세우고 그래프 애니메이션을 만들어 발표했다. 질문에 답하며 "먹이가 무한하다" 는 가정이 현실과 다르다는 점을 덧붙였다.'
    },
    '수업 자기평가': {
      '김민수': '자기평가서 — 2학년 1반 1번 김민수\n\n처음에는 그래프 모양만 비교했는데, 이서연, 박서준과 토의한 뒤 증가율을 비교해야 한다는 것을 알게 되었다.\n나는 모둠을 이끌며 협업 능력이 뛰어났다고 생각한다.',
      '이서연': '자기평가서 — 이서연\n\n틀린 풀이를 고치며 왜 틀렸는지 설명할 수 있게 되었다. 다음에는 표를 먼저 만들어 보겠다.',
      '박하준': '자기평가서 — 박하준\n\n설명하는 것이 재미있었다. 김민수가 계산을 도와주어 보고서를 끝낼 수 있었다.'
    }
  }
};
