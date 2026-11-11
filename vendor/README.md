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
- 🔴 ค่า SHA-256 ของไฟล์บีบอัดทุกตัวจดซ้ำไว้ใน `scripts/fetch-tools.ps1` ช่วงบนของไฟล์ (รวมค่าของ `MACDll64.dll` ที่ถอดจากตัวติดตั้ง) · เปลี่ยนรุ่นเครื่องมือเมื่อไหร่ ต้องแก้ทั้งสองที่

## ตัวแปลงเสียง · แคลร์โหลด 7 พ.ย. 2569

ใช้ในหน้าเสียงและซับ (แปลงชนิดเสียงตอนรวม) กับหน้ากราฟเสียง (โหมดแปลงเป็นคิว) · พี่กันอนุญาตตอนเริ่มแผนเสียงและซับ *"โหลดเลย / และ mp3 เอาล่าสุด ล่าสุดทุกตัว"* และเคาะแหล่ง *"ชุดที่คนในวงการทำ (แนะนำ)"* สำหรับ opusenc กับ LAME ที่ผู้พัฒนาไม่ได้ทำตัวสำหรับ Windows เอง

| ไฟล์ | มาจาก | ขนาด (ไบต์) | ค่า SHA-256 ที่แคลร์คำนวณ |
|---|---|--:|---|
| `flac/flac-1.5.0-win.zip` | https://ftp.osuosl.org/pub/xiph/releases/flac/flac-1.5.0-win.zip (ทางการของ Xiph) | 1,318,000 | `53f1500f0d6e7c61379d7fee50d4a9f7f504c650009506d9ba015530d76c0dde` |
| `opus-tools/opus-tools-0.2-52-g5f894e9(using libopus 1.6.1-11-g788cc89)-x64.zip` | https://www.rarewares.org/files/opus/ (RareWares ทำจาก libopus 1.6.1) | 2,956,072 | `e6ed867d539f609da32f4780af70fffe2ed75a2a7a9751d42537341ca7995a09` |
| `lame/lame-4.0-x64.zip` | https://www.rarewares.org/files/mp3/lame-4.0-x64.zip (RareWares 23 ส.ค. 2569) | 823,296 | `722f4311e2795d5c852076a579b3183beeb76e9010d9cab1e7f9d2e86d9d0808` |
| `wavpack/wavpack-5.9.0-x64.zip` | https://github.com/dbry/WavPack/releases/download/5.9.0/wavpack-5.9.0-x64.zip (ทางการ) | 426,226 | `ad5e94bcde6f4edfc859210d98f144f225805a391c633c68f6dbb15a9e52570e` |
| `monkeys-audio/MAC_1345_SDK.zip` | https://www.monkeysaudio.com/files/MAC_1345_SDK.zip (ทางการ รุ่น 13.45 · เก็บไว้ ไม่ได้ใช้แล้ว) | 1,806,340 | `b12bda0eb9e31dbe01d54a970d387add3a8c1079901141021d257de17a6a9106` |
| `monkeys-audio/MAC_1346_SDK.zip` | https://www.monkeysaudio.com/files/MAC_1346_SDK.zip (ทางการ รุ่น 13.46 ขึ้นเว็บ 7 พ.ย. 2569 23:06 เวลาไทย · โหลด 8 พ.ย. 2569) ใช้แค่ข้อความสัญญาอนุญาต | 1,806,894 | `17359c36099b7e1000da40306905f027088ac798fed1cb5e2405c33aaa030f83` |
| `monkeys-audio/MAC_1346_x64.exe` | https://monkeysaudio.com/x64 → `files/MAC_1346_x64.exe` (ตัวติดตั้งทางการ ลายเซ็น Open Source Developer Matthew Ashland ถูกต้อง · โหลด 8 พ.ย. 2569) ใช้ดึง `MACDll64.dll` | 2,959,848 | `6a45c39588160e4154f23cb71607062131fbbec1cc4f566ddb92efc5bddbcf49` |
| `tak/TAK_2.3.3.zip` | http://www.thbeck.de/Download/TAK_2.3.3.zip (เว็บผู้ทำ Thomas Becker · มีแต่ http · TAK 2.3.3 ตัวจริง ออก 30 มิ.ย. 2565 · โหลด 8 พ.ย. 2569) | 1,765,343 | `40d26992266f1377d576b88b84b88d2ab256dc321e47f90314402a80692aba6a` |

