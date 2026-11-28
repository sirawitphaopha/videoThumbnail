/* หน้าตั้งค่า ข้อมูลของหน้า · แบบส่วนตั้งค่าแทร็ก ไอคอน การ์ดขอบคุณกับโลโก้ รายการหัวข้อ หน้าที่ของเครื่องมือเบื้องหลัง แบบเก็บรูปที่จับคู่
   แยกจาก SettingsPage.tsx ตอนแบ่งไฟล์ทั้งโปรเจกต์ (BUGS ข้อ 153 · แผนแบ่งไฟล์ขั้น 5.2) ย้ายมาทั้งก้อน เนื้อโค้ดไม่เปลี่ยน
   หัวข้อล่าสุด lastSec กับผลเช็กรุ่น latestMemo อยู่ SettingsPage.tsx เพราะหน้าตั้งค่ากำหนดค่าใหม่ */
import { type Settings } from "../../lib/api";
import { IcPalette, IcCheck, IcFolder, IcGraph, IcLink, IcMix, IcPoster, IcSettings, IcShelf, IcExtract, IcKeyboard } from "../../components/icons";
import { type TrackPanel } from "../../lib/trackPanel";
import tpUnder from "../../assets/track-panel/under.png";
import tpDialog from "../../assets/track-panel/dialog.png";
import tpSide from "../../assets/track-panel/side.png";


/** แบบของส่วนตั้งค่าแทร็กในหน้าเสียงและซับ พร้อมรูปจากหน้าจริงที่หน้าต่าง 1280 × 800 ถ่ายสองเท่า (BUGS ข้อ 33) */
export const TP_OPTS: { value: TrackPanel; name: string; desc: string; img: string }[] = [
  { value: "under", name: "กางใต้แถว", desc: "กางออกใต้แถวที่กด แถวอื่นเลื่อนลง\nกดแถวเดิมอีกครั้งเพื่อพับเก็บ", img: tpUnder },
  { value: "dialog", name: "หน้าต่างซ้อน", desc: "ขึ้นกลางจอ ข้างหลังจางลง\nกดเสร็จสิ้นหรือ Esc เพื่อปิด", img: tpDialog },
  { value: "side", name: "แผงขวา", desc: "อยู่ด้านขวาระหว่างแถบชื่อหนังกับแถววิธี\nเห็นชื่อแทร็กทุกแถวและปุ่มรวมยังกดได้", img: tpSide },
];
// คำอธิบายการ์ดกว้าง 250 px ที่หน้าต่าง 1280 แต่ละวลีวัดแล้วพอดีบรรทัดเดียว (ยาวสุด 203 px) ขึ้นบรรทัดตรงรอยต่อวลี ไม่ตัดกลางวลี ไม่ถ่าง (เดิมตัด "อีก / ครั้ง" และบรรทัดบนถ่าง)
import { IbTable, IbPlay, IbEye, IbCrop, IcFile, IbWand, IcBitrate } from "../../components/icons";

export const FolderIcon = () => <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#b0355f" strokeWidth="2" aria-hidden="true"><path d="M3 7a2 2 0 012-2h4l2 2h8a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2z" /></svg>;

const IcHeart = () => <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M12 20s-7.5-4.6-9.2-9.1C1.7 7.8 3.6 5 6.6 5c2.1 0 3.9 1.1 5.4 3 1.5-1.9 3.3-3 5.4-3 3 0 4.9 2.8 3.8 5.9C19.5 15.4 12 20 12 20z" /></svg>;

/* พี่กันสั่ง 9 พ.ย. 2569 "อยากให้เมนูนึงในตั้งค่า นั่นคือเขียนว่าบางหน้าเราเอาไอเดีย เอาซอสโค้ดมาจากเจ้าไหน เขียนขอบคุณเขาหน่อย"
   ข้อความเช็กกับของจริง · ที่อยู่เว็บกดเปิดในเบราว์เซอร์หลัก รายการตายตัวอยู่ฝั่ง Rust โปรแกรมไม่ออกเน็ตเอง */
