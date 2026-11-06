// แปลงไฟล์ .ps1 ให้เป็น UTF-8 แบบมี BOM และจบบรรทัดแบบวินโดวส์ (CRLF)
// เหตุผล PowerShell 5.1 อ่านไฟล์ที่ไม่มี BOM เป็นรหัสเก่า ภาษาไทยเพี้ยน (สกิล machine-tools ข้อ 5.1)
// ใช้: node scripts/ps1-bom.mjs <ไฟล์> [<ไฟล์> ...]
// 🔴 ไฟล์ที่ไม่ใช่ UTF-8 (เช่นรหัสเก่า cp874 จาก Set-Content) ไม่แตะเลย ไม่งั้นภาษาไทยพังถาวร (ผลตรวจขั้น 0 ข้อ 5)
// 🔴 เขียนลงไฟล์ชั่วคราวก่อน แล้วค่อยเปลี่ยนชื่อทับ · อ่านกลับมาเช็กว่าขึ้นต้นด้วย EF BB BF จริง
import { readFileSync, writeFileSync, renameSync } from "node:fs";

const BOM = "﻿";
let bad = 0;
for (const file of process.argv.slice(2)) {
  const bytes = readFileSync(file);
  let text;
  try {
    text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    console.log(`ไม่แตะ ${file} · ไฟล์ไม่ใช่ UTF-8 ต้องแปลงรหัสก่อน`);
    bad++;
    continue;
  }
  if (text.startsWith(BOM)) text = text.slice(1);
  text = text.replace(/\r\n/g, "\n").replace(/\n/g, "\r\n");
  const tmp = file + ".tmp";
  writeFileSync(tmp, BOM + text, "utf8");
  renameSync(tmp, file);
  const head = readFileSync(file).subarray(0, 3);
  if (head[0] === 0xef && head[1] === 0xbb && head[2] === 0xbf) console.log(`แปลงแล้ว ${file}`);
  else { console.log(`เขียนแล้วแต่ไม่มี BOM ${file}`); bad++; }
}
if (bad) process.exitCode = 1;
