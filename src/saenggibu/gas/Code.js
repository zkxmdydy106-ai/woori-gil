/**
 * 생기부 도우미 — Code.js (웹앱)
 * 선생님이 자기 Google 계정으로 로그인해서 씁니다. (웹앱: 액세스하는 사용자 권한으로 실행)
 *
 *   1) 내 Classroom 수업 → 과제 고르기 (없으면 예시 학생)
 *   2) 학생마다 활동내용·교사관찰 등을 화면에서 바로 적기 → 내 Drive 「생기부 도우미 (내 기록)」 폴더에 저장
 *   3) [과제 내용 가져오기] → Classroom 제출물을 읽어 학생 이름을 S번호·학생B 로 바꿔 넣기
 *   4) [엑셀 만들기] → 고른 학생을 엑셀 파일로 내려받기
 *
 * 원칙
 *   - 학생 원본 파일은 읽기만 합니다. 수정·이동하지 않습니다.
 *   - 생성형 AI 를 부르지 않습니다. 이름 지우기는 선생님 Google 계정 안에서 끝납니다.
 *   - 만든 사람(배포자)에게는 아무것도 저장되지 않습니다. 모든 기록은 쓰는 선생님 Drive 에만 남습니다.
 * 공통 부분(저장 구조·이름 지우기·엑셀 표)은 Core.js 에 있습니다.
 */

const FOLDER_NAME = '생기부 도우미 (내 기록)';

function doGet() {
  return HtmlService.createHtmlOutputFromFile('Index')
    .setTitle('생기부 도우미')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1');
}

function whoami_() {
  try { return Session.getActiveUser().getEmail() || ''; } catch (e) { return ''; }
}

// ─────────────────────────────────────────────
// 저장: 선생님 Drive 폴더 속 JSON 파일
// ─────────────────────────────────────────────
const STORE_ = {
  _cache: {}, _files: {}, _folder: null,
  folder_() {
    if (this._folder) return this._folder;
    const p = PropertiesService.getUserProperties();
    const id = p.getProperty('folderId');
    if (id) { try { const f = DriveApp.getFolderById(id); if (!f.isTrashed()) return (this._folder = f); } catch (e) {} }
    const it = DriveApp.searchFolders("title = '" + FOLDER_NAME + "' and trashed = false and 'root' in parents");
    let f;
    if (it.hasNext()) f = it.next();
    else {
      f = DriveApp.createFolder(FOLDER_NAME);
      try { f.setDescription('생기부 도우미가 쓰는 기록입니다. 학생 실명이 들어 있으니 다른 사람과 공유하지 마세요.'); } catch (e) {}
    }
    p.setProperty('folderId', f.getId());
    return (this._folder = f);
  },
  file_(name) {
    if (this._files[name] !== undefined) return this._files[name];
    const it = this.folder_().searchFiles("title = '" + name + ".json' and trashed = false");
    return (this._files[name] = it.hasNext() ? it.next() : null);
  },
  read(name) {
    if (name in this._cache) return this._cache[name];
    const f = this.file_(name);
    let v = null;
    if (f) { try { v = JSON.parse(f.getBlob().getDataAsString('UTF-8') || 'null'); } catch (e) { v = null; } }
    return (this._cache[name] = v);
  },
  write(name, obj) {
    const text = JSON.stringify(obj);
    const f = this.file_(name);
    if (f) f.setContent(text);
    else this._files[name] = this.folder_().createFile(name + '.json', text, MimeType.PLAIN_TEXT);
    this._cache[name] = obj;
  },
  remove(name) {
    const f = this.file_(name);
    if (f) { try { f.setTrashed(true); } catch (e) {} }
    this._files[name] = null; this._cache[name] = null;
  }
};

let LOCK_DEPTH_ = 0;
function withLock_(fn) {
  if (LOCK_DEPTH_) return fn();
  const l = LockService.getUserLock();
  l.waitLock(30000);
  LOCK_DEPTH_++;
  try { return fn(); } finally { LOCK_DEPTH_--; l.releaseLock(); }
}

