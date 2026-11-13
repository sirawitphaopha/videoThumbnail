/* ความจุไดรฟ์ของโฟลเดอร์หนังกับไดรฟ์ที่โปรแกรมเก็บข้อมูล (BUGS ข้อ 88 พี่กันแทรก 13 พ.ย. 2569)
   หน้าตั้งค่าหัวข้อโฟลเดอร์หนังแสดงทุกไดรฟ์ · ไดรฟ์ที่เหลือไม่ถึง 10% เตือนที่ชั้นวาง และในการ์ดเก็บรูปที่จับคู่ ถ้าติ๊กเก็บสำเนาไว้ในโปรแกรม
   อ่านใหม่ตอนรายชื่อโฟลเดอร์เปลี่ยน ตอนกลับมาที่หน้าต่างโปรแกรม และทุก 2 นาที · ผลใช้ร่วมกันทุกหน้า ไม่ถามซ้ำพร้อมกัน */
import { useEffect, useState, useSyncExternalStore } from "react";
import { api, driveApi, type DriveSpace, type FreeInfo } from "./api";
import { fmtSize } from "./format";
import { useSettings } from "./settings";

/** เหลือน้อยกว่านี้ถือว่าใกล้เต็ม (พี่กันสั่ง "ถ้าเนื้อที่เหลือ 10% ไปเตือน") */
export const LOW_FREE = 0.1;
export const isLow = (d: DriveSpace) => d.total > 0 && d.free / d.total < LOW_FREE;

type State = { list: DriveSpace[] | null; failed: boolean };
let state: State = { list: null, failed: false };
let key = "";
let busy = false;
const subs = new Set<() => void>();
const set = (s: State) => { state = s; subs.forEach((f) => f()); };

async function load(folders: string[]) {
  if (busy) return;
  busy = true;
  // รุ่นทดสอบ ตัวตรวจป้อนไดรฟ์ใกล้เต็มจำลองผ่าน window.__driveSample ได้ ไว้ถ่ายคำเตือนที่ของจริงยังไม่เกิด · ตัวจริงไม่มีทางนี้
  const sample = import.meta.env.DEV ? (window as unknown as { __driveSample?: DriveSpace[] }).__driveSample : undefined;
  try { set({ list: sample ?? await api.driveSpace(folders), failed: false }); }
  // อ่านไม่ได้ต้องต่างจากไม่มีข้อมูล (สกิล loading-skeleton) · ของเดิมที่เคยอ่านได้ยังแสดงต่อ
  catch { set({ list: state.list, failed: true }); }
  finally { busy = false; }
}

export function useDriveSpace(): State & { refresh: () => void } {
  const { settings } = useSettings();
  const folders = settings?.folders;
  const s = useSyncExternalStore((f) => { subs.add(f); return () => { subs.delete(f); }; }, () => state);
  useEffect(() => {
    if (!folders) return;
    const k = folders.join("\n");
    if (k !== key || !state.list) { key = k; void load(folders); }
    const again = () => void load(folders);
    window.addEventListener("focus", again);
    const t = window.setInterval(again, 120_000);
    return () => { window.removeEventListener("focus", again); window.clearInterval(t); };
  }, [folders]);
  return { ...s, refresh: () => { if (folders) void load(folders); } };
}

// รุ่นทดสอบ ตัวตรวจสั่งอ่านความจุใหม่หลังตั้ง __driveSample · ตัวจริงไม่มี
if (import.meta.env.DEV) (window as unknown as { __driveReload?: () => void }).__driveReload = () => void load(key ? key.split("\n") : []);

/** ชื่อไดรฟ์ที่คนอ่าน "C:\" เป็น "ไดรฟ์ C" · ไดรฟ์เครือข่ายใช้ที่อยู่เต็ม */
export function driveName(root: string): string {
  const m = /^([A-Za-z]):\\?$/.exec(root);
  return m ? `ไดรฟ์ ${m[1].toUpperCase()}` : root;
}

/** ที่ว่างเหลือกี่เปอร์เซ็นต์ ต่ำกว่า 10 บอกทศนิยมหนึ่งตำแหน่ง เช่น 1.2% (พี่กันสั่ง 13 พ.ย. 2569 "เเล้วเหลือกี่% บอกด้วย") */
export function freePct(d: DriveSpace): string {
  const p = d.total > 0 ? (d.free / d.total) * 100 : 0;
  return `${p < 10 ? p.toFixed(1) : Math.round(p)}%`;
}

/** ขนาดที่ตัวเลขกับหน่วยไม่แยกบรรทัด เช่น 8.38 GB */
export const sizeNb = (s: string) => s.replace(" ", " ");

/** ที่ว่างของไดรฟ์ที่งานจะเขียนไฟล์ อ่านใหม่ตอนที่อยู่เปลี่ยน ตอนกลับมาที่หน้าต่าง และทุก 30 วินาที (BUGS ข้อ 94) · ไม่มีที่อยู่ได้ null */
export function useFree(path: string | null | undefined): FreeInfo | null {
  const [info, setInfo] = useState<FreeInfo | null>(null);
  useEffect(() => {
    if (!path) { setInfo(null); return; }
    let live = true;
    const read = () => { driveApi.free(path).then((f) => { if (live) setInfo(f); }, () => { if (live) setInfo(null); }); };
    read();
    window.addEventListener("focus", read);
    const t = window.setInterval(read, 30_000);
    return () => { live = false; window.removeEventListener("focus", read); window.clearInterval(t); };
  }, [path]);
  return info;
}

/** คำสั้นข้างปุ่มเริ่มเมื่อทำงานแล้วไดรฟ์จะเต็ม สูตรต้องใช้เท่ากับที่ฝั่ง Rust เช็กตอนเริ่ม · พอเหลือ null (BUGS ข้อ 94 พี่กันสั่ง "ถ้ารันไฟล์ไปแล้วเนื้อที่เต็มแน่ ๆ ต้องบอกนะ") */
export function spaceShort(f: FreeInfo | null, need: number): string | null {
  if (!f || need <= 0 || f.free >= need) return null;
  return `ยังกดไม่ได้ ไดรฟ์ ${f.drive} ต้องใช้ราว ${sizeNb(fmtSize(need))} แต่เหลือ ${sizeNb(fmtSize(f.free))}`;
}

/** เปิดหน้าตั้งค่าที่หัวข้อหนึ่งจากหน้าอื่น เช่นปุ่มดูความจุไดรฟ์บนชั้นวาง · หน้าตั้งค่าที่เปิดค้างแบบซ่อนอยู่รับผ่านเหตุการณ์ หน้าที่ยังไม่เคยเปิดอ่านค่าที่ค้างไว้ตอนสร้าง */
let pendingSec: string | null = null;
export function requestSettingsSec(id: string) {
  pendingSec = id;
  window.dispatchEvent(new CustomEvent("ms-settings-sec", { detail: id }));
}
export function takeSettingsSec(): string | null {
  const p = pendingSec;
  pendingSec = null;
  return p;
}
