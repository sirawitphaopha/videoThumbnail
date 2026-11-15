/* ชนิดไฟล์ที่โปรแกรมรองรับ สำหรับหัวข้อชนิดไฟล์ในหน้าตั้งค่า (BUGS ข้อ 127)
   พี่กันสั่ง 15 พ.ย. 2569 "เธอสร้างหน้าตั้งค่าตัวนึงหน่อย เขียนชนิดไฟล์ทั้งหมดที่โปรแกรมเรารองรับ เเล้วรายละเอียดคร่าวๆ เพราะเราจำไม่ได้"
   รายการนามสกุลนำเข้าจากที่เดียวกับที่หน้าต่าง ๆ ใช้จริง (api.ts) ไม่พิมพ์ซ้ำ จะได้ไม่คลาดกับของจริง
   รายการฝั่ง Rust ที่ต้องตรงกัน cargo test ตรวจ (latest.rs file_types_match_frontend) */
import { ADD_EXT, AUDIO_EXT, ENCODE_OUT_EXT, FONT_EXT, IMAGE_EXT, KEYFRAME_EXT, MOVIE_EXT, SUB_EXT } from "./api";

export type FtRow = { name: string; exts: string[]; what: string; data: string };
export type FtGroup = { key: string; title: string; rows: FtRow[] };

/** ซับข้อความที่แก้ได้ตรง ๆ · ซับภาพ · ที่เหลือใน SUB_EXT เป็นซับข้อความแบบอื่นที่แปลงก่อนเปิด (sub เป็นได้ทั้ง VobSub และ MicroDVD) */
const SUB_TEXT = ["srt", "ass", "ssa", "vtt"];
const SUB_IMAGE = ["sup", "idx", "sub"];
const SUB_OTHER = SUB_EXT.filter((e) => !SUB_TEXT.includes(e) && !SUB_IMAGE.includes(e));
const ADD_AUDIO = ADD_EXT.filter((e) => !SUB_EXT.includes(e) && e !== "mks");

/** กดป้ายนามสกุลแล้วกางกล่องบอกว่านามสกุลนั้นคืออะไร (พี่กันสั่ง 15 พ.ย. 2569 "ตอนเอาเมาส์ไปกด มันจะขึ้น popup คล้ายๆดรอปดาวขึ้นมา ว่านามสกุลนี้ คืออะไรยังไง")
    t ชื่อเต็ม · w ความหมายกับที่ใช้ในโปรแกรมนี้ · ทุกนามสกุลในตารางข้างล่างต้องมีที่นี่ ตัวตรวจ check-settings นับ */
