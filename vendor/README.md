# ของที่ต้องใช้ตอนทำโปรแกรมชั้นหนังจริง

โหลดเมื่อ 6 พ.ย. 2569 · จดไว้ใช้ตอนลงมือทำโปรแกรมจริง

## ซอร์สโค้ด MKVToolNix

| ไฟล์ | มาจาก | ขนาด | ค่า SHA-256 |
|---|---|---|---|
| `mkvtoolnix-source/mkvtoolnix-103.0.tar.xz` | https://mkvtoolnix.download/source.html | 11,217,068 ไบต์ (10.7 MB) | `d609bc395c409eade05d0a3a5aedd26e09739e232ed03b0f937cf8bd9448c590` |
| `mkvtoolnix-source/mkvtoolnix-103.0.tar.xz.sig` | หน้าเดียวกัน | 833 ไบต์ | ลายเซ็นของผู้พัฒนา ไว้ยืนยันว่าไฟล์ซอร์สเป็นของแท้ |

- ซอร์สโค้ดของ MKVToolNix รุ่น 103.0 สัญญาอนุญาต GPL v2 แจกฟรี
- ตรวจแล้ว ไฟล์บีบอัดครบไม่เสีย ข้างในมี 2,831 ไฟล์ ยังไม่ได้แตกไฟล์
- ยังไม่ได้เช็กลายเซ็น เพราะต้องเพิ่มกุญแจของผู้พัฒนาเข้าเครื่องก่อน
- ตอนทำโปรแกรมจริง **ไม่ต้องแก้หรือคอมไพล์ซอร์สนี้** ใช้ตัวโปรแกรมสำเร็จรูปบน Windows ในข้อ 1 ข้างล่างได้เลย ซอร์สเก็บไว้ดูวิธีทำงาน และแนบไปด้วยถ้าจะแจกโปรแกรมให้คนอื่น

## FFmpeg · พี่กันโหลดเอง (6 พ.ย. 2569)

- ไฟล์ที่ได้ชื่อ `ffmpeg-9.0.2-full_build.7z` รุ่น 9.0.2 แบบ full ขนาด 168,971,636 ไบต์ (161 MB)
- 🔴 เดิมแคลร์จดว่ารุ่น 8.1.2 ซึ่งผิด หน้าเว็บมีเลขทั้ง 8.1.2 และ 9.0.2 ลิงก์นี้ให้รุ่น 9.0.2
- พี่กันโหลดมา แล้วย้ายมาเก็บที่ `vendor/ffmpeg/ffmpeg-9.0.2-full_build.7z` (6 พ.ย. 2569) · แตกแล้วด้วย `scripts/fetch-tools.ps1` (ดูหัวข้อ ไฟล์ที่แตกแล้ว ข้างล่าง)
- ✅ เทียบแล้ว 6 พ.ย. 2569 ค่า SHA-256 กับขนาดไฟล์ตรงกับที่เว็บให้มาทุกตัว ไฟล์ครบไม่เสีย
- ลิงก์ https://www.gyan.dev/ffmpeg/builds/ffmpeg-release-full.7z
- ค่า SHA-256 ที่เว็บให้มา `f0e46253c70dfe902bac915dfb4224f0cf1b7c6eeab9da2ccc9a5581f9a71b13` (เก็บไว้ใน `ffmpeg/ffmpeg-release-full.7z.sha256`)
- แคลร์ลองโหลดแล้ว เว็บส่งไฟล์มาช้ามากและค้างที่ 25 MB จึงหยุดและลบไฟล์ที่ค้างทิ้ง

## MKVToolNix แบบ portable กับ MediaInfo · พี่กันโหลดเอง (6 พ.ย. 2569)

