/* ไปบรรทัดถัดไปตามเวลา คีย์ลัดข้างตาราง วิดีโอจำลอง ความสูงหน้าต่าง พับภาพและเสียง
   แยกจาก SubEditor.tsx ตอนจัดโครงไฟล์ตามความหมาย (BUGS ข้อ 155 ขั้น 5) เนื้อโค้ดยกมาทั้งก้อน */
import { useEffect, useState } from "react";
import { edit, getSubEdit, select } from "../../lib/subEdit";
import { garbageGet, garbageSet, isAss } from "../../lib/subText";
import { dummyName, getVid, jumpKeyframe, seek, seekTime, setDummy, vidRate, type DummySpec } from "../../lib/vidFrames";
import { useTiming } from "../../lib/subTiming";
import type { E1 } from "./seCtx";

export function useSeNav(c: E1) {
  const { at, dl, doc, ev, skipAuto } = c;
  const boundary = (dir: 1 | -1) => {
    const f = vidRate(), pos = getVid().pos;
    if (!f || pos == null || !doc || !ev) return;
    const s = f.frameAt(ev.start + dl, "start"), e = f.frameAt(ev.end + dl, "end");
    if (dir > 0) {
      if (s > pos) return seek(s);
      if (e > pos) return seek(e);
      const nx = doc.events[at + 1];
      if (nx) { skipAuto.current = true; select([nx.id], nx.id); seekTime(nx.start + dl, "start"); }
    } else {
      if (e < pos) return seek(e);
      if (s < pos) return seek(s);
      const pv = doc.events[at - 1];
      if (pv) { skipAuto.current = true; select([pv.id], pv.id); seekTime(pv.end + dl, "end"); }
    }
  };
  /** ลูกศรซ้ายขวาในกรอบภาพหรือตาราง · Shift ไป keyframe · Ctrl ไปขอบบรรทัด · Alt ทีละ 10 เฟรม (Fast Jump Step ของ Aegisub) */
  const sideKey = (e: React.KeyboardEvent) => {
    if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
    const pos = getVid().pos;
    if (!vidRate() || pos == null) return;
    e.preventDefault();
    const dir = e.key === "ArrowRight" ? 1 : -1;
    if (e.shiftKey) jumpKeyframe(dir);
    else if (e.ctrlKey || e.metaKey) boundary(dir);
    else if (e.altKey) seek(pos + dir * 10);
    else seek(pos + dir);
  };
  /** ใช้วิดีโอจำลอง · ซับ ASS จำไว้ในไฟล์แบบ Aegisub (บันทึกแล้วเปิดครั้งหน้าได้วิดีโอจำลองเดิม) ซับ SRT ไม่มีที่เก็บ ใช้ได้จนปิดหน้า */
  const applyDummy = (spec: DummySpec) => {
    setDummy(spec);
    const d = getSubEdit().doc;
    if (d && isAss(d) && garbageGet(d, "Video File") !== dummyName(spec)) edit("ใช้วิดีโอจำลอง", (x) => garbageSet(x, "Video File", dummyName(spec)));
  };
  const onCloseVideo = () => {
    const d = getSubEdit().doc;
    if (d && isAss(d) && garbageGet(d, "Video File")?.startsWith("?dummy")) edit("ปิดวิดีโอจำลอง", (x) => garbageSet(x, "Video File", null));
  };
  // ---------------------------------------------------------------- เสียง (ขั้น 5)
  const tm = useTiming();
  // แถวปุ่มเสียง แบบ 2 เต็มความกว้างเมื่อหน้าต่างสูงพอ (จอ 1080 ขึ้นไปตอนกดขยาย) ไม่งั้นแบบ 1 ไอคอนอย่างเดียวใต้คลื่นเสียง
  // พี่กันเคาะ แบบ 2 เป็นหลัก แบบ 1 ตอนที่ว่างไม่พอ · หน้าต่าง 1280 × 800 กับ 1600 × 852 แบบ 2 ดันตารางจนหน้าต้องเลื่อน เกณฑ์ 950 จุดแคลร์ตั้ง
  const [tall, setTall] = useState(() => window.innerHeight >= 950);
  // ยุบภาพหนังกับคลื่นเสียง ตารางยาวเต็มหน้า (ขั้น 8 · แบบ 2 ที่พี่กันเคาะเหลือแค่ปุ่มนี้) จำไว้ในเครื่อง
  const [fold, setFoldS] = useState(() => { try { return localStorage.getItem("se-fold") === "1"; } catch { return false; } });
  const setFold = (v: boolean) => { setFoldS(v); try { localStorage.setItem("se-fold", v ? "1" : "0"); } catch { /* ไม่มีที่เก็บ */ } };
  useEffect(() => { const f = () => setTall(window.innerHeight >= 950); window.addEventListener("resize", f); return () => window.removeEventListener("resize", f); }, []);
  // เสียงในหนังเลื่อนให้เวลา 0 ตรงเฟรมแรกของภาพ แบบ FFMS_DELAY_FIRST_VIDEO_TRACK ของ Aegisub (BUGS ข้อ 115)
  return { boundary, sideKey, applyDummy, onCloseVideo, tm, tall, setTall, fold, setFoldS, setFold };
}
