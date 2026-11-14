/* หน้าซับไตเติล (BUGS ข้อ 101 พี่กันสั่ง 13 พ.ย. 2569 "สร้าเมนู ซับไตเติลไว้รอด้วย เพราะตามโร๊ดเเมพจะทำอยู่เเล้ว")
   ข้อ 104 ใส่ไฟล์แล้วดูซับในหน้านี้ได้เลย (พี่กันสั่ง "ดูได้หน้านี้เลย" · "ทำปุ่มอัปไฟล์ เหมือนจุดอื่นเลย")
   จุดลากไฟล์กับปุ่มเลือกไฟล์แบบหน้า MediaInfo · รับไฟล์หนัง (อ่านซับในไฟล์ด้วย merge_inspect ตัวเดียวกับหน้าเสียงและซับ) หรือไฟล์ซับ (merge_add_file)
   แต่ละซับมีปุ่มดูซับ เปิดตัวดูซับตัวเดียวกับหน้าเสียงและซับ · ไฟล์ซับไฟล์เดียวเปิดตัวดูซับให้เลย · อ่านอย่างเดียว ไฟล์ไม่ถูกแตะ
   ข้อ 107 ไฟล์ซับอย่างเดียวเพิ่มไฟล์วิดีโอคู่ได้ เห็นภาพหนังกับคลื่นเสียง (พี่กัน "ขอปุ่มเพิ่มวิดีโอมาด้วย")
   ข้อ 108 ซับในไฟล์หนังมีปุ่ม Export ได้ไฟล์ซับชนิดเดิม ใช้ตัวแยกไฟล์ตัวเดียวกับหน้าเสียงและซับ (extract.rs) เก็บที่โฟลเดอร์ <ชื่อหนัง> แยกไฟล์ ข้างไฟล์หนัง
   ชื่อชนถามก่อน ไม่เขียนทับ (พี่กัน "ขอปุ่ม export ไฟล์ซับด้วย")
   ข้อ 109 ซับตัวหนังสือเปิดเป็นหน้าแก้ซับแบบ Aegisub (แผนหน้าแก้ซับ · components/subedit/SubEditor.tsx) ซับรูปยังเป็นตัวดูเดิม
   เปลี่ยนแทร็กหรือเปิดไฟล์อื่นตอนซับที่แก้ยังไม่บันทึก ถามก่อน บันทึก ไม่บันทึก (เก็บฉบับอัตโนมัติให้) หรือยกเลิก */
import { useEffect, useRef, useState } from "react";
import Dialog from "../components/Dialog";
import SubEditor from "../components/subedit/SubEditor";
import { autosaveStrict, closeDoc, getSubEdit, requestSave } from "../lib/subEdit";
import { flushPad } from "../components/subedit/PadView";
import { api, infoApi, inApp, mergeApi, pickFile, SUB_EXT, type ExtractItem, type MergeTrack } from "../lib/api";
import { trackFrom, type AvTrack } from "../lib/avJob";
import { usePageActiveRef } from "../lib/pageActive";
import { ftName } from "../lib/ftypes";
import { langName } from "../lib/langs";
import { CardIcon, J, Keep, Phr, Seg, Skel, dropClick } from "../components/ui";
import { IbPencil, IbTable, IcExtract, IcFile, IcFolder, IcMix } from "../components/icons";
import SubViewer from "../components/SubViewer";

const MOVIE_EXT = ["mkv", "mp4", "m4v", "mov", "avi", "webm", "ts", "m2ts", "mpg", "mpeg", "vob", "flv"];
const extOf = (p: string) => (p.match(/\.([^.\\/]+)$/)?.[1] ?? "").toLowerCase();
const nameOf = (p: string) => p.split(/[\\/]/).pop() ?? p;

/** path ไฟล์ที่ใส่ · movie ใส่ไฟล์หนัง · video ไฟล์วิดีโอที่เพิ่มคู่กับไฟล์ซับ (ข้อ 107) · ref แทร็กเสียงที่ใช้วาดคลื่น · items ชิ้นที่ Export ได้ เรียงตามซับ (ข้อ 108) */
type Vid = { fps: number | null; res: [number, number] | null };
type Loaded = { path: string; movie: boolean; subs: AvTrack[]; video: string | null; ref: AvTrack | null; refIdx: number | null; items: (ExtractItem | null)[] | null; vid: Vid | null };
type Exp = { key: string; label: string; item: ExtractItem } & ({ s: "busy" } | { s: "done"; file: string } | { s: "conflict"; file: string } | { s: "failed"; err: string });

