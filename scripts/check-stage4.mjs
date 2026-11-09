// เทสขั้น 4 ใส่โปสเตอร์ ในหน้าต่างโปรแกรมจริง ผ่านพอร์ตดีบัก (แผนขั้น 4 ตารางวิธีเทส)
// เช็กผลด้วย mkvmerge ffprobe และค่า hash ไม่ดูด้วยตาอย่างเดียว · ไฟล์หนังทุกไฟล์เป็นสำเนาในโฟลเดอร์ทดสอบ ไม่แตะ test-media
// ใช้: node scripts/check-stage4.mjs  (โปรแกรมเปิดผ่าน scripts/dev-app.ps1 · ไฟล์ทดสอบจาก node scripts/make-test-media.mjs)
import { mkdirSync, writeFileSync, readdirSync, copyFileSync, rmSync, existsSync, readFileSync, statSync } from "node:fs";
import { createHash } from "node:crypto";
import { spawn, spawnSync } from "node:child_process";
import { join } from "node:path";
import { connect, sleep } from "./lib/cdp-client.mjs";

const ROOT = process.cwd();
const SRC = join(ROOT, "test-media", "สร้าง", "หนัง");
const IMG = join(ROOT, "test-media", "สร้าง", "รูป");
const MINE = join(ROOT, "test-media", "จากพี่กัน");
const T = join(ROOT, "src-tauri", "tools");
const DIR = "D:\\dev\\tmp\\ชั้นโปสเตอร์";
const OUT = "docs/report-2026-11-06/ขั้น4";
mkdirSync(OUT, { recursive: true });
if (!existsSync(SRC)) { console.log("ไม่มีไฟล์ทดสอบ รัน node scripts/make-test-media.mjs ก่อน"); process.exit(1); }

// ---------- เครื่องช่วย ----------
const sha = (p) => createHash("sha256").update(readFileSync(p)).digest("hex");
const tool = (name, args) => spawnSync(join(T, name + ".exe"), args, { encoding: "utf8", maxBuffer: 64 << 20 });
const probe = (p) => JSON.parse(tool("ffprobe", ["-v", "error", "-print_format", "json", "-show_format", "-show_streams", p]).stdout || "{}");
const ident = (p) => JSON.parse(tool("mkvmerge", ["-J", p]).stdout || "{}");
const tracks = (j) => (j.streams ?? []).filter((s) => ["video", "audio", "subtitle"].includes(s.codec_type) && s.disposition?.attached_pic !== 1).map((s) => `${s.codec_type}:${s.codec_name}`);
const dur = (j) => Number(j.format?.duration ?? NaN);
const covers = (p) => (ident(p).attachments ?? []).filter((a) => /^cover\./i.test(a.file_name));
const coverSha = (p, a) => { const o = join(DIR, `__cover-${Date.now()}`); tool("mkvextract", [p, "attachments", `${a.id}:${o}`]); const h = existsSync(o) ? sha(o) : null; rmSync(o, { force: true }); return h; };
const plays10 = (p) => { const r = tool("ffmpeg", ["-v", "error", "-nostdin", "-t", "10", "-i", p, "-f", "null", "-"]); return r.status === 0 && !r.stderr.trim(); };
const partials = () => readdirSync(DIR).filter((f) => f.endsWith(".partial"));

const c = await connect();
const results = [];
const check = (name, pass, detail = "") => { results.push({ name, pass: !!pass, detail: String(detail) }); console.log(`${pass ? "✅" : "❌"} ${name}${detail ? " · " + detail : ""}`); };
const inv = (cmd, args = {}) => c.evaluate(`window.__TAURI_INTERNALS__.invoke(${JSON.stringify(cmd)}, ${JSON.stringify(args)})`);
const invTry = (cmd, args = {}) => c.evaluate(`window.__TAURI_INTERNALS__.invoke(${JSON.stringify(cmd)}, ${JSON.stringify(args)}).then((r) => ({ ok: true, r }), (e) => ({ ok: false, e }))`);
const q = (js) => c.evaluate(`(() => { ${js} })()`);
const shot = async (f, sel, pad = 0) => { await c.move(100, 600); await sleep(250); return c.shot(`${OUT}/${f}`, sel, pad); };
async function waitScan() {
  await sleep(300);
  for (let i = 0; i < 300; i++) {
    const r = await inv("get_library");
    if (!r.scanning) return r;
    await sleep(200);
  }
  throw new Error("รออ่านโฟลเดอร์เกินเวลา");
}
const GEO = (info) => ({ rotate: 0, flip: false, mode: "crop", x: info.crop[0], y: info.crop[1], w: info.crop[2], h: info.crop[3], pad: "#ffffff" });
/** เตรียมรูปโปสเตอร์ด้วยคำสั่งตรง (แบบเดียวกับกดใช้รูปนี้) คืนไฟล์ที่จะแนบจริง */
async function choose(img, format = "jpg") {
  const info = await inv("poster_open", { path: join(IMG, img) });
  const r = await inv("poster_render", { req: { geo: GEO(info), format, quality: 90, choose: true, sizes: false } });
  return { info, r, sha: sha(r.preview) };
}
const apply = (path, output = "mkv", extra = {}) => invTry("poster_apply", { req: { path, output, checkSource: true, checkOutput: true, original: "keep", drop: [], ...extra } });

// ---------- โฟลเดอร์ทดสอบ · สำเนาหนังทุกชนิด + คลิปอัดหน้าจอของพี่กัน (MP4 ของจริง) ----------
rmSync(DIR, { recursive: true, force: true });
mkdirSync(DIR, { recursive: true });
for (const f of readdirSync(SRC)) if (!f.endsWith(".json")) copyFileSync(join(SRC, f), join(DIR, f));
const real = readdirSync(MINE).find((f) => f.endsWith(".mp4"));
if (real) copyFileSync(join(MINE, real), join(DIR, "อัดหน้าจอของพี่กัน (2026).mp4"));
for (const f of ["poster.jpg", "poster.webp", "wide.jpg"]) copyFileSync(join(IMG, f), join(DIR, f));
const imgBefore = Object.fromEntries(readdirSync(IMG).map((f) => [f, sha(join(IMG, f))]));
await inv("dev_fake_free", { bytes: 0 });
await inv("set_settings", { patch: { folders: [DIR], outputFormat: "mkv", originalAfter: "keep", checkSourceBefore: true, checkOutputAfter: true, posterFormat: "jpg", jpgQuality: 90 } });
await c.evaluate("location.hash = ''; location.reload()");
await sleep(1200);
await waitScan();

