// local.js: 생기부 도우미 체험판 — Core.js 가 쓰는 저장소를 이 브라우저(localStorage)로 바꾼다.
// 예시 학생(가상)만 다루며 어디로도 보내지 않는다. build.mjs 가 Index.html 에 Core.js 와 함께 넣는다.
const STORE_ = (() => {
  const mem = {};
  const k = (n) => 'sgb.v1.' + n;
  return {
    read(n) { try { const v = localStorage.getItem(k(n)); return v ? JSON.parse(v) : null; } catch (e) { return n in mem ? JSON.parse(mem[n]) : null; } },
    write(n, o) { const s = JSON.stringify(o); try { localStorage.setItem(k(n), s); } catch (e) { mem[n] = s; } },
    remove(n) { try { localStorage.removeItem(k(n)); } catch (e) { delete mem[n]; } }
  };
})();
function withLock_(fn) { return fn(); }
function whoami_() { return ''; }
function collectItems_(cls, me) { return cls.sourceType === '예시' ? sampleItems_(me) : []; }
function extractText_() { return { ok: false, reason: '체험판에서는 파일을 읽지 않아요.' }; }
const NO_DRIVE = '체험판에서는 Google Drive 를 쓰지 않아요. 내 Classroom 계정으로 열어 주세요.';
function listMyCourses() { return { ok: false, reason: '체험판에서는 Classroom 을 열 수 없어요.' }; }
function ensureExtraFolder() { throw new Error(NO_DRIVE); }
function saveFileToDrive() { throw new Error(NO_DRIVE); }
function myFolderUrl() { throw new Error(NO_DRIVE); }
