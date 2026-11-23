// 운영 상태(켜짐/꺼짐)와 관리 번호 오입력 횟수만 저장한다. GPS 좌표는 서버로 오지 않으며 저장하지 않는다.
// 저장소 선택 (위에서부터 먼저 있는 것):
//   1) REDIS_URL                               (Redis. Render 배포에서 Render Key Value 로 사용)
//   2) TURSO_DATABASE_URL + TURSO_AUTH_TOKEN   (Turso, libSQL over HTTPS)  <- Vercel 배포에서 사용
//   3) STATUS_FILE                             (로컬 개발/시험용 파일. 배포에서는 쓰지 않음)
// 아무것도 없으면 오류(code 'STORAGE')를 던지고, 호출하는 쪽은 '운영 종료'로 취급한다 (fail-closed).
//
// 테이블 (처음 쓸 때 자동으로 만든다. 이름 앞에 TABLE_PREFIX 가 붙어 한 DB 를 여러 프로젝트가 나눠 써도 겹치지 않는다)
//   <P>_kv    (k, v)                   status(운영 상태 JSON)
//   <P>_auth  (id, n, exp, lock_until) 관리 번호 틀린 횟수와 잠금
// Redis 키 (같은 이름 규칙): <P>:status, <P>:auth:fails(만료 10분), <P>:auth:lock(만료 1분)
const fs = require('fs');

const TABLE_PREFIX = process.env.TABLE_PREFIX || 'gps';
const T_KV = TABLE_PREFIX + '_kv', T_AUTH = TABLE_PREFIX + '_auth';
const AUTH_MAX_FAILS = 5;
const AUTH_FAIL_TTL = 600000;
function authLockMs() { return Number(process.env.AUTH_LOCK_MS) > 0 ? Number(process.env.AUTH_LOCK_MS) : 60000; }

function notConfigured() { const e = new Error('storage_not_configured'); e.code = 'STORAGE'; return e; }

/* ---------- Redis ---------- */
let rclient = null, rready = null;
const R_STATUS = TABLE_PREFIX + ':status', R_FAILS = TABLE_PREFIX + ':auth:fails', R_LOCK = TABLE_PREFIX + ':auth:lock';
function redis() {
  const url = process.env.REDIS_URL;
  if (!url) return Promise.resolve(null);
  if (!rready) {
    let connected = false;
    rclient = require('redis').createClient({
      url,
      disableOfflineQueue: true,                       // 연결이 끊긴 동안 요청을 쌓아 두지 않고 바로 실패 -> 닫힘으로 처리
      socket: {
        connectTimeout: 5000,
        // 처음 연결에 실패하면 바로 오류(다음 요청 때 다시 시도), 연결된 뒤 끊기면 자동 재연결
        reconnectStrategy: (n, err) => (connected ? Math.min(n * 200, 3000) : err),
      },
    });
    rclient.on('ready', () => { connected = true; });
    rclient.on('error', (e) => console.error('redis error:', e && e.message));
    rready = rclient.connect().then(() => rclient).catch((e) => { rready = null; try { rclient.destroy(); } catch (x) {} throw e; });
  }
  return rready;
}

/* ---------- Turso ---------- */
let client = null, ready = null;
function tursoConfig() {
  const url = process.env.TURSO_DATABASE_URL;
  const token = process.env.TURSO_AUTH_TOKEN;
  if (!url) return null;
  if (/^file:/.test(url)) return { url, token: undefined };
  return token ? { url, token } : null;
}
function getClient(cfg) {
  if (client) return client;
  if (/^file:/.test(cfg.url)) client = require('@libsql/client').createClient({ url: cfg.url });
  else client = require('@libsql/client/web').createClient({ url: cfg.url.replace(/^libsql:/, 'https:'), authToken: cfg.token });
  return client;
}
function db() {
  const cfg = tursoConfig();
  if (!cfg) return Promise.resolve(null);
  const c = getClient(cfg);
  if (!ready) {
    ready = c.batch([
      'CREATE TABLE IF NOT EXISTS ' + T_KV + ' (k TEXT PRIMARY KEY, v TEXT)',
      'CREATE TABLE IF NOT EXISTS ' + T_AUTH + ' (id INTEGER PRIMARY KEY, n INTEGER NOT NULL DEFAULT 0, exp INTEGER NOT NULL DEFAULT 0, lock_until INTEGER NOT NULL DEFAULT 0)',
      'INSERT OR IGNORE INTO ' + T_AUTH + ' (id, n, exp, lock_until) VALUES (1, 0, 0, 0)',
    ], 'write').catch((e) => { ready = null; throw e; });
  }
  return ready.then(() => c);
}
const KV_SET = 'INSERT INTO ' + T_KV + ' (k, v) VALUES (?, ?) ON CONFLICT(k) DO UPDATE SET v = excluded.v';

function parseStatus(raw) {
  const base = { open: false, changedAt: 0 };
  if (!raw) return base;
  try {
    const v = typeof raw === 'string' ? JSON.parse(raw) : raw;
    return v ? { open: v.open === true, changedAt: Number(v.changedAt) || 0 } : base;
  } catch (e) { return base; }
}

