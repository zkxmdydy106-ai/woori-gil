// search.js: 문서 검색 (제목·다른 이름·본문 가중치, 초성 검색, 띄어쓰기 무시)
(function () {
  const CHO = ['ㄱ', 'ㄲ', 'ㄴ', 'ㄷ', 'ㄸ', 'ㄹ', 'ㅁ', 'ㅂ', 'ㅃ', 'ㅅ', 'ㅆ', 'ㅇ', 'ㅈ', 'ㅉ', 'ㅊ', 'ㅋ', 'ㅌ', 'ㅍ', 'ㅎ'];

  function chosung(str) {
    let out = '';
    for (const ch of str) {
      const c = ch.charCodeAt(0);
      if (c >= 0xac00 && c <= 0xd7a3) out += CHO[Math.floor((c - 0xac00) / 588)];
      else out += ch;
    }
    return out;
  }
  const norm = (s) => String(s || '').toLowerCase().replace(/\s+/g, '');

  // 한/영 자판을 잘못 두고 친 글자 바로잡기 (두벌식): "wldhwl" → "지오지", "ㅎ대" → "geo"
  const KEY = { q: 'ㅂ', w: 'ㅈ', e: 'ㄷ', r: 'ㄱ', t: 'ㅅ', y: 'ㅛ', u: 'ㅕ', i: 'ㅑ', o: 'ㅐ', p: 'ㅔ', a: 'ㅁ', s: 'ㄴ', d: 'ㅇ', f: 'ㄹ', g: 'ㅎ', h: 'ㅗ', j: 'ㅓ', k: 'ㅏ', l: 'ㅣ', z: 'ㅋ', x: 'ㅌ', c: 'ㅊ', v: 'ㅍ', b: 'ㅠ', n: 'ㅜ', m: 'ㅡ', Q: 'ㅃ', W: 'ㅉ', E: 'ㄸ', R: 'ㄲ', T: 'ㅆ', O: 'ㅒ', P: 'ㅖ' };
  const JUNG = ['ㅏ', 'ㅐ', 'ㅑ', 'ㅒ', 'ㅓ', 'ㅔ', 'ㅕ', 'ㅖ', 'ㅗ', 'ㅘ', 'ㅙ', 'ㅚ', 'ㅛ', 'ㅜ', 'ㅝ', 'ㅞ', 'ㅟ', 'ㅠ', 'ㅡ', 'ㅢ', 'ㅣ'];
  const JONG = ['', 'ㄱ', 'ㄲ', 'ㄳ', 'ㄴ', 'ㄵ', 'ㄶ', 'ㄷ', 'ㄹ', 'ㄺ', 'ㄻ', 'ㄼ', 'ㄽ', 'ㄾ', 'ㄿ', 'ㅀ', 'ㅁ', 'ㅂ', 'ㅄ', 'ㅅ', 'ㅆ', 'ㅇ', 'ㅈ', 'ㅊ', 'ㅋ', 'ㅌ', 'ㅍ', 'ㅎ'];
  const VV = { 'ㅗㅏ': 'ㅘ', 'ㅗㅐ': 'ㅙ', 'ㅗㅣ': 'ㅚ', 'ㅜㅓ': 'ㅝ', 'ㅜㅔ': 'ㅞ', 'ㅜㅣ': 'ㅟ', 'ㅡㅣ': 'ㅢ' };
  const CC = { 'ㄱㅅ': 'ㄳ', 'ㄴㅈ': 'ㄵ', 'ㄴㅎ': 'ㄶ', 'ㄹㄱ': 'ㄺ', 'ㄹㅁ': 'ㄻ', 'ㄹㅂ': 'ㄼ', 'ㄹㅅ': 'ㄽ', 'ㄹㅌ': 'ㄾ', 'ㄹㅍ': 'ㄿ', 'ㄹㅎ': 'ㅀ', 'ㅂㅅ': 'ㅄ' };
  const isV = (j) => JUNG.includes(j);
  // 자모 줄을 글자로 모은다
  function compose(jamo) {
    let out = '', i = 0;
    while (i < jamo.length) {
      const c = jamo[i];
      if (!CHO.includes(c) || !isV(jamo[i + 1])) {   // 초성+중성으로 시작하지 않으면 그대로
        if (isV(c) && isV(jamo[i + 1]) && VV[c + jamo[i + 1]]) { out += VV[c + jamo[i + 1]]; i += 2; } else { out += c; i++; }
        continue;
      }
      let v = jamo[i + 1], k = i + 2;
      if (VV[v + jamo[k]]) { v = VV[v + jamo[k]]; k++; }
      let t = '';
      // 받침: 다음 자모가 모음이 아니면 받침으로
      if (JONG.includes(jamo[k]) && jamo[k] && !isV(jamo[k + 1])) {
        t = jamo[k]; k++;
        if (CC[t + jamo[k]] && !isV(jamo[k + 1])) { t = CC[t + jamo[k]]; k++; }
      }
      out += String.fromCharCode(0xac00 + (CHO.indexOf(c) * 21 + JUNG.indexOf(v)) * 28 + JONG.indexOf(t));
      i = k;
    }
    return out;
  }
  const engToKor = (s) => /[a-z]/i.test(s) ? compose([...s].map((ch) => KEY[ch] || KEY[ch.toLowerCase()] || ch)) : s;
  const REV = {}; Object.keys(KEY).forEach((k) => { if (!REV[KEY[k]]) REV[KEY[k]] = k.toLowerCase(); });
  const SPLIT = {}; Object.keys(VV).forEach((k) => { SPLIT[VV[k]] = k; }); Object.keys(CC).forEach((k) => { SPLIT[CC[k]] = k; });
  function korToEng(s) {
    if (!/[ㄱ-ㅣ가-힣]/.test(s)) return s;
    let out = '';
    for (const ch of s) {
      const c = ch.charCodeAt(0);
      let jamo = [ch];
      if (c >= 0xac00 && c <= 0xd7a3) { const n = c - 0xac00; jamo = [CHO[Math.floor(n / 588)], JUNG[Math.floor((n % 588) / 28)], JONG[n % 28]].filter(Boolean); }
      for (const j of jamo) for (const x of (SPLIT[j] || j)) out += REV[x] || x;
    }
    return out;
  }
  // 검색어 + 자판을 바꿔 친 경우의 글자 (같으면 하나만)
  function variants(q) {
    const v = [String(q || '')];
    const k = engToKor(v[0]); if (k !== v[0] && /[가-힣]/.test(k)) v.push(k);
    const e = korToEng(v[0]); if (e !== v[0] && /^[a-z0-9\s]+$/i.test(e)) v.push(e);
    return v;
  }
  const isChoOnly = (s) => /^[ㄱ-ㅎ]+$/.test(s);

  // 마크다운 기호를 걷어낸 본문 (스니펫·검색용)
  function plain(md) {
    return String(md || '')
      .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
      .replace(/^\|?[-| :]+\|?$/gm, ' ')
      .replace(/[#>*|`]/g, ' ')
      .replace(/- \[ \]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  function prepare(doc, catName) {
    const body = plain(doc.body) + (doc.fileText ? ' ' + doc.fileText : '') + (doc.links || []).map((l) => ' ' + l.name + ' ' + l.url).join('');
    return {
      doc,
      title: norm(doc.title),
      titleCho: chosung(norm(doc.title)),
      aliases: (doc.aliases || []).map(norm),
      aliasesCho: (doc.aliases || []).map((a) => chosung(norm(a))),
      body: norm(body),
      bodyRaw: body,
      cat: norm(catName)
    };
  }

  function scoreToken(p, t) {
    let s = 0;
    if (isChoOnly(t)) {
      if (p.titleCho.includes(t)) s += p.titleCho.startsWith(t) ? 9 : 7;
      if (p.aliasesCho.some((a) => a.includes(t))) s += 6;
      return s;
    }
    if (p.title === t) s += 40;   // 제목이 정확히 같으면(예: 서류 이름) 맨 위로
    else if (p.title.startsWith(t)) s += 12;
    else if (p.title.includes(t)) s += 10;
    if (p.aliases.some((a) => a === t)) s += 10;
    else if (p.aliases.some((a) => a.includes(t))) s += 7;
    if (p.cat.includes(t)) s += 3;
    if (p.body.includes(t)) {
      const n = p.body.split(t).length - 1;
      s += 2 + Math.min(n, 6) * 0.5;
    }
    return s;
  }

  // 질문 전체를 붙여 쓴 형태도 함께 확인 ("체험 학습" → "체험학습")
  function run(docs, query, catNameOf) {
    const best = new Map();
    variants(String(query || '').trim()).forEach((v, i) => runOne(docs, v, catNameOf).forEach((r) => {
      if (i) r.score *= 0.9;   // 친 그대로 맞은 것을 조금 앞에
      const o = best.get(r.doc.id); if (!o || o.score < r.score) best.set(r.doc.id, r);
    }));
    return [...best.values()].sort((a, b) => b.score - a.score);
  }
  function runOne(docs, query, catNameOf) {
    const q = String(query || '').trim().toLowerCase();
    if (!q) return [];
    const tokens = q.split(/\s+/).filter(Boolean);
    const joined = norm(q);
    const prepared = docs.map((d) => prepare(d, catNameOf(d.category)));
    const out = [];
    for (const p of prepared) {
      let total = 0, ok = true;
      for (const t of tokens) {
        const s = scoreToken(p, t);
        if (!s) { ok = false; break; }
        total += s;
      }
      if (!ok && tokens.length > 1) {
        const s = scoreToken(p, joined);
        if (s) { ok = true; total = s; }
      }
      if (ok && total > 0) {
        total += Math.log10((p.doc.views || 0) + 1) * 0.4;
        const art = articleOf(p.doc, tokens);
        out.push({ doc: p.doc, score: total, snippet: snippet(p.bodyRaw, tokens), article: art, where: whereOf(p.doc, tokens, art) });
      }
    }
    return out.sort((a, b) => b.score - a.score);
  }

  // 규정 문서면 검색어가 처음 나오는 조문 제목 ("제15조 (결시자 성적 처리)")
  function articleOf(doc, tokens) {
    if (doc.format !== 'reg') return '';
    const raw = '\n' + String(doc.body || ''), low = raw.toLowerCase();
    let pos = -1;
    for (const t of tokens) { if (isChoOnly(t)) continue; pos = low.indexOf(t); if (pos >= 0) break; }
    if (pos < 0) return '';
    const h = raw.lastIndexOf('\n### ', pos);
    if (h < 0) return '';
    const e = raw.indexOf('\n', h + 5);
    return raw.slice(h + 5, e < 0 ? undefined : e);
  }

  // 글 속에서 검색어 자리 찾기: 주변 글(앞 22자·뒤 50자 남짓)과, PDF 에서 뽑은 글이면 그 쪽 번호
  function locate(text, tokens) {
    const raw = String(text || ''), low = raw.toLowerCase();
    const ts = [].concat(...tokens.map((t) => variants(t))).filter((t) => t && !isChoOnly(t));
    let pos = -1, len = 0;
    for (const t of ts) { const i = low.indexOf(t.toLowerCase()); if (i >= 0 && (pos < 0 || i < pos)) { pos = i; len = t.length; } }
    if (pos < 0) return null;
    const mk = raw.slice(0, pos).match(/\[(\d+)쪽\](?![\s\S]*\[\d+쪽\])/);
    const mEnd = mk ? raw.lastIndexOf(mk[0], pos) + mk[0].length : 0;   // 그 쪽 처음보다 앞(이전 쪽 글)은 빼고
    const start = Math.max(0, pos - 22, mEnd), end = Math.min(raw.length, pos + len + 50);
    const text2 = raw.slice(start, end).replace(/\[\d+쪽\]\s*/g, '').replace(/\s+/g, ' ').trim();
    return { text: (start > mEnd ? '… ' : '') + text2 + (end < raw.length ? ' …' : ''), page: mk ? +mk[1] : 0 };
  }
  // 문서에서 검색어가 나온 곳: 규정 조문 > 본문 > 첨부 파일 속 글(PDF 쪽) > 링크 > (제목만 맞으면) 본문 첫머리
  function whereOf(doc, tokens, art) {
    const body = plain(doc.body);
    let L = locate(body, tokens);
    if (L) return { src: art ? (art.match(/^제\s*\d+\s*조(의\s*\d+)?/) || [art])[0].replace(/\s+/g, '') : '본문', text: L.text };
    if (doc.fileText) { L = locate(doc.fileText, tokens); if (L) return { src: L.page ? `첨부 PDF ${L.page}쪽` : '첨부 파일', text: L.text }; }
    const ln = (doc.links || []).map((l) => l.name + ' ' + l.url).join(' · ');
    if (ln) { L = locate(ln, tokens); if (L) return { src: '링크', text: L.text }; }
    return { src: '', text: body.slice(0, 70) + (body.length > 70 ? ' …' : '') };
  }

  function snippet(text, tokens) {
    const low = text.toLowerCase();
    tokens = [].concat(...tokens.map((t) => variants(t)));
    let pos = -1;
    for (const t of tokens) {
      if (isChoOnly(t)) continue;
      pos = low.indexOf(t);
      if (pos >= 0) break;
    }
    if (pos < 0) return text.slice(0, 110);
    const start = Math.max(0, pos - 36);
    return (start > 0 ? '… ' : '') + text.slice(start, start + 120);
  }

  // 검색어 강조: HTML 이스케이프가 끝난 문자열에 <mark> 를 입힌다
  // 자판을 바꿔 친 글자로 찾은 것도 강조한다 ("ruftjr" → "결석")
  function highlight(escaped, query) {
    const tokens = [].concat(...variants(String(query || '').trim()).map((v) => v.split(/\s+/))).filter((t) => t && !isChoOnly(t) && !/[ㄱ-ㅣ]/.test(t));
    if (!tokens.length) return escaped;
    const re = new RegExp('(' + tokens.map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|') + ')', 'gi');
    return escaped.replace(re, '<mark>$1</mark>');
  }

  window.Search = { run, highlight, chosung, plain, variants, locate: (text, query) => locate(text, String(query || '').trim().toLowerCase().split(/\s+/).filter(Boolean)) };
})();