function myFolderUrl() { return STORE_.folder_().getUrl(); }

// ─────────────────────────────────────────────
// ⓪ Classroom 에서 수업·과제 고르기
// ─────────────────────────────────────────────
function listAll_(fn, key) {
  let out = [], token = null, guard = 0;
  do {
    const r = fn(token) || {};
    out = out.concat(r[key] || []);
    token = r.nextPageToken;
  } while (token && ++guard < 50);
  return out;
}

function hasContent_(sub) {
  const a = sub.assignmentSubmission && sub.assignmentSubmission.attachments;
  return !!((a && a.length) || (sub.shortAnswerSubmission && sub.shortAnswerSubmission.answer));
}

function listMyCourses() {
  if (typeof Classroom === 'undefined') return { ok: false, reason: 'Classroom 서비스가 꺼져 있습니다.' };
  try {
    const courses = listAll_(t => Classroom.Courses.list({ teacherId: 'me', courseStates: ['ACTIVE'], pageSize: 50, pageToken: t }), 'courses');
    return { ok: true, courses: courses.map(c => ({ id: c.id, name: c.name + (c.section ? ' (' + c.section + ')' : '') })) };
  } catch (e) {
    return { ok: false, reason: 'Classroom 을 읽지 못했습니다: ' + e.message };
  }
}

function listCourseWork(courseId) {
  try {
    const works = listAll_(t => Classroom.Courses.CourseWork.list(courseId, { pageSize: 50, pageToken: t }), 'courseWork').slice(0, 25);
    return {
      ok: true,
      works: works.map(w => {
        let n = 0;
        try {
          const subs = listAll_(t => Classroom.Courses.CourseWork.StudentSubmissions.list(courseId, w.id, { pageSize: 100, pageToken: t }), 'studentSubmissions');
          n = subs.filter(hasContent_).length;
        } catch (e) {}
        return { id: w.id, title: w.title, count: n };
      })
    };
  } catch (e) {
    return { ok: false, reason: '과제 목록을 읽지 못했습니다: ' + e.message };
  }
}

function useClassroom(courseId, courseName, workIds, workTitles) {
  return withLock_(() => {
    // 1) 누가 몇 개 냈는지
    const perUser = {};
    workIds.forEach(wid => {
      listAll_(t => Classroom.Courses.CourseWork.StudentSubmissions.list(courseId, wid, { pageSize: 100, pageToken: t }), 'studentSubmissions')
        .forEach(s => { if (hasContent_(s)) perUser[s.userId] = (perUser[s.userId] || 0) + 1; });
    });
    if (!Object.keys(perUser).length) return { ok: false, noSubmissions: true };

    // 2) 수업 명단
    const roster = listAll_(t => Classroom.Courses.Students.list(courseId, { pageSize: 100, pageToken: t }), 'students');
    const people = roster.map(st => {
      const nm = (st.profile && st.profile.name) || {};
      const fam = String(nm.familyName || '').trim(), giv = String(nm.givenName || '').trim();
      // 한국 계정은 fullName 이 "민수 김" 처럼 뒤집혀 있는 경우가 많아 성+이름으로 다시 만듭니다
      let full = /[가-힣]/.test(fam + giv) && fam && giv && !/\d/.test(fam + giv) ? fam + giv : String(nm.fullName || '').trim();
      full = full.replace(/^([가-힣])\s+([가-힣]{1,3})$/, '$1$2');
      const p = splitSidName_(full);
      p.name = koreanName_(p.name) || p.name;
      return { cid: String(st.userId), sid: p.sid, name: p.name, email: ((st.profile && st.profile.emailAddress) || '').toLowerCase(), count: perUser[st.userId] || 0 };
    }).filter(p => p.name);
    people.sort((a, b) => (a.sid && !b.sid ? -1 : !a.sid && b.sid ? 1 : String(a.sid).localeCompare(String(b.sid))) || a.name.localeCompare(b.name, 'ko'));

    // 3) 이 수업 기록에 합치기 — 적어 둔 기록은 지우지 않습니다
    const cls = upsertClass_({ key: courseId, name: courseName, sourceType: 'Classroom', courseId: courseId,
      workIds: workIds, workTitles: workTitles.join(' · ') });
    mergeRoster_(cls, people, courseName);
    return { ok: true, init: getInitData(cls.key) };
  });
}

