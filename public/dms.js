// 십진수 '도' -> 도/각분/각초 (각초는 소수 둘째 자리까지).
// 반올림을 먼저 1/100초 정수로 한 뒤 나눠서, 59.999초가 '60.00초'로 보이는 오류를 막는다.
function toDMS(value, isLat) {
  const total = Math.round(Math.abs(value) * 3600 * 100);
  const d = Math.floor(total / 360000);
  const m = Math.floor((total % 360000) / 6000);
  const s = (total % 6000) / 100;
  const dir = isLat ? (value >= 0 ? 'N' : 'S') : (value >= 0 ? 'E' : 'W');
  return { d: d, m: m, s: s.toFixed(2), dir: dir };
}
if (typeof module !== 'undefined') module.exports = { toDMS };
