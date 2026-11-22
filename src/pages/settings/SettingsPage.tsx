/* หน้า 4 ตั้งค่า (ต้นแบบบรรทัด 1002–1100 · สเปกข้อ 9 · ขั้น 7)
   ตั้งแล้วมีผลทันที ไม่ต้องกดบันทึก · สวิตช์ชมพู = เปิด · ค่าเก็บในไฟล์ค่าตั้งของโปรแกรมผ่าน set_settings (store.rs เขียนแบบปลอดภัยมีสำรอง)
   ค่าที่นี่คือค่าตั้งต้น ทุกครั้งที่ใส่โปสเตอร์หรือตรวจไฟล์ยังเปลี่ยนเฉพาะครั้งนั้นได้ */
import { useEffect, useRef, useState } from "react";
import { GRAPH_IMG_DEFAULT, api, vidApi, encodeApi, graphApi, linkApi, logApi, pickExe, pickFolder, playerApi, type EncoderInfo, type LatestInfo, type LogInfo, type PlayerList, type Settings, type ToolCheck } from "../../lib/api";
import { kb } from "../../lib/popup";
import { listen } from "@tauri-apps/api/event";
import { inApp } from "../../lib/api";
import { useSettings } from "../../lib/settings";
import { useLibrary } from "../../lib/library";
import { useToast } from "../../components/Toasts";
import Dialog from "../../components/Dialog";
import Dropdown from "../../components/Dropdown";
import InfoTip from "../../components/InfoTip";
import { IcCheck, IcCoverL, IcCoverM, IcCoverS, IcTall, IcWide, IcFolder } from "../../components/icons";
import { CardIcon, J, Keep, Phr, Range, Seg, Skel, Switch } from "../../components/ui";
import { setSkelPreview, useSkelPreview } from "../../lib/skelPreview";
import { fmtSize } from "../../lib/format";
import { EXT_INFO, FILE_TYPES } from "../../lib/fileTypes";
import { DEFAULT_PATTERN } from "../../lib/extractName";
import { driveName, freePct, isLow, takeSettingsSec, useDriveSpace } from "../../lib/drives";
import { folderKey } from "../../lib/folders";
import "../../styles/av.css";
import ToneCard from "../../components/ToneCard";
import { DEFAULT_TONE, TONES } from "../../lib/tones";
import { TRACK_PANEL_DEFAULT, setTrackPanel, useTrackPanel } from "../../lib/trackPanel";
import ImageViewer from "../../components/ImageViewer";
import { IcExpand } from "../../components/icons";
import { IbTrash, IcRefresh } from "../../components/icons";
import { IbTick, IcClose, IcPlus } from "../../components/icons";
import { FolderIcon, IcPlayBox, LINK_MODES, SET_GROUPS, THANKS, TOOL_ROLE, TP_OPTS, WHITE_ICON, thankImg, thankImg2, verOf } from "./data";
import { GraphImgRows, LatestLine, LongNameRow, OvStartRow, PATTERN_TIP, PatternRow, SUB_PLAYER_TIP, SpekResRow } from "./rows";
/** จำหัวข้อล่าสุดไว้ ออกไปหน้าอื่นแล้วกลับมายังอยู่หัวข้อเดิม */
let lastSec = "folders";


/** ผลเช็กรุ่นล่าสุดครั้งล่าสุด จำไว้นอกหน้า (เปลี่ยนหน้าแล้วไม่หาย ไม่ออกเน็ตซ้ำเอง) */
let latestMemo: { at: Date; list: LatestInfo[] } | null = null;