// =====================================================================  ① ครอบไฟล์อื่นเป็น MKV ทุกชนิด
const wrapTypes = readdirSync(DIR).filter((f) => /\.(mp4|m4v|mov|avi|webm|ts|m2ts|mpg|mpeg|vob|flv)$/i.test(f));
const wrapRows = [];
for (const f of wrapTypes) {
  const p = join(DIR, f);
  const before = probe(p), h0 = sha(p);
  const pc = await choose("poster.jpg");
  const res = await apply(p);
  const stem = f.replace(/\.[^.]+$/, "");
  const out = join(DIR, stem + ".mkv"), kept = join(DIR, "ไฟล์เดิม", f);
  if (!res.ok) { wrapRows.push({ f, ok: false, why: res.e?.title + " " + (res.e?.detail ?? []).join(" ") }); continue; }
  const after = probe(out);
  const cv = covers(out);
  // ซับตัวหนังสือของ MP4 (mov_text) mkvmerge เก็บเป็น SRT ตามมาตรฐาน MKV ไม่ใช่การแปลงภาพเสียงใหม่
  const same = JSON.stringify(tracks(before).map((t) => t.replace("subtitle:mov_text", "subtitle:subrip"))) === JSON.stringify(tracks(after));
  const d = Math.abs(dur(before) - dur(after));
  const cover = cv.length === 1 && cv[0].file_name === "cover.jpg" && cv[0].content_type === "image/jpeg" && coverSha(out, cv[0]) === pc.sha;
  const keptOk = existsSync(kept) && sha(kept) === h0 && !existsSync(p);
  wrapRows.push({ f, ok: same && d <= 0.1 && cover && keptOk && res.r.verified, why: `แทร็ก ${same ? "เท่า" : "ไม่เท่า " + tracks(before) + " → " + tracks(after)} · ความยาวต่าง ${d.toFixed(3)} · ปก ${cover} · ไฟล์เดิม ${keptOk}` });
}
for (const r of wrapRows) check(`ครอบ ${r.f} เป็น MKV · แทร็กชนิดเดิมจำนวนเท่าเดิม ความยาวต่างไม่เกิน 0.1 วินาที ปก cover.jpg ตรงรูปที่ทำ ไฟล์เดิมอยู่ในไฟล์เดิม hash เท่าเดิม`, r.ok, r.why);
check("ครอบครบทุกชนิดแล้วไม่มีไฟล์ชั่วคราว .partial ค้าง", partials().length === 0, partials().join(", ") || "ไม่มี");

// MP4 ที่มีปกฝังอยู่แล้ว (ผู้ช่วยตรวจโค้ดข้อ 3) · mkvmerge ยกปกเดิมมาเป็น cover.jpg เอง ต้องไม่ได้ปกชื่อซ้ำสองอัน
{
  const mk = (name) => { const p = join(DIR, name); tool("ffmpeg", ["-v", "error", "-y", "-i", join(SRC, "The Last Orchard (2022).mp4"), "-i", join(IMG, "cover.jpg"), "-map", "0", "-map", "1", "-c", "copy", "-disposition:v:1", "attached_pic", p]); return p; };
  const a = mk("มีปกฝัง ก (2022).mp4");
  const pa = await choose("poster.jpg");
  const ra = await apply(a);
  const ca = ra.ok ? (ident(join(DIR, "มีปกฝัง ก (2022).mkv")).attachments ?? []).map((x) => x.file_name) : [];
  const shaA = ra.ok ? coverSha(join(DIR, "มีปกฝัง ก (2022).mkv"), covers(join(DIR, "มีปกฝัง ก (2022).mkv"))[0]) : null;
  check("ครอบ MP4 ที่มีปกฝังอยู่แล้วด้วยรูปแนวตั้ง · ได้ cover.jpg อันเดียวเป็นรูปใหม่ ตรวจผ่าน · บอกว่าปกเดิมไม่ได้ยกมา", ra.ok && ra.r.verified && ca.join(" ") === "cover.jpg" && shaA === pa.sha && ra.r.notes.some((n) => n.includes("ไม่ได้ยกมา")), ra.ok ? `ไฟล์แนบ ${ca.join(" ")} · ${ra.r.notes.join(" / ")}` : `${ra.e?.title} ${(ra.e?.detail ?? []).join(" ")}`);
  const b = mk("มีปกฝัง ข (2022).mp4");
  const wi = await inv("poster_open", { path: join(IMG, "wide.jpg") });
  await inv("poster_render", { req: { geo: { ...GEO(wi), mode: "original", x: 0, y: 0, w: 1, h: 1 }, format: "jpg", quality: 90, choose: true, sizes: false } });
  const rb = await apply(b);
  const cb = rb.ok ? (ident(join(DIR, "มีปกฝัง ข (2022).mkv")).attachments ?? []).map((x) => x.file_name).sort() : [];
  check("ครอบ MP4 ที่มีปกแนวตั้งฝังอยู่ ด้วยรูปแนวนอน · ได้ cover.jpg (ปกเดิม) กับ cover_land.jpg (รูปใหม่) ตรวจผ่าน", rb.ok && rb.r.verified && cb.join(" ") === "cover.jpg cover_land.jpg" && rb.r.notes.some((n) => n.includes("ยกมาด้วย")), rb.ok ? `ไฟล์แนบ ${cb.join(" ")} · ${rb.r.notes.join(" / ")}` : `${rb.e?.title} ${(rb.e?.detail ?? []).join(" ")}`);
}

