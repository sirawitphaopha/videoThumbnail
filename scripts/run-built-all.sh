#!/usr/bin/env bash
# รันตัวเทสชุดที่ใช้ตัวโปรแกรมที่สร้างจริงต่อกัน (เปิดผ่าน scripts/dev-app.ps1 -Built แบบอยู่หลังสุด) · สรุปผลบรรทัดเดียวต่อชุด
# ใช้: bash scripts/run-built-all.sh
cd "$(dirname "$0")/.." || exit 1
node scripts/wait-app.mjs running_jobs 600 || exit 1
for t in "check-stage6.mjs --built" "check-built.mjs docs/report-2026-11-07/ตัวจริง-รวม" "check-graph.mjs --built" "check-wide.mjs --built" "check-stage7.mjs --built"; do
  out=$(node scripts/$t 2>&1)
  echo "== $t · $(echo "$out" | grep -E 'ผ่าน [0-9]+ จาก' | tail -1)"
  echo "$out" | grep "❌"
done