| ไฟล์ | มาจาก | ขนาด | ค่า SHA-256 ที่แคลร์คำนวณ |
|---|---|---|---|
| `mkvtoolnix/mkvtoolnix-64-bit-103.0.7z` | https://mkvtoolnix.download/windows/releases/103.0/mkvtoolnix-64-bit-103.0.7z | 31,400,293 ไบต์ (30 MB) | `01d76dbfdbd5615d9e02f69b0710d1429a902d47a98c8eee33bd884c4fcb3cbf` |
| `mediainfo/MediaInfo_CLI_26.10_Windows_x64.zip` | https://mediaarea.net/download/binary/mediainfo/26.10/MediaInfo_CLI_26.10_Windows_x64.zip | 4,186,111 ไบต์ (4 MB) | `4cc94bd272903914c04f4f9a9f53a6c94b5ea6c6454cf738d29fa182c41e8a29` |

- ✅ ขนาดทั้งสองไฟล์ตรงกับที่เว็บบอกทุกไบต์ ย้ายจากโฟลเดอร์ Downloads มาเก็บที่นี่แล้ว · แตกแล้วด้วย `scripts/fetch-tools.ps1`
- สองเว็บนี้ไม่ได้ให้ค่า hash ไว้เทียบ ค่าในตารางแคลร์คำนวณเองไว้ใช้เช็กว่าไฟล์ไม่เปลี่ยนไปภายหลัง
- 🔴 ค่า SHA-256 ของไฟล์บีบอัดทุกตัวจดซ้ำไว้ใน `scripts/fetch-tools.ps1` บรรทัด 10 ถึง 18 · เปลี่ยนรุ่นเครื่องมือเมื่อไหร่ ต้องแก้ทั้งสองที่

## ตัวแปลงเสียง · แคลร์โหลด 7 พ.ย. 2569

ใช้ในหน้าเสียงและซับ (แปลงชนิดเสียงตอนรวม) กับหน้ากราฟเสียง (โหมดแปลงเป็นคิว) · พี่กันอนุญาตตอนเริ่มแผนเสียงและซับ *"โหลดเลย / และ mp3 เอาล่าสุด ล่าสุดทุกตัว"* และเคาะแหล่ง *"ชุดที่คนในวงการทำ (แนะนำ)"* สำหรับ opusenc กับ LAME ที่ผู้พัฒนาไม่ได้ทำตัวสำหรับ Windows เอง

| ไฟล์ | มาจาก | ขนาด (ไบต์) | ค่า SHA-256 ที่แคลร์คำนวณ |
|---|---|--:|---|
| `flac/flac-1.5.0-win.zip` | https://ftp.osuosl.org/pub/xiph/releases/flac/flac-1.5.0-win.zip (ทางการของ Xiph) | 1,318,000 | `53f1500f0d6e7c61379d7fee50d4a9f7f504c650009506d9ba015530d76c0dde` |
| `opus-tools/opus-tools-0.2-52-g5f894e9(using libopus 1.6.1-11-g788cc89)-x64.zip` | https://www.rarewares.org/files/opus/ (RareWares ทำจาก libopus 1.6.1) | 2,956,072 | `e6ed867d539f609da32f4780af70fffe2ed75a2a7a9751d42537341ca7995a09` |
| `lame/lame-4.0-x64.zip` | https://www.rarewares.org/files/mp3/lame-4.0-x64.zip (RareWares 23 ส.ค. 2569) | 823,296 | `722f4311e2795d5c852076a579b3183beeb76e9010d9cab1e7f9d2e86d9d0808` |
| `wavpack/wavpack-5.9.0-x64.zip` | https://github.com/dbry/WavPack/releases/download/5.9.0/wavpack-5.9.0-x64.zip (ทางการ) | 426,226 | `ad5e94bcde6f4edfc859210d98f144f225805a391c633c68f6dbb15a9e52570e` |
| `monkeys-audio/MAC_1345_SDK.zip` | https://www.monkeysaudio.com/files/MAC_1345_SDK.zip (ทางการ รุ่น 13.45) | 1,806,340 | `b12bda0eb9e31dbe01d54a970d387add3a8c1079901141021d257de17a6a9106` |