// =====================================================================  ② ใส่ปกให้ MKV · เปลี่ยน JPG เป็น PNG
{
  const p = join(DIR, "ดาวเหนือ (2023).mkv");
  const before = probe(p), chBefore = (ident(p).chapters ?? []).length;
  const real0 = sha(p);
  await inv("dev_set_check", { path: p, status: "ok", sha256: real0 });
  const pc = await choose("poster.jpg");
  const res = await apply(p);
  const after = probe(p);
  const cv = covers(p);
  const lib = (await inv("get_library")).movies.find((m) => m.path === p);
  check("ใส่ปกให้ MKV · ไฟล์แนบ cover.jpg ชนิด image/jpeg อันเดียว · ดึงออกมาแล้ว hash ตรงกับรูปที่ทำ", res.ok && cv.length === 1 && cv[0].file_name === "cover.jpg" && cv[0].content_type === "image/jpeg" && coverSha(p, cv[0]) === pc.sha, JSON.stringify(cv.map((a) => a.file_name)));
  check("ใส่ปกให้ MKV · ภาพ เสียง ซับ บท เท่าเดิมทุกแทร็ก · เล่น 10 วินาทีแรกไม่มีข้อผิดพลาด", JSON.stringify(tracks(before)) === JSON.stringify(tracks(after)) && (ident(p).chapters ?? []).length === chBefore && plays10(p), `${tracks(after).join(" ")} · บท ${chBefore}`);
  check("โปรแกรมแก้ไฟล์เอง ประวัติตรวจคงเดิม ค่า hash ที่จดไว้เป็นของไฟล์ใหม่ ไม่ขึ้นว่าไฟล์ถูกเปลี่ยน", lib?.status === "ok" && lib?.sha256 === sha(p) && lib?.sha256 !== real0, `${lib?.status} · ${lib?.sha256?.slice(0, 12)}`);
  await inv("scan_library"); const lib2 = (await waitScan()).movies.find((m) => m.path === p);
  check("อ่านโฟลเดอร์ใหม่หลังแก้ไฟล์เอง ยังไม่ขึ้นว่าไฟล์ถูกเปลี่ยน ปกขึ้นชั้น", lib2?.status === "ok" && lib2?.hasCover && !!lib2?.thumb, `${lib2?.status} · ปก ${lib2?.hasCover}`);
  const png = await choose("poster.png", "png");
  const res2 = await apply(p);
  const cv2 = covers(p);
  check("เปลี่ยนปก JPG เป็น PNG · ชื่อ cover.png ชนิด image/png · ปกเก่าหายไป", res2.ok && cv2.length === 1 && cv2[0].file_name === "cover.png" && cv2[0].content_type === "image/png" && coverSha(p, cv2[0]) === png.sha, JSON.stringify(cv2.map((a) => `${a.file_name} ${a.content_type}`)));
  const h = join(DIR, "Harbor Lights (2021).mkv");
  await choose("poster.jpg");
  const res3 = await apply(h);
  const cv3 = covers(h);
  check("MKV ที่มีปกอยู่แล้ว เปลี่ยนปกแล้วเหลือปกเดียว", res3.ok && cv3.length === 1, JSON.stringify(cv3.map((a) => a.file_name)));
}

// =====================================================================  ③ ส่งออก MP4
{
  const p = join(DIR, "ดาวเหนือ (2023).mkv");
  const info = await inv("poster_inspect", { path: p });
  const ass = info.streams.find((s) => s.codec === "ass");
  check("MKV มีซับ ASS · ส่งออก MP4 บอกว่าสีกับฟอนต์จะหาย", ass?.mp4 === "style", ass?.why ?? "");
  await choose("poster.jpg");
  const res = await apply(p, "mp4");
  const out = join(DIR, "ดาวเหนือ (2023).mp4");
  const j = existsSync(out) ? probe(out) : {};
  const pic = (j.streams ?? []).find((s) => s.disposition?.attached_pic === 1);
  const v = tracks(j);
  check("ส่งออก MP4 · ปกมีป้ายเป็นภาพปก · ภาพเสียงไม่ได้แปลงใหม่ · ซับ SRT เข้าไปครบเป็น mov_text", res.ok && !!pic && v.includes("video:h264") && v.includes("audio:aac") && v.includes("audio:ac3") && v.filter((x) => x === "subtitle:mov_text").length === 2, `${v.join(" ")} · ปก ${pic?.codec_name}`);
  check("ส่งออก MP4 จาก MKV ไฟล์ MKV เดิมย้ายไปไฟล์เดิม", existsSync(join(DIR, "ไฟล์เดิม", "ดาวเหนือ (2023).mkv")) && !existsSync(p));
  const w = join(DIR, "Windows Audio (2012).mkv");
  const wi = await inv("poster_inspect", { path: w });
  const wma = wi.streams.find((s) => s.codec === "wmav2");
  const refuse = await apply(w, "mp4");
  check("ไฟล์มีเสียงที่ MP4 ใส่ไม่ได้ ขึ้นข้อความเตือน ยังไม่ทำจนกว่าจะเลือก", wma?.mp4 === "no" && !refuse.ok && refuse.e.kind === "mp4" && existsSync(w), `${wma?.why} · ${refuse.e?.title}`);
  await choose("poster.jpg");
  const ok = await apply(w, "mp4", { drop: [wma.index] });
  const wj = probe(join(DIR, "Windows Audio (2012).mp4"));
  check("กดทิ้งแทร็กนั้นแล้ว ไฟล์ใหม่ไม่มีแทร็กนั้น", ok.ok && !(wj.streams ?? []).some((s) => s.codec_type === "audio"), tracks(wj).join(" "));
}

// =====================================================================  ④ กรณีที่ต้องไม่ทำ
{
  // ไฟล์ปลายทางมีชื่อซ้ำอยู่แล้ว · ไม่เขียนทับ
  const p = join(DIR, "ไฟล์เดิม", "Paper Moons (2018).mov");
  const back = join(DIR, "Paper Moons (2018).mov");
  copyFileSync(p, back);
  const dummy = join(DIR, "Paper Moons (2018).mkv");
  const hd = sha(dummy);
  await choose("poster.jpg");
  const r = await apply(back);
  check("ไฟล์ปลายทางมีชื่อซ้ำอยู่แล้ว ไม่เขียนทับ ขึ้นข้อความ", !r.ok && r.e.kind === "exists" && sha(dummy) === hd && existsSync(back), r.e?.title);

  // ไฟล์ถูกเปิดอยู่ในโปรแกรมอื่น
  const held = join(DIR, "ขาดท้าย (2022).mkv");
  const h0 = sha(held);
  const holder = spawn("powershell", ["-NoProfile", "-Command", "$f=[IO.File]::Open($env:HOLD_PATH,'Open','Read','Read'); [Console]::Out.WriteLine('held'); [Console]::Out.Flush(); Start-Sleep -Seconds 60; $f.Close()"], { env: { ...process.env, HOLD_PATH: held }, windowsHide: true });
  await new Promise((ok) => holder.stdout.on("data", (d) => { if (String(d).includes("held")) ok(); }));
  await choose("poster.jpg");
  const r2 = await apply(held);
  holder.kill(); await new Promise((ok) => holder.on("exit", ok));
  check("ไฟล์ถูกเปิดอยู่ในโปรแกรมอื่น ขึ้นข้อความ ไฟล์ไม่ถูกแตะ", !r2.ok && r2.e.kind === "inuse" && sha(held) === h0, r2.e?.title);

  // ที่ว่างในไดรฟ์ไม่พอ · ตัวเทสหลอกว่าเหลือ 10 MB (คลิป 16 MB ต้องการราว 80 MB) · ใช้ไฟล์ที่ยังไม่เคยครอบ ชื่อไม่ชนกับข้อก่อน
  const fresh = join(DIR, "คลิปสั้น (2015).flv");
  copyFileSync(join(SRC, "Clip (2015).flv"), fresh);
  await inv("dev_fake_free", { bytes: 10 * 1024 * 1024 });
  await choose("poster.jpg");
  const r3 = await apply(fresh);
  await inv("dev_fake_free", { bytes: 0 });
  check("ที่ว่างในไดรฟ์ไม่พอ ขึ้นต้องการเท่าไหร่ เหลือเท่าไหร่ และไม่เริ่มงาน", !r3.ok && r3.e.kind === "space" && /ต้องการ .+ แต่เหลือ 10 MB/.test(r3.e.detail[0]) && partials().length === 0, `${r3.e?.title} · ${r3.e?.detail?.[0]}`);

  // ไฟล์ต้นทางเสียอยู่แล้ว · ตรวจก่อนครอบจับได้
  const bad = join(DIR, "เสียกลางเรื่อง (2022).mkv");
  const hb = sha(bad);
  await choose("poster.jpg");
  const r4 = await apply(bad);
  check("เปิดตรวจไฟล์ต้นทาง ไฟล์ที่เสียกลางเรื่องถูกบอกก่อนลงมือ ไฟล์ไม่ถูกแตะ", !r4.ok && r4.e.kind === "badsource" && sha(bad) === hb, `${r4.e?.title} · ${r4.e?.detail?.[0] ?? ""}`);
}

