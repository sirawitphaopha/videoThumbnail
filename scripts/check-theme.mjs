// ความเข้มตัวหนังสือกับพื้นหลัง ตามเกณฑ์ WCAG AA · ปรับหน้าตาทั้งโปรแกรม 8 พ.ย. 2569
// ใช้: node scripts/check-theme.mjs · อ่านตัวแปรสีจาก src/styles/app.css ไม่ต้องเปิดโปรแกรม
import { readFileSync } from "node:fs";
const css = readFileSync("src/styles/app.css", "utf8");
const v = (n) => { const m = css.match(new RegExp(`--${n}: (#[0-9a-fA-F]{6})`)); if (!m) throw new Error("ไม่เจอตัวแปร " + n); return m[1]; };
const lum = (h) => { const c = [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16) / 255).map((x) => (x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4)); return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]; };
const ratio = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };
const pairs = [
  ["ตัวหนังสือหลัก บนพื้นขาว", v("txt"), v("win"), 4.5],
  ["ตัวหนังสือรอง บนพื้นขาว", v("txt2"), v("win"), 4.5],
  ["ตัวหนังสือจาง บนพื้นขาว", v("txt3"), v("win"), 4.5],
  ["ตัวหนังสือรอง บนพื้นเทา", v("txt2"), v("win2"), 4.5],
  ["ตัวหนังสือจาง บนพื้นเทา", v("txt3"), v("win2"), 4.5],
  ["ตัวเน้น บนพื้นขาว", v("accent-ink"), v("win"), 4.5],
  ["ตัวเน้น บนพื้นชมพูอ่อน", v("accent-ink"), v("accent-soft"), 4.5],
  ["ตัวขาว บนปุ่มหลัก", "#ffffff", v("accent"), 4.5],
  ["ตัวขาว บนปุ่มหลักตอนชี้", "#ffffff", v("accent-d"), 4.5],
  ["การ์ดเขียว", v("ok-ink"), v("ok-soft"), 4.5],
  ["การ์ดแดง", v("bad-ink"), v("bad-soft"), 4.5],
  ["การ์ดเหลือง", v("warn-ink"), v("warn-soft"), 4.5],
  ["การ์ดฟ้า", v("info-ink"), v("info-soft"), 4.5],
];
let bad = 0;
for (const [name, a, b, min] of pairs) {
  const r = ratio(a, b);
  const ok = r >= min;
  if (!ok) bad++;
  console.log(`${ok ? "✅" : "❌"} ${name} ${a} บน ${b} · ${r.toFixed(2)} (เกณฑ์ ${min})`);
}
console.log(`\nผ่าน ${pairs.length - bad} จาก ${pairs.length} ข้อ`);
process.exit(bad ? 1 : 0);
