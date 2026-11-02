// hwp-view.js: rhwp 편집기가 그린 쪽(SVG)을 이 사이트 안에서 보여 주고 인쇄한다.
// 쪽 모양·글자 위치는 rhwp 가 정하고, 여기서는 글꼴만 고른다:
//  ① 문서에 적힌 한컴 글꼴(설치돼 있으면 그대로) → ② 같은 글꼴의 다른 이름·비슷한 한컴/윈도 글꼴 → ③ 공개(OFL) 웹 글꼴.
// 글꼴 파일은 싣지 않는다(한컴·MS 글꼴은 재배포 불가). 공개 글꼴은 Google Fonts(OFL)에서 받는다.
(function () {
  'use strict';
  const WEB_FONTS = 'https://fonts.googleapis.com/css2?family=Noto+Sans+KR:wght@400;700;900&family=Noto+Serif+KR:wght@400;700&family=Nanum+Gothic:wght@400;800&family=Nanum+Myeongjo:wght@400;800&display=swap';
  const SERIF = ['Noto Serif KR', 'Nanum Myeongjo'];
  const SANS = ['Noto Sans KR', 'Nanum Gothic'];
  // 글꼴 이름 → [같은 글꼴의 다른 이름·비슷한 설치 글꼴…], 종류(s 바탕, g 고딕, h 굵은 제목 고딕, m 고정폭)
  const MAP = {
    '함초롬바탕': [['HCR Batang', 'HCRBatang', '한컴바탕'], 's'],
    '함초롬돋움': [['HCR Dotum', 'HCRDotum', '한컴돋움'], 'g'],
    '한컴바탕': [['Hancom Batang', '함초롬바탕', 'HCR Batang'], 's'],
    '한컴돋움': [['Hancom Dotum', '함초롬돋움', 'HCR Dotum'], 'g'],
    '한컴 고딕': [['Hancom Gothic', '한컴고딕', '함초롬돋움', 'HCR Dotum'], 'g'],
    '휴먼명조': [['HY신명조', 'HYSinMyeongJo-Medium', '함초롬바탕', 'HCR Batang'], 's'],
    '휴먼고딕': [['돋움', 'Dotum', '함초롬돋움', 'HCR Dotum'], 'g'],
    'HY신명조': [['HYSinMyeongJo-Medium', 'HYSinMyeongJo', '함초롬바탕', 'HCR Batang'], 's'],
    'HY견명조': [['HYMyeongJo-Extra', 'HY신명조', '함초롬바탕'], 's'],
    'HY중고딕': [['HYGothic-Medium', '함초롬돋움', 'HCR Dotum'], 'g'],
    'HY견고딕': [['HYGothic-Extra', 'HY헤드라인M', 'HYHeadLine-Medium'], 'h'],
    'HY헤드라인M': [['HYHeadLine-Medium', 'HYHeadLine', 'HY견고딕', 'HYGothic-Extra'], 'h'],
    'HY울릉도M': [['HYwulM', 'HY견고딕', 'HYGothic-Extra', 'HY헤드라인M'], 'h'],
    '맑은 고딕': [['Malgun Gothic'], 'g'],
    '바탕': [['Batang'], 's'], '바탕체': [['BatangChe', '바탕', 'Batang'], 's'],
    '돋움': [['Dotum'], 'g'], '돋움체': [['DotumChe', '돋움', 'Dotum'], 'm'],
    '굴림': [['Gulim'], 'g'], '굴림체': [['GulimChe', '굴림', 'Gulim'], 'm'],
    '새굴림': [['New Gulim', '굴림', 'Gulim'], 'g'],
    '궁서': [['Gungsuh'], 's'], '궁서체': [['GungsuhChe', '궁서', 'Gungsuh'], 's']
  };
  // 표에 없는 옛 글꼴(한양·신명·# 글꼴 등)은 이름으로 종류를 짐작한다
  const GUESS = [
    [/견고딕|태고딕|헤드라인|울릉도|그래픽/, [['HY견고딕', 'HYGothic-Extra'], 'h']],
    [/명조|바탕|궁서|Myeong|Batang|Serif/i, [['HY신명조', '함초롬바탕', 'HCR Batang', '바탕', 'Batang'], 's']],
    [/고딕|돋움|굴림|Gothic|Dotum|Gulim|Sans/i, [['HY중고딕', '함초롬돋움', 'HCR Dotum', '맑은 고딕', 'Malgun Gothic'], 'g']]
  ];
  const lookup = (face) => MAP[face] || (GUESS.find(([re]) => re.test(face)) || [])[1] || null;

  // 이 컴퓨터에 그 이름의 글꼴이 있는지 (기본 글꼴과 폭이 다르면 있음)
  const seen = new Map();
  let ctx = null;
  function hasLocal(name) {
    if (seen.has(name)) return seen.get(name);
    let ok = false;
    try {
      ctx = ctx || document.createElement('canvas').getContext('2d');
      const t = 'mmwwWM한글글꼴측정가나다0123';
      ok = ['monospace', 'serif', 'sans-serif'].some((g) => {
        ctx.font = '40px ' + g; const a = ctx.measureText(t).width;
        ctx.font = `40px "${name.replace(/"/g, '')}", ${g}`; return Math.abs(ctx.measureText(t).width - a) > 0.5;
      });
    } catch (e) { /* 재지 못하면 없다고 본다 */ }
    seen.set(name, ok); return ok;
  }

  const q = (n) => /^(serif|sans-serif|monospace|cursive|fantasy|system-ui)$/.test(n) ? n : `'${n.replace(/'/g, '')}'`;
  // rhwp 가 적은 글꼴 목록을 다시 짠다. 결과: [새 목록, 굵게 흉내 필요?]
  function chainFor(list) {
    const face = list[0];
    const m = lookup(face);
    if (!m) return [list, false];
    const [alias, kind] = m;
    const web = kind === 's' ? SERIF : SANS;
    const generic = kind === 's' ? 'serif' : kind === 'm' ? 'monospace' : 'sans-serif';
    const out = [];
    for (const n of [face, ...alias, ...list.slice(1).filter((n) => !/^(serif|sans-serif|monospace)$/.test(n)), ...web, generic]) if (!out.includes(n)) out.push(n);
    // 굵은 제목 글꼴이 하나도 없으면 공개 글꼴을 굵게 써서 무게를 맞춘다
    const heavyMissing = kind === 'h' && ![face, ...alias].some((n) => api.hasLocal(n));
    return [out, heavyMissing];
  }

  const cache = new Map();
  function fixFonts(root) {
    root.querySelectorAll('[font-family]').forEach((el) => {
      const raw = el.getAttribute('font-family');
      let r = cache.get(raw);
      if (!r) {
        const list = raw.split(',').map((s) => s.trim().replace(/^['"]|['"]$/g, '')).filter(Boolean);
        const [chain, heavy] = chainFor(list);
        r = [chain.map(q).join(','), heavy]; cache.set(raw, r);
      }
      el.setAttribute('font-family', r[0]);
      if (r[1] && !el.getAttribute('font-weight')) el.setAttribute('font-weight', '800');
    });
  }

  // 문서 안의 스크립트·이벤트·외부 링크는 지운다 (올린 파일이 화면을 조작하지 못하게)
  function clean(root) {
    root.querySelectorAll('script, foreignObject, iframe, object, embed').forEach((n) => n.remove());
    [root, ...root.querySelectorAll('*')].forEach((el) => {
      for (const a of [...el.attributes]) {
        const v = a.value.trim().toLowerCase();
        if (/^on/i.test(a.name) || (/href$/i.test(a.name) && !v.startsWith('data:image/') && !v.startsWith('#'))) el.removeAttribute(a.name);
      }
    });
  }

  let nsSeq = 0;
  // SVG 문자열 → 정리된 <svg> 요소 (id 는 쪽마다 겹치지 않게 바꾼다)
  function toSvg(str, doc) {
    const d = new DOMParser().parseFromString(str, 'image/svg+xml');
    const svg = d.documentElement;
    if (svg.nodeName !== 'svg' || d.querySelector('parsererror')) throw new Error('쪽 그림을 읽지 못했어요');
    clean(svg); fixFonts(svg);
    const ns = 'hv' + (++nsSeq) + '-';
    const ids = [...svg.querySelectorAll('[id]')].map((el) => { const o = el.id; el.id = ns + o; return o; });
    if (ids.length) {
      const re = new RegExp(`(url\\(['"]?#|^#)(${ids.map((s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})(?=['"]?\\)|$)`, 'g');
      svg.querySelectorAll('*').forEach((el) => { for (const a of [...el.attributes]) if (a.value.includes('#')) { const v = a.value.replace(re, `$1${ns}$2`); if (v !== a.value) el.setAttribute(a.name, v); } });
    }
    return (doc || document).importNode(svg, true);
  }

  // 공개 글꼴 목록(CSS)을 붙인다. 글꼴 파일은 그 글꼴이 실제로 쓰일 때만 받는다
  function addWebFonts(doc) {
    const had = doc.getElementById('hwpv-fonts');
    if (had) return had.__ready || Promise.resolve();
    const l = doc.createElement('link'); l.id = 'hwpv-fonts'; l.rel = 'stylesheet'; l.href = WEB_FONTS;
    l.__ready = new Promise((r) => { l.onload = l.onerror = r; setTimeout(r, 3000); });
    doc.head.appendChild(l);
    return l.__ready;
  }

  // 쪽 크기(px, 96dpi) → mm. A4 등 표준 판형은 반올림 오차를 없앤다
  const STD = [148, 182, 210, 215.9, 257, 279.4, 297, 355.6, 364, 420, 431.8];
  function mm(px) { const v = px * 25.4 / 96; const s = STD.find((x) => Math.abs(x - v) < 0.2); return s || Math.round(v * 100) / 100; }
  function sizeOf(svg) {
    const vb = (svg.getAttribute('viewBox') || '').split(/[\s,]+/).map(Number);
    const w = parseFloat(svg.getAttribute('width')) || vb[2] || 794, h = parseFloat(svg.getAttribute('height')) || vb[3] || 1123;
    return { w, h, wmm: mm(w), hmm: mm(h) };
  }

  async function pagesOf(ed) {
    const n = await ed.pageCount();
    const out = [];
    for (let i = 0; i < n; i++) out.push(await ed.getPageSvg(i));
    return out;
  }

  /* ── 하이퍼링크: 쪽 그림(SVG)에는 링크가 없어서 파일에서 직접 읽어 그 글자 위에 얹는다 ──
     결과: [{ text: 보이는 글, url }] (http·https·mailto 만) */
  function linkUrl(cmd) {
    // 한글의 링크 명령: 'http\://주소;1;0;0;' (\ 는 다음 글자를 그대로, ; 까지가 주소)
    let u = '';
    const s = String(cmd || '');
    for (let i = 0; i < s.length; i++) { const c = s[i]; if (c === '\\') { u += s[++i] || ''; continue; } if (c === ';') break; u += c; }
    u = u.trim();
    if (/^www\./i.test(u) || /^[\w-]+(\.[\w-]+)+(\/|$)/.test(u)) u = 'https://' + u;
    return /^(https?:|mailto:)/i.test(u) ? u : '';
  }
  // hwpx: 본문 XML 의 fieldBegin(type=HYPERLINK) ~ fieldEnd 사이 글자
  async function hwpxLinks(u8) {
    const files = (await window.HwpxEditor._unzip(u8)).filter((f) => /Contents\/section\d+\.xml$/.test(f.name)).sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));
    const out = [], dec = new TextDecoder();
    for (const f of files) {
      const doc = new DOMParser().parseFromString(dec.decode(f.data), 'application/xml');
      const open = new Map();
      const walk = (el) => {
        for (const n of el.children) {
          if (n.localName === 'fieldBegin') {
            if (n.getAttribute('type') === 'HYPERLINK') {
              const p = [...n.getElementsByTagNameNS('*', 'stringParam')];
              const cmd = (p.find((x) => x.getAttribute('name') === 'Command') || p.find((x) => x.getAttribute('name') === 'Path') || { textContent: '' }).textContent;
              const url = linkUrl(cmd);
              if (url) { const l = { text: '', url }; open.set(n.getAttribute('id') || String(open.size), l); out.push(l); }
            }
          } else if (n.localName === 'fieldEnd') open.delete(n.getAttribute('beginIDRef'));
          else if (n.localName === 't') { if (open.size) open.forEach((l) => { l.text += n.textContent; }); }
          else walk(n);
        }
      };
      walk(doc.documentElement);
    }
    return out;
  }
  // hwp(옛 형식): 복합 문서(CFB) 안 BodyText/Section 들의 레코드에서 %hlk 조종자를 찾는다
  function cfb(u8) {
    const dv = new DataView(u8.buffer, u8.byteOffset, u8.byteLength);
    if (dv.getUint32(0, true) !== 0xE011CFD0) throw new Error('hwp 파일이 아니에요');
    const ss = 1 << dv.getUint16(30, true), ms = 1 << dv.getUint16(32, true), off = (n) => (n + 1) * ss;
    const difat = []; for (let i = 0; i < 109; i++) difat.push(dv.getUint32(76 + i * 4, true));
    for (let d = dv.getUint32(68, true), k = 0; d < 0xFFFFFFFA && k < dv.getUint32(72, true); k++) { for (let i = 0; i < ss / 4 - 1; i++) difat.push(dv.getUint32(off(d) + i * 4, true)); d = dv.getUint32(off(d) + ss - 4, true); }
    const fat = []; difat.filter((x) => x < 0xFFFFFFFA).forEach((s) => { for (let i = 0; i < ss / 4; i++) fat.push(dv.getUint32(off(s) + i * 4, true)); });
    const chain = (s, tb) => { const c = []; while (s < 0xFFFFFFFA && c.length <= tb.length) { c.push(s); s = tb[s]; } return c; };
    const big = (s) => { const c = chain(s, fat), o = new Uint8Array(c.length * ss); c.forEach((x, i) => o.set(u8.subarray(off(x), off(x) + ss), i * ss)); return o; };
    const dirB = big(dv.getUint32(48, true)), dd = new DataView(dirB.buffer);
    const dirs = []; for (let i = 0; i + 128 <= dirB.length; i += 128) { const nl = dd.getUint16(i + 64, true); dirs.push({ name: nl > 2 ? new TextDecoder('utf-16le').decode(dirB.subarray(i, i + nl - 2)) : '', type: dirB[i + 66], l: dd.getUint32(i + 68, true), r: dd.getUint32(i + 72, true), ch: dd.getUint32(i + 76, true), start: dd.getUint32(i + 116, true), size: dd.getUint32(i + 120, true) }); }
    const mfB = big(dv.getUint32(60, true)), mfD = new DataView(mfB.buffer); const mfat = []; for (let i = 0; i + 4 <= mfB.length; i += 4) mfat.push(mfD.getUint32(i, true));
    const mini = big(dirs[0].start), cutoff = dv.getUint32(56, true);
    const read = (e) => { if (e.size >= cutoff) return big(e.start).subarray(0, e.size); const c = chain(e.start, mfat), o = new Uint8Array(c.length * ms); c.forEach((x, i) => o.set(mini.subarray(x * ms, x * ms + ms), i * ms)); return o.subarray(0, e.size); };
    const kidsOf = (e) => { const o = []; const go = (i) => { if (i >= dirs.length || i === 0xFFFFFFFF) return; const d = dirs[i]; go(d.l); o.push(d); go(d.r); }; go(e.ch); return o; };
    return { root: dirs[0], kidsOf, read };
  }
  async function inflate(bytes) {
    const out = new Response(new Blob([bytes]).stream().pipeThrough(new DecompressionStream('deflate-raw')));
    return new Uint8Array(await out.arrayBuffer());
  }
  const HLK = 0x25686C6B;   // '%hlk'
  function sectionLinks(b, out) {
    const dv = new DataView(b.buffer, b.byteOffset, b.byteLength);
    const queue = {};   // 수준별: 문단 글에서 읽은 링크 글자들 (조종자가 뒤따라 나온다)
    let p = 0;
    while (p + 4 <= b.length) {
      const h = dv.getUint32(p, true); p += 4;
      const tag = h & 0x3FF, level = (h >>> 10) & 0x3FF; let size = h >>> 20;
      if (size === 0xFFF) { size = dv.getUint32(p, true); p += 4; }
      if (tag === 66) queue[level + 1] = [];                  // 문단 시작
      else if (tag === 67) {                                  // 문단 글자
        const stack = []; let i = p; const end = p + size, q = (queue[level] = queue[level] || []);
        while (i + 2 <= end) {
          const c = dv.getUint16(i, true);
          if (c === 3) { const isL = i + 6 <= end && dv.getUint32(i + 2, true) === HLK; const o = isL ? { t: '' } : null; if (isL) q.push(o); stack.push(o); i += 16; continue; }
          if (c === 4) { stack.pop(); i += 16; continue; }
          if ([1, 2, 5, 6, 7, 8, 9, 11, 12, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23].includes(c)) { i += 16; continue; }
          if (c >= 32) { const ch = String.fromCharCode(c); stack.forEach((o) => { if (o) o.t += ch; }); }
          i += 2;
        }
      } else if (tag === 71 && size >= 4 && dv.getUint32(p, true) === HLK) {   // 조종자 머리: 속성(4)·기타(1)·명령 길이(2)·명령
        const n = size >= 11 ? dv.getUint16(p + 9, true) : 0;
        const cmd = n && p + 11 + n * 2 <= p + size ? new TextDecoder('utf-16le').decode(b.subarray(p + 11, p + 11 + n * 2)) : '';
        const shown = queue[level] && queue[level].shift();
        const url = linkUrl(cmd);
        if (url) out.push({ text: shown ? shown.t : '', url });
      }
      p += size;
    }
  }
  async function hwpLinks(u8) {
    const f = cfb(u8), top = f.kidsOf(f.root);
    const head = top.find((e) => e.name === 'FileHeader');
    const flags = head ? new DataView(f.read(head).buffer, f.read(head).byteOffset).getUint32(36, true) : 1;
    if (flags & 6) return [];   // 암호·배포용 문서는 읽을 수 없다
    const body = top.find((e) => e.name === 'BodyText'); if (!body) return [];
    const secs = f.kidsOf(body).filter((e) => /^Section\d+$/.test(e.name)).sort((a, b) => +a.name.slice(7) - +b.name.slice(7));
    const out = [];
    for (const s of secs) { const raw = f.read(s); const b = new Uint8Array(flags & 1 ? await inflate(raw) : raw); sectionLinks(b, out); }
    return out;
  }
  async function links(bytes) {
    try {
      const u8 = new Uint8Array(bytes instanceof ArrayBuffer ? bytes.slice(0) : bytes);
      return u8[0] === 0x50 && u8[1] === 0x4B ? await hwpxLinks(u8) : await hwpLinks(u8);
    } catch (e) { console.warn('한글 파일의 링크를 읽지 못했어요', e); return []; }
  }
  const NS_SVG = 'http://www.w3.org/2000/svg';
  // 쪽 그림의 글자 위에 투명한 링크를 얹는다. 못 찾은 링크는 돌려준다
  function overlayLinks(box, list) {
    const norm = (s) => String(s || '').replace(/\s+/g, '').toLowerCase();
    const pages = [...box.querySelectorAll('.hwpv-page svg')].map((svg) => { let s = ''; const parts = []; svg.querySelectorAll('text').forEach((t) => { const c = norm(t.textContent); if (!c) return; parts.push({ el: t, a: s.length, b: s.length + c.length }); s += c; }); return { s, parts }; });
    const miss = [];
    let cp = 0, ci = 0;
    for (const l of list) {
      const w = norm(l.text);
      let at = null;
      if (w) {
        for (let k = cp; k < pages.length && !at; k++) { const i = pages[k].s.indexOf(w, k === cp ? ci : 0); if (i >= 0) at = { k, i }; }
        for (let k = 0; k < pages.length && !at; k++) { const i = pages[k].s.indexOf(w); if (i >= 0) at = { k, i }; }
      }
      if (!at) { miss.push(l); continue; }
      cp = at.k; ci = at.i + w.length;
      const pg = pages[at.k], a0 = at.i, b0 = at.i + w.length;
      pg.parts.filter((p) => p.b > a0 && p.a < b0).forEach((p) => {
        try {
          const bb = p.el.getBBox(), f0 = (Math.max(a0, p.a) - p.a) / (p.b - p.a), f1 = (Math.min(b0, p.b) - p.a) / (p.b - p.a);
          const an = document.createElementNS(NS_SVG, 'a'); an.setAttribute('class', 'hv-link'); an.setAttribute('href', l.url); an.setAttribute('target', '_blank'); an.setAttribute('rel', 'noopener noreferrer');
          const ti = document.createElementNS(NS_SVG, 'title'); ti.textContent = '누르면 새 창으로 열려요: ' + l.url; an.appendChild(ti);
          const r = document.createElementNS(NS_SVG, 'rect'); r.setAttribute('x', bb.x + bb.width * f0); r.setAttribute('y', bb.y); r.setAttribute('width', Math.max(1, bb.width * (f1 - f0))); r.setAttribute('height', bb.height); an.appendChild(r);
          p.el.parentNode.insertBefore(an, p.el.nextSibling);
        } catch (e) { /* 재지 못하면 건너뛴다 */ }
      });
    }
    return miss;
  }
  // 글자 위에 못 얹은 링크(또는 쪽 그림 화면)의 목록 줄
  function linkBar(list) {
    const bar = document.createElement('div'); bar.className = 'hwpv-linkbar';
    bar.appendChild(Object.assign(document.createElement('span'), { className: 'lbl', textContent: '이 문서의 링크' }));
    list.forEach((l) => { const a = document.createElement('a'); a.href = l.url; a.target = '_blank'; a.rel = 'noopener noreferrer'; a.textContent = l.text.trim() || l.url; a.title = l.url; bar.appendChild(a); });
    return bar;
  }

  // 화면: 쪽들을 host 안에 그린다. 폭에 맞춰 줄이고(최대 100%), 다시 부르면 새로 그린다
  // host._links 가 있으면(파일에서 읽은 링크) 글자 위에 얹는다
  async function mount(host, ed) {
    addWebFonts(document);
    const strs = await pagesOf(ed);
    const box = document.createElement('div'); box.className = 'hwpv-pages';
    strs.forEach((s, i) => {
      const svg = toSvg(s); const z = sizeOf(svg);
      svg.setAttribute('width', '100%'); svg.removeAttribute('height');
      if (!svg.getAttribute('viewBox')) svg.setAttribute('viewBox', `0 0 ${z.w} ${z.h}`);
      const pg = document.createElement('div'); pg.className = 'hwpv-page';
      pg.style.width = z.w + 'px'; pg.style.aspectRatio = `${z.w} / ${z.h}`;
      pg.setAttribute('aria-label', `${i + 1}쪽`); pg.appendChild(svg); box.appendChild(pg);
    });
    host.querySelectorAll('.hwpv-pages').forEach((n) => n.remove());
    host.appendChild(box);
    if (host._links && host._links.length) { const miss = overlayLinks(box, host._links); if (miss.length) box.insertBefore(linkBar(miss), box.firstChild); }
    return strs.length;
  }

  // 인쇄용 문서 채우기: 쪽마다 종이 한 장. 종이 크기 = 문서 쪽 크기, 여백 0(브라우저 머리글·바닥글 자리 없음), 배경색 그대로
  function buildPrint(doc, strs) {
    addWebFonts(doc);
    const sizes = new Map(); const rules = [];
    strs.forEach((s) => {
      const svg = toSvg(s, doc); const z = sizeOf(svg);
      const key = z.wmm + 'x' + z.hmm;
      if (!sizes.has(key)) { const nm = 'hp' + sizes.size; sizes.set(key, nm); rules.push(`@page ${nm} { size: ${z.wmm}mm ${z.hmm}mm; margin: 0; }`); }
      svg.setAttribute('width', '100%'); svg.setAttribute('height', '100%'); svg.setAttribute('preserveAspectRatio', 'none');
      if (!svg.getAttribute('viewBox')) svg.setAttribute('viewBox', `0 0 ${z.w} ${z.h}`);
      const pg = doc.createElement('div'); pg.className = 'pg';
      pg.style.cssText = `page:${sizes.get(key)};width:${z.wmm}mm;height:${z.hmm}mm`;
      pg.appendChild(svg); doc.body.appendChild(pg);
    });
    const first = [...sizes.keys()][0].split('x');
    const st = doc.createElement('style');
    st.textContent = `@page { size: ${first[0]}mm ${first[1]}mm; margin: 0; }\n${rules.join('\n')}
html, body { margin: 0; padding: 0; background: #fff; }
* { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
.pg { overflow: hidden; break-after: page; page-break-after: always; break-inside: avoid; }
.pg:last-child { break-after: auto; page-break-after: auto; }
.pg svg { display: block; width: 100%; height: 100%; }`;
    doc.head.appendChild(st);
  }

  // 인쇄: 같은 사이트의 숨은 틀에서 인쇄 창을 연다 (팝업 차단에 걸리지 않음)
  let printing = false;
  async function print(ed, title) {
    if (printing) return; printing = true;
    try {
      const strs = await pagesOf(ed);
      const fr = document.createElement('iframe');
      fr.setAttribute('aria-hidden', 'true'); fr.tabIndex = -1;
      fr.style.cssText = 'position:fixed;right:0;bottom:0;width:1px;height:1px;border:0;opacity:0;pointer-events:none';
      document.body.appendChild(fr);
      const doc = fr.contentDocument;
      doc.open(); doc.write('<!doctype html><html lang="ko"><head><meta charset="utf-8"><title></title></head><body></body></html>'); doc.close();
      doc.title = title || document.title;
      buildPrint(doc, strs);
      // 글꼴이 다 온 뒤 인쇄 (늦어도 몇 초)
      await addWebFonts(doc);
      void doc.body.offsetHeight;
      await Promise.race([doc.fonts.ready, new Promise((r) => setTimeout(r, 4000))]);
      await new Promise((r) => setTimeout(r, 120));
      const done = () => setTimeout(() => fr.remove(), 1000);
      fr.contentWindow.addEventListener('afterprint', done, { once: true });
      // 크롬·엣지는 PDF 파일 이름으로 바깥 문서 제목을 쓴다
      const old = document.title; if (title) document.title = title;
      try { fr.contentWindow.focus(); fr.contentWindow.print(); } finally { document.title = old; }
      setTimeout(done, 60000);
    } finally { printing = false; }
  }

  const api = { mount, print, buildPrint, pagesOf, toSvg, chainFor, hasLocal, links, linkBar };
  window.HwpView = api;
})();
