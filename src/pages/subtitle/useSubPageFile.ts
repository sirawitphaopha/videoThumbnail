/* ไฟล์ที่เปิด แทร็กซับ วิดีโอ เพิ่มซับ แยกซับออกจากหนัง และถามก่อนเปลี่ยนไฟล์ตอนยังไม่บันทึก
   แยกจาก SubtitlePage.tsx ตอนจัดโครงไฟล์ตามความหมาย (BUGS ข้อ 155 ขั้น 8) เนื้อโค้ดยกมาทั้งก้อน */
import { useEffect, useRef, useState } from "react";
import { getSubEdit } from "../../lib/subEdit";
import { flushPad } from "../../components/subedit/PadView";
import { infoApi, mergeApi, pickFile, SUB_EXT, type ExtractItem } from "../../lib/api/index";
import { trackFrom } from "../../lib/avJob";
import { usePageActive, usePageActiveRef } from "../../lib/pageActive";
import { MOVIE_EXT, extOf, type Loaded, type Exp, vidOf, refOf } from "./subPageShared";

export type SpProps = { onAv: () => void; onSettings?: () => void };

export function useSubPageFile(p: SpProps) {
  const { onAv, onSettings } = p;
  const [file, setFile] = useState<Loaded | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [over, setOver] = useState(false);
  const [view, setView] = useState<string | null>(null);
  const [videoErr, setVideoErr] = useState<string | null>(null);
  const [exp, setExp] = useState<Exp | null>(null);
  const [subTab, setSubTab] = useState<"aeg" | "long" | "pad">("aeg");
  /** งานที่ทำกับซับรูป ดูซับ หรือ OCR เป็นตัวหนังสือ (แผน OCR ขั้น 11 · ข้อ 143 ㉔) */
  const [imgMode, setImgMode] = useState<"view" | "ocr" | "edit">("view");
  const pageOn = usePageActiveRef();
  const active = usePageActive();
  /** ช่องในแถบชื่อโปรแกรม แถวบนเดิมของหน้านี้ย้ายขึ้นไปทั้งแถว (BUGS ข้อ 149 พี่กันสั่ง "ย้ายขึ้นไป เเถบนี้" แล้ว "ย้ายขึ้นไปบนสุดให้หมด") */
  const [ttl, setTtl] = useState<HTMLElement | null>(null);
  useEffect(() => { setTtl(document.querySelector<HTMLElement>("[data-ttl-slot]")); }, []);
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
        const f = await mergeApi.addFile(p, null, true);
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
  const fileRef = useRef(file); fileRef.current = file;
  const viewRef = useRef(view); viewRef.current = view;
  /** เลือกแทร็กซับที่แก้ · ซับที่แก้ยังไม่บันทึกถามก่อน */
  const pickTrack = (key: string) => { if (key !== view) whenSaved(() => setView(key)); };

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
      const f = await mergeApi.addFile(sp, null, true);
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
      setExp(st === "done" ? { key, label, item, s: "done", file: f, pair: r.pair?.[0] }
        : st === "conflict" ? { key, label, item, s: "conflict", file: f }
        : st === "skipped" ? null
        : { key, label, item, s: "failed", err: r.error ?? "Export ไม่สำเร็จ", detail: r.detail });
    } catch (e) { setExp({ key, label, item, s: "failed", err: String(e) }); }
  };
  // ผลสำเร็จหายเอง ผิดพลาดกับชื่อชนค้างไว้จนกว่าจะกด (สกิล save-status)
  return { file, setFile, busy, setBusy, err, setErr, over, setOver, view, setView, videoErr, setVideoErr, exp, setExp, subTab, setSubTab, imgMode, setImgMode, pageOn, active, ttl, setTtl, guard, setGuard, whenSaved, openNow, open, pick, openRef, fileRef, viewRef, pickTrack, setVideo, addSubFile, addSub, subRef, addVideo, videoRef, doExport, onAv, onSettings };
}
