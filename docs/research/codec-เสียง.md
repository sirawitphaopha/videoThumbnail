# ชนิดเสียง (codec) ทุกตัว · ตัวแปลงต้นฉบับ รุ่นล่าสุด และที่ใช้ในชั้นหนังได้

ค้นเมื่อ 7 พ.ย. 2569 · พี่กันสั่ง *"ไปค้น codec เสียงมาทุกตัวเลย"* ใช้กับงานใส่เสียงเข้าหนังและแปลงเสียง ([ROADMAP.md](../ROADMAP.md) หัวข้องานถัดไป)
วิธีค้น ค้นเว็บของผู้ทำแต่ละตัวกับหน้าที่อ้างถึง · ตัวในโปรแกรมของเราเช็กจาก ffmpeg ที่แนบ (แปลงเสียงทดสอบแล้วอ่านรุ่นที่ฝังในไฟล์ ลองใส่ MKV กับ MP4 จริง)
ช่อง **ยังไม่แน่** = แหล่งที่เจอขัดกันหรือเก่า ต้องเช็กเว็บผู้ทำอีกครั้งตอนขออนุญาตโหลด

## คำศัพท์
- **ตัวต้นฉบับ** ตัวแปลงที่ผู้คิดชนิดไฟล์นั้นทำเอง เช่น flac.exe ของ Xiph
- **ตัวใน ffmpeg** มีสองแบบ ① ffmpeg เขียนตัวแปลงขึ้นเองตามเอกสารมาตรฐาน (เช่น FLAC AAC AC-3) ② ffmpeg เรียกใช้ไลบรารีต้นฉบับข้างใน (เช่น MP3 ใช้ LAME · Opus ใช้ libopus · Vorbis ใช้ libvorbis) แบบหลังได้เสียงเหมือนตัวต้นฉบับรุ่นเดียวกัน
- **ใส่ MKV · ใส่ MP4** ผลลองจริงกับ mkvmerge 103.0 และ ffmpeg 9.0.2 ที่แนบ (7 พ.ย. 2569)

## โปรแกรมหลักที่แนบอยู่
| โปรแกรม | ในชั้นหนัง | รุ่นล่าสุด | สรุป |
|---|---|---|---|
| ffmpeg | 9.0.2 | 9.0.2 "Lei" 18 ก.ย. 2569 (มีสาย 8.1.3 ออก 21 ก.ย. 2569 คู่กัน) | ล่าสุดแล้ว |
| MKVToolNix | 103.0 | 103.0 18 ต.ค. 2569 | ล่าสุดแล้ว |

## แบบไม่เสียคุณภาพ (lossless)
| ชนิด | ตัวต้นฉบับ | รุ่นล่าสุด | สัญญาอนุญาต · แจกไปกับโปรแกรมได้ไหม | ffmpeg ที่แนบ | ใส่ MKV | ใส่ MP4 | หมายเหตุ |
|---|---|---|---|---|:--:|:--:|---|
| FLAC | flac / libFLAC (Xiph) | **1.5.0** 11 ก.พ. 2568 · ไม่เจอรุ่นปี 2569 | BSD (ไลบรารี) GPL (โปรแกรม) · แจกได้ | มี · ffmpeg เขียนเอง | ได้ | ได้ | 1.5.0 แปลงหลายเส้นทำงานพร้อมกัน · เอกสารมาตรฐาน RFC 9639 (ธ.ค. 2567) |
| WavPack | wavpack (David Bryant) | **5.9.0** ม.ค. 2569 | BSD · แจกได้ | มี · ffmpeg เขียนเอง | ได้ | ไม่ได้ | ตัวต้นฉบับมีโหมดผสม ไฟล์เล็กแบบเสียคุณภาพคู่กับไฟล์แก้ให้กลับเป็นไม่เสียคุณภาพ (ยังไม่ได้เช็กว่าตัวใน ffmpeg ทำได้ไหม) |
| ALAC | ซอร์สของ Apple (เปิดปี 2554) ใช้ผ่าน refalac หรือ qaac | ซอร์สไม่ได้ออกรุ่นใหม่ · รุ่น refalac **ยังไม่แน่** | Apache 2.0 · แจกได้ | มี · ffmpeg เขียนเอง | ได้ | ได้ | |
| TTA | ttaenc (TTA project) | **ยังไม่แน่** ตัวคำสั่ง 3.4.1 · หน้า Windows 2.3 (2558) | GPL / LGPL · แจกได้ | มี · ffmpeg เขียนเอง | ได้ | ไม่ได้ | |
| Monkey's Audio (APE) | MAC (Matthew Ashland) | **13.46** 7 พ.ย. 2569 (เดิมจด 13.45 30 ต.ค. 2569) | BSD 3 ข้อ แนบได้ (ตัวที่แนบคือ MACDll64.dll จากตัวติดตั้ง · vendor/README.md) | ไม่มีตัวแปลง (ถอดได้อย่างเดียว) | ไม่ได้* | ไม่ได้ | บีบเล็กกว่า FLAC · ใช้ได้เฉพาะแปลงไฟล์เสียงแยกที่หน้ากราฟเสียง |
| TAK | TAK (Thomas Becker) | **2.3.3** ตัวจริง 30 มิ.ย. 2565 (เว็บผู้ทำ 8 พ.ย. 2569 · เดิมจด 2.3.2 กับ 2.3.3 beta 3) | ฟรีแต่ปิดซอร์ส ใช้ส่วนตัวที่ไม่ใช่การค้าได้ · แจกต่อได้เฉพาะไฟล์ zip เดิมทั้งไฟล์ (อ่านจาก Readme.html ในชุด 8 พ.ย. 2569) · โปรแกรมแนบ zip ทั้งไฟล์ | ไม่มีตัวแปลง | ไม่ได้* | ไม่ได้ | แปลงเร็ว บีบเล็ก · เฉพาะไฟล์เสียงแยก |
| OptimFROG | Florin Ghido | **ยังไม่แน่** เจอ 5.100 | ฟรีแต่ปิดซอร์ส · **ยังไม่แน่** | ไม่มี | ไม่ได้* | ไม่ได้ | บีบเล็กสุดแต่ช้ามาก · เฉพาะไฟล์เสียงแยก |
| WAV (PCM) | ไม่มี (เป็นเสียงดิบ) | — | — | มี | ได้ | ได้ | ไฟล์ใหญ่มาก |
| TrueHD · DTS-HD MA | Dolby · DTS ไม่แจก | — | ปิด | แบบทดลอง | — | — | ไม่เปิดให้เลือก |

