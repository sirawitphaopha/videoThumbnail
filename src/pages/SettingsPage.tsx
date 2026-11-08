/* หน้า 4 ตั้งค่า (ต้นแบบบรรทัด 1002–1100 · สเปกข้อ 9 · ขั้น 7)
   ตั้งแล้วมีผลทันที ไม่ต้องกดบันทึก · สวิตช์ชมพู = เปิด · ค่าเก็บในไฟล์ค่าตั้งของโปรแกรมผ่าน set_settings (store.rs เขียนแบบปลอดภัยมีสำรอง)
   ค่าที่นี่คือค่าตั้งต้น ทุกครั้งที่ใส่โปสเตอร์หรือตรวจไฟล์ยังเปลี่ยนเฉพาะครั้งนั้นได้ */
import { useEffect, useRef, useState } from "react";
import { api, encodeApi, graphApi, linkApi, pickExe, pickFolder, type EncoderInfo, type LatestInfo, type Settings, type ToolCheck } from "../lib/api";
import { kb } from "../lib/popup";
import { listen } from "@tauri-apps/api/event";
import { inApp } from "../lib/api";
import { useSettings } from "../lib/settings";
import { useLibrary } from "../lib/library";
import { useToast } from "../components/Toasts";
import Dialog from "../components/Dialog";
import Dropdown from "../components/Dropdown";
import { IcPalette, IcCheck, IcCoverL, IcCoverM, IcCoverS, IcTall, IcWide, IcFolder, IcGraph, IcLink, IcMix, IcPoster, IcSettings, IcShelf } from "../components/icons";
import { Phr, Range, Seg, Skel, Switch } from "../components/ui";
import { setSkelPreview, useSkelPreview } from "../lib/skelPreview";
import { fmtSize } from "../lib/format";
import ToneCard from "../components/ToneCard";
import { DEFAULT_TONE, TONES } from "../lib/tones";
import { IbTrash, IcRefresh } from "../components/icons";
import { IbTick, IbPlay } from "../components/icons";

const FolderIcon = () => <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#b0355f" strokeWidth="2" aria-hidden="true"><path d="M3 7a2 2 0 012-2h4l2 2h8a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2z" /></svg>;
const PlayIcon = () => <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#b0355f" strokeWidth="2" aria-hidden="true"><rect x="3" y="4" width="18" height="16" rx="2" /><path d="M10 9l5 3-5 3z" fill="#b0355f" /></svg>;

const IcPlayBox = () => <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><rect x="3" y="4" width="18" height="16" rx="2" /><path d="M10 9l5 3-5 3z" fill="currentColor" /></svg>;

/** เลขรุ่นจากข้อความของเครื่องมือ เช่น mkvmerge v103.0 ('The Darkness') 64-bit ได้ 103.0 */
const verOf = (s: string) => s.match(/\d+(?:\.\d+)+/)?.[0] ?? "";

/* เมนูหัวข้อซ้าย เปิดดูทีละหัวข้อ (พี่กันส่งภาพหน้าการตั้งค่าของโปรแกรม Claude เป็นแบบ 8 พ.ย. 2569) · ชื่อกลุ่มแคลร์ตั้ง */
const SET_GROUPS: { title: string; items: { id: string; label: string; icon: React.ReactNode }[] }[] = [
  { title: "ชั้นหนัง", items: [
    { id: "folders", label: "โฟลเดอร์หนัง", icon: <IcFolder /> },
    { id: "shelf", label: "ชั้นวาง", icon: <IcShelf /> },
    { id: "tone", label: "โทนสี", icon: <IcPalette /> },
    { id: "player", label: "เปิดเล่นหนัง", icon: <IcPlayBox /> },
  ] },
  { title: "งาน", items: [
    { id: "poster", label: "ใส่โปสเตอร์", icon: <IcPoster /> },
    { id: "link", label: "เก็บรูปที่จับคู่", icon: <IcLink /> },
    { id: "check", label: "ตรวจไฟล์", icon: <IcCheck /> },
    { id: "graph", label: "กราฟเสียง", icon: <IcGraph /> },
  ] },
  { title: "เครื่องมือ", items: [
    { id: "tools", label: "เครื่องมือเบื้องหลัง", icon: <IcSettings /> },
    { id: "encoders", label: "ตัวแปลงเสียง", icon: <IcMix /> },
  ] },
];
/** จำหัวข้อล่าสุดไว้ ออกไปหน้าอื่นแล้วกลับมายังอยู่หัวข้อเดิม */
let lastSec = "folders";

/** หน้าที่ของเครื่องมือแต่ละตัว (สเปกข้อ 12 หน้าที่ของ ffmpeg = ส่งออก MP4 และตรวจละเอียด) */
const TOOL_ROLE: Record<string, string> = {
  mkvmerge: "ใช้ครอบ MKV และแนบโปสเตอร์",
  mkvextract: "ใช้ดึงปกออกมาโชว์และแยกไฟล์",
  mkvpropedit: "ใช้เปลี่ยนรูปแนบใน MKV",
  ffmpeg: "ใช้ส่งออก MP4 ตรวจละเอียด และกราฟเสียง",
  ffprobe: "ใช้อ่านข้อมูลไฟล์หนัง",
  MediaInfo: "ใช้หน้าข้อมูลไฟล์",
};

