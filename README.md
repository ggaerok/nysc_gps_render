# nysc_gps_render — GPS Viewer 2(Render)

**Render 로 배포하는 저장소**입니다. 같은 코드를 Vercel 로 배포하는 저장소는 [nysc_gps_vercel](https://github.com/ggaerok/nysc_gps_vercel) (GPS Viewer 1) 입니다.
두 저장소는 코드가 같고, 관리 페이지 타이틀과 배색(청록 계열)만 다릅니다. 코드를 고칠 때는 두 저장소에 똑같이 반영합니다.

내 휴대전화의 GPS 좌표를 **도 · 각분 · 각초**(각초는 소수 둘째 자리)로 실시간 표시하는 페이지입니다.
관리 페이지에서 **운영 시작 / 운영 종료**를 눌러 페이지가 동작할지 정합니다. (관리 방식은 Cosmos Ball `nysc_game1`과 같습니다.)

## 개인정보 원칙

- GPS 좌표는 **브라우저 화면에 그리는 데에만** 쓰입니다. 서버로 보내지도, 저장하지도 않습니다.
- 서버(`api/`)는 좌표를 받는 곳이 없고, **운영 상태(켜짐/꺼짐)와 관리 번호 오입력 횟수**만 저장합니다.
- 접속하면 먼저 안내문과 [동의]/[취소]가 나옵니다. [동의]를 눌러야 브라우저의 위치 권한 창이 뜨고, [취소]는 페이지를 닫습니다.

## 주소

| 주소 | 용도 | 공유 대상 |
|---|---|---|
| `/` | 관리 페이지 (운영 시작/종료) | 나만 |
| `/location` | GPS 좌표 페이지 (운영 중에만 동작, 아니면 흰 화면) | 나 |

`/location` 은 **처음 접속할 때 한 번만** 운영 여부를 확인합니다 (새로고침하면 다시 확인). 이미 열려 있는 화면은 관리 페이지에서 운영을 종료해도 새로고침하거나 닫기 전까지 계속 동작하고, 새로 접속하는 사람부터 흰 화면이 됩니다. 처음 확인에 실패하면 한 번 더 시도한 뒤 "연결할 수 없습니다" 로 닫힙니다.
저장소에 연결하지 못하면 `/location`은 항상 흰 화면(닫힘)입니다.

## 구조

```
public/index.html   관리 페이지 (관리 번호 입력 → 운영 시작/종료)
public/location.html    GPS 페이지 (안내문 → 동의/취소 → 좌표 표시)
public/dms.js       도 → 도·각분·각초 변환
api/status.js       GET/POST 운영 상태
api/auth.js         관리 번호 확인 (5회 오입력 시 1분 잠금)
lib/store.js        저장 (Vercel 은 Turso, Render 는 Redis, 로컬은 파일)
lib/auth.js         관리 번호 확인 (Cosmos Ball 과 동일)
lib/server.js       Node 서버 (로컬 개발과 Render 가 함께 사용)
dev/server.js       로컬 개발 서버
render/server.js    Render 배포용 실행 파일 (npm start)
test/dms.test.js    변환 시험
```

## 배포 (GitHub + Render)

- 서비스: Render Web Service `nysc-gps` — https://nysc-gps.onrender.com
- 설정: Runtime Node, Build `npm install`, Start `npm start`, 지역 Singapore, 이 저장소 `main` 브랜치 자동 배포
- 저장소: Render Key Value `nysc-gps-kv` (Valkey, Redis 호환)
- 환경변수: `REDIS_URL`(Key Value 의 Internal URL), `TABLE_PREFIX=gps_render`, `ADMIN_KEY`(관리 번호)
- 무료 Key Value 는 디스크에 보존하지 않아, 재시작되면 운영 상태가 지워지고 **운영 종료** 로 돌아갑니다. 운영 중이었다면 관리 페이지에서 다시 [운영 시작]을 누릅니다.
- 무료 웹 서비스는 15분간 접속이 없으면 잠들고, 다음 접속 때 깨어나는 데 30초~1분 걸립니다.
- Vercel(GPS Viewer 1)과 서버·저장소·운영 상태·관리 번호가 모두 따로입니다.

## 로컬 실행

```
npm install
npm run dev     # http://localhost:3000  (상태는 .dev-status.json 에 저장)
npm test        # 도·각분·각초 변환 시험
```