// =====================================================================  ⑤ กดหยุดกลางทาง (ไฟล์ใหญ่ราว 1.6 GB ต่อจากคลิปเดิมแบบไม่แปลงใหม่)
{
  const list = join(DIR, "__list.txt");
  writeFileSync(list, Array.from({ length: 100 }, () => `file '${join(SRC, "The Last Orchard (2022).mp4").replace(/\\/g, "/")}'`).join("\n"));
  const big = join(DIR, "หนังยาว (2020).mp4");
  tool("ffmpeg", ["-v", "error", "-nostdin", "-n", "-f", "concat", "-safe", "0", "-i", list, "-c", "copy", big]);
  rmSync(list);
  const hb = sha(big);
  await choose("poster.jpg");
  const t0 = Date.now();
  const running = invTry("poster_apply", { req: { path: big, output: "mkv", checkSource: false, checkOutput: true, original: "keep", drop: [] } });
  let seen = false;
  for (let i = 0; i < 200 && !seen; i++) { await sleep(50); seen = partials().length > 0; }
  await sleep(300);
  await inv("poster_cancel");
  const r = await running;
  await sleep(300);
  check("กดหยุดกลางทาง ไฟล์ที่ทำค้างถูกลบ ไฟล์เดิม hash เท่าเดิม", seen && !r.ok && r.e.kind === "cancelled" && partials().length === 0 && sha(big) === hb && !existsSync(join(DIR, "หนังยาว (2020).mkv")), `${r.e?.title} · ${(r.e?.detail ?? []).join(" / ")} · ${Date.now() - t0} ms · ขนาด ${(statSync(big).size / 1e9).toFixed(2)} GB`);
}

// =====================================================================  ⑥ หน้าจอ ทุกสถานะในสเปกข้อ 7
await inv("set_settings", { patch: { outputFormat: "mkv", originalAfter: "keep" } });
await inv("poster_clear");
await c.evaluate("location.reload()"); await sleep(1500); await waitScan();
await c.evaluate(`[...document.querySelectorAll('[data-navbar] button')].find(b => b.innerText.includes('ใส่โปสเตอร์')).click()`); await sleep(500);
const page = () => q(`return { blocked: document.querySelector('[data-blocked]')?.innerText ?? '', start: document.querySelector('[data-start]')?.innerText, startWait: document.querySelector('[data-start]')?.classList.contains('btn-wait'),
  movie: document.querySelector('[data-card=movie]')?.innerText ?? '', poster: document.querySelector('[data-card=poster]')?.innerText ?? '', result: document.querySelector('[data-card=result]')?.innerText ?? '',
  run: document.querySelector('[data-run]')?.innerText ?? '', crop: !!document.querySelector('[data-crop]') }`);
let s = await page();
await shot("01-ยังไม่มีอะไร.png", ".main");
check("ยังไม่ได้ใส่อะไร ปุ่มกดไม่ได้ บอกว่าขาดไฟล์หนัง", s.startWait && s.blocked === "ยังกดไม่ได้ ใส่ไฟล์หนังก่อน", s.blocked);

const drop = (path, zone) => c.evaluate(`(() => { const r = document.querySelector('[data-drop=${zone}]').getBoundingClientRect(); window.__posterDrop([${JSON.stringify(path)}], (r.left + 20) * devicePixelRatio, (r.top + 20) * devicePixelRatio); })()`);
await drop(join(DIR, "หนังเก่า.wmv"), "movie"); await sleep(400);
s = await page();
await shot("02-วางผิดชนิด.png", "[data-card=movie]", 8);
await sleep(1500);
const still = (await page()).movie.includes("ไฟล์ .wmv ใช้ไม่ได้");
check("วางไฟล์ผิดชนิด ช่องแดง ไฟล์ .wmv ใช้ไม่ได้ ค้างไว้จนกว่าจะวางใหม่", s.movie.includes("ไฟล์ .wmv ใช้ไม่ได้") && still && (await q("return !!document.querySelector('[data-drop=movie].bad')")));

await c.evaluate("window.__posterOver('poster')"); await sleep(200);
await shot("03-ลากค้างเหนือช่อง.png", "[data-card=poster]", 8);
check("ลากไฟล์ค้างเหนือช่อง ช่องเป็นสีชมพู ปล่อยเมาส์เพื่อใส่รูปนี้", (await page()).poster.includes("ปล่อยเมาส์เพื่อใส่รูปนี้") && (await q("return !!document.querySelector('[data-drop=poster].over')")));
await c.evaluate("window.__posterOver(null)");

const orchard = join(DIR, "ไฟล์เดิม", "The Last Orchard (2022).mp4");
await drop(orchard, "movie"); await sleep(1200);
s = await page();
await shot("04-ใส่ไฟล์หนังแล้ว ยังไม่มีรูป.png", ".main");
check("ใส่ไฟล์หนังแล้ว การ์ด 1 บอกชื่อ ขนาด ความยาว ความละเอียด · ยังไม่มีรูป ปุ่มบอก ใส่รูปโปสเตอร์ก่อน", s.movie.includes("The Last Orchard (2022).mp4") && s.movie.includes("1280 × 720") && s.blocked === "ยังกดไม่ได้ ใส่รูปโปสเตอร์ก่อน", s.blocked);

