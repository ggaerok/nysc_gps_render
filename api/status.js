// GET  /api/status                -> { open, changedAt, keyRequired }
// POST /api/status {open, key}    -> 운영 시작(true) / 종료(false)
// ADMIN_KEY 환경변수를 설정했다면 POST 에는 key 가 필요하다 (연속 5번 틀리면 1분간 429).
// GPS 좌표는 이 서버로 오지 않는다. 여기서 다루는 것은 운영 상태뿐이다.
const store = require('../lib/store');
const { keyRequired, bodyOf, guard } = require('../lib/auth');

function view(s, kr) { return { open: s.open, changedAt: s.changedAt, keyRequired: kr }; }

module.exports = async (req, res) => {
  res.setHeader('Cache-Control', 'no-store, max-age=0');
  const kr = keyRequired();
  try {
    if (req.method === 'GET') {
      const out = view(await store.getState(), kr);
      res.setHeader('Cache-Control', 'public, max-age=0, s-maxage=2');
      return res.status(200).json(out);
    }
    if (req.method === 'POST') {
      const body = bodyOf(req);
      if (typeof body.open !== 'boolean') return res.status(400).json({ error: 'open must be boolean', keyRequired: kr });
      const g = await guard(body.key);
      if (g) return res.status(g.status).json(g.body);
      const cur = await store.getState();
      if (body.open && cur.open) return res.status(409).json({ error: 'already_open', keyRequired: kr });
      return res.status(200).json(view(await store.setOpen(body.open), kr));
    }
    res.setHeader('Allow', 'GET, POST');
    return res.status(405).json({ error: 'method_not_allowed' });
  } catch (e) {
    return res.status(500).json({ error: e && e.code === 'STORAGE' ? 'storage_not_configured' : 'storage_error', keyRequired: kr });
  }
};
