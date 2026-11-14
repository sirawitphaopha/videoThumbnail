/* ใส่ซับที่แก้กลับเข้าหนัง (แผนหน้าแก้ซับ ขั้น 9 · BUGS ข้อ 109 ข้อ 114)
   ใช้งานรวมไฟล์เดิมของหน้าเสียงและซับทั้งก้อน (merge.rs merge_apply) ไม่เขียนตัวรวมใหม่
     ① เขียนซับที่แก้ลงไฟล์ชั่วคราวในโฟลเดอร์ tmp ของโปรแกรม (subdoc_temp ชื่อขึ้นต้น sub- โปรแกรมกวาดทิ้งเองตอนเปิด)
     ② อ่านแทร็กของหนัง (merge_inspect) แทนแทร็กซับนั้นด้วยแทร็กจากไฟล์ชั่วคราว ภาษา ภาษาแบบละเอียด ชื่อ ธงหลัก ธงบังคับ
        ป้ายพิเศษ (คนหูหนวก คนตาบอด คำบรรยายภาพ ต้นฉบับ เสียงบรรยาย) ดีเลย์ ลำดับ เหมือนเดิม แทร็กอื่นเหมือนเดิม
     ③ ไฟล์ MKV ฝังฟอนต์ที่ซับเรียกแต่หนังยังไม่มี (หาเจอในเครื่อง) · MP4 ฝังฟอนต์ไม่ได้
     ④ รวมไฟล์ (ตรวจไฟล์ใหม่ก่อนเปลี่ยนชื่อจริงตามงานรวมไฟล์เดิม) ไฟล์เดิมไปตามค่าตั้งของโปรแกรม เก็บไว้หรือลงถังขยะ
     ⑤ อ่านซับจากไฟล์ใหม่กลับมาเทียบกับที่แก้ทีละบรรทัดซับ
   หนัง MP4 ใส่ซับ ASS ไม่ได้ ไฟล์ใหม่เป็น MKV (บอกก่อนกด) · ซับ SRT ใส่ MP4 ได้แบบ mov_text
   MP4 เก็บภาษาได้แค่รหัสสามตัว ไม่มีป้ายพิเศษ ไม่มีธงบังคับ ไม่มีไฟล์แนบ บอกในหน้าต่างก่อนกดว่าอะไรจะหาย (พี่กันสั่ง "ส่วน mp4 มันมีข้อจำกัด ก็ต้องบอกด้วยว่าอะไรจะหายไปบ้าง") */
import { mergeApi, subDocApi, type FontHit, type MergeResult, type MergeTrack, type SubDoc, type SubEvent } from "./api";
import { langName } from "./langs";

export type RemuxPlan = {
  output: "mkv" | "mp4"; ext: string; track: MergeTrack | null; why: string | null;
  /** ฟอนต์ที่ซับเรียกแต่หนังยังไม่มี · file มีค่า = หาเจอ จะฝังเพิ่ม (MKV) */
  fonts: FontHit[];
  /** ไฟล์ใหม่เป็น MP4 ของที่หนังมีแต่ MP4 เก็บไม่ได้ เป็นประโยคพร้อมแสดง */
  lost: string[];
};
export type RemuxDone = MergeResult & { same: boolean | null; fonts: string[] };

/** ช่องที่เทียบตอนอ่านซับกลับจากไฟล์ใหม่ · mkvextract สร้างหัวไฟล์ใหม่ ข้อความทั้งไฟล์จึงไม่ตรงทุกไบต์ เทียบทีละบรรทัดซับแทน */
const lineKey = (e: SubEvent) => [e.comment, e.layer, e.start, e.end, e.style, e.actor, e.marginL, e.marginR, e.marginV, e.effect, e.text];
export const sameLines = (a: SubDoc, b: SubDoc) => JSON.stringify(a.events.map(lineKey)) === JSON.stringify(b.events.map(lineKey));
const outKind = (ext: string, doc: SubDoc) => (ext.toLowerCase() === "mp4" && doc.kind !== "ass" && doc.kind !== "ssa" ? "mp4" : "mkv");

/** ป้ายพิเศษของแทร็ก เป็นคำ (ใช้บอกว่าอะไรหายใน MP4) */
const FLAGS: [keyof MergeTrack, string][] = [
  ["hearingImpaired", "ป้ายซับคนหูหนวก"], ["visualImpaired", "ป้ายคนตาบอด"], ["textDescriptions", "ป้ายคำบรรยายภาพ"], ["original", "ป้ายภาษาต้นฉบับ"], ["commentary", "ป้ายเสียงบรรยาย"],
];
const KIND: Record<MergeTrack["kind"], string> = { video: "ภาพ", audio: "เสียง", subtitle: "ซับ" };
/** ภาษาแบบละเอียดที่มากกว่ารหัสภาษาเฉย ๆ (zh-Hant es-419 pt-BR) · en th ของ zh ไม่นับ เพราะ MP4 เก็บภาษาหลักได้อยู่แล้ว */
export const ietfDetail = (t: MergeTrack) => !!t.langIetf && t.langIetf.includes("-");

