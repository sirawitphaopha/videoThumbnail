/* ใส่ซับที่แก้กลับเข้าหนัง (แผนหน้าแก้ซับ ขั้น 9 · BUGS ข้อ 109)
   ใช้งานรวมไฟล์เดิมของหน้าเสียงและซับทั้งก้อน (merge.rs merge_apply) ไม่เขียนตัวรวมใหม่
     ① เขียนซับที่แก้ลงไฟล์ชั่วคราวในโฟลเดอร์ tmp ของโปรแกรม (subdoc_temp ชื่อขึ้นต้น sub- โปรแกรมกวาดทิ้งเองตอนเปิด)
     ② อ่านแทร็กของหนัง (merge_inspect) แทนแทร็กซับนั้นด้วยแทร็กจากไฟล์ชั่วคราว ภาษา ชื่อ ธงหลัก ธงบังคับ ดีเลย์ ลำดับ เหมือนเดิม แทร็กอื่นเหมือนเดิม
     ③ รวมไฟล์ (ตรวจไฟล์ใหม่ก่อนเปลี่ยนชื่อจริงตามงานรวมไฟล์เดิม) ไฟล์เดิมไปตามค่าตั้งของโปรแกรม เก็บไว้หรือลงถังขยะ
     ④ อ่านซับจากไฟล์ใหม่กลับมาเทียบกับที่แก้ทีละบรรทัดซับ
   หนัง MP4 ใส่ซับ ASS ไม่ได้ ไฟล์ใหม่เป็น MKV (บอกก่อนกด) · ซับ SRT ใส่ MP4 ได้แบบ mov_text */
import { mergeApi, subDocApi, type MergeResult, type MergeTrack, type SubDoc, type SubEvent } from "./api";

export type RemuxPlan = { output: "mkv" | "mp4"; ext: string; track: MergeTrack | null; why: string | null };
export type RemuxDone = MergeResult & { same: boolean | null };

/** ช่องที่เทียบตอนอ่านซับกลับจากไฟล์ใหม่ · mkvextract สร้างหัวไฟล์ใหม่ ข้อความทั้งไฟล์จึงไม่ตรงทุกไบต์ เทียบทีละบรรทัดซับแทน */
const lineKey = (e: SubEvent) => [e.comment, e.layer, e.start, e.end, e.style, e.actor, e.marginL, e.marginR, e.marginV, e.effect, e.text];
export const sameLines = (a: SubDoc, b: SubDoc) => JSON.stringify(a.events.map(lineKey)) === JSON.stringify(b.events.map(lineKey));
const outKind = (ext: string, doc: SubDoc) => (ext.toLowerCase() === "mp4" && doc.kind !== "ass" && doc.kind !== "ssa" ? "mp4" : "mkv");

/** ดูก่อนว่าจะได้ไฟล์แบบไหน · track แทร็กเดิมในหนังที่จะถูกแทน */
export async function remuxPlan(movie: string, tid: number, doc: SubDoc): Promise<RemuxPlan> {
  const m = await mergeApi.inspect(movie);
  const t = m.tracks.find((x) => x.inMovie && x.kind === "subtitle" && x.tid === tid) ?? null;
  return { output: outKind(m.ext, doc), ext: m.ext.toLowerCase(), track: t, why: t ? null : "ไม่เจอแทร็กซับนี้ในหนังแล้ว ไฟล์อาจถูกเปลี่ยนหลังเปิด" };
}

/** ใส่ซับกลับเข้าหนัง · original ไฟล์เดิมเก็บไว้หรือลงถังขยะ */
export async function remuxSub(movie: string, tid: number, doc: SubDoc, original: "keep" | "trash"): Promise<RemuxDone> {
  const m = await mergeApi.inspect(movie);
  const old = m.tracks.find((x) => x.inMovie && x.kind === "subtitle" && x.tid === tid);
  if (!old) throw new Error("ไม่เจอแทร็กซับนี้ในหนังแล้ว ไฟล์อาจถูกเปลี่ยนหลังเปิด");
  const temp = await subDocApi.temp(doc);
  const added = await mergeApi.addFile(temp, m.duration);
  const nt = added.tracks.find((x) => x.kind === "subtitle");
  if (!nt) throw new Error("อ่านซับที่แก้จากไฟล์ชั่วคราวไม่ได้");
  const tracks = m.tracks.map((t) => (t === old ? { ...nt, lang: old.lang, name: old.name, default: old.default, forced: old.forced, delay: old.delay, keep: true } : t));
  const res = await mergeApi.apply({ movie, tracks, covers: { portrait: "keep", land: "keep" }, output: outKind(m.ext, doc), original, checkSource: false, checkOutput: true, fonts: [] });
  let same: boolean | null = null;
  try {
    const out = await mergeApi.inspect(res.output);
    const k = m.tracks.filter((t) => t.inMovie && t.kind === "subtitle").indexOf(old);
    const nt2 = out.tracks.filter((t) => t.kind === "subtitle")[k];
    if (nt2) same = sameLines(await subDocApi.open(res.output, true, nt2.tid, nt2.ff ?? nt2.tid), doc);
  } catch { same = null; }
  return { ...res, same };
}