- ทุกเว็บไม่ได้ให้ค่า hash ไว้เทียบ ค่าในตารางแคลร์คำนวณเองหลังโหลด ไว้เช็กว่าไฟล์ไม่เปลี่ยนภายหลัง
- เปิดแต่ละตัวแบบมีแค่ไฟล์ exe ตัวเดียวในโฟลเดอร์ว่างแล้ว `flac.exe` ต้องมี `libFLAC.dll` ข้างกัน · `lame.exe` ต้องมี `libmpg123-0.dll` ข้างกัน · `opusenc.exe` กับ `wavpack.exe` เปิดได้ตัวเดียว
- 🔴 **ชุด SDK ของ Monkey's Audio ไม่มีตัวแปลงแบบคำสั่ง (`MAC.exe`)** มีแต่ `Shared/64/MACDll64.dll` ซอร์สโค้ด และหัวไฟล์ · ใน DLL มีคำสั่งรับเสียงแบบส่งต่อเนื่อง `c_APECompress_Create` `c_APECompress_StartW` `c_APECompress_AddData` `c_APECompress_Finish` (หัวไฟล์ `Shared/MACDll.h`) โปรแกรมเรียก DLL นี้ตรงจาก Rust ส่งเสียงที่ ffmpeg ถอดแล้วเข้าไป
- ไฟล์บีบอัดของ opus-tools กับ LAME ไม่มีข้อความสัญญาอนุญาตแนบ · ใช้ข้อความ LGPL 2.1 จากชุด FLAC แทนของ LAME กับ libmpg123 (LAME เขียนว่า LGPL รุ่น 2 หรือใหม่กว่า) · ของ opus-tools จดชื่อสัญญา BSD 2 ข้อกับที่อยู่ข้อความเต็มไว้ใน `src-tauri/tools/licenses/SOURCES.txt`
- รุ่นที่อ่านจากตัวโปรแกรมจริง `flac 1.5.0` · `LAME 64bits version 4.0` · `opusenc opus-tools 0.2-52-g5f894e9 (using libopus 1.6.1-11-g788cc89)` · `wavpack 5.9.0` · Monkey's Audio `MACDll64.dll` ตอบ `13.46` · TAK `TAKC 2.3.3` (`Takc -version` · Takc เป็นโปรแกรม 32 บิต)
- 🔴 **`MACDll64.dll` ที่คอมไพล์มาแล้วในชุด SDK 13.45 และ 13.46 เป็นไฟล์เดียวกัน รุ่น 12.36** (719,872 ไบต์ ลงวันที่ 25 ก.พ. 2569) · เรียก `GetLibraryVersionString` ได้ `12.36` และในไฟล์ไม่มีเลข 13.x · ซอร์สในชุดเป็นรุ่นใหม่แต่ผู้ทำไม่ได้สร้าง DLL ใหม่ใส่ชุด (ลอง 8 พ.ย. 2569)
- 🔴 **`MACDll64.dll` รุ่น 13.46 จริงดึงจากตัวติดตั้ง `MAC_1346_x64.exe`** ด้วย `scripts/nsis-extract.py` (8 พ.ย. 2569 พี่กันสั่ง *"จัดเลย / ลิง เอาไงงง ไปหามา"*) · ตัวติดตั้งเป็น NSIS บีบ LZMA ก้อนเดียว สคริปต์ถอดในเครื่องแล้วหาก้อนที่ตาราง export ชื่อ `MACDll64.dll` ไม่รันตัวติดตั้ง ไม่มีหน้าต่าง ไม่ต้องใช้ 7-Zip (เครื่องนี้ไม่มี) · ต้องมี Python (`py`) · DLL ที่ได้ 764,728 ไบต์ รุ่น 13.46.0.0 ลายเซ็น Matthew Ashland ถูกต้อง ประทับเวลา Certum · `fetch-tools.ps1` เช็กทั้ง hash และลายเซ็นทุกครั้ง
- ในตัวติดตั้ง 13.46 ผู้ทำแนบตัวแปลงอื่นมาด้วย (ตรงกับหน้าเว็บที่เขียนว่า external encoders are part of the install) · `flac.exe` `libFLAC.dll` `wavpack.exe` ในนั้นตรงทุกไบต์กับตัวที่เราใช้ และ `Takc.exe` ตรงทุกไบต์กับตัวในชุด TAK 2.3.3 (SHA-256 `a78a96a6fb7c0a83dfa6d2ed9156f11a51a5f1deed97187c18b24def82dbc195`) · เป็นการยืนยันจากแหล่งที่สองที่มีลายเซ็น
- fdkaac ไม่แนบ ผู้ใช้ใส่เองในโฟลเดอร์ตัวแปลงที่ใส่เอง · **qaac แนบแล้ว 10 พ.ย. 2569** หัวข้อ qaac ข้างล่าง
- 🔴 **TAK แนบไฟล์ zip เดิมทั้งไฟล์** · สัญญาใน Readme.html ของชุด (หัวข้อ License กับ Distribution) บอกว่าฟรีสำหรับใช้ส่วนตัวที่ไม่ใช่การค้า แจกต่อได้ถ้าไม่ดัดแปลง ไฟล์ zip เดิมอยู่ครบพร้อมไฟล์ประกอบทุกไฟล์ และไม่คิดเงิน · จึงไม่แยก Takc.exe ออกไปแจกเดี่ยว ๆ · `fetch-tools.ps1` คัดลอก `TAK_2.3.3.zip` ทั้งไฟล์ลง `src-tauri/tools/` โปรแกรมแตก `Takc.exe` กับ `Readme.html` ไปไว้ที่ `AppData\Local\ชั้นหนัง\TAK 2.3.3` ตอนใช้ครั้งแรก (`encode.rs` `ensure_tak` ใช้ tar ของ Windows)
- เว็บ TAK เปิดได้แค่ http (https ต่อไม่ได้) ไม่มี hash ให้เทียบ · ยืนยันความถูกต้องด้วย Takc.exe ที่ตรงกับตัวในตัวติดตั้ง Monkey's Audio ที่มีลายเซ็น
- ปลั๊กอิน foo_input_tak ของ foobar2000 (0.5.9 ออก 5 พ.ย. 2568) กับตัวถอด TAK ใน FFmpeg (`libavcodec/tak.h`) อ่านได้อย่างเดียว สร้างไฟล์ TAK ไม่ได้ · ffmpeg ที่แนบมามีตัวถอดนี้ จึงตรวจและวาดกราฟไฟล์ TAK ได้