/** สิ่งที่หายเมื่อไฟล์ใหม่เป็น MP4 · ไล่ทุกแทร็กที่เก็บไว้ · แทร็กลำดับที่เท่าไหร่ ชนิด ภาษา */
export function mp4Lost(tracks: MergeTrack[]): string[] {
  const out: string[] = [];
  const kept = tracks.filter((t) => t.keep);
  kept.forEach((t, i) => {
    const who = `แทร็กที่ ${i + 1} ${KIND[t.kind]}${langName(t.lang)}`;
    if (ietfDetail(t)) out.push(`${who} ภาษาแบบละเอียด ${t.langIetf} เหลือแค่รหัส ${t.lang}`);
    const f = FLAGS.filter(([k]) => !!t[k]).map(([, w]) => w);
    if (t.forced && t.kind === "subtitle") f.unshift("ธงซับบังคับ");
    if (f.length) out.push(`${who} ${f.join(" ")} หาย`);
  });
  return out;
}

/** ดูก่อนว่าจะได้ไฟล์แบบไหน · track แทร็กเดิมในหนังที่จะถูกแทน · ฟอนต์ที่ต้องฝังเพิ่ม · สิ่งที่หายใน MP4 */
export async function remuxPlan(movie: string, tid: number, doc: SubDoc): Promise<RemuxPlan> {
  const m = await mergeApi.inspect(movie);
  const t = m.tracks.find((x) => x.inMovie && x.kind === "subtitle" && x.tid === tid) ?? null;
  const output = outKind(m.ext, doc);
  const ass = doc.kind === "ass" || doc.kind === "ssa";
  const fonts = output === "mkv" && ass ? await mergeApi.remuxFonts(movie, await subDocApi.render(doc) ?? "").catch(() => []) : [];
  return { output, ext: m.ext.toLowerCase(), track: t, why: t ? null : "ไม่เจอแทร็กซับนี้ในหนังแล้ว ไฟล์อาจถูกเปลี่ยนหลังเปิด", fonts, lost: output === "mp4" ? mp4Lost(m.tracks) : [] };
}

/** ใส่ซับกลับเข้าหนัง · original ไฟล์เดิมเก็บไว้หรือลงถังขยะ · fonts ไฟล์ฟอนต์ที่ฝังเพิ่ม (จาก remuxPlan) */
export async function remuxSub(movie: string, tid: number, doc: SubDoc, original: "keep" | "trash", fonts: string[] = []): Promise<RemuxDone> {
  const m = await mergeApi.inspect(movie);
  const old = m.tracks.find((x) => x.inMovie && x.kind === "subtitle" && x.tid === tid);
  if (!old) throw new Error("ไม่เจอแทร็กซับนี้ในหนังแล้ว ไฟล์อาจถูกเปลี่ยนหลังเปิด");
  const temp = await subDocApi.temp(doc);
  const added = await mergeApi.addFile(temp, m.duration);
  const nt = added.tracks.find((x) => x.kind === "subtitle");
  if (!nt) throw new Error("อ่านซับที่แก้จากไฟล์ชั่วคราวไม่ได้");
  // แทร็กใหม่ได้ทุกอย่างของแทร็กเดิมที่ไม่ใช่ตัวซับ ภาษาแบบละเอียดกับป้ายพิเศษด้วย (เดิมหาย ผู้ช่วยตรวจทาน R6)
  const keepOf = { lang: old.lang, langIetf: old.langIetf ?? "", langWas: old.lang, name: old.name, default: old.default, forced: old.forced, delay: old.delay,
    hearingImpaired: !!old.hearingImpaired, visualImpaired: !!old.visualImpaired, textDescriptions: !!old.textDescriptions, original: !!old.original, commentary: !!old.commentary, keep: true };
  const tracks = m.tracks.map((t) => (t === old ? { ...nt, ...keepOf } : t));
  const output = outKind(m.ext, doc);
  const useFonts = output === "mkv" ? fonts : [];
  const res = await mergeApi.apply({ movie, tracks, covers: { portrait: "keep", land: "keep" }, output, original, checkSource: false, checkOutput: true, fonts: useFonts });
  let same: boolean | null = null;
  try {
    const out = await mergeApi.inspect(res.output);
    const k = m.tracks.filter((t) => t.inMovie && t.kind === "subtitle").indexOf(old);
    const nt2 = out.tracks.filter((t) => t.kind === "subtitle")[k];
    if (nt2) same = sameLines(await subDocApi.open(res.output, true, nt2.tid, nt2.ff ?? nt2.tid), doc);
  } catch { same = null; }
  return { ...res, same, fonts: useFonts };
}

// ทางลัดให้ตัวตรวจ เฉพาะรุ่นทดสอบ (check-q113.mjs ตรวจรายการสิ่งที่ MP4 เก็บไม่ได้)
if (import.meta.env.DEV) (window as unknown as Record<string, unknown>).__subRemuxLib = { mp4Lost, ietfDetail };
