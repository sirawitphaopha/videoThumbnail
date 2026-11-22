/* หน้ากราฟเสียง หน้าเทียบไฟล์ สูงสุด 4 ไฟล์ (CompareView)
   แยกจาก GraphPage.tsx ตอนแบ่งไฟล์ทั้งโปรเจกต์ (BUGS ข้อ 153 · แผนแบ่งไฟล์ขั้น 1.9) ย้ายมาทั้งก้อน เนื้อโค้ดไม่เปลี่ยน */
import { useEffect, useMemo, useRef, useState } from "react";
import { flushSync } from "react-dom";
import { listen } from "@tauri-apps/api/event";
import { GRAPH_IMG_DEFAULT, checkApi, graphApi, inApp, pickFile, type GInfo, type GProgress, type GPsd, type GTrack, type GWindow } from "../../lib/api";
import { useToast } from "../../components/Toasts";
import Dropdown from "../../components/Dropdown";
import { CardIcon, FixedTime, Phr, chText } from "../../components/ui";
import { fmtSize } from "../../lib/format";
import { diffOf, type DiffResult } from "../../lib/graphDiff";
import { useSettings } from "../../lib/settings";
import { IcExpand, IcPlus } from "../../components/icons";
import { useFitClass } from "../../lib/fitSwitch";
import { IcRefresh, IcClose, IbPlay } from "../../components/icons";
import { LoadLanes, overviewOnce, CMP_VIEWS, HEAT, PSD_SPANS, RangeTime, THEMES, TimeRuler, VIEW_ICON, View, ZOOMS, label, memPut, minus, noteOf, pkTxt, spanDigits, tfmt, tfmtD } from "./common";
import { SaveBtn, SavingCtx, alphaOf, drawWave, imgName, imgTarget, lut, sample, screenK, useCanvas, waitPaint, withHeader } from "./draw";
import { Grab, Lane, LaneOff, Speakers, VBar, VRange, useGrab, useRise, useVRange, vWindow } from "./parts";
import { FZoom, HZ_MIN, HZoom, PSD_HZ_UNIT, TimeScroll, VZoom } from "./zoom";
import { spekEdge } from "./SpekView";
import { PSD_HZ_MAX, PSM } from "./PsdView";
import { CmpChart, EMPTY, Elapsed, FILE_C, FILE_INK, Fragment3, FragmentInfo, MAX_FILES, Side, SpekCv, Stat, TH_A, TH_FILE, composeAll, drawSpecCmp, drawSpekCmp, edgeAll, f1, khz, loudPts, rmsDb, sgn } from "./compareParts";

/* ---------- เทียบไฟล์ สูงสุด 4 ไฟล์ (แผนเสียงและซับ ขั้น 8 · มอคอัปหัวข้อ 7 เทียบก่อนกับหลังแปลง · ขยายเป็นหลายไฟล์ 9 พ.ย. 2569) ----------
   กดเทียบความถี่ในคิวแปลง เปิดหน้านี้พร้อมสองไฟล์ · แท็บเดิมทั้ง 6 แท็บ ทุกกราฟแสดงสองไฟล์ ต้นฉบับสีฟ้า หลังแปลงสีส้ม
   แผงซ้ายช่องเสียงกับข้อมูลเสียงเทียบสองคอลัมน์ · ซูม ช่วงเวลา ช่องที่ซ่อน ใช้กับสองไฟล์พร้อมกัน
   อ่านภาพรวมทีละไฟล์ (ฝั่ง Rust คำขอใหม่หยุดคำขอเก่า อ่านพร้อมกันไม่ได้) · ซูมใช้ข้อมูลภาพรวม ละเอียดเท่าที่ภาพรวมมี */
/** ชื่อสองไฟล์บนจอ · มาจากคิวแปลงเป็นต้นฉบับกับหลังแปลง · เลือกเทียบเองเป็นไฟล์ 1 ไฟล์ 2 ไม่มีฝั่งไหนเป็นต้นฉบับ · CONV บอกว่าใช้คำแนะนำเรื่องการแปลงได้ */
let LABELS = ["ต้นฉบับ", "หลังแปลง"], CONV = true;
function Who({ i }: { i: number }) {
  return <span className="who" style={{ color: FILE_INK[i] }}><i style={{ background: FILE_C[i] }} />{LABELS[i]}</span>;
}

