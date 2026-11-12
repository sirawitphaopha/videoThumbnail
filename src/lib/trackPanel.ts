/* ส่วนตั้งค่าแทร็กในหน้าเสียงและซับขึ้นแบบไหน (BUGS ข้อ 33)
   พี่กันเลือกแบบ 2 กางใต้แถวที่กด 12 พ.ย. 2569 "ชอบแบบ2 แต่ 1 3 เอาไว้ เอาไปใส่ในตั้งค่าละกัน เผื่ออยากเปลี่ยน"
   แบบ 1 หน้าต่างซ้อนกลางจอ กับแบบ 3 แผงด้านขวา เลือกได้ในหน้าตั้งค่า หัวข้อเสียงและซับ
   จำไว้ในเครื่องแบบเดียวกับโทนสี (ไม่ต้องแก้ค่าตั้งฝั่ง Rust) · หน้าตั้งค่ากับหน้าเสียงและซับเปิดค้างพร้อมกัน จึงแจ้งกันทันทีที่เปลี่ยน */
import { useSyncExternalStore } from "react";

export type TrackPanel = "under" | "dialog" | "side";
export const TRACK_PANEL_DEFAULT: TrackPanel = "under";
const KEY = "ms.trackPanel";
const subs = new Set<() => void>();

function read(): TrackPanel {
  try { const v = localStorage.getItem(KEY); return v === "dialog" || v === "side" || v === "under" ? v : TRACK_PANEL_DEFAULT; } catch { return TRACK_PANEL_DEFAULT; }
}
let cur: TrackPanel = read();

/** save=false ใช้กับกรอบมอคอัป สลับแบบให้ดูโดยไม่จำค่า (กรอบมอคอัปใช้ที่เก็บเดียวกับโปรแกรมโหมดพัฒนา จำแล้วค่าของโปรแกรมจะเปลี่ยนตาม) */
export function setTrackPanel(v: TrackPanel, save = true) {
  cur = v;
  if (save) try { localStorage.setItem(KEY, v); } catch { /* จำไม่ได้ก็ใช้ค่านี้ไปจนปิดโปรแกรม */ }
  subs.forEach((f) => f());
}

export function useTrackPanel(): TrackPanel {
  return useSyncExternalStore((f) => { subs.add(f); return () => { subs.delete(f); }; }, () => cur);
}

// มอคอัปที่ใช้หน้าจอจริงสลับแบบข้ามกรอบได้ (docs/mockups/batch9-pick.html)
(window as unknown as { __setTrackPanel: (v: TrackPanel, save?: boolean) => void }).__setTrackPanel = setTrackPanel;
