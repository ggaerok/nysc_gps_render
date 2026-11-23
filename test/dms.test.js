const assert = require('assert');
const { toDMS } = require('../public/dms.js');
const t = (v, lat) => { const r = toDMS(v, lat); return `${r.dir} ${r.d} ${r.m} ${r.s}`; };
assert.strictEqual(t(37.5665, true), 'N 37 33 59.40');
assert.strictEqual(t(126.978, false), 'E 126 58 40.80');
assert.strictEqual(t(-33.8688, true), 'S 33 52 7.68');
assert.strictEqual(t(-0.000277, false), 'W 0 0 1.00');
assert.strictEqual(t(37.99999999, true), 'N 38 0 0.00');   // 60.00초가 나오면 안 됨
assert.strictEqual(t(10.99999999, true), 'N 11 0 0.00');
assert.strictEqual(t(10.9999861, true), 'N 10 59 59.95');
assert.strictEqual(t(0, true), 'N 0 0 0.00');
console.log('dms ok');