export function CompareView({ files, tracks, note, free, onFiles, onSingle, onBack, onClose }: { files: string[]; tracks?: Record<string, number>; note?: string; free?: boolean; onFiles: (files: string[], freed?: boolean) => void; onSingle: (p: string) => void; onBack: () => void; onClose: () => void }) {
  const n = files.length;
  const trOf = (p: string) => tracks?.[p] ?? 0;
  LABELS = files.map((_, i) => (!free && i < 2 ? ["ต้นฉบับ", "หลังแปลง"][i] : `ไฟล์ ${i + 1}`));
  CONV = !free && n === 2;
  const allTxt = n === 2 ? "สองไฟล์" : `ทั้ง ${n} ไฟล์`;
  useFitClass(".ag[data-graph] .plothead");
  const toast = useToast();
  const [sides, setSides] = useState<Record<string, Side>>({});
  const [tab, setTab] = useState<View>("wave");
  const [zoom, setZoom] = useState<number | "all">("all");
  const [center, setCenter] = useState(0);
  const [hidden, setHidden] = useState<string[]>([]);
  const [cmpCh, setCmpCh] = useState<string>("");
  const [psdCh, setPsdCh] = useState("mix");
  const [psdSpan, setPsdSpan] = useState<number | "all">("all");
  const [psd, setPsd] = useState<{ key: string; list: GPsd[] } | null>(null);
  const [psdF, setPsdF] = useState<number | null>(null);
  const [wide, setWide] = useState(false);
  const plotRef = useRef<HTMLDivElement>(null);
  const [paneH, setPaneH] = useState(0);
  useEffect(() => {
    const el = plotRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setPaneH(el.clientHeight));
    ro.observe(el);
    return () => ro.disconnect();
  });

  // อ่านทีละไฟล์ตามลำดับ (ฝั่ง Rust คำขอใหม่หยุดคำขอเก่า) · ไฟล์ที่อ่านแล้วไม่อ่านซ้ำตอนเพิ่มไฟล์
  const readDone = useRef(new Set<string>());
  const filesKey = files.join("\n");
  useEffect(() => {
    let live = true, off: (() => void) | undefined;
    const patch = (p: string, v: Partial<Side>) => setSides((s) => ({ ...s, [p]: { ...(s[p] ?? EMPTY), ...v } }));
    if (inApp) listen<GProgress>("graph-progress", (e) => {
      if (live && files.includes(e.payload.path)) patch(e.payload.path, { pct: e.payload.percent });
    }).then((u) => { if (live) off = u; else u(); });
    (async () => {
      for (const p of files) {
        if (!live) return;
        if (readDone.current.has(p)) continue;
        try {
          const info = await graphApi.info(p); if (!live) return;
          patch(p, { info, pct: 0, since: Date.now() });
          const ov = await overviewOnce(p, trOf(p)); if (!live) return;
          patch(p, { ov, pct: null, err: ov ? null : "หยุดอ่านเสียงแล้ว" });
        } catch (e) { if (live) patch(p, { err: String(e), pct: null }); }
        if (live) readDone.current.add(p);
      }
    })();
    return () => { live = false; off?.(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filesKey]);

  const S = files.map((p) => sides[p] ?? EMPTY);
  const T = S.map((s, i) => s.info?.tracks[trOf(files[i])] ?? s.info?.tracks[0]);
  const NM = T.map((t) => t?.names ?? []);
  const union = [...new Set(NM.flat())];
  const vis = union.filter((c) => !hidden.includes(c));
  const lens = S.map((s) => s.ov?.duration ?? s.info?.duration ?? 0);
  const dur = Math.max(0, ...lens);
  const span = zoom === "all" ? dur : Math.min(dur, zoom);
  const t0 = Math.max(0, Math.min(dur - span, center - span / 2)), t1 = t0 + span;
  // ระบบซูมครบทุกกราฟแบบหน้ากราฟหลัก (พี่กันสั่ง 9 พ.ย. 2569 "กราฟเทียบทุกตัว ต้องมีระบบซูม")
  const [resetN, setResetN] = useState(0);
  const [vz, setVz] = useState(1);
  const vrSpec = useVRange(resetN), vrLoud = useVRange(resetN), vrCmp = useVRange(resetN), vrSpek = useVRange(resetN), vrPsd = useVRange(resetN), hrPsd = useVRange(resetN);
  const vrNow = tab === "spec" ? vrSpec : tab === "loud" ? vrLoud : tab === "cmp" ? vrCmp : tab === "spek" ? vrSpek : tab === "psd" ? vrPsd : null;
  const panT = (c: number) => setCenter(Math.max(span / 2, Math.min(dur - span / 2, c)));
  const setSpan = (ns: number) => {
    if (!dur) return;
    if (ns >= dur * 0.999) { setZoom("all"); setCenter(dur / 2); return; }
    const k = Math.max(HZ_MIN, ns), mid = zoom === "all" ? dur / 2 : (t0 + t1) / 2;
    setZoom(k); setCenter(Math.max(k / 2, Math.min(dur - k / 2, mid)));
  };
  const zoomReset = () => { setZoom("all"); setCenter(dur / 2); setVz(1); setResetN((v) => v + 1); };
  // ซูมแยกแต่ละกราฟเหมือนหน้าหลัก · ติ๊กซูมเหมือนกันทุกกราฟในตัวเลือกกราฟแล้วใช้ช่วงเดียวกัน
  const { settings } = useSettings();
  const zoomOf = useRef<Partial<Record<View, { zoom: number | "all"; center: number }>>>({});
  const switchTab = (k: View) => {
    if (k === tab) return;
    if (!(settings?.graphZoomAll ?? false)) {
      zoomOf.current[tab] = { zoom, center };
      const was = zoomOf.current[k];
      setZoom(was?.zoom ?? "all"); setCenter(was?.center ?? dur / 2);
    }
    setTab(k);
  };
  const nyq = T.map((t) => (t?.rate ?? 48000) / 2), maxNyq = Math.max(...nyq);
  const common = NM[0].filter((c) => NM.every((x) => x.includes(c)));
  // ไฟล์ยาวไม่เท่ากัน เช่นตั้งความเร็วเสียงตอนแปลง เทียบตามเวลาตรง ๆ ไม่ได้ (ผู้ช่วยตรวจขั้น 10 ข้อ 24)
  const known = lens.filter((x) => x > 0);
  const lenDiff = known.length > 1 && Math.max(...known) - Math.min(...known) > Math.max(1, Math.max(...known) * 0.01);
  const cmpUse = common.includes(cmpCh) ? cmpCh : common[0] ?? "";
  const ready = S.every((s) => !!s.ov) && T.every((t) => !!t);
  // ทุกไฟล์เทียบกับไฟล์แรก · จำผลไว้ เพิ่มไฟล์แล้วไม่คิดคู่เดิมซ้ำ
  const diffMem = useRef(new Map<string, DiffResult>());
  const diffs = useMemo(() => {
    if (!ready) return null;
    return files.slice(1).map((p, k) => {
      const key = files[0] + "\n" + p;
      let r = diffMem.current.get(key);
      if (!r) { r = diffOf({ ov: S[0].ov!, names: NM[0], rate: T[0]!.rate }, { ov: S[k + 1].ov!, names: NM[k + 1], rate: T[k + 1]!.rate }); diffMem.current.set(key, r); }
      return r;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filesKey, ready]);
  const nameOf = (p: string) => p.split(/[\\/]/).pop() ?? p;
  const toggleCh = (c: string) => setHidden((h) => h.includes(c) ? h.filter((x) => x !== c) : vis.length > 1 ? [...h, c] : h);
  // เพิ่มไฟล์เทียบได้สูงสุด 4 ไฟล์ (พี่กันเคาะ 9 พ.ย. 2569 "ตามนั้น")
  const addFile = async () => {
    const f = await pickFile("media"); if (!f) return;
    if (files.some((p) => p.toLowerCase() === f.toLowerCase())) { toast({ kind: "warn", ms: 6000, key: "graph-pick", title: "ไฟล์นี้อยู่ในการเทียบแล้ว" }); return; }
    onFiles([...files, f]);
  };

  const isPsd = tab === "psd", isLanes = tab === "wave" || tab === "spec";
  const cmpGrab = useGrab({
    canX: isPsd ? hrPsd.z > 1 : span < dur - 0.01, canY: !!vrNow && vrNow.z > 1,
    span: isPsd ? 1 / hrPsd.z : span, center: isPsd ? hrPsd.b + 0.5 / hrPsd.z : (t0 + t1) / 2,
    z: vrNow?.z ?? 1, b: vrNow?.b ?? 0,
    left: isLanes ? 96 : tab === "spek" ? 62 : isPsd ? PSM.L : 44, right: isLanes ? 0 : tab === "spek" ? 86 : isPsd ? PSM.R : 4,
    top: tab === "spek" ? 46 : isPsd ? PSM.T : isLanes ? 0 : 12, bottom: tab === "spek" ? 28 : isPsd ? PSM.B : isLanes ? 0 : 12,
    onX: isPsd ? (c) => hrPsd.setB(hrPsd.clampB(c - 0.5 / hrPsd.z, hrPsd.z)) : panT,
    onY: (y) => { if (vrNow) vrNow.setB(vrNow.clampB(y, vrNow.z)); },
  });
  // Ctrl หมุนล้อ ซูมเข้าออกตามแกนนอน
  useEffect(() => {
    const el = plotRef.current; if (!el) return;
    const fn = (e: WheelEvent) => {
      if (!e.ctrlKey) return;
      e.preventDefault();
      if (isPsd) hrPsd.setZ(Math.max(1, Math.min(PSD_HZ_MAX, hrPsd.z * (e.deltaY < 0 ? 1.5 : 1 / 1.5))));
      else setSpan(span * (e.deltaY < 0 ? 0.5 : 2));
    };
    el.addEventListener("wheel", fn, { passive: false });
    return () => el.removeEventListener("wheel", fn);
  });
  const psdMem = useRef(new Map<string, GPsd>());
  // ความถี่เฉลี่ย ทีละไฟล์ (คำขอใหม่หยุดคำขอเก่าที่ฝั่ง Rust) · จำผลแยกไฟล์ เพิ่มไฟล์แล้วคิดเฉพาะไฟล์ใหม่
  const psdT = psdSpan === "all" ? [0, dur] : [Math.max(0, (t0 + t1) / 2 - psdSpan / 2), Math.min(dur, (t0 + t1) / 2 + psdSpan / 2)];
  const psdKey = `${filesKey}|${psdCh}|${psdT[0].toFixed(2)}|${psdT[1].toFixed(2)}`;
  useEffect(() => {
    if (tab !== "psd" || !ready) return;
    let live = true;
    const series = (names: string[]) => {
      if (psdCh !== "mix" && names.includes(psdCh)) return [[names.indexOf(psdCh)]];
      const base = names.map((_, i) => i).filter((i) => names[i] !== "LFE");
      return [base.length ? base : [0]];
    };
    (async () => {
      try {
        // ช่องความถี่กว้างเท่ากันทุกไฟล์ · เดิมใช้ 4096 ทุกไฟล์ ไฟล์ 96 kHz ช่องกว้าง 23.4 Hz ไฟล์ 48 kHz กว้าง 11.7 Hz
        // ค่าต่อช่องของเสียงรบกวนต่างกัน 3 dB ทั้งเส้น และยอดเสียงแหลมคมไม่เท่ากัน เส้นหลังแปลงต่ำกว่าต้นฉบับทั้งที่เสียงเดียวกัน (เจอตอนตรวจภาพ)
        const top = Math.max(...T.map((t) => t!.rate)), sz = (r: number) => Math.max(1024, 2 ** Math.round(Math.log2(4096 * r / top)));
        const list: GPsd[] = [];
        for (let i = 0; i < n; i++) {
          const end = Math.min(psdT[1], S[i].ov!.duration), size = sz(T[i]!.rate), mem = `${files[i]}|${psdCh}|${psdT[0].toFixed(2)}|${end.toFixed(2)}|${size}`;
          let p = psdMem.current.get(mem) ?? null;
          if (!p) { p = await graphApi.psd(files[i], trOf(files[i]), psdT[0], end, series(NM[i]), size, null); if (!live || !p) return; memPut(psdMem.current, mem, p, 24); }
          list.push(p);
        }
        if (live) setPsd({ key: psdKey, list });
      } catch (e) { if (live) toast({ kind: "bad", title: "คิดความถี่เฉลี่ยไม่ได้", detail: String(e) }); }
    })();
    return () => { live = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, ready, psdKey]);

  // อ่านเสียงช่วงที่ดูของทุกไฟล์ที่ความละเอียดของรูปก่อนวาด (แบบเดียวกับหน้าหลัก)
  const [saving, setSaving] = useState(false);
  const [hiC, setHiC] = useState<Record<string, GWindow>>({});
  const saveImage = async () => {
    if (saving) return;
    const o = settings?.graphImg ?? GRAPH_IMG_DEFAULT;
    const base = (p: string) => nameOf(p).replace(/\.[^.]+$/, ""), vName = CMP_VIEWS.find(([k]) => k === tab)?.[1] ?? "กราฟเสียง";
    const where = await imgTarget(files[0], imgName(base(files[0]) + " เทียบ " + base(files[1]) + (n > 2 ? " และอีก " + (n - 2) + " ไฟล์" : ""), vName, o), o); if (!where) return;
    setSaving(true);
    try {
      await waitPaint();
      if (tab !== "loud" && tab !== "psd") {
        const got: Record<string, GWindow> = {}, cols = Math.min(8192, o.width || Math.round((plotRef.current?.clientWidth ?? 1000) * screenK()));
        for (let i = 0; i < n; i++) {
          const end = Math.min(t1, S[i].ov?.duration ?? t1);
          if (end <= t0) continue;
          const w = await graphApi.window(files[i], trOf(files[i]), t0, end, cols, 512, false, true);
          if (!w) throw new Error("การอ่านถูกยกเลิก");
          got[files[i]] = w;
        }
        flushSync(() => setHiC(got));
      }
      let cv = composeAll(plotRef.current, o.width);
      if (!cv) throw new Error("ยังไม่มีกราฟให้บันทึก");
      if (o.title) cv = withHeader(cv, vName + " เทียบ " + n + " ไฟล์", files.map((p, i) => LABELS[i] + " " + nameOf(p)).join("   "), files.map((_, i) => [LABELS[i], FILE_C[i]] as [string, string]));
      await waitPaint();
      const saved = await graphApi.saveImage(where, alphaOf(cv, o).toDataURL("image/png"), o);
      toast({ kind: "ok", title: "บันทึกรูปแล้ว " + saved.width.toLocaleString("en-US") + " × " + saved.height.toLocaleString("en-US") + " ขนาด " + fmtSize(saved.size), detail: saved.path });
    } catch (e) { toast({ kind: "bad", title: "บันทึกรูปไม่ได้", detail: e instanceof Error ? e.message : String(e) }); }
    finally { setHiC({}); setSaving(false); }
  };
  // เปิดเล่นจากต้นช่วงที่ดู ทั้งไฟล์คือ 0:00 ซูมอยู่คือขอบซ้ายของกราฟ (พี่กันสั่ง 9 พ.ย. 2569 "แก้ไป ใครบ้าจะกดฟังกลางเพลง")
  const playFrom = t0;
  const play = async (p: string) => {
    try { const r = await checkApi.playAt(p, playFrom); toast({ kind: r.seeked ? "ok" : "warn", title: r.seeked ? `เปิดด้วย ${r.player} ที่ ${tfmt(playFrom)}` : "เปิดแล้ว แต่เปิดตรงนาทีไม่ได้", detail: r.seeked ? undefined : `เลื่อนไปที่ ${tfmt(playFrom)} เอง` }); }
    catch (e) { toast({ kind: "bad", title: "เปิดเล่นไม่ได้", detail: String(e) }); }
  };

  const chip = (i: number) => {
    const p = files[i], s = S[i], nm = nameOf(p), k = "abcd"[i];
    return (
      <div key={p} className="fchip cmpchip" role="button" tabIndex={0} title="ดูกราฟเดี่ยวของไฟล์นี้" onClick={() => onSingle(p)} onKeyDown={(e) => { if (e.target === e.currentTarget && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); onSingle(p); } }} style={{ boxShadow: `inset 4px 0 0 ${FILE_C[i]}` }} data-cmpfile={k}>
        <div className="fnote" style={{ background: TH_FILE[i].lane, color: FILE_INK[i], border: `1px solid ${TH_FILE[i].peak}` }}><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path d="M9 18V5l11-2v13" /><circle cx="6" cy="18" r="3" /><circle cx="17" cy="16" r="3" /></svg></div>
        <div style={{ minWidth: 0, flex: 1 }}>
          <div className="nm"><span className="nmtx">{nm.replace(/\.[^.]+$/, "")}</span>{/\.[^.]+$/.test(nm) && <span className="extcard" style={{ background: FILE_INK[i] }} data-cmpext={k}>{nm.match(/\.([^.]+)$/)?.[1].toUpperCase()}</span>}<Who i={i} /></div>
          <div className="meta">{s.info ? `${s.info.audioOnly ? "ไฟล์เสียง" : "ไฟล์หนัง"} ${fmtSize(s.info.size)} ยาว ${tfmt(s.info.duration)}${i === 1 && note ? " แปลงเมื่อสักครู่" : ""}${s.info.tracks.length > 1 && T[i] ? ` เสียง ${T[i]!.index + 1}${T[i]!.lang ? " " + T[i]!.lang : ""}` : ""}` : s.err ? "อ่านไม่ได้" : "กำลังอ่านข้อมูลไฟล์"}</div>
        </div>
        {n > 2 && <button type="button" className="rmx" aria-label={`เอา ${nm} ออกจากการเทียบ`} title="เอาออกจากการเทียบ ไฟล์ในเครื่องไม่ถูกแตะ" onClick={(e) => { e.stopPropagation(); onFiles(files.filter((x) => x !== p), true); }} data-cmpremove={k}><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.8" strokeLinecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" /></svg></button>}
      </div>
    );
  };
  const head = (
    <div className="agtop">
      <button type="button" className="btn btn-ghost" onClick={onBack} data-cmpback><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true"><path d="M15 18l-6-6 6-6" /></svg>{free ? "กลับกราฟ" : "คิวแปลง"}</button>
      {files.map((_, i) => chip(i))}
      {n < MAX_FILES && <button type="button" className="btn btn-ghost" onClick={addFile} title={`เพิ่มไฟล์มาเทียบ ได้สูงสุด ${MAX_FILES} ไฟล์`} data-cmpadd><IcPlus />เพิ่มไฟล์</button>}
      {!free && <button type="button" className="btn btn-ghost" onClick={onClose} title="เปิดต้นฉบับในหน้ากราฟเสียงแบบไฟล์เดียว" data-cmpclose><IcClose size={15} />ปิดการเทียบ</button>}
    </div>
  );
  const fileLg = <>{files.map((p, i) => <span key={p}><span className="ln" style={{ background: FILE_C[i] }} />{LABELS[i]}</span>)}</>;
  const ctl = (
    <div className="agctl">
      <div className="seg agviews">{CMP_VIEWS.map(([k, l]) => <button key={k} type="button" className={tab === k ? "on" : ""} onClick={() => switchTab(k)} data-cmptab={k} disabled={k === "cmp" && !common.length}
        title={k === "cmp" && !common.length ? `${allTxt}ไม่มีช่องเสียงที่ตรงกัน` : undefined}>{VIEW_ICON[k]}{l}</button>)}</div>
      <div className="lg" style={{ marginLeft: "auto" }}>{fileLg}</div>
      <button type="button" className={"btn btn-ghost btn-sm" + (wide ? " pressed" : "")} style={{ width: 32, padding: 0, flex: "none" }} aria-pressed={wide} title={wide ? "แสดงแผงลำโพง" : "ขยายเต็มจอ"} aria-label={wide ? "แสดงแผงลำโพง" : "ขยายเต็มจอ"} onClick={() => setWide(!wide)} data-graphwide><IcExpand size={14} /></button>
    </div>
  );
  const infoRow = (t: GTrack | undefined, info: GInfo | null) => t && info ? [t.codec, chText(t.layout), `${khz(t.rate)} kHz`, t.bits ? `${t.bits}-bit` : "—", t.bitrate ? `${Math.round(t.bitrate / 1000).toLocaleString("en-US")} kb/s` : "—", fmtSize(info.size), tfmt(info.duration)] : null;
  const infos = S.map((s, i) => infoRow(T[i], s.info));
  const diffRows: [string, string, (d: DiffResult) => number, string[]][] = [["wave", "รูปคลื่น", (d) => d.wave, ["wave"]], ["spec", "ความถี่", (d) => d.spec, ["spec", "spek"]], ["loud", "ความดัง", (d) => d.loud, ["loud"]], ["cmp", "ซ้อนเทียบ", (d) => d.cmp, ["cmp"]], ["psd", "ความถี่เฉลี่ย", (d) => d.psd, ["psd"]]];
  const others0 = files.map((_, i) => i).slice(1);
  const sizeTxt = (i: number, long: boolean) => {
    const a = S[0].info?.size ?? 0, b = S[i].info?.size ?? 0;
    if (!a || !b) return "—";
    if (a === b) return "เท่ากัน";
    const pct = Math.abs(b - a) / a * 100, p = pct < 0.1 ? "ไม่ถึง 0.1%" : pct.toFixed(1) + "%";
    return long ? `${b < a ? "เล็กกว่า" : "ใหญ่กว่า"} ${p} หรือ ${fmtSize(Math.abs(b - a))}` : (b < a ? "−" : "+") + p;
  };
  const panel = (
    <div className="apanel">
      <div className="card"><h3><span>ช่องเสียง {chText(T[0]?.layout)}</span><span className="small" style={{ color: "var(--txt3)" }}>{union.length} ช่อง</span></h3>
        {NM[0].length > 0 && <Speakers names={union} th={TH_A} levels={union.map(() => 0.3)} hidden={hidden} onToggle={toggleCh} />}
        <div className="small" style={{ textAlign: "center", marginTop: 4 }}>{union.length > 1 ? <Phr>{`กดลำโพงเพื่อปิดหรือเปิดช่องนั้นของ${n === 2 ? "ทั้งสองไฟล์" : allTxt}พร้อมกัน`}</Phr> : "ไฟล์นี้มีเสียงช่องเดียว"}</div>
        {T.every(Boolean) && NM.some((x) => x.join() !== NM[0].join()) && <div className="small" style={{ marginTop: 4 }}>ช่องเสียงไม่เท่ากัน {T.map((t, i) => `${LABELS[i]} ${t!.layout}`).join(" ")}</div>}</div>
      {diffs && <div className="card gdiff" data-cmpdiff>
        {n === 2
          ? <><h3><span>ต่างกันกี่ %</span><b data-cmpdiffall title="ค่าเฉลี่ยของทุกกราฟ">{diffs[0].overall.toFixed(1)}%</b></h3>
            {diffRows.map(([k, l, get, on]) => { const v = get(diffs[0]); return <div key={k} className={"row" + (on.includes(tab) ? " on" : "")} data-cmpdiffrow={k}><span>{l}</span><i><u style={{ width: Math.max(0, Math.min(100, v)) + "%" }} /></i><em>{v.toFixed(1)}%</em></div>; })}
            <div className="sizerow" data-cmpdiffsize title={`ขนาด${LABELS[1]}เทียบกับ${LABELS[0]} ไม่นับรวมในเปอร์เซ็นต์ด้านบน`}><span>ขนาดไฟล์</span><em><Phr>{sizeTxt(1, true)}</Phr></em></div></>
          : <><h3><span>ต่างจาก{LABELS[0]}กี่ %</span></h3>
            <div className="gdiffgrid" style={{ gridTemplateColumns: `minmax(0, 1fr) repeat(${n - 1}, auto)` }}>
              <span />{diffs.map((_, k) => <span key={k} className="h" style={{ color: FILE_INK[k + 1] }}>{LABELS[k + 1]}</span>)}
              <span className="all">รวม</span>{diffs.map((d, k) => <b key={k} data-cmpdiffall={k}>{d.overall.toFixed(1)}%</b>)}
              {diffRows.map(([k, l, get, on]) => { const cls = on.includes(tab) ? "on" : ""; return <Fragment3 key={k} cls={cls} k={k} l={l} vals={diffs.map((d) => get(d).toFixed(1) + "%")} />; })}
              <Fragment3 cls="" k="size" l="ขนาดไฟล์" vals={others0.map((i) => sizeTxt(i, false))} />
            </div></>}
        <div className="gdiffnote" title={`ผลต่าง 60 dB คิดเป็น 100% และ 0% ไม่ได้แปลว่าเหมือนทุกบิต เพราะคิดจากข้อมูลภาพรวม${diffs.some((d) => d.lenDiff) ? " ไฟล์ยาวไม่เท่ากัน จึงเทียบเท่าช่วงที่มีทั้งคู่" : ""}`}><Phr>{"ผลต่าง 60 dB คิดเป็น 100%\nและ 0% ไม่ได้แปลว่าเหมือนทุกบิต"}</Phr></div></div>}
      <div className="card"><h3>ข้อมูลเสียง</h3>
        <div className="ginfo" style={{ gridTemplateColumns: `auto repeat(${n}, auto)` }} data-cmpinfo><span />{files.map((p, i) => <span key={p} className="h" style={{ color: FILE_INK[i] }}>{LABELS[i]}</span>)}
          {["รหัสเสียง", "ช่องเสียง", "อัตราสุ่ม", "ความละเอียด", "บิตเรต", "ขนาด", "ความยาว"].map((k, r) => <FragmentInfo key={k} k={k} vals={infos.map((x) => x?.[r] ?? "…")} />)}</div>
        {note && <div className="small" style={{ marginTop: 8 }}><Phr>{note}</Phr></div>}</div>
      {lenDiff && <div className="stat warn" data-cmplen><CardIcon kind="warn" /><div><b>{`${allTxt}ยาวไม่เท่ากัน ${lens.map(tfmt).join(" กับ ")}`}</b><Phr>{CONV ? "น่าจะตั้งความเร็วเสียงตอนแปลง จึงเทียบรูปคลื่น ความดัง และซ้อนเทียบตามเวลาตรง ๆ ไม่ได้ ให้ดูความถี่เฉลี่ยกับกราฟความถี่แทน" : "กราฟเรียงจากต้นไฟล์ตามเวลา ไฟล์ที่สั้นกว่าจึงจบก่อน"}</Phr></div></div>}
    </div>
  );

  let body: React.ReactNode;
  const errAt = S.findIndex((s) => s.err);
  if (errAt >= 0) {
    body = <div className="plot"><div className="stat bad"><CardIcon kind="bad" /><div><b>อ่าน{LABELS[errAt]}ไม่ได้</b><Phr>{S[errAt].err ?? ""}</Phr></div></div></div>;
  } else if (!ready) {
    const at = Math.max(0, S.findIndex((s) => !s.ov)), pct = S[at].pct ?? 0, since = S[at].since;
    body = (
      <div className="plot" data-cmploading>
        <div style={{ fontSize: 13.5, marginBottom: 8 }}>อ่านเสียง{LABELS[at]} <b>{Math.round(pct)}%</b>{since != null && <> <Elapsed since={since} /></>} อ่านทีละไฟล์ตามลำดับ</div>
        <div className="bar"><i style={{ width: `${pct}%` }} /></div>
        <LoadLanes n={files.length * 2} />
      </div>
    );
  } else {
    const OV = S.map((s) => s.ov!);
    const others = files.map((_, i) => i).slice(1);
    // แถบซูมเรียงแบบเดียวกับหน้าไฟล์เดียว คำว่าซูมนำหน้า เส้นแบ่งกั้นปุ่มรีเซ็ต หัวกราฟแคบปุ่มช่วงซูมเป็นดรอปดาวน์
    // (พี่กันทัก 13 พ.ย. 2569 "แบ่งถูกละเหรอ ทำไปเเยำคำว่าซูมออก" · "ตัวนี้เปลี่ยนเป็นดรอปดาวด้วย ถ้าจอเล็ก" · หน้าเทียบมีแถบของตัวเองแยก เจอตอนไล่ทุกหน้า)
    const pickCmpZoom = (v: string) => { const k: number | "all" = v === "all" ? "all" : Number(v); setZoom(k); if (k !== "all" && zoom === "all") setCenter(Math.min(dur / 2, 60)); };
    const zoomBar = (
      <span className="zoombox" style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <span className="lbl">ซูม</span>
        <span className="zbtns">
          <button type="button" className="zb" onClick={() => setSpan(span * 2)} disabled={zoom === "all"} aria-label="ซูมออก" title="ซูมออก (Ctrl หมุนล้อเมาส์ลง)" data-zoomout><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" aria-hidden="true"><circle cx="10.5" cy="10.5" r="6.5" /><path d="M20 20l-4.8-4.8M7.5 10.5h6" /></svg></button>
          <HZoom dur={dur} span={span} onSpan={setSpan} />
          <button type="button" className="zb" onClick={() => setSpan(span / 2)} disabled={span <= HZ_MIN} aria-label="ซูมเข้า" title="ซูมเข้า (Ctrl หมุนล้อเมาส์ขึ้น)" data-zoomin><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" aria-hidden="true"><circle cx="10.5" cy="10.5" r="6.5" /><path d="M20 20l-4.8-4.8M7.5 10.5h6M10.5 7.5v6" /></svg></button>
        </span>
        <span className="zseg"><div className="seg sm">{ZOOMS.map(([k, l]) => <button key={String(k)} type="button" className={String(zoom) === String(k) ? "on" : ""} onClick={() => pickCmpZoom(String(k))} data-cmpzoom={String(k)}>{l}</button>)}</div></span>
        <span className="zdd" title={`ช่วงที่ดูยาว ${tfmtD(span, spanDigits(span))}`} data-zoomdd><Dropdown label="ช่วงซูม" value={String(zoom)} onChange={pickCmpZoom} keepLeftOf={spekEdge}
          options={ZOOMS.map(([k, l]) => ({ value: String(k), label: l }))} display={(o) => o?.label ?? tfmtD(span, spanDigits(span))} /></span>
        <span className="fsep" aria-hidden="true" />
        <button type="button" className="zb" onClick={zoomReset} aria-label="รีเซ็ตซูม" title="รีเซ็ต กลับทั้งไฟล์ ซูมแนวตั้ง 1 เท่า" data-zoom-reset><IcRefresh size={15} /></button></span>
    );
    const foot = (lg: React.ReactNode) => (
      <div className="agfoot"><div className="lg">{lg}</div>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>{files.map((p, i) => <button key={p} type="button" className="btn btn-ghost btn-sm" onClick={() => play(p)}><IbPlay size={15} /><span>เปิด{LABELS[i]} {p.match(/\.([^.\\/]+)$/)?.[1].toUpperCase() ?? ""} ที่ <FixedTime t={tfmt(playFrom)} longest={tfmt(dur)} /></span></button>)}<SaveBtn onClick={saveImage} /></div></div>
    );
    const Ruler = () => (
      <TimeRuler t0={t0} t1={t1} left={96} right={30} />
    );
    const edges = OV.map((ov, i) => edgeAll(ov, NM[i], nyq[i]));
    const ea = edges[0], eb = edges[1];
    const cutNote = n === 2
      ? (eb.top < ea.top - 1500 && !eb.full
        ? { kind: "info" as const, b: `${LABELS[1]}ไม่มีเสียงเหนือ ${khz(eb.top)} kHz`, d: `${LABELS[0]}มีเสียงถึงราว ${khz(ea.top)} kHz${ea.top > 20000 ? " ซึ่งหูคนไม่ได้ยิน (หูได้ยินถึงราว 20 kHz)" : ""} ส่วนช่วงที่ต่ำกว่านั้นภาพแทบเหมือนกัน` }
        : { kind: "info" as const, b: "ช่วงความถี่ของสองไฟล์ใกล้เคียงกัน", d: `${LABELS[0]}มีเสียงถึงราว ${khz(ea.top)} kHz และ${LABELS[1]}ราว ${khz(eb.top)} kHz` })
      : { kind: "info" as const, b: `ช่วงความถี่${allTxt}`, d: edges.map((e, i) => `${LABELS[i]} ราว ${khz(e.top)} kHz`).join(", ") };
    const nLanes = union.reduce((sum, c) => sum + NM.filter((x) => x.includes(c)).length, 0);
    // 205 คือหัวกราฟ แถวเวลา แถบเลื่อน ผลสรุป แถวปุ่มท้าย ระยะขอบรวมกัน (วัดจากหน้าจริง)
    const laneH = Math.max(union.length > 4 ? 40 : 46, Math.floor((paneH - 205 - (nLanes - 1) * 6) / Math.max(1, nLanes)));
    const colors = lut(THEMES["ชมพู"].ramp);
    if (tab === "wave" || tab === "spec") {
      const lanes = union.flatMap((c) => files.flatMap((_, f) => {
        const names = NM[f], ov = OV[f], i = names.indexOf(c);
        if (i < 0) return [];
        const l = label(names, c), pk = ov.peaks[i], k = "abcd"[f];
        const peak = pk == null ? "" : pk <= -119 ? "เงียบทั้งไฟล์" : "ดังสุด " + pkTxt(pk);
        const tog = { onToggle: () => toggleCh(c), last: vis.length <= 1 };
        if (hidden.includes(c)) return [<LaneOff key={c + k + "off"} code={l.code} th={`${l.th} ${LABELS[f]}`} peak={peak} height={laneH} {...tog} />];
        return [tab === "wave"
          ? <Lane key={c + k + tab} {...tog} code={l.code} th={`${l.th} ${LABELS[f]}`} peak={peak} height={laneH} deps={[ov, t0, t1, i, laneH, vz, f, hiC[files[f]]]}
              draw={(g, w, h) => { const hi = hiC[files[f]]; drawWave(g, w, h, sample(hi ? { env: hi.env, cols: hi.cols, t0: hi.t0, t1: hi.t1 } : { env: ov.env, cols: ov.cols, t0: 0, t1: ov.duration }, i, t0, t1, w), TH_FILE[f], "fine", vz); }} />
          : <Lane key={c + k + tab} {...tog} code={l.code} th={`${l.th} ${LABELS[f]}`} peak={peak} height={laneH} deps={[ov, t0, t1, i, laneH, maxNyq, vrSpec.z, vrSpec.b, hiC[files[f]]]}
              draw={(g, w, h) => drawSpecCmp(g, w, h, i, ov, t0, t1, nyq[f], maxNyq, colors, vrSpec.z, vrSpec.b, hiC[files[f]])} />];
      }));
      const pks = OV.map((ov) => Math.max(...ov.peaks));
      const over = others.find((i) => pks[i] > -0.05 && pks[i] > pks[0] + 0.05);
      body = (
        <div className="plot cmpplot" data-plot ref={plotRef} data-cmpview={tab}>
          <div className="plotstick"><div className="plothead"><span><b>{tab === "wave" ? "รูปคลื่นทุกช่อง" : "ความถี่ทุกช่อง"}</b> <span className="prange">ช่วง <RangeTime t0={t0} t1={t1} dur={dur} /></span></span>{zoomBar}</div>
          <Ruler />
          </div>
          <div className="lanewrap" style={{ position: "relative" }} onWheel={tab === "spec" ? vrSpec.wheel : undefined}>
            <div className={"lanes cmplanes " + cmpGrab.cls} {...cmpGrab.props} data-lanes>{lanes}</div>
            {tab === "spec" && <VBar dark v={vrSpec} right={34} top={0} bottom={0} />}
            {tab === "wave" ? <VZoom value={vz} onChange={setVz} /> : <FZoom value={vrSpec.z} onChange={vrSpec.setZ} />}
          </div>
          <TimeScroll dur={dur} t0={t0} t1={t1} left={96} right={30} onPan={panT} />
          {tab === "wave"
            ? (over != null
              ? <Stat kind="warn" b={`ดังสุดของ${LABELS[over]}ขึ้นเป็น ${pkTxt(pks[over])}`} d={`${LABELS[0]} ${pkTxt(pks[0])}${CONV ? " เพราะการแปลงแบบเสียคุณภาพทำให้ยอดคลื่นขยับเล็กน้อย" : ""} ดูแท็บความดังว่าเกิน 0 ช่วงไหน`} />
              : <Stat kind="info" b={`รูปคลื่นของ${allTxt}`} d={`ดังสุด ${pks.map((p, i) => `${LABELS[i]} ${pkTxt(p)}`).join(", ")}`} />)
            : <Stat {...cutNote} />}
        {foot(tab === "wave" ? <><span>{TH_FILE.slice(0, n).map((x, i) => <i key={i} style={{ background: x.peak }} />)}ดังสุด (Peak)</span><span>{FILE_INK.slice(0, n).map((x, i) => <i key={i} style={{ background: x }} />)}ดังเฉลี่ย (RMS)</span></>
            : <><span className="nw">−120 dB</span><span className="rampbar" style={{ background: `linear-gradient(90deg,${THEMES["ชมพู"].ramp.join(",")})` }} /><span className="nw">0 dB</span></>)}
          </div>
      );
    } else if (tab === "loud") {
      const hot = others.find((i) => (OV[i].truePeak ?? -99) >= 0);
      const rows: { k: string; v: string[]; note: string; bad: boolean[] }[] = [
        { k: "ความดังรวม", v: OV.map((o) => `${f1(o.integrated)} LUFS`), note: "ทั้งไฟล์ ตามมาตรฐาน EBU R128", bad: [] },
        { k: "ดังสุด (True Peak)", v: OV.map((o, i) => `${i && (o.truePeak ?? -99) > 0 ? "+" : ""}${f1(o.truePeak)} dBTP`), note: hot != null ? LABELS[hot] + "ถึงหรือเกิน 0" : `ไม่ถึง 0 ${allTxt}`, bad: OV.map((o, i) => i > 0 && (o.truePeak ?? -99) >= 0) },
        { k: "ช่วงความดัง", v: OV.map((o) => `${f1(o.lra)} LU`), note: "ห่างระหว่างช่วงเบากับช่วงดัง", bad: [] },
        { k: "ช่วงเงียบผิดปกติ", v: OV.map((o) => (o.silences.length ? `${o.silences.length} ช่วง` : "ไม่พบ")), note: "เงียบทุกช่องเกิน 1 วินาที", bad: OV.map((o, i) => i > 0 && o.silences.length > OV[0].silences.length) },
      ];
      const luDiffs = others.map((i) => Math.abs((OV[i].integrated ?? 0) - (OV[0].integrated ?? 0)));
      body = (
        <div className="plot cmpplot" data-plot ref={plotRef} data-cmpview="loud">
          <div className="plotstick"><div className="tiles" data-cmptiles>{rows.map((r) => (
            <div className="tile cmptile" key={r.k}><span>{r.k}</span>{r.v.map((x, i) => <div className="tv" key={i}><Who i={i} /><b style={r.bad[i] ? { color: "var(--bad-ink)" } : undefined}>{x}</b></div>)}<em>{r.note}</em></div>))}</div>
          <div className="plothead"><span><b>ความดังตลอดไฟล์</b> <span className="prange">ช่วง <RangeTime t0={t0} t1={t1} dur={dur} /></span></span>{zoomBar}</div></div>
          <div style={{ flex: "1 0 110px", display: "flex", gap: 8, minHeight: 0 }} onWheel={vrLoud.wheel}>
            <div style={{ position: "relative", flex: 1, minWidth: 0, display: "flex" }}>
              <CmpChart key="loud" vr={vrLoud} grab={cmpGrab} fill height={110} deps={[filesKey, t0, t1]} lo={-60} hi={0} step={10} unit="LUFS" ref23
                series={(w) => OV.map((o, i) => [loudPts(o, t0, t1, w), FILE_C[i]] as [Float32Array, string])} />
              <VBar v={vrLoud} right={8} />
            </div>
            <FZoom value={vrLoud.z} onChange={vrLoud.setZ} />
          </div>
          <TimeScroll dur={dur} t0={t0} t1={t1} left={44} right={34} onPan={panT} />
          {hot != null
            ? <Stat kind="warn" b={`ดังสุดของ${LABELS[hot]} ${(OV[hot].truePeak ?? 0) > 0 ? "+" : ""}${f1(OV[hot].truePeak)} dBTP ถึงหรือเกิน 0`} d={CONV ? "เครื่องเล่นบางตัวเสียงแตกช่วงที่ดังสุด ให้ตั้ง Gain −1 dB ในแผงตั้งค่าเสียงแล้วแปลงใหม่" : "เครื่องเล่นบางตัวเสียงแตกช่วงที่ดังสุด"} />
            : <Stat kind="info" b={n === 2 ? `ความดังรวมต่างกัน ${luDiffs[0].toFixed(1)} LU` : `ความดังรวมต่างจาก${LABELS[0]}มากสุด ${Math.max(...luDiffs).toFixed(1)} LU`} d={`เส้นแทบทับกันแปลว่าความดังไม่เปลี่ยน และต่างกันไม่ถึง 1 LU หูแยกไม่ออก`} />}
        {foot(<span><span className="ln" style={{ background: "#8a6474" }} />เส้นอ้างอิง −23 LUFS</span>)}
          </div>
      );
    } else if (tab === "cmp") {
      const idx = NM.map((x) => x.indexOf(cmpUse)), l = label(NM[0], cmpUse);
      const W = 600, base = rmsDb(OV[0], idx[0], t0, t1, W);
      // ไฟล์ที่ต่างจากไฟล์แรกมากที่สุดเป็นตัวสรุป
      const stats = others.map((f) => {
        const d2 = rmsDb(OV[f], idx[f], t0, t1, W);
        let sum = 0, cnt = 0, mx = 0, mxAt = t0;
        for (let x = 0; x < W; x++) { if (base[x] < -60 || d2[x] < -60) continue; const d = d2[x] - base[x]; sum += Math.abs(d); cnt++; if (Math.abs(d) > Math.abs(mx)) { mx = d; mxAt = t0 + (t1 - t0) * x / W; } }
        return { f, avg: cnt ? sum / cnt : 0, mx, mxAt };
      });
      const top = stats.reduce((a, b) => (Math.abs(b.mx) > Math.abs(a.mx) ? b : a));
      body = (
        <div className="plot cmpplot" data-plot ref={plotRef} data-cmpview="cmp">
          <div className="plothead"><span style={{ display: "flex", alignItems: "center", gap: 10 }}><b>ซ้อนเทียบ</b>
            <span className="psdch-seg"><div className="seg sm">{common.map((c) => <button key={c} type="button" className={cmpUse === c ? "on" : ""} onClick={() => setCmpCh(c)} data-cmpch={c}>{label(NM[0], c).code} {label(NM[0], c).th.split(" ")[0]}</button>)}</div></span>
            {/* หัวกราฟแคบ ปุ่มช่องเป็นดรอปดาวน์ ไฟล์ 5.1 7.1 มีหกถึงแปดปุ่ม (พี่กันสั่ง 13 พ.ย. 2569 "ตัวนี้เปลี่ยนเป็นดรอปดาวด้วย ถ้าจอเล็ก") */}
            <span className="psdch-dd" data-cmpchdd><Dropdown label="ช่องที่ดู" value={cmpUse} onChange={setCmpCh} options={common.map((c) => ({ value: c, label: `${label(NM[0], c).code} ${label(NM[0], c).th.split(" ")[0]}` }))} /></span></span>{zoomBar}</div>
          <div style={{ flex: "1 0 120px", display: "flex", gap: 8, minHeight: 0 }} onWheel={vrCmp.wheel}>
            <div style={{ position: "relative", flex: 1, minWidth: 0, display: "flex" }}>
              <CmpChart key="cmp" vr={vrCmp} grab={cmpGrab} fill height={120} deps={[filesKey, t0, t1, cmpUse, hiC]} lo={-48} hi={0} step={12} unit="dB" series={(w) => OV.map((o, i) => [rmsDb(o, idx[i], t0, t1, w, hiC[files[i]]), FILE_C[i]] as [Float32Array, string])} />
              <VBar v={vrCmp} right={8} />
            </div>
            <FZoom value={vrCmp.z} onChange={vrCmp.setZ} />
          </div>
          <div className="small" style={{ margin: "6px 0 2px" }}><b style={{ color: "var(--txt)" }}>{n === 2 ? `ผลต่าง ${LABELS[1]} ลบ ${LABELS[0]}` : `ผลต่าง แต่ละไฟล์ ลบ ${LABELS[0]}`}</b> กราฟแยก แกนบวกลบ 2 dB</div>
          <div style={{ marginRight: 30 }}><CmpChart grab={cmpGrab} height={80} deps={[filesKey, t0, t1, cmpUse]} lo={-2} hi={2} step={1} unit="dB" diff series={(w) => { const x = rmsDb(OV[0], idx[0], t0, t1, w); return others.map((f) => { const y = rmsDb(OV[f], idx[f], t0, t1, w), d = new Float32Array(w); for (let i = 0; i < w; i++) d[i] = x[i] < -60 || y[i] < -60 ? 0 : y[i] - x[i]; return [d, n === 2 ? "#7a4fb0" : FILE_C[f]] as [Float32Array, string]; }); }} /></div>
          <TimeScroll dur={dur} t0={t0} t1={t1} left={44} right={34} onPan={panT} />
          <Stat kind={Math.abs(top.mx) >= 1 ? "warn" : "info"} b={`ช่อง ${l.code}${n > 2 ? ` ${LABELS[top.f]}` : ""} ต่างกันเฉลี่ย ${top.avg.toFixed(1)} dB มากสุด ${sgn(top.mx)} dB ที่ ${tfmt(top.mxAt)}`}
            d={Math.abs(top.mx) >= 1 ? "ต่างเกินราว 1 dB ที่หูเริ่มแยกได้ ลองเปิดฟังช่วงนั้นเทียบกัน" : "ต่ำกว่าที่หูแยกได้ (ราว 1 dB) และไม่นับช่วงที่เบากว่า −60 dB"} />
        {foot(n === 2 ? <span><span className="ln" style={{ background: "#7a4fb0" }} />ผลต่าง</span> : null)}
          </div>
      );
    } else if (tab === "spek") {
      const heat = lut(HEAT);
      const sub = (i: number) => { const t = T[i]!; return `${t.codec}, ${t.rate.toLocaleString("en-US")} Hz${t.bits ? `, ${t.bits}-bit` : ""}${t.bitrate ? `, ${Math.round(t.bitrate / 1000).toLocaleString("en-US")} kb/s` : ""}, ${NM[i].length} channels mixed${nyq[i] !== maxNyq ? " แกนตั้งเท่ากันทุกไฟล์" : ""}`; };
      body = (
        <div className="plot cmpplot" data-plot ref={plotRef} data-cmpview="spek">
          <div className="plothead"><span><b>ความถี่</b> <span className="prange">ช่วง <RangeTime t0={t0} t1={t1} dur={dur} /></span></span>{zoomBar}</div>
          <div style={{ flex: `1 0 ${n * 122}px`, display: "flex", gap: 8, minHeight: 0 }} onWheel={vrSpek.wheel}>
            <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column" }}>
              {files.map((p, i) => <SpekCv key={p} grab={cmpGrab} deps={[OV[i], t0, t1, maxNyq, vrSpek.z, vrSpek.b, hiC[p]]} draw={(g, w, h) => drawSpekCmp(g, w, h, OV[i], NM[i], nyq[i], maxNyq, t0, t1, nameOf(p), sub(i), edges[i].full ? null : edges[i].top, heat, HEAT, vrSpek.z, vrSpek.b, hiC[p])} data={"abcd"[i]} />)}
            </div>
            <FZoom value={vrSpek.z} onChange={vrSpek.setZ} />
          </div>
          <TimeScroll dur={dur} t0={t0} t1={t1} left={62} right={116} onPan={panT} />
          <Stat {...cutNote} />
          {foot(null)}
        </div>
      );
    } else {
      const ok = psd && psd.key === psdKey;
      const cmpPsdOpts: [string, string][] = [["mix", "รวมทุกช่อง"], ...common.filter((c) => c !== "LFE").slice(0, 6).map((c) => [c, label(NM[0], c).code] as [string, string])];
      body = (
        <div className="plot cmpplot" data-plot ref={plotRef} data-cmpview="psd">
          {/* หัวกราฟแคบ ปุ่มช่องกับปุ่มช่วงที่เลือกเป็นดรอปดาวน์แบบหน้าความถี่เฉลี่ยของไฟล์เดียว (พี่กันสั่ง 13 พ.ย. 2569 "ตัวนี้เปลี่ยนเป็นดรอปดาวด้วย ถ้าจอเล็ก") */}
          <div className="plothead"><span style={{ display: "flex", alignItems: "center", gap: 10 }}><b>ความถี่เฉลี่ย</b>
            <span className="psdch-seg"><div className="seg sm">{cmpPsdOpts.map(([k, l2]) => <button key={k} type="button" className={psdCh === k ? "on" : ""} onClick={() => setPsdCh(k)} data-cmppsdch={k}>{l2}</button>)}</div></span>
            <span className="psdch-dd" data-cmppsdchdd><Dropdown label="ช่องที่ดู" value={psdCh} onChange={setPsdCh} options={cmpPsdOpts.map(([value, label]) => ({ value, label }))} /></span></span>
            <span className="zoombox zfix" style={{ display: "flex", alignItems: "center", gap: 8 }}><span className="lbl">ช่วงที่เลือก</span>
              <span className="zseg"><div className="seg sm">{PSD_SPANS.map(([k, l2]) => <button key={String(k)} type="button" className={String(psdSpan) === String(k) ? "on" : ""} onClick={() => setPsdSpan(k)} data-cmppsdspan={String(k)}>{l2}</button>)}</div></span>
              <span className="zdd" data-cmppsdspandd><Dropdown label="ช่วงที่เลือก" value={String(psdSpan)} onChange={(v) => setPsdSpan(v === "all" ? "all" : Number(v))} options={PSD_SPANS.map(([k, l2]) => ({ value: String(k), label: l2 }))} /></span></span></div>
          {ok ? <PsdCmp list={psd.list} maxNyq={maxNyq} f={psdF} setF={setPsdF} vr={vrPsd} hr={hrPsd} grab={cmpGrab} onReset={() => { setPsdSpan("all"); zoomReset(); }} /> : <div className="skel" style={{ height: 300, borderRadius: 8 }} data-cmppsdwait />}
          <div className="small" style={{ marginTop: 4 }}>{psdSpan === "all" ? `ทั้งไฟล์ ${tfmt(dur)}` : `${tfmt(psdT[0])}–${tfmt(psdT[1])} รอบกลางช่วงที่ดู`} คิดทีละไฟล์ตามลำดับ{ok ? ` และ${n === 2 ? "ทั้งสองไฟล์" : allTxt}ใช้ช่องความถี่กว้าง ${(psd.list[0].rate / psd.list[0].size).toFixed(1)} Hz เท่ากัน จึงเทียบกันได้ตรง` : ""}</div>
          {foot(null)}
        </div>
      );
    }
  }

  return (
    <SavingCtx.Provider value={saving}><div className="ag" data-graph data-compare data-graphview={tab}>
      <div className="agstick">{head}{ctl}</div>
      <div className={"agb" + (wide ? " wide" : n > 2 ? " many" : "")}>{wide ? null : panel}{body}</div>
    </div></SavingCtx.Provider>
  );
}

/** ความถี่เฉลี่ยของสองไฟล์ · แกนนอนแบบล็อก 20 Hz ถึงครึ่งอัตราสุ่มที่สูงกว่า · ชี้แล้วบอกค่าของทั้งสองไฟล์กับผลต่าง */
function PsdCmp({ list, maxNyq, f, setF, vr, hr, grab, onReset }: { list: GPsd[]; maxNyq: number; f: number | null; setF: (f: number | null) => void; vr: VRange; hr: VRange; grab: Grab; onReset: () => void }) {
  const L = 52, R = 18, T = 14, Bm = 30;
  const at = (p: GPsd, fr: number) => { const d = p.db[0], x = fr * p.size / p.rate, i = Math.floor(x); if (i < 0 || i + 1 >= d.length) return -140; return d[i] + (d[i + 1] - d[i]) * (x - i); };
  const fmax = Math.max(20.5, maxNyq);
  const topAll = Math.ceil(Math.max(...list.flatMap((p) => p.db[0].slice(2))) / 6) * 6;
  const { lo: bot, hi: top } = vWindow(topAll - 96, topAll, vr);
  const rise = useRise(list);
  const hrSpan = PSD_HZ_MAX * PSD_HZ_UNIT, setHz = (k: number) => hr.setZ(Math.max(1, Math.min(PSD_HZ_MAX, k)));
  const ref = useCanvas((g, w, h) => {
    g.fillStyle = "#fff"; g.fillRect(0, 0, w, h);
    const PW = w - L - R, PH = h - T - Bm;
    const X = (fr: number) => L + ((Math.log10(Math.max(fr, 20)) - Math.log10(20)) / (Math.log10(fmax) - Math.log10(20)) - hr.b) * hr.z * PW;
    const Y = (v: number) => T + (top - v) / (top - bot) * PH;
    g.font = "11px Sarabun, sans-serif"; g.textAlign = "right"; g.textBaseline = "middle";
    const yStep = vr.z === 1 ? 12 : [1, 2, 3, 6].find((k) => PH * k / (top - bot) >= 18) ?? 12;
    for (let v = Math.floor(top / yStep) * yStep; v >= bot - 0.01; v -= yStep) { g.fillStyle = "#f3e2e9"; g.fillRect(L, Math.round(Y(v)), PW, 1); g.fillStyle = "#a88595"; g.fillText(minus(String(v)) + (v === top ? " dB" : ""), L - 5, Y(v)); }
    g.textAlign = "center"; g.textBaseline = "top";
    const marks = hr.z < 2 ? [1, 2, 5] : hr.z < 6 ? [1, 2, 3, 4, 5, 6, 7, 8, 9] : [1, 1.2, 1.5, 2, 2.5, 3, 3.5, 4, 4.5, 5, 6, 7, 8, 9];
    const labels: number[] = [20];
    for (let dec10 = 10; dec10 <= fmax; dec10 *= 10) for (const m of marks) { const fr = Math.round(m * dec10); if (fr > 20 && fr <= fmax) labels.push(fr); }
    let lastX = -99;
    for (const fr of labels) { const x = X(fr); if (x < L - 1 || x > L + PW + 1) continue; g.fillStyle = "#f3e2e9"; g.fillRect(Math.round(x), T, 1, PH); const txt = fr >= 1000 ? `${fr / 1000}k` : String(fr), tw = g.measureText(txt).width; if (x - tw / 2 < lastX + 8) continue; g.fillStyle = "#a88595"; g.fillText(txt, x, T + PH + 6); lastX = x + tw / 2; }
    g.save(); g.beginPath(); g.rect(L, T, PW, PH); g.clip(); g.translate(0, (T + PH) * (1 - rise)); g.scale(1, rise);
    for (let li = 0; li < list.length; li++) {
      const p = list[li];
      g.strokeStyle = FILE_C[li]; g.lineWidth = 2; g.lineJoin = "round"; g.beginPath();
      let first = true;
      for (let x = 0; x <= PW; x++) { const fr = 20 * Math.pow(fmax / 20, hr.b + x / PW / hr.z); if (fr > p.rate / 2) break; const v = at(p, fr); const y = Y(v); if (first) { g.moveTo(L + x, y); first = false; } else g.lineTo(L + x, y); }
      g.stroke();
    }
    g.restore();
    if (f != null && X(f) >= L && X(f) <= L + PW) { g.fillStyle = "rgba(74,43,56,.5)"; g.fillRect(Math.round(X(f)), T, 1, PH); }
  }, [list, maxNyq, f, rise, vr.z, vr.b, hr.z, hr.b]);
  // ผลต่างช่วงที่ได้ยิน · ไม่นับช่วงที่เบากว่า −100 dB ทั้งคู่
  // หลายไฟล์ เอาไฟล์ที่ต่างจากไฟล์แรกมากสุดเป็นตัวสรุป
  const a = list[0];
  let mx = 0, mxF = 0, mxI = 1, low = 0;
  for (let li = 1; li < list.length; li++) {
    const b = list[li];
    for (let fr = 20; fr <= Math.min(20000, a.rate / 2, b.rate / 2); fr *= 1.01) { const va = at(a, fr), vb = at(b, fr); if (va < -100 && vb < -100) continue; const d = vb - va; if (Math.abs(d) > Math.abs(mx)) { mx = d; mxF = fr; mxI = li; } }
    for (let fr = 20; fr <= Math.min(15000, a.rate / 2, b.rate / 2); fr *= 1.01) { const va = at(a, fr), vb = at(b, fr); if (va < -100 && vb < -100) continue; low = Math.max(low, Math.abs(vb - va)); }
  }
  const fTxt = (fr: number) => (fr >= 1000 ? `${(fr / 1000).toFixed(1)} kHz` : `${Math.round(fr)} Hz`);
  return (<>
    <div style={{ flex: "1 0 180px", display: "flex", gap: 8, minHeight: 0 }}>
      <div className={grab.cls} {...grab.props} style={{ position: "relative", flex: 1, minWidth: 0 }} onWheel={vr.wheel} onPointerMove={(e) => { if (grab.move(e)) return; const r = e.currentTarget.getBoundingClientRect(), PW = r.width - L - R, x = e.clientX - r.left - L; if (x >= 0 && x <= PW) setF(20 * Math.pow(fmax / 20, hr.b + x / PW / hr.z)); }} onPointerLeave={() => setF(null)} data-cmppsd>
        <canvas className="cv fillcv" ref={ref} />
        <VBar v={vr} right={R + 4} top={T} bottom={Bm} />
      </div>
      <FZoom value={vr.z} onChange={vr.setZ} />
    </div>
    <div style={{ marginRight: 30 }} data-cmppsdhscroll><TimeScroll dur={1} t0={hr.b} t1={hr.b + 1 / hr.z} left={L} right={R} onPan={(c) => hr.setB(hr.clampB(c - 0.5 / hr.z, hr.z))} /></div>
    <div className="psdread" data-cmppsdread>
      <span className="zbtns" style={{ order: 9, marginLeft: "auto" }} data-cmppsdhzoom>
        <button type="button" className="zb" onClick={() => setHz(hr.z / 2)} disabled={hr.z <= 1} aria-label="ซูมแกนความถี่ออก" title="ซูมออก (Ctrl หมุนล้อเมาส์ลง)"><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" aria-hidden="true"><circle cx="10.5" cy="10.5" r="6.5" /><path d="M20 20l-4.8-4.8M7.5 10.5h6" /></svg></button>
        <HZoom dur={hrSpan} span={hrSpan / hr.z} onSpan={(sp) => setHz(hrSpan / sp)} name="ซูมแกนความถี่" text={`ซูมแกนความถี่ ${hr.z.toFixed(1)} เท่า`} />
        <button type="button" className="zb" onClick={() => setHz(hr.z * 2)} disabled={hr.z >= PSD_HZ_MAX} aria-label="ซูมแกนความถี่เข้า" title="ซูมเข้า (Ctrl หมุนล้อเมาส์ขึ้น)"><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" aria-hidden="true"><circle cx="10.5" cy="10.5" r="6.5" /><path d="M20 20l-4.8-4.8M7.5 10.5h6M10.5 7.5v6" /></svg></button>
        <button type="button" className="zb" onClick={onReset} aria-label="รีเซ็ตซูม" title="รีเซ็ต กลับทั้งไฟล์ ซูมแนวตั้งกับแนวนอน 1 เท่า" data-zoom-reset><IcRefresh size={15} /></button>
      </span>
      <span className="lbl">ตำแหน่งชี้</span><span className="psdbox" style={{ whiteSpace: "normal" }}>{f == null ? "ชี้บนกราฟเพื่อดูค่า" : `${fTxt(f)} (${noteOf(f)}) = ${list.map((p, i) => `${LABELS[i]} ${minus(at(p, f).toFixed(0))} dB`).join(", ")}${list.length === 2 ? ` ต่างกัน ${Math.abs(at(list[1], f) - at(a, f)).toFixed(1)} dB` : ""}`}</span>
      <span className="lbl">ต่างมากสุดช่วงที่ได้ยิน</span><span className="psdbox">{fTxt(mxF)} {LABELS[mxI]}{mx < 0 ? "บางลง" : "หนาขึ้น"} {Math.abs(mx).toFixed(1)} dB</span>
    </div>
    <Stat kind={low > 3 ? "warn" : "info"} b={`ช่วงที่ได้ยิน 20 Hz ถึง 15 kHz ${list.length === 2 ? "สองเส้น" : `ทุกเส้นจาก${LABELS[0]}`}ต่างกันไม่เกิน ${low.toFixed(1)} dB`} d={`ต่างมากสุดในช่วง 20 Hz ถึง 20 kHz ที่ ${fTxt(mxF)} ${LABELS[mxI]}${mx < 0 ? "บางลง" : "หนาขึ้น"} ${Math.abs(mx).toFixed(1)} dB`} />
  </>);
}