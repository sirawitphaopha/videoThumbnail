/* หน้า 4 ตั้งค่า (ต้นแบบบรรทัด 1002–1100 · สเปกข้อ 9 · ขั้น 7)
   ตั้งแล้วมีผลทันที ไม่ต้องกดบันทึก · สวิตช์ชมพู = เปิด · ค่าเก็บในไฟล์ค่าตั้งของโปรแกรมผ่าน set_settings (store.rs เขียนแบบปลอดภัยมีสำรอง)
   ค่าที่นี่คือค่าตั้งต้น ทุกครั้งที่ใส่โปสเตอร์หรือตรวจไฟล์ยังเปลี่ยนเฉพาะครั้งนั้นได้ */
import { useEffect, useRef, useState } from "react";
import { api, encodeApi, graphApi, pickExe, pickFolder, type EncoderInfo, type Settings, type ToolCheck } from "../lib/api";
import { useSettings } from "../lib/settings";
import { useLibrary } from "../lib/library";
import { useToast } from "../components/Toasts";
import Dialog from "../components/Dialog";
import Dropdown from "../components/Dropdown";
import { Phr, Range, Seg, Skel, Switch } from "../components/ui";
import { setSkelPreview, useSkelPreview } from "../lib/skelPreview";
import { fmtSize } from "../lib/format";

const FolderIcon = () => <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#c2547f" strokeWidth="2" aria-hidden="true"><path d="M3 7a2 2 0 012-2h4l2 2h8a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2z" /></svg>;
const PlayIcon = () => <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#c2547f" strokeWidth="2" aria-hidden="true"><rect x="3" y="4" width="18" height="16" rx="2" /><path d="M10 9l5 3-5 3z" fill="#c2547f" /></svg>;

/** หน้าที่ของเครื่องมือแต่ละตัว (สเปกข้อ 12 หน้าที่ของ ffmpeg = ส่งออก MP4 และตรวจละเอียด) */
const TOOL_ROLE: Record<string, string> = {
  mkvmerge: "ใช้ครอบ MKV และแนบโปสเตอร์",
  mkvextract: "ใช้ดึงปกออกมาโชว์และแยกไฟล์",
  mkvpropedit: "ใช้เปลี่ยนรูปแนบใน MKV",
  ffmpeg: "ใช้ส่งออก MP4 ตรวจละเอียด และกราฟเสียง",
  ffprobe: "ใช้อ่านข้อมูลไฟล์หนัง",
  MediaInfo: "ใช้หน้าข้อมูลไฟล์",
};

