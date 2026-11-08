/* ตัวช่วยหาดีเลย์ (มอคอัปหัวข้อ 3 · แผนเสียงและซับ ขั้น 5)
   คลื่นเสียงเดิมของหนังอยู่บน เสียงใหม่อยู่ล่าง ลากแถบเลื่อนให้ยอดเสียงตรงกัน หรือกด ให้โปรแกรมหาให้ (เปิดหน้าต่างแล้วหาให้ทันที)
   โปรแกรมเทียบ 3 ช่วง ต้นเรื่อง กลางเรื่อง ท้ายเรื่อง · ค่าต่างกันเพราะเสียงเร็วไม่เท่าหนัง เสนอคู่ความเร็วพร้อมปุ่มไปตั้งในแผงตั้งค่าเสียง
   ลองฟัง 20 วินาที ทำไฟล์ชั่วคราวช่วงที่เห็น ภาพจากหนัง เสียงใหม่ใส่ดีเลย์แล้ว เปิดด้วยโปรแกรมเล่นที่ตั้งไว้ · ไฟล์หนังไม่ถูกแก้ */
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import Dialog from "./Dialog";
import { CardIcon, Phr, Range } from "./ui";
import { delayApi, type DelayFound, type DelayPreview, type DelayView } from "../lib/api";
import type { AvTrack } from "../lib/avJob";
import { IcSearch, IbTick, IbPlay } from "./icons";

const baseName = (p: string) => p.split(/[\\/]/).pop() ?? p;
const sign = (v: number) => `${v > 0 ? "+" : v < 0 ? "−" : ""}${Math.abs(Math.round(v)).toLocaleString("en-US")}`;
const mmss = (t: number) => `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, "0")}`;
const pct = (s: number) => `${Math.round(s * 100)}%`;
const LEN = 12;

/** วาดคลื่นเสียงหนึ่งเลน · shift = วินาทีที่เลื่อนเสียงใหม่ (ดีเลย์) · เสียงเดิม shift 0 */
function drawLane(cv: HTMLCanvasElement | null, v: DelayView, which: "a" | "b", delayMs: number) {
  if (!cv) return;
  const r = window.devicePixelRatio || 1, w = cv.clientWidth, h = cv.clientHeight;
  if (!w || !h) return;
  cv.width = Math.round(w * r); cv.height = Math.round(h * r);
  const g = cv.getContext("2d")!;
  g.setTransform(r, 0, 0, r, 0, 0);
  g.fillStyle = "#ffffff"; g.fillRect(0, 0, w, h);
  const mid = h / 2;
  g.fillStyle = "rgba(74,43,56,.08)"; g.fillRect(0, mid, w, 1);
  g.fillStyle = which === "a" ? "#d9719a" : "#3f8fd8";
  for (let x = 0; x < w; x++) {
    const t = v.at + (x / w) * v.len;
    let val: number;
    if (which === "a") val = v.a[Math.floor((t - v.at) * v.cps)] ?? 0;
    else val = v.b[Math.floor((t - delayMs / 1000 - (v.at - v.margin)) * v.cps)] ?? 0;
    const y = val * (mid - 3);
    g.fillRect(x, mid - y, 1, Math.max(1, y * 2));
  }
}