// วางรูปแนวนอน · หน้าต่างครอปขึ้นเอง
await drop(join(IMG, "wide.jpg"), "poster"); await sleep(1500);
const dlg = () => q(`const d = document.querySelector('[data-crop]'); if (!d) return null; const b = d.querySelector('.cropbox');
  return { head: d.closest('.dlg').querySelector('h4').innerText, size: d.querySelector('[data-size]')?.innerText ?? '', box: b ? [b.offsetLeft, b.offsetTop, b.offsetWidth, b.offsetHeight] : null,
    small: d.querySelector('[data-small]')?.innerText ?? '', table: [...d.querySelectorAll('[data-qtable] tbody tr')].map((r) => r.innerText.split('\\t')[1]), previews: [...d.querySelectorAll('[data-previews] .pv')].map((v) => getComputedStyle(v).backgroundColor) }`);
await sleep(600);
let d = await dlg();
await shot("05-หน้าต่างครอป.png", ".dlg");
check("วางรูปแล้วหน้าต่างครอปขึ้นเอง บอกชื่อรูป ขนาด ภาพแนวนอน 16 : 9 · กรอบ 2 : 3 อยู่กลางภาพ", s && d && d.head.includes("wide.jpg") && d.head.includes("1920 × 1080") && d.head.includes("ภาพแนวนอน 16 : 9") && Math.abs(d.box[2] / d.box[3] - 2 / 3) < 0.02 && Math.abs(d.box[0] + d.box[2] / 2 - 260) < 3, JSON.stringify(d?.box));
check("บอกขนาดรูปที่ได้ 1000 × 1500 px กับขนาดไฟล์จริง · ตารางคุณภาพ 100 90 75 50 ยิ่งต่ำยิ่งเล็ก", d.size.includes("1000 × 1500 px") && d.table.length === 4, d.size.split("\n")[0] + " · " + d.table.join(" "));

// ลากกรอบ ลากมุม ล้อเมาส์ แถบซูม
const bx = await c.box("[data-crop] .cropbox");
await c.send("Input.dispatchMouseEvent", { type: "mousePressed", x: bx.x, y: bx.y, button: "left", clickCount: 1 });
await c.send("Input.dispatchMouseEvent", { type: "mouseMoved", x: bx.x + 80, y: bx.y, button: "left", buttons: 1 });
await c.send("Input.dispatchMouseEvent", { type: "mouseReleased", x: bx.x + 80, y: bx.y, button: "left", clickCount: 1 });
await sleep(200);
const afterMove = (await dlg()).box;
const hd = await c.box("[data-crop] .hd.se");
await c.send("Input.dispatchMouseEvent", { type: "mousePressed", x: hd.x, y: hd.y, button: "left", clickCount: 1 });
await c.send("Input.dispatchMouseEvent", { type: "mouseMoved", x: hd.x - 40, y: hd.y - 60, button: "left", buttons: 1 });
await c.send("Input.dispatchMouseEvent", { type: "mouseReleased", x: hd.x - 40, y: hd.y - 60, button: "left", clickCount: 1 });
await sleep(200);
const afterCorner = (await dlg()).box;
await c.send("Input.dispatchMouseEvent", { type: "mouseWheel", x: bx.x, y: bx.y, deltaX: 0, deltaY: -120 });
await sleep(200);
const afterWheel = (await dlg()).box;
const zoomTxt = await q("return [...document.querySelectorAll('[data-crop] .small')].map(e => e.innerText).find(t => /^\\d+%$/.test(t))");
check("ลากกรอบแล้วกรอบเลื่อน ลากมุมแล้วกรอบย่อ ยังล็อก 2 : 3 · หมุนล้อเมาส์แล้วซูม", afterMove[0] > d.box[0] + 60 && afterCorner[2] < afterMove[2] && Math.abs(afterCorner[2] / afterCorner[3] - 2 / 3) < 0.02 && afterWheel[2] < afterCorner[2], `${d.box} → ${afterMove} → ${afterCorner} → ${afterWheel} · ซูม ${zoomTxt}`);

// หมุน พลิก กลับเป็นแบบเดิม
await c.evaluate("[...document.querySelectorAll('[data-crop] button')].find(b => b.innerText === 'หมุนขวา').click()"); await sleep(300);
const rot = await q("return document.querySelector('[data-crop] .stage img').style.transform");
await c.evaluate("[...document.querySelectorAll('[data-crop] button')].find(b => b.innerText === 'พลิกซ้ายขวา').click()"); await sleep(300);
const flip = await q("return document.querySelector('[data-crop] .stage img').style.transform");
await shot("06-หมุนขวาและพลิก.png", ".dlg");
await c.evaluate("[...document.querySelectorAll('[data-crop] button')].find(b => b.innerText === 'กลับเป็นแบบเดิม').click()"); await sleep(400);
const reset = await dlg();
check("หมุนขวา พลิกซ้ายขวา แล้วกดกลับเป็นแบบเดิม กรอบกลับมาอยู่กลางซูม 100%", rot.includes("rotate(90deg)") && flip.includes("scaleX(-1)") && JSON.stringify(reset.box) === JSON.stringify(d.box), `${rot} → ${flip}`);

// เติมขอบ สีดำ
await c.evaluate("[...document.querySelectorAll('[data-crop] .seg button')].find(b => b.innerText === 'เติมขอบ').click()"); await sleep(250);
await c.evaluate("document.querySelector('[data-pads] [aria-label=\"สีขอบ ดำ\"]').click()"); await sleep(700);
const padv = await dlg();
await shot("07-เติมขอบสีดำ.png", ".dlg");
check("เลือกเติมขอบ มีปุ่มสีขอบ 3 สี เลือกดำแล้วตัวอย่างเป็นขอบดำ", padv.previews.every((b) => b === "rgb(0, 0, 0)") && !padv.box, padv.previews.join(" "));
await c.evaluate("[...document.querySelectorAll('[data-crop] .seg button')].find(b => b.innerText === 'ตัดให้พอดี 2 : 3').click()"); await sleep(250);

