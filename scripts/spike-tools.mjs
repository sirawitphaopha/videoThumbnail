// ลองเครื่องมือจริงกับไฟล์ชื่อภาษาไทย ตามหัวข้อ ต้องลองจริงในขั้นเตรียม ใน docs/TECH-REVIEW.md
// ใช้: node scripts/spike-tools.mjs   (ผลชั่วคราวอยู่ที่ D:\dev\tmp\spike)
import { spawnSync } from "node:child_process";
import { mkdirSync, copyFileSync, readFileSync, statSync, rmSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const T = (n) => join(root, "src-tauri", "tools", n);
const MOV = join(root, "test-media", "สร้าง", "หนัง");
const IMG = join(root, "test-media", "สร้าง", "รูป");
const TMP = "D:\\dev\\tmp\\spike";
rmSync(TMP, { recursive: true, force: true });
mkdirSync(TMP, { recursive: true });

const run = (exe, args) => {
  const t0 = Date.now();
  const r = spawnSync(T(exe), args, { maxBuffer: 64 * 1024 * 1024 });
  return { code: r.status, out: r.stdout, err: r.stderr, ms: Date.now() - t0 };
};
const head = (title) => console.log(`\n=== ${title} ===`);

head("1. เลขรุ่นของเครื่องมือ");
for (const [exe, arg] of [["mkvmerge.exe", "--version"], ["mkvextract.exe", "--version"], ["mkvpropedit.exe", "--version"],
  ["ffmpeg.exe", "-version"], ["ffprobe.exe", "-version"], ["MediaInfo.exe", "--Version"]]) {
  const r = run(exe, [arg]);
  console.log(`${exe.padEnd(16)} รหัส ${r.code}  ${r.out.toString("utf8").split(/\r?\n/).find((l) => l.trim()) ?? ""}`);
}

const thai = join(MOV, "ดาวเหนือ (2023).mkv");

head("2. mkvmerge -J กับชื่อไฟล์ไทย");
{
  const r = run("mkvmerge.exe", ["-J", thai]);
  const j = JSON.parse(r.out.toString("utf8"));
  console.log(`รหัส ${r.code} · ชื่อไฟล์ที่อ่านกลับ: ${j.file_name}`);
  console.log(`ชื่อตรงกับที่ส่งไป: ${j.file_name === thai}`);
  for (const t of j.tracks) console.log(`  แทร็ก ${t.id} ${t.type} ${t.codec} ${t.properties.language ?? ""} (number ${t.properties.number})`);
  console.log(`  บท ${j.chapters?.[0]?.num_entries ?? 0} · errors ${JSON.stringify(j.errors)} · warnings ${JSON.stringify(j.warnings)}`);
}

head("3. ffprobe JSON กับชื่อไฟล์ไทย");
{
  const r = run("ffprobe.exe", ["-v", "error", "-print_format", "json", "-show_format", "-show_streams", thai]);
  const j = JSON.parse(r.out.toString("utf8"));
  console.log(`รหัส ${r.code} · ชื่อตรง: ${j.format.filename === thai} · ความยาว ${j.format.duration} วินาที · ${j.streams.length} สตรีม`);
}

head("4. MediaInfo กับชื่อไฟล์ไทย · แบบข้อความ แบบ JSON แบบเขียนลงไฟล์");
{
  const txt = run("MediaInfo.exe", [thai]);
  const asUtf8 = txt.out.toString("utf8");
  const line = asUtf8.split(/\r?\n/).find((l) => l.startsWith("Complete name")) ?? "(ไม่เจอบรรทัด Complete name)";
  console.log(`ข้อความทางท่อ รหัส ${txt.code} · อ่านแบบ UTF-8: ${line}`);
  console.log(`  ชื่อไทยครบ: ${line.includes("ดาวเหนือ")}`);
  const js = run("MediaInfo.exe", ["--Output=JSON", thai]);
  try {
    const j = JSON.parse(js.out.toString("utf8"));
    console.log(`JSON ทางท่อ รหัส ${js.code} · ชื่อไทยครบ: ${JSON.stringify(j).includes("ดาวเหนือ")} · track ${j.media.track.length} อัน`);
  } catch (e) { console.log(`JSON ทางท่อ อ่านไม่ได้: ${e.message}`); }
  const lf = join(TMP, "mediainfo-log.txt");
  const w = run("MediaInfo.exe", [`--LogFile=${lf}`, thai]);
  if (existsSync(lf)) {
    const b = readFileSync(lf);
    console.log(`เขียนลงไฟล์ รหัส ${w.code} · ขึ้นต้นด้วย BOM: ${b[0] === 0xef && b[1] === 0xbb} · ชื่อไทยครบ: ${b.toString("utf8").includes("ดาวเหนือ")}`);
  } else console.log("เขียนลงไฟล์ ไม่มีไฟล์ออกมา");
}

head("5. mkvpropedit เปลี่ยนปก JPG เป็น PNG (สำเนาของ Harbor Lights)");
{
  const copy = join(TMP, "ปกทดสอบ.mkv");
  copyFileSync(join(MOV, "Harbor Lights (2021).mkv"), copy);
  const png = join(IMG, "poster.png");
  const r = run("mkvpropedit.exe", ["--gui-mode", copy,
    "--attachment-name", "cover.png", "--attachment-mime-type", "image/png", "--replace-attachment", "name:cover.jpg:" + png]);
  console.log(`รหัส ${r.code} · ${r.ms} ms · ${r.out.toString("utf8").split(/\r?\n/).filter(Boolean).slice(-2).join(" | ")}`);
  const j = JSON.parse(run("mkvmerge.exe", ["-J", copy]).out.toString("utf8"));
  for (const a of j.attachments) console.log(`  ไฟล์แนบ id ${a.id} ${a.file_name} ${a.content_type} ${a.size} ไบต์ (รูปที่ใส่ ${statSync(png).size} ไบต์)`);
  const x = join(TMP, "ดึงออกมา.png");
  run("mkvextract.exe", [copy, "attachments", `${j.attachments[0].id}:${x}`]);
  console.log(`  ดึงปกออกมาแล้วตรงกับรูปที่ใส่ทุกไบต์: ${readFileSync(x).equals(readFileSync(png))}`);
}

head("6. ffmpeg ใส่ลง MP4 แบบไม่แปลงใหม่ ได้ไหม");
const mp4Case = (name, file, maps, extra = []) => {
  const out = join(TMP, `mp4-${name}.mp4`);
  const r = run("ffmpeg.exe", ["-hide_banner", "-nostdin", "-y", "-v", "error", "-i", file, ...maps, "-c", "copy", ...extra, out]);
  const msg = r.err.toString("utf8").split(/\r?\n/).filter(Boolean).slice(-1)[0] ?? "";
  console.log(`${name.padEnd(22)} ${r.code === 0 ? "ได้" : "ไม่ได้"}  ${r.code === 0 ? "" : msg}`);
};
mp4Case("H.264 + AAC", join(MOV, "Clip (2015).flv"), ["-map", "0"]);
mp4Case("AC-3 5.1", thai, ["-map", "0:V", "-map", "0:a:1"]);
mp4Case("ซับ SRT เป็น mov_text", thai, ["-map", "0:V", "-map", "0:s:0"], ["-c:s", "mov_text"]);
mp4Case("ซับ ASS เป็น mov_text", thai, ["-map", "0:V", "-map", "0:s:1"], ["-c:s", "mov_text"]);
mp4Case("ซับ SRT ใส่แบบเดิม", thai, ["-map", "0:V", "-map", "0:s:0"]);
mp4Case("Vorbis", join(MOV, "Vorbis Test (2010).mkv"), ["-map", "0:V", "-map", "0:a"]);
mp4Case("Opus + VP9", join(MOV, "ฝนแรก (2025).webm"), ["-map", "0"]);
mp4Case("MPEG-2 + MP2", join(MOV, "เมืองในหมอก (2019).mpg"), ["-map", "0"]);
mp4Case("MPEG-4 + MP3", join(MOV, "Iron Tide (2024).avi"), ["-map", "0"]);
mp4Case("HEVC ป้าย hvc1", join(MOV, "HEVC Test (2020).mkv"), ["-map", "0"], ["-tag:v:0", "hvc1"]);
{
  const out = join(TMP, "mp4-ปก.mp4");
  const r = run("ffmpeg.exe", ["-hide_banner", "-nostdin", "-y", "-v", "error", "-i", join(MOV, "Clip (2015).flv"), "-i", join(IMG, "poster.jpg"),
    "-map", "0:V", "-map", "0:a", "-map", "1", "-c", "copy", "-disposition:v:1", "attached_pic", out]);
  const p = JSON.parse(run("ffprobe.exe", ["-v", "error", "-print_format", "json", "-show_streams", out]).out.toString("utf8"));
  const pic = p.streams.find((s) => s.disposition?.attached_pic === 1);
  console.log(`${"ใส่ปกใน MP4".padEnd(22)} ${r.code === 0 ? "ได้" : "ไม่ได้"} · มีสตรีมป้ายภาพปก: ${!!pic} (${pic?.codec_name ?? "-"})`);
}

head("7. รูป HEIC จากไอโฟน");
{
  const heic = join(IMG, "IMG_4149.HEIC");
  const p = run("ffprobe.exe", ["-v", "error", "-print_format", "json", "-show_streams", "-show_stream_groups", heic]);
  try {
    const j = JSON.parse(p.out.toString("utf8"));
    console.log(`ffprobe รหัส ${p.code} · ${j.streams.length} สตรีม · กลุ่มสตรีม ${j.stream_groups?.length ?? 0}`);
    for (const g of j.stream_groups ?? []) console.log(`  กลุ่ม ${g.index} ชนิด ${g.type} ขนาด ${g.components?.[0]?.width ?? "?"}x${g.components?.[0]?.height ?? "?"}`);
    const s0 = j.streams[0];
    console.log(`  สตรีมแรก ${s0.codec_name} ${s0.width}x${s0.height} · side data ${JSON.stringify(s0.side_data_list ?? []).slice(0, 160)}`);
  } catch (e) { console.log(`ffprobe อ่านไม่ได้ ${e.message}`); }
  const out = join(TMP, "heic.png");
  const r = run("ffmpeg.exe", ["-hide_banner", "-nostdin", "-y", "-v", "error", "-i", heic, "-frames:v", "1", out]);
  if (r.code === 0) {
    const q = JSON.parse(run("ffprobe.exe", ["-v", "error", "-print_format", "json", "-show_streams", out]).out.toString("utf8"));
    console.log(`แปลงเป็น PNG ได้ · ขนาด ${q.streams[0].width}x${q.streams[0].height} · ${out}`);
  } else console.log(`แปลงไม่ได้ ${r.err.toString("utf8").slice(-300)}`);
}
