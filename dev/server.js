// 로컬 개발용 서버: npm run dev -> http://localhost:3000
// 저장소 환경변수가 없으면 .dev-status.json 파일에 상태를 저장한다.
const path = require('path');
if (!process.env.TURSO_DATABASE_URL && !process.env.STATUS_FILE) process.env.STATUS_FILE = path.join(__dirname, '..', '.dev-status.json');
require('../lib/server').start(Number(process.env.PORT) || 3000);