const PLANNED = [
  "ลากเวลาบนคลื่นเสียง ฟังเสียงเป็นช่วง และเส้นแบ่งฉากแบบ Aegisub",
  "เลื่อนเวลาทั้งไฟล์ ปรับเวลาทั้งไฟล์ และเครื่องมือของซับ ASS",
  "ใส่ซับที่แก้กลับเข้าไฟล์หนังจากหน้านี้ได้โดยไม่ต้องไปหน้าเสียงและซับ",
  "ซับรูป PGS กับ VobSub แปลงเป็นข้อความด้วยการอ่านจากภาพ",
];

/** อัตราเฟรมกับขนาดภาพของวิดีโอแทร็กแรก */
function vidOf(tracks: MergeTrack[]): Vid | null {
  const v = tracks.find((t) => t.kind === "video");
  return v ? { fps: v.fps, res: v.width && v.height ? [v.width, v.height] : null } : null;
}


/** แทร็กเสียงที่ใช้วาดคลื่น · เสียงหลักก่อน ไม่มีใช้เสียงแรก · ลำดับในเสียงด้วยกันใช้กับภาพความถี่ */
function refOf(tracks: MergeTrack[]) {
  const auds = tracks.filter((t) => t.kind === "audio");
  const a = auds.find((t) => t.default) ?? auds[0] ?? null;
  return { ref: a ? trackFrom(a) : null, refIdx: a ? auds.indexOf(a) : null };
}