// PNG แล้วกลับเป็น JPG คุณภาพ 50
await c.evaluate("[...document.querySelectorAll('[data-crop] .seg button')].find(b => b.innerText === 'PNG').click()"); await sleep(900);
const pngv = await q("return document.querySelector('[data-crop]').innerText");
await shot("08-PNG.png", ".dlg");
check("เลือก PNG บอกว่าไม่ลดคุณภาพ ไฟล์ใหญ่กว่า JPG กี่เท่า ไม่มีแถบปรับคุณภาพ", pngv.includes("PNG ไม่ลดคุณภาพ") && /ใหญ่กว่า JPG ราว \d+ เท่า/.test(pngv) && !pngv.includes("คุณภาพ JPG"));
await c.evaluate("[...document.querySelectorAll('[data-crop] .seg button')].find(b => b.innerText === 'JPG').click()"); await sleep(900);
const kb90 = (await dlg()).size;
await c.evaluate("document.querySelector('[data-crop] [aria-label=\"คุณภาพ JPG\"]').focus()");
await c.key("Home"); await sleep(900);
const kb50 = (await dlg()).size;
const num = (t) => { const m = t.match(/ราว ([\d.]+) (KB|MB)/); return m ? Number(m[1]) * (m[2] === "MB" ? 1024 : 1) : NaN; };
await shot("09-คุณภาพ50.png", ".dlg");
check("เลื่อนคุณภาพ JPG ลงเหลือ 50% ขนาดไฟล์ที่บอกเล็กลงทันที", num(kb50) < num(kb90), `${kb90.split("\n")[0]} → ${kb50.split("\n")[0]}`);
await c.key("End"); await c.key("ArrowLeft"); await c.key("ArrowLeft"); await sleep(600);

// ใช้รูปนี้
await c.evaluate("document.querySelector('[data-use]').click()"); await sleep(1200);
s = await page();
await shot("10-ใส่รูปแล้ว.png", ".main");
check("กดใช้รูปนี้ การ์ด 2 ขึ้นรูปที่จะแนบ 1000 × 1500 · บอกว่ารูปไม่ใช่ 2 : 3 · การ์ด 3 ขึ้นชื่อไฟล์ใหม่ · ปุ่มกดได้", !s.crop && s.poster.includes("1000 × 1500 px") && s.poster.includes("ภาพแนวนอน 16 : 9") && s.result.includes("The Last Orchard (2022).mkv") && !s.startWait && s.start === "ครอบเป็น MKV พร้อมโปสเตอร์", s.start);

// รูปเล็กเกิน
await drop(join(IMG, "small.jpg"), "poster"); await sleep(1800);
d = await dlg();
await shot("11-รูปเล็กเกิน.png", ".dlg");
check("รูปเล็กเกิน บอกขนาดส่วนที่ครอปจริง ปกจะดูเบลอ ปุ่มใช้ต่อ เปลี่ยนรูป", d.small.includes("ส่วนที่ครอปเหลือแค่ 300 × 450 px") && d.small.includes("ใช้ต่อ") && d.small.includes("เปลี่ยนรูป"), d.small.split("\n")[0]);
await c.evaluate("[...document.querySelectorAll('[data-small] button')].find(b => b.innerText === 'ใช้ต่อ').click()"); await sleep(200);
check("กดใช้ต่อ คำเตือนรูปเล็กหาย", !(await dlg()).small);
await c.evaluate("[...document.querySelectorAll('.dlg button')].find(b => b.innerText === 'ยกเลิก').click()"); await sleep(300);

// HEIC ของพี่กัน
const heic = join(IMG, "IMG_4149.HEIC");
if (existsSync(heic)) {
  await drop(heic, "poster");
  for (let i = 0; i < 60 && !(await dlg()); i++) await sleep(250);
  for (let i = 0; i < 60 && !(await dlg())?.size.startsWith("ได้รูปขนาด"); i++) await sleep(250);
  await sleep(300);
  d = await dlg();
  const txt = await q("return document.querySelector('[data-crop]')?.innerText ?? ''");
  await shot("12-HEIC.png", ".dlg");
  check("รูป HEIC จากไอโฟน ได้ความละเอียดเต็ม 5712 × 4284 แปลงเป็น JPG ให้ก่อนแนบ", d && d.head.includes("5712 × 4284") && txt.includes(".heic→.jpg") && txt.includes("โปรแกรมแปลงเป็น JPG ให้"), d?.head.split("\n").join(" "));
  await c.evaluate("[...document.querySelectorAll('.dlg button')].find(b => b.innerText === 'ยกเลิก').click()"); await sleep(300);
}

// ส่งออก MP4 มีซับที่ต้องเตือน (ดาวเหนือที่ย้ายไปไฟล์เดิมแล้ว)
await drop(join(DIR, "ไฟล์เดิม", "ดาวเหนือ (2023).mkv"), "movie"); await sleep(1200);
await c.evaluate("[...document.querySelectorAll('.seg button')].find(b => b.innerText === 'MP4').click()"); await sleep(400);
const warn = await q("return document.querySelector('[data-mp4warn]')?.innerText ?? ''");
await shot("13-MP4มีซับที่ต้องเตือน.png", ".main");
check("เลือก MP4 แต่มีซับ ASS ขึ้นการ์ดเตือนพร้อมปุ่ม กลับไปใช้ MKV · ปุ่มเริ่มกดไม่ได้จนกว่าจะเลือก", warn.includes("ซับภาษาอังกฤษ 1 อันจะเสียสีกับฟอนต์ใน MP4") && warn.includes("กลับไปใช้ MKV") && (await page()).startWait, warn.split("\n")[0]);
await c.evaluate("[...document.querySelectorAll('[data-mp4warn] button')].find(b => b.innerText === 'กลับไปใช้ MKV').click()"); await sleep(300);
check("กดกลับไปใช้ MKV การ์ดเตือนหาย ไฟล์ที่ได้เป็น MKV", !(await q("return !!document.querySelector('[data-mp4warn]')")) && (await q("return [...document.querySelectorAll('.seg button.on')].some(b => b.innerText.startsWith('MKV'))")));

// ครอบจริงผ่านปุ่ม · กำลังทำ → เสร็จ (ไฟล์ The Last Orchard ที่อยู่ไฟล์เดิม คัดลอกกลับมาครอบใหม่)
const orchardBack = join(DIR, "สวนผลไม้ (2022).mp4");
copyFileSync(orchard, orchardBack);
await inv("scan_library"); await waitScan();
await drop(orchardBack, "movie"); await sleep(1200);
await drop(join(IMG, "poster.jpg"), "poster"); await sleep(1500);
await c.evaluate("document.querySelector('[data-use]').click()"); await sleep(1200);
await c.evaluate("document.querySelector('[data-start]').click()");
let sawWorking = false;
for (let i = 0; i < 100; i++) { const r = await q("return document.querySelector('[data-run]')?.dataset.run"); if (r === "working") { sawWorking = true; } if (r === "done" || r === "failed") break; await sleep(60); }
await sleep(800);
s = await page();
const runVisible = await q("const r = document.querySelector('[data-run]').getBoundingClientRect(); return r.top >= 0 && r.bottom <= innerHeight - 8");
await shot("14-ครอบเสร็จ.png");
check("ครอบเสร็จแล้วการ์ดผลอยู่ในจอเอง ไม่ต้องเลื่อนหา", runVisible);
check("กดครอบแล้วขึ้นกำลังทำ แล้วจบด้วย ครอบเสร็จ ไฟล์ใหม่ตรวจผ่าน ภาพ เสียง ซับ ครบเท่าต้นทาง ไฟล์เดิมย้ายไปที่โฟลเดอร์ไฟล์เดิม", sawWorking && s.run.includes("ครอบเสร็จ ไฟล์ใหม่ตรวจผ่าน") && s.run.includes("ภาพ 1 · เสียง 1 · ซับ 1") && s.run.includes("ครบเท่าต้นทาง") && s.run.includes("ไฟล์เดิมย้ายไปที่ " + DIR + "\\ไฟล์เดิม"), s.run.split("\n").join(" / "));
// ครอบเสร็จ ช่องไฟล์หนังว่าง รูปยังอยู่ · การ์ดหน้าตาที่จะได้ต้องบอกเฉพาะของที่ขาด ไม่บอกให้ใส่รูปซ้ำ
check("ครอบเสร็จแล้ว การ์ดหน้าตาที่จะได้บอก ใส่ไฟล์หนังก่อน ไม่บอกให้ใส่รูปที่ใส่แล้ว", s.result.includes("ใส่ไฟล์หนังก่อน") && !s.result.includes("กับรูปโปสเตอร์"), s.result.split("\n").join(" / "));

