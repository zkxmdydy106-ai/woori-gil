// app.js: 우리학교 길잡이 화면 (홈·검색·문서·쓰기·고치기·신고·관리자·도구·학교 개설). 저장은 store.js 를 통해서만 한다.
(function () {
  const { DemoStore, SheetsStore, Conn, Auth, LS } = window.GilStore;
  const $ = (s, el) => (el || document).querySelector(s);
  const $$ = (s, el) => Array.from((el || document).querySelectorAll(s));
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const ic = (name, cls) => `<svg class="icon ${cls || ''}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${(window.ICONS || {})[name] || ''}</svg>`;
  // 날짜는 관리자 화면에서만 쓴다. 형식이 다르면(옛 저장소의 날짜형 등) 비워 둔다
  const fmtDate = (d) => { const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(d || '')); return m ? `${m[1]}.${m[2]}.${m[3]}` : ''; };
  const params = (() => { try { return new URLSearchParams(location.search); } catch (e) { return new Map(); } })();

  const App = { store: null, data: null, mode: 'demo', embed: params.get('mode') === 'embed', viewed: new Set() };

  /* ───────── 공통 도구 ───────── */
  function toast(msg) {
    let t = $('#toast');
    if (!t) { t = document.createElement('div'); t.id = 'toast'; t.className = 'toast'; t.setAttribute('role', 'status'); document.body.appendChild(t); }
    t.textContent = msg; t.classList.add('show');
    clearTimeout(toast._t); toast._t = setTimeout(() => t.classList.remove('show'), 2200);
  }
  function modal(html, onMount) {
    return new Promise((resolve) => {
      const bg = document.createElement('div');
      bg.className = 'modal-bg';
      bg.innerHTML = `<div class="modal" role="dialog" aria-modal="true">${html}</div>`;
      document.body.appendChild(bg);
      const close = (v) => { bg.remove(); document.removeEventListener('keydown', onKey); resolve(v); };
      const onKey = (e) => { if (e.key === 'Escape') close(null); };
      document.addEventListener('keydown', onKey);
      bg.addEventListener('click', (e) => { if (e.target === bg || e.target.closest('[data-close]')) close(null); });
      onMount && onMount(bg.firstElementChild, close);
      const f = bg.querySelector('input, textarea, button.primary'); f && f.focus();
    });
  }
  async function copyText(text) {
    try { await navigator.clipboard.writeText(text); toast('복사했어요'); return; } catch (e) { }
    const ta = document.createElement('textarea'); ta.value = text; ta.style.position = 'fixed'; ta.style.opacity = '0';
    document.body.appendChild(ta); ta.select();
    try { document.execCommand('copy'); toast('복사했어요'); } catch (e) { toast('복사하지 못했어요. 직접 선택해 복사해 주세요.'); }
    ta.remove();
  }
  function download(name, text, type) {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([text], { type: type || 'text/plain;charset=utf-8' }));
    a.download = name; document.body.appendChild(a); a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
  }
  const catOf = (id) => (App.data.categories.find((c) => c.id === id) || { name: '기타', icon: 'file-text' });
  const docOf = (id) => App.data.docs.find((d) => d.id === id);
  const HOMEROOM = '학급';   // 수업 자료 가운데 학급 탭에 보이는 것
  // 관리자가 아직 확인하지 않은 문서·분류 표시
  const pendBadge = (x) => (x && x.review ? `<span class="badge amber pend">${x.review.type === 'edit' ? '고침 · 승인 전' : '승인 전'}</span>` : '');

  /* ───────── 문서 본문 (간단한 마크다운) ───────── */
  function inline(s) {
    let h = esc(s);
    h = h.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
    h = h.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (m, t, u) => {
      const url = u.replace(/&amp;/g, '&');
      if (/^#\//.test(url)) return `<a href="${esc(url)}">${t}</a>`;
      if (/^https?:\/\//i.test(url)) return `<a href="${esc(url)}" target="_blank" rel="noopener noreferrer">${t}</a>`;
      return t;
    });
    return h;
  }
  function md(src) {
    const L = String(src || '').replace(/\r/g, '').split('\n');
    let out = '', i = 0;
    // 목록 줄: "3." "3. 내용" "3) 내용" / "-" "- 내용" "• 내용" (뒤에 칸이 없어도 목록으로)
    const OL = /^\s*(\d+)[.)](?:\s+|$)/, UL = /^\s*(?:[-*](?:\s+|$)|[•·]\s*)/;
    const special = (l) => /^(#{1,3} |\||> )/.test(l) || OL.test(l) || UL.test(l);
    while (i < L.length) {
      const l = L[i];
      if (!l.trim()) { i++; continue; }
      if (/^###\s/.test(l)) { out += `<h3>${inline(l.replace(/^###\s/, ''))}</h3>`; i++; continue; }
      if (/^#{1,2}\s/.test(l)) { out += `<h2>${inline(l.replace(/^#{1,2}\s/, ''))}</h2>`; i++; continue; }
      if (/^\|/.test(l)) {
        const rows = [];
        while (i < L.length && /^\|/.test(L[i])) { rows.push(L[i]); i++; }
        const cells = (r) => r.replace(/^\|/, '').replace(/\|\s*$/, '').split('|').map((c) => c.trim());
        const body = rows.filter((r, k) => !(k === 1 && /^[\s|:-]+$/.test(r)));
        const head = cells(body.shift());
        out += '<div class="tbl"><table><thead><tr>' + head.map((c) => `<th>${inline(c)}</th>`).join('') + '</tr></thead><tbody>' +
          body.map((r) => '<tr>' + cells(r).map((c) => `<td>${inline(c)}</td>`).join('') + '</tr>').join('') + '</tbody></table></div>';
        continue;
      }
      if (/^>\s?/.test(l)) {
        const buf = [];
        while (i < L.length && /^>\s?/.test(L[i])) { buf.push(L[i].replace(/^>\s?/, '')); i++; }
        out += `<div class="callout">${ic('info-circle')}<div>${buf.map(inline).join('<br>')}</div></div>`;
        continue;
      }
      if (/^- \[[ xX]\]\s/.test(l)) {
        const buf = [];
        while (i < L.length && /^- \[[ xX]\]\s/.test(L[i])) { buf.push(L[i].replace(/^- \[[ xX]\]\s/, '')); i++; }
        out += '<ul class="check">' + buf.map((b) => `<li><span class="box"></span><span>${inline(b)}</span></li>`).join('') + '</ul>';
        continue;
      }
      if (UL.test(l)) {
        const buf = [];
        while (i < L.length && UL.test(L[i]) && !/^- \[[ xX]\]\s/.test(L[i])) { buf.push(L[i].replace(UL, '')); i++; }
        out += '<ul>' + buf.map((b) => `<li>${inline(b)}</li>`).join('') + '</ul>';
        continue;
      }
      if (OL.test(l)) {
        const buf = [], start = +OL.exec(l)[1];
        while (i < L.length && OL.test(L[i])) { buf.push(L[i].replace(OL, '')); i++; }
        out += `<ol${start > 1 ? ` start="${start}"` : ''}>` + buf.map((b) => `<li>${inline(b)}</li>`).join('') + '</ol>';
        continue;
      }
      const buf = [];
      while (i < L.length && L[i].trim() && !special(L[i])) { buf.push(L[i]); i++; }
      out += `<p>${buf.map(inline).join('<br>')}</p>`;
    }
    return out;
  }

  /* ───────── 규정 본문 (## 장, ### 조, 나머지는 항·호·목 들여쓰기) ───────── */
  const GA = '[가나다라마바사아자차카타파하]';
  const RE_L3 = new RegExp('^(' + GA + '\\.|\\(\\d+\\)|[⑴-⒇]|' + GA + '\\))');
  function regHtml(src) {
    let out = '', n = 0;
    String(src || '').split('\n').forEach((l) => {
      if (!l.trim()) return;
      if (l.startsWith('## ')) { out += `<h2 class="reg-ch">${esc(l.slice(3))}</h2>`; return; }
      if (l.startsWith('### ')) { out += `<h3 class="reg-art" id="art-${n++}">${esc(l.slice(4))}</h3>`; return; }
      if (l.startsWith('|')) { out += `<p class="reg-tbl">${esc(l.slice(1))}</p>`; return; }
      let cls = '';
      if (/^[①-⑳]/.test(l)) cls = 'l1';
      else if (/^\d+\.\s/.test(l)) cls = 'l2';
      else if (RE_L3.test(l)) cls = 'l3';
      else if (/^(※|▶|◦|▪|·|-\s)/.test(l)) cls = 'note';
      else if (/^\d+\)\s?\S/.test(l) && l.length < 220) cls = 'fn';
      out += `<p class="${cls}">${esc(l)}</p>`;
    });
    return out;
  }
  const articlesOf = (body) => String(body || '').split('\n').filter((l) => l.startsWith('### ')).map((l) => l.slice(4));
  const renderBody = (d) => (d.format === 'reg' ? regHtml(d.body) : md(d.body));
  const shortTitle = (t) => String(t).replace(/^\d{4}학년도\s*/, '').replace(/^[^\s]{2,6}고등학교(장)?\s*(?=\S)/, '');

  // 화면 안 글자에서 검색어를 찾아 <mark> 로 칠한다 (본문 구조는 건드리지 않음)
  function markText(root, q) {
    $$('mark.hl', root).forEach((m) => m.replaceWith(document.createTextNode(m.textContent)));
    root.normalize();
    const toks = String(q || '').trim().split(/\s+/).filter((t) => t && !/^[ㄱ-ㅎ]+$/.test(t));
    if (!toks.length) return [];
    const re = new RegExp(toks.map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|'), 'gi');
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    const nodes = []; while (walker.nextNode()) nodes.push(walker.currentNode);
    const marks = [];
    nodes.forEach((node) => {
      const s = node.nodeValue; re.lastIndex = 0;
      if (!re.test(s)) return;
      re.lastIndex = 0;
      const frag = document.createDocumentFragment(); let last = 0, m;
      while ((m = re.exec(s))) {
        frag.append(s.slice(last, m.index));
        const mk = document.createElement('mark'); mk.className = 'hl'; mk.textContent = m[0]; frag.append(mk); marks.push(mk);
        last = m.index + m[0].length;
      }
      frag.append(s.slice(last)); node.replaceWith(frag);
    });
    return marks;
  }
  function focusMark(marks, k) {
    marks.forEach((m) => m.classList.remove('cur'));
    if (!marks.length) return;
    const m = marks[((k % marks.length) + marks.length) % marks.length];
    m.classList.add('cur'); m.scrollIntoView({ block: 'center', behavior: 'smooth' });
  }

  /* ───────── 서식 작성·인쇄: 칸을 채우면 A4 미리보기에 바로 반영, 그 자리에서 인쇄 ───────── */
  // 입력한 내용은 어디에도 저장하지 않는다 (학생 이름 등 개인정보). 화면을 떠나면 사라진다.
  const formOf = (id) => { const f = App.data.forms && App.data.forms[id]; return f && f.fields ? f : ((window.DEMO_DATA || {}).forms || {})[id]; };
  const WD = ['일', '월', '화', '수', '목', '금', '토'];
  const fmtK = (v) => { if (!v) return ''; const d = new Date(v + 'T00:00:00'); return `${d.getFullYear()}년 ${d.getMonth() + 1}월 ${d.getDate()}일 (${WD[d.getDay()]})`; };
  function countDays(a, b, mode) {
    if (!a || !b) return 0;
    let d = new Date(a + 'T00:00:00'); const e = new Date(b + 'T00:00:00'); let n = 0;
    if (e < d) return 0;
    for (; d <= e; d.setDate(d.getDate() + 1)) if (mode !== 'weekday' || (d.getDay() % 6 !== 0)) n++;
    return n;
  }
  function fieldInput(f) {
    const id = 'ff-' + f.k;
    const ph = f.ph ? ` placeholder="${esc(f.ph)}"` : '';
    switch (f.type) {
      case 'student':
        return `<fieldset class="ff"><legend>${esc(f.label)}</legend><div class="ff-st">
          <label><span>학년</span><input class="input" inputmode="numeric" maxlength="1" data-k="${f.k}.g"></label>
          <label><span>반</span><input class="input" inputmode="numeric" maxlength="2" data-k="${f.k}.c"></label>
          <label><span>번호</span><input class="input" inputmode="numeric" maxlength="2" data-k="${f.k}.n"></label>
          <label class="nm"><span>이름</span><input class="input" maxlength="10" data-k="${f.k}.name"></label></div></fieldset>`;
      case 'daterange':
        return `<fieldset class="ff"><legend>${esc(f.label)}</legend><div class="ff-dr">
          <input class="input" type="date" data-k="${f.k}.from" aria-label="${esc(f.label)} 시작"><span>~</span><input class="input" type="date" data-k="${f.k}.to" aria-label="${esc(f.label)} 끝"></div>
          <span class="ff-help" data-days="${f.k}"></span></fieldset>`;
      case 'choice':
        return `<fieldset class="ff"><legend>${esc(f.label)}</legend><div class="ff-opts">${f.options.map((o) => `<label><input type="radio" name="${id}" value="${esc(o)}" data-k="${f.k}"><span>${esc(o)}</span></label>`).join('')}</div></fieldset>`;
      case 'checks':
        return `<fieldset class="ff"><legend>${esc(f.label)}</legend><div class="ff-opts">${f.options.map((o) => `<label><input type="checkbox" value="${esc(o)}" data-k="${f.k}" data-multi="1"><span>${esc(o)}</span></label>`).join('')}</div></fieldset>`;
      case 'textarea':
        return `<label class="field ff" for="${id}">${esc(f.label)}<textarea class="textarea" id="${id}" data-k="${f.k}" rows="3" style="min-height:96px"${ph}></textarea></label>`;
      case 'date':
        return `<label class="field ff" for="${id}">${esc(f.label)}<input class="input" type="date" id="${id}" data-k="${f.k}"></label>`;
      default:
        return `<label class="field ff" for="${id}">${esc(f.label)}<input class="input" id="${id}" data-k="${f.k}" maxlength="80"${ph}></label>`;
    }
  }
  function cellValue(f, v) {
    const blank = '<span class="a4-blank"></span>';
    if (f.type === 'student') {
      const s = v[f.k] || {};
      return `${esc(s.g || '　')}학년 ${esc(s.c || '　')}반 ${esc(s.n || '　')}번 &nbsp;&nbsp;이름: ${s.name ? esc(s.name) : blank}`;
    }
    if (f.type === 'daterange') {
      const r = v[f.k] || {};
      const n = countDays(r.from, r.to, f.count);
      return `${r.from ? esc(fmtK(r.from)) : '20&nbsp;&nbsp;&nbsp;년&nbsp;&nbsp;&nbsp;월&nbsp;&nbsp;&nbsp;일'} ~ ${r.to ? esc(fmtK(r.to)) : '&nbsp;&nbsp;&nbsp;월&nbsp;&nbsp;&nbsp;일'} &nbsp;(${n || '&nbsp;&nbsp;'}일간)`;
    }
    if (f.type === 'choice' || f.type === 'checks') {
      const sel = [].concat(v[f.k] || []);
      return f.options.map((o) => `<span class="a4-opt">${sel.includes(o) ? '■' : '□'} ${esc(o)}</span>`).join(' ');
    }
    if (f.type === 'date') return v[f.k] ? esc(fmtK(v[f.k])) : '20&nbsp;&nbsp;&nbsp;년&nbsp;&nbsp;&nbsp;월&nbsp;&nbsp;&nbsp;일';
    return v[f.k] ? esc(v[f.k]).replace(/\n/g, '<br>') : '';
  }
  function a4Html(form, v) {
    const school = App.data.school.name;
    const get = (path) => path.split('.').reduce((o, k) => (o || {})[k], v) || '';
    const today = new Date();
    return `<div class="a4" id="a4">
      <h1 class="a4-title">${esc(form.title)}</h1>
      <table class="a4-main">${form.fields.filter((f) => !f.inSign || f.type !== 'text' || !form.sign.some((s) => s[1] === f.k)).map((f) => `<tr><th>${esc(f.label)}</th><td class="${f.type === 'textarea' ? 'tall' : ''}">${cellValue(f, v)}</td></tr>`).join('')}</table>
      ${form.to ? `<p class="a4-note">위와 같이 ${esc(form.title.replace(/서$/, ''))}${/서$/.test(form.title) ? '서를' : '를'} 제출합니다.</p>` : ''}
      <p class="a4-date">${today.getFullYear()}년 &nbsp;${today.getMonth() + 1}월 &nbsp;${today.getDate()}일</p>
      <div class="a4-signs">${form.sign.map(([role, path]) => `<span>${esc(role)} : <b>${path && get(path) ? esc(get(path)) : '<span class="a4-blank short"></span>'}</b> (서명)</span>`).join('')}</div>
      ${form.to ? `<p class="a4-to">${esc(school)}장 귀하</p>` : `<p class="a4-to small">${esc(school)}</p>`}
    </div>`;
  }
  function viewForm(id, qs) {
    if (window.HWPX_FORMS && window.HWPX_FORMS[id]) return viewHwpForm(id, qs);
    if (window.XLSX_FORMS && window.XLSX_FORMS[id]) return viewXlsxForm(id, qs);
    const form = formOf(id);
    if (!form) return setView(`<div class="narrow"><div class="empty"><div class="ic">${ic('alert-triangle')}</div><h2>서식을 찾을 수 없어요</h2><a class="btn" href="#/">처음으로</a></div></div>`, 'home');
    const back = qs.get('doc') ? '#/doc/' + qs.get('doc') : '#/cat/forms';
    const v = {};
    setView(`
<div class="form-page">
  <div class="fp-head">
    <a class="back" href="${esc(back)}">${ic('arrow-left')}돌아가기</a>
    <h1>${esc(form.title)} 작성</h1>
    <div class="fp-acts"><button class="btn ghost" id="fpClear">${ic('refresh')}비우기</button><button class="btn primary" id="fpPrint">${ic('printer')}인쇄</button></div>
  </div>
  <div class="fp-tabs" role="tablist"><button role="tab" aria-selected="true" data-pane="in">입력</button><button role="tab" aria-selected="false" data-pane="pv">미리보기</button></div>
  <div class="fp-grid">
    <form class="fp-in" id="fpForm" autocomplete="off" data-pane-el="in">
      <p class="notice green" style="margin:0">${ic('lock')}<span>입력한 내용은 저장하지 않아요. 인쇄한 뒤 이 화면을 나가면 사라져요.</span></p>
      ${form.fields.map(fieldInput).join('')}
    </form>
    <div class="fp-pv" data-pane-el="pv"><div id="a4wrap">${a4Html(form, v)}</div></div>
  </div>
</div>`, 'home');
    document.body.classList.add('form-mode');
    const fm = $('#fpForm');
    const update = () => {
      for (const k of Object.keys(v)) delete v[k];
      $$('[data-k]', fm).forEach((el) => {
        const path = el.dataset.k.split('.');
        let val;
        if (el.type === 'radio') { if (!el.checked) return; val = el.value; }
        else if (el.dataset.multi) { if (!el.checked) return; const o = v[path[0]] = v[path[0]] || []; o.push(el.value); return; }
        else val = el.value.trim();
        if (path.length === 2) { v[path[0]] = v[path[0]] || {}; v[path[0]][path[1]] = val; } else v[path[0]] = val;
      });
      form.fields.filter((f) => f.type === 'daterange').forEach((f) => {
        const r = v[f.k] || {}; const n = countDays(r.from, r.to, f.count);
        const h = $(`[data-days="${f.k}"]`); if (h) h.textContent = n ? `${n}일간${f.count === 'weekday' ? ' (토·일 빼고 셈)' : ''}` : '';
      });
      $('#a4wrap').innerHTML = a4Html(form, v);
    };
    fm.addEventListener('input', update);
    fm.addEventListener('change', update);
    $('#fpClear').addEventListener('click', () => { fm.reset(); update(); });
    $('#fpPrint').addEventListener('click', () => window.print());
    $$('.fp-tabs button').forEach((b) => b.addEventListener('click', () => {
      $$('.fp-tabs button').forEach((x) => x.setAttribute('aria-selected', String(x === b)));
      $$('[data-pane-el]').forEach((p) => p.classList.toggle('show', p.dataset.paneEl === b.dataset.pane));
    }));
    $('[data-pane-el="in"]').classList.add('show');
  }

  /* ───────── 한글 양식: 사이트 안 한글 편집기(rhwp, MIT)로 원본 그대로 열어 고치고 인쇄 ───────── */
  // 인터넷이 없거나 파일로 열었을 때는 hwpx-editor.js 의 표 모양 편집기로 대신 연다.
  const RHWP_URL = 'https://cdn.jsdelivr.net/npm/@rhwp/editor@0.8.6/index.js';
  let rhwpMod = null;
  // 아이폰·아이패드·맥 사파리(WebKit)에서는 rhwp 편집기가 멈추거나 꺼진다 → 쓰지 않고 간단 편집기·쪽 그림으로 연다
  const NO_RHWP = (() => { const ua = navigator.userAgent; return /iP(hone|ad|od)/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1) || (/Safari\//.test(ua) && !/Chrome|Chromium|CriOS|FxiOS|EdgiOS|Edg\/|OPR|Android|SamsungBrowser|Whale/.test(ua)); })();
  const withTimeout = (p, ms) => Promise.race([p, new Promise((_, r) => setTimeout(() => r(new Error('timeout')), ms))]);
  async function loadRhwp() {
    if (NO_RHWP) throw new Error('webkit');
    if (location.protocol === 'file:' || !navigator.onLine) throw new Error('offline');
    if (!rhwpMod) rhwpMod = await Promise.race([import(RHWP_URL), new Promise((_, r) => setTimeout(() => r(new Error('timeout')), 15000))]);
    return rhwpMod;
  }
  // 한글 문서 인쇄: 쪽 크기 그대로·여백 0·한컴 글꼴로 이 사이트 안에서 인쇄(hwp-view.js). 안 되면 rhwp 의 인쇄 창
  async function printHwp(ed, title) {
    try { await window.HwpView.print(ed, title); }
    catch (e) {
      console.warn(e);
      const r = await ed.commands.execute('file:print', {}, { allowDialog: true }).catch((er) => ({ ok: false, reason: er.message }));
      if (r && r.ok === false) toast('인쇄 창을 열지 못했어요. 편집기 메뉴의 파일 → 인쇄를 눌러 주세요.');
    }
  }
  function saveBlob(blob, name) {
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name;
    document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1500);
  }
  async function viewHwpForm(id, qs) {
    const meta = window.HWPX_FORMS[id];
    const back = qs.get('doc') ? '#/doc/' + qs.get('doc') : '#/cat/forms';
    const token = (viewHwpForm.token = (viewHwpForm.token || 0) + 1);
    setView(`
<div class="form-page wide">
  <div class="fp-head">
    <a class="back" href="${esc(back)}">${ic('arrow-left')}돌아가기</a>
    <h1>${esc(meta.title)}</h1>
    <div class="fp-acts">
      ${favBtn({ type: 'form', id, title: meta.title, href: '#/form/' + id, icon: 'file-text', sub: '한글 서식' }, true)}
    </div>
  </div>
  <p class="fp-note">${ic('pencil')}<span>한글 문서처럼 칸을 눌러 바로 쓰세요. 다 쓰면 <b>인쇄</b>를 누르면 돼요. 입력한 내용은 이 PC에만 자동 저장돼요(학교 저장소에는 올라가지 않아요).</span></p>
  <div class="hwp-host" id="hwpHost"><div class="hwp-loading">${ic('file-text')}<span>한글 양식을 여는 중…</span></div></div>
</div>`, 'home');
    document.body.classList.add('form-mode');
    await mountHwpForm($('#hwpHost'), id, { acts: $('.fp-acts'), where: $('.fp-head'), alive: () => token === viewHwpForm.token });
  }
  // 한글 서식을 host 에 띄운다 (큰 화면·문서 옆 칸 공통)
  async function mountHwpForm(host, id, o) {
    const meta = window.HWPX_FORMS[id];
    host.classList.add('hwp-host');
    o.acts.insertAdjacentHTML('beforeend', `<button class="btn ghost" id="hfReset" disabled hidden>${ic('refresh')}처음 양식으로</button><button class="btn" id="hfSave" disabled>${ic('download')}한글 파일로 저장</button><button class="btn primary" id="hfPrint" disabled>${ic('printer')}인쇄</button>`);
    const bytes = () => Uint8Array.from(atob(meta.zip), (c) => c.charCodeAt(0)).buffer;
    let mode = 'rhwp', ed = null, local = null;
    const open = async () => {
      if (mode === 'rhwp') await ed.loadFile(bytes(), meta.title + '.hwpx');
      else local = HwpxEditor.render(host, meta);
    };
    // 쓰는 화면(rhwp 편집기) ↔ 원본 모양으로 보기(이 컴퓨터의 한컴 글꼴로 다시 그린 쪽, hwp-view.js). 서식은 쓰는 게 먼저라 쓰는 화면으로 연다
    let edit = true, fb = null;
    const showView = async () => {
      host.classList.toggle('edit', edit);
      if (!fb && !edit) fb = findBar(host, 'svg', host);   // 원본 모양으로 볼 때 낱말 찾기
      if (fb) fb.hidden = edit;
      const b = $('#hfView'); if (b) b.innerHTML = edit ? `${ic('eye')}원본 모양으로 보기` : `${ic('pencil')}다시 쓰기`;
      if (!edit) await window.HwpView.mount(host, ed);
    };
    try {
      const m = await loadRhwp();
      if (!o.alive()) return;
      host.innerHTML = '<div class="hwpv-engine"></div>'; host.classList.add('hwpv', 'edit');
      host._links = window.HwpView ? await window.HwpView.links(bytes()) : [];   // 원본 모양 화면에서 누를 수 있게
      ed = await withTimeout(m.createEditor($('.hwpv-engine', host)), 25000);
      await withTimeout(myHwp('form:' + id, 'v1', ed, bytes, meta.title + '.hwpx', o.where, async () => { if (!edit) await window.HwpView.mount(host, ed); }), 30000);
      if (window.HwpView) {
        $('#hfReset').insertAdjacentHTML('afterend', `<button class="btn" id="hfView"></button>`);
        await showView();
        $('#hfView').addEventListener('click', async () => { edit = !edit; try { await showView(); } catch (er) { edit = true; await showView(); toast('원본 모양으로 그리지 못했어요: ' + er.message); } });
      }
    } catch (e) {
      if (!o.alive()) return;
      mode = 'local';
      host.classList.remove('hwpv', 'edit'); host.innerHTML = '';
      host.classList.add('local'); $('#hfReset').hidden = false;
      await open();
      const nt = $('.fp-note span'); if (nt) nt.innerHTML = '칸을 눌러 바로 쓰세요. □ 는 누르면 체크돼요. 다 쓰면 <b>인쇄</b>를 누르세요. ' + (e.message === 'webkit' ? '(이 기기에서는 간단 편집기로 열어요)' : e.message === 'timeout' ? '(한글 편집기가 늦어 간단 편집기로 열었어요)' : '(인터넷이 없어 간단 편집기로 열었어요)');
    }
    if (!o.alive()) return;
    $$('#hfReset, #hfSave, #hfPrint').forEach((b) => { b.disabled = false; });
    $('#hfPrint').addEventListener('click', async () => {
      if (mode === 'rhwp') await printHwp(ed, meta.title);
      else window.print();
    });
    $('#hfSave').addEventListener('click', async () => {
      try {
        if (mode === 'rhwp') {
          const out = await ed.exportHwp();
          saveBlob(new Blob([out], { type: 'application/x-hwp' }), meta.title + '.hwp');
        } else {
          saveBlob(await HwpxEditor.exportHwpx(meta, HwpxEditor.edits(local.page, meta)), meta.title + '.hwpx');
        }
      } catch (e) { toast('저장하지 못했어요: ' + e.message); }
    });
    $('#hfReset').addEventListener('click', async () => {
      if (!(await confirmBox('처음 양식으로 되돌릴까요?', '지금까지 쓴 내용이 지워져요.', '되돌리기'))) return;
      await open();
    });
    Thumbs.ensure(thumbOfForm(id));
  }

  /* ───────── 처음 사용하는 선생님을 위한 사용 방법 (학교 운영판 첫 화면에서 연결) ───────── */
  function viewHowto() {
    const first = (App.data.docs || []).find((d) => /새로 오신|첫 주/.test(d.title));
    const live = App.store.mode !== 'demo';
    const CFG = window.GIL_CONFIG || {};
    const S = [
      ['search', '찾기', '#/', '찾으러 가기', [
        '첫 화면 검색창에 낱말을 넣으면 규정·서식·절차·올린 파일 속 글·도구·사이트까지 한 번에 나와요.',
        '초성만(<kbd>ㅊㅎ</kbd>→체험학습), 영어 자판으로 잘못 쳐도(<kbd>cpgjagkrtmq</kbd>→체험학습), 영어 이름(<kbd>geo</kbd>→지오지브라)으로도 찾아요.',
        '규정집은 조문까지 찾아 바로 그 조로 가요. 규정 화면의 <b>이 규정에서 찾기</b>로 안에서도 찾아요.']],
      live && App.data.neis ? ['school', '오늘의 학교', '#/', '첫 화면에서 보기', [
        '첫 화면 오른쪽(휴대폰은 검색창 아래)에 오늘 급식과 이번 주 학사일정이 나와요.',
        '조식·중식·석식 버튼, 날짜 넘기기·달력으로 다른 날도 봐요. 메뉴 옆 숫자를 누르면 알레르기 성분이 보여요.']] : null,
      ['pencil', '문서 읽고 고치기', '#/propose/new', '새 문서 쓰기', [
        '문서의 <b>고치기</b>를 누르면 누구나 바로 고칠 수 있고 저장하면 곧바로 모두에게 보여요.',
        '관리자가 확인하기 전까지 <b>승인 전</b> 표시가 붙고 고친 부분은 노란색으로 보여요. 잘못 고쳐도 관리자가 되돌릴 수 있어요.',
        '파일(한글·PDF·엑셀·이미지)은 칸에 <b>끌어다 놓기</b>로 올리고, 관련 사이트는 <b>링크 추가</b>로 붙여요. 새 판 파일은 첨부 옆 <b>바꾸기</b>로 올리면 옛 판은 기록으로 남아요.',
        '찾는 문서가 없으면 <b>새 문서 쓰기</b>, 칸이 더 필요하면 첫 화면 <b>새 분류 만들기</b>(아이콘 고르기)를 써요.']],
      ['printer', '서식 바로 쓰고 인쇄', '#/cat/forms', '서식 보기', [
        '서식의 <b>작성·인쇄</b>를 누르면 화면에서 바로 써요. 엑셀은 수식이 그대로 계산되고(출장지 → 출발지·여비 자동), 한글은 <b>원본 모양으로 보기</b>로 한컴 글꼴 그대로 확인해요.',
        '<b>바로 인쇄</b>는 색·한 장 맞춤까지 원본처럼 나와요. 엑셀은 <b>Excel 화면으로 보기·인쇄</b>로 진짜 Excel 화면에서 인쇄할 수도 있어요. PDF는 <b>인쇄</b>로 원본 그대로.',
        '입력한 내용(이름·소속 등)은 <b>이 PC에 자동 저장</b>돼 다음에 열면 그대로예요. <b>원본으로 초기화</b>·<b>되돌리기</b>·<b>내 양식 지우기</b>가 있어요. 공용 PC라면 다 쓰고 지워 주세요.']],
      ['star', '즐겨찾기', '#/fav', '즐겨찾기 열기', [
        '내 업무와 관련된 문서·서식·자료·도구·사이트의 <b>☆</b>를 누르면 메뉴 <b>즐겨찾기</b>와 첫 화면 검색창 아래에 모여요.',
        '즐겨찾기와 내 양식은 이 기기 브라우저에만 저장돼요.']],
      ['book', '수업 탭', '#/lessons', '수업 탭 열기', [
        '교과별 학습지와 수업용 웹앱을 모아 두고, <b>자료 올리기</b>로 누구나 올려요(직접 만든 것만).',
        '<b>유용한 사이트</b> 탭에 교과·AI·추첨(사다리·룰렛) 사이트가 있어요. 사이트 추가·고치기·순서 바꾸기도 누구나 돼요.']],
      ['users', '학급 탭', '#/homeroom', '학급 탭 열기', [
        '자리 바꾸기, 청소 구역, 모둠·발표 뽑기, 1인 1역, 제출 확인표, 수업 타이머, 학급 D-day 판, 출결 증빙 도우미가 있어요.',
        '명단은 한 번 넣으면 도구끼리 같이 쓰고, 학생 이름은 그 기기 밖으로 나가지 않아요.']],
      ['file-pencil', '공문·생기부 탭', '#/gongmun', '공문 탭 열기', [
        '<b>공문</b>: 종류를 고르고 칸을 채우면 에듀파인 기안 본문이 만들어져요. 복사해서 붙여 넣으면 끝.',
        '<b>생기부</b>: Classroom 과제와 관찰 기록을 모아 학생 이름을 S번호로 바꾼 엑셀을 만들어요.']],
      ['device-mobile', '휴대폰 홈 화면에 추가', null, null, [
        '아이폰(사파리): 아래 <b>공유</b> 단추 → <b>홈 화면에 추가</b>. 안드로이드(크롬·웨일·삼성 인터넷): 메뉴 ⋮ → <b>홈 화면에 추가</b>.',
        '학교 로고 아이콘으로 앱처럼 바로 열려요.']]
    ].filter(Boolean);
    setView(`
<div class="narrow howto-page">
  <a class="back" href="#/">${ic('arrow-left')}처음으로</a>
  <div class="page-head" style="display:block"><h1>우리학교 길잡이 사용 방법</h1><p class="count-line" style="margin-top:6px">처음 쓰시는 선생님을 위한 안내예요. 로그인 없이 바로 쓸 수 있고, 모르는 건 검색창에 물어보듯 쳐 보세요.</p></div>
  ${CFG.howtoVideo ? `<figure class="howto-video"><video controls playsinline preload="none" ${CFG.howtoPoster ? `poster="${esc(CFG.howtoPoster)}"` : ''} aria-label="새 문서를 쓰고 검색하는 방법 영상"><source src="${esc(CFG.howtoVideo)}" type="video/mp4"></video><figcaption><b>1분 영상</b> 새 문서를 쓰고 검색으로 찾기까지 따라 해 보세요. 영상 속 문서는 예시예요.</figcaption></figure>` : ''}
  ${first ? `<a class="welcome" href="#/doc/${first.id}" style="margin-bottom:18px"><span class="ic">${ic('school')}</span><span class="tx"><b>새로 오셨나요?</b><span>${esc(first.title)}</span></span>${ic('arrow-right')}</a>` : ''}
  <ol class="howto-list">${S.map(([icon, title, href, label, items], k) => `<li class="howto-card">
    <div class="hc-head"><span class="ic">${ic(icon)}</span><h2><span class="n">${k + 1}</span>${esc(title)}</h2>${href ? `<a class="btn sm" href="${href}">${esc(label)}${ic('arrow-right')}</a>` : ''}</div>
    <ul>${items.map((t) => `<li>${t}</li>`).join('')}</ul></li>`).join('')}</ol>
  <div class="notice" style="margin-top:18px">${ic('alert-triangle')}<div><b>지켜 주세요</b> — 학생·교직원 이름, 연락처, 성적·출결·상담 내용과 교과서·참고서·유료 자료는 올리지 마세요. 주민등록번호로 보이는 내용은 저장이 막혀요.</div></div>
</div>`, 'home');
  }

  /* ───────── 즐겨찾기 (이 기기 브라우저에만) ───────── */
  const FAV_KEY = 'gil.fav.v1';
  const favList = () => { try { return JSON.parse(localStorage.getItem(FAV_KEY) || '[]'); } catch (e) { return []; } };
  const favSave = (l) => { try { localStorage.setItem(FAV_KEY, JSON.stringify(l)); return true; } catch (e) { toast('이 브라우저에는 즐겨찾기를 저장할 수 없어요'); return false; } };
  const favKey = (o) => o.type + ':' + o.id;
  function favBtn(o, label) {
    const on = favList().some((x) => favKey(x) === favKey(o));
    return `<button type="button" class="fav-btn${on ? ' on' : ''}${label ? ' lab' : ''}" data-fav="${esc(JSON.stringify(o))}" aria-pressed="${on}" title="${on ? '즐겨찾기에서 빼기' : '즐겨찾기에 넣기'}" aria-label="${esc(o.title)} 즐겨찾기">${ic('star')}${label ? `<span>${on ? '즐겨찾기 됨' : '즐겨찾기'}</span>` : ''}</button>`;
  }
  document.addEventListener('click', (e) => {
    const b = e.target.closest && e.target.closest('.fav-btn'); if (!b) return;
    e.preventDefault(); e.stopPropagation();
    let o; try { o = JSON.parse(b.dataset.fav); } catch (er) { return; }
    const k = favKey(o); let l = favList(); const on = l.some((x) => favKey(x) === k);
    l = on ? l.filter((x) => favKey(x) !== k) : [Object.assign({ at: Date.now() }, o)].concat(l);
    if (!favSave(l)) return;
    $$('.fav-btn').forEach((x) => { let xo; try { xo = JSON.parse(x.dataset.fav); } catch (er) { return; } if (favKey(xo) !== k) return; x.classList.toggle('on', !on); x.setAttribute('aria-pressed', String(!on)); x.title = !on ? '즐겨찾기에서 빼기' : '즐겨찾기에 넣기'; const sp = $('span', x); if (sp) sp.textContent = !on ? '즐겨찾기 됨' : '즐겨찾기'; });
    toast(on ? '즐겨찾기에서 뺐어요' : '즐겨찾기에 넣었어요. 위쪽 ★ 즐겨찾기 탭에서 모아 볼 수 있어요');
    const nb = $('.nav [data-nav="fav"] .badge-count'); if (nb) { nb.textContent = l.length || ''; nb.hidden = !l.length; }
    if (location.hash.startsWith('#/fav')) route();
  }, true);
  const FAV_GROUPS = [['doc', '문서', 'file-text'], ['form', '서식', 'clipboard-text'], ['att', '첨부 파일', 'files'], ['lesson', '수업·학급 자료', 'notebook'], ['class', '학급 도구', 'users-group'], ['tool', '도구', 'tools'], ['site', '유용한 사이트', 'world']];
  function viewFav() {
    const l = favList();
    const alive = (o) => o.type !== 'doc' || !!docOf(o.id);
    const row = (o, i, arr) => `<li class="fav-row${alive(o) ? '' : ' gone'}">
      <span class="ic">${ic(o.icon || 'star')}</span>
      <a class="nm" href="${esc(o.href)}"${o.ext ? ' target="_blank" rel="noopener noreferrer"' : ''}><b>${esc(o.title)}</b>${o.sub ? `<span>${esc(o.sub)}</span>` : ''}${alive(o) ? '' : '<span class="badge amber">없어졌어요</span>'}</a>
      <span class="acts"><button type="button" class="btn sm ghost" data-fmv="${favKey(o)}|-1" ${i ? '' : 'disabled'} aria-label="위로">${ic('chevron-up')}</button><button type="button" class="btn sm ghost" data-fmv="${favKey(o)}|1" ${i < arr.length - 1 ? '' : 'disabled'} aria-label="아래로">${ic('chevron-down')}</button>${favBtn(o)}</span></li>`;
    const groups = FAV_GROUPS.map(([t, name, icon]) => [name, icon, l.filter((o) => o.type === t)]).filter((g) => g[2].length);
    setView(`
<div class="narrow">
  <div class="page-head"><h1>${ic('star')}즐겨찾기</h1><span class="badge">${l.length}개</span></div>
  <p class="count-line" style="margin-top:-8px">자주 보는 문서·서식·자료·도구·사이트에서 ☆를 누르면 여기에 모여요. 이 기기 브라우저에만 저장돼요.</p>
  ${groups.length ? groups.map(([name, icon, items]) => `<section class="fav-group"><h2 class="section-title">${ic(icon)}${esc(name)} <span class="n">${items.length}</span></h2><ul class="fav-list">${items.map(row).join('')}</ul></section>`).join('')
    : `<div class="empty"><div class="ic">${ic('star')}</div><h2>아직 즐겨찾기가 없어요</h2><p>문서 위의 <b>☆ 즐겨찾기</b>, 서식·파일·사이트·도구 옆의 ☆를 누르면 여기에 모여요. 내 업무와 관련된 것만 모아 두세요.</p><a class="btn primary" href="#/">${ic('search')}찾으러 가기</a></div>`}
</div>`, 'fav');
    $$('[data-fmv]').forEach((b) => b.addEventListener('click', () => {
      const [k, d] = b.dataset.fmv.split('|'); const all = favList(); const o = all.find((x) => favKey(x) === k); if (!o) return;
      const same = all.filter((x) => x.type === o.type), i = same.indexOf(o), j = i + Number(d); if (j < 0 || j >= same.length) return;
      const a = all.indexOf(same[i]), c = all.indexOf(same[j]); [all[a], all[c]] = [all[c], all[a]]; favSave(all); viewFav();
    }));
  }

  /* ───────── 내 양식: 서식에 입력한 내용을 이 기기에 자동 저장 (다음에 열면 그대로). 원본 초기화·되돌리기 ───────── */
  const MY_KEY = 'gil.myform.v1';
  const myAll = () => { try { return JSON.parse(localStorage.getItem(MY_KEY) || '{}'); } catch (e) { return {}; } };
  const myGet = (k) => myAll()[k] || null;
  const mySet = (k, v) => { try { const a = myAll(); if (v == null) delete a[k]; else a[k] = v; localStorage.setItem(MY_KEY, JSON.stringify(a)); } catch (e) { /* 저장할 수 없는 브라우저면 그냥 넘어간다 */ } };
  // 안내 줄: fresh(아직 없음) · mine(내 양식) · reset(초기화함, 되돌리기 가능)
  function myBar(where, state, h) {
    let el = $('#myBar'); if (!el) { where.insertAdjacentHTML('afterend', '<div class="my-bar" id="myBar" role="status"></div>'); el = $('#myBar'); }
    el.className = 'my-bar ' + state;
    el.innerHTML = state === 'mine' ? `<span class="tx">${ic('device-floppy')}<b>내 양식으로 열었어요.</b> 입력하면 이 PC에 자동 저장돼요.${h.note ? ` <span class="nt">${esc(h.note)}</span>` : ''}</span><button type="button" class="btn sm" data-my="reset">${ic('restore')}원본으로 초기화</button><button type="button" class="btn sm ghost" data-my="clear">${ic('eraser')}내 양식 지우기</button>`
      : state === 'reset' ? `<span class="tx">${ic('restore')}<b>원본으로 초기화했어요.</b> 내 양식은 보관해 뒀어요.</span><button type="button" class="btn sm primary" data-my="undo">${ic('history')}되돌리기</button>`
      : `<span class="tx">${ic('device-floppy')}입력하면 <b>이 PC에 자동 저장</b>돼요. 다음에 열면 그대로 채워져 있어요. <span class="nt">공용 PC라면 다 쓰고 '내 양식 지우기'를 눌러 주세요.</span></span>`;
    $$('[data-my]', el).forEach((b) => b.addEventListener('click', () => h[b.dataset.my] && h[b.dataset.my]()));
  }
  // 엑셀: 입력한 칸만 저장
  async function myXlsx(key, ver, fresh, mountBook, where) {
    let rec = myGet(key) || {}, timer = 0, book = null;
    const save = () => { clearTimeout(timer); timer = setTimeout(() => {
      const ed = XlsxView.getEdits(book), has = Object.keys(ed).length > 0;
      rec = Object.assign({}, myGet(key) || {}, { edits: ed, at: Date.now(), ver });
      if (!has && !rec.prev) { mySet(key, null); rec = {}; myBar(where, 'fresh', H); return; }
      mySet(key, rec); if (has) myBar(where, 'mine', H);
    }, 350); };
    const open = async (edits) => { book = await fresh(); if (edits) XlsxView.applyEdits(book, edits); mountBook(book, save); return book; };
    const H = {
      reset: async () => { rec = Object.assign({}, myGet(key) || {}); rec.prev = rec.edits; rec.edits = {}; mySet(key, rec); await open(null); myBar(where, 'reset', H); toast('원본 양식으로 열었어요. 되돌리기를 누르면 내 양식으로 돌아와요.'); },
      undo: async () => { rec = Object.assign({}, myGet(key) || {}); rec.edits = rec.prev || {}; delete rec.prev; mySet(key, rec); await open(rec.edits); myBar(where, 'mine', H); },
      clear: async () => { if (!(await confirmBox('이 PC의 내 양식을 지울까요?', '이 서식에 저장해 둔 내 입력 내용이 지워져요.', '지우기', true))) return; mySet(key, null); rec = {}; await open(null); myBar(where, 'fresh', H); toast('지웠어요'); }
    };
    const has = rec.edits && Object.keys(rec.edits).length;
    await open(has ? rec.edits : null);
    myBar(where, has ? 'mine' : rec.prev ? 'reset' : 'fresh', Object.assign(H, { note: has && rec.ver && ver && rec.ver !== ver ? '원본 파일이 새 판으로 바뀌어 같은 칸 위치에 넣었어요.' : '' }));
    return { book: () => book, reset: H.reset };
  }
  // 한글: 편집기에서 꺼낸 파일을 저장 (몇 초마다, 바뀌었을 때만)
  async function myHwp(key, ver, ed, original, name, where, after) {
    const fileKey = 'my:' + key, prevKey = 'myprev:' + key;
    const toBuf = async (b) => (b instanceof Blob ? await b.arrayBuffer() : b);
    const sig = (u8) => { u8 = new Uint8Array(u8); let h = u8.length; for (let i = 0; i < u8.length; i += 97) h = (h * 31 + u8[i]) | 0; return h; };
    let base = 0, last = 0, busy = false;
    // 기준본(바뀌었는지 비교용)은 화면을 띄운 뒤 따로 만든다 (열기를 늦추지 않게)
    const load = async (bytes) => { await ed.loadFile(bytes.slice(0), name); base = last = 0; ed.exportHwp().then((o) => { if (!last) base = last = sig(o); }).catch(() => {}); if (after) await after(); };
    const tick = async () => {
      if (busy || !where.isConnected || document.hidden) return;
      const fr = $('.hwpv-engine iframe') || $('#hwpHost iframe'); if (!fr || (document.activeElement !== fr && !tick.force)) return;
      busy = true; tick.force = false;
      try {
        const out = await ed.exportHwp(), s = sig(out);
        if (!base) { base = last = s; return; }   // 기준본이 아직이면 지금 것을 기준으로
        if (s !== last) { last = s; if (s === base && !myGet(key)) return; await GilFiles.put(fileKey, new Blob([out])); mySet(key, Object.assign({}, myGet(key) || {}, { hwp: true, at: Date.now(), ver })); myBar(where, 'mine', H); }
      } catch (e) { /* 꺼내지 못하면 다음에 */ } finally { busy = false; }
    };
    const iv = setInterval(() => { if (!where.isConnected) { clearInterval(iv); return; } tick(); }, 4000);
    window.addEventListener('focus', () => { tick.force = true; tick(); });
    const H = {
      reset: async () => { const cur = await GilFiles.get(fileKey).catch(() => null); if (cur) await GilFiles.put(prevKey, cur); await GilFiles.clearOne?.(fileKey); mySet(key, { prev: true, ver }); await load(original()); myBar(where, 'reset', H); toast('원본 양식으로 열었어요. 되돌리기를 누르면 내 양식으로 돌아와요.'); },
      undo: async () => { const p = await GilFiles.get(prevKey).catch(() => null); if (!p) { toast('되돌릴 내 양식이 없어요'); return; } await GilFiles.put(fileKey, p); mySet(key, { hwp: true, at: Date.now(), ver }); await load(await toBuf(p)); myBar(where, 'mine', H); },
      clear: async () => { if (!(await confirmBox('이 PC의 내 양식을 지울까요?', '이 서식에 저장해 둔 내 입력 내용이 지워져요.', '지우기', true))) return; mySet(key, null); await GilFiles.put(fileKey, new Blob([])); await load(original()); myBar(where, 'fresh', H); toast('지웠어요'); }
    };
    const rec = myGet(key) || {};
    const saved = rec.hwp ? await GilFiles.get(fileKey).catch(() => null) : null;
    const savedBuf = saved && saved.size ? await toBuf(saved) : null;
    await load(savedBuf || original());
    myBar(where, savedBuf ? 'mine' : rec.prev ? 'reset' : 'fresh', Object.assign(H, { note: savedBuf && rec.ver && ver && rec.ver !== ver ? '원본 파일이 새 판으로 바뀌었어요. 내 양식은 이전 판 기준이에요. 새 판으로 쓰려면 원본으로 초기화하세요.' : '' }));
    return H;
  }

  /* ───────── 엑셀 양식: 원래 서식대로 그리고, 고치면 수식이 다시 계산된다 ───────── */
  async function viewXlsxForm(id, qs) {
    const meta = window.XLSX_FORMS[id];
    const back = qs.get('doc') ? '#/doc/' + qs.get('doc') : '#/cat/forms';
    const token = (viewHwpForm.token = (viewHwpForm.token || 0) + 1);
    setView(`
<div class="form-page wide">
  <div class="fp-head">
    <a class="back" href="${esc(back)}">${ic('arrow-left')}돌아가기</a>
    <h1>${esc(meta.title)}</h1>
    <div class="fp-acts">
      ${favBtn({ type: 'form', id, title: meta.title, href: '#/form/' + id, icon: 'file-spreadsheet', sub: '엑셀 서식' }, true)}
    </div>
  </div>
  <p class="fp-note">${ic('pencil')}<span>칸을 눌러 바로 쓰세요. 목록 칸은 골라서 넣어요. 금액·일수는 엑셀처럼 자동으로 계산돼요. 원본 엑셀 모양 그대로 인쇄하려면 <b>Excel 화면으로 보기·인쇄</b>를 누르고 파일 → 인쇄를 쓰세요. (파일이 Microsoft 뷰어로 전달돼요)</span></p>
  <div class="xl-host" id="xlHost"><div class="hwp-loading">${ic('file-spreadsheet')}<span>엑셀 양식을 여는 중…</span></div></div>
</div>`, 'home');
    document.body.classList.add('form-mode');
    await mountXlsxForm($('#xlHost'), id, { acts: $('.fp-acts'), where: $('.fp-head'), alive: () => token === viewHwpForm.token });
  }
  // 엑셀 서식을 host 에 띄운다: 단추는 o.acts 에, 내 양식 안내 줄은 o.where 뒤에 (큰 화면·문서 옆 칸 공통)
  async function mountXlsxForm(host, id, o) {
    const meta = window.XLSX_FORMS[id];
    host.classList.add('xl-host');
    o.acts.insertAdjacentHTML('beforeend', `<button class="btn" id="xfSave" disabled>${ic('download')}엑셀 파일로 저장</button>${excelViewBtn()}<button class="btn primary" id="xfPrint" disabled>${ic('printer')}바로 인쇄</button>`);
    let book = null, view = null;
    try {
      await myXlsx('form:' + id, 'v1', () => XlsxView.open(meta.zip), (b, onChange) => { book = b; view = XlsxView.mount(host, b, onChange); }, o.where);
    } catch (e) { console.error(e); host.innerHTML = `<div class="empty"><h2>엑셀 양식을 열지 못했어요</h2><p>${esc(e.message)}</p></div>`; return; }
    if (!o.alive()) return;
    $$('#xfSave, #xfPrint').forEach((b) => { b.disabled = false; });
    $('#xfPrint').addEventListener('click', () => {
      const w = +host.dataset.width || 700;
      document.documentElement.style.setProperty('--xl-print-zoom', Math.min(1, 700 / w));
      window.print();
    });
    $('#xfSave').addEventListener('click', () => { try { saveBlob(XlsxView.exportXlsx(book), meta.title + '.xlsx'); } catch (e) { toast('저장하지 못했어요: ' + e.message); } });
    bindExcelView(() => book, meta.title, location.protocol.startsWith('http') ? new URL('files/' + id + '.xlsx', location.href).href : null);
    findBar(host, 'cells', host);
    const onR = () => { if (!host.isConnected) { window.removeEventListener('resize', onR); return; } if (view) view.fit(); };
    window.addEventListener('resize', onR);
    Thumbs.ensure(thumbOfForm(id));
  }

  /* ───────── Excel 화면으로 보기·인쇄: Microsoft 무료 Office 뷰어(로그인 없음)가 원본 Excel 그대로 그린다 ─────────
     고친 내용이 있으면 고친 파일을 잠깐(1시간) 올려서 보여 준다. 공개 주소를 줄 수 없는 시연판은 원본 파일만 */
  const OFFICE_VIEW = 'https://view.officeapps.live.com/op/view.aspx?src=';
  // 엑셀 인쇄: 용지·여백·배율·쪽 나누기는 xlsx-view.js 가 파일의 쪽 설정대로 인쇄 직전에 만든다 (beforeprint)
  function excelViewBtn() { return `<button class="btn" id="xlOffice" title="Microsoft Excel 화면 그대로 보고, 파일 메뉴에서 인쇄해요">${ic('file-spreadsheet')}Excel 화면으로 보기·인쇄</button>`; }
  function bindExcelView(getBook, name, originalUrl) {
    const b = $('#xlOffice'); if (!b) return;
    b.addEventListener('click', async () => {
      const book = getBook();
      const edited = !!(book && book.sheets.some((sh) => Object.values(sh.cells || {}).some((c) => c.edited)));
      const st = App.store;
      if (edited && !st.tempFile) { toast('시연판에서는 고친 내용을 Excel 화면으로 넘길 수 없어요. 원본만 볼 수 있어요.'); if (!originalUrl) return; }
      if (!edited && !originalUrl && !st.tempFile) { toast('이 파일은 시연판에서 Excel 화면으로 볼 수 없어요.'); return; }
      const w = window.open('about:blank', '_blank');   // 팝업 막힘을 피하려고 누르는 순간 창부터 연다
      try {
        if (w) w.document.write('<p style="font:16px sans-serif;padding:24px">Excel 화면을 여는 중이에요…</p>');
        let url = edited || !originalUrl ? await st.tempFile(name.replace(/\.xlsx$/i, '') + '.xlsx', XlsxView.exportXlsx(book)) : originalUrl;
        const go = OFFICE_VIEW + encodeURIComponent(url);
        if (w) w.location.href = go; else location.href = go;
      } catch (e) { if (w) w.close(); toast('Excel 화면으로 열지 못했어요: ' + e.message); }
    });
  }

  /* ───────── 원본 파일 보기: PDF 는 쪽 그림으로, 한글은 한글 편집기로, 엑셀은 엑셀 화면으로 ───────── */
  const FT_LABEL = { pdf: 'PDF', hwp: '한글', hwpx: '한글', xlsx: '엑셀', xls: '엑셀(옛 형식)', img: '이미지', etc: '파일' };
  const FT_ICON = { pdf: 'file-type-pdf', hwp: 'file-text', hwpx: 'file-text', xlsx: 'file-spreadsheet', xls: 'file-spreadsheet', img: 'photo', etc: 'file' };
  async function fileBytes(att) {
    if (att.fileId) return await (await App.store.getFile(att.fileId)).arrayBuffer();
    if (att.url) { const r = await fetch(att.url); if (!r.ok) throw new Error('파일을 불러오지 못했어요'); return await r.arrayBuffer(); }
    throw new Error('파일 정보가 없어요');
  }
  function fileShell(title, back, extra) {
    setView(`
<div class="form-page wide">
  <div class="fp-head"><a class="back" href="${esc(back)}">${ic('arrow-left')}돌아가기</a><h1>${esc(title)}</h1><div class="fp-acts">${extra || ''}</div></div>
  <div class="file-host" id="fileHost"><div class="hwp-loading">${ic('file')}<span>파일을 여는 중…</span></div></div>
</div>`, 'home');
    document.body.classList.add('form-mode');
    return $('#fileHost');
  }
  function printPdf(src, note) {
    const blob = src instanceof Blob ? src : new Blob([src], { type: 'application/pdf' });
    const url = URL.createObjectURL(blob.type === 'application/pdf' ? blob : new Blob([blob], { type: 'application/pdf' }));
    const mobile = matchMedia('(pointer: coarse)').matches && !matchMedia('(min-width: 900px)').matches;
    if (mobile) { window.open(url, '_blank'); toast('열린 PDF 화면에서 공유·인쇄를 눌러 주세요'); return; }
    const f = document.createElement('iframe');
    f.setAttribute('aria-hidden', 'true'); f.style.cssText = 'position:fixed;right:0;bottom:0;width:1px;height:1px;border:0;opacity:0';
    f.onload = () => setTimeout(() => {
      try { f.contentWindow.focus(); f.contentWindow.print(); if (note) toast(note); }
      catch (e) { window.open(url, '_blank'); toast('새 창에서 인쇄해 주세요'); }
    }, 400);
    f.src = url; document.body.appendChild(f);
    setTimeout(() => { f.remove(); URL.revokeObjectURL(url); }, 10 * 60 * 1000);
  }
  async function viewPdf(qs) {
    const R = window.RULES_PDF; const docId = qs.get('doc') || '';
    if (!R) return setView(`<div class="narrow"><div class="empty"><h2>원본 PDF가 없어요</h2></div></div>`, 'home');
    const d = docOf(docId);
    const page = +qs.get('page') || 1;
    // 이 규정의 마지막 쪽 = 다음 규정 시작 쪽 - 1
    const starts = Object.values(R.pages).sort((a, b) => a - b);
    const next = starts.find((p) => p > page);
    const host = fileShell((d ? shortTitle(d.title) : '규정집') + ' 원본', d ? '#/doc/' + d.id : '#/cat/rules',
      `<a class="btn" href="${esc(R.url)}" target="_blank" rel="noopener">${ic('external-link')}새 창에서 열기</a><button class="btn primary" id="rPrint">${ic('printer')}인쇄</button>`);
    host.classList.add('pdf');
    $('#rPrint').addEventListener('click', async () => {
      const b = $('#rPrint'); b.disabled = true;
      try { const blob = await (await fetch(R.url)).blob(); printPdf(blob, d ? `이 규정은 ${page}~${next ? next - 1 : '끝'}쪽이에요. 인쇄 창의 '페이지'에서 ${page}-${next ? next - 1 : ''} 를 넣어 주세요.` : ''); }
      catch (e) { window.open(R.url, '_blank'); }
      b.disabled = false;
    });
    try { await GilFiles.pdfView(host, R.url, { page, q: qs.get('q') || '', from: page, to: next ? next - 1 : undefined }); }
    catch (e) { host.innerHTML = `<div class="empty"><h2>PDF를 열지 못했어요</h2><p>${esc(e.message)} 인터넷 주소(https)로 연 사이트에서 볼 수 있어요.</p></div>`; }
  }
  async function viewFile(docId, idx, qs) {
    const d = docOf(docId); const att = d && (d.attachments || [])[+idx];
    if (!att) return setView(`<div class="narrow"><div class="empty"><h2>파일을 찾을 수 없어요</h2><a class="btn" href="#/">처음으로</a></div></div>`, 'home');
    return showAttachment(att, '#/doc/' + d.id, att.name, qs, { type: 'att', id: d.id + '/' + idx, title: att.name, href: '#/file/' + d.id + '/' + idx, icon: FT_ICON[att.ftype || GilFiles.typeOf(att.name)] || 'file', sub: d.title });
  }
  async function showAttachment(att, back, title, qs, fav) {
    const host = fileShell(title, back, fav ? favBtn(fav, true) : '');
    return mountFile(host, att, title, { acts: $('.fp-acts'), where: $('.fp-head'), q: qs.get('q') || '', myKey: 'file:' + back + '|' + att.name, alive: () => host.isConnected });
  }
  // 올린 파일 하나를 host 에 띄운다: 단추는 o.acts 에, 내 양식 안내 줄은 o.where 뒤에 (큰 화면·문서 옆 칸 공통)
  async function mountFile(host, att, title, o) {
    const ft = att.ftype || GilFiles.typeOf(att.name);
    const myKey = o.myKey, myVer = att.fileId || att.url || '';
    o.acts.insertAdjacentHTML('beforeend', `<button class="btn" id="fDown" disabled>${ic('download')}파일 받기</button>${ft === 'xlsx' ? excelViewBtn() : ''}<button class="btn primary" id="fPrint" disabled>${ic('printer')}${ft === 'xlsx' ? '바로 인쇄' : '인쇄'}</button>`);
    let bytes;
    try { bytes = await fileBytes(att); } catch (e) {
      const offline = location.protocol === 'file:' || /fetch/i.test(e.message);
      host.innerHTML = `<div class="empty"><h2>파일을 열지 못했어요</h2><p>${offline ? '인터넷 주소(사이트)로 열었을 때 볼 수 있는 파일이에요. 파일로 연 화면에서는 열리지 않아요.' : esc(e.message)}</p></div>`; return;
    }
    if (!o.alive()) return;
    Thumbs.ensure(thumbOfAtt(att));   // 검색 미리보기 그림이 아직 없으면 원본으로 만들어 둔다 (내 입력은 넣지 않음)
    $('#fDown').disabled = false;
    $('#fDown').addEventListener('click', () => saveBlob(new Blob([bytes]), att.fileName || att.name));
    try {
      if (ft === 'pdf') {
        const pdfBlob = new Blob([bytes.slice(0)], { type: 'application/pdf' });   // 보기 전에 원본을 따로 둔다
        $('#fPrint').disabled = false; $('#fPrint').addEventListener('click', () => printPdf(pdfBlob));
        host.classList.add('pdf'); await GilFiles.pdfView(host, bytes, { q: o.q || '' }); return;
      }
      if (ft === 'img') {
        const ext = (/\.([a-z]+)$/i.exec(att.fileName || att.name) || [])[1] || 'png';
        const url = URL.createObjectURL(new Blob([bytes], { type: 'image/' + (ext.toLowerCase() === 'jpg' ? 'jpeg' : ext.toLowerCase()) }));
        host.classList.add('img-host'); host.innerHTML = `<img src="${url}" alt="${esc(att.name)}">`;
        $('#fPrint').disabled = false; $('#fPrint').addEventListener('click', () => window.print());
        return;
      }
      if (ft === 'hwp' || ft === 'hwpx') {
        // rhwp 편집기는 뒤에서 문서를 읽고 쪽을 그리는 데만 쓰고, 화면에는 그 쪽 그림을 이 컴퓨터의 한컴 글꼴로 띄운다 (hwp-view.js)
        let ed, edit = false;
        const docLinks = window.HwpView ? await window.HwpView.links(bytes) : [];   // 문서 속 하이퍼링크
        host._links = docLinks;
        try {
          const m = await loadRhwp(); if (!o.alive()) return;
          host.insertAdjacentHTML('beforeend', '<div class="hwpv-engine"></div>'); host.classList.add('hwpv');
          ed = await withTimeout(m.createEditor($('.hwpv-engine', host)), 25000);
          await withTimeout(myHwp(myKey, myVer, ed, () => bytes.slice(0), att.fileName || att.name, o.where, async () => { if (!edit && $('#fEdit')) await window.HwpView.mount(host, ed); }), 30000);
        } catch (e) {
          if (!o.alive()) return;
          if (e.message === 'offline') throw e;
          return hwpPagesView(host, att, e.message, docLinks);   // 사파리·편집기가 안 열릴 때: PC에서 만들어 둔 쪽 그림으로
        }
        Thumbs.ensurePages(thumbOfAtt(att));   // 사파리용 쪽 그림이 아직 없으면 원본으로 만들어 둔다
        const fb = findBar(host, 'svg', host, o.q);   // 원본 모양 쪽에서 낱말 찾기 (고쳐 쓰기 화면에서는 숨김)
        const show = async () => {
          host.classList.toggle('edit', edit); fb.hidden = edit;
          $('#fEdit').innerHTML = edit ? `${ic('eye')}원본 모양으로 보기` : `${ic('pencil')}고쳐 쓰기`;
          if (!edit) await window.HwpView.mount(host, ed);
        };
        o.acts.insertAdjacentHTML('afterbegin', `<button class="btn ghost" id="fEdit"></button>`);
        try { await show(); } catch (e) { console.warn(e); edit = true; await show(); }
        $$('.hwp-loading', host).forEach((n) => n.remove());
        $('#fEdit').addEventListener('click', async () => { edit = !edit; try { await show(); } catch (e) { toast('쪽을 그리지 못했어요: ' + e.message); } });
        $('#fPrint').disabled = false;
        $('#fPrint').addEventListener('click', () => printHwp(ed, title));
        return;
      }
      if (ft === 'xlsx') {
        host.classList.add('xl-host');
        let book = null, view = null;
        await myXlsx(myKey, myVer, () => XlsxView.open(new Uint8Array(bytes)), (b, onChange) => { book = b; view = XlsxView.mount(host, b, onChange); }, o.where);
        findBar(host, 'cells', host, o.q);
        const pub = att.fileId && App.store.publicFileUrl && !String(att.fileId).startsWith('lessons/') ? App.store.publicFileUrl(att.fileId, att.fileName || att.name) : (att.url && /^https?:/.test(att.url) ? att.url : null);
        bindExcelView(() => book, att.name, pub);
        $('#fPrint').disabled = false;
        $('#fPrint').addEventListener('click', () => { document.documentElement.style.setProperty('--xl-print-zoom', Math.min(1, 700 / (+host.dataset.width || 700))); window.print(); });
        const onR = () => { if (!host.isConnected) { window.removeEventListener('resize', onR); return; } if (view) view.fit(); };
        window.addEventListener('resize', onR);
        return;
      }
      host.innerHTML = `<div class="empty"><h2>이 형식은 화면에서 바로 볼 수 없어요</h2><p>'파일 받기'로 내려받아 열어 주세요. (PDF·한글·엑셀 xlsx 는 바로 볼 수 있어요)</p></div>`;
    } catch (e) {
      host.innerHTML = `<div class="empty"><h2>파일을 화면에 띄우지 못했어요</h2><p>${esc(e.message === 'offline' ? '한글 파일 보기는 인터넷에 연결된 사이트에서 돼요.' : e.message)} '파일 받기'로 내려받아 열 수 있어요.</p></div>`;
    }
  }

  /* ───────── 열린 파일 안에서 찾기: 한글 쪽(원본 모양) 글자와 엑셀 칸. PDF 는 files.js 의 PDF 보기에 따로 있다 ─────────
     before 앞에 찾기 줄을 붙인다. kind: 'svg'(한글 쪽 그림 속 글자) | 'cells'(엑셀 칸) */
  function findBar(before, kind, scope, q0) {
    const bar = document.createElement('form'); bar.className = 'f-find'; bar.setAttribute('role', 'search');
    bar.innerHTML = `${ic('search')}<input class="input" placeholder="${kind === 'cells' ? '이 시트에서 찾기' : '이 문서에서 찾기'}" aria-label="${kind === 'cells' ? '이 시트에서 찾기' : '이 문서에서 찾기'}" autocomplete="off" enterkeyhint="search"><span class="pv-cnt" aria-live="polite"></span><button type="button" class="btn sm ghost" data-f="prev" aria-label="이전 찾은 곳">▲</button><button type="submit" class="btn sm ghost" aria-label="다음 찾은 곳">▼</button>`;
    before.parentNode.insertBefore(bar, before);
    const inp = $('input', bar), cnt = $('.pv-cnt', bar);
    const NS = 'http://www.w3.org/2000/svg';
    let hits = [], hi = -1, lastQ = null;
    const clear = () => { $$('.hv-hl', scope).forEach((x) => x.remove()); $$('.xl-hit', scope).forEach((x) => x.classList.remove('xl-hit', 'on')); };
    const norm = (s) => String(s || '').replace(/\s+/g, '').toLowerCase();
    const collect = (w) => {
      const out = [];
      if (kind === 'cells') { $$('.xl-wrap td', scope).forEach((td) => { const sel = td.querySelector('select, input'); if (norm(td.textContent + (sel ? ' ' + sel.value : '')).includes(w)) out.push({ el: td }); }); return out; }
      $$('.hwpv-page svg', scope).forEach((svg) => {
        let s = ''; const parts = [];
        svg.querySelectorAll('text').forEach((t) => { const c = norm(t.textContent); if (!c) return; parts.push({ el: t, a: s.length, b: s.length + c.length }); s += c; });
        let k = s.indexOf(w);
        while (k >= 0) { const a = k, b = k + w.length; out.push({ segs: parts.filter((p) => p.b > a && p.a < b).map((p) => ({ el: p.el, f0: (Math.max(a, p.a) - p.a) / (p.b - p.a), f1: (Math.min(b, p.b) - p.a) / (p.b - p.a) })) }); k = s.indexOf(w, b); }
      });
      return out;
    };
    const paint = () => {
      clear();
      hits.forEach((m, i) => {
        if (m.el) { m.el.classList.add('xl-hit'); if (i === hi) m.el.classList.add('on'); return; }
        m.rects = m.segs.map((g) => { try { const bb = g.el.getBBox(); const r = document.createElementNS(NS, 'rect'); r.setAttribute('class', 'hv-hl' + (i === hi ? ' on' : '')); r.setAttribute('x', bb.x + bb.width * g.f0); r.setAttribute('y', bb.y); r.setAttribute('width', Math.max(1, bb.width * (g.f1 - g.f0))); r.setAttribute('height', bb.height); g.el.parentNode.insertBefore(r, g.el); return r; } catch (e) { return null; } }).filter(Boolean);
      });
    };
    const show = (i) => {
      if (!hits.length) return;
      hi = (i + hits.length) % hits.length; paint(); cnt.textContent = `${hi + 1}/${hits.length}`;
      const m = hits[hi], el = m.el || (m.rects && m.rects[0]); if (!el) return;
      // 찾은 곳이 보이도록: 쪽·칸을 감싼 스크롤 칸 안에서만 옮긴다
      const box = el.closest('.hwpv-pages, .xl-wrap, .dp-host') || scope, er = el.getBoundingClientRect(), br = box.getBoundingClientRect();
      if (box.scrollHeight > box.clientHeight + 4) box.scrollBy({ top: er.top - br.top - box.clientHeight / 3, left: er.left < br.left || er.right > br.right ? er.left - br.left - box.clientWidth / 3 : 0, behavior: 'smooth' });
      else el.scrollIntoView({ block: 'center', inline: 'nearest', behavior: 'smooth' });
    };
    const run = (q) => {
      lastQ = q; const raw = String(q || '').trim(); hits = []; hi = -1; clear();
      if (!raw) { cnt.textContent = ''; return; }
      const tries = [raw].concat(Search.variants(raw).slice(1)).map(norm).filter((x, i, a) => x && !/^[ㄱ-ㅎ]+$/.test(x) && a.indexOf(x) === i);
      for (const w of tries) { hits = collect(w); if (hits.length) break; }
      if (!hits.length) { cnt.textContent = '없음'; return; }
      show(0);
    };
    // 화면을 다시 그리면(시트 바꾸기·원본 모양 다시 그리기) 찾은 곳이 사라지므로 다시 찾는다
    const stale = () => !hits.length || hits.some((m) => !(m.el || (m.segs[0] && m.segs[0].el)).isConnected);
    let t = 0;
    inp.addEventListener('input', () => { clearTimeout(t); t = setTimeout(() => run(inp.value), 300); });
    bar.addEventListener('submit', (e) => { e.preventDefault(); if (lastQ !== inp.value || stale()) run(inp.value); else show(hi + 1); });
    $('[data-f=prev]', bar).addEventListener('click', () => { if (stale()) run(inp.value); else show(hi - 1); });
    inp.addEventListener('keydown', (e) => { if (e.key === 'Escape') { inp.value = ''; run(''); } });
    if (q0) { inp.value = q0; setTimeout(() => run(q0), 400); }
    return bar;
  }

  // 한글 편집기를 쓸 수 없을 때(아이폰·아이패드 사파리 등): PC에서 원본으로 만들어 둔 쪽 그림으로 보여 주고 인쇄. 고쳐 쓰기는 PC에서
  async function hwpPagesView(host, att, why, docLinks) {
    host.classList.remove('hwpv', 'edit'); host.classList.add('pages-host');
    host.innerHTML = `<div class="hwp-loading">${ic('file-text')}<span>쪽 그림을 불러오는 중…</span></div>`;
    const urls = [];
    if (att.fileId && App.store.thumbUrl) {
      for (let n = 1; n <= 40; n++) {
        try { const r = await fetch(App.store.thumbUrl('p' + n + '-' + att.fileId)); if (!r.ok) break; urls.push(URL.createObjectURL(await r.blob())); } catch (e) { break; }
      }
    }
    if (!host.isConnected) return;
    const dev = why === 'webkit' ? '아이폰·아이패드(사파리)에서는 한글 편집기가 열리지 않아요.' : '한글 편집기를 여는 데 시간이 너무 오래 걸려요.';
    host.innerHTML = `<div class="notice amber pg-note">${ic('info-circle')}<div>${dev} ${urls.length ? '<b>쪽 그림</b>으로 보여 드려요. 고쳐 쓰기는 PC에서 해 주세요.' : '아직 이 파일의 쪽 그림이 없어요. 누구든 PC에서 한 번 열면 만들어져요.'} <b>파일 받기</b>로 받아 한컴오피스 Viewer 앱에서 열 수도 있어요.</div></div>${urls.map((u, i) => `<img class="pg-img" src="${u}" alt="${i + 1}쪽">`).join('')}`;
    // 쪽 그림 위에는 링크를 얹을 수 없어서 목록으로 보여 준다
    if (docLinks && docLinks.length && window.HwpView) { const nt = $('.pg-note', host); if (nt) nt.after(window.HwpView.linkBar(docLinks)); }
    const pb = $('#fPrint'); if (pb) { pb.disabled = !urls.length; pb.onclick = () => window.print(); }
  }

  /* ───────── 옆 칸 보기: 설명은 왼쪽, 파일·서식·웹앱은 오른쪽에 바로 띄워 쓰고, '큰 화면으로 보기'·'새 창으로 열기' ─────────
     문서(첨부·관련 자료)와 수업·학급 자료 화면에서 쓴다. 좁은 화면(휴대폰)은 문서에서는 예전처럼 따로 열고, 자료 화면은 아래로 쌓는다 */
  const PANE_MIN = '(min-width: 1100px)';
  function paneItems(d) {
    const out = [];
    (d.attachments || []).forEach((a, k) => {
      if (a.kind === 'form') {
        const ft = window.XLSX_FORMS && window.XLSX_FORMS[a.formId] ? 'xlsx' : window.HWPX_FORMS && window.HWPX_FORMS[a.formId] ? 'hwp' : '';
        if (ft) out.push({ k: String(k), kind: 'form', ft, name: a.name, formId: a.formId, big: '#/form/' + a.formId + '?doc=' + d.id });
      } else if (a.kind === 'file') {
        const ft = a.ftype || GilFiles.typeOf(a.name);
        if (/^(pdf|img|hwp|hwpx|xlsx)$/.test(ft)) out.push({ k: String(k), kind: 'file', ft, name: a.name, att: a, big: '#/file/' + d.id + '/' + k });
      } else if (a.url && /^https?:/.test(a.url)) out.push({ k: String(k), kind: 'link', name: a.name, url: a.url });
    });
    (d.links || []).forEach((l, j) => { if (/^https?:/.test(l.url || '')) out.push({ k: 'l' + j, kind: 'link', name: l.name, url: l.url }); });
    return out;
  }
  const paneIcon = (it) => it.kind === 'link' ? 'world' : it.kind === 'app' ? 'device-desktop' : FT_ICON[it.ft] || 'file';
  function paneHtml(items) {
    return `<aside class="doc-pane" id="docPane" aria-label="파일 바로 보기">
  <div class="dp-top">${items.length > 1 ? `<span class="dp-sel">${ic('files')}<label class="sr-only" for="dpSel">볼 파일 고르기</label><select class="select" id="dpSel">${items.map((it, i) => `<option value="${i}">${esc(it.name)}</option>`).join('')}</select></span>` : `<b class="dp-name">${ic(paneIcon(items[0]))}<span>${esc(items[0].name)}</span></b>`}
    <span class="dp-go"><button type="button" class="btn sm" id="dpBig">${ic('arrows-maximize')}큰 화면으로 보기</button><a class="btn sm ghost" id="dpNew" href="#" target="_blank" rel="noopener noreferrer">${ic('external-link')}새 창으로 열기</a></span></div>
  <div class="dp-body" id="dpBody"></div>
</aside>`;
  }
  let paneTok = 0;
  // o: { q, myKey(it), inPlace(큰 화면을 이 화면에서 바꿀지) }
  function bindPane(items, o) {
    const sel = $('#dpSel'), big = $('#dpBig'), nw = $('#dpNew'), split = $('.doc-split');
    const base = location.href.split('#')[0];
    let cur = null;
    document.body.classList.add('pane-mode');
    const setBig = (on) => {
      split.classList.toggle('big', on);
      big.innerHTML = on ? `${ic('arrows-minimize')}설명과 같이 보기` : `${ic('arrows-maximize')}큰 화면으로 보기`;
      setTimeout(() => window.dispatchEvent(new Event('resize')), 80);
    };
    big.addEventListener('click', () => { if (cur && cur.big && !o.inPlace) location.hash = cur.big; else setBig(!split.classList.contains('big')); });
    if (split.classList.contains('big')) setBig(true);
    const load = async (i) => {
      const it = items[i]; cur = it; const tok = ++paneTok;
      if (sel) sel.value = String(i);
      $$('.attach-item').forEach((r) => r.classList.toggle('on', !!r.querySelector(`[data-pk="${it.k}"]`)));
      const pub = it.att && it.att.fileId && App.store.publicFileUrl && !String(it.att.fileId).startsWith('lessons/') ? App.store.publicFileUrl(it.att.fileId, it.att.fileName || it.att.name) : it.att && it.att.url ? new URL(it.att.url, location.href).href : '';
      nw.href = it.newUrl ? it.newUrl() : it.url ? it.url : pub && /^(pdf|img)$/.test(it.ft) ? pub : base + it.big;
      nw.onclick = it.openNew ? (e) => { e.preventDefault(); it.openNew(); } : null;
      const cls = it.kind === 'link' || it.kind === 'app' ? 'app-host' : it.kind === 'form' ? '' : 'file-host';
      $('#dpBody').innerHTML = `<div class="dp-item"><div class="dp-acts fp-acts" id="dpActs"></div><div class="dp-host ${cls}" id="dpHost"><div class="hwp-loading">${ic(paneIcon(it))}<span>여는 중…</span></div></div></div>`;
      const host = $('#dpHost'), acts = $('#dpActs'), alive = () => tok === paneTok && host.isConnected;
      try {
        if (it.kind === 'file') await mountFile(host, it.att, it.name, { acts, where: acts, q: o.q || '', myKey: o.myKey(it), alive });
        else if (it.kind === 'form') await (it.ft === 'xlsx' ? mountXlsxForm : mountHwpForm)(host, it.formId, { acts, where: acts, alive });
        else await mountWeb(host, it, acts, alive);
      } catch (e) { if (alive()) host.innerHTML = `<div class="empty"><h2>바로 띄우지 못했어요</h2><p>${esc(e.message)} '새 창으로 열기'를 눌러 주세요.</p></div>`; }
    };
    if (sel) sel.addEventListener('change', () => load(+sel.value));
    // 옆 칸이 있으면 '바로 보기·작성·인쇄·열기' 단추는 빼고, 줄을 누르면 옆 칸에 띄운다 (보는 줄에 '보는 중')
    $$('[data-pk]').forEach((a) => {
      const i = items.findIndex((it) => it.k === a.dataset.pk); if (i < 0) return;
      const row = a.closest('.attach-item'); a.hidden = true;
      if (!row) return;
      row.classList.add('pick'); row.tabIndex = 0; row.setAttribute('role', 'button'); row.setAttribute('aria-label', items[i].name + ' 옆에 띄우기');
      $('.nm', row).insertAdjacentHTML('beforeend', `<span class="viewing">${ic('eye')}보는 중</span>`);
      const go = (e) => { if (e.target.closest('a, button')) return; load(i); };
      row.addEventListener('click', go);
      row.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); go(e); } });
    });
    load(0);
  }
  // 웹앱·사이트를 칸 안에서 바로 쓰기. 다른 사이트 안에 뜨는 걸 막아 둔 사이트는 화면 그림 + 새 창으로 열기
  async function mountWeb(host, it, acts, alive) {
    acts.insertAdjacentHTML('beforeend', `<button class="btn" id="appFull">${ic('maximize')}전체 화면</button>`);
    const full = () => { const f = $('iframe', host); if (f) (f.requestFullscreen || f.webkitRequestFullscreen || (() => {})).call(f); };
    $('#appFull').addEventListener('click', full);
    const l = it.l;
    if (l && l.file && l.file.fileId) {   // 선생님이 올린 html: 사이트와 떨어진 격리 칸에서
      const blob = await App.store.getFile(l.file.fileId); if (!alive()) return;
      const url = URL.createObjectURL(new Blob([await blob.arrayBuffer()], { type: 'text/html;charset=utf-8' }));
      host.innerHTML = `<iframe class="app-frame" title="${esc(it.name)}" sandbox="allow-scripts allow-forms allow-modals allow-popups allow-downloads allow-pointer-lock" src="${url}"></iframe>`;
      return;
    }
    const url = it.url, ext = /^https:/i.test(url);
    // 띄워도 되는지·로그인이 필요한지 (학교 구글 앱스 스크립트는 늘 로그인)
    let chk = { frame: true, login: /^https:\/\/script\.google\.com\//i.test(url) };
    if (ext && App.store.canFrame) { try { const r = await App.store.canFrame(url); chk = typeof r === 'boolean' ? { frame: r, login: chk.login } : Object.assign(chk, r, { login: chk.login || !!(r && r.login) }); } catch (e) { /* 일단 띄워 본다 */ } }
    if (!alive()) return;
    const frame = () => {
      $('#appFull').hidden = false;
      host.innerHTML = `${ext ? `<div class="web-hint">${ic('info-circle')}<span>로그인이 필요한 웹앱은 이 칸 안에서 로그인이 안 될 수 있어요.</span><a href="${esc(url)}" target="_blank" rel="noopener noreferrer">${ic('external-link')}새 창으로 열기</a></div>` : ''}<iframe class="app-frame" title="${esc(it.name)}" src="${esc(url)}" allow="fullscreen; clipboard-write; autoplay" referrerpolicy="strict-origin-when-cross-origin" sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-popups-to-escape-sandbox allow-modals allow-downloads allow-pointer-lock allow-presentation allow-storage-access-by-user-activation"></iframe>`;
    };
    if (!chk.frame || chk.login) {
      // 막아 둔 사이트·로그인이 필요한 웹앱: 화면 그림 + 새 창으로 열기 (로그인 앱은 '그래도 여기서 열기'도)
      $('#appFull').hidden = true;
      const shot = App.store.shotUrl ? App.store.shotUrl(url) : '';
      const why = !chk.frame ? '<b>이 사이트는 다른 사이트 안에서 열리지 않게 막아 두었어요.</b><br>새 창으로 열어 쓰세요.'
        : '<b>로그인이 필요한 웹앱이라 새 창에서 열어요.</b><br>구글 로그인 같은 로그인은 다른 사이트 안(이 칸)에서는 브라우저가 막아서 되지 않아요.';
      host.innerHTML = `<div class="web-blocked">${shot ? `<span class="wb-shot"><img alt="" src="${esc(shot)}"></span>` : ''}<p>${why}</p><div class="wb-acts"><a class="btn primary" href="${esc(url)}" target="_blank" rel="noopener noreferrer">${ic('external-link')}새 창으로 열기</a>${chk.frame ? `<button type="button" class="btn ghost" id="wbHere">그래도 여기서 열기</button>` : ''}</div></div>`;
      const im = $('.wb-shot img', host); if (im) { im.addEventListener('load', () => im.parentNode.classList.add('ok')); im.addEventListener('error', () => im.parentNode.remove()); }
      const here = $('#wbHere', host); if (here) here.addEventListener('click', frame);
      return;
    }
    frame();
  }

  /* ───────── 수업 자료: 교과별 수업용 웹앱과 학습지 양식. 선생님이 직접 올리고 고친다 ───────── */
  function viewLessons(qs) {
    const subjects = App.data.subjects || [];
    const cur = qs.get('s') || '전체';
    const tab = qs.get('v') === 'sites' ? 'sites' : 'files';
    const link = (s, v) => '#/lessons' + ((s !== '전체' || v === 'sites') ? '?' + [s !== '전체' ? 's=' + encodeURIComponent(s) : '', v === 'sites' ? 'v=sites' : ''].filter(Boolean).join('&') : '');
    const all = (App.data.lessons || []).filter((l) => l.subject !== HOMEROOM);
    const list = cur === '전체' ? all : all.filter((l) => l.subject === cur);
    const apps = list.filter((l) => l.kind === 'app'), sheets = list.filter((l) => l.kind === 'file');
    const count = (s) => all.filter((l) => l.subject === s).length;
    const card = (l) => `<article class="tool">
      <div class="top"><span class="ic">${ic(lessonIcon(l))}</span><div><h3>${esc(l.title)}</h3><span class="maker">${esc([l.subject, l.course, l.maker].filter(Boolean).join(' · '))}</span></div>${Thumbs.html(thumbOfLesson(l), 'md')}</div>
      <p>${esc(l.desc || '')}</p>
      <div class="go">${openBtn(l)}
        <a class="btn ghost" href="#/lesson/${esc(l.id)}">${ic('pencil')}고치기</a>${favBtn(lessonFav(l))}</div>
    </article>`;
    setView(`
<div class="page-head" style="display:block"><h1>수업 자료</h1><p class="count-line" style="margin-top:6px">교과별 수업용 웹앱과 학습지 양식을 모아 두었어요. 직접 만든 자료를 올리면 모든 선생님이 함께 써요.</p></div>
<div class="tabs" role="tablist" style="margin-bottom:14px"><a role="tab" class="tab-link" aria-selected="${tab === 'files'}" href="${link(cur, 'files')}">${ic('file-text')}수업 자료</a><a role="tab" class="tab-link" aria-selected="${tab === 'sites'}" href="${link(cur, 'sites')}">${ic('world')}유용한 사이트</a></div>
<div class="subj-chips">${['전체', ...subjects].map((s) => `<a class="chip${s === cur ? ' on' : ''}" href="${link(s, tab)}">${esc(s)}${s === '전체' || tab === 'sites' ? '' : ` <span class="n">${count(s)}</span>`}</a>`).join('')}
  ${tab === 'files' ? `<span class="spacer"></span><a class="btn primary" href="#/lesson/new${cur !== '전체' ? '?s=' + encodeURIComponent(cur) : ''}">${ic('upload')}자료 올리기</a>` : ''}</div>
${tab === 'sites' ? sitesBlock(cur) : `${apps.length ? `<h2 class="section-title" style="margin-top:22px">수업용 웹앱</h2><div class="tool-grid">${apps.map(card).join('')}</div>` : ''}
${sheets.length ? `<h2 class="section-title" style="margin-top:28px">학습지 양식</h2><div class="tool-grid">${sheets.map(card).join('')}</div>` : ''}
${!list.length ? `<div class="empty"><div class="ic">${ic('inbox')}</div><h2>${esc(cur)} 자료가 아직 없어요</h2><p>첫 자료를 올려 주세요. 학습지 파일(한글·PDF·엑셀)이나 수업에 쓴 웹앱 주소를 올릴 수 있어요.</p><a class="btn primary" href="#/lesson/new?s=${encodeURIComponent(cur)}">${ic('upload')}자료 올리기</a></div>` : ''}`}`, 'lessons');
    if (tab === 'sites') bindSiteSort();
    Thumbs.wire($('#main'), true);
  }
  // 묶음 안 사이트 순서 바꾸기: 끌어 놓기(PC) 또는 화살표(휴대폰). 저장하면 모든 선생님에게 같은 순서
  function bindSiteSort() {
    $$('[data-sort]').forEach((b) => b.addEventListener('click', () => {
      const card = b.closest('.site-group'), ul = $('ul', card), group = b.dataset.sort;
      const before = $$('li', ul);
      card.classList.add('sorting');
      before.forEach((li) => { li.draggable = true; });
      let drag = null;
      ul.addEventListener('dragstart', (e) => { drag = e.target.closest('li'); if (drag) { drag.classList.add('dragging'); e.dataTransfer.effectAllowed = 'move'; } });
      ul.addEventListener('dragend', () => { if (drag) drag.classList.remove('dragging'); drag = null; });
      ul.addEventListener('dragover', (e) => {
        if (!drag) return; e.preventDefault();
        const over = e.target.closest('li'); if (!over || over === drag) return;
        const r = over.getBoundingClientRect();
        ul.insertBefore(drag, e.clientY > r.top + r.height / 2 ? over.nextSibling : over);
      });
      ul.addEventListener('click', (e) => {
        const li = e.target.closest('li'); if (!li) return;
        if (e.target.closest('[data-up]') && li.previousElementSibling) ul.insertBefore(li, li.previousElementSibling);
        else if (e.target.closest('[data-down]') && li.nextElementSibling) ul.insertBefore(li.nextElementSibling, li);
        else return;
        e.preventDefault();
      });
      $('[data-sort-cancel]', card).onclick = () => route();
      $('[data-sort-save]', card).onclick = async () => {
        try { await App.store.saveSiteOrder(group, $$('li', ul).map((li) => li.dataset.key)); App.data = await App.store.load(); toast('순서를 저장했어요. 모든 선생님에게 이 순서로 보여요.'); route(); } catch (err) { toast(err.message); }
      };
    }));
  }
  // 교과별 유용한 사이트: 기본 목록(sites.js) 위에 선생님들이 고치거나 더한 것(siteEdits)을 얹는다
  const siteKey = (g, x) => 'd:' + g + '|' + x.name;
  function sitesData() {
    const E = App.data.siteEdits || {}, groups = [], byName = {};
    const groupOf = (name, forS, icon) => { if (!byName[name]) { byName[name] = { group: name, for: forS || '공통', icon: icon || 'world', items: [] }; groups.push(byName[name]); } return byName[name]; };
    (window.SUBJECT_SITES || []).forEach((g) => {
      groupOf(g.group, g.for, g.icon);
      g.items.forEach((x) => {
        const key = siteKey(g.group, x), e = E[key];
        if (e && e.hidden) return;
        const it = e ? Object.assign({}, x, e, { key, ed: 'edit' }) : Object.assign({ key }, x);
        groupOf(it.group || g.group, it.for || g.for, g.icon).items.push(it);
      });
    });
    Object.keys(E).filter((k) => !k.startsWith('d:') && !E[k].hidden).forEach((k) => groupOf(E[k].group || '기타', E[k].for, E[k].icon || guessIcon(E[k].group, 'world')).items.push(Object.assign({ key: k, ed: 'new' }, E[k])));
    // 선생님이 바꾼 순서 (없는 사이트는 원래 순서대로 뒤에)
    const O = App.data.siteOrder || {};
    groups.forEach((g) => { const o = O[g.group]; if (!o) return; const at = (it) => { const i = o.indexOf(it.key); return i < 0 ? 1e4 : i; }; g.items = g.items.map((it, i) => [it, i]).sort((a, b) => (at(a[0]) - at(b[0])) || (a[1] - b[1])).map((x) => x[0]); });
    return groups.filter((g) => g.items.length);
  }
  function sitesBlock(cur) {
    const G = sitesData();
    const mine = cur === '전체' ? G : G.filter((g) => g.for === cur);
    const rest = cur === '전체' ? [] : G.filter((g) => g.for === '공통');
    const card = (g) => `<section class="site-group"><h3><span class="ic">${ic(g.icon || 'world')}</span>${esc(g.group)}<span class="n">${g.items.length}</span><button type="button" class="add" data-sort="${esc(g.group)}" title="순서 바꾸기" aria-label="${esc(g.group)} 순서 바꾸기">${ic('arrows-sort')}</button><a class="add" href="#/site/new?g=${encodeURIComponent(g.group)}" title="이 묶음에 사이트 추가" aria-label="${esc(g.group)}에 사이트 추가">${ic('plus')}</a></h3>
      <div class="sort-bar"><span>끌어서 옮기거나 화살표를 눌러요</span><button type="button" class="btn sm" data-sort-cancel>취소</button><button type="button" class="btn sm primary" data-sort-save>${ic('check')}저장</button></div>
      <ul>${g.items.map((x) => `<li data-key="${esc(x.key)}"><span class="mv"><button type="button" data-up aria-label="위로">${ic('arrow-up')}</button><button type="button" data-down aria-label="아래로">${ic('arrow-down')}</button></span><span class="row"><a href="${esc(x.url)}" target="_blank" rel="noopener noreferrer"><b>${esc(x.name)}</b>${ic('external-link')}</a>${x.ed ? `<span class="badge amber">${x.ed === 'new' ? '새로 추가' : '고침'}</span>` : ''}${favBtn({ type: 'site', id: x.key, title: x.name, href: x.url, ext: true, icon: g.icon || 'world', sub: g.group })}<a class="edit" href="#/site/${encodeURIComponent(x.key)}" title="고치기" aria-label="${esc(x.name)} 고치기">${ic('pencil')}</a></span><span>${esc(x.desc || '')}</span>${Thumbs.html(thumbOfUrl(x.url), 'site')}</li>`).join('')}</ul></section>`;
    return `<div class="site-head"><p class="count-line">누르면 새 창으로 열려요. 학생 개인정보는 외부 사이트에 넣지 마세요. AI·외부 서비스는 사이트마다 이용 나이 기준이 있으니 학생과 쓸 때 확인해 주세요.</p><a class="btn sm" href="#/site/new${cur !== '전체' ? '?s=' + encodeURIComponent(cur) : ''}">${ic('plus')}사이트 추가</a></div>
<div class="site-grid">${(mine.length ? mine : G).map(card).join('')}</div>
${rest.length && mine.length ? `<h2 class="section-title" style="margin-top:28px">모든 교과 공통</h2><div class="site-grid">${rest.map(card).join('')}</div>` : ''}`;
  }
  // 사이트 추가·고치기: 누구나 바로 반영. 기본 사이트를 빼면 숨김으로 남는다
  function viewSiteEdit(key, qs) {
    const isNew = !key || key === 'new';
    const G = sitesData();
    let x = null, g0 = null;
    if (!isNew) G.forEach((g) => g.items.forEach((it) => { if (it.key === key) { x = it; g0 = g; } }));
    if (!isNew && !x) { toast('사이트를 찾을 수 없어요'); location.hash = '#/lessons?v=sites'; return; }
    const pickG = isNew ? (G.find((g) => g.group === qs.get('g')) || G.find((g) => g.for === qs.get('s')) || G[0]) : g0;
    const subj = App.data.subjects || [];
    const back = '#/lessons?' + (pickG && pickG.for !== '공통' ? 's=' + encodeURIComponent(pickG.for) + '&' : '') + 'v=sites';
    setView(`
<div class="narrow">
  <a class="back" href="${back}">${ic('arrow-left')}유용한 사이트</a>
  <div class="page-head"><h1>${isNew ? '사이트 추가' : '사이트 고치기'}</h1></div>
  <p class="count-line" style="margin-top:-8px">저장하면 바로 모든 선생님에게 보여요. 광고·결제 유도 사이트나 학생 개인정보를 받는 사이트는 넣지 말아 주세요.</p>
  <form class="form" id="sform" novalidate>
    <div class="form-row">
      <label class="field">묶음<select class="select" name="group" id="sgroup">${G.map((g) => `<option value="${esc(g.group)}"${pickG && g.group === pickG.group ? ' selected' : ''}>${esc(g.group)}</option>`).join('')}<option value="__new">+ 새 묶음 만들기</option></select></label>
      <label class="field" id="snewF" hidden>새 묶음 이름<input class="input" name="newGroup" maxlength="20" placeholder="예: 한문·제2외국어"></label>
    </div>
    <div class="field" id="sicoF" hidden><span>묶음 아이콘</span>${iconPicker('gIcon', '', true)}</div>
    <label class="field" id="sforF" hidden>어느 교과에서 보일까요<select class="select" name="for">${['공통'].concat(subj.filter((t) => t !== '공통')).map((t) => `<option value="${esc(t)}">${esc(t === '공통' ? '모든 교과 공통' : t)}</option>`).join('')}</select></label>
    <label class="field">사이트 이름<input class="input" name="name" required maxlength="30" value="${esc(x ? x.name : '')}" placeholder="예: 띵커벨"></label>
    <label class="field">주소<input class="input" name="url" required maxlength="300" value="${esc(x ? x.url : '')}" placeholder="https://"></label>
    <label class="field">한 줄 설명<input class="input" name="desc" maxlength="80" value="${esc(x ? x.desc || '' : '')}" placeholder="예: 퀴즈·토론 활동. 학생 가입 없음."></label>
    <div class="form-actions">${!isNew ? `<button type="button" class="btn danger" id="sdel">${ic('trash')}목록에서 빼기</button><span style="flex:1"></span>` : ''}<a class="btn" href="${back}">취소</a><button class="btn primary" type="submit">${ic('check')}${isNew ? '추가' : '저장'}</button></div>
  </form>
</div>`, 'lessons');
    const sg = $('#sgroup');
    const sync = () => { const n = sg.value === '__new'; $('#snewF').hidden = !n; $('#sforF').hidden = !n; $('#sicoF').hidden = !n; };
    sg.addEventListener('change', sync); sync();
    const del = $('#sdel');
    del && del.addEventListener('click', async () => {
      if (!(await confirmBox('이 사이트를 목록에서 뺄까요?', '모든 선생님 목록에서 빠져요.', '빼기', true))) return;
      try { await App.store.removeSite(key); App.data = await App.store.load(); toast('뺐어요'); location.hash = back; } catch (e) { toast(e.message); }
    });
    $('#sform').addEventListener('submit', async (e) => {
      e.preventDefault();
      const fd = new FormData(e.target);
      let url = String(fd.get('url') || '').trim(); if (url && !/^https?:\/\//i.test(url)) url = 'https://' + url;
      const isNewG = fd.get('group') === '__new';
      const group = isNewG ? String(fd.get('newGroup') || '').trim() : String(fd.get('group'));
      const gi = G.find((g) => g.group === group);
      const st = { key: isNew ? '' : key, group, for: isNewG ? String(fd.get('for')) : (gi ? gi.for : '공통'), icon: isNewG ? (String(fd.get('gIcon') || '') || guessIcon(group, 'world')) : (gi ? gi.icon : ''), name: String(fd.get('name') || '').trim(), url, desc: String(fd.get('desc') || '').trim() };
      if (!st.group) { toast('새 묶음 이름을 적어 주세요'); return; }
      if (!st.name) { toast('사이트 이름을 적어 주세요'); return; }
      if (!/^https:\/\//i.test(st.url)) { toast('주소는 https:// 로 시작해야 해요'); return; }
      try {
        await App.store.saveSite(st); App.data = await App.store.load();
        toast(isNew ? '추가했어요. 모든 선생님이 볼 수 있어요.' : '저장했어요');
        location.hash = '#/lessons?' + (st.for !== '공통' ? 's=' + encodeURIComponent(st.for) + '&' : '') + 'v=sites';
      } catch (err) { toast(err.message); }
    });
  }
  const lessonHref = (l) => (l.kind === 'app' ? '#/lapp/' : '#/lfile/') + l.id;
  const lessonFav = (l) => ({ type: 'lesson', id: l.id, title: l.title, href: lessonHref(l), icon: lessonIcon(l), sub: l.subject === HOMEROOM ? '학급 운영' : l.subject });
  const lessonIcon = (l) => l.icon || guessIcon(l.title + ' ' + (l.desc || ''), l.kind === 'app' ? 'device-desktop' : 'file-text');
  // 웹앱 열기: 올린 html 파일은 사이트 안(격리된 칸)에서, 주소는 새 창으로
  function openBtn(l) {
    if (l.kind === 'app') return `<a class="btn primary" href="#/lapp/${esc(l.id)}">${ic('player-play')}열기</a>`;
    return `<a class="btn primary" href="#/lfile/${esc(l.id)}">${ic('eye')}바로 보기</a>`;
  }
  function viewLessonEdit(id, qs) {
    const isNew = !id || id === 'new';
    const l = isNew ? { subject: qs.get('s') || (App.data.subjects || [])[0], kind: qs.get('kind') === 'app' ? 'app' : 'file', title: '', desc: '', course: '', maker: '', url: '' } : (App.data.lessons || []).find((x) => x.id === id);
    if (!l) return viewLessons(qs);
    const forRoom = l.subject === HOMEROOM;
    const backTo = forRoom ? '#/homeroom' : '#/lessons';
    setView(`
<div class="narrow">
  <a class="back" href="${backTo}">${ic('arrow-left')}${forRoom ? '학급 운영' : '수업 자료'}</a>
  <div class="page-head"><h1>${forRoom ? (isNew ? '학급 웹앱 올리기' : '학급 웹앱 고치기') : isNew ? '수업 자료 올리기' : '수업 자료 고치기'}</h1></div>
  <div class="notice">${ic('alert-triangle')}<div><b>학생 개인정보와 교과서·참고서·유료 자료는 올리지 마세요.</b><br>직접 만든 학습지와 웹앱만 올려 주세요. 올린 자료는 바로 모든 선생님에게 보여요.</div></div>
  <form class="form" id="lform" novalidate>
    <div class="form-row">
      <label class="field">교과<select class="select" name="subject">${(App.data.subjects || []).concat([HOMEROOM]).map((s) => `<option value="${esc(s)}"${s === l.subject ? ' selected' : ''}>${esc(s === HOMEROOM ? '학급 운영 (학급 탭)' : s)}</option>`).join('')}</select></label>
      <label class="field">종류<select class="select" name="kind" id="lkind"><option value="file"${l.kind === 'file' ? ' selected' : ''}>학습지 파일</option><option value="app"${l.kind === 'app' ? ' selected' : ''}>웹앱</option></select></label>
    </div>
    <label class="field">제목<input class="input" name="title" required maxlength="60" value="${esc(l.title)}"></label>
    <label class="field">한 줄 설명<input class="input" name="desc" maxlength="120" value="${esc(l.desc || '')}"></label>
    <div class="field"><span>아이콘 <span class="help">선택. 고르지 않으면 제목을 보고 골라요</span></span>${iconPicker('lIcon', l.icon || '', true)}</div>
    <div class="form-row">
      <label class="field">과목·단원 <span class="help">선택</span><input class="input" name="course" maxlength="40" value="${esc(l.course || '')}" placeholder="예: 기하 Ⅱ"></label>
      <label class="field">만든 곳 <span class="help">이름 대신 교과·부서</span><input class="input" name="maker" maxlength="30" value="${esc(l.maker || '')}" placeholder="예: 수학과"></label>
    </div>
    <label class="field" id="lfileF">학습지 파일 <span class="help">한글(hwp·hwpx)·PDF·엑셀(xlsx)·이미지. ${isNew ? '' : '새 파일을 고르면 새 판으로 바뀌어요. '}20MB까지</span><input class="input" type="file" id="lfile" accept=".pdf,.hwp,.hwpx,.xlsx,.png,.jpg,.jpeg,.gif,.webp"></label>
    <div id="lappF">
      <label class="field">웹앱 파일 올리기 <span class="help">직접 만든 html 파일 하나. 사이트 안에서 바로 열려요.${!isNew && l.file && l.file.fileId && l.kind === 'app' ? ` 지금 파일: <b>${esc(l.file.name)}</b>${l.file.ver ? ` (${l.file.ver}번째 판)` : ''}. 새 파일을 고르면 새 판으로 바뀌어요.` : ''}</span>
        <input class="input" type="file" id="lhtml" accept=".html,.htm"></label>
      <label class="field">또는 웹앱 주소 <span class="help">이미 인터넷에 올린 웹앱이면 https:// 주소만 넣어도 돼요. 파일을 올리면 파일이 먼저 열려요.</span><input class="input" name="url" value="${esc(l.kind === 'app' ? l.url || '' : '')}" placeholder="https://"></label>
    </div>
    <div class="form-actions">${!isNew ? `<button type="button" class="btn danger" id="ldel">${ic('trash')}내리기</button><span style="flex:1"></span>` : ''}<a class="btn" href="${backTo}">취소</a><button class="btn primary" type="submit">${ic('check')}${isNew ? '올리기' : '저장'}</button></div>
  </form>
</div>`, 'lessons');
    const kind = $('#lkind');
    const sync = () => { $('#lfileF').hidden = kind.value !== 'file'; $('#lappF').hidden = kind.value !== 'app'; };
    kind.addEventListener('change', sync); sync();
    const del = $('#ldel');
    del && del.addEventListener('click', async () => {
      if (!(await confirmBox('이 자료를 내릴까요?', '수업 자료 목록에서 빠져요.', '내리기', true))) return;
      try { await App.store.removeLesson(l.id); App.data = await App.store.load(); toast('내렸어요'); location.hash = backTo; } catch (e) { toast(e.message); }
    });
    $('#lform').addEventListener('submit', async (e) => {
      e.preventDefault();
      const fd = new FormData(e.target);
      const item = { subject: fd.get('subject'), kind: fd.get('kind'), title: String(fd.get('title') || '').trim(), desc: String(fd.get('desc') || '').trim(), course: String(fd.get('course') || '').trim(), maker: String(fd.get('maker') || '').trim(), icon: String(fd.get('lIcon') || '') };
      if (!item.title) { toast('제목을 적어 주세요'); return; }
      const btn = e.target.querySelector('button[type=submit]'); btn.disabled = true;
      try {
        if (item.kind === 'app') {
          const url = String(fd.get('url') || '').trim();
          const h = ($('#lhtml').files || [])[0];
          if (h) {
            if (!/\.html?$/i.test(h.name)) throw new Error('웹앱은 .html 파일로 올려 주세요');
            if (h.size > 20 * 1024 * 1024) throw new Error('파일은 20MB까지 올릴 수 있어요');
            const buf = await h.arrayBuffer();
            const fid = await App.store.putFile(h.name, new Blob([buf], { type: 'text/html' }));
            item.file = { name: h.name, ftype: 'html', fileId: fid, size: h.size, text: '' };
          } else if (!(l.kind === 'app' && l.file && l.file.fileId)) {
            if (!url) throw new Error('웹앱 파일을 고르거나 주소를 넣어 주세요');
          }
          if (url && !/^https:\/\//i.test(url) && !(l.url && url === l.url)) throw new Error('웹앱 주소는 https:// 로 시작해야 해요');
          item.url = url;
        } else {
          const f = ($('#lfile').files || [])[0];
          if (f) {
            if (f.size > 20 * 1024 * 1024) throw new Error('파일은 20MB까지 올릴 수 있어요');
            const buf = await f.arrayBuffer();
            const fid = await App.store.putFile(f.name, new Blob([buf], { type: f.type }));
            const text = (await GilFiles.extractText(f.name, buf)).slice(0, 100000);
            if (checkPII(text.slice(0, 40000)).some((x) => x.block)) throw new Error('파일 안에 주민등록번호로 보이는 내용이 있어 올릴 수 없어요');
            item.file = { name: f.name, ftype: GilFiles.typeOf(f.name), fileId: fid, size: f.size, text };
          } else if (isNew) throw new Error('학습지 파일을 골라 주세요');
        }
        if (isNew) await App.store.addLesson(item); else await App.store.updateLesson(l.id, item);
        App.data = await App.store.load();
        toast(isNew ? '올렸어요. 모든 선생님이 볼 수 있어요.' : '저장했어요');
        location.hash = item.subject === HOMEROOM ? '#/homeroom' : '#/lessons' + (item.subject ? '?s=' + encodeURIComponent(item.subject) : '');
      } catch (err) { toast(err.message); btn.disabled = false; }
    });
  }
  // 올린 html 웹앱: 사이트와 떨어진 칸(sandbox, 다른 출처)에서 돌려 학교 코드·저장 자료에 손대지 못하게 한다
  // 조회수: 같은 화면에서 여러 번 열어도 한 번만
  function hitLesson(l) { const k = 'l:' + l.id; if (App.viewed.has(k)) return; App.viewed.add(k); l.views = (l.views || 0) + 1; if (App.store.hit) App.store.hit(l.id, 'lesson'); }
  function viewLessonPage(id, qs) {
    const l = (App.data.lessons || []).find((x) => x.id === id);
    const isApp = l && l.kind === 'app';
    if (!l || !(l.file || (isApp && l.url))) return viewLessons(qs);
    hitLesson(l);
    const room = l.subject === HOMEROOM;
    const back = room ? '#/homeroom' : '#/lessons?s=' + encodeURIComponent(l.subject);
    const ft = l.file ? (l.file.ftype || GilFiles.typeOf(l.file.name)) : '';
    const pub = l.file && l.file.fileId && App.store.publicFileUrl && !String(l.file.fileId).startsWith('lessons/') ? App.store.publicFileUrl(l.file.fileId, l.file.name || (isApp ? 'app.html' : 'file')) : '';
    const self = location.href.split('#')[0] + '#/' + (isApp ? 'lapp' : 'lfile') + '/' + l.id + '?full=1';
    const it = isApp ? { k: 'a', kind: 'app', name: l.title, l, url: l.file && l.file.fileId ? '' : l.url } : { k: 'f', kind: 'file', ft, name: l.title, att: Object.assign({ kind: 'file' }, l.file) };
    const fileUrl = pub || (l.file && l.file.url ? new URL(l.file.url, location.href).href : '');
    it.newUrl = () => isApp ? (pub || (it.url ? new URL(it.url, location.href).href : '') || self) : (fileUrl && /^(pdf|img)$/.test(ft) ? fileUrl : self);
    if (isApp && !pub && l.file && l.file.fileId) {   // 공개 주소가 없는 저장소(시연판): 새 창에 격리 칸을 만들어 띄운다
      it.openNew = async () => {
        const w = window.open('about:blank', '_blank'); if (!w) return toast('팝업이 막혔어요. 주소창 오른쪽에서 허용해 주세요.');
        try {
          const blob = await App.store.getFile(l.file.fileId);
          const url = URL.createObjectURL(new Blob([await blob.arrayBuffer()], { type: 'text/html;charset=utf-8' }));
          w.document.write(`<!doctype html><meta charset="utf-8"><title>${esc(l.title)}</title><style>html,body{margin:0;height:100%}iframe{border:0;width:100%;height:100%;display:block}</style><iframe sandbox="allow-scripts allow-forms allow-modals allow-popups allow-downloads allow-pointer-lock" src="${url}"></iframe>`); w.document.close();
        } catch (e) { w.close(); toast(e.message); }
      };
    }
    const sub = [room ? '학급 운영' : l.subject, l.course, l.maker].filter(Boolean).join(' · ');
    setView(`
<div class="doc-split lesson-split${qs.get('full') ? ' big' : ''}">
  <article class="ls-info">
    <a class="back" href="${back}">${ic('arrow-left')}${room ? '학급 운영' : '수업 자료'}</a>
    <div class="ls-head"><span class="ic">${ic(lessonIcon(l))}</span><div><h1>${esc(l.title)}</h1>${sub ? `<p class="maker">${esc(sub)}</p>` : ''}</div></div>
    ${l.desc ? `<p class="ls-desc">${esc(l.desc)}</p>` : '<p class="ls-desc none">설명이 아직 없어요. 고치기에서 한 줄 적어 주세요.</p>'}
    <div class="doc-actions">${favBtn(lessonFav(l), true)}<a class="btn" href="#/lesson/${esc(l.id)}">${ic('pencil')}고치기</a></div>
    <p class="count-line">${l.date ? `올린 날 ${esc(l.date)} · ` : ''}조회 ${l.views || 0}</p>
  </article>
  ${paneHtml([it])}
</div>`, room ? 'homeroom' : 'lessons');
    bindPane([it], { q: qs.get('q') || '', myKey: () => 'file:' + back + '|' + (l.file && l.file.name), inPlace: true });
  }

  /* ───────── 학급 운영: 자리 바꾸기·청소 구역 등 ───────── */
  function viewHomeroom() {
    const tools = App.data.classTools || [];
    const url = (t) => t.local ? t.url + (t.url.includes('?') ? '&' : '?') + 'school=' + encodeURIComponent(App.data.school.name) : t.url;
    setView(`
<div class="page-head" style="display:block"><h1>학급 운영</h1><p class="count-line" style="margin-top:6px">담임 업무를 덜어 주는 도구예요. 학생 이름은 그 기기 화면에서만 쓰고 어디에도 보내지 않아요.</p></div>
<div class="tool-grid">${(App.data.lessons || []).filter((l) => l.subject === HOMEROOM).map((l) => `<article class="tool">
  <div class="top"><span class="ic">${ic(lessonIcon(l))}</span><div><h3>${esc(l.title)}</h3><span class="maker">${esc(l.maker || '선생님이 올린 학급 웹앱')}</span></div>${Thumbs.html(thumbOfLesson(l), 'md')}</div>
  <p>${esc(l.desc || '')}</p>
  <div class="badges"><span class="badge">${ic('user')}선생님이 올림</span>${l.file && l.file.fileId ? `<span class="badge green">${ic('lock')}사이트 안에서 열려요</span>` : ''}</div>
  <div class="go">${openBtn(l)}<a class="btn ghost" href="#/lesson/${esc(l.id)}">${ic('pencil')}고치기</a>${favBtn(lessonFav(l))}</div>
</article>`).join('')}${tools.map((t) => `<article class="tool">
  <div class="top"><span class="ic">${ic(t.icon || 'tools')}</span><div><h3>${esc(t.name)}</h3></div>${Thumbs.html(thumbOfUrl(url(t)), 'md')}</div>
  <p>${esc(t.desc)}</p>
  <div class="badges">${t.privacy ? `<span class="badge green">${ic('lock')}이름은 이 기기에서만</span>` : ''}</div>
  <div class="go"><a class="btn primary" href="${esc(url(t))}" target="_blank" rel="noopener">${ic('external-link')}열기</a>${favBtn({ type: 'class', id: t.id, title: t.name, href: url(t), ext: true, icon: t.icon || 'tools', sub: '학급 도구' })}</div>
</article>`).join('')}
  <article class="tool add"><div class="top"><span class="ic">${ic('plus')}</span><div><h3>학급 웹앱 올리기</h3></div></div><p>직접 만든 학급 운영 웹앱(html 파일)이나 주소를 올리면 이곳에 모여요.</p><div class="go"><a class="btn" href="#/lesson/new?s=${encodeURIComponent(HOMEROOM)}&kind=app">${ic('upload')}올리기</a></div></article></div>`, 'homeroom');
    Thumbs.wire($('#main'), true);
  }

  /* ───────── 공문 작성: 에듀파인 기안 본문 만들기 (tools/gongmun, 사이트 안에 그대로 띄운다) ───────── */
  function viewGongmun() {
    setView(`<div class="gm-wrap"><iframe class="gm-frame" src="tools/gongmun/index.html" title="공문 기안 도우미" allow="clipboard-write"></iframe></div>`, 'gongmun');
  }

  /* ───────── 생기부 도우미: Classroom 과제 + 교사 기록 → 이름 지운 엑셀 ───────── */
  function viewSgb() {
    const gas = (window.GIL_CONFIG || {}).sgbUrl || '';
    // 학교(Workspace) 계정: script.google.com/a/macros/<도메인>/s/… 주소는 그 도메인 계정으로 열린다. Gmail 은 authuser 만 붙인다
    const acctUrl = (mail) => { const m = /^[^@\s]+@([^@\s]+\.[^@\s]+)$/.exec(mail.trim()); if (!m || !gas) return null; const dom = m[1].toLowerCase(); const base = /gmail\.com$|googlemail\.com$/.test(dom) ? gas : gas.replace('script.google.com/macros/', 'script.google.com/a/macros/' + dom + '/'); return base + (base.includes('?') ? '&' : '?') + 'authuser=' + encodeURIComponent(mail.trim()); };
    setTimeout(() => {
      const f = $('#sgbAcct'); if (!f) return;
      const inp = $('#sgbMail'); let saved = ''; try { saved = localStorage.getItem('gil.sgb.mail') || ''; } catch (e) {}
      if (saved) { inp.value = saved; const u = acctUrl(saved); if (u) $('#sgbOpen').href = u; }
      f.addEventListener('submit', (e) => {
        e.preventDefault();
        const u = acctUrl(inp.value); if (!u) { toast('이메일 주소를 확인해 주세요'); inp.focus(); return; }
        try { localStorage.setItem('gil.sgb.mail', inp.value.trim()); } catch (er) {}
        $('#sgbOpen').href = u; window.open(u, '_blank', 'noopener');
      });
    }, 0);
    setView(`
<div class="page-head" style="display:block"><h1>생기부 도우미</h1><p class="count-line" style="margin-top:6px">Classroom 에 학생들이 낸 과제와 선생님이 적은 관찰 기록을 모아, 학생 이름을 S번호로 바꾼 엑셀 파일로 만들어요. 그 파일로 AI 에게 세특 초안을 부탁할 수 있어요.</p></div>
<div class="prose" style="margin:0 0 18px"><div class="callout"><span class="icon">${ic('shield-lock')}</span><div><b>개인정보 보호를 위해 학생 이름은 지워요</b> — 과제 글과 기록에 들어 있는 학생 이름은 <b>S번호</b>(예: 2반-S01)로, 친구 이름은 <b>학생B</b> 로 바꾸고, 학번·이메일·연락처도 함께 지운 뒤 엑셀로 만들어요. AI 에게는 이름 없는 글만 넘어가요.</div></div></div>
<div class="tool-grid">
  <article class="tool">
    <div class="top"><span class="ic">${ic('login')}</span><div><h3>내 Classroom 계정으로 시작</h3><span class="maker">${gas ? 'Google 로그인 · 새 창' : '학교 개설 후 연결'}</span></div></div>
    <p>${gas ? 'Classroom 이 있는 Google 계정으로 들어가면 내 수업·과제·학생 명단이 바로 보여요. 적은 기록은 선생님 Drive 의 「생기부 도우미 (내 기록)」 폴더에만 저장돼요.'
      : '실제로 쓸 때는 학교에서 Google Apps Script 웹앱을 한 번 설치해 이 자리에 연결해요. 선생님마다 자기 계정으로 들어가 자기 Classroom 과 Drive 만 써요. 시연판에서는 옆의 체험판으로 같은 흐름을 볼 수 있어요.'}</p>
    <div class="badges"><span class="badge green">${ic('lock')}기록은 내 Drive 에만</span><span class="badge">${ic('eye-off')}학생 이름은 지우고 S번호로</span><span class="badge">${ic('eye-off')}AI 를 부르지 않음</span></div>
    ${gas ? `<div class="go"><a class="btn primary" href="${esc(gas)}" target="_blank" rel="noopener" id="sgbOpen">${ic('external-link')}열기</a></div>
    <form class="sgb-acct-form" id="sgbAcct"><label for="sgbMail">${ic('switch-horizontal')}다른 계정으로 열기</label><div class="row"><input class="input" id="sgbMail" type="email" inputmode="email" autocomplete="email" placeholder="Classroom 이 있는 계정 (예: 이름@학교도메인)"><button class="btn" type="submit">이 계정으로 열기</button></div></form>
    <p class="sgb-acct">${ic('info-circle')}<span>여러 Google 계정에 로그인되어 있으면 처음 로그인한 계정으로 열려요. 학교 계정은 위에 이메일을 넣으면 그 계정으로 열려요(이 기기에 기억). 개인 Gmail 끼리 바꿀 때는 <b>시크릿 창</b>(Ctrl+Shift+N)에서 그 계정으로만 로그인해 여세요.</span></p>` : ''}
  </article>
  <article class="tool">
    <div class="top"><span class="ic">${ic('player-play')}</span><div><h3>예시 학생으로 먼저 해 보기</h3><span class="maker">로그인 없음 · 가상 학생 3명</span></div></div>
    <p>로그인 없이 처음부터 끝까지 해 봐요. 기록 적기 → 과제 가져오기 → 엑셀 받기까지 실제와 같은 순서예요. 적은 내용은 이 브라우저에만 남아요.</p>
    <div class="badges"><span class="badge">${ic('file-spreadsheet')}엑셀 내려받기까지</span></div>
    <div class="go"><a class="btn" href="apps/saenggibu/index.html" target="_blank" rel="noopener">${ic('external-link')}체험하기</a></div>
  </article>
</div>
<h2 class="sec-title" style="margin:30px 0 0;font-size:19px">사용 방법</h2>
<ol class="steps">
  <li class="step"><h3>수업 고르기</h3><p>[내 Classroom 과제로] 를 누르고 수업과 과제를 고르면 학생 명단과 제출 현황이 들어와요. 학생마다 <b>2반-S01</b> 같은 번호가 붙어요.</p></li>
  <li class="step"><h3>학생별로 적기</h3><p>학생을 누르고 활동내용·교사관찰·이전 학기 생기부 등 아는 것만 적어요. 적는 대로 저장돼요. 비워 둔 칸은 과제 내용만으로 씁니다.</p></li>
  <li class="step"><h3>과제 내용 가져오기</h3><p>체크한 학생이 Classroom 에 낸 문서·PDF·슬라이드·사진 속 글을 읽어, 그 학생 이름은 S번호로, 친구 이름은 학생B 로 바꿔 넣어요. 학생 원본 파일은 건드리지 않아요.</p></li>
  <li class="step"><h3>엑셀 만들기</h3><p>[엑셀 파일 만들기] 를 누르면 <b>생기부_AI용_….xlsx</b> 가 내려받아져요. Claude 프로젝트에 연결한 내 폴더로 옮기고 "S01 세특 써줘" 라고 말하면 됩니다.</p></li>
</ol>
<div class="prose" style="margin-top:18px"><div class="callout"><span class="icon">${ic('lock')}</span><div><b>처음 한 번 권한 허용</b> — Google 권한 화면이 나오면 <b>허용</b>을 눌러요. ‘Google에서 확인하지 않은 앱’ 이 보이면 <b>고급 → 생기부 도우미(으)로 이동 → 허용</b>. 학교 선생님이 만든 도구라 Google 심사를 받지 않아 나오는 안내예요. Classroom 명단·과제는 <b>읽기만</b> 해요.</div></div></div>`, 'sgb');
  }

  /* ───────── 개인정보 자동 점검 ───────── */
  const PII = [
    { re: /\b\d{6}\s?-\s?[1-4]\d{6}\b/, name: '주민등록번호', block: true },
    { re: /01[016789][-.\s]?\d{3,4}[-.\s]?\d{4}/, name: '휴대전화 번호' },
    { re: /[\w.+-]+@[\w-]+\.[a-z.]{2,}/i, name: '이메일 주소' },
    { re: /\b0\d{1,2}-\d{3,4}-\d{4}\b/, name: '전화번호' },
    { re: /\b[1-3][0-9]{4}\s?[가-힣]{2,4}\b/, name: '학번과 이름' },
    { re: /[가-힣]{2,4}\s?\(\s?[1-3]학년\s?\d{1,2}반/, name: '학생 이름과 학급' }
  ];
  const checkPII = (text) => PII.filter((p) => p.re.test(text));

  /* ───────── 줄 단위 비교 (고친 문서 보기) ───────── */
  function diffOps(a, b) {
    const A = String(a || '').split('\n'), B = String(b || '').split('\n');
    const n = A.length, m = B.length;
    const dp = Array.from({ length: n + 1 }, () => new Uint16Array(m + 1));
    for (let i = n - 1; i >= 0; i--) for (let j = m - 1; j >= 0; j--) dp[i][j] = A[i] === B[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
    const ops = []; let i = 0, j = 0;
    while (i < n && j < m) {
      if (A[i] === B[j]) { ops.push(['same', A[i]]); i++; j++; }
      else if (dp[i + 1][j] >= dp[i][j + 1]) ops.push(['del', A[i++]]);
      else ops.push(['add', B[j++]]);
    }
    while (i < n) ops.push(['del', A[i++]]);
    while (j < m) ops.push(['add', B[j++]]);
    return ops;
  }
  function diffLines(a, b) {
    const ops = diffOps(a, b);
    // 바뀌지 않은 긴 구간은 접는다
    let html = '', run = [];
    const flush = (last) => {
      if (run.length > 4) {
        html += run.slice(0, last ? 0 : 1).map((s) => `<div class="same">${esc(s) || '&nbsp;'}</div>`).join('');
        html += `<div class="gap">… 바뀌지 않은 ${run.length - (last ? 1 : 2)}줄</div>`;
        html += run.slice(-1).map((s) => `<div class="same">${esc(s) || '&nbsp;'}</div>`).join('');
      } else html += run.map((s) => `<div class="same">${esc(s) || '&nbsp;'}</div>`).join('');
      run = [];
    };
    ops.forEach(([t, s]) => { if (t === 'same') run.push(s); else { flush(false); html += `<div class="${t}">${esc(s) || '&nbsp;'}</div>`; } });
    flush(true);
    return html;
  }
  // 고친 문서: 새로 들어간 줄과 같은 글이 있는 문단·목록·표 칸을 노란색으로 칠한다
  function markChanged(root, before, after) {
    const norm = (t) => String(t).replace(/^\s*(#{1,6}|>|[-*]|\d+[.)])\s+/, '').replace(/\*\*/g, '').replace(/\[([^\]]+)\]\([^)]*\)/g, '$1').replace(/[|\s]/g, '');
    const added = diffOps(before, after).filter(([t, l]) => t === 'add' && norm(l).length >= 2).map(([, l]) => norm(l));
    if (!added.length) return 0;
    let n = 0;
    $$('p, li, h2, h3, h4, blockquote, td, th, dt, dd, .art-body, .reg-line', root).forEach((el) => {
      if (el.querySelector('p, li, td')) return;
      const t = norm(el.textContent);
      if (t.length >= 2 && added.some((a) => t.includes(a) || (t.length >= 4 && a.includes(t)))) { el.classList.add('chg'); n++; }
    });
    return n;
  }

  /* ───────── 화면 틀 ───────── */
  function shell() {
    const gg = (window.GIL_CONFIG || {}).flavor === 'gg';
    const demo = App.mode === 'demo' && !gg;
    document.body.classList.toggle('embed', App.embed);
    document.body.innerHTML = `
<a class="sr-only" href="#main">본문 바로가기</a>
<header class="topbar"><div class="topbar-in">
  <a class="brand" href="#/" aria-label="우리학교 길잡이 처음으로">
    <span class="brand-mark">${ic('directions')}</span>
    <span class="brand-text"><span class="brand-name">우리학교 길잡이</span><span class="brand-school">${esc(App.data.school.name)}</span></span>
  </a>
  <nav class="nav" aria-label="주 메뉴">
    <a href="#/" data-nav="home">${ic('search')}<span>찾기</span></a>
<a href="#/fav" data-nav="fav">${ic('star')}<span>즐겨찾기</span></a>
    <a href="#/lessons" data-nav="lessons">${ic('book')}<span>수업</span></a>
    <a href="#/homeroom" data-nav="homeroom">${ic('users')}<span>학급</span></a>
    <a href="#/sgb" data-nav="sgb">${ic('notebook')}<span>생기부</span></a>
    <a href="#/gongmun" data-nav="gongmun">${ic('file-pencil')}<span>공문</span></a>
    <a href="#/tools" data-nav="tools">${ic('tools')}<span>도구</span></a>
    <a href="#/admin" data-nav="admin">${ic('shield-lock')}<span>관리</span></a>
  </nav>
  <button class="icon-btn" id="viewSet" aria-label="화면 설정 (디자인·밝기)" title="화면 설정">${ic('palette')}</button>
</div></header>
${demo ? `<div class="demo-strip"><div class="demo-strip-in">
  <span><b>시연 모드</b> 가상 학교 '${esc(App.data.school.name)}'의 예시 자료예요. 고친 내용은 이 브라우저에만 남아요.</span>
  <span class="spacer"></span><a class="linkbtn" href="#/setup">우리 학교도 만들기</a><button class="linkbtn" id="resetDemo">처음 상태로 되돌리기</button>
</div></div>` : ''}
${gg && App.mode === 'demo' ? `<div class="demo-strip"><div class="demo-strip-in"><span><b>저장소 연결 전</b> 고친 내용은 이 기기에만 남아요. 관리자가 학교 저장소를 연결하면 모두에게 보여요.</span></div></div>` : ''}
<main id="main" tabindex="-1"></main>
<footer class="footer">
  <span>우리학교 길잡이${demo ? ' · 화면의 학교와 자료는 모두 가상입니다' : ' · ' + esc(App.data.school.name)}</span>
  <span class="spacer"></span>
  <button class="linkbtn" id="themeBtn">${ic('palette')} 화면 설정</button>
</footer>`;
    const rd = $('#resetDemo');
    rd && rd.addEventListener('click', async () => {
      const ok = await confirmBox('처음 상태로 되돌릴까요?', '시연하며 바꾼 문서·분류·신고가 모두 처음 예시로 돌아가요.', '되돌리기');
      if (!ok) return;
      await App.store.reset(); Auth.setAdminToken(''); App.data = await App.store.load(); App.viewed.clear(); toast('처음 상태로 되돌렸어요'); route();
    });
    $('#themeBtn').addEventListener('click', viewSettings);
    $('#viewSet').addEventListener('click', viewSettings);
  }

  /* ───────── 화면 설정: 디자인 4종 + 밝기 (이 기기에만 저장) ───────── */
  const DESIGNS = [
    { id: 'c', name: '색 구분 타일', desc: '분류마다 옅은 색. 친근하고 한눈에 보여요', sw: ['#e4eefc', '#e2f3ea', '#fcefdc', '#fbe6ea'] },
    { id: 'a', name: '표지판 초록', desc: '차분하고 단정한 기본형', sw: ['#14684e', '#e1efe8', '#f3f5f4', '#17201c'] },
    { id: 'b', name: '공공 서비스형', desc: '큰 글씨와 파란색. 정부 누리집처럼 또렷하게', sw: ['#256ef4', '#ecf2fe', '#f4f5f6', '#1e2124'] },
    { id: 'd', name: '미니멀 문서형', desc: '흑백에 주황 한 점. 왼쪽 목록형', sw: ['#18181b', '#c2410c', '#fafaf9', '#e4e4e7'] }
  ];
  const THEMES = [['auto', '기기 설정 따름'], ['light', '밝게'], ['dark', '어둡게']];
  function applyLook() {
    const r = document.documentElement;
    // 주소에 ?design=a|b|c|d 를 붙이면 그 디자인으로 연다 (시연·캡처용)
    const pd = params.get('design');
    if (pd && DESIGNS.some((d) => d.id === pd)) LS.set('gil.design', pd);
    r.setAttribute('data-design', LS.get('gil.design', 'c'));
    const t = LS.get('gil.theme', 'auto');
    if (t === 'auto') r.removeAttribute('data-theme'); else r.setAttribute('data-theme', t);
  }
  function viewSettings() {
    const cur = LS.get('gil.design', 'c'), th = LS.get('gil.theme', 'auto');
    modal(`<h2>화면 설정</h2><p>이 기기에서 보이는 모양만 바뀌어요. 자료는 그대로예요.</p>
      <div class="design-pick" role="radiogroup" aria-label="디자인">${DESIGNS.map((d) => `
        <label class="dp"><input type="radio" name="design" value="${d.id}" ${d.id === cur ? 'checked' : ''}>
          <span class="sw">${d.sw.map((c) => `<i style="background:${c}"></i>`).join('')}</span>
          <span class="tx"><b>${esc(d.name)}</b><span>${esc(d.desc)}</span></span></label>`).join('')}</div>
      <h3 class="mini-h">밝기</h3>
      <div class="seg" role="radiogroup" aria-label="밝기">${THEMES.map(([v, n]) => `<label><input type="radio" name="theme" value="${v}" ${v === th ? 'checked' : ''}><span>${n}</span></label>`).join('')}</div>
      <div class="form-actions" style="margin-top:18px"><button class="btn primary" data-close>닫기</button></div>`,
      (el) => {
        $$('input[name=design]', el).forEach((i) => i.addEventListener('change', () => { LS.set('gil.design', i.value); applyLook(); }));
        $$('input[name=theme]', el).forEach((i) => i.addEventListener('change', () => { LS.set('gil.theme', i.value); applyLook(); }));
      });
  }
  function setView(html, nav) {
    document.body.classList.remove('form-mode', 'pane-mode');
    const m = $('#main');
    m.innerHTML = `<div class="view-enter">${html}</div>`;
    $$('.nav a').forEach((a) => { if (a.dataset.nav === nav) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current'); });
    window.scrollTo(0, 0);
    enhanceFileInputs(m);
    return m;
  }
  // 파일 칸: 끌어다 놓기 + 고른 파일 이름 보이기. accept 에 맞지 않는 파일은 빼고 알려 준다
  // 원래 파일 칸을 투명하게 큰 칸 위에 겹친다 (누르면 브라우저가 직접 파일 창을 연다. 코드로 열지 않아야 창이 두 번 뜨거나 화면이 멈추지 않는다)
  function enhanceFileInputs(root) {
    $$('input[type=file]', root).forEach((inp) => {
      if (inp.dataset.dz || inp.hidden) return; inp.dataset.dz = '1';
      const zone = document.createElement('div');
      zone.className = 'dropzone';
      zone.innerHTML = `<span class="dz-ic">${ic('upload')}</span><span class="dz-tx"><b>파일을 여기로 끌어다 놓거나 눌러서 고르세요</b><span class="dz-names"></span></span>`;
      inp.after(zone); zone.appendChild(inp); inp.classList.add('dz-input');
      inp.setAttribute('aria-label', '파일 고르기 또는 끌어다 놓기');
      const names = $('.dz-names', zone);
      const show = () => { const fs = Array.from(inp.files || []); names.textContent = fs.length ? fs.map((f) => f.name).join(', ') : (inp.multiple ? '여러 개를 한꺼번에 놓아도 돼요' : ''); zone.classList.toggle('has', fs.length > 0); };
      const okType = (f) => { const acc = (inp.accept || '').split(',').map((x) => x.trim().toLowerCase()).filter(Boolean); if (!acc.length) return true; const n = f.name.toLowerCase(); return acc.some((x) => (x.startsWith('.') ? n.endsWith(x) : f.type && (x.endsWith('/*') ? f.type.startsWith(x.slice(0, -1)) : f.type === x))); };
      ['dragenter', 'dragover'].forEach((t) => zone.addEventListener(t, (e) => { e.preventDefault(); zone.classList.add('over'); }));
      ['dragleave', 'dragend'].forEach((t) => zone.addEventListener(t, () => zone.classList.remove('over')));
      zone.addEventListener('drop', (e) => {
        e.preventDefault(); zone.classList.remove('over');
        let fs = Array.from((e.dataTransfer && e.dataTransfer.files) || []);
        const bad = fs.filter((f) => !okType(f)); fs = fs.filter(okType);
        if (bad.length) toast(`이 칸에 올릴 수 없는 파일은 뺐어요: ${bad.map((f) => f.name).join(', ')}`);
        if (!fs.length) return;
        if (!inp.multiple) fs = fs.slice(0, 1);
        const dt = new DataTransfer(); fs.forEach((f) => dt.items.add(f));
        inp.files = dt.files; inp.dispatchEvent(new Event('change', { bubbles: true }));
      });
      inp.addEventListener('change', show); show();
    });
  }
  // 파일 칸 밖에 잘못 떨어뜨려도 브라우저가 그 파일을 열어 쓰던 내용이 날아가지 않게
  ['dragover', 'drop'].forEach((t) => window.addEventListener(t, (e) => { if (!(e.target.closest && e.target.closest('.dropzone')) && e.dataTransfer && Array.from(e.dataTransfer.types || []).includes('Files')) e.preventDefault(); }));
  function confirmBox(title, text, okLabel, danger) {
    return modal(`<h2>${esc(title)}</h2><p>${esc(text)}</p><div class="form-actions"><button class="btn" data-close>취소</button><button class="btn primary ${danger ? 'danger' : ''}" data-ok>${esc(okLabel)}</button></div>`,
      (el, close) => { $('[data-ok]', el).addEventListener('click', () => close(true)); });
  }

  /* ───────── 검색창 (홈·검색 결과 공통) ───────── */
  function searchBox(value, autofocus) {
    return `<form class="searchbox" role="search" id="sform" autocomplete="off">
      ${ic('search', 'lead')}
      <label class="sr-only" for="q">학교 자료 검색</label>
      <input id="q" name="q" type="search" value="${esc(value || '')}" placeholder="예: 체험학습, 결석계, 출장 여비" ${autofocus ? 'autofocus' : ''} aria-autocomplete="list" aria-controls="suggest">
      <div class="suggest" id="suggest" role="listbox" hidden></div>
    </form>`;
  }
  function bindSearch(live) {
    const form = $('#sform'), q = $('#q'), sg = $('#suggest');
    let active = -1, items = [];
    const go = (val) => { location.hash = '#/search?q=' + encodeURIComponent(val.trim()); };
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      if (active >= 0 && items[active]) { const it = items[active]; if (it.ext) window.open(it.href, '_blank', 'noopener'); else location.hash = it.href; sg.hidden = true; return; }
      if (q.value.trim()) go(q.value);
    });
    if (!live) return;
    let missTimer = 0;
    const render = () => {
      const val = q.value.trim();
      const qv = encodeURIComponent(val);
      const docs = val ? byViews(Search.run(App.data.docs, val, (c) => catOf(c).name), val).slice(0, 6).map((r) => ({ th: thumbOfDoc(r.doc), href: '#/doc/' + r.doc.id + '?q=' + qv, icon: r.doc.format === 'reg' ? 'book-2' : r.where && /^첨부/.test(r.where.src) ? 'paperclip' : 'file-text', name: r.doc.format === 'reg' ? shortTitle(r.doc.title) : r.doc.title, cat: catOf(r.doc.category).name, src: r.where ? r.where.src : '', snip: r.where ? r.where.text : '' })) : [];
      // 도구·사이트·자료: 이름에 없으면 설명이나 올린 파일 속 글에서 찾은 곳을 보여 준다
      const ctx = (texts) => { for (const [src, t] of texts) { const L = t && Search.locate(t, val); if (L) return { src: src === 'file' ? (L.page ? `첨부 PDF ${L.page}쪽` : '첨부 파일') : src, snip: L.text }; } return { src: '', snip: '' }; };
      const ex = val ? searchExtras(val) : { lres: [], tres: [] };
      const extra = ex.tres.map((t) => Object.assign({ href: t.href, ext: t.ext, icon: t.icon, name: t.name, cat: t.kind, top: t._name, th: thumbOfUrl(t.ext && t.href) }, t._name ? {} : ctx([['설명', t.desc]])))
        .concat(ex.lres.map((l) => Object.assign({ href: lessonHref(l), icon: lessonIcon(l), th: thumbOfLesson(l), name: l.title, cat: l.subject === HOMEROOM ? '학급 자료' : '수업 자료', top: l._name }, l._name ? {} : ctx([['설명', l.desc], ['file', l.file && l.file.text]]))));
      // 이름에 바로 들어 있는 도구·사이트·자료를 맨 위에, 그다음 문서, 나머지
      items = extra.filter((x) => x.top).slice(0, 4).concat(docs.slice(0, 5), extra.filter((x) => !x.top).slice(0, 2)).slice(0, 8);
      active = -1;
      clearTimeout(missTimer);
      if (!items.length) {
        sg.hidden = true; sg.innerHTML = '';
        if (val) missTimer = setTimeout(() => noteMiss(val), 2500);   // 다 치고 잠시 멈췄을 때만 (치는 중인 글자는 남기지 않게)
        return;
      }
      sg.innerHTML = items.map((r, k) => `<a href="${esc(r.href)}"${r.ext ? ' target="_blank" rel="noopener noreferrer"' : ''} role="option" data-k="${k}">${ic(r.icon)}<span class="sg-main"><span class="sg-t">${Search.highlight(esc(r.name), val)}</span>${r.snip ? `<span class="sg-s">${r.src ? `<span class="src">${esc(r.src)}</span>` : ''}${Search.highlight(esc(r.snip), val)}</span>` : ''}</span><span class="cat">${esc(r.cat)}${r.ext ? ' ↗' : ''}</span>${Thumbs.html(r.th, 'sm')}</a>`).join('');
      Thumbs.wire(sg, false);
      sg.hidden = false;
    };
    q.addEventListener('input', render);
    q.addEventListener('keydown', (e) => {
      if (sg.hidden || !items.length) return;
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault();
        // -1(입력창) → 0 … 끝 → 다시 -1 로 돈다
        const n = items.length + 1;
        active = ((active + 1 + (e.key === 'ArrowDown' ? 1 : -1)) % n + n) % n - 1;
        $$('a', sg).forEach((a, k) => a.classList.toggle('active', k === active));
      } else if (e.key === 'Escape') { sg.hidden = true; }
    });
    document.addEventListener('click', (e) => { if (!form.contains(e.target)) sg.hidden = true; }, { once: false });
  }

  /* ───────── 홈 ───────── */
  function viewHome() {
    const docs = App.data.docs;
    const guides = docs.filter((d) => d.category !== 'rules');
    const rules = docs.filter((d) => d.category === 'rules').sort((a, b) => (a.order || 0) - (b.order || 0));
    const popular = [...docs].sort((a, b) => (b.views || 0) - (a.views || 0)).slice(0, 5);
    const recent = [...guides].sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt))).slice(0, 5);
    const pend = docs.filter((d) => d.review);
    const counts = {}; docs.forEach((d) => { counts[d.category] = (counts[d.category] || 0) + 1; });
    const welcome = docs.find((d) => /새로 오신|첫 주/.test(d.title));
    const chips = ['체험학습', '결석계', '생리 결석', '시험 감독', '전결'];
    // 규정집에서 자주 여는 규정 (제목에 이 낱말이 들어간 것)
    const quick = ['출결', '체험학습', '학업성적', '학생생활', '전결', '학교규칙'].map((k) => rules.find((r) => r.title.includes(k))).filter(Boolean);
    const rulesHtml = rules.length ? `<section class="rules-band">
  <div class="rb-head"><span class="ic">${ic('book-2')}</span><span class="tx"><b>규정집 바로 보기</b><span>규정 ${rules.length}개, 조문까지 바로 찾아 열어요</span></span><a class="btn sm" href="#/cat/rules">전체 목록${ic('arrow-right')}</a></div>
  <div class="rb-links">${quick.map((r) => `<a class="rb-link" href="#/doc/${r.id}"><span>${esc(shortTitle(r.title))}</span><span class="n">${articlesOf(r.body).length}개 조</span></a>`).join('')}</div>
</section>` : '';
    const isLive = App.store.mode !== 'demo';   // 실제 학교 운영판
    const howtoHtml = `<a class="welcome howto" href="#/howto"><span class="ic">${ic('directions')}</span><span class="tx"><b>처음 사용하시나요? 우리학교 길잡이 사용 방법</b><span>찾기·고치기·서식 인쇄·즐겨찾기를 5분 안에 익혀요</span></span>${ic('arrow-right')}</a>`;
    const welcomeHtml = isLive ? '' : welcome ? `<a class="welcome" href="#/doc/${welcome.id}"><span class="ic">${ic('directions')}</span><span class="tx"><b>새로 오셨나요?</b><span>첫 주에 필요한 것만 순서대로 모았어요</span></span>${ic('arrow-right')}</a>` : '';
    const catsHtml = `<h2 class="section-title">업무 안내 분류</h2>
    <div class="cat-grid">
      ${App.data.categories.filter((c) => c.id !== 'rules').map((c) => `<a class="cat-tile" href="#/cat/${c.id}"><span class="ic">${ic(c.icon || 'folder')}</span><span><span class="nm">${esc(c.name)}</span><br><span class="ct">문서 ${counts[c.id] || 0}개${c.review ? ' · 새 분류' : ''}</span></span></a>`).join('')}
      <a class="cat-tile add" href="#/propose/new?newcat=1"><span class="ic">${ic('plus')}</span><span><span class="nm">새 분류 만들기</span><br><span class="ct">첫 문서와 함께</span></span></a>
    </div>`;
    const listsHtml = `<div class="side-block"><h2 class="section-title">많이 찾는 문서</h2>${listDocs(popular, (d) => '조회 ' + (d.views || 0))}</div>
    <div class="side-block"><h2 class="section-title">최근 바뀐 안내</h2>${listDocs(recent, (d) => catOf(d.category).name)}</div>
    ${pend.length ? `<div class="side-block"><h2 class="section-title">관리자 확인 전 ${pend.length}건</h2>${listDocs(pend.slice(0, 5), (d) => d.review.type === 'edit' ? '고침' : '새 문서')}</div>` : ''}`;
    setView(`
<section class="hero">
  <h1>무엇을 찾고 계세요?</h1>
  <p>${esc(App.data.school.name)}의 규정·서식·절차를 한곳에서 찾아요.</p>
  ${searchBox('', !App.embed && matchMedia('(min-width: 721px)').matches)}
  <p class="search-hint">초성만 쳐도 찾아요 <kbd>ㅊㅎ</kbd> → 체험학습</p>
  <div class="popular"><span class="lbl">많이 찾는 말</span>${chips.map((c) => `<a class="chip" href="#/search?q=${encodeURIComponent(c)}">${esc(c)}</a>`).join('')}</div>
  ${(() => { const fv = favList().slice(0, 6); return fv.length ? `<div class="home-fav"><span class="lbl">${ic('star')}내 즐겨찾기</span>${fv.map((o) => `<a class="hf" href="${esc(o.href)}"${o.ext ? ' target="_blank" rel="noopener noreferrer"' : ''}>${ic(o.icon || 'star')}<span>${esc(o.title)}</span></a>`).join('')}<a class="hf more" href="#/fav">전체 ${favList().length}개${ic('arrow-right')}</a></div>` : ''; })()}
</section>
${App.data.neis && App.store.neis ? `<div class="top-duo">
  <div class="td-main">${isLive ? howtoHtml : ''}${rulesHtml}${welcomeHtml}${catsHtml}</div>
  ${schoolTodayHtml()}
</div>
<div class="home-lists">${listsHtml}</div>` : `${isLive ? howtoHtml : ''}${rulesHtml}
<div class="home-grid">
  <section>
    ${welcomeHtml}
    ${catsHtml}
  </section>
  <aside>
    ${listsHtml}
  </aside>
</div>`}
<div class="cta-band">
  <span class="tx"><b>찾는 내용이 없나요?</b><span>${App.needsCode ? '학교 코드만 넣으면 바로 올라가요.' : '누구나 바로 올릴 수 있어요.'} 관리자가 확인하기 전까지 '승인 전' 표시가 붙어요.</span></span>
  <a class="btn" href="#/propose/new">${ic('file-plus')}새 문서 쓰기</a>
</div>`, 'home');
    bindSearch(true);
    mountSchoolToday();
  }
  /* ───────── 오늘의 학교: 나이스 급식(조·중·석식)·이번 주 학사일정. 학교 저장소에 나이스가 연결된 학교 운영판에서만 ───────── */
  const SCHOOL_DAY = { date: null, meal: '중식', weeks: new Map() };
  const ymdOf = (d) => d.getFullYear() + String(d.getMonth() + 1).padStart(2, '0') + String(d.getDate()).padStart(2, '0');
  const dateOf = (s) => new Date(+s.slice(0, 4), +s.slice(4, 6) - 1, +s.slice(6, 8));
  const mondayOf = (d) => { const m = new Date(d); m.setDate(d.getDate() - ((d.getDay() + 6) % 7)); return m; };
  function schoolTodayHtml() { return `<div class="side-block school-today" id="schoolToday" aria-live="polite"></div>`; }
  async function mountSchoolToday() {
    const box = $('#schoolToday'); if (!box || !App.store.neis) return;
    if (!SCHOOL_DAY.date) SCHOOL_DAY.date = new Date(new Date().toDateString());
    const sel = SCHOOL_DAY.date, mon = mondayOf(sel), key = ymdOf(mon);
    const days = Array.from({ length: 7 }, (_, i) => { const d = new Date(mon); d.setDate(mon.getDate() + i); return d; });
    const todayY = ymdOf(new Date()), selY = ymdOf(sel);
    const head = `<div class="st-head">
      <h2 class="section-title">${ic('school')}오늘의 학교</h2>
      <div class="st-nav">
        <button type="button" class="st-arrow" data-st="-1" aria-label="전날">${ic('chevron-left')}</button>
        <label class="st-date" title="날짜 고르기"><span>${sel.getMonth() + 1}. ${sel.getDate()}.(${WD[sel.getDay()]})</span>${ic('calendar')}<input type="date" id="stPick" value="${sel.getFullYear()}-${String(sel.getMonth() + 1).padStart(2, '0')}-${String(sel.getDate()).padStart(2, '0')}" aria-label="날짜 고르기"></label>
        <button type="button" class="st-arrow" data-st="1" aria-label="다음 날">${ic('chevron-right')}</button>
        ${selY !== todayY ? `<button type="button" class="st-today" data-st="0">오늘</button>` : ''}
      </div></div>`;
    let data = SCHOOL_DAY.weeks.get(key);
    if (!data) {
      box.innerHTML = head + `<div class="st-card st-loading"><span class="spin"></span>나이스에서 불러오는 중…</div>`;
      bindSchoolToday(box);
      try { data = await App.store.neis(key, ymdOf(days[6])); SCHOOL_DAY.weeks.set(key, data); }
      catch (e) { if (ymdOf(SCHOOL_DAY.date) !== selY) return; box.innerHTML = head + `<div class="st-card st-empty">${ic('alert-triangle')}<span>급식·학사일정을 불러오지 못했어요. <button type="button" class="linkbtn" id="stRetry">다시 시도</button></span></div>`; bindSchoolToday(box); $('#stRetry').addEventListener('click', mountSchoolToday); return; }
      if (ymdOf(SCHOOL_DAY.date) !== selY) return;   // 그사이 다른 날을 골랐으면 그쪽이 그린다
    }
    const meals = data.meals.filter((m) => m.date === selY);
    const types = ['조식', '중식', '석식'];
    const cur = meals.find((m) => m.type === SCHOOL_DAY.meal);
    const future = selY > todayY && !data.meals.some((m) => m.date >= selY);   // 이 주에 그 뒤 식단이 하나도 없으면 아직 안 올라온 것
    const mealBody = !meals.length ? `<div class="st-empty">${ic('tools-kitchen-2')}<span>${sel.getDay() % 6 === 0 ? '주말이라 급식이 없어요.' : future ? '아직 나이스에 식단이 올라오지 않았어요.' : '이날은 급식이 없어요.'}</span></div>`
      : !cur ? `<div class="st-empty">${ic('tools-kitchen-2')}<span>이날은 ${SCHOOL_DAY.meal}이 없어요.</span></div>`
      : `<ul class="st-dishes">${cur.dishes.map((d) => `<li><span>${esc(d.name)}</span>${d.allergy.length ? `<button type="button" class="st-alg" title="알레르기: ${esc(d.allergy.join(', '))}" aria-label="알레르기 성분 ${d.allergy.length}가지 보기" aria-expanded="false">${d.allergy.length}</button><small class="st-alg-t">${esc(d.allergy.join(' · '))}</small>` : ''}</li>`).join('')}</ul>
        ${cur.kcal ? `<p class="st-kcal">${esc(cur.kcal)} kcal <span>· 숫자를 누르면 알레르기 성분</span></p>` : ''}`;
    const ev = (y) => data.events.filter((e) => e.date === y);
    const week = days.map((d) => {
      const y = ymdOf(d), es = ev(y), off = es.some((e) => /공휴일|휴업일/.test(e.kind));
      return `<li class="${y === selY ? 'sel' : ''}${y === todayY ? ' today' : ''}${off || d.getDay() % 6 === 0 ? ' off' : ''}">
        <button type="button" data-day="${y}" aria-label="${d.getMonth() + 1}월 ${d.getDate()}일 ${WD[d.getDay()]}요일${es.length ? ', ' + esc(es.map((e) => e.name).join(', ')) : ''}"><span class="wd">${WD[d.getDay()]}</span><span class="dn">${d.getDate()}</span></button>
        <div class="evs">${es.length ? es.map((e) => `<span class="ev${/공휴일|휴업일/.test(e.kind) ? ' hol' : ''}">${esc(e.name)}${e.grades.length && e.grades.length < 3 ? `<small>${e.grades.join('·')}학년</small>` : ''}</span>`).join('') : '<span class="none">·</span>'}</div></li>`;
    }).join('');
    box.innerHTML = head + `
      <div class="st-card">
        <div class="st-tabs" role="tablist" aria-label="급식 종류">${types.map((t) => { const has = meals.some((m) => m.type === t); return `<button type="button" role="tab" aria-selected="${t === SCHOOL_DAY.meal}" data-meal="${t}" class="${has ? '' : 'dim'}">${t}</button>`; }).join('')}</div>
        ${mealBody}
      </div>
      <div class="st-card st-week">
        <h3>${days[0].getMonth() + 1}. ${days[0].getDate()}. ~ ${days[6].getMonth() + 1}. ${days[6].getDate()}. 학사일정</h3>
        <ul>${week}</ul>
      </div>
      <p class="st-src">자료: 나이스 교육정보 개방 포털</p>`;
    bindSchoolToday(box);
  }
  function bindSchoolToday(box) {
    const go = (d) => { SCHOOL_DAY.date = d; mountSchoolToday(); };
    $$('[data-st]', box).forEach((b) => b.addEventListener('click', () => {
      const n = +b.dataset.st; if (!n) return go(new Date(new Date().toDateString()));
      const d = new Date(SCHOOL_DAY.date); d.setDate(d.getDate() + n); go(d);
    }));
    $$('[data-meal]', box).forEach((b) => b.addEventListener('click', () => { SCHOOL_DAY.meal = b.dataset.meal; mountSchoolToday(); }));
    $$('.st-alg', box).forEach((b) => b.addEventListener('click', () => { const li = b.closest('li'); const on = li.classList.toggle('alg-on'); b.setAttribute('aria-expanded', on); }));
    $$('[data-day]', box).forEach((b) => b.addEventListener('click', () => go(dateOf(b.dataset.day))));
    const pick = $('#stPick', box);
    if (pick) {
      pick.addEventListener('change', () => { if (pick.value) go(new Date(pick.value + 'T00:00:00')); });
      pick.closest('.st-date').addEventListener('click', (e) => { if (e.target !== pick) { e.preventDefault(); try { pick.showPicker(); } catch (er) { pick.focus(); } } });
    }
  }
  function listDocs(list, meta) {
    if (!list.length) return '<p class="count-line">아직 문서가 없어요.</p>';
    return '<ul class="doclist">' + list.map((d) => `<li><a href="#/doc/${d.id}"><span class="t">${esc(d.title)}${pendBadge(d)}</span><span class="m">${esc(meta(d))}</span></a></li>`).join('') + '</ul>';
  }

  // 검색 결과 순서: 제목에 든 것 → 본문·첨부에 든 것 → 분류 이름만 맞는 것, 그 안에서는 조회수 높은 것부터
  const byViews = (rs, q) => {
    const tier = (r) => (Search.locate(r.doc.title, q) ? 0 : r.where && r.where.src ? 1 : 2);
    return rs.map((r) => Object.assign(r, { _tier: tier(r) })).sort((a, b) => a._tier - b._tier || (b.doc.views || 0) - (a.doc.views || 0) || b.score - a.score);
  };

  /* ───────── 미리보기 그림: 검색 결과 오른쪽의 작은 화면 그림 ─────────
     파일은 원본의 첫 쪽을 작게 찍고(내 양식 입력은 넣지 않음), 사이트·웹앱은 그 화면을 찍는다.
     학교 저장소(Cloudflare)면 한 번 만든 그림을 저장소에 두고 모두가 같이 쓴다(/t/). 새로 올린 파일은 올릴 때 바로 만든다 */
  const THUMB_FT = /^(pdf|img|xlsx|hwp|hwpx)$/;
  const hashStr = (s) => { let h = 0; for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0; return (h >>> 0).toString(36); };
  function thumbOfAtt(a) {
    if (!a || !(a.fileId || a.url)) return null;
    const ft = a.ftype || GilFiles.typeOf(a.name);
    if (!THUMB_FT.test(ft)) return null;
    return { kind: 'file', id: a.fileId || 'u' + hashStr(a.url), ftype: ft, name: a.fileName || a.name, get: () => fileBytes(a) };
  }
  function thumbOfForm(id) {
    const x = window.XLSX_FORMS && window.XLSX_FORMS[id], h = window.HWPX_FORMS && window.HWPX_FORMS[id], m = x || h;
    if (!m || !m.zip) return null;
    return { kind: 'form', id: 'form-' + String(id).replace(/[^A-Za-z0-9_-]/g, '') + '-' + (m.zip.length % 99991).toString(36), ftype: x ? 'xlsx' : 'hwpx', name: (m.title || id) + (x ? '.xlsx' : '.hwpx'), get: async () => (x ? m.zip : Uint8Array.from(atob(m.zip), (c) => c.charCodeAt(0)).buffer) };
  }
  function thumbOfUrl(u) {
    if (!u || /^#/.test(u)) return null;
    try { const x = new URL(u, location.href); return /^https:$/.test(x.protocol) ? { kind: 'url', url: x.href } : null; } catch (e) { return null; }
  }
  function thumbOfDoc(d) {
    for (const a of d.attachments || []) {
      const t = a.kind === 'form' ? thumbOfForm(a.formId) : a.kind === 'file' ? thumbOfAtt(a) : null;
      if (t) return t;
    }
    const ln = (d.links || []).concat((d.attachments || []).filter((a) => a.kind !== 'file' && a.kind !== 'form')).find((l) => l.url && /^https:/.test(l.url));
    return ln ? thumbOfUrl(ln.url) : null;
  }
  function thumbOfLesson(l) {
    if (l.kind === 'app') {
      const pub = l.file && l.file.fileId && App.store.publicFileUrl && !String(l.file.fileId).startsWith('lessons/') ? App.store.publicFileUrl(l.file.fileId, l.file.name || 'app.html') : '';
      return thumbOfUrl(pub || l.url);
    }
    return thumbOfAtt(l.file);
  }
  const Thumbs = (() => {
    const W = 360;                 // 저장하는 그림 폭(px)
    const local = new Map();       // 이 화면에서 만든 그림 (저장소가 없어도 보이게)
    const jobs = new Map();        // 만드는 중
    const checked = new Set();     // 저장소에 있는지 이미 본 것
    let chain = Promise.resolve(), pending = [];
    const st = () => App.store || {};
    const keyOf = (t) => (t && t.kind !== 'url' ? t.id : '');
    function urlOf(t) {
      if (t.kind === 'url') return st().shotUrl ? st().shotUrl(t.url) : '';
      return local.get(t.id) || (st().thumbUrl ? st().thumbUrl(t.id) : '');
    }
    const loadImg = (src) => new Promise((res, rej) => { const im = new Image(); im.onload = () => res(im); im.onerror = () => rej(new Error('그림을 읽지 못했어요')); im.src = src; });
    // 위에서부터 폭 W 로 줄이고, 너무 길면 위쪽만 (가로:세로 = 1:1.2 까지)
    function jpeg(src, w, h, width, maxRatio, q) {
      const PW = width || W, s = PW / w, ch = Math.min(Math.round(h * s), Math.round(PW * (maxRatio || 1.2)));
      const c = document.createElement('canvas'); c.width = PW; c.height = Math.max(ch, 20);
      const x = c.getContext('2d'); x.fillStyle = '#fff'; x.fillRect(0, 0, c.width, c.height);
      x.drawImage(src, 0, 0, w * s, h * s);
      return c.toDataURL('image/jpeg', q || 0.8);
    }
    // 한글 문서 쪽들을 화면 밖 편집기로 그려 하나씩 넘긴다: each(그림, 폭, 높이, 쪽 번호)
    async function hwpEach(bytes, name, max, each) {
      const m = await loadRhwp();
      const box = document.createElement('div'); box.setAttribute('aria-hidden', 'true');
      box.style.cssText = 'position:fixed;left:-30000px;top:0;width:900px;height:1300px;pointer-events:none'; document.body.appendChild(box);
      try {
        const ed = await withTimeout(m.createEditor(box), 25000);
        await withTimeout(ed.loadFile(bytes.slice(0), name || 'file.hwp'), 30000);
        const n = Math.min(await ed.pageCount(), max);
        for (let i = 0; i < n; i++) {
          const svg = HwpView.toSvg(await ed.getPageSvg(i));
          const vb = (svg.getAttribute('viewBox') || '').split(/[\s,]+/).map(Number);
          const w = parseFloat(svg.getAttribute('width')) || vb[2] || 794, h = parseFloat(svg.getAttribute('height')) || vb[3] || 1123;
          if (!svg.getAttribute('viewBox')) svg.setAttribute('viewBox', `0 0 ${w} ${h}`);
          svg.setAttribute('width', w); svg.setAttribute('height', h); svg.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
          await each(await loadImg('data:image/svg+xml;charset=utf-8,' + encodeURIComponent(new XMLSerializer().serializeToString(svg))), w, h, i);
        }
      } finally { box.remove(); }
    }
    let css = null;
    const xlCss = () => {
      if (css != null) return css; css = '';
      for (const sh of document.styleSheets) { let rs; try { rs = sh.cssRules; } catch (e) { continue; } for (const r of rs) if (r.selectorText && /\.xl-|:root/.test(r.selectorText)) css += r.cssText + '\n'; }
      return css;
    };
    async function render(bytes, ft, name) {
      if (ft === 'pdf') { const c = await GilFiles.pdfFirstPage(bytes, W); return jpeg(c, c.width, c.height); }
      if (ft === 'img') { const b = await createImageBitmap(new Blob([bytes])); return jpeg(b, b.width, b.height); }
      if (ft === 'xlsx') {
        const book = await XlsxView.open(typeof bytes === 'string' ? bytes : new Uint8Array(bytes));
        const box = document.createElement('div'); box.className = 'thumb-src'; box.setAttribute('aria-hidden', 'true');
        box.style.cssText = 'position:fixed;left:-30000px;top:0;width:1800px;pointer-events:none'; document.body.appendChild(box);
        try {
          XlsxView.mount(box, book, () => {});
          await new Promise((r) => requestAnimationFrame(() => r()));
          const z = box.querySelector('.xl-zoom'); z.style.zoom = '1';
          const w = Math.max(200, Math.min(z.scrollWidth, 1800)), h = Math.max(120, Math.min(z.scrollHeight, Math.round(w * 1.2)));
          const cl = z.cloneNode(true); cl.style.zoom = '';
          const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}"><foreignObject x="0" y="0" width="${w}" height="${h}"><div xmlns="http://www.w3.org/1999/xhtml" style="width:${w}px;height:${h}px;overflow:hidden;background:#fff;font-family:'Malgun Gothic','맑은 고딕',sans-serif"><style><![CDATA[${xlCss()}]]></style>${new XMLSerializer().serializeToString(cl)}</div></foreignObject></svg>`;
          return jpeg(await loadImg('data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg)), w, h);
        } finally { box.remove(); }
      }
      if (ft === 'hwp' || ft === 'hwpx') {
        let out = null;
        await hwpEach(typeof bytes === 'string' ? Uint8Array.from(atob(bytes), (c) => c.charCodeAt(0)).buffer : bytes, name, 1, (img, w, h) => { out = jpeg(img, w, h); });
        return out;
      }
      return null;
    }
    // 하나씩 차례로 만든다 (화면이 버벅이지 않게)
    function make(t) {
      const k = keyOf(t); if (!k || !t.get) return Promise.resolve(null);
      if (local.has(k)) return Promise.resolve(local.get(k));
      if (jobs.has(k)) return jobs.get(k);
      const p = (chain = chain.then(async () => {
        const data = await render(await t.get(), t.ftype, t.name);
        if (!data) return null;
        local.set(k, data);
        if (st().saveThumb) st().saveThumb(k, data).catch(() => {});
        return data;
      }).catch((e) => { console.warn('미리보기 그림을 만들지 못했어요', e); return null; }));
      jobs.set(k, p); return p;
    }
    // 파일을 열었을 때: 저장소에 그림이 없으면 만들어 올린다
    function ensure(t) {
      const k = keyOf(t); if (!k || checked.has(k) || local.has(k)) return; checked.add(k);
      setTimeout(async () => {
        const u = st().thumbUrl ? st().thumbUrl(k) : '';
        if (u) { try { const r = await fetch(u, { method: 'GET' }); if (r.ok) return; } catch (e) { /* 없으면 만든다 */ } }
        make(t);
      }, 2500);
    }
    // 사이트 화면 그림은 두 개씩 차례로 부른다 (처음 찍을 때 화면 찍기 서비스가 한꺼번에 받지 못해서)
    const shotWait = []; let shotRun = 0;
    function shotQ(img, u) { shotWait.push([img, u]); pump(); }
    function pump() {
      while (shotRun < 2 && shotWait.length) {
        const [img, u] = shotWait.shift();
        if (!img.isConnected) continue;
        shotRun++;
        const done = () => { shotRun--; img.removeEventListener('load', done); img.removeEventListener('error', done); pump(); };
        img.addEventListener('load', done); img.addEventListener('error', done);
        img.src = u;
      }
    }
    // 화면 글: 그림 칸. 그림이 없으면 칸을 숨긴다
    function html(t, size) { if (!t) return ''; const i = pending.push(t) - 1; return `<span class="thumb ${size || ''}" aria-hidden="true"><img alt="" decoding="async" data-th="${i}"></span>`; }
    // canMake: 저장소에 없을 때 이 화면에서 만들어 볼지 (검색 결과 화면만)
    function wire(root, canMake) {
      const list = pending; pending = [];
      $$('img[data-th]', root).forEach((img) => {
        const t = list[+img.dataset.th]; img.removeAttribute('data-th');
        const box = img.parentNode;
        const none = () => box.classList.add('none');
        if (!t) return none();
        img.addEventListener('load', () => box.classList.add('ok'));
        const tryMake = async () => { if (img._made || !canMake || !t.get) return none(); img._made = true; const d = await make(t); if (d && img.isConnected) img.src = d; else none(); };
        img.addEventListener('error', tryMake);
        const u = urlOf(t);
        if (!u) return tryMake();
        if (t.kind === 'url') shotQ(img, u); else img.src = u;
      });
    }
    // 한글 파일 쪽 그림(사파리에서 보기·인쇄용): PC에서 원본을 열었을 때 저장소에 없으면 쪽마다 만들어 올린다 (p<쪽>-<파일 id>)
    function ensurePages(t) {
      if (!t || !t.get || !/^hwpx?$/.test(t.ftype) || !st().thumbUrl || !st().saveThumb || NO_RHWP) return;
      const k = 'pg:' + t.id; if (checked.has(k)) return; checked.add(k);
      setTimeout(async () => {
        try { const r = await fetch(st().thumbUrl('p1-' + t.id)); if (r.ok) return; } catch (e) { return; }
        chain = chain.then(async () => {
          await hwpEach(await t.get(), t.name, 40, async (img, w, h, i) => { await st().saveThumb('p' + (i + 1) + '-' + t.id, jpeg(img, w, h, 1000, 99, 0.82)); });
        }).catch((e) => console.warn('쪽 그림을 만들지 못했어요', e));
      }, 4000);
    }
    return { html, wire, make, ensure, ensurePages };
  })();
  // 파일을 올리면 바로 미리보기 그림도 만든다 (검색에 곧바로 보이게)
  function hookUploads() {
    const s = App.store; if (!s || !s.putFile || s.putFile._th) return;
    const orig = s.putFile;
    const w = async function (name, blob) {
      const id = await orig.call(s, name, blob);
      const ft = GilFiles.typeOf(name);
      if (THUMB_FT.test(ft)) setTimeout(() => { const t = { kind: 'file', id, ftype: ft, name, get: () => blob.arrayBuffer() }; Thumbs.make(t); Thumbs.ensurePages(t); }, 1200);
      return id;
    };
    w._th = true; s.putFile = w;
  }

  // 문서 밖 검색 대상: 수업·학급 자료(올린 파일 속 글 포함), 생기부·공문, 학급 도구, 도구 탭, 유용한 사이트(선생님이 더한 것 포함)
  // 띄어쓰기 무시, 초성만 넣어도 찾는다. 이름에 바로 들어 있으면 nameHit
  function searchExtras(q) {
    // 친 그대로 + 한/영 자판을 바꿔 친 경우("wldhwl"→"지오지", "ㅎ대"→"geo") 중 하나라도 맞으면
    const sets = Search.variants(String(q || '').trim()).map((v) => v.toLowerCase().split(/\s+/).filter(Boolean)).filter((t) => t.length);
    const hit = (text) => { const n = String(text || '').toLowerCase().replace(/\s+/g, ''); let c = null; return sets.some((toks) => toks.every((k) => /^[ㄱ-ㅎ]+$/.test(k) ? (c = c || Search.chosung(n)).includes(k) : n.includes(k))); };
    const host = (u) => { try { return new URL(u, location.href).hostname.replace(/^www\./, '') + ' ' + String(u).split('/').pop().replace(/\.html?$/, ''); } catch (e) { return ''; } };
    const lres = (App.data.lessons || []).filter((l) => hit([l.title, l.desc, l.subject, l.course, l.maker, l.file && l.file.name, l.file && l.file.text].join(' '))).sort((a, b) => (b.views || 0) - (a.views || 0)).slice(0, 8)
      .map((l) => Object.assign(l, { _name: hit(l.title) }));
    const builtin = [
      { name: '생기부 도우미', desc: 'Classroom 과제와 관찰 기록을 모아 세특 초안용 엑셀로 만들어요. 개인정보 보호를 위해 학생 이름은 지우고 S번호로 바꿔요.', icon: 'notebook', href: '#/sgb', kind: '생기부', kw: 'saenggibu student record 생기부 생활기록부 학생부 세특 세부능력 특기사항 행특 행동특성 창체 자율 동아리 진로 기록 누가기록' },
      { name: '우리학교 길잡이 사용 방법', desc: '처음 쓰는 선생님을 위한 안내: 찾기·고치기·서식 인쇄·즐겨찾기·각 탭 쓰는 법.', icon: 'directions', href: '#/howto', kind: '안내', kw: '사용법 사용 방법 도움말 처음 안내 howto help 길잡이 쓰는 법' },
      { name: '공문 작성기', desc: '종류를 고르고 칸을 채우면 에듀파인 기안문이 바로 만들어져요.', icon: 'file-pencil', href: '#/gongmun', kind: '공문', kw: 'gongmun edufine official letter 공문 공문서 기안 기안문 에듀파인 품의 지출 시행 보고 강사 환불 계획 작성기 GPT' },
    ];
    const classTools = (App.data.classTools || []).map((t) => ({ name: t.name, desc: t.desc, icon: t.icon || 'tools', href: t.local ? t.url + (t.url.includes('?') ? '&' : '?') + 'school=' + encodeURIComponent(App.data.school.name) : t.url, ext: true, kind: '학급 도구', kw: '학급 운영 담임 도구 ' + host(t.url) + ' ' + (t.en || '') }));
    const tools = (App.data.tools || []).map((t) => ({ name: t.name, desc: t.desc, icon: t.icon || 'tools', href: toolUrl(t), ext: true, kind: '도구', kw: [t.maker, t.target, '도구', host(t.url || '')].join(' ') }));
    const sites = [].concat(...sitesData().map((g) => g.items.map((x) => ({ name: x.name, desc: (x.desc || '') + ' (' + g.group + ' 사이트)', icon: g.icon || 'world', href: x.url, ext: true, kind: '사이트', kw: [g.group, g.for, '사이트', host(x.url), x.en || ''].join(' ') }))));
    const seen = new Set();
    const all = builtin.concat(classTools, tools, sites).filter((t) => hit([t.name, t.desc, t.kw].join(' '))).filter((t) => { const k = t.name.replace(/\s+/g, ''); if (seen.has(k)) return false; seen.add(k); return true; });
    all.forEach((t) => { t._name = hit(t.name); });
    // 이름에 들어 있는 것을 먼저
    const tres = all.filter((t) => t._name).concat(all.filter((t) => !t._name)).slice(0, 8);
    return { lres, tres };
  }

  /* ───────── 검색 결과 ───────── */
  // 아무것도 못 찾은 말을 관리자가 볼 수 있게 남긴다. 한 번 열어 둔 동안 같은 말은 한 번만, 많아도 20개까지
  const missSeen = new Set();
  function noteMiss(q) {
    const t = String(q || '').trim();
    if (!t || missSeen.has(t) || missSeen.size >= 20 || !App.store.miss) return;
    missSeen.add(t);
    App.store.miss(t);
  }
  function viewSearch(q) {
    const res = byViews(Search.run(App.data.docs, q, (c) => catOf(c).name), q);
    const qp = '?q=' + encodeURIComponent(q);
    const { lres, tres } = searchExtras(q);
    if (!res.length && !lres.length && !tres.length) noteMiss(q);
    const swapped = (Search.variants(q)[1] || '').match(/^[가-힣\s]+$/) ? Search.variants(q)[1] : '';
    const nRoom = lres.filter((l) => l.subject === HOMEROOM).length;
    const lessonBlock = lres.length ? `<h2 class="section-title" style="margin-top:26px">${nRoom === lres.length ? '학급 자료' : nRoom ? '수업·학급 자료' : '수업 자료'} ${lres.length}개</h2><div class="tool-grid">${lres.map((l) => `<article class="tool">
      <div class="top"><span class="ic">${ic(lessonIcon(l))}</span><div><h3>${esc(l.title)}</h3><span class="maker">${esc(l.subject === HOMEROOM ? '학급 운영' : [l.subject, l.course].filter(Boolean).join(' · '))}</span></div>${Thumbs.html(thumbOfLesson(l), 'md')}</div>
      <p>${esc(l.desc || '')}</p><div class="go">${openBtn(l)}</div></article>`).join('')}</div>` : '';
    const toolBlock = tres.length ? `<h2 class="section-title" style="margin-top:26px">도구·사이트 ${tres.length}개</h2><div class="tool-grid">${tres.map((t) => `<article class="tool">
      <div class="top"><span class="ic">${ic(t.icon)}</span><div><h3>${Search.highlight(esc(t.name), q)}</h3></div>${Thumbs.html(thumbOfUrl(t.ext && t.href), 'md')}</div>
      <p>${esc(t.desc || '')}</p><div class="go"><a class="btn primary" href="${esc(t.href)}"${t.ext ? ' target="_blank" rel="noopener"' : ''}>${ic(t.ext ? 'external-link' : 'arrow-right')}열기</a></div></article>`).join('')}</div>` : '';
    setView(`
<div class="narrow">
  ${searchBox(q, false)}
  ${swapped ? `<p class="count-line" style="margin-bottom:4px">${ic('keyboard')} 한/영 자판을 바꿔 <b>'${esc(swapped)}'</b>(으)로도 찾았어요.</p>` : ''}
  ${res.length ? `<p class="count-line">'${esc(q)}' 검색 결과 ${res.length}개</p>
  ${toolBlock ? toolBlock.replace('margin-top:26px', 'margin-top:4px') : ''}
  <ul class="results">${res.map((r) => { const th = Thumbs.html(thumbOfDoc(r.doc), 'lg'); return `<li><a class="result${th ? ' has-th' : ''}" href="#/doc/${r.doc.id}${qp}">${th}
    <span class="meta"><span class="tag">${ic(catOf(r.doc.category).icon || 'folder')}${esc(catOf(r.doc.category).name)}</span></span>
    <div class="t">${Search.highlight(esc(r.doc.title), q)}${pendBadge(r.doc)}</div>
    ${r.article ? `<div class="art">${ic('bookmark')}${esc(r.article)}</div>` : ''}
    <div class="s">${r.where && /^(첨부|링크)/.test(r.where.src) ? `<span class="src">${esc(r.where.src)}</span>${Search.highlight(esc(r.where.text), q)}` : Search.highlight(esc(r.snippet), q)}</div></a></li>`; }).join('')}</ul>
  ${lessonBlock}
  <div class="cta-band"><span class="tx"><b>찾는 문서가 아닌가요?</b><span>'${esc(q)}' 문서를 바로 새로 쓸 수 있어요.</span></span><a class="btn" href="#/propose/new?title=${encodeURIComponent(q)}">${ic('file-plus')}새 문서 쓰기</a></div>`
      : `${toolBlock}${lessonBlock}<div class="empty"><div class="ic">${ic('file-plus')}</div>
    <h2>'${esc(q)}' 문서는 아직 없어요</h2>
    <p>알고 계신 내용을 적어 주시면 바로 모든 선생님이 함께 볼 수 있어요. 다른 낱말로 다시 찾아봐도 좋아요.</p>
    <a class="btn primary" href="#/propose/new?title=${encodeURIComponent(q)}">${ic('file-plus')}이 문서를 만들어 주세요</a></div>`}
</div>`, 'home');
    Thumbs.wire($('#main'), true);
    bindSearch(true);
  }

  /* ───────── 분류 ───────── */
  function viewCat(id) {
    const c = catOf(id);
    const isRules = id === 'rules';
    const list = App.data.docs.filter((d) => d.category === id)
      .sort((a, b) => (isRules ? (a.order || 0) - (b.order || 0) : a.title.localeCompare(b.title, 'ko')));
    const sub = (d) => isRules ? `조문 ${articlesOf(d.body).length}개` : esc(Search.plain(d.body).slice(0, 110));
    setView(`
<div class="narrow">
  <a class="back" href="#/">${ic('arrow-left')}처음으로</a>
  <div class="page-head"><span class="cat-tile" style="padding:0;border:0;background:none"><span class="ic">${ic(c.icon || 'folder')}</span></span><h1>${esc(c.name)}</h1><span class="badge">${list.length}개</span>${c.review ? '<span class="badge amber">새 분류 · 승인 전</span>' : ''}<span style="flex:1"></span>${isRules ? '' : `<a class="btn sm" href="#/propose/new?cat=${encodeURIComponent(id)}">${ic('file-plus')}새 문서 쓰기</a>`}</div>
  ${isRules ? `<p class="count-line" style="margin-top:-8px">규정을 누르면 바로 열려요. 처음 화면 검색창에서 낱말로 찾으면 해당 조문으로 바로 가요.</p>` : ''}
  ${list.length ? `<ul class="results${isRules ? ' compact' : ''}">${list.map((d) => `<li><a class="result" href="#/doc/${d.id}">${isRules || !d.owner ? '' : `<span class="meta"><span>${esc(d.owner)}</span></span>`}<div class="t">${esc(isRules ? shortTitle(d.title) : d.title)}${pendBadge(d)}</div><div class="s">${sub(d)}</div></a></li>`).join('')}</ul>`
      : `<div class="empty"><div class="ic">${ic('inbox')}</div><h2>아직 문서가 없어요</h2><p>이 분류의 첫 문서를 써 주세요.</p><a class="btn primary" href="#/propose/new?cat=${encodeURIComponent(id)}">${ic('file-plus')}새 문서 쓰기</a></div>`}
</div>`, 'home');
  }

  /* ───────── 문서 보기 ───────── */
  function viewDoc(id, qs) {
    const d = docOf(id);
    if (!d) {
      setView(`<div class="narrow"><div class="empty"><div class="ic">${ic('alert-triangle')}</div><h2>문서를 찾을 수 없어요</h2><p>지워졌거나 잠시 숨겨진 문서예요.</p><a class="btn" href="#/">처음으로</a></div></div>`, 'home');
      return;
    }
    if (!App.viewed.has(id)) { App.viewed.add(id); d.views = (d.views || 0) + 1; App.store.hit(id); }
    const c = catOf(d.category);
    const atts = d.attachments || [];
    const isReg = d.format === 'reg';
    const arts = isReg ? articlesOf(d.body) : [];
    const q = (qs && qs.get('q')) || '';
    const pItems = paneItems(d);
    const split = pItems.length > 0 && matchMedia(PANE_MIN).matches;
    setView(`${split ? '<div class="doc-split">' : ''}
<article class="narrow${split ? ' doc-left' : ''}">
  <a class="back" href="#/cat/${c.id}">${ic('arrow-left')}${esc(c.name)}</a>
  <header class="doc-head">
    <h1>${esc(d.title)}${pendBadge(d)}</h1>
    <div class="doc-meta">
      ${d.owner ? `<span>${ic('building')}${esc(d.owner)}</span>` : ''}
      ${isReg ? `<span>${ic('list')}조문 ${arts.length}개</span>` : ''}
      <span>${ic('eye')}조회 ${d.views || 0}</span>
    </div>
    ${(d.aliases || []).length ? `<div class="aliases"><span class="lbl">이렇게도 찾아요</span>${d.aliases.map((a) => `<a class="chip" href="#/search?q=${encodeURIComponent(a)}">${esc(a)}</a>`).join('')}</div>` : ''}
    ${isReg && (d.revisions || []).length ? `<details class="revs"><summary>개정 이력 ${d.revisions.length}건</summary><p>${d.revisions.map(esc).join('<br>')}</p></details>` : ''}
  </header>
  <div class="doc-actions">
    ${isReg && window.RULES_PDF && window.RULES_PDF.pages[d.id] ? `<a class="btn primary" href="#/pdf/rules?doc=${d.id}&page=${window.RULES_PDF.pages[d.id]}${q ? '&q=' + encodeURIComponent(q) : ''}">${ic('file-type-pdf')}원본 PDF 보기</a>` : ''}
    <a class="btn" href="#/propose/${d.id}">${ic('pencil')}고치기</a>
    ${favBtn({ type: 'doc', id: d.id, title: isReg ? shortTitle(d.title) : d.title, href: '#/doc/' + d.id, icon: c.icon || 'file-text', sub: c.name }, true)}
    <button class="btn ghost" id="copyLink">${ic('link')}<span class="lbl-long">링크 복사</span></button>
    <button class="btn ghost" id="printDoc">${ic('printer')}<span class="lbl-long">인쇄</span></button>
    <button class="btn ghost" id="reportDoc">${ic('flag')}<span class="lbl-long">신고</span></button>
  </div>
  ${isReg ? `<div class="reg-tools" id="regTools">
    <label class="sr-only" for="artSel">조문으로 이동</label>
    <select class="select" id="artSel"><option value="">조문으로 바로 가기 (${arts.length}개)</option>${arts.map((a, k) => `<option value="${k}">${esc(a)}</option>`).join('')}</select>
    <form class="find" id="findForm" role="search"><label class="sr-only" for="findQ">이 규정에서 찾기</label>${ic('search')}<input id="findQ" class="input" placeholder="이 규정에서 찾기" value="${esc(q)}" autocomplete="off"><span class="cnt" id="findCnt"></span><button type="button" class="btn sm ghost" id="findPrev" aria-label="이전 위치">${ic('chevron-up')}</button><button type="submit" class="btn sm ghost" aria-label="다음 위치">${ic('chevron-down')}</button></form>
  </div>` : String(d.body || '').length > 400 ? `<div class="reg-tools doc-find"><form class="find" id="findForm" role="search"><label class="sr-only" for="findQ">이 문서에서 찾기</label>${ic('search')}<input id="findQ" class="input" placeholder="이 문서에서 찾기" value="${esc(q)}" autocomplete="off"><span class="cnt" id="findCnt"></span><button type="button" class="btn sm ghost" id="findPrev" aria-label="이전 위치">${ic('chevron-up')}</button><button type="submit" class="btn sm ghost" aria-label="다음 위치">${ic('chevron-down')}</button></form></div>` : ''}
  ${reviewNote(d)}
  <div class="prose${isReg ? ' reg' : ''}" id="docBody">${renderBody(d)}</div>
  ${atts.length ? `<section class="attach"><h2 class="section-title">첨부 서식·파일</h2><div class="attach-list">${atts.map((a, k) => {
      const ft = a.kind === 'file' ? (a.ftype || GilFiles.typeOf(a.name)) : (window.XLSX_FORMS && window.XLSX_FORMS[a.formId] ? 'xlsx' : 'hwp');
      return `
    <div class="attach-item"><span class="ic">${ic(FT_ICON[ft] || 'file-text')}</span><span class="nm">${esc(a.name)}<span class="ft">${FT_LABEL[ft] || ''}${a.kind === 'file' && a.ver ? ` · ${a.ver}번째 판` : ''}${newFile(d, a) ? ' <span class="badge amber">새로 올림 · 승인 전</span>' : ''}</span></span>
      <span class="acts">${favBtn(a.kind === 'form' ? { type: 'form', id: a.formId, title: a.name, href: '#/form/' + a.formId + '?doc=' + d.id, icon: FT_ICON[ft] || 'file-text', sub: d.title } : a.kind === 'file' ? { type: 'att', id: d.id + '/' + k, title: a.name, href: '#/file/' + d.id + '/' + k, icon: FT_ICON[ft] || 'file', sub: d.title } : { type: 'site', id: 'u:' + a.url, title: a.name, href: a.url, ext: true, icon: 'world', sub: d.title })}${a.kind === 'form' ? `<a class="btn sm primary" data-pk="${k}" href="#/form/${esc(a.formId)}?doc=${esc(d.id)}">${ic('pencil')}작성·인쇄</a>`
        : a.kind === 'file' ? `<a class="btn sm primary" data-pk="${k}" href="#/file/${esc(d.id)}/${k}${q ? '?q=' + encodeURIComponent(q) : ''}">${ic('eye')}바로 보기</a>`
        : `<a class="btn sm" data-pk="${k}" href="${esc(a.url)}" target="_blank" rel="noopener noreferrer">${ic('external-link')}열기</a>`}${a.kind === 'form' || a.kind === 'file' ? `<a class="btn sm ghost" href="#/propose/${esc(d.id)}?replace=${k}" title="새 파일로 바꾸기">${ic('upload')}바꾸기</a>` : ''}</span></div>`; }).join('')}</div>
    <p class="count-line" style="margin:8px 0 0">새 판 파일이 있으면 <b>바꾸기</b>로 올려 주세요. 파일을 더 붙이려면 <a href="#/propose/${esc(d.id)}?addfile=1">파일 추가</a>.</p></section>` : ''}
  ${(d.links || []).length ? `<section class="attach"><h2 class="section-title">관련 자료</h2><div class="attach-list">${d.links.map((l, j) => `<div class="attach-item"><span class="ic">${ic('world')}</span><span class="nm">${esc(l.name)}</span><span class="acts"><a class="btn sm" data-pk="l${j}" href="${esc(l.url)}" target="_blank" rel="noopener noreferrer">${ic('external-link')}열기</a></span></div>`).join('')}</div></section>` : ''}
  <div class="doc-foot"><span class="tx"><b>내용이 바뀌었나요?</b> ${App.needsCode ? '학교 코드만 넣으면 ' : ''}누구나 바로 고칠 수 있어요.</span><a class="btn primary" href="#/propose/${d.id}">${ic('pencil')}고치기</a></div>
</article>${split ? paneHtml(pItems) + '</div>' : ''}`, 'home');
    if (split) bindPane(pItems, { q, myKey: (it) => 'file:#/doc/' + d.id + '|' + it.att.name });
    $('#copyLink').addEventListener('click', () => copyText(location.origin + location.pathname + location.search + '#/doc/' + d.id));
    // 문서 인쇄는 옆 칸을 빼고 글만
    $('#printDoc').addEventListener('click', () => { const pm = document.body.classList.contains('pane-mode'); document.body.classList.remove('pane-mode'); document.body.classList.add('doc-print'); window.print(); document.body.classList.remove('doc-print'); if (pm) document.body.classList.add('pane-mode'); });
    $('#reportDoc').addEventListener('click', () => reportDialog(d));
    const body = $('#docBody');
    let marks = [], cur = 0;
    const find = (val, jump) => {
      marks = markText(body, val); cur = 0;
      if (!marks.length && val.trim()) { const v = Search.variants(val.trim())[1]; if (v && /[가-힣a-z]/i.test(v) && !/[ㄱ-ㅣ]/.test(v)) marks = markText(body, v); }   // 한/영 자판을 바꿔 친 경우
      const cnt = $('#findCnt'); if (cnt) cnt.textContent = val.trim() ? (marks.length ? `${marks.length}곳` : '없음') : '';
      if (jump && marks.length) focusMark(marks, 0);
    };
    if (isReg) $('#artSel').addEventListener('change', (e) => { const h = $('#art-' + e.target.value); if (h) h.scrollIntoView({ block: 'start', behavior: 'smooth' }); });
    if ($('#findQ')) {
      const fq = $('#findQ');
      let t; fq.addEventListener('input', () => { clearTimeout(t); t = setTimeout(() => find(fq.value, true), 250); });
      $('#findForm').addEventListener('submit', (e) => { e.preventDefault(); if (!marks.length) return find(fq.value, true); focusMark(marks, ++cur); });
      $('#findPrev').addEventListener('click', () => { if (marks.length) focusMark(marks, --cur); });
    }
    // 검색 결과에서 왔으면 검색어를 칠하고 첫 위치로 이동
    if (q) setTimeout(() => find(q, true), 60);
    if (d.review && d.review.type === 'edit' && d.review.base) {
      const n = markChanged(body, d.review.base.body, d.body);
      const cnt = $('#chgCount'); if (cnt) cnt.textContent = n ? `고친 부분 ${n}곳을 노란색으로 표시했어요.` : '';
    }
  }
  // 승인 전 안내: 새 문서 / 고친 문서(바뀐 제목·분류와 이전 내용 비교)
  function reviewNote(d) {
    const r = d.review; if (!r) return '';
    if (r.type !== 'edit') return `<div class="notice amber review-note">${ic('clock')}<div><b>새로 올라온 문서예요</b><br>관리자가 아직 확인하지 않았어요. 확인하면 이 표시가 사라져요.${r.reason ? `<br><span class="why">올린 까닭: ${esc(r.reason)}</span>` : ''}</div></div>`;
    const b = r.base || {}, ch = [];
    if (b.title != null && b.title !== d.title) ch.push(`제목: ${esc(b.title)} → <b>${esc(d.title)}</b>`);
    if (b.category && b.category !== d.category) ch.push(`분류: ${esc(catOf(b.category).name)} → <b>${esc(catOf(d.category).name)}</b>`);
    return `<div class="notice amber review-note">${ic('pencil')}<div><b>최근에 고친 문서예요</b><br><span id="chgCount"></span> 관리자가 확인하면 표시가 사라져요.${r.reason ? `<br><span class="why">고친 까닭: ${esc(r.reason)}</span>` : ''}${ch.length ? '<br>' + ch.join('<br>') : ''}
      ${b.body != null && b.body !== d.body ? `<details class="revs"><summary>이전 내용과 비교</summary><div class="diff">${diffLines(b.body, d.body)}</div></details>` : ''}</div></div>`;
  }
  function newFile(d, a) {
    if (!d.review || a.kind !== 'file') return false;
    if (d.review.type !== 'edit') return true;
    return !((d.review.base && d.review.base.attachments) || []).some((x) => x.kind === 'file' && x.name === a.name && (x.ver || 1) === (a.ver || 1));
  }

  /* ───────── 신고 ───────── */
  function reportDialog(d) {
    const reasons = ['개인정보가 들어 있어요', '저작권 문제가 있어요', '내용이 틀리거나 오래됐어요', '기타'];
    modal(`<h2>이 문서 신고하기</h2><p>'${esc(d.title)}' 문서를 관리자에게 알려요. 신고한 사람은 기록되지 않아요.</p>
      <form id="rform"><div class="radio-list">${reasons.map((r, k) => `<label><input type="radio" name="reason" value="${esc(r)}" ${k === 2 ? 'checked' : ''}>${esc(r)}</label>`).join('')}</div>
      <label class="field">자세한 내용 <span class="help">선택 사항. 학생·교직원 이름은 적지 말아 주세요.</span><textarea class="textarea" name="note" style="min-height:90px"></textarea></label>
      <div class="form-actions" style="margin-top:16px"><button type="button" class="btn" data-close>취소</button><button class="btn primary">${ic('flag')}신고하기</button></div></form>`,
      (el, close) => {
        $('#rform', el).addEventListener('submit', async (e) => {
          e.preventDefault();
          const fd = new FormData(e.target);
          try { await App.store.report({ docId: d.id, docTitle: d.title, reason: fd.get('reason'), note: String(fd.get('note') || '').slice(0, 500) }); close(true); toast('신고했어요. 관리자가 확인할게요.'); }
          catch (err) { toast(err.message); }
        });
      });
  }

  /* ───────── 새 문서 쓰기·고치기: 학교 코드만 맞으면 바로 반영, 관리자 확인 전까지 '승인 전' 표시 ───────── */
  // 분류 아이콘: 묶음별로 골라 쓴다 (build.mjs 가 icon: '…' 을 찾아 아이콘을 넣는다)
  const CAT_ICONS = [
    { group: '학사·수업', items: [{ icon: 'school', ko: '학사모' }, { icon: 'book-2', ko: '책' }, { icon: 'books', ko: '책들' }, { icon: 'notebook', ko: '공책' }, { icon: 'certificate', ko: '증명서' }, { icon: 'award', ko: '상장' }, { icon: 'trophy', ko: '트로피' }, { icon: 'medal', ko: '메달' }, { icon: 'math-function', ko: '수학' }, { icon: 'language', ko: '언어' }, { icon: 'flask', ko: '과학' }, { icon: 'atom', ko: '원자' }, { icon: 'bulb', ko: '아이디어' }, { icon: 'backpack', ko: '책가방' }] },
    { group: '일정·업무', items: [{ icon: 'calendar-check', ko: '달력' }, { icon: 'calendar-event', ko: '행사 날' }, { icon: 'clock', ko: '시계' }, { icon: 'bell', ko: '종' }, { icon: 'briefcase', ko: '가방' }, { icon: 'id-badge-2', ko: '명찰' }, { icon: 'clipboard-text', ko: '클립보드' }, { icon: 'clipboard-check', ko: '점검' }, { icon: 'checklist', ko: '체크리스트' }, { icon: 'report', ko: '보고서' }, { icon: 'file-text', ko: '문서' }, { icon: 'files', ko: '서류철' }, { icon: 'archive', ko: '보관' }, { icon: 'printer', ko: '인쇄' }, { icon: 'folder', ko: '폴더' }] },
    { group: '소통·사람', items: [{ icon: 'mail', ko: '편지' }, { icon: 'speakerphone', ko: '안내 방송' }, { icon: 'message-circle', ko: '대화' }, { icon: 'phone', ko: '전화' }, { icon: 'users', ko: '사람들' }, { icon: 'users-group', ko: '모둠' }, { icon: 'user-check', ko: '출석' }, { icon: 'heart-handshake', ko: '상담' }, { icon: 'mood-smile', ko: '웃음' }, { icon: 'accessible', ko: '특수교육' }] },
    { group: '건강·안전', items: [{ icon: 'heart', ko: '마음' }, { icon: 'first-aid-kit', ko: '구급상자' }, { icon: 'stethoscope', ko: '보건' }, { icon: 'pill', ko: '약' }, { icon: 'tools-kitchen-2', ko: '급식' }, { icon: 'salad', ko: '영양' }, { icon: 'alert-triangle', ko: '주의' }, { icon: 'shield-lock', ko: '보안' }, { icon: 'lock', ko: '잠금' }, { icon: 'key', ko: '열쇠' }] },
    { group: '체험·활동', items: [{ icon: 'map-2', ko: '지도' }, { icon: 'map-pin', ko: '장소' }, { icon: 'directions', ko: '길 안내' }, { icon: 'bus', ko: '버스' }, { icon: 'car', ko: '자동차' }, { icon: 'plane', ko: '비행기' }, { icon: 'compass', ko: '나침반' }, { icon: 'confetti', ko: '행사' }, { icon: 'music', ko: '음악' }, { icon: 'microphone', ko: '마이크' }, { icon: 'camera', ko: '사진' }, { icon: 'movie', ko: '영상' }, { icon: 'palette', ko: '미술' }, { icon: 'ball-basketball', ko: '농구' }, { icon: 'ball-football', ko: '축구' }, { icon: 'run', ko: '달리기' }, { icon: 'swimming', ko: '수영' }, { icon: 'chess', ko: '체스' }, { icon: 'puzzle', ko: '퍼즐' }, { icon: 'rocket', ko: '로켓' }] },
    { group: '시설·행정', items: [{ icon: 'building', ko: '건물' }, { icon: 'building-community', ko: '마을' }, { icon: 'home', ko: '집' }, { icon: 'door', ko: '문' }, { icon: 'coin', ko: '동전' }, { icon: 'wallet', ko: '지갑' }, { icon: 'receipt', ko: '영수증' }, { icon: 'building-bank', ko: '은행' }, { icon: 'scale', ko: '저울' }, { icon: 'gavel', ko: '규정' }, { icon: 'device-desktop', ko: '컴퓨터' }, { icon: 'device-laptop', ko: '노트북' }, { icon: 'wifi', ko: '와이파이' }, { icon: 'world', ko: '세계' }, { icon: 'box', ko: '상자' }, { icon: 'package', ko: '꾸러미' }, { icon: 'truck', ko: '트럭' }, { icon: 'shirt', ko: '교복' }, { icon: 'leaf', ko: '잎' }, { icon: 'plant-2', ko: '식물' }, { icon: 'recycle', ko: '재활용' }, { icon: 'sun', ko: '해' }, { icon: 'cloud-rain', ko: '비' }] },
  ];
  const CAT_ICON_KO = {}; CAT_ICONS.forEach((g) => g.items.forEach((x) => { CAT_ICON_KO[x.icon] = x.ko; }));
  // 이름·설명을 보고 어울리는 아이콘을 고른다 (아이콘을 고르지 않았을 때)
  const ICON_GUESS = [
    [/급식|식단|영양|조리|간식/, 'tools-kitchen-2'], [/보건|건강|응급|감염|약품|질병/, 'stethoscope'], [/상담|위클래스|정서|마음|고민/, 'heart-handshake'],
    [/출결|출석|결석|지각|조퇴|결과/, 'user-check'], [/시험|고사|평가|성적|채점|수행|문제/, 'clipboard-check'], [/체험|현장|수학여행|견학|소풍|답사/, 'map-2'],
    [/행사|축제|체육대회|발표회|공연|기념/, 'confetti'], [/진로|진학|입시|대입|취업|직업/, 'compass'], [/동아리|방과후|모둠|자치|학생회|봉사/, 'users-group'],
    [/도서|독서|책|국어|문학|글쓰기/, 'books'], [/정보|컴퓨터|코딩|소프트웨어|인공지능|\bai\b|기기|태블릿|크롬북/i, 'device-laptop'], [/안전|재난|소방|대피|사고/, 'alert-triangle'],
    [/보안|개인정보|비밀번호/, 'shield-lock'], [/예산|회계|여비|출장|지출|급여|수당|품의|계약|돈/, 'coin'], [/규정|학칙|규칙|법령|지침/, 'gavel'],
    [/타이머|시간표|시각|시계/, 'clock'], [/일정|학사|달력|캘린더|d-?day|방학/i, 'calendar-check'], [/공문|기안|문서|서류|서식|양식|신청서|보고서/, 'file-text'],
    [/음악|합창|악기|노래/, 'music'], [/미술|디자인|그림|만화/, 'palette'], [/체육|운동|스포츠|달리기|육상/, 'run'], [/과학|실험|탐구|화학|물리|생명/, 'flask'],
    [/수학|계산|통계|그래프|함수/, 'math-function'], [/영어|외국어|언어|번역|일본어|중국어/, 'language'], [/사진|촬영|카메라/, 'camera'], [/영상|동영상|유튜브|방송반/, 'movie'],
    [/사이트|링크|인터넷|홈페이지/, 'world'], [/시설|건물|교실|공간|기숙사/, 'building'], [/교복|복장|용모/, 'shirt'], [/통학|버스|차량|주차/, 'bus'],
    [/환경|재활용|생태|분리수거/, 'recycle'], [/장학|상장|시상|포상|수상/, 'award'], [/졸업|입학|신입생|전학|학적/, 'school'], [/학습지|수업|교과|연수|강의/, 'notebook'],
    [/가정통신문|알림|메일|편지|안내문/, 'mail'], [/방송|공지|홍보/, 'speakerphone'], [/역할|담당|업무 분장/, 'id-badge-2'], [/청소|위생/, 'recycle'], [/자리|좌석|모둠 편성/, 'users-group'],
    [/처음|안내|길잡이|사용법/, 'directions'], [/사람|교직원|명단/, 'users']
  ];
  function guessIcon(text, fallback) { const t = String(text || ''); const hit = ICON_GUESS.find(([re]) => re.test(t)); return hit ? hit[1] : (fallback || 'folder'); }
  // 아이콘 고르기: 묶음별 그림 단추. name 은 폼 이름(라디오), cur 는 지금 아이콘. auto 면 맨 앞에 '자동'(이름을 보고 고름)
  function iconPicker(name, cur, auto) {
    return `<div class="icon-pick" role="radiogroup" aria-label="아이콘 고르기">${auto ? `<label class="ip-auto"><input type="radio" name="${esc(name)}" value=""${!cur ? ' checked' : ''}><span>${ic('sparkles')}자동 <small>이름을 보고 어울리는 아이콘을 골라요</small></span></label>` : ''}${CAT_ICONS.map((g) => `<div class="ip-group"><span class="ip-g">${esc(g.group)}</span><div class="ip-items">${g.items.map((x) => `<label class="ip-item" title="${esc(x.ko)}"><input type="radio" name="${esc(name)}" value="${x.icon}"${x.icon === cur ? ' checked' : ''}><span>${ic(x.icon)}</span><span class="sr-only">${esc(x.ko)}</span></label>`).join('')}</div></div>`).join('')}</div>`;
  }
  /* ───────── 연결 고르기: 문서·서식, 수업·학급 자료, 도구·사이트를 이름으로 찾아 고른다 (주소를 직접 쓰지 않게) ─────────
     고르면 { title, href } (사이트 안은 #/…, 바깥은 https://…) */
  function pickDoc(exclude) {
    let picked = null;
    return modal(`<h2>연결할 것 고르기</h2><p>문서·서식, 수업·학급 자료, 도구·사이트를 이름이나 낱말로 찾아서 누르세요.</p>
      <label class="sr-only" for="pkQ">찾기</label><input class="input" id="pkQ" placeholder="예: 결석, 출장, 지오지브라, 자리 바꾸기" autocomplete="off">
      <div class="pk-list" id="pkList" role="listbox" aria-label="찾은 것"></div>
      <div class="form-actions"><button type="button" class="btn" data-close>닫기</button></div>`, (el, close) => {
      const q = $('#pkQ', el), list = $('#pkList', el);
      let items = [];
      const abs = (u) => (/^(#|https?:)/.test(u) ? u : new URL(u, location.href).href);   // 사이트 안 웹앱 파일 주소는 전체 주소로
      const draw = () => {
        const v = q.value.trim();
        const docs = (v ? byViews(Search.run(App.data.docs, v, (c) => catOf(c).name), v).map((r) => r.doc) : App.data.docs.slice().sort((a, b) => (b.views || 0) - (a.views || 0)))
          .filter((x) => x.id !== exclude).slice(0, v ? 6 : 8)
          .map((x) => ({ g: '문서·서식', title: x.format === 'reg' ? shortTitle(x.title) : x.title, href: '#/doc/' + x.id, icon: catOf(x.category).icon || 'file-text', sub: catOf(x.category).name }));
        const ex = v ? searchExtras(v) : { lres: [], tres: [] };
        const les = ex.lres.slice(0, 4).map((l) => ({ g: '수업·학급 자료', title: l.title, href: lessonHref(l), icon: lessonIcon(l), sub: l.subject === HOMEROOM ? '학급 자료' : [l.subject, l.kind === 'app' ? '웹앱' : '학습지'].filter(Boolean).join(' · ') }));
        const tls = ex.tres.slice(0, 5).map((t) => ({ g: '도구·사이트', title: t.name, href: abs(t.href), icon: t.icon || 'world', sub: t.kind }));
        items = docs.concat(les, tls);
        let last = '';
        list.innerHTML = items.length ? (v ? '' : '<p class="pk-cap">많이 보는 문서 · 수업 자료·도구·사이트도 이름으로 찾을 수 있어요</p>') + items.map((x, i) => {
          const cap = v && x.g !== last ? `<p class="pk-cap">${esc(x.g)}</p>` : ''; last = x.g;
          return `${cap}<button type="button" class="pk-item" role="option" data-i="${i}">${ic(x.icon)}<span><b>${Search.highlight(esc(x.title), v)}</b><small>${esc(x.sub || '')}${/^https?:/.test(x.href) ? ' · 새 창' : ''}</small></span></button>`;
        }).join('') : `<p class="count-line">'${esc(v)}'(으)로 찾지 못했어요. 다른 낱말로 찾아보세요.</p>`;
      };
      q.addEventListener('input', draw); draw();
      list.addEventListener('click', (e) => { const b = e.target.closest('[data-i]'); if (!b) return; const x = items[+b.dataset.i]; picked = { title: x.title, href: x.href }; close(true); });
      q.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); const f = $('[data-i]', list); if (f) f.click(); } });
    }).then(() => picked);
  }
  // 칸 편집기: 글은 그대로, **굵게**는 굵은 글씨로, [이름](주소)는 이름표로 보여 준다. 저장할 때 다시 글 모양(마크다운)으로
  const edLink = (t, u) => `<a class="ed-link" contenteditable="false" data-href="${esc(u)}" href="${esc(u)}" title="누르면 지우기 단추가 보여요">${ic(/^#\/doc\//.test(u) ? 'file-text' : /^#\/l(file|app)\//.test(u) ? 'book' : /^https?:/.test(u) ? 'world' : 'link')}<span>${esc(t)}</span></a>`;
  function mdToEd(s) {
    return esc(String(s || ''))
      .replace(/\[([^\]\n]+)\]\(([^)\s]+)\)/g, (m, t, u) => edLink(t.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"'), u.replace(/&amp;/g, '&')))
      .replace(/\*\*([^*\n]+)\*\*/g, '<b>$1</b>')
      .replace(/\n/g, '<br>');
  }
  function edToMd(root) {
    let out = '';
    const walk = (n, bold) => {
      if (n.nodeType === 3) { const t = n.nodeValue.replace(/\u00a0/g, ' ').replace(/\u200b/g, ''); out += bold && t.trim() ? t.split('\n').map((x) => (x.trim() ? `**${x}**` : x)).join('\n') : t; return; }
      if (n.nodeType !== 1) return;
      const tag = n.tagName;
      if (tag === 'BR') { out += '\n'; return; }
      if (tag === 'A' && n.dataset.href) { out += `[${n.textContent.replace(/[[\]]/g, '').trim()}](${n.dataset.href})`; return; }
      const b = bold || tag === 'B' || tag === 'STRONG' || /^(bold|[6-9]00)$/.test(n.style && n.style.fontWeight);
      const block = tag === 'DIV' || tag === 'P' || tag === 'LI';
      if (block && out && !out.endsWith('\n')) out += '\n';
      n.childNodes.forEach((c) => walk(c, b));
      if (block && !out.endsWith('\n')) out += '\n';
    };
    root.childNodes.forEach((c) => walk(c, false));
    return out.replace(/\*\*\*\*/g, '').replace(/[ \t]+$/gm, '').replace(/\n+$/, '');
  }
  // 칸 편집기 붙이기: Enter 는 줄 바꿈, 붙여 넣기는 글자만, 이름표를 누르면 지우기
  function bindEd(ed) {
    const tidy = () => { if (!ed.textContent.trim() && !ed.querySelector('.ed-link')) ed.innerHTML = ''; };
    ed.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.isComposing) { e.preventDefault(); document.execCommand('insertLineBreak'); }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'b') { e.preventDefault(); document.execCommand('bold'); }
    });
    ed.addEventListener('paste', (e) => { e.preventDefault(); const t = (e.clipboardData || window.clipboardData).getData('text/plain'); document.execCommand('insertText', false, t); });
    ed.addEventListener('drop', (e) => e.preventDefault());
    ed.addEventListener('input', tidy);
    ed.addEventListener('click', async (e) => {
      const a = e.target.closest('.ed-link'); if (!a) return;
      e.preventDefault();
      if (await confirmBox('이 연결을 뺄까요?', `'${a.textContent.trim()}' 연결을 이 칸에서 빼요.`, '빼기')) { a.remove(); tidy(); ed.dispatchEvent(new Event('input')); }
    });
    // 마지막 커서 자리 기억 (단추를 눌러도 그 자리에 넣게)
    document.addEventListener('selectionchange', () => { const s = getSelection(); if (s.rangeCount && ed.contains(s.anchorNode)) ed._range = s.getRangeAt(0).cloneRange(); });
  }
  // 문서 이름표를 커서 자리(없으면 맨 끝 새 줄)에 넣는다
  function insertDocLink(ed, doc, newLine) {
    ed.focus();
    const s = getSelection(); let r = ed._range && ed.contains(ed._range.startContainer) ? ed._range : null;
    if (!r) { r = document.createRange(); r.selectNodeContents(ed); r.collapse(false); if (newLine && ed.textContent.trim()) r.insertNode(document.createElement('br')); r.collapse(false); }
    const tmp = document.createElement('div'); tmp.innerHTML = edLink(doc.title, doc.href) + '\u00a0';
    const frag = document.createDocumentFragment(); let last = null; while (tmp.firstChild) { last = tmp.firstChild; frag.appendChild(last); }
    r.deleteContents(); r.insertNode(frag);
    const after = document.createRange(); after.setStartAfter(last); after.collapse(true); s.removeAllRanges(); s.addRange(after); ed._range = after.cloneRange();
    ed.dispatchEvent(new Event('input'));
  }

  function viewPropose(id, qs) {
    const isNew = id === 'new';
    const d = isNew ? null : docOf(id);
    if (!isNew && !d) return viewDoc(id, qs);
    const wantNewCat = isNew && qs.get('newcat') === '1';
    const firstCat = (App.data.categories.find((c) => c.id !== 'rules') || App.data.categories[0]).id;
    // 못 찾은 검색어에서 왔으면 '이렇게도 찾아요'에 그 말을 미리 넣어 둔다
    const addAlias = !isNew && qs.get('alias') && !(d.aliases || []).includes(qs.get('alias')) ? qs.get('alias') : '';
    const init = isNew ? { title: qs.get('title') || '', category: qs.get('cat') || firstCat, aliases: [], body: '' } : addAlias ? Object.assign({}, d, { aliases: (d.aliases || []).concat(addAlias) }) : d;
    const back = isNew ? (qs.get('cat') ? '#/cat/' + qs.get('cat') : '#/') : '#/doc/' + d.id;
    // 첨부 파일 하나를 새 파일로 바꾸기 (?replace=번호) / 파일만 더 붙이기 (?addfile=1)
    const rep = !isNew && qs.get('replace') != null ? Number(qs.get('replace')) : -1;
    const repAtt = rep >= 0 ? (d.attachments || [])[rep] : null;
    const fileOnly = !!repAtt || (!isNew && qs.get('addfile') === '1');
    setView(`
<div class="narrow">
  <a class="back" href="${back}">${ic('arrow-left')}${isNew ? '돌아가기' : '문서로 돌아가기'}</a>
  <div class="page-head"><h1>${isNew ? '새 문서 쓰기' : repAtt ? '첨부 파일 바꾸기' : '문서 고치기'}</h1></div>
  ${repAtt ? `<div class="notice green replace-box">${ic('upload')}<div><b>'${esc(repAtt.name)}' 을(를) 새 파일로 바꿔요.</b><br>아래 <b>파일 올리기</b>에서 새 파일 하나를 고르고 저장하면 바로 바뀌어요. 관리자가 승인하기 전에는 이전 파일로 되돌릴 수 있어요. 본문은 그대로 둬도 돼요.</div></div>` : ''}
  <div class="notice">${ic('alert-triangle')}<div><b>저장하면 바로 모든 선생님에게 보여요.</b> 관리자가 확인하기 전까지 '승인 전' 표시가 붙고, 고친 부분은 노란색으로 보여요.<br>학생·교직원 이름, 연락처, 성적·출결·상담 내용, 교과서·참고서·유료 자료는 넣지 마세요.</div></div>
  <form class="form" id="pform" novalidate>
    <div class="form-row">
      <label class="field">제목<input class="input" name="title" required maxlength="60" value="${esc(init.title)}"></label>
      <label class="field">분류<select class="select" name="category" id="pcat">${App.data.categories.map((c) => `<option value="${c.id}" ${!wantNewCat && c.id === init.category ? 'selected' : ''}>${esc(c.name)}${c.review ? ' (승인 전)' : ''}</option>`).join('')}<option value="__new" ${wantNewCat ? 'selected' : ''}>+ 새 분류 만들기</option></select></label>
    </div>
    <label class="field" id="newCatBox" ${wantNewCat ? '' : 'hidden'}>새 분류 이름 <span class="help">처음 화면에 칸이 하나 생겨요. 예: 방과후, 진로·진학, 정보 기기</span>
      <input class="input" name="newCategory" maxlength="20" placeholder="분류 이름"></label>
    <div class="field" id="newCatIcon" ${wantNewCat ? '' : 'hidden'}><span>아이콘 <span class="help">처음 화면 분류 칸에 보여요</span></span>${iconPicker('newCatIcon', '', true)}</div>
    <label class="field">이렇게도 찾아요 <span class="help">선생님들이 부르는 다른 이름을 쉼표로 적어 주세요. 검색이 정확해져요. 예: 체험학습, 현장체험, 가족여행</span>
      <input class="input" name="aliases" value="${esc((init.aliases || []).join(', '))}"></label>
    <div class="field">
      <div class="body-head"><span class="lbl">내용</span><span style="flex:1"></span><button type="button" class="btn sm ghost" id="pmode"></button><button type="button" class="btn sm ghost" id="pv">${ic('eye')}미리보기</button></div>
      <div class="guided" id="guided"><div class="g-list" id="gList"></div>
        <div class="g-add"><span>칸 더하기</span><button type="button" class="btn sm" data-gadd="text">${ic('align-left')}글</button><button type="button" class="btn sm" data-gadd="steps">${ic('list-numbers')}순서</button><button type="button" class="btn sm" data-gadd="list">${ic('list')}목록</button></div>
      </div>
      <div class="free" id="freeBox" hidden>
        <div class="md-tools" role="toolbar" aria-label="글 모양"><button type="button" class="btn sm" data-md="h">${ic('heading')}소제목</button><button type="button" class="btn sm" data-md="ol">${ic('list-numbers')}번호 목록</button><button type="button" class="btn sm" data-md="ul">${ic('list')}점 목록</button><button type="button" class="btn sm" data-md="b">${ic('bold')}굵게</button><button type="button" class="btn sm" data-md="doc">${ic('link')}문서·자료 연결</button></div>
        <textarea class="textarea" id="pbody" name="body">${esc(init.body)}</textarea>
        <span class="md-help">위 단추를 누르면 그 모양이 들어가요. 저장하면 보기 좋게 바뀌어요.</span>
      </div>
      <div class="preview-box prose" id="pvbox" hidden></div>
    </div>
    <label class="field${fileOnly ? ' hl' : ''}" id="pfileBox">${repAtt ? '새 파일 올리기' : '파일 올리기'} <span class="help">${repAtt ? `'${esc(repAtt.name)}' 대신 쓸 파일 하나 (한글·PDF·엑셀).` : '한글(hwp·hwpx)·PDF·엑셀(xlsx)·이미지(jpg·png) 파일, 5개까지. 같은 이름의 파일을 올리면 새 판으로 바뀌어요.'} hwpx·PDF·엑셀은 파일 속 글자도 검색돼요 (옛 한글 hwp 는 제목으로만).</span>
      <input class="input" type="file" id="pfile" accept=".pdf,.hwp,.hwpx,.xlsx,.png,.jpg,.jpeg,.gif,.webp" ${repAtt ? '' : 'multiple'}></label>
    ${!isNew && !repAtt && (d.attachments || []).length ? `<div class="field"><span>지금 붙어 있는 파일 <span class="help">잘못 올렸거나 필요 없는 파일은 체크하면 빠져요.</span></span>
      <div class="att-remove">${d.attachments.map((a, k) => `<label><input type="checkbox" name="rmAtt" value="${k}"> ${esc(a.name)} <span class="help">빼기</span></label>`).join('')}</div></div>` : ''}
    ${fileOnly ? '' : `<div class="field"><span>링크 <span class="help">관련 사이트·공문·안내 페이지 주소. 이름을 비우면 사이트 이름으로 보여요.</span></span>
      <div class="link-rows" id="plinks"></div>
      <button type="button" class="btn sm ghost" id="paddLink" style="align-self:flex-start">${ic('plus')}링크 추가</button></div>`}
    <label class="field">무엇을 ${isNew ? '올렸나요' : '바꿨나요'}? <span class="help">선택 사항. 다른 선생님과 관리자가 참고해요.</span>
      <input class="input" name="reason" maxlength="200" placeholder="${isNew ? '예: 새로 생긴 절차예요' : '예: 올해부터 제출 기한이 바뀌었어요'}"></label>
    ${App.needsCode ? `<label class="field">학교 코드 <span class="help">처음 들어올 때 넣은 코드예요.</span>
      <input class="input" name="code" required autocomplete="off" style="max-width:240px" value="${esc(Auth.savedCode())}"></label>` : ''}
    <div id="piiBox"></div>
    <div class="form-actions"><a class="btn" href="${back}">취소</a><button class="btn primary" type="submit">${ic('check')}저장하고 바로 올리기</button></div>
  </form>
</div>`, 'home');
    const form = $('#pform'), body = $('#pbody'), pvbox = $('#pvbox');
    // 내용 쓰기: 기본은 칸 나눠 쓰기. 칸마다 제목 + 내용(글 / 순서: 번호 저절로 / 목록: 점 저절로). ## 같은 기호는 저장할 때 붙인다
    // 표·참고 상자처럼 칸에 안 맞는 글은 자유롭게 쓰기(단추로 모양 넣기)
    const isReg = d && d.format === 'reg';
    const KIND = {
      text: { help: '자유롭게 쓰세요.', ph: '예) 학생이 가족 여행이나 진로 체험으로 학교 밖에서 배우려 할 때 미리 내는 신청이에요.' },
      steps: { help: '한 줄에 한 단계씩 쓰고 Enter. 번호는 저절로 붙어요.', ph: '예)\n체험 3일 전까지 학부모가 신청서를 담임에게 내요\n담임이 확인하고 교감 결재를 받아요\n다녀온 뒤 7일 안에 결과 보고서를 내요' },
      list: { help: '한 줄에 하나씩 쓰세요. 앞에 점이 저절로 붙어요.', ph: '예)\n1년에 20일까지 출석으로 인정돼요\n신청서 서식은 아래 파일에 있어요' },
      docs: { help: '아래 [문서·자료 연결]을 눌러 문서·서식, 수업 자료, 도구·사이트를 이름으로 찾아 고르세요.', ph: '아직 연결한 문서가 없어요' }
    };
    const NEW_BOXES = [{ title: '무엇을 하나요?', kind: 'text', text: '' }, { title: '순서', kind: 'steps', text: '' }, { title: '알아 두면 좋은 것', kind: 'list', text: '', opt: true }, { title: '함께 보면 좋은 안내', kind: 'list', text: '', opt: true, docs: true }];
    let guided = !isReg;
    const gList = $('#gList');
    const lines = (t) => String(t || '').split('\n').map((x) => x.trim()).filter(Boolean);
    const OLx = /^\d+[.)]\s*/, ULx = /^[-*•·]\s*/;
    const grow = (ta) => { ta.style.height = 'auto'; ta.style.height = Math.min(ta.scrollHeight + 2, 560) + 'px'; };
    const renum = () => $$('.g-box', gList).forEach((b, i) => { $('.n', b).textContent = i + 1; });
    const addBox = (bx, focus) => {
      const el = document.createElement('div'); el.className = 'g-box'; el.dataset.kind = bx.kind; if (bx.keep) el.dataset.keep = '1';
      const k = bx.docs ? KIND.docs : KIND[bx.kind];
      el.innerHTML = `<div class="g-t"><span class="n"></span><input class="g-title" maxlength="40" placeholder="${bx.kind === 'text' ? '칸 제목 (없어도 돼요)' : '칸 제목'}" aria-label="칸 제목"><span class="g-kind">${bx.kind === 'steps' ? '순서' : bx.kind === 'list' ? '목록' : '글'}</span>${bx.opt ? '<span class="opt">없으면 비워 두세요</span>' : ''}<button type="button" class="g-del" aria-label="이 칸 지우기" title="이 칸 지우기">${ic('x')}</button></div>
        <span class="help">${k.help}</span><div class="ed g" contenteditable="true" role="textbox" aria-multiline="true" spellcheck="false"></div>
        <div class="g-tools"><button type="button" class="btn sm ghost" data-ed="doc">${ic('link')}문서·자료 연결</button><button type="button" class="btn sm ghost" data-ed="b" title="고른 글자를 굵게 (Ctrl+B)">${ic('bold')}굵게</button></div>`;
      $('.g-title', el).value = bx.title || '';
      const ed = $('.ed', el); ed.dataset.ph = k.ph; ed.setAttribute('aria-label', (bx.title || '칸') + ' 내용'); ed.innerHTML = mdToEd(bx.text || '');
      bindEd(ed);
      $('[data-ed=doc]', el).addEventListener('click', async () => { const doc = await pickDoc(d && d.id); if (doc) insertDocLink(ed, doc, bx.kind !== 'text'); });
      $('[data-ed=b]', el).addEventListener('mousedown', (e) => { e.preventDefault(); if (ed.contains(getSelection().anchorNode) && !getSelection().isCollapsed) document.execCommand('bold'); else toast('굵게 할 글자를 먼저 끌어서 고르세요'); });
      $('.g-del', el).addEventListener('click', async () => {
        if (ed.textContent.trim() && !(await confirmBox('이 칸을 지울까요?', '이 칸에 쓴 내용이 지워져요.', '지우기', true))) return;
        el.remove(); renum();
      });
      gList.appendChild(el); renum();
      if (focus) $('.g-title', el).focus();
    };
    const boxes = () => $$('.g-box', gList).map((el) => ({ title: $('.g-title', el).value.trim(), kind: el.dataset.kind, text: edToMd($('.ed', el)), keep: !!el.dataset.keep }));
    const compose = () => boxes().map((b) => {
      let c;
      if (b.kind === 'steps') c = lines(b.text).map((x) => x.replace(OLx, '').replace(ULx, '')).filter(Boolean).map((x, i) => `${i + 1}. ${x}`).join('\n');
      else if (b.kind === 'list') c = lines(b.text).map((x) => x.replace(ULx, '').replace(OLx, '')).filter(Boolean).map((x) => '- ' + x).join('\n');
      else c = b.text.replace(/\r/g, '').trim();
      if (!c) return b.keep && b.title ? '## ' + b.title : '';   // 원래 글에 있던 제목만 있는 칸은 그대로 둔다
      return (b.title ? '## ' + b.title.replace(/^#+\s*/, '') + '\n' : '') + c;
    }).filter(Boolean).join('\n\n');
    // 이미 쓴 글을 칸으로 나누기. 표·참고 상자·작은 제목처럼 칸에 안 맞으면 null (자유롭게 쓰기로 연다)
    const split = (src) => {
      const t = String(src || '').replace(/\r/g, '').trim();
      if (!t) return NEW_BOXES;
      const parts = t.split(/^##?\s+(.+)$/m), out = [];
      const sec = (title, c) => {
        c = c.trim(); const L = lines(c);
        if (!L.length) return title ? { title, kind: 'text', text: '', keep: true } : null;
        if (L.some((x) => /^(#{1,3}\s|\||>|- \[[ xX]\])/.test(x))) throw new Error('x');
        if (L.every((x) => OLx.test(x) && /^\d+[.)]/.test(x))) return { title, kind: 'steps', text: L.map((x) => x.replace(OLx, '')).join('\n') };
        if (L.every((x) => /^[-*•·]/.test(x))) return { title, kind: 'list', text: L.map((x) => x.replace(ULx, '')).join('\n'), docs: L.every((x) => /^[-*•·]\s*\[[^\]]+\]\((#\/|https?:)/.test(x)) };
        if (L.some((x) => /^\d+[.)]\s/.test(x) || /^[-*•·]\s/.test(x))) throw new Error('x');
        return { title, kind: 'text', text: c };
      };
      try {
        const first = sec('', parts[0]); if (first) out.push(first);
        for (let i = 1; i < parts.length; i += 2) { const b = sec(parts[i].trim(), parts[i + 1] || ''); if (b) out.push(b); }
      } catch (e) { return null; }
      return out.length ? out : NEW_BOXES;
    };
    const fill = (list) => { gList.innerHTML = ''; list.forEach((b) => addBox(b)); };
    const setMode = (g) => {
      guided = g;
      $('#guided').hidden = !g; $('#freeBox').hidden = g; pvbox.hidden = true;
      $('#pv').innerHTML = ic('eye') + '미리보기';
      $('#pmode').innerHTML = g ? `${ic('pencil')}자유롭게 쓰기` : `${ic('layout-list')}칸 나눠 쓰기`;
      $('#pmode').hidden = !!isReg;

    };
    const s0 = isReg ? null : split(init.body);
    if (s0) fill(s0);
    setMode(!!s0);
    $$('[data-gadd]').forEach((b) => b.addEventListener('click', () => addBox({ title: '', kind: b.dataset.gadd, text: '' }, true)));
    $('#pmode').addEventListener('click', () => {
      if (guided) { body.value = compose(); setMode(false); body.focus(); return; }
      const r = split(body.value);
      if (!r) { toast('표나 참고 상자가 있어서 칸으로 나누기 어려워요. 자유롭게 쓰기로 그대로 써 주세요.'); return; }
      fill(r); setMode(true);
    });
    // 칸으로 나눴다 다시 합친 글이 원래와 빈 줄만 다르면 원래 글 그대로 (안 고쳤는데 고친 것으로 남지 않게)
    const norm = (x) => String(x || '').replace(/\r/g, '').replace(/[ \t]+$/gm, '').replace(/^(#+ .*)\n+/gm, '$1\n').replace(/\n{3,}/g, '\n\n').trim();
    const getBody = () => { const c = (guided ? compose() : body.value).replace(/\s+$/, ''); return d && norm(c) === norm(d.body) ? d.body : c; };
    // 자유롭게 쓰기 단추: 줄 앞에 모양을 넣거나, 고른 글을 굵게
    $$('[data-md]').forEach((b) => b.addEventListener('click', async () => {
      const ta = body, v = ta.value, s = ta.selectionStart, e = ta.selectionEnd, k = b.dataset.md;
      if (k === 'doc') { const doc = await pickDoc(d && d.id); if (!doc) return; const ins = `[${doc.title.replace(/[[\]]/g, '')}](${doc.href})`; ta.value = v.slice(0, s) + ins + v.slice(e); ta.setSelectionRange(s + ins.length, s + ins.length); ta.focus(); return; }
      if (k === 'b') { const sel = v.slice(s, e) || '굵게 쓸 말'; ta.value = v.slice(0, s) + '**' + sel + '**' + v.slice(e); ta.setSelectionRange(s + 2, s + 2 + sel.length); }
      else {
        const ls = v.lastIndexOf('\n', s - 1) + 1, le = v.indexOf('\n', e) < 0 ? v.length : v.indexOf('\n', e);
        const block = v.slice(ls, le).split('\n').map((x, i) => { const c = x.replace(/^(#{1,3}\s|\d+[.)]\s*|[-*•·]\s*)/, ''); return (k === 'h' ? '## ' : k === 'ol' ? `${i + 1}. ` : '- ') + c; }).join('\n');
        ta.value = v.slice(0, ls) + block + v.slice(le); ta.setSelectionRange(ls + block.length, ls + block.length);
      }
      ta.focus();
    }));
    // 링크 줄: 이름 + 주소, 지우기
    const linkRow = (l) => { const div = document.createElement('div'); div.className = 'link-row'; div.innerHTML = `<input class="input" data-ln="name" maxlength="40" placeholder="이름 (예: 교육청 안내)" value="${esc((l && l.name) || '')}"><input class="input" data-ln="url" inputmode="url" placeholder="https://" value="${esc((l && l.url) || '')}"><button type="button" class="btn sm ghost" data-ldel aria-label="이 링크 지우기">${ic('x')}</button>`; return div; };
    const plinks = $('#plinks');
    if (plinks) {
      ((init.links || []).length ? init.links : [null]).forEach((l) => plinks.appendChild(linkRow(l)));
      $('#paddLink').addEventListener('click', () => { if ($$('.link-row', plinks).length >= 10) { toast('링크는 10개까지 넣을 수 있어요'); return; } const r = linkRow(); plinks.appendChild(r); $('input', r).focus(); });
      plinks.addEventListener('click', (e) => { const b = e.target.closest('[data-ldel]'); if (!b) return; const row = b.closest('.link-row'); if ($$('.link-row', plinks).length > 1) row.remove(); else $$('input', row).forEach((i) => { i.value = ''; }); });
    }
    const readLinks = () => plinks ? $$('.link-row', plinks).map((r) => {
      let url = $('[data-ln=url]', r).value.trim(), name = $('[data-ln=name]', r).value.trim();
      if (!url) return null; if (!/^https?:\/\//i.test(url)) url = 'https://' + url;
      if (!name) { try { name = new URL(url).hostname.replace(/^www\./, ''); } catch (e) { name = url; } }
      return { name, url };
    }).filter(Boolean) : undefined;
    if (fileOnly) setTimeout(() => $('#pfileBox').scrollIntoView({ block: 'center' }), 50);
    $('#pcat').addEventListener('change', (e) => { $('#newCatBox').hidden = $('#newCatIcon').hidden = e.target.value !== '__new'; if (e.target.value === '__new') form.newCategory.focus(); });
    $('#pv').addEventListener('click', () => {
      const show = pvbox.hidden;
      pvbox.hidden = !show; $('#guided').hidden = !guided || show; $('#freeBox').hidden = guided || show;
      if (show) pvbox.innerHTML = isReg ? regHtml(getBody()) : (md(getBody()) || '<p class="count-line">아직 쓴 내용이 없어요.</p>');
      $('#pv').innerHTML = show ? ic('pencil') + '다시 쓰기' : ic('eye') + '미리보기';
    });
    let allowPII = false;
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const fd = new FormData(form);
      const cat = String(fd.get('category'));
      const s = {
        type: isNew ? 'new' : 'edit', docId: isNew ? null : d.id,
        title: String(fd.get('title') || '').trim(), category: cat === '__new' ? '' : cat,
        newCategory: cat === '__new' ? String(fd.get('newCategory') || '').trim() : '',
        newCategoryIcon: cat === '__new' ? (String(fd.get('newCatIcon') || '') || guessIcon(fd.get('newCategory'), 'folder')) : '',
        aliases: String(fd.get('aliases') || '').split(/[,，]/).map((x) => x.trim()).filter(Boolean).slice(0, 15),
        body: getBody(), reason: String(fd.get('reason') || '').trim(), links: readLinks()
      };
      if (s.links && s.links.some((l) => { try { new URL(l.url); return false; } catch (e) { return true; } })) { toast('링크 주소를 확인해 주세요'); return; }
      const code = String(fd.get('code') || '').trim();
      if (!s.title) { toast('제목을 적어 주세요'); form.title.focus(); return; }
      if (cat === '__new' && !s.newCategory) { toast('새 분류 이름을 적어 주세요'); form.newCategory.focus(); return; }
      const picked = Array.from(($('#pfile') || {}).files || []);
      s.removeAtt = fd.getAll('rmAtt').map(Number);
      if (picked.length > 5) { toast('파일은 한 번에 5개까지 올릴 수 있어요'); return; }
      // 파일 바꾸기 화면이라도 제목·본문·분류 등을 고쳤으면 새 파일 없이 저장된다
      const textChanged = !isNew && (s.title !== d.title || s.body !== d.body || s.category !== d.category || !!s.newCategory || s.aliases.join() !== (d.aliases || []).join() || (s.links !== undefined && JSON.stringify(s.links) !== JSON.stringify(d.links || [])));
      if (fileOnly && !picked.length && !textChanged && !(s.removeAtt || []).length) { toast(repAtt ? '바꿀 새 파일을 골라 주세요. 본문만 고쳐도 저장돼요.' : '붙일 파일을 골라 주세요'); $('#pfile').focus(); return; }
      if (s.body.replace(/[#\-\d.\s]/g, '').length < 10 && !picked.length && !(s.links || []).length) { toast('내용을 조금 더 적어 주세요'); (guided ? $('.ed', gList) || body : body).focus(); return; }
      if (!isNew && !picked.length && !s.removeAtt.length && !s.newCategory && s.title === d.title && s.body === d.body && s.category === d.category && s.aliases.join() === (d.aliases || []).join() && JSON.stringify(s.links || []) === JSON.stringify(d.links || [])) { toast('바뀐 내용이 없어요'); return; }
      if (picked.some((f) => f.size > 20 * 1024 * 1024)) { toast('파일은 하나에 20MB까지 올릴 수 있어요'); return; }
      if (App.needsCode && !code) { toast('학교 코드를 넣어 주세요'); form.code.focus(); return; }
      const found = checkPII([s.title, s.body, s.reason, s.aliases.join(' ')].join('\n'));
      const box = $('#piiBox');
      if (found.length && !(allowPII && !found.some((f) => f.block))) {
        const blocked = found.some((f) => f.block);
        box.innerHTML = `<div class="notice red">${ic('alert-triangle')}<div><b>개인정보로 보이는 내용이 있어요: ${found.map((f) => esc(f.name)).join(', ')}</b><br>${blocked ? '이 내용은 올릴 수 없어요. 지운 뒤 다시 저장해 주세요.' : '지운 뒤 다시 저장해 주세요. 학교 대표 전화처럼 개인정보가 아니라면 아래를 누르세요.'}
          ${blocked ? '' : '<br><button type="button" class="linkbtn" id="piiOk">개인정보가 아니에요. 그대로 올릴게요</button>'}</div></div>`;
        const ok = $('#piiOk'); ok && ok.addEventListener('click', () => { allowPII = true; form.requestSubmit(); });
        box.scrollIntoView({ block: 'center', behavior: 'smooth' });
        return;
      }
      box.innerHTML = '';
      const btn = form.querySelector('button[type=submit]'); btn.disabled = true;
      try {
        if (picked.length) {
          btn.innerHTML = ic('refresh') + '파일 읽는 중…';
          s.files = [];
          for (const f of picked) {
            const buf = await f.arrayBuffer();
            const text = (await GilFiles.extractText(f.name, buf)).slice(0, 200000);
            const pii = checkPII(text.slice(0, 60000));
            if (pii.some((x) => x.block)) throw new Error(`'${f.name}' 안에 주민등록번호로 보이는 내용이 있어 올릴 수 없어요`);
            const fid = await App.store.putFile(f.name, new Blob([buf], { type: f.type }));
            s.files.push({ name: f.name, ftype: GilFiles.typeOf(f.name), fileId: fid, size: f.size, text, pii: pii.map((x) => x.name), replace: repAtt && !s.files.length ? rep : undefined });
          }
        }
        btn.innerHTML = ic('refresh') + '올리는 중…';
        const r = await App.store.saveDoc(s, code);
        App.data = await App.store.load();
        toast(isNew ? '올렸어요. 관리자가 확인하기 전까지 승인 전 표시가 붙어요' : repAtt && picked.length ? '파일을 바꿨어요. 관리자가 확인하기 전까지 승인 전 표시가 붙어요' : '고쳤어요. 고친 부분은 노란색으로 보여요');
        location.hash = '#/doc/' + r.id;
      } catch (err) { toast(err.message); btn.disabled = false; btn.innerHTML = ic('check') + '저장하고 바로 올리기'; }
    });
  }

  /* ───────── 도구 ───────── */
  function toolUrl(t) {
    if (!t.local) return t.url;
    return t.url + (t.url.includes('?') ? '&' : '?') + 'school=' + encodeURIComponent(App.data.school.name);
  }
  function viewTools() {
    const tools = App.data.tools || [];
    setView(`
<div class="page-head" style="display:block"><h1>우리 학교 선생님이 만든 도구</h1><p class="count-line" style="margin-top:6px">필요한 도구를 눌러 바로 쓰세요. 학생 정보를 다루는 도구는 모두 이 기기 안에서만 처리해요.</p></div>
<div class="tool-grid">
  ${tools.map((t) => `<article class="tool">
    <div class="top"><span class="ic">${ic(t.icon || guessIcon(t.name + ' ' + t.desc, 'tools'))}</span><div><h3>${esc(t.name)}${t.review ? ' <span class="badge amber">승인 전</span>' : ''}</h3><span class="maker">${esc(t.maker || '')}</span></div></div>
    <p>${esc(t.desc)}</p>
    <div class="badges"><span class="badge">${ic('users')}${esc(t.target || '전체')}</span>${t.privacy ? `<span class="badge green">${ic('lock')}브라우저 안에서만 처리</span>` : ''}${t.login ? `<span class="badge amber">${ic('key')}로그인 필요</span>` : ''}</div>
    <div class="go"><a class="btn primary" href="${esc(toolUrl(t))}" target="_blank" rel="noopener">${ic('external-link')}열기</a><a class="btn ghost" href="#/tool/${esc(t.id)}">${ic('pencil')}고치기</a>${favBtn({ type: 'tool', id: t.id, title: t.name, href: toolUrl(t), ext: true, icon: t.icon || guessIcon(t.name + ' ' + t.desc, 'tools'), sub: t.maker || '도구' })}</div>
  </article>`).join('')}
  <article class="tool add"><div class="top"><span class="ic">${ic('plus')}</span><div><h3>도구를 만드셨나요?</h3></div></div><p>이름과 주소만 넣으면 바로 이곳에 올라와요. 관리자가 확인하기 전까지 '승인 전' 표시가 붙어요.</p><div class="go"><a class="btn" href="#/tool/new">${ic('plus')}도구 추가하기</a></div></article>
</div>`, 'tools');
  }

  // 도구 더하기·고치기: 누구나. 저장하면 바로 보이고 관리자가 확인하기 전까지 '승인 전'
  function viewToolEdit(id) {
    const isNew = !id || id === 'new';
    const t = isNew ? { target: '전체' } : (App.data.tools || []).find((x) => x.id === id);
    if (!t) return viewTools();
    setView(`
<div class="narrow">
  <a class="back" href="#/tools">${ic('arrow-left')}도구</a>
  <div class="page-head"><h1>${isNew ? '도구 추가하기' : `'${esc(t.name)}' 고치기`}</h1></div>
  <div class="notice">${ic('alert-triangle')}<div><b>저장하면 바로 모든 선생님에게 보여요.</b> 관리자가 확인하기 전까지 '승인 전' 표시가 붙어요.<br>직접 만들었거나 학교에서 써도 되는 도구만 올려 주세요. 학생 개인정보를 받아 가는 도구는 올리지 마세요.</div></div>
  <form class="form" id="tform" novalidate>
    <div class="form-row"><label class="field">이름<input class="input" name="name" required maxlength="30" placeholder="예: 상담 일정 도우미" value="${esc(t.name || '')}"></label>
    <label class="field">쓰는 사람<select class="select" name="target">${['전체', '담임', '교과', '부서'].map((x) => `<option${x === (t.target || '전체') ? ' selected' : ''}>${x}</option>`).join('')}</select></label></div>
    <label class="field">한 줄 설명<input class="input" name="desc" required maxlength="80" placeholder="예: 학생 상담 날짜를 정하고 알림 문자를 만들어 줘요" value="${esc(t.desc || '')}"></label>
    <label class="field">주소 <span class="help">https:// 로 시작하는 웹앱 주소</span><input class="input" name="url" required inputmode="url" placeholder="https://" value="${esc(t.url || '')}"></label>
    <label class="field">만든 곳 <span class="help">이름 대신 부서로 적어 주세요. 예: 연구부 선생님</span><input class="input" name="maker" maxlength="30" value="${esc(t.maker || '')}"></label>
    <div class="field"><span>아이콘</span>${iconPicker('tIcon', t.icon || '', true)}</div>
    <div class="field"><span>이 도구는…</span>
      <label class="chk"><input type="checkbox" name="login"${t.login ? ' checked' : ''}> 로그인이 필요해요 <span class="help">(구글 로그인 등. 길잡이 안 칸 대신 새 창으로 열려요)</span></label>
      <label class="chk"><input type="checkbox" name="privacy"${t.privacy ? ' checked' : ''}> 학생 이름 등을 넣지만 어디로도 보내지 않고 그 기기 안에서만 처리해요</label></div>
    <div class="form-actions"><a class="btn" href="#/tools">취소</a><button class="btn primary">${ic('check')}${isNew ? '추가하기' : '저장하기'}</button></div>
  </form>
</div>`, 'tools');
    $('#tform').addEventListener('submit', async (e) => {
      e.preventDefault();
      const fd = new FormData(e.target);
      let url = String(fd.get('url') || '').trim(); if (url && !/^https?:\/\//i.test(url) && !/^(tools|apps)\//.test(url)) url = 'https://' + url;
      const name = String(fd.get('name') || '').trim(), desc = String(fd.get('desc') || '').trim();
      if (!name) { toast('도구 이름을 적어 주세요'); e.target.name.focus(); return; }
      if (!/^https:\/\//i.test(url) && !/^(tools|apps)\//.test(url)) { toast('주소는 https:// 로 시작해야 해요'); e.target.url.focus(); return; }
      const pii = checkPII([name, desc, fd.get('maker')].join('\n')); if (pii.length) { toast('개인정보로 보이는 내용이 있어요: ' + pii.map((x) => x.name).join(', ')); return; }
      const tool = { id: isNew ? undefined : t.id, icon: String(fd.get('tIcon') || '') || guessIcon(name + ' ' + desc, 'tools'), name, desc, target: fd.get('target'), url, maker: String(fd.get('maker') || '').trim(), privacy: !!fd.get('privacy'), login: !!fd.get('login'), local: /^(tools|apps)\//.test(url) };
      const btn = e.target.querySelector('button.primary'); btn.disabled = true;
      try { await App.store.proposeTool(tool); App.data = await App.store.load(); toast(isNew ? "올렸어요. 관리자가 확인하기 전까지 '승인 전' 표시가 붙어요" : '고쳤어요'); location.hash = '#/tools'; }
      catch (err) { toast(err.message); btn.disabled = false; }
    });
  }

  /* ───────── 관리자 ───────── */
  async function viewAdmin(qs) {
    const token = Auth.adminToken();
    if (!token) return adminLogin();
    let ad;
    try { ad = await App.store.adminData(token); }
    catch (e) { Auth.setAdminToken(''); toast(e.message); return adminLogin(); }
    const pend = ad.docs.filter((d) => d.review && d.status === 'published').sort((a, b) => String(b.review.at).localeCompare(String(a.review.at)));
    const pendCats = (ad.categories || []).filter((c) => c.review);
    const pendTools = (App.data.tools || []).filter((t) => t.review);
    const open = ad.reports.filter((r) => r.status === 'open');
    const hidden = ad.docs.filter((d) => d.status === 'hidden');
    const tab = qs.get('tab') || 'pending';
    // 그사이 문서가 생겨 이제 찾아지는 말은 뺀다
    const misses = Object.entries(ad.misses || {}).filter(([t]) => { const x = searchExtras(t); return !Search.run(App.data.docs, t, (c) => catOf(c).name).length && !x.lres.length && !x.tres.length; })
      .sort((a, b) => b[1].n - a[1].n || String(b[1].last).localeCompare(String(a[1].last)));
    const tabs = [['pending', '승인 대기', pend.length + pendCats.length + pendTools.length], ['reports', '신고', open.length], ['misses', '못 찾은 검색어', misses.length], ['cats', '분류', 0], ['tools', '도구', 0], ['sites', '사이트', Object.values(App.data.siteEdits || {}).filter((x) => x.hidden).length], ['settings', '학교 설정', 0]];
    setView(`
<div class="narrow">
  <div class="page-head"><h1>관리자</h1><span style="flex:1"></span><button class="btn sm ghost" id="logout">${ic('logout')}나가기</button></div>
  <div class="tabs" role="tablist">${tabs.map(([k, n, c]) => `<button role="tab" data-tab="${k}" aria-selected="${k === tab}">${n}${c ? `<span class="badge-count">${c}</span>` : ''}</button>`).join('')}</div>
  <div id="tabBody"></div>
</div>`, 'admin');
    $('#logout').addEventListener('click', () => { Auth.setAdminToken(''); toast('관리자 화면에서 나왔어요'); location.hash = '#/'; });
    $$('[data-tab]').forEach((b) => b.addEventListener('click', () => { location.hash = '#/admin?tab=' + b.dataset.tab; }));
    const tb = $('#tabBody');

    if (tab === 'pending') {
      const fileList = (d) => (d.attachments || []).filter((a) => newFile(d, a));
      tb.innerHTML = `<p class="count-line" style="margin:0 0 16px">선생님들이 올리거나 고친 내용은 이미 모두에게 보이고 있어요. <b>승인</b>하면 '승인 전' 표시가 사라지고, <b>되돌리기</b>하면 새 문서는 내리고 고친 문서는 이전 내용으로 돌아가요.</p>` +
        pendCats.map((c) => `<div class="card" data-kind="cat" data-id="${c.id}">
          <div class="card-head"><span class="badge green">새 분류</span><h3>${esc(c.name)}</h3><span class="date">${fmtDate((c.review || {}).at)}</span></div>
          <p class="reason">이 분류의 문서 ${ad.docs.filter((d) => d.category === c.id && d.status === 'published').length}개. 지우면 문서는 '학교 생활 안내'로 옮겨져요.</p>
          <div class="card-actions"><button class="btn primary" data-ok>${ic('check')}승인</button><button class="btn" data-undo>${ic('trash')}분류 지우기</button></div></div>`).join('') +
        pendTools.map((t) => { const r = t.review, b = r.base || {}; const ch = r.type === 'edit' ? ['name', 'desc', 'url', 'maker'].filter((k) => (b[k] || '') !== (t[k] || '')).map((k) => `${{ name: '이름', desc: '설명', url: '주소', maker: '만든 곳' }[k]}: ${esc(b[k] || '')} → <b>${esc(t[k] || '')}</b>`) : [];
          return `<div class="card" data-kind="tool" data-id="${t.id}">
          <div class="card-head"><span class="badge ${r.type === 'edit' ? 'amber' : 'green'}">${r.type === 'edit' ? '도구 고침' : '새 도구'}</span><h3>${esc(t.name)}</h3><span class="date">${fmtDate(r.at)}</span></div>
          <p class="reason">${esc(t.desc || '')}<br><a href="${esc(toolUrl(t))}" target="_blank" rel="noopener noreferrer">${esc(t.url)}</a>${t.login ? ' · 로그인 필요' : ''}${t.privacy ? ' · 학생 정보는 기기 안에서만(올린 분 확인)' : ''}</p>
          ${ch.length ? `<p class="reason">${ch.join('<br>')}</p>` : ''}
          <div class="card-actions"><button class="btn primary" data-ok>${ic('check')}승인</button><a class="btn" href="${esc(toolUrl(t))}" target="_blank" rel="noopener noreferrer">${ic('external-link')}열어 보기</a><button class="btn" data-undo>${ic('arrow-back-up')}${r.type === 'edit' ? '이전 내용으로 되돌리기' : '빼기'}</button></div></div>`; }).join('') +
        (pend.length || pendTools.length ? pend.map((d) => {
          const r = d.review, b = r.base || {}, changes = [];
          if (r.type === 'edit' && b.title !== d.title) changes.push(`제목: ${esc(b.title)} → <b>${esc(d.title)}</b>`);
          if (r.type === 'edit' && b.category !== d.category) changes.push(`분류: ${esc(catOf(b.category).name)} → <b>${esc(catOf(d.category).name)}</b>`);
          const files = fileList(d);
          return `<div class="card" data-kind="doc" data-id="${d.id}">
          <div class="card-head"><span class="badge ${r.type === 'edit' ? 'amber' : 'green'}">${r.type === 'edit' ? '고침' : '새 문서'}</span><h3>${esc(d.title)}</h3><span class="date">${fmtDate(r.at)}</span></div>
          ${r.reason ? `<p class="reason"><b>${r.type === 'edit' ? '고친 까닭' : '올린 까닭'}</b> ${esc(r.reason)}</p>` : ''}
          ${files.length ? `<p class="reason"><b>올린 파일</b> ${files.map((f) => `${esc(f.name)}${f.size ? ` (${Math.max(1, Math.round(f.size / 1024))}KB)` : ''}`).join(', ')}</p>` : ''}
          ${changes.length ? `<p class="reason">${changes.join('<br>')}</p>` : ''}
          ${r.type === 'edit' ? (b.body !== d.body ? `<div class="diff">${diffLines(b.body, d.body)}</div>` : '<p class="reason">본문은 그대로예요.</p>') : `<div class="preview-box prose">${md(d.body)}</div>`}
          <div class="card-actions"><button class="btn primary" data-ok>${ic('check')}승인</button><a class="btn" href="#/doc/${d.id}">${ic('eye')}문서 보기</a><button class="btn" data-undo>${ic('arrow-back-up')}${r.type === 'edit' ? '이전 내용으로 되돌리기' : '내리기'}</button></div>
        </div>`;
        }).join('') : (pendCats.length ? '' : `<div class="empty"><div class="ic">${ic('circle-check')}</div><h2>확인할 것이 없어요</h2><p>선생님들이 문서를 올리거나 고치면 여기에 모여요.</p></div>`));
      $$('[data-kind]', tb).forEach((card) => {
        const kind = card.dataset.kind, id = card.dataset.id;
        $('[data-ok]', card).addEventListener('click', async () => {
          try { await App.store.review(Auth.adminToken(), kind, id, true); App.data = await App.store.load(); toast('승인했어요. 승인 전 표시가 사라졌어요.'); route(); } catch (e) { toast(e.message); }
        });
        $('[data-undo]', card).addEventListener('click', async () => {
          const isEdit = kind === 'doc' ? (ad.docs.find((x) => x.id === id) || {}).review?.type === 'edit' : kind === 'tool' && (pendTools.find((x) => x.id === id) || {}).review?.type === 'edit';
          const msg = kind === 'tool' && !isEdit ? ['도구를 뺄까요?', '도구 목록에서 빠져요.', '빼기'] : kind === 'cat' ? ['분류를 지울까요?', "이 분류는 처음 화면에서 사라지고 안의 문서는 '학교 생활 안내'로 옮겨져요.", '지우기']
            : isEdit ? ['이전 내용으로 되돌릴까요?', '마지막으로 승인한 내용으로 돌아가요. 이번에 고친 내용은 사라져요.', '되돌리기'] : ['문서를 내릴까요?', '선생님들에게 보이지 않게 돼요. 신고 탭의 숨긴 문서에서 다시 공개할 수 있어요.', '내리기'];
          if (!(await confirmBox(msg[0], msg[1], msg[2], true))) return;
          try { await App.store.review(Auth.adminToken(), kind, id, false); App.data = await App.store.load(); toast('처리했어요'); route(); } catch (e) { toast(e.message); }
        });
      });
    }

    if (tab === 'reports') {
      tb.innerHTML = (open.length ? open.map((r) => {
        const d = ad.docs.find((x) => x.id === r.docId);
        return `<div class="card" data-rid="${r.id}">
          <div class="card-head"><span class="badge red">${ic('flag')}${esc(r.reason)}</span><h3>${esc(d ? d.title : r.docTitle || '지워진 문서')}</h3><span class="date">${fmtDate(r.createdAt)}</span></div>
          ${r.note ? `<p class="reason">${esc(r.note)}</p>` : ''}
          <div class="card-actions">${d ? `<a class="btn" href="#/doc/${d.id}">${ic('eye')}문서 보기</a><a class="btn" href="#/propose/${d.id}">${ic('pencil')}고치기</a>` : ''}
            <button class="btn" data-act="keep">${ic('check')}문제없음</button><button class="btn danger" data-act="hide">${ic('eye')}문서 숨기기</button></div></div>`;
      }).join('') : `<div class="empty"><div class="ic">${ic('circle-check')}</div><h2>새 신고가 없어요</h2><p>문서마다 있는 '신고' 버튼으로 들어온 내용이 여기에 모여요.</p></div>`) +
        (hidden.length ? `<h2 class="section-title" style="margin-top:32px">숨긴 문서</h2>${hidden.map((d) => `<div class="attach-item" style="margin-bottom:8px"><span class="ic">${ic('lock')}</span><span class="nm">${esc(d.title)}</span><span class="acts"><button class="btn sm" data-restore="${d.id}">다시 공개</button></span></div>`).join('')}` : '');
      $$('[data-rid]', tb).forEach((card) => $$('[data-act]', card).forEach((b) => b.addEventListener('click', async () => {
        if (b.dataset.act === 'hide' && !(await confirmBox('문서를 숨길까요?', '숨긴 문서는 선생님들에게 보이지 않아요. 언제든 다시 공개할 수 있어요.', '숨기기'))) return;
        try { await App.store.resolveReport(Auth.adminToken(), card.dataset.rid, b.dataset.act); App.data = await App.store.load(); toast(b.dataset.act === 'hide' ? '문서를 숨겼어요' : '신고를 처리했어요'); route(); } catch (e) { toast(e.message); }
      })));
      $$('[data-restore]', tb).forEach((b) => b.addEventListener('click', async () => {
        try { await App.store.restoreDoc(Auth.adminToken(), b.dataset.restore); App.data = await App.store.load(); toast('다시 공개했어요'); route(); } catch (e) { toast(e.message); }
      }));
    }

    if (tab === 'misses') {
      tb.innerHTML = `<p class="count-line" style="margin:0 0 16px">선생님들이 찾았는데 아무것도 안 나온 말이에요. 많이 찾은 말부터 <b>문서를 쓰거나</b>, 이미 있는 문서를 다르게 부른 말이면 <b>이름 더하기</b>를 눌러 주세요. 그러면 다음부터 찾아지고 여기서 저절로 빠져요.</p>` +
        (misses.length ? `<div class="miss-list">${misses.map(([t, v]) => `<div class="miss-row" data-term="${esc(t)}"><div class="miss-t"><b>${esc(t)}</b><span>${v.n}번 · 마지막 ${fmtDate(v.last)}</span></div>
          <div class="miss-acts"><a class="btn sm" href="#/propose/new?title=${encodeURIComponent(t)}">${ic('file-plus')}문서 쓰기</a><button class="btn sm" data-miss="alias">${ic('link')}이름 더하기</button><button class="btn sm ghost" data-miss="del" aria-label="${esc(t)} 빼기">${ic('x')}빼기</button></div></div>`).join('')}</div>
        <div class="form-actions" style="margin-top:14px"><button class="btn ghost" id="missAll">${ic('trash')}모두 비우기</button></div>` : `<div class="empty"><div class="ic">${ic('circle-check')}</div><h2>못 찾은 검색어가 없어요</h2><p>선생님이 찾았는데 아무것도 안 나온 말이 생기면 여기에 모여요.</p></div>`) +
        `<p class="count-line" style="margin-top:18px">${ic('shield-lock')} 누가 찾았는지는 남기지 않아요. 사람 이름·연락처처럼 보이는 말은 저장하지 않고, 180일이 지나면 저절로 지워져요. 그래도 이름 같은 말이 보이면 <b>빼기</b>를 눌러 주세요.</p>`;
      $$('.miss-row', tb).forEach((row) => {
        const term = row.dataset.term;
        $('[data-miss=alias]', row).addEventListener('click', async () => {
          const doc = await pickDoc(); if (!doc) return;
          const m = /^#\/doc\/([^?]+)/.exec(doc.href || '');
          if (!m) return toast('문서를 골라 주세요. 수업 자료·도구에는 이름을 더할 수 없어요');
          location.hash = `#/propose/${m[1]}?alias=${encodeURIComponent(term)}`;
        });
        $('[data-miss=del]', row).addEventListener('click', async () => {
          try { await App.store.missDel(Auth.adminToken(), term); toast('목록에서 뺐어요'); route(); } catch (e) { toast(e.message); }
        });
      });
      const allBtn = $('#missAll', tb);
      if (allBtn) allBtn.addEventListener('click', async () => {
        if (!(await confirmBox('모두 비울까요?', '지금까지 모인 못 찾은 검색어가 모두 지워져요.', '비우기', true))) return;
        try { await App.store.missDel(Auth.adminToken(), '', true); toast('비웠어요'); route(); } catch (e) { toast(e.message); }
      });
    }

    if (tab === 'cats') {
      let list = App.data.categories.map((c) => ({ id: c.id, name: c.name, icon: c.icon || 'folder' }));
      let openIp = -1;   // 아이콘 고르기를 펼친 줄
      const count = (id) => App.data.docs.filter((d) => d.category === id).length;
      const draw = () => {
        tb.innerHTML = `<p class="count-line" style="margin:0 0 14px">처음 화면에 보이는 분류예요. 이름·아이콘·순서를 바꾸고 <b>저장</b>을 누르세요. 분류를 지우면 안의 문서는 '학교 생활 안내'로 옮겨져요.</p>
        <div class="cat-admin">${list.map((c, k) => `<div class="cat-row" data-k="${k}">
          <button type="button" class="ic ic-btn" data-ipk="${k}" title="아이콘 바꾸기" aria-label="아이콘 바꾸기 (지금: ${esc(CAT_ICON_KO[c.icon] || c.icon)})" aria-expanded="${openIp === k}">${ic(c.icon)}</button>
          <input class="input" data-f="name" value="${esc(c.name)}" maxlength="20" aria-label="분류 이름">
          <span class="n">문서 ${count(c.id)}</span>
          <button class="btn sm ghost" data-mv="-1" ${k ? '' : 'disabled'} aria-label="위로">${ic('chevron-up')}</button>
          <button class="btn sm ghost" data-mv="1" ${k < list.length - 1 ? '' : 'disabled'} aria-label="아래로">${ic('chevron-down')}</button>
          ${c.id === 'rules' || c.id === 'guide' ? '<span class="btn sm ghost" style="visibility:hidden">지우기</span>' : `<button class="btn sm ghost danger" data-del>${ic('trash')}지우기</button>`}
          ${openIp === k ? `<div class="cat-ip">${iconPicker('ip' + k, c.icon)}</div>` : ''}
        </div>`).join('')}</div>
        <div class="form-actions" style="margin-top:14px"><button class="btn primary" id="catSave">${ic('check')}저장</button></div>`;
        $$('.cat-row', tb).forEach((row) => {
          const k = +row.dataset.k;
          $$('[data-f]', row).forEach((el) => el.addEventListener('input', () => { list[k][el.dataset.f] = el.value; if (el.dataset.f === 'icon') draw(); }));
          $$('[data-mv]', row).forEach((b) => b.addEventListener('click', () => { const j = k + Number(b.dataset.mv); [list[k], list[j]] = [list[j], list[k]]; draw(); }));
          $('[data-ipk]', row).addEventListener('click', () => { openIp = openIp === k ? -1 : k; draw(); });
          $$('.cat-ip input[type=radio]', row).forEach((r) => r.addEventListener('change', () => { list[k].icon = r.value; openIp = -1; draw(); }));
          const del = $('[data-del]', row); del && del.addEventListener('click', async () => {
            if (!(await confirmBox(`'${list[k].name}' 분류를 지울까요?`, `안의 문서 ${count(list[k].id)}개는 '학교 생활 안내'로 옮겨져요. 저장을 눌러야 반영돼요.`, '지우기', true))) return;
            list = list.filter((x, i) => i !== k); draw();
          });
        });
        $('#catSave').addEventListener('click', async () => {
          if (list.some((c) => !String(c.name).trim())) { toast('분류 이름을 적어 주세요'); return; }
          try { await App.store.saveCats(Auth.adminToken(), list.map((c, i) => ({ id: c.id, name: String(c.name).trim(), icon: c.icon, order: i + 1 }))); App.data = await App.store.load(); toast('분류를 저장했어요'); route(); } catch (e) { toast(e.message); }
        });
      };
      draw();
    }

    if (tab === 'tools') {
      const tools = App.data.tools || [];
      tb.innerHTML = `${tools.map((t) => `<div class="attach-item" style="margin-bottom:8px"><span class="ic">${ic(t.icon || 'tools')}</span><span class="nm">${esc(t.name)}<br><span class="maker" style="font-weight:400;font-size:13px;color:var(--faint)">${esc(t.url)}</span></span><span class="acts"><button class="btn sm ghost" data-edit="${t.id}">${ic('pencil')}고치기</button><button class="btn sm ghost danger" data-del="${t.id}" aria-label="${esc(t.name)} 빼기">${ic('trash')}</button></span></div>`).join('')}
        <div class="card" style="margin-top:20px" id="tcard"><h3 style="margin:0 0 14px;font-size:17px" id="ttitle">도구 추가</h3>
        <form class="form" id="tform"><input type="hidden" name="id">
          <div class="form-row"><label class="field">이름<input class="input" name="name" required maxlength="30" placeholder="예: 상담 일정 도우미"></label>
          <label class="field">쓰는 사람<select class="select" name="target"><option>전체</option><option>담임</option><option>교과</option><option>부서</option></select></label></div>
          <label class="field">한 줄 설명<input class="input" name="desc" required maxlength="80"></label>
          <label class="field">주소 <span class="help">https:// 로 시작하는 웹앱 주소</span><input class="input" name="url" required placeholder="https://"></label>
          <label class="field">만든 곳 <span class="help">이름 대신 부서로 적어 주세요. 예: 연구부 선생님</span><input class="input" name="maker" maxlength="30"></label>
          <div class="field"><span>아이콘</span><div id="tIconBox">${iconPicker('tIcon', '', true)}</div></div>
          <label style="display:flex;gap:8px;align-items:flex-start;font-size:15px"><input type="checkbox" name="privacy" style="width:18px;height:18px;margin-top:4px;accent-color:var(--accent)"> 학생 정보를 다루지만 서버로 보내지 않고 브라우저 안에서만 처리해요 (코드로 확인했어요)</label>
          <label style="display:flex;gap:8px;align-items:center;font-size:15px"><input type="checkbox" name="login" style="width:18px;height:18px;accent-color:var(--accent)"> 로그인이 필요해요</label>
          <div class="form-actions"><button class="btn primary">${ic('plus')}추가하기</button></div>
        </form></div>`;
      $$('[data-del]', tb).forEach((b) => b.addEventListener('click', async () => {
        if (!(await confirmBox('도구를 뺄까요?', '도구 목록에서만 빠지고 도구 자체는 그대로예요.', '빼기'))) return;
        try { await App.store.deleteTool(Auth.adminToken(), b.dataset.del); App.data = await App.store.load(); toast('뺐어요'); route(); } catch (e) { toast(e.message); }
      }));
      $$('[data-edit]', tb).forEach((b) => b.addEventListener('click', () => {
        const t = tools.find((x) => x.id === b.dataset.edit); const f = $('#tform');
        f.id.value = t.id; f.name.value = t.name || ''; f.target.value = t.target || '전체'; f.desc.value = t.desc || ''; f.url.value = t.url || ''; f.maker.value = t.maker || '';
        f.privacy.checked = !!t.privacy; f.login.checked = !!t.login;
        $('#tIconBox').innerHTML = iconPicker('tIcon', t.icon || '', true);
        $('#ttitle').textContent = `'${t.name}' 고치기`; f.querySelector('button.primary').innerHTML = ic('check') + '저장';
        $('#tcard').scrollIntoView({ block: 'center', behavior: 'smooth' });
      }));
      $('#tform').addEventListener('submit', async (e) => {
        e.preventDefault();
        const fd = new FormData(e.target);
        const url = String(fd.get('url') || '').trim();
        if (!/^https:\/\//i.test(url) && !/^(tools|apps)\//.test(url)) { toast('주소는 https:// 로 시작해야 해요'); return; }
        const old = tools.find((x) => x.id === fd.get('id'));
        const pickedIcon = String(fd.get('tIcon') || '');
        const tool = { id: fd.get('id') || undefined, icon: pickedIcon || guessIcon(fd.get('name') + ' ' + fd.get('desc'), 'tools'), name: String(fd.get('name')).trim(), desc: String(fd.get('desc')).trim(), target: fd.get('target'), url, maker: String(fd.get('maker') || '').trim(), privacy: !!fd.get('privacy'), login: !!fd.get('login'), local: /^(tools|apps)\//.test(url) };
        try { await App.store.saveTool(Auth.adminToken(), tool); App.data = await App.store.load(); toast(old ? '저장했어요' : '도구를 추가했어요'); route(); } catch (err) { toast(err.message); }
      });
    }

    if (tab === 'sites') {
      const E = App.data.siteEdits || {};
      const def = {}; (window.SUBJECT_SITES || []).forEach((g) => g.items.forEach((x) => { def[siteKey(g.group, x)] = Object.assign({ group: g.group }, x); }));
      const nameOf = (k) => (E[k] && E[k].name) || (def[k] && def[k].name) || k;
      const groupOfK = (k) => (E[k] && E[k].group) || (def[k] && def[k].group) || '';
      const hidden = Object.keys(E).filter((k) => E[k].hidden);
      const edited = Object.keys(E).filter((k) => !E[k].hidden && k.startsWith('d:'));
      const added = Object.keys(E).filter((k) => !E[k].hidden && !k.startsWith('d:'));
      const row = (k, acts) => `<div class="attach-item" style="margin-bottom:8px"><span class="ic">${ic('world')}</span><span class="nm">${esc(nameOf(k))}<br><span class="maker" style="font-weight:400;font-size:13px;color:var(--faint)">${esc(groupOfK(k))}</span></span><span class="acts">${acts}</span></div>`;
      const sec = (t, d, list, acts) => `<h3 class="section-title" style="font-size:17px;margin:22px 0 6px">${t} <span class="badge">${list.length}</span></h3><p class="count-line" style="margin:0 0 10px">${d}</p>${list.length ? list.map((k) => row(k, acts(k))).join('') : '<p class="count-line" style="margin:0">없어요.</p>'}`;
      tb.innerHTML = `<p class="count-line" style="margin:0 0 6px">선생님들이 '유용한 사이트'에서 바꾼 것을 모아 봐요. 사이트는 누구나 바로 고칠 수 있고, 여기서 되돌릴 수 있어요.</p>`
        + sec('목록에서 뺀 사이트', '다시 보이기를 누르면 빼기 전 모습으로 돌아와요.', hidden, (k) => `<button class="btn sm" data-show="${esc(k)}">${ic('eye')}다시 보이기</button>`)
        + sec('고친 기본 사이트', '원래대로를 누르면 처음 넣어 둔 이름·주소·설명으로 돌아가요.', edited, (k) => `<a class="btn sm ghost" href="#/site/${encodeURIComponent(k)}">${ic('pencil')}보기</a><button class="btn sm" data-reset="${esc(k)}">${ic('arrow-back-up')}원래대로</button>`)
        + sec('선생님이 추가한 사이트', '고치거나 뺄 수 있어요.', added, (k) => `<a class="btn sm ghost" href="#/site/${encodeURIComponent(k)}">${ic('pencil')}고치기</a>`);
      const act = async (k, mode, msg) => { try { await App.store.restoreSite(Auth.adminToken(), k, mode); App.data = await App.store.load(); toast(msg); route(); } catch (e) { toast(e.message); } };
      $$('[data-show]', tb).forEach((b) => b.addEventListener('click', () => act(b.dataset.show, 'show', '다시 보이게 했어요')));
      $$('[data-reset]', tb).forEach((b) => b.addEventListener('click', async () => { if (await confirmBox('원래대로 돌릴까요?', '선생님이 고친 이름·주소·설명이 처음 내용으로 돌아가요.', '원래대로')) act(b.dataset.reset, 'reset', '원래대로 돌렸어요'); }));
    }

    if (tab === 'settings') {
      tb.innerHTML = `<div class="settings-grid">
        <div class="card"><h3 style="margin:0 0 14px;font-size:17px">학교 정보</h3>
          <form class="form" id="sform2">
            <label class="field">학교 이름<input class="input" name="schoolName" value="${esc(ad.settings.schoolName)}" required maxlength="30"></label>
${App.needsCode ? `            <label class="field">학교 접속 코드 <span class="help">선생님들이 처음 들어올 때 넣는 코드예요. 바꾸면 모두 새 코드로 다시 들어와야 해요.</span><input class="input" name="accessCode" value="${esc(ad.settings.accessCode || '')}" maxlength="30"></label>` : ''}
            <label class="field">새 관리자 비밀번호 <span class="help">바꿀 때만 적어 주세요. 8자 이상.</span><input class="input" type="password" name="adminPassword" autocomplete="new-password"></label>
            <div class="form-actions"><button class="btn primary">${ic('check')}저장</button></div>
          </form></div>
        <div class="card"><h3 style="margin:0 0 6px;font-size:17px">수업 탭 교과</h3><p class="count-line" style="margin:0 0 12px">쉼표로 구분해 적어요. 순서대로 수업 탭에 보여요.</p>
          <form class="form" id="subjForm"><input class="input" name="subjects" value="${esc((App.data.subjects || []).join(', '))}"><div class="form-actions"><button class="btn primary">${ic('check')}저장</button></div></form></div>
        <div class="card"><h3 style="margin:0 0 6px;font-size:17px">학급 탭 기본 도구</h3><p class="count-line" style="margin:0 0 12px">체크한 도구만 학급 탭에 보여요. 선생님들이 올린 학급 웹앱은 학급 탭에서 각자 고치거나 내려요.</p>
          <form class="form" id="ctForm">${((window.DEMO_DATA || {}).classTools || []).map((t) => `<label style="display:flex;gap:8px;align-items:center;font-size:15px"><input type="checkbox" name="ct" value="${esc(t.id)}" ${(ad.settings.hiddenClassTools || []).includes(t.id) ? '' : 'checked'} style="width:18px;height:18px;accent-color:var(--accent)"> ${esc(t.name)}</label>`).join('')}
          <div class="form-actions"><button class="btn primary">${ic('check')}저장</button></div></form></div>
        <div class="card"><h3 style="margin:0 0 6px;font-size:17px">자료 내보내기</h3><p class="count-line" style="margin:0 0 14px">학교 자료 전체를 파일 하나(JSON)로 받아요. 백업하거나 다른 저장소로 옮길 때 써요.</p><button class="btn" id="exportBtn">${ic('download')}전체 내보내기</button></div>
        ${App.mode !== 'demo' && ((window.DEMO_DATA || {}).docs || []).length ? `<div class="card"><h3 style="margin:0 0 6px;font-size:17px">기본 자료 넣기</h3><p class="count-line" style="margin:0 0 14px">안내 문서 ${(window.DEMO_DATA.docs || []).length}개, ${(window.GIL_CONFIG || {}).fresh ? '' : `규정집 ${(window.DEMO_RULES || []).length}개, `}수업 자료 ${(window.DEMO_DATA.lessons || []).length}개 가운데 저장소에 아직 없는 것만 넣어요. 선생님들이 고친 문서는 그대로 둬요.</p>
          <button class="btn primary" id="seedBtn">${ic('download')}기본 자료 넣기</button> <span class="count-line" id="seedMsg"></span></div>` : ''}
        <div class="card"><h3 style="margin:0 0 6px;font-size:17px">자료 가져오기</h3><p class="count-line" style="margin:0 0 14px">규정집처럼 미리 정리한 파일(.json)을 한 번에 넣어요. 같은 문서는 새 내용으로 바뀌어요.</p>
          <label class="btn" style="cursor:pointer">${ic('upload')}파일 고르기<input type="file" id="importFile" accept=".json,application/json" hidden></label> <span class="count-line" id="importMsg"></span></div>
        <div class="card"><h3 style="margin:0 0 10px;font-size:17px">연결 상태</h3>
          <dl class="kv"><dt>저장 방식</dt><dd>${App.mode === 'demo' ? '시연 모드 (이 브라우저 안)' : String(App.store.api || '').charAt(0) === '/' ? 'Cloudflare (학교 계정)' : '학교 구글 시트'}</dd>
          ${App.mode !== 'demo' ? `<dt>저장소 주소</dt><dd>${esc(App.store.api)}</dd>` : ''}
          <dt>공유 주소</dt><dd>${App.mode !== 'demo' ? `<button class="btn sm" id="shareBtn">${ic('qrcode')}주소·QR 보기</button>` : '학교를 개설하면 생겨요'}</dd></dl>
          ${App.mode !== 'demo' ? `<div class="card-actions"><button class="btn danger" id="disconnect">${ic('logout')}이 기기에서 연결 해제</button></div>` : ''}</div>
      </div>`;
      $('#sform2').addEventListener('submit', async (e) => {
        e.preventDefault();
        const fd = new FormData(e.target);
        const s = { schoolName: String(fd.get('schoolName')).trim(), accessCode: String(fd.get('accessCode') || '').trim() };
        const pw = String(fd.get('adminPassword') || '');
        if (pw) { if (pw.length < 8) { toast('비밀번호는 8자 이상으로 해 주세요'); return; } s.adminPassword = pw; }
        try {
          await App.store.saveSettings(Auth.adminToken(), s);
          if (s.accessCode && App.store.setCode) { App.store.setCode(s.accessCode); Auth.remember(s.accessCode); }
          App.data = await App.store.load(); shell(); route(); toast('저장했어요');
        } catch (err) { toast(err.message); }
      });
      $('#subjForm').addEventListener('submit', async (e) => {
        e.preventDefault();
        const list = String(new FormData(e.target).get('subjects') || '').split(/[,，]/).map((x) => x.trim()).filter(Boolean).slice(0, 30);
        if (!list.length) { toast('교과를 하나 이상 적어 주세요'); return; }
        try { await App.store.saveSettings(Auth.adminToken(), { subjects: list }); App.data = await App.store.load(); toast('교과 목록을 저장했어요'); } catch (err) { toast(err.message); }
      });
      $('#ctForm').addEventListener('submit', async (e) => {
        e.preventDefault();
        const on = new FormData(e.target).getAll('ct');
        const hidden = ((window.DEMO_DATA || {}).classTools || []).map((t) => t.id).filter((id) => !on.includes(id));
        try { await App.store.saveSettings(Auth.adminToken(), { hiddenClassTools: hidden }); App.data = await App.store.load(); toast('학급 탭 도구를 저장했어요'); } catch (err) { toast(err.message); }
      });
      $('#importFile').addEventListener('change', async (e) => {
        const f = e.target.files && e.target.files[0]; if (!f) return;
        const msg = $('#importMsg'); msg.textContent = '읽는 중…';
        try {
          const data = JSON.parse(await f.text());
          const n = (data.docs || []).length;
          if (!(await confirmBox('자료를 가져올까요?', `문서 ${n}개를 넣어요. id 가 같은 문서는 파일 내용으로 바뀌어요.`, '가져오기'))) { msg.textContent = ''; return; }
          msg.textContent = '넣는 중…';
          const r = await App.store.importDocs(Auth.adminToken(), data);
          App.data = await App.store.load();
          msg.textContent = `새 문서 ${r.added}개, 바뀐 문서 ${r.updated}개`;
          toast('가져왔어요');
        } catch (err) { msg.textContent = ''; toast(err instanceof SyntaxError ? 'JSON 파일을 읽지 못했어요' : err.message); }
        e.target.value = '';
      });
      $('#exportBtn').addEventListener('click', async () => {
        try { const all = await App.store.exportAll(Auth.adminToken()); download(`길잡이_${all.school.name}_${new Date().toISOString().slice(0, 10)}.json`, JSON.stringify(all, null, 2), 'application/json'); }
        catch (e) { toast(e.message); }
      });
      const seed = $('#seedBtn'); seed && seed.addEventListener('click', async () => {
        const m = $('#seedMsg'); seed.disabled = true;
        try {
          const n = await importDefaults(Auth.adminToken(), (k, t) => { m.textContent = `넣는 중… ${k}/${t}`; }, (window.GIL_CONFIG || {}).fresh ? { rules: false, name: App.data.school.name } : null);
          App.data = await App.store.load(); m.textContent = `새로 넣은 자료 ${n}개`; toast('기본 자료를 넣었어요');
        } catch (err) { m.textContent = ''; toast(err.message); }
        seed.disabled = false;
      });
      const sb = $('#shareBtn'); sb && sb.addEventListener('click', () => shareDialog(Conn.shareUrl(App.store.api)));
      const dc = $('#disconnect'); dc && dc.addEventListener('click', async () => {
        if (!(await confirmBox('이 기기에서 연결을 해제할까요?', '학교 자료는 그대로 남아요. 다시 들어오려면 공유 주소가 필요해요.', '해제하기', true))) return;
        Conn.forget(); Auth.setAdminToken(''); location.href = location.href.split('?')[0].split('#')[0];
      });
    }
  }
  function adminLogin() {
    setView(`<div class="login card">
      <div class="ic">${ic('shield-lock')}</div><h1>관리자 확인</h1>
      <p>올라온 문서 승인, 신고 처리, 도구·학교 설정을 할 수 있어요.${App.mode === 'demo' ? '<br><b>시연용 비밀번호: admin2026</b>' : ''}</p>
      <form class="form" id="lform"><label class="field">관리자 비밀번호<input class="input" type="password" name="pw" required autocomplete="current-password"></label>
      <div id="lerr"></div><button class="btn primary" style="width:100%">${ic('lock')}들어가기</button></form></div>`, 'admin');
    $('#lform').addEventListener('submit', async (e) => {
      e.preventDefault();
      try { const t = await App.store.adminLogin(new FormData(e.target).get('pw')); Auth.setAdminToken(t); route(); }
      catch (err) { $('#lerr').innerHTML = `<div class="notice red">${ic('alert-triangle')}<div>${esc(err.message)}</div></div>`; }
    });
  }

  /* ───────── 공유 주소·QR ───────── */
  function qrSvg(text) {
    try { const qr = window.qrcode(0, 'M'); qr.addData(text); qr.make(); return qr.createSvgTag({ cellSize: 4, margin: 2, scalable: true }); }
    catch (e) { return ''; }
  }
  function shareDialog(url) {
    modal(`<h2>선생님들께 알리기</h2><p>이 주소나 QR로 들어오면 학교 접속 코드를 한 번 넣고 바로 쓸 수 있어요.</p>
      <div class="qr-wrap"><div class="qr">${qrSvg(url)}</div><div style="flex:1;min-width:200px"><div class="share-url">${esc(url)}</div>
      <div class="row" style="display:flex;gap:8px;margin-top:10px"><button class="btn primary" id="cpy">${ic('copy')}주소 복사</button></div></div></div>
      <div class="notice green" style="margin-top:16px">${ic('layout-sidebar-right')}<div><b>웨일 브라우저 팁</b><br>사이드바의 + 버튼으로 이 주소를 추가하면 나이스를 보면서 옆 칸에서 바로 찾을 수 있어요.</div></div>
      <div class="form-actions" style="margin-top:16px"><button class="btn" data-close>닫기</button></div>`,
      (el) => $('#cpy', el).addEventListener('click', () => copyText(url)));
  }

  /* ───────── 학교 개설 ───────── */
  function viewSetup() {
    const code = window.APPS_SCRIPT_SOURCE || '';
    setView(`
<div class="narrow">
  <div class="page-head" style="display:block"><h1>우리 학교 길잡이 만들기</h1>
  <p class="count-line" style="margin-top:6px">학교 구글 계정 하나면 돼요. 자료는 학교 구글 시트에 저장되어 담당자가 바뀌어도 그대로 넘겨줄 수 있어요. 따로 드는 비용은 없어요.</p></div>
  <ol class="steps">
    <li class="step"><h3>구글 시트 만들기</h3><p>학교 구글 계정으로 로그인한 뒤 빈 스프레드시트를 하나 만들어요. 이름은 '우리학교 길잡이 저장소'처럼 지으면 찾기 쉬워요.</p>
      <div class="row"><a class="btn" href="https://sheets.new" target="_blank" rel="noopener noreferrer">${ic('external-link')}새 구글 시트 열기</a></div></li>
    <li class="step"><h3>저장소 코드 붙여넣기</h3><ol><li>시트 메뉴에서 <b>확장 프로그램 → Apps Script</b>를 눌러요.</li><li>원래 있던 코드를 모두 지우고 아래 코드를 붙여넣은 뒤 저장해요.</li></ol>
      <pre class="codebox">${esc(code.slice(0, 1200))}${code.length > 1200 ? '\n…' : ''}</pre>
      <div class="row"><button class="btn primary" id="copyCode">${ic('copy')}코드 전체 복사</button><button class="btn ghost" id="dlCode">${ic('download')}파일로 받기</button></div></li>
    <li class="step"><h3>웹 앱으로 배포하기</h3><ol><li>오른쪽 위 <b>배포 → 새 배포</b>를 눌러요.</li><li>유형은 <b>웹 앱</b>, 실행은 <b>나</b>, 액세스 권한은 <b>모든 사용자</b>로 고르고 배포해요.</li><li>권한 허용을 마치면 나오는 <b>웹 앱 URL</b>을 복사해요.</li></ol>
      <p>'모든 사용자'로 열어도 학교 접속 코드를 모르면 자료를 볼 수 없어요.</p></li>
    <li class="step"><h3>학교 정보 넣고 연결하기</h3>
      <form class="form" id="setupForm">
        <label class="field">웹 앱 URL<input class="input" name="api" required placeholder="https://script.google.com/macros/s/…/exec"></label>
        <div class="form-row"><label class="field">학교 이름<input class="input" name="schoolName" required maxlength="30" placeholder="예: 한빛고등학교"></label>
        <label class="field">학교 접속 코드 <span class="help">선생님들께만 알려 줄 코드</span><input class="input" name="accessCode" required minlength="4" maxlength="30"></label></div>
        <label class="field">관리자 비밀번호 <span class="help">8자 이상. 승인·신고 처리에 써요.</span><input class="input" type="password" name="adminPassword" required minlength="8" autocomplete="new-password"></label>
        <div id="setupMsg"></div>
        <div class="form-actions"><button class="btn primary">${ic('check')}연결하고 시작하기</button></div>
      </form></li>
    <li class="step"><h3>선생님들께 알리기</h3><p>연결이 끝나면 공유 주소와 QR 코드가 나와요. 교무회의 화면에 QR을 띄우거나 메신저로 주소를 보내 주세요.</p></li>
  </ol>
  <div class="cta-band"><span class="tx"><b>먼저 둘러보고 싶으신가요?</b><span>가상 학교 'OO고등학교'로 모든 기능을 써 볼 수 있어요.</span></span><a class="btn" href="#/">${ic('eye')}시연 학교 둘러보기</a></div>
</div>`, 'setup');
    $('#copyCode').addEventListener('click', () => copyText(code));
    $('#dlCode').addEventListener('click', () => download('Code.gs', code));
    $('#setupForm').addEventListener('submit', async (e) => {
      e.preventDefault();
      const fd = new FormData(e.target);
      const api = String(fd.get('api') || '').trim();
      const msg = $('#setupMsg');
      if (!/^https:\/\/script\.google\.com\/.+\/exec$/.test(api)) { msg.innerHTML = `<div class="notice red">${ic('alert-triangle')}<div>웹 앱 URL은 https://script.google.com/ 으로 시작하고 /exec 로 끝나요.</div></div>`; return; }
      const s = { schoolName: String(fd.get('schoolName')).trim(), accessCode: String(fd.get('accessCode')).trim(), adminPassword: String(fd.get('adminPassword')) };
      if (s.adminPassword.length < 8) { msg.innerHTML = `<div class="notice red">${ic('alert-triangle')}<div>관리자 비밀번호는 8자 이상으로 해 주세요.</div></div>`; return; }
      const btn = e.target.querySelector('button'); btn.disabled = true; msg.innerHTML = `<div class="notice green">${ic('refresh')}<div>학교 저장소를 준비하고 있어요…</div></div>`;
      try {
        await SheetsStore(api).setup(s);
        const url = Conn.shareUrl(api);
        msg.innerHTML = `<div class="notice green">${ic('circle-check')}<div><b>${esc(s.schoolName)} 길잡이가 만들어졌어요.</b><br>아래 버튼으로 공유 주소와 QR을 확인하세요.</div></div>
          <div class="row" style="display:flex;gap:8px;margin-top:10px;flex-wrap:wrap"><button type="button" class="btn primary" id="showShare">${ic('qrcode')}공유 주소·QR</button><a class="btn" href="${esc(url)}">${ic('arrow-right')}우리 학교 길잡이로 가기</a></div>`;
        $('#showShare').addEventListener('click', () => shareDialog(url));
      } catch (err) {
        msg.innerHTML = `<div class="notice red">${ic('alert-triangle')}<div>${esc(err.message)}</div></div>`;
      } finally { btn.disabled = false; }
    });
  }

  /* ───────── 처음 설정: 학교 저장소가 비어 있으면 접속 코드·관리자 비밀번호를 정하고 기본 자료를 넣는다 ───────── */
  function viewFirstSetup() {
    const D = window.DEMO_DATA || {}, CFG = window.GIL_CONFIG || {};
    // 새 학교(설치 스크립트로 만든 판): 학교 이름은 설치할 때 정한 이름, 가상 학교 규정집은 넣지 않고 예시 안내·서식은 고를 수 있게
    const fresh = !!CFG.fresh, schoolName = CFG.schoolName || (D.school ? D.school.name : '');
    document.body.innerHTML = `<main class="gate"><div class="login card" style="max-width:460px">
      <div class="ic">${ic('directions')}</div><h1>${esc(schoolName)} 길잡이 처음 설정</h1>
      <p>선생님들이 들어올 때 쓸 접속 코드와 관리자 비밀번호를 정해 주세요.${fresh ? '' : ' 정하면 규정집·안내문·수업 자료가 학교 저장소에 들어가요.'}</p>
      <form class="form" id="fs"><label class="field">학교 접속 코드 <span class="help">4자 이상. 선생님들께 알려 줄 코드</span><input class="input" name="code" required minlength="4" autocomplete="off"></label>
      <label class="field">관리자 비밀번호 <span class="help">8자 이상. 승인·신고 처리용</span><input class="input" type="password" name="pw" required minlength="8" autocomplete="new-password"></label>
      ${fresh ? `<label class="chk" style="display:flex;gap:8px;align-items:flex-start;font-size:15px;margin:4px 0 2px"><input type="checkbox" name="ex" checked style="width:18px;height:18px;margin-top:3px;accent-color:var(--accent)"><span>예시 안내 문서·서식 넣기 <span class="help" style="display:block">결석계 제출, 출장 여비 처리 같은 예시 ${(D.docs || []).length}개와 학습지·학급 자료예요. 우리 학교에 맞게 고쳐 쓰거나 지우세요. 규정집은 넣지 않아요(학교 규정은 직접 올려 주세요).</span></span></label>` : ''}
      <div id="fsMsg"></div><button class="btn primary" style="width:100%">${ic('check')}설정하고 시작하기</button></form></div></main>`;
    $('#fs').addEventListener('submit', async (e) => {
      e.preventDefault();
      const fd = new FormData(e.target), code = String(fd.get('code')).trim(), pw = String(fd.get('pw'));
      const msg = $('#fsMsg'), btn = e.target.querySelector('button');
      if (code.length < 4 || pw.length < 8) { msg.innerHTML = `<div class="notice red">${ic('alert-triangle')}<div>접속 코드는 4자, 비밀번호는 8자 이상이에요.</div></div>`; return; }
      btn.disabled = true; msg.innerHTML = `<div class="notice green">${ic('refresh')}<div>학교 저장소를 준비하고 기본 자료를 넣는 중이에요… (1분쯤 걸려요)</div></div>`;
      try {
        await App.store.setup({ schoolName, accessCode: code, adminPassword: pw });
        const token = await App.store.adminLogin(pw);
        if (!fresh || fd.get('ex')) await importDefaults(token, (k, n) => { msg.innerHTML = `<div class="notice green">${ic('refresh')}<div>기본 자료를 넣는 중이에요… (${k}/${n})</div></div>`; }, fresh ? { rules: false, name: schoolName } : null);
        Auth.setAdminToken(token); Auth.remember(code); App.store.setCode(code);
        App.data = await App.store.load(); start();
        toast('설정을 마쳤어요. 접속 코드를 선생님들께 알려 주세요.');
      } catch (err) { btn.disabled = false; msg.innerHTML = `<div class="notice red">${ic('alert-triangle')}<div>${esc(err.message)}</div></div>`; }
    });
  }

  // 판에 들어 있는 기본 자료(안내 문서·규정집·수업 자료)를 학교 저장소에 몇 개씩 나눠 넣는다. 이미 있는 문서는 건드리지 않는다
  // opt.rules=false: 가상 학교 규정집은 빼고, opt.name: 예시 속 'OO고등학교'를 우리 학교 이름으로
  async function importDefaults(token, progress, opt) {
    const D = window.DEMO_DATA || {};
    const rename = (d) => (opt && opt.name ? Object.assign({}, d, { title: String(d.title || '').replace(/OO고등학교/g, opt.name), body: String(d.body || '').replace(/OO고등학교/g, opt.name), review: undefined }) : d);
    const docs = (D.docs || []).concat(opt && opt.rules === false ? [] : window.DEMO_RULES || []).map(rename), lessons = D.lessons || [];
    const STEP = 3, total = docs.length + (lessons.length ? 1 : 0);
    let added = 0, done = 0;
    for (let i = 0; i < docs.length; i += STEP) {
      const part = docs.slice(i, i + STEP);
      const r = await App.store.importDocs(token, { format: 'gil-export/1', onlyNew: true, categories: D.categories, docs: part, lessons: [] });
      added += r.added; done += part.length; if (progress) progress(done, total);
    }
    if (lessons.length) { const r = await App.store.importDocs(token, { format: 'gil-export/1', onlyNew: true, docs: [], lessons }); added += r.added; if (progress) progress(total, total); }
    return added;
  }

  /* ───────── 학교 접속 코드 화면 ───────── */
  function viewGate(info, err) {
    document.body.innerHTML = `<main class="gate"><div class="login card">
      <div class="ic">${ic('directions')}</div><h1>${esc(info.schoolName)} 길잡이</h1>
      <p>학교에서 받은 접속 코드를 넣어 주세요. 이 기기에서는 다음부터 묻지 않아요.</p>
      <form class="form" id="gform"><label class="field">학교 접속 코드<input class="input" name="code" required autocomplete="off"></label>
      <div id="gerr">${err ? `<div class="notice red">${ic('alert-triangle')}<div>${esc(err)}</div></div>` : ''}</div>
      <button class="btn primary" style="width:100%">${ic('arrow-right')}들어가기</button></form></div></main>`;
    $('#gform input').focus();
    $('#gform').addEventListener('submit', async (e) => {
      e.preventDefault();
      const code = String(new FormData(e.target).get('code')).trim();
      App.store.setCode(code);
      try { App.data = await App.store.load(); Auth.remember(code); start(); }
      catch (er) { viewGate(info, er.message); }
    });
  }

  /* ───────── 길 찾기 (주소창 # 뒤) ───────── */
  function route() {
    const h = location.hash.replace(/^#/, '') || '/';
    const [path, qstr] = h.split('?');
    const qs = new URLSearchParams(qstr || '');
    const parts = path.split('/').filter(Boolean);
    try {
      if (!parts.length) return viewHome();
      switch (parts[0]) {
        case 'search': return qs.get('q') ? viewSearch(qs.get('q')) : viewHome();
        case 'cat': return viewCat(parts[1]);
        case 'doc': return viewDoc(parts[1], qs);
        case 'propose': return viewPropose(parts[1] || 'new', qs);
        case 'form': return viewForm(parts[1], qs);
        case 'pdf': return viewPdf(qs);
        case 'file': return viewFile(parts[1], parts[2], qs);
        case 'tools': return viewTools();
        case 'tool': return viewToolEdit(parts[1]);
        case 'lessons': return viewLessons(qs);
        case 'lesson': return viewLessonEdit(parts[1], qs);
        case 'lfile': return viewLessonPage(parts[1], qs);
        case 'site': return viewSiteEdit(parts[1] ? decodeURIComponent(parts[1]) : 'new', qs);
        case 'lapp': return viewLessonPage(parts[1], qs);
        case 'homeroom': return viewHomeroom();
        case 'sgb': return viewSgb();
        case 'fav': return viewFav();
        case 'howto': return viewHowto();
        case 'gongmun': return viewGongmun();
        case 'admin': return viewAdmin(qs);
        case 'setup': return viewSetup();
        default: return viewHome();
      }
    } catch (e) {
      console.error(e);
      setView(`<div class="narrow"><div class="empty"><div class="ic">${ic('alert-triangle')}</div><h2>화면을 그리지 못했어요</h2><p>${esc(e.message)}</p><a class="btn" href="#/">처음으로</a></div></div>`, 'home');
    }
  }

  function fillDefaults() {
    const D = window.DEMO_DATA || {};
    App.data.subjects = App.data.subjects || D.subjects || [];
    App.data.classTools = App.data.classTools || D.classTools || [];
    App.data.lessons = App.data.lessons || [];
    App.data.forms = Object.assign({}, D.forms || {}, App.data.forms || {});
  }
  function start() {
    fillDefaults();
    hookUploads();
    shell();
    document.title = App.data.school.name + ' 길잡이';
    route();
  }

  async function boot() {
    applyLook();
    const api = Conn.resolve();
    if (!api) {
      App.mode = 'demo'; App.store = DemoStore(); App.needsCode = false;
      App.data = await App.store.load();
      return start();
    }
    App.mode = 'sheets'; App.store = SheetsStore(api);
    let info;
    try { info = await App.store.info(); }
    catch (e) {
      document.body.innerHTML = `<main class="gate"><div class="login card"><div class="ic">${ic('alert-triangle')}</div><h1>학교 저장소에 연결하지 못했어요</h1><p>${esc(e.message)}</p>
        <div class="form-actions" style="justify-content:flex-start"><button class="btn primary" onclick="location.reload()">${ic('refresh')}다시 시도</button><button class="btn" id="toDemo">시연 학교로 보기</button></div></div></main>`;
      $('#toDemo').addEventListener('click', () => { Conn.forget(); location.href = location.href.split('?')[0].split('#')[0]; });
      return;
    }
    if (info && info.initialized === false) return viewFirstSetup();
    // 접속 코드 없이 바로 들어가는 저장소 (관리자 비밀번호만 있음)
    App.needsCode = info.needsCode !== false;
    if (!App.needsCode) {
      try { App.data = await App.store.load(); return start(); }
      catch (e) { document.body.innerHTML = `<main class="gate"><div class="login card"><h1>자료를 불러오지 못했어요</h1><p>${esc(e.message)}</p><button class="btn primary" onclick="location.reload()">다시 시도</button></div></main>`; return; }
    }
    const saved = Auth.savedCode();
    if (saved) {
      App.store.setCode(saved);
      try { App.data = await App.store.load(); return start(); }
      catch (e) { Auth.forget(); return viewGate(info, e.code === 'BAD_CODE' ? '접속 코드가 바뀌었어요. 새 코드를 넣어 주세요.' : e.message); }
    }
    viewGate(info);
  }

  window.addEventListener('hashchange', () => { if (App.data) route(); });
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
  window.GilApp = { md, diffLines, checkPII }; // 점검용
})();
