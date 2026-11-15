/** แถบภาพรวมทั้งไฟล์ของหน้ากราฟเสียง พับหรือกาง (BUGS ข้อ 17 พับเก็บได้ · ข้อ 50 ตั้งได้ว่าเปิดมาพับหรือกาง)
    ค่าตอนเปิดโปรแกรมมาจากหน้าตั้งค่า (graph-ov-start) · กดพับกางในหน้ากราฟใช้ถึงปิดโปรแกรม ทุกมุมมองใช้ค่าเดียวกัน
    เปลี่ยนค่าในหน้าตั้งค่าแล้วหน้ากราฟเปลี่ยนตามทันที ไม่ต้องเปิดโปรแกรมใหม่
    (พี่กันแทรก 11 พ.ย. 2569 "ปุ่มยุบขยายนี้ มีในตั้งค่าได้ว่าว่าจะเเสดงยุบไว้ห่อน หรือขยายไว้ก่อน" · ค่าตั้งต้นกางไว้ แคลร์ตั้ง ตามค่าเดิมก่อนมีปุ่มพับ) */
import { useEffect, useState } from "react";

export const OV_START_KEY = "graph-ov-start";
/** ที่จำเดิม (จำค่าพับกางล่าสุด) ย้ายมาเป็นค่าตั้งครั้งเดียว */
const OLD_KEY = "graph-ov-fold";
export type OvStart = "open" | "fold";

export function ovStart(): OvStart {
  try {
    const v = localStorage.getItem(OV_START_KEY);
    if (v === "fold" || v === "open") return v;
    // คนที่เคยพับไว้กับที่จำแบบเดิม เปิดมาพับเหมือนเดิม แล้วเลิกใช้ที่จำเดิม
    const old = localStorage.getItem(OLD_KEY);
    if (old != null) { const s: OvStart = old === "1" ? "fold" : "open"; localStorage.setItem(OV_START_KEY, s); localStorage.removeItem(OLD_KEY); return s; }
  } catch { /* ไม่มีที่เก็บ ใช้ค่าตั้งต้น */ }
  return "open";
}

let foldNow = ovStart() === "fold";
const subs = new Set<(v: boolean) => void>();
const setFoldNow = (v: boolean) => { foldNow = v; subs.forEach((x) => x(v)); };

/** ค่าพับกางตอนนี้ กดในหน้ากราฟไม่เปลี่ยนค่าตั้ง */
export function useOvFold(): [boolean, (v: boolean) => void] {
  const [v, setV] = useState(foldNow);
  useEffect(() => { subs.add(setV); setV(foldNow); return () => { subs.delete(setV); }; }, []);
  return [v, setFoldNow];
}

/** หน้าตั้งค่าเปลี่ยนค่า เก็บไว้ใช้ตอนเปิดโปรแกรมครั้งหน้า และพับหรือกางหน้ากราฟตามทันที */
export function setOvStart(v: OvStart) {
  try { localStorage.setItem(OV_START_KEY, v); } catch { /* เก็บไม่ได้ ใช้ค่านี้ถึงปิดโปรแกรม */ }
  setFoldNow(v === "fold");
}

/** ตัวตรวจอ่านค่าตอนนี้ */
(window as unknown as { __ovFold?: () => boolean }).__ovFold = () => foldNow;