export const EXT_INFO: Record<string, { t: string; w: string }> = {
  mkv: { t: "Matroska", w: "คอนเทนเนอร์แบบเปิดที่เก็บได้หลายแทร็กในไฟล์เดียว\nทั้งวิดีโอ เสียง ซับ chapter ปก และฟอนต์ โปรแกรมนี้จึงแนะนำ" },
  mp4: { t: "MPEG-4 Part 14", w: "คอนเทนเนอร์มาตรฐานที่เล่นได้แทบทุกเครื่อง\nแต่เก็บซับ ASS ฟอนต์ และเสียงบางชนิดไม่ได้" },
  m4v: { t: "MPEG-4 Video", w: "MP4 แบบที่ Apple ใช้ใน iTunes ซึ่งโครงไฟล์เหมือน MP4 ทุกอย่าง" },
  mov: { t: "QuickTime Movie", w: "คอนเทนเนอร์ของ Apple ที่โครงคล้าย MP4\nมักได้มาจากกล้องหรือ iPhone" },
  avi: { t: "Audio Video Interleave", w: "คอนเทนเนอร์รุ่นเก่าของ Microsoft ที่มักเป็นหนัง XviD หรือ DivX\nและเก็บซับกับ chapter ไม่ได้" },
  webm: { t: "WebM", w: "คอนเทนเนอร์ของ Google ที่แตกมาจาก Matroska\nใช้กับวิดีโอ VP9 หรือ AV1 และเสียง Opus บนเว็บ" },
  ts: { t: "MPEG Transport Stream", w: "ไฟล์ที่อัดจากทีวีดิจิทัลหรือสตรีมสด\nซึ่งแบ่งเป็นแพ็กเก็ตเล็ก ๆ ให้ทนสัญญาณขาดช่วง" },
  m2ts: { t: "BDAV MPEG-2 Transport Stream", w: "Transport Stream แบบที่แผ่น Blu-ray และกล้อง AVCHD ใช้\nโดยมีเวลากำกับในทุกแพ็กเก็ต" },
  mpg: { t: "MPEG Program Stream", w: "วิดีโอ MPEG-1 หรือ MPEG-2 แบบเก่า เช่นหนังจากแผ่น VCD" },
  mpeg: { t: "MPEG Program Stream", w: "ชนิดเดียวกับ MPG แค่ตั้งชื่อนามสกุลยาวกว่า" },
  vob: { t: "DVD Video Object", w: "ไฟล์หนังในโฟลเดอร์ VIDEO_TS ของแผ่น DVD\nซึ่งเป็น MPEG-2 พร้อมเสียงและซับภาพ" },
  flv: { t: "Flash Video", w: "คอนเทนเนอร์ของ Adobe Flash ที่เว็บวิดีโอยุคก่อนใช้" },
  wmv: { t: "Windows Media Video", w: "หนังในคอนเทนเนอร์ ASF ของ Microsoft\nซึ่งโปรแกรมนี้ยังรวมไฟล์หรือใส่ปกให้ไม่ได้" },
  iso: { t: "อิมเมจแผ่น", w: "สำเนาแผ่น DVD หรือ Blu-ray ทั้งแผ่นในไฟล์เดียว\nไม่ใช่ไฟล์หนังตรง ๆ จึงต้องแตกไฟล์หนังออกมาก่อน" },
  mp3: { t: "MPEG-1 Audio Layer III", w: "เสียงบีบอัดแบบเสียคุณภาพที่เล่นได้ทุกเครื่อง" },
  flac: { t: "Free Lossless Audio Codec", w: "เสียงบีบอัดแบบไม่เสียคุณภาพ ไฟล์เล็กกว่า WAV\nแต่ถอดกลับได้ครบทุกบิต" },
  wav: { t: "Waveform Audio", w: "เสียงไม่บีบอัดแบบ PCM ไฟล์ใหญ่แต่ไม่เสียอะไรเลย\nโดยไฟล์หนึ่งเก็บได้ไม่เกิน 4 GB" },
  w64: { t: "Sony Wave64", w: "เสียงไม่บีบอัดแบบเดียวกับ WAV แต่เก็บได้เกิน 4 GB" },
  m4a: { t: "MPEG-4 Audio", w: "ไฟล์ MP4 ที่มีแต่เสียง\nข้างในเป็นได้ทั้ง AAC ที่เสียคุณภาพ และ ALAC ที่ไม่เสียคุณภาพ" },
  aac: { t: "Advanced Audio Coding", w: "เสียง AAC แบบดิบที่ไม่มีคอนเทนเนอร์ห่อ\nซึ่งเป็นเสียงชนิดเดียวกับที่ MP4 และ YouTube ใช้" },
  ac3: { t: "Dolby Digital", w: "เสียงรอบทิศสูงสุด 5.1 ที่แผ่น DVD Blu-ray และทีวีใช้" },
  eac3: { t: "Dolby Digital Plus", w: "AC3 รุ่นใหม่ที่ประหยัดกว่า และใช้กันมากในสตรีมมิ่ง\nโดยพา Dolby Atmos แบบสตรีมได้" },
  ec3: { t: "Dolby Digital Plus", w: "ชนิดเดียวกับ EAC3 แค่ตั้งชื่อนามสกุลต่างกัน" },
  dts: { t: "DTS", w: "เสียงรอบทิศที่แผ่น DVD และ Blu-ray ใช้ โดยบิตเรตสูงกว่า AC3" },
  dtshd: { t: "DTS-HD Master Audio", w: "เสียงไม่เสียคุณภาพของแผ่น Blu-ray\nโดยมี DTS ธรรมดาซ้อนอยู่ข้างในให้เครื่องเก่าเล่นได้" },
  thd: { t: "Dolby TrueHD", w: "เสียงไม่เสียคุณภาพของแผ่น Blu-ray ที่ Dolby Atmos ซ้อนอยู่ได้" },
  truehd: { t: "Dolby TrueHD", w: "ชนิดเดียวกับ THD แค่ตั้งชื่อนามสกุลยาวกว่า" },
  mlp: { t: "Meridian Lossless Packing", w: "เสียงไม่เสียคุณภาพของแผ่น DVD-Audio ซึ่งเป็นต้นแบบของ TrueHD" },
  mp2: { t: "MPEG-1 Audio Layer II", w: "เสียงรุ่นก่อน MP3 ที่แผ่น VCD และทีวีดิจิทัลบางช่องใช้" },
  ogg: { t: "Ogg", w: "คอนเทนเนอร์ของ Xiph ที่ข้างในมักเป็นเสียง Vorbis หรือ Opus" },
  oga: { t: "Ogg Audio", w: "ไฟล์ Ogg ที่มีแต่เสียง" },
  opus: { t: "Opus", w: "เสียงเสียคุณภาพแบบเปิดที่ฟังดีที่สุดในบิตเรตต่ำ ณ ตอนนี้" },
  mka: { t: "Matroska Audio", w: "Matroska ที่มีแต่เสียง เก็บได้หลายแทร็กพร้อม chapter และแท็ก" },
  wma: { t: "Windows Media Audio", w: "เสียงบีบอัดของ Microsoft ที่มากับ Windows Media Player" },
  wv: { t: "WavPack", w: "เสียงไม่เสียคุณภาพ ที่มีโหมดไฮบริด\nเก็บไฟล์เล็กแบบเสียคุณภาพคู่กับไฟล์แก้ .wvc" },
  ape: { t: "Monkey's Audio", w: "เสียงไม่เสียคุณภาพที่เล็กกว่า FLAC นิดหน่อยแต่ถอดช้ากว่า\nและใส่ในไฟล์หนังไม่ได้" },
  tak: { t: "Tom's lossless Audio Kompressor", w: "เสียงไม่เสียคุณภาพที่เล็กใกล้ APE แต่ถอดเร็วใกล้ FLAC\nและใส่ในไฟล์หนังไม่ได้" },
  tta: { t: "True Audio", w: "เสียงไม่เสียคุณภาพแบบเรียบง่ายที่ถอดเร็ว" },
  jpg: { t: "JPEG", w: "รูปเสียคุณภาพที่ใช้ทั่วไป และแนบเป็นปกในไฟล์หนังได้" },
  jpeg: { t: "JPEG", w: "ชนิดเดียวกับ JPG แค่ตั้งชื่อนามสกุลยาวกว่า" },
  png: { t: "Portable Network Graphics", w: "รูปไม่เสียคุณภาพที่มีพื้นใสได้ และแนบเป็นปกในไฟล์หนังได้" },
  webp: { t: "WebP", w: "รูปของ Google ที่เล็กกว่า JPEG ในคุณภาพเท่ากัน\nโดยโปรแกรมแปลงเป็น JPG ก่อนแนบเป็นปก" },
  bmp: { t: "Bitmap", w: "รูปไม่บีบอัดของ Windows ไฟล์ใหญ่มาก" },
  tif: { t: "TIFF", w: "รูปคุณภาพสูงของงานพิมพ์และงานสแกน\nที่ไฟล์เดียวเก็บได้หลายหน้า" },
  tiff: { t: "TIFF", w: "ชนิดเดียวกับ TIF แค่ตั้งชื่อนามสกุลยาวกว่า" },
  heic: { t: "HEIF ที่บีบด้วย HEVC", w: "รูปที่ iPhone ถ่าย เล็กกว่า JPEG ราวครึ่งหนึ่งในคุณภาพเท่ากัน" },
  heif: { t: "High Efficiency Image File", w: "ชนิดเดียวกับ HEIC แค่ตั้งชื่อนามสกุลต่างกัน" },
  srt: { t: "SubRip", w: "ซับข้อความแบบเรียบง่าย มีแค่เลขลำดับ เวลา และข้อความ\nโดยจัดตัวหนาตัวเอียงได้นิดหน่อย" },
  ass: { t: "Advanced SubStation Alpha", w: "ซับที่กำหนดฟอนต์ สี ตำแหน่ง และเอฟเฟกต์ได้ครบ\nเป็นชนิดหลักของ Aegisub และซับแฟนซับทั่วไป" },
  ssa: { t: "SubStation Alpha", w: "ซับรุ่นก่อนของ ASS ที่ความสามารถน้อยกว่า" },
  vtt: { t: "WebVTT", w: "ซับของวิดีโอบนเว็บ ที่เขียนคล้าย SRT" },
  smi: { t: "SAMI", w: "ซับของ Microsoft ที่เขียนแบบหน้าเว็บ HTML พบบ่อยในซับเกาหลี" },
  sami: { t: "SAMI", w: "ชนิดเดียวกับ SMI แค่ตั้งชื่อนามสกุลยาวกว่า" },
  lrc: { t: "Lyrics", w: "เนื้อเพลงพร้อมเวลาของเครื่องเล่นเพลง" },
  rt: { t: "RealText", w: "ซับของโปรแกรม RealPlayer รุ่นเก่า" },
  jss: { t: "JACOsub", w: "ซับรุ่นเก่าที่มีคำสั่งจัดหน้าของตัวเอง" },
  aqt: { t: "AQTitle", w: "ซับรุ่นเก่าที่นับเวลาเป็นเฟรม" },
  pjs: { t: "Phoenix Japanimation Society", w: "ซับรุ่นเก่าของกลุ่มแปลการ์ตูนญี่ปุ่น ที่นับเวลาเป็นเฟรม" },
  mpl: { t: "MPL2", w: "ซับที่นับเวลาเป็นหนึ่งในสิบวินาที นิยมในโปแลนด์" },
  sbv: { t: "SubViewer", w: "ซับข้อความที่ YouTube ให้ดาวน์โหลด" },
  ttml: { t: "Timed Text Markup Language", w: "ซับแบบ XML มาตรฐานของ W3C ที่บริการสตรีมมิ่งใช้" },
  dfxp: { t: "Distribution Format Exchange Profile", w: "ชื่อเดิมของ TTML เขียนแบบเดียวกัน" },
  scc: { t: "Scenarist Closed Captions", w: "คำบรรยายสำหรับคนหูหนวกของทีวีอเมริกา (CEA-608)" },
  sup: { t: "PGS หรือ HD DVD", w: "ซับภาพของแผ่น Blu-ray ที่ทุกบรรทัดเป็นภาพ จึงแก้คำไม่ได้\nส่วนซับของแผ่น HD DVD ใช้นามสกุลเดียวกันและเปิดดูหรือแปลงได้" },
  idx: { t: "VobSub index", w: "ไฟล์ดัชนีของซับภาพ DVD ที่บอกเวลา ตำแหน่ง และจานสี\nของภาพในไฟล์ .sub ชื่อเดียวกัน" },
  sub: { t: "VobSub หรือ MicroDVD", w: "ถ้ามีไฟล์ .idx ชื่อเดียวกันอยู่ข้าง ๆ คือภาพของซับ DVD\nถ้าไม่มี โปรแกรมอ่านเป็นซับข้อความ MicroDVD ที่นับเวลาเป็นเฟรม" },
  xml: { t: "Extensible Markup Language", w: "ไฟล์ข้อความที่เก็บข้อมูลเป็นแท็ก โปรแกรมนี้ใช้กับ chapter และแท็ก\nของ Matroska และ BDN XML ที่บอกเวลาของภาพซับ" },
  cue: { t: "CUE sheet", w: "รายการเพลงตาม Chapter ให้โปรแกรมเล่นเพลงแบ่งอัลบั้มเป็นเพลง" },
  ttf: { t: "TrueType Font", w: "ฟอนต์ชนิดที่ใช้ทั่วไปบน Windows" },
  otf: { t: "OpenType Font", w: "ฟอนต์รุ่นใหม่ที่เก็บตัวอักษรและลูกเล่นการจัดตัวอักษรได้มากกว่า" },
  ttc: { t: "TrueType Collection", w: "ไฟล์เดียวที่รวมฟอนต์ TrueType หลายแบบ" },
  otc: { t: "OpenType Collection", w: "ไฟล์เดียวที่รวมฟอนต์ OpenType หลายแบบ" },
  txt: { t: "ไฟล์ข้อความ", w: "โปรแกรมนี้ใช้เป็นไฟล์ keyframe แบบ Aegisub\nและไฟล์ Chapter แบบ OGM กับเวลาของเฟรมที่แยกจาก MKV" },
  pass: { t: "XviD 2-pass stats", w: "ไฟล์สถิติจากการเข้ารหัสสองรอบของ XviD หรือ WWXD\nที่บอกว่าเฟรมไหนเป็น keyframe" },
  stats: { t: "x264 2-pass stats", w: "ไฟล์สถิติจากการเข้ารหัสสองรอบของ x264 ที่บอกชนิดของทุกเฟรม" },
  log: { t: "x264 หรือ DivX 2-pass log", w: "ไฟล์สถิติจากการเข้ารหัสสองรอบของ x264 หรือ DivX\nโดยชื่อตั้งต้นของ x264 คือ x264_2pass.log" },
  sha256: { t: "SHA-256", w: "ไฟล์ข้อความที่เก็บลายนิ้วมือของไฟล์หนัง\nถ้าไฟล์เปลี่ยนแม้แต่บิตเดียว ค่าจะไม่ตรงกัน" },
  exe: { t: "โปรแกรมของ Windows", w: "ไฟล์โปรแกรมที่เปิดหนังได้ เช่น mpv PotPlayer หรือ VLC" },
};

