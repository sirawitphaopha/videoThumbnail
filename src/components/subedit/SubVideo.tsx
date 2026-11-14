/* กรอบภาพหนังของหน้าแก้ซับ (แผนหน้าแก้ซับ ขั้น 4 · BUGS ข้อ 109 · แบบกรอบวิดีโอของ Aegisub video_box.cpp)
   ภาพตรงเฟรม ซับที่ขึ้นบนเฟรมนั้นทับภาพ มุมขวาบนบอกระยะห่างจากเวลาเริ่มและจบของบรรทัดที่กำลังแก้ (เช่น +0ms; -2900ms)
   แถบล่าง ถอยหรือเดินทีละเฟรม · ช่องเวลากับเลขเฟรม (เฟรมนั้นเป็น keyframe ช่องเปลี่ยนสี) · AUTO เลือกบรรทัดแล้วภาพไปเวลาเริ่มเอง · เมนูวิดีโอ
   ขนาดภาพ พอดีกรอบ หรือ 12.5% ถึง 300% ขั้นละ 12.5% · Ctrl กับล้อเมาส์บนภาพซูมทีละ 12.5% ได้ถึง 1000% (แบบ Aegisub)
   คลิกภาพแล้วลูกศรซ้ายขวาเดินทีละเฟรม Shift ไป keyframe Ctrl ไปขอบบรรทัด Alt ทีละ 10 เฟรม (ตารางก็ใช้ปุ่มชุดเดียวกัน)
   ยังอ่านเวลาเฟรมไม่เสร็จ ขึ้นภาพตามเวลาแบบเดิมก่อน · ไม่มีวิดีโอบอกในกรอบพร้อมปุ่มเพิ่มไฟล์วิดีโอกับวิดีโอจำลอง (BUGS ข้อ 107)
   เล่นวิดีโอจริงกับเครื่องมือจัดซับบนภาพรอระบบดูวิดีโอในแอป (ROADMAP) */
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { pickKeyframes, pickSave, subApi, vidApi, type SubDoc, type SubEvent } from "../../lib/api";
import type { Tip } from "../../lib/codecAdv";
import { dropStyle, sideStyle, useDropPlacement, useSideFit } from "../../lib/popupFit";
import { useClickOutside, useEscClose } from "../../lib/popup";
import { isAss } from "../../lib/subText";
import {
  cachedFrame, closeVideo, dummyLight, findScenes, fmtMs, frameImage, isKey, prefetch, reopenVideo, seek, setAuto, setFitPct, setHideKeys, setKeys, setZoom,
  signedMs, stopScenes, useVid, vidKeys, vidRate, vidRetry, vidSrc, type DummySpec,
} from "../../lib/vidFrames";
import Dropdown from "../Dropdown";
import InfoTip from "../InfoTip";
import { Skel, Switch } from "../ui";
import { IbFilm, IbFrameNext, IbFramePrev, IbJump, IcFile } from "../icons";
import { KEY_TIP } from "./VideoDialogs";

/** ข้อความที่ตาเห็นบนภาพ ไม่มีแท็ก ขึ้นบรรทัดจริง */
export function shownText(e: SubEvent, d: SubDoc) {
  return isAss(d) ? e.text.replace(/\{[^}]*\}/g, "").replace(/\\[Nn]/g, "\n").replace(/\\h/g, " ") : e.text.replace(/<[^>]*>/g, "");
}

