/* หัวข้อที่เปิด แผงตั้งค่าแทร็ก mpv ไดรฟ์ โปรแกรมเล่น เครื่องมือ และย้ายที่เก็บรูปจับคู่
   แยกจาก SettingsPage.tsx ตอนจัดโครงไฟล์ตามความหมาย (BUGS ข้อ 155 ขั้น 8) เนื้อโค้ดยกมาทั้งก้อน */
import { useEffect, useState } from "react";
import { vidApi, linkApi, type PlayerList, type ToolCheck, inApp } from "../../lib/api";
import { listen } from "@tauri-apps/api/event";
import { useSettings } from "../../lib/settings";
import { useLibrary } from "../../lib/library";
import { useToast } from "../../components/Toasts";
import { useSkelPreview } from "../../lib/skelPreview";
import { takeSettingsSec, useDriveSpace } from "../../lib/drives";
import { useTrackPanel } from "../../lib/trackPanel";

/** จำหัวข้อล่าสุดไว้ ออกไปหน้าอื่นแล้วกลับมายังอยู่หัวข้อเดิม */
let lastSec = "folders";

export function useSetBase() {
  const [sec, setSec] = useState(() => { const p = takeSettingsSec(); if (p) lastSec = p; return lastSec; });
  const trackPanel = useTrackPanel();
  const [tpBig, setTpBig] = useState<{ src: string; rect: DOMRect; name: string } | null>(null);
  // มี libmpv-2.dll ให้ตัวเล่น mpv ไหม (ไม่มี โปรแกรมเล่นแบบ Aegisub แทน)
  const [mpvOk, setMpvOk] = useState<boolean | null>(null);
  useEffect(() => { if (inApp) vidApi.mpvAvailable().then(setMpvOk, () => setMpvOk(null)); }, []);
  const goSec = (id: string) => { lastSec = id; setSec(id); document.querySelector("[data-settingsscroll]")?.scrollTo(0, 0); };
  // ปุ่มจากหน้าอื่นสั่งเปิดหัวข้อ เช่นปุ่มดูความจุไดรฟ์บนชั้นวาง (BUGS ข้อ 88) · หน้านี้เปิดค้างแบบซ่อนอยู่ จึงรับผ่านเหตุการณ์
  useEffect(() => {
    const on = (e: Event) => { takeSettingsSec(); goSec((e as CustomEvent<string>).detail); };
    window.addEventListener("ms-settings-sec", on);
    return () => window.removeEventListener("ms-settings-sec", on);
    /* eslint-disable-next-line react-hooks/exhaustive-deps */
  }, []);
  const { settings, update } = useSettings();
  const { folders, scan, movies, loaded } = useLibrary();
  const drives = useDriveSpace();
  const toast = useToast();
  const skel = useSkelPreview();
  const [removing, setRemoving] = useState<string | null>(null);
  const [icarosHelp, setIcarosHelp] = useState(false);
  const [players, setPlayers] = useState<PlayerList | null>(null);
  const [tools, setTools] = useState<ToolCheck[] | null>(null);
  const [icaros, setIcaros] = useState<boolean | null>(null);
  const [checking, setChecking] = useState(false);
  const [cache, setCache] = useState<{ files: number; bytes: number } | null>(null);
  /** ย้ายปกจับคู่เดิมไปเก็บแบบใหม่ทีเดียว (มอคอัป *"เรื่องเดิมกดย้ายให้ทีเดียวได้"*) */
  const [askMigrate, setAskMigrate] = useState(false);
  const [migrating, setMigrating] = useState(false);
  const [migrateProg, setMigrateProg] = useState<{ done: number; total: number } | null>(null);
  useEffect(() => {
    if (!migrating || !inApp) return;
    let off: (() => void) | undefined;
    let live = true;
    listen<{ done: number; total: number }>("link-progress", (e) => setMigrateProg(e.payload)).then((u) => { if (live) off = u; else u(); });
    return () => { live = false; off?.(); setMigrateProg(null); };
  }, [migrating]);
  const migrate = async () => {
    if (migrating || !settings) return;
    setMigrating(true);
    try {
      const r = await linkApi.migrate(settings.linkStore);
      setAskMigrate(false);
      toast({ kind: r.failed ? "warn" : "ok", title: r.failed ? `ย้ายแล้ว ${r.done} เรื่อง และไม่สำเร็จ ${r.failed} เรื่อง` : `ย้ายแล้ว ${r.done} เรื่อง`, detail: "ไฟล์หนังกับรูปต้นฉบับไม่ถูกแตะ" });
      r.notes.forEach((n) => toast({ kind: "warn", title: "มีเรื่องที่ต้องดู", detail: n }));
    } catch (e) {
      toast({ kind: "bad", title: "ย้ายไม่สำเร็จ", detail: String(e) });
    } finally { setMigrating(false); }
  };
  /** บันทึกการใช้งาน (พี่กันเสนอ 12 พ.ย. 2569) · อ่านใหม่ทุกครั้งที่เปิดหัวข้อนี้ จำนวนรายการเพิ่มตามงานที่ทำ · bad = อ่านไม่ได้ ต่างจากยังไม่มีรายการ */
  return { sec, setSec, trackPanel, tpBig, setTpBig, mpvOk, setMpvOk, goSec, settings, update, folders, scan, movies, loaded, drives, toast, skel, removing, setRemoving, icarosHelp, setIcarosHelp, players, setPlayers, tools, setTools, icaros, setIcaros, checking, setChecking, cache, setCache, askMigrate, setAskMigrate, migrating, setMigrating, migrateProg, setMigrateProg, migrate };
}
