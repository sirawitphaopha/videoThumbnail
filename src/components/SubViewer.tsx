/* ตัวดูซับ (มอคอัปหัวข้อ 4 · แผนเสียงและซับ ขั้น 6) · ดูอย่างเดียว แก้ไม่ได้
   ซับตัวหนังสือ (SRT ASS VTT) สามแบบ
   ① แบบ Aegisub ภาพหนังตรงเวลานั้นพร้อมซับทับ ซ้ายบน · คลื่นเสียงช่วงนั้นพร้อมกรอบเวลาของแต่ละบรรทัด ขวาบน · ตารางบรรทัดซับล่าง
      ช่องตัวอักษรต่อวินาทีขึ้นสีเมื่อเกิน 20 (อ่านไม่ทัน) · ช่องเวลาเริ่มขึ้นสีเมื่อซ้อนกับบรรทัดก่อน · กดแถว ภาพกับคลื่นเลื่อนตาม
   ② แบบอ่านยาว เรียงบรรทัดพร้อมเวลา ค้นคำได้
   ③ แบบ notepad ไฟล์จริงทุกตัวอักษร มีเลขบรรทัด ค้นคำได้ · เวลาตามไฟล์ ยังไม่บวกดีเลย์
   ซับรูป (PGS VobSub) ถอดเป็นรูปทีละภาพ หน้าละ 6 ภาพ พื้นตารางหมากรุกคือส่วนโปร่งใส กดภาพดูเต็มจอที่ตำแหน่งจริง
   ใส่ดีเลย์ไว้ เวลาที่แสดงเลื่อนตามดีเลย์ (ยกเว้นแบบ notepad) */
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import Dialog from "./Dialog";
import { CardIcon, Phr, Seg, Skel } from "./ui";
import { checkApi, graphApi, subApi, type GWindow, type SubImg, type SubText } from "../lib/api";
import type { AvTrack } from "../lib/avJob";
import { ftName } from "../lib/ftypes";
import { IbBack, IbNext, IbPlay } from "./icons";
import { IcGraph, IbEye, IbTable, IcFile, IbPencil } from "./icons";

const baseName = (p: string) => p.split(/[\\/]/).pop() ?? p;
const ts = (t: number) => { const s = Math.max(0, t); const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), x = s % 60; return `${h}:${String(m).padStart(2, "0")}:${x.toFixed(2).padStart(5, "0")}`; };
const short = (t: number) => { const s = Math.max(0, t); return `${Math.floor(s / 60)}:${(s % 60).toFixed(1).padStart(4, "0")}`; };
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
      <span className="small nw" data-sub-hits>{p.q ? (p.n ? `เจอ ${p.n} ที่ · ที่ ${p.at + 1} จาก ${p.n}` : "ไม่เจอ") : ""}</span>
      <button type="button" className={"btn btn-sm " + (p.n ? "btn-ghost" : "btn-wait")} aria-disabled={!p.n || undefined} title={p.n ? undefined : p.q ? "ไม่เจอคำที่ค้น" : "พิมพ์คำที่จะค้นก่อน"} onClick={() => p.n && p.go(-1)}><IbBack size={15} />ก่อนหน้า</button>
      <button type="button" className={"btn btn-sm " + (p.n ? "btn-ghost" : "btn-wait")} aria-disabled={!p.n || undefined} title={p.n ? undefined : p.q ? "ไม่เจอคำที่ค้น" : "พิมพ์คำที่จะค้นก่อน"} onClick={() => p.n && p.go(1)} data-sub-next><IbNext size={15} />ถัดไป</button>
    </div>
  );
}