\* MKV ไม่มีรหัสชนิดของ APE TAK OptimFROG และ mkvmerge ไม่รับ (ตามที่แคลร์รู้ ยังไม่ได้ลองกับไฟล์จริง)

## แบบเสียคุณภาพ (lossy)
| ชนิด | ตัวต้นฉบับ | รุ่นล่าสุด | สัญญาอนุญาต · แจกไปกับโปรแกรมได้ไหม | ffmpeg ที่แนบ | ใส่ MKV | ใส่ MP4 | หมายเหตุ |
|---|---|---|---|---|:--:|:--:|---|
| Opus | libopus กับ opusenc (Xiph) | libopus **1.6.1** 14 ม.ค. 2569 · opusenc (opus-tools) ทางการ 0.2 (2561) · libopusenc 0.3 3 ม.ค. 2569 | BSD · แจกได้ | ใช้ libopus ต้นฉบับข้างใน (รุ่นที่ฝัง **ยังไม่รู้**) · มีตัวของ ffmpeg เองแบบทดลอง | ได้ | ได้ | 1.6 เพิ่มตัวขยายช่วงความถี่ และรองรับ 96 kHz · ชุด Windows ที่ทำจาก libopus ใหม่มีคนทำไว้ (เลข 1.6.1 ตาม libopus) |
| AAC | ① Apple ผ่าน qaac **3.07** 10 ก.ย. 2569 ② Fraunhofer FDK (fdk-aac) ③ exhale **1.2.2** 1 พ.ย. 2568 (xHE-AAC) | ตามช่องซ้าย · รุ่น fdk-aac **ยังไม่แน่** (เจอ 2.0.0 ปี 2561) | ① qaac ใช้ตัวแปลงของ Apple ต้องลง Apple Application Support (มากับ iTunes) **แจกไปกับโปรแกรมไม่ได้** ② ให้แจกได้แต่ไม่ให้สิทธิบัตร ใส่ใน ffmpeg ที่แจกไม่ได้ **ต้องเช็กก่อน** ③ สัญญาแบบ BSD ดัดแปลง **ต้องอ่านก่อน** | มี AAC-LC ที่ ffmpeg เขียนเอง · ไม่มี HE-AAC | ได้ | ได้ | Apple กับ FDK เสียงดีกว่าตัวของ ffmpeg · HE-AAC ทำได้เฉพาะ ①② |
| MP3 | LAME | **3.100** 12 ต.ค. 2560 · 3.100.1 8 ก.ย. 2563 ไม่ได้แก้ตัวแปลง · 3.101 beta ไม่ใช่รุ่นทางการ | LGPL · แจกได้ | ใช้ LAME 3.100 ต้นฉบับ (เห็นในไฟล์จริง) | ได้ | ได้ | ได้แค่ 2 ช่อง · ตัวต้นฉบับกับตัวใน ffmpeg ได้เสียงเหมือนกัน |
| Vorbis | libvorbis กับ oggenc (Xiph) | libvorbis **1.3.7** 4 ก.ค. 2563 · oggenc ยังไม่ได้ค้น | BSD (ไลบรารี) · แจกได้ | ใช้ libvorbis ต้นฉบับ · มีตัวของ ffmpeg เองแบบทดลอง | ได้ | ไม่แนะนำ | ffmpeg ยอมใส่ MP4 แต่ไม่ใช่มาตรฐาน |
| AC-3 (Dolby Digital) | Dolby ไม่แจก · Aften 0.0.8 (โอเพนซอร์สเก่า) | — | — | มี · ffmpeg เขียนเอง | ได้ | ได้ | ไม่มีตัวต้นฉบับให้ใช้ ใช้ ffmpeg · สูงสุด 5.1 |
| E-AC-3 (Dolby Digital Plus) | Dolby ไม่แจก · ไม่มีตัวโอเพนซอร์สอื่นนอกจาก ffmpeg | — | — | มี · ffmpeg เขียนเอง | ได้ | ได้ | ใช้ ffmpeg อย่างเดียว |
| DTS | DTS ไม่แจก · dcaenc (ผู้ทำเลิกพัฒนาปี 2564 ทำได้แค่แกนหลัก) | — | LGPL แต่มีเรื่องสิทธิบัตร | แบบทดลอง | — | — | ไม่เปิดให้เลือก |
| AC-4 · MPEG-H | ปิด ไม่มีตัวแปลงโอเพนซอร์ส (มีแต่ตัวถอด) | — | — | ไม่มี | — | — | ทำไม่ได้ |
| LC3 | liblc3 (Google) | ยังไม่ได้ค้นรุ่น | ฟรี | ไม่มี | — | — | เสียงหูฟังบลูทูธ ไม่ได้ใช้กับหนัง |
| MP2 · WMA · Speex | — | — | — | MP2 WMA มี | | | ชนิดเก่า ไม่เปิดให้เลือก (WMA ใส่ MKV MP4 ไม่ได้ ลองแล้ว) |