## libheif สำหรับบันทึกรูปกราฟเป็น HEIC · แคลร์โหลด 9 พ.ย. 2569

พี่กันบอก *"ไม่เอาแบบนี้จิ ขอแบบของจริง"* แล้วเลือกใช้ `heif.dll` · โปรแกรมเรียก DLL ตรงจาก Rust (`graphimg.rs` โมดูล `heif`) · เก็บที่ `vendor/heif/` · แตกด้วย `scripts/fetch-heif.ps1` ที่ `fetch-tools.ps1` เรียกตอนท้าย

| ไฟล์ | ได้อะไร | สัญญา | ขนาด (ไบต์) | ค่า SHA-256 |
|---|---|---|--:|---|
| `libheif-1.23.7-gpl_h67fb079_103.conda` | `heif.dll` | LGPL 3 ขึ้นไป | 680,430 | `687983f329527d15ec4048b2ec3f7cbb66f6c7bddad589327aa2a13d3560d056` |
| `x265-3.5-h3ee6617_4.conda` | `libx265.dll` | GPL 2 ขึ้นไป | 3,099,189 | `684d28d37d808e4cefbcc87e8039f8f0cc3a6ed16c91d05731f6e1f0bf79a3eb` |
| `libde265-1.1.3-h477610d_1.conda` | `libde265.dll` | LGPL 3 ขึ้นไป | 227,750 | `1ad6ce985e8306ce74026a110898a7c91b41b927d1bfa57f3935270f5e199d5d` |
| `aom-3.15.3-pl5321h06fc181_0.conda` | `aom.dll` | BSD 2 ข้อ | 2,226,803 | `302f726d93ad4c113a8f7b8d72b5d1bcf1ad3ff10950ee6161b99787025458da` |
| `libdav1d7-1.5.4-h6a83c73_4.conda` | `dav1d.dll` | BSD 2 ข้อ | 712,414 | `8c4514f16f22eabec86afaf737285efded4b09633e0e4fb50d58e51830b3471e` |
| `libwebp-base-1.6.0-h4d5522a_1.conda` | `libsharpyuv.dll` | BSD 3 ข้อ | 278,886 | `4470d98d3178b0d45492eed4808afe421d2e7808352b8d06c2dc29166b75d94d` |
| `vc14_runtime-14.51.36247-habf1de7_42.conda` | `msvcp140.dll` `vcruntime140.dll` `vcruntime140_1.dll` | ข้อตกลงของ Microsoft | 767,099 | `8dfbfd68ebf53249d11e528cbb80ad5a2460b0c5b4636eed82ee0d3950827a3d` |

