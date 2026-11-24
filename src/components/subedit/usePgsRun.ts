/* คำขอที่ส่งตัวสร้าง คำเตือนข้อจำกัดของ PGS ภาพตัวอย่าง ขนาดที่คาด ปุ่มส่งออก เปลี่ยนที่เก็บ และข้อความผลส่งออก
   แยกจาก PgsDialog.tsx ตอนจัดโครงไฟล์ตามความหมาย (BUGS ข้อ 155 ขั้น 10) เนื้อโค้ดยกมาทั้งก้อน */
import { useEffect } from "react";
import { inApp, pgsApi, pickSave, type PgsOpts, type PgsOut, type SrtStyle } from "../../lib/api";
import { nameOf, BD, FPS, OPTS0, isAnimated, isSoft, maxTogether } from "./pgsShared";
import type { Pg0 } from "./pgsCtx";

export function usePgsRun(hk: Pg0) {
  const { ass, engine, estSeq, fps, line, lines, opts, p, path, prev, run, sample, seconvOk, seq, setErr, setEst, setExists, setOpts, setOut, setPath, setPrev, setRun, setStyle, size, src, style, superOk } = hk;
  const busy = run != null;
  const [w, h] = size === "video" && p.video ? [p.video.w, p.video.h] : size.split("x").map(Number);
  const std = BD.some(([a, b]) => a === w && b === h);
  const f = FPS.find((x) => x.v === fps) ?? FPS[0];
  const seconv = engine === "seconv";
  // SeConv ทำจานสีกับกรอบเอง ส่งค่าตั้งต้นไปให้ฝั่ง Rust ถอดภาพตัวอย่างด้วยตารางสีที่ตัวเล่นเดา · หน้าตาที่ตั้งใช้กับ SRT และกับ SeConv ทุกชนิดซับ
  const useStyle = !ass || seconv;
  const req = { target: path, w, h, fpsNum: f.num, fpsDen: f.den, movie: p.movie, engine, opts: seconv ? OPTS0 : opts, style: useStyle ? style : null };
  const setO = <K extends keyof PgsOpts>(k: K, v: PgsOpts[K]) => setOpts((o) => ({ ...o, [k]: v }));
  const setS = <K extends keyof SrtStyle>(k: K, v: SrtStyle[K]) => setStyle((o) => ({ ...o, [k]: v }));
  const superWhy = superOk === false ? "ยังไม่มี SUPer ในโฟลเดอร์เครื่องมือของโปรแกรม" : !std ? "SUPer รับเฉพาะขนาดภาพของ Blu-ray" : undefined;
  const seconvWhy = seconvOk === false ? "ยังไม่มี SeConv ในโฟลเดอร์เครื่องมือของโปรแกรม" : undefined;
  const engWhy = engine === "super" ? superWhy : seconv ? seconvWhy : undefined;
  const anim = lines.filter((e) => isAnimated(e.text)).length;
  const soft = lines.filter((e) => isSoft(e.text)).length;
  const together = maxTogether(p.doc);
  // SeConv ไม่วาดเอฟเฟกต์และทำจานสีเอง คำเตือนเรื่องเอฟเฟกต์กับจำนวนสีจึงไม่ใช้ (ซับ ASS มีกล่องเตือนของ SeConv แยก)
  const warns: string[] = [
    ...(lines.length === 0 ? ["ซับนี้ไม่มีบรรทัดที่ขึ้นบนภาพ"] : []),
    ...(anim && !seconv ? [`มีเอฟเฟกต์เคลื่อนไหว ${anim.toLocaleString("en-US")} บรรทัด โปรแกรมวาดใหม่ทุกเฟรม ไฟล์จะใหญ่ขึ้นและเครื่องเล่น Blu-ray บางเครื่องอาจแสดงไม่ทัน`] : []),
    ...(soft && !seconv ? [`มีขอบเบลอหรือสีโปร่งใส ${soft.toLocaleString("en-US")} บรรทัด ภาพเก็บได้ไม่เกิน ${opts.colors} สี จึงอาจเห็นสีเป็นขั้น`] : []),
    ...(together > 2 ? [`มีช่วงที่ซับขึ้นพร้อมกัน ${together} บรรทัด ถ้าอยู่เกิน${opts.windows === 1 && !seconv ? "หนึ่ง" : "สอง"}ที่บนจอ ตัวสร้างจะรวมเป็นกรอบเดียวกัน`] : []),
    ...(!std ? [`ขนาด ${w} × ${h} ไม่ใช่ขนาดของ Blu-ray เครื่องเล่น Blu-ray อาจไม่รับ แต่ตัวเล่นในคอมเล่นได้`] : []),
  ];
  const why = busy ? "กำลังส่งออก" : lines.length === 0 ? "ซับนี้ไม่มีบรรทัดที่ขึ้นบนภาพ" : !path ? "ยังไม่ได้เลือกที่เก็บ" : engWhy;

  // ภาพตัวอย่าง วาดใหม่เมื่อค่าที่มีผลกับภาพเปลี่ยน รอให้หยุดปรับ 450 มิลลิวินาทีก่อน · ผลของรอบเก่าที่มาช้าไม่ทับรอบใหม่
  // ซับ ASS ดูจากบรรทัดในไฟล์เสมอ ซับ SRT เลือกได้ว่าดูบรรทัดในไฟล์หรือประโยคที่พิมพ์
  const useLine = ass || src === "line";
  const ev = useLine ? lines[Math.min(line, Math.max(0, lines.length - 1))] : null;
  const at = ev ? ev.start + Math.min(500, Math.floor((ev.end - ev.start) / 2)) : 0;
  const prevKey = JSON.stringify([w, h, fps, engine, req.opts, req.style, useLine ? at : sample, p.open]);
  useEffect(() => {
    if (!p.open || !inApp || busy) return;
    if (engWhy) { setPrev({ s: "fail", err: engWhy }); return; }
    if (useLine && !ev) { setPrev({ s: "idle" }); return; }
    const my = ++seq.current;
    setPrev((o) => ({ s: "busy", data: o.data }));
    const t = setTimeout(() => {
      pgsApi.preview(p.doc, req, at, useLine ? null : sample).then(
        (r) => { if (seq.current === my) setPrev({ s: "done", data: r }); },
        (e) => { if (seq.current === my) setPrev({ s: "fail", err: String(e) }); },
      );
    }, 450);
    return () => clearTimeout(t);
  }, [prevKey, superOk, seconvOk]); // eslint-disable-line react-hooks/exhaustive-deps

  // ขนาดไฟล์ที่คาด คิดใหม่เมื่อค่าที่มีผลกับขนาดเปลี่ยน รอหยุดปรับ 900 มิลลิวินาที เพราะต้องวาดภาพจริงหลายภาพ
  const estKey = JSON.stringify([w, h, fps, engine, req.opts, req.style, p.open, lines.length]);
  useEffect(() => {
    if (!p.open || !inApp || busy) return;
    if (engWhy || lines.length === 0) { setEst({ s: "idle" }); return; }
    const my = ++estSeq.current;
    setEst((o) => ({ s: "busy", data: o.data }));
    const t = setTimeout(() => {
      pgsApi.estimate(p.doc, req).then(
        (r) => { if (estSeq.current === my) setEst({ s: "done", data: r }); },
        (e) => { if (estSeq.current === my) setEst({ s: "fail", err: String(e) }); },
      );
    }, 900);
    return () => clearTimeout(t);
  }, [estKey, superOk, seconvOk]); // eslint-disable-line react-hooks/exhaustive-deps

  const go = async (target = path) => {
    if (busy) return;
    setErr(null); setExists(false); setOut(null);
    // SeConv ส่งสัญญาณเริ่มทันทีก่อนตัวฟังของหน้าจอพร้อม ตั้งสถานะของ Subtitle Edit ไว้ก่อน ไม่งั้นปุ่มขึ้นกำลังส่งออก 0% ทั้งรอบ (เจอจากตัวตรวจ check-pgs)
    setRun({ done: 0, total: 0, phase: engine === "seconv" ? "seconv" : "draw" });
    try {
      const r = await pgsApi.export(p.doc, { ...req, target });
      setRun(null);
      setOut(r);
      p.onDone(`ส่งออก PGS แล้ว ${nameOf(r.path)} ${r.images.toLocaleString("en-US")} ภาพ`);
    } catch (e) {
      setRun(null);
      const m = String(e);
      if (m === "exists") { setPath(target); setExists(true); return; }
      if (m !== "stopped") setErr(m);
    }
  };
  const browse = async () => {
    const w2 = window as unknown as { __pgsTarget?: string };
    const r = import.meta.env.DEV && w2.__pgsTarget ? w2.__pgsTarget : await pickSave(path, "sup", "ซับ PGS");
    if (r) setPath(/\.sup$/i.test(r) ? r : `${r}.sup`);
  };
  const pct = run && run.total ? Math.round((run.done / run.total) * 100) : 0;
  // ไฟล์ซับส่วนมากเล็กกว่า 1 MB บอกเป็น KB ไม่ขึ้น 0 MB
  const fsize = (b: number) => (b < 1048576 ? `${Math.max(1, Math.round(b / 1024)).toLocaleString("en-US")} KB` : `${(b / 1048576).toLocaleString("en-US", { maximumFractionDigits: 1 })} MB`);
  /** ผลส่งออกเป็นประโยคเดียว ต่อด้วย โดย กับ และ */
  const doneText = (o: PgsOut) => {
    // BUGS ข้อ 126 ชุดที่เปลี่ยนแค่จานสี กับชุดที่เครื่องเล่น Blu-ray อาจถอดไม่ทัน (ตัวสร้างชั้นหนังเท่านั้น ตัวอื่นเป็น 0)
    const extra = [o.reduced ? `ลดสี ${o.reduced.toLocaleString("en-US")} ภาพที่มีสีเกิน ${opts.colors} สี` : "", o.merged ? `รวมกรอบ ${o.merged.toLocaleString("en-US")} ภาพที่ซับขึ้นเกินจำนวนกรอบ` : "",
      o.palUpdates ? `เปลี่ยนแค่จานสี ${o.palUpdates.toLocaleString("en-US")} ชุด` : "", o.late ? `มี ${o.late.toLocaleString("en-US")} ชุดที่เครื่องเล่น Blu-ray อาจถอดไม่ทัน` : ""].filter(Boolean);
    return `${o.images.toLocaleString("en-US")} ภาพ ขนาด ${fsize(o.bytes)}${extra.map((x, i) => (i ? ` และ${x}` : ` โดย${x}`)).join("")}`;
  };
  const dis = busy ? "กำลังส่งออก" : undefined;
  const d = prev.data;
  const verdict = (de: number) => (de < 2 ? ["ok", "ตรง"] : de < 5 ? ["mid", "ใกล้เคียง"] : ["bad", "ต่าง"]);
  return { busy, w, h, std, f, seconv, useStyle, req, setO, setS, superWhy, seconvWhy, engWhy, anim, soft, together, warns, why, useLine, ev, at, prevKey, estKey, go, browse, pct, fsize, doneText, dis, d, verdict };
}