// ─────────────────────────────────────────────
// ② 학생 한 명의 자료 목록 (Core.js 의 fillSubmissions 가 부릅니다)
// ─────────────────────────────────────────────
function collectItems_(cls, me, rules, cfg) {
  const items = cls.sourceType === 'Classroom' ? classroomItems_(cls, me, rules) : cls.sourceType === '예시' ? sampleItems_(me) : [];
  return items.concat(extraItems_(cfg, me, rules));
}

function classroomItems_(cls, me, rules) {
  const items = [];
  const cid = resolveCid_(cls, me);
  if (!cid) return [{ title: 'Classroom', missing: '이 학생을 Classroom 명단에서 찾지 못했습니다. [＋ 수업 추가]로 이 수업을 한 번 더 골라 주세요.' }];
  me._cid = cid;
  const titles = String(cls.workTitles || '').split(' · ');
  cls.workIds.forEach((wid, k) => {
    const wTitle = titles[k] || ('과제' + (k + 1));
    let subs = [];
    try {
      subs = listAll_(t => Classroom.Courses.CourseWork.StudentSubmissions.list(cls.courseId, wid, { userId: cid, pageToken: t }), 'studentSubmissions');
    } catch (e) { items.push({ title: wTitle, missing: 'Classroom 제출물을 읽지 못했습니다: ' + e.message }); return; }
    subs.forEach(sub => {
      const atts = (sub.assignmentSubmission && sub.assignmentSubmission.attachments) || [];
      atts.forEach(a => {
        if (a.driveFile && a.driveFile.id) {
          let f = null;
          try { f = DriveApp.getFileById(a.driveFile.id); } catch (e) {}
          const ft = cleanTitle_(stripExt_(a.driveFile.title || ''), rules, me);
          const key = x => String(x).replace(/[^0-9A-Za-z가-힣]/g, '');
          const title = ft && key(ft).indexOf(key(wTitle)) < 0 ? wTitle + '_' + ft : wTitle;
          if (f) items.push({ title: title, file: f, extra: true });   // 사진·스캔 PDF 도 글자를 읽습니다
          else items.push({ title: title, missing: '파일을 열 권한이 없습니다. (학생이 공유를 끈 파일일 수 있음)' });
        } else if (a.link && a.link.url) {
          items.push({ title: wTitle + '_링크', link: a.link.url, linkTitle: a.link.title || '' });
        } else if (a.youTubeVideo && a.youTubeVideo.alternateLink) {
          items.push({ title: wTitle + '_영상', link: a.youTubeVideo.alternateLink, linkTitle: a.youTubeVideo.title || '' });
        } else if (a.form && (a.form.responseUrl || a.form.formUrl)) {
          items.push({ title: wTitle + '_설문', link: a.form.responseUrl || a.form.formUrl, linkTitle: a.form.title || '' });
        }
      });
      if (sub.shortAnswerSubmission && sub.shortAnswerSubmission.answer) items.push({ title: wTitle + '_답안', text: sub.shortAnswerSubmission.answer });
    });
  });
  return items;
}

