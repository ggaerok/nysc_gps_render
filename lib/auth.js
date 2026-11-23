// 관리 번호 확인. ADMIN_KEY 환경변수(예: 4자리 번호)가 없으면 누구나 허용한다.
// 연속 5번 틀리면 1분간 입력을 막는다 (잠금 상태는 저장소에 있어서 서버가 여러 개여도 함께 적용된다).
const crypto = require('crypto');
const store = require('./store');

function keyRequired() { return !!process.env.ADMIN_KEY; }
function keyOk(provided) {
  const k = process.env.ADMIN_KEY;
  if (!k) return true;
  if (typeof provided !== 'string') return false;
  const a = Buffer.from(provided), b = Buffer.from(k);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}
function bodyOf(req) {
  let b = req.body;
  if (typeof b === 'string') { try { b = JSON.parse(b); } catch (e) { b = {}; } }
  return b && typeof b === 'object' ? b : {};
}
// 허용이면 null, 아니면 { status, body } (그대로 응답에 쓴다). 저장소 오류는 예외로 던진다.
async function guard(provided) {
  if (!keyRequired()) return null;
  const locked = await store.authLocked();
  if (locked > 0) return { status: 429, body: { error: 'locked', retryAfter: Math.ceil(locked / 1000), keyRequired: true } };
  if (keyOk(provided)) { await store.authOk(); return null; }
  const f = await store.authFail();
  if (f.lockedMs > 0) return { status: 429, body: { error: 'locked', retryAfter: Math.ceil(f.lockedMs / 1000), keyRequired: true } };
  return { status: 401, body: { error: 'unauthorized', left: f.left, keyRequired: true } };
}
module.exports = { keyRequired, keyOk, bodyOf, guard };
