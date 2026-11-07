# ชั้นหนัง (movie-shelf)

โปรแกรมบน Windows จัดหนังในเครื่องขึ้นชั้นให้เห็นเป็นปก ใส่โปสเตอร์ลงในไฟล์หนังเป็นไฟล์แนบของ MKV ตรวจว่าไฟล์เสียไหม และรวมเสียงกับซับที่โหลดแยกเข้าไฟล์หนัง

ทำด้วย Tauri 2 (Rust) กับ React · หน้าจอเป็นภาษาไทยทั้งหมด · ทำไว้ใช้เองบนคอม ยังไม่ได้แจกเป็นรุ่นสำเร็จ

## หน้าในโปรแกรม

| หน้า | ทำอะไร |
|---|---|
| ชั้นวางหนัง | สแกนโฟลเดอร์หนัง แสดงเป็นปก ค้นและเรียงได้ แผงขวาบอกรายละเอียดไฟล์ |
| ใส่โปสเตอร์ | ครอปรูปแล้วฝังเป็นปกในไฟล์หนัง (ปกตั้งกับปกนอน) ไฟล์ที่ได้เลือกเป็น MKV หรือ MP4 · ไฟล์เดิมไม่ถูกเขียนทับ |
| เสียงและซับ | เรียงแทร็ก ตั้งภาษา ชื่อ แทร็กหลัก ดีเลย์ เพิ่มเสียงหรือซับจากไฟล์แยก แปลงชนิดเสียงตอนรวม |
| ตรวจไฟล์ | ถอดทั้งไฟล์หาจุดเสีย บอกเวลาที่เสียแล้วกดเปิดเล่นตรงนั้นได้ |
| กราฟเสียง | คลื่นเสียง ความถี่ และข้อมูลเสียงของแทร็ก |
| ตั้งค่า | โฟลเดอร์หนัง โปรแกรมเล่น ตัวแปลงเสียงที่มีในเครื่อง |

## สร้างและรัน

ต้องมี Node.js กับ Rust (ชุด MSVC) บน Windows

```powershell
npm install
powershell -File scripts/fetch-tools.ps1   # แตกเครื่องมือจาก vendor/ ลง src-tauri/tools/ (ต้องมีไฟล์บีบอัดใน vendor ก่อน ดู vendor/README.md)
npm run tauri dev                          # เปิดแบบทดสอบ
npm run tauri build                        # สร้างตัวติดตั้ง
```

เทสฝั่ง Rust

```powershell
node scripts/make-test-media.mjs           # สร้างไฟล์ทดสอบลง test-media/ ก่อน
cd src-tauri; cargo test
```

ตัวตรวจผ่านโปรแกรมจริงอยู่ใน `scripts/check-*.mjs` คุยกับโปรแกรมทาง CDP (เปิดด้วย `scripts/dev-app.ps1` ก่อน)

## เครื่องมือที่ใช้

โปรแกรมเรียกเครื่องมือภายนอกเป็นตัวโปรแกรมแยก ไม่ได้รวมโค้ดเข้ามา · ไฟล์บีบอัดไม่ขึ้น git รายชื่อ แหล่ง รุ่น และค่า SHA-256 อยู่ใน [vendor/README.md](vendor/README.md) · ข้อความสัญญาอนุญาตเต็มอยู่ใน [src-tauri/tools/licenses/](src-tauri/tools/licenses/)

- MKVToolNix (mkvmerge mkvextract) · GPL v2
- FFmpeg ffprobe · ชุด full ของ gyan.dev (GPL)
- MediaInfo · BSD
- ตัวแปลงเสียง flac opusenc LAME WavPack Monkey's Audio

## เอกสาร

- สเปกหน้าจอ [docs/MOCKUP-SPEC.md](docs/MOCKUP-SPEC.md) · ต้นแบบ [docs/mockups/](docs/mockups/)
- หลุมทางเทคนิคกับผลที่ลองจริง [docs/TECH-REVIEW.md](docs/TECH-REVIEW.md)
- งานที่จะทำต่อ [docs/ROADMAP.md](docs/ROADMAP.md) · รายงานแต่ละขั้น `docs/REPORT-*.md`