// 저장해 둔 Classroom ID 를 믿지 않고, 수업 명단에서 이메일·이름으로 다시 찾습니다 (10분 동안 기억)
function rosterMap_(courseId) {
  let cache = null;
  try { cache = CacheService.getUserCache(); } catch (e) {}
  const k = 'roster_' + courseId;
  const hit = cache && cache.get(k);
  if (hit) return JSON.parse(hit);
  const m = { email: {}, name: {} };
  listAll_(t => Classroom.Courses.Students.list(courseId, { pageSize: 100, pageToken: t }), 'students').forEach(st => {
    const p = st.profile || {}, nm = p.name || {};
    const e = String(p.emailAddress || '').toLowerCase();
    if (e) m.email[e] = String(st.userId);
    [String(nm.familyName || '') + String(nm.givenName || ''), nm.fullName].forEach(x => { const kn = koreanName_(x); if (kn && !m.name[kn]) m.name[kn] = String(st.userId); });
  });
  try { if (cache) cache.put(k, JSON.stringify(m), 600); } catch (e) {}
  return m;
}

function resolveCid_(cls, me) {
  try {
    const m = rosterMap_(cls.courseId);
    return (me.email && m.email[me.email]) || m.name[me.name] || me.cid;
  } catch (e) { return me.cid; }
}

// 추가 자료 폴더(종이 과제 사진·스캔, Classroom 밖에서 받은 파일)
function extraItems_(cfg, me, rules) {
  if (!cfg.extraId) return [];
  const all = [];
  try { walkFolder_(DriveApp.getFolderById(cfg.extraId), [], all); } catch (e) { return []; }
  return all.filter(x => belongsTo_(x, me))
    .map(x => ({ title: '추가_' + (cleanTitle_(stripExt_(x.file.getName()), rules, me) || '자료'), file: x.file, extra: true }));
}

function ensureExtraFolder() {
  return withLock_(() => {
    const s = settings_();
    if (s.extraId) { try { const f = DriveApp.getFolderById(s.extraId); if (!f.isTrashed()) return f.getUrl(); } catch (e) {} }
    const f = STORE_.folder_().createFolder('추가 자료 (종이 과제 사진·파일)');
    s.extraId = f.getId(); STORE_.write('settings', s);
    return f.getUrl();
  });
}

function walkFolder_(folder, path, out) {
  const fs = folder.getFiles();
  while (fs.hasNext()) out.push({ file: fs.next(), path: path.slice() });
  const subs = folder.getFolders();
  while (subs.hasNext()) { const s = subs.next(); walkFolder_(s, path.concat([s.getName()]), out); }
}

function belongsTo_(item, s) {
  const norm = t => String(t || '').replace(/\s+/g, '').toLowerCase();
  const hay = norm(item.file.getName()) + '|' + item.path.map(norm).join('|');
  if (s.name && hay.indexOf(norm(s.name)) >= 0) return true;
  if (s.sid && hay.indexOf(norm(s.sid)) >= 0) return true;
  if (s.email) {
    const local = s.email.split('@')[0];
    if (local && hay.indexOf(local) >= 0) return true;
    try { const o = item.file.getOwner(); if (o && String(o.getEmail()).toLowerCase() === s.email) return true; } catch (e) {}
  }
  return false;
}

