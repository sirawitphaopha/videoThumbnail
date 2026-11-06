// เตรียมโฟลเดอร์ทดสอบชั้นวาง (แผนขั้น 2) ในโฟลเดอร์ชั่วคราว ไม่แตะ test-media
//   <TEMP>/ชั้นทดสอบ/หนัง        สำเนาหนังทดสอบทุกชนิดที่รับ + โฟลเดอร์ย่อย
//                    /ไฟล์เดิม     ต้องไม่ขึ้นชั้น
//                    /ดาวเหนือ (2023) แยกไฟล์   ต้องไม่ขึ้นชั้น
//   <TEMP>/ชั้นทดสอบ/500เรื่อง    หนังสั้นมาก 500 ไฟล์ มีปกครึ่งหนึ่ง ไว้เทสว่าชั้นไม่ค้าง
// ใช้: node scripts/make-shelf-test.mjs   (เรียกผ่าน . dev.ps1 ให้ TEMP อยู่ไดรฟ์ D)
import { spawnSync } from "node:child_process";
import { mkdirSync, copyFileSync, readdirSync, rmSync, existsSync, writeFileSync } from "node:fs";
import { join, dirname, extname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const SRC = join(root, "test-media", "สร้าง", "หนัง");
const IMG = join(root, "test-media", "สร้าง", "รูป");
const FF = join(root, "src-tauri", "tools", "ffmpeg.exe");
const OUT = join(process.env.TEMP ?? "D:\\dev\\tmp", "ชั้นทดสอบ");
const ACCEPTED = ["mkv", "mp4", "m4v", "mov", "avi", "webm", "ts", "m2ts", "mpg", "mpeg", "vob", "flv"];
if (!existsSync(SRC)) { console.log("ไม่มีไฟล์ทดสอบ รัน node scripts/make-test-media.mjs ก่อน"); process.exit(1); }

rmSync(OUT, { recursive: true, force: true });
const M = join(OUT, "หนัง");
mkdirSync(join(M, "ไฟล์เดิม"), { recursive: true });
mkdirSync(join(M, "ดาวเหนือ (2023) แยกไฟล์"), { recursive: true });
mkdirSync(join(M, "ซีรีส์", "ซีซัน 1"), { recursive: true });
let n = 0;
for (const f of readdirSync(SRC)) {
  if (ACCEPTED.includes(extname(f).slice(1).toLowerCase())) { copyFileSync(join(SRC, f), join(M, f)); n++; }
}
copyFileSync(join(SRC, "Clip (2015).flv"), join(M, "ไฟล์เดิม", "Clip (2015).flv"));
copyFileSync(join(SRC, "Clip (2015).flv"), join(M, "ดาวเหนือ (2023) แยกไฟล์", "แยก.flv"));
copyFileSync(join(SRC, "Clip (2015).flv"), join(M, "ซีรีส์", "ซีซัน 1", "ตอนที่ 1 (2015).flv"));
n++;
writeFileSync(join(M, "โน้ต.txt"), "ไม่ใช่ไฟล์หนัง");
console.log(`หนัง ${n} เรื่องที่ต้องขึ้นชั้น · ${M}`);

// 500 เรื่อง · ไฟล์ต้นแบบสองไฟล์ (มีปก ไม่มีปก) ยาว 1 วินาที แล้วคัดลอก (ห้ามฮาร์ดลิงก์ ไม่งั้นเลขประจำไฟล์ซ้ำ ขึ้นชั้นเรื่องเดียว)
const B = join(OUT, "500เรื่อง");
mkdirSync(B, { recursive: true });
const ff = (args) => spawnSync(FF, ["-hide_banner", "-nostdin", "-y", "-loglevel", "error", ...args]);
const base1 = join(OUT, "ต้นแบบมีปก.mkv"), base2 = join(OUT, "ต้นแบบไม่มีปก.mkv");
const vid = ["-f", "lavfi", "-i", "testsrc2=size=320x180:rate=10:duration=1", "-f", "lavfi", "-i", "sine=duration=1", "-c:v", "libx264", "-preset", "ultrafast", "-c:a", "aac", "-shortest"];
ff([...vid, "-attach", join(IMG, "poster.jpg"), "-metadata:s:t", "mimetype=image/jpeg", "-metadata:s:t", "filename=cover.jpg", base1]);
ff([...vid, base2]);
for (let i = 1; i <= 500; i++) {
  const year = 1960 + (i % 65);
  copyFileSync(i % 2 ? base1 : base2, join(B, `เรื่องที่ ${String(i).padStart(3, "0")} (${year}).mkv`));
}
rmSync(base1); rmSync(base2);
console.log(`500 เรื่อง · ${B}`);
