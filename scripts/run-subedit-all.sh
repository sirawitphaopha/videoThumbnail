#!/usr/bin/env bash
# รันตัวตรวจทุกตัวของแผนหน้าแก้ซับต่อกัน (แผนหน้าแก้ซับ ขั้น 10) · ใช้: เปิด scripts/dev-app.ps1 ก่อน แล้ว bash scripts/run-subedit-all.sh
# ตอนพี่กันทำงานอยู่ส่ง NOGATE=1 ให้ check-sizes ไม่หยุดที่ด่านหน้าต่างหน้าสุด (CLAUDE.md กฎกันหน้าจอเด้งข้อ ②)
# ตัวตรวจหลายตัวเขียนภาพทับโฟลเดอร์ที่ commit แล้ว รันเสร็จคืนเฉพาะโฟลเดอร์ภาพ (บรรทัดท้ายไฟล์)
cd "$(dirname "$0")/.."
LOG="${LOG:-D:/dev/tmp/แคลร์-ชั่วคราว/subedit-all.log}"
: > "$LOG"
pass=0; fail=0
for t in check-subchap.mjs check-subedit.mjs check-subvideo.mjs check-subaudio.mjs check-subcmds.mjs check-subtools.mjs check-subpad.mjs check-subremux.mjs check-sizes.mjs; do
  echo "===== $t" >> "$LOG"
  if node "scripts/$t" >> "$LOG" 2>&1; then pass=$((pass+1)); r="ผ่าน"; else fail=$((fail+1)); r="ไม่ผ่าน"; fi
  echo "$t $r · $(grep -E '^ผ่าน [0-9]' "$LOG" | tail -1)"
done
echo "รวม ผ่าน $pass ตัว ไม่ผ่าน $fail ตัว · บันทึกเต็มอยู่ $LOG"