function TextView(p: { track: AvTrack; movie: string; refStream: number | null; refIdx: number | null; data: SubText; tab: "aeg" | "long" | "pad" }) {
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
      <div className="small"><Phr>เปิดไฟล์จริงทุกตัวอักษร เหมือนเปิดใน notepad · เวลาตามไฟล์ ยังไม่บวกดีเลย์ · ดูอย่างเดียว</Phr></div>
    </>);
  }
  if (tab === "long") {
    return (<>
      <Find q={q} setQ={setQ} n={hits.length} at={hit} go={go} />
      <div className="subtext" ref={list} data-long-view>
        {cues.map((x, i) => <div key={i} className={"cue" + (i === sel && k ? " cur" : "")} data-i={i}><span className="n">{x.n}</span><span className="t">{ts(x.start + d)} → {ts(x.end + d)}</span><span style={{ whiteSpace: "pre-line" }}><Hi text={x.text} q={q.trim()} /></span></div>)}
      </div>
      <div className="small"><Phr>{`ดูอย่างเดียว แก้ไม่ได้${data.kind === "ass" ? " · ซับ ASS แสดงเฉพาะข้อความ ไม่แสดงสีกับตำแหน่ง" : ""}${data.charset === "TIS-620" ? " · ภาษาไทยที่เข้ารหัสแบบเก่า (TIS-620) โปรแกรมแปลงให้อ่านได้" : ""}`}</Phr></div>
    </>);
  }
  return (<>
    <div className="aegtop">
      <div className="vframe" data-vframe>
        {frame ? <img src={frame} alt={`ภาพหนังที่ ${c ? ts(c.start + d) : ""}`} /> : frame === "" ? <div className="vnone">ดึงภาพหนังไม่ได้</div> : <Skel w="100%" h={203} r={0} />}
        {c && <div className="vsub">{c.text}</div>}
        {c && <div className="vtime">{ts(c.start + d)}</div>}
      </div>
      <div style={{ minWidth: 0, display: "flex", flexDirection: "column", gap: 6 }}>
        {p.refStream != null ? (wave ? <canvas ref={cv} className="aud" aria-label="คลื่นเสียงช่วงของบรรทัดที่เลือก" data-aud /> : <Skel w="100%" h={150} />) : <div className="small">ไม่มีเสียงในหนังให้แสดงคลื่น</div>}
        {wave && <div className="ruler2" style={{ marginLeft: 0 }}>{[0, 0.25, 0.5, 0.75, 1].map((f, i) => <span key={f} style={{ left: `${f * 100}%`, transform: i === 0 ? "none" : i === 4 ? "translateX(-100%)" : undefined }}>{short(wave.t0 + f * (wave.t1 - wave.t0))}</span>)}</div>}
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
          <button type="button" className={"btn btn-sm " + (sel > 0 ? "btn-ghost" : "btn-wait")} aria-disabled={sel === 0 || undefined} onClick={() => sel > 0 && setSel(sel - 1)} data-sub-prev><IbBack size={15} />บรรทัดก่อน</button>
          <button type="button" className={"btn btn-sm " + (sel < cues.length - 1 ? "btn-ghost" : "btn-wait")} aria-disabled={sel >= cues.length - 1 || undefined} onClick={() => sel < cues.length - 1 && setSel(sel + 1)} data-sub-nextline><IbNext size={15} />บรรทัดถัดไป</button>
          {c && <button type="button" className="btn btn-ghost btn-sm" title="เปิดหนังด้วยโปรแกรมเล่นที่ตั้งไว้ ตรงเวลาของบรรทัดนี้" onClick={() => { setPlayErr(null); checkApi.playAt(p.movie, Math.max(0, c.start + d - 1)).catch((e) => setPlayErr(String(e))); }} data-sub-play><IbPlay size={15} />เปิดเล่นที่ {ts(c.start + d).slice(0, 7)}</button>}
          {p.refIdx != null && <span style={{ marginLeft: "auto" }}><Seg small label="แบบคลื่นเสียง" value={look} onChange={setLook} options={[{ value: "wave", label: <><IcGraph size={14} />รูปคลื่น</> }, { value: "spec", label: <><IbEye size={14} />ความถี่</> }]} /></span>}
        </div>
        {playErr && <div className="small" style={{ color: "var(--bad-ink)" }}>{playErr}</div>}
        <div className="small"><Phr>{`กรอบชมพูคือเวลาของแต่ละบรรทัด กรอบเข้มคือบรรทัดที่เลือก · เส้นตั้งคือเวลาเริ่มกับจบ${look === "spec" ? " · ความถี่ต่ำอยู่ล่าง สูงอยู่บน สว่างคือดัง" : ""}`}</Phr></div>
      </div>
    </div>
    <Find q={q} setQ={setQ} n={hits.length} at={hit} go={go} />
    <div className="sgrid" ref={list} data-sub-table>
      <table><thead><tr><th className="num">#</th><th className="num">เริ่ม</th><th className="num">จบ</th><th className="num">ยาว (วิ)</th><th className="num">ตัว/วิ</th><th>ข้อความ</th></tr></thead>
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
    <div className="lg"><span><i className="ln" />ตัวอักษรต่อวินาทีเกิน 20 อ่านไม่ทัน</span><span><i className="ln" />เวลาเริ่มซ้อนกับบรรทัดก่อน</span></div>
    <div className="small"><Phr>{`ดูอย่างเดียว แก้ไม่ได้ · ภาพหนังโปรแกรมถอดจากไฟล์ตรงเวลานั้นทีละภาพ · หน้าตาแบบ Aegisub ไม่ได้ใช้โค้ดของ Aegisub${data.kind === "ass" ? " · ซับ ASS แสดงเฉพาะข้อความ" : ""}`}</Phr></div>
  </>);
}

