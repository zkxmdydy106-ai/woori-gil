/* 언어 데이터(.gz)는 게시 형식 제한으로 base64 텍스트로 올려 두었으므로, 워커 안에서 받아 원래 바이트로 되돌려 준다 */
(function () {
  var base = self.location.href.replace(/[^/]*$/, '');
  var origFetch = self.fetch.bind(self);
  self.fetch = function (url, opt) {
    if (typeof url === 'string' && /kor\.traineddata\.gz$/.test(url)) {
      return origFetch(base + 'kor-traineddata-gz.b64.txt').then(function (r) { return r.text(); }).then(function (t) {
        var bin = atob(t.trim()), u = new Uint8Array(bin.length);
        for (var i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i);
        return new Response(u, { status: 200 });
      });
    }
    return origFetch(url, opt);
  };
  importScripts(base + 'worker.min.js');
})();
