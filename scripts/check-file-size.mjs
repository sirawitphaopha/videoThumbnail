// ตัวตรวจของตัวเฝ้าขนาดไฟล์ scripts/file-size.mjs (BUGS ข้อ 155 ขั้น 13 ผู้ช่วยตรวจทานเจอ)
// สร้างไฟล์ทดลองห้าแบบที่ตัวเฝ้าแบบเดิมนับพลาด รันตัวเฝ้า แล้วลบไฟล์ทดลองทิ้งทุกครั้ง (แม้ตัวตรวจล้ม)
// ก. คอมโพเนนต์ที่มีเนื้อเทมเพลตชิดซ้าย · ข. ก้อนที่ปิดด้วย "  });" ที่ย่อหน้า · ค. interface ยาว
// ง. ส่วนเทส Rust อยู่ต้นไฟล์แล้วมีโค้ดจริงต่อ (เดิมไม่นับส่วนหลัง ไฟล์เกิน 600 หลุดตัวกัน) · จ. ฟังก์ชัน Rust ปิดด้วย } // ความเห็น (เดิมนับเลยไปถึง } ถัดไป)
// ใช้: node scripts/check-file-size.mjs · ไม่ต้องเปิดโปรแกรม
import { writeFileSync, mkdirSync, rmSync, existsSync } from "fs";
import { execFileSync } from "child_process";
import { join } from "path";
import { fileURLToPath } from "url";

const ROOT = join(fileURLToPath(import.meta.url), "../..");
const rep = (n, f) => Array.from({ length: n }, (_, i) => f(i)).join("\n");
const T = { dir: join(ROOT, "src/__fstest"), rs1: join(ROOT, "src-tauri/src/__fstest.rs"), rs2: join(ROOT, "src-tauri/src/__fstest2.rs") };
const clean = () => { rmSync(T.dir, { recursive: true, force: true }); rmSync(T.rs1, { force: true }); rmSync(T.rs2, { force: true }); };
let pass = 0, fail = 0;
const check = (name, ok, detail = "") => { ok ? pass++ : fail++; console.log(`${ok ? "✅" : "❌"} ${name}${ok ? "" : " · " + detail}`); };

clean();
let out = "";
try {
  mkdirSync(T.dir, { recursive: true });
  writeFileSync(join(T.dir, "tpl.tsx"), `export function Tpl() {\n  const s = \`ก\n${rep(300, (i) => "บรรทัด" + i)}\n\`;\n  return <div>{s}</div>;\n}\n`);
  writeFileSync(join(T.dir, "close.ts"), `declare const make: (f: () => void) => void;\nexport const big = make(() => {\n${rep(300, (i) => "  const v" + i + " = " + i + ";")}\n  });\n`);
  writeFileSync(join(T.dir, "iface.ts"), `export interface Big {\n${rep(250, (i) => "  f" + i + ": number;")}\n}\n`);
  writeFileSync(T.rs1, `#[cfg(test)]\nmod helpers {\n}\n${rep(700, (i) => "pub const C" + i + ": u32 = " + i + ";")}\n`);
  writeFileSync(T.rs2, `fn small() {\n    let a = 1;\n} // จบ\n${rep(250, (i) => "// เว้น " + i)}\nfn other() {\n    let b = 2;\n}\n`);
  try { out = execFileSync(process.execPath, [join(ROOT, "scripts/file-size.mjs")], { cwd: ROOT, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }); }
  catch (e) { out = String(e.stdout ?? "") + String(e.stderr ?? ""); }
} finally {
  clean();
}
check("ก. คอมโพเนนต์ที่มีเนื้อเทมเพลตชิดซ้าย วัดได้ 305 บรรทัด", /src\/__fstest\/tpl\.tsx Tpl บรรทัด 1 ยาว 305 บรรทัด/.test(out));
check("ข. ก้อนที่ปิดด้วย \"  });\" วัดได้ 302 บรรทัด", /src\/__fstest\/close\.ts big บรรทัด 2 ยาว 302 บรรทัด/.test(out));
check("ค. interface ยาว 252 บรรทัดถูกวัด", /src\/__fstest\/iface\.ts Big บรรทัด 1 ยาว 252 บรรทัด/.test(out));
check("ง. ส่วนเทส Rust ต้นไฟล์ ไม่ทำให้โค้ดข้างหลังหลุดการนับ ไฟล์ 703 บรรทัดตก", /src-tauri\/src\/__fstest\.rs 703 บรรทัด เกิน 600/.test(out));
check("จ. ฟังก์ชัน Rust ที่ปิดด้วย } // ความเห็น ไม่ถูกนับเกิน", !/__fstest2\.rs small/.test(out));
check("ลบไฟล์ทดลองแล้ว ไม่มีไฟล์ __fstest ค้าง", !existsSync(T.dir) && !existsSync(T.rs1) && !existsSync(T.rs2));
console.log(`ผ่าน ${pass} จาก ${pass + fail} ข้อ`);
process.exit(fail ? 1 : 0);
