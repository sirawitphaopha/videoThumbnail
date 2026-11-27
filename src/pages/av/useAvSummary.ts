/* สรุปก่อนเริ่ม จำนวนแทร็ก มีของเปลี่ยนไหม ขนาดที่คาด ฟอนต์ที่ฝัง และเหตุผลที่ปุ่มรวมกดไม่ได้
   แยกจาก AvPage.tsx ตอนจัดโครงไฟล์ตามความหมาย (BUGS ข้อ 155 ขั้น 2) เนื้อโค้ดยกมาทั้งก้อน */
import { type FontHit } from "../../lib/api";
import { type AvTrack } from "../../lib/avJob";
import { spaceShort, useFree } from "../../lib/drives";
import { baseName } from "./parts";
import type { C1 } from "./avCtx";

export function useAvSummary(c: C1) {
  const { av, covers, movie, output, tracks } = c;
  // ---------- สรุปก่อนเริ่ม ----------
  const kept = tracks.filter((t) => t.keep);
  const counts = { video: kept.filter((t) => t.kind === "video").length, audio: kept.filter((t) => t.kind === "audio").length, subs: kept.filter((t) => t.kind === "subtitle").length, out: tracks.filter((t) => !t.keep).length };
  const coverChanged = covers.cover.mode !== "keep" || covers.cover_land.mode !== "keep";
  const movieOrder = tracks.filter((t) => t.inMovie).map((t) => t.tid).join(",");
  const origOrder = movie?.tracks.map((t) => t.tid).join(",") ?? "";
  const changed = !!movie && (
    tracks.some((t) => !t.inMovie) || tracks.some((t) => t.lang !== t.base.lang || t.name !== t.base.name || t.default !== t.base.default || t.delay !== t.base.delay || t.keep !== t.base.keep)
    || tracks.some((t) => t.keep && !!t.convert) || movieOrder !== origOrder || coverChanged || output !== movie.ext.replace("m4v", "mp4") && !(output === "mkv" && movie.ext === "mkv")
    || av.chapters != null); // แก้บทแล้วก็นับว่ามีของเปลี่ยน รวมได้ (BUGS ข้อ 99)
  // แทร็กที่ตั้งแปลง ใส่ MP4 ได้ไหมดูชนิดหลังแปลง (WavPack ใส่ไม่ได้) · แทร็กในหนังแบบเพิ่มคู่ แทร็กเดิมยังอยู่ ต้องใส่ได้ด้วย
  // กติกาเดียวกับฝั่ง Rust (merge.rs mp4_unfit · ผู้ช่วยตรวจขั้น 10 ข้อ 2 · เดิมแบบเพิ่มคู่ไม่เตือน แบบแทนที่ฝั่ง Rust ปฏิเสธ)
  const mp4Of = (t: AvTrack) => {
    if (!t.convert) return t.ff == null ? "no" : t.mp4;
    if (t.inMovie && (t.pair ?? true) && (t.mp4 === "no" || t.ff == null)) return "no";
    return t.convert.codec === "wv" ? "no" : "ok";
  };
  const mp4Bad = output === "mp4" ? kept.filter((t) => mp4Of(t) === "no") : [];
  const mp4Style = output === "mp4" ? kept.filter((t) => t.mp4 === "style") : [];
  const vtts = output === "mkv" ? kept.filter((t) => !t.inMovie && t.codec === "webvtt") : [];
  const longer = kept.filter((t) => !t.inMovie && t.kind === "audio" && t.longerBy != null && Math.abs(t.longerBy) >= 2);
  const removedBytes = tracks.filter((t) => !t.keep && t.inMovie).reduce((s, t) => s + (t.bytes ?? 0), 0);
  const addedFiles = [...new Set(kept.filter((t) => !t.inMovie).map((t) => t.src))];
  const addedBytes = addedFiles.reduce((s, src) => s + (src ? 0 : 0), 0);
  const estimate = movie ? movie.size - removedBytes + addedBytes + kept.filter((t) => !t.inMovie).reduce((s, t) => s + (t.bytes ?? (t.bitrate && t.duration ? t.bitrate / 8 * t.duration : 0)), 0) : 0;
  // ฟอนต์ของซับ ASS ที่เพิ่ม (fonts.rs) · ชื่อไม่ซ้ำ · ฟอนต์ที่หาไม่เจอใช้ไฟล์ที่ลากมาเพิ่มเองถ้าชื่อในไฟล์ตรง · ไฟล์แนบชื่อเดียวกันในหนังแล้วไม่ฝังซ้ำ
  const fontRows: (FontHit & { inMovie: boolean; on: boolean })[] = (() => {
    const rows: FontHit[] = [];
    for (const t of kept) for (const h of t.fonts ?? []) if (!rows.some((r) => r.name.toLowerCase() === h.name.toLowerCase())) rows.push(h);
    const extra = [...av.fontExtra];
    const filled: FontHit[] = rows.map((r) => {
      if (r.file) return r;
      const i = extra.findIndex((e) => e.names.some((n) => n.toLowerCase() === r.name.toLowerCase()));
      if (i < 0) return r;
      const e = extra.splice(i, 1)[0];
      return { ...r, file: e.path, from: "added", size: e.size };
    });
    // ไฟล์ที่ลากมาแต่ซับไม่ได้เรียกชื่อตรง (เช่นชื่อในซับสะกดต่างไป) ยังฝังได้
    for (const e of extra) if (!filled.some((r) => r.file === e.path)) filled.push({ name: e.names[0], file: e.path, from: "added", size: e.size });
    return filled.map((r) => {
      const inMovie = !!r.file && !!movie?.attachments.some((a) => a.name.toLowerCase() === baseName(r.file!).toLowerCase());
      return { ...r, inMovie, on: !!r.file && !inMovie && !av.fontOff.includes(r.file) };
    });
  })();
  const fontFiles = [...new Set(fontRows.filter((r) => r.on).map((r) => r.file!))];
  const fontBytes = fontFiles.reduce((s, f) => s + (fontRows.find((r) => r.file === f)?.size ?? 0), 0);
  // ไฟล์ใหม่เขียนในโฟลเดอร์ของหนัง · สูตรเดียวกับที่ merge.rs เช็กตอนเริ่ม ขนาดหนังเต็ม บวกไฟล์ที่เพิ่ม บวกฟอนต์ บวกเผื่อ 64 MB ไม่พอขึ้นเตือนข้างปุ่มก่อนกด (BUGS ข้อ 94)
  const mergeFree = useFree(movie?.path);
  const mergeShort = movie ? spaceShort(mergeFree, estimate + removedBytes + fontBytes + 64 * 1024 * 1024) : null;
  const blocked = !movie ? "ยังกดไม่ได้ ใส่ไฟล์หนังก่อน"
    : !kept.some((t) => t.kind === "video") ? "ไฟล์ใหม่ต้องมีภาพ เอาแทร็กภาพกลับมาก่อน"
    : mp4Bad.length ? "เลือกก่อนว่าจะเอาแทร็กที่ใส่ใน MP4 ไม่ได้ออก หรือกลับไปใช้ MKV"
    : mergeShort;
  // ไม่ได้เปลี่ยนอะไรก็รวมได้ ได้ไฟล์ใหม่ที่ทำด้วย mkvmerge ทั้งไฟล์ · บรรทัดสรุปบอกว่าแทร็กเหมือนไฟล์เดิม
  // เดิมปุ่มรวมกดไม่ได้ (พี่กันทัก 15 พ.ย. 2569 "เราเเค่อยากรวมใไม่ มันต้อทำได้สิ")
  // ฟอนต์ที่ลากมาฝังอย่างเดียวก็นับว่ามีของเปลี่ยน แถบสรุปไม่บอกว่าเหมือนไฟล์เดิม (AUDIT ข้อ 79)
  const fontOnly = !changed && fontFiles.length > 0;
  return { kept, counts, coverChanged, movieOrder, origOrder, changed, fontOnly, mp4Of, mp4Bad, mp4Style, vtts, longer, removedBytes, addedFiles, addedBytes, estimate, fontRows, fontFiles, fontBytes, mergeFree, mergeShort, blocked };
}