function ImageView(p: { track: AvTrack; path: string; ff: number }) {
  const d = p.track.delay / 1000;
  const [page, setPage] = useState(0);
  const [data, setData] = useState<{ page: number; total: number; items: SubImg[] } | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [big, setBig] = useState<SubImg | null>(null);
  useEffect(() => {
    let live = true;
    setErr(null);
    subApi.images(p.path, p.ff, page, PER).then((r) => { if (live) setData({ ...r, page }); }, (e) => { if (live) setErr(String(e)); });
    return () => { live = false; };
  }, [p.path, p.ff, page]);
  const pages = data ? Math.max(1, Math.ceil(data.total / PER)) : 1;
  if (err) return <div className="stat bad"><CardIcon kind="bad" /><div><b>ถอดซับรูปไม่ได้</b><Phr>{err}</Phr></div></div>;
  if (!data) return (<>
    <div className="subimgs">{Array.from({ length: PER }, (_, i) => <div key={i} className="simg"><Skel w="100%" h={66} /><Skel w="60%" h={12} /></div>)}</div>
    <div className="small"><Phr>กำลังถอดซับรูปเป็นภาพ · ครั้งแรกต้องอ่านทั้งไฟล์ หนังยาวใช้เวลาสักครู่ · ครั้งต่อไปเปิดทันที</Phr></div>
  </>);
  if (big) return (<>
    <div className="bigsub" style={{ aspectRatio: `${big.canvas[0]} / ${big.canvas[1]}` }} data-bigsub>
      <img src={big.png} alt={`ซับภาพ ${big.n}`} style={{ left: `${(big.at[0] / big.canvas[0]) * 100}%`, top: `${(big.at[1] / big.canvas[1]) * 100}%`, width: `${(big.w / big.canvas[0]) * 100}%` }} />
    </div>
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
      <span className="small">{`ภาพ ${big.n} · ${short(big.start + d)}${big.end != null ? ` ถึง ${short(big.end + d)}` : ""} · วางตรงตำแหน่งจริงบนจอ ${big.canvas[0]} × ${big.canvas[1]}`}</span>
      <button type="button" className="btn btn-ghost btn-sm" onClick={() => setBig(null)} data-bigsub-back><IbBack size={15} />กลับไปดูทีละหน้า</button></div>
  </>);
  return (<>
    {data.total === 0 ? <div className="small">ไม่มีภาพในซับนี้</div> : data.page !== page ? (
      // ภาพของหน้าใหม่ยังไม่มา ขึ้นโครงจาง ไม่โชว์ภาพของหน้าเก่าค้าง (เดิมป้ายเปลี่ยนก่อนภาพ กดภาพแล้วได้ภาพของหน้าเก่า ตัวตรวจ check-av เจอ)
      <div className="subimgs">{Array.from({ length: PER }, (_, i) => <div key={i} className="simg"><Skel w="100%" h={74} /><Skel w="60%" h={12} /></div>)}</div>
    ) : (
      <div className="subimgs" data-subimgs>{data.items.map((x) => (
        <button type="button" key={x.n} className="simg" onClick={() => setBig(x)} aria-label={`ดูภาพ ${x.n} เต็มจอ`} data-simg>
          <div className="pic"><img src={x.png} alt={`ซับภาพ ${x.n}`} /></div>
          <div className="t"><span>ภาพ {x.n}</span><span>{short(x.start + d)}</span></div>
        </button>))}</div>)}
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
      <span className="small" data-simg-count>{data.total ? `ภาพที่ ${page * PER + 1}–${Math.min(data.total, (page + 1) * PER)} จาก ${data.total.toLocaleString("en-US")} · กดภาพเพื่อดูเต็ม` : ""}</span>
      <div style={{ display: "flex", gap: 6 }}>
        <button type="button" className={"btn btn-sm " + (page > 0 ? "btn-ghost" : "btn-wait")} aria-disabled={page === 0 || undefined} onClick={() => page > 0 && setPage(page - 1)}><IbBack size={15} />หน้าก่อน</button>
        <button type="button" className={"btn btn-sm " + (page < pages - 1 ? "btn-ghost" : "btn-wait")} aria-disabled={page >= pages - 1 || undefined} onClick={() => page < pages - 1 && setPage(page + 1)} data-simg-next><IbNext size={15} />หน้าถัดไป</button>
      </div>
    </div>
    <div className="small"><Phr>พื้นตารางหมากรุกคือส่วนโปร่งใสของรูปซับ · ซับแบบรูปค้นคำไม่ได้</Phr></div>
  </>);
}

