// Render 배포용 실행 파일 (npm start). Vercel 배포와 같은 페이지·API 를 제공한다.
// 운영 상태는 Render Key Value(REDIS_URL)에 저장하며 Vercel(Turso)과 완전히 분리된다.
// REDIS_URL 이 없거나 연결되지 않으면 /location 은 항상 닫힘(흰 화면)으로 동작한다.
delete process.env.STATUS_FILE;   // 배포에서는 파일 저장소를 쓰지 않는다 (재시작 시 사라지고 Vercel 과 공유되지 않음)
require('../lib/server').start(Number(process.env.PORT) || 10000, '0.0.0.0');

// 시작할 때 저장소 연결을 한 번 확인해 로그에 남긴다 (좌표와 무관, 운영 상태만 확인)
require('../lib/store').getState()
  .then((s) => console.log('storage ok: ' + (process.env.REDIS_URL ? 'redis' : 'turso') + ', open=' + s.open))
  .catch((e) => console.error('storage check failed: ' + ((e && (e.code || e.message)) || e)));