- ทุกเว็บไม่ได้ให้ค่า hash ไว้เทียบ ค่าในตารางแคลร์คำนวณเองหลังโหลด ไว้เช็กว่าไฟล์ไม่เปลี่ยนภายหลัง
- เปิดแต่ละตัวแบบมีแค่ไฟล์ exe ตัวเดียวในโฟลเดอร์ว่างแล้ว `flac.exe` ต้องมี `libFLAC.dll` ข้างกัน · `lame.exe` ต้องมี `libmpg123-0.dll` ข้างกัน · `opusenc.exe` กับ `wavpack.exe` เปิดได้ตัวเดียว
- 🔴 **ชุด SDK ของ Monkey's Audio ไม่มีตัวแปลงแบบคำสั่ง (`MAC.exe`)** มีแต่ `Shared/64/MACDll64.dll` ซอร์สโค้ด และหัวไฟล์ · ใน DLL มีคำสั่งรับเสียงแบบส่งต่อเนื่อง `c_APECompress_Create` `c_APECompress_StartW` `c_APECompress_AddData` `c_APECompress_Finish` (หัวไฟล์ `Shared/MACDll.h`) โปรแกรมเรียก DLL นี้ตรงจาก Rust ส่งเสียงที่ ffmpeg ถอดแล้วเข้าไป ไม่ต้องโหลดตัวติดตั้ง `MAC_1345.exe` เพิ่ม
- ไฟล์บีบอัดของ opus-tools กับ LAME ไม่มีข้อความสัญญาอนุญาตแนบ · ใช้ข้อความ LGPL 2.1 จากชุด FLAC แทนของ LAME กับ libmpg123 (LAME เขียนว่า LGPL รุ่น 2 หรือใหม่กว่า) · ของ opus-tools จดชื่อสัญญา BSD 2 ข้อกับที่อยู่ข้อความเต็มไว้ใน `src-tauri/tools/licenses/SOURCES.txt`
- รุ่นที่อ่านจากตัวโปรแกรมจริง `flac 1.5.0` · `LAME 64bits version 4.0` · `opusenc opus-tools 0.2-52-g5f894e9 (using libopus 1.6.1-11-g788cc89)` · `wavpack 5.9.0` · Monkey's Audio `APE_VERSION_MAJOR 13` `APE_VERSION_REVISION 45` (`Shared/Version.h`)
- qaac fdkaac TAK ไม่แนบ (สัญญาอนุญาตหรือของที่ต้องพึ่งไม่ให้แจก) ผู้ใช้ใส่เองในโฟลเดอร์ตัวแปลงที่ใส่เอง (แผนขั้น 3)

## ไฟล์ที่แตกแล้ว · `src-tauri/tools/` (ไม่ขึ้น git · 6 พ.ย. 2569 · ตัวแปลงเสียงเพิ่ม 7 พ.ย. 2569)

`scripts/fetch-tools.ps1` เช็ก SHA-256 ของไฟล์บีบอัดก่อนแตก แล้วคัดเฉพาะ 14 ไฟล์นี้กับไฟล์สัญญาอนุญาตลง `src-tauri/tools/`
ค่าข้างล่างไว้เทียบตอนเช็กสถานะเครื่องมือ (ขั้น 7) และตอนตรวจตัวติดตั้ง (ขั้น 8) ว่าเครื่องมือที่แนบไปไม่เพี้ยน

