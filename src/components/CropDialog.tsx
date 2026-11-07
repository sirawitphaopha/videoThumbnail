/* หน้าต่างครอปรูปโปสเตอร์ (สเปกข้อ 7 · ต้นแบบบรรทัด 847–915)
   ภาพอยู่ในกรอบ 520 × 293 แบบไม่ตัด · กรอบครอปล็อก 2 : 3 เส้นแบ่งสาม มุมจับ 4 มุม นอกกรอบมืด
   ลากกรอบเลื่อน · ลากมุมย่อขยาย · ล้อเมาส์ซูม · แถบซูม 100–400% · หมุนซ้าย หมุนขวา พลิกซ้ายขวา กลับเป็นแบบเดิม
   ตัวอย่างหลังครอป 3 จุด (บนชั้นวาง แผงรายละเอียด ไอคอน Windows) วาดจากภาพตัวอย่างทันทีที่ลาก
   ขนาดไฟล์ที่บอกมาจากการเข้ารหัสจริงฝั่ง Rust (poster_render) ไม่ใช่การเดา · รูปเดิมในเครื่องไม่ถูกแก้
   หมุนแล้วพลิก ลำดับเดียวกับฝั่ง Rust (poster_image.rs render) กรอบเป็นสัดส่วนของรูปหลังหมุนและพลิก */
import { useEffect, useMemo, useRef, useState } from "react";
import Dialog from "./Dialog";
import { Range, Seg, CardIcon, Phr } from "./ui";
import { posterApi, thumbUrl, type Geometry, type PosterInfo, type RenderInfo } from "../lib/api";
import { fmtSize } from "../lib/format";

const SW = 520, SH = 293;
/** เว้นขอบรอบภาพ มุมจับของกรอบครอปที่ซูม 100% ไม่โดนขอบกรอบภาพตัดครึ่ง */
const GAP = 10;
const PADS = [{ c: "#f6dbe5", label: "ชมพูจาง" }, { c: "#000000", label: "ดำ" }, { c: "#ffffff", label: "ขาว" }];
const QUAL_NOTE: Record<number, string> = { 100: "เท่าต้นฉบับ", 90: "แทบไม่ต่าง · แนะนำ", 75: "ขอบตัวหนังสือเริ่มเบลอ", 50: "เห็นเป็นบล็อกชัด" };

export type CropChoice = { geo: Geometry; format: "jpg" | "png"; quality: number; render: RenderInfo };
type View = { rotate: 0 | 90 | 180 | 270; flip: boolean; cx: number; cy: number; z: number };
const START: View = { rotate: 0, flip: false, cx: 0.5, cy: 0.5, z: 1 };

