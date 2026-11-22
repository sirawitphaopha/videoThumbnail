# ชั้นหนัง (movie-shelf)

โปรแกรมบน Windows จัดหนังในเครื่องขึ้นชั้นให้เห็นเป็นปก ใส่โปสเตอร์ลงในไฟล์หนังเป็นไฟล์แนบของ MKV ตรวจว่าไฟล์เสียไหม และรวมเสียงกับซับที่โหลดแยกเข้าไฟล์หนัง

ทำด้วย Tauri 2 (Rust) กับ React · หน้าจอเป็นภาษาไทยทั้งหมด · ทำไว้ใช้เองบนคอม ยังไม่ได้แจกเป็นรุ่นสำเร็จ · รุ่น 0.10.1

## หน้าในโปรแกรม

| หน้า | ทำอะไร |
|---|---|
| ชั้นวางหนัง | สแกนโฟลเดอร์หนัง แสดงเป็นปกหรือตาราง ค้น กรอง เรียง ให้ดาวได้ แผงขวาบอกรายละเอียดไฟล์ |
| ใส่โปสเตอร์ | ครอปรูปแล้วฝังเป็นปกในไฟล์หนัง (ปกตั้งกับปกนอน) ไฟล์ที่ได้เลือกเป็น MKV หรือ MP4 · ไฟล์เดิมไม่ถูกเขียนทับ |
| จับคู่ปก | จับคู่รูปกับหนังโดยไม่แตะไฟล์หนัง ทั้งอัตโนมัติ กระดาน และลากจาก Explorer ตรวจในตารางก่อนยืนยัน |
| เสียงและซับ | เรียงแทร็ก ตั้งภาษา ชื่อ แทร็กหลัก ดีเลย์ เพิ่มเสียงหรือซับจากไฟล์แยก แปลงชนิดเสียงตอนรวม · MKV เก็บภาษาแบบละเอียด (zh-Hant es-419) กับป้ายพิเศษของทุกแทร็ก · แยกแทร็กออกเป็นไฟล์แบบ gMKVExtractGUI ทั้ง Chapter แท็ก และเวลาของเฟรม |
| ซับไตเติล | แก้ซับ ASS SRT แบบ Aegisub ตารางบรรทัด ช่องแก้ทุกช่อง สีอักษรแท็ก คลื่นเสียงลากเวลา ภาพหนังทีละเฟรมกับ keyframe แถบเลื่อนเวลา เล่นหนังด้วย mpv (หรือแบบ Aegisub) เครื่องมือบนภาพ แถบปุ่มย่อ คำสั่งเมนูเวลาและแก้ไข ตัวจัดการสไตล์ คุณสมบัติสคริปต์ แบบอ่านยาวกับแบบ notepad · บันทึกทับแล้วไฟล์เดิมลงถังขยะ · ซับในหนังใส่กลับเข้าหนังได้ (ฝังฟอนต์ที่ขาด) · ส่งออกเป็น PGS (.sup ของ Blu-ray) · ซับรูป (PGS VobSub BDN XML HD DVD) เปิดดูเป็นภาพพร้อมภาพหนัง แปลงเป็นซับภาพชนิดอื่น และ OCR เป็นตัวหนังสือด้วย PaddleOCR Tesseract nOCR Binary OCR หรือตัวสอนเองที่อ่านไทยได้ มีตัวชี้จุดสงสัย หน้าตรวจทานแบบตารางกับทีละจุด สอนตัวอักษรด้วยมือแบบ Subtitle Edit ส่งออกเป็นซับหลายร้อยชนิดหรือส่งต่อหน้าแก้ซับ · ทำงานในเครื่องทั้งหมด ไม่ส่งภาพออกเน็ต |
| ตรวจไฟล์ | ตรวจแบบเร็วอ่านโครงไฟล์กับเทียบค่า SHA-256 · ตรวจละเอียดถอดทั้งไฟล์หาจุดเสีย บอกเวลาที่เสียแล้วกดเปิดเล่นตรงนั้นได้ |
| กราฟเสียง | รูปคลื่นแบบ Audacity มีดังสุด (Peak) ดังเฉลี่ย (RMS) · ความถี่ (รวมแบบวิเคราะห์ บอกว่าไฟล์น่าจะแปลงมาไหม เป็นป้ายสั้นพร้อมปุ่ม ⓘ อ่านเหตุผล ตรวจ FLAC WavPack Monkey's Audio TAK TTA TrueHD ได้) · ความดัง (รวมเทียบซ้ายขวา สลับช่องแบบค่อย ๆ เปลี่ยน) · ความถี่เฉลี่ยพร้อมผลตรวจ เช่น เสียงหึ่งจากไฟบ้าน · แกน Linear กับ Log · ซูมแนวตั้งแนวนอน ลากได้ เต็มจอ ชุดสีกำหนดเองได้ · หัวกราฟแคบ แถวปุ่มเปลี่ยนเป็นดรอปดาวน์ · เทียบได้ถึง 4 ไฟล์พร้อมบอกต่างกันกี่เปอร์เซ็นต์ · แปลงเสียงเป็นคิว ขนาดที่คาดจากการลองแปลงจริง แปลงแบบไม่เสียคุณภาพแล้วเทียบ MD5 ของเสียงกับต้นฉบับ · บันทึกเป็นรูป PNG JPG WebP HEIC TIFF |
| บิตเรต | บิตเรตวิดีโอและเสียงทีละช่วงหรือทีละเฟรม แบบใหม่ตามโทนของโปรแกรม กับแบบ Bitrate Viewer · บอกเฉลี่ย สูงสุด ต่ำสุด เพดาน คีย์เฟรม เฟรม I P B · ไฟล์เสียงแบบไม่เสียคุณภาพ เพดานเป็นบิตเรตเสียงดิบ มีปุ่มไปหน้ากราฟเสียง |
| MediaInfo | ข้อมูลไฟล์ทุกแทร็กแบบ MediaInfo สองคอลัมน์พร้อมแผงสรุป · โครงสร้างไฟล์ MKV แบบ mkvinfo · บันทึกค่า SHA-256 เป็นไฟล์ .sha256 |
| ตั้งค่า | โฟลเดอร์หนัง โทนสี โปรแกรมเล่น ที่เก็บรูปจับคู่ ชุดรูปกราฟ ตัวแปลงเสียงที่มีในเครื่อง · บันทึกการใช้งาน จดงานที่เขียน ย้าย ลบไฟล์ และค่าตั้งที่เปลี่ยน เก็บไว้ในเครื่อง 12 เดือนล่าสุด |

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

ตัวตรวจผ่านโปรแกรมจริงอยู่ใน `scripts/check-*.mjs` คุยกับโปรแกรมทาง CDP (เปิดด้วย `scripts/dev-app.ps1` ก่อน) · `check-sizes.mjs` ไล่ทุกหน้าที่ขนาดหน้าต่างของจอ 1080 กับ 2K ([ผังขนาดจอ](docs/mockups/window-sizes.html))

### ตรวจหน้าจอโดยไม่เปิดโปรแกรม (ระบบจำลองหน้าโปรแกรมบนเว็บ)

ใช้ได้ทั้งบน Windows และบนเครื่อง Linux ที่มี Chromium กับ Playwright ไม่ต้องสร้างโปรแกรม ไม่ต้องมีเครื่องมือภายนอก
หน้าจอจริงทั้งโปรแกรม (`src/main.tsx`) เปิดใน `docs/mockups/theme-live-app.html` ซึ่งแทนฝั่ง Rust ด้วยข้อมูลตัวอย่าง

```bash
npm install
node scripts/web-shots.mjs /ที่เก็บ/ภาพก่อน      # ถ่าย 48 สภาพ × 2 ขนาดจอ (1280 × 800 กับ 1920 × 1032) เปิด vite เองถ้ายังไม่เปิด
node scripts/web-shots.mjs /ที่เก็บ/ภาพหลัง
node scripts/web-diff.mjs /ที่เก็บ/ภาพก่อน /ที่เก็บ/ภาพหลัง   # เทียบทีละจุดภาพ ทำภาพวงจุดที่ต่าง
```

ตรึงเวลา ปิดภาพเคลื่อนไหว โหลดฟอนต์ครบก่อนถ่าย ถ่ายสองรอบได้ภาพตรงกันทุกจุดภาพ · ภาพพิสูจน์เฉพาะหน้าจอ ฝั่ง Rust เป็นข้อมูลจำลอง
เลือกขนาดจอด้วย `SIZES=1280x800` เลือกภาพด้วยอาร์กิวเมนต์ที่สอง (ชื่อภาพคั่นด้วยจุลภาค) ถ่ายพร้อมกันกี่หน้าต่างด้วย `JOBS`

### โครงไฟล์โค้ด (กำลังแบ่งไฟล์ BUGS ข้อ 153)

หน้าที่ยาวแตกเป็นโฟลเดอร์ของหน้านั้นใน `src/pages/<ระบบ>/` แล้ว graph av bitrate shelf settings ocr · ส่วนที่ใช้หน้าเดียวอยู่ในโฟลเดอร์ของหน้า ใช้หลายหน้าอยู่ `src/components/` กับ `src/lib/`
แผนกับสถานะทุกขั้นอยู่ `docs/PLAN-2026-11-22-แบ่งไฟล์.md` แนวทางวางไฟล์เต็มจะเขียนลง CLAUDE.md ตอนจบแผน

## เครื่องมือที่ใช้

โปรแกรมเรียกเครื่องมือภายนอกเป็นตัวโปรแกรมแยก ไม่ได้รวมโค้ดเข้ามา · ไฟล์บีบอัดไม่ขึ้น git รายชื่อ แหล่ง รุ่น และค่า SHA-256 อยู่ใน [vendor/README.md](vendor/README.md) · ข้อความสัญญาอนุญาตเต็มอยู่ใน [src-tauri/tools/licenses/](src-tauri/tools/licenses/)

- MKVToolNix (mkvmerge mkvextract) · GPL v2
- FFmpeg ffprobe · ชุด full ของ gyan.dev (GPL)
- MediaInfo · BSD
- ตัวแปลงเสียง flac opusenc LAME WavPack Monkey's Audio TAK
- libheif (heif.dll) กับ x265 libde265 aom dav1d libsharpyuv สำหรับบันทึกรูปกราฟเป็น HEIC · LGPL GPL BSD ตามแต่ละตัว · โปรแกรมเรียก DLL นี้ตรง
- libmpv (libmpv-2.dll) ตัวเล่นหนังในหน้าแก้ซับ · GPL รุ่น 2 ขึ้นไป · โปรแกรมเรียก DLL นี้ตรง ไม่มีไฟล์ก็เล่นแบบ Aegisub แทน
- SUPer BDSup2Sub++ และ SeConv ของ Subtitle Edit สำหรับส่งออก PGS แปลงซับภาพ และส่งออกผล OCR เป็นซับชนิดอื่น · GPLv3 Apache-2.0 MIT ตามแต่ละตัว
- ระบบ OCR ซับรูป ONNX Runtime กับโมเดล PaddleOCR · Tesseract 5.5.3 กับชุดภาษา eng tha jpn jpn_vert osd · พจนานุกรม Hunspell · ฐาน nOCR Binary OCR และรายการแก้คำของ Subtitle Edit · MIT Apache-2.0 และตามแต่ละชุด

## ขอบคุณ

ชั้นหนังพัฒนาขึ้นได้ด้วยผลงานของโครงการและผู้พัฒนาต่อไปนี้ ขอขอบคุณทุกท่าน รายการเดียวกันนี้อยู่ในหน้าตั้งค่า หัวข้อขอบคุณ

### ไอเดียและหน้าตา

ดูเป็นแบบแล้วเขียนเอง ไม่ได้ใช้โค้ดของโปรแกรมเหล่านี้

| โครงการ | รุ่น | ใช้ทำอะไรในชั้นหนัง | สัญญา | เว็บไซต์ |
|---|---|---|---|---|
| Bitrate Viewer | 2.3 | หน้าบิตเรตวิดีโอ หน้าตา สี วิธีคิด 4 แบบ ซูม เส้นค่าเฉลี่ย | ไอเดีย | [videohelp.com/software/Bitrate-Viewer](https://www.videohelp.com/software/Bitrate-Viewer) |
| Spek | 0.8.5 | หน้าวิเคราะห์ในกราฟเสียง หน้าตากราฟกับการบันทึกเป็นรูป | ไอเดีย | [github.com/alexkay/spek](https://github.com/alexkay/spek) |
| FFBitrateViewer | 0.9.7.2 | วิธีอ่านบิตเรตด้วย ffprobe ทีละแพ็กเก็ต ในหน้าบิตเรต | ไอเดีย · MIT | [github.com/fifonik/FFBitrateViewer](https://github.com/fifonik/FFBitrateViewer) |
| gMKVExtractGUI | 2.15.0 | วิธีแยกไฟล์ในหน้าเสียงและซับ ทั้งแท็ก Chapter แบบ OGM CUE sheet และเวลาของเฟรม ดีเลย์ในชื่อไฟล์ รูปแบบชื่อไฟล์ และแยกหลายไฟล์ · อ่านซอร์สแล้วเขียนเอง | ไอเดีย · Unlicense | [github.com/Gpower2/gMKVExtractGUI](https://github.com/Gpower2/gMKVExtractGUI) |
| Audacity | 4.0.2 | รูปคลื่นแบบ Audacity ในกราฟเสียง | ไอเดีย | [audacityteam.org](https://audacityteam.org) |
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
| SUPer | 0.3.0 | ตัวสร้าง PGS แบบมาตรฐาน Blu-ray ที่เลือกได้ในหน้าต่างส่งออก PGS · ข้างในมี libimagequant ช่วยลดสี | GPLv3 | [github.com/cubicibo/SUPer](https://github.com/cubicibo/SUPer) |
| BDSup2Sub++ | 1.0.5 | แปลงซับภาพเป็นซับภาพในหน้าต่างแปลงซับภาพ ทั้ง PGS VobSub และ BDN XML พร้อมย่อขยาย เปลี่ยนอัตราเฟรม เลื่อนเวลา ย้ายตำแหน่ง และตั้งจานสี · หน้าตาของหน้าต่างยกกลุ่มตัวเลือกมาจาก BDSup2Sub · ข้างในรวม Qt ไว้ในตัว | Apache-2.0 (Qt LGPL) | [github.com/TheGreatMcPain/BDSup2SubPlusPlus](https://github.com/TheGreatMcPain/BDSup2SubPlusPlus) |
| Subtitle Edit | 5.4.0 | ระบบ OCR ซับรูปแปลวิธีจากซอร์สเป็น Rust (nOCR Binary OCR ตัวแก้คำ คำที่ไม่รู้จัก หน้าต่างสอน ตรวจบรรทัด ฝึกจากฟอนต์ ส่งออก) ใส่ประกาศลิขสิทธิ์เดิมไว้หัวไฟล์ แนบฐาน nOCR Binary OCR และรายการแก้คำของ Subtitle Edit · ตัวแปลง SeConv เป็นตัวสร้าง PGS ตัวที่สาม ตัวสำรองตอนแปลงซับภาพ และส่งออกผล OCR เป็นซับชนิดอื่น · และเป็นต้นแบบวิธีฝัง mpv ไว้ในหน้าต่างโปรแกรมเพื่อเล่นหนังในหน้าแก้ซับ | MIT | [github.com/SubtitleEdit/subtitleedit](https://github.com/SubtitleEdit/subtitleedit) |
| PaddleOCR | – | โมเดล PP-OCRv6 กับ PP-OCRv5 อ่านซับรูปเป็นตัวหนังสือในหน้า OCR ทำงานในเครื่อง ไม่ส่งภาพออกเน็ต · แนบมาเฉพาะอังกฤษ ญี่ปุ่น จีน ไทย ภาษาอื่นเก้าภาษากดโหลดในโปรแกรม ตรวจค่า SHA-256 ก่อนใช้ · ชุด ONNX จาก Hugging Face ของ PaddlePaddle | Apache-2.0 | [github.com/PaddlePaddle/PaddleOCR](https://github.com/PaddlePaddle/PaddleOCR) |
| ONNX Runtime | 1.32.0 | ตัวรันโมเดล PaddleOCR ในเครื่อง | MIT | [onnxruntime.ai](https://onnxruntime.ai) |
| Tesseract | 5.5.3 | ตัวอ่าน OCR อีกตัวในหน้า OCR พร้อมชุดภาษา eng tha jpn jpn_vert osd แบบ best · ชุดเดียวกับที่ Subtitle Edit ใช้ | Apache-2.0 | [github.com/tesseract-ocr/tesseract](https://github.com/tesseract-ocr/tesseract) |
| Hunspell | – | พจนานุกรมตรวจคำที่ไม่รู้จักในหน้า OCR ทั้ง en_US en_GB และ th_TH · ชุดจาก LibreOffice | ตามแต่ละชุด | [github.com/LibreOffice/dictionaries](https://github.com/LibreOffice/dictionaries) |
| mpv (libmpv) | 0.42.0 · ชุด 20261111 | เล่นหนังในหน้าแก้ซับ ถอดภาพด้วยการ์ดจอ วาดซับ ASS ครบทุกแท็ก · ชุดจาก shinchiro (mpv-winbuild-cmake) | GPLv2 ขึ้นไป | [mpv.io](https://mpv.io) |

### ใช้สร้างโปรแกรม

ซอร์สโค้ดของห้องสมุดเหล่านี้รวมอยู่ในตัวโปรแกรมตอนสร้าง

| โครงการ | รุ่น | ใช้ทำอะไรในชั้นหนัง | สัญญา | เว็บไซต์ |
|---|---|---|---|---|
| Claude | – | ตัวช่วยเขียนโปรแกรม · Claude Code กับโมเดล Claude Opus 5.5 ของ Anthropic | Anthropic | [claude.com/claude-code](https://claude.com/claude-code) |
| Aegisub | 3.5.1 | หน้าแก้ซับ แปลวิธีจากซอร์สเป็น Rust กับ TypeScript (อ่านเขียน ASS SRT ตั้งเวลา เวลาเฟรม คลื่นเสียง แถบเลื่อน เครื่องมือบนภาพ คุณสมบัติสคริปต์) ใส่ประกาศลิขสิทธิ์เดิมไว้หัวไฟล์ | BSD · ISC | [aegisub.org](https://aegisub.org) |
| Rust | 1.99.1 | ฝั่งหลังบ้านทั้งหมด อ่านไฟล์ เรียกเครื่องมือ เขียนไฟล์ · รุ่นที่ใช้สร้างโปรแกรม | MIT · Apache-2.0 | [rust-lang.org](https://www.rust-lang.org) |
| Tauri | 2.12.5 | โครงโปรแกรมบน Windows | MIT · Apache-2.0 | [tauri.app](https://tauri.app) |
| TypeScript | 7.0.2 | ภาษาที่เขียนหน้าจอทั้งหมด | Apache-2.0 | [typescriptlang.org](https://typescriptlang.org) |
| Vite | 8.3.6 | ตัวสร้างหน้าจอ รวมไฟล์ตอนสร้างโปรแกรม | MIT | [vite.dev](https://vite.dev) |
| React | 19.3.1 | หน้าจอทั้งหมด | MIT | [react.dev](https://react.dev) |
| image (Rust) | 0.25.10 | อ่าน ครอป และเข้ารหัสรูป | MIT · Apache-2.0 | [github.com/image-rs/image](https://github.com/image-rs/image) |
| ห้องสมุด Rust อื่น ๆ | – | serde อ่านเขียนข้อมูล · qcms แปลงสีรูป · jpeg-encoder · sha2 md-5 sha1 crc32fast คิดค่า hash · windows-sys · ort 2.0.0-rc.13 เรียก ONNX Runtime · spellbook 0.3.5 อ่านพจนานุกรม Hunspell (MPL-2.0 ซอร์สที่ [github.com/helix-editor/spellbook](https://github.com/helix-editor/spellbook)) · fancy-regex 0.20.2 นิพจน์ของรายการแก้คำ OCR | MIT · Apache-2.0 · MPL-2.0 | [crates.io](https://crates.io) |
| ฟอนต์ Sarabun | – | ตัวหนังสือทั้งโปรแกรม · Cadson Demak · ชุดจาก Fontsource | OFL | [fonts.google.com/specimen/Sarabun](https://fonts.google.com/specimen/Sarabun) |
| ไอคอนในหน้านี้ | – | Simple Icons กับ SVG Logos (CC0) · Icons8 · Wikimedia Commons · ไอคอนจากตัวโปรแกรมของแต่ละโครงการ | ตามแต่ละรูป | [simpleicons.org](https://simpleicons.org) · [icons8.com](https://icons8.com) · [commons.wikimedia.org](https://commons.wikimedia.org) |

## เอกสาร

- สเปกหน้าจอ [docs/MOCKUP-SPEC.md](docs/MOCKUP-SPEC.md) · ต้นแบบ [docs/mockups/](docs/mockups/)
- หลุมทางเทคนิคกับผลที่ลองจริง [docs/TECH-REVIEW.md](docs/TECH-REVIEW.md)
- งานที่จะทำต่อ [docs/ROADMAP.md](docs/ROADMAP.md) · บั๊กที่พี่กันรายงานกับชุดแก้ [docs/BUGS.md](docs/BUGS.md) · รายงานแต่ละขั้น `docs/REPORT-*.md`
- ผลตรวจทานโค้ดทั้งโปรแกรม 12 พ.ย. 2569 [docs/AUDIT-2026-11-12.md](docs/AUDIT-2026-11-12.md) (160 ข้อ แก้แล้ว 6 ข้อ)