- มาจาก https://conda.anaconda.org/conda-forge/win-64/ · libheif ทางการมีแต่ซอร์สโค้ด ไม่มีตัวสำหรับ Windows · ค่า SHA-256 ตรงกับที่ conda-forge แจ้งทุกไฟล์ตอนโหลด
- รายการ DLL ไล่จากตาราง import ของ `heif.dll` จริง · ต้องมี aom กับ dav1d ถึงแม้ HEIC ใช้แค่ x265 เพราะ `heif.dll` ชุดนี้ผูกกับสองตัวนั้นตอนเปิด เปิดไฟล์ไม่ได้ถ้าขาด
- runtime สามไฟล์แนบเพราะเครื่องที่ไม่มี Visual C++ Redistributable เปิด `heif.dll` ไม่ได้ · ลายเซ็น Microsoft Windows Software Compatibility Publisher ถูกต้อง · `fetch-heif.ps1` เช็กลายเซ็นทุกครั้ง
- รวม 9 ไฟล์ราว 31 MB ก่อนบีบ เปิดเฉพาะตอนบันทึก HEIC ครั้งแรก แล้วค้างในหน่วยความจำจนปิดโปรแกรม

## ไฟล์ที่แตกแล้ว · `src-tauri/tools/` (ไม่ขึ้น git · 6 พ.ย. 2569 · ตัวแปลงเสียงเพิ่ม 7 พ.ย. 2569)

`scripts/fetch-tools.ps1` เช็ก SHA-256 ของไฟล์บีบอัดก่อนแตก แล้วคัดเฉพาะ 24 ไฟล์นี้กับไฟล์สัญญาอนุญาตลง `src-tauri/tools/`
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
| `MACDll64.dll` | 764,728 | `281a72e6e27a49c03a41b02542490f296f235fd2fec30e62c1b0783f653c3a6c` (13.46 จากตัวติดตั้ง · เดิม 12.36 จากชุด SDK `da666525…39302` 719,872 ไบต์) |
| `TAK_2.3.3.zip` | 1,765,343 | `40d26992266f1377d576b88b84b88d2ab256dc321e47f90314402a80692aba6a` (ไฟล์เดิมทั้งไฟล์) |
| `heif.dll` | 1,543,680 | `b5209e57d768bd471cecfffbde44f9e0fc2a31d962627fd804b853b7f7dc2950` |
| `libx265.dll` | 16,844,288 | `14a2f662ab38132e4ea934521ca446964c4fe1de75e4bcea9a6a18493e7bce1f` |
| `libde265.dll` | 377,344 | `fd49725f382097cb89c73b3d682ffbd19c95aef80e02a7f42bd08898c3002fa2` |
| `aom.dll` | 10,182,144 | `8c9dbaeb1f0b9ad951fab804cc40b0915ba502b6023bdd752f12b3f1e98505f0` |
| `dav1d.dll` | 1,850,368 | `d54f5ce3f48cce2f7ed340e16bbaacc48601ac4a7d41a1410d35a0da1049b362` |
| `libsharpyuv.dll` | 25,600 | `09e089c9ad5da983f04e98ccc8f41de1750b0a351370a4d42b9080c3e68eac50` |
| `msvcp140.dll` | 643,512 | `7c26614e1d733892c2deac7e245ce115504b1d80592dd0a01b08e3e5a55f89ca` |
| `vcruntime140.dll` | 178,616 | `d1f4225df2cd877dbf130d5668a021dce3f94118455ff5ec952061c30afc9ce7` |
| `vcruntime140_1.dll` | 50,112 | `a7146c08f89fe5b04541ab507cdb59ff7b44534d4ba3c668a426c6450a03434e` |

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

## qaac กับ refalac · พี่กันโหลด 10 พ.ย. 2569 แนบไปกับตัวติดตั้ง

