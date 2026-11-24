/* บันทึก บันทึกเป็นชนิดอื่น ไปบรรทัด เพิ่ม ลบ และแปลงเป็น ASS
   แยกจาก SubEditor.tsx ตอนจัดโครงไฟล์ตามความหมาย (BUGS ข้อ 155 ขั้น 5) เนื้อโค้ดยกมาทั้งก้อน */
import { useEffect, useLayoutEffect, useRef } from "react";
import { pickSave, subDocApi, type SubDoc } from "../../lib/api";
import { deleteEvents, edit, getSubEdit, markSaved, openDoc, setSaver, type SaveResult } from "../../lib/subEdit";
import { flushPad } from "./PadView";
import { Ask, KIND_EXT, nameOf } from "./editorParts";
import type { E3 } from "./seCtx";

export function useSeSave(c: E3) {
  const { base, key, p, sameKind, save, setAsk, setRemux, setSave, st } = c;
  const doSave = async (force = false, inexactOk = false): Promise<SaveResult> => {
    await flushPad();
    const d = getSubEdit().doc;
    if (!d || save.s === "saving") return false;
    if (!sameKind(d)) { if (d.source?.inMovie) setRemux(true); else openSaveAs(d.kind); return "choose"; }
    if (!d.exact && !inexactOk) { setAsk({ k: "inexact" }); return "choose"; }
    setSave({ s: "saving" });
    try {
      const r = await subDocApi.save(d, d.source!.path, "replace", force);
      // เอกสารที่เขียนคือ d (ตอนกด) · พิมพ์ต่อระหว่างรอยังนับว่ายังไม่บันทึก (F4)
      markSaved(d, { source: r.source, enc: r.enc, exact: true });
      setSave({ s: "done", note: r.badChar ? `รหัส ${d.enc.charset} เก็บตัว ${r.badChar} ไม่ได้ จึงบันทึกเป็น UTF-8` : null });
      return true;
    } catch (e) {
      const m = String(e);
      setSave({ s: "idle" });
      if (m === "changed") { setAsk({ k: "changed" }); return "choose"; }
      if (m === "missing") { openSaveAs(d.kind); return "choose"; }
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
    await flushPad();
    const d = getSubEdit().doc;
    if (!d) return;
    setSave({ s: "saving" });
    try {
      const conv = to === d.kind ? d : to === "srt" || to === "ass" ? (await subDocApi.convert(d, to, p.playRes ?? undefined)).doc : d;
      const r = await subDocApi.save(conv, target, "new");
      setAsk(null);
      if (conv === d) markSaved(d, { source: r.source, enc: r.enc, exact: true }, { ...getSubEdit().meta!, name: nameOf(r.path), base: r.path.replace(/\.[^.\\/]+$/, "") });
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

  // ---------------------------------------------------------------- คำสั่งของบรรทัด (ขั้น 6)
  return { doSave, saveRef, openSaveAs, saveNew, browse, onDelete, onToAss };
}
