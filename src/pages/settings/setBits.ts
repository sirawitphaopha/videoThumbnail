/* เก็บค่า เพิ่มลบโฟลเดอร์ โปรแกรมเล่น คุณภาพ JPG ล้างแคช และที่เก็บรูปจับคู่ ใช้ตอนมีค่าตั้งแล้ว
   แยกจาก SettingsPage.tsx ตอนจัดโครงไฟล์ตามความหมาย (BUGS ข้อ 155 ขั้น 8) เนื้อโค้ดยกมาทั้งก้อน */
import { graphApi, pickExe, pickFolder, type Settings } from "../../lib/api";
import { isLow } from "../../lib/drives";
import { folderKey } from "../../lib/folders";
import { LINK_MODES } from "./data";
import type { SetCtx } from "./setCtx";

export function setBits(pg: SetCtx) {
  const { drives, folders, jpg, jpgTimer, loaded, movies, scan, setCache, setJpg, setRemoving, toast, update } = pg;
  const settings = pg.settings!;

  /** เก็บค่า · เก็บไม่ได้ ตัวบันทึก (lib/settings.tsx) ขึ้นแถบแดงที่เดียว ที่นี่คืนผลให้งานที่ทำต่อรอดู
      (AUDIT ข้อ 135 · เดิมขึ้นแถบแดงซ้ำอีกแถบ ต้องกดปิดสองครั้ง) */
  const set = (patch: Partial<Settings>) => update(patch);
  const addFolder = async () => {
    const f = await pickFolder("เลือกโฟลเดอร์หนัง");
    if (!f) return;
    // D:\หนัง กับ D:\หนัง\ คือโฟลเดอร์เดียวกัน (AUDIT ข้อ 130)
    if (settings.folders.some((x) => folderKey(x) === folderKey(f))) { toast({ kind: "warn", ms: 6000, key: "set-folder", title: "โฟลเดอร์นี้อยู่บนชั้นแล้ว", detail: f }); return; }
    // บันทึกไม่สำเร็จ ไม่อ่านโฟลเดอร์ ไม่ขึ้นแถบเขียว (AUDIT ข้อ 135 · เดิมขึ้นแถบเขียวว่าเพิ่มแล้วทั้งที่ค่ายังไม่เปลี่ยน)
    if (!(await set({ folders: [...settings.folders, f] }))) return;
    scan();
    toast({ kind: "ok", title: "เพิ่มโฟลเดอร์แล้ว กำลังอ่านขึ้นชั้น", detail: f });
  };
  const removeFolder = async (f: string) => {
    setRemoving(null);
    if (!(await set({ folders: settings.folders.filter((x) => x !== f) }))) return;
    scan();
    toast({ kind: "ok", title: "เอาออกจากชั้นแล้ว", detail: `${f} ไฟล์ในเครื่องยังอยู่ครบ ไม่ถูกลบ` });
  };
  const changeOriginals = async () => {
    const f = await pickFolder("เลือกโฟลเดอร์เก็บไฟล์เดิม");
    if (f) await set({ originalsFolder: f });
  };
  const addPlayer = async () => {
    const f = await pickExe();
    if (!f) return;
    const list = settings.players ?? [];
    if (!list.some((x) => x.toLowerCase() === f.toLowerCase())) await set({ players: [...list, f] });
  };
  const removePlayer = (path: string, wasDefault: boolean) =>
    set({ players: (settings.players ?? []).filter((x) => x.toLowerCase() !== path.toLowerCase()), ...(wasDefault ? { playerPath: "" } : {}) });
  const jpgNow = jpg ?? settings.jpgQuality;
  const onJpg = (v: number) => {
    setJpg(v);
    window.clearTimeout(jpgTimer.current);
    jpgTimer.current = window.setTimeout(() => { void set({ jpgQuality: v }); }, 300);
  };
  const clearCache = async () => {
    try { setCache(await graphApi.cacheClear()); toast({ kind: "ok", title: "ล้างผลอ่านคลื่นที่เก็บไว้แล้ว", detail: "เปิดกราฟเสียงครั้งหน้าจะอ่านไฟล์ใหม่ และไฟล์หนังไม่ถูกแตะ" }); }
    catch (e) { toast({ kind: "bad", title: "ล้างไม่ได้", detail: String(e) }); }
  };
  const countOf = (f: string) => folders.find((x) => folderKey(x.path) === folderKey(f));
  /** จำนวนเรื่องใต้โฟลเดอร์ · ยังไม่ได้อ่านโฟลเดอร์รอบนี้ (ปิดสวิตช์อ่านตอนเปิด หรือกำลังอ่านอยู่) นับจากชั้นวางที่จำไว้ · คลังยังโหลดไม่เสร็จขึ้นขีด
      (AUDIT ข้อ 33 · เดิมขึ้น 0 เรื่องทุกโฟลเดอร์ทั้งที่ชั้นวางมีหนังเต็ม) */
  const folderCount = (f: string, st: ReturnType<typeof countOf>): number | null =>
    st ? st.count : loaded ? movies.filter((m) => folderKey(m.root) === folderKey(f)).length : null;
  /** ติ๊กได้หลายแบบพร้อมกัน ต้องเหลืออย่างน้อยหนึ่งแบบ (พี่กันสั่ง 8 พ.ย. 2569 "สามารถเลือกได้ทุกแบบพร้อมกัน") */
  const stores = settings.linkStores?.length ? settings.linkStores : [settings.linkStore];
  const wantCopy = stores.includes("beside") && stores.includes("app");
  /** ไดรฟ์ที่โปรแกรมเก็บข้อมูล ถ้าเหลือไม่ถึง 10% (BUGS ข้อ 88 ④) */
  const appLow = drives.list?.find((d) => d.app && isLow(d)) ?? null;
  const toggleStore = (v: Settings["linkStore"]) => {
    const on = stores.includes(v);
    if (on && stores.length === 1) { toast({ kind: "warn", ms: 6000, key: "set-store", title: "ต้องเลือกอย่างน้อยหนึ่งแบบ", detail: "ติ๊กแบบอื่นก่อน แล้วค่อยเอาแบบนี้ออก" }); return; }
    const next = (["beside", "app", "link"] as const).filter((x) => (x === v ? !on : stores.includes(x)));
    void set({ linkStores: next, linkStore: next[0] });
  };
  const migrateCount = movies.filter((m) => (m.linked ?? []).some((c) => c.store !== settings.linkStore || !!c.appCopy !== wantCopy)).length;
  const modeName = LINK_MODES.filter((x) => stores.includes(x.v)).map((x) => x.title).join(" กับ ");
  return { set, addFolder, removeFolder, changeOriginals, addPlayer, removePlayer, jpgNow, onJpg, clearCache, countOf, folderCount, stores, wantCopy, appLow, toggleStore, migrateCount, modeName };
}
