// /api/create — 調整さん・伝助にイベントを自動作成して URL を返す
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';
const COMMON = {
  'User-Agent': UA,
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'Accept-Language': 'ja,en-US;q=0.8,en;q=0.6'
};

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
      const top = await fetch('https://chouseisan.com/', { headers: COMMON, redirect: 'follow' });
      const setCookies = typeof top.headers.getSetCookie === 'function' ? top.headers.getSetCookie() : [];
      const cookie = setCookies.map(c => c.split(';')[0]).join('; ');
      const html = await top.text();
      // トークン取得（HTML複数パターン → XSRF-TOKEN Cookie）
      const token =
        (html.match(/name=["']_token["'][^>]*value=["']([^"']+)/) || [])[1] ||
        (html.match(/value=["']([^"']+)["'][^>]*name=["']_token["']/) || [])[1] ||
        (html.match(/<meta[^>]*name=["']csrf-token["'][^>]*content=["']([^"']+)/) || [])[1] || null;
      let xsrf = null;
      for (const c of setCookies) {
        const m = c.match(/^XSRF-TOKEN=([^;]+)/);
        if (m) xsrf = decodeURIComponent(m[1]);
      }
      if (!token && !xsrf) {
        return res.status(502).json({
          error: '調整さんのトークンが取得できません（Bot対策の可能性）',
          debug: { status: top.status, cookies: setCookies.length, htmlLen: html.length, hasForm: html.includes('newEvent'), sample: html.slice(0, 200) }
        });
      }
      // 2) 作成POST → リダイレクト先からイベントIDを取得
      const headers = {
        ...COMMON,
        'Content-Type': 'application/x-www-form-urlencoded',
        'Cookie': cookie,
        'Origin': 'https://chouseisan.com',
        'Referer': 'https://chouseisan.com/'
      };
      if (xsrf) headers['X-XSRF-TOKEN'] = xsrf;
      const body = new URLSearchParams({ name, comment, kouho: list });
      if (token) body.set('_token', token);
      const r = await fetch('https://chouseisan.com/schedule/newEvent/create', {
        method: 'POST', redirect: 'manual', headers, body
      });
      const loc = r.headers.get('location') || '';
      const h = (loc.match(/[?&]h=([0-9a-f]+)/) || [])[1];
      if (!h) {
        const t = await r.text().catch(() => '');
        return res.status(502).json({
          error: '調整さんの作成に失敗しました',
          debug: { status: r.status, location: loc, usedToken: !!token, usedXsrf: !!xsrf, sample: t.slice(0, 200) }
        });
      }
      return res.json({ url: 'https://chouseisan.com/s?h=' + h });
    }
    if (service === 'densuke') {
      const r = await fetch('https://www.densuke.biz/create', {
        method: 'POST',
        headers: { ...COMMON, 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          postfix: '', eventname: name, schedule: list, explain: comment,
          email: '', pw: '0', password: '', eventchoice: '1'
        })
      });
      const html = await r.text();
      const cd = (html.match(/list\?cd=([A-Za-z0-9]+)/) || [])[1];
      if (!cd) return res.status(502).json({ error: '伝助の作成に失敗しました（応答にイベントURLが見つかりません）' });
      return res.json({ url: 'https://www.densuke.biz/list?cd=' + cd });
    }
    return res.status(400).json({ error: '不明なサービス: ' + service });
  } catch (e) {
    return res.status(502).json({ error: String((e && e.message) || e) });
  }
};
