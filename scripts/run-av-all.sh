#!/usr/bin/env bash
# รันตัวเทสชุดที่เหลือหลังขั้น 1 ถึง 5 กับโหมด dev (แผนเสียงและซับ ขั้น 9 เทสรวม) · สรุปผลบรรทัดเดียวต่อชุด
# เปิดโปรแกรมผ่าน scripts/dev-app.ps1 แบบอยู่หลังสุดก่อน · ตัวเทสหลายตัวเขียนภาพทับรายงานเก่า รันเสร็จแล้วคืนภาพที่ไม่ได้ตั้งใจเปลี่ยนด้วย git restore
# ใช้: bash scripts/run-av-all.sh
cd "$(dirname "$0")/.." || exit 1
node scripts/wait-app.mjs running_jobs 600 || exit 1
for t in check-stage6.mjs check-stage7.mjs check-merge.mjs check-review.mjs check-wide.mjs check-graph.mjs check-av.mjs check-convert.mjs check-latest.mjs check-fonts.mjs check-link.mjs check-sizes.mjs; do
  out=$(node scripts/$t 2>&1)
  echo "== $t · $(echo "$out" | grep -E 'ผ่าน [0-9]+ จาก' | tail -1)"
  echo "$out" | grep "❌"
done
