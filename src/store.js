// store.js: 저장소·로그인 어댑터. 화면(app.js)은 여기 있는 함수만 부른다.
// 지금: 시연(브라우저 안) / 구글 시트(Apps Script). 나중에 외부 DB나 웨일 스페이스 계정으로 바꿀 때 이 파일만 교체한다.
(function () {
  const LS = {
    get(k, d) { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); return true; } catch (e) { return !(e && /quota/i.test(e.name + e.message)); } },
    del(k) { try { localStorage.removeItem(k); } catch (e) { } }
  };
  const today = () => { const d = new Date(); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); };
  const uid = (p) => p + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  const clone = (o) => JSON.parse(JSON.stringify(o));

  /* ───────── 시연 저장소: 내장 가상 학교 + 이 브라우저에만 변경 저장 ───────── */
  function DemoStore() {
    const KEY = 'gil.demo.v6';
    let db = LS.get(KEY, null);
    if (!db || db.version !== 6) db = seed();
    function seed() {
      const d = clone(window.DEMO_DATA);
      d.docs = d.docs.concat(clone(window.DEMO_RULES || []));
      d.docs.forEach((x) => { x.status = 'published'; });
      // 예시: 선생님이 이미 올렸지만 관리자가 아직 확인하지 않은 문서 (한 줄만 고친 것은 원문에서 만든다)
      (d.suggestions || []).forEach((s) => {
        if (s.patch) { const doc = d.docs.find((x) => x.id === s.docId); s.body = doc.body.replace(s.patch.from, s.patch.to); }
        applyDoc(d, Object.assign({ type: s.type }, s), s.createdAt);
      });
      delete d.suggestions;
      d.version = 6;
      return d;
    }
    // 브라우저 저장 공간이 가득 차면 알려 준다 (시연 모드는 이 브라우저에만 저장)
    const save = () => { if (!LS.set(KEY, db)) throw new Error('이 브라우저의 저장 공간이 가득 찼어요. 큰 파일을 빼거나 \'처음 상태로 되돌리기\'를 해 주세요.'); };
    const isAdmin = (token) => token === 'demo-admin';

    return {
      mode: 'demo',
      async info() { return { schoolName: db.school.name, mode: 'demo', needsCode: false }; },
      async load() {
        return clone({
          school: { name: db.school.name },
          categories: db.categories,
          docs: db.docs.filter((d) => d.status === 'published'),
          tools: db.tools,
          forms: window.DEMO_DATA.forms,
          subjects: db.subjects || window.DEMO_DATA.subjects,
          lessons: (db.lessons || []).filter((l) => !l.hidden),
          siteEdits: db.siteEdits || {},
          siteOrder: db.siteOrder || {},
          classTools: window.DEMO_DATA.classTools.filter((t) => !(db.hiddenClassTools || []).includes(t.id))
        });
      },
      async hit(id, kind) { const d = (kind === 'lesson' ? db.lessons || [] : db.docs).find((x) => x.id === id); if (d) { d.views = (d.views || 0) + 1; save(); } },
      // 학교 코드만 맞으면 바로 반영한다. 관리자가 확인하기 전까지 review 표시가 붙는다
      async saveDoc(s, code) {
        const id = applyDoc(db, s, today());
        save();
        return { id };
      },
      async report(r) {
        db.reports.unshift(Object.assign({ id: uid('r'), status: 'open', createdAt: today() }, r));
        save();
      },
      // 못 찾은 검색어: 낱말·횟수·날짜만. 이름·연락처처럼 보이는 말은 저장하지 않는다
      async miss(q) {
        const t = String(q || '').replace(/\s+/g, ' ').trim().toLowerCase();
        if (t.length < 2 || t.length > 30 || /[ㄱ-ㅎㅏ-ㅣ]/.test(t) || /@|https?:|\d{5,}|\d{2,4}-\d{3,4}/.test(t)) return;
        if (t.split(' ').some((w) => /^[김이박최정강조윤장임한오서신권황안송류전홍][가-힣]{2}(선생님?|쌤|학생|교사|교감|교장|부장)?$/.test(w))) return;
        db.misses = db.misses || {};
        db.misses[t] = { n: ((db.misses[t] && db.misses[t].n) || 0) + 1, last: today() };
        save();
      },
      async missDel(token, term, all) {
        if (!isAdmin(token)) throw new Error('다시 로그인해 주세요.');
        if (all) db.misses = {}; else if (db.misses) delete db.misses[term];
        save();
      },
      async adminLogin(pw) {
        if (pw === db.school.adminPassword) return 'demo-admin';
        throw new Error('비밀번호가 맞지 않아요.');
      },
      async adminData(token) {
        if (!isAdmin(token)) throw new Error('다시 로그인해 주세요.');
        return { misses: db.misses || {}, reports: db.reports, docs: db.docs, categories: db.categories, settings: { schoolName: db.school.name, accessCode: db.school.accessCode, hiddenClassTools: db.hiddenClassTools || [] } };
      },
      // 관리자 확인: approve=true 면 표시만 지우고, false 면 되돌린다 (새 문서는 내리고, 고친 문서는 이전 내용으로)
      async review(token, kind, id, approve) {
        if (!isAdmin(token)) throw new Error('다시 로그인해 주세요.');
        reviewIn(db, kind, id, approve);
        save();
      },
      async resolveReport(token, id, action) {
        if (!isAdmin(token)) throw new Error('다시 로그인해 주세요.');
        const r = db.reports.find((x) => x.id === id);
        if (!r) return;
        r.status = 'resolved'; r.action = action; r.resolvedAt = today();
        if (action === 'hide') { const d = db.docs.find((x) => x.id === r.docId); if (d) d.status = 'hidden'; }
        save();
      },
      async restoreDoc(token, docId) {
        if (!isAdmin(token)) throw new Error('다시 로그인해 주세요.');
        const d = db.docs.find((x) => x.id === docId); if (d) { d.status = 'published'; save(); }
      },
      async saveTool(token, tool) {
        if (!isAdmin(token)) throw new Error('다시 로그인해 주세요.');
        const i = db.tools.findIndex((t) => t.id === tool.id);
        if (i >= 0) db.tools[i] = tool; else db.tools.push(Object.assign({ id: uid('t') }, tool));
        save();
      },
      // 도구 탭: 누구나 더하고 고친다 (승인 전 표시)
      async proposeTool(tool) {
        const old = tool.id && db.tools.find((t) => t.id === tool.id);
        const n = Object.assign({}, tool);
        if (old) { n.id = old.id; n.review = old.review && old.review.type ? Object.assign({}, old.review, { at: today() }) : { type: 'edit', at: today(), base: Object.assign({}, old, { review: undefined }) }; Object.assign(old, n); }
        else { n.id = uid('t'); n.review = { type: 'new', at: today() }; db.tools.push(n); }
        save(); return { id: n.id };
      },
      async deleteTool(token, id) {
        if (!isAdmin(token)) throw new Error('다시 로그인해 주세요.');
        db.tools = db.tools.filter((t) => t.id !== id); save();
      },
      async saveSettings(token, s) {
        if (!isAdmin(token)) throw new Error('다시 로그인해 주세요.');
        if (s.schoolName) db.school.name = s.schoolName;
        if (s.accessCode) db.school.accessCode = s.accessCode;
        if (s.adminPassword) db.school.adminPassword = s.adminPassword;
        if (s.subjects) db.subjects = s.subjects;
        if (s.hiddenClassTools) db.hiddenClassTools = s.hiddenClassTools;
        save();
      },
      // 분류 이름·아이콘·순서 저장. 목록에서 빠진 분류는 지우고 안의 문서는 '학교 생활 안내'로
      async saveCats(token, list) {
        if (!isAdmin(token)) throw new Error('다시 로그인해 주세요.');
        const keep = new Set(list.map((c) => c.id));
        db.docs.forEach((d) => { if (!keep.has(d.category)) d.category = 'guide'; });
        db.categories = list.map((c) => Object.assign({}, db.categories.find((x) => x.id === c.id) || {}, { id: c.id, name: c.name, icon: c.icon }));
        save();
      },
      async exportAll(token) {
        if (!isAdmin(token)) throw new Error('다시 로그인해 주세요.');
        return { format: 'gil-export/1', exportedAt: new Date().toISOString(), school: { name: db.school.name }, categories: db.categories, docs: db.docs, lessons: db.lessons || [], tools: db.tools, forms: db.forms };
      },
      // 다른 길잡이에서 내보낸 파일(gil-export/1)을 가져온다. 같은 id 는 덮어쓴다.
      async importDocs(token, data) {
        if (!isAdmin(token)) throw new Error('다시 로그인해 주세요.');
        const r = importInto(db, data, today);
        save();
        return r;
      },
      // 수업 자료는 승인 없이 바로 올리고 고친다 (옛 파일은 history 에 남김)
      async putFile(name, blob) { const id = 'f' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6); await GilFiles.put(id, blob); return id; },
      async getFile(id) { const b = await GilFiles.get(id); if (!b) throw new Error('이 기기에 파일이 없어요 (시연 모드에서는 올린 기기에서만 보여요)'); return b; },
      async addLesson(item) { db.lessons = db.lessons || []; db.lessons.unshift(Object.assign({ id: uid('l'), date: today() }, item)); save(); },
      async updateLesson(id, item) {
        const l = (db.lessons || []).find((x) => x.id === id); if (!l) throw new Error('자료를 찾을 수 없어요');
        if (item.file && l.file) { l.history = l.history || []; l.history.push(Object.assign({}, l.file, { text: undefined })); item.file.ver = (l.file.ver || 1) + 1; }
        Object.assign(l, item, { date: today() }); save();
      },
      async removeLesson(id) { const l = (db.lessons || []).find((x) => x.id === id); if (l) { l.hidden = true; save(); } },
      // 유용한 사이트: 기본 목록에서 고치거나 더한 것만 key 별로
      async saveSite(s) {
        if (!/^https:\/\//i.test(s.url || '')) throw new Error('주소는 https:// 로 시작해야 해요.');
        db.siteEdits = db.siteEdits || {}; const key = s.key || uid('s');
        db.siteEdits[key] = { group: s.group || '기타', for: s.for || '공통', icon: s.icon || '', name: s.name, url: s.url, desc: s.desc || '', at: today() }; save(); return { key };
      },
      async removeSite(key) { db.siteEdits = db.siteEdits || {}; db.siteEdits[key] = Object.assign({}, db.siteEdits[key] || {}, { hidden: true, at: today() }); save(); },
      async saveSiteOrder(group, keys) { db.siteOrder = db.siteOrder || {}; db.siteOrder[group] = keys.slice(0, 80); save(); },
      async restoreSite(token, key, mode) {
        if (!isAdmin(token)) throw new Error('다시 로그인해 주세요.');
        const e = db.siteEdits || {}, x = e[key]; if (!x) return;
        if (mode === 'reset' || (key.startsWith('d:') && !x.name)) delete e[key]; else delete x.hidden;
        save();
      },
      async reset() { db = seed(); LS.del(KEY); }
    };
  }

  // 새 문서·고친 문서를 바로 반영하고 '승인 전' 표시(review)를 붙인다. 고친 문서는 마지막으로 승인된 내용(base)을 남겨 비교·되돌리기에 쓴다
  const BASE_KEYS = ['title', 'category', 'aliases', 'body', 'attachments', 'fileText', 'fileHistory', 'links'];
  function applyDoc(db, s, day) {
    if (s.newCategory) {
      const name = String(s.newCategory).trim().slice(0, 20);
      let c = db.categories.find((x) => x.name === name);
      if (!c) { c = { id: uid('c'), name, icon: s.newCategoryIcon || 'folder', review: { at: day } }; db.categories.push(c); }
      s.category = c.id;
    }
    let d = s.type === 'edit' ? db.docs.find((x) => x.id === s.docId) : null;
    if (d) {
      if (!d.review) d.review = { type: 'edit', base: clone(BASE_KEYS.reduce((o, k) => { o[k] = d[k]; return o; }, {})) };
      d.review.at = day;
      if (s.reason) d.review.reason = s.reason;
      Object.assign(d, { title: s.title, category: s.category, aliases: s.aliases, body: s.body, updatedAt: day });
      if (s.links) d.links = s.links;
      removeAtts(d, s.removeAtt);
    } else {
      d = { id: uid('d'), title: s.title, category: s.category, aliases: s.aliases || [], body: s.body, owner: '', attachments: [], links: s.links || [], views: 0, updatedAt: day, status: 'published', review: { type: 'new', at: day, reason: s.reason || '' } };
      db.docs.push(d);
    }
    attachFiles(d, s.files, () => day);
    return d.id;
  }
  // 체크한 첨부를 뺀다 (뺀 것은 옛 파일 기록에 남는다)
  function removeAtts(d, idx) {
    if (!idx || !idx.length || !d.attachments) return;
    d.fileHistory = d.fileHistory || [];
    d.attachments = d.attachments.filter((a, k) => { if (idx.includes(k)) { d.fileHistory.push(Object.assign({}, a, { text: undefined })); return false; } return true; });
    d.fileText = d.attachments.filter((a) => a.kind === 'file').map((a) => a.text || '').join('\n').slice(0, 400000);
  }
  function reviewIn(db, kind, id, approve) {
    if (kind === 'tool') {
      const t = db.tools.find((x) => x.id === id); if (!t || !t.review) return;
      if (!approve) { if (t.review.type === 'new') db.tools = db.tools.filter((x) => x.id !== id); else Object.assign(t, t.review.base || {}); }
      delete t.review; return;
    }
    if (kind === 'cat') {
      const c = db.categories.find((x) => x.id === id); if (!c) return;
      if (approve) { delete c.review; return; }
      db.categories = db.categories.filter((x) => x.id !== id);
      const to = (db.categories.find((x) => x.id === 'guide') || db.categories[0]).id;
      db.docs.forEach((d) => { if (d.category === id) d.category = to; });
      return;
    }
    const d = db.docs.find((x) => x.id === id); if (!d || !d.review) return;
    if (!approve) {
      if (d.review.type === 'new') d.status = 'hidden';
      else BASE_KEYS.forEach((k) => { if (d.review.base[k] === undefined) delete d[k]; else d[k] = d.review.base[k]; });
    }
    delete d.review;
  }

  // 올린 파일을 문서에 붙인다. 같은 이름이 있으면 새 판으로 바꾸고 옛 판은 history 에 남긴다
  function attachFiles(d, files, today) {
    if (!files || !files.length) return;
    d.attachments = d.attachments || []; d.fileHistory = d.fileHistory || [];
    files.forEach((f) => {
      const att = { kind: 'file', name: f.name, ftype: f.ftype, fileId: f.fileId, url: f.url, size: f.size, text: f.text || '', date: today(), ver: 1 };
      // 첨부 하나를 골라 바꾸기: 이름은 그대로(예: 국내출장 여비 신청서), 내용만 새 파일로
      if (typeof f.replace === 'number' && d.attachments[f.replace]) {
        const old = d.attachments[f.replace];
        att.name = old.name; att.fileName = f.name; att.ver = (old.ver || 1) + 1;
        d.fileHistory.push(Object.assign({}, old, { text: undefined })); d.attachments[f.replace] = att;
        return;
      }
      const i = d.attachments.findIndex((a) => a.kind === 'file' && a.name === f.name);
      if (i >= 0) { const old = d.attachments[i]; att.ver = (old.ver || 1) + 1; d.fileHistory.push(Object.assign({}, old, { text: undefined })); d.attachments[i] = att; }
      else d.attachments.push(att);
    });
    d.fileText = d.attachments.filter((a) => a.kind === 'file').map((a) => a.text || '').join('\n').slice(0, 400000);
  }

  function importInto(db, data, today) {
    if (!data || data.format !== 'gil-export/1' || !Array.isArray(data.docs)) throw new Error('길잡이에서 내보낸 파일(.json)이 아니에요.');
    (data.categories || []).forEach((c) => { if (c && c.id && !db.categories.some((x) => x.id === c.id)) db.categories.unshift(c); });
    let added = 0, updated = 0;
    data.docs.forEach((d) => {
      if (!d || !d.id || !d.title) return;
      if (data.onlyNew && db.docs.some((x) => x.id === d.id)) return;
      const doc = Object.assign({ aliases: [], attachments: [], views: 0, owner: '', updatedAt: today() }, d, { status: d.status === 'hidden' ? 'hidden' : 'published' });
      const i = db.docs.findIndex((x) => x.id === d.id);
      if (i >= 0) { db.docs[i] = doc; updated++; } else { db.docs.push(doc); added++; }
    });
    db.lessons = db.lessons || [];
    (data.lessons || []).forEach((l) => { if (l && l.id && !db.lessons.some((x) => x.id === l.id)) { db.lessons.push(Object.assign({}, l)); added++; } });
    return { added, updated };
  }

  /* ───────── 구글 시트 저장소: 학교가 배포한 Apps Script 웹 앱 주소로 통신 ───────── */
  function SheetsStore(api) {
    let code = '';
    // Content-Type 을 text/plain 으로 보내 브라우저 사전 요청(CORS)을 피한다
    async function call(action, payload, extra) {
      const body = JSON.stringify(Object.assign({ action, code, payload: payload || null }, extra || {}));
      let res;
      try {
        res = await fetch(api, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body, redirect: 'follow' });
      } catch (e) {
        throw new Error('학교 저장소에 연결하지 못했어요. 인터넷 연결을 확인해 주세요.');
      }
      let data;
      try { data = await res.json(); } catch (e) { throw new Error('학교 저장소 응답을 읽지 못했어요. 주소가 맞는지 확인해 주세요.'); }
      if (!data.ok) { const err = new Error(data.error || '요청을 처리하지 못했어요.'); err.code = data.code; throw err; }
      return data.result;
    }
    return {
      mode: 'sheets',
      api,
      setCode(c) { code = c; },
      info: () => call('info'),
      // 학교 저장소에 없는 항목(교과 목록·학급 도구·서식 정의)은 판 기본 자료로 채운다
      load: async () => { const d = await call('load'); const D = window.DEMO_DATA || {}; d.subjects = d.subjects || D.subjects; d.classTools = (d.classTools || D.classTools || []).filter((t) => !(d.hiddenClassTools || []).includes(t.id));
        // 판에 들어 있는 기본 도구 + 저장소 도구 (저장소에서 고치면 그것으로, 숨기면 빠진다)
        const st = d.tools || [];
        d.tools = (D.tools || []).filter((t) => !st.some((x) => x.id === t.id)).concat(st).filter((t) => !t.hidden); d.forms = Object.assign({}, D.forms || {}, d.forms || {}); return d; },
      hit: (id, kind) => call('hit', kind ? { id, kind } : { id }).catch(() => { }),
      miss: (q) => call('miss', { q }).catch(() => { }),
      missDel: (token, term, all) => call('missDel', all ? { all: true } : { term }, { token }),
      saveDoc: (s, code) => call('saveDoc', Object.assign({}, s, { code2: code })),
      report: (r) => call('report', r),
      adminLogin: (pw) => call('adminLogin', { pw }),
      adminData: (token) => call('adminData', null, { token }),
      review: (token, kind, id, approve) => call('review', { kind, id, approve }, { token }),
      resolveReport: (token, id, action) => call('resolveReport', { id, action }, { token }),
      restoreDoc: (token, docId) => call('restoreDoc', { docId }, { token }),
      saveTool: (token, tool) => call('saveTool', tool, { token }),
      proposeTool: (tool) => call('proposeTool', tool),
      deleteTool: (token, id) => call('deleteTool', { id }, { token }),
      saveCats: (token, list) => call('saveCats', { list }, { token }),
      saveSettings: (token, s) => call('saveSettings', s, { token }),
      exportAll: (token) => call('exportAll', null, { token }),
      importDocs: (token, data) => call('importDocs', data, { token }),
      addLesson: (item) => call('addLesson', item),
      updateLesson: (id, item) => call('updateLesson', { id, item }),
      removeLesson: (id) => call('removeLesson', { id }),
      saveSite: (s) => call('saveSite', s),
      removeSite: (key) => call('removeSite', { key }),
      saveSiteOrder: (group, keys) => call('saveSiteOrder', { group, keys }),
      neis: (from, to) => call('neis', { from, to }),
      // Excel 뷰어용 공개 주소: Cloudflare 저장소(/api)일 때만 /f/<id>/<이름> 으로 파일을 내줄 수 있다
      publicFileUrl: api.charAt(0) === '/' ? (id, name) => location.origin + '/f/' + encodeURIComponent(id) + '/' + encodeURIComponent(name || 'file.xlsx') : null,
      tempFile: api.charAt(0) === '/' ? async (name, blob) => {
        const buf = new Uint8Array(await blob.arrayBuffer());
        let bin = ''; for (let i = 0; i < buf.length; i += 0x8000) bin += String.fromCharCode.apply(null, buf.subarray(i, i + 0x8000));
        const r = await call('tempFile', { name, b64: btoa(bin) }); return location.origin + '/f/' + r.id + '/' + encodeURIComponent(name);
      } : null,
      restoreSite: (token, key, mode) => call('restoreSite', { key, mode }, { token }),
      // 미리보기 그림(/t/f/<id>)·사이트 화면 그림(/t/s?u=)·다른 사이트 안에 띄워도 되는지: Cloudflare 저장소일 때만
      thumbUrl: api.charAt(0) === '/' ? (id) => '/t/f/' + encodeURIComponent(id) : null,
      shotUrl: api.charAt(0) === '/' ? (u) => '/t/s?u=' + encodeURIComponent(u) : null,
      saveThumb: api.charAt(0) === '/' ? (id, data) => call('thumb', { id, data }) : null,
      canFrame: api.charAt(0) === '/' ? (url) => call('frame', { url }) : null,
      async putFile(name, blob) {
        const buf = new Uint8Array(await blob.arrayBuffer());
        let bin = ''; for (let i = 0; i < buf.length; i += 0x8000) bin += String.fromCharCode.apply(null, buf.subarray(i, i + 0x8000));
        const r = await call('uploadFile', { name, mime: blob.type || 'application/octet-stream', b64: btoa(bin) });
        return r.fileId;
      },
      async getFile(id) {
        // Cloudflare 저장소는 파일 주소(/f/)로 바로 받는다 (빠르고 브라우저가 기억)
        if (api.charAt(0) === '/' && /^[A-Za-z0-9_-]{6,80}$/.test(String(id))) {
          try { const res = await fetch('/f/' + encodeURIComponent(id) + '/file'); if (res.ok) return await res.blob(); } catch (e) { /* 아래 방법으로 */ }
        }
        const r = await call('getFile', { id });
        return new Blob([Uint8Array.from(atob(r.b64), (c) => c.charCodeAt(0))], { type: r.mime });
      },
      setup: (s) => call('setup', s)
    };
  }

  /* ───────── 연결 정보: ?api= 로 받은 학교 저장소 주소를 기억 ───────── */
  const Conn = {
    // 공유 주소 형식: index.html?api=<Apps Script 웹 앱 주소>
    resolve() {
      // 사이트에 붙은 저장소(/api, Cloudflare)면 늘 그것을 쓴다 (예전에 기억한 구글 주소는 무시)
      const fixed = (window.GIL_CONFIG && window.GIL_CONFIG.api) || '';
      if (fixed.charAt(0) === '/') return fixed;
      let api = '';
      try { api = new URLSearchParams(location.search).get('api') || ''; } catch (e) { }
      if (api) { LS.set('gil.conn', { api }); return api; }
      const saved = LS.get('gil.conn', null);
      if (saved && saved.api) return saved.api;
      return (window.GIL_CONFIG && window.GIL_CONFIG.api) || '';
    },
    forget() { LS.del('gil.conn'); LS.del('gil.code'); },
    shareUrl(api) {
      const base = location.href.split('#')[0].split('?')[0];
      if (String(api).charAt(0) === '/') return base;
      return base + '?api=' + encodeURIComponent(api);
    }
  };

  /* ───────── 로그인 어댑터: 지금은 학교 접속 코드 ───────── */
  // 나중에 웨일 스페이스·학교 구글 계정 로그인으로 바꿀 때는 이 객체만 교체한다.
  const Auth = {
    kind: 'access-code',
    savedCode() { return LS.get('gil.code', ''); },
    remember(code) { LS.set('gil.code', code); },
    forget() { LS.del('gil.code'); },
    adminToken() { try { return sessionStorage.getItem('gil.admin') || ''; } catch (e) { return Auth._t || ''; } },
    setAdminToken(t) { Auth._t = t; try { t ? sessionStorage.setItem('gil.admin', t) : sessionStorage.removeItem('gil.admin'); } catch (e) { } }
  };

  window.GilStore = { DemoStore, SheetsStore, Conn, Auth, LS };
})();