/** ขนาดภาพ 24 ขั้น ขั้นละ 12.5% ตั้งแต่ 12.5% ถึง 300% (video_box.cpp) กับพอดีกรอบ */
const ZOOMS = Array.from({ length: 24 }, (_, i) => (i + 1) * 12.5);
const FIT_W = 288, FIT_H = 162;
const VIDEO_TIP: Tip = {
  w: "แถบใต้ภาพหนัง ปุ่มลูกศรถอยหรือเดินทีละเฟรม ช่องกลางบอกเวลาของภาพตามด้วยเลขเฟรม ช่องนี้เปลี่ยนเป็นสีเข้มเมื่อเฟรมนั้นเป็น keyframe  ตัวเลขมุมขวาบนของภาพคือเวลาของภาพลบเวลาเริ่ม และลบเวลาจบของบรรทัดที่กำลังแก้ ค่าแรกเป็น +0ms คือภาพอยู่ตรงเวลาเริ่มพอดี  คลิกภาพหรือตารางแล้วกดลูกศรซ้ายขวาเดินทีละเฟรม กด Shift ด้วยไป keyframe ถัดไป กด Ctrl ด้วยไปเวลาเริ่มหรือจบของบรรทัด กด Alt ด้วยเดินทีละ 10 เฟรม  Ctrl+1 ไปเวลาเริ่ม Ctrl+2 ไปเวลาจบ Ctrl+G ข้ามไปเฟรมหรือเวลาที่พิมพ์",
  o: [["AUTO", "เลือกบรรทัดแล้วภาพไปเวลาเริ่มของบรรทัดนั้นเอง", "ไล่ดูบรรทัดได้เร็ว", "ดูภาพนอกช่วงบรรทัดแล้วเลือกบรรทัดใหม่ ภาพจะกระโดดกลับ"]],
  r: "เปิด AUTO ไว้ ตอนจะดูภาพนานค่อยปิด",
};

type Props = {
  doc: SubDoc;
  ev: SubEvent | null;
  delayMs: number;
  /** ชื่อไฟล์หนังที่แสดงในรายละเอียด */
  name: string;
  onAddMovie?: () => void;
  onDummy: () => void;
  onDetails: () => void;
  onJump: () => void;
  /** ปิดวิดีโอจำลองหรือวิดีโอ (หน้าแก้ซับล้างค่าที่ไฟล์ ASS จำไว้ด้วย) */
  onClose: () => void;
  /** Ctrl กับลูกศร ไปขอบบรรทัด ต้องเลือกบรรทัดถัดไปได้ หน้าแก้ซับจึงเป็นคนทำ */
  onKey: (e: React.KeyboardEvent) => void;
};

/** วาดวิดีโอจำลอง สีพื้นหรือตารางหมากรุก 8 จุดตามขนาดภาพจริง */
function DummyCanvas(p: { spec: DummySpec; w: number; h: number }) {
  const cv = useRef<HTMLCanvasElement>(null);
  useLayoutEffect(() => {
    const el = cv.current;
    if (!el) return;
    const r = window.devicePixelRatio || 1;
    el.width = Math.round(p.w * r); el.height = Math.round(p.h * r);
    const g = el.getContext("2d")!;
    const { r: R, g: G, b: B } = p.spec;
    g.fillStyle = `rgb(${R},${G},${B})`; g.fillRect(0, 0, el.width, el.height);
    if (!p.spec.pattern) return;
    const [lr, lg, lb] = dummyLight(R, G, B);
    g.fillStyle = `rgb(${lr},${lg},${lb})`;
    const cell = (8 * el.height) / p.spec.h;
    for (let y = 0, row = 0; y < el.height; y += cell, row++) for (let x = 0, col = 0; x < el.width; x += cell, col++) if ((row & 1) !== (col & 1)) g.fillRect(x, y, cell + 0.5, cell + 0.5);
  }, [p.spec, p.w, p.h]);
  return <canvas ref={cv} style={{ width: p.w, height: p.h, display: "block" }} data-vdummy-canvas />;
}