/* ---------- 파일 저장소 (로컬 시험용) ---------- */
function fileRead() { try { return JSON.parse(fs.readFileSync(process.env.STATUS_FILE, 'utf8')); } catch (e) { return null; } }
function fileWrite(d) { fs.writeFileSync(process.env.STATUS_FILE, JSON.stringify(d)); }

/* ---------- 운영 상태 ---------- */
async function getState() {
  const r = await redis();
  if (r) return parseStatus(await r.get(R_STATUS));
  const c = await db();
  if (c) {
    const r = await c.execute({ sql: 'SELECT v FROM ' + T_KV + " WHERE k = 'status'", args: [] });
    return parseStatus(r.rows[0] && r.rows[0][0]);
  }
  if (process.env.STATUS_FILE) return parseStatus(fileRead());
  throw notConfigured();
}
async function setOpen(open) {
  const st = { open: open === true, changedAt: Date.now() };
  const r = await redis();
  if (r) { await r.set(R_STATUS, JSON.stringify(st)); return st; }
  const c = await db();
  if (c) { await c.execute({ sql: KV_SET, args: ['status', JSON.stringify(st)] }); return st; }
  if (process.env.STATUS_FILE) { fileWrite(st); return st; }
  throw notConfigured();
}

/* ---------- 관리 번호 입력 제한 ---------- */
function authFile() { return process.env.STATUS_FILE + '.auth'; }
function authFileRead() { try { const v = JSON.parse(fs.readFileSync(authFile(), 'utf8')); return { n: Number(v.n) || 0, until: Number(v.until) || 0 }; } catch (e) { return { n: 0, until: 0 }; } }
async function authLocked() {
  const r = await redis();
  if (r) { const t = await r.pTTL(R_LOCK); return t > 0 ? t : 0; }
  const c = await db();
  if (c) {
    const r = await c.execute({ sql: 'SELECT lock_until FROM ' + T_AUTH + ' WHERE id = 1', args: [] });
    const t = Number(r.rows[0] && r.rows[0][0]) - Date.now();
    return t > 0 ? t : 0;
  }
  if (process.env.STATUS_FILE) { const d = authFileRead(); return d.until > Date.now() ? d.until - Date.now() : 0; }
  throw notConfigured();
}
async function authFail() {
  const r = await redis();
  if (r) {
    const rs = await r.multi().incr(R_FAILS).pExpire(R_FAILS, AUTH_FAIL_TTL).exec();
    const n = Number(rs[0]) || 1;
    if (n >= AUTH_MAX_FAILS) {
      await r.multi().del(R_FAILS).set(R_LOCK, '1', { PX: authLockMs() }).exec();
      return { left: 0, lockedMs: authLockMs() };
    }
    return { left: AUTH_MAX_FAILS - n, lockedMs: 0 };
  }
  const c = await db();
  if (c) {
    const now = Date.now();
    const rs = await c.batch([
      { sql: 'UPDATE ' + T_AUTH + ' SET n = CASE WHEN exp < ? THEN 1 ELSE n + 1 END, exp = ? WHERE id = 1', args: [now, now + AUTH_FAIL_TTL] },
      { sql: 'SELECT n FROM ' + T_AUTH + ' WHERE id = 1', args: [] },
    ], 'write');
    const n = Number(rs[1].rows[0] && rs[1].rows[0][0]) || 1;
    if (n >= AUTH_MAX_FAILS) {
      await c.execute({ sql: 'UPDATE ' + T_AUTH + ' SET n = 0, lock_until = ? WHERE id = 1', args: [now + authLockMs()] });
      return { left: 0, lockedMs: authLockMs() };
    }
    return { left: AUTH_MAX_FAILS - n, lockedMs: 0 };
  }
  if (process.env.STATUS_FILE) {
    const d = authFileRead(); d.n += 1;
    if (d.n >= AUTH_MAX_FAILS) { fs.writeFileSync(authFile(), JSON.stringify({ n: 0, until: Date.now() + authLockMs() })); return { left: 0, lockedMs: authLockMs() }; }
    fs.writeFileSync(authFile(), JSON.stringify({ n: d.n, until: 0 }));
    return { left: AUTH_MAX_FAILS - d.n, lockedMs: 0 };
  }
  throw notConfigured();
}
async function authOk() {
  const r = await redis();
  if (r) { await r.del(R_FAILS); return; }
  const c = await db();
  if (c) { await c.execute({ sql: 'UPDATE ' + T_AUTH + ' SET n = 0 WHERE id = 1 AND n <> 0', args: [] }); return; }
  if (process.env.STATUS_FILE) { const d = authFileRead(); if (d.n) fs.writeFileSync(authFile(), JSON.stringify({ n: 0, until: d.until })); return; }
  throw notConfigured();
}

module.exports = { authLocked, authFail, authOk, AUTH_MAX_FAILS, getState, setOpen };