// ลบไฟล์เดิม ยืนยัน 2 ขั้น · ไม่กดยืนยันจริง (กดยกเลิก) ไม่ให้ไฟล์ทดสอบไปกองในถังขยะของพี่กัน
await drop(join(DIR, "ไฟล์เดิม", "บ้านริมคลอง (2017).ts"), "movie"); await sleep(1200);
await drop(join(IMG, "poster.jpg"), "poster"); await sleep(1500);
await c.evaluate("document.querySelector('[data-use]').click()"); await sleep(1000);
await c.evaluate("[...document.querySelectorAll('.chk')].find(e => e.innerText.startsWith('ลบไฟล์เดิมหลังตรวจ')).click()"); await sleep(300);
await c.evaluate("document.querySelector('[data-start]').click()"); await sleep(400);
const step1 = await q("return document.querySelector('.dlg h4')?.innerText ?? ''");
await shot("15-ลบไฟล์เดิมขั้นที่1.png", ".dlg");
await c.evaluate("[...document.querySelectorAll('.dlg button')].find(b => b.innerText === 'ถัดไป').click()"); await sleep(300);
const step2 = await q("return { h: document.querySelector('.dlg h4')?.innerText ?? '', first: document.querySelector('.dlg .acts button')?.innerText, focus: document.activeElement?.innerText }");
await shot("16-ลบไฟล์เดิมขั้นที่2.png", ".dlg");
check("เลือกลบไฟล์เดิมแล้วกดเริ่ม ถามยืนยัน 2 ขั้น ขั้นที่ 2 ปุ่มยืนยันลบอยู่ซ้าย โฟกัสแรกอยู่ที่ย้อนกลับ", step1 === "ลบไฟล์เดิมหลังตรวจผ่าน · ขั้นที่ 1 จาก 2" && step2.h === "ยืนยันอีกครั้ง · ขั้นที่ 2 จาก 2" && step2.first === "ยืนยันลบ" && step2.focus === "ย้อนกลับ", JSON.stringify(step2));
await c.evaluate("[...document.querySelectorAll('.dlg button')].find(b => b.innerText === 'ย้อนกลับ').click()"); await sleep(200);
await c.evaluate("[...document.querySelectorAll('.dlg button')].find(b => b.innerText === 'ยกเลิก').click()"); await sleep(200);
check("กดยกเลิกในหน้าต่างยืนยัน ไม่เริ่มงาน ไฟล์ไม่ถูกแตะ", !(await q("return !!document.querySelector('.dlg')")) && (await page()).run === "" && existsSync(join(DIR, "ไฟล์เดิม", "บ้านริมคลอง (2017).ts")));
await c.evaluate("[...document.querySelectorAll('.chk')].find(e => e.innerText.startsWith('เก็บไฟล์เดิมไว้')).click()"); await sleep(200);

// หน้าต่างยืนยันหยุด · เริ่มครอบไฟล์ใหญ่แล้วกดหยุด
const big2 = join(DIR, "หนังยาว (2020).mp4");
// ปิดตรวจต้นทางด้วยการกดช่องติ๊กบนจอ (ตั้งผ่านคำสั่งตรง หน้าจอไม่รู้)
await drop(big2, "movie"); await sleep(1200);
await c.evaluate("[...document.querySelectorAll('.chk')].find(e => e.innerText.startsWith('ตรวจไฟล์ต้นทางก่อนครอบ')).click()"); await sleep(300);
await c.evaluate("document.querySelector('[data-start]').click()");
for (let i = 0; i < 100; i++) { if ((await q("return document.querySelector('[data-run=working] .bar i')?.style.width ?? ''")) !== "0%" && (await q("return !!document.querySelector('[data-run=working]')"))) break; await sleep(50); }
await sleep(400);
await shot("17-กำลังครอบ.png", "[data-run]", 8);
const prog = await q("return document.querySelector('[data-run]')?.innerText ?? ''");
await c.evaluate("[...document.querySelectorAll('[data-run] button')].find(b => b.innerText === 'หยุด').click()"); await sleep(300);
const ask = await q("return document.querySelector('.dlg')?.innerText ?? ''");
await shot("18-ยืนยันหยุด.png", ".dlg");
await c.evaluate("[...document.querySelectorAll('.dlg button')].find(b => b.innerText === 'หยุด').click()");
for (let i = 0; i < 100; i++) { if ((await q("return document.querySelector('[data-run]')?.dataset.run")) !== "working") break; await sleep(100); }
await sleep(300);
const stopped = (await page()).run;
await shot("19-หยุดแล้ว.png", ".main");
check("กำลังครอบบอกเปอร์เซ็นต์ เวลาที่เหลือ ขั้นถัดไป ปุ่มหยุด · กดหยุดแล้วถามก่อน · หยุดแล้วบอกไฟล์ที่ทำค้างถูกลบ ไฟล์เดิมไม่ถูกแตะ",
  /กำลังครอบเป็น MKV/.test(prog) && /\d+%/.test(prog) && prog.includes("ขั้นถัดไป ตรวจไฟล์ใหม่") && ask.includes("ยืนยันหยุดครอบไฟล์") && ask.includes("จะถูกลบทิ้ง") && stopped.includes("หยุดแล้ว") && stopped.includes("ไฟล์ใหม่ที่ทำค้างถูกลบแล้ว") && partials().length === 0,
  prog.split("\n").join(" / "));