export default function SubVideo(p: Props) {
  const st = useVid();
  const src = vidSrc(st);
  const fr = vidRate(st);
  const keys = vidKeys(st);
  const t = st.table;
  const d = p.delayMs;
  const host = useRef<HTMLDivElement>(null);
  const view = useRef<HTMLDivElement>(null);
  const [avail, setAvail] = useState(FIT_W);
  const [img, setImg] = useState<string | null>(null);
  const [fail, setFail] = useState(false);
  const lastPos = useRef<number | null>(null);

  // ความกว้างที่ภาพขยายได้ เหลือที่ให้คลื่นเสียงอย่างน้อย 380 จุด
  useLayoutEffect(() => {
    const top = host.current?.parentElement;
    if (!top) return;
    const fit = () => setAvail(Math.max(160, top.clientWidth - 380 - 14));
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(top);
    return () => ro.disconnect();
  }, []);

  // ขนาดภาพจริง (คิดอัตราส่วนภาพที่ไฟล์บอก) แล้วคิดขนาดที่แสดง
  const natH = src.kind === "dummy" ? src.spec.h : t?.h || 360;
  const natW0 = src.kind === "dummy" ? src.spec.w : t?.w || 640;
  const dar = t?.dar && /^\d+:\d+$/.test(t.dar) && !t.dar.startsWith("0:") ? t.dar.split(":").map(Number) : null;
  const natW = src.kind !== "dummy" && dar ? Math.round((natH * dar[0]) / dar[1]) : natW0;
  const fitS = Math.min(FIT_W / natW, FIT_H / natH);
  useEffect(() => setFitPct(fitS * 100), [fitS]);
  const z = st.zoom;
  const imgW = Math.max(1, Math.round(z ? (natW * z) / 100 : natW * fitS));
  const imgH = Math.max(1, Math.round(z ? (natH * z) / 100 : natH * fitS));
  const boxW = z ? Math.min(Math.max(imgW, 160), avail) : FIT_W;
  const boxH = z ? Math.min(Math.max(imgH, 90), Math.max(FIT_H, Math.round(window.innerHeight * 0.45))) : FIT_H;
  // ความสูงภาพที่ขอ ปัดเป็นขั้นละ 30 จุด ภาพขนาดใกล้กันใช้ภาพที่เก็บไว้ร่วมกันได้ ไม่เกินขนาดจริง
  const reqH = Math.max(90, Math.min(Math.min(natH, 2160), Math.ceil((imgH * (window.devicePixelRatio || 1)) / 30) * 30));

  const pos = st.pos;
  const movie = src.kind === "movie" ? src.path : "";
  // ภาพตรงเฟรม · เฟรมที่เก็บไว้แล้วขึ้นทันที ที่เหลือรอนิดหนึ่งก่อนดึง กดเดินเร็ว ๆ ไม่ดึงทุกเฟรม
  useEffect(() => {
    if (!movie) { setImg(null); return; }
    if (t && pos != null) {
      const dir: 1 | -1 = lastPos.current != null && pos < lastPos.current ? -1 : 1;
      lastPos.current = pos;
      const hit = cachedFrame(movie, reqH, pos);
      if (hit) { setImg(hit); setFail(false); prefetch(movie, t, pos, reqH, dir); return; }
      let live = true;
      const tm = setTimeout(() => frameImage(movie, t, pos, reqH, dir).then((u) => { if (live) { setImg(u); setFail(false); prefetch(movie, t, pos, reqH, dir); } }, () => { if (live) setFail(true); }), 60);
      return () => { live = false; clearTimeout(tm); };
    }
    // ยังอ่านเวลาเฟรมไม่เสร็จ ใช้ภาพตามเวลาเริ่มของบรรทัดไปก่อน
    if (!p.ev) return;
    const at = Math.max(0, p.ev.start + d + Math.min(300, (p.ev.end - p.ev.start) / 2));
    let live = true;
    const tm = setTimeout(() => subApi.frame(movie, at / 1000, reqH).then((u) => { if (live) { setImg(u); setFail(false); } }, () => { if (live) setFail(true); }), 120);
    return () => { live = false; clearTimeout(tm); };
  }, [movie, t, pos, reqH, p.ev?.id, p.ev?.start]); // eslint-disable-line react-hooks/exhaustive-deps

  // Ctrl กับล้อเมาส์บนภาพ ซูมทีละ 12.5% ได้ถึง 1000% · ตัวดักแบบไม่ passive ถึงจะกันหน้าเลื่อนได้
  useEffect(() => {
    const el = view.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      if (!e.ctrlKey) return;
      e.preventDefault();
      const now = st.zoom || Math.max(12.5, Math.round((fitS * 100) / 12.5) * 12.5);
      setZoom(Math.min(1000, Math.max(12.5, now + (e.deltaY < 0 ? 12.5 : -12.5))));
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [st.zoom, fitS]);

  const tNow = fr && pos != null ? fr.timeAt(pos) : p.ev ? p.ev.start + d : null;
  const shown = tNow == null ? "" : p.doc.events.filter((e) => !e.comment && e.start + d <= tNow && tNow < e.end + d).map((e) => shownText(e, p.doc)).join("\n");
  const onKey = isKey(keys.list, pos ?? -1);
  const ready = !!fr && pos != null;
  const noStep = src.kind === "none" ? "ยังไม่มีวิดีโอ" : st.load === "busy" ? "กำลังอ่านเวลาของทุกเฟรม รอสักครู่" : st.load === "err" ? "อ่านเวลาเฟรมไม่ได้" : undefined;
  const fontPx = Math.max(11, Math.min(28, imgH * 0.06));

  let body: React.ReactNode;
  if (src.kind === "dummy") body = <DummyCanvas spec={src.spec} w={imgW} h={imgH} />;
  else if (src.kind === "movie") body = img ? <img src={img} alt={pos != null ? `ภาพหนังเฟรม ${pos}` : "ภาพหนัง"} style={{ width: imgW, height: imgH }} draggable={false} />
    : fail ? <div className="vnone">ดึงภาพหนังไม่ได้</div> : <Skel w={imgW} h={imgH} r={0} />;
  else body = (
    <div className="vnone">
      <span>{st.closed ? "ปิดวิดีโออยู่" : "เปิดไฟล์ซับอย่างเดียว จึงไม่มีภาพหนัง"}</span>
      <span className="se-vnonebtns">
        {st.closed && st.movie ? <button type="button" className="btn btn-ghost btn-sm" onClick={reopenVideo} data-vreopen><IbFilm size={15} />เปิดวิดีโอของหนัง</button>
          : p.onAddMovie && <button type="button" className="btn btn-ghost btn-sm" onClick={p.onAddMovie} data-sub-addvideo><IcFile size={15} />เพิ่มไฟล์วิดีโอ</button>}
        <button type="button" className="btn btn-ghost btn-sm" onClick={p.onDummy} data-vdummy-open>วิดีโอจำลอง</button>
      </span>
    </div>
  );

  return (
    <div className="se-video" ref={host} data-vbox>
      <div className="se-vview vframe" ref={view} tabIndex={0} style={{ width: boxW, height: boxH }} onKeyDown={p.onKey} aria-label="ภาพหนัง คลิกแล้วใช้ลูกศรซ้ายขวาเดินทีละเฟรม" data-vframe>
        <div className="se-vimg" style={{ width: Math.max(imgW, boxW), height: Math.max(imgH, boxH) }}>
          {body}
          {shown && src.kind !== "none" && <div className="vsub" style={{ fontSize: fontPx, bottom: Math.max(8, (Math.max(imgH, boxH) - imgH) / 2 + imgH * 0.06) }}>{shown}</div>}
        </div>
        {p.ev && ready && <div className="vtime se-voff" data-voff>{`${signedMs(tNow! - (p.ev.start + d))}; ${signedMs(tNow! - (p.ev.end + d))}`}</div>}
      </div>
      <div className="se-vbar" data-vbar>
        <button type="button" className={"btn btn-ghost btn-sm se-vstep" + (ready ? "" : " btn-wait")} aria-disabled={!ready || undefined} title={noStep ?? "ถอยหนึ่งเฟรม (ลูกศรซ้าย)"} aria-label="ถอยหนึ่งเฟรม" onClick={() => ready && seek(pos! - 1)} data-vprev><IbFramePrev size={15} /></button>
        <button type="button" className={"btn btn-ghost btn-sm se-vstep" + (ready ? "" : " btn-wait")} aria-disabled={!ready || undefined} title={noStep ?? "เดินหนึ่งเฟรม (ลูกศรขวา)"} aria-label="เดินหนึ่งเฟรม" onClick={() => ready && seek(pos! + 1)} data-vnext><IbFrameNext size={15} /></button>
        <span className={"se-vpos" + (ready && onKey ? " key" : "")} title={ready ? (onKey ? "เฟรมนี้เป็น keyframe" : "เวลาของภาพ ขีด เลขเฟรม") : undefined} data-vpos data-vkey={ready && onKey ? "1" : undefined}>
          {ready ? `${fmtMs(tNow!)} - ${pos}` : st.load === "busy" ? `อ่านเวลาเฟรม ${st.dur > 0 ? Math.min(99, Math.round((st.readTo / st.dur) * 100)) : 0}%` : st.load === "err" ? "อ่านเวลาเฟรมไม่ได้" : "—"}
        </span>
        <button type="button" className={"btn btn-ghost btn-sm se-auto" + (st.auto ? " pressed" : "")} aria-pressed={st.auto} title={st.auto ? "เปิดอยู่ เลือกบรรทัดแล้วภาพไปเวลาเริ่มของบรรทัดเอง กดเพื่อปิด" : "ปิดอยู่ เลือกบรรทัดแล้วภาพอยู่ที่เดิม กดเพื่อเปิด"} onClick={() => setAuto(!st.auto)} data-vauto>AUTO</button>
        <VideoMenu {...p} fitPct={Math.round(fitS * 1000) / 10} />
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------- เมนูวิดีโอ */

function VideoMenu(p: Props & { fitPct: number }) {
  const st = useVid();
  const src = vidSrc(st);
  const keys = vidKeys(st);
  const [open, setOpen] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const wrap = useRef<HTMLDivElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const place = useDropPlacement(open, wrap, panel);
  const side = useSideFit(open, wrap, panel, "right");
  useEscClose(open, () => setOpen(false));
  useClickOutside(open, wrap, () => setOpen(false));
  const movie = src.kind === "movie" ? src.path : "";
  const sc = st.scene;
  const pct = sc.dur > 0 ? Math.min(99, Math.round((sc.t / sc.dur) * 100)) : 0;
  const keyText = src.kind === "dummy" ? "วิดีโอจำลองไม่มี keyframe" : !movie ? "ยังไม่มีวิดีโอ"
    : `${keys.src === "scenes" ? "จุดเปลี่ยนฉากที่หาเอง" : keys.src === "file" ? `จากไฟล์ ${(keys.file ?? "").split(/[\\/]/).pop()}` : "keyframe ของหนัง"} ${keys.list.length.toLocaleString("en-US")} จุด`;
  const noMovie = movie ? undefined : src.kind === "dummy" ? "วิดีโอจำลองไม่มี keyframe" : "ยังไม่มีวิดีโอ";
  const loadFile = async () => {
    const w = window as unknown as { __vidKeysOpen?: string };
    const f = import.meta.env.DEV && w.__vidKeysOpen ? w.__vidKeysOpen : await pickKeyframes();
    if (!f) return;
    vidApi.keysLoad(f).then((list) => { setKeys(list, "file", f); setMsg(`เปิดไฟล์ keyframe แล้ว ${list.length.toLocaleString("en-US")} จุด`); }, (e) => setMsg(String(e)));
  };
  const saveFile = async () => {
    const w = window as unknown as { __vidKeysSave?: string };
    const base = movie.replace(/\.[^.\\/]+$/, "") + "_keyframes.txt";
    const f = import.meta.env.DEV && w.__vidKeysSave ? w.__vidKeysSave : await pickSave(base, "txt", "ไฟล์ keyframe");
    if (!f) return;
    vidApi.keysSave(f, keys.list).then((r) => setMsg(`บันทึกแล้ว ${r.split(/[\\/]/).pop()}`), (e) => setMsg(String(e)));
  };
  const item = (label: string, run: () => void, why?: string, data?: string, icon?: React.ReactNode) => (
    <button type="button" className={"se-vmi" + (why ? " off" : "")} aria-disabled={!!why || undefined} title={why} onClick={() => { if (!why) { run(); } }} data-vmi={data}>{icon}{label}</button>
  );
  const zoomVal = st.zoom ? String(st.zoom) : "0";
  return (
    <div ref={wrap} className="se-vmenuwrap">
      <button type="button" className={"btn btn-ghost btn-sm se-vstep" + (open ? " pressed" : "")} aria-haspopup="true" aria-expanded={open} title="เมนูวิดีโอ ขนาดภาพ keyframe วิดีโอจำลอง" aria-label="เมนูวิดีโอ" onClick={() => { setOpen((o) => !o); setMsg(null); }} data-vmenu>
        <IbFilm size={15} />{sc.busy && <span className="se-vbadge">{pct}%</span>}
      </button>
      {open && (
        <div ref={panel} className="menu pop-in se-vmenu" role="dialog" aria-label="เมนูวิดีโอ" style={{ position: "absolute", ...sideStyle(side, "right"), width: 330, zIndex: "var(--z-menu)" as unknown as number, ...dropStyle(place) }} data-vmenupanel>
          <div className="se-vmrow"><span className="se-vmh">ขนาดภาพ</span>
            <Dropdown label="ขนาดภาพ" value={ZOOMS.includes(st.zoom) || st.zoom === 0 ? zoomVal : "own"} display={() => (st.zoom ? `${st.zoom}%` : `พอดีกรอบ ${p.fitPct}%`)} sizes={["พอดีกรอบ 100.0%", "1000%"]}
              options={[{ value: "0", label: "พอดีกรอบ" }, ...ZOOMS.map((v) => ({ value: String(v), label: `${v}%` })), ...(st.zoom && !ZOOMS.includes(st.zoom) ? [{ value: "own", label: `${st.zoom}%` }] : [])]}
              onChange={(v) => { if (v !== "own") { setZoom(Number(v)); setOpen(false); } }} />
            <InfoTip title="กรอบวิดีโอ" tip={VIDEO_TIP} />
          </div>
          <div className="se-vmsec">
            <div className="se-vmrow"><span className="se-vmh">keyframe</span><InfoTip title="keyframe" tip={KEY_TIP} /><span className="small se-vmkeys" data-vkeysrc>{keyText}</span></div>
            {sc.busy ? (
              <div className="se-vmrow" data-vscenes-busy>
                <div className="se-vprog"><div style={{ width: `${pct}%` }} /></div>
                <span className="small">{`หาจุดเปลี่ยนฉาก ${pct}%`}</span>
                <button type="button" className="btn btn-ghost btn-sm" onClick={stopScenes} data-vscenes-stop>หยุด</button>
              </div>
            ) : item("หาจุดเปลี่ยนฉากจริง (ถอดภาพทั้งเรื่อง)", () => void findScenes(), noMovie, "scenes")}
            {sc.err && <div className="small se-vmerr" role="alert">{sc.err}</div>}
            <div className="se-vmpair">
              {item("เปิดไฟล์ keyframe", () => void loadFile(), noMovie, "keysopen")}
              {item("บันทึกเป็นไฟล์", () => void saveFile(), noMovie ?? (keys.list.length ? undefined : "ยังไม่มี keyframe ให้บันทึก"), "keyssave")}
            </div>
            {movie && keys.src !== "movie" && item("กลับไปใช้ keyframe ของหนัง", () => setKeys(null), undefined, "keysmovie")}
            <div className="se-vmrow se-vmsw"><span>ซ่อนเส้น keyframe บนคลื่นเสียง</span><Switch on={st.hideKeys} onChange={setHideKeys} label="ซ่อนเส้น keyframe บนคลื่นเสียง" /></div>
          </div>
          <div className="se-vmsec">
            {item("ข้ามไปยังเฟรมหรือเวลา (Ctrl+G)", () => { setOpen(false); p.onJump(); }, vidRate(st) ? undefined : "ยังไม่มีวิดีโอ หรือยังอ่านเวลาเฟรมไม่เสร็จ", "jump", <IbJump size={15} />)}
            {item("รายละเอียดวิดีโอ", () => { setOpen(false); p.onDetails(); }, src.kind === "none" ? "ยังไม่มีวิดีโอ" : src.kind === "movie" && !st.table ? "ยังอ่านข้อมูลวิดีโอไม่เสร็จ" : undefined, "details")}
            <div className="se-vmpair">
              {item("วิดีโอจำลอง", () => { setOpen(false); p.onDummy(); }, undefined, "dummy")}
              {src.kind !== "none" ? item(src.kind === "dummy" ? "ปิดวิดีโอจำลอง" : "ปิดวิดีโอ", () => { setOpen(false); p.onClose(); closeVideo(); }, undefined, "close")
                : st.closed && st.movie ? item("เปิดวิดีโอของหนัง", () => { setOpen(false); reopenVideo(); }, undefined, "reopen") : null}
            </div>
            {st.load === "err" && movie && item("ลองอ่านเวลาเฟรมใหม่", vidRetry, undefined, "retry")}
          </div>
          {msg && <div className="small se-vmmsg" role="status" data-vmsg>{msg}</div>}
        </div>
      )}
    </div>
  );
}