export default function CropDialog(p: {
  info: PosterInfo;
  start?: CropChoice | null;
  defaultFormat: "jpg" | "png";
  defaultQuality: number;
  onCancel: () => void;
  onUse: (c: CropChoice) => void;
  onChangeImage: () => void;
}) {
  const { info } = p;
  const [view, setView] = useState<View>(() => p.start ? fromGeo(p.start.geo, info) : START);
  const [mode, setMode] = useState<"crop" | "pad" | "original">(p.start?.geo.mode ?? (info.twoThree ? "crop" : "crop"));
  const [pad, setPad] = useState(p.start?.geo.pad ?? PADS[0].c);
  const [format, setFormat] = useState<"jpg" | "png">(p.start?.format ?? p.defaultFormat);
  const [quality, setQuality] = useState(p.start?.quality ?? p.defaultQuality);
  const [render, setRender] = useState<RenderInfo | null>(null);
  const [jpgBytes, setJpgBytes] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [using, setUsing] = useState(false);
  const [smallOk, setSmallOk] = useState(false);
  const seq = useRef(0);

  const lay = useMemo(() => layout(info, view), [info, view]);
  const geo: Geometry = { rotate: view.rotate, flip: view.flip, mode, pad, x: lay.nx, y: lay.ny, w: lay.nw, h: lay.nh };
  const geoKey = JSON.stringify(geo);

  // ขนาดไฟล์จริง · คิดใหม่หลังหยุดลากราว 0.25 วินาที · ผลเก่าที่มาช้าทิ้ง
  useEffect(() => {
    const n = ++seq.current;
    setBusy(true);
    const t = setTimeout(() => {
      posterApi.render(geo, format, quality, { sizes: format === "jpg" }).then((r) => {
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

  const use = async () => {
    if (using) return;
    setUsing(true);
    try {
      const r = await posterApi.render(geo, format, quality, { choose: true });
      p.onUse({ geo, format, quality, render: r });
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
  const move = (e: React.PointerEvent) => {
    const d = drag.current;
    if (!d) return;
    const L = layout(info, d.v);
    if (d.kind === "move") {
      setView({ ...d.v, ...clampCenter(d.v.cx + (e.clientX - d.x) / L.bw, d.v.cy + (e.clientY - d.y) / L.bh, L) });
      return;
    }
    // ลากมุม · มุมตรงข้ามอยู่กับที่ ขนาดตามระยะเมาส์ ล็อก 2 : 3
    const left = d.kind === "nw" || d.kind === "sw", top = d.kind === "nw" || d.kind === "ne";
    const fx = left ? L.boxL + L.boxW : L.boxL, fy = top ? L.boxT + L.boxH : L.boxT;
    const px = (left ? L.boxL : L.boxL + L.boxW) + (e.clientX - d.x);
    const py = (top ? L.boxT : L.boxT + L.boxH) + (e.clientY - d.y);
    const roomX = left ? fx - L.imgL : L.imgL + L.bw - fx, roomY = top ? fy - L.imgT : L.imgT + L.bh - fy;
    const want = Math.max(Math.abs(px - fx), (Math.abs(py - fy) * 2) / 3);
    const w = Math.min(Math.max(want, L.w0 / 4), roomX, (roomY * 2) / 3, L.w0);
    const h = (w * 3) / 2;
    const cxPx = left ? fx - w / 2 : fx + w / 2, cyPx = top ? fy - h / 2 : fy + h / 2;
    setView({ ...d.v, z: L.w0 / w, cx: (cxPx - L.imgL) / L.bw, cy: (cyPx - L.imgT) / L.bh });
  };
  const up = () => { drag.current = null; };
  const setZoom = (z: number) => setView((v) => { const nz = Math.min(4, Math.max(1, z)); const L = layout(info, { ...v, z: nz }); return { ...v, z: nz, ...clampCenter(v.cx, v.cy, L) }; });
  const turn = (by: 90 | -90) => setView((v) => ({ ...START, flip: v.flip, rotate: (((v.rotate + by) % 360) + 360) % 360 as View["rotate"] }));

  const name = info.name;
  const tag = info.attachable ? null : `.${info.ext}→.${format}`;
  return (
    <Dialog open onClose={p.onCancel} width={1000} title={
      <span style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 12 }}>
        <span>ครอปรูปโปสเตอร์</span>
        <span className="small" style={{ fontWeight: 400 }}>{name} · <span className="nw">{info.width} × {info.height} px</span> · {info.aspect === "2 : 3" ? "สัดส่วน 2 : 3 พอดีปก" : info.aspect}</span>
      </span>
    } actions={<>
      <button type="button" className={"btn btn-sm " + (using ? "btn-wait" : "btn-ghost")} aria-disabled={using || undefined} onClick={() => { if (!using) p.onCancel(); }}>ยกเลิก</button>
      <button type="button" className={"btn btn-sm " + (using ? "btn-wait" : "btn-main")} aria-disabled={using || undefined} onClick={use} data-use>{using ? "กำลังทำรูป…" : "ใช้รูปนี้"}</button>
    </>}>
      <div style={{ display: "flex", gap: 24, alignItems: "flex-start" }} data-crop>
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <div className="stage" onPointerMove={move} onPointerUp={up} onPointerCancel={up}
            onWheel={(e) => { if (mode === "crop") setZoom(view.z * (e.deltaY < 0 ? 1.1 : 1 / 1.1)); }}>
            <ImageLayer info={info} view={view} k={1} originX={SW / 2} originY={SH / 2} />
            {mode === "crop" ? (
              <div className="cropbox" style={{ left: lay.boxL, top: lay.boxT, width: lay.boxW, height: lay.boxH }} onPointerDown={down("move")}
                tabIndex={0} role="group" aria-label="กรอบครอป ลูกศรเลื่อน บวกลบซูม"
                onKeyDown={(e) => {
                  const step = e.shiftKey ? 0.05 : 0.01;
                  const mv = (dx: number, dy: number) => { e.preventDefault(); setView((v) => ({ ...v, ...clampCenter(v.cx + dx, v.cy + dy, layout(info, v)) })); };
                  if (e.key === "ArrowLeft") mv(-step, 0); if (e.key === "ArrowRight") mv(step, 0);
                  if (e.key === "ArrowUp") mv(0, -step); if (e.key === "ArrowDown") mv(0, step);
                  if (e.key === "+" || e.key === "=") { e.preventDefault(); setZoom(view.z * 1.1); }
                  if (e.key === "-") { e.preventDefault(); setZoom(view.z / 1.1); }
                }}>
                {(["nw", "ne", "sw", "se"] as const).map((k) => <span key={k} className={"hd " + k} onPointerDown={down(k)} />)}
              </div>
            ) : null}
          </div>
          <div className="small">{mode === "crop" ? "ลากกรอบเพื่อเลื่อน · ลากมุมเพื่อย่อขยาย · หมุนล้อเมาส์เพื่อซูม" : mode === "pad" ? "ภาพไม่ถูกตัดเลยสักส่วน · ที่ว่างเติมสีขอบที่เลือก" : "ใช้ทั้งรูปตามสัดส่วนเดิม ไม่ตัด ไม่เติมขอบ · ปกแนวนอนขึ้นชั้นวางเป็นแนวนอน"}</div>
          <div style={{ display: "flex", alignItems: "center", gap: 12, opacity: mode === "crop" ? 1 : 0.45 }}>
            <span style={{ fontSize: 14, whiteSpace: "nowrap" }}>ซูม</span>
            <Range value={Math.round(view.z * 100)} min={100} max={400} step={5} label="ซูม" format={(v) => `${v}%`} onChange={(v) => { if (mode === "crop") setZoom(v / 100); }} />
            <span className="small" style={{ whiteSpace: "nowrap", minWidth: 40, textAlign: "right" }}>{Math.round(view.z * 100)}%</span>
          </div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => turn(-90)}>หมุนซ้าย</button>
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => turn(90)}>หมุนขวา</button>
            <button type="button" className={"btn btn-ghost btn-sm" + (view.flip ? " pressed" : "")} aria-pressed={view.flip} onClick={() => setView((v) => ({ ...v, flip: !v.flip }))}>พลิกซ้ายขวา</button>
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => { setView(START); setMode("crop"); }}>กลับเป็นแบบเดิม</button>
          </div>
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
        </div>
        <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 12, minWidth: 0 }}>
          <div style={{ fontWeight: 600, fontSize: 14 }}>ตัวอย่างหลังครอป</div>
          <div style={{ display: "flex", gap: 18, alignItems: "flex-end", flexWrap: "wrap" }} data-previews>
            {(() => {
              const sizes = [{ w: 72, h: 108, cap: "บนชั้นวาง" }, { w: 110, h: 165, cap: "แผงรายละเอียด" }, { w: 40, h: 60, cap: "ไอคอน Windows" }];
              // ตามรูปเดิมกับรูปแนวนอน ตัวอย่างกว้างขึ้น ย่อทั้งสามเท่ากันให้อยู่แถวเดียว (เดิมตกคนละแถว แถบคุณภาพ JPG ตกขอบล่าง เจอตอนตรวจภาพ)
              const ar = mode === "original" ? Math.min(lay.bw / lay.bh, 16 / 9) : 0;
              const k = ar >= 1 ? Math.min(1, 380 / sizes.reduce((s, x) => s + x.h * ar + 18, 0)) : 1;
              return sizes.map((s) => (
                <div key={s.cap} style={{ textAlign: "center" }}>
                  <Preview info={info} view={view} lay={lay} mode={mode} pad={pad} w={Math.round(s.w * k)} h={Math.round(s.h * k)} />
                  <div className="small" style={{ marginTop: 6 }}>{s.cap}</div>
                </div>
              ));
            })()}
          </div>
          <div className="setrow" style={{ borderTop: "1px solid #f8e3eb" }}>
            <div className="lbl">ทำให้เป็นปกแบบไหน</div>
            <Seg small label="ทำให้เป็นปกแบบไหน" value={mode} onChange={setMode} options={[{ value: "crop", label: "ตัดให้พอดี 2 : 3" }, { value: "pad", label: "เติมขอบ" }, { value: "original", label: "ตามรูปเดิม" }]} />
          </div>
          {mode === "pad" && (
            <div style={{ display: "flex", alignItems: "center", gap: 10 }} data-pads>
              <span style={{ fontSize: 14 }}>สีขอบ</span>
              {PADS.map((c) => <button key={c.c} type="button" className={"swatch" + (pad === c.c ? " on" : "")} style={{ background: c.c }} aria-label={"สีขอบ " + c.label} aria-pressed={pad === c.c} title={c.label} onClick={() => setPad(c.c)} />)}
              <span className="small">{PADS.find((c) => c.c === pad)?.label}</span>
            </div>
          )}
          <div className="setrow">
            <div className="lbl">ไฟล์รูปที่ได้ {tag && <span className="extag cv" style={{ marginLeft: 6 }}>{tag}</span>}</div>
            <Seg small label="ไฟล์รูปที่ได้" value={format} onChange={setFormat} options={[{ value: "jpg", label: "JPG" }, { value: "png", label: "PNG" }]} />
          </div>
          {format === "jpg" ? (
            <>
              <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                <span style={{ fontSize: 14, whiteSpace: "nowrap" }}>คุณภาพ JPG</span>
                <Range value={quality} min={50} max={100} step={5} label="คุณภาพ JPG" format={(v) => `${v}%`} onChange={setQuality} />
                <span className="small" style={{ whiteSpace: "nowrap", minWidth: 36, textAlign: "right" }}>{quality}%</span>
              </div>
            </>
          ) : (
            <div className="stat warn"><CardIcon kind="warn" /><div><b>PNG ไม่ลดคุณภาพ</b>
              {render && jpgBytes ? <Phr>{`ไฟล์ราว ${fmtSize(render.bytes)} ใหญ่กว่า JPG ราว ${Math.max(1, Math.round(render.bytes / jpgBytes))} เท่า`}</Phr> : null}
              <div>ไม่มีแถบปรับคุณภาพ</div></div></div>
          )}
          <div className="small" data-size>
            {render ? <>ได้รูปขนาด <span className="nw">{render.width} × {render.height} px</span> · ไฟล์ {format.toUpperCase()} ราว <span className="nw">{fmtSize(render.bytes)}</span>{busy ? " · กำลังคิดใหม่…" : ""}</> : "กำลังคิดขนาดไฟล์…"}
            <br />{tag ? <Phr>{`แนบใน MKV ตรง ๆ ไม่ได้ โปรแกรมแปลงเป็น ${format.toUpperCase()} ให้ · รูปเดิมในเครื่องไม่ถูกแก้`}</Phr> : "รูปเดิมในเครื่องไม่ถูกแก้"}
          </div>
          {render?.small && !smallOk && mode === "crop" && (
            <div data-small>
              <div className="stat warn"><CardIcon kind="warn" /><div><b>ส่วนที่ครอปเหลือแค่ <span className="nw">{render.cropW} × {render.cropH} px</span></b>
                <div>ปกจะดูเบลอบนจอใหญ่</div><Phr>ใช้ต่อได้ แต่แนะนำหารูปที่ใหญ่กว่านี้</Phr></div></div>
              <div className="minirow" style={{ marginTop: 6 }}>
                <button type="button" className="btn btn-ghost btn-sm" onClick={() => setSmallOk(true)}>ใช้ต่อ</button>
                <button type="button" className="btn btn-ghost btn-sm" onClick={p.onChangeImage}>เปลี่ยนรูป</button>
              </div>
            </div>
          )}
        </div>
      </div>
    </Dialog>
  );
}

/** ตำแหน่งภาพกับกรอบครอปในกรอบ 520 × 293 (พิกเซลบนจอ) และกรอบเป็นสัดส่วนของรูปหลังหมุน */
function layout(info: PosterInfo, v: View) {
  const sideways = v.rotate % 180 !== 0;
  const rw = sideways ? info.height : info.width, rh = sideways ? info.width : info.height;
  const s = Math.min((SW - GAP * 2) / rw, (SH - GAP * 2) / rh);
  const bw = rw * s, bh = rh * s;
  const imgL = (SW - bw) / 2, imgT = (SH - bh) / 2;
  // กรอบ 2 : 3 ใหญ่สุดในรูป (ซูม 100%)
  const w0 = Math.min(bw, (bh * 2) / 3);
  const boxW = w0 / v.z, boxH = (boxW * 3) / 2;
  const boxL = imgL + v.cx * bw - boxW / 2, boxT = imgT + v.cy * bh - boxH / 2;
  return { s, bw, bh, imgL, imgT, w0, boxW, boxH, boxL, boxT, nx: (boxL - imgL) / bw, ny: (boxT - imgT) / bh, nw: boxW / bw, nh: boxH / bh };
}

/** จุดกลางกรอบไม่ให้กรอบหลุดออกนอกรูป */
function clampCenter(cx: number, cy: number, L: ReturnType<typeof layout>) {
  const hw = L.boxW / L.bw / 2, hh = L.boxH / L.bh / 2;
  return { cx: Math.min(1 - hw, Math.max(hw, cx)), cy: Math.min(1 - hh, Math.max(hh, cy)) };
}

/** เปิดหน้าต่างอีกครั้ง คืนค่ากรอบเดิม */
function fromGeo(g: Geometry, info: PosterInfo): View {
  const base = { ...START, rotate: g.rotate, flip: g.flip };
  const L = layout(info, base);
  const z = Math.min(4, Math.max(1, L.w0 / (g.w * L.bw)));
  return { ...base, z, cx: g.x + g.w / 2, cy: g.y + g.h / 2 };
}

/** ภาพตัวอย่าง หมุนแล้วพลิก วางให้จุดกลางภาพอยู่ที่ originX originY คูณขนาดด้วย k */
function ImageLayer(p: { info: PosterInfo; view: View; k: number; originX: number; originY: number }) {
  const L = layout(p.info, p.view);
  const w = p.info.width * L.s * p.k, h = p.info.height * L.s * p.k;
  return (
    <img src={thumbUrl(p.info.preview) ?? undefined} alt="" draggable={false}
      style={{ left: p.originX - w / 2, top: p.originY - h / 2, width: w, height: h, transform: `${p.view.flip ? "scaleX(-1) " : ""}rotate(${p.view.rotate}deg)` }} />
  );
}

/** ตัวอย่างหลังครอปขนาด w × h · ตัด = ส่วนในกรอบเต็มช่อง · เติมขอบ = ทั้งรูปอยู่กลางช่อง ที่ว่างเป็นสีขอบ
    ตามรูปเดิม = สูงเท่าเดิม กว้างตามสัดส่วนรูป (ไม่เกิน 16:9) แบบเดียวกับที่ชั้นวางวาง */
function Preview(p: { info: PosterInfo; view: View; lay: ReturnType<typeof layout>; mode: "crop" | "pad" | "original"; pad: string; w: number; h: number }) {
  const L = p.lay;
  if (p.mode === "original") {
    const w = Math.round(p.h * Math.min(L.bw / L.bh, 16 / 9)), k = Math.min(w / L.bw, p.h / L.bh);
    return <div className="pv" style={{ width: w, height: p.h }}><ImageLayer info={p.info} view={p.view} k={k} originX={w / 2} originY={p.h / 2} /></div>;
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