export const FILE_TYPES: FtGroup[] = [
  { key: "video", title: "วิดีโอ", rows: [
    { name: "ไฟล์หนังที่เปิดได้", exts: MOVIE_EXT, data: "movie", what: "ชั้นวางแสดงไฟล์ชนิดนี้ และเปิดได้ทุกหน้าที่รับไฟล์หนัง ทั้งใส่โปสเตอร์ เสียงและซับ ซับไตเติล กราฟเสียง บิตเรต และ MediaInfo" },
    { name: "ไฟล์หนังที่ทำออกมา", exts: ["mkv", "mp4"], data: "movie-out", what: "ใส่โปสเตอร์หรือรวมไฟล์แล้วได้ MKV หรือ MP4 ตามที่เลือก โดย MKV เก็บปก ซับ และฟอนต์ได้ครบกว่า" },
    { name: "ยังเปิดไม่ได้", exts: ["wmv", "iso"], data: "movie-no", what: "ไฟล์ WMV ต้องแปลงเป็น MKV หรือ MP4 ก่อน ส่วนอิมเมจแผ่น ISO ต้องแตกไฟล์หนังออกมาก่อน" },
  ] },
  { key: "audio", title: "เสียง", rows: [
    { name: "ไฟล์เสียงที่เปิดได้", exts: AUDIO_EXT, data: "audio", what: "หน้ากราฟเสียง คิวแปลงเสียง และ MediaInfo เปิดได้ ส่วนไฟล์หนังก็เปิดได้โดยใช้แทร็กเสียงในหนัง" },
    { name: "ไฟล์เสียงที่ใส่เข้าหนังได้", exts: ADD_AUDIO, data: "audio-add", what: "หน้าเสียงและซับเพิ่มเป็นแทร็กเสียงใหม่ของหนังได้ และแปลงชนิดเสียงไปพร้อมกันได้" },
    { name: "ไฟล์ที่ได้จากการแปลงเสียง", exts: ENCODE_OUT_EXT, data: "audio-out", what: "M4A เป็นได้ทั้ง AAC และ ALAC ส่วน APE กับ TAK ใช้ได้เฉพาะหน้าแปลงเสียง เพราะใส่ในหนังไม่ได้" },
    { name: "เสียงของบรรทัดซับ", exts: ["wav"], data: "audio-wav", what: "หน้าแก้ซับบันทึกเสียงช่วงของบรรทัดที่เลือกเป็นไฟล์ WAV ได้" },
  ] },
  { key: "image", title: "รูป", rows: [
    { name: "รูปโปสเตอร์", exts: IMAGE_EXT, data: "image", what: "หน้าใส่โปสเตอร์ จับคู่ปก และช่องปกของหน้าเสียงและซับรับได้ โดยรูปที่ไม่ใช่ JPG หรือ PNG โปรแกรมแปลงก่อนแนบ" },
    { name: "รูปกราฟที่บันทึก", exts: ["png", "jpg", "webp", "heic", "tif"], data: "image-graph", what: "หน้ากราฟเสียงบันทึกรูปกราฟเป็นชนิดเหล่านี้ได้ ตามที่ตั้งในหัวข้อกราฟเสียง" },
  ] },
  { key: "subtitle", title: "ซับ", rows: [
    { name: "ซับข้อความที่แก้ได้ตรง ๆ", exts: SUB_TEXT, data: "sub-text", what: "หน้าซับไตเติลเปิดแก้ได้ทุกช่อง แล้วบันทึกเป็น SRT หรือ ASS" },
    { name: "ซับข้อความแบบอื่น", exts: SUB_OTHER, data: "sub-other", what: "เปิดแล้วโปรแกรมแปลงเป็น ASS หรือ SRT ให้ก่อนแก้ ถ้าจะใส่ในหนังต้องบันทึกเป็น SRT หรือ ASS ก่อน" },
    { name: "ซับภาพ", exts: SUB_IMAGE, data: "sub-image", what: "ดูได้ในตัวดูซับรูปภาพ ใส่ในหนังได้ และแปลงเป็นซับภาพชนิดอื่นได้ โดย VobSub ใช้ไฟล์ .idx คู่กับ .sub" },
    { name: "ซับภาพที่ส่งออกได้", exts: ["sup", "idx", "xml"], data: "sub-out", what: "ส่งออกซับข้อความเป็น PGS (.sup) และแปลงซับภาพเป็น PGS, VobSub หรือ BDN XML ที่มาพร้อมภาพ PNG" },
  ] },
  { key: "other", title: "อื่น ๆ", rows: [
    { name: "ฟอนต์", exts: FONT_EXT, data: "font", what: "ฝังไปกับซับ ASS ตอนรวมไฟล์ และลากมาเพิ่มเองได้ในหน้าเสียงและซับ" },
    { name: "ไฟล์ keyframe", exts: KEYFRAME_EXT, data: "keyframe", what: "หน้าแก้ซับเปิดไฟล์ keyframe ได้หลายแบบตาม Aegisub แล้วบันทึกเป็น .txt" },
    { name: "chapter", exts: ["xml"], data: "chapter", what: "แยก chapter ออกจากหนังเป็นไฟล์ XML ได้ในวิธีแยกไฟล์ของหน้าเสียงและซับ" },
    // ไฟล์ที่แยกแบบ gMKVExtractGUI (BUGS ข้อ 130 · extract.rs out_name_with)
    { name: "ที่แยกจากไฟล์ MKV", exts: ["xml", "txt", "cue"], data: "mkv-extra", what: "แท็กเป็น XML ส่วน Chapter แบบ OGM กับเวลาของแต่ละเฟรมเป็น TXT และ CUE sheet" },
    { name: "ค่า hash", exts: ["sha256"], data: "hash", what: "หน้า MediaInfo บันทึกค่า SHA-256 ไว้ข้างไฟล์หนัง ไว้ตรวจทีหลังว่าไฟล์เปลี่ยนไหม" },
    { name: "โปรแกรมเล่นหนัง", exts: ["exe"], data: "player", what: "เลือกโปรแกรมเล่นหนังเองได้ในหัวข้อเปิดเล่นหนัง" },
  ] },
];