## ที่ใช้กับงานของชั้นหนัง (พี่กันเคาะ ตัวต้นฉบับเป็นค่าตั้งต้น ffmpeg เป็นตัวรอง)
| ชนิด | ค่าตั้งต้น | ตัวรอง |
|---|---|---|
| FLAC | flac 1.5.0 (ต้องโหลด) | ffmpeg |
| WavPack | wavpack 5.9.0 (ต้องโหลด) | ffmpeg |
| ALAC | refalac (ต้องโหลด เช็กรุ่น) | ffmpeg |
| TTA | ttaenc (ต้องโหลด เช็กรุ่น) | ffmpeg |
| Opus | opusenc ที่ทำจาก libopus 1.6.1 (ต้องโหลด) | ffmpeg (libopus ข้างใน) |
| MP3 | lame 3.100 (ต้องโหลด) | ffmpeg (LAME 3.100 ข้างใน เสียงเหมือนกัน) |
| Vorbis | oggenc (ต้องโหลด เช็กรุ่น) | ffmpeg (libvorbis ข้างใน) |
| AAC | qaac · fdkaac · exhale ที่พี่กันวางในโฟลเดอร์ตัวแปลงที่ใส่เอง (พี่กันสั่ง ตัวที่แจกไปกับตัวติดตั้งไม่ได้ ให้ใส่เองแบบแมนนวล) · ไม่มีใช้ ffmpeg | ffmpeg |
| AC-3 · E-AC-3 · WAV | ffmpeg (ไม่มีตัวต้นฉบับให้ใช้) | — |
| Monkey's Audio · TAK | ตัวต้นฉบับ (ffmpeg ทำไม่ได้) **เฉพาะหน้าแปลงเสียงที่หน้ากราฟเสียง ไม่มีในหน้ารวมเข้าหนัง** (พี่กันสั่ง) · ทั้งสองตัวแนบไปกับตัวติดตั้งแล้ว (8 พ.ย. 2569) | — |
| OptimFROG | ยังไม่ใส่ (พี่กันไม่ได้พูดถึง) | — |

ทุกตัวที่ต้องโหลด แคลร์ขออนุญาตพี่กันทีละตัวก่อน บอกชื่อไฟล์ แหล่ง ขนาด แล้วจดค่า hash ลง `vendor/README.md` แบบเครื่องมือเดิม

