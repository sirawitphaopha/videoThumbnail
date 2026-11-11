/* คิวตรวจไฟล์ (ขั้น 6 · สเปกข้อ 8) · ตัวเดียวทั้งโปรแกรม
   งานรันฝั่ง Rust เบื้องหลัง หน้าตรวจไฟล์ ชั้นวาง เห็นสถานะเดียวกัน เปลี่ยนหน้าไปมาแล้วกลับมายังเห็นความคืบหน้า
   ผลตรวจแต่ละเรื่องมาทางเหตุการณ์ movie-updated ที่คลังหนังรับอยู่แล้ว ป้ายสีบนชั้นเปลี่ยนเอง */
import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { listen } from "@tauri-apps/api/event";
import { checkApi, inApp, type CheckFinished, type CheckItem, type CheckMode, type CheckProgress } from "./api";
import { useToast } from "../components/Toasts";
import { useLibrary } from "./library";
import { useSettings } from "./settings";

export type CheckState = {
  running: boolean;
  mode: CheckMode | null;
  /** ทุกเรื่องในชุดที่กำลังตรวจ ตามลำดับ */
  queue: string[];
  /** ตรวจจบแล้วในชุดนี้ รวมที่ตรวจไม่ได้ */
  done: string[];
  current: { id: string; percent: number } | null;
  /** ตรวจไม่ได้ในชุดล่าสุด พร้อมเหตุผล */
  errors: Record<string, string>;
  /** สรุปชุดล่าสุดที่จบแล้ว */
  last: CheckFinished | null;
};

type Ctx = {
  s: CheckState;
  start: (ids: string[], mode: CheckMode) => Promise<boolean>;
  cancel: () => void;
};

const empty: CheckState = { running: false, mode: null, queue: [], done: [], current: null, errors: {}, last: null };
const CheckCtx = createContext<Ctx>({ s: empty, start: async () => false, cancel: () => {} });
export const useCheck = () => useContext(CheckCtx);

/** ตรวจแบบเร็วตอนเปิดโปรแกรมแล้วหรือยัง · กันโหมดทดสอบของ React สั่งซ้ำสองรอบ */
let startupDone = false;

export function CheckHost({ children }: { children: React.ReactNode }) {
  const toast = useToast();
  const { settings } = useSettings();
  const { movies, loaded, scanning } = useLibrary();
  const [s, setS] = useState<CheckState>(empty);
  const starting = useRef(false);

  useEffect(() => {
    if (!inApp) return;
    // เปิดหน้าต่างใหม่ระหว่างที่ชุดก่อนยังรัน (ตอนพัฒนา) ให้ปุ่มเริ่มตรวจกดไม่ได้
    checkApi.running().then((r) => r && setS((x) => ({ ...x, running: true }))).catch(() => {});
    const offs = [
      listen<{ ids: string[]; mode: CheckMode }>("check-started", (e) =>
        setS((x) => ({ ...x, running: true, mode: e.payload.mode, queue: e.payload.ids, done: [], current: null, errors: {} }))),
      listen<CheckProgress>("check-progress", (e) =>
        setS((x) => ({ ...x, current: { id: e.payload.id, percent: e.payload.percent } }))),
      listen<CheckItem>("check-item", (e) =>
        setS((x) => ({
          ...x,
          done: x.done.concat(e.payload.id),
          current: x.current?.id === e.payload.id ? null : x.current,
          errors: e.payload.error ? { ...x.errors, [e.payload.id]: e.payload.error } : x.errors,
        }))),
      listen<CheckFinished>("check-finished", (e) => {
        const r = e.payload;
        setS((x) => ({ ...x, running: false, current: null, last: r }));
        const counts = [r.ok && `สมบูรณ์ ${r.ok}`, r.bad && `เสียหาย ${r.bad}`, r.changed && `ถูกเปลี่ยน ${r.changed}`, r.failed && `ตรวจไม่ได้ ${r.failed}`].filter(Boolean).join(", ");
        if (r.cancelled) {
          toast({ kind: "info", title: `หยุดตรวจแล้ว ตรวจไป ${r.done} จาก ${r.total} เรื่อง`, detail: counts || undefined });
        } else if (r.bad || r.changed || r.failed) {
          // มีเรื่องที่ต้องดู แถบไม่หายเอง (save-status ผิดพลาดไม่หาย)
          toast({ kind: r.bad ? "bad" : "warn", title: `ตรวจ ${r.total} เรื่องเสร็จ มีเรื่องที่มีปัญหา`, detail: counts });
        } else {
          toast({ kind: "ok", title: `ตรวจ ${r.total} เรื่องเสร็จ ไฟล์สมบูรณ์ทุกเรื่อง` });
        }
      }),
    ];
    return () => { offs.forEach((p) => p.then((f) => f())); };
  }, [toast]);

  const start = useCallback(async (ids: string[], mode: CheckMode) => {
    if (starting.current || !ids.length) return false;
    starting.current = true;
    try {
      await checkApi.start(ids, mode);
      // ปุ่มกดซ้ำไม่ได้ทันที ไม่ต้องรอเหตุการณ์ check-started
      setS((x) => ({ ...x, running: true, mode, queue: ids, done: [], current: null, errors: {} }));
      return true;
    } catch (e) {
      toast({ kind: "bad", title: "เริ่มตรวจไม่ได้", detail: String(e) });
      return false;
    } finally {
      starting.current = false;
    }
  }, [toast]);

  const cancel = useCallback(() => { checkApi.cancel().catch(() => {}); }, []);

  // ตั้งค่า ตรวจแบบเร็วทุกเรื่องตอนเปิดโปรแกรม (สเปกข้อ 9 · ปิดไว้เป็นค่าตั้งต้น) · รอคลังกับการอ่านโฟลเดอร์เสร็จก่อน
  useEffect(() => {
    if (startupDone || !inApp || !settings?.quickCheckOnStart || !loaded || scanning || s.running) return;
    const ids = movies.filter((m) => !m.missing).map((m) => m.id);
    if (!ids.length) return;
    startupDone = true;
    start(ids, "quick");
  }, [settings?.quickCheckOnStart, loaded, scanning, movies, s.running, start]);

  return <CheckCtx.Provider value={{ s, start, cancel }}>{children}</CheckCtx.Provider>;
}
