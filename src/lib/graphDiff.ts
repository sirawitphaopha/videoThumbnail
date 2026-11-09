/* สองไฟล์ต่างกันกี่เปอร์เซ็นต์ ของหน้าเทียบสองไฟล์ (พี่กันสั่ง 9 พ.ย. 2569 "พอเทียบกันแล้ว มีสักที่ บอกหน่อยว่าสองกราฟนี้ ต่างกันกี่ %" · "เทียบได้ทั้ง เพลงเดียวกัน เพลงต่างกัน")
   ไม่มีมาตรฐานสากลของเลขนี้ เป็นดัชนีที่แคลร์ตั้ง · แต่ละกราฟวัดผลต่างเฉลี่ยของเส้นที่เห็น ต่างกัน 60 dB คิดเป็น 100%
   คิดจากข้อมูลภาพรวมที่อ่านแล้ว ไม่อ่านไฟล์เพิ่ม · ไม่ใช่การเทียบทุกตัวอย่างเสียง 0% จึงไม่ได้แปลว่าเหมือนทุกบิต
   ไฟล์ยาวไม่เท่ากันเทียบเท่าช่วงที่มีทั้งคู่ นับจากต้นไฟล์ · ช่องเสียงเทียบช่องชื่อเดียวกัน ไม่มีช่องร่วมเทียบรวมทุกช่อง
   ช่วงที่เงียบทั้งสองไฟล์ไม่นับ ไม่งั้นเพลงที่เงียบยาวดูเหมือนกันเกินจริง */

export type DiffOverview = { duration: number; cols: number; env: number[][]; specCols: number; specBins: number; spec: string[]; loud: number[] };
export type DiffSide = { ov: DiffOverview; names: string[]; rate: number };
export type DiffResult = { wave: number; spec: number; loud: number; cmp: number; psd: number; overall: number; secs: number; lenDiff: boolean };

/** ต่างกันเท่านี้ dB คิดเป็น 100% */
const FULL_DB = 60;
const QUIET_LINE = -60, QUIET_SPEC = -90, QUIET_PSD = -100;
const SLOTS = 400, SPEC_COLS = 200, SPEC_ROWS = 64, PSD_ROWS = 120, F_LOW = 20, F_HIGH = 20000;

const toDb = (a: number) => (a <= 1e-6 ? -120 : 20 * Math.log10(a));
const unbase64 = (s: string) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
const byteDb = (v: number) => v / 255 * 120 - 120;

/** ค่าต่อช่วงเวลา · pick รับเลขคอลัมน์แล้วคืนค่า ใช้ค่ามากสุดหรือเฉลี่ยตาม how */
function slots(ov: DiffOverview, secs: number, how: "max" | "mean", pick: (col: number) => number): Float64Array {
  const out = new Float64Array(SLOTS), k = ov.cols / (ov.duration || 1);
  for (let i = 0; i < SLOTS; i++) {
    const c0 = Math.min(ov.cols - 1, Math.floor(secs * i / SLOTS * k)), c1 = Math.max(c0 + 1, Math.min(ov.cols, Math.ceil(secs * (i + 1) / SLOTS * k)));
    let v = how === "max" ? 0 : 0, n = 0;
    for (let c = c0; c < c1; c++) { const x = pick(c); v = how === "max" ? Math.max(v, x) : v + x; n++; }
    out[i] = how === "max" ? v : v / Math.max(1, n);
  }
  return out;
}

/** เปอร์เซ็นต์จากผลรวมผลต่าง */
const pctOf = (sum: number, n: number) => (n ? Math.min(100, sum / n / FULL_DB * 100) : 0);

function linePct(a: Float64Array, b: Float64Array) {
  let sum = 0, n = 0;
  for (let i = 0; i < a.length; i++) {
    const x = Math.max(QUIET_LINE, a[i]), y = Math.max(QUIET_LINE, b[i]);
    if (x <= QUIET_LINE && y <= QUIET_LINE) continue;
    sum += Math.abs(x - y); n++;
  }
  return pctOf(sum, n);
}

/** คู่ช่องที่เทียบกัน · ช่องชื่อเดียวกัน หรือรวมทุกช่องเมื่อไม่มีช่องร่วม */
function channelPairs(A: DiffSide, B: DiffSide): [number[], number[]][] {
  const common = A.names.filter((c) => B.names.includes(c));
  if (common.length) return common.map((c) => [[A.names.indexOf(c)], [B.names.indexOf(c)]]);
  return [[A.names.map((_, i) => i), B.names.map((_, i) => i)]];
}