## แหล่ง
- FLAC 1.5.0 · [newreleases.io xiph/flac](https://newreleases.io/project/github/xiph/flac/release/1.5.0) · [ToolsLib](https://blog.toolslib.net/2025/02/11/flac-1-5-0-released-multithreaded-encoding-more/) · [Alpine libflac](https://pkgs.alpinelinux.org/package/edge/main/x86/libflac) · [Ubuntu flac](https://launchpad.net/ubuntu/+source/flac)
- FLAC มาตรฐาน · [RFC 9639 IETF](https://www.ietf.org/rfc/rfc9639.html) · [RFC Editor](https://www.rfc-editor.org/rfc/rfc9639.html) · [datatracker](https://datatracker.ietf.org/doc/rfc9639)
- Opus · [opus-codec.org](https://opus-codec.org/) · [ดาวน์โหลด](https://opus-codec.org/downloads/) · [ข่าว](https://opus-codec.org/news/) · [opus-tools 0.2](https://opus-codec.org/release/dev/2018/09/18/opus-tools-0_2.html) · [Xiph GitLab opus-tools](https://gitlab.xiph.org/xiph/opus-tools/-/tags) · [VideoHelp OpusTools](https://www.videohelp.com/software/OpusTools) · [ชุดจาก master](https://github.com/denyspozniak/opus-tools/releases/tag/0.2%2Bgit54.gaf0d131)
- WavPack · [Hydrogenaudio](https://wiki.hydrogenaudio.org/index.php?title=WavPack) · [VideoHelp](https://www.videohelp.com/software/WavPack) · [Wikidata](https://www.wikidata.org/wiki/Q544812)
- Monkey's Audio · [เว็บผู้ทำ](https://www.monkeysaudio.com/) · [Softpedia](https://www.softpedia.com/get/Multimedia/Audio/Audio-Codecs/Monkeys-Audio.shtml) · [Wikipedia](https://en.wikipedia.org/wiki/Monkey%27s_Audio)
- LAME · [VideoHelp](https://www.videohelp.com/software/Lame-MP3) · [VideoHelp tools](https://www.videohelp.com/tools/Lame_MP3) · [3.101 beta](https://kompas.wasmer.app/http_www_free-codecs_com/download/lame_encoder_htm)
- Vorbis · [ประกาศ 1.3.7](https://lists.xiph.org/pipermail/vorbis/2020-July/027820.html) · [vcpkg](https://vcpkg.io/en/package/libvorbis) · [pkgsrc](https://pkgsrc.se/audio/libvorbis)
- AAC · [qaac GitHub](https://github.com/nu774/qaac/releases) · [VideoHelp qaac](https://www.videohelp.com/software/qaac) · [Hydrogenaudio Apple AAC](https://wiki.hydrogenaudio.org/index.php?title=Apple_AAC) · [Hydrogenaudio FDK AAC](https://wiki.hydrogenaudio.org/index.php?title=Fraunhofer_FDK_AAC) · [Fedora FDK-AAC](https://fedoraproject.org/wiki/Licensing/FDK-AAC) · [ffmpeg nonfree](https://github.com/gominimal/pkgs/pull/1110) · [exhale FreshPorts](https://freshports.org/audio/exhale) · [exhale ต้นทาง](https://gitlab.com/ecodis/exhale)
- TAK · [Hydrogenaudio](https://wiki.hydrogenaud.io/index.php?title=TAK) · [weblio](https://www.weblio.jp/content/TAK) · [AlternativeTo](https://alternativeto.net/software/tak/about)
- TTA · [Hydrogenaudio](https://wiki.hydrogenaudio.org/index.php?title=TTA) · [Guix ttaenc](https://packages.guix.gnu.org/packages/ttaenc) · [ALT Linux](https://packages.altlinux.org/en/sisyphus/srpms/ttaenc/)
- OptimFROG · [Softpedia](https://www.softpedia.com/get/Multimedia/Audio/Audio-Codecs/OptimFROG.shtml) · [Abyssmedia](https://www.abyssmedia.com/audioconverter/ofr-to-flac.shtml)
- ALAC · [AppleInsider 2554](https://appleinsider.com/articles/11/10/28/apple_lossless_audio_codec_project_becomes_open_source) · [The Register](https://www.theregister.com/2011/10/28/apple_lossless_audio_codec_open_source/)
- AC-3 DTS AC-4 MPEG-H LC3 · [Aften](https://aften.sourceforge.net/) · [dcaenc AUR](https://aur.archlinux.org/packages/dcaenc) · [ffdcaenc README](https://github.com/filler56789/ffdcaenc-2/blob/master/README.md) · [Wikipedia ตารางเทียบ](https://en.wikipedia.org/wiki/Comparison_of_audio_coding_formats) · [liblc3](https://github.com/google/liblc3/)
- ffmpeg · [ดาวน์โหลด ffmpeg.org](https://www.ffmpeg.org/download.html) · [gyan.dev](https://www.gyan.dev/ffmpeg/builds/) · [Wikipedia](https://en.wikipedia.org/wiki/FFmpeg) · [FFmpeg 9.0](https://jbkempf.com/blog/2026/ffmpeg-9.0/)
- MKVToolNix · [เว็บผู้ทำ](https://mkvtoolnix.download)
