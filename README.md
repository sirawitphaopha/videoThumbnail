# ชั้นหนัง (movie-shelf)

โปรแกรมบน Windows จัดหนังในเครื่องขึ้นชั้นให้เห็นเป็นปก ใส่โปสเตอร์ลงในไฟล์หนังเป็นไฟล์แนบของ MKV ตรวจว่าไฟล์เสียไหม และรวมเสียงกับซับที่โหลดแยกเข้าไฟล์หนัง

ทำด้วย Tauri 2 (Rust) กับ React · หน้าจอเป็นภาษาไทยทั้งหมด · ทำไว้ใช้เองบนคอม ยังไม่ได้แจกเป็นรุ่นสำเร็จ · รุ่น 0.9.1

## หน้าในโปรแกรม

| หน้า | ทำอะไร |
|---|---|
| ชั้นวางหนัง | สแกนโฟลเดอร์หนัง แสดงเป็นปกหรือตาราง ค้น กรอง เรียง ให้ดาวได้ แผงขวาบอกรายละเอียดไฟล์ |
| ใส่โปสเตอร์ | ครอปรูปแล้วฝังเป็นปกในไฟล์หนัง (ปกตั้งกับปกนอน) ไฟล์ที่ได้เลือกเป็น MKV หรือ MP4 · ไฟล์เดิมไม่ถูกเขียนทับ |
| จับคู่ปก | จับคู่รูปกับหนังโดยไม่แตะไฟล์หนัง ทั้งอัตโนมัติ กระดาน และลากจาก Explorer ตรวจในตารางก่อนยืนยัน |
| เสียงและซับ | เรียงแทร็ก ตั้งภาษา ชื่อ แทร็กหลัก ดีเลย์ เพิ่มเสียงหรือซับจากไฟล์แยก แปลงชนิดเสียงตอนรวม |
| ตรวจไฟล์ | ตรวจแบบเร็วอ่านโครงไฟล์กับเทียบค่า SHA-256 · ตรวจละเอียดถอดทั้งไฟล์หาจุดเสีย บอกเวลาที่เสียแล้วกดเปิดเล่นตรงนั้นได้ |
| กราฟเสียง | รูปคลื่น ความถี่ ความดัง ซ้อนเทียบ วิเคราะห์ ความถี่เฉลี่ย ซูมและลากได้ · เทียบได้ถึง 4 ไฟล์พร้อมบอกต่างกันกี่เปอร์เซ็นต์ · แปลงเสียงเป็นคิว · บันทึกเป็นรูป PNG JPG WebP HEIC TIFF |
| ตั้งค่า | โฟลเดอร์หนัง โทนสี โปรแกรมเล่น ที่เก็บรูปจับคู่ ชุดรูปกราฟ ตัวแปลงเสียงที่มีในเครื่อง |

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
- ตัวแปลงเสียง flac opusenc LAME WavPack Monkey's Audio TAK
- libheif (heif.dll) กับ x265 libde265 aom dav1d libsharpyuv สำหรับบันทึกรูปกราฟเป็น HEIC · LGPL GPL BSD ตามแต่ละตัว · โปรแกรมเรียก DLL นี้ตรง

## ขอบคุณ

ชั้นหนังพัฒนาขึ้นได้ด้วยผลงานของโครงการและผู้พัฒนาต่อไปนี้ ขอขอบคุณทุกท่าน รายการเดียวกันนี้อยู่ในหน้าตั้งค่า หัวข้อขอบคุณ

### ไอเดียและหน้าตา

ดูเป็นแบบแล้วเขียนเอง ไม่ได้ใช้โค้ดของโปรแกรมเหล่านี้

