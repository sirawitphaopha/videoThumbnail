#!/usr/bin/env bash
# รันตัวตรวจทั้งโปรแกรมต่อกันในโหมดพัฒนา (ชุดข้อ 123 ถึง 131 พี่กันสั่ง 15 พ.ย. 2569 "ทำถึง 131 เทสทั้งหมด เเล้ว commit")
# ขั้น 1 ถึง 5 · ชุดที่เหลือของแผนเสียงและซับ · ตัวตรวจเพิ่มหลังชุดรันรวม · แผนหน้าแก้ซับ · ตัวตรวจของชุดข้อ 111 ถึง 131
# เปิด scripts/dev-app.ps1 แบบอยู่หลังสุดก่อน · ตัวตรวจทุกตัวเช็กด่านหน้าต่างหน้าสุดเอง · ภาพที่เขียนทับรายงานเก่าต้องคืนด้วย git checkout ทีละโฟลเดอร์หลังรัน
# ใช้: bash scripts/run-batch-all.sh > log.txt
cd "$(dirname "$0")/.." || exit 1
node scripts/wait-app.mjs running_jobs 600 || exit 1
bash scripts/run-dev-all.sh
bash scripts/run-av-all.sh
for t in check-look.mjs check-frames.mjs check-recent.mjs check-drop.mjs check-result.mjs check-spek.mjs check-stars.mjs check-nav.mjs check-bname.mjs check-table.mjs \
  check-players.mjs check-statgo.mjs check-panel.mjs check-panel-states.mjs check-settings.mjs check-bitrate-new.mjs check-bitrate.mjs; do
  out=$(node scripts/$t 2>&1)
  echo "== $t · $(echo "$out" | grep -E 'ผ่าน [0-9]+ จาก' | tail -1)"
  echo "$out" | grep "❌"
done
bash scripts/run-subedit-all.sh
for t in check-vidplay.mjs check-mpvplay.mjs check-subvtools.mjs check-subsyntax.mjs check-q113.mjs check-pgs.mjs check-imgconv.mjs check-gmkv.mjs check-mkvtree.mjs check-review-fixes.mjs; do
  out=$(node scripts/$t 2>&1)
  echo "== $t · $(echo "$out" | grep -E 'ผ่าน [0-9]+ จาก' | tail -1)"
  echo "$out" | grep "❌"
done
echo "== จบทุกชุด"
