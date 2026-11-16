/* ตัวดูซับ (มอคอัปหัวข้อ 4 · แผนเสียงและซับ ขั้น 6) · ดูอย่างเดียว แก้ไม่ได้
   ซับตัวหนังสือ (SRT ASS VTT) สามแบบ
   ① แบบ Aegisub ภาพหนังตรงเวลานั้นพร้อมซับทับ ซ้ายบน · คลื่นเสียงช่วงนั้นพร้อมกรอบเวลาของแต่ละบรรทัด ขวาบน · ตารางบรรทัดซับล่าง
      ช่องตัวอักษรต่อวินาทีขึ้นสีเมื่อเกิน 20 (อ่านไม่ทัน) · ช่องเวลาเริ่มขึ้นสีเมื่อซ้อนกับบรรทัดก่อน · กดแถว ภาพกับคลื่นเลื่อนตาม
   ② แบบอ่านยาว เรียงบรรทัดพร้อมเวลา ค้นคำได้
   ③ แบบ notepad ไฟล์จริงทุกตัวอักษร มีเลขบรรทัด ค้นคำได้ · เวลาตามไฟล์ ยังไม่บวกดีเลย์
   ซับรูป (PGS VobSub) ถอดเป็นรูปทีละภาพ หน้าละ 6 ภาพ พื้นตารางหมากรุกคือส่วนโปร่งใส กดภาพดูเต็มจอที่ตำแหน่งจริง
   ใส่ดีเลย์ไว้ เวลาที่แสดงเลื่อนตามดีเลย์ (ยกเว้นแบบ notepad) */
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import Dialog from "./Dialog";
import { CardIcon, FixedTime, Phr, Seg, Skel, Switch } from "./ui";
import { checkApi, graphApi, subApi, type GWindow, type SubImg, type SubText } from "../lib/api";
import type { AvTrack } from "../lib/avJob";
import { ftName, isImageSub } from "../lib/ftypes";
import { IbBack, IbNext, IbPlay } from "./icons";
import { IcGraph, IbEye, IbTable, IcFile, IbPencil, IbResample } from "./icons";
import ImgConvDialog from "./ImgConvDialog";
import InfoTip from "./InfoTip";
import type { Tip } from "../lib/codecAdv";

const baseName = (p: string) => p.split(/[\\/]/).pop() ?? p;
// ปัดเป็นหน่วยเล็กสุดก่อนแยกนาทีกับวินาที ไม่งั้น 59.96 วินาทีปัดเป็น 60.0 แต่นาทีไม่ทด ขึ้นเป็น 14:60.0 (BUGS ข้อ 141 เจอในภาพของพี่กัน 16 พ.ย. 2569)
const ts = (t: number) => { const cs = Math.round(Math.max(0, t) * 100); const h = Math.floor(cs / 360000), m = Math.floor((cs % 360000) / 6000), x = (cs % 6000) / 100; return `${h}:${String(m).padStart(2, "0")}:${x.toFixed(2).padStart(5, "0")}`; };
const short = (t: number) => { const ds = Math.round(Math.max(0, t) * 10); return `${Math.floor(ds / 600)}:${((ds % 600) / 10).toFixed(1).padStart(4, "0")}`; };
const sign = (v: number) => `${v > 0 ? "+" : v < 0 ? "−" : ""}${Math.abs(v).toLocaleString("en-US")}`;
const PER = 6;
/** สีภาพความถี่ เงียบเข้ม ดังสว่าง (โทนเดียวกับหน้ากราฟเสียง) */
const RAMP = ["#160c22", "#4a1d5c", "#a8327a", "#ef6f6c", "#fde3a7"];
const LUT = (() => { const o = new Uint8ClampedArray(256 * 3); for (let i = 0; i < 256; i++) { const p = (i / 255) * (RAMP.length - 1), k = Math.min(RAMP.length - 2, Math.floor(p)), f = p - k; for (let j = 0; j < 3; j++) { const a = parseInt(RAMP[k].slice(1 + j * 2, 3 + j * 2), 16), b = parseInt(RAMP[k + 1].slice(1 + j * 2, 3 + j * 2), 16); o[i * 3 + j] = a * (1 - f) + b * f; } } return o; })();
const dec = (b64: string) => Uint8Array.from(atob(b64), (ch) => ch.charCodeAt(0));

/** ข้อความพร้อมไฮไลต์คำที่ค้น */
function Hi({ text, q }: { text: string; q: string }) {
  if (!q) return <>{text}</>;
  const out: React.ReactNode[] = [];
  const low = text.toLowerCase(), k = q.toLowerCase();
  let i = 0, at = low.indexOf(k);
  while (at >= 0) { out.push(text.slice(i, at), <mark key={at}>{text.slice(at, at + k.length)}</mark>); i = at + k.length; at = low.indexOf(k, i); }
  out.push(text.slice(i));
  return <>{out}</>;
}

/** ช่องค้นในซับ · เจอกี่ที่ ที่เท่าไหร่ ก่อนหน้า ถัดไป */
function Find(p: { q: string; setQ: (v: string) => void; n: number; at: number; go: (d: number) => void }) {
  return (
    <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
      <input className="inp" style={{ flex: 1, height: 32, fontSize: 13.5 }} value={p.q} placeholder="ค้นในซับ" aria-label="ค้นในซับ" onChange={(e) => p.setQ(e.target.value)} data-sub-q
        onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); p.go(e.shiftKey ? -1 : 1); } }} />
      <span className="small nw" data-sub-hits>{p.q ? (p.n ? `เจอ ${p.n} ที่ อยู่ที่ ${p.at + 1} จาก ${p.n}` : "ไม่เจอ") : ""}</span>
      <button type="button" className={"btn btn-sm " + (p.n ? "btn-ghost" : "btn-wait")} aria-disabled={!p.n || undefined} title={p.n ? undefined : p.q ? "ไม่เจอคำที่ค้น" : "พิมพ์คำที่จะค้นก่อน"} onClick={() => p.n && p.go(-1)}><IbBack size={15} />ก่อนหน้า</button>
      <button type="button" className={"btn btn-sm " + (p.n ? "btn-ghost" : "btn-wait")} aria-disabled={!p.n || undefined} title={p.n ? undefined : p.q ? "ไม่เจอคำที่ค้น" : "พิมพ์คำที่จะค้นก่อน"} onClick={() => p.n && p.go(1)} data-sub-next><IbNext size={15} />ถัดไป</button>
    </div>
  );
}