/* พี่กันบอก 9 พ.ย. 2569 "เราหมายถึง icon โปรแกรมนั้น ๆ ของจริงนะ" · ใช้แบบเวกเตอร์จากคลังเปิดก่อน (SVG Logos กับ Simple Icons CC0 · Wikimedia Commons) ไม่มีค่อยใช้จากเว็บทางการหรือไฟล์โปรแกรม เก็บในโปรแกรม เปิดหน้านี้ไม่ออกเน็ต · ตัวที่หาไม่ได้ใช้ไอคอนกลาง */
const THANK_FILES = import.meta.glob("../../assets/thanks/*", { eager: true, query: "?url", import: "default" }) as Record<string, string>;
const THANK_ICON: Record<string, string> = { "Spek": "spek.png", "FFBitrateViewer": "ffbitrateviewer.ico", "Claude": "claude.svg", "TypeScript": "typescript.svg", "Vite": "vite.svg", "ห้องสมุด Rust อื่น ๆ": "rust.svg", "ไอคอนในหน้านี้": "simpleicons.svg", "Bitrate Viewer": "bitrateviewer.ico", "Audacity": "audacity.svg", "Aegisub": "aegisub.svg", "Subtitle Edit": "subtitleedit.svg", "mpv (libmpv)": "mpv.svg", "SUPer": "super.png", "BDSup2Sub++": "bdsup2sub.png", "Kodi": "kodi.svg", "Claude Desktop": "claude.svg", "FFmpeg": "ffmpeg.png", "MKVToolNix": "mkvtoolnix.png", "MediaInfo": "mediainfo.svg", "FLAC": "flac.svg", "LAME กับ libmpg123": "lame.ico", "opus-tools": "opus.svg", "WavPack": "wavpack.svg", "Monkey's Audio": "monkeys.ico", "TAK": "tak.png", "libheif กับ libde265": "libheif.png", "Visual C++ Runtime": "microsoft.svg", "Rust": "rust.svg", "Tauri": "tauri.svg", "React": "react.svg", "image (Rust)": "image-rs.png" };
/** MKVToolNix ใช้สองไอคอน พื้นหลังขาว (พี่กันสั่ง 10 พ.ย. 2569 "เอาใส่ทั้งสอง icon แต่ขอพื้นหลังขาว" · ยืนยันว่าเป็นของ MKVToolNix ทั้งคู่) */
export const WHITE_ICON = new Set(["MKVToolNix"]);
const THANK_ICON2: Record<string, string> = { "MKVToolNix": "mkvtoolnix-2.png" };
export const thankImg2 = (name: string) => { const f = THANK_ICON2[name]; return f ? THANK_FILES["../../assets/thanks/" + f] : undefined; };
export const thankImg = (name: string) => { const f = THANK_ICON[name]; return f ? THANK_FILES["../../assets/thanks/" + f] : undefined; };