/** เก็บรูปที่จับคู่ไว้ที่ไหน 3 แบบ (พี่กันเคาะข้อ 1 · มอคอัปจับคู่ปกหัวข้อหน้าตั้งค่า) */
const LINK_MODES: { v: Settings["linkStore"]; title: string; rec?: string; lines: string[]; sample?: string[] }[] = [
  { v: "beside", title: "คัดลอกไปไว้ข้างไฟล์หนัง", rec: "ค่าตั้งต้น",
    lines: ["คัดลอกรูปที่ครอปแล้วไปไว้โฟลเดอร์เดียวกับหนัง ชื่อเหมือนไฟล์หนัง · รูปต้นฉบับอยู่ที่เดิม ไม่ถูกแก้ กลับมาครอปใหม่ได้", "ชื่อลงท้ายแบบที่ Kodi อ่านได้ · เปลี่ยนรูปทีหลัง ไฟล์นี้เปลี่ยนตาม · เปลี่ยนชื่อหนังในชั้นหนัง รูปเปลี่ยนชื่อตาม · มีไฟล์ชื่อนี้อยู่แล้วที่โปรแกรมไม่ได้ทำ ไม่เขียนทับ ถามก่อน"],
    sample: ["ดาวเหนือ (2023).mkv", "ดาวเหนือ (2023)-poster.jpg", "ดาวเหนือ (2023)-landscape.jpg"] },
  { v: "app", title: "เก็บสำเนาไว้ในโปรแกรม",
    lines: ["คัดลอกรูปที่ครอปแล้วไปไว้โฟลเดอร์ข้อมูลของโปรแกรม ไม่มีไฟล์เพิ่มในโฟลเดอร์หนัง · ลบหรือย้ายรูปต้นฉบับแล้วปกไม่หาย · มีแต่ชั้นหนังที่เห็น โปรแกรมอื่นไม่เห็น"] },
  { v: "link", title: "จับคู่อย่างเดียว",
    lines: ["ไม่คัดลอก รูปอยู่ชื่อเดิมที่เดิม โปรแกรมจำแค่ที่อยู่รูปแล้วดึงมาแสดง · ไม่ใช้ที่เพิ่มเลย · ย้ายหรือลบรูปต้นฉบับ ชั้นวางขึ้นว่าหารูปไม่เจอ ต้องจับคู่ใหม่"] },
];

/** ผลเช็กรุ่นล่าสุดครั้งล่าสุด จำไว้นอกหน้า (เปลี่ยนหน้าแล้วไม่หาย ไม่ออกเน็ตซ้ำเอง) */
let latestMemo: { at: Date; list: LatestInfo[] } | null = null;

/** บรรทัดรุ่นล่าสุดใต้ตัวแปลงแต่ละตัว */
function LatestLine({ l, onOpen }: { l: LatestInfo; onOpen: (name: string) => void }) {
  const page = <button type="button" className="latlink" onClick={() => onOpen(l.name)} data-latest-page>เปิดหน้าโหลด</button>;
  if (l.state === "ok") return <span className="small" data-latest="ok"><b className="latok">ล่าสุดแล้ว</b> · เว็บ {l.from} รุ่น {l.latest}</span>;
  if (l.state === "new") return <span className="small" data-latest="new"><b className="latnew">มีรุ่นใหม่ {l.latest}</b> · ใช้อยู่ {l.installed} · {page}</span>;
  if (l.state === "ahead") return <span className="small" data-latest="ahead"><b className="latok">ใหม่กว่าหน้าเว็บ</b> · เว็บ {l.from} ยังเป็น {l.latest}</span>;
  if (l.state === "missing") return <span className="small" data-latest="missing">รุ่นล่าสุดบนเว็บ {l.latest} · {page}</span>;
  return <span className="small" data-latest="error"><b className="latbad">เช็กไม่ได้</b> · {l.error}</span>;
}