function TextView(p: { track: AvTrack; movie: string; refStream: number | null; refIdx: number | null; data: SubText; tab: "aeg" | "long" | "pad"; onAddMovie?: () => void }) {
  const { data, tab } = p;
  const d = p.track.delay / 1000;
  const cues = data.cues;
  const [sel, setSel] = useState(0);
  const [q, setQ] = useState("");
  const [hit, setHit] = useState(0);
  const [frame, setFrame] = useState<string | null>(null);
  const [wave, setWave] = useState<{ t0: number; t1: number; v: number[] } | null>(null);
  const [look, setLook] = useState<"wave" | "spec">("wave");
  const [spec, setSpec] = useState<{ t0: number; t1: number; w: GWindow } | null>(null);
  const [playErr, setPlayErr] = useState<string | null>(null);
  const cv = useRef<HTMLCanvasElement>(null);
  const list = useRef<HTMLDivElement>(null);
  const lines = useMemo(() => data.raw.replace(/\r\n?/g, "\n").split("\n"), [data.raw]);
  const k = q.trim().toLowerCase();
  const hits = useMemo(() => !k ? [] : tab === "pad" ? lines.flatMap((l, i) => (l.toLowerCase().includes(k) ? [i] : [])) : cues.flatMap((c, i) => (c.text.toLowerCase().includes(k) ? [i] : [])), [k, tab, lines, cues]);
  useEffect(() => setHit(0), [k, tab]);
  const go = (dir: number) => { if (!hits.length) return; const n = (hit + dir + hits.length) % hits.length; setHit(n); if (tab !== "pad") setSel(hits[n]); };
  useEffect(() => { if (hits.length && tab !== "pad") setSel(hits[Math.min(hit, hits.length - 1)]); }, [hits]); // eslint-disable-line react-hooks/exhaustive-deps
  // เลื่อนไปแถวที่เลือกหรือบรรทัดที่ค้นเจอ
  useEffect(() => {
    const target = tab === "pad" ? hits[hit] : sel;
    const el = list.current?.querySelector<HTMLElement>(`[data-i="${target}"]`);
    if (el && list.current) { const box = list.current.getBoundingClientRect(), r = el.getBoundingClientRect(); if (r.top < box.top || r.bottom > box.bottom) list.current.scrollTop += r.top - box.top - box.height / 3; }
  }, [sel, hit, tab, hits]);

  const c = cues[sel];
  // ภาพหนังกับคลื่นเสียงของบรรทัดที่เลือก (แบบ Aegisub) · รอนิดหนึ่ง กดเลื่อนเร็ว ๆ ไม่ถอดทุกแถว
  useEffect(() => {
    if (tab !== "aeg" || !c) return;
    // เปิดไฟล์ซับอย่างเดียวจากหน้าซับไตเติล ไม่มีหนังให้ดึงภาพกับคลื่น (BUGS ข้อ 104)
    if (!p.movie) { setFrame(""); return; }
    let live = true;
    const tm = setTimeout(() => {
      subApi.frame(p.movie, c.start + d + Math.min(0.3, (c.end - c.start) / 2), 360).then((f) => { if (live) setFrame(f); }, () => { if (live) setFrame(""); });
      if (p.refStream != null) {
        const t0 = Math.max(0, c.start + d - 3), t1 = c.end + d + 3;
        subApi.wave(p.movie, p.refStream, t0, t1, 600).then((v) => { if (live) setWave({ t0, t1, v }); }, () => {});
        // ภาพความถี่ใช้คำสั่งเดียวกับหน้ากราฟเสียง
        if (look === "spec" && p.refIdx != null) graphApi.window(p.movie, p.refIdx, t0, t1, 600, 128, true).then((w) => { if (live && w) setSpec({ t0, t1, w }); }, () => {});
      }
    }, 120);
    return () => { live = false; clearTimeout(tm); };
  }, [tab, sel, c, d, p.movie, p.refStream, p.refIdx, look]);

  useLayoutEffect(() => {
    const el = cv.current;
    if (!el || !wave || !c) return;
    const r = window.devicePixelRatio || 1, w = el.clientWidth, h = el.clientHeight;
    el.width = Math.round(w * r); el.height = Math.round(h * r);
    const g = el.getContext("2d")!;
    g.setTransform(r, 0, 0, r, 0, 0);
    g.fillStyle = "#ffffff"; g.fillRect(0, 0, w, h);
    const X = (t: number) => ((t - wave.t0) / (wave.t1 - wave.t0)) * w;
    // ความถี่ · ช่องที่ดังสุดของทุกช่องเสียง แกนตั้งความถี่แบบล็อก ต่ำล่าง สูงบน
    const sp = look === "spec" && spec && spec.t0 === wave.t0 ? spec.w : null;
    if (sp && sp.spec.length) {
      const chs = sp.spec.map(dec), cols = sp.cols, bins = sp.bins;
      const off = document.createElement("canvas"); off.width = cols; off.height = bins;
      const og = off.getContext("2d")!, img = og.createImageData(cols, bins);
      for (let r = 0; r < bins; r++) for (let col = 0; col < cols; col++) {
        let v = 0; for (const a of chs) v = Math.max(v, a[col * bins + (bins - 1 - r)] ?? 0);
        const o = (r * cols + col) * 4; img.data[o] = LUT[v * 3]; img.data[o + 1] = LUT[v * 3 + 1]; img.data[o + 2] = LUT[v * 3 + 2]; img.data[o + 3] = 255;
      }
      og.putImageData(img, 0, 0); g.imageSmoothingEnabled = true; g.drawImage(off, 0, 0, w, h);
    }
    cues.forEach((x, i) => {
      const a = x.start + d, b = x.end + d;
      if (b < wave.t0 || a > wave.t1) return;
      const on = i === sel;
      g.fillStyle = on ? "rgba(233,138,172,.32)" : "rgba(233,138,172,.14)"; g.fillRect(X(a), 0, X(b) - X(a), h);
      g.fillStyle = sp ? "#ffffff" : on ? "#7a2346" : "#b28a9a"; g.font = `${on ? 700 : 600} 11px Sarabun`; g.fillText(String(x.n), X(a) + 4, 13);
    });
    if (!sp) {
      const mid = h / 2;
      g.fillStyle = "rgba(74,43,56,.08)"; g.fillRect(0, mid, w, 1);
      g.fillStyle = "#d9719a";
      for (let x = 0; x < w; x++) { const v = wave.v[Math.floor((x / w) * wave.v.length)] ?? 0; const y = v * (mid - 4); g.fillRect(x, mid - y, 1, Math.max(1, y * 2)); }
    }
    g.fillStyle = sp ? "#ffffff" : "#c2547f"; g.fillRect(X(c.start + d) - 1, 0, 2, h); g.fillRect(X(c.end + d) - 1, 0, 2, h);
  }, [wave, spec, look, sel, c, cues, d]);

  if (tab === "pad") {
    return (<>
      <Find q={q} setQ={setQ} n={hits.length} at={hit} go={go} />
      <div className="np" ref={list} data-notepad-view>
        {lines.map((l, i) => <div key={i} className={"npl" + (hits[hit] === i ? " cur" : "")} data-i={i}><span className="ln">{i + 1}</span><span className="tx"><Hi text={l} q={q.trim()} /></span></div>)}
      </div>
      <div className="npst"><span>{lines.length.toLocaleString("en-US")} บรรทัด</span><span>{data.kind.toUpperCase()}</span><span>{data.charset}</span></div>
      <div className="small"><Phr>เปิดไฟล์จริงทุกตัวอักษรเหมือนเปิดใน Notepad เวลาเป็นไปตามไฟล์โดยยังไม่บวกดีเลย์ และดูได้อย่างเดียว</Phr></div>
    </>);
  }
  if (tab === "long") {
    return (<>
      <Find q={q} setQ={setQ} n={hits.length} at={hit} go={go} />
      <div className="subtext" ref={list} data-long-view>
        {cues.map((x, i) => <div key={i} className={"cue" + (i === sel && k ? " cur" : "")} data-i={i}><span className="n">{x.n}</span><span className="t">{ts(x.start + d)} → {ts(x.end + d)}</span><span style={{ whiteSpace: "pre-line" }}><Hi text={x.text} q={q.trim()} /></span></div>)}
      </div>
      <div className="small"><Phr>{`ดูได้อย่างเดียวและแก้ไม่ได้${data.kind === "ass" ? " ส่วนซับ ASS แสดงเฉพาะข้อความ ไม่แสดงสีกับตำแหน่ง" : ""}${data.charset === "TIS-620" ? " และภาษาไทยที่เข้ารหัสแบบเก่า (TIS-620) โปรแกรมแปลงให้อ่านได้แล้ว" : ""}`}</Phr></div>
    </>);
  }
  return (<>
    <div className="aegtop">
      <div className="vframe" data-vframe>
        {frame ? <img src={frame} alt={`ภาพหนังที่ ${c ? ts(c.start + d) : ""}`} /> : frame === "" ? <div className="vnone">{p.movie ? "ดึงภาพหนังไม่ได้" : <>
          <span>เปิดไฟล์ซับอย่างเดียว จึงไม่มีภาพหนัง</span>
          {/* ใส่ไฟล์วิดีโอคู่กับซับ แล้วเห็นภาพหนังกับคลื่นเสียง (BUGS ข้อ 107 พี่กันสั่ง 13 พ.ย. 2569 "ขอปุ่มเพิ่มวิดีโอมาด้วย") */}
          {p.onAddMovie && <button type="button" className="btn btn-ghost btn-sm" onClick={p.onAddMovie} data-sub-addvideo><IcFile size={15} />เพิ่มไฟล์วิดีโอ</button>}</>}</div> : <Skel w="100%" h={203} r={0} />}
        {c && <div className="vsub">{c.text}</div>}
        {c && <div className="vtime">{ts(c.start + d)}</div>}
      </div>
      <div style={{ minWidth: 0, display: "flex", flexDirection: "column", gap: 6 }}>
        {p.refStream != null ? (wave ? <canvas ref={cv} className="aud" aria-label="คลื่นเสียงช่วงของบรรทัดที่เลือก" data-aud /> : <Skel w="100%" h={150} />) : <div className="small">{p.movie ? "ไม่มีเสียงในหนังให้แสดงคลื่น" : "เปิดไฟล์ซับอย่างเดียว จึงไม่มีคลื่นเสียง"}</div>}
        {wave && <div className="ruler2" style={{ marginLeft: 0 }}>{[0, 0.25, 0.5, 0.75, 1].map((f, i) => <span key={f} style={{ left: `${f * 100}%`, transform: i === 0 ? "none" : i === 4 ? "translateX(-100%)" : undefined }}>{short(wave.t0 + f * (wave.t1 - wave.t0))}</span>)}</div>}
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
          <button type="button" className={"btn btn-sm " + (sel > 0 ? "btn-ghost" : "btn-wait")} aria-disabled={sel === 0 || undefined} onClick={() => sel > 0 && setSel(sel - 1)} data-sub-prev><IbBack size={15} />บรรทัดก่อน</button>
          <button type="button" className={"btn btn-sm " + (sel < cues.length - 1 ? "btn-ghost" : "btn-wait")} aria-disabled={sel >= cues.length - 1 || undefined} onClick={() => sel < cues.length - 1 && setSel(sel + 1)} data-sub-nextline><IbNext size={15} />บรรทัดถัดไป</button>
          {c && p.movie && <button type="button" className="btn btn-ghost btn-sm" title="เปิดหนังด้วยโปรแกรมเล่นที่ตั้งไว้ ตรงเวลาของบรรทัดนี้" onClick={() => { setPlayErr(null); checkApi.playAt(p.movie, Math.max(0, c.start + d - 1)).catch((e) => setPlayErr(String(e))); }} data-sub-play><IbPlay size={15} /><span>เปิดเล่นที่ <FixedTime t={ts(c.start + d).slice(0, 7)} /></span></button>}
          {p.refIdx != null && <span style={{ marginLeft: "auto" }}><Seg small label="แบบคลื่นเสียง" value={look} onChange={setLook} options={[{ value: "wave", label: <><IcGraph size={14} />รูปคลื่น</> }, { value: "spec", label: <><IbEye size={14} />ความถี่</> }]} /></span>}
        </div>
        {playErr && <div className="small" style={{ color: "var(--bad-ink)" }}>{playErr}</div>}
        {p.refStream != null && <div className="small"><Phr>{`กรอบสีจางคือเวลาของแต่ละบรรทัด กรอบเข้มคือบรรทัดที่เลือก และเส้นตั้งคือเวลาเริ่มกับจบ${look === "spec" ? "  ความถี่ต่ำอยู่ล่าง ความถี่สูงอยู่บน และส่วนที่สว่างคือเสียงดัง" : ""}`}</Phr></div>}
      </div>
    </div>
    <Find q={q} setQ={setQ} n={hits.length} at={hit} go={go} />
    <div className="sgrid" ref={list} data-sub-table>
      <table><thead><tr><th className="num">ลำดับ</th><th className="num">เริ่ม</th><th className="num">จบ</th><th className="num">ยาว (วินาที)</th><th className="num">ตัว/วิ</th><th>ข้อความ</th></tr></thead>
        <tbody>{cues.map((x, i) => {
          const dur = Math.max(0.01, x.end - x.start), cps = x.text.replace(/\s/g, "").length / dur, prev = cues[i - 1];
          const overlap = !!prev && x.start < prev.end, fast = cps > 20;
          return (
            <tr key={i} className={i === sel ? "on" : ""} data-i={i} onClick={() => setSel(i)}>
              <td className="num">{x.n}</td><td className={"num" + (overlap ? " bad" : "")} title={overlap ? "เวลาซ้อนกับบรรทัดก่อน" : undefined}>{ts(x.start + d)}</td><td className="num">{ts(x.end + d)}</td>
              <td className="num">{dur.toFixed(2)}</td><td className={"num" + (fast ? " bad" : "")} title={fast ? "อ่านไม่ทัน เกิน 20 ตัวอักษรต่อวินาที" : undefined}>{Math.round(cps)}</td>
              <td style={{ whiteSpace: "pre-line" }}><Hi text={x.text} q={q.trim()} /></td></tr>);
        })}</tbody></table>
    </div>
    <div className="lg"><span><i className="ln" />ตัวอักษรเกิน 20 ตัวต่อวินาที จนอ่านไม่ทัน</span><span><i className="ln" />เวลาเริ่มซ้อนกับบรรทัดก่อน</span></div>
    <div className="small"><Phr>{`ดูได้อย่างเดียวและแก้ไม่ได้  ภาพหนังที่เห็นเป็นภาพที่โปรแกรมถอดจากไฟล์ตรงเวลานั้นทีละภาพ  หน้าตาทำแบบ Aegisub แต่ไม่ได้ใช้โค้ดของ Aegisub${data.kind === "ass" ? "  ซับ ASS แสดงเฉพาะข้อความ" : ""}`}</Phr></div>
  </>);
}