| ไฟล์ | ขนาด (ไบต์) | ค่า SHA-256 |
|---|--:|---|
| `ffmpeg.exe` | 227,823,104 | `589e50b766d251afdf181dd664d40bd94407e200b019989fd7468c7d118a28d0` |
| `ffprobe.exe` | 227,621,376 | `02264dfa4f56baaa31e443ece8aa16d397f6b008200e7fd184d22b9009e75fd3` |
| `LIBCURL.DLL` | 817,664 | `22b972f008ab8bb5bc225889a8be60683b2bf7546b8e0d699b5b4186bdbb7cc1` |
| `MediaInfo.exe` | 9,407,896 | `35d5bdf5bd3ef0776c50e22492b4e5b0ee687f9c115d9b61f4feba3e881dfbf9` |
| `mkvextract.exe` | 23,687,480 | `a7e8b7358c743cbd4d5261ff0d09b1ae0538a5825266a31110c00d978ae36403` |
| `mkvmerge.exe` | 28,351,800 | `e66056a12f5b99a43c37f11374a0b08648a1cef7a0c99e0c15786e95abfc5ddd` |
| `mkvpropedit.exe` | 22,515,000 | `ab06c9f72e58970a584f20231d6676886f95732c8c0f251a22d9f9ccf1542fd2` |
| `flac.exe` | 339,456 | `ff23d9cbc11d18c02f262c3ee455830ea13fbe8d9876249f0bdf101e3ad66709` |
| `libFLAC.dll` | 522,240 | `f93499172875fc2c0df80b57086f32e3f39e835283952ee2a59a3d4ffb097644` |
| `lame.exe` | 966,656 | `04839dd7308fa83e415584353475d605769043da05dd68c9bf60b15cdbef8b02` |
| `libmpg123-0.dll` | 429,481 | `018e6833088b3fc7d9a97c3f45abb5f9f947f7c46de4f17fddf423f430fa70fa` |
| `opusenc.exe` | 793,600 | `ec1597618e30fbe97b3dfcd60639d444644cf302a777eb92049a61d1930ef5e8` |
| `wavpack.exe` | 321,536 | `e26ad2ed3c8e417bd62e0b8eb4ee9b9e2f261a859c9cc18c99026e2b7f8fc661` |
| `MACDll64.dll` | 719,872 | `da666525fb65d3ce8511c8a53c10f30e7e52c56ec5111ca66683eb4b07339302` |

## รายการเครื่องมือของโปรแกรมชั้นหนัง

ข้อ 1 ถึง 3 โหลดครบแล้ว อยู่ในโฟลเดอร์ vendor

| # | โปรแกรม | ใช้ทำอะไรในชั้นหนัง | หาได้ที่ |
|---|---|---|---|
| 1 | **MKVToolNix รุ่นพกพาสำหรับ Windows 64 บิต** (`mkvmerge.exe` · `mkvextract.exe` · `mkvpropedit.exe`) | ครอบเป็น MKV · แนบโปสเตอร์ · เปลี่ยนรูปแนบโดยไม่ต้องครอบใหม่ · แยกไฟล์ | https://mkvtoolnix.download/downloads.html หัวข้อ Windows เลือกแบบ portable |
| 2 | **FFmpeg สำหรับ Windows** (`ffmpeg.exe` · `ffprobe.exe`) | ส่งออกเป็น MP4 · ตรวจละเอียดทุกเฟรม · แปลงรูป WebP BMP TIFF HEIC · ครอปและย่อรูป | https://ffmpeg.org/download.html หัวข้อ Windows (ลิงก์ไปเว็บที่ทำตัวสำเร็จรูปให้) |
| 3 | **MediaInfo** (เลือกแบบ CLI `MediaInfo.exe` คู่กับ `LIBCURL.DLL`) | หน้าข้อมูลไฟล์แบบ MediaInfo ภาษาอังกฤษ | https://mediaarea.net/en/MediaInfo/Download/Windows |
| 4 | **Icaros** (ไม่บังคับ ไม่รวมในโปรแกรม) | ให้ Windows โชว์โปสเตอร์ MKV เป็นไอคอนไฟล์ ผู้ใช้ลงเองถ้าอยากได้ | ค้นคำว่า Icaros Xanashi |

- ค่า hash (MD5 · SHA-1 · SHA-256 · CRC32 · SHA-512) ไม่ต้องโหลดอะไรเพิ่ม ภาษาที่ใช้เขียนโปรแกรมทำได้เอง
- รูป HEIC ลองแล้ว FFmpeg 9.0.2 เปิดได้ความละเอียดเต็ม ไม่ต้องหาตัวแปลงเพิ่ม (รายละเอียด `docs/TECH-REVIEW.md` หัวข้อ ต้องลองจริงในขั้นเตรียม)
- โหลดเฉพาะจากเว็บทางการในตาราง เทียบค่า hash ที่เว็บให้มาทุกครั้ง
- ถ้าจะแจกโปรแกรมให้คนอื่น ต้องแนบไฟล์สัญญาอนุญาตของทุกตัว และบอกว่าโหลดซอร์สได้ที่ไหน