export const THANKS: { title: string; note: string; rows: { name: string; ver?: string; what: string; tag: string; url: string; icon: React.ReactNode }[] }[] = [
  { title: "ไอเดียและหน้าตา", note: "ดูเป็นแบบแล้วเขียนเอง ไม่ได้ใช้โค้ดของโปรแกรมเหล่านี้", rows: [
    { icon: <IcGraph />, name: "Spek", ver: "0.8.5", what: "หน้าความถี่ในกราฟเสียง หน้าตากราฟกับการบันทึกเป็นรูป", tag: "ไอเดีย", url: "github.com/alexkay/spek" },
    { icon: <IcGraph />, name: "Bitrate Viewer", ver: "2.3", what: "หน้าบิตเรตวิดีโอ หน้าตา สี วิธีคิด 4 แบบ ซูม เส้นค่าเฉลี่ย", tag: "ไอเดีย", url: "videohelp.com/software/Bitrate-Viewer" },
    { icon: <IcGraph />, name: "FFBitrateViewer", ver: "0.9.7.2", what: "วิธีอ่านบิตเรตด้วย ffprobe ทีละแพ็กเก็ต ในหน้าบิตเรต", tag: "ไอเดีย, MIT", url: "github.com/fifonik/FFBitrateViewer" },
    { icon: <IcExtract />, name: "gMKVExtractGUI", ver: "2.15.0", what: "วิธีแยกไฟล์ในหน้าเสียงและซับ\nทั้งแท็ก chapter แบบ OGM CUE sheet และเวลาของเฟรม\nดีเลย์ในชื่อไฟล์ และรูปแบบชื่อไฟล์ที่ตั้งเอง", tag: "ไอเดีย, Unlicense", url: "github.com/Gpower2/gMKVExtractGUI" },
    { icon: <IcMix />, name: "Audacity", ver: "4.0.2", what: "รูปคลื่นแบบ Audacity ในกราฟเสียง", tag: "ไอเดีย", url: "audacityteam.org" },
    { icon: <IcPoster />, name: "Kodi", ver: "21.3", what: "ชื่อไฟล์รูปลงท้าย -poster กับ -landscape ในหน้าจับคู่ปก", tag: "ไอเดีย", url: "kodi.tv" },
    { icon: <IcSettings />, name: "Claude Desktop", ver: "4.23118.0", what: "รูปแบบเมนูหัวข้อของหน้าตั้งค่า", tag: "ไอเดีย", url: "claude.ai" },
  ] },
  { title: "เครื่องมือที่แนบมาทำงานจริง", note: "ใช้ตามสัญญาอนุญาตของแต่ละตัว ข้อความเต็มอยู่ในโฟลเดอร์ tools\\licenses", rows: [
    { icon: <IbPlay />, name: "FFmpeg", ver: "9.1", what: "ถอด แปลง ตรวจไฟล์เสีย อ่านเสียงมาวาดกราฟ และอ่านบิตเรตวิดีโอ ใช้ชุดจาก gyan.dev และไอคอนจาก Icons8", tag: "GPLv3", url: "ffmpeg.org" },
    { icon: <IcFile />, name: "MKVToolNix", ver: "103.0", what: "ครอบ MKV แนบปก แยกแทร็ก", tag: "GPLv2", url: "mkvtoolnix.download" },
    { icon: <IbEye />, name: "MediaInfo", ver: "26.10", what: "รายละเอียดไฟล์", tag: "BSD-2", url: "mediaarea.net" },
    { icon: <IcMix />, name: "FLAC", ver: "1.5.0", what: "แปลงเสียง FLAC", tag: "GPLv2, BSD", url: "xiph.org/flac" },
    { icon: <IcMix />, name: "LAME กับ libmpg123", ver: "4.0", what: "แปลงเสียง MP3 ใช้ชุดจาก RareWares", tag: "LGPL", url: "lame.sourceforge.io" },
    { icon: <IcMix />, name: "opus-tools", ver: "0.2, libopus 1.6.1", what: "แปลงเสียง Opus ใช้ชุดจาก RareWares", tag: "BSD-2", url: "opus-codec.org" },
    { icon: <IcMix />, name: "WavPack", ver: "5.9.0", what: "แปลงเสียง WavPack", tag: "BSD-3", url: "wavpack.com" },
    // qaac เป็น Public Domain · ตัวเข้ารหัส ALAC ข้างในเป็นของ Apple (Apache 2.0) · ไม่แนบ ผู้ใช้วางเอง (อ่าน COPYING ของ qaac 10 พ.ย. 2569)
    { icon: <IcMix />, name: "qaac กับ refalac", ver: "3.07", what: "แปลงเสียง AAC ด้วยตัวของ Apple (ต้องติดตั้ง iTunes เอง) และ ALAC แนบมากับโปรแกรม", tag: "Public Domain, ALAC Apache 2.0", url: "github.com/nu774/qaac" },
    { icon: <IcMix />, name: "Monkey's Audio", ver: "13.50", what: "แปลงเสียง APE", tag: "BSD-3", url: "monkeysaudio.com" },
    { icon: <IcMix />, name: "TAK", ver: "2.3.3", what: "แปลงเสียง TAK แนบไฟล์เดิมทั้งชุด", tag: "ฟรีใช้ส่วนตัว", url: "thbeck.de/Tak" },
    { icon: <IcPoster />, name: "libheif กับ libde265", ver: "1.23.7, 1.1.3", what: "บันทึกรูปกราฟเป็น HEIC ใช้ชุดจาก conda-forge", tag: "LGPLv3", url: "github.com/strukturag/libheif" },
    { icon: <IcPoster />, name: "x265", ver: "3.5", what: "เข้ารหัสภาพใน HEIC", tag: "GPLv2", url: "bitbucket.org/multicoreware/x265_git" },
    { icon: <IcPoster />, name: "aom, dav1d, libsharpyuv", ver: "3.15.3, 1.5.4, 1.6.0", what: "ไฟล์ที่ libheif ต้องใช้", tag: "BSD", url: "aomedia.org, videolan.org, chromium.googlesource.com/webm/libwebp" },
    { icon: <IcSettings />, name: "Visual C++ Runtime", ver: "14.51", what: "ไฟล์ของ Microsoft ที่ libheif ต้องใช้", tag: "ข้อตกลง MS", url: "microsoft.com" },
    // BUGS ข้อ 122 · libmpv-2.dll แนบมาตั้งแต่ commit 7e618cb · รุ่นอ่านจากในไฟล์ DLL (mpv v0.42.0-38-gbcde6b93c ชุด mpv-dev 20261111) · สัญญาตาม vendor/README.md หัวข้อ libmpv
    { icon: <IbPlay />, name: "mpv (libmpv)", ver: "0.42.0", what: "เล่นหนังในหน้าแก้ซับ ถอดภาพด้วยการ์ดจอ\nและวาดซับ ASS ครบทุกแท็ก\nโดยใช้ชุดจาก shinchiro", tag: "GPLv2 ขึ้นไป", url: "mpv.io" },
    // ตัวสร้าง PGS แบบมาตรฐาน Blu-ray ในหน้าต่างส่งออก PGS (พี่กันสั่ง 14 พ.ย. 2569 "เอาระบบ PGS ตัวไหนมา ใส่หน้าขอบคุณด้วย") · รุ่นจาก SUPer_CLI --version · สัญญา GPL-3.0 จากที่เก็บของผู้ทำ
    { icon: <IbPlay />, name: "SUPer", ver: "0.3.0", what: "ตัวสร้าง PGS แบบมาตรฐาน Blu-ray\nที่เลือกได้ในหน้าต่างส่งออก PGS\nโดยมี libimagequant ช่วยลดสี", tag: "GPLv3", url: "github.com/cubicibo/SUPer" },
    // แปลงซับภาพเป็นซับภาพ (BUGS ข้อ 125 พี่กันสั่ง 15 พ.ย. 2569 "เอามาก็ดีนะ ตอนระบบแปลงจากซับภาพเป็นซับภาพ") · รุ่น 1.0.5 ชุด mingw 64 บิตของ TheGreatMcPain
    // สัญญา Apache-2.0 จากที่เก็บของผู้ทำ สำเนาอยู่ tools\licenses\BDSup2SubPlusPlus-Apache-2.0.txt · ไอคอนดึงจากในไฟล์ bdsup2sub++.exe
    { icon: <IbPlay />, name: "BDSup2Sub++", ver: "1.0.5", what: "แปลงซับภาพในหน้าต่างแปลงซับภาพ\nเป็น PGS VobSub หรือ BDN XML\nพร้อมย่อขยายและเปลี่ยนอัตราเฟรม", tag: "Apache-2.0", url: "github.com/TheGreatMcPain/BDSup2SubPlusPlus" },
    // BUGS ข้อ 122 เดิมอยู่กลุ่มไอเดีย (วิธีฝัง libmpv ในหน้าต่างโปรแกรม ไม่ได้ใช้โค้ด) · BUGS ข้อ 123 แนบตัวแปลง SeConv มาเป็นตัวสร้าง PGS ตัวที่สาม จึงย้ายมากลุ่มนี้ (15 พ.ย. 2569)
    // รุ่นกับสัญญาเช็กจากหน้ารุ่นบน GitHub 14 พ.ย. 2569 (v5.4.0 สัญญา MIT) · สัญญาเต็มอยู่ tools\licenses\SubtitleEdit-SeConv-MIT.txt
    // แผน OCR (BUGS ข้อ 143) แปลระบบ OCR จากซอร์ส se4 ใส่ประกาศลิขสิทธิ์เดิมหัวไฟล์ · แนบฐาน nOCR Binary OCR และรายการแก้คำของ Subtitle Edit · SeConv ส่งออกซับชนิดอื่น (ขั้น 12)
    { icon: <IbPlay />, name: "Subtitle Edit", ver: "5.4.0", what: "ระบบ OCR แปลวิธีจากซอร์สของ Subtitle Edit\nพร้อมฐานตัวอักษรกับรายการแก้คำที่แนบมา\nและ SeConv สร้าง PGS กับส่งออกซับชนิดอื่น", tag: "MIT", url: "github.com/SubtitleEdit/subtitleedit" },
    // แผน OCR ขั้น 0 กับขั้น 3 · โมเดลชุด *_onnx บน Hugging Face ของ PaddlePaddle รุ่นตาม vendor/README.md · สัญญา tools\licenses\PaddleOCR-models-Apache-2.0.txt
    { icon: <IbWand />, name: "PaddleOCR", what: "โมเดล PP-OCRv6 กับ PP-OCRv5 อ่านซับรูป\nเป็นตัวหนังสือในหน้า OCR หลายภาษา\nโดยทำงานในเครื่อง ไม่ส่งภาพออกเน็ต", tag: "Apache-2.0", url: "github.com/PaddlePaddle/PaddleOCR" },
    // onnxruntime.dll 1.32.0 (vendor/README.md) · สัญญา tools\licenses\onnxruntime-MIT.txt
    { icon: <IbWand />, name: "ONNX Runtime", ver: "1.32.0", what: "ตัวรันโมเดล PaddleOCR ในเครื่อง\nโดยห้องสมุด ort ของ Rust เรียกใช้", tag: "MIT", url: "onnxruntime.ai" },
    // Tesseract553.zip ชุดที่ Subtitle Edit ใช้ กับชุดภาษา tessdata_best · สัญญา tools\licenses\Tesseract-Apache-2.0.txt กับ tessdata_best-Apache-2.0.txt
    { icon: <IbWand />, name: "Tesseract", ver: "5.5.3", what: "ตัวอ่าน OCR อีกตัวในหน้า OCR\nพร้อมชุดภาษาแบบ best ของ tessdata\nโดยใช้ชุดเดียวกับ Subtitle Edit", tag: "Apache-2.0", url: "github.com/tesseract-ocr/tesseract" },
    // พจนานุกรม en_US en_GB th_TH จาก LibreOffice/dictionaries (ลิงก์เดียวกับ Subtitle Edit) · สัญญาตาม tools\licenses\Hunspell-README_*.txt
    { icon: <IbWand />, name: "Hunspell", what: "พจนานุกรมตรวจคำที่ไม่รู้จักในหน้า OCR\nทั้ง en_US en_GB และ th_TH\nโดยใช้ชุดจาก LibreOffice", tag: "ตามแต่ละชุด", url: "github.com/LibreOffice/dictionaries" },
  ] },
  { title: "ใช้สร้างโปรแกรม", note: "ซอร์สโค้ดของห้องสมุดเหล่านี้รวมอยู่ในตัวโปรแกรมตอนสร้าง", rows: [
    { icon: <IcSettings />, name: "Claude", what: "ตัวช่วยเขียนโปรแกรม คือ Claude Code กับโมเดล Claude Opus 5.5 ของ Anthropic", tag: "Anthropic", url: "claude.com/claude-code" },
    // BUGS ข้อ 122 · เดิมอยู่กลุ่มไอเดียว่า ตัวดูซับแบบตารางบรรทัด แต่หน้าแก้ซับแปลวิธีจากซอร์ส Aegisub มาใช้จริง ใส่ประกาศลิขสิทธิ์เดิมไว้หัวไฟล์ (subdoc.rs vidframes.rs และไฟล์หน้าแก้ซับ)
    { icon: <IbTable />, name: "Aegisub", ver: "3.5.1", what: "หน้าแก้ซับแปลวิธีจากซอร์สของ Aegisub\nทั้งอ่านเขียนซับ ตั้งเวลา และเครื่องมือบนภาพ\nโดยใส่ประกาศลิขสิทธิ์เดิมไว้หัวไฟล์", tag: "BSD, ISC", url: "aegisub.org" },
    { icon: <IcSettings />, name: "Rust", ver: "1.99.1", what: "ฝั่งหลังบ้านทั้งหมด ทั้งอ่านไฟล์ เรียกเครื่องมือ และเขียนไฟล์ (รุ่นที่ใช้สร้างโปรแกรม)", tag: "MIT, Apache-2.0", url: "rust-lang.org" },
    { icon: <IcShelf />, name: "Tauri", ver: "2.12.5", what: "โครงโปรแกรมบน Windows", tag: "MIT, Apache-2.0", url: "tauri.app" },
    { icon: <IbTable />, name: "TypeScript", ver: "7.0.2", what: "ภาษาที่เขียนหน้าจอทั้งหมด", tag: "Apache-2.0", url: "typescriptlang.org" },
    { icon: <IbTable />, name: "Vite", ver: "8.3.6", what: "ตัวสร้างหน้าจอ รวมไฟล์ตอนสร้างโปรแกรม", tag: "MIT", url: "vite.dev" },
    { icon: <IbTable />, name: "React", ver: "19.3.1", what: "หน้าจอทั้งหมด", tag: "MIT", url: "react.dev" },
    { icon: <IbCrop />, name: "image (Rust)", ver: "0.25.10", what: "อ่าน ครอป และเข้ารหัสรูป", tag: "MIT, Apache-2.0", url: "github.com/image-rs/image" },
    { icon: <IcSettings />, name: "ห้องสมุด Rust อื่น ๆ", what: "serde อ่านเขียนข้อมูล qcms แปลงสีรูป jpeg-encoder เข้ารหัสรูป sha2 md-5 sha1 crc32fast คิดค่า hash windows-sys ort เรียก ONNX Runtime spellbook อ่านพจนานุกรม Hunspell และ fancy-regex นิพจน์ของรายการแก้คำ OCR", tag: "MIT, Apache-2.0, MPL-2.0", url: "crates.io" },
    { icon: <b>ก</b>, name: "ฟอนต์ Sarabun", what: "ตัวหนังสือทั้งโปรแกรม ออกแบบโดย Cadson Demak ใช้ชุดจาก Fontsource", tag: "OFL", url: "fonts.google.com/specimen/Sarabun" },
    { icon: <IcPalette />, name: "ไอคอนในหน้านี้", what: "Simple Icons กับ SVG Logos (CC0) Icons8 Wikimedia Commons และไอคอนจากตัวโปรแกรมของแต่ละโครงการ", tag: "ตามแต่ละรูป", url: "simpleicons.org, icons8.com, commons.wikimedia.org" },
  ] },
];