// หมายเหตุของตัวดูซับรูป เดิมเป็นบรรทัดใต้แถวปุ่ม ย้ายเข้า ⓘ ให้แถวปุ่มเป็นแถวล่างสุด (BUGS ข้อ 141 พี่กันทัก 16 พ.ย. 2569 "จะเว้นที่ไว้ด้านล่าทำไม")
const SIMG_TIP: Tip = {
  w: "ซับรูปเก็บเป็นภาพทีละบรรทัด โปรแกรมถอดเป็นภาพให้ดูทีละหน้า",
  o: [
    ["พื้นตารางหมากรุก", "คือส่วนโปร่งใสของรูปซับ ซึ่งไม่บังภาพหนัง", "", ""],
    ["รายการเวลาด้านซ้าย", "กดเวลาแล้วไปหน้าที่มีภาพนั้น\nและกรอบของภาพนั้นจะขึ้นสี", "", ""],
    ["ค้นคำ", "ซับแบบรูปค้นคำไม่ได้ เพราะเก็บเป็นภาพ ไม่ใช่ตัวหนังสือ", "", ""],
  ],
};

// การ์ดภาพซับสูง 116 จุด (กรอบภาพ 74 ระยะใน 16 เวลา 18 ช่องไฟ 6 เส้นขอบ 2) ช่องห่าง 10 · ใช้คิดจำนวนแถวที่พอดีกรอบก่อนวาดการ์ดจริง
const SIMG_H = 116, SIMG_GAP = 10, SIMG_COLS = 3;

