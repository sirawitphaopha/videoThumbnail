#!/usr/bin/env bash
# รันตัวเทสขั้น 1 ถึง 5 ต่อกันกับโหมด dev (เปิดผ่าน scripts/dev-app.ps1 แบบอยู่หลังสุด) · สรุปผลบรรทัดเดียวต่อชุด
# ตัวเทสพวกนี้เขียนภาพทับรายงานวันที่ 6 · รันเสร็จแล้วคืนภาพเก่าด้วย git restore -- docs/report-2026-11-06
# ใช้: bash scripts/run-dev-all.sh
cd "$(dirname "$0")/.." || exit 1
node scripts/wait-app.mjs running_jobs 600 || exit 1
for t in check-stage1.mjs check-stage2.mjs check-stage3.mjs check-stage4.mjs check-stage5.mjs; do
  out=$(node scripts/$t 2>&1)
  echo "== $t · $(echo "$out" | grep -E 'ผ่าน [0-9]+ จาก' | tail -1)"
  echo "$out" | grep "❌"
done
