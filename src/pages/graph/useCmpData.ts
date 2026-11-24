/* ไฟล์ที่เทียบ ภาพรวมของแต่ละไฟล์ แท็บ ซูม ช่องที่ซ่อน ผลต่าง และการเพิ่มไฟล์
   แยกจาก CompareView.tsx ตอนจัดโครงไฟล์ตามความหมาย (BUGS ข้อ 155 ขั้น 7) เนื้อโค้ดยกมาทั้งก้อน */
import { useEffect, useMemo, useRef, useState } from "react";
import { listen } from "@tauri-apps/api/event";
import { graphApi, inApp, pickFile, type GProgress, type GPsd } from "../../lib/api";
import { useToast } from "../../components/Toasts";
import { diffOf, type DiffResult } from "../../lib/graphDiff";
import { useSettings } from "../../lib/settings";
import { useFitClass } from "../../lib/fitSwitch";
import { overviewOnce, View } from "./common";
import { useVRange } from "./parts";
import { HZ_MIN } from "./zoom";
import { EMPTY, Side } from "./compareParts";
import { setLabels } from "./cmpLabels";

export type CmpProps = { files: string[]; tracks?: Record<string, number>; note?: string; free?: boolean; onFiles: (files: string[], freed?: boolean) => void; onSingle: (p: string) => void; onBack: () => void; onClose: () => void };

export function useCmpData(p: CmpProps) {
  const { files, tracks, note, free, onFiles, onSingle, onBack, onClose } = p;
  const n = files.length;
  const trOf = (p: string) => tracks?.[p] ?? 0;
  setLabels(files.map((_, i) => (!free && i < 2 ? ["ต้นฉบับ", "หลังแปลง"][i] : `ไฟล์ ${i + 1}`)), !free && n === 2);
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

  return { n, trOf, allTxt, toast, sides, setSides, tab, setTab, zoom, setZoom, center, setCenter, hidden, setHidden, cmpCh, setCmpCh, psdCh, setPsdCh, psdSpan, setPsdSpan, psd, setPsd, psdF, setPsdF, wide, setWide, plotRef, paneH, setPaneH, readDone, filesKey, S, T, NM, union, vis, lens, dur, span, t0, t1, resetN, setResetN, vz, setVz, vrSpec, vrLoud, vrCmp, vrSpek, vrPsd, hrPsd, vrNow, panT, setSpan, zoomReset, settings, zoomOf, switchTab, nyq, maxNyq, common, known, lenDiff, cmpUse, ready, diffMem, diffs, nameOf, toggleCh, addFile, files, tracks, note, free, onFiles, onSingle, onBack, onClose };
}