/** แถบเวลาของตัวดูซับรูป · ขีดเล็กทุกภาพตามเวลาจริง ช่วงสีคือภาพที่เห็นอยู่ หมุดคือภาพแรกที่เห็น
 *  กดหรือลากบนแถบ ปล่อยแล้วไปภาพที่ขึ้นก่อนหรือตรงเวลานั้น ระหว่างลากขึ้นเวลากับเลขภาพที่จะไป */
function SimgSeek(p: { times: SubImg[] | null; d: number; at: number; upto: number; onSeek: (x: SubImg) => void }) {
  const bar = useRef<HTMLDivElement>(null);
  const [hold, setHold] = useState<SubImg | null>(null);
  const ts = p.times ?? [];
  const last = ts[ts.length - 1];
  const span = last ? Math.max(last.end ?? last.start, last.start) + 1 : 1;
  const pct = (t: number) => `${Math.min(100, Math.max(0, (t / span) * 100))}%`;
  const pickAt = (clientX: number) => {
    const r = bar.current?.getBoundingClientRect();
    if (!r || !ts.length) return null;
    const t = ((clientX - r.left) / r.width) * span;
    let i = ts.findIndex((x) => x.start > t) - 1;
    if (i < -1) i = ts.length - 1; else if (i < 0) i = 0;
    return ts[i];
  };
  const a = ts[p.at - 1], b = ts[p.upto - 1];
  const shown = hold ?? a;
  return (
    <div className="simgseek" data-simg-seek>
      <span className="simgseek-t">{shown ? short(shown.start + p.d) : "0:00.0"}</span>
      <div ref={bar} className={"simgseek-bar" + (hold ? " hold" : "")} title="กดหรือลากเพื่อไปภาพตรงเวลานั้น"
        onPointerDown={(e) => { if (e.button !== 0 || !ts.length) return; e.currentTarget.setPointerCapture(e.pointerId); setHold(pickAt(e.clientX)); }}
        onPointerMove={(e) => { if (hold) setHold(pickAt(e.clientX)); }}
        onPointerUp={(e) => { const x = hold ? pickAt(e.clientX) : null; setHold(null); if (x) p.onSeek(x); }}
        onPointerCancel={() => setHold(null)}>
        <svg className="simgseek-ticks" viewBox="0 0 1000 10" preserveAspectRatio="none" aria-hidden>
          {ts.map((x) => { const v = (x.start / span) * 1000; return <line key={x.n} x1={v} x2={v} y1={0} y2={10} />; })}
        </svg>
        {a && b && <div className="simgseek-on" style={{ left: pct(a.start), width: `max(3px, ${pct((b.end ?? b.start) - a.start)})` }} />}
        {shown && <div className="simgseek-knob" style={{ left: pct(shown.start) }} />}
        {hold && <div className="simgseek-tip" style={{ left: pct(hold.start) }}>ภาพ {hold.n}</div>}
      </div>
      <span className="simgseek-t end">{last ? short((last.end ?? last.start) + p.d) : "0:00.0"}</span>
    </div>
  );
}

