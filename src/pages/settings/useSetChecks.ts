/* บันทึกการใช้งาน ตัวแปลงเสียง รุ่นล่าสุด คุณภาพ JPG และเช็กเครื่องมือ
   แยกจาก SettingsPage.tsx ตอนจัดโครงไฟล์ตามความหมาย (BUGS ข้อ 155 ขั้น 8) เนื้อโค้ดยกมาทั้งก้อน */
import { useEffect, useRef, useState } from "react";
import { api, encodeApi, graphApi, logApi, playerApi, type EncoderInfo, type LatestInfo, type LogInfo } from "../../lib/api";
import type { T0 } from "./setCtx";

/** ผลเช็กรุ่นล่าสุดครั้งล่าสุด จำไว้นอกหน้า (เปลี่ยนหน้าแล้วไม่หาย ไม่ออกเน็ตซ้ำเอง) */
let latestMemo: { at: Date; list: LatestInfo[] } | null = null;

export function useSetChecks(c: T0) {
  const { sec, setCache, setChecking, setIcaros, setPlayers, setTools, settings, toast } = c;
  const [logInfo, setLogInfo] = useState<LogInfo | "bad" | null>(null);
  useEffect(() => { if (sec === "log") logApi.info().then(setLogInfo, () => setLogInfo("bad")); }, [sec]);
  /** ตัวแปลงเสียง (แผนเสียงและซับ ขั้น 4 · มอคอัปหน้าตั้งค่า การ์ดตัวแปลงเสียง) */
  const [encs, setEncs] = useState<EncoderInfo[] | null>(null);
  const [encDir, setEncDir] = useState("");
  const [encChecking, setEncChecking] = useState(false);
  const recheckEnc = async () => {
    setEncChecking(true);
    try { const [list, dir] = await Promise.all([encodeApi.status(), encodeApi.userDir()]); setEncs(list); setEncDir(dir); }
    catch (e) { toast({ kind: "bad", title: "ตรวจตัวแปลงเสียงไม่ได้", detail: String(e) }); }
    finally { setEncChecking(false); }
  };
  /** รุ่นล่าสุดบนเว็บผู้ทำ (พี่กันสั่ง 8 พ.ย. 2569) · ออกเน็ตเฉพาะตอนกด · ผลจำไว้จนปิดโปรแกรม เปลี่ยนหน้าแล้วกลับมายังเห็น */
  const [latest, setLatest] = useState(latestMemo);
  const [latestChecking, setLatestChecking] = useState(false);
  const checkLatest = async () => {
    setLatestChecking(true);
    // รุ่นทดสอบ ตัวตรวจป้อนผลจำลองผ่าน window.__latestSample ได้ ไว้ถ่ายสถานะที่ของจริงยังไม่เกิด (มีรุ่นใหม่ เช็กไม่ได้) · ตัวจริงไม่มีทางนี้
    const sample = import.meta.env.DEV ? (window as unknown as { __latestSample?: LatestInfo[] }).__latestSample : undefined;
    try { latestMemo = { at: new Date(), list: sample ?? await encodeApi.latest() }; setLatest(latestMemo); }
    catch (e) { toast({ kind: "bad", title: "เช็กรุ่นล่าสุดไม่ได้", detail: String(e) }); }
    finally { setLatestChecking(false); }
  };
  const openPage = (name: string) => encodeApi.openPage(name).catch((e) => toast({ kind: "bad", title: "เปิดหน้าโหลดไม่ได้", detail: String(e) }));
  // คุณภาพ JPG · แถบเลื่อนส่งค่าทุกครั้งที่ขยับ เก็บลงไฟล์ตอนหยุดลาก 0.3 วินาที ไม่เขียนไฟล์ถี่
  const [jpg, setJpg] = useState<number | null>(null);
  const jpgTimer = useRef<number | undefined>(undefined);

  const recheck = async () => {
    setChecking(true);
    try {
      const [t, i] = await Promise.all([api.checkTools(), api.checkIcaros().catch(() => false)]);
      setTools(t); setIcaros(i);
    } catch (e) {
      toast({ kind: "bad", title: "ตรวจเครื่องมือไม่ได้", detail: String(e) });
    } finally { setChecking(false); }
  };
  // โปรแกรมเล่นในเครื่อง หาใหม่ทุกครั้งที่เปิดหัวข้อนี้ เผื่อเพิ่งลงโปรแกรม · หาไม่สำเร็จยังเลือกโปรแกรมหลักของ Windows ได้
  useEffect(() => {
    if (sec !== "player") return;
    playerApi.list().then(setPlayers, () => setPlayers({ players: [], systemDefault: !settings?.playerPath }));
    /* eslint-disable-next-line react-hooks/exhaustive-deps */
  }, [sec, settings?.playerPath, settings?.players]);
  useEffect(() => { void recheckEnc(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, []);
  useEffect(() => { void recheck(); graphApi.cacheInfo().then(setCache, () => setCache(null)); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, []);

  return { logInfo, setLogInfo, encs, setEncs, encDir, setEncDir, encChecking, setEncChecking, recheckEnc, latest, setLatest, latestChecking, setLatestChecking, checkLatest, openPage, jpg, setJpg, jpgTimer, recheck };
}
