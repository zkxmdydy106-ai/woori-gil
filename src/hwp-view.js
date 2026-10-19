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

  // 화면: 쪽들을 host 안에 그린다. 폭에 맞춰 줄이고(최대 100%), 다시 부르면 새로 그린다
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

  const api = { mount, print, buildPrint, pagesOf, toSvg, chainFor, hasLocal };
  window.HwpView = api;
})();