function ImageView(p: { track: AvTrack; path: string; ff: number; movie?: string; onClose?: () => void; onTotal?: (n: number) => void }) {
  const d = p.track.delay / 1000;
  // ภาพแรกของหน้า (นับจาก 0) แทนเลขหน้า เพราะจำนวนภาพต่อหน้าเปลี่ยนตามความสูงหน้าต่าง
  const [first, setFirst] = useState(0);
  // ภาพต่อหน้าเท่าที่วางได้เต็มความสูงกรอบ ไม่เหลือที่ว่างข้างล่าง (BUGS ข้อ 141 พี่กันทัก 15 พ.ย. 2569 "เว้นที่ไว้ข้างล่างทำไมเยอะเเยะ")
  const [per, setPer] = useState(PER);
  const [picH, setPicH] = useState(74);
  const [data, setData] = useState<{ first: number; per: number; total: number; items: SubImg[] } | null>(null);
  const [times, setTimes] = useState<SubImg[] | null>(null);
  const [pick, setPick] = useState<number | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [big, setBig] = useState<SubImg | null>(null);
  const fit = useRef<HTMLDivElement>(null);
  const list = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const el = fit.current;
    if (!el || big) return;
    const ro = new ResizeObserver(() => {
      const rows = Math.max(1, Math.floor((el.clientHeight + SIMG_GAP) / (SIMG_H + SIMG_GAP)));
      setPer(Math.min(48, rows * SIMG_COLS));
      // ที่เหลือใต้แถวสุดท้ายแบ่งให้กรอบภาพทุกแถวสูงขึ้น ตารางเต็มกรอบพอดี
      setPicH(Math.max(74, Math.floor((el.clientHeight - (rows - 1) * SIMG_GAP) / rows) - (SIMG_H - 74) - 2));
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [big]);
  const start = Math.floor(first / per) * per;
  useEffect(() => {
    let live = true;
    setErr(null);
    subApi.images(p.path, p.ff, start / per, per).then((r) => { if (live) setData({ ...r, first: start, per }); }, (e) => { if (live) setErr(String(e)); });
    return () => { live = false; };
  }, [p.path, p.ff, start, per]);
  // รายการเวลาทั้งไฟล์ ขอหลังหน้าแรกมาแล้ว ไม่ให้สองคำสั่งถอดไฟล์เดียวกันพร้อมกันตอนเปิดครั้งแรก
  const ready = data != null;
  useEffect(() => {
    if (!ready) return;
    let live = true;
    subApi.imageTimes(p.path, p.ff).then((r) => { if (live) setTimes(r); }, () => { if (live) setTimes([]); });
    return () => { live = false; };
  }, [ready, p.path, p.ff]);
  // รายการเวลาเลื่อนตามหน้าที่ดูอยู่ แถวแรกของหน้าอยู่ในกรอบเสมอ (เลื่อนเฉพาะกรอบรายการ ไม่ใช้ scrollIntoView ที่เลื่อนหน้าต่างด้วย)
  useEffect(() => {
    const el = list.current;
    const row = el?.querySelector<HTMLElement>(`[data-simg-at="${big?.n ?? start + 1}"]`);
    if (!el || !row) return;
    if (row.offsetTop < el.scrollTop || row.offsetTop + row.offsetHeight > el.scrollTop + el.clientHeight) el.scrollTop = row.offsetTop - 8;
  }, [start, times, big]);
  const total = data?.total ?? 0;
  // บอกจำนวนภาพรวมให้บรรทัดคำอธิบายใต้หัวหน้าต่าง (พี่กันขอ 16 พ.ย. 2569 "หาจุดเขียนจำนวนภาพรวมหน่อย")
  // ภาพจากหนังตรงเวลาของซับ เป็นพื้นหลังของภาพเต็ม ดึงจากไฟล์หนังทีละภาพแล้วจำไว้ ดึงไม่ได้ขึ้นพื้นตารางหมากรุกตามเดิม
  // (BUGS ข้อ 142 พี่กันขอ 16 พ.ย. 2569 "รอระบบ ที่ดึงเฟรมภาพจาดหลังมาได้")
  const frames = useRef(new Map<number, string>());
  const [bg, setBg] = useState<{ n: number; src: string } | null>(null);
  // ปุ่มเปิดปิดภาพจากหนัง จำไว้ในเครื่อง (BUGS ข้อ 142 พี่กันขอ 16 พ.ย. 2569 "ขอปุ่มปิดภาพได้")
  const [frameOn, setFrameOn] = useState(() => { try { return localStorage.getItem("sv-frame") !== "0"; } catch { return true; } });
  const toggleFrame = () => setFrameOn((v) => { try { localStorage.setItem("sv-frame", v ? "0" : "1"); } catch { /* ไม่มีที่เก็บก็ใช้ค่าในหน้า */ } return !v; });
  const movie = p.movie;
  useEffect(() => {
    if (!big || !movie || !frameOn) return;
    const n = big.n;
    const got = frames.current.get(n);
    if (got) { setBg({ n, src: got }); return; }
    let live = true;
    // กลางช่วงที่ซับขึ้น ไม่เกินครึ่งวินาทีจากเวลาเริ่ม (ซับบางภาพไม่มีเวลาจบ)
    const at = big.start + d + Math.min(0.5, big.end != null ? (big.end - big.start) / 2 : 0.2);
    subApi.frame(movie, at, 720).then((src) => { frames.current.set(n, src); if (live) setBg({ n, src }); }, () => {});
    return () => { live = false; };
  }, [big, movie, d, frameOn]);
  const onTotal = p.onTotal;
  useEffect(() => { if (data) onTotal?.(data.total); }, [data, onTotal]);
  // ดึงภาพเดียวตามเลขภาพ (หน้าละ 1 ภาพ) ภาพเดิมค้างไว้จนภาพใหม่มา ไม่กระพริบ · กดรัวได้ ใช้ผลของครั้งล่าสุด
  const want = useRef(0);
  const showBig = async (n: number) => {
    want.current = n;
    try {
      const r = await subApi.images(p.path, p.ff, n - 1, 1);
      if (want.current === n && r.items[0]) setBig(r.items[0]);
    } catch (e) { if (want.current === n) setErr(String(e)); }
  };
  // ไปภาพหรือหน้าถัดไป dir = 1 หรือ -1 · ดูภาพเต็มเปลี่ยนทีละภาพ ดูทีละหน้าเปลี่ยนทีละหน้า
  const step = (dir: number) => {
    if (big) { const n = big.n + dir; if (n >= 1 && n <= total) void showBig(n); return; }
    const f = start + dir * per;
    if (f >= 0 && f < total) { setFirst(f); setPick(null); }
  };
  // ลูกศรซ้ายขวาบนแป้นใช้ได้ทั้งตอนดูทีละหน้าและตอนดูภาพเต็ม (BUGS ข้อ 141 พี่กันขอ 16 พ.ย. 2569 "ให้สามารุใช้ปุ่มลูกศรกดได้")
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null;
      if (el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.isContentEditable)) return;
      if (document.querySelector(".infotip") || document.querySelectorAll(".dlg").length > 1) return;
      if (e.key === "ArrowLeft") { e.preventDefault(); step(-1); }
      if (e.key === "ArrowRight") { e.preventDefault(); step(1); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [big, total, start, per]);
  // ล้อเมาส์บนตารางหรือภาพเต็ม หมุนลงไปถัดไป หมุนขึ้นย้อนกลับ ครั้งละหนึ่งก้าว เว้นช่วง 250 ms กันหมุนทีเดียวข้ามหลายหน้า (พี่กันขอ 16 พ.ย. 2569 "สฎคลเมาส์ต้องเลื่อนลงได้")
  const wheelAt = useRef(0);
  const onWheel = (e: React.WheelEvent) => {
    if (Math.abs(e.deltaY) < 4) return;
    const now = performance.now();
    if (now - wheelAt.current < 250) return;
    wheelAt.current = now;
    step(e.deltaY > 0 ? 1 : -1);
  };
  const pages = Math.max(1, Math.ceil(total / per));
  const page = start / per;

  const skel = (n: number) => <div className="subimgs">{Array.from({ length: Math.max(1, n) }, (_, i) => <div key={i} className="simg"><Skel w="100%" h={picH} /><Skel w="60%" h={12} /></div>)}</div>;
  // ปุ่มปิดต่อท้ายแถวปุ่มเปลี่ยนหน้า ไม่มีแถบปุ่มท้ายหน้าต่างอีกชั้น (BUGS ข้อ 141 พี่กันสั่ง 16 พ.ย. 2569 "เอามาส่ตรนี้สิ จะเพิ่มอีกชั้นมาทำไม")
  const close = p.onClose && <><span className="sv-sep" aria-hidden /><button type="button" className="btn btn-ghost btn-sm sv-close" onClick={p.onClose} data-sv-close>ปิด</button></>;
  if (err) return (<>
    <div className="stat bad"><CardIcon kind="bad" /><div><b>ถอดซับรูปไม่ได้</b><Phr>{err}</Phr></div></div>
    {close && <div className="simgbar" style={{ marginTop: "auto", justifyContent: "flex-end" }}>{close}</div>}
  </>);
  // ตอนดูภาพเต็ม กดเวลาในรายการแล้วเปลี่ยนภาพเต็มเป็นภาพนั้นเลย ตอนดูทีละหน้าไปหน้าที่มีภาพนั้น
  const go = (x: SubImg) => { if (big) void showBig(x.n); else { setFirst(x.n - 1); setPick(x.n); } };
  // กลับไปดูทีละหน้า ไปหน้าที่มีภาพที่เพิ่งดูเต็ม และกรอบภาพนั้นขึ้นสี
  const back = () => { if (big) { setFirst(big.n - 1); setPick(big.n); } setBig(null); };
  return (
    <div className="simgwrap">
    {/* แถบเวลาแบบแถบเลื่อนวิดีโอ บอกว่าดูอยู่ที่เวลาเท่าไหร่ กดหรือลากไปภาพตรงเวลานั้น (BUGS ข้อ 141 พี่กันขอ 16 พ.ย. 2569 "ใส่บาร์ข้างบนตรงนี้ เพื่อบ่งบอกว่าตอนนี้เวลาเท่าไหร่") */}
    <SimgSeek times={times} d={d} at={big ? big.n : start + 1} upto={big ? big.n : Math.min(total, start + per)} onSeek={(x) => go(x)} />
    <div className="simgview" data-simgview>
      {/* เวลาของทุกภาพ กดแล้วไปหน้าที่มีภาพนั้น (พี่กันขอ 15 พ.ย. 2569 "ขอฝั่งซ้าย มีเวลาให้กดได้") */}
      <div className="simglist" ref={list} data-simg-list>
        {times == null ? Array.from({ length: 12 }, (_, i) => <div key={i} className="simglist-row"><Skel w="90%" h={12} /></div>)
          : times.map((x) => {
            const on = big ? big.n === x.n : x.n > start && x.n <= start + per;
            return (
              <button type="button" key={x.n} className={"simglist-row" + (on ? " on" : "") + (pick === x.n ? " pick" : "")} onClick={() => go(x)} data-simg-at={x.n}>
                <span>ภาพ {x.n}</span><span>{short(x.start + d)}</span>
              </button>);
          })}
      </div>
      <div className="simgmain">
        {big ? (<>
          {/* ภาพเต็มพอดีกรอบทั้งกว้างและสูง ไม่ต้องเลื่อนหน้าต่าง (พี่กันขอ 15 พ.ย. 2569 "ขอแบบไม่ต้องสโควเลื่อนได้ไหม") */}
          <div className="simgfit big" onWheel={onWheel}>
            <div className={"bigsub" + (frameOn && bg?.n === big.n ? " withframe" : "")} style={{ aspectRatio: `${big.canvas[0]} / ${big.canvas[1]}`, width: `min(100cqw, calc(100cqh * ${big.canvas[0]} / ${big.canvas[1]}))` }} data-bigsub>
              {frameOn && bg?.n === big.n && <img className="bigsub-frame" src={bg.src} alt="" data-bigsub-frame />}
              <img src={big.png} alt={`ซับภาพ ${big.n}`} style={{ left: `${(big.at[0] / big.canvas[0]) * 100}%`, top: `${(big.at[1] / big.canvas[1]) * 100}%`, width: `${(big.w / big.canvas[0]) * 100}%` }} />
            </div>
          </div>
          <div className="simgbar">
            <span className="small">{`ภาพที่ ${big.n} เวลา ${short(big.start + d)}${big.end != null ? `–${short(big.end + d)}` : ""} บนจอ ${big.canvas[0]} × ${big.canvas[1]}`}</span>
            <div style={{ display: "flex", gap: 6, flex: "none" }}>
              {/* สวิตช์ภาพหนัง ตัวเลื่อนบอกว่าเปิดหรือปิดอยู่ (พี่กันทัก 16 พ.ย. 2569 "กดเปิดกดปิดก็มีอะไรบอกหน่อยสิ") · ยังไม่มีวิดีโอ กดไม่ได้พร้อมเหตุผล */}
              <label className={"sv-frame" + (movie ? "" : " off")} title={!movie ? "เพิ่มไฟล์วิดีโอก่อน จึงจะมีภาพจากหนัง" : frameOn ? "ปิดเพื่อซ่อนภาพจากหนัง เหลือพื้นตารางหมากรุก" : "เปิดเพื่อแสดงภาพจากหนังข้างหลังซับ"} data-bigsub-frame-toggle>
                <Switch on={!!movie && frameOn} onChange={() => { if (movie) toggleFrame(); }} label="ภาพจากหนังข้างหลังซับ" />
                <span>ภาพหนัง</span>
              </label>
              <button type="button" className="btn btn-ghost btn-sm" onClick={back} data-bigsub-back><IbTable size={15} />กลับไปดูทีละหน้า</button>
              {/* เส้นตั้งแบ่งกลุ่มปุ่มที่ทำงานต่างกัน */}
              <span className="sv-sep" aria-hidden />
              {/* ภาพก่อนและภาพถัดไปตอนดูภาพเต็ม กดลูกศรซ้ายขวาบนแป้นได้ด้วย (BUGS ข้อ 141 พี่กันขอ 16 พ.ย. 2569 "ขอปุ่มกดไปข้างหน้า เเละย้อนกลับด้วย") */}
              <button type="button" className={"btn btn-sm " + (big.n > 1 ? "btn-ghost" : "btn-wait")} aria-disabled={big.n <= 1 || undefined} title={big.n <= 1 ? "นี่คือภาพแรกแล้ว" : "ภาพก่อน (ลูกศรซ้าย)"} onClick={() => step(-1)} data-bigsub-prev><IbBack size={15} />ภาพก่อน</button>
              <button type="button" className={"btn btn-sm " + (big.n < total ? "btn-ghost" : "btn-wait")} aria-disabled={big.n >= total || undefined} title={big.n >= total ? "นี่คือภาพสุดท้ายแล้ว" : "ภาพถัดไป (ลูกศรขวา)"} onClick={() => step(1)} data-bigsub-next><IbNext size={15} />ภาพถัดไป</button>
              {close}
            </div></div>
        </>) : (<>
          <div className="simgfit" ref={fit} onWheel={onWheel} style={{ "--simg-pic": `${picH}px` } as React.CSSProperties}>
            {!data ? skel(per) : total === 0 ? <div className="small">ไม่มีภาพในซับนี้</div> : data.first !== start || data.per !== per ? (
              // ภาพของหน้าใหม่ยังไม่มา ขึ้นโครงจาง ไม่โชว์ภาพของหน้าเก่าค้าง (เดิมป้ายเปลี่ยนก่อนภาพ กดภาพแล้วได้ภาพของหน้าเก่า ตัวตรวจ check-av เจอ)
              skel(Math.min(per, total - start))
            ) : (
              <div className="subimgs" data-subimgs>{data.items.map((x) => (
                <button type="button" key={x.n} className={"simg" + (pick === x.n ? " pick" : "")} onClick={() => setBig(x)} aria-label={`ดูภาพ ${x.n} เต็มจอ`} data-simg>
                  <div className="pic"><img src={x.png} alt={`ซับภาพ ${x.n}`} /></div>
                  <div className="t"><span>ภาพ {x.n}</span><span>{short(x.start + d)}</span></div>
                </button>))}</div>)}
          </div>
          <div className="simgbar">
            <span className="small" data-simg-count>{!data ? <Phr>กำลังถอดซับรูปเป็นภาพ ครั้งแรกต้องอ่านทั้งไฟล์ หนังยาวจึงใช้เวลาสักครู่ แต่ครั้งต่อไปจะเปิดได้ทันที</Phr>
              : total ? <>{`ภาพที่ ${start + 1}–${Math.min(total, start + per)} จาก ${total.toLocaleString("en-US")} ภาพ กดภาพเพื่อดูเต็ม`} <InfoTip title="ดูซับรูป" tip={SIMG_TIP} /></> : ""}</span>
            <div style={{ display: "flex", gap: 6, flex: "none" }}>
              <button type="button" className={"btn btn-sm " + (page > 0 ? "btn-ghost" : "btn-wait")} aria-disabled={page === 0 || undefined} onClick={() => step(-1)}><IbBack size={15} />หน้าก่อน</button>
              <button type="button" className={"btn btn-sm " + (page < pages - 1 ? "btn-ghost" : "btn-wait")} aria-disabled={page >= pages - 1 || undefined} onClick={() => step(1)} data-simg-next><IbNext size={15} />หน้าถัดไป</button>
              {close}
            </div>
          </div>
        </>)}
      </div>
    </div>
    </div>
  );
}