export default function SettingsPage() {
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

  if (!settings) return <div className="setwrap" aria-busy="true">{[0, 1, 2, 3].map((i) => <div key={i} className="setcard"><Skel w="40%" h={14} /><Skel w="90%" h={12} style={{ marginTop: 14 }} /><Skel w="70%" h={12} style={{ marginTop: 10 }} /></div>)}</div>;

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

  return (
    <div className="setpage">
      <nav className="setnav" aria-label="หัวข้อตั้งค่า"><div className="setnav-in">
        {SET_GROUPS.map((g) => (
          <div key={g.title} className="setnav-g">
            <div className="setnav-t">{g.title}</div>
            {g.items.map((it) => (
              <button key={it.id} type="button" className={"setnav-b" + (sec === it.id ? " on" : "")} aria-current={sec === it.id ? "true" : undefined} data-setnav={it.id} onClick={() => goSec(it.id)}>{it.icon}<span>{it.label}</span></button>
            ))}
          </div>
        ))}
      </div></nav>
    <div className="setwrap" data-settings>
      <Dialog open={askMigrate} onClose={() => { if (!migrating) setAskMigrate(false); }} kind="work" confirm title={<>ย้าย <span className="nw">{migrateCount} เรื่อง</span>ไปแบบ {modeName}</>}
        actions={<>
          <button type="button" className="btn btn-ghost" onClick={() => { if (!migrating) setAskMigrate(false); }}>ยังไม่ย้าย</button>
          <button type="button" className={"btn " + (migrating ? "btn-wait" : "btn-main")} aria-disabled={migrating || undefined} data-link-migrate-ok onClick={migrate}><Keep all={["กำลังย้าย 000 จาก 000 เรื่อง…", "ย้ายเลย"]}>{migrating ? (migrateProg ? `กำลังย้าย ${migrateProg.done} จาก ${migrateProg.total} เรื่อง…` : "กำลังย้าย…") : "ย้ายเลย"}</Keep></button>
        </>}>
        <div className="small" style={{ fontSize: 14, color: "var(--txt2)" }}>
          <div><Phr>โปรแกรมทำไฟล์ใหม่ก่อน เมื่อสำเร็จแล้วจึงเอาของเก่าออก</Phr></div>
          <div><Phr>ของเก่าที่โปรแกรมคัดลอกไว้ย้ายลงถังขยะ ส่วนไฟล์ที่โปรแกรมไม่ได้สร้างจะไม่ถูกลบ</Phr></div>
          <div><Phr>เรื่องที่รูปต้นฉบับหายไปแล้วย้ายเป็นแบบจับคู่อย่างเดียวไม่ได้ จึงคงแบบเดิมไว้แล้วบอกให้รู้</Phr></div>
          <div>ไฟล์หนังกับรูปต้นฉบับไม่ถูกแตะ</div>
        </div>
      </Dialog>
      {/* ---------- โฟลเดอร์หนัง ---------- */}
      <div className="setcard" data-setcard="folders" hidden={sec !== "folders"}><h3>โฟลเดอร์หนัง</h3>
        <div className="small"><Phr>โปรแกรมอ่านหนังจากโฟลเดอร์ในรายการนี้มาขึ้นชั้น</Phr></div>
        {settings.folders.map((f) => {
          const st = countOf(f);
          return (
            <div key={f} className="folder" data-folder={f}><FolderIcon /><div className="grow" style={{ wordBreak: "break-all" }}>{f}
              <span className="small" style={{ display: "block" }} data-folder-count>{st && !st.ok ? <span style={{ color: "var(--bad-ink)" }}>หาโฟลเดอร์ไม่เจอ ไดรฟ์อาจถอดออกอยู่</span> : <span className="nw">{folderCount(f, st) ?? "—"}{folderCount(f, st) != null && " เรื่อง"}</span>}</span></div>
              <button type="button" className="btn btn-bad btn-sm" onClick={() => setRemoving(f)} data-removefolder><IbTrash size={15} />เอาออกจากชั้น</button></div>
          );
        })}
        <div className="small" style={{ margin: "8px 0 10px" }}><Phr>เอาออกจากชั้นแล้วไฟล์ในเครื่องยังอยู่ครบ ไม่ถูกลบ</Phr></div>
        <button type="button" className="btn btn-ghost btn-sm" onClick={addFolder} data-addfolder><IcFolder size={15} />เพิ่มโฟลเดอร์</button>
        {/* ความจุไดรฟ์ (BUGS ข้อ 88 พี่กันแทรก 13 พ.ย. 2569 "เเสดงความจุของไดรฟ์ที่โฟลเดอร์หนังใช้อยู่ด้วย") · ไดรฟ์ของโปรแกรมรวมด้วย เพราะบันทึกค่าตั้งไม่ได้ตอนไดรฟ์นั้นเต็ม */}
        {/* คำอธิบายเป็นตัวเล็กใต้หัวข้อแบบแถวอื่นในหน้าตั้งค่า ไม่ซ่อนใน ⓘ (พี่กันทัก 13 พ.ย. 2569 "ปกติ หน้าตั้งค่า พวกคำอธิบาย มันอยู่ใต้หัวข้อนี่นา") */}
        <h4 className="imghead" style={{ marginTop: 16 }}>ความจุไดรฟ์</h4>
        <div className="small" style={{ marginBottom: 2 }}><Phr>{"ไดรฟ์ที่โฟลเดอร์หนังอยู่ และไดรฟ์ที่ชั้นหนังเก็บค่าตั้ง คลังหนัง และภาพปก  ถ้าไดรฟ์ไหนเหลือที่ว่างไม่ถึง 10% ชั้นวางจะเตือน"}</Phr></div>
        <div data-drives>
          {drives.list == null
            ? (drives.failed
              ? <div className="small" data-drives-bad><span style={{ color: "var(--bad-ink)" }}>อ่านความจุไดรฟ์ไม่ได้</span> <button type="button" className="latlink" onClick={drives.refresh}>ลองอีกครั้ง</button></div>
              : <div aria-busy="true"><Skel w="55%" h={12} style={{ marginTop: 8 }} /><Skel w="100%" h={8} style={{ marginTop: 8 }} /></div>)
            : drives.list.map((d) => {
              const low = isLow(d), used = Math.round(((d.total - d.free) / d.total) * 100);
              return <div key={d.root} className={"drive" + (low ? " low" : "")} data-drive={d.root}>
                <div className="drivehead"><b>{driveName(d.root)}</b>
                  <span className="small">ว่าง <span className="nw">{fmtSize(d.free)}</span> จาก <span className="nw">{fmtSize(d.total)}</span>{!low && <> เหลือ <span className="nw" data-drive-pct>{freePct(d)}</span></>}</span>
                  {low && <span className="drivewarn" data-drive-low title="ไดรฟ์ที่เหลือที่ว่างไม่ถึง 10% จะเตือนที่ชั้นวาง"><CardIcon kind="warn" />เหลือ {freePct(d)}</span>}</div>
                <div className="drivebar" role="img" aria-label={`ใช้ไป ${used}%`}><i style={{ width: `${used}%` }} /></div>
                <div className="small"><Phr>{[d.folders.length ? `มีโฟลเดอร์หนัง ${d.folders.length} โฟลเดอร์` : "", d.app ? "ชั้นหนังเก็บค่าตั้ง คลังหนัง และภาพปกไว้ที่ไดรฟ์นี้" : ""].filter(Boolean).join(" และ")}</Phr></div>
              </div>;
            })}
        </div>
        <div className="setrow setmain" style={{ marginTop: 10, borderTop: "1px solid var(--line)" }}><div className="lbl">อ่านโฟลเดอร์ใหม่ทุกครั้งที่เปิดโปรแกรม<span className="small"><Phr>หนังที่โหลดมาเพิ่มจะขึ้นชั้นเอง</Phr></span></div>
          <Switch on={settings.rescanOnStart} onChange={(v) => set({ rescanOnStart: v })} label="อ่านโฟลเดอร์ใหม่ทุกครั้งที่เปิดโปรแกรม" /></div>
      </div>

      {/* ---------- ใส่โปสเตอร์ ---------- */}
      <div className="setcard" data-setcard="poster" hidden={sec !== "poster"}><h3>ใส่โปสเตอร์</h3>
        <div className="setrow"><div className="lbl">ตรวจไฟล์ต้นทางก่อนครอบ<span className="small"><Phr>ถ้าไฟล์เสียอยู่แล้วจะบอกก่อนลงมือ</Phr></span></div>
          <Switch on={settings.checkSourceBefore} onChange={(v) => set({ checkSourceBefore: v })} label="ตรวจไฟล์ต้นทางก่อนครอบ" /></div>
        <div className="setrow"><div className="lbl">ตรวจไฟล์ใหม่หลังครอบเสร็จ<span className="small"><Phr>เทียบว่าภาพ เสียง และซับครบเท่าต้นทาง</Phr></span></div>
          <Switch on={settings.checkOutputAfter} onChange={(v) => set({ checkOutputAfter: v })} label="ตรวจไฟล์ใหม่หลังครอบเสร็จ" /></div>
        <div className="setrow" data-seg260><div className="lbl">ไฟล์ที่ได้</div>
          <Seg label="ไฟล์ที่ได้" value={settings.outputFormat} onChange={(v) => set({ outputFormat: v })} options={[{ value: "mkv", label: "MKV" }, { value: "mp4", label: "MP4" }]} /></div>
        <div className="setrow" data-seg260><div className="lbl">ไฟล์เดิมหลังครอบ</div>
          <Seg label="ไฟล์เดิมหลังครอบ" value={settings.originalAfter} onChange={(v) => set({ originalAfter: v })} options={[{ value: "keep", label: <><IbTick size={14} />เก็บไว้</> }, { value: "trash", label: <><IbTrash size={14} />ลบเมื่อตรวจผ่าน</> }]} /></div>
        <div className="setrow"><div className="lbl">โฟลเดอร์เก็บไฟล์เดิม
          <span className="small" style={{ wordBreak: "break-all" }} data-originals>{settings.originalsFolder || <Phr>ข้างไฟล์หนังในโฟลเดอร์ชื่อ “ไฟล์เดิม”</Phr>}</span>
          <span className="small"><Phr>โฟลเดอร์นี้ต้องอยู่ไดรฟ์เดียวกับไฟล์หนัง ถ้าอยู่คนละไดรฟ์จะใช้โฟลเดอร์ “ไฟล์เดิม” ข้างไฟล์หนังแทน</Phr></span></div>
          <div style={{ display: "flex", gap: 6 }}>
            {settings.originalsFolder && <button type="button" className="btn btn-ghost btn-sm" onClick={() => set({ originalsFolder: "" })}>ใช้ข้างไฟล์หนัง</button>}
            <button type="button" className="btn btn-ghost btn-sm" onClick={changeOriginals} data-orig-change><IcFolder size={15} />เปลี่ยน</button></div></div>
        <div className="setrow" data-seg260><div className="lbl">รูปโปสเตอร์ที่แนบ<span className="small"><Phr>ใช้กับรูปที่ต้องแปลงและรูปที่ครอป</Phr></span></div>
          <Seg label="รูปโปสเตอร์ที่แนบ" value={settings.posterFormat} onChange={(v) => set({ posterFormat: v })} options={[{ value: "jpg", label: "JPG" }, { value: "png", label: "PNG" }]} /></div>
        <div className="setrow" style={{ display: "block" }}><div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <span style={{ fontSize: 14, whiteSpace: "nowrap" }}>คุณภาพ JPG</span>
          <Range value={jpgNow} min={50} max={100} onChange={onJpg} label="คุณภาพ JPG" format={(v) => `${v}%`} />
          <span className="small" style={{ whiteSpace: "nowrap", minWidth: 36, textAlign: "right" }} data-jpgq>{jpgNow}%</span></div></div>
        <div className="setrow"><div className="lbl">ย่อรูปโปสเตอร์ที่ใหญ่เกิน<span className="small"><Phr>ย่อเหลือ</Phr> <span className="nw">1000 × 1500 px</span> <Phr>เพื่อไม่ให้ไฟล์หนังบวม  และเปิดปิดที่หน้าครอปได้ด้วย</Phr></span></div>
          <Switch on={settings.shrinkLargePosters} onChange={(v) => set({ shrinkLargePosters: v })} label="ย่อรูปโปสเตอร์ที่ใหญ่เกิน" /></div>
      </div>

      {/* ---------- เก็บรูปที่จับคู่ไว้ที่ไหน 3 แบบ ---------- */}
      <div className="setcard" data-setcard="link" hidden={sec !== "link"}><h3>เก็บรูปที่จับคู่ไว้ที่ไหน</h3>
        <div className="small" style={{ marginBottom: 10 }}><Phr>ใช้ตอนกดยืนยันในหน้าจับคู่ปก ติ๊กได้หลายแบบพร้อมกัน และทุกแบบไม่แตะไฟล์หนัง โปรแกรมจำที่อยู่รูปต้นฉบับไว้เสมอ ถ้าติ๊กจับคู่อย่างเดียวคู่กับแบบอื่น ก็จะคัดลอกตามแบบนั้นด้วย</Phr></div>
        <div className="modes three" role="group" aria-label="เก็บรูปที่จับคู่ไว้ที่ไหน">
          {LINK_MODES.map((x) => {
            const on = stores.includes(x.v);
            return (
              <div key={x.v} className={"mode" + (on ? " on" : "")} {...kb(() => toggleStore(x.v))} role="checkbox" aria-checked={on} data-link-mode={x.v}>
                <h4><span className={"cbx " + (on ? "on" : "off")}>{on && <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="4" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5" /></svg>}</span>{x.title}{x.rec && <span className="extag" style={{ marginLeft: 2 }}>{x.rec}</span>}</h4>
                <div className="small"><Phr>{x.lines[0]}</Phr></div>
                {x.sample && <div className="pathsample">{x.sample.map((l) => <div key={l}>{l}</div>)}</div>}
                {x.lines[1] && <div className="small"><Phr>{x.lines[1]}</Phr></div>}
                {/* ติ๊กเก็บสำเนาไว้ในโปรแกรม แล้วไดรฟ์ของโปรแกรมเหลือไม่ถึง 10% เตือนในการ์ดนี้ (BUGS ข้อ 88 ④ พี่กันสั่ง "ถ้าเก็บไว้ในโปรแกรม เเล้วเนื้อที่ต่ำกว่า10% ต้องเตือนตรงนี้ด้วย") */}
                {x.v === "app" && on && appLow && <div className="stat warn" style={{ marginTop: 8 }} data-link-app-low><CardIcon kind="warn" /><div>
                  <b>{driveName(appLow.root)} เหลือที่ว่าง <span className="nw">{fmtSize(appLow.free)}</span> หรือ <span className="nw">{freePct(appLow)}</span></b>
                  <Phr>สำเนาปกที่เก็บในโปรแกรมอยู่บนไดรฟ์นี้ ถ้าไดรฟ์เต็มจะยืนยันปกไม่ได้ ให้ย้ายไฟล์ที่ไม่ใช้ออกก่อน หรือเลือกคัดลอกไปไว้ข้างไฟล์หนังแทน</Phr></div></div>}
              </div>
            );
          })}
        </div>
        <div className="small" style={{ marginTop: 10 }}><Phr>ย้ายหรือเปลี่ยนชื่อไฟล์หนังผ่านชั้นหนัง ปกจะตามไปด้วย ถ้าย้ายด้วย Explorer ในไดรฟ์เดียวกัน โปรแกรมยังตามเจอ แต่ย้ายข้ามไดรฟ์ต้องจับคู่ใหม่ และการเปลี่ยนแบบทีหลังมีผลเฉพาะเรื่องที่จับคู่ใหม่</Phr></div>
        {migrateCount > 0 && (
          <div className="minirow" style={{ marginTop: 10 }} data-link-migrate>
            <span className="small" style={{ alignSelf: "center" }}>มี <span className="nw">{migrateCount} เรื่อง</span>ที่จับคู่ไว้แบบอื่น</span>
            <button type="button" className={"btn btn-sm " + (migrating ? "btn-wait" : "btn-ghost")} aria-disabled={migrating || undefined} data-link-migrate-go onClick={() => { if (!migrating) setAskMigrate(true); }}><Keep all={["กำลังย้าย 000 จาก 000 เรื่อง…", "ย้ายมาแบบนี้ทีเดียว"]}>{migrating ? (migrateProg ? `กำลังย้าย ${migrateProg.done} จาก ${migrateProg.total} เรื่อง…` : "กำลังย้าย…") : "ย้ายมาแบบนี้ทีเดียว"}</Keep></button>
          </div>
        )}
      </div>

      {/* ---------- เสียงและซับ ----------
          ส่วนตั้งค่าแทร็กขึ้นแบบไหน (BUGS ข้อ 33 พี่กันเลือกแบบ 2 กางใต้แถวที่กด 12 พ.ย. 2569 "ชอบแบบ2 แต่ 1 3 เอาไว้ เอาไปใส่ในตั้งค่าละกัน เผื่ออยากเปลี่ยน") */}
      <div className="setcard" data-setcard="av" hidden={sec !== "av"}><h3>เสียงและซับ</h3>
        {/* การ์ดมีรูปตัวอย่างจากหน้าจริง ความละเอียดสองเท่า กดปุ่มมุมรูปขยายดูเต็มจอ (พี่กันสั่ง 12 พ.ย. 2569 "หน้าตั่งค่า ใส่รูปไว้หน่อยนะ แบบความละเอียดสูง ตอนจะเลือกแบบ 1 3 จะได้เห็นภาพ") */}
        <div className="setrow" data-track-panel-set style={{ display: "block" }}><div className="lbl">ส่วนตั้งค่าแทร็กขึ้นแบบ
          <span className="small"><Phr>{"กดแถวเสียงหรือซับในตารางแทร็กแล้ว ส่วนตั้งค่าแทร็กขึ้นตามแบบที่เลือก  กดการ์ดเพื่อเลือก หรือกดปุ่มมุมรูปเพื่อขยายดูเต็มจอ"}</Phr></span></div>
          <div className="tpcards" role="radiogroup" aria-label="ส่วนตั้งค่าแทร็กขึ้นแบบ">
            {TP_OPTS.map((o) => { const on = trackPanel === o.value; return (
              <div key={o.value} className={"tpcard" + (on ? " on" : "")} {...kb(() => setTrackPanel(o.value))} role="radio" aria-checked={on} data-track-panel={o.value}>
                <span className="tpimg"><img src={o.img} alt={`ตัวอย่างแบบ${o.name}`} draggable={false} />
                  <button type="button" className="bigbtn tpbig" title="ขยายดูเต็มจอ" aria-label={`ขยายดูรูปแบบ${o.name}เต็มจอ`} data-tp-big={o.value} onKeyDown={(e) => e.stopPropagation()}
                    onClick={(e) => { e.stopPropagation(); setTpBig({ src: o.img, rect: (e.currentTarget.parentElement ?? e.currentTarget).getBoundingClientRect(), name: `ส่วนตั้งค่าแทร็กแบบ${o.name}` }); }}><IcExpand size={14} /></button></span>
                <span className="tpname"><span className={"radio" + (on ? " on" : "")} aria-hidden="true" />{o.name}{o.value === TRACK_PANEL_DEFAULT && <span className="tptag">ค่าตั้งต้น</span>}</span>
                <span className="small"><Phr>{o.desc}</Phr></span>
              </div>); })}
          </div></div>
        {tpBig && <ImageViewer src={tpBig.src} thumb={tpBig.src} originRect={tpBig.rect} info={{ name: tpBig.name }} onClose={() => setTpBig(null)} />}
        {/* BUGS ข้อ 111 พี่กันสั่ง 14 พ.ย. 2569 "ทำตอนนี้เลย เเต่ระบบเล่นของ aegi ที่ทำมาไม่ลบ เเต่เอาไว้เปิดตอนตั้งค่าได้" · ค่าตั้งต้น mpv (แคลร์ตั้ง) */}
        <div className="setrow" data-subplayer-set><div className="lbl"><span>ตัวเล่นหนังในหน้าแก้ซับ <InfoTip title="ตัวเล่นหนังสองแบบ" tip={SUB_PLAYER_TIP} /></span>
          <span className="small"><Phr>{mpvOk === false ? "ไม่พบไฟล์ libmpv-2.dll ในโฟลเดอร์เครื่องมือ โปรแกรมจึงเล่นแบบ Aegisub แทน" : "กดปุ่มเล่นใต้ภาพหนังหรือกด Ctrl+P แล้วโปรแกรมเล่นด้วยตัวที่เลือก"}</Phr></span></div>
          <Seg label="ตัวเล่นหนังในหน้าแก้ซับ" value={settings.subPlayer === "aegisub" ? "aegisub" : "mpv"} onChange={(v) => set({ subPlayer: v })} options={[{ value: "mpv", label: "mpv" }, { value: "aegisub", label: "แบบ Aegisub" }]} /></div>
        {/* รูปแบบชื่อไฟล์ที่แยก แบบ gMKVExtractGUI (BUGS ข้อ 130 พี่กันสั่ง "เอาเข้าคิว") · ค่าตั้งต้นได้ชื่อแบบเดิม (แคลร์ตั้ง) */}
        <div className="setrow" data-extract-pattern-set style={{ display: "block" }}><div className="lbl"><span>รูปแบบชื่อไฟล์ที่แยก <InfoTip title="รูปแบบชื่อไฟล์ที่แยก" tip={PATTERN_TIP} /></span>
          <span className="small"><Phr>ใช้ตั้งชื่อไฟล์แทร็กภาพ เสียง และซับ ตอนแยกออกจากหนังในหน้าเสียงและซับ</Phr></span></div>
          <PatternRow value={settings.extractPattern || DEFAULT_PATTERN} onChange={(v) => set({ extractPattern: v })} /></div>
      </div>

      {/* ---------- ตรวจไฟล์ ---------- */}
      <div className="setcard" data-setcard="check" hidden={sec !== "check"}><h3>ตรวจไฟล์</h3>
        <div className="setrow" data-seg260><div className="lbl">แบบตรวจตั้งต้น</div>
          <Seg label="แบบตรวจตั้งต้น" value={settings.defaultCheck} onChange={(v) => set({ defaultCheck: v })} options={[{ value: "quick", label: <><IcCheck size={14} />ตรวจแบบเร็ว</> }, { value: "full", label: <><IcCheck size={14} />ตรวจละเอียด</> }]} /></div>
        <div className="setrow"><div className="lbl">ตรวจแบบเร็วทุกเรื่องตอนเปิดโปรแกรม<span className="small"><Phr>ช่วยจับไฟล์ที่เสียระหว่างย้ายไดรฟ์</Phr></span></div>
          <Switch on={settings.quickCheckOnStart} onChange={(v) => set({ quickCheckOnStart: v })} label="ตรวจแบบเร็วทุกเรื่องตอนเปิดโปรแกรม" /></div>
        <div className="setrow"><div className="lbl">เตือนให้ตรวจซ้ำ<span className="small"><Phr>จุดบนปกเปลี่ยนเป็นสีเหลืองเมื่อถึงเวลา</Phr></span></div>
          <span data-recheck data-seg260><Dropdown label="เตือนให้ตรวจซ้ำ" value={String(settings.recheckReminderDays)} onChange={(v) => set({ recheckReminderDays: Number(v) as Settings["recheckReminderDays"] })}
            options={[{ value: "0", label: "ไม่ต้องเตือน" }, { value: "7", label: "ทุก 7 วัน" }, { value: "30", label: "ทุก 30 วัน" }, { value: "90", label: "ทุก 90 วัน" }]} /></span></div>
        {/* BUGS ข้อ 30 พี่กันเคาะ "ตั้งค่าได้ว่าถามหรือบันทึกข้างไฟล์" · ค่าตั้งต้นถาม (แคลร์ตั้ง) */}
        <div className="setrow" data-hashask><div className="lbl"><span>ถามที่บันทึกไฟล์ .sha256 ทุกครั้ง <InfoTip title="ไฟล์ .sha256 คืออะไร" tip={{ w: "ไฟล์ข้อความเล็ก ๆ ที่จดค่า SHA-256 ของไฟล์หนังไว้ ใช้เทียบภายหลังว่าไฟล์ยังครบทุกไบต์ไหม โปรแกรม 7-Zip และคำสั่ง sha256sum เปิดตรวจได้ บันทึกจากปุ่มในหน้าค่า hash ของหน้าข้อมูลไฟล์" }} /></span>
          <span className="small"><Phr>{"เปิดไว้ โปรแกรมเปิดหน้าต่างให้เลือกที่บันทึกทุกครั้ง ปิดไว้ บันทึกข้างไฟล์หนังทันที"}</Phr></span></div>
          <Switch on={settings.hashSaveAsk !== false} onChange={(v) => set({ hashSaveAsk: v })} label="ถามที่บันทึกไฟล์ .sha256 ทุกครั้ง" /></div>
      </div>

      {/* ---------- ชั้นวาง ---------- */}
      <div className="setcard" data-setcard="tone" hidden={sec !== "tone"}><h3>โทนสี</h3>
        <div className="small" style={{ marginBottom: 12 }}><Phr>กดแล้วเปลี่ยนทั้งโปรแกรมทันทีและโปรแกรมจำไว้ ส่วนรูปโปสเตอร์กับสีกราฟเสียงไม่เปลี่ยนตาม</Phr></div>
        <div className="tncards" role="radiogroup" aria-label="โทนสี">
          {TONES.map((t) => <ToneCard key={t.id} t={t} on={(settings.tone || DEFAULT_TONE) === t.id} onPick={() => void set({ tone: t.id })} />)}
        </div>
      </div>

      <div className="setcard" data-setcard="shelf" hidden={sec !== "shelf"}><h3>ชั้นวาง</h3>
        <div className="setrow" data-seg-cover><div className="lbl">ขนาดปก</div>
          <Seg label="ขนาดปก" value={settings.coverSize} onChange={(v) => set({ coverSize: v })} options={[{ value: "s", label: <><IcCoverS />เล็ก</> }, { value: "m", label: <><IcCoverM />กลาง</> }, { value: "l", label: <><IcCoverL />ใหญ่</> }]} /></div>
        <div className="setrow" data-seg-cover><div className="lbl">ดูปก<span className="small"><Phr>เรื่องที่แนบทั้งปกตั้งและปกนอนจะขึ้นแบบที่เลือก ส่วนเรื่องที่มีแบบเดียวขึ้นแบบนั้น</Phr></span></div>
          <Seg label="ดูปก" value={settings.coverOrient} onChange={(v) => set({ coverOrient: v })} options={[{ value: "tall", label: <><IcTall />ปกตั้ง</> }, { value: "wide", label: <><IcWide />ปกนอน</> }]} /></div>
        <div className="setrow"><div className="lbl">ชื่อไฟล์ใต้ปก</div><Switch on={settings.showNames} onChange={(v) => set({ showNames: v })} label="ชื่อไฟล์ใต้ปก" /></div>
        <LongNameRow />
        <div className="setrow"><div className="lbl">ภาพจากหนังในเรื่องที่ยังไม่มีปก<span className="small"><Phr>{"เปิดแล้วเรื่องที่ยังไม่มีปกจะขึ้นภาพหนึ่งภาพที่สุ่มจากในหนังแทนแถบทะแยง ทั้งบนชั้นวาง ในตาราง และแผงขวา ปิดแล้วกลับเป็นแถบทะแยงตามเดิม ภาพเก็บในโฟลเดอร์ของโปรแกรมโดยไม่เขียนลงไฟล์หนัง และไม่นับ" + J + "เป็นปก ตัวกรองจึงยังนับเรื่องนั้นว่ายังไม่มีปก ปุ่มเดียวกันนี้อยู่ที่ปุ่มการแสดงผลบนชั้นวางด้วย"}</Phr></span></div><Switch on={settings.showFrames} onChange={(v) => set({ showFrames: v })} label="ภาพจากหนังในเรื่องที่ยังไม่มีปก" /></div>
        <div className="setrow"><div className="lbl">จุดสีบอกสภาพไฟล์</div><Switch on={settings.showDots} onChange={(v) => set({ showDots: v })} label="จุดสีบอกสภาพไฟล์" /></div>
        <div className="setrow"><div className="lbl">แสดงโครงจางค้างไว้<span className="small"><Phr>ไว้ดูหน้าตาตอนรออ่านโฟลเดอร์ และกลับเป็นปิดเองเมื่อปิดโปรแกรม</Phr></span></div>
          <span data-skelpreview style={{ display: "inline-flex" }}><Switch on={skel} onChange={setSkelPreview} label="แสดงโครงจางค้างไว้" /></span></div>
      </div>

      {/* ---------- เปิดเล่นหนัง ---------- */}
      {/* พี่กันสั่ง 9 พ.ย. 2569 ค่าตั้งต้นคือ MPC-HC · ดูในเครื่องว่ามีโปรแกรมเล่นตัวไหน · มีปุ่มเปลี่ยนค่าตั้งต้น · มีปุ่มเพิ่มโปรแกรม */}
      <div className="setcard" data-setcard="player" hidden={sec !== "player"}><h3>เปิดเล่นหนัง</h3>
        <div className="hint" style={{ margin: "0 0 10px" }}><Phr>กดปุ่มเปิดเล่นแล้วโปรแกรมจะส่งไฟล์ไปโปรแกรมที่เป็นค่าตั้งต้น ถ้ายังไม่ได้เลือกจะใช้ MPC-HC ถ้าเครื่องไม่มีจะใช้ตัวอื่นที่หาเจอ แล้วจึงใช้โปรแกรมหลักของ Windows</Phr></div>
        {players == null
          ? [0, 1, 2].map((i) => <div key={i} className="folder plrow" aria-busy="true"><Skel w={18} h={18} r={4} /><div className="grow"><Skel w="30%" h={13} /><div style={{ height: 6 }} /><Skel w="70%" h={11} /></div><Skel w={150} h={32} r={9} /></div>)
          : <>
            {players.players.map((p) => (
              <div key={p.path} className="folder plrow" data-player={p.path} data-player-default={p.isDefault || undefined}>
                {p.icon ? <img className="plicon" src={p.icon} alt="" /> : <IcPlayBox />}
                <div className="grow"><b>{p.name}</b><div className="small">{p.path}</div>
                  {!p.exists && <div className="plmiss" data-player-missing>หาไฟล์ไม่เจอ อาจถูกย้ายหรือถอนไปแล้ว</div>}</div>
                {p.isDefault
                  ? <span className="pldef"><IbTick size={14} />ค่าตั้งต้น</span>
                  : <button type="button" className={"btn btn-sm plset " + (p.exists ? "btn-ghost" : "btn-wait")} aria-disabled={!p.exists || undefined} title={p.exists ? undefined : "หาไฟล์ไม่เจอ"} data-player-set onClick={() => { if (p.exists) void set({ playerPath: p.path }); }}>ตั้งเป็นค่าตั้งต้น</button>}
                {p.added
                  ? <button type="button" className="icon-btn" aria-label={"เอา " + p.name + " ออกจากรายการ"} title="เอาออกจากรายการ ไฟล์โปรแกรมไม่ถูกลบ" data-player-remove onClick={() => void removePlayer(p.path, p.isDefault)}><IcClose size={14} /></button>
                  : <span className="plgap" />}
              </div>
            ))}
            <div className="folder plrow" data-player="system" data-player-default={players.systemDefault || undefined}>
              {players.systemIcon ? <img className="plicon" src={players.systemIcon} alt="" /> : <IcPlayBox />}
              <div className="grow"><b>โปรแกรมหลักของ Windows</b><div className="small"><Phr>โปรแกรมที่ Windows ตั้งไว้เปิดไฟล์ชนิดนั้น แต่เปิดตรงนาทีไม่ได้ และส่งเสียงกับซับที่จับคู่ไม่ได้</Phr></div></div>
              {players.systemDefault
                ? <span className="pldef"><IbTick size={14} />ค่าตั้งต้น</span>
                : <button type="button" className="btn btn-ghost btn-sm plset" data-player-set onClick={() => void set({ playerPath: "system" })}>ตั้งเป็นค่าตั้งต้น</button>}
              <span className="plgap" />
            </div>
          </>}
        <div className="minirow" style={{ marginTop: 12 }}><button type="button" className="btn btn-ghost" data-player-add onClick={() => void addPlayer()}><IcPlus size={15} />เพิ่มโปรแกรม</button></div>
      </div>

      {/* ---------- เครื่องมือเบื้องหลัง ---------- */}
      <div className="setcard" data-setcard="tools" hidden={sec !== "tools"}><h3>เครื่องมือเบื้องหลัง</h3>
        {tools == null
          ? [0, 1, 2, 3, 4, 5].map((i) => <div key={i} className="setrow" aria-busy="true"><Skel w="45%" h={12} /><Skel w={90} h={20} r={10} /></div>)
          : tools.map((t) => (
            <div key={t.name} className="setrow" data-tool={t.name}><div className="lbl">{t.name}{t.ok && verOf(t.version) && <span className="setver" data-toolver>รุ่น {verOf(t.version)}</span>}<span className="small">{TOOL_ROLE[t.name] ?? ""}{t.ok ? "" : ` ${t.version}`}</span></div>
              {t.ok ? <span className="toolok">พร้อมใช้งาน</span> : <span className="toolbad">ไม่พร้อม</span>}</div>))}
        <div className="setrow" data-tool="Icaros"><div className="lbl">Icaros<span className="small"><Phr>ให้ Windows โชว์โปสเตอร์เป็นไอคอนไฟล์ ถ้าไม่ลงก็ยังใช้โปรแกรมนี้ได้ครบ</Phr></span></div>
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            {icaros == null ? <Skel w={80} h={20} r={10} /> : icaros ? <span className="toolok">ลงแล้ว</span> : <span className="toolwarn">ยังไม่ได้ลง</span>}
            {icaros === false && <button type="button" className="btn btn-ghost btn-sm" onClick={() => setIcarosHelp(true)} data-icaroshelp>วิธีลง</button>}</div></div>
        <div className="setrow"><div className="lbl small" style={{ margin: 0 }}><Phr>ถ้าซ่อนหรือย้ายเครื่องมือ กดตรวจใหม่เพื่อดูสถานะล่าสุด</Phr></div>
          <button type="button" className={"btn btn-sm " + (checking ? "btn-wait" : "btn-ghost")} aria-disabled={checking || undefined} onClick={() => { if (!checking) void recheck(); }} data-retools><Keep icon={<IcRefresh size={15} />} all={["กำลังตรวจ", "ตรวจเครื่องมือใหม่"]}>{checking ? "กำลังตรวจ" : "ตรวจเครื่องมือใหม่"}</Keep></button></div>
      </div>

      {/* ---------- บันทึกการใช้งาน (พี่กันเสนอ 12 พ.ย. 2569 "ทำ log ของโปรแกรม ว่าเราทำอะไรในโปรแกรมมั่ง เอาไว้ตรวจทาน") · ไฟล์อยู่ในเครื่อง ไม่ส่งออกเน็ต ---------- */}
      <div className="setcard" data-setcard="log" hidden={sec !== "log"}>
        <h3 style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10 }}><span>บันทึกการใช้งาน</span>
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => logApi.openDir().catch((e) => toast({ kind: "bad", title: "เปิดโฟลเดอร์บันทึกไม่ได้", detail: String(e) }))} data-actlog-open><IcFolder size={15} />เปิดโฟลเดอร์บันทึก</button></h3>
        <div className="small" style={{ marginBottom: 6 }}><Phr>{"โปรแกรมจดงานที่เขียน ย้าย หรือลบไฟล์ไว้ในเครื่องนี้ ใช้ย้อนดูว่ากดอะไรไปก่อนเจอปัญหา  บันทึกไม่ถูกส่งออกไปที่ไหน และเก็บไว้ 12 เดือนล่าสุด"}</Phr></div>
        {/* คำอธิบายเป็นตัวเล็กใต้หัวข้อแบบแถวอื่นในหน้าตั้งค่า ไม่ซ่อนใน ⓘ (BUGS ข้อ 95 พี่กันทัก 13 พ.ย. 2569 "ปกติ หน้าตั้งค่า พวกคำอธิบาย มันอยู่ใต้หัวข้อนี่นา") */}
        <div className="setrow" data-actlog-count><div className="lbl">เดือนนี้จดไว้<span className="small" data-actlog-what><Phr>{`จดวันเวลา ชื่องาน และค่าที่ส่งไป ของงานที่เขียน ย้าย หรือลบไฟล์ เช่นใส่โปสเตอร์ รวมไฟล์ แปลงเสียง  รวมทั้งค่า${J}ตั้งที่เปลี่ยนและไฟล์ที่ลงถังขยะ  ส่วน${J}การ${J}เปิดดู การเล่นหนัง และการเลื่อนหน้าไม่จด  บันทึกแยกเดือนละไฟล์ เปิดด้วย Notepad ได้`}</Phr></span></div>
          {logInfo == null ? <Skel w={90} h={20} r={10} /> : logInfo === "bad" ? <span className="toolbad">อ่านบันทึกไม่ได้</span> : <span className="setver" style={{ whiteSpace: "nowrap", flex: "none" }} data-actlog-lines>{logInfo.monthLines.toLocaleString("en-US")} รายการ</span>}</div>
        {/* กดที่อยู่แล้วเปิดโฟลเดอร์ใน Explorer (BUGS ข้อ 96 พี่กันทัก 13 พ.ย. 2569 "กดไปไม่ได้อ่ะ" · เดิมเป็นตัวหนังสือธรรมดา ต้องไปกดปุ่มที่หัวการ์ด) */}
        <div className="setrow"><div className="lbl">ที่เก็บ{logInfo && logInfo !== "bad"
          ? <button type="button" className="pathlink" title="กดเพื่อเปิดโฟลเดอร์นี้" onClick={() => logApi.openDir().catch((e) => toast({ kind: "bad", title: "เปิดโฟลเดอร์บันทึกไม่ได้", detail: String(e) }))} data-actlog-dir>{logInfo.dir}</button>
          : <span className="small" data-actlog-dir>—</span>}</div></div>
      </div>

      {/* ---------- ตัวแปลงเสียง (มอคอัปเสียงและซับ หัวข้อ 8) · ตัวที่แนบมากับโปรแกรม กับตัวที่วางเองในโฟลเดอร์ตัวแปลง (ตัวที่สัญญาอนุญาตไม่ให้แจก) ---------- */}
      <div className="setcard" data-setcard="encoders" hidden={sec !== "encoders"}>
        <h3 style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10 }}><span>ตัวแปลงเสียง</span>
          <span style={{ display: "flex", gap: 6 }}>
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => encodeApi.openDir().catch((e) => toast({ kind: "bad", title: "เปิดโฟลเดอร์ตัวแปลงไม่ได้", detail: String(e) }))} data-encdir><IcFolder size={15} />เปิดโฟลเดอร์ตัวแปลง</button>
            <button type="button" className={"btn btn-sm " + (encChecking ? "btn-wait" : "btn-ghost")} aria-disabled={encChecking || undefined} onClick={() => { if (!encChecking) void recheckEnc(); }} data-reenc><Keep icon={<IcRefresh size={15} />} all={["กำลังตรวจ", "ตรวจตัวแปลงใหม่"]}>{encChecking ? "กำลังตรวจ" : "ตรวจตัวแปลงใหม่"}</Keep></button>
          </span></h3>
        {/* กดที่อยู่แล้วเปิดโฟลเดอร์ แบบเดียวกับที่เก็บบันทึก (BUGS ข้อ 96 ไล่ที่อยู่ในหน้าตั้งค่า) */}
        <div className="small" style={{ marginBottom: 6 }}>โฟลเดอร์ตัวแปลงที่ใส่เองอยู่ที่ {encDir ? <button type="button" className="pathlink" style={{ display: "inline", marginTop: 0 }} title="กดเพื่อเปิดโฟลเดอร์นี้" onClick={() => encodeApi.openDir().catch((e) => toast({ kind: "bad", title: "เปิดโฟลเดอร์ตัวแปลงไม่ได้", detail: String(e) }))} data-encdir-path>{encDir}</button> : "กำลังอ่านที่อยู่"} <Phr>{"ตอนแปลงใช้ตัวต้นฉบับเป็นค่าตั้งต้นและใช้ ffmpeg เป็นตัวรอง ถ้าวางรุ่นที่ใหม่กว่าตัวที่แนบมา โปรแกรมจะใช้ตัวที่ใหม่กว่า"}</Phr></div>
        <div className="setrow" data-latest-bar><div className="lbl small" style={{ margin: 0 }}>
          {/* Phr กันคำขาดกลางวลี (เดิม "ล่าสุดแล้ว 5" ขาดเป็น ล่าสุด กับ แล้ว 5) */}
          <Phr>{latest ? (() => {
            const n = (s: string) => latest.list.filter((l) => l.state === s).length;
            // ช่องว่างแบบไม่ตัดบรรทัด ( ) ผูกคำกับเลขของมัน ไม่ให้เลขหลุดไปขึ้นบรรทัดใหม่
            const nb = " ";
            return `เช็กรุ่นล่าสุดกับเว็บผู้ทำเมื่อ ${latest.at.toLocaleTimeString("th-TH", { hour: "2-digit", minute: "2-digit" })}${nb}นาฬิกา  ล่าสุดแล้ว${nb}${n("ok") + n("ahead")}${nb}ตัว มีรุ่นใหม่${nb}${n("new")}${nb}ตัว ยังไม่ได้ใส่${nb}${n("missing")}${nb}ตัว และเช็กไม่ได้${nb}${n("error")}${nb}ตัว`;
          })() : "เช็กว่าตัวแปลงแต่ละตัวเป็นรุ่นล่าสุดหรือยัง โดยออกเน็ตไปดูหน้าเว็บผู้ทำเฉพาะตอนกด และไม่โหลดอะไรมาเปลี่ยนเอง"}</Phr></div>
          <button type="button" className={"btn btn-sm " + (latestChecking ? "btn-wait" : "btn-ghost")} aria-disabled={latestChecking || undefined} onClick={() => { if (!latestChecking) void checkLatest(); }} data-enclatest><Keep icon={<IcRefresh size={15} />} all={["กำลังเช็ก", "เช็กรุ่นล่าสุด"]}>{latestChecking ? "กำลังเช็ก" : "เช็กรุ่นล่าสุด"}</Keep></button></div>
        {encs == null
          ? [0, 1, 2, 3, 4].map((i) => <div key={i} className="setrow" aria-busy="true"><Skel w="45%" h={12} /><Skel w={90} h={20} r={10} /></div>)
          : encs.map((e) => (
            <div key={e.name} className="setrow" data-enc={e.name}><div className="lbl">{e.name}<span className="small">{e.ok ? `${e.codecs}${e.version ? ` รุ่น ${e.version}` : ""}${e.coreAudio ? ` ใช้ CoreAudioToolbox ${e.coreAudio}` : ""} ${e.source === "user" ? "จากโฟลเดอร์ตัวแปลง" : "แนบมากับโปรแกรม"}` : `ตัวแปลง ${e.codecs} ${e.problem ? e.problem : "ยังไม่เจอในโฟลเดอร์ตัวแปลง"}`}</span>
              {(() => { const l = latest?.list.find((x) => x.name === e.name); return l ? <LatestLine l={l} onOpen={openPage} /> : null; })()}</div>
              {e.ok ? <span className="toolok">พร้อมใช้งาน</span> : e.problem ? <span className="toolwarn">{e.problem.startsWith("ต้องติดตั้ง iTunes") ? "ต้องติดตั้ง iTunes" : "ขาดไฟล์ประกอบ"}</span> : <span className="toolwarn">ยังไม่ได้ใส่</span>}</div>))}
        <div className="small" style={{ marginTop: 6 }}><Phr>{"fdkaac (AAC ของ Fraunhofer) สัญญาอนุญาตไม่ให้แจกไปกับตัวติดตั้ง จึงต้องโหลดเองแล้ววางทุกไฟล์ที่มากับชุดไว้ในโฟลเดอร์ตัวแปลง แล้วกดตรวจตัวแปลงใหม่  ส่วน qaac (AAC ของ Apple) กับ refalac (ALAC) แนบมากับโปรแกรมแล้ว แต่ qaac ต้องติดตั้ง iTunes ก่อน เพราะใช้ตัวเข้ารหัสของ Apple ที่มากับ iTunes ซึ่งแจกไปกับโปรแกรมไม่ได้ ขณะที่ refalac ไม่ต้องมี iTunes  สำหรับ TAK แนบชุดเดิมของผู้ทำมาทั้งไฟล์ตามเงื่อนไขการแจก แล้วโปรแกรมแตกออกมาใช้เอง และใช้ได้เฉพาะหน้าแปลงเสียง  ดูรายชื่อ รุ่น และสัญญาอนุญาตของตัวแปลงทุกตัวได้ที่หัวข้อขอบคุณของหน้านี้"}</Phr> <button type="button" className="latlink" onClick={() => goSec("thanks")} data-enc-thanks>ไปหัวข้อขอบคุณ</button></div>
        {/* AUDIT ข้อ 137 · เดิมชี้ไปไฟล์ docs/research/codec-เสียง.md ที่มีเฉพาะในโฟลเดอร์โปรเจกต์ ตัวติดตั้งไม่ได้แนบไปด้วย */}
      </div>

      {/* ---------- กราฟเสียง (แคลร์เพิ่ม · ผลอ่านคลื่นที่เก็บลงเครื่อง คิว 8) ---------- */}
      <div className="setcard" data-setcard="graph" hidden={sec !== "graph"}><h3>กราฟเสียง</h3>
        <div className="setrow"><div className="lbl">ซูมเหมือนกันทุกกราฟ<span className="small"><Phr>เปิดแล้วทุกกราฟใช้ช่วงเวลาซูมเดียวกัน ส่วนเมื่อปิดจะซูมเฉพาะกราฟที่ดูอยู่ และกราฟอื่นเริ่มที่ทั้งไฟล์</Phr></span></div>
          <Switch on={settings.graphZoomAll} onChange={(v) => set({ graphZoomAll: v })} label="ซูมเหมือนกันทุกกราฟ" /></div>
        <SpekResRow />
        <OvStartRow />
        <GraphImgRows value={settings.graphImg ?? GRAPH_IMG_DEFAULT} onChange={(graphImg) => set({ graphImg })} />
        <div className="setrow setmain"><div className="lbl">ผลอ่านคลื่นที่เก็บไว้ในเครื่อง<span className="small"><Phr>เปิดไฟล์เดิมซ้ำไม่ต้องอ่านใหม่ ถ้าไฟล์ถูกแก้จะอ่านใหม่เอง และเก็บรวมไม่เกิน 300 MB</Phr></span>
          <span className="small" data-graphcache>{cache ? `ตอนนี้เก็บไว้ ${cache.files} ไฟล์ ขนาดรวม ${fmtSize(cache.bytes)}` : "—"}</span></div>
          <button type="button" className="btn btn-ghost btn-sm" onClick={clearCache} data-clearcache><IbTrash size={15} />ล้าง</button></div>
      </div>

      {/* ---------- ชนิดไฟล์ที่รองรับ (BUGS ข้อ 127 พี่กันสั่ง 15 พ.ย. 2569 "เขียนชนิดไฟล์ทั้งหมดที่โปรแกรมเรารองรับ เเล้วรายละเอียดคร่าวๆ เพราะเราจำไม่ได้")
          รายการนามสกุลมาจากที่เดียวกับที่ทุกหน้าใช้จริง (lib/fileTypes.ts นำเข้าจาก api.ts) ---------- */}
      <div className="setcard" data-setcard="types" hidden={sec !== "types"}><h3>ชนิดไฟล์ที่รองรับ</h3>
        <div className="small" style={{ marginBottom: 6 }}><Phr>รวมนามสกุลไฟล์ที่โปรแกรมเปิดได้และทำออกมาได้ แยกตามชนิด โดยอ่านจากรายการเดียวกับที่ทุกหน้าใช้จริง</Phr></div>
        {FILE_TYPES.map((g) => <div key={g.key} data-ft-group={g.key}>
          <h4 className="imghead">{g.title}</h4>
          {g.rows.map((r) => <div key={r.data} className="ftrow" data-ft-row={r.data}>
            <div className="ftname">{r.name}</div>
            <div className="ftbody"><div className="ftchips">{r.exts.map((e) => { const x = EXT_INFO[e]; const up = e.toUpperCase(); return x ? <InfoTip key={e} title={x.t.toUpperCase() === up ? x.t : `${up} (${x.t})`} tip={{ w: x.w }} btnClass="ftchip" noAbbr>{up}</InfoTip> : <span key={e} className="ftchip">{up}</span>; })}</div>
              <div className="small"><Phr>{r.what}</Phr></div></div>
          </div>)}
        </div>)}
      </div>

      {/* ---------- ขอบคุณ ---------- */}
      <div className="setcard" data-setcard="thanks" hidden={sec !== "thanks"}><h3>ขอบคุณ</h3>
        <div className="small" style={{ marginBottom: 6 }}>ชั้นหนังพัฒนาขึ้นได้ด้วยผลงานของโครงการและผู้พัฒนาต่อไปนี้ ขอขอบคุณทุกท่าน</div>
        {THANKS.map((g) => <div key={g.title} data-thanks-group>
          <h4 className="imghead">{g.title}</h4>
          <div className="small" style={{ marginBottom: 4 }}>{g.note}</div>
          <div className="thanksgrid">
            {g.rows.map((r) => <div key={r.name} className="thankcard" data-thanks-row>
              <div className="thankhead"><span className={"thankicon" + (WHITE_ICON.has(r.name) ? " white" : "") + (thankImg2(r.name) ? " two" : "")}>{thankImg(r.name) ? <img src={thankImg(r.name)} alt="" draggable={false} /> : r.icon}{thankImg2(r.name) && <img src={thankImg2(r.name)} alt="" draggable={false} />}</span><span className="thankname"><b>{r.name}</b>{r.ver && <span className="thankver" data-thankver>v{r.ver}</span>}</span>{/* ป้ายยาวแยกบรรทัดตรง · ป้ายสั้นอยู่บรรทัดเดียว ทุกป้ายอยู่มุมขวาบนแถวเดียวกับชื่อ (BUGS ข้อ 3) */}<span className={"thanktag" + (r.tag.length > 18 ? " lines" : "")} title={r.tag} data-thanks-tag>{r.tag.split(", ").map((t, i, a) => <span key={t}>{t}{i < a.length - 1 ? "," : ""}{i < a.length - 1 ? " " : ""}</span>)}</span></div>
              {/* ตัดบรรทัดตรงเว้นวรรคเท่านั้น ขยายเต็มจอแล้วไม่ตัดกลางคำ อ่า|น (BUGS ข้อ 4) */}
              <div className="thankwhat"><Phr>{r.what}</Phr></div>
              <div className="thankfoot"><span className="thankurl">{r.url.split(", ").map((u) => <button key={u} type="button" className="thanklink" title={"เปิด " + u} data-thanks-link={u} onClick={() => { encodeApi.thanksOpen(u).catch((e: unknown) => toast({ kind: "bad", title: "เปิดหน้าเว็บไม่ได้", detail: String(e) })); }}>{u}</button>)}</span></div>
            </div>)}
          </div>
        </div>)}
      </div>

      <Dialog open={removing != null} onClose={() => setRemoving(null)} kind="work" confirm title={<>เอา <span style={{ wordBreak: "break-all" }}>{removing}</span> <span className="nw">ออกจากชั้น</span></>}
        actions={<><button type="button" className="btn btn-ghost btn-sm" onClick={() => setRemoving(null)}>ยกเลิก</button>
          <button type="button" className="btn btn-bad btn-sm" onClick={() => removing && removeFolder(removing)} data-confirmremove><IbTrash size={15} />เอาออกจากชั้น</button></>}>
        <div style={{ fontSize: 14, lineHeight: 1.6 }}><Phr>หนังในโฟลเดอร์นี้จะหายจากชั้นวาง แต่ไฟล์ในเครื่องยังอยู่ครบ ไม่ถูกลบ</Phr><br />เพิ่มโฟลเดอร์กลับมาเมื่อไหร่ก็ได้</div>
      </Dialog>
      <Dialog open={icarosHelp} onClose={() => setIcarosHelp(false)} kind="menu" title="วิธีลง Icaros"
        actions={<><button type="button" className="btn btn-ghost btn-sm" onClick={() => setIcarosHelp(false)}>ปิด</button>
          <button type="button" className="btn btn-main btn-sm" onClick={() => api.openIcarosPage().catch((e) => toast({ kind: "bad", title: "เปิดหน้าเว็บไม่ได้", detail: String(e) }))} data-openicaros>เปิดหน้าเว็บ Icaros</button></>}>
        <div className="small"><Phr>ลงครั้งเดียวแล้วไอคอนไฟล์ MKV ในหน้าต่างโฟลเดอร์จะเป็นโปสเตอร์ ถ้าไม่ลงก็ยังใช้โปรแกรมชั้นหนังได้ครบ</Phr></div>
        <ol className="steps">
          <li>กดปุ่มข้างล่าง เปิดหน้าเว็บของผู้พัฒนา Icaros แล้วโหลดตัวติดตั้ง</li>
          <li>ติดตั้ง แล้วเปิดโปรแกรม Icaros Config</li>
          <li>กดเปิดการสร้างภาพตัวอย่าง (Thumbnailing) และดูว่ามี mkv อยู่ในรายการ</li>
          <li>กลับมาที่นี่ กดตรวจเครื่องมือใหม่ ป้ายจะเปลี่ยนเป็นลงแล้ว</li>
        </ol>
      </Dialog>
    </div>
    </div>
  );
}