/** ค่า dB ของไบต์ความถี่ที่เวลาและความถี่นั้น รวมหลายช่องด้วยค่ามากสุด */
function specAt(ov: DiffOverview, data: Uint8Array[], rate: number, col: number, f: number) {
  const bin = Math.min(ov.specBins - 1, Math.floor(f / (rate / 2) * ov.specBins));
  let m = 0;
  for (const d of data) m = Math.max(m, d[col * ov.specBins + bin] ?? 0);
  return byteDb(m);
}

export function diffOf(A: DiffSide, B: DiffSide): DiffResult {
  const a = A.ov, b = B.ov;
  const secs = Math.min(a.duration, b.duration);
  const lenDiff = Math.abs(a.duration - b.duration) > Math.max(1, Math.max(a.duration, b.duration) * 0.01);
  const pairs = channelPairs(A, B);
  const peakAt = (ov: DiffOverview, chs: number[]) => (c: number) => { let m = 0; for (const i of chs) { const e = ov.env[i]; if (e) m = Math.max(m, Math.abs(e[c * 3]), Math.abs(e[c * 3 + 1])); } return m; };
  const powerAt = (ov: DiffOverview, chs: number[]) => (c: number) => { let s = 0; for (const i of chs) { const e = ov.env[i]; if (e) s += e[c * 3 + 2] ** 2; } return s / Math.max(1, chs.length); };

  let wave = 0, cmp = 0;
  for (const [ca, cb] of pairs) {
    wave += linePct(slots(a, secs, "max", peakAt(a, ca)).map(toDb), slots(b, secs, "max", peakAt(b, cb)).map(toDb));
    cmp += linePct(slots(a, secs, "mean", powerAt(a, ca)).map((p) => toDb(Math.sqrt(p))), slots(b, secs, "mean", powerAt(b, cb)).map((p) => toDb(Math.sqrt(p))));
  }
  wave /= pairs.length; cmp /= pairs.length;

  // ความดังเฉลี่ยเป็นพลังงาน ไม่ใช่เฉลี่ยค่า dB ตรง ๆ
  const loudSlots = (ov: DiffOverview) => slots(ov, secs, "mean", (c) => Math.pow(10, (ov.loud[c] ?? -70) / 10)).map((e) => 10 * Math.log10(Math.max(e, 1e-12)));
  const loud = linePct(loudSlots(a), loudSlots(b));

  // ความถี่ แกนล็อก ถึง 20 kHz หรือครึ่งอัตราสุ่มของไฟล์ที่ต่ำกว่า
  const fTop = Math.min(A.rate / 2, B.rate / 2, F_HIGH);
  const fOf = (row: number, rows: number) => F_LOW * Math.pow(fTop / F_LOW, (row + 0.5) / rows);
  const colOf = (ov: DiffOverview, t: number) => Math.min(ov.specCols - 1, Math.floor(t / (ov.duration || 1) * ov.specCols));
  let specSum = 0, specN = 0, psdSum = 0, psdN = 0;
  for (const [ca, cb] of pairs) {
    const da = ca.map((i) => unbase64(a.spec[i] ?? "")), db = cb.map((i) => unbase64(b.spec[i] ?? ""));
    for (let x = 0; x < SPEC_COLS; x++) {
      const t = secs * (x + 0.5) / SPEC_COLS, ka = colOf(a, t), kb = colOf(b, t);
      for (let r = 0; r < SPEC_ROWS; r++) {
        const f = fOf(r, SPEC_ROWS), va = specAt(a, da, A.rate, ka, f), vb = specAt(b, db, B.rate, kb, f);
        if (va <= QUIET_SPEC && vb <= QUIET_SPEC) continue;
        specSum += Math.min(FULL_DB, Math.abs(va - vb)); specN++;
      }
    }
    for (let r = 0; r < PSD_ROWS; r++) {
      const f = fOf(r, PSD_ROWS); let ma = 0, mb = 0;
      for (let x = 0; x < SPEC_COLS; x++) { const t = secs * (x + 0.5) / SPEC_COLS; ma += specAt(a, da, A.rate, colOf(a, t), f); mb += specAt(b, db, B.rate, colOf(b, t), f); }
      ma /= SPEC_COLS; mb /= SPEC_COLS;
      if (ma <= QUIET_PSD && mb <= QUIET_PSD) continue;
      psdSum += Math.min(FULL_DB, Math.abs(ma - mb)); psdN++;
    }
  }
  const spec = pctOf(specSum, specN), psd = pctOf(psdSum, psdN);
  return { wave, spec, loud, cmp, psd, overall: (wave + spec + loud + cmp + psd) / 5, secs, lenDiff };
}
