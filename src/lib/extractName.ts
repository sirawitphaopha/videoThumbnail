/* รูปแบบชื่อไฟล์แทร็กที่แยกออกจากหนัง แบบ gMKVExtractGUI (BUGS ข้อ 130)
   ฝั่ง Rust ตั้งชื่อจริงที่ extract.rs pattern_name · ที่นี่ใช้ทำตัวอย่างในหน้าตั้งค่าเท่านั้น กติกาต้องตรงกัน ตัวตรวจ check-settings เทียบกับชื่อที่ฝั่ง Rust แยกจริง */

export const DEFAULT_PATTERN = "{Filename}.{Type}{Number}.{Language}{Delay}";

export const PATTERN_TOKENS: [string, string][] = [
  ["{Filename}", "ชื่อไฟล์หนังไม่มีนามสกุล"],
  ["{Type}", "ชนิดแทร็ก Video Audio หรือ Text"],
  ["{Number}", "ลำดับของแทร็กในชนิดเดียวกัน เริ่มที่ 1"],
  ["{Language}", "รหัสภาษาของแทร็ก เช่น th en ไม่มีภาษาก็เว้นไว้"],
  ["{Delay}", "ดีเลย์ของเสียงเทียบภาพ เช่น DELAY 120ms ไม่มีดีเลย์ก็เว้นไว้"],
  ["{TrackName}", "ชื่อแทร็กที่ตั้งไว้ในไฟล์"],
];

const BAD = /[<>:"/\\|?*\u0000-\u001f]/g;

/** ชื่อไฟล์ที่จะได้ · ตัวแทนว่างไม่ทิ้งจุดซ้อน · รูปแบบที่ได้ชื่อว่างใช้ชื่อหนังกับชนิดแทน */
export function patternName(pattern: string, stem: string, t: { type: "Video" | "Audio" | "Text"; nth: number; lang: string | null; ext: string; delay?: number; name?: string }): string {
  const p = pattern.trim() ? pattern : DEFAULT_PATTERN;
  const d = t.delay ? ` DELAY ${t.delay}ms` : "";
  let s = p.split("{Filename}").join(stem).split("{Type}").join(t.type).split("{Number}").join(String(t.nth)).split("{Language}").join(t.lang ?? "")
    .split("{Delay}").join(d).split("{TrackName}").join((t.name ?? "").replace(BAD, "_").trim());
  s = s.replace(BAD, "_");
  while (s.includes("..")) s = s.split("..").join(".");
  while (s.includes(". ")) s = s.split(". ").join(" ");
  while (s.includes("  ")) s = s.split("  ").join(" ");
  s = s.trim().replace(/^\.+|\.+$/g, "").trim();
  if (!s) s = `${stem}.${t.type}${t.nth}`;
  return `${s}.${t.ext}`;
}