export default function SubtitlePage({ onAv }: { onAv: () => void }) {
  const [file, setFile] = useState<Loaded | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [over, setOver] = useState(false);
  const [view, setView] = useState<string | null>(null);
  const [videoErr, setVideoErr] = useState<string | null>(null);
  const [exp, setExp] = useState<Exp | null>(null);
  const [subTab, setSubTab] = useState<"aeg" | "long" | "pad">("aeg");
  const pageOn = usePageActiveRef();
  /** งานที่รอถามก่อน เพราะซับที่แก้ยังไม่บันทึก · busy ระหว่างบันทึก */
  const [guard, setGuard] = useState<{ go: () => void; busy: boolean; err: string | null } | null>(null);
  /** ซับที่แก้ยังไม่บันทึก ถามก่อนเปลี่ยนแทร็กหรือเปิดไฟล์อื่น · ไม่มีอะไรค้างทำเลย */
  // ใส่ที่พิมพ์ค้างในแบบ notepad ลงเอกสารก่อนเช็ก ที่พิมพ์ภายในครึ่งวินาทีสุดท้ายยังไม่นับว่าแก้ (ผู้ช่วยตรวจทาน F8)
  const whenSaved = (go: () => void) => { void flushPad().then(() => { if (getSubEdit().dirty) setGuard({ go, busy: false, err: null }); else go(); }); };

  const openNow = async (p: string) => {
    const ext = extOf(p), movie = MOVIE_EXT.includes(ext);
    if (!movie && !SUB_EXT.includes(ext)) { setErr(`ไฟล์ .${ext || "?"} ไม่ใช่ไฟล์หนังหรือไฟล์ซับ`); return; }
    setErr(null); setView(null); setVideoErr(null); setExp(null); setBusy(p);
    try {
      if (movie) {
        const m = await mergeApi.inspect(p);
        const subs = m.tracks.filter((t) => t.kind === "subtitle").map((t) => trackFrom(t));
        setFile({ path: p, movie: true, subs, video: null, ...refOf(m.tracks), items: null, vid: vidOf(m.tracks) });
        if (subs.length) setView(subs[0].key); // ตัวดูซับแสดงในหน้าเลย เริ่มที่ซับแรก
        // ชิ้นที่ Export ได้ อ่านจาก MediaInfo แบบหน้าเสียงและซับ · ซับที่ n ในตาราง = Text #n ของ MediaInfo
        infoApi.mediaInfo(p).then((r) => {
          const texts = r.sections.filter((s) => s.kind === "text");
          const items = subs.map((_, i) => { const s = texts[i]; return s?.ext ? { kind: "text", nth: i + 1, ext: s.ext, lang: s.lang, name: null } : null; });
          setFile((f) => (f && f.path === p ? { ...f, items } : f));
        }, () => setFile((f) => (f && f.path === p ? { ...f, items: subs.map(() => null) } : f)));
      } else {
        const f = await mergeApi.addFile(p, null);
        const subs = f.tracks.filter((t) => t.kind === "subtitle").map((t) => trackFrom(t));
        setFile({ path: p, movie: false, subs, video: null, ref: null, refIdx: null, items: null, vid: null });
        if (subs.length) setView(subs[0].key); // ตัวดูซับแสดงในหน้าเลย
      }
    } catch (e) {
      setErr(`อ่านไฟล์ไม่ได้ ${String(e)}`);
    } finally { setBusy(null); }
  };
  const open = (p: string) => whenSaved(() => void openNow(p));
  const pick = async () => { const p = await pickFile("subtitle"); if (p) open(p); };
  const openRef = useRef(open); openRef.current = open;

  /** เพิ่มไฟล์วิดีโอคู่กับไฟล์ซับ (ข้อ 107) · อ่านแทร็กเสียงไว้วาดคลื่น ไฟล์ไม่ถูกแตะ */
  const setVideo = async (v: string) => {
    if (!MOVIE_EXT.includes(extOf(v))) { setVideoErr(`ไฟล์ .${extOf(v) || "?"} ไม่ใช่ไฟล์วิดีโอ`); return; }
    setVideoErr(null);
    try {
      const m = await mergeApi.inspect(v);
      setFile((f) => (f && !f.movie ? { ...f, video: v, ...refOf(m.tracks), vid: vidOf(m.tracks) } : f));
    } catch (e) { setVideoErr(`อ่านไฟล์วิดีโอไม่ได้ ${String(e)}`); }
  };
  /** เพิ่มไฟล์ซับคู่กับไฟล์หนังที่ใส่อยู่ ดูพร้อมภาพหนัง · ไฟล์หนังที่ไม่มีซับในตัวก็ดูได้ (พี่กันทัก "ตัวซับจะเปิดได้ที่หน้านี้เลย" กับไฟล์ที่ไม่มีซับ) */
  const addSubFile = async (sp: string) => {
    if (!SUB_EXT.includes(extOf(sp))) { setVideoErr(`ไฟล์ .${extOf(sp) || "?"} ไม่ใช่ไฟล์ซับ`); return; }
    setVideoErr(null);
    try {
      const f = await mergeApi.addFile(sp, null);
      const add = f.tracks.filter((t) => t.kind === "subtitle").map((t) => trackFrom(t));
      if (!add.length) { setVideoErr("ไฟล์นี้ไม่มีซับ"); return; }
      setFile((x) => (x && x.movie ? { ...x, subs: [...x.subs, ...add], items: x.items ? [...x.items, ...add.map(() => null)] : x.items } : x));
      whenSaved(() => setView(add[0].key));
    } catch (e) { setVideoErr(`อ่านไฟล์ซับไม่ได้ ${String(e)}`); }
  };
  const addSub = async () => { const sp = await pickFile("subtitle"); if (sp) void addSubFile(sp); };
  const subRef = useRef(addSubFile); subRef.current = addSubFile;
  const addVideo = async () => { const v = await pickFile("movie"); if (v) void setVideo(v); };
  const videoRef = useRef(setVideo); videoRef.current = setVideo;

  /** Export ซับหนึ่งแทร็กเป็นไฟล์ (ข้อ 108) · policy ask = ชื่อชนถามก่อน · number = ตั้งชื่อใหม่ต่อเลข · skip = ไม่ทำ */
  const doExport = async (key: string, label: string, item: ExtractItem, policy = "ask") => {
    if (!file) return;
    setExp({ key, label, item, s: "busy" });
    try {
      const r = await infoApi.extract(file.path, null, [item], [policy]);
      const st = r.states[0], f = r.files[0] ?? "";
      setExp(st === "done" ? { key, label, item, s: "done", file: f }
        : st === "conflict" ? { key, label, item, s: "conflict", file: f }
        : st === "skipped" ? null
        : { key, label, item, s: "failed", err: r.error ?? "Export ไม่สำเร็จ" });
    } catch (e) { setExp({ key, label, item, s: "failed", err: String(e) }); }
  };
  // ผลสำเร็จหายเอง ผิดพลาดกับชื่อชนค้างไว้จนกว่าจะกด (สกิล save-status)
  useEffect(() => {
    if (exp?.s !== "done") return;
    const t = setTimeout(() => setExp((x) => (x === exp ? null : x)), 8000);
    return () => clearTimeout(t);
  }, [exp]);
  const reveal = (p: string) => {
    // รุ่นทดสอบ ตัวตรวจตั้ง window.__openDry ไว้ จดว่ากดแทนการเปิด Explorer ที่จะเด้งขึ้นจอ · ตัวจริงไม่มีทางนี้
    const w = window as unknown as { __openDry?: boolean; __openDryLog?: string[] };
    if (import.meta.env.DEV && w.__openDry) { (w.__openDryLog ??= []).push(p); return; }
    api.revealMovie(p).catch((e) => setExp((x) => (x ? { ...x, s: "failed", err: String(e) } : x)));
  };

  // ลากไฟล์จาก Explorer มาวาง · หน้านี้ซ่อนอยู่ไม่รับ (BUGS ข้อ 9)
  useEffect(() => {
    if (!inApp) return;
    let off: (() => void) | undefined, live = true;
    import("@tauri-apps/api/webview").then(({ getCurrentWebview }) => getCurrentWebview().onDragDropEvent((e) => {
      if (!pageOn.current) return;
      // มีหน้าต่างซ้อนเปิดอยู่ (ใส่ซับกลับเข้าหนังกำลังรวมไฟล์ หน้าต่างถาม) ไม่รับไฟล์ที่ลากมา
      // ไม่งั้นเปิดไฟล์อื่นระหว่างรวมไฟล์ได้ แล้วผลรวมไฟล์ไปลงเอกสารใหม่ (ผู้ช่วยตรวจทาน F25)
      if (document.body.hasAttribute("data-dialog-open")) { setOver(false); return; }
      if (e.payload.type === "over" || e.payload.type === "enter") setOver(true);
      else if (e.payload.type === "leave") setOver(false);
      else if (e.payload.type === "drop") { setOver(false); if (e.payload.paths[0]) openRef.current(e.payload.paths[0]); }
    })).then((u) => { if (live) off = u; else u(); });
    return () => { live = false; off?.(); };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  // ตัวตรวจเปิดไฟล์ได้โดยไม่ต้องเปิดกล่องเลือกไฟล์ (กล่องจะเด้งขึ้นจอ)
  useEffect(() => {
    const w = window as unknown as { __subOpen?: (p: string) => void; __subVideo?: (p: string) => void; __subAddSub?: (p: string) => void };
    w.__subAddSub = (p) => void subRef.current(p);
    // ตัวตรวจเริ่มจากหน้าว่างและล้างหน้ากลับตอนจบ ไม่ทิ้งไฟล์ทดสอบค้างให้พี่กันเห็น
    (w as { __subClear?: () => void }).__subClear = () => { closeDoc(); setFile(null); setErr(null); setView(null); setExp(null); setVideoErr(null); };
    w.__subOpen = (p) => openRef.current(p);
    w.__subVideo = (p) => void videoRef.current(p);
  });

  const st = file?.subs.find((t) => t.key === view) ?? null;
  const refStream = file?.ref ? file.ref.ff ?? file.ref.tid : null;
  const exportBusy = exp?.s === "busy";

  // เปิดซับแล้ว จุดลากไฟล์ใหญ่หายไป เหลือแถวบนแถวเดียว ตัวดูซับขึ้นมาอยู่บน · ลากไฟล์มาวางที่หน้ายังได้ จุดลากไฟล์ขึ้นตอนลากผ่าน
  // (BUGS ข้อ 109 พี่กันสั่ง 13 พ.ย. 2569 "เราเปิดซับเเล้ว ย้่ายปุ่มอัปซับไปที่อื่น มันโคตรกินที่")
  const isImage = (t: AvTrack) => { const f = ftName("subtitle", t.codec, t.profile); return f === "PGS" || f === "VobSub"; };
  const showDrop = !file || over;
  const many = !!file && (file.movie || file.subs.length > 1);
  return (
    <div className="pagewrap" data-subtitle-page>
      <div className="ag">
        <div className="gmodebar subpage-bar" data-sub-bar>
          <button type="button" className="btn btn-ghost" style={{ height: 36 }} onClick={onAv} data-subtitle-go-av><IcMix />ไปหน้าเสียงและซับ</button>
          {file && !busy ? (<>
            <b className="subpage-name" title={file.path} data-sub-name>{nameOf(file.path)}</b>
            {file.video && <span className="small subpage-name" title={file.video}>ดูคู่กับ {nameOf(file.video)}</span>}
            <span style={{ flex: 1 }} />
            {/* ปุ่มเลือกแบบการดูอยู่แถวบนข้างปุ่มเพิ่มไฟล์ (BUGS ข้อ 109 พี่กัน "เอาปุ่มเลือกรูปแบบไปไว้ตรงปุ่มเพิ่มวิดีโอ") · ซับรูปมีแบบเดียว ไม่ขึ้น */}
            {st && !isImage(st) && <span className="subpage-seg" data-sub-tabs><Seg label="แบบการดู" value={subTab} onChange={setSubTab}
              options={[{ value: "aeg", label: <><IbTable size={14} />แบบ Aegisub</> }, { value: "long", label: <><IcFile size={14} />แบบอ่านยาว</> }, { value: "pad", label: <><IbPencil size={14} />แบบ notepad</> }]} /></span>}
            {file.movie
              ? <button type="button" className="btn btn-ghost" style={{ height: 36 }} onClick={() => void addSub()} title="เพิ่มไฟล์ซับที่แยกจากหนัง มาดูคู่กับหนังเรื่องนี้" data-sub-addsub><IcFile size={16} />เพิ่มไฟล์ซับ</button>
              : <button type="button" className="btn btn-ghost" style={{ height: 36 }} onClick={() => void addVideo()} title="เพิ่มไฟล์วิดีโอคู่กับซับ แล้วตัวดูซับแสดงภาพหนังกับคลื่นเสียง" data-sub-addvideo-page><IcFile size={16} />{file.video ? "เปลี่ยนไฟล์วิดีโอ" : "เพิ่มไฟล์วิดีโอ"}</button>}
            <button type="button" className="btn btn-ghost" style={{ height: 36 }} onClick={() => void pick()} title="เปิดไฟล์หนังหรือไฟล์ซับอื่น หรือลากไฟล์มาวางที่หน้านี้" data-sub-openother><IcFolder size={16} />เปิดไฟล์อื่น</button>
          </>) : <span className="small"><Phr>แก้ซับในไฟล์หนังหรือไฟล์ซับแบบ Aegisub  ไฟล์ไม่ถูกแตะจนกว่าจะกดบันทึก</Phr></span>}
        </div>
        {showDrop && (
          <div className={"drop" + (over ? " over" : err ? " bad" : "")} style={{ minHeight: file ? 120 : 180 }} onClick={dropClick(pick)} data-drop="subtitle">
            {over ? <b>ปล่อยเมาส์เพื่อเปิดไฟล์นี้</b>
              : err ? <b>{err}</b>
              : <><b style={{ color: "var(--txt2)" }}>ลากไฟล์หนังหรือไฟล์ซับมาวางตรงนี้</b><span>หรือ</span></>}
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => void pick()}><IcFile size={15} />เลือกไฟล์จากเครื่อง</button>
            <span className="small">{`รับไฟล์หนัง ${MOVIE_EXT.map((e) => e.toUpperCase()).join(" ")} และไฟล์ซับ ${SUB_EXT.map((e) => e.toUpperCase()).join(" ")}`}</span>
          </div>
        )}
        {file && !over && err && <div className="stat bad" data-sub-err><CardIcon kind="bad" /><div style={{ flex: 1 }}><b>{err}</b><div className="minirow"><button type="button" className="btn btn-ghost btn-sm" onClick={() => setErr(null)}>ปิด</button></div></div></div>}
        {videoErr && <div className="stat bad" data-sub-videoerr><CardIcon kind="bad" /><div style={{ flex: 1 }}><b>{videoErr}</b><div className="minirow"><button type="button" className="btn btn-ghost btn-sm" onClick={() => setVideoErr(null)}>ปิด</button></div></div></div>}

        {busy ? (
          <div className="card" aria-busy="true" data-sub-busy><Skel w="40%" h={18} /><Skel w="100%" h={34} style={{ marginTop: 10 }} /></div>
        ) : file && file.subs.length === 0 ? (
          <div className="stat info" data-sub-file><CardIcon kind="info" /><div><b>ไฟล์นี้ไม่มีซับในตัว</b><Phr>เพิ่มไฟล์ซับเพื่อดูคู่กับหนังเรื่องนี้</Phr>
            <div className="minirow"><button type="button" className="btn btn-ghost btn-sm" onClick={() => void addSub()} data-sub-addsub-empty><IcFile size={15} />เพิ่มไฟล์ซับ</button></div></div></div>
        ) : file && many && (
          // แถบเลือกแทร็กซับแถวเดียว ไม่เป็นการ์ดใหญ่ · ซับในไฟล์หนังมีปุ่ม Export ติดแทร็ก
          <div className="subpage-tracks" data-sub-file data-sub-list>{file.subs.map((t, i) => {
            const ft = ftName("subtitle", t.codec, t.profile);
            const lang = langName(t.lang);
            const label = !t.inMovie ? nameOf(t.src) : `ซับที่ ${i + 1}`;
            const item = file.items?.[i] ?? null;
            const mine = exp?.key === t.key;
            const why = !file.items ? "กำลังอ่านข้อมูลซับ" : !item ? "ซับชนิดนี้ Export ไม่ได้" : exportBusy && !mine ? "รอ Export ที่ทำอยู่ให้เสร็จก่อน" : undefined;
            return (
              <div key={t.key} className={"subpage-trk" + (view === t.key ? " on" : "")}>
                <button type="button" className="subpage-trkpick" aria-pressed={view === t.key} onClick={() => { if (view !== t.key) whenSaved(() => setView(t.key)); }} title={view === t.key ? "กำลังแก้ซับนี้" : "แก้ซับนี้"} data-sub-pick={i}>
                  <span className="rext">{ft}</span><span className="subpage-trkname">{label}{lang ? ` ${lang}` : ""}{t.name ? ` ${t.name}` : ""}</span>
                </button>
                {file.movie && t.inMovie && (
                  <button type="button" className={"btn btn-sm " + (why || (mine && exportBusy) ? "btn-wait" : "btn-ghost")} aria-disabled={!!why || (mine && exportBusy) || undefined}
                    title={why ?? (item ? `เก็บ${label}เป็นไฟล์ .${item.ext} ไว้ที่โฟลเดอร์ ${nameOf(file.path).replace(/\.[^.]+$/, "")} แยกไฟล์ ข้างไฟล์หนัง` : undefined)}
                    onClick={() => { if (!why && item && !exportBusy) void doExport(t.key, label, item); }} data-sub-export={i}>
                    <Keep all={["Export", "กำลัง Export…"]} icon={<IcExtract size={14} />}>{mine && exportBusy ? "กำลัง Export…" : "Export"}</Keep>
                  </button>
                )}
              </div>
            );
          })}</div>
        )}
        {exp && exp.s !== "busy" && (
          <div className={"stat " + (exp.s === "done" ? "ok" : exp.s === "conflict" ? "warn" : "bad")} data-sub-exp={exp.s}>
            <CardIcon kind={exp.s === "done" ? "ok" : exp.s === "conflict" ? "warn" : "bad"} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <b>{exp.s === "done" ? `Export ${exp.label} แล้ว` : exp.s === "conflict" ? "ในโฟลเดอร์มีไฟล์ชื่อนี้อยู่แล้ว" : `Export ${exp.label} ไม่สำเร็จ`}</b>
              <Phr>{exp.s === "failed" ? exp.err : `${nameOf(exp.file)}${exp.s === "conflict" ? "  ตั้งชื่อใหม่โดยต่อเลขท้าย หรือไม่ Export ไฟล์นี้ ไฟล์เดิมไม่ถูกเขียนทับ" : ""}`}</Phr>
              <div className="minirow">
                {exp.s === "done" && <button type="button" className="btn btn-ghost btn-sm" onClick={() => reveal(exp.file)} data-sub-reveal><IcFolder size={15} />เปิดโฟลเดอร์</button>}
                {exp.s === "conflict" && <>
                  <button type="button" className="btn btn-ghost btn-sm" onClick={() => void doExport(exp.key, exp.label, exp.item, "number")} data-sub-renum>ตั้งชื่อใหม่</button>
                  <button type="button" className="btn btn-ghost btn-sm" onClick={() => setExp(null)} data-sub-skip>ไม่ Export</button></>}
                {exp.s === "failed" && <button type="button" className="btn btn-ghost btn-sm" onClick={() => setExp(null)}>ปิด</button>}
              </div>
            </div>
          </div>
        )}

        {!file && !busy && (
          <div className="small" data-sub-planned>
            <div style={{ marginBottom: 4 }}>สิ่งที่จะเพิ่มในหน้านี้ตามโรดแมป</div>
            <ul style={{ margin: 0, paddingLeft: 20, lineHeight: 1.8 }}>{PLANNED.map((t) => <li key={t}><Phr>{t}</Phr></li>)}</ul>
          </div>
        )}
        {st && file && !busy && (isImage(st)
          ? <SubViewer inline tab={subTab} key={`${st.key}|${file.video ?? ""}`} track={st} movie={file.movie ? file.path : file.video ?? ""} refStream={refStream} refIdx={file.refIdx}
            onAddMovie={!file.movie ? () => void addVideo() : undefined} onClose={() => setView(null)} />
          : <SubEditor key={st.key} track={st} tab={subTab} moviePath={file.path} video={file.movie ? file.path : file.video ?? ""} refStream={refStream} refIdx={file.refIdx}
            label={st.inMovie ? `${nameOf(file.path)} ซับที่ ${file.subs.indexOf(st) + 1}` : nameOf(st.src)} fps={file.vid?.fps ?? null} playRes={file.vid?.res ?? null}
            onAddMovie={!file.movie ? () => void addVideo() : undefined}
            onMovieMoved={(from, to) => setFile((f) => (f && f.movie && f.path === from ? { ...f, path: to } : f))} />)}
      </div>
      <Dialog open={!!guard} onClose={() => { if (!guard?.busy) setGuard(null); }} kind="work" title="ซับที่แก้ยังไม่ได้บันทึก" width={560}
        actions={guard?.busy ? <button type="button" className="btn btn-wait" aria-disabled="true"><Keep all={["กำลังบันทึก…", "บันทึกแล้วไปต่อ"]}>กำลังบันทึก…</Keep></button> : <>
          <button type="button" className="btn btn-ghost" onClick={() => setGuard(null)} data-sub-guard-back>กลับไปแก้ต่อ</button>
          <button type="button" className="btn btn-ghost" onClick={() => { const g = guard; if (!g) return; void autosaveStrict().then(() => { setGuard(null); closeDoc(); g.go(); }, (e) => setGuard({ ...g, busy: false, err: String(e instanceof Error ? e.message : e) })); }} data-sub-guard-skip>ไม่บันทึก</button>
          <button type="button" className="btn btn-main" data-sub-guard-save onClick={async () => {
            const g = guard;
            if (!g) return;
            setGuard({ ...g, busy: true });
            const ok = await requestSave();
            // บันทึกทับไม่ได้ทันที (ต้องเลือกชื่อไฟล์ใหม่ หรือไฟล์ถูกแก้จากที่อื่น) ปิดหน้าต่างนี้ ให้หน้าต่างของหน้าแก้ซับถามต่อ
            if (ok === true) { setGuard(null); closeDoc(); g.go(); } else if (ok === null) setGuard({ ...g, busy: false, err: "ยังไม่มีหน้าแก้ซับให้บันทึก" }); else setGuard(null);
          }}><Keep all={["กำลังบันทึก…", "บันทึกแล้วไปต่อ"]}>บันทึกแล้วไปต่อ</Keep></button>
        </>}>
        <div className="small" style={{ fontSize: 14, color: "var(--txt2)" }}><Phr>{`แก้ ${getSubEdit().meta?.name ?? "ซับ"} ไปแล้ว แต่ยังไม่ได้บันทึกลงไฟล์  ถ้าไม่บันทึก โปรแกรมเก็บ${J}ฉบับ${J}บันทึก${J}อัตโนมัติ${J}ไว้ให้  เปิดคืนได้จากปุ่มฉบับอัตโนมัติ`}</Phr></div>
        {guard?.err && <div className="hint e" role="alert" style={{ marginTop: 10 }}>{guard.err}</div>}
      </Dialog>
    </div>
  );
}
