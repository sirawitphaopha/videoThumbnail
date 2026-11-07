// สร้างไฟล์หนังและรูปทดสอบของโปรแกรมชั้นหนังด้วย ffmpeg
// ใช้: node scripts/make-test-media.mjs
// ผลอยู่ที่ test-media/สร้าง/หนัง และ test-media/สร้าง/รูป (ไม่ขึ้น git)
// เรียก ffmpeg ด้วยรายการอาร์กิวเมนต์ตรง ๆ ไม่ผ่านเชลล์ กันเครื่องหมาย \ กับเครื่องหมายคำพูดเพี้ยน
// 🔴 สคริปต์นี้ใช้ -y (เขียนทับไม่ถาม) ได้เพราะเป็นไฟล์ทดสอบที่สร้างใหม่ได้ · ในโปรแกรมห้ามใช้ -y ต้องใช้ -n (TECH-REVIEW ข้อ 3)
import { spawnSync } from "node:child_process";
import { mkdirSync, copyFileSync, openSync, writeSync, closeSync, statSync, truncateSync, existsSync, readFileSync, writeFileSync, rmSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const FF = join(root, "src-tauri", "tools", "ffmpeg.exe");
const FP = join(root, "src-tauri", "tools", "ffprobe.exe");
const SRC = join(root, "test-media", "src");
const OUT = join(root, "test-media", "สร้าง");
const MOV = join(OUT, "หนัง");
const IMG = join(OUT, "รูป");
for (const [f, how] of [[FF, "รัน scripts/fetch-tools.ps1 ก่อน"], [FP, "รัน scripts/fetch-tools.ps1 ก่อน"], [join(SRC, "th.srt"), "ไฟล์ต้นทางใน test-media/src หาย ดึงจาก git"]]) {
  if (!existsSync(f)) { console.log(`ไม่มี ${f} · ${how}`); process.exit(1); }
}
mkdirSync(MOV, { recursive: true });
mkdirSync(IMG, { recursive: true });

function ff(name, args, { quiet = false } = {}) {
  const r = spawnSync(FF, ["-hide_banner", "-nostdin", "-y", "-loglevel", "error", ...args], { encoding: "utf8" });
  if (r.status !== 0) {
    if (!quiet) {
      console.log(`พัง  ${name}\n${r.error?.message ?? r.stderr}`);
      process.exitCode = 1;
    }
    return false;
  }
  if (!quiet) console.log(`สร้างแล้ว  ${name}`);
  return true;
}

// ใส่ป้ายหมุนแบบรูปจากกล้อง (EXIF Orientation) ลงไฟล์ JPG · ffmpeg เขียนป้ายนี้เองไม่ได้
// โครง: FF E1 · ความยาว · "Exif\0\0" · หัว TIFF แบบ MM · IFD 1 รายการ แท็ก 0x0112 ชนิด SHORT ค่า = orientation
function setJpegOrientation(file, orientation) {
  const jpg = readFileSync(file);
  if (jpg[0] !== 0xff || jpg[1] !== 0xd8) throw new Error(`${file} ไม่ใช่ JPG`);
  const tiff = Buffer.from([
    0x4d, 0x4d, 0x00, 0x2a, 0x00, 0x00, 0x00, 0x08, // MM · 42 · IFD เริ่มที่ 8
    0x00, 0x01,                                     // 1 รายการ
    0x01, 0x12, 0x00, 0x03, 0x00, 0x00, 0x00, 0x01, 0x00, orientation, 0x00, 0x00,
    0x00, 0x00, 0x00, 0x00,                         // ไม่มี IFD ถัดไป
  ]);
  const body = Buffer.concat([Buffer.from("Exif\0\0", "binary"), tiff]);
  const seg = Buffer.concat([Buffer.from([0xff, 0xe1, (body.length + 2) >> 8, (body.length + 2) & 0xff]), body]);
  writeFileSync(file, Buffer.concat([jpg.subarray(0, 2), seg, jpg.subarray(2)]));
}

const vid = (d, s = "1280x720") => ["-f", "lavfi", "-i", `testsrc2=size=${s}:rate=24:duration=${d}`];
const tone = (d, f = 440) => ["-f", "lavfi", "-i", `sine=frequency=${f}:sample_rate=48000:duration=${d}`];
const x264 = ["-c:v", "libx264", "-preset", "ultrafast", "-pix_fmt", "yuv420p"];

// ---------- รูป ----------
const pic = (file, size, extra = []) =>
  ff(`รูป/${file}`, ["-f", "lavfi", "-i", `testsrc2=size=${size}:duration=1`, "-frames:v", "1", ...extra, join(IMG, file)]);

pic("poster.jpg", "1000x1500", ["-q:v", "3"]);
pic("poster.png", "1000x1500");
pic("poster.webp", "800x1200", ["-c:v", "libwebp", "-quality", "85"]);
pic("scan.bmp", "1240x1754");
pic("scan.tiff", "1240x1754");
pic("wide.jpg", "1920x1080", ["-q:v", "3"]);
pic("small.jpg", "300x450", ["-q:v", "3"]);
// รูปสี่ช่องสี่สี ไว้เช็กการหมุนและพลิก · ซ้ายบนแดง ขวาบนเขียว ซ้ายล่างน้ำเงิน ขวาล่างเหลือง
ff("รูป/quad.png", [
  "-f", "lavfi", "-i", "color=c=black:size=1000x1500:duration=1",
  "-vf",
  "format=rgb24,geq=r='if(lt(X,W/2)*lt(Y,H/2)+gte(X,W/2)*gte(Y,H/2),255,0)':g='if(gte(X,W/2),255,0)':b='if(lt(X,W/2)*gte(Y,H/2),255,0)'",
  "-frames:v", "1", join(IMG, "quad.png"),
]);
// รูปถ่ายแนวตั้งจากกล้อง · พิกเซลจริงนอนอยู่ (รูปสี่สีหมุนทวนเข็ม 90°) แต่ติดป้ายหมุน 6 = ให้หมุนตามเข็ม 90° ก่อนแสดง
// โปรแกรมที่หมุนตามป้ายถูก ต้องได้รูปสี่สีตั้งตรง ซ้ายบนแดง ขวาบนเขียว ซ้ายล่างน้ำเงิน ขวาล่างเหลือง (TECH-REVIEW ข้อ 10)
const rotated = join(IMG, "quad-ป้ายหมุน6.jpg");
if (ff("รูป/quad-ป้ายหมุน6.jpg  ป้ายหมุนจากกล้อง", ["-i", join(IMG, "quad.png"), "-vf", "transpose=2", "-q:v", "2", "-frames:v", "1", rotated])) {
  setJpegOrientation(rotated, 6);
  console.log("  ใส่ป้ายหมุน 6 แล้ว");
}
const cover = join(IMG, "cover.jpg");
if (existsSync(join(IMG, "poster.jpg"))) copyFileSync(join(IMG, "poster.jpg"), cover);
else { console.log("พัง  ไม่มี poster.jpg ไว้ทำปกของ Harbor Lights"); process.exitCode = 1; }

// ---------- หนัง ----------
const D = 20;
ff("ดาวเหนือ (2023).mkv  ภาพ 1 เสียง 2 ซับ 2 บท 3", [
  ...vid(D), ...tone(D, 440), ...tone(D, 330),
  "-i", join(SRC, "th.srt"), "-i", join(SRC, "en.ass"), "-i", join(SRC, "chapters.txt"),
  "-map", "0:v", "-map", "1:a", "-map", "2:a", "-map", "3:s", "-map", "4:s",
  "-map_metadata", "5", "-map_chapters", "5",
  ...x264, "-c:a:0", "aac", "-b:a:0", "128k", "-c:a:1", "ac3", "-ac:a:1", "6", "-b:a:1", "384k",
  "-c:s:0", "srt", "-c:s:1", "ass",
  "-metadata:s:a:0", "language=tha", "-metadata:s:a:1", "language=eng",
  "-metadata:s:s:0", "language=tha", "-metadata:s:s:1", "language=eng",
  join(MOV, "ดาวเหนือ (2023).mkv"),
]);
ff("Harbor Lights (2021).mkv  มีปกอยู่แล้ว", [
  ...vid(D), ...tone(D), "-map", "0:v", "-map", "1:a", ...x264, "-c:a", "aac",
  "-attach", cover, "-metadata:s:t", "mimetype=image/jpeg", "-metadata:s:t", "filename=cover.jpg",
  join(MOV, "Harbor Lights (2021).mkv"),
]);
ff("The Last Orchard (2022).mp4  มีซับ", [
  ...vid(D), ...tone(D), "-i", join(SRC, "th.srt"), "-map", "0:v", "-map", "1:a", "-map", "2:s",
  ...x264, "-c:a", "aac", "-c:s", "mov_text", "-metadata:s:s:0", "language=tha", "-movflags", "+faststart",
  join(MOV, "The Last Orchard (2022).mp4"),
]);
ff("Paper Moons (2018).mov", [...vid(D), ...tone(D), ...x264, "-c:a", "aac", join(MOV, "Paper Moons (2018).mov")]);
ff("Silent Atlas (2016).m4v", [...vid(D), ...tone(D), ...x264, "-c:a", "aac", "-f", "mp4", join(MOV, "Silent Atlas (2016).m4v")]);
ff("Iron Tide (2024).avi", [...vid(D), ...tone(D), "-c:v", "mpeg4", "-q:v", "5", "-c:a", "libmp3lame", "-b:a", "128k", join(MOV, "Iron Tide (2024).avi")]);
ff("ฝนแรก (2025).webm", [
  ...vid(D), ...tone(D), "-c:v", "libvpx-vp9", "-deadline", "realtime", "-cpu-used", "8", "-b:v", "1M",
  "-c:a", "libopus", join(MOV, "ฝนแรก (2025).webm"),
]);
ff("บ้านริมคลอง (2017).ts", [...vid(D), ...tone(D), ...x264, "-c:a", "ac3", "-f", "mpegts", join(MOV, "บ้านริมคลอง (2017).ts")]);
ff("ลมหนาวที่เชียงดาว (2020).m2ts", [
  ...vid(D), ...tone(D), ...x264, "-c:a", "ac3", "-f", "mpegts", "-mpegts_m2ts_mode", "1",
  join(MOV, "ลมหนาวที่เชียงดาว (2020).m2ts"),
]);
if (ff("เมืองในหมอก (2019).mpg", [...vid(D, "720x480"), ...tone(D), "-c:v", "mpeg2video", "-q:v", "4", "-c:a", "mp2", "-f", "mpeg", join(MOV, "เมืองในหมอก (2019).mpg")])) {
  // นามสกุล .mpeg ก็ต้องขึ้นชั้น (โปรแกรมรับ 12 ชนิด · ผลตรวจขั้น 0 สเปกข้อ 20)
  copyFileSync(join(MOV, "เมืองในหมอก (2019).mpg"), join(MOV, "Night Market (2014).mpeg"));
  console.log("สร้างแล้ว  Night Market (2014).mpeg  (สำเนาของ .mpg)");
}
ff("Old Disc (2001).vob", [...vid(D, "720x480"), ...tone(D), "-c:v", "mpeg2video", "-q:v", "4", "-c:a", "ac3", "-f", "vob", join(MOV, "Old Disc (2001).vob")]);
ff("Clip (2015).flv", [...vid(D), ...tone(D), ...x264, "-c:a", "aac", "-f", "flv", join(MOV, "Clip (2015).flv")]);
ff("Vorbis Test (2010).mkv  เสียง Vorbis (ลองแล้ว ffmpeg 9 ใส่ลง MP4 ได้)", [...vid(D), ...tone(D), ...x264, "-c:a", "libvorbis", join(MOV, "Vorbis Test (2010).mkv")]);
ff("HEVC Test (2020).mkv", [
  ...vid(D), ...tone(D), "-c:v", "libx265", "-preset", "ultrafast", "-x265-params", "log-level=error", "-pix_fmt", "yuv420p",
  "-c:a", "aac", join(MOV, "HEVC Test (2020).mkv"),
]);
ff("ไฟล์ผิดชนิด.wmv", [...vid(D), ...tone(D), "-c:v", "wmv2", "-c:a", "wmav2", join(OUT, "ไฟล์ผิดชนิด.wmv")]);

// ไฟล์ที่มีเสียงชนิดที่ MP4 ใส่ไม่ได้ ไว้เทสข้อความเตือนตอนส่งออก MP4 (ผลตรวจขั้น 0 สเปกข้อ 17)
// เสียง WMA ใน MKV · แล้วลองส่งออก MP4 แบบไม่แปลงจริง ต้องพัง ถ้าไม่พังแปลว่าไฟล์นี้ใช้เทสไม่ได้
const wma = join(MOV, "Windows Audio (2012).mkv");
if (ff("Windows Audio (2012).mkv  เสียง WMA ที่ MP4 ใส่ไม่ได้", [...vid(D), ...tone(D), ...x264, "-c:a", "wmav2", "-b:a", "128k", wma])) {
  const probe = join(MOV, "__ลองส่งออก.mp4");
  const ok = ff("ลองส่งออก MP4", ["-i", wma, "-map", "0", "-c", "copy", "-f", "mp4", probe], { quiet: true });
  rmSync(probe, { force: true });
  if (ok) { console.log("พัง  ffmpeg ยอมใส่ WMA ลง MP4 ไฟล์นี้ใช้เทสข้อความเตือนไม่ได้"); process.exitCode = 1; }
  else console.log("  ลองแล้ว ส่งออก MP4 แบบไม่แปลงพังจริง ใช้เทสข้อความเตือนได้");
}

// ไฟล์เสียกลางเรื่อง · ยาว 60 วินาที แล้วเขียนทับไบต์มั่ว 256 KB ที่ตำแหน่งกึ่งกลางไฟล์
// ก่อนทำเสีย อ่านตำแหน่งไบต์กับเวลาของทุกแพ็กเก็ตจากไฟล์ดี แล้วจดว่าช่วงที่ทำเสียตรงกับวินาทีไหนจริง
// ลงไฟล์ .json ข้าง ๆ ไว้ให้เทสขั้น 6 เทียบ "ห่างไม่เกิน 5 วินาที" กับค่าจริง ไม่ใช่ค่าเดา (ผลตรวจขั้น 0 สเปกข้อ 19)
const LONG = 60;
const bad = join(MOV, "เสียกลางเรื่อง (2022).mkv");
if (ff("เสียกลางเรื่อง (2022).mkv", [...vid(LONG), ...tone(LONG), ...x264, "-c:a", "aac", bad])) {
  const size = statSync(bad).size;
  const JUNK = 256 * 1024;
  const at = Math.floor(size / 2);
  const p = spawnSync(FP, ["-v", "error", "-show_entries", "packet=stream_index,pts_time,pos,size", "-of", "csv=p=0", bad], { encoding: "utf8" });
  const hit = p.stdout.trim().split(/\r?\n/).map((l) => l.split(","))
    .map(([s, t, sz, pos]) => ({ stream: +s, time: +t, pos: +pos, size: +sz }))
    .filter((k) => k.pos + k.size > at && k.pos < at + JUNK);
  const junk = Buffer.alloc(JUNK);
  let seed = 12345;
  for (let i = 0; i < junk.length; i++) { seed = (seed * 1103515245 + 12345) & 0x7fffffff; junk[i] = seed & 0xff; }
  const fd = openSync(bad, "r+");
  writeSync(fd, junk, 0, junk.length, at);
  closeSync(fd);
  const times = hit.map((k) => k.time).filter(Number.isFinite);
  const info = {
    คำอธิบาย: "ช่วงไบต์ที่ make-test-media.mjs เขียนทับด้วยไบต์มั่ว และเวลาในเรื่องที่ตรงกับช่วงนั้น อ่านจากไฟล์ก่อนทำเสีย",
    ตำแหน่งไบต์: at, ยาวไบต์: JUNK, ขนาดไฟล์: size,
    วินาทีเริ่ม: Math.min(...times), วินาทีจบ: Math.max(...times),
    เสียที่ภาพ: hit.some((k) => k.stream === 0), เสียที่เสียง: hit.some((k) => k.stream === 1),
  };
  writeFileSync(bad.replace(/\.mkv$/, ".json"), JSON.stringify(info, null, 2) + "\n", "utf8");
  console.log(`  เขียนทับไบต์มั่ว 256 KB ที่ตำแหน่ง ${at.toLocaleString()} จาก ${size.toLocaleString()} ไบต์ = วินาที ${info.วินาทีเริ่ม.toFixed(2)} ถึง ${info.วินาทีจบ.toFixed(2)} (จดใน .json)`);
}

// ไฟล์ขาดท้าย · ยาว 60 วินาที แล้วตัดเหลือ 70%
const cut = join(MOV, "ขาดท้าย (2022).mkv");
if (ff("ขาดท้าย (2022).mkv", [...vid(LONG), ...tone(LONG), ...x264, "-c:a", "aac", cut])) {
  const size = statSync(cut).size;
  truncateSync(cut, Math.floor(size * 0.7));
  console.log(`  ตัดเหลือ ${Math.floor(size * 0.7).toLocaleString()} จาก ${size.toLocaleString()} ไบต์`);
}

// ---------- เสียงและซับ (แผนเสียงและซับ ขั้น 0) ----------
// อยู่โฟลเดอร์ เสียงซับ แยกจาก หนัง เพราะตัวตรวจเดิมนับเรื่องในโฟลเดอร์หนัง เพิ่มไฟล์ตรงนั้นแล้วยอดเพี้ยน
// เสียงทดสอบเป็นเสียงซ่าชมพูที่ seed ตายตัวคูณซองความดังที่ไม่ซ้ำ หาค่าเลื่อนด้วย cross-correlation ได้จริง
// (เสียงโทนเดียวซ้ำทุกคาบ หาค่าเลื่อนไม่ได้)
const AV = join(OUT, "เสียงซับ");
mkdirSync(AV, { recursive: true });
const MKVMERGE = join(root, "src-tauri", "tools", "mkvmerge.exe");
const AVD = 60;
const noise = (d, seed = 7) => [
  "-f", "lavfi", "-i",
  `anoisesrc=color=pink:seed=${seed}:amplitude=0.5:duration=${d}:sample_rate=48000,volume='0.15+0.85*abs(sin(2*PI*t*0.37))*abs(sin(2*PI*t*1.31+1))':eval=frame`,
];
const small = (d) => ["-f", "lavfi", "-i", `testsrc2=size=854x480:rate=24:duration=${d}`];
const star = join(AV, "ดาวตก (2024).mkv");
ff("เสียงซับ/ดาวตก (2024).mkv  ภาพ 1 เสียงอังกฤษ 1 ยาว 60 วินาที", [
  ...small(AVD), ...noise(AVD), "-map", "0:v", "-map", "1:a", ...x264, "-c:a", "aac", "-b:a", "160k", "-ac", "2",
  "-metadata:s:a:0", "language=eng", "-metadata:s:a:0", "title=English", star,
]);
// พากย์ไทยที่โหลดแยก AC-3 5.1 · เนื้อเสียงช้ากว่าหนัง 120 ms (มีหัวเกิน 120 ms) ตามแบบชื่อไฟล์ของ eac3to
// DELAY -120ms = ต้องเลื่อนเสียงไปก่อน 120 ms · ใส่ด้วย mkvmerge --sync 0:-120 แล้วต้องตรงกับหนัง
const ch51 = "pan=5.1|FL=0.7*c0|FR=0.7*c0|FC=c0|LFE=0.2*c0|BL=0.4*c0|BR=0.4*c0";
ff("เสียงซับ/ดาวตก (2024) พากย์ไทย DELAY -120ms.ac3  เลื่อนจริง 120 ms", [
  ...noise(AVD), "-af", `adelay=120:all=1,${ch51}`, "-c:a", "ac3", "-b:a", "384k", join(AV, "ดาวตก (2024) พากย์ไทย DELAY -120ms.ac3"),
]);
// เสียงจากแผ่นยุโรป 25 fps ที่เร็วกว่าหนัง 23.976 fps (เร็วขึ้น 4.27% เสียงสูงขึ้น) ไว้เทสตัวจับเสียงเหลื่อมเพิ่ม
ff("เสียงซับ/ดาวตก (2024) PAL 25fps.ac3  เร็ว 25/23.976", [
  ...noise(AVD), "-af", `asetrate=${48000 * 25 / 23.976},aresample=48000`, "-ac", "2", "-c:a", "ac3", "-b:a", "192k",
  join(AV, "ดาวตก (2024) PAL 25fps.ac3"),
]);
// ซับแยก SRT ASS VTT และ SRT ที่เข้ารหัส TIS-620 (ไฟล์ซับไทยเก่าที่เจอบ่อย)
copyFileSync(join(SRC, "th.srt"), join(AV, "ดาวตก (2024).th.srt"));
copyFileSync(join(SRC, "en.ass"), join(AV, "ดาวตก (2024).en.ass"));
console.log("สร้างแล้ว  เสียงซับ/ดาวตก (2024).th.srt · .en.ass  (สำเนาจาก test-media/src)");
ff("เสียงซับ/ดาวตก (2024).en.vtt", ["-i", join(SRC, "en.ass"), "-c:s", "webvtt", join(AV, "ดาวตก (2024).en.vtt")]);
{
  const text = readFileSync(join(SRC, "th.srt"), "utf8").replace(/^\uFEFF/, "");
  const bytes = Buffer.from([...text].map((ch) => {
    const c = ch.codePointAt(0);
    if (c < 0x80) return c;
    if (c >= 0x0e01 && c <= 0x0e5b) return c - 0x0d60; // ช่วงอักษรไทยของ TIS-620 คือ 0xA1 ถึง 0xFB
    return 0x3f;
  }));
  writeFileSync(join(AV, "ดาวตก (2024).tis620.th.srt"), bytes);
  console.log("สร้างแล้ว  เสียงซับ/ดาวตก (2024).tis620.th.srt  เข้ารหัส TIS-620");
}
// เพลงไว้เทสหน้ากราฟเสียง โหมดแปลงเป็นคิว ข้อมูลเพลง ปก · FLAC 96 kHz 24 บิต มีแท็กและปก
const music = (d) => [
  "-f", "lavfi", "-i",
  `sine=frequency=220:sample_rate=96000:duration=${d}`, "-f", "lavfi", "-i", `sine=frequency=277.18:sample_rate=96000:duration=${d}`,
  "-f", "lavfi", "-i", `anoisesrc=color=pink:seed=3:amplitude=0.08:duration=${d}:sample_rate=96000`,
];
const tags = (title) => ["-metadata", `title=${title}`, "-metadata", "artist=วงทดสอบ", "-metadata", "album=อัลบั้มทดสอบ", "-metadata", "date=2024", "-metadata", "track=3"];
const mix = ["-filter_complex", "[0:a][1:a][2:a]amerge=inputs=3,pan=stereo|c0=0.4*c0+0.2*c1+c2|c1=0.2*c0+0.4*c1+c2[a]", "-map", "[a]"];
ff("เสียงซับ/เพลงทดสอบ 96k.flac  96 kHz 24 บิต แท็ก ปก", [
  ...music(30), "-i", cover, ...mix, "-map", "3:v", "-c:v", "copy", "-disposition:v", "attached_pic",
  "-c:a", "flac", "-sample_fmt", "s32", "-ar", "96000", ...tags("เพลงทดสอบ 96k"), join(AV, "เพลงทดสอบ 96k.flac"),
]);
ff("เสียงซับ/เพลงทดสอบ.mp3  แท็ก ปก", [
  ...music(30), "-i", cover, ...mix, "-map", "3:v", "-c:v", "copy", "-disposition:v", "attached_pic",
  "-c:a", "libmp3lame", "-q:a", "2", "-ar", "44100", "-id3v2_version", "3", ...tags("เพลงทดสอบ MP3"), join(AV, "เพลงทดสอบ.mp3"),
]);
ff("เสียงซับ/เพลงทดสอบ.opus", [...music(30), ...mix, "-c:a", "libopus", "-b:a", "128k", "-ar", "48000", ...tags("เพลงทดสอบ Opus"), join(AV, "เพลงทดสอบ.opus")]);
ff("เสียงซับ/เพลงทดสอบ.wav  16 บิต 44.1 kHz", [...music(30), ...mix, "-c:a", "pcm_s16le", "-ar", "44100", join(AV, "เพลงทดสอบ.wav")]);
// MKV มีฟอนต์แนบกับซับ ASS ไว้เทสว่ารวมแล้วฟอนต์ยังอยู่ · ฟอนต์ Tahoma ของ Windows (ไม่ขึ้น git)
const tahoma = join(process.env.WINDIR ?? "C:\\Windows", "Fonts", "tahoma.ttf");
if (existsSync(tahoma)) {
  ff("เสียงซับ/ฟอนต์แนบ (2024).mkv  ซับ ASS กับฟอนต์แนบ", [
    ...small(D), ...noise(D, 11), "-i", join(SRC, "en.ass"), "-map", "0:v", "-map", "1:a", "-map", "2:s", ...x264, "-c:a", "aac", "-ac", "2", "-c:s", "ass",
    "-attach", tahoma, "-metadata:s:t", "mimetype=application/x-truetype-font", "-metadata:s:t", "filename=tahoma.ttf",
    join(AV, "ฟอนต์แนบ (2024).mkv"),
  ]);
} else console.log(`ข้าม  ฟอนต์แนบ (2024).mkv · ไม่มี ${tahoma}`);
// MKV มีซับรูป PGS (บลูเรย์) กับ VobSub (DVD) จากไฟล์ตัวอย่างทางการของ FFmpeg (test-media/ซับตัวอย่าง-ffmpeg ไม่ขึ้น git · แหล่งอยู่ test-media/README.md)
// ffmpeg ทำซับรูปจากตัวหนังสือเองไม่ได้ จึงใช้ไฟล์ตัวอย่าง · VobSub ตัวอย่างเริ่มวินาทีที่ 132 เลื่อนมาเริ่มราววินาทีที่ 2.5
const SUBS = join(root, "test-media", "ซับตัวอย่าง-ffmpeg");
if (existsSync(join(SUBS, "vobsub.idx")) && existsSync(join(SUBS, "supsample.mkv"))) {
  const base = join(AV, "__ฐานซับรูป.mkv");
  if (ff("ฐานภาพเสียง 240 วินาที", [...small(240), ...noise(240, 5), "-map", "0:v", "-map", "1:a", ...x264, "-c:a", "aac", "-ac", "2", base], { quiet: true })) {
    const r = spawnSync(MKVMERGE, [
      "-q", "-o", join(AV, "ซับรูป (2024).mkv"), base,
      "-D", "-A", "--no-chapters", "--language", "1:tha", "--track-name", "1:PGS ตัวอย่าง", join(SUBS, "supsample.mkv"),
      "--sync", "0:-130000", "--language", "0:eng", "--track-name", "0:VobSub ตัวอย่าง", join(SUBS, "vobsub.idx"),
    ], { encoding: "utf8" });
    rmSync(base, { force: true });
    if (r.status === 0 || r.status === 1) console.log("สร้างแล้ว  เสียงซับ/ซับรูป (2024).mkv  ซับ PGS 2 ภาพ VobSub 46 ภาพ");
    else { console.log(`พัง  ซับรูป (2024).mkv\n${r.stdout}${r.stderr}`); process.exitCode = 1; }
  }
} else console.log("ข้าม  ซับรูป (2024).mkv · ยังไม่มีไฟล์ตัวอย่างใน test-media/ซับตัวอย่าง-ffmpeg (ดูแหล่งที่ test-media/README.md)");

// ไฟล์ของพี่กัน
const fromGun = join(root, "test-media", "จากพี่กัน");
if (existsSync(join(fromGun, "IMG_4149.HEIC"))) copyFileSync(join(fromGun, "IMG_4149.HEIC"), join(IMG, "IMG_4149.HEIC"));
console.log(process.exitCode ? "\nมีไฟล์ที่สร้างไม่สำเร็จ" : "\nสร้างครบทุกไฟล์");