export default function DelayDialog(p: {
  movie: { path: string; duration: number | null };
  refTrack: AvTrack;
  track: AvTrack;
  onApply: (delay: number) => void;
  /** ตั้งความเร็วในแผงตั้งค่าเสียง พร้อมใส่ดีเลย์ที่หาได้ให้แทร็ก (เดิมค่าดีเลย์หาย · ผู้ช่วยตรวจขั้น 10 ข้อ 8) */
  onSpeed: (pair: [number, number], delay: number) => void;
  onClose: () => void;
}) {
  const t = p.track;
  const [delay, setDelay] = useState(t.delay);
  const [text, setText] = useState<string | null>(null);
  const [found, setFound] = useState<DelayFound | null>(null);
  const [finding, setFinding] = useState(false);
  const [findErr, setFindErr] = useState<string | null>(null);
  const [view, setView] = useState<DelayView | null>(null);
  const [viewErr, setViewErr] = useState<string | null>(null);
  const [prev, setPrev] = useState<{ busy: boolean; r?: DelayPreview; err?: string }>({ busy: false });
  const la = useRef<HTMLCanvasElement>(null);
  const lb = useRef<HTMLCanvasElement>(null);
  const dur = p.movie.duration ?? p.refTrack.duration ?? 60;
  const at0 = Math.max(0, Math.min(dur - LEN, dur / 2 - LEN / 2));
  const refStream = p.refTrack.ff ?? p.refTrack.tid, newStream = t.ff ?? t.tid;

  const loadView = useCallback((at: number, margin: number, speed: [number, number] | null) => {
    setViewErr(null);
    delayApi.view(p.movie.path, refStream, t.src, newStream, at, Math.min(LEN, dur), margin, speed, 800).then(setView, (e) => setViewErr(String(e)));
  }, [p.movie.path, refStream, t.src, newStream, dur]);

  const find = useCallback(() => {
    setFinding(true); setFindErr(null);
    delayApi.find(p.movie.path, refStream, t.src, newStream).then((f) => {
      setFound(f); setFinding(false);
      if (f.score >= 0.3) setDelay(f.delay);
      const mid = f.windows[1];
      loadView(mid ? mid.at : at0, Math.max(1, Math.ceil(Math.abs(f.delay) / 1000) + 1), f.speed);
    }, (e) => { setFinding(false); setFindErr(String(e)); });
  }, [p.movie.path, refStream, t.src, newStream, loadView, at0]);

  // เปิดหน้าต่างแล้ว ดึงคลื่นเสียงช่วงกลางเรื่องกับหาค่าดีเลย์ให้ทันที
  useEffect(() => { loadView(at0, Math.max(1, Math.ceil(Math.abs(t.delay) / 1000) + 1), null); find(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useLayoutEffect(() => {
    if (!view) return;
    const draw = () => { drawLane(la.current, view, "a", 0); drawLane(lb.current, view, "b", delay); };
    draw();
    const ro = new ResizeObserver(draw);
    if (la.current) ro.observe(la.current);
    return () => ro.disconnect();
  }, [view, delay]);

  const margin = view?.margin ?? 1;
  const lim = Math.round(margin * 1000);
  const commit = () => {
    if (text == null) return;
    const n = Number(text.replace(/[,\s+]/g, "").replace(/[−–]/g, "-"));
    if (Number.isFinite(n)) setDelay(Math.max(-600000, Math.min(600000, Math.round(n))));
    setText(null);
  };
  const showDelay = text ?? sign(delay);
  const sameAsName = found && t.delayFromName != null && Math.abs(found.delay - t.delayFromName) <= 20;
  const ws = found?.windows ?? [];
  const wText = ws.length === 3 ? `ต้นเรื่อง ${sign(ws[0].delay)} · กลางเรื่อง ${sign(ws[1].delay)} · ท้ายเรื่อง ${sign(ws[2].delay)} ms` : "";
  const moved = found && found.score >= 0.3 && Math.abs(delay - found.delay) > 20;
  const pairText = found?.speed ? `${found.speed[0]} → ${found.speed[1]}` : "";

  // ไฟล์ลองฟังใส่ได้แค่ดีเลย์ · เสียงที่ต้องยืดความเร็ว ช่วงกลางเรื่องจะเป็นคนละฉากกับภาพ (หนัง 2 ชั่วโมงเหลื่อมราว 147 วินาที)
  // ปิดปุ่มลองฟังพร้อมบอกเหตุ ให้ดูจากคลื่นที่ยืดแล้วแทน (ผู้ช่วยตรวจขั้น 10 ข้อ 7)
  const speedOn = !!found?.speed || !!t.convert?.speed;
  const noPlay = speedOn ? "ลองฟังยังใส่ความเร็วเสียงไม่ได้ เสียงที่ต้องยืดจะไม่ตรงภาพ · ดูจากคลื่นเสียงที่ยืดแล้วข้างบน" : null;
  let res: React.ReactNode = null;
  if (finding) res = <div className="stat info" data-delay-res="finding"><CardIcon kind="info" /><div><b>กำลังเทียบเสียง 3 ช่วง ต้นเรื่อง กลางเรื่อง ท้ายเรื่อง…</b><Phr>ถอดเสียงทั้งสองแทร็กแล้วเทียบคลื่นเสียงกัน ไม่แตะไฟล์</Phr></div></div>;
  else if (findErr) res = <div className="stat bad" data-delay-res="error"><CardIcon kind="bad" /><div><b>หาค่าดีเลย์ไม่ได้</b><Phr>{findErr}</Phr></div></div>;
  else if (found && found.speed) res = (
    <div className="stat warn" data-delay-res="speed"><CardIcon kind="warn" /><div>
      <b>{`เสียงเร็วไม่เท่าหนัง · ยืดตามคู่ ${pairText} แล้วตรงกัน ${pct(found.score)}`}</b>
      <Phr>{`เทียบตรง ๆ ตรงกันแค่ ${pct(found.direct)} เสียงเหลื่อมเพิ่มขึ้นเรื่อย ๆ · ${found.speed[0] === 25 ? "น่าจะเป็นเสียงของหนังรุ่น 25 ภาพต่อวินาที (แผ่นยุโรป PAL) · " : ""}ปุ่มข้างล่างตั้งความเร็วเสียง ${pairText} ในแผงตั้งค่าเสียง และใส่ดีเลย์ ${sign(found.delay)} ms ให้ด้วย`}</Phr>
      <div style={{ marginTop: 6 }}><button type="button" className="btn btn-ghost btn-sm" onClick={() => p.onSpeed(found.speed!, delay)} data-delay-speed>{`ตั้งความเร็ว ${pairText} ในแผงตั้งค่าเสียง`}</button></div></div></div>);
  else if (found && found.score < 0.3) res = (
    <div className="stat warn" data-delay-res="none"><CardIcon kind="warn" /><div><b>{`หาไม่เจอ ตรงกันสูงสุด ${pct(found.score)}`}</b>
      <Phr>เสียงอาจเป็นคนละรุ่น หรือไม่มีเสียงประกอบร่วมกันเลย (เช่น เสียงบรรยายล้วน) · ลากแถบเลื่อนเทียบยอดเสียงเอง แล้วลองฟัง</Phr></div></div>);
  else if (found && found.uneven) res = (
    <div className="stat warn" data-delay-res="uneven"><CardIcon kind="warn" /><div><b>{`ค่าสามช่วงไม่เท่ากัน · ${wText}`}</b>
      <Phr>{`ตั้งไว้ที่ค่ากลาง ${sign(found.delay)} ms · เสียงอาจถูกตัดต่อไม่เหมือนหนัง หรือเป็นหนังคนละรุ่น ลองฟังหลายช่วงก่อนใช้`}</Phr></div></div>);
  else if (found) res = (
    <div className="stat ok" data-delay-res="ok"><CardIcon kind="ok" /><div><b>{`โปรแกรมหาให้ ${sign(found.delay)} ms · ตรงกัน ${pct(found.score)}`}</b>
      <Phr>{`${sameAsName ? "ตรงกับค่าในชื่อไฟล์ · " : ""}เทียบ 3 ช่วง ${wText} ได้ค่าเดียวกัน แปลว่าไม่ต้องตั้งความเร็วเสียง`}</Phr></div></div>);

  return (
    <Dialog open onClose={p.onClose} width={900} title={<span>หาค่าดีเลย์ · <span style={{ overflowWrap: "anywhere" }}>{baseName(t.src)}</span></span>}
      actions={<>
        <div style={{ display: "flex", gap: 8, marginRight: "auto" }}>
          <button type="button" className={"btn btn-sm " + (finding ? "btn-wait" : "btn-ghost")} aria-disabled={finding || undefined} title={finding ? "กำลังหาอยู่" : undefined} onClick={() => { if (!finding) find(); }} data-delay-find><IcSearch size={15} />ให้โปรแกรมหาให้</button>
          <button type="button" className={"btn btn-sm " + (prev.busy || !view || noPlay ? "btn-wait" : "btn-ghost")} aria-disabled={prev.busy || !view || !!noPlay || undefined} title={noPlay ?? (!view ? "รอคลื่นเสียงโหลดก่อน" : prev.busy ? "กำลังทำไฟล์ลองฟัง" : undefined)}
            onClick={() => {
              if (prev.busy || !view || noPlay) return;
              setPrev({ busy: true });
              delayApi.preview(p.movie.path, t.src, t.tid, delay, view.at, (window as unknown as { __delayDry?: boolean }).__delayDry)
                .then((r) => setPrev({ busy: false, r }), (e) => setPrev({ busy: false, err: String(e) }));
            }} data-delay-play><IbPlay size={15} />{prev.busy ? "กำลังทำไฟล์ลองฟัง…" : "ลองฟัง 20 วินาที"}</button>
        </div>
        <button type="button" className="btn btn-ghost btn-sm" onClick={p.onClose}>ยกเลิก</button>
        <button type="button" className="btn btn-main btn-sm" onClick={() => p.onApply(delay)} data-delay-use><IbTick size={15} />ใช้ค่านี้</button>
      </>}>
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }} data-delay-dialog>
        <div className="small" style={{ marginTop: -6 }}>
          <Phr>{`เทียบกับ ${p.refTrack.name || "เสียงเดิมในหนัง"} · ${view ? `ช่วงนาที ${mmss(view.at)}–${mmss(view.at + view.len)}` : "กำลังโหลดคลื่นเสียง…"}${found?.speed ? ` · เสียงใหม่ยืดตามคู่ ${pairText} แล้ว` : ""}`}</Phr></div>
        <div className="lanes2">
          <div className="lane2"><div className="dlab"><b>เสียงเดิมในหนัง</b>{p.refTrack.name || "เสียงในหนัง"}</div>
            {view ? <canvas ref={la} aria-label="คลื่นเสียงเดิมในหนัง" data-lane="a" /> : <div className="skel" style={{ height: 64, borderRadius: 6 }} />}</div>
          <div className="lane2"><div className="dlab"><b>เสียงใหม่</b>ดีเลย์ <span data-dv>{sign(delay)}</span> ms</div>
            {view ? <canvas ref={lb} aria-label="คลื่นเสียงใหม่" data-lane="b" /> : <div className="skel" style={{ height: 64, borderRadius: 6 }} />}</div>
          {view && <div className="ruler2">{[0, 0.25, 0.5, 0.75, 1].map((f, i) => <span key={f} style={{ left: `${f * 100}%`, transform: i === 0 ? "none" : i === 4 ? "translateX(-100%)" : undefined }}>{mmss(view.at + f * view.len)}</span>)}</div>}
        </div>
        {viewErr && <div className="stat bad"><CardIcon kind="bad" /><div><b>โหลดคลื่นเสียงไม่ได้</b><Phr>{viewErr}</Phr></div></div>}
        <div className="match">
          <span className="avlbl" style={{ fontWeight: 600, color: "var(--txt)" }}>ดีเลย์</span>
          <div style={{ flex: 1, minWidth: 220 }}><Range label="ดีเลย์ของเสียงใหม่" min={-lim} max={lim} step={10} value={Math.max(-lim, Math.min(lim, delay))} onChange={(v) => { setText(null); setDelay(v); }} format={(v) => `${sign(v)} ms`} /></div>
          <div className="delay">
            <button type="button" aria-label="ลดดีเลย์ 10 ms" onClick={() => setDelay((d) => d - 10)}>−</button>
            <input className="avnum" style={{ width: 92 }} value={showDelay} aria-label="ดีเลย์ของเสียงใหม่ มิลลิวินาที" inputMode="numeric" data-delay-num
              onChange={(e) => setText(e.target.value)} onBlur={commit} onKeyDown={(e) => { if (e.key === "Enter") { commit(); (e.target as HTMLInputElement).blur(); } }} />
            <button type="button" aria-label="เพิ่มดีเลย์ 10 ms" onClick={() => setDelay((d) => d + 10)}>+</button>
          </div>
          <span className="small">ms · ติดลบ = เสียงใหม่มาเร็วขึ้น</span>
        </div>
        {res}
        {moved && <div className="small" data-delay-moved><Phr>{`ตอนนี้ตั้ง ${sign(delay)} ms ต่างจากที่โปรแกรมหาได้ (${sign(found!.delay)} ms) · ดูยอดเสียงในคลื่นว่าตรงกันไหม หรือกดลองฟัง`}</Phr></div>}
        {prev.r && <div className="small" data-delay-preview data-file={prev.r.file}><Phr>{prev.r.opened ? `เปิดไฟล์ลองฟังด้วย ${prev.r.player || "โปรแกรมหลักของ Windows"} แล้ว · ช่วง ${mmss(view?.at ?? 0)} ยาว 20 วินาที ภาพจากหนัง เสียงใหม่ใส่ดีเลย์ ${sign(delay)} ms · ไฟล์ลองฟังอยู่ในโฟลเดอร์ชั่วคราว ไฟล์หนังไม่ถูกแก้` : "ทำไฟล์ลองฟังแล้ว (รุ่นทดสอบไม่เปิดโปรแกรมเล่น)"}</Phr>{t.convert?.speed ? <><br /><Phr>ลองฟังใส่แค่ดีเลย์ ความเร็วเสียงที่ตั้งไว้มีผลตอนรวมจริง</Phr></> : null}</div>}
        {noPlay && <div className="small" data-delay-noplay><Phr>{noPlay}</Phr></div>}
        {prev.err && <div className="stat bad"><CardIcon kind="bad" /><div><b>ลองฟังไม่ได้</b><Phr>{prev.err}</Phr></div></div>}
      </div>
    </Dialog>
  );
}