พี่กันสั่ง *"อันไหนฟรี ทำได้ เอาเข้าหมด โดยไม่ต้องถาม ส่วน qaac เอาเข้าได้ แต่ต้องบอกผู้ใช้ให้โหลด itune เอง"* · แบบเดียวกับ foobar2000 Free Encoder Pack ที่แนบ qaac กับ refalac และเขียนว่า AAC ต้องติดตั้ง iTunes

| ไฟล์ | ได้มาจาก | ขนาด (ไบต์) | ค่า SHA-256 |
|---|---|---|---|
| `qaac/qaac_3.07.zip` | https://github.com/nu774/qaac/releases (v3.07 ออก 10 ก.ย. 2569 · พี่กันโหลดเอง) | 6,680,770 | `1fb3ab4aa81725e2607ac1b31afa0e13d2617ee6eb5900f5070c092f5271cbb3` |
| `qaac/COPYING.txt` | https://raw.githubusercontent.com/nu774/qaac/master/COPYING (ไฟล์ zip ไม่มีข้อความสัญญา) | | |

- แตกเฉพาะชุด x64 `qaac64.exe` `refalac64.exe` `libsoxr64.dll` ลง `src-tauri/tools/` · ข้อความสัญญาลง `licenses/qaac-COPYING.txt`
- สัญญา ตัว qaac เป็น Public Domain · ตัวเข้ารหัส ALAC ของ Apple ข้างในเป็น Apache 2.0 (หัวไฟล์ซอร์ส ALAC) · ข้างในยังมี TagLib (LGPL/MPL) libsoxr (LGPL) และห้องสมุด ISOBMFF ของ Fraunhofer (mmtisobmff สัญญา Fraunhofer FDK MPEG-H Software License) ตาม COPYING · ซอร์สเปิดอยู่ที่ที่เก็บของผู้ทำ
- 🔴 qaac ไม่มีตัวเข้ารหัส AAC ในตัว เรียกใช้ CoreAudioToolbox.dll ของ Apple ที่มากับ iTunes · ไฟล์ของ Apple แจกไม่ได้ ไม่แนบ ไม่ขึ้น GitHub · ไม่มี iTunes การ์ดขึ้น "ต้องติดตั้ง iTunes" และกดเลือก qaac แล้วขึ้นหน้าต่างพร้อมปุ่มเปิดหน้าโหลด iTunes
- เครื่องพี่กันแกะไฟล์ของ Apple 8 ตัวจากตัวติดตั้ง iTunes ไว้ใน `AppData\Local\ชั้นหนัง\ตัวแปลง\QTfiles64` ข้าง qaac ที่วางไว้ในโฟลเดอร์ตัวแปลงที่ใส่เอง (รายงาน docs/REPORT-2026-11-10-ALAC-qaac.md) · ตัวที่แนบมาใช้ไม่ได้บนเครื่องนี้ โปรแกรมจึงเลือกตัวในโฟลเดอร์ตัวแปลงที่ใช้ได้
- 🔴 CoreAudioToolbox 7.9.8 ขึ้นไปทำให้ AAC แบบ CBR เสียงผิดเพี้ยน (README ของ qaac) · เทสด้วยเพลงของพี่กันแล้วเจอจริง

## MediaInfo GUI ตัวเต็ม (ไว้ดูอ้างอิง ไม่แนบในโปรแกรม)

| ไฟล์ | มาจาก | ขนาด | ค่า SHA-256 |
|---|---|---|---|
| `mediainfo-gui/MediaInfo_GUI_26.10_Windows.exe` | พี่กันโหลดเองจาก https://mediaarea.net/th/MediaInfo ให้ 10 พ.ย. 2569 | 15,716,384 ไบต์ (15.0 MB) | `e84193f2c068c677804924763e4cf9c7bc3d7138482ab174939a5b66cd896d6e` |

- พี่กันสั่ง *"เก็บ exe นั้นไว้ด้วย"* ไว้ดูไอเดียตอนทำหน้า MediaInfo (ROADMAP หัวข้อ MediaInfo แบบหน้าต่างเล็ก) · ไม่ขึ้น git (`vendor/**/*.exe`)
- แกะดูข้างในแบบอ่านในหน่วยความจำ ไม่เขียนไฟล์ ไม่รัน `py -3 -I -X utf8 scripts/nsis-peek.py <ตัวติดตั้ง.exe>`
