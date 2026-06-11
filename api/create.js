// /api/create — 調整さん・伝助にイベントを自動作成して URL を返す
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126 Safari/537.36';

module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });
  const { service, name, comment = '', candidates } = req.body || {};
  if (!service || !name || !Array.isArray(candidates) || candidates.length === 0) {
    return res.status(400).json({ error: 'service / name / candidates は必須です' });
  }
  const list = candidates.join('\n');
  try {
    if (service === 'chouseisan') {
      // 1) トップページから CSRF トークンとセッション Cookie を取得
      const top = await fetch('https://chouseisan.com/', { headers: { 'User-Agent': UA } });
      const setCookies = typeof top.headers.getSetCookie === 'function' ? top.headers.getSetCookie() : [];
      const cookie = setCookies.map(c => c.split(';')[0]).join('; ');
      const html = await top.text();
      const m = html.match(/name="_token"[^>]*value="([^"]+)"/) || html.match(/value="([^"]+)"[^>]*name="_token"/);
      if (!m) throw new Error('調整さんのCSRFトークンが見つかりません（仕様変更の可能性）');
      // 2) 作成POST → リダイレクト先からイベントIDを取得
      const r = await fetch('https://chouseisan.com/schedule/newEvent/create', {
        method: 'POST', redirect: 'manual',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'Cookie': cookie, 'User-Agent': UA, 'Referer': 'https://chouseisan.com/'
        },
        body: new URLSearchParams({ _token: m[1], name, comment, kouho: list })
      });
      const loc = r.headers.get('location') || '';
      const h = (loc.match(/[?&]h=([0-9a-f]+)/) || [])[1];
      if (!h) throw new Error('調整さんの作成に失敗しました（応答: ' + r.status + ' ' + loc + '）');
      return res.json({ url: 'https://chouseisan.com/s?h=' + h });
    }
    if (service === 'densuke') {
      const r = await fetch('https://www.densuke.biz/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'User-Agent': UA },
        body: new URLSearchParams({
          postfix: '', eventname: name, schedule: list, explain: comment,
          email: '', pw: '0', password: '', eventchoice: '1'
        })
      });
      const html = await r.text();
      const cd = (html.match(/list\?cd=([A-Za-z0-9]+)/) || [])[1];
      if (!cd) throw new Error('伝助の作成に失敗しました（応答にイベントURLが見つかりません）');
      return res.json({ url: 'https://www.densuke.biz/list?cd=' + cd });
    }
    return res.status(400).json({ error: '不明なサービス: ' + service });
  } catch (e) {
    return res.status(502).json({ error: String((e && e.message) || e) });
  }
};