export default function SettingsPage() {
  const { settings, update } = useSettings();
  const { folders, scan } = useLibrary();
  const toast = useToast();
  const skel = useSkelPreview();
  const [removing, setRemoving] = useState<string | null>(null);
  const [icarosHelp, setIcarosHelp] = useState(false);
  const [tools, setTools] = useState<ToolCheck[] | null>(null);
  const [icaros, setIcaros] = useState<boolean | null>(null);
  const [checking, setChecking] = useState(false);
  const [cache, setCache] = useState<{ files: number; bytes: number } | null>(null);
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

  return (
    <div className="setwrap" data-settings>
      {/* ---------- โฟลเดอร์หนัง ---------- */}
      <div className="setcard" data-setcard="folders"><h3>โฟลเดอร์หนัง</h3>
        <div className="small">โปรแกรมอ่านหนังจากโฟลเดอร์ในรายการนี้ขึ้นชั้น</div>
        {settings.folders.map((f) => {
          const st = countOf(f);
          return (
            <div key={f} className="folder" data-folder={f}><FolderIcon /><div className="grow" style={{ wordBreak: "break-all" }}>{f}
              <span className="small" style={{ display: "block" }}>{st && !st.ok ? <span style={{ color: "var(--bad-ink)" }}>หาโฟลเดอร์ไม่เจอ ไดรฟ์อาจถอดออกอยู่</span> : <span className="nw">{st?.count ?? 0} เรื่อง</span>}</span></div>
              <button type="button" className="btn btn-bad btn-sm" onClick={() => setRemoving(f)} data-removefolder>เอาออกจากชั้น</button></div>
          );
        })}
        <div className="small" style={{ margin: "8px 0 10px" }}>เอาออกจากชั้นแล้ว ไฟล์ในเครื่องยังอยู่ครบ ไม่ถูกลบ</div>
        <button type="button" className="btn btn-ghost btn-sm" onClick={addFolder} data-addfolder>เพิ่มโฟลเดอร์</button>
        <div className="setrow" style={{ marginTop: 10, borderTop: "1px solid #f8e3eb" }}><div className="lbl">อ่านโฟลเดอร์ใหม่ทุกครั้งที่เปิดโปรแกรม<span className="small">หนังที่โหลดมาเพิ่มจะขึ้นชั้นเอง</span></div>
          <Switch on={settings.rescanOnStart} onChange={(v) => set({ rescanOnStart: v })} label="อ่านโฟลเดอร์ใหม่ทุกครั้งที่เปิดโปรแกรม" /></div>
      </div>

      {/* ---------- ใส่โปสเตอร์ ---------- */}
      <div className="setcard" data-setcard="poster"><h3>ใส่โปสเตอร์</h3>
        <div className="setrow"><div className="lbl">ตรวจไฟล์ต้นทางก่อนครอบ<span className="small">ไฟล์เสียอยู่แล้ว จะบอกก่อนลงมือ</span></div>
          <Switch on={settings.checkSourceBefore} onChange={(v) => set({ checkSourceBefore: v })} label="ตรวจไฟล์ต้นทางก่อนครอบ" /></div>
        <div className="setrow"><div className="lbl">ตรวจไฟล์ใหม่หลังครอบเสร็จ<span className="small">เทียบว่าภาพ เสียง ซับ ครบเท่าต้นทาง</span></div>
          <Switch on={settings.checkOutputAfter} onChange={(v) => set({ checkOutputAfter: v })} label="ตรวจไฟล์ใหม่หลังครอบเสร็จ" /></div>
        <div className="setrow"><div className="lbl">ไฟล์ที่ได้</div>
          <Seg label="ไฟล์ที่ได้" value={settings.outputFormat} onChange={(v) => set({ outputFormat: v })} options={[{ value: "mkv", label: "MKV" }, { value: "mp4", label: "MP4" }]} /></div>
        <div className="setrow"><div className="lbl">ไฟล์เดิมหลังครอบ</div>
          <Seg label="ไฟล์เดิมหลังครอบ" value={settings.originalAfter} onChange={(v) => set({ originalAfter: v })} options={[{ value: "keep", label: "เก็บไว้" }, { value: "trash", label: "ลบเมื่อตรวจผ่าน" }]} /></div>
        <div className="setrow"><div className="lbl">โฟลเดอร์เก็บไฟล์เดิม
          <span className="small" style={{ wordBreak: "break-all" }} data-originals>{settings.originalsFolder || "ข้างไฟล์หนัง ในโฟลเดอร์ชื่อ ไฟล์เดิม"}</span>
          <span className="small">ต้องอยู่ไดรฟ์เดียวกับไฟล์หนัง คนละไดรฟ์ใช้โฟลเดอร์ ไฟล์เดิม ข้างไฟล์หนังแทน</span></div>
          <div style={{ display: "flex", gap: 6 }}>
            {settings.originalsFolder && <button type="button" className="btn btn-ghost btn-sm" onClick={() => set({ originalsFolder: "" })}>ใช้ข้างไฟล์หนัง</button>}
            <button type="button" className="btn btn-ghost btn-sm" onClick={changeOriginals}>เปลี่ยน</button></div></div>
        <div className="setrow"><div className="lbl">รูปโปสเตอร์ที่แนบ<span className="small">ใช้กับรูปที่ต้องแปลง และรูปที่ครอป</span></div>
          <Seg label="รูปโปสเตอร์ที่แนบ" value={settings.posterFormat} onChange={(v) => set({ posterFormat: v })} options={[{ value: "jpg", label: "JPG" }, { value: "png", label: "PNG" }]} /></div>
        <div className="setrow" style={{ display: "block" }}><div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <span style={{ fontSize: 14, whiteSpace: "nowrap" }}>คุณภาพ JPG</span>
          <Range value={jpgNow} min={50} max={100} onChange={onJpg} label="คุณภาพ JPG" format={(v) => `${v}%`} />
          <span className="small" style={{ whiteSpace: "nowrap", minWidth: 36, textAlign: "right" }} data-jpgq>{jpgNow}%</span></div></div>
        <div className="setrow"><div className="lbl">ย่อรูปโปสเตอร์ที่ใหญ่เกิน<span className="small">ย่อเหลือ <span className="nw">1000 × 1500 px</span> ไฟล์หนังไม่บวม</span></div>
          <Switch on={settings.shrinkLargePosters} onChange={(v) => set({ shrinkLargePosters: v })} label="ย่อรูปโปสเตอร์ที่ใหญ่เกิน" /></div>
      </div>

      {/* ---------- ตรวจไฟล์ ---------- */}
      <div className="setcard" data-setcard="check"><h3>ตรวจไฟล์</h3>
        <div className="setrow"><div className="lbl">แบบตรวจตั้งต้น</div>
          <Seg label="แบบตรวจตั้งต้น" value={settings.defaultCheck} onChange={(v) => set({ defaultCheck: v })} options={[{ value: "quick", label: "ตรวจแบบเร็ว" }, { value: "full", label: "ตรวจละเอียด" }]} /></div>
        <div className="setrow"><div className="lbl">ตรวจแบบเร็วทุกเรื่องตอนเปิดโปรแกรม<span className="small">ช่วยจับไฟล์ที่เสียระหว่างย้ายไดรฟ์</span></div>
          <Switch on={settings.quickCheckOnStart} onChange={(v) => set({ quickCheckOnStart: v })} label="ตรวจแบบเร็วทุกเรื่องตอนเปิดโปรแกรม" /></div>
        <div className="setrow"><div className="lbl">เตือนให้ตรวจซ้ำ<span className="small">จุดบนปกเปลี่ยนเป็นสีเหลืองเมื่อถึงเวลา</span></div>
          <span data-recheck><Dropdown label="เตือนให้ตรวจซ้ำ" value={String(settings.recheckReminderDays)} onChange={(v) => set({ recheckReminderDays: Number(v) as Settings["recheckReminderDays"] })}
            options={[{ value: "0", label: "ไม่ต้องเตือน" }, { value: "7", label: "ทุก 7 วัน" }, { value: "30", label: "ทุก 30 วัน" }, { value: "90", label: "ทุก 90 วัน" }]} /></span></div>
      </div>

      {/* ---------- ชั้นวาง ---------- */}
      <div className="setcard" data-setcard="shelf"><h3>ชั้นวาง</h3>
        <div className="setrow"><div className="lbl">ขนาดปก</div>
          <Seg label="ขนาดปก" value={settings.coverSize} onChange={(v) => set({ coverSize: v })} options={[{ value: "s", label: "เล็ก" }, { value: "m", label: "กลาง" }, { value: "l", label: "ใหญ่" }]} /></div>
        <div className="setrow"><div className="lbl">ดูปก<span className="small">เรื่องที่แนบทั้งปกตั้งและปกนอน · เรื่องที่มีแบบเดียวขึ้นแบบนั้น</span></div>
          <Seg label="ดูปก" value={settings.coverOrient} onChange={(v) => set({ coverOrient: v })} options={[{ value: "tall", label: "ปกตั้ง" }, { value: "wide", label: "ปกนอน" }]} /></div>
        <div className="setrow"><div className="lbl">ชื่อไฟล์ใต้ปก</div><Switch on={settings.showNames} onChange={(v) => set({ showNames: v })} label="ชื่อไฟล์ใต้ปก" /></div>
        <div className="setrow"><div className="lbl">จุดสีบอกสภาพไฟล์</div><Switch on={settings.showDots} onChange={(v) => set({ showDots: v })} label="จุดสีบอกสภาพไฟล์" /></div>
        <div className="setrow"><div className="lbl">แสดงโครงจางค้างไว้<span className="small">ไว้ดูหน้าตาตอนรออ่านโฟลเดอร์ · ปิดโปรแกรมแล้วกลับเป็นปิดเอง</span></div>
          <span data-skelpreview style={{ display: "inline-flex" }}><Switch on={skel} onChange={setSkelPreview} label="แสดงโครงจางค้างไว้" /></span></div>
      </div>

      {/* ---------- เปิดเล่นหนัง ---------- */}
      <div className="setcard" data-setcard="player"><h3>เปิดเล่นหนัง</h3>
        <div className="setrow"><div className="lbl">โปรแกรมที่ใช้เล่น<span className="small">กดปุ่มเปิดเล่นแล้วส่งไฟล์ไปโปรแกรมนี้</span></div>
          <Seg label="โปรแกรมที่ใช้เล่น" value={settings.playerPath ? "custom" : "default"} onChange={(v) => (v === "default" ? set({ playerPath: "" }) : choosePlayer())}
            options={[{ value: "default", label: "โปรแกรมหลักของ Windows" }, { value: "custom", label: "เลือกเอง" }]} /></div>
        {settings.playerPath && <>
          <div className="folder" style={{ background: "#fdeef4" }} data-player><PlayIcon /><div className="grow" style={{ wordBreak: "break-all" }}>{settings.playerPath}</div>
            <button type="button" className="btn btn-ghost btn-sm" onClick={choosePlayer}>เปลี่ยน</button></div>
          <div className="hint" style={{ margin: "8px 0 0" }}>ถ้าวันหลังหาโปรแกรมนี้ไม่เจอ กดเปิดเล่นแล้วจะบอก และพากลับมาตั้งที่นี่</div></>}
      </div>

      {/* ---------- เครื่องมือเบื้องหลัง ---------- */}
      <div className="setcard" data-setcard="tools"><h3>เครื่องมือเบื้องหลัง</h3>
        {tools == null
          ? [0, 1, 2, 3, 4, 5].map((i) => <div key={i} className="setrow" aria-busy="true"><Skel w="45%" h={12} /><Skel w={90} h={20} r={10} /></div>)
          : tools.map((t) => (
            <div key={t.name} className="setrow" data-tool={t.name}><div className="lbl">{t.name}<span className="small">{TOOL_ROLE[t.name] ?? ""}{t.ok ? "" : ` · ${t.version}`}</span></div>
              {t.ok ? <span className="toolok">พร้อมใช้งาน</span> : <span className="toolbad">ไม่พร้อม</span>}</div>))}
        <div className="setrow" data-tool="Icaros"><div className="lbl">Icaros<span className="small">ให้ Windows โชว์โปสเตอร์เป็นไอคอนไฟล์ ไม่ลงก็ใช้โปรแกรมนี้ได้ครบ</span></div>
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            {icaros == null ? <Skel w={80} h={20} r={10} /> : icaros ? <span className="toolok">ลงแล้ว</span> : <span className="toolwarn">ยังไม่ได้ลง</span>}
            {icaros === false && <button type="button" className="btn btn-ghost btn-sm" onClick={() => setIcarosHelp(true)} data-icaroshelp>วิธีลง</button>}</div></div>
        <div className="setrow"><div className="lbl small" style={{ margin: 0 }}>ซ่อนหรือย้ายเครื่องมือแล้ว กดตรวจใหม่เพื่อดูสถานะล่าสุด</div>
          <button type="button" className={"btn btn-sm " + (checking ? "btn-wait" : "btn-ghost")} aria-disabled={checking || undefined} onClick={() => { if (!checking) void recheck(); }} data-retools>{checking ? "กำลังตรวจ" : "ตรวจเครื่องมือใหม่"}</button></div>
      </div>

      {/* ---------- ตัวแปลงเสียง (มอคอัปเสียงและซับ หัวข้อ 8) · ตัวที่แนบมากับโปรแกรม กับตัวที่วางเองในโฟลเดอร์ตัวแปลง (ตัวที่สัญญาอนุญาตไม่ให้แจก) ---------- */}
      <div className="setcard" data-setcard="encoders">
        <h3 style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10 }}><span>ตัวแปลงเสียง</span>
          <span style={{ display: "flex", gap: 6 }}>
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => encodeApi.openDir().catch((e) => toast({ kind: "bad", title: "เปิดโฟลเดอร์ตัวแปลงไม่ได้", detail: String(e) }))} data-encdir>เปิดโฟลเดอร์ตัวแปลง</button>
            <button type="button" className={"btn btn-sm " + (encChecking ? "btn-wait" : "btn-ghost")} aria-disabled={encChecking || undefined} onClick={() => { if (!encChecking) void recheckEnc(); }} data-reenc>{encChecking ? "กำลังตรวจ" : "ตรวจตัวแปลงใหม่"}</button>
          </span></h3>
        <div className="small" style={{ marginBottom: 6 }}>โฟลเดอร์ตัวแปลงที่ใส่เอง <span className="nw" style={{ fontFamily: "var(--mono)", overflowWrap: "anywhere" }}>{encDir || "…"}</span> · <Phr>{"ตอนแปลงใช้ตัวต้นฉบับเป็นค่าตั้งต้น ffmpeg เป็นตัวรอง · วางรุ่นใหม่กว่าตัวที่แนบมา โปรแกรมใช้ตัวที่ใหม่กว่า"}</Phr></div>
        {encs == null
          ? [0, 1, 2, 3, 4].map((i) => <div key={i} className="setrow" aria-busy="true"><Skel w="45%" h={12} /><Skel w={90} h={20} r={10} /></div>)
          : encs.map((e) => (
            <div key={e.name} className="setrow" data-enc={e.name}><div className="lbl">{e.name}<span className="small">{e.codecs} · {e.ok ? `${e.version ?? "ไม่ทราบรุ่น"} · ${e.source === "user" ? "โฟลเดอร์ตัวแปลง" : "แนบมากับโปรแกรม"}` : e.problem ? e.problem : "ไม่เจอในโฟลเดอร์ตัวแปลง"}</span></div>
              {e.ok ? <span className="toolok">พร้อมใช้งาน</span> : e.problem ? <span className="toolwarn">ขาดไฟล์ประกอบ</span> : <span className="toolwarn">ยังไม่ได้ใส่</span>}</div>))}
        <div className="small" style={{ marginTop: 6 }}><Phr>{"qaac (AAC ของ Apple) กับ fdkaac (AAC ของ Fraunhofer) สัญญาอนุญาตไม่ให้แจกไปกับตัวติดตั้ง โหลดเองแล้ววางทุกไฟล์ที่มากับชุดไว้ในโฟลเดอร์ตัวแปลง แล้วกดตรวจตัวแปลงใหม่ · รายชื่อ รุ่น และสัญญาอนุญาตอยู่ docs/research/codec-เสียง.md"}</Phr></div>
      </div>

      {/* ---------- กราฟเสียง (แคลร์เพิ่ม · ผลอ่านคลื่นที่เก็บลงเครื่อง คิว 8) ---------- */}
      <div className="setcard" data-setcard="graph"><h3>กราฟเสียง</h3>
        <div className="setrow"><div className="lbl">ผลอ่านคลื่นที่เก็บไว้ในเครื่อง<span className="small">เปิดไฟล์เดิมซ้ำไม่ต้องอ่านใหม่ · ไฟล์หนังเปลี่ยนแล้วอ่านใหม่เอง · รวมไม่เกิน 300 MB</span>
          <span className="small" data-graphcache>{cache ? `${cache.files} ไฟล์ · ${fmtSize(cache.bytes)}` : "—"}</span></div>
          <button type="button" className="btn btn-ghost btn-sm" onClick={clearCache} data-clearcache>ล้าง</button></div>
      </div>

      <Dialog open={removing != null} onClose={() => setRemoving(null)} kind="work" confirm title={<>เอา <span style={{ wordBreak: "break-all" }}>{removing}</span> <span className="nw">ออกจากชั้น</span></>}
        actions={<><button type="button" className="btn btn-ghost btn-sm" onClick={() => setRemoving(null)}>ยกเลิก</button>
          <button type="button" className="btn btn-bad btn-sm" onClick={() => removing && removeFolder(removing)} data-confirmremove>เอาออกจากชั้น</button></>}>
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
  );
}