export default function SubViewer(p: { track: AvTrack; movie: string; refStream: number | null; refIdx: number | null; onClose: () => void }) {
  const t = p.track;
  const ft = ftName("subtitle", t.codec, t.profile);
  const image = ft === "PGS" || ft === "VobSub";
  const ff = t.ff ?? t.tid;
  const [tab, setTab] = useState<"aeg" | "long" | "pad">("aeg");
  const [data, setData] = useState<SubText | null>(null);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => {
    if (image) return;
    subApi.text(t.inMovie ? p.movie : t.src, t.inMovie, t.tid, ff).then(setData, (e) => setErr(String(e)));
  }, [image, t.inMovie, t.src, t.tid, ff, p.movie]);
  const name = t.inMovie ? `${t.name || "ซับในหนัง"} · ${ft}` : baseName(t.src);
  const sub = [t.inMovie ? "ซับในหนัง" : "ซับที่เพิ่ม", image ? `ซับรูป ${ft}` : `ตัวหนังสือ ${ft}`, data ? `${data.cues.length.toLocaleString("en-US")} บรรทัด` : "", t.delay ? `ดีเลย์ ${sign(t.delay)} ms เวลาที่แสดงเลื่อนแล้ว` : ""].filter(Boolean).join(" · ");
  return (
    <Dialog open onClose={p.onClose} width={980} title={<span style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
      <span style={{ minWidth: 0, overflowWrap: "anywhere" }}>ซับ {name}</span>
      {!image && <Seg small label="แบบการดู" value={tab} onChange={setTab} options={[{ value: "aeg", label: <><IbTable size={14} />แบบ Aegisub</> }, { value: "long", label: <><IcFile size={14} />แบบอ่านยาว</> }, { value: "pad", label: <><IbPencil size={14} />แบบ notepad</> }]} />}</span>}
      actions={<button type="button" className="btn btn-ghost btn-sm" onClick={p.onClose}>ปิด</button>}>
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }} data-subviewer data-mode={image ? "image" : tab}>
        <div className="small" style={{ marginTop: -6 }}>{sub}</div>
        {image ? <ImageView track={t} path={t.inMovie ? p.movie : t.src} ff={ff} />
          : err ? <div className="stat bad"><CardIcon kind="bad" /><div><b>อ่านซับไม่ได้</b><Phr>{err}</Phr></div></div>
          : !data ? <><Skel w="100%" h={203} /><Skel w="100%" h={220} /></>
          : <TextView track={t} movie={p.movie} refStream={p.refStream} refIdx={p.refIdx} data={data} tab={tab} />}
      </div>
    </Dialog>
  );
}
