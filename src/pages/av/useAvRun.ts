/* เริ่มงานรวม หน้าต่างถามก่อนเริ่ม คืนเป็นไฟล์เดิม และล้างทั้งหมด
   แยกจาก AvPage.tsx ตอนจัดโครงไฟล์ตามความหมาย (BUGS ข้อ 155 ขั้น 2) เนื้อโค้ดยกมาทั้งก้อน */
import { useState } from "react";
import { mergeApi, posterApi, type ApplyProblem } from "../../lib/api";
import { getAv, resetAv, setAv, trackFrom } from "../../lib/avJob";
import type { C2 } from "./avCtx";

export function useAvRun(c: C2) {
  const { blocked, fontFiles, original, output, setMovieErr, settings, vtts, working } = c;
  const [askVtt, setAskVtt] = useState(false);
  const [askDelete, setAskDelete] = useState<0 | 1 | 2>(0);
  const [askStop, setAskStop] = useState(false);
  const start = async () => {
    const s = getAv();
    if (!s.movie) return;
    setAv({ run: { state: "working", progress: null }, runMovie: s.movie.path });
    try {
      const result = await mergeApi.apply({
        movie: s.movie.path,
        tracks: s.tracks.map(({ key: _k, base: _b, delayFromName: _d, longerBy: _l, notes: _n, fonts: _f, ...t }) => t),
        covers: { portrait: s.covers.cover.mode, land: s.covers.cover_land.mode },
        output, original, checkSource: settings?.checkSourceBefore ?? true, checkOutput: settings?.checkOutputAfter ?? true,
        fonts: fontFiles,
        chapters: s.chapters,
      });
      // ไฟล์เดิมย้ายไปแล้ว หน้าว่าง เหลือการ์ดผล
      resetAv(true);
      setAv({ run: { state: "done", result } });
    } catch (e) {
      const problem = e && typeof e === "object" && "title" in e ? (e as ApplyProblem) : { kind: "other", title: "รวมไฟล์ไม่สำเร็จ", detail: [String(e)] };
      setAv({ run: { state: "failed", problem } });
    }
  };
  /** ทุกทางที่เริ่มงานผ่านตัวนี้ · ① มีซับ VTT บอกก่อนว่าจะแปลงเป็น SRT ② ตั้งลบไฟล์เดิม ยืนยัน 2 ขั้น (แบบหน้าใส่โปสเตอร์) */
  const pressStart = (stepVttDone = false) => {
    if (blocked || working) return;
    if (vtts.length && !stepVttDone) { setAskVtt(true); return; }
    if (original === "trash") { setAskDelete(1); return; }
    start();
  };
  // คืนตารางเป็นแทร็กเดิมของหนัง เอาไฟล์ที่เพิ่ม ปก ฟอนต์ บท และที่แก้ในตารางออก ไฟล์หนังยังอยู่ ไม่ต้องใส่ใหม่
  // (พี่กันขอ 15 พ.ย. 2569 "เราอยากได้ ปุ่มที่ ปิดทั้งหมดที่เอาเข้ามาทิ้งได้ โดยไม่ต้องไปอัแปใหม่" · ล้างทั้งหมดล้างทั้งไฟล์หนัง)
  const resetEdits = () => {
    const m = getAv().movie;
    if (working || !m) return;
    setAv((s) => ({ tracks: m.tracks.map((t) => trackFrom(t)), sel: null, fontExtra: [], fontOff: [], chapters: null,
      covers: { cover: { ...s.covers.cover, mode: "keep", neu: null }, cover_land: { ...s.covers.cover_land, mode: "keep", neu: null } } }));
    mergeApi.coverDrop(null).catch(() => {});
    posterApi.clear("cover").catch(() => {});
  };
  const clearAll = () => {
    if (working) return;
    resetAv();
    setMovieErr(null);
    mergeApi.coverDrop(null).catch(() => {});
    posterApi.clear("cover").catch(() => {});
  };
  return { askVtt, setAskVtt, askDelete, setAskDelete, askStop, setAskStop, start, pressStart, resetEdits, clearAll };
}