| โครงการ | รุ่น | ใช้ทำอะไรในชั้นหนัง | สัญญา | เว็บไซต์ |
|---|---|---|---|---|
| Bitrate Viewer | 2.3 | หน้าบิตเรตวิดีโอ หน้าตา สี วิธีคิด 4 แบบ ซูม เส้นค่าเฉลี่ย | ไอเดีย | [videohelp.com/software/Bitrate-Viewer](https://www.videohelp.com/software/Bitrate-Viewer) |
| Spek | 0.8.5 | หน้าวิเคราะห์ในกราฟเสียง หน้าตากราฟกับการบันทึกเป็นรูป | ไอเดีย | [github.com/alexkay/spek](https://github.com/alexkay/spek) |
| FFBitrateViewer | 0.9.7.2 | วิธีอ่านบิตเรตด้วย ffprobe ทีละแพ็กเก็ต ในหน้าบิตเรต | ไอเดีย · MIT | [github.com/fifonik/FFBitrateViewer](https://github.com/fifonik/FFBitrateViewer) |
| Audacity | 4.0.2 | รูปคลื่นแบบ Audacity ในกราฟเสียง | ไอเดีย | [audacityteam.org](https://audacityteam.org) |
| Aegisub | 3.5.1 | ตัวดูซับแบบตารางบรรทัด | ไอเดีย | [aegisub.org](https://aegisub.org) |
| Kodi | 21.3 | ชื่อไฟล์รูปลงท้าย -poster กับ -landscape ในหน้าจับคู่ปก | ไอเดีย | [kodi.tv](https://kodi.tv) |
| Claude Desktop | 4.23118.0 | รูปแบบเมนูหัวข้อของหน้าตั้งค่า | ไอเดีย | [claude.ai](https://claude.ai) |

### เครื่องมือที่แนบมาทำงานจริง

ใช้ตามสัญญาอนุญาตของแต่ละตัว ข้อความเต็มอยู่ในโฟลเดอร์ tools\licenses

| โครงการ | รุ่น | ใช้ทำอะไรในชั้นหนัง | สัญญา | เว็บไซต์ |
|---|---|---|---|---|
| FFmpeg | 9.0.2 | ถอด แปลง ตรวจไฟล์เสีย อ่านเสียงมาวาดกราฟ และอ่านบิตเรตวิดีโอ · ชุดจาก gyan.dev · ไอคอนจาก Icons8 | GPLv3 | [ffmpeg.org](https://ffmpeg.org) |
| MKVToolNix | 103.0 | ครอบ MKV แนบปก แยกแทร็ก | GPLv2 | [mkvtoolnix.download](https://mkvtoolnix.download) |
| MediaInfo | 26.10 | รายละเอียดไฟล์ | BSD-2 | [mediaarea.net](https://mediaarea.net) |
| FLAC | 1.5.0 | แปลงเสียง FLAC | GPLv2 · BSD | [xiph.org/flac](https://xiph.org/flac) |
| LAME กับ libmpg123 | 4.0 | แปลงเสียง MP3 · ชุดจาก RareWares | LGPL | [lame.sourceforge.io](https://lame.sourceforge.io) |
| opus-tools | 0.2 · libopus 1.6.1 | แปลงเสียง Opus · ชุดจาก RareWares | BSD-2 | [opus-codec.org](https://opus-codec.org) |
| WavPack | 5.9.0 | แปลงเสียง WavPack | BSD-3 | [wavpack.com](https://wavpack.com) |
| qaac กับ refalac | 3.07 | แปลงเสียง AAC ด้วยตัวของ Apple (ต้องติดตั้ง iTunes เอง) กับ ALAC · แนบมากับโปรแกรม | Public Domain · ALAC Apache 2.0 | [github.com/nu774/qaac](https://github.com/nu774/qaac) |
| Monkey's Audio | 13.46 | แปลงเสียง APE | BSD-3 | [monkeysaudio.com](https://monkeysaudio.com) |
| TAK | 2.3.3 | แปลงเสียง TAK · แนบไฟล์เดิมทั้งชุด | ฟรีใช้ส่วนตัว | [thbeck.de/Tak](https://thbeck.de/Tak) |
| libheif กับ libde265 | 1.23.7 · 1.1.3 | บันทึกรูปกราฟเป็น HEIC · ชุดจาก conda-forge | LGPLv3 | [github.com/strukturag/libheif](https://github.com/strukturag/libheif) |
| x265 | 3.5 | เข้ารหัสภาพใน HEIC | GPLv2 | [bitbucket.org/multicoreware/x265_git](https://bitbucket.org/multicoreware/x265_git) |
| aom · dav1d · libsharpyuv | 3.15.3 · 1.5.4 · 1.6.0 | ไฟล์ที่ libheif ต้องใช้ | BSD | [aomedia.org](https://aomedia.org) · [videolan.org](https://videolan.org) · [chromium.googlesource.com/webm/libwebp](https://chromium.googlesource.com/webm/libwebp) |
| Visual C++ Runtime | 14.51 | ไฟล์ที่ libheif ต้องใช้ · ของ Microsoft | ข้อตกลง MS | [microsoft.com](https://microsoft.com) |

### ใช้สร้างโปรแกรม

ซอร์สโค้ดของห้องสมุดเหล่านี้รวมอยู่ในตัวโปรแกรมตอนสร้าง

| โครงการ | รุ่น | ใช้ทำอะไรในชั้นหนัง | สัญญา | เว็บไซต์ |
|---|---|---|---|---|
| Claude | – | ตัวช่วยเขียนโปรแกรม · Claude Code กับโมเดล Claude Opus 5.5 ของ Anthropic | Anthropic | [claude.com/claude-code](https://claude.com/claude-code) |
| Rust | 1.99.1 | ฝั่งหลังบ้านทั้งหมด อ่านไฟล์ เรียกเครื่องมือ เขียนไฟล์ · รุ่นที่ใช้สร้างโปรแกรม | MIT · Apache-2.0 | [rust-lang.org](https://www.rust-lang.org) |
| Tauri | 2.12.5 | โครงโปรแกรมบน Windows | MIT · Apache-2.0 | [tauri.app](https://tauri.app) |
| TypeScript | 7.0.2 | ภาษาที่เขียนหน้าจอทั้งหมด | Apache-2.0 | [typescriptlang.org](https://typescriptlang.org) |
| Vite | 8.3.6 | ตัวสร้างหน้าจอ รวมไฟล์ตอนสร้างโปรแกรม | MIT | [vite.dev](https://vite.dev) |
| React | 19.3.1 | หน้าจอทั้งหมด | MIT | [react.dev](https://react.dev) |
| image (Rust) | 0.25.10 | อ่าน ครอป และเข้ารหัสรูป | MIT · Apache-2.0 | [github.com/image-rs/image](https://github.com/image-rs/image) |
| ห้องสมุด Rust อื่น ๆ | – | serde อ่านเขียนข้อมูล · qcms แปลงสีรูป · jpeg-encoder · sha2 md-5 sha1 crc32fast คิดค่า hash · windows-sys | MIT · Apache-2.0 | [crates.io](https://crates.io) |
| ฟอนต์ Sarabun | – | ตัวหนังสือทั้งโปรแกรม · Cadson Demak · ชุดจาก Fontsource | OFL | [fonts.google.com/specimen/Sarabun](https://fonts.google.com/specimen/Sarabun) |
| ไอคอนในหน้านี้ | – | Simple Icons กับ SVG Logos (CC0) · Icons8 · Wikimedia Commons · ไอคอนจากตัวโปรแกรมของแต่ละโครงการ | ตามแต่ละรูป | [simpleicons.org](https://simpleicons.org) · [icons8.com](https://icons8.com) · [commons.wikimedia.org](https://commons.wikimedia.org) |

## เอกสาร

- สเปกหน้าจอ [docs/MOCKUP-SPEC.md](docs/MOCKUP-SPEC.md) · ต้นแบบ [docs/mockups/](docs/mockups/)
- หลุมทางเทคนิคกับผลที่ลองจริง [docs/TECH-REVIEW.md](docs/TECH-REVIEW.md)
- งานที่จะทำต่อ [docs/ROADMAP.md](docs/ROADMAP.md) · รายงานแต่ละขั้น `docs/REPORT-*.md`
