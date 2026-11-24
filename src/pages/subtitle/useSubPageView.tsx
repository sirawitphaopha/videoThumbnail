/* ลากไฟล์ คีย์ลัด แทร็กที่ดูอยู่ โหมดซับรูป และแถบบนในแถบชื่อโปรแกรม
   แยกจาก SubtitlePage.tsx ตอนจัดโครงไฟล์ตามความหมาย (BUGS ข้อ 155 ขั้น 8) เนื้อโค้ดยกมาทั้งก้อน */
import { useEffect } from "react";
import Dropdown from "../../components/Dropdown";
import { closeDoc, useSubEdit } from "../../lib/subEdit";
import { api, inApp } from "../../lib/api/index";
import { type AvTrack } from "../../lib/avJob";
import { ftName, isImageSub } from "../../lib/ftypes";
import { langName } from "../../lib/langs";
import { Keep, Seg } from "../../components/ui";
import { IbPencil, IbTable, IbWand, IcExtract, IcFile, IcFolder, IcMix, IcSubtitle } from "../../components/icons";
import { nameOf } from "./subPageShared";
import type { Sp0 } from "./subPageCtx";

export function useSubPageView(c: Sp0) {
  const { addSub, addVideo, busy, doExport, exp, file, fileRef, imgMode, onAv, openRef, over, pageOn, pick, pickTrack, setErr, setExp, setFile, setImgMode, setOver, setSubTab, setVideoErr, setView, subRef, subTab, videoRef, view, viewRef } = c;
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
    // ตัวจริงมีแค่ __subOpen กับ __subClear (ตัวตรวจของตัวจริงใช้) ตัวอื่นเฉพาะรุ่นทดสอบ (ผู้ช่วยตรวจทาน U20)
    if (import.meta.env.DEV) w.__subAddSub = (p) => void subRef.current(p);
    // ตัวตรวจเริ่มจากหน้าว่างและล้างหน้ากลับตอนจบ ไม่ทิ้งไฟล์ทดสอบค้างให้พี่กันเห็น
    (w as { __subClear?: () => void }).__subClear = () => { closeDoc(); setFile(null); setErr(null); setView(null); setExp(null); setVideoErr(null); };
    w.__subOpen = (p) => openRef.current(p);
    if (import.meta.env.DEV) (w as { __subPick?: (i: number) => void }).__subPick = (i) => { const t = fileRef.current?.subs[i]; if (t) pickTrack(t.key); };
    // ตัวตรวจอ่านรายชื่อแทร็กกับแทร็กที่เลือก (ดรอปดาวน์ไม่มีรายการใน DOM จนกว่าจะกาง)
    if (import.meta.env.DEV) (w as { __subTracks?: () => { list: string[]; cur: number } }).__subTracks = () => { const f = fileRef.current; return { list: f ? f.subs.map((t, i) => label(t, i)) : [], cur: f ? f.subs.findIndex((t) => t.key === viewRef.current) : -1 }; };
    if (import.meta.env.DEV) w.__subVideo = (p) => void videoRef.current(p);
  });

  const st = file?.subs.find((t) => t.key === view) ?? null;
  const refStream = file?.ref ? file.ref.ff ?? file.ref.tid : null;
  const exportBusy = exp?.s === "busy";

  // เปิดซับแล้ว จุดลากไฟล์ใหญ่หายไป เหลือแถวบนแถวเดียว ตัวดูซับขึ้นมาอยู่บน · ลากไฟล์มาวางที่หน้ายังได้ จุดลากไฟล์ขึ้นตอนลากผ่าน
  // (BUGS ข้อ 109 พี่กันสั่ง 13 พ.ย. 2569 "เราเปิดซับเเล้ว ย้่ายปุ่มอัปซับไปที่อื่น มันโคตรกินที่")
  const isImage = (t: AvTrack) => isImageSub(t.codec, t.profile);
  // ซับรูปที่ส่งผล OCR ไปหน้าแก้ซับแล้ว (แผน OCR ขั้น 12) · เอกสารของแทร็กนี้เปิดอยู่ จึงแก้กับวิดีโอได้
  const sed = useSubEdit();
  const ocrDoc = !!st && !!sed.doc && sed.meta?.key === st.key;
  useEffect(() => { if (imgMode === "edit" && !ocrDoc) setImgMode("view"); }, [imgMode, ocrDoc]);
  const showDrop = !file || over;
  const many = !!file && (file.movie || file.subs.length > 1);
  // แถวบนทั้งแถวอยู่ในแถบชื่อโปรแกรม (BUGS ข้อ 149) · เสียบเฉพาะตอนหน้านี้เปิดอยู่ · ช่องว่างกลางแถวลากหน้าต่างได้
  const label = (t: AvTrack, i: number) => { const lang = langName(t.lang); return `${!t.inMovie ? nameOf(t.src) : `ซับที่ ${i + 1}`} ${ftName("subtitle", t.codec, t.profile)}${lang ? ` ${lang}` : ""}${t.name ? ` ${t.name}` : ""}`; };
  const si = file && st ? file.subs.indexOf(st) : -1;
  const item = si >= 0 ? file?.items?.[si] ?? null : null;
  const canExport = !!file && file.movie && !!st?.inMovie;
  const expWhy = !file?.items ? "กำลังอ่านข้อมูลซับ" : !item ? "ซับชนิดนี้ Export ไม่ได้" : undefined;
  const top = (
    <span className="ttl-sub subpage-bar" data-sub-bar>
      <span className="sv-sep" aria-hidden />
      <button type="button" className="btn btn-ghost" onClick={onAv} data-subtitle-go-av><IcMix size={14} />ไปหน้าเสียงและซับ</button>
      {file && !busy && <>
        <b className="subpage-name" title={file.path} data-tauri-drag-region data-sub-name>{nameOf(file.path)}</b>
        {file.video && <span className="small subpage-name" title={file.video} data-tauri-drag-region>ดูคู่กับ {nameOf(file.video)}</span>}
        {/* เลือกแทร็กเป็นดรอปดาวน์ แทนแถวแทร็กเดิมที่กินที่ส่วนบน · เพิ่มไฟล์ซับอยู่ท้ายรายการ (มอคอัป OCR ที่พี่กันเคาะ) */}
        {many && view && <span className="ttl-dd" data-sub-list><Dropdown label="ซับที่แก้" value={view} portal
          onChange={(v) => { if (v === "__add") void addSub(); else pickTrack(v); }}
          options={[...file.subs.map((t, i) => ({ value: t.key, label: label(t, i) })), ...(file.movie ? [{ value: "__add", label: "เพิ่มไฟล์ซับที่แยกจากหนัง" }] : [])]} /></span>}
        {canExport && st && (
          <button type="button" className={"btn " + (expWhy || exportBusy ? "btn-wait" : "btn-ghost")} aria-disabled={!!expWhy || exportBusy || undefined}
            title={expWhy ?? (item ? `เก็บซับที่ ${si + 1} เป็นไฟล์ .${item.ext} ไว้ที่โฟลเดอร์ ${nameOf(file.path).replace(/\.[^.]+$/, "")} แยกไฟล์ ข้างไฟล์หนัง` : undefined)}
            onClick={() => { if (!expWhy && item && !exportBusy) void doExport(st.key, `ซับที่ ${si + 1}`, item); }} data-sub-export={si}>
            <Keep all={["Export", "กำลัง Export…"]} icon={<IcExtract size={14} />}>{exportBusy ? "กำลัง Export…" : "Export"}</Keep>
          </button>)}
      </>}
      <span className="ttl-gap" data-tauri-drag-region />
      {file && !busy && <>
        {st && isImage(st) && <span className="subpage-seg" data-sub-mode><Seg small label="งานที่ทำกับซับนี้" value={imgMode} onChange={setImgMode}
          options={[{ value: "view", label: <><IcSubtitle size={14} />ดูซับ</> }, { value: "ocr", label: <><IbWand size={14} />OCR เป็นตัวหนังสือ</> },
            { value: "edit", label: <><IbTable size={14} />แก้ซับกับวิดีโอ</>, off: ocrDoc ? undefined : "ซับรูปต้อง OCR เป็นตัวหนังสือก่อน แล้วกดไปหน้าแก้ซับในหน้า OCR" }]} /></span>}
        {st && !isImage(st) && <span className="subpage-seg" data-sub-tabs><Seg small label="แบบการดู" value={subTab} onChange={setSubTab}
          options={[{ value: "aeg", label: <><IbTable size={14} />แบบ Aegisub</> }, { value: "long", label: <><IcFile size={14} />แบบอ่านยาว</> }, { value: "pad", label: <><IbPencil size={14} />แบบ notepad</> }]} /></span>}
        {!file.movie && <button type="button" className="btn btn-ghost" onClick={() => void addVideo()} title="เพิ่มไฟล์วิดีโอคู่กับซับ แล้วตัวดูซับแสดงภาพหนังกับคลื่นเสียง" data-sub-addvideo-page><IcFile size={14} />{file.video ? "เปลี่ยนไฟล์วิดีโอ" : "เพิ่มไฟล์วิดีโอ"}</button>}
        {file.movie && file.subs.length === 0 && <button type="button" className="btn btn-ghost" onClick={() => void addSub()} title="เพิ่มไฟล์ซับที่แยกจากหนัง มาดูคู่กับหนังเรื่องนี้" data-sub-addsub><IcFile size={14} />เพิ่มไฟล์ซับ</button>}
        <button type="button" className="btn btn-ghost" onClick={() => void pick()} title="เปิดไฟล์หนังหรือไฟล์ซับอื่น หรือลากไฟล์มาวางที่หน้านี้" data-sub-openother><IcFolder size={14} />เปิดไฟล์อื่น</button>
      </>}
    </span>);
  return { reveal, st, refStream, exportBusy, isImage, sed, ocrDoc, showDrop, many, label, si, item, canExport, expWhy, top };
}