export const IcPlayBox = () => <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><rect x="3" y="4" width="18" height="16" rx="2" /><path d="M10 9l5 3-5 3z" fill="currentColor" /></svg>;

/** เลขรุ่นจากข้อความของเครื่องมือ เช่น mkvmerge v103.0 ('The Darkness') 64-bit ได้ 103.0 */
export const verOf = (s: string) => s.match(/\d+(?:\.\d+)+/)?.[0] ?? "";

/* เมนูหัวข้อซ้าย เปิดดูทีละหัวข้อ (พี่กันส่งภาพหน้าการตั้งค่าของโปรแกรม Claude เป็นแบบ 8 พ.ย. 2569) · ชื่อกลุ่มแคลร์ตั้ง */
export const SET_GROUPS: { title: string; items: { id: string; label: string; icon: React.ReactNode }[] }[] = [
  { title: "ชั้นหนัง", items: [
    { id: "folders", label: "โฟลเดอร์หนัง", icon: <IcFolder /> },
    { id: "shelf", label: "ชั้นวาง", icon: <IcShelf /> },
    { id: "tone", label: "โทนสี", icon: <IcPalette /> },
    { id: "player", label: "เปิดเล่นหนัง", icon: <IcPlayBox /> },
  ] },
  { title: "งาน", items: [
    { id: "poster", label: "ใส่โปสเตอร์", icon: <IcPoster /> },
    { id: "link", label: "เก็บรูปที่จับคู่", icon: <IcLink /> },
    { id: "av", label: "เสียงและซับ", icon: <IcMix /> },
    { id: "check", label: "ตรวจไฟล์", icon: <IcCheck /> },
    { id: "graph", label: "กราฟเสียง", icon: <IcGraph /> },
  ] },
  { title: "เครื่องมือ", items: [
    { id: "tools", label: "เครื่องมือเบื้องหลัง", icon: <IcSettings /> },
    { id: "encoders", label: "ตัวแปลงเสียง", icon: <IcMix /> },
    { id: "log", label: "บันทึกการใช้งาน", icon: <IcFile /> },
    { id: "hotkeys", label: "คีย์ลัด", icon: <IcKeyboard /> },
  ] },
  { title: "เกี่ยวกับ", items: [
    { id: "types", label: "ชนิดไฟล์", icon: <IcFile /> },
    { id: "thanks", label: "ขอบคุณ", icon: <IcHeart /> },
    { id: "lines", label: "บรรทัดโค้ด", icon: <IcBitrate /> },
  ] },
];
/** หน้าที่ของเครื่องมือแต่ละตัว (สเปกข้อ 12 หน้าที่ของ ffmpeg = ส่งออก MP4 และตรวจละเอียด) */
export const TOOL_ROLE: Record<string, string> = {
  mkvmerge: "ใช้ครอบ MKV และแนบโปสเตอร์",
  mkvextract: "ใช้ดึงปกออกมาโชว์และแยกไฟล์",
  mkvpropedit: "ใช้เปลี่ยนรูปแนบใน MKV",
  ffmpeg: "ใช้ส่งออก MP4 ตรวจละเอียด และวาดกราฟเสียง",
  ffprobe: "ใช้อ่านข้อมูลไฟล์หนัง",
  MediaInfo: "ใช้อ่านข้อมูลไฟล์ในหน้า MediaInfo",
};

