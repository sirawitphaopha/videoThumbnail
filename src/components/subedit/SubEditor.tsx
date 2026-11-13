/* หน้าแก้ซับ (แผนหน้าแก้ซับ ขั้น 3 · BUGS ข้อ 109 · แบบ 1 ที่พี่กันเลือก ช่องแก้บรรทัดอยู่ระหว่างภาพหนังกับตาราง แบบ Aegisub)
   แถบเครื่องมือ เลิกทำ ทำซ้ำ · บอกจำนวนบรรทัดที่แก้ยังไม่บันทึก · ฉบับบันทึกอัตโนมัติ · รหัสอักษร · บันทึกเป็นไฟล์ใหม่ · บันทึก
   ภาพหนังกับคลื่นเสียงบน ช่องแก้บรรทัดกลาง ตารางล่างสูงเต็มที่ว่างที่เหลือของหน้าต่าง อย่างน้อยหัวตารางกับสองแถว (หน้าต่าง 1280 × 800 เห็นราวสองแถวตามมอคอัปที่พี่กันเลือก)
   บันทึก (ทางที่แคลร์เลือก แผนติดป้ายว่าพี่กันยังไม่ได้เคาะ)
     ไฟล์ซับ เขียนทับ ไฟล์เดิมลงถังขยะ (กู้คืนได้) · ไฟล์ถูกแก้จากที่อื่นหลังเปิด ถามก่อน · ไฟล์มีอักษรที่อ่านไม่ออก ถามก่อน
     ซับในหนัง หรือเปลี่ยนชนิดแล้ว ต้องบันทึกเป็นไฟล์ใหม่ · ชื่อชนไม่เขียนทับ ตั้งชื่อใหม่ต่อเลข
     บันทึกเป็น SRT เตือนก่อนว่าอะไรหาย (พี่กัน "ตอน export srt ต้องบอกว่าอะไรจะหายไปมั่ง")
   ปุ่มบันทึกบอกสถานะทุกจังหวะ สำเร็จหายเอง ผิดพลาดค้างไว้ (สกิล save-status)
   คีย์ลัด Ctrl+Z เลิกทำ Ctrl+Y หรือ Ctrl+Shift+Z ทำซ้ำ Ctrl+S บันทึก Ctrl+Shift+S บันทึกเป็นไฟล์ใหม่ (ใช้ได้ตอนพิมพ์ในช่องด้วย) */
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { pickSave, subDocApi, type SubAutosave, type SubDoc, type SubEvent, type SubLost } from "../../lib/api";
import type { AvTrack } from "../../lib/avJob";
import { autosaveNow, blankEvent, deleteEvents, edit, editedCount, getSubEdit, insertEvent, markSaved, openDoc, redo, select, setSaver, undo, useSubEdit } from "../../lib/subEdit";
import { useHotkeys } from "../../lib/hotkeys";
import { usePageActiveRef } from "../../lib/pageActive";
import { fromBox, garbageGet, garbageSet, isAss, plain, snapMs, toBox, type TagMode } from "../../lib/subText";
import { dummyName, getVid, jumpKeyframe, parseDummy, seek, seekTime, setDummy, useVid, vidKeys, vidOpen, vidRate, zoomStep, type DummySpec } from "../../lib/vidFrames";
import Dialog from "../Dialog";
import Dropdown from "../Dropdown";
import InfoTip from "../InfoTip";
import { CardIcon, J, Keep, Phr, Seg, Skel } from "../ui";
import { IbRedo, IbSave, IbTick, IbUndo, IcClock, IcFile, IcFolder } from "../icons";
import SubGrid from "./SubGrid";
import SubEditBox, { savedOf } from "./SubEditBox";
import SubVideo, { shownText } from "./SubVideo";
import SubAudio from "./SubAudio";
import FontDialog from "./FontDialog";
import { DetailsDialog, DummyDialog, JumpDialog } from "./VideoDialogs";
import "../../styles/subedit.css";

const nameOf = (p: string) => p.split(/[\\/]/).pop() ?? p;
const dirOf = (p: string) => p.replace(/[\\/][^\\/]*$/, "");
const extOf = (p: string) => (p.match(/\.([^.\\/]+)$/)?.[1] ?? "").toLowerCase();
const KIND_EXT: Record<SubDoc["kind"], string> = { ass: "ass", ssa: "ssa", srt: "srt", vtt: "vtt" };
const CHARSETS = ["UTF-8", "TIS-620", "Windows-1252", "UTF-16LE", "UTF-16BE"] as const;
/** สิ่งที่หายตอนบันทึกเป็น SRT เป็นประโยค (subdoc.rs to_srt ส่งคีย์มา) */
const LOST: Record<string, string> = {
  comment: "บรรทัดความคิดเห็น", actor: "ชื่อตัวละคร", layer: "ลำดับชั้น (เลเยอร์)", style: "สไตล์ของแต่ละบรรทัด ซับ SRT ทุกบรรทัดใช้หน้าตาตั้งต้นของโปรแกรมเล่น",
  effect: "เอฟเฟกต์", margin: "ระยะขอบของแต่ละบรรทัด", tags: "แท็กฟอนต์ ขนาด สี ตำแหน่ง และแท็กอื่นที่ไม่ใช่ตัวหนา ตัวเอียง ขีดเส้นใต้ ขีดฆ่า", fonts: "ฟอนต์หรือรูปที่ฝังไว้ในไฟล์ ASS", settings: "ค่าตั้งตำแหน่งของ VTT",
};
const ENC_TIP = {
  w: "รหัสที่ใช้เก็บตัวอักษรในไฟล์ โปรแกรมเดาให้ตอนเปิด และบันทึกกลับด้วยรหัสเดิม ถ้าภาษาไทยขึ้นเป็นตัวแปลก ๆ ให้เปิดด้วยรหัสอื่น",
  o: [
    ["UTF-8", "รหัสสากล เก็บได้ทุกภาษา", "โปรแกรมเล่นทุกตัวอ่านได้", "ไฟล์ไทยใหญ่กว่า TIS-620 ราวสามเท่า"] as [string, string, string, string],
    ["TIS-620", "รหัสไทยแบบเก่า ซับไทยเก่า ๆ ใช้กันเยอะ", "ไฟล์เล็ก", "เก็บได้แค่ไทยกับอังกฤษ ตัวอื่นต้องบันทึกเป็น UTF-8"] as [string, string, string, string],
    ["Windows-1252", "รหัสภาษายุโรปแบบเก่า", "ซับฝรั่งเศส เยอรมัน สเปนเก่าอ่านถูก", "เก็บภาษาไทยไม่ได้"] as [string, string, string, string],
    ["UTF-16", "รหัสสากลอีกแบบ ตัวละสองไบต์", "เก็บได้ทุกภาษา", "โปรแกรมเล่นบางตัวอ่านไม่ได้"] as [string, string, string, string],
  ],
  r: "เปิดแล้วอ่านออกถูกต้องอยู่แล้ว ไม่ต้องเปลี่ยน",
};

type Save = { s: "idle" } | { s: "saving" } | { s: "done"; note: string | null } | { s: "failed"; err: string };
type Ask =
  | { k: "changed" }
  | { k: "inexact" }
  | { k: "saveas"; to: SubDoc["kind"]; lost: SubLost[] | null; path: string }
  | { k: "exists"; path: string; to: SubDoc["kind"] };

export type SubEditorProps = {
  track: AvTrack;
  /** ชื่อที่แสดงและใช้ตั้งชื่อฉบับบันทึกอัตโนมัติ */
  label: string;
  /** ไฟล์หนังที่ซับนี้อยู่ข้างใน (ซับในหนัง) */
  moviePath: string;
  /** หนังที่ใช้ดูภาพกับฟังเสียง · ว่าง = ยังไม่มีวิดีโอ */
  video: string;
  refStream: number | null;
  refIdx: number | null;
  fps: number | null;
  /** ขนาดภาพของหนัง ใช้เป็นขนาดภาพของซับตอนเปลี่ยน SRT เป็น ASS */
  playRes: [number, number] | null;
  tab: "aeg" | "long" | "pad";
  onAddMovie?: () => void;
};

export default function SubEditor(p: SubEditorProps) {
  const st = useSubEdit();
  const doc = st.doc;
  const key = p.track.key;
  const [load, setLoad] = useState<{ s: "busy" } | { s: "ok" } | { s: "failed"; err: string }>({ s: "busy" });
  const [save, setSave] = useState<Save>({ s: "idle" });
  const [ask, setAsk] = useState<Ask | null>(null);
  const [autoList, setAutoList] = useState<SubAutosave[] | null>(null);
  const [tags, setTags] = useState<TagMode>("full");
  const [font, setFont] = useState<{ apply: (tag: string, reset: string) => void; current: { name: string; size: string } } | null>(null);
  const [gridH, setGridH] = useState(240);
  const [unit, setUnit] = useState<"time" | "frame">("time");
  const [vdlg, setVdlg] = useState<"jump" | "details" | "dummy" | null>(null);
  const vst = useVid();
  const fr = vidRate(vst);
  /** เลือกบรรทัดจากคำสั่งไปขอบบรรทัด ไม่ให้ AUTO พาภาพกลับไปเวลาเริ่มทับ */
  const skipAuto = useRef(false);
  const root = useRef<HTMLElement>(null);
  const gridAt = useRef<HTMLDivElement>(null);
  const pageOn = usePageActiveRef();
  const path = p.track.inMovie ? p.moviePath : p.track.src;
  const base = (p.track.inMovie ? p.moviePath : p.track.src).replace(/\.[^.\\/]+$/, "") + (p.track.inMovie && p.track.lang ? `.${p.track.lang}` : "");

  const openAs = (charset?: string) => {
    setLoad({ s: "busy" });
    subDocApi.open(path, p.track.inMovie, p.track.tid, p.track.ff ?? p.track.tid, charset).then((d) => {
      openDoc(d, { name: p.label, movie: p.video, key, base });
      setLoad({ s: "ok" });
      setSave({ s: "idle" });
    }, (e) => setLoad({ s: "failed", err: String(e) }));
  };
  // เปิดซับเมื่อเปลี่ยนแทร็ก · สลับหน้าไปกลับแล้วซับที่แก้อยู่ไม่เปิดใหม่
  useEffect(() => {
    const m = getSubEdit().meta;
    if (m?.key === key && getSubEdit().doc) { setLoad({ s: "ok" }); return; }
    openAs();
  }, [key]); // eslint-disable-line react-hooks/exhaustive-deps
  // เพิ่มหรือเปลี่ยนไฟล์วิดีโอทีหลัง เอกสารเดิมยังอยู่
  useEffect(() => { const s = getSubEdit(); if (s.meta && s.meta.key === key && s.meta.movie !== p.video) s.meta.movie = p.video; }, [p.video, key]);
  // ภาพหนังของเอกสารนี้ · ไม่มีหนังแต่ไฟล์ ASS จำวิดีโอจำลองไว้ (Video File: ?dummy:… แบบ Aegisub) ใช้วิดีโอจำลองนั้น
  useEffect(() => {
    if (load.s !== "ok") return;
    const d = getSubEdit().doc;
    const v = d && isAss(d) ? garbageGet(d, "Video File") : null;
    vidOpen(p.video, v ? parseDummy(v) : null);
  }, [load.s, key, p.video]);

  // ตารางสูงเต็มที่ว่างที่เหลือของหน้าต่าง อย่างน้อย 180 จุด
  useLayoutEffect(() => {
    const fit = () => { const el = gridAt.current; if (!el) return; setGridH(Math.max(80, Math.floor(window.innerHeight - el.getBoundingClientRect().top - 14))); };
    fit();
    const ro = new ResizeObserver(fit);
    if (root.current) ro.observe(root.current);
    window.addEventListener("resize", fit);
    return () => { ro.disconnect(); window.removeEventListener("resize", fit); };
  }, [p.tab, load.s, doc?.kind]);

  // ผลบันทึกสำเร็จหายเอง ผิดพลาดค้างไว้
  useEffect(() => {
    if (save.s !== "done") return;
    const t = setTimeout(() => setSave((x) => (x === save ? { s: "idle" } : x)), 5000);
    return () => clearTimeout(t);
  }, [save]);

  const ev = doc?.events.find((e) => e.id === st.active) ?? null;
  const at = doc && ev ? doc.events.indexOf(ev) : -1;
  const dl = p.track.delay;

  // AUTO เลือกบรรทัดแล้วภาพไปเฟรมแรกที่ซับขึ้น (Video/Subtitle Sync ของ Aegisub) · ยังไม่มีภาพเลย ไปเฟรมนั้นแม้ปิด AUTO
  useEffect(() => {
    if (!ev || !fr) return;
    if (skipAuto.current) { skipAuto.current = false; return; }
    if (getVid().auto || getVid().pos == null) seekTime(ev.start + dl, "start");
  }, [ev?.id, fr]); // eslint-disable-line react-hooks/exhaustive-deps

  /** Ctrl กับลูกศร ไปเวลาเริ่ม เวลาจบ แล้วบรรทัดถัดไป (video/frame/next/boundary ของ Aegisub) */
  const boundary = (dir: 1 | -1) => {
    const f = vidRate(), pos = getVid().pos;
    if (!f || pos == null || !doc || !ev) return;
    const s = f.frameAt(ev.start + dl, "start"), e = f.frameAt(ev.end + dl, "end");
    if (dir > 0) {
      if (s > pos) return seek(s);
      if (e > pos) return seek(e);
      const nx = doc.events[at + 1];
      if (nx) { skipAuto.current = true; select([nx.id], nx.id); seekTime(nx.start + dl, "start"); }
    } else {
      if (e < pos) return seek(e);
      if (s < pos) return seek(s);
      const pv = doc.events[at - 1];
      if (pv) { skipAuto.current = true; select([pv.id], pv.id); seekTime(pv.end + dl, "end"); }
    }
  };
  /** ลูกศรซ้ายขวาในกรอบภาพหรือตาราง · Shift ไป keyframe · Ctrl ไปขอบบรรทัด · Alt ทีละ 10 เฟรม (Fast Jump Step ของ Aegisub) */
  const sideKey = (e: React.KeyboardEvent) => {
    if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
    const pos = getVid().pos;
    if (!vidRate() || pos == null) return;
    e.preventDefault();
    const dir = e.key === "ArrowRight" ? 1 : -1;
    if (e.shiftKey) jumpKeyframe(dir);
    else if (e.ctrlKey || e.metaKey) boundary(dir);
    else if (e.altKey) seek(pos + dir * 10);
    else seek(pos + dir);
  };
  /** ใช้วิดีโอจำลอง · ซับ ASS จำไว้ในไฟล์แบบ Aegisub (บันทึกแล้วเปิดครั้งหน้าได้วิดีโอจำลองเดิม) ซับ SRT ไม่มีที่เก็บ ใช้ได้จนปิดหน้า */
  const applyDummy = (spec: DummySpec) => {
    setDummy(spec);
    const d = getSubEdit().doc;
    if (d && isAss(d) && garbageGet(d, "Video File") !== dummyName(spec)) edit("ใช้วิดีโอจำลอง", (x) => garbageSet(x, "Video File", dummyName(spec)));
  };
  const onCloseVideo = () => {
    const d = getSubEdit().doc;
    if (d && isAss(d) && garbageGet(d, "Video File")?.startsWith("?dummy")) edit("ปิดวิดีโอจำลอง", (x) => garbageSet(x, "Video File", null));
  };
  const frWhy = vst.dummy ? "" : !vst.movie ? "ยังไม่มีไฟล์วิดีโอ จึงไม่รู้เวลาของแต่ละเฟรม" : vst.closed ? "ปิดวิดีโออยู่" : vst.load === "err" ? "อ่านเวลาเฟรมของวิดีโอไม่ได้" : "กำลังอ่านเวลาของทุกเฟรม รอสักครู่";
  const sameKind = (d: SubDoc) => { const s = d.source; return !!s && !s.inMovie && extOf(s.path) === KIND_EXT[d.kind] || (!!s && !s.inMovie && d.kind === "srt" && extOf(s.path) === "txt"); };

  /** บันทึก · คืน true เมื่อบันทึกแล้ว · ต้องให้คนเลือกเพิ่ม (หน้าต่างถาม) คืน false */
  const doSave = async (force = false, inexactOk = false): Promise<boolean> => {
    const d = getSubEdit().doc;
    if (!d || save.s === "saving") return false;
    if (!sameKind(d)) { openSaveAs(d.kind); return false; }
    if (!d.exact && !inexactOk) { setAsk({ k: "inexact" }); return false; }
    setSave({ s: "saving" });
    try {
      const r = await subDocApi.save(d, d.source!.path, "replace", force);
      const now = getSubEdit().doc ?? d;
      markSaved({ ...now, source: r.source, enc: r.enc, exact: true });
      setSave({ s: "done", note: r.badChar ? `รหัส ${d.enc.charset} เก็บตัว ${r.badChar} ไม่ได้ จึงบันทึกเป็น UTF-8` : null });
      return true;
    } catch (e) {
      const m = String(e);
      setSave({ s: "idle" });
      if (m === "changed") { setAsk({ k: "changed" }); return false; }
      if (m === "missing") { openSaveAs(d.kind); return false; }
      setSave({ s: "failed", err: m });
      return false;
    }
  };
  const saveRef = useRef(doSave);
  useLayoutEffect(() => { saveRef.current = doSave; });
  // หน้าต่างถามตอนปิดโปรแกรมเรียกตัวบันทึกนี้ (CloseGuard.tsx) · ต้องเลือกชื่อไฟล์ใหม่ คืน false แล้วหน้านี้ขึ้นหน้าต่างให้เลือก
  useEffect(() => { setSaver(() => saveRef.current()); return () => setSaver(null); }, []);

  const openSaveAs = (to: SubDoc["kind"]) => {
    const d = getSubEdit().doc;
    if (!d) return;
    const ext = KIND_EXT[to];
    const b = getSubEdit().meta?.base ?? base;
    setAsk({ k: "saveas", to, lost: null, path: `${b}.${ext}` });
    if ((d.kind === "ass" || d.kind === "ssa") && to === "srt") subDocApi.convert(d, "srt").then((r) => setAsk((a) => (a?.k === "saveas" && a.to === "srt" ? { ...a, lost: r.lost } : a)), () => {});
  };
  /** บันทึกเป็นไฟล์ใหม่ที่ path · เปลี่ยนชนิดก่อนถ้าต้อง · ชื่อชนถามตั้งชื่อใหม่ */
  const saveNew = async (to: SubDoc["kind"], target: string) => {
    const d = getSubEdit().doc;
    if (!d) return;
    setSave({ s: "saving" });
    try {
      const conv = to === d.kind ? d : to === "srt" || to === "ass" ? (await subDocApi.convert(d, to, p.playRes ?? undefined)).doc : d;
      const r = await subDocApi.save(conv, target, "new");
      setAsk(null);
      if (conv === d) markSaved({ ...(getSubEdit().doc ?? d), source: r.source, enc: r.enc, exact: true }, { ...getSubEdit().meta!, name: nameOf(r.path), base: r.path.replace(/\.[^.\\/]+$/, "") });
      else {
        // เปลี่ยนชนิดแล้ว เปิดไฟล์ใหม่ที่บันทึกแทน ประวัติเลิกทำเริ่มใหม่ (คนละชนิดไฟล์)
        const nd = await subDocApi.open(r.path, false, 0, 0);
        openDoc(nd, { name: nameOf(r.path), movie: p.video, key, base: r.path.replace(/\.[^.\\/]+$/, "") });
      }
      setSave({ s: "done", note: `บันทึกเป็น ${nameOf(r.path)}${r.badChar ? ` ด้วย UTF-8 เพราะรหัสเดิมเก็บตัว ${r.badChar} ไม่ได้` : ""}` });
    } catch (e) {
      const m = String(e);
      setSave({ s: "idle" });
      if (m === "exists") { setAsk({ k: "exists", path: target, to }); return; }
      setSave({ s: "failed", err: m });
    }
  };
  const browse = async (a: Extract<Ask, { k: "saveas" }>) => {
    // ตัวตรวจเลือกที่เก็บได้โดยไม่เปิดกล่องของ Windows (กล่องจะเด้งขึ้นจอ)
    const w = window as unknown as { __subSaveAs?: string };
    const ext = KIND_EXT[a.to];
    const r = import.meta.env.DEV && w.__subSaveAs ? w.__subSaveAs : await pickSave(a.path, ext, `ซับ ${ext.toUpperCase()}`);
    if (r) setAsk({ ...a, path: /\.[^.\\/]+$/.test(nameOf(r)) ? r : `${r}.${ext}` });
  };

  // ---------------------------------------------------------------- แก้บรรทัด
  const goto = (i: number) => { if (!doc) return; const k = Math.max(0, Math.min(doc.events.length - 1, i)); const e = doc.events[k]; if (e) select([e.id], e.id); };
  const onNext = (create: boolean) => {
    if (!doc || !ev) return;
    if (at < doc.events.length - 1) { goto(at + 1); return; }
    if (!create) return;
    // บรรทัดสุดท้าย Enter สร้างบรรทัดใหม่ต่อท้าย เริ่มที่เวลาจบ ยาว 3 วินาที (Timing/Default Duration ของ Aegisub)
    insertEvent(at, blankEvent(doc, { start: ev.end, end: ev.end + 3000, style: ev.style }), "เพิ่มบรรทัด");
  };
  const onInsert = () => { if (doc && ev) insertEvent(at, blankEvent(doc, { start: ev.end, end: ev.end + 3000, style: ev.style, layer: ev.layer }), "แทรกบรรทัด"); };
  const onSplit = (cur: number) => {
    if (!doc || !ev) return;
    const box = toBox(ev.text, doc);
    const a = box.slice(0, cur).replace(/\n+$/, ""), b = box.slice(cur).replace(/^\n+/, "");
    if (!a || !b) return;
    // แบ่งเวลาตามสัดส่วนตัวอักษรที่คนอ่าน (split at cursor estimate times ของ Aegisub)
    const la = plain(fromBox(a, doc)).length, lb = plain(fromBox(b, doc)).length;
    const mid = snapMs(ev.start + ((ev.end - ev.start) * la) / Math.max(1, la + lb), doc);
    const second = { ...blankEvent(doc, {}), ...ev, id: blankEvent(doc, {}).id, start: mid, text: fromBox(b, doc), pre: [], raw: [], ident: null };
    edit("แยกบรรทัด", (d) => {
      const events = d.events.slice();
      const k = events.findIndex((e) => e.id === ev.id);
      events.splice(k, 1, { ...ev, end: mid, text: fromBox(a, doc) }, second);
      return { ...d, events };
    }, { sel: [second.id], active: second.id });
  };
  const onJoin = () => {
    if (!doc || !ev) return;
    const ids = st.sel.length > 1 ? st.sel : [ev.id, doc.events[at + 1]?.id].filter((x): x is number => x != null);
    const lines = doc.events.filter((e) => ids.includes(e.id));
    if (lines.length < 2) return;
    const first = lines[0];
    // ต่อข้อความด้วยเว้นวรรค เวลาจบมากสุด (combine_concat ของ Aegisub)
    const joined: SubEvent = { ...first, text: lines.map((e) => e.text).join(" "), end: Math.max(...lines.map((e) => e.end)) };
    const drop = new Set(lines.slice(1).map((e) => e.id));
    edit("รวมบรรทัด", (d) => ({ ...d, events: d.events.filter((e) => !drop.has(e.id)).map((e) => (e.id === first.id ? joined : e)) }), { sel: [first.id], active: first.id });
  };
  const onDelete = () => { if (st.sel.length) deleteEvents(st.sel, st.sel.length > 1 ? `ลบ ${st.sel.length} บรรทัด` : "ลบบรรทัด"); };
  const onToAss = () => {
    const d = getSubEdit().doc;
    if (!d) return;
    subDocApi.convert(d, "ass", p.playRes ?? undefined).then((r) => {
      // เปลี่ยนในหน้านี้ก่อน ที่มายังเป็นไฟล์ SRT เดิม ปุ่มบันทึกจะพาไปบันทึกเป็นไฟล์ .ass ใหม่ ไฟล์ SRT ไม่ถูกแตะ
      const ids = new Map(d.events.map((e, i) => [r.doc.events[i]?.id, e.id]));
      const keepIds = { ...r.doc, source: d.source, events: r.doc.events.map((e) => ({ ...e, id: ids.get(e.id) ?? e.id })) };
      edit("เปลี่ยนเป็น ASS", () => keepIds);
    }, (e) => setSave({ s: "failed", err: String(e) }));
  };

  useHotkeys([
    { code: "KeyZ", ctrl: true, field: true, run: () => undo() },
    { code: "KeyY", ctrl: true, field: true, run: () => redo() },
    { code: "KeyZ", ctrl: true, shift: true, field: true, run: () => redo() },
    { code: "KeyS", ctrl: true, field: true, run: () => void doSave() },
    { code: "KeyS", ctrl: true, shift: true, field: true, run: () => { const d = getSubEdit().doc; if (d) openSaveAs(d.kind); } },
    // คีย์ลัดวิดีโอของ Aegisub (default_hotkey.json) ใช้ได้ทั้งหน้า รวมตอนพิมพ์ในช่อง
    { code: "Numpad6", ctrl: true, field: true, run: () => { const pos = getVid().pos; if (pos != null) seek(pos + 1); } },
    { code: "Numpad4", ctrl: true, field: true, run: () => { const pos = getVid().pos; if (pos != null) seek(pos - 1); } },
    { code: "Digit1", ctrl: true, field: true, run: () => { if (ev) seekTime(ev.start + dl, "start"); } },
    { code: "Digit2", ctrl: true, field: true, run: () => { if (ev) seekTime(ev.end + dl, "end"); } },
    { code: "KeyG", ctrl: true, field: true, run: () => { if (vidRate()) setVdlg("jump"); } },
    { code: "NumpadAdd", ctrl: true, field: true, run: () => zoomStep(1) },
    { code: "NumpadSubtract", ctrl: true, field: true, run: () => zoomStep(-1) },
  ], pageOn);

  // ทางลัดให้ตัวตรวจ เฉพาะรุ่นทดสอบ
  useEffect(() => {
    if (!import.meta.env.DEV) return;
    const w = window as unknown as Record<string, unknown>;
    w.__subEditSave = () => saveRef.current();
    w.__subEditSaveNew = (to: SubDoc["kind"], target: string) => saveNew(to, target);
  });

  if (load.s === "failed") return <div className="stat bad" data-se-loaderr><CardIcon kind="bad" /><div><b>เปิดซับไม่ได้</b><Phr>{load.err}</Phr></div></div>;
  if (load.s === "busy" || !doc) return <section className="card se" aria-busy="true" data-subedit><Skel w="60%" h={30} /><div className="aegtop se-top" style={{ marginTop: 12 }}><Skel w="100%" h={203} r={0} /><Skel w="100%" h={150} /></div><Skel w="100%" h={160} style={{ marginTop: 12 }} /></section>;

  const n = editedCount();
  const undoTop = st.undo.at(-1), redoTop = st.redo.at(-1);
  const saving = save.s === "saving";
  const saveWhy = !st.dirty && sameKind(doc) ? "ยังไม่ได้แก้อะไร" : undefined;
  const lostOf = ask?.k === "saveas" ? ask.lost : null;

  return (
    <section className="card se" ref={root} data-subedit data-se-kind={doc.kind}>
      <div className="se-tools" data-se-tools>
        <button type="button" className={"btn btn-ghost btn-sm" + (undoTop ? "" : " btn-wait")} aria-disabled={!undoTop || undefined} title={undoTop ? `เลิกทำ ${undoTop.label} (Ctrl+Z)` : "ยังไม่มีอะไรให้เลิกทำ"} onClick={() => undo()} data-se-undo><IbUndo size={15} />เลิกทำ</button>
        <button type="button" className={"btn btn-ghost btn-sm" + (redoTop ? "" : " btn-wait")} aria-disabled={!redoTop || undefined} title={redoTop ? `ทำซ้ำ ${redoTop.label} (Ctrl+Y)` : "ยังไม่มีอะไรให้ทำซ้ำ"} onClick={() => redo()} data-se-redo><IbRedo size={15} />ทำซ้ำ</button>
        <span className="se-sep" />
        <span className="se-enc">
          <Dropdown label="รหัสอักษร" value={doc.enc.charset} display={() => `รหัส ${doc.enc.charset}`} sizes={CHARSETS.map((c) => `รหัส ${c}`)}
            options={CHARSETS.map((c) => ({ value: c, label: c }))} onChange={(c) => { if (c !== doc.enc.charset) { if (st.dirty) setSave({ s: "failed", err: "บันทึกหรือเลิกทำการแก้ก่อน แล้วค่อยเปิดด้วยรหัสอื่น ไม่งั้นที่แก้ไว้จะหาย" }); else openAs(c); } }} />
          <InfoTip title="รหัสอักษร" tip={ENC_TIP} />
        </span>
        <span style={{ flex: 1 }} />
        <span className="se-state" data-se-state>
          {save.s === "saving" ? "กำลังบันทึก…" : save.s === "done" ? <span className="se-ok"><IbTick size={14} />{save.note ?? "บันทึกแล้ว"}</span>
            : st.dirty ? <span className="se-dirty">{n ? `แก้แล้ว ${n} บรรทัด ยังไม่บันทึก` : "ยังไม่บันทึก"}</span> : st.autosave.at ? `บันทึกอัตโนมัติล่าสุด ${st.autosave.at.slice(11, 16)}` : ""}
        </span>
        <button type="button" className="btn btn-ghost btn-sm" onClick={() => subDocApi.autosaves().then(setAutoList, (e) => setSave({ s: "failed", err: String(e) }))} title="ฉบับที่โปรแกรมบันทึกเองทุก 60 วินาทีระหว่างแก้ เปิดคืนได้" data-se-autos><IcClock size={15} />ฉบับอัตโนมัติ</button>
        <button type="button" className={"btn btn-ghost btn-sm" + (saving ? " btn-wait" : "")} aria-disabled={saving || undefined} onClick={() => !saving && openSaveAs(doc.kind)} title="บันทึกเป็นไฟล์ใหม่ เลือกชนิดไฟล์ได้ (Ctrl+Shift+S)" data-se-saveas><IcFile size={15} />บันทึกเป็นไฟล์ใหม่</button>
        <button type="button" className={"btn btn-sm " + (saving || saveWhy ? "btn-wait" : "btn-main")} aria-disabled={saving || !!saveWhy || undefined}
          title={saveWhy ?? (sameKind(doc) ? `บันทึกทับ ${nameOf(doc.source!.path)} ไฟล์เดิมลงถังขยะ (Ctrl+S)` : "ซับนี้ยังไม่มีไฟล์ของตัวเอง ต้องบันทึกเป็นไฟล์ใหม่")}
          onClick={() => { if (!saving && !saveWhy) void doSave(); }} data-se-save>
          <IbSave size={15} /><Keep all={["บันทึก", "กำลังบันทึก…"]}>{saving ? "กำลังบันทึก…" : "บันทึก"}</Keep>
        </button>
      </div>
      {save.s === "failed" && <div className="stat bad se-saveerr" role="alert" data-se-saveerr><CardIcon kind="bad" /><div style={{ flex: 1 }}><b>บันทึกไม่สำเร็จ</b><Phr>{save.err}</Phr><div className="minirow"><button type="button" className="btn btn-ghost btn-sm" onClick={() => setSave({ s: "idle" })}>ปิด</button></div></div></div>}
      {(!doc.exact || doc.bad > 0) && <div className="stat warn se-note" data-se-inexact><CardIcon kind="warn" /><div><Phr>{[!doc.exact ? `ไฟล์นี้มีตัวอักษรที่รหัส ${doc.enc.charset} อ่านไม่ออก บันทึกแล้วตัวนั้นจะเปลี่ยน ถ้าภาษาไทยขึ้นผิด ลองเปิดด้วยรหัสอื่น` : "", doc.bad > 0 ? `มี ${doc.bad} บรรทัดที่อ่านไม่ออก ไม่ขึ้นในตารางแต่ยังอยู่ในไฟล์ตอนบันทึก` : ""].filter(Boolean).join("  ")}</Phr></div></div>}

      {p.tab === "aeg" && <>
        <div className="aegtop se-top">
          <SubVideo delayMs={dl} doc={doc} ev={ev} name={nameOf(p.video)} onAddMovie={p.onAddMovie} onKey={sideKey}
            onDummy={() => setVdlg("dummy")} onDetails={() => setVdlg("details")} onJump={() => setVdlg("jump")} onClose={onCloseVideo} />
          <SubAudio movie={p.video} refStream={p.refStream} refIdx={p.refIdx} delayMs={dl} doc={doc} ev={ev} />
        </div>
        {ev ? <SubEditBox doc={doc} ev={ev} orig={st.orig[ev.id]} savedEv={savedOf(ev.id)} fr={fr} frWhy={frWhy} delayMs={dl} unit={unit} onUnit={setUnit} onPrev={() => goto(at - 1)} onNext={onNext}
          onInsert={onInsert} onSplit={onSplit} onJoin={onJoin} onDelete={onDelete} onToAss={onToAss} onFont={(apply, current) => setFont({ apply, current })} />
          : <div className="stat info"><CardIcon kind="info" /><div><b>ซับนี้ยังไม่มีบรรทัด</b><div className="minirow"><button type="button" className="btn btn-ghost btn-sm" onClick={() => insertEvent(-1, blankEvent(doc, { start: 0, end: 3000 }), "เพิ่มบรรทัด")} data-se-first>เพิ่มบรรทัดแรก</button></div></div></div>}
        <div className="se-gridbar">
          <span className="small">{`${doc.events.length.toLocaleString("en-US")} บรรทัด`}{st.sel.length > 1 ? ` เลือกไว้ ${st.sel.length} บรรทัด` : ""}</span>
          <span style={{ flex: 1 }} />
          <Seg small label="แท็กในตาราง" value={tags} onChange={setTags} options={[{ value: "full", label: "แท็กเต็ม" }, { value: "sym", label: "ย่อเป็น ☀" }, { value: "hide", label: "ซ่อนแท็ก" }]} />
        </div>
        <div ref={gridAt}><SubGrid doc={doc} sel={st.sel} active={st.active} tags={tags} height={gridH} onSelect={(ids, a) => select(ids, a)}
          fr={unit === "frame" ? fr : null} delayMs={dl} onSideKey={sideKey} /></div>
      </>}
      {p.tab === "long" && <div className="subtext se-long" style={{ maxHeight: "none" }} data-long-view>{doc.events.filter((e) => !e.comment).map((e, i) => (
        <div key={e.id} className={"cue" + (e.id === st.active ? " cur" : "")} onClick={() => select([e.id], e.id)}><span className="n">{i + 1}</span><span className="t">{`${(e.start / 1000).toFixed(2)} → ${(e.end / 1000).toFixed(2)}`}</span><div style={{ whiteSpace: "pre-line" }}>{shownText(e, doc)}</div></div>
      ))}</div>}
      {p.tab === "pad" && <PadView doc={doc} />}

      <JumpDialog open={vdlg === "jump"} fr={fr} pos={vst.pos ?? 0} onClose={() => setVdlg(null)} onJump={seek} />
      <DetailsDialog open={vdlg === "details"} onClose={() => setVdlg(null)} name={nameOf(p.video)} table={vst.table} dummy={vst.dummy} fr={fr} keys={vidKeys(vst).list.length} />
      <DummyDialog open={vdlg === "dummy"} onClose={() => setVdlg(null)} onUse={applyDummy} />
      <FontDialog open={!!font} current={font?.current ?? { name: "", size: "" }} sample={ev ? shownText(ev, doc).replace(/\n/g, " ") : ""} onClose={() => setFont(null)} onApply={(t, r) => font?.apply(t, r)} />
      <Dialog open={ask?.k === "changed"} onClose={() => setAsk(null)} kind="work" title="ไฟล์ซับถูกแก้จากที่อื่น" width={560}
        actions={<>
          <button type="button" className="btn btn-ghost" onClick={() => setAsk(null)}>ยกเลิก</button>
          <button type="button" className="btn btn-ghost" onClick={() => { setAsk(null); openSaveAs(doc.kind); }} data-se-changed-new>บันทึกเป็นไฟล์ใหม่</button>
          <button type="button" className="btn btn-main" onClick={() => { setAsk(null); void doSave(true, true); }} data-se-changed-force>บันทึกทับ</button>
        </>}>
        {/* สองย่อหน้าละบรรทัดเดียว ไม่ให้บรรทัดบนโดนกระจายแบบไทยจนตัวอักษรถ่าง (CLAUDE.md) */}
        <div className="se-dlgtext"><Phr>{`${nameOf(doc.source?.path ?? "")} ถูกแก้หรือบันทึกจากโปรแกรมอื่นหลังเปิดในหน้านี้`}</Phr></div>
        <div className="se-dlgtext"><Phr>{`${["ถ้า", "บันทึก", "ทับ สิ่ง", "ที่", "แก้", "จาก", "ที่", "อื่น", "จะ", "หาย"].join(J)}  แต่ไฟล์นั้นยังกู้คืนได้จากถังขยะ`}</Phr></div>
      </Dialog>
      <Dialog open={ask?.k === "inexact"} onClose={() => setAsk(null)} kind="work" title="ไฟล์นี้มีตัวอักษรที่อ่านไม่ออก" width={560}
        actions={<>
          <button type="button" className="btn btn-ghost" onClick={() => setAsk(null)}>ยกเลิก</button>
          <button type="button" className="btn btn-main" onClick={() => { setAsk(null); void doSave(false, true); }} data-se-inexact-ok>บันทึกต่อ</button>
        </>}>
        <div className="se-dlgtext"><Phr>{`ตอนเปิด โปรแกรมอ่านบางตัวด้วยรหัส ${doc.enc.charset} ไม่ออก  บันทึกแล้วตัวนั้นจะเปลี่ยนเป็นตัวอื่น  ถ้าภาษาไทยในตารางขึ้นผิด ให้ยกเลิกแล้วเปิดด้วยรหัสอื่นก่อน`}</Phr></div>
      </Dialog>
      <Dialog open={ask?.k === "saveas"} onClose={() => setAsk(null)} kind="work" title="บันทึกเป็นไฟล์ใหม่" width={620}
        actions={ask?.k === "saveas" ? <>
          <button type="button" className="btn btn-ghost" onClick={() => setAsk(null)}>ยกเลิก</button>
          <button type="button" className={"btn " + (saving ? "btn-wait" : "btn-main")} aria-disabled={saving || undefined} onClick={() => !saving && void saveNew(ask.to, ask.path)} data-se-saveas-ok>
            <IbSave size={15} /><Keep all={["บันทึก", "กำลังบันทึก…"]}>{saving ? "กำลังบันทึก…" : "บันทึก"}</Keep></button>
        </> : null}>
        {ask?.k === "saveas" && <div className="se-saveas" data-se-saveas-dlg>
          <div className="se-erow">
            <span className="se-f">ชนิดไฟล์</span>
            <Seg label="ชนิดไฟล์" value={ask.to} onChange={(to) => openSaveAs(to)}
              options={[{ value: "ass", label: "ASS" }, { value: "srt", label: "SRT" }, ...(doc.kind === "vtt" ? [{ value: "vtt" as const, label: "VTT" }] : []), ...(doc.kind === "ssa" ? [{ value: "ssa" as const, label: "SSA" }] : [])]} />
          </div>
          <div className="se-erow"><span className="se-f">ที่เก็บ</span><span className="se-path" title={ask.path} data-se-saveas-path>{ask.path}</span>
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => void browse(ask)} data-se-saveas-browse><IcFolder size={15} />เปลี่ยนที่เก็บ</button></div>
          {ask.to === "srt" && isAss(doc) && (
            <div className="stat warn" style={{ margin: 0 }} data-se-lost><CardIcon kind="warn" /><div>
              <b>บันทึกเป็น SRT แล้วของเหล่านี้หาย</b>
              {lostOf == null ? <Skel w="70%" h={16} /> : lostOf.length === 0 ? <div>ไม่มีอะไรหาย ตัวหนา ตัวเอียง ขีดเส้นใต้ ขีดฆ่า เก็บได้ครบ</div>
                : <ul className="se-lostlist">{lostOf.map((l) => <li key={l.key}><Phr>{`${LOST[l.key] ?? l.key}${l.key === "fonts" ? "" : ` (${l.n.toLocaleString("en-US")} บรรทัด)`}`}</Phr></li>)}</ul>}
              <div className="small"><Phr>ตัวหนา ตัวเอียง ขีดเส้นใต้ และขีดฆ่า เก็บได้ครบ  ส่วนไฟล์ ASS เดิมไม่ถูกแตะ</Phr></div>
            </div></div>
          )}
          {ask.to === "ass" && !isAss(doc) && <div className="small">เปลี่ยนเป็น ASS แล้วตั้งขนาดภาพของซับตามหนัง{p.playRes ? ` ${p.playRes[0]} × ${p.playRes[1]}` : " 1920 × 1080"} และมีสไตล์ Default หนึ่งสไตล์</div>}
        </div>}
      </Dialog>
      <Dialog open={ask?.k === "exists"} onClose={() => setAsk(null)} kind="work" title="ในโฟลเดอร์มีไฟล์ชื่อนี้อยู่แล้ว" width={560}
        actions={ask?.k === "exists" ? <>
          <button type="button" className="btn btn-ghost" onClick={() => setAsk(null)}>ยกเลิก</button>
          <button type="button" className="btn btn-main" onClick={() => { const a = ask; void subDocApi.freeName(a.path).then((f) => saveNew(a.to, f)); }} data-se-exists-renum>ตั้งชื่อใหม่ต่อเลข</button>
        </> : null}>
        {ask?.k === "exists" && <div className="se-dlgtext"><Phr>{`${nameOf(ask.path)} มีอยู่แล้วใน ${dirOf(ask.path)}  โปรแกรมไม่เขียนทับไฟล์อื่น  ตั้งชื่อใหม่โดยต่อเลขท้าย หรือยกเลิกแล้วเลือกที่เก็บใหม่`}</Phr></div>}
      </Dialog>
      <Dialog open={!!autoList} onClose={() => setAutoList(null)} kind="menu" title="ฉบับบันทึกอัตโนมัติ" width={640}>
        {autoList && <div className="se-autos" data-se-autolist>
          <div className="small"><Phr>โปรแกรมบันทึกเองทุก 60 วินาทีระหว่างแก้ เก็บ 10 ฉบับล่าสุดต่อไฟล์ เปิดฉบับไหนแล้วกดบันทึก จะเขียนทับไฟล์เดิมที่แก้</Phr></div>
          {st.dirty && <div className="small se-dirty"><Phr>ที่แก้ค้างอยู่ในหน้านี้ โปรแกรมเก็บเป็นฉบับอัตโนมัติให้ก่อนเปิดฉบับอื่น</Phr></div>}
          {autoList.length === 0 ? <div className="small">ยังไม่มีฉบับบันทึกอัตโนมัติ</div> : autoList.slice(0, 40).map((a) => (
            <div key={a.path} className="se-auto">
              <span className="se-cut"><b>{a.name}</b> <span className="small nw">{`${a.at} ${a.events.toLocaleString("en-US")} บรรทัด`}</span></span>
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => {
                // ที่แก้ค้างในหน้านี้เก็บเป็นฉบับอัตโนมัติก่อน แล้วค่อยเปิดฉบับที่เลือก ไม่มีอะไรหาย
                void autosaveNow().then(() => subDocApi.openAutosave(a.path)).then((d) => { openDoc(d, { name: a.name, movie: p.video, key, base: (d.source?.path ?? a.path).replace(/\.[^.\\/]+$/, "") }, { dirty: true }); setAutoList(null); }, (e) => setSave({ s: "failed", err: String(e) }));
              }} data-se-autoopen>เปิด</button>
            </div>
          ))}
        </div>}
      </Dialog>
    </section>
  );
}

/** แบบ notepad ข้อความทั้งไฟล์ตามที่จะบันทึก (ขั้น 8 ทำให้แก้ได้) */
function PadView({ doc }: { doc: SubDoc }) {
  const [text, setText] = useState<string | null>(null);
  useEffect(() => { let live = true; subDocApi.render(doc).then((t) => { if (live) setText(t); }, () => {}); return () => { live = false; }; }, [doc]);
  if (text == null) return <Skel w="100%" h={300} />;
  const lines = text.replace(/\r\n?/g, "\n").split("\n");
  return (
    <div className="np se-pad" data-notepad-view>
      {lines.map((l, i) => <div key={i} className="npl"><span className="ln">{i + 1}</span><span className="tx">{l || " "}</span></div>)}
      <div className="npst">{`${lines.length.toLocaleString("en-US")} บรรทัด ${doc.kind.toUpperCase()} รหัส ${doc.enc.charset} ข้อความตามที่จะบันทึก ยังแก้ในแบบนี้ไม่ได้`}</div>
    </div>
  );
}