export default function SettingsPage() {
  const [sec, setSec] = useState(lastSec);
  const goSec = (id: string) => { lastSec = id; setSec(id); document.querySelector("[data-settingsscroll]")?.scrollTo(0, 0); };
  const { settings, update } = useSettings();
  const { folders, scan, movies } = useLibrary();
  const toast = useToast();
  const skel = useSkelPreview();
  const [removing, setRemoving] = useState<string | null>(null);
  const [icarosHelp, setIcarosHelp] = useState(false);
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
      toast({ kind: r.failed ? "warn" : "ok", title: r.failed ? `ย้ายแล้ว ${r.done} เรื่อง · ไม่สำเร็จ ${r.failed} เรื่อง` : `ย้ายแล้ว ${r.done} เรื่อง`, detail: "ไฟล์หนังกับรูปต้นฉบับไม่ถูกแตะ" });
      r.notes.forEach((n) => toast({ kind: "warn", title: "มีเรื่องที่ต้องดู", detail: n }));
    } catch (e) {
      toast({ kind: "bad", title: "ย้ายไม่สำเร็จ", detail: String(e) });
    } finally { setMigrating(false); }
  };
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
  useEffect(() => { void recheckEnc(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, []);
  useEffect(() => { void recheck(); graphApi.cacheInfo().then(setCache, () => setCache(null)); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, []);

  if (!settings) return <div className="setwrap" aria-busy="true">{[0, 1, 2, 3].map((i) => <div key={i} className="setcard"><Skel w="40%" h={14} /><Skel w="90%" h={12} style={{ marginTop: 14 }} /><Skel w="70%" h={12} style={{ marginTop: 10 }} /></div>)}</div>;

  /** เก็บค่า · เก็บไม่ได้ต้องบอก ไม่เงียบ (save-status) */
  const set = async (patch: Partial<Settings>) => {
    if (!(await update(patch))) toast({ kind: "bad", title: "บันทึกค่าตั้งไม่ได้", detail: "ค่าที่เพิ่งเปลี่ยนยังไม่ได้เก็บลงเครื่อง ลองใหม่อีกครั้ง" });
  };
  const addFolder = async () => {
    const f = await pickFolder("เลือกโฟลเดอร์หนัง");
    if (!f) return;
    if (settings.folders.some((x) => x.toLowerCase() === f.toLowerCase())) { toast({ kind: "info", title: "โฟลเดอร์นี้อยู่บนชั้นแล้ว", detail: f }); return; }
    await set({ folders: [...settings.folders, f] });
    scan();
    toast({ kind: "ok", title: "เพิ่มโฟลเดอร์แล้ว กำลังอ่านขึ้นชั้น", detail: f });
  };
  const removeFolder = async (f: string) => {
    setRemoving(null);
    await set({ folders: settings.folders.filter((x) => x !== f) });
    scan();
    toast({ kind: "ok", title: "เอาออกจากชั้นแล้ว", detail: `${f} · ไฟล์ในเครื่องยังอยู่ครบ ไม่ถูกลบ` });
  };
  const changeOriginals = async () => {
    const f = await pickFolder("เลือกโฟลเดอร์เก็บไฟล์เดิม");
    if (f) await set({ originalsFolder: f });
  };
  const choosePlayer = async () => {
    const f = await pickExe();
    if (f) await set({ playerPath: f });
  };
  const jpgNow = jpg ?? settings.jpgQuality;
  const onJpg = (v: number) => {
    setJpg(v);
    window.clearTimeout(jpgTimer.current);
    jpgTimer.current = window.setTimeout(() => { void set({ jpgQuality: v }); }, 300);
  };
  const clearCache = async () => {
    try { setCache(await graphApi.cacheClear()); toast({ kind: "ok", title: "ล้างผลอ่านคลื่นที่เก็บไว้แล้ว", detail: "เปิดกราฟเสียงครั้งหน้าจะอ่านไฟล์ใหม่ · ไฟล์หนังไม่ถูกแตะ" }); }
    catch (e) { toast({ kind: "bad", title: "ล้างไม่ได้", detail: String(e) }); }
  };
  const countOf = (f: string) => folders.find((x) => x.path.toLowerCase() === f.toLowerCase());
  /** ติ๊กได้หลายแบบพร้อมกัน ต้องเหลืออย่างน้อยหนึ่งแบบ (พี่กันสั่ง 8 พ.ย. 2569 "สามารถเลือกได้ทุกแบบพร้อมกัน") */
  const stores = settings.linkStores?.length ? settings.linkStores : [settings.linkStore];
  const wantCopy = stores.includes("beside") && stores.includes("app");
  const toggleStore = (v: Settings["linkStore"]) => {
    const on = stores.includes(v);
    if (on && stores.length === 1) { toast({ kind: "info", title: "ต้องเลือกอย่างน้อยหนึ่งแบบ", detail: "ติ๊กแบบอื่นก่อน แล้วค่อยเอาแบบนี้ออก" }); return; }
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
          <button type="button" className={"btn " + (migrating ? "btn-wait" : "btn-main")} aria-disabled={migrating || undefined} data-link-migrate-ok onClick={migrate}>{migrating ? (migrateProg ? `กำลังย้าย ${migrateProg.done} จาก ${migrateProg.total} เรื่อง…` : "กำลังย้าย…") : "ย้ายเลย"}</button>
        </>}>
        <div className="small" style={{ fontSize: 14, color: "var(--txt2)" }}>
          <div>ทำไฟล์ใหม่ก่อน สำเร็จแล้วค่อยเอาของเก่าออก</div>
          <div>ของเก่าที่โปรแกรมคัดลอกไว้ย้ายลงถังขยะ · ไฟล์ที่โปรแกรมไม่ได้ทำไม่ถูกลบ</div>
          <div>เรื่องที่รูปต้นฉบับหายแล้ว ย้ายเป็นจับคู่อย่างเดียวไม่ได้ คงแบบเดิมแล้วบอกให้รู้</div>
          <div>ไฟล์หนังกับรูปต้นฉบับไม่ถูกแตะ</div>
        </div>
      </Dialog>
      {/* ---------- โฟลเดอร์หนัง ---------- */}
      <div className="setcard" data-setcard="folders" hidden={sec !== "folders"}><h3>โฟลเดอร์หนัง</h3>
        <div className="small">โปรแกรมอ่านหนังจากโฟลเดอร์ในรายการนี้ขึ้นชั้น</div>
        {settings.folders.map((f) => {
          const st = countOf(f);
          return (
            <div key={f} className="folder" data-folder={f}><FolderIcon /><div className="grow" style={{ wordBreak: "break-all" }}>{f}
              <span className="small" style={{ display: "block" }}>{st && !st.ok ? <span style={{ color: "var(--bad-ink)" }}>หาโฟลเดอร์ไม่เจอ ไดรฟ์อาจถอดออกอยู่</span> : <span className="nw">{st?.count ?? 0} เรื่อง</span>}</span></div>
              <button type="button" className="btn btn-bad btn-sm" onClick={() => setRemoving(f)} data-removefolder><IbTrash size={15} />เอาออกจากชั้น</button></div>
          );
        })}
        <div className="small" style={{ margin: "8px 0 10px" }}>เอาออกจากชั้นแล้ว ไฟล์ในเครื่องยังอยู่ครบ ไม่ถูกลบ</div>
        <button type="button" className="btn btn-ghost btn-sm" onClick={addFolder} data-addfolder><IcFolder size={15} />เพิ่มโฟลเดอร์</button>
        <div className="setrow" style={{ marginTop: 10, borderTop: "1px solid var(--line)" }}><div className="lbl">อ่านโฟลเดอร์ใหม่ทุกครั้งที่เปิดโปรแกรม<span className="small">หนังที่โหลดมาเพิ่มจะขึ้นชั้นเอง</span></div>
          <Switch on={settings.rescanOnStart} onChange={(v) => set({ rescanOnStart: v })} label="อ่านโฟลเดอร์ใหม่ทุกครั้งที่เปิดโปรแกรม" /></div>
      </div>

      {/* ---------- ใส่โปสเตอร์ ---------- */}
      <div className="setcard" data-setcard="poster" hidden={sec !== "poster"}><h3>ใส่โปสเตอร์</h3>
        <div className="setrow"><div className="lbl">ตรวจไฟล์ต้นทางก่อนครอบ<span className="small">ไฟล์เสียอยู่แล้ว จะบอกก่อนลงมือ</span></div>
          <Switch on={settings.checkSourceBefore} onChange={(v) => set({ checkSourceBefore: v })} label="ตรวจไฟล์ต้นทางก่อนครอบ" /></div>
        <div className="setrow"><div className="lbl">ตรวจไฟล์ใหม่หลังครอบเสร็จ<span className="small">เทียบว่าภาพ เสียง ซับ ครบเท่าต้นทาง</span></div>
          <Switch on={settings.checkOutputAfter} onChange={(v) => set({ checkOutputAfter: v })} label="ตรวจไฟล์ใหม่หลังครอบเสร็จ" /></div>
        <div className="setrow"><div className="lbl">ไฟล์ที่ได้</div>
          <Seg label="ไฟล์ที่ได้" value={settings.outputFormat} onChange={(v) => set({ outputFormat: v })} options={[{ value: "mkv", label: "MKV" }, { value: "mp4", label: "MP4" }]} /></div>
        <div className="setrow"><div className="lbl">ไฟล์เดิมหลังครอบ</div>
          <Seg label="ไฟล์เดิมหลังครอบ" value={settings.originalAfter} onChange={(v) => set({ originalAfter: v })} options={[{ value: "keep", label: <><IbTick size={14} />เก็บไว้</> }, { value: "trash", label: <><IbTrash size={14} />ลบเมื่อตรวจผ่าน</> }]} /></div>
        <div className="setrow"><div className="lbl">โฟลเดอร์เก็บไฟล์เดิม
          <span className="small" style={{ wordBreak: "break-all" }} data-originals>{settings.originalsFolder || "ข้างไฟล์หนัง ในโฟลเดอร์ชื่อ ไฟล์เดิม"}</span>
          <span className="small">ต้องอยู่ไดรฟ์เดียวกับไฟล์หนัง คนละไดรฟ์ใช้โฟลเดอร์ ไฟล์เดิม ข้างไฟล์หนังแทน</span></div>
          <div style={{ display: "flex", gap: 6 }}>
            {settings.originalsFolder && <button type="button" className="btn btn-ghost btn-sm" onClick={() => set({ originalsFolder: "" })}>ใช้ข้างไฟล์หนัง</button>}
            <button type="button" className="btn btn-ghost btn-sm" onClick={changeOriginals}><IcFolder size={15} />เปลี่ยน</button></div></div>
        <div className="setrow"><div className="lbl">รูปโปสเตอร์ที่แนบ<span className="small">ใช้กับรูปที่ต้องแปลง และรูปที่ครอป</span></div>
          <Seg label="รูปโปสเตอร์ที่แนบ" value={settings.posterFormat} onChange={(v) => set({ posterFormat: v })} options={[{ value: "jpg", label: "JPG" }, { value: "png", label: "PNG" }]} /></div>
        <div className="setrow" style={{ display: "block" }}><div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <span style={{ fontSize: 14, whiteSpace: "nowrap" }}>คุณภาพ JPG</span>
          <Range value={jpgNow} min={50} max={100} onChange={onJpg} label="คุณภาพ JPG" format={(v) => `${v}%`} />
          <span className="small" style={{ whiteSpace: "nowrap", minWidth: 36, textAlign: "right" }} data-jpgq>{jpgNow}%</span></div></div>
        <div className="setrow"><div className="lbl">ย่อรูปโปสเตอร์ที่ใหญ่เกิน<span className="small">ย่อเหลือ <span className="nw">1000 × 1500 px</span> ไฟล์หนังไม่บวม</span></div>
          <Switch on={settings.shrinkLargePosters} onChange={(v) => set({ shrinkLargePosters: v })} label="ย่อรูปโปสเตอร์ที่ใหญ่เกิน" /></div>
      </div>

      {/* ---------- เก็บรูปที่จับคู่ไว้ที่ไหน 3 แบบ ---------- */}
      <div className="setcard" data-setcard="link" hidden={sec !== "link"}><h3>เก็บรูปที่จับคู่ไว้ที่ไหน</h3>
        <div className="small" style={{ marginBottom: 10 }}>ใช้ตอนกดยืนยันในหน้าจับคู่ปก · ติ๊กได้หลายแบบพร้อมกัน · ทุกแบบ ไฟล์หนังไม่ถูกแตะ · โปรแกรมจำที่อยู่รูปต้นฉบับไว้เสมอ ติ๊กจับคู่อย่างเดียวคู่กับแบบอื่น ก็คัดลอกตามแบบนั้น</div>
        <div className="modes three" role="group" aria-label="เก็บรูปที่จับคู่ไว้ที่ไหน">
          {LINK_MODES.map((x) => {
            const on = stores.includes(x.v);
            return (
              <div key={x.v} className={"mode" + (on ? " on" : "")} {...kb(() => toggleStore(x.v))} role="checkbox" aria-checked={on} data-link-mode={x.v}>
                <h4><span className={"cbx " + (on ? "on" : "off")}>{on && <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="4" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5" /></svg>}</span>{x.title}{x.rec && <span className="extag" style={{ marginLeft: 2 }}>{x.rec}</span>}</h4>
                <div className="small"><Phr>{x.lines[0]}</Phr></div>
                {x.sample && <div className="pathsample">{x.sample.map((l) => <div key={l}>{l}</div>)}</div>}
                {x.lines[1] && <div className="small"><Phr>{x.lines[1]}</Phr></div>}
              </div>
            );
          })}
        </div>
        <div className="small" style={{ marginTop: 10 }}>ย้ายหรือเปลี่ยนชื่อไฟล์หนังผ่านชั้นหนัง ปกตามไป · ย้ายด้วย Explorer ในไดรฟ์เดียวกัน โปรแกรมยังตามเจอ ย้ายข้ามไดรฟ์ต้องจับคู่ใหม่ · เปลี่ยนแบบทีหลัง มีผลกับเรื่องที่จับคู่ใหม่</div>
        {migrateCount > 0 && (
          <div className="minirow" style={{ marginTop: 10 }} data-link-migrate>
            <span className="small" style={{ alignSelf: "center" }}>มี <span className="nw">{migrateCount} เรื่อง</span>ที่จับคู่ไว้แบบอื่น</span>
            <button type="button" className={"btn btn-sm " + (migrating ? "btn-wait" : "btn-ghost")} aria-disabled={migrating || undefined} data-link-migrate-go onClick={() => { if (!migrating) setAskMigrate(true); }}>{migrating ? (migrateProg ? `กำลังย้าย ${migrateProg.done} จาก ${migrateProg.total} เรื่อง…` : "กำลังย้าย…") : "ย้ายมาแบบนี้ทีเดียว"}</button>
          </div>
        )}
      </div>

      {/* ---------- ตรวจไฟล์ ---------- */}
      <div className="setcard" data-setcard="check" hidden={sec !== "check"}><h3>ตรวจไฟล์</h3>
        <div className="setrow"><div className="lbl">แบบตรวจตั้งต้น</div>
          <Seg label="แบบตรวจตั้งต้น" value={settings.defaultCheck} onChange={(v) => set({ defaultCheck: v })} options={[{ value: "quick", label: <><IcCheck size={14} />ตรวจแบบเร็ว</> }, { value: "full", label: <><IcCheck size={14} />ตรวจละเอียด</> }]} /></div>
        <div className="setrow"><div className="lbl">ตรวจแบบเร็วทุกเรื่องตอนเปิดโปรแกรม<span className="small">ช่วยจับไฟล์ที่เสียระหว่างย้ายไดรฟ์</span></div>
          <Switch on={settings.quickCheckOnStart} onChange={(v) => set({ quickCheckOnStart: v })} label="ตรวจแบบเร็วทุกเรื่องตอนเปิดโปรแกรม" /></div>
        <div className="setrow"><div className="lbl">เตือนให้ตรวจซ้ำ<span className="small">จุดบนปกเปลี่ยนเป็นสีเหลืองเมื่อถึงเวลา</span></div>
          <span data-recheck><Dropdown label="เตือนให้ตรวจซ้ำ" value={String(settings.recheckReminderDays)} onChange={(v) => set({ recheckReminderDays: Number(v) as Settings["recheckReminderDays"] })}
            options={[{ value: "0", label: "ไม่ต้องเตือน" }, { value: "7", label: "ทุก 7 วัน" }, { value: "30", label: "ทุก 30 วัน" }, { value: "90", label: "ทุก 90 วัน" }]} /></span></div>
      </div>

      {/* ---------- ชั้นวาง ---------- */}
      <div className="setcard" data-setcard="tone" hidden={sec !== "tone"}><h3>โทนสี</h3>
        <div className="small" style={{ marginBottom: 12 }}>กดแล้วเปลี่ยนทั้งโปรแกรมทันที โปรแกรมจำไว้ · รูปโปสเตอร์กับสีกราฟเสียงไม่เปลี่ยนตาม</div>
        <div className="tncards" role="radiogroup" aria-label="โทนสี">
          {TONES.map((t) => <ToneCard key={t.id} t={t} on={(settings.tone || DEFAULT_TONE) === t.id} onPick={() => void set({ tone: t.id })} />)}
        </div>
      </div>

      <div className="setcard" data-setcard="shelf" hidden={sec !== "shelf"}><h3>ชั้นวาง</h3>
        <div className="setrow"><div className="lbl">ขนาดปก</div>
          <Seg label="ขนาดปก" value={settings.coverSize} onChange={(v) => set({ coverSize: v })} options={[{ value: "s", label: <><IcCoverS />เล็ก</> }, { value: "m", label: <><IcCoverM />กลาง</> }, { value: "l", label: <><IcCoverL />ใหญ่</> }]} /></div>
        <div className="setrow"><div className="lbl">ดูปก<span className="small">เรื่องที่แนบทั้งปกตั้งและปกนอน · เรื่องที่มีแบบเดียวขึ้นแบบนั้น</span></div>
          <Seg label="ดูปก" value={settings.coverOrient} onChange={(v) => set({ coverOrient: v })} options={[{ value: "tall", label: <><IcTall />ปกตั้ง</> }, { value: "wide", label: <><IcWide />ปกนอน</> }]} /></div>
        <div className="setrow"><div className="lbl">ชื่อไฟล์ใต้ปก</div><Switch on={settings.showNames} onChange={(v) => set({ showNames: v })} label="ชื่อไฟล์ใต้ปก" /></div>
        <div className="setrow"><div className="lbl">จุดสีบอกสภาพไฟล์</div><Switch on={settings.showDots} onChange={(v) => set({ showDots: v })} label="จุดสีบอกสภาพไฟล์" /></div>
        <div className="setrow"><div className="lbl">แสดงโครงจางค้างไว้<span className="small">ไว้ดูหน้าตาตอนรออ่านโฟลเดอร์ · ปิดโปรแกรมแล้วกลับเป็นปิดเอง</span></div>
          <span data-skelpreview style={{ display: "inline-flex" }}><Switch on={skel} onChange={setSkelPreview} label="แสดงโครงจางค้างไว้" /></span></div>
      </div>

      {/* ---------- เปิดเล่นหนัง ---------- */}
      <div className="setcard" data-setcard="player" hidden={sec !== "player"}><h3>เปิดเล่นหนัง</h3>
        <div className="setrow"><div className="lbl">โปรแกรมที่ใช้เล่น<span className="small">กดปุ่มเปิดเล่นแล้วส่งไฟล์ไปโปรแกรมนี้</span></div>
          <Seg label="โปรแกรมที่ใช้เล่น" value={settings.playerPath ? "custom" : "default"} onChange={(v) => (v === "default" ? set({ playerPath: "" }) : choosePlayer())}
            options={[{ value: "default", label: <><IbPlay size={14} />โปรแกรมหลักของ Windows</> }, { value: "custom", label: <><IcFolder size={14} />เลือกเอง</> }]} /></div>
        {settings.playerPath && <>
          <div className="folder" style={{ background: "#fdeef4" }} data-player><PlayIcon /><div className="grow" style={{ wordBreak: "break-all" }}>{settings.playerPath}</div>
            <button type="button" className="btn btn-ghost btn-sm" onClick={choosePlayer}><IcFolder size={15} />เปลี่ยน</button></div>
          <div className="hint" style={{ margin: "8px 0 0" }}>ถ้าวันหลังหาโปรแกรมนี้ไม่เจอ กดเปิดเล่นแล้วจะบอก และพากลับมาตั้งที่นี่</div></>}
      </div>

      {/* ---------- เครื่องมือเบื้องหลัง ---------- */}
      <div className="setcard" data-setcard="tools" hidden={sec !== "tools"}><h3>เครื่องมือเบื้องหลัง</h3>
        {tools == null
          ? [0, 1, 2, 3, 4, 5].map((i) => <div key={i} className="setrow" aria-busy="true"><Skel w="45%" h={12} /><Skel w={90} h={20} r={10} /></div>)
          : tools.map((t) => (
            <div key={t.name} className="setrow" data-tool={t.name}><div className="lbl">{t.name}{t.ok && verOf(t.version) && <span className="setver" data-toolver>รุ่น {verOf(t.version)}</span>}<span className="small">{TOOL_ROLE[t.name] ?? ""}{t.ok ? "" : ` · ${t.version}`}</span></div>
              {t.ok ? <span className="toolok">พร้อมใช้งาน</span> : <span className="toolbad">ไม่พร้อม</span>}</div>))}
        <div className="setrow" data-tool="Icaros"><div className="lbl">Icaros<span className="small">ให้ Windows โชว์โปสเตอร์เป็นไอคอนไฟล์ ไม่ลงก็ใช้โปรแกรมนี้ได้ครบ</span></div>
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            {icaros == null ? <Skel w={80} h={20} r={10} /> : icaros ? <span className="toolok">ลงแล้ว</span> : <span className="toolwarn">ยังไม่ได้ลง</span>}
            {icaros === false && <button type="button" className="btn btn-ghost btn-sm" onClick={() => setIcarosHelp(true)} data-icaroshelp>วิธีลง</button>}</div></div>
        <div className="setrow"><div className="lbl small" style={{ margin: 0 }}>ซ่อนหรือย้ายเครื่องมือแล้ว กดตรวจใหม่เพื่อดูสถานะล่าสุด</div>
          <button type="button" className={"btn btn-sm " + (checking ? "btn-wait" : "btn-ghost")} aria-disabled={checking || undefined} onClick={() => { if (!checking) void recheck(); }} data-retools><IcRefresh size={15} />{checking ? "กำลังตรวจ" : "ตรวจเครื่องมือใหม่"}</button></div>
      </div>

      {/* ---------- ตัวแปลงเสียง (มอคอัปเสียงและซับ หัวข้อ 8) · ตัวที่แนบมากับโปรแกรม กับตัวที่วางเองในโฟลเดอร์ตัวแปลง (ตัวที่สัญญาอนุญาตไม่ให้แจก) ---------- */}
      <div className="setcard" data-setcard="encoders" hidden={sec !== "encoders"}>
        <h3 style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10 }}><span>ตัวแปลงเสียง</span>
          <span style={{ display: "flex", gap: 6 }}>
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => encodeApi.openDir().catch((e) => toast({ kind: "bad", title: "เปิดโฟลเดอร์ตัวแปลงไม่ได้", detail: String(e) }))} data-encdir><IcFolder size={15} />เปิดโฟลเดอร์ตัวแปลง</button>
            <button type="button" className={"btn btn-sm " + (encChecking ? "btn-wait" : "btn-ghost")} aria-disabled={encChecking || undefined} onClick={() => { if (!encChecking) void recheckEnc(); }} data-reenc><IcRefresh size={15} />{encChecking ? "กำลังตรวจ" : "ตรวจตัวแปลงใหม่"}</button>
          </span></h3>
        <div className="small" style={{ marginBottom: 6 }}>โฟลเดอร์ตัวแปลงที่ใส่เอง <span className="nw" style={{ fontFamily: "var(--mono)", overflowWrap: "anywhere" }}>{encDir || "…"}</span> · <Phr>{"ตอนแปลงใช้ตัวต้นฉบับเป็นค่าตั้งต้น ffmpeg เป็นตัวรอง · วางรุ่นใหม่กว่าตัวที่แนบมา โปรแกรมใช้ตัวที่ใหม่กว่า"}</Phr></div>
        <div className="setrow" data-latest-bar><div className="lbl small" style={{ margin: 0 }}>
          {/* Phr กันคำขาดกลางวลี (เดิม "ล่าสุดแล้ว 5" ขาดเป็น ล่าสุด กับ แล้ว 5) */}
          <Phr>{latest ? (() => {
            const n = (s: string) => latest.list.filter((l) => l.state === s).length;
            // ช่องว่างแบบไม่ตัดบรรทัด ( ) ผูกคำกับเลขของมัน ไม่ให้เลขหลุดไปขึ้นบรรทัดใหม่
            const nb = " ";
            return `เช็กรุ่นล่าสุดกับเว็บผู้ทำเมื่อ ${latest.at.toLocaleTimeString("th-TH", { hour: "2-digit", minute: "2-digit" })}${nb}น. · ล่าสุดแล้ว${nb}${n("ok") + n("ahead")} · มีรุ่นใหม่${nb}${n("new")} · ยังไม่ได้ใส่${nb}${n("missing")} · เช็กไม่ได้${nb}${n("error")}`;
          })() : "เช็กว่าตัวแปลงแต่ละตัวเป็นรุ่นล่าสุดไหม · ออกเน็ตไปดูหน้าเว็บผู้ทำเฉพาะตอนกด ไม่โหลดอะไรมาเปลี่ยนเอง"}</Phr></div>
          <button type="button" className={"btn btn-sm " + (latestChecking ? "btn-wait" : "btn-ghost")} aria-disabled={latestChecking || undefined} onClick={() => { if (!latestChecking) void checkLatest(); }} data-enclatest><IcRefresh size={15} />{latestChecking ? "กำลังเช็ก" : "เช็กรุ่นล่าสุด"}</button></div>
        {encs == null
          ? [0, 1, 2, 3, 4].map((i) => <div key={i} className="setrow" aria-busy="true"><Skel w="45%" h={12} /><Skel w={90} h={20} r={10} /></div>)
          : encs.map((e) => (
            <div key={e.name} className="setrow" data-enc={e.name}><div className="lbl">{e.name}<span className="small">{e.codecs} · {e.ok ? `${e.version ?? "ไม่ทราบรุ่น"} · ${e.source === "user" ? "โฟลเดอร์ตัวแปลง" : "แนบมากับโปรแกรม"}` : e.problem ? e.problem : "ไม่เจอในโฟลเดอร์ตัวแปลง"}</span>
              {(() => { const l = latest?.list.find((x) => x.name === e.name); return l ? <LatestLine l={l} onOpen={openPage} /> : null; })()}</div>
              {e.ok ? <span className="toolok">พร้อมใช้งาน</span> : e.problem ? <span className="toolwarn">ขาดไฟล์ประกอบ</span> : <span className="toolwarn">ยังไม่ได้ใส่</span>}</div>))}
        <div className="small" style={{ marginTop: 6 }}><Phr>{"qaac (AAC ของ Apple) กับ fdkaac (AAC ของ Fraunhofer) สัญญาอนุญาตไม่ให้แจกไปกับตัวติดตั้ง โหลดเองแล้ววางทุกไฟล์ที่มากับชุดไว้ในโฟลเดอร์ตัวแปลง แล้วกดตรวจตัวแปลงใหม่ · TAK แนบชุดเดิมของผู้ทำมาทั้งไฟล์ตามเงื่อนไขการแจก โปรแกรมแตก Takc.exe ไปใช้เอง ใช้เฉพาะหน้าแปลงเสียง · รายชื่อ รุ่น และสัญญาอนุญาตอยู่ docs/research/codec-เสียง.md"}</Phr></div>
      </div>

      {/* ---------- กราฟเสียง (แคลร์เพิ่ม · ผลอ่านคลื่นที่เก็บลงเครื่อง คิว 8) ---------- */}
      <div className="setcard" data-setcard="graph" hidden={sec !== "graph"}><h3>กราฟเสียง</h3>
        <div className="setrow"><div className="lbl">ผลอ่านคลื่นที่เก็บไว้ในเครื่อง<span className="small">เปิดไฟล์เดิมซ้ำไม่ต้องอ่านใหม่ · ไฟล์หนังเปลี่ยนแล้วอ่านใหม่เอง · รวมไม่เกิน 300 MB</span>
          <span className="small" data-graphcache>{cache ? `${cache.files} ไฟล์ · ${fmtSize(cache.bytes)}` : "—"}</span></div>
          <button type="button" className="btn btn-ghost btn-sm" onClick={clearCache} data-clearcache><IbTrash size={15} />ล้าง</button></div>
      </div>

      <Dialog open={removing != null} onClose={() => setRemoving(null)} kind="work" confirm title={<>เอา <span style={{ wordBreak: "break-all" }}>{removing}</span> <span className="nw">ออกจากชั้น</span></>}
        actions={<><button type="button" className="btn btn-ghost btn-sm" onClick={() => setRemoving(null)}>ยกเลิก</button>
          <button type="button" className="btn btn-bad btn-sm" onClick={() => removing && removeFolder(removing)} data-confirmremove><IbTrash size={15} />เอาออกจากชั้น</button></>}>
        <div style={{ fontSize: 14, lineHeight: 1.6 }}><Phr>หนังในโฟลเดอร์นี้จะหายจากชั้นวาง แต่ไฟล์ในเครื่องยังอยู่ครบ ไม่ถูกลบ</Phr><br />เพิ่มโฟลเดอร์กลับมาเมื่อไหร่ก็ได้</div>
      </Dialog>
      <Dialog open={icarosHelp} onClose={() => setIcarosHelp(false)} kind="menu" title="วิธีลง Icaros"
        actions={<><button type="button" className="btn btn-ghost btn-sm" onClick={() => setIcarosHelp(false)}>ปิด</button>
          <button type="button" className="btn btn-main btn-sm" onClick={() => api.openIcarosPage().catch((e) => toast({ kind: "bad", title: "เปิดหน้าเว็บไม่ได้", detail: String(e) }))} data-openicaros>เปิดหน้าเว็บ Icaros</button></>}>
        <div className="small">ลงครั้งเดียว ไอคอนไฟล์ MKV ในหน้าต่างโฟลเดอร์จะเป็นโปสเตอร์ · ไม่ลงก็ใช้โปรแกรมชั้นหนังได้ครบ</div>
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