/** กรอบตัวดูซับในหน้าซับไตเติล · ซับรูปสูงพอดีที่เหลือของหน้าต่าง รายการเวลากับตารางภาพอยู่ในจอ หน้าไม่เลื่อน
 *  (BUGS ข้อ 142 พี่กันขอ 16 พ.ย. 2569 "หน้านี้ ขอเหมือนกันสิ" · "ไม่เอาเลื่อนลงไปแบบนี้") */
function InlineCard(p: { image: boolean; children: React.ReactNode }) {
  const el = useRef<HTMLElement>(null);
  const [h, setH] = useState<number | null>(null);
  useLayoutEffect(() => {
    if (!p.image) { setH(null); return; }
    const fit = () => {
      const box = el.current;
      if (!box) return;
      // ขอบบนของกรอบนับจากต้นหน้า (ไม่ขึ้นกับตำแหน่งที่เลื่อนอยู่) เว้นขอบล่าง 16 ไม่ต่ำกว่า 420
      const wrap = box.closest(".pagewrap");
      const top = box.getBoundingClientRect().top + (wrap?.scrollTop ?? 0);
      setH(Math.max(420, Math.floor(window.innerHeight - top - 16)));
    };
    fit();
    window.addEventListener("resize", fit);
    const ro = new ResizeObserver(fit);
    if (el.current?.parentElement) ro.observe(el.current.parentElement);
    return () => { window.removeEventListener("resize", fit); ro.disconnect(); };
  }, [p.image]);
  return <section ref={el} className={"card subviewer-inline" + (p.image ? " fitimg" : "")} style={h ? { height: h } : undefined} data-subviewer-inline>{p.children}</section>;
}

