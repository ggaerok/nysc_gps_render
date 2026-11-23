// GET  /api/auth           -> { keyRequired, locked, retryAfter }
// POST /api/auth { key }   -> 200 { ok:true } | 401 { error:'unauthorized', left } | 429 { error:'locked', retryAfter }
// 관리 페이지의 번호 입력 화면이 쓴다. 연속 5번 틀리면 1분간 잠긴다.
const store = require('../lib/store');
const { keyRequired, bodyOf, guard } = require('../lib/auth');

module.exports = async (req, res) => {
  res.setHeader('Cache-Control', 'no-store, max-age=0');
  const kr = keyRequired();
  try {
    if (req.method === 'GET') {
      const ms = kr ? await store.authLocked() : 0;
      return res.status(200).json({ keyRequired: kr, locked: ms > 0, retryAfter: Math.ceil(ms / 1000) });
    }
    if (req.method === 'POST') {
      const g = await guard(bodyOf(req).key);
      if (g) return res.status(g.status).json(g.body);
      return res.status(200).json({ ok: true, keyRequired: kr });
    }
    res.setHeader('Allow', 'GET, POST');
    return res.status(405).json({ error: 'method_not_allowed' });
  } catch (e) {
    return res.status(500).json({ error: e && e.code === 'STORAGE' ? 'storage_not_configured' : 'storage_error', keyRequired: kr });
  }
};