// 엑셀을 화면에서 내려받지 못할 때 Drive 에 저장 (선택)
function saveFileToDrive(base64, name) {
  const blob = Utilities.newBlob(Utilities.base64Decode(base64), 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', name);
  return STORE_.folder_().createFile(blob).getUrl();
}

// ─────────────────────────────────────────────
// 글자 꺼내기 (원본은 건드리지 않습니다)
// ─────────────────────────────────────────────
function extractText_(f, allowImage) {
  const mt = f.getMimeType();
  try {
    if (mt === MimeType.GOOGLE_DOCS) return { ok: true, text: DocumentApp.openById(f.getId()).getBody().getText() };
    if (mt === MimeType.PLAIN_TEXT || mt === 'text/markdown' || mt === 'text/csv' || /\.txt$/i.test(f.getName())) return { ok: true, text: readTextFile_(f) };
    if (mt === MimeType.GOOGLE_SLIDES) {
      const t = [];
      SlidesApp.openById(f.getId()).getSlides().forEach(sl => sl.getShapes().forEach(sh => { try { t.push(sh.getText().asString()); } catch (e) {} }));
      return { ok: true, text: t.join('\n') };
    }
    if (mt === MimeType.GOOGLE_SHEETS) {
      const v = [];
      SpreadsheetApp.openById(f.getId()).getSheets().forEach(sh => sh.getDataRange().getDisplayValues().forEach(r => v.push(r.join('\t'))));
      return { ok: true, text: v.join('\n') };
    }
    if (/^image\//.test(mt)) {
      if (!allowImage) return { ok: false, reason: '사진은 이름표·얼굴이 찍혀 있을 수 있어 넣지 않습니다.' };
      if (typeof Drive === 'undefined') return { ok: false, reason: '사진 글자 읽기에는 Drive API 서비스가 필요합니다.' };
      const tmp = Drive.Files.copy({ name: '_tmp_사진글자', mimeType: MimeType.GOOGLE_DOCS }, f.getId(), { ocrLanguage: 'ko' });
      try {
        const t = DocumentApp.openById(tmp.id).getBody().getText();
        if (!t.trim()) return { ok: false, reason: '사진에서 글자를 읽지 못했습니다. 밝은 곳에서 반듯하게 다시 찍어 주세요.' };
        return { ok: true, text: t, ocr: true };
      } finally { try { DriveApp.getFileById(tmp.id).setTrashed(true); } catch (e) {} }
    }
    if (/hwp|haansoft/i.test(mt) || /\.hwpx?$/i.test(f.getName())) return { ok: false, reason: '한글(hwp) 파일은 읽지 못합니다. 한글에서 PDF 로 저장해 추가 자료 폴더에 넣어 주세요.' };
    if (mt === MimeType.PDF || mt === MimeType.MICROSOFT_WORD || mt === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
        || mt === MimeType.MICROSOFT_POWERPOINT || mt === 'application/vnd.openxmlformats-officedocument.presentationml.presentation') {
      if (typeof Drive === 'undefined') return { ok: false, reason: 'PDF·Word 를 읽으려면 Drive API 서비스가 필요합니다.' };
      const isPpt = /presentation|powerpoint/.test(mt);
      const tmp = Drive.Files.copy({ name: '_tmp_텍스트추출', mimeType: isPpt ? MimeType.GOOGLE_SLIDES : MimeType.GOOGLE_DOCS }, f.getId(), isPpt ? {} : { ocrLanguage: 'ko' });
      try {
        let t = '';
        if (isPpt) SlidesApp.openById(tmp.id).getSlides().forEach(sl => sl.getShapes().forEach(sh => { try { t += sh.getText().asString() + '\n'; } catch (e) {} }));
        else t = DocumentApp.openById(tmp.id).getBody().getText();
        if (!t.trim()) return { ok: false, reason: '글자를 읽지 못했습니다(스캔 PDF 일 수 있음).' };
        return { ok: true, text: t, ocr: mt === MimeType.PDF && !!allowImage };
      } finally { try { DriveApp.getFileById(tmp.id).setTrashed(true); } catch (e) {} }
    }
    return { ok: false, reason: '이 형식은 읽지 않습니다 (' + mt + ')' };
  } catch (e) {
    return { ok: false, reason: '읽는 중 오류: ' + e.message };
  }
}

// 윈도우 메모장에서 저장한 txt 는 한글이 EUC-KR(ANSI) 로 되어 있는 경우가 많습니다
function readTextFile_(f) {
  const blob = f.getBlob();
  let t = blob.getDataAsString('UTF-8');
  if (t.indexOf('�') >= 0) {
    for (const cs of ['MS949', 'EUC-KR']) {
      try { const u = blob.getDataAsString(cs); if (u && u.indexOf('�') < 0) { t = u; break; } } catch (e) {}
    }
  }
  return t.replace(/^﻿/, '');
}