export default function SubViewer(p: { track: AvTrack; movie: string; refStream: number | null; refIdx: number | null; onClose: () => void; onAddMovie?: () => void; inline?: boolean;
  /** หน้าซับไตเติลคุมแบบการดูเอง ปุ่มเลือกแบบอยู่แถวบนของหน้า (BUGS ข้อ 109 พี่กัน "เอาปุ่มเลือกรูปแบบไปไว้ตรงปุ่มเพิ่มวิดีโอ") */
  tab?: "aeg" | "long" | "pad" }) {
  const t = p.track;
  const ft = ftName("subtitle", t.codec, t.profile);
  const image = isImageSub(t.codec, t.profile);
  const ff = t.ff ?? t.tid;
  const [tabS, setTab] = useState<"aeg" | "long" | "pad">("aeg");
  const tab = p.tab ?? tabS;
  const [data, setData] = useState<SubText | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [conv, setConv] = useState(false);
  const [imgTotal, setImgTotal] = useState<number | null>(null);
  useEffect(() => {
    if (image) return;
    subApi.text(t.inMovie ? p.movie : t.src, t.inMovie, t.tid, ff).then(setData, (e) => setErr(String(e)));
  }, [image, t.inMovie, t.src, t.tid, ff, p.movie]);
  const name = t.inMovie ? `${t.name || "ซับในหนัง"} (${ft})` : baseName(t.src);
  // เขียนเป็นประโยค (เดิมเป็นวลีคั่นจุลภาค "ดีเลย์ +500 ms เวลาที่แสดงเลื่อนแล้ว" อ่านกำกวม เจอตอนอ่านภาพ 11 พ.ย. 2569)
  const sub = `${t.inMovie ? "ซับที่อยู่ในไฟล์หนัง" : "ซับที่เพิ่มเข้ามา"}เป็น${image ? "ซับรูปภาพ" : "ซับตัวหนังสือ"}แบบ ${ft}${data ? ` มี ${data.cues.length.toLocaleString("en-US")} บรรทัด` : image && imgTotal != null ? ` มี ${imgTotal.toLocaleString("en-US")} ภาพ` : ""}${t.delay ? `  ตั้งดีเลย์ ${sign(t.delay)} ms ไว้ เวลาที่แสดงจึงเลื่อนตามดีเลย์แล้ว` : ""}`;
  const head = <span style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
    <span style={{ minWidth: 0, overflowWrap: "anywhere" }}>ซับ {name}</span>
    <span style={{ display: "flex", gap: 8, alignItems: "center", marginLeft: "auto" }}>
      {!image && <Seg small label="แบบการดู" value={tab} onChange={setTab} options={[{ value: "aeg", label: <><IbTable size={14} />แบบ Aegisub</> }, { value: "long", label: <><IcFile size={14} />แบบอ่านยาว</> }, { value: "pad", label: <><IbPencil size={14} />แบบ notepad</> }]} />}
    </span></span>;
  const body = (
    <div style={{ display: "flex", flexDirection: "column", gap: 10, ...(image ? { flex: 1, minHeight: 0 } : {}) }} data-subviewer data-mode={image ? "image" : tab}>
      {image ? <div className="sv-imghead" style={{ marginTop: p.inline ? 0 : -6 }}>
        <div className="small"><Phr>{sub}</Phr></div>
        {/* แปลงซับภาพเป็นซับภาพชนิดอื่น (BUGS ข้อ 125 · ImgConvDialog.tsx) */}
        <button type="button" className="btn btn-ghost btn-sm" onClick={() => setConv(true)} title="แปลงเป็น PGS VobSub หรือ BDN XML และย่อขยายภาพ เปลี่ยนอัตราเฟรม หรือเลื่อนเวลาได้" data-imgconv-open><IbResample size={14} />แปลงซับภาพ</button>
      </div> : <div className="small" style={{ marginTop: p.inline ? 0 : -6 }}><Phr>{sub}</Phr></div>}
      {image && conv && createPortal(<ImgConvDialog open onClose={() => setConv(false)} track={t} movie={p.movie} />, document.body)}
      {image ? <ImageView track={t} path={t.inMovie ? p.movie : t.src} ff={ff} movie={p.movie || undefined} onClose={p.inline ? undefined : p.onClose} onTotal={setImgTotal} />
        : err ? <div className="stat bad"><CardIcon kind="bad" /><div><b>อ่านซับไม่ได้</b><Phr>{err}</Phr></div></div>
        : !data ? <><Skel w="100%" h={203} /><Skel w="100%" h={220} /></>
        : <TextView track={t} movie={p.movie} refStream={p.refStream} refIdx={p.refIdx} data={data} tab={tab} onAddMovie={p.onAddMovie} />}
    </div>
  );
  // หน้าซับไตเติลแสดงในหน้าเลย ไม่เด้งหน้าต่างซ้อน (BUGS ข้อ 104 พี่กันทัก 13 พ.ย. 2569 "ตัวซับจะเปิดได้ที่หน้านี้เลย")
  // ไม่มีหัวข้อซ้ำ ชื่อไฟล์อยู่แถวบนของหน้า แถบแทร็กบอกว่าดูซับไหน ปุ่มเลือกแบบการดูอยู่แถวบน ไม่มีขอบในด้านบน ตัวดูซับชิดแถวบน (พี่กัน "ระยะห่างเยอะไป")
  if (p.inline) return <InlineCard image={image}>{body}</InlineCard>;
  return (
    // สูงคงที่ทุกแบบ สลับแบบ Aegisub อ่านยาว notepad หรือซับรูปแล้วหน้าต่างไม่ยืดหด เนื้อที่ยาวกว่าเลื่อนในหน้าต่าง (BUGS ข้อ 100 พี่กันสั่ง 13 พ.ย. 2569 "หน้าจอซับทั้งสามแบบ ให้ popup ขนาดเท่ากันตลอด")
    // ซับรูปสูงเต็มจอ ภาพต่อหน้าเพิ่มตามความสูง (พี่กันบอก 15 พ.ย. 2569 "ให้มันยาวกว่านี้ได้นะ หน้านี้") · ซับตัวหนังสือสามแบบยังสูงเท่ากันตามข้อ 100
    <Dialog open onClose={p.onClose} width={image ? 1120 : 980} height={image ? "calc(100vh - 48px)" : "min(720px, 88vh)"} title={head}
      // ซับตัวหนังสือปิดที่แถบล่าง ซับรูปปิดที่แถวปุ่มเปลี่ยนหน้าในตัวดูซับรูป
      actions={image ? undefined : <button type="button" className="btn btn-ghost btn-sm" onClick={p.onClose} data-sv-close>ปิด</button>}>
      {body}
    </Dialog>
  );
}