/** เก็บรูปที่จับคู่ไว้ที่ไหน 3 แบบ (พี่กันเคาะข้อ 1 · มอคอัปจับคู่ปกหัวข้อหน้าตั้งค่า) */
export const LINK_MODES: { v: Settings["linkStore"]; title: string; rec?: string; lines: string[]; sample?: string[] }[] = [
  { v: "beside", title: "คัดลอกไปไว้ข้างไฟล์หนัง", rec: "ค่าตั้งต้น",
    lines: ["คัดลอกรูปที่ครอปแล้วไปไว้โฟลเดอร์เดียวกับหนัง ใช้ชื่อเหมือนไฟล์หนัง ส่วนรูปต้นฉบับอยู่ที่เดิมไม่ถูกแก้ กลับมาครอปใหม่ได้", "ชื่อลงท้ายแบบที่ Kodi อ่านได้ เปลี่ยนรูปทีหลังไฟล์นี้ก็เปลี่ยนตาม เปลี่ยนชื่อหนังในชั้นหนังรูปก็เปลี่ยนชื่อตาม และถ้ามีไฟล์ชื่อนี้อยู่แล้วที่โปรแกรมไม่ได้สร้าง จะถามก่อนโดยไม่เขียนทับ"],
    sample: ["ดาวเหนือ (2023).mkv", "ดาวเหนือ (2023)-poster.jpg", "ดาวเหนือ (2023)-landscape.jpg"] },
  { v: "app", title: "เก็บสำเนาไว้ในโปรแกรม",
    lines: ["คัดลอกรูปที่ครอปแล้วไปไว้โฟลเดอร์ข้อมูลของโปรแกรม ไม่มีไฟล์เพิ่มในโฟลเดอร์หนัง ลบหรือย้ายรูปต้นฉบับแล้วปกก็ไม่หาย แต่มีแต่ชั้นหนังที่เห็น โปรแกรมอื่นไม่เห็น"] },
  { v: "link", title: "จับคู่อย่างเดียว",
    lines: ["ไม่คัดลอก รูปอยู่ชื่อเดิมที่เดิม โปรแกรมจำแค่ที่อยู่รูปแล้วดึงมาแสดง จึงไม่ใช้ที่เพิ่มเลย แต่ถ้าย้ายหรือลบรูปต้นฉบับ ชั้นวางจะขึ้นว่าหารูปไม่เจอและต้องจับคู่ใหม่"] },
];