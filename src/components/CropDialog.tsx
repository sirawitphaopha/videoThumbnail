/* หน้าต่างครอปรูปโปสเตอร์ (สเปกข้อ 7 · ต้นแบบบรรทัด 847–915)
   ภาพอยู่ในกรอบ 520 × 293 แบบไม่ตัด · กรอบครอปล็อก 2 : 3 เส้นแบ่งสาม มุมจับ 4 มุม นอกกรอบมืด
   ลากกรอบเลื่อน · ลากมุมย่อขยาย · ล้อเมาส์ซูม · แถบซูม 100–400% · หมุนซ้าย หมุนขวา พลิกซ้ายขวา กลับเป็นแบบเดิม
   ตัวอย่างหลังครอป 3 จุด (บนชั้นวาง แผงรายละเอียด ไอคอน Windows · ระบบจับคู่รูปปกมี 2 จุดแรก) วาดจากภาพตัวอย่างทันทีที่ลาก
   ขนาดไฟล์ที่บอกมาจากการเข้ารหัสจริงฝั่ง Rust (poster_render) ไม่ใช่การเดา · รูปเดิมในเครื่องไม่ถูกแก้
   หมุนแล้วพลิก ลำดับเดียวกับฝั่ง Rust (poster_image.rs render) กรอบเป็นสัดส่วนของรูปหลังหมุนและพลิก */
import { useEffect, useMemo, useRef, useState } from "react";
import { useEscClose } from "../lib/popup";
import Dialog from "./Dialog";
import { Keep, Range, Seg, CardIcon, Phr } from "./ui";
import { pickFile, posterApi, thumbUrl, type CropTarget, type Geometry, type PosterInfo, type RenderInfo } from "../lib/api";
import { fmtSize } from "../lib/format";
import { IcRefresh, IbTick, IcPoster, IbRotL, IbRotR, IbFlip } from "./icons";
import { IcTall, IcWide, IbCrop, IcFile, IcCopy, IcExpand } from "./icons";

const SW = 520, SH = 293;
/** เว้นขอบรอบภาพ มุมจับของกรอบครอปที่ซูม 100% ไม่โดนขอบกรอบภาพตัดครึ่ง */
const GAP = 10;
const PREVIEW_ROOM = 284, PREVIEW_ROOM_SHORT = 125;
/** หน้าต่างเตี้ยกว่านี้ เนื้อหาเต็มไม่พอดีกรอบ ย่อตัวอย่างลง · หน้าต่างครอปต้องไม่มีแถบเลื่อน (เล็กสุดของโปรแกรมสูง 640) */
const SHORT_WINDOW = 799, PREVIEW_K_SHORT = 0.6, PREVIEW_K_TALL = 1.57;
/** ความสูงตารางคุณภาพ JPG */
const TABLE_ROOM = 197;
/** แถวคุณภาพ JPG กับการ์ด PNG สูงเท่ากัน สลับชนิดไฟล์แล้วแถวข้างล่างไม่ขยับ */
const FORMAT_ROOM = 44;
const PADS = [{ c: "#f6dbe5", label: "ชมพูจาง" }, { c: "#000000", label: "ดำ" }, { c: "#ffffff", label: "ขาว" }];
const QUAL_NOTE: Record<number, string> = { 100: "เท่าต้นฉบับ", 90: "แทบไม่ต่าง แนะนำ", 75: "ขอบตัวหนังสือเริ่มเบลอ", 50: "เห็นเป็นบล็อกชัด" };

export type CropChoice = { geo: Geometry; format: "jpg" | "png"; quality: number; render: RenderInfo };
type View = { rotate: 0 | 90 | 180 | 270; flip: boolean; cx: number; cy: number; z: number; tilt: number };
const START: View = { rotate: 0, flip: false, cx: 0.5, cy: 0.5, z: 1, tilt: 0 };
/** สัดส่วนกรอบครอป กว้างหารสูง · ปกตั้ง 2 : 3 · ปกนอน 16 : 9 */
const TALL = 2 / 3, WIDE = 16 / 9;
/** ขยายภาพจากจุดกลางให้เต็มกรอบตอนปรับเอียง สูตรเดียวกับ tilt_fill ฝั่ง Rust ตัวอย่างบนจอตรงกับรูปจริง */
const tiltScale = (w: number, h: number, deg: number) => {
  const t = (deg * Math.PI) / 180, c = Math.abs(Math.cos(t)), s = Math.abs(Math.sin(t));
  return Math.max((w * c + h * s) / w, (w * s + h * c) / h);
};

export default function CropDialog(p: {
  info: PosterInfo;
  start?: CropChoice | null;
  defaultFormat: "jpg" | "png";
  defaultQuality: number;
  onCancel: () => void;
  onUse: (c: CropChoice) => void;
  /** เลือกรูปใหม่จากหน้าต่างนี้ ได้ที่อยู่รูปแล้วหน้าเจ้าของเปิดรูปนั้นต่อ */
  onPickImage: (path: string) => void;
  /** ช่องปกของหน้าเสียงและซับ · ไม่ส่ง = หน้าใส่โปสเตอร์ */
  target?: CropTarget;
  /** ระบบจับคู่รูปปก · เลือกช่องปกตั้งปกนอน ปรับเอียง · ไม่ต้องเลือกชนิดไฟล์กับคุณภาพ ใช้ค่าในหน้าตั้งค่าตอนยืนยัน
      สลับช่อง · keep คือค่าของช่องเดิมที่แก้ไว้ ให้จำลงแถวก่อนเปิดช่องใหม่ ไม่ได้แก้อะไรเป็น null */
  link?: { movie: string; orient: "tall" | "wide"; onOrient: (o: "tall" | "wide", keep: CropChoice | null) => void };
}) {
  const { info } = p;
  // รวมเข้าไฟล์จากปกนอน แล้วกดครอปต่อที่หน้าใส่โปสเตอร์ ค่า 16 : 9 ต้องไม่หาย
  // ช่องปกนอนของหน้าเสียงและซับ (target cover_land) ก็เป็นกรอบ 16 : 9 ตั้งแต่เปิด ไม่ต้องรอค่าครอปเดิม (BUGS ข้อ 32)
  const wideSlot = p.link ? p.link.orient === "wide" : p.target === "cover_land" || p.start?.geo.aspect === "wide";
  const ar = wideSlot ? WIDE : TALL;
  const [view, setView] = useState<View>(() => p.start ? fromGeo(p.start.geo, info, ar) : START);
  const [mode, setMode] = useState<"crop" | "pad" | "original">(p.start?.geo.mode ?? (info.twoThree ? "crop" : "crop"));
  const [pad, setPad] = useState(p.start?.geo.pad ?? PADS[0].c);
  const [format, setFormat] = useState<"jpg" | "png">(p.start?.format ?? p.defaultFormat);
  const [quality, setQuality] = useState(p.start?.quality ?? p.defaultQuality);
  /** ตัวเลขที่กำลังพิมพ์ในช่องคุณภาพ · พิมพ์ค้างหรือเกินช่วงไม่ใช้ ออกจากช่องแล้วกลับเป็นค่าล่าสุดที่ใช้ได้ */
  const [qText, setQText] = useState<string | null>(null);
  const [render, setRender] = useState<RenderInfo | null>(null);
  const [jpgBytes, setJpgBytes] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [using, setUsing] = useState(false);
  const [smallOk, setSmallOk] = useState(false);
  const seq = useRef(0);

  const lay = useMemo(() => layout(info, view, ar), [info, view, ar]);
  // ค่าใหม่ส่งเฉพาะตอนใช้ หน้าอื่นได้ค่าเท่าเดิมทุกตัว
  const geo: Geometry = { rotate: view.rotate, flip: view.flip, mode: wideSlot ? "crop" : mode, pad, x: lay.nx, y: lay.ny, w: lay.nw, h: lay.nh, ...(view.tilt ? { tilt: view.tilt } : {}), ...(wideSlot ? { aspect: "wide" } : {}) };
  const geoKey = JSON.stringify(geo);

  // ขนาดไฟล์จริง · คิดใหม่หลังหยุดลากราว 0.25 วินาที · ผลเก่าที่มาช้าทิ้ง
  useEffect(() => {
    const n = ++seq.current;
    setBusy(true);
    const t = setTimeout(() => {
      posterApi.render(geo, format, quality, { sizes: format === "jpg" && !p.link, target: p.target }).then((r) => {
        if (n !== seq.current) return;
        setRender(r);
        if (format === "jpg") setJpgBytes(r.bytes);
        setBusy(false);
      }).catch(() => { if (n === seq.current) setBusy(false); });
    }, 250);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [geoKey, format, quality]);

  useEffect(() => { if (render && !render.small) setSmallOk(false); }, [render]);

  /** กดใช้รูปนี้ไม่สำเร็จ (เช่น ช่องปกนอนของหน้าเสียงและซับได้รูปแนวตั้ง) ขึ้นเหตุผลข้างปุ่ม · เดิมไม่มีที่บอก กดแล้วเงียบ */
  const [useErr, setUseErr] = useState<string | null>(null);
  useEffect(() => { setUseErr(null); }, [geoKey, format]);
  const use = async () => {
    if (using) return;
    setUsing(true);
    setUseErr(null);
    try {
      const r = await posterApi.render(geo, format, quality, { choose: true, target: p.target });
      p.onUse({ geo, format, quality, render: r });
    } catch (e) {
      setUseErr(String(e));
    } finally {
      setUsing(false);
    }
  };
  /** สลับช่องปกตั้งปกนอน · ค่าที่แก้ไว้ในช่องเดิมต้องไม่หายเงียบ จำลงแถวให้ก่อน · ไม่ได้แก้อะไร ไม่จด แถวจะได้ไม่ขึ้นว่าครอปแล้ว */
  const startKey = useRef(geoKey);
  const switchSlot = async (o: "tall" | "wide") => {
    if (using || !p.link || o === p.link.orient) return;
    if (geoKey === startKey.current) { p.link.onOrient(o, null); return; }
    setUsing(true);
    setUseErr(null);
    try {
      const r = await posterApi.render(geo, format, quality, { choose: true, target: p.target });
      p.link.onOrient(o, { geo, format, quality, render: r });
    } catch (e) {
      setUseErr(String(e));
    } finally {
      setUsing(false);
    }
  };

  // ---------- ลาก ----------
  const drag = useRef<{ kind: "move" | "nw" | "ne" | "sw" | "se"; x: number; y: number; v: View } | null>(null);
  const down = (kind: "move" | "nw" | "ne" | "sw" | "se") => (e: React.PointerEvent) => {
    e.preventDefault();
    e.stopPropagation();
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    drag.current = { kind, x: e.clientX, y: e.clientY, v: view };
  };
  /* เต็มจอ ขยายกรอบรูปทั้งก้อน ตัวคำนวณกรอบครอปเหมือนเดิมทุกอย่าง ระยะเมาส์หารสัดส่วนขยายกลับ */
  const [full, setFull] = useState(false);
  const [fullS, setFullS] = useState(1);
  useEffect(() => {
    if (!full) return;
    const fit = () => setFullS(Math.min((window.innerWidth - 48) / SW, (window.innerHeight - 96) / SH));
    fit();
    window.addEventListener("resize", fit);
    return () => window.removeEventListener("resize", fit);
  }, [full]);
  useEscClose(full, () => setFull(false));
  const sc = full ? fullS : 1;
  const move = (e: React.PointerEvent) => {
    const d = drag.current;
    if (!d) return;
    const L = layout(info, d.v, ar);
    if (d.kind === "move") {
      setView({ ...d.v, ...clampCenter(d.v.cx + (e.clientX - d.x) / sc / L.bw, d.v.cy + (e.clientY - d.y) / sc / L.bh, L) });
      return;
    }
    // ลากมุม · มุมตรงข้ามอยู่กับที่ ขนาดตามระยะเมาส์ ล็อกสัดส่วนกรอบ
    const left = d.kind === "nw" || d.kind === "sw", top = d.kind === "nw" || d.kind === "ne";
    const fx = left ? L.boxL + L.boxW : L.boxL, fy = top ? L.boxT + L.boxH : L.boxT;
    const px = (left ? L.boxL : L.boxL + L.boxW) + (e.clientX - d.x) / sc;
    const py = (top ? L.boxT : L.boxT + L.boxH) + (e.clientY - d.y) / sc;
    const roomX = left ? fx - L.imgL : L.imgL + L.bw - fx, roomY = top ? fy - L.imgT : L.imgT + L.bh - fy;
    const want = Math.max(Math.abs(px - fx), Math.abs(py - fy) * ar);
    const w = Math.min(Math.max(want, L.w0 / 4), roomX, roomY * ar, L.w0);
    const h = w / ar;
    const cxPx = left ? fx - w / 2 : fx + w / 2, cyPx = top ? fy - h / 2 : fy + h / 2;
    setView({ ...d.v, z: L.w0 / w, cx: (cxPx - L.imgL) / L.bw, cy: (cyPx - L.imgT) / L.bh });
  };
  const up = () => { drag.current = null; };
  const setZoom = (z: number) => setView((v) => { const nz = Math.min(4, Math.max(1, z)); const L = layout(info, { ...v, z: nz }, ar); return { ...v, z: nz, ...clampCenter(v.cx, v.cy, L) }; });
  const turn = (by: 90 | -90) => setView((v) => ({ ...START, flip: v.flip, tilt: v.tilt, rotate: (((v.rotate + by) % 360) + 360) % 360 as View["rotate"] }));
  const setTilt = (d: number) => setView((v) => ({ ...v, tilt: Math.min(15, Math.max(-15, Math.round(d * 2) / 2)) }));
  const cropping = wideSlot || mode === "crop";
  const [short, setShort] = useState(() => window.innerHeight < SHORT_WINDOW);
  useEffect(() => {
    const on = () => setShort(window.innerHeight < SHORT_WINDOW);
    window.addEventListener("resize", on);
    return () => window.removeEventListener("resize", on);
  }, []);

  const typeQ = (text: string) => { const t = text.replace(/\D/g, ""); setQText(t); const n = Number(t); if (n >= 1 && n <= 100) setQuality(n); };
  const pickNew = async () => { if (using) return; const f = await pickFile("image"); if (f) p.onPickImage(f); };
  /** การ์ดเตือนครอปเหลือน้อย · PNG ไม่มีตารางคุณภาพ ไปอยู่ที่ว่างฝั่งซ้าย · JPG อยู่ท้ายฝั่งขวา */
  const smallCard = render?.small && !smallOk && cropping ? (
    <div className="stat warn" style={{ alignItems: "center" }} data-small><CardIcon kind="warn" />
      <div style={{ flex: 1, minWidth: 0 }}><b>ครอปเหลือ <span className="nw">{render.cropW} × {render.cropH} px</span></b><div>ปกอาจเบลอ</div></div>
      <span style={{ display: "flex", gap: 6, flex: "none" }}>
        <button type="button" className="btn btn-ghost btn-sm" onClick={() => setSmallOk(true)}>ใช้ต่อ</button>
        <button type="button" className="btn btn-ghost btn-sm" onClick={pickNew}><IcPoster size={15} />เปลี่ยนรูป</button>
      </span>
    </div>
  ) : null;
  const smallLeft = format === "png" && !short && !p.link;
  // PNG ไม่ลดคุณภาพเป็นข้อดี ไม่ใช่คำเตือน ใช้สีตามโทนของโปรแกรม (BUGS ข้อ 8 · พี่กันเคาะ "เปลี่ยนเป็นสีตามธีมโปรแกรมละกัน")
  const pngCard = <div className="stat tone" style={short ? { minHeight: FORMAT_ROOM } : undefined} data-pngnote><CardIcon kind="ok" /><div><b style={short ? { display: "inline" } : undefined}>PNG ไม่ลดคุณภาพ</b>{render && jpgBytes ? <>{short ? " " : <div />}{render.bytes / jpgBytes >= 1.5 ? <>ใหญ่กว่า JPG ราว {Math.round(render.bytes / jpgBytes)} เท่า</> : "ไฟล์ใหญ่กว่า JPG"}</> : null}</div></div>;
  const name = info.name;
  const tag = info.attachable ? null : `.${info.ext}→.${format}`;
  return (
    <Dialog open onClose={p.onCancel} width={1000} title={
      <span style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 12 }}>
        <span>{p.link ? `ครอปรูปปก · ${p.link.movie}` : "ครอปรูปโปสเตอร์"}</span>
        <span className="small" style={{ fontWeight: 400, display: "flex", gap: 12 }}><span>{name}</span><span className="nw">{info.width} × {info.height} px</span><span>{/* พอดีปก บอกเฉพาะช่องปกตั้ง · ช่องปกนอนรูป 2 : 3 ต้องครอปเป็น 16 : 9 อยู่ดี (เจอตอนตรวจภาพ BUGS ข้อ 32) */}{info.aspect === "2 : 3" ? (wideSlot ? "สัดส่วน 2 : 3" : "สัดส่วน 2 : 3 พอดีปก") : info.aspect}</span></span>
      </span>
    } actions={<>
      {useErr && <div className="hint e" role="alert" style={{ margin: "0 auto 0 0", maxWidth: 520 }} data-use-err>{useErr}</div>}
      {/* ซ้ายตรงแนวเนื้อหาฝั่งขวา (รูปใหญ่ 520 บวกระยะกับเส้นแบ่ง 24) */}
      <div style={{ width: `calc(100% - ${SW + 24}px)`, flex: "none", display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 8 }} data-crop-acts>
      <button type="button" className={"btn btn-sm " + (using ? "btn-wait" : "btn-ghost")} aria-disabled={using || undefined} onClick={pickNew} data-new-image><IcPoster size={15} />เลือกรูปใหม่</button>
      <button type="button" className={"btn btn-sm " + (using ? "btn-wait" : "btn-ghost")} aria-disabled={using || undefined} onClick={() => { if (!using) p.onCancel(); }}>ยกเลิก</button>
      <button type="button" className={"btn btn-sm " + (using ? "btn-wait" : "btn-main")} aria-disabled={using || undefined} onClick={use} data-use><Keep icon={<IbTick size={15} />} all={["กำลังทำรูป…", "ใช้ค่านี้", "ใช้รูปนี้"]}>{using ? "กำลังทำรูป…" : p.link ? "ใช้ค่านี้" : "ใช้รูปนี้"}</Keep></button>
      </div>
    </>}>
      <div style={{ display: "flex", gap: 12, alignItems: "flex-start", height: p.link ? (short ? 450 : 575) : short ? 458 : 622 }} data-crop>
        <div style={{ display: "flex", flexDirection: "column", gap: 12, width: SW, flex: "none" }}>
          <div className="stageroom">
          <div className={full ? "cropfull" : "stagehold"} data-crop-fullview={full || undefined}>
          <div className="stage" style={full ? { transform: `scale(${fullS})`, "--hs": 1 / fullS } as React.CSSProperties : undefined} onPointerMove={move} onPointerUp={up} onPointerCancel={up}
            onWheel={(e) => { if (cropping) setZoom(view.z * (e.deltaY < 0 ? 1.1 : 1 / 1.1)); }}>
            <ImageLayer info={info} view={view} k={1} originX={SW / 2} originY={SH / 2} />
            {cropping ? (
              <div className="cropbox" style={{ left: lay.boxL, top: lay.boxT, width: lay.boxW, height: lay.boxH }} onPointerDown={down("move")}
                tabIndex={0} role="group" aria-label="กรอบครอป ลูกศรเลื่อน บวกลบซูม"
                onKeyDown={(e) => {
                  const step = e.shiftKey ? 0.05 : 0.01;
                  const mv = (dx: number, dy: number) => { e.preventDefault(); setView((v) => ({ ...v, ...clampCenter(v.cx + dx, v.cy + dy, layout(info, v, ar)) })); };
                  if (e.key === "ArrowLeft") mv(-step, 0); if (e.key === "ArrowRight") mv(step, 0);
                  if (e.key === "ArrowUp") mv(0, -step); if (e.key === "ArrowDown") mv(0, step);
                  if (e.key === "+" || e.key === "=") { e.preventDefault(); setZoom(view.z * 1.1); }
                  if (e.key === "-") { e.preventDefault(); setZoom(view.z / 1.1); }
                }}>
                {(["nw", "ne", "sw", "se"] as const).map((k) => <span key={k} className={"hd " + k} onPointerDown={down(k)} />)}
              </div>
            ) : null}
          </div>
          {full ? (
            <div className="cropfullbar">
              <span style={{ whiteSpace: "nowrap" }}>ซูม</span>
              <Range value={Math.round(view.z * 100)} min={100} max={400} step={5} label="ซูม" format={(v) => `${v}%`} onChange={(v) => { if (cropping) setZoom(v / 100); }} />
              <span style={{ whiteSpace: "nowrap", minWidth: 40, textAlign: "right" }}>{Math.round(view.z * 100)}%</span>
              <button type="button" className="btn btn-main btn-sm" onClick={() => setFull(false)} data-crop-full-close><IbTick size={15} />ตกลง</button>
            </div>
          ) : (
            <button type="button" className="bigbtn stagebig" title="ขยายเต็มจอ" aria-label="ขยายหน้าครอปเต็มจอ" data-crop-full onClick={() => setFull(true)}><IcExpand size={15} /></button>
          )}
          </div>
          </div>
          <div className="small" style={short ? undefined : { marginTop: -6, marginBottom: -5.4, marginRight: -12, paddingRight: 12, paddingBottom: 7.4, borderBottom: "1px solid var(--line)" }} data-crop-line>{cropping ? "ลากกรอบเพื่อเลื่อน ลากมุมเพื่อย่อขยาย หมุนล้อเมาส์เพื่อซูม" : mode === "pad" ? "ภาพไม่ถูกตัดเลยสักส่วน ที่ว่างเติมสีขอบที่เลือก" : "ใช้ทั้งรูปตามสัดส่วนเดิม ไม่ตัด ไม่เติมขอบ ปกแนวนอนขึ้นชั้นวางเป็นแนวนอน"}</div>
          {/* แถวเดียวกัน แบบเติมขอบใช้ซูมไม่ได้ จึงเป็นสีขอบแทน ไม่มีแถวเพิ่มหรือหาย */}
          {!wideSlot && mode === "pad" ? (
            <div style={{ display: "flex", alignItems: "center", gap: 10, height: 32, position: "relative" }} data-pads>
              <span style={{ fontSize: 14 }}>สีขอบ</span>
              {PADS.map((c) => <button key={c.c} type="button" className={"swatch" + (pad === c.c ? " on" : "")} style={{ background: c.c }} aria-label={"สีขอบ " + c.label} aria-pressed={pad === c.c} title={c.label} onClick={() => setPad(c.c)} />)}
              <PadCustom pad={pad} onPad={setPad} custom={!PADS.some((c) => c.c === pad)} short={short} />
              <span className="small">{PADS.find((c) => c.c === pad)?.label ?? pad.toUpperCase()}</span>
            </div>
          ) : (
            <div style={{ display: "flex", alignItems: "center", gap: 12, height: 32, opacity: cropping ? 1 : 0.45 }}>
              <span style={{ fontSize: 14, whiteSpace: "nowrap" }}>ซูม</span>
              <Range value={Math.round(view.z * 100)} min={100} max={400} step={5} label="ซูม" format={(v) => `${v}%`} onChange={(v) => { if (cropping) setZoom(v / 100); }} />
              <span className="small" style={{ whiteSpace: "nowrap", minWidth: 40, textAlign: "right" }}>{Math.round(view.z * 100)}%</span>
            </div>
          )}
          {p.link && (
            <div style={{ display: "flex", alignItems: "center", gap: 12 }} data-tilt>
              <span style={{ fontSize: 14, whiteSpace: "nowrap" }}>ปรับเอียง</span>
              <Range value={view.tilt} min={-15} max={15} step={0.5} label="ปรับเอียง" format={(v) => `${v}°`} onChange={setTilt} />
              <button type="button" className="btn btn-ghost btn-sm" aria-label="เอียงทวนเข็มครึ่งองศา" data-tilt-minus onClick={() => setTilt(view.tilt - 0.5)}>−</button>
              <button type="button" className="btn btn-ghost btn-sm" aria-label="เอียงตามเข็มครึ่งองศา" data-tilt-plus onClick={() => setTilt(view.tilt + 0.5)}>+</button>
              <span className="small" style={{ whiteSpace: "nowrap", minWidth: 40, textAlign: "right" }} data-tilt-val>{view.tilt > 0 ? "+" : view.tilt < 0 ? "−" : ""}{Math.abs(view.tilt)}°</span>
            </div>
          )}
          <div style={{ display: "flex", gap: 8, marginTop: short ? 0 : 3 }} data-crop-tools>
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => turn(-90)}><IbRotL size={15} />หมุนซ้าย</button>
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => turn(90)}><IbRotR size={15} />หมุนขวา</button>
            <button type="button" className={"btn btn-ghost btn-sm" + (view.flip ? " pressed" : "")} aria-pressed={view.flip} onClick={() => setView((v) => ({ ...v, flip: !v.flip }))}><IbFlip size={15} />พลิกซ้ายขวา</button>
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => { setView(START); setMode("crop"); }}><IcRefresh size={15} />กลับเป็นแบบเดิม</button>
          </div>
          {/* จองที่เท่าตารางคุณภาพทั้ง JPG และ PNG สลับแล้วหน้าต่างสูงเท่าเดิม */}
          {!p.link && !short && <div style={{ height: TABLE_ROOM, display: "flex", flexDirection: "column", gap: 12 }} data-table-room>
          {smallLeft && smallCard}
          {format === "jpg" && (
            <>
              {render && render.sizes.length > 0 && (
                <table className="fmt" style={{ fontSize: 13 }} data-qtable>
                  <thead><tr><th>คุณภาพ</th><th>ไฟล์ราว</th><th>ความต่างที่ตาเห็น</th></tr></thead>
                  <tbody>{render.sizes.map(([q, b]) => (
                    <tr key={q} className={q === quality ? "on" : ""}><td>{q === quality ? <b>{q}%</b> : `${q}%`}</td><td><span className="nw">{fmtSize(b)}</span></td><td>{QUAL_NOTE[q]}</td></tr>
                  ))}</tbody>
                </table>
              )}
            </>
          )}
          </div>}
        </div>
        <div className={short || p.link ? undefined : "cropright"} style={{ flex: 1, display: "flex", flexDirection: "column", gap: 12, minWidth: 0, alignSelf: "stretch", position: "relative", ...(short || p.link ? { borderLeft: "1px solid var(--line)", paddingLeft: 11 } : { paddingLeft: 12 }) }}>
          {p.link && (
            <div className="setrow" style={{ borderTop: 0, paddingTop: 0 }}>
              <div className="lbl">ช่องปก</div>
              <Seg small label="ช่องปก" value={p.link.orient} onChange={switchSlot} options={[{ value: "tall", label: <><IcTall size={14} />ปกตั้ง 2 : 3</> }, { value: "wide", label: <><IcWide size={14} />ปกนอน 16 : 9</> }]} />
            </div>
          )}
          <div style={{ fontWeight: 600, fontSize: 14 }}>ตัวอย่างหลังครอป</div>
          {/* จองที่เท่าตัวอย่างสูงสุด (สูง 165 + ป้ายใต้รูป) สลับแบบปกแล้วแถวข้างล่างไม่ขยับ (พี่กันสั่ง 9 พ.ย. 2569 "กันที่ไว้ที มันขยับไปมาอ่ะ") */}
          <div style={{ display: "flex", gap: 18, alignItems: "flex-end", justifyContent: "center", flexWrap: "wrap", minHeight: short ? PREVIEW_ROOM_SHORT : PREVIEW_ROOM }} data-previews>
            {(() => {
              // ปกจับคู่ไม่ได้อยู่ในไฟล์ ไอคอนใน Windows ไม่เปลี่ยน (Icaros อ่านปกจากในไฟล์) จึงไม่มีตัวอย่างไอคอน
              const sizes = (wideSlot
                ? [{ w: 128, h: 72, cap: "บนชั้นวาง" }, { w: 160, h: 90, cap: "แผงรายละเอียด" }, { w: 64, h: 36, cap: "ไอคอน Windows" }]
                : [{ w: 72, h: 108, cap: "บนชั้นวาง" }, { w: 110, h: 165, cap: "แผงรายละเอียด" }, { w: 40, h: 60, cap: "ไอคอน Windows" }]).slice(0, p.link ? 2 : 3);
              const pvK = short ? PREVIEW_K_SHORT : wideSlot ? 1 : PREVIEW_K_TALL;
              const cell = (s: { w: number; h: number; cap: string }, k = pvK) => (
                <div key={s.cap} style={{ display: "flex", flexDirection: "column", alignItems: "center", textAlign: "center" }}>
                  <Preview info={info} view={view} lay={lay} mode={wideSlot ? "crop" : mode} pad={pad} w={Math.round(s.w * k)} h={Math.round(s.h * k)} />
                  <div className="small" style={{ marginTop: 6 }}>{s.cap}</div>
                </div>
              );
              // ปกนอนวางสามรูปเรียงแถวเดียวแล้วเบียด · แผงรายละเอียดใหญ่ครึ่งบน อีกสองรูปแถวล่าง ในที่ที่จองไว้เท่าเดิม
              // (พี่กันสั่ง 11 พ.ย. 2569 "ให้รูป แผงรายละเอียดอยู่ครึ่งบน เเสดงอันใหญ่ เเละอีกสองตัวอย่างอยู่ด้านล่าง") · หน้าต่างเตี้ยที่ไม่พอสูงยังเรียงแถวเดียว
              if (wideSlot && !short) {
                const big = sizes.find((s) => s.cap === "แผงรายละเอียด")!, rest = sizes.filter((s) => s !== big);
                return (
                  <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 8, width: "100%" }} data-previews-wide>
                    {cell({ ...big, w: 272, h: 153 }, 1)}
                    <div style={{ display: "flex", gap: 28, alignItems: "flex-end", justifyContent: "center" }}>{rest.map((s) => cell(s))}</div>
                  </div>
                );
              }
              return sizes.map((s) => cell(s));
            })()}
          </div>
          {!wideSlot && <div className="setrow" style={{ borderTop: "1px solid var(--line)", paddingBlock: short ? 11 : 7, marginTop: short ? 0 : -5, marginLeft: -12, paddingLeft: 12 }}>
            <div className="lbl">แบบปก</div>
            <Seg small label="แบบปก" value={mode} onChange={setMode} options={[{ value: "crop", label: <><IbCrop size={14} />ตัดให้พอดี 2 : 3</> }, { value: "pad", label: <><IcPoster size={14} />เติมขอบ</> }, { value: "original", label: <><IcFile size={14} />ตามรูปเดิม</> }]} />
          </div>}
          {/* เลือก ตามรูปเดิม กับรูปที่ไม่ใช่ 2 : 3 เตือนตรงจุดที่กำลังเลือก ไม่ไปขึ้นบนการ์ดหลังเลือกเสร็จ (BUGS ข้อ 8 · พี่กัน "เนี่ย ถ้าเลือกรูปเดิม แบบที่เราเลือก เเล้วระบบมันเตือน") */}
          {!wideSlot && mode === "original" && !info.twoThree && <div className="stat warn" style={{ marginTop: -6, marginBottom: 6, padding: "6px 10px" }} data-origwarn><CardIcon kind="warn" /><div><b>ปกจะไม่เต็มช่องบนชั้นวาง</b><Phr>{`รูปนี้เป็น${info.aspect} ไม่ใช่ 2 : 3 จะเห็นขอบว่างรอบปก`}</Phr></div></div>}
          {!p.link && <div className="setrow" style={{ borderTop: "1px solid transparent", marginTop: -12, paddingBlock: short ? 11 : 7 }}>
            <div className="lbl">ไฟล์รูปที่ได้ {tag && <span className="extag cv" style={{ marginLeft: 6 }}>{tag}</span>}</div>
            <Seg small label="ไฟล์รูปที่ได้" value={format} onChange={setFormat} options={[{ value: "jpg", label: "JPG" }, { value: "png", label: "PNG" }]} />
          </div>}
          <div className="small" data-size>
            {render ? <>ได้รูปขนาด <span className="nw">{render.width} × {render.height} px</span> ไฟล์ {format.toUpperCase()} ราว <span className="nw">{fmtSize(render.bytes)}</span>{busy ? " กำลังคิดใหม่…" : ""}</> : "กำลังคิดขนาดไฟล์…"}
            {!short && <br />}{short ? null : p.link ? "ยังไม่เขียนไฟล์ จำค่าครอปไว้ ทำรูปจริงตอนยืนยัน รูปเดิมในเครื่องไม่ถูกแก้" : tag ? <Phr>{`แนบใน MKV ตรง ๆ ไม่ได้ โปรแกรมแปลงเป็น ${format.toUpperCase()} ให้ รูปเดิมในเครื่องไม่ถูกแก้`}</Phr> : "รูปเดิมในเครื่องไม่ถูกแก้"}
          </div>
          {p.link ? null : format === "jpg" ? (
            <div style={{ display: "flex", alignItems: "center", gap: 12, minHeight: FORMAT_ROOM }}>
              <span style={{ fontSize: 14, whiteSpace: "nowrap" }}>คุณภาพ JPG</span>
              <Range value={Math.max(50, quality)} min={50} max={100} step={5} label="คุณภาพ JPG" format={(v) => `${v}%`} onChange={(v) => { setQText(null); setQuality(v); }} />
              <span className="qnum">
                <input value={qText ?? String(quality)} inputMode="numeric" maxLength={3} aria-label="คุณภาพ JPG พิมพ์เลข 1 ถึง 100" data-quality-input
                  onFocus={(e) => e.currentTarget.select()}
                  onChange={(e) => typeQ(e.target.value)}
                  onBlur={() => setQText(null)}
                  onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); e.currentTarget.blur(); } else digitKey(e, typeQ); }} />%
              </span>
            </div>
          ) : pngCard}
          {!smallLeft && smallCard}
        </div>
      </div>
    </Dialog>
  );
}

/** ตำแหน่งภาพกับกรอบครอปในกรอบ 520 × 293 (พิกเซลบนจอ) และกรอบเป็นสัดส่วนของรูปหลังหมุน · ar สัดส่วนกรอบ กว้างหารสูง */
function layout(info: PosterInfo, v: View, ar = TALL) {
  const sideways = v.rotate % 180 !== 0;
  const rw = sideways ? info.height : info.width, rh = sideways ? info.width : info.height;
  const s = Math.min((SW - GAP * 2) / rw, (SH - GAP * 2) / rh);
  const bw = rw * s, bh = rh * s;
  const imgL = (SW - bw) / 2, imgT = (SH - bh) / 2;
  // กรอบใหญ่สุดในรูป (ซูม 100%)
  const w0 = Math.min(bw, bh * ar);
  const boxW = w0 / v.z, boxH = boxW / ar;
  const boxL = imgL + v.cx * bw - boxW / 2, boxT = imgT + v.cy * bh - boxH / 2;
  return { s, bw, bh, imgL, imgT, w0, boxW, boxH, boxL, boxT, nx: (boxL - imgL) / bw, ny: (boxT - imgT) / bh, nw: boxW / bw, nh: boxH / bh };
}

/** จุดกลางกรอบไม่ให้กรอบหลุดออกนอกรูป */
function clampCenter(cx: number, cy: number, L: ReturnType<typeof layout>) {
  const hw = L.boxW / L.bw / 2, hh = L.boxH / L.bh / 2;
  return { cx: Math.min(1 - hw, Math.max(hw, cx)), cy: Math.min(1 - hh, Math.max(hh, cy)) };
}

/** เปิดหน้าต่างอีกครั้ง คืนค่ากรอบเดิม */
function fromGeo(g: Geometry, info: PosterInfo, ar = TALL): View {
  const base = { ...START, rotate: g.rotate, flip: g.flip, tilt: g.tilt ?? 0 };
  const L = layout(info, base, ar);
  const z = Math.min(4, Math.max(1, L.w0 / (g.w * L.bw)));
  return { ...base, z, cx: g.x + g.w / 2, cy: g.y + g.h / 2 };
}

/** ภาพตัวอย่าง หมุนแล้วพลิก วางให้จุดกลางภาพอยู่ที่ originX originY คูณขนาดด้วย k */
function ImageLayer(p: { info: PosterInfo; view: View; k: number; originX: number; originY: number }) {
  const L = layout(p.info, p.view);
  const w = p.info.width * L.s * p.k, h = p.info.height * L.s * p.k;
  const turn = `${p.view.flip ? "scaleX(-1) " : ""}rotate(${p.view.rotate}deg)`;
  const t = p.view.tilt;
  if (!t) {
    return (
      <img src={thumbUrl(p.info.preview) ?? undefined} alt="" draggable={false}
        style={{ left: p.originX - w / 2, top: p.originY - h / 2, width: w, height: h, transform: turn }} />
    );
  }
  // ปรับเอียง · ขยายให้เต็มกรอบแล้วตัดส่วนเกิน ให้เห็นแบบเดียวกับรูปจริง ไม่มีมุมว่าง
  const fw = L.bw * p.k, fh = L.bh * p.k;
  return (
    <div style={{ position: "absolute", left: p.originX - fw / 2, top: p.originY - fh / 2, width: fw, height: fh, overflow: "hidden" }}>
      <img src={thumbUrl(p.info.preview) ?? undefined} alt="" draggable={false}
        style={{ left: fw / 2 - w / 2, top: fh / 2 - h / 2, width: w, height: h, transform: `rotate(${t}deg) scale(${tiltScale(L.bw, L.bh, t)}) ${turn}` }} />
    </div>
  );
}

/** แป้นไทยกดแป้นเลขแล้วได้ตัวอักษรไทย ช่องเลขทิ้งหมดจนเหมือนพิมพ์ไม่ได้ · ดูจากตำแหน่งแป้นแทน ใส่เลขให้ */
function digitKey(e: React.KeyboardEvent<HTMLInputElement>, apply: (text: string) => void, max = 3, hexLetters = false) {
  const m = (hexLetters ? /^(?:Digit|Numpad|Key)([\dA-F])$/ : /^(?:Digit|Numpad)(\d)$/).exec(e.code);
  if (!m || /^[\da-fA-F]$/.test(e.key) && hexLetters || /\d/.test(e.key) || e.ctrlKey || e.altKey || e.shiftKey) return;
  e.preventDefault();
  const el = e.currentTarget, from = el.selectionStart ?? el.value.length, to = el.selectionEnd ?? from;
  apply((el.value.slice(0, from) + m[1] + el.value.slice(to)).slice(0, max));
}

const toHex = (v: number[]) => "#" + v.map((n) => Math.round(n).toString(16).padStart(2, "0")).join("");
const hexRgb = (h: string) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16) || 0);
/** ฮิว 0 ถึง 360 · อิ่มตัวกับความสว่าง 0 ถึง 1 */
function hslRgb(h: number, s: number, l: number) {
  const f = (n: number) => { const k = (n + h / 30) % 12; return 255 * (l - s * Math.min(l, 1 - l) * Math.max(-1, Math.min(k - 3, 9 - k, 1))); };
  return [f(0), f(8), f(4)];
}
function rgbHsl([r, g, b]: number[]) {
  const R = r / 255, G = g / 255, B = b / 255, mx = Math.max(R, G, B), mn = Math.min(R, G, B), d = mx - mn, l = (mx + mn) / 2;
  const s = d === 0 ? 0 : d / (1 - Math.abs(2 * l - 1));
  const h = d === 0 ? 0 : mx === R ? ((G - B) / d + 6) % 6 * 60 : mx === G ? ((B - R) / d + 2) * 60 : ((R - G) / d + 4) * 60;
  return { h, s, l };
}
/** รังผึ้งสี กลางขาว ขอบเข้ม เรียง 13 แถว · แถวสีเทาใต้รังผึ้ง */
const HONEY = (() => {
  const rows: string[][] = [];
  for (let r = -6; r <= 6; r++) {
    const n = 13 - Math.abs(r), row: string[] = [];
    for (let i = 0; i < n; i++) {
      const x = i - (n - 1) / 2, y = r * 0.87, d = Math.min(1, Math.hypot(x, y) / 6.2);
      row.push(toHex(hslRgb(((Math.atan2(y, x) * 180) / Math.PI + 390) % 360, 1, 1 - d * 0.62)));
    }
    rows.push(row);
  }
  return rows;
})();
const GRAYS = Array.from({ length: 11 }, (_, i) => toHex(Array(3).fill(255 - i * 25.5)));

/** ปุ่มเลือกสีขอบเอง กางแผงเลือกสี · เลือกแล้วตัวอย่างเปลี่ยนทันที · ยกเลิกกับ Esc คืนสีเดิม
    กางลงใต้แถวสีขอบ กว้างเท่าฝั่งซ้าย ทับปุ่มหมุนกับตาราง ไม่บังรูป (พี่กันห้าม) · ความสูงกำหนดให้พอดีกรอบหน้าต่างครอป ไม่ใช้ตัววัดขอบจอ เพราะขอบที่ห้ามเกินคือกรอบหน้าต่าง กรอบต้องไม่มีแถบเลื่อน */
function PadCustom(p: { pad: string; onPad: (c: string) => void; custom: boolean; short: boolean }) {
  const { short } = p;
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<"std" | "own">("own");
  const [old, setOld] = useState(p.pad);
  // เก็บฮิวไว้เอง สีขาวดำไม่มีฮิว ลากความสว่างลงสุดแล้วกลับขึ้นสีเดิมต้องไม่หาย
  const [hsl, setHsl] = useState(() => rgbHsl(hexRgb(p.pad)));
  const [hexText, setHexText] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const wrap = useRef<HTMLSpanElement>(null), panel = useRef<HTMLDivElement>(null);
  const cancel = () => { p.onPad(old); setOpen(false); };
  useEscClose(open, cancel);
  useEffect(() => {
    if (!open) return;
    const out = (e: PointerEvent) => { if (!wrap.current?.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("pointerdown", out);
    return () => document.removeEventListener("pointerdown", out);
  }, [open]);
  const rgb = hexRgb(p.pad);
  const setHslAll = (n: { h: number; s: number; l: number }) => { setHsl(n); setHexText(null); p.onPad(toHex(hslRgb(n.h, n.s, n.l))); };
  const setRgbAll = (v: number[]) => { setHsl(rgbHsl(v)); setHexText(null); p.onPad(toHex(v)); };
  const setCh = (i: number, n: number) => setRgbAll(rgb.map((x, j) => (j === i ? Math.min(255, Math.max(0, n)) : x)));
  const typeHex = (t: string) => { const c = t.replace(/[^\da-fA-F]/g, "").slice(0, 6); setHexText("#" + c); if (c.length === 6) { const v = hexRgb("#" + c); setHsl(rgbHsl(v)); p.onPad(toHex(v)); } };
  const drag = (fn: (x: number, y: number) => void) => (e: React.PointerEvent<HTMLDivElement>) => {
    const el = e.currentTarget, go = (ev: { clientX: number; clientY: number }) => { const r = el.getBoundingClientRect(); fn(Math.min(1, Math.max(0, (ev.clientX - r.left) / r.width)), Math.min(1, Math.max(0, (ev.clientY - r.top) / r.height))); };
    go(e);
    if (e.buttons !== 1) return;
    el.setPointerCapture(e.pointerId);
    const move = (ev: PointerEvent) => go(ev);
    const up = () => { el.removeEventListener("pointermove", move); el.removeEventListener("pointerup", up); };
    el.addEventListener("pointermove", move);
    el.addEventListener("pointerup", up);
  };
  return (
    <span ref={wrap} style={{ display: "inline-flex" }}>
      <button type="button" className={"btn btn-ghost btn-sm" + (p.custom ? " pressed" : "")} aria-expanded={open} data-pad-custom onClick={() => { if (open) { setOpen(false); return; } setOld(p.pad); setHsl(rgbHsl(hexRgb(p.pad))); setHexText(null); setOpen(true); }}>
        {p.custom && <span className="padchip" style={{ background: p.pad }} />}เลือกเอง
      </button>
      {open && (
        <div ref={panel} className={"padrgb pop-in" + (short ? " short" : "")} style={{ position: "absolute", left: 0, top: "calc(100% + 6px)" }} data-pad-rgb>
          <div className="padbody">
            <div style={{ minWidth: 0 }}>
              <div className="padtabs">
                <button type="button" className={tab === "std" ? "on" : ""} onClick={() => setTab("std")} data-pad-tab="std">มาตรฐาน</button>
                <button type="button" className={tab === "own" ? "on" : ""} onClick={() => setTab("own")} data-pad-tab="own">กำหนดเอง</button>
              </div>
              <div className="padarea">
                {tab === "std" ? (
                  <div className="honey">
                    {HONEY.map((row, i) => <div key={i} className="honeyrow">{row.map((c) => <button type="button" key={c + i} className={p.pad === c ? "on" : ""} style={{ background: c }} aria-label={"สี " + c} onClick={() => setRgbAll(hexRgb(c))} />)}</div>)}
                    <div className="honeyrow gray">{GRAYS.map((c) => <button type="button" key={c} className={p.pad === c ? "on" : ""} style={{ background: c }} aria-label={"สี " + c} onClick={() => setRgbAll(hexRgb(c))} />)}</div>
                  </div>
                ) : (
                  <div className="padmix">
                    <div className="padbox" onPointerDown={drag((x, y) => setHslAll({ ...hsl, h: x * 360, s: 1 - y, l: hsl.l === 0 || hsl.l === 1 ? 0.5 : hsl.l }))} data-pad-box>
                      <span className="padmark" style={{ left: (hsl.h / 360) * 100 + "%", top: (1 - hsl.s) * 100 + "%" }} />
                    </div>
                    <div className="padlight" style={{ background: `linear-gradient(to bottom, white, ${toHex(hslRgb(hsl.h, hsl.s, 0.5))}, black)` }} onPointerDown={drag((_x, y) => setHslAll({ ...hsl, l: 1 - y }))} data-pad-light>
                      <span className="padarrow" style={{ top: (1 - hsl.l) * 100 + "%" }} />
                    </div>
                  </div>
                )}
              </div>
            </div>
            <div className="padside">
              <div className="padfields">
                {["แดง", "เขียว", "น้ำเงิน"].map((ch, i) => (
                  <label key={ch}><span>{ch}</span>
                    <input value={rgb[i]} inputMode="numeric" maxLength={3} aria-label={"สีขอบ " + ch + " พิมพ์เลข 0 ถึง 255"} data-pad-ch={i}
                      onFocus={(e) => e.currentTarget.select()}
                      onKeyDown={(e) => digitKey(e, (t) => setCh(i, Number(t) || 0))}
                      onChange={(e) => setCh(i, Number(e.target.value.replace(/\D/g, "")) || 0)} />
                  </label>
                ))}
                <label><span>Hex</span>
                  <input className="hex" value={hexText ?? p.pad.toUpperCase()} maxLength={7} aria-label="สีขอบ รหัส Hex" data-select-all data-pad-hex
                    onFocus={(e) => e.currentTarget.select()} onBlur={() => setHexText(null)}
                    onKeyDown={(e) => digitKey(e, typeHex, 7, true)}
                    onChange={(e) => typeHex(e.target.value)} />
                  <button type="button" className="padcopy" aria-label={copied ? "คัดลอกรหัสสีแล้ว" : "คัดลอกรหัสสี"} title={copied ? "คัดลอกแล้ว" : "คัดลอก"} data-pad-copy
                    onClick={(e) => { e.preventDefault(); navigator.clipboard?.writeText(p.pad.toUpperCase()).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1500); }).catch(() => {}); }}>
                    {copied ? <IbTick size={14} /> : <IcCopy size={14} />}
                  </button>
                </label>
              </div>
              <div className="padfoot">
                <div className="padcmp"><span><i style={{ background: p.pad }} data-pad-new />สีใหม่</span><span><i style={{ background: old }} />สีเดิม</span></div>
                <div className="padbtns">
                  <button type="button" className="btn btn-main btn-sm" onClick={() => setOpen(false)} data-pad-ok>ตกลง</button>
                  <button type="button" className="btn btn-ghost btn-sm" onClick={cancel} data-pad-cancel>ยกเลิก</button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </span>
  );
}

/** ตัวอย่างหลังครอปขนาด w × h · ตัด = ส่วนในกรอบเต็มช่อง · เติมขอบ = ทั้งรูปอยู่กลางช่อง ที่ว่างเป็นสีขอบ
    ตามรูปเดิม = สูงเท่าเดิม กว้างตามสัดส่วนรูป (ไม่เกิน 16:9) แบบเดียวกับที่ชั้นวางวาง */
function Preview(p: { info: PosterInfo; view: View; lay: ReturnType<typeof layout>; mode: "crop" | "pad" | "original"; pad: string; w: number; h: number }) {
  const L = p.lay;
  if (p.mode === "original") {
    // กล่องสูงเท่าแบบอื่น รูปอยู่กลางกล่อง สลับแบบปกแล้วรูปอยู่ตำแหน่งเดิม ไม่กระโดด
    const ar = Math.min(L.bw / L.bh, 16 / 9), h = Math.round(Math.min(p.h, p.w / ar)), w = Math.round(h * ar), k = Math.min(w / L.bw, h / L.bh);
    return <div style={{ width: p.w, height: p.h, flex: "none", display: "flex", alignItems: "center", justifyContent: "center" }}><div className="pv" style={{ width: w, height: h }}><ImageLayer info={p.info} view={p.view} k={k} originX={w / 2} originY={h / 2} /></div></div>;
  }
  if (p.mode === "pad") {
    const k = Math.min(p.w / L.bw, p.h / L.bh);
    return <div className="pv" style={{ width: p.w, height: p.h, background: p.pad }}><ImageLayer info={p.info} view={p.view} k={k} originX={p.w / 2} originY={p.h / 2} /></div>;
  }
  const k = p.w / L.boxW;
  return (
    <div className="pv" style={{ width: p.w, height: p.h }}>
      <ImageLayer info={p.info} view={p.view} k={k} originX={(SW / 2 - L.boxL) * k} originY={(SH / 2 - L.boxT) * k} />
    </div>
  );
}
