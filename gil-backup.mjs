// gil-backup.mjs — 학교 자료 백업·되살리기: 문서(D1)는 .sql 로, 올린 파일(KV)은 files/ 폴더에 하나씩.
// 파일은 한 번 올리면 내용이 바뀌지 않아(새 판은 새 id) 다음 백업부터는 새로 생긴 것만 받는다.
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const FILES = 'files', MANIFEST = '_manifest.json';
const ALL_TABLES = ['docs', 'cats', 'reports', 'lessons', 'tools', 'props', 'meta', 'files'];

function call({ wrangler, cwd }, args, binary) {
  const r = spawnSync(wrangler[0], [...wrangler.slice(1), ...args], { cwd, encoding: binary ? 'buffer' : 'utf8', maxBuffer: 64 * 1024 * 1024, shell: false, env: Object.assign({}, process.env, { WRANGLER_SEND_METRICS: 'false' }) });
  if (r.error) throw r.error;
  if (r.status !== 0) {
    const lines = (String(r.stderr || '') + '\n' + String(r.stdout || '')).split('\n');
    throw new Error('wrangler ' + args.slice(0, 3).join(' ') + ' 실패: ' + (lines.find((l) => /\[ERROR\]|\berror:/i.test(l.replace(/\x1b\[[0-9;]*m/g, ''))) || lines.filter(Boolean).pop() || '').replace(/\x1b\[[0-9;]*m/g, '').trim().slice(0, 200));
  }
  return r.stdout;
}
// Cloudflare 가 잠깐 거절해도 전체가 실패하지 않게 조금 쉬었다가 세 번까지
function retry(fn) {
  for (let i = 0; ; i++) {
    try { return fn(); } catch (e) {
      if (i === 2) throw e;
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 3000 * (i + 1));
    }
  }
}
const jsonOf = (s) => JSON.parse(s.slice(s.indexOf('[')));
const keyFile = (dir, key) => path.join(dir, FILES, encodeURIComponent(key));

// 표의 크기와 맞는지까지 확인하고, 하나라도 못 받으면 오류를 낸다 (반쪽 백업을 성공으로 알리지 않게)
export function backupAll(o) {
  const { db, kv, dir, sqlName, log = () => {} } = o;
  fs.mkdirSync(path.join(dir, FILES), { recursive: true });
  const sql = path.join(dir, sqlName);
  retry(() => call(o, ['d1', 'export', db, '--remote', '--output', sql]));
  if (!fs.existsSync(sql) || !fs.readFileSync(sql, 'utf8').includes('CREATE TABLE')) throw new Error('문서 백업 파일이 비어 있어요: ' + sqlName);
  log('문서 저장: ' + sqlName + ' (' + Math.round(fs.statSync(sql).size / 1024) + 'KB)');

  const keys = jsonOf(call(o, ['kv', 'key', 'list', '--namespace-id', kv])).map((k) => k.name).filter((k) => !k.startsWith('tmp_'));
  const sizes = {};
  for (const f of jsonOf(call(o, ['d1', 'execute', db, '--remote', '--json', '--command', 'SELECT id, size FROM files']))[0].results) sizes[f.id] = f.size;
  let added = 0; const bad = [];
  for (const key of keys) {
    const file = keyFile(dir, key);
    if (fs.existsSync(file) && fs.statSync(file).size > 0 && (sizes[key] == null || fs.statSync(file).size === sizes[key])) continue;
    try {
      const buf = retry(() => {
        const b = call(o, ['kv', 'key', 'get', key, '--namespace-id', kv], true);
        if (!b.length || (sizes[key] != null && b.length !== sizes[key])) throw new Error('크기가 달라요');
        return b;
      });
      fs.writeFileSync(file + '.part', buf); fs.renameSync(file + '.part', file);
      added++;
    } catch (e) { bad.push(key + ': ' + e.message); }
  }
  const missing = Object.keys(sizes).filter((id) => !keys.includes(id));
  let bytes = 0;
  const list = keys.filter((k) => fs.existsSync(keyFile(dir, k))).map((key) => { const size = fs.statSync(keyFile(dir, key)).size; bytes += size; return { key, size }; });
  fs.writeFileSync(path.join(dir, FILES, MANIFEST), JSON.stringify({ at: new Date().toISOString(), sql: sqlName, files: list }, null, 1));
  log('파일 저장: 모두 ' + list.length + '개 (' + (bytes / 1048576).toFixed(1) + 'MB), 이번에 새로 받은 것 ' + added + '개');
  if (missing.length) log('주의: 목록에는 있는데 저장소에 없는 파일 ' + missing.length + '개');
  if (bad.length) throw new Error('파일 ' + bad.length + '개를 받지 못했어요. ' + bad.slice(0, 3).join(' / '));
  return { sql, total: list.length, added, bytes, missing: missing.length };
}

// D1 은 SQL 한 문장이 100KB 를 넘으면 받지 않는다. 내려받은 백업에는 그보다 긴 문서 줄이 있어서, 긴 글은 나눠서 이어 붙이는 문장으로 바꾼다.
const MAX_STMT = 80000;
function splitChunks(v) {
  const out = []; let from = 0, bytes = 0;
  for (let i = 0; i < v.length; i++) {
    const c = v.charCodeAt(i);
    if (bytes >= MAX_STMT && !(c >= 0xdc00 && c <= 0xdfff)) {
      let q = 0; for (let j = i - 1; j >= from && v[j] === "'"; j--) q++;   // '' 를 반으로 자르지 않게
      if (q % 2 === 0) { out.push(v.slice(from, i)); from = i; bytes = 0; }
    }
    bytes += c < 0x80 ? 1 : c < 0x800 ? 2 : c >= 0xd800 && c <= 0xdfff ? 2 : 3;
  }
  out.push(v.slice(from));
  return out;
}
export function splitLongStatements(text) {
  return text.split('\n').map((line) => {
    if (Buffer.byteLength(line) <= MAX_STMT) return line;
    const m = /^INSERT INTO "(\w+)" \("id","data"\) VALUES\('([^']*(?:''[^']*)*)','([^']*(?:''[^']*)*)'\);\r?$/.exec(line);
    if (!m) throw new Error('너무 긴 줄을 나누지 못했어요: ' + line.slice(0, 60));
    const [first, ...rest] = splitChunks(m[3]);
    return [`INSERT INTO "${m[1]}" ("id","data") VALUES('${m[2]}','${first}');`, ...rest.map((c) => `UPDATE "${m[1]}" SET "data" = "data" || '${c}' WHERE "id" = '${m[2]}';`)].join('\n');
  }).join('\n');
}

// 지금 저장소를 백업 내용으로 바꾼다. 부르는 쪽에서 먼저 현재 상태를 백업하고 확인을 받는다.
export function restoreAll(o) {
  const { db, kv, dir, sql, log = () => {} } = o;
  if (!fs.existsSync(sql)) throw new Error('백업 파일을 찾지 못했어요: ' + sql);
  const text = fs.readFileSync(sql, 'utf8');
  if (!text.includes('CREATE TABLE')) throw new Error('문서 백업 파일이 아니에요: ' + sql);
  const tmp = sql + '.restore.sql';
  fs.writeFileSync(tmp, ALL_TABLES.map((t) => `DROP TABLE IF EXISTS ${t};`).join('\n') + '\n' + splitLongStatements(text));
  try { call(o, ['d1', 'execute', db, '--remote', '--yes', '--file', tmp]); } finally { fs.rmSync(tmp, { force: true }); }
  log('문서를 되살렸어요');
  // 목록 파일이 아니라 폴더 전체를 본다. 되살리기 직전 백업은 사고로 지워진 파일을 목록에서 빼기 때문 (폴더의 파일은 지우지 않음)
  const folder = path.join(dir, FILES);
  const list = fs.existsSync(folder) ? fs.readdirSync(folder).filter((f) => f !== MANIFEST && !f.endsWith('.part')).map((f) => ({ key: decodeURIComponent(f) })) : [];
  const have = new Set(jsonOf(call(o, ['kv', 'key', 'list', '--namespace-id', kv])).map((k) => k.name));
  let put = 0;
  for (const { key } of list) {
    if (have.has(key)) continue;
    retry(() => call(o, ['kv', 'key', 'put', key, '--namespace-id', kv, '--path', keyFile(dir, key)]));
    put++;
  }
  log('파일 ' + put + '개를 되살렸어요 (이미 있던 ' + (list.length - put) + '개는 그대로)');
  return { put, total: list.length };
}
