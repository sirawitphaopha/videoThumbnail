/* จับคู่เสียงหรือซับไว้กับหนังแบบไม่รวม
   แยกจาก AvPage.tsx ตอนจัดโครงไฟล์ตามความหมาย (BUGS ข้อ 155 ขั้น 2) เนื้อโค้ดยกมาทั้งก้อน */
import { useState } from "react";
import { pairApi } from "../../lib/api";
import { setAv } from "../../lib/avJob";
import type { C3 } from "./avCtx";

export function usePairs(c: C3) {
  const { addFiles, movie, movies, tracks } = c;
  const [paired, setPaired] = useState<{ n: number; err?: string } | null>(null);
  const inLib = movie ? movies.find((m) => m.path.toLowerCase() === movie.path.toLowerCase()) : undefined;
  /** จับคู่ได้เฉพาะเสียงกับซับที่เพิ่มจากไฟล์แยก · ไฟล์ในตัวหนัง (MKV ที่มีหลายแทร็ก) จับคู่ทั้งไฟล์ */
  const pairable = tracks.filter((t) => !t.inMovie && t.keep && (t.kind === "audio" || t.kind === "subtitle"));
  const pairBlocked = !movie ? "ยังกดไม่ได้ ใส่ไฟล์หนังก่อน" : !inLib ? "หนังเรื่องนี้ไม่ได้อยู่บนชั้น เพิ่มโฟลเดอร์ของหนังในหน้าตั้งค่าก่อน"
    : !pairable.length ? "ยังไม่มีเสียงหรือซับที่เพิ่ม ลากไฟล์มาวางก่อน" : null;
  /** การจับคู่ที่บันทึกไว้แล้วของเรื่องนี้ · บันทึกใหม่แทนทั้งชุด จึงให้ใส่ของเดิมลงตารางก่อนได้ (ผู้ช่วยตรวจขั้น 10 ข้อ 15 · เดิมกดแก้การจับคู่แล้วคู่เดิมไม่ขึ้น บันทึกแล้วหาย) */
  const savedPairs = inLib?.pairs ?? [];
  const pairsNotInTable = savedPairs.filter((p) => !tracks.some((t) => !t.inMovie && t.src.toLowerCase() === p.path.toLowerCase()));
  const loadSavedPairs = async () => {
    await addFiles(pairsNotInTable.map((p) => p.path));
    setAv((st) => ({ tracks: st.tracks.map((t) => {
      const p = savedPairs.find((x) => !t.inMovie && x.kind === t.kind && x.path.toLowerCase() === t.src.toLowerCase());
      return p ? { ...t, lang: p.lang || t.lang, name: p.name || t.name, delay: p.delay } : t;
    }) }));
  };
  // กำลังบันทึก ปุ่มบอกสถานะและกดซ้ำไม่ได้จนผลกลับ (AUDIT ข้อ 85)
  const [pairSaving, setPairSaving] = useState(false);
  const savePairs = () => {
    if (pairBlocked || !movie || pairSaving) return;
    setPairSaving(true);
    const list = pairable.map((t) => ({ path: t.src, kind: t.kind as "audio" | "subtitle", lang: t.lang, name: t.name, delay: Math.round(t.delay) }));
    const uniq = list.filter((x, i) => list.findIndex((y) => y.path === x.path && y.kind === x.kind) === i);
    // บอกผลในการ์ดของหน้าที่เดียว (เดิมขึ้นแจ้งเตือนซ้ำ บังการ์ด เจอตอนตรวจภาพ)
    pairApi.set(movie.path, uniq).then(() => setPaired({ n: uniq.length }),
      (e) => setPaired({ n: 0, err: String(e) })).finally(() => setPairSaving(false));
  };
  return { paired, setPaired, inLib, pairable, pairBlocked, savedPairs, pairsNotInTable, loadSavedPairs, savePairs, pairSaving };
}