await c.evaluate("[...document.querySelectorAll('.chk')].find(e => e.innerText.startsWith('ตรวจไฟล์ต้นทางก่อนครอบ')).click()"); await sleep(300);

// ไม่สำเร็จ · ที่ว่างไม่พอ ผ่านหน้าจอ
await inv("dev_fake_free", { bytes: 10 * 1024 * 1024 });
await c.evaluate("[...document.querySelectorAll('[data-run] button')].find(b => b.innerText === 'ลองใหม่').click()");
for (let i = 0; i < 100; i++) { if ((await q("return document.querySelector('[data-run]')?.dataset.run")) === "failed") break; await sleep(100); }
await sleep(300);
const nospace = (await page()).run;
await shot("20-ที่ว่างไม่พอ.png", "[data-run]", 8);
await inv("dev_fake_free", { bytes: 0 });
check("ทำไม่สำเร็จ พื้นที่ในไดรฟ์ D ไม่พอ ต้องการเท่าไหร่ เหลือเท่าไหร่ ไฟล์เดิมไม่ถูกแตะ ปุ่มลองใหม่", nospace.includes("พื้นที่ในไดรฟ์ D ไม่พอ") && /ต้องการ .+ แต่เหลือ 10 MB/.test(nospace) && nospace.includes("ไม่ถูกแตะ") && nospace.includes("ลองใหม่"), nospace.split("\n").join(" / "));
// ระหว่างการ์ดแดงค้าง เปลี่ยนเป็นลบไฟล์เดิม แล้วกดลองใหม่ ต้องถามยืนยัน 2 ขั้นเหมือนปุ่มเริ่ม (ผู้ช่วยตรวจโค้ดข้อ 4 · เดิมเริ่มเลยไม่ถาม)
await c.evaluate("[...document.querySelectorAll('.chk')].find(e => e.innerText.startsWith('ลบไฟล์เดิมหลังตรวจ')).click()"); await sleep(300);
await c.evaluate("[...document.querySelectorAll('[data-run] button')].find(b => b.innerText === 'ลองใหม่').click()"); await sleep(400);
const retryAsk = await q("return document.querySelector('.dlg h4')?.innerText ?? ''");
const retryRun = await q("return document.querySelector('[data-run]')?.dataset.run");
await c.evaluate("[...document.querySelectorAll('.dlg button')].find(b => b.innerText === 'ยกเลิก')?.click()"); await sleep(200);
await c.evaluate("[...document.querySelectorAll('.chk')].find(e => e.innerText.startsWith('เก็บไฟล์เดิมไว้')).click()"); await sleep(200);
check("ตั้งลบไฟล์เดิมระหว่างการ์ดแดงค้าง แล้วกดลองใหม่ ถามยืนยันขั้นที่ 1 ก่อน ยังไม่เริ่มงาน", retryAsk === "ลบไฟล์เดิมหลังตรวจผ่าน · ขั้นที่ 1 จาก 2" && retryRun === "failed", `${retryAsk} · ${retryRun}`);

// มาจากปุ่มเปลี่ยนโปสเตอร์บนชั้นวาง · MKV ที่มีปกแล้ว
await c.evaluate(`[...document.querySelectorAll('[data-navbar] button')].find(b => b.innerText.includes('ชั้นวางหนัง')).click()`); await sleep(500);
await c.book("Harbor Lights (2021)"); await sleep(300);
await c.evaluate("[...document.querySelectorAll('.detail .btn')].find(b => b.innerText === 'เปลี่ยนโปสเตอร์').click()"); await sleep(1500);
s = await page();
check("กดเปลี่ยนโปสเตอร์บนชั้นวาง ไปหน้าใส่โปสเตอร์พร้อมไฟล์หนังเรื่องนั้น", s.movie.includes("Harbor Lights (2021).mkv"), s.movie.split("\n")[1]);
await drop(join(IMG, "poster.png"), "poster"); await sleep(1500);
await c.evaluate("document.querySelector('[data-use]').click()"); await sleep(1200);
s = await page();
await shot("21-เปลี่ยนโปสเตอร์MKV.png", ".main");
check("ไฟล์เป็น MKV อยู่แล้ว ขึ้นปกเดิม ปกใหม่ เปลี่ยนแค่รูปแนบ ไม่ต้องครอบใหม่ · ปุ่มเปลี่ยนโปสเตอร์ · ตัวเลือกไฟล์เดิมกดไม่ได้", s.result.includes("ปกเดิม") && s.result.includes("ปกใหม่") && s.result.includes("เปลี่ยนแค่รูปแนบ ไม่ต้องครอบใหม่") && s.start === "เปลี่ยนโปสเตอร์" && (await q("return [...document.querySelectorAll('.chk.off')].length")) === 2, s.start);

// รายการรูปในโฟลเดอร์หนัง
await c.evaluate("[...document.querySelectorAll('[data-card=poster] button')].find(b => b.innerText === 'เปลี่ยนรูป').click()");
for (let i = 0; i < 60; i++) { if ((await q("return document.querySelectorAll('[data-folder-images] .imgrow').length")) > 0) break; await sleep(200); }
await sleep(300);
const rows = await q("return [...document.querySelectorAll('[data-folder-images] .imgrow')].map(r => r.innerText.replace(/\\n/g, ' '))");
await shot("22-รูปในโฟลเดอร์หนัง.png", ".dlg");
check("รายการรูปในโฟลเดอร์หนัง ภาพเล็ก ชื่อ ขนาด ป้ายนามสกุล · .jpg แนบได้เลย · .webp→.jpg", rows.some((r) => r.includes("poster.jpg") && r.includes(".jpg แนบได้เลย")) && rows.some((r) => r.includes("poster.webp") && r.includes(".webp→.jpg")), rows.join(" | "));
await c.key("Escape"); await sleep(200);

// รูปเดิมในเครื่องไม่ถูกแก้
const imgAfter = Object.fromEntries(readdirSync(IMG).map((f) => [f, sha(join(IMG, f))]));
check("รูปต้นฉบับทุกรูปใน test-media hash เท่าเดิม ไม่ถูกแก้", JSON.stringify(imgAfter) === JSON.stringify(imgBefore), `${Object.keys(imgAfter).length} รูป`);
check("ไม่มีไฟล์ชั่วคราว .partial ค้างในโฟลเดอร์ทดสอบ", partials().length === 0);

writeFileSync(`${OUT}/ผลเทส.json`, JSON.stringify(results, null, 2) + "\n");
const failed = results.filter((x) => !x.pass);
console.log(`\nผ่าน ${results.length - failed.length} จาก ${results.length}`);
c.close();
process.exit(failed.length ? 1 : 0);
