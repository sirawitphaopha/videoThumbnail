/* หน้าเสียงและซับ (แผนเสียงและซับ ขั้น 2 · มอคอัป docs/mockups/audio-merge.html หัวข้อ 1 กับ 6)
   ใส่เสียงหรือซับที่โหลดแยกเข้าหนัง เรียงลำดับ ตั้งภาษา ชื่อ แทร็กหลัก ดีเลย์ เอาแทร็กเดิมออก ใส่ปกตั้งปกนอน แล้วรวมรอบเดียว
   พี่กัน *"หัวข้อ เสียงและซับ มันก็ใส่ภาพได้นะ ถ้าเธอแยกหัวข้อแบบนี้เราต้อง merge ไฟล์สองรอบเหรอ"* → ปกอยู่ในคำสั่งรวมเดียวกัน
   ลากไฟล์จาก Explorer มาวางที่ไหนก็ได้ในหน้า โปรแกรมแยกเองว่าไฟล์ไหนเป็นหนัง เสียง ซับ หรือรูป
   ทุกอย่างเก็บใน lib/avJob.ts ไปหน้าอื่นแล้วกลับมายังอยู่ · งานรวมทำเป็นไฟล์ชั่วคราว ตรวจแล้วค่อยเป็นไฟล์จริง แบบหน้าใส่โปสเตอร์ */
import { useCallback, useEffect, useRef, useState } from "react";
import "../styles/av.css";
import type { Page } from "../components/Sidebar";
import Dialog from "../components/Dialog";
import CropDialog, { type CropChoice } from "../components/CropDialog";
import LangPicker from "../components/LangPicker";
import CodecPanel from "../components/CodecPanel";
import DelayDialog from "../components/DelayDialog";
import SubViewer from "../components/SubViewer";
import { convertLabel } from "../lib/codecs";
import ThaiInput from "../components/ThaiInput";
import { CardIcon, Keep, Phr, Seg, dropClick, LoadPill } from "../components/ui";
import { useToast } from "../components/Toasts";
import { ADD_EXT, FONT_EXT, encodeApi, inApp, mergeApi, pickAddFiles, pickFile, pickFonts, posterApi, thumbUrl, type ApplyProblem, type CoverTarget, type EncoderInfo, type FontHit, type MergeResult, type PosterInfo, pairApi } from "../lib/api";
import { useSettings } from "../lib/settings";
import { useLibrary } from "../lib/library";
import { fmtDuration, fmtSize } from "../lib/format";
import { kb } from "../lib/popup";
import { FtChip, ftName } from "../lib/ftypes";
import { langName } from "../lib/langs";
import { getAv, resetAv, setAv, trackFrom, tracksOfAdded, useAv, type AvTrack, type CoverSlot } from "../lib/avJob";
import { IcFile, IcPoster } from "../components/icons";
import { IbSwap, IcSearch, IbTrash, IbBack, IbNext, IbStop, IcRefresh, IcShelf, IcGraph, IcLink, IcMix } from "../components/icons";

const MOVIE_EXT = ["mkv", "mp4", "m4v", "mov", "avi", "webm", "ts", "m2ts", "mpg", "mpeg", "vob", "flv"];
const IMAGE_EXT = ["jpg", "jpeg", "png", "webp", "bmp", "tif", "tiff", "heic", "heif"];
const extOf = (p: string) => (p.match(/\.([^.\\/]+)$/)?.[1] ?? "").toLowerCase();
const baseName = (p: string) => p.split(/[\\/]/).pop() ?? p;
const dirName = (p: string) => p.replace(/[\\/][^\\/]*$/, "");
const KIND_WORD = { video: "ภาพ", audio: "เสียง", subtitle: "ซับ" } as const;
const BUSY = "รอให้งานที่ทำอยู่เสร็จก่อน";
const MAX_DELAY = 600_000;

/** ช่องเสียงแบบที่คนเล่นเสียงเรียก 5.1 · 2.0 · 1.0 */
function chWord(t: AvTrack): string {
  const l = (t.layout ?? "").toLowerCase();
  if (l.startsWith("7.1")) return "7.1";
  if (l.startsWith("5.1")) return "5.1";
  if (l === "stereo" || t.channels === 2) return "2.0";
  if (l === "mono" || t.channels === 1) return "1.0";
  return t.channels ? `${t.channels} ช่อง` : "";
}
function kbps(b: number | null) { return b ? `${Math.round(b / 1000).toLocaleString("en-US")} kbps` : ""; }

/** ชื่อแถวกับบรรทัดรอง (มอคอัป TRACKS) */
function rowText(t: AvTrack, nth: number): { title: string; parts: string[] } {
  const ft = ftName(t.kind, t.codec, t.profile);
  if (t.kind === "video") {
    return { title: `ภาพ · ${t.width ?? "?"} × ${t.height ?? "?"}`, parts: [t.fps ? `${t.fps.toFixed(3).replace(/\.?0+$/, "")} ภาพต่อวินาที` : "", t.duration ? fmtDuration(t.duration) : ""] };
  }
  const where = t.inMovie ? "" : dirName(t.src);
  if (t.kind === "audio") {
    return {
      title: t.inMovie ? `เสียง ${nth}${chWord(t) ? " · " + chWord(t) : ""}` : baseName(t.src),
      parts: [where, t.inMovie ? "" : chWord(t), kbps(t.bitrate), t.bytes ? fmtSize(t.bytes) : ""],
    };
  }
  const image = ft === "PGS" || ft === "VobSub";
  // ซับรูปนับเป็นแพ็กเก็ต (รวมแพ็กเก็ตล้างจอ) ไม่ใช่จำนวนภาพ · เดิมเขียนว่าภาพ ไม่ตรงกับตัวดูซับเกือบสองเท่า (ผู้ช่วยตรวจขั้น 10 ข้อ 19)
  const count = t.frames ? `${t.frames.toLocaleString("en-US")} ${image ? "แพ็กเก็ต" : "บรรทัด"}` : "";
  return {
    title: t.inMovie ? `ซับ ${nth}` : baseName(t.src),
    parts: [where, image ? (ft === "PGS" ? "ซับบลูเรย์ เป็นรูป" : "ซับ DVD เป็นรูป") : ft === "ASS" ? "ตัวหนังสือมีรูปแบบ" : "ตัวหนังสือ", count],
  };
}

/** บรรทัดรอง · ตัดบรรทัดได้เฉพาะตรงจุดคั่น จุดคั่นติดท้ายช่วงก่อนหน้า (มอคอัป dtLine) */
function DtLine({ parts }: { parts: React.ReactNode[] }) {
  const p = parts.filter((x) => x !== "" && x != null);
  return <>{p.map((s, i) => <span key={i}><span className="nw">{s}{i < p.length - 1 ? " ·" : ""}</span>{i < p.length - 1 ? " " : ""}</span>)}</>;
}

function KindIcon({ k }: { k: AvTrack["kind"] }) {
  return (
    <span className={"kind " + (k === "video" ? "v" : k === "audio" ? "a" : "s")} aria-hidden="true">
      {k === "video" && <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2"><rect x="3" y="5" width="18" height="14" rx="2" /><path d="M10 9l5 3-5 3z" /></svg>}
      {k === "audio" && <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2"><path d="M4 10v4M8 7v10M12 4v16M16 8v8M20 10v4" /></svg>}
      {k === "subtitle" && <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2"><rect x="3" y="5" width="18" height="14" rx="2" /><path d="M7 14h4M13 14h4M7 10h10" /></svg>}
    </span>
  );
}

export default function AvPage(p: { initialPath: string | null; onConsumed: () => void; onPage: (pg: Page) => void; onGraph: (path: string) => void }) {
  const { settings } = useSettings();
  const toast = useToast();
  const { movies } = useLibrary();
  const av = useAv();
  const { movie, tracks, sel, covers, run } = av;
  const [loading, setLoading] = useState<string | null>(null);
  /** เลขคำขอเปิดหนังล่าสุด (ผู้ช่วยตรวจขั้น 10 ข้อ 20) */
  const loadSeq = useRef(0);
  const [movieErr, setMovieErr] = useState<string | null>(null);
  const [over, setOver] = useState<string | null>(null);
  const [crop, setCrop] = useState<{ slot: CoverTarget; info: PosterInfo; start: CropChoice | null } | null>(null);
  const [slotErr, setSlotErr] = useState<{ slot: CoverTarget; text: string } | null>(null);
  const [askVtt, setAskVtt] = useState(false);
  const [askDelete, setAskDelete] = useState<0 | 1 | 2>(0);
  const [askStop, setAskStop] = useState(false);
  /** แถวที่เปิดแผงตั้งค่าเสียง · ตัวแปลงที่มี (อ่านครั้งแรกที่เปิดแผง) */
  const [codecFor, setCodecFor] = useState<string | null>(null);
  /** ความเร็วเสียงที่ตัวช่วยหาดีเลย์เสนอ ส่งต่อให้แผงตั้งค่าเสียง */
  const [codecSpeed, setCodecSpeed] = useState<string | null>(null);
  const [delayFor, setDelayFor] = useState<string | null>(null);
  const [subFor, setSubFor] = useState<string | null>(null);
  /** วิธี รวมเข้าไฟล์หนัง หรือจับคู่ไว้ ไม่รวม (มอคอัปหัวข้อ 5) */
  const [method, setMethod] = useState<"merge" | "pair">("merge");
  const [paired, setPaired] = useState<{ n: number; err?: string } | null>(null);
  const [encs, setEncs] = useState<EncoderInfo[] | null>(null);
  const openCodec = (key: string) => { setCodecFor(key); if (!encs) encodeApi.status().then(setEncs, () => setEncs([])); };
  const output = (av.once.output ?? settings?.outputFormat ?? "mkv") as "mkv" | "mp4";
  const original = (av.once.original ?? settings?.originalAfter ?? "keep") as "keep" | "trash";
  const working = run.state === "working";

  // ---------- ไฟล์หนัง ----------
  const loadMovie = useCallback(async (path: string) => {
    // เลขคำขอ · ผลของคำขอที่ไม่ใช่ล่าสุดทิ้ง (เปิดหนัง ก แล้วรีบเลือก ข ผลของ ก มาทีหลังเคยทับ · ผู้ช่วยตรวจขั้น 10 ข้อ 20)
    const my = ++loadSeq.current;
    setMovieErr(null);
    const ext = extOf(path);
    if (!MOVIE_EXT.includes(ext)) { setMovieErr(`ไฟล์ .${ext || "?"} ไม่ใช่ไฟล์หนังที่ใช้ได้`); return false; }
    setLoading("movie");
    try {
      const m = await mergeApi.inspect(path);
      if (my !== loadSeq.current) return false;
      const slot = (stem: string): CoverSlot => {
        const att = m.attachments.find((a) => a.name.toLowerCase().replace(/\.[^.]+$/, "") === stem) ?? null;
        return { mode: "keep", old: att ? { att, preview: null } : null, neu: null };
      };
      mergeApi.coverDrop(null).catch(() => {});
      setAv({ movie: m, tracks: m.tracks.map((t) => trackFrom(t)), sel: null, covers: { cover: slot("cover"), cover_land: slot("cover_land") }, run: { state: "idle" }, fontExtra: [], fontOff: [] });
      // ภาพของปกเดิม ดึงทีหลัง ไม่ให้หน้ารอ
      for (const s of ["cover", "cover_land"] as CoverTarget[]) {
        const old = getAv().covers[s].old;
        if (old) mergeApi.coverPreview(m.path, old.att.id, s).then((pv) => {
          const cur = getAv();
          if (cur.movie?.path !== m.path || !cur.covers[s].old) return;
          setAv({ covers: { ...cur.covers, [s]: { ...cur.covers[s], old: { ...cur.covers[s].old!, preview: pv } } } });
        }).catch(() => {});
      }
      return true;
    } catch (e) {
      if (my === loadSeq.current) setMovieErr(String(e));
      return false;
    } finally {
      if (my === loadSeq.current) setLoading(null);
    }
  }, []);

  // ---------- เพิ่มไฟล์เสียงซับ ----------
  const addFiles = useCallback(async (paths: string[]) => {
    const m = getAv().movie;
    if (!m) { toast({ kind: "warn", title: "ใส่ไฟล์หนังก่อน", detail: "ลากไฟล์หนังมาวาง แล้วค่อยลากเสียงหรือซับตามมา" }); return; }
    for (const path of paths) {
      // เปลี่ยนหนังระหว่างอ่านไฟล์ที่ลากมาหลายไฟล์ ไฟล์ที่เหลือไม่เพิ่มเข้าหนังเรื่องใหม่ (ข้อ 20)
      if (getAv().movie?.path !== m.path) break;
      if (path.toLowerCase() === m.path.toLowerCase()) {
        toast({ kind: "warn", title: "ไฟล์นี้คือไฟล์หนังที่เปิดอยู่", detail: "แทร็กของหนังอยู่ในตารางแล้ว ไม่ต้องเพิ่มซ้ำ" });
        continue;
      }
      if (getAv().tracks.some((t) => !t.inMovie && t.src.toLowerCase() === path.toLowerCase())) {
        toast({ kind: "warn", title: "ไฟล์นี้เพิ่มไว้แล้ว", detail: baseName(path) });
        continue;
      }
      setLoading("add");
      try {
        const f = await mergeApi.addFile(path, m.duration);
        if (getAv().movie?.path !== m.path) break;
        const added = tracksOfAdded(f);
        // แทร็กใหม่ต่อท้ายกลุ่มชนิดเดียวกัน ภาพ เสียง ซับ ยังอยู่เป็นกลุ่ม
        setAv((s) => {
          const list = [...s.tracks];
          for (const t of added) {
            const order = { video: 0, audio: 1, subtitle: 2 };
            let at = list.length;
            for (let i = list.length - 1; i >= 0; i--) { if (order[list[i].kind] <= order[t.kind]) { at = i + 1; break; } if (i === 0) at = 0; }
            list.splice(at, 0, t);
          }
          return { tracks: list, sel: added[0]?.key ?? s.sel, run: s.run.state === "working" ? s.run : { state: "idle" } };
        });
        // ข้อความแจ้งของไฟล์ (เช่น ซับ TIS-620 แปลงให้) อยู่ที่ป้ายในแถวกับการ์ดตั้งค่าแทร็ก · เดิมขึ้นแถบแจ้งด้วย ค้างบนจอบังรายการภาษากับช่องปก (เจอตอนตรวจภาพ)
      } catch (e) {
        toast({ kind: "bad", title: `เพิ่ม ${baseName(path)} ไม่ได้`, detail: String(e) });
      } finally {
        setLoading(null);
      }
    }
  }, [toast]);

  // ---------- ฟอนต์ของซับ ASS ที่ลากมาเพิ่มเอง (พี่กันสั่ง 8 พ.ย. 2569) ----------
  const addFonts = useCallback(async (paths: string[]) => {
    if (!getAv().movie) { toast({ kind: "warn", title: "ใส่ไฟล์หนังก่อน", detail: "ฟอนต์ใช้ฝังไปกับซับ ASS ตอนรวม" }); return; }
    for (const path of paths) {
      if (getAv().fontExtra.some((f) => f.path.toLowerCase() === path.toLowerCase())) continue;
      try {
        const f = await mergeApi.fontInfo(path);
        setAv((s) => ({ fontExtra: [...s.fontExtra, f], fontOff: s.fontOff.filter((x) => x !== f.path) }));
      } catch (e) {
        toast({ kind: "bad", title: `เพิ่มฟอนต์ ${baseName(path)} ไม่ได้`, detail: String(e) });
      }
    }
  }, [toast]);

  // ---------- ปก ----------
  const openCover = useCallback(async (path: string, slot: CoverTarget | null) => {
    setSlotErr(null);
    const ext = extOf(path);
    if (!IMAGE_EXT.includes(ext)) { setSlotErr({ slot: slot ?? "cover", text: `ไฟล์ .${ext || "?"} ไม่ใช่รูปที่ใช้ได้` }); return; }
    setLoading("cover");
    try {
      const info = await posterApi.open(path, slot ?? "cover");
      // วางรูปนอกช่อง · รูปแนวนอนไปช่องปกนอน นอกนั้นไปช่องปกตั้ง
      const s: CoverTarget = slot ?? (info.width > info.height ? "cover_land" : "cover");
      setCrop({ slot: s, info, start: null });
    } catch (e) {
      setCrop(null); // เลือกรูปใหม่จากหน้าต่างครอปแล้วเปิดไม่ได้ ปิดให้เห็นเหตุผลบนช่องปก
      setSlotErr({ slot: slot ?? "cover", text: String(e) });
    } finally {
      setLoading(null);
    }
  }, []);
  const setSlot = (slot: CoverTarget, patch: Partial<CoverSlot>) => setAv((s) => ({ covers: { ...s.covers, [slot]: { ...s.covers[slot], ...patch } } }));

  // มาจากปุ่มเสียงและซับบนชั้นวาง · ใส่ไฟล์หนังให้เลย
  useEffect(() => {
    if (p.initialPath) {
      if (getAv().run.state !== "working") loadMovie(p.initialPath);
      p.onConsumed();
    }
  }, [p.initialPath, loadMovie, p]);

  // ---------- ลากไฟล์จาก Explorer มาวาง ----------
  // ตำแหน่งเมาส์ที่ได้เป็นพิกเซลจริงของจอ หารด้วยอัตราขยายของจอก่อนหาช่องใต้เมาส์ (TECH-REVIEW ข้อ 11)
  const zoneAt = (x: number, y: number) => document.elementFromPoint(x / devicePixelRatio, y / devicePixelRatio)?.closest<HTMLElement>("[data-drop]")?.dataset.drop ?? null;
  const handleDrop = useCallback(async (paths: string[], x: number, y: number) => {
    setOver(null);
    if (getAv().run.state === "working" || !paths.length) return;
    const zone = zoneAt(x, y);
    const movies = paths.filter((f) => MOVIE_EXT.includes(extOf(f)));
    const images = paths.filter((f) => IMAGE_EXT.includes(extOf(f)));
    const adds = paths.filter((f) => ADD_EXT.includes(extOf(f)));
    const fontFiles = paths.filter((f) => FONT_EXT.includes(extOf(f)));
    const other = paths.filter((f) => !movies.includes(f) && !images.includes(f) && !adds.includes(f) && !fontFiles.includes(f));
    if (images.length) openCover(images[0], zone === "cover" || zone === "cover_land" ? zone : null);
    // หนังที่วางในช่องเพิ่มไฟล์ (MKV ที่มีแต่เสียง) นับเป็นไฟล์ที่เพิ่ม · นอกนั้นเป็นหนังเรื่องใหม่
    if (movies.length && zone === "add" && getAv().movie) adds.push(...movies);
    else if (movies.length && !(await loadMovie(movies[0]))) return;
    if (adds.length) await addFiles(adds);
    if (fontFiles.length) await addFonts(fontFiles);
    if (other.length) toast({ kind: "warn", title: `ใช้ไม่ได้ ${other.length} ไฟล์`, detail: other.map(baseName).join(" · ") });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loadMovie, addFiles, addFonts, openCover, toast]);
  useEffect(() => {
    if (!inApp) return;
    let off: (() => void) | undefined;
    let live = true;
    import("@tauri-apps/api/webview").then(({ getCurrentWebview }) => getCurrentWebview().onDragDropEvent((e) => {
      const t = e.payload.type;
      if (t === "over" || t === "enter") setOver(zoneAt(e.payload.position.x, e.payload.position.y) ?? "page");
      else if (t === "drop") handleDrop(e.payload.paths, e.payload.position.x, e.payload.position.y);
      else setOver(null);
    })).then((u) => { if (live) off = u; else u(); });
    return () => { live = false; off?.(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [handleDrop]);
  // ตัวเทสหน้าจอเรียกตรงนี้แทนการลากจริง (มีเฉพาะตอนทดสอบ)
  useEffect(() => {
    if (!import.meta.env.DEV) return;
    const w = window as unknown as Record<string, unknown>;
    w.__avDrop = handleDrop;
    w.__avOver = setOver;
    return () => { delete w.__avDrop; delete w.__avOver; };
  }, [handleDrop]);

  // ---------- แก้แถว ----------
  const patch = (key: string, ch: Partial<AvTrack>) => setAv((s) => ({ tracks: s.tracks.map((t) => (t.key === key ? { ...t, ...ch } : t)) }));
  /** แทร็กหลักมีได้แทร็กเดียวต่อชนิด · กดซ้ำที่แทร็กหลักเดิม = ไม่มีแทร็กหลักของชนิดนั้น */
  const setMain = (key: string) => setAv((s) => {
    const me = s.tracks.find((t) => t.key === key);
    if (!me || me.kind === "video") return {};
    const on = !me.default;
    return { tracks: s.tracks.map((t) => (t.kind === me.kind ? { ...t, default: t.key === key ? on : false } : t)) };
  });
  const move = (key: string, d: -1 | 1) => setAv((s) => {
    const i = s.tracks.findIndex((t) => t.key === key), j = i + d;
    if (i < 0 || j < 0 || j >= s.tracks.length) return {};
    const list = [...s.tracks];
    [list[i], list[j]] = [list[j], list[i]];
    return { tracks: list };
  });
  const removeAdded = (src: string) => setAv((s) => ({ tracks: s.tracks.filter((t) => t.inMovie || t.src !== src), sel: null }));
  const setDelay = (key: string, v: number) => patch(key, { delay: Math.max(-MAX_DELAY, Math.min(MAX_DELAY, Math.round(v))) });

  // ---------- สรุปก่อนเริ่ม ----------
  const kept = tracks.filter((t) => t.keep);
  const counts = { video: kept.filter((t) => t.kind === "video").length, audio: kept.filter((t) => t.kind === "audio").length, subs: kept.filter((t) => t.kind === "subtitle").length, out: tracks.filter((t) => !t.keep).length };
  const coverChanged = covers.cover.mode !== "keep" || covers.cover_land.mode !== "keep";
  const movieOrder = tracks.filter((t) => t.inMovie).map((t) => t.tid).join(",");
  const origOrder = movie?.tracks.map((t) => t.tid).join(",") ?? "";
  const changed = !!movie && (
    tracks.some((t) => !t.inMovie) || tracks.some((t) => t.lang !== t.base.lang || t.name !== t.base.name || t.default !== t.base.default || t.delay !== t.base.delay || t.keep !== t.base.keep)
    || tracks.some((t) => t.keep && !!t.convert) || movieOrder !== origOrder || coverChanged || output !== movie.ext.replace("m4v", "mp4") && !(output === "mkv" && movie.ext === "mkv"));
  // แทร็กที่ตั้งแปลง ใส่ MP4 ได้ไหมดูชนิดหลังแปลง (WavPack ใส่ไม่ได้) · แทร็กในหนังแบบเพิ่มคู่ แทร็กเดิมยังอยู่ ต้องใส่ได้ด้วย
  // กติกาเดียวกับฝั่ง Rust (merge.rs mp4_unfit · ผู้ช่วยตรวจขั้น 10 ข้อ 2 · เดิมแบบเพิ่มคู่ไม่เตือน แบบแทนที่ฝั่ง Rust ปฏิเสธ)
  const mp4Of = (t: AvTrack) => {
    if (!t.convert) return t.ff == null ? "no" : t.mp4;
    if (t.inMovie && (t.pair ?? true) && (t.mp4 === "no" || t.ff == null)) return "no";
    return t.convert.codec === "wv" ? "no" : "ok";
  };
  const mp4Bad = output === "mp4" ? kept.filter((t) => mp4Of(t) === "no") : [];
  const mp4Style = output === "mp4" ? kept.filter((t) => t.mp4 === "style") : [];
  const vtts = output === "mkv" ? kept.filter((t) => !t.inMovie && t.codec === "webvtt") : [];
  const longer = kept.filter((t) => !t.inMovie && t.kind === "audio" && t.longerBy != null && Math.abs(t.longerBy) >= 2);
  const removedBytes = tracks.filter((t) => !t.keep && t.inMovie).reduce((s, t) => s + (t.bytes ?? 0), 0);
  const addedFiles = [...new Set(kept.filter((t) => !t.inMovie).map((t) => t.src))];
  const addedBytes = addedFiles.reduce((s, src) => s + (src ? 0 : 0), 0);
  const estimate = movie ? movie.size - removedBytes + addedBytes + kept.filter((t) => !t.inMovie).reduce((s, t) => s + (t.bytes ?? (t.bitrate && t.duration ? t.bitrate / 8 * t.duration : 0)), 0) : 0;
  // ฟอนต์ของซับ ASS ที่เพิ่ม (fonts.rs) · ชื่อไม่ซ้ำ · ฟอนต์ที่หาไม่เจอใช้ไฟล์ที่ลากมาเพิ่มเองถ้าชื่อในไฟล์ตรง · ไฟล์แนบชื่อเดียวกันในหนังแล้วไม่ฝังซ้ำ
  const fontRows: (FontHit & { inMovie: boolean; on: boolean })[] = (() => {
    const rows: FontHit[] = [];
    for (const t of kept) for (const h of t.fonts ?? []) if (!rows.some((r) => r.name.toLowerCase() === h.name.toLowerCase())) rows.push(h);
    const extra = [...av.fontExtra];
    const filled: FontHit[] = rows.map((r) => {
      if (r.file) return r;
      const i = extra.findIndex((e) => e.names.some((n) => n.toLowerCase() === r.name.toLowerCase()));
      if (i < 0) return r;
      const e = extra.splice(i, 1)[0];
      return { ...r, file: e.path, from: "added", size: e.size };
    });
    // ไฟล์ที่ลากมาแต่ซับไม่ได้เรียกชื่อตรง (เช่นชื่อในซับสะกดต่างไป) ยังฝังได้
    for (const e of extra) if (!filled.some((r) => r.file === e.path)) filled.push({ name: e.names[0], file: e.path, from: "added", size: e.size });
    return filled.map((r) => {
      const inMovie = !!r.file && !!movie?.attachments.some((a) => a.name.toLowerCase() === baseName(r.file!).toLowerCase());
      return { ...r, inMovie, on: !!r.file && !inMovie && !av.fontOff.includes(r.file) };
    });
  })();
  const fontFiles = [...new Set(fontRows.filter((r) => r.on).map((r) => r.file!))];
  const fontBytes = fontFiles.reduce((s, f) => s + (fontRows.find((r) => r.file === f)?.size ?? 0), 0);
  const blocked = !movie ? "ยังกดไม่ได้ ใส่ไฟล์หนังก่อน"
    : !kept.some((t) => t.kind === "video") ? "ไฟล์ใหม่ต้องมีภาพ เอาแทร็กภาพกลับมาก่อน"
    : mp4Bad.length ? "เลือกก่อนว่าจะเอาแทร็กที่ใส่ใน MP4 ไม่ได้ออก หรือกลับไปใช้ MKV"
    : !changed ? "ยังไม่ได้เปลี่ยนอะไร เพิ่มไฟล์ แก้แทร็ก หรือใส่ปกก่อน"
    : null;

  const start = async () => {
    const s = getAv();
    if (!s.movie) return;
    setAv({ run: { state: "working", progress: null }, runMovie: s.movie.path });
    try {
      const result = await mergeApi.apply({
        movie: s.movie.path,
        tracks: s.tracks.map(({ key: _k, base: _b, delayFromName: _d, longerBy: _l, notes: _n, fonts: _f, ...t }) => t),
        covers: { portrait: s.covers.cover.mode, land: s.covers.cover_land.mode },
        output, original, checkSource: settings?.checkSourceBefore ?? true, checkOutput: settings?.checkOutputAfter ?? true,
        fonts: fontFiles,
      });
      // ไฟล์เดิมย้ายไปแล้ว หน้าว่าง เหลือการ์ดผล
      resetAv(true);
      setAv({ run: { state: "done", result } });
    } catch (e) {
      const problem = e && typeof e === "object" && "title" in e ? (e as ApplyProblem) : { kind: "other", title: "รวมไฟล์ไม่สำเร็จ", detail: [String(e)] };
      setAv({ run: { state: "failed", problem } });
    }
  };
  /** ทุกทางที่เริ่มงานผ่านตัวนี้ · ① มีซับ VTT บอกก่อนว่าจะแปลงเป็น SRT ② ตั้งลบไฟล์เดิม ยืนยัน 2 ขั้น (แบบหน้าใส่โปสเตอร์) */
  const pressStart = (stepVttDone = false) => {
    if (blocked || working) return;
    if (vtts.length && !stepVttDone) { setAskVtt(true); return; }
    if (original === "trash") { setAskDelete(1); return; }
    start();
  };
  const clearAll = () => {
    if (working) return;
    resetAv();
    setMovieErr(null);
    mergeApi.coverDrop(null).catch(() => {});
    posterApi.clear("cover").catch(() => {});
  };

  const runBox = useRef<HTMLDivElement>(null);
  useEffect(() => { runBox.current?.scrollIntoView({ block: "nearest", behavior: "smooth" }); }, [run.state]);
  const pct = working && run.progress ? Math.round(run.progress.percent) : 0;
  const inLib = movie ? movies.find((m) => m.path.toLowerCase() === movie.path.toLowerCase()) : undefined;
  /** จับคู่ได้เฉพาะเสียงกับซับที่เพิ่มจากไฟล์แยก · ไฟล์ในตัวหนัง (MKV ที่มีหลายแทร็ก) จับคู่ทั้งไฟล์ */
  const pairable = tracks.filter((t) => !t.inMovie && t.keep && (t.kind === "audio" || t.kind === "subtitle"));
  const pairBlocked = !movie ? "ยังกดไม่ได้ ใส่ไฟล์หนังก่อน" : !inLib ? "หนังเรื่องนี้ไม่ได้อยู่บนชั้น เพิ่มโฟลเดอร์ของหนังในหน้าตั้งค่าก่อน"
    : !pairable.length ? "ยังไม่มีเสียงหรือซับที่เพิ่ม ลากไฟล์มาวางก่อน" : null;
  /** การจับคู่ที่บันทึกไว้แล้วของเรื่องนี้ · บันทึกใหม่แทนทั้งชุด จึงให้ใส่ของเดิมลงตารางก่อนได้ (ผู้ช่วยตรวจขั้น 10 ข้อ 15 · เดิมกดแก้การจับคู่แล้วคู่เดิมไม่ขึ้น บันทึกแล้วหาย) */
  const savedPairs = inLib?.pairs ?? [];
  const pairsNotInTable = savedPairs.filter((p) => !tracks.some((t) => !t.inMovie && t.src.toLowerCase() === p.path.toLowerCase()));
  const loadSavedPairs = async () => {
    await addFiles(pairsNotInTable.map((p) => p.path));
    setAv((st) => ({ tracks: st.tracks.map((t) => {
      const p = savedPairs.find((x) => !t.inMovie && x.kind === t.kind && x.path.toLowerCase() === t.src.toLowerCase());
      return p ? { ...t, lang: p.lang || t.lang, name: p.name || t.name, delay: p.delay } : t;
    }) }));
  };
  const savePairs = () => {
    if (pairBlocked || !movie) return;
    const list = pairable.map((t) => ({ path: t.src, kind: t.kind as "audio" | "subtitle", lang: t.lang, name: t.name, delay: Math.round(t.delay) }));
    const uniq = list.filter((x, i) => list.findIndex((y) => y.path === x.path && y.kind === x.kind) === i);
    // บอกผลในการ์ดของหน้าที่เดียว (เดิมขึ้นแจ้งเตือนซ้ำ บังการ์ด เจอตอนตรวจภาพ)
    pairApi.set(movie.path, uniq).then(() => setPaired({ n: uniq.length }),
      (e) => setPaired({ n: 0, err: String(e) }));
  };
  const selected = tracks.find((t) => t.key === sel) ?? null;
  /** เสียงเดิมในหนังที่ใช้เทียบตอนหาดีเลย์ · เสียงแรกในหนังที่ยังเก็บไว้ */
  const refAudio = tracks.find((t) => t.inMovie && t.kind === "audio" && t.keep) ?? tracks.find((t) => t.inMovie && t.kind === "audio") ?? null;
  const nth = (t: AvTrack) => tracks.filter((x) => x.inMovie && x.kind === t.kind && x.tid <= t.tid).length;

  // ---------- หน้าว่าง ----------
  if (!movie) {
    return (
      <div className="pagewrap" data-av-page>
        <div className="avwrap">
          {run.state !== "idle" && <div ref={runBox} className="card workbox" data-run={run.state}><RunCard run={run} pct={pct} runMovie={av.runMovie} onStop={() => setAskStop(true)} onShelf={() => p.onPage("shelf")} onGraph={p.onGraph} onRetry={() => setAv({ run: { state: "idle" } })} /></div>}
          <div className="card">
            <h3>เสียงและซับ</h3>
            <div className={"drop" + (over && over !== null ? " over" : movieErr ? " bad" : "")} data-drop="movie" style={{ minHeight: 190 }} onClick={dropClick(async () => { if (working) return; const f = await pickFile("movie"); if (f) loadMovie(f); })}>
              <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="#e5a3bd" strokeWidth="1.8" aria-hidden="true"><rect x="3" y="5" width="18" height="14" rx="2" /><path d="M10 9l5 3-5 3z" /></svg>
              {over ? <b>ปล่อยเมาส์เพื่อใส่ไฟล์นี้</b>
                : movieErr ? <><b>{movieErr}</b><div><Phr>ไฟล์หนังรองรับ MKV MP4 M4V MOV AVI WebM TS M2TS MPG MPEG VOB FLV</Phr></div></>
                : loading === "movie" ? "กำลังอ่านไฟล์หนัง…"
                : <><b style={{ color: "var(--txt2)" }}>ลากไฟล์หนังมาวางตรงนี้</b><span>แล้วลากไฟล์เสียงหรือซับตามมาวางได้เลย</span></>}
              <button type="button" className={"btn btn-sm " + (working ? "btn-wait" : "btn-ghost")} aria-disabled={working || undefined} title={working ? BUSY : undefined}
                onClick={async () => { if (working) return; const f = await pickFile("movie"); if (f) loadMovie(f); }}><IcFile size={15} />เลือกไฟล์จากเครื่อง</button>
            </div>
            <div className="small" style={{ marginTop: 10 }}><Phr>{`ลากหนังกับเสียงมาพร้อมกันได้ โปรแกรมแยกให้เองว่าไฟล์ไหนเป็นหนัง · รับไฟล์หนัง ${MOVIE_EXT.map((e) => e.toUpperCase()).join(" ")}`}</Phr></div>
          </div>
        </div>
        <StopDialog open={askStop} pct={pct} name={av.runMovie} onClose={() => setAskStop(false)} />
      </div>
    );
  }

  return (
    <div className="pagewrap" data-av-page>
      <div className="avwrap">
        {/* ไฟล์หนัง */}
        <div className="avtop" data-drop="movie">
          <div className="avchip" data-movie-chip>
            {inLib?.thumb ? <img className="avthumb" src={thumbUrl(inLib.thumb) ?? undefined} alt="" /> : <div className="avthumb" />}
            <div style={{ minWidth: 0 }}>
              <div className="nm">{movie.name}<span className="ext">.{movie.ext}</span></div>
              <div className="meta"><DtLine parts={[dirName(movie.path), fmtSize(movie.size), movie.duration ? fmtDuration(movie.duration) : "",
                `ภาพ ${movie.tracks.filter((t) => t.kind === "video").length} · เสียง ${movie.tracks.filter((t) => t.kind === "audio").length} · ซับ ${movie.tracks.filter((t) => t.kind === "subtitle").length}`,
                covers.cover.old ? "ปกตั้ง" : "", covers.cover_land.old ? "ปกนอน" : ""]} /></div>
            </div>
          </div>
          <button type="button" className={"btn btn-sm " + (working ? "btn-wait" : "btn-ghost")} aria-disabled={working || undefined} title={working ? BUSY : undefined}
            onClick={async () => { if (working) return; const f = await pickFile("movie"); if (f) loadMovie(f); }}><IbSwap size={15} />เปลี่ยนไฟล์หนัง</button>
        </div>
        {movieErr && <div className="stat bad" role="alert"><CardIcon kind="bad" /><div><b>{movieErr}</b></div></div>}

        {/* ตารางแทร็ก */}
        <div className="card">
          <h3 style={{ justifyContent: "space-between" }}><span>แทร็กในไฟล์ใหม่ · เรียงตามลำดับ</span>
            <span className="small" style={{ fontWeight: 400 }} data-counts>ภาพ {counts.video} · เสียง {counts.audio} · ซับ {counts.subs}{counts.out ? ` · เอาออก ${counts.out}` : ""}</span></h3>
          <div className="tracks" role="list" aria-label="แทร็กในไฟล์ใหม่">
            <div className="trk head" aria-hidden="true"><span></span><span></span><span>ชนิด</span><span>แทร็ก · ชื่อแทร็ก</span><span>ภาษา</span><span style={{ textAlign: "center" }}>หลัก</span><span>ดีเลย์ (ms)</span><span>แปลง</span><span></span></div>
            {tracks.map((t, i) => {
              const { title, parts } = rowText(t, nth(t));
              const ft = ftName(t.kind, t.codec, t.profile);
              const pills = [
                <span key="a" className={"tpill " + (t.inMovie ? "in" : "new")}>{t.inMovie ? "ในหนัง" : "เพิ่มใหม่"}</span>,
                !t.keep ? <span key="b" className="tpill off">เอาออก</span> : null,
                t.convert && t.keep ? <span key="f" className="tpill conv">แปลง</span> : null,
                !t.inMovie && t.delayFromName != null && t.delay === t.delayFromName && t.delay !== 0 ? <span key="c" className="tpill warn">ดีเลย์จากชื่อไฟล์</span> : null,
                t.charset === "CP874" ? <span key="d" className="tpill warn">TIS-620</span> : t.charset === "CP1252" ? <span key="d" className="tpill warn" title="ไม่ใช่ UTF-8 และไม่ใช่อักษรไทย อ่านแบบ Windows-1252 (ซับภาษายุโรปแบบเก่า)">Windows-1252</span> : null,
                output === "mkv" && !t.inMovie && t.codec === "webvtt" ? <span key="e" className="tpill conv">แปลงเป็น SRT</span> : null,
              ].filter(Boolean);
              const off = working ? BUSY : undefined;
              return (
                <div key={t.key} role="listitem" className={"trk" + (t.keep ? "" : " out") + (t.key === sel ? " sel" : "")} onClick={() => setAv({ sel: t.key })} data-trk={t.key} data-kind={t.kind}>
                  <div className="mv" onClick={(e) => e.stopPropagation()}>
                    <button type="button" aria-label={`เลื่อน ${title} ขึ้น`} aria-disabled={i === 0 || !!off || undefined} title={off} onClick={() => { if (i > 0 && !off) move(t.key, -1); }}>
                      <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" aria-hidden="true"><path d="M6 15l6-6 6 6" /></svg></button>
                    <button type="button" aria-label={`เลื่อน ${title} ลง`} aria-disabled={i === tracks.length - 1 || !!off || undefined} title={off} onClick={() => { if (i < tracks.length - 1 && !off) move(t.key, 1); }}>
                      <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" aria-hidden="true"><path d="M6 9l6 6 6-6" /></svg></button>
                  </div>
                  <KindIcon k={t.kind} />
                  <div><FtChip name={ft} /></div>
                  <div style={{ minWidth: 0 }}>
                    <div className="nm">{title}</div>
                    <div className="dt"><DtLine parts={[...pills, t.name ? <>ชื่อ <b style={{ color: "var(--txt2)" }}>{t.name}</b></> : "", ...parts]} /></div>
                  </div>
                  {t.kind === "video" ? <span className="small">{langName(t.lang)}</span>
                    : <LangPicker value={t.lang} label={`ภาษาของ ${title}`} onChange={(v) => patch(t.key, { lang: v })} disabled={off} />}
                  <div style={{ display: "flex", justifyContent: "center" }} onClick={(e) => e.stopPropagation()}>
                    {t.kind === "video" ? <span className="small">—</span>
                      : <span className={"radio" + (t.default ? " on" : "")} aria-checked={t.default} aria-label={`ตั้ง ${title} เป็น${KIND_WORD[t.kind]}หลัก`}
                        aria-disabled={!!off || !t.keep || undefined} title={off ?? (!t.keep ? "แทร็กที่เอาออกตั้งเป็นหลักไม่ได้" : undefined)}
                        {...kb(() => { if (!off && t.keep) setMain(t.key); })} role="radio" data-main style={{ cursor: off || !t.keep ? "not-allowed" : "pointer", marginTop: 0 }} />}
                  </div>
                  {t.kind === "video" ? <span className="small">—</span> : <DelayBox value={t.delay} onChange={(v) => setDelay(t.key, v)} label={title} off={off} />}
                  {t.kind === "audio" ? (
                    <button type="button" className={"dd" + (off || !t.keep ? " btn-wait" : "")} aria-disabled={!!off || !t.keep || undefined} title={off ?? (!t.keep ? "แทร็กที่เอาออกไม่ต้องแปลง" : "ตั้งค่าแปลงเสียง")}
                      style={t.convert ? { border: "1px solid #9fc4ea", background: "#f3f8fe", color: "#2f6496" } : undefined}
                      onClick={(e) => { e.stopPropagation(); if (!off && t.keep) openCodec(t.key); }} data-conv>
                      <span style={{ overflow: "hidden", textOverflow: "ellipsis" }}>{t.convert ? `${convertLabel(t.convert)}${t.inMovie ? (t.pair ?? true ? " · เพิ่มคู่" : " · แทนที่") : ""}` : "ไม่แปลง"}</span>
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" aria-hidden="true"><path d="M6 9l6 6 6-6" /></svg>
                    </button>
                  ) : <span className="small">{t.kind === "subtitle" ? "ซับไม่ต้องแปลง" : "—"}</span>}
                  <div className="avacts" onClick={(e) => e.stopPropagation()}>
                    {t.kind === "subtitle" && (
                      <button type="button" className="ib" aria-label={`ดูซับ ${title}`} title="ดูซับ" onClick={() => setSubFor(t.key)} data-subview>
                        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.1" aria-hidden="true"><path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z" /><circle cx="12" cy="12" r="3" /></svg></button>)}
                    {t.kind === "video" ? null : !t.inMovie ? (
                      <button type="button" className="ib bad" aria-label={`เอาไฟล์ ${baseName(t.src)} ออก`} title={off ?? "เอาไฟล์นี้ออก"} aria-disabled={!!off || undefined} onClick={() => { if (!off) removeAdded(t.src); }} data-remove>
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" /></svg></button>
                    ) : t.keep ? (
                      <button type="button" className="ib bad" aria-label={`เอา ${title} ออกจากไฟล์ใหม่`} title={off ?? "เอาแทร็กนี้ออกจากไฟล์ใหม่"} aria-disabled={!!off || undefined} onClick={() => { if (!off) patch(t.key, { keep: false, default: false }); }} data-remove>
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" /></svg></button>
                    ) : (
                      <button type="button" className="ib" aria-label={`เอา ${title} กลับ`} title={off ?? "เอากลับ"} aria-disabled={!!off || undefined} onClick={() => { if (!off) patch(t.key, { keep: true }); }} data-undo>
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" aria-hidden="true"><path d="M9 14L4 9l5-5" /><path d="M4 9h10a6 6 0 010 12h-3" /></svg></button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
          <div className={"avdrop" + (over === "add" ? " over" : "")} data-drop="add" onClick={dropClick(async () => { if (working) return; const f = await pickAddFiles(); if (f.length) addFiles(f); })}>
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#e5a3bd" strokeWidth="1.9" aria-hidden="true"><path d="M12 5v14M5 12h14" /></svg>
            <span>{over === "add" ? <b>ปล่อยเมาส์เพื่อเพิ่มไฟล์</b> : loading === "add" ? "กำลังอ่านไฟล์…" : <><b style={{ color: "var(--txt2)" }}>ลากไฟล์เสียงหรือซับมาวางเพิ่ม</b> · <Phr>เสียง AC-3 E-AC-3 DTS AAC FLAC WAV MP3 Opus · ซับ SRT ASS VTT SUP IDX · ฟอนต์ของซับ TTF OTF</Phr></>}</span>
            <button type="button" className={"btn btn-sm " + (working ? "btn-wait" : "btn-ghost")} aria-disabled={working || undefined} title={working ? BUSY : undefined}
              onClick={async () => { if (working) return; const f = await pickAddFiles(); if (f.length) addFiles(f); }}><IcFile size={15} />เลือกไฟล์จากเครื่อง</button>
          </div>
        </div>

        {/* โปสเตอร์ */}
        <div className="card">
          <h3 style={{ justifyContent: "space-between" }}><span>โปสเตอร์ · ใส่ในรอบเดียวกับเสียงและซับ</span><span className="small" style={{ fontWeight: 400 }}>ไม่ต้องไปรวมอีกรอบที่หน้าใส่โปสเตอร์</span></h3>
          <div className="pslots">
            {(["cover", "cover_land"] as CoverTarget[]).map((slot) => (
              <CoverSlotBox key={slot} slot={slot} s={covers[slot]} over={over === slot} err={slotErr?.slot === slot ? slotErr.text : null} busy={working ? BUSY : loading === "cover" ? "กำลังอ่านรูป…" : undefined}
                onPick={async () => { const f = await pickFile("image"); if (f) openCover(f, slot); }}
                onRecrop={() => { const n = covers[slot].neu; if (n) posterApi.open(n.info.path, slot).then((info) => setCrop({ slot, info, start: n.choice })).catch((e) => setSlotErr({ slot, text: String(e) })); }}
                onRemove={() => { if (covers[slot].mode === "new") { mergeApi.coverDrop(slot).catch(() => {}); setSlot(slot, { mode: covers[slot].old ? "keep" : "keep", neu: null }); } else setSlot(slot, { mode: "remove" }); }}
                onUndo={() => setSlot(slot, { mode: "keep" })} />
            ))}
          </div>
          <div className="small" style={{ marginTop: 8 }}><Phr>ลากรูปมาวางที่ช่องไหนก็ได้ · เปลี่ยนรูปเปิดหน้าครอปเดียวกับหน้าใส่โปสเตอร์ · รูปเข้าไฟล์ใหม่ในคำสั่งรวมเดียวกับเสียงและซับ</Phr>{movie.attachments.some((a) => !/^cover(_land)?\./i.test(a.name)) ? <> · <Phr>{`ไฟล์แนบอื่นในหนัง ${movie.attachments.filter((a) => !/^cover(_land)?\./i.test(a.name)).map((a) => a.name).join(" ")} ติดไปด้วย`}</Phr></> : null}</div>
        </div>

        {/* ตั้งค่าแทร็ก */}
        {selected && (
          <div className="card" data-track-detail>
            <h3 style={{ justifyContent: "space-between" }}><span style={{ minWidth: 0, overflowWrap: "anywhere" }}>ตั้งค่าแทร็ก · {rowText(selected, nth(selected)).title}</span>
              <span className={"tpill " + (selected.inMovie ? "in" : "new")}>{selected.inMovie ? "ในหนัง" : "เพิ่มใหม่"}</span></h3>
            <div className="avdetail">
              <div className="avfield"><span className="avlbl">ภาษา · ชื่อแทร็ก</span>
                <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                  {selected.kind === "video" ? <span className="small" style={{ width: 130 }}>{langName(selected.lang)}</span>
                    : <LangPicker value={selected.lang} width={130} label="ภาษาของแทร็กที่เลือก" onChange={(v) => patch(selected.key, { lang: v })} disabled={working ? BUSY : undefined} />}
                  <div style={{ flex: 1, minWidth: 0 }}><ThaiInput value={selected.name} onChange={(v) => patch(selected.key, { name: v })} label="ชื่อแทร็ก" readOnly={working} /></div>
                </div>
                <span className="small"><Phr>ชื่อที่โปรแกรมเล่นแสดงตอนเลือกเสียงหรือซับ · ไฟล์ที่เพิ่มตั้งภาษาจากชื่อไฟล์ให้ก่อน (คำว่า พากย์ไทย th tha)</Phr></span></div>
              {selected.kind !== "video" && (
                <div className="avfield"><span className="avlbl">ตั้งเป็น{KIND_WORD[selected.kind]}หลัก</span>
                  <div className={"chk" + (working || !selected.keep ? " off" : "")} aria-checked={selected.default} {...kb(() => { if (!working && selected.keep) setMain(selected.key); })} role="checkbox">
                    <span className={"cbx " + (selected.default ? "on" : "off")}>{selected.default && <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="4" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5" /></svg>}</span>
                    <span>{selected.kind === "audio" ? "เปิดหนังแล้วเล่นเสียงนี้ก่อน" : "เปิดหนังแล้วขึ้นซับนี้ก่อน"}</span></div>
                  <span className="small"><Phr>{`${KIND_WORD[selected.kind]}หลักมีได้แทร็กเดียว เลือกอันนี้แล้วอันเดิมเลิกเป็นหลัก · ${selected.kind === "audio" ? "ซับหลักตั้งแยกกัน" : "ไม่เลือกซับหลักเลย หนังเปิดแบบไม่มีซับ"}`}</Phr></span></div>
              )}
              {selected.kind !== "video" && (
                <div className="avfield"><span className="avlbl">ดีเลย์</span>
                  <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}><DelayBox value={selected.delay} onChange={(v) => setDelay(selected.key, v)} label="แทร็กที่เลือก" wide off={working ? BUSY : undefined} />
                    <span className="small">ms · ติดลบ = {KIND_WORD[selected.kind]}มาเร็วขึ้น</span>
                    {selected.kind === "audio" && !selected.inMovie && refAudio && (
                      <button type="button" className={"btn btn-sm " + (working ? "btn-wait" : "btn-ghost")} aria-disabled={working || undefined} title={working ? BUSY : "เทียบคลื่นเสียงกับเสียงเดิมในหนัง"}
                        onClick={() => { if (!working) setDelayFor(selected.key); }} data-find-delay><IcSearch size={15} />หาค่าดีเลย์</button>)}</div>
                  <span className="small">{selected.delayFromName != null ? <Phr>{`อ่านจากชื่อไฟล์ (คำว่า DELAY ${selected.delayFromName}ms) · แก้เองได้`}</Phr> : <Phr>ปุ่ม − + ทีละ 100 ms · กด Shift ค้างไว้ทีละ 10 ms · ใส่ได้ถึง ±600,000 ms (10 นาที)</Phr>}</span></div>
              )}
              {!selected.inMovie && (
                <div className="avfield"><span className="avlbl">ไฟล์</span>
                  <span className="small" style={{ overflowWrap: "anywhere" }}>{selected.src}</span>
                  {selected.notes?.map((n, i) => <span key={i} className="small"><Phr>{n}</Phr></span>)}</div>
              )}
            </div>
          </div>
        )}

        {/* ฟอนต์ของซับ ASS (พี่กันสั่ง 8 พ.ย. 2569 "พวกซับ ass มันต้องฝังฟ้อนด้วยนี่นา") · ขึ้นเมื่อเพิ่มซับ ASS ที่เรียกฟอนต์ */}
        {method === "merge" && fontRows.length > 0 && (
          <div className="card" data-fonts>
            <h3 style={{ justifyContent: "space-between" }}><span>ฟอนต์ของซับ ASS</span>
              <span className="small" style={{ fontWeight: 400 }} data-fonts-sum>{fontFiles.length ? `ฝังไปด้วย ${fontFiles.length} ไฟล์ · ${fmtSize(fontBytes)}` : "ไม่ได้ฝังฟอนต์"}</span></h3>
            <div className="small" style={{ marginBottom: 4 }}><Phr>ซับ ASS บอกแค่ชื่อฟอนต์ · ฝังไฟล์ฟอนต์ไปกับไฟล์ใหม่ เครื่องอื่นหรือทีวีที่ไม่มีฟอนต์นี้จะเห็นซับหน้าตาเดิม ภาษาไทยไม่เป็นกล่อง</Phr></div>
            {fontRows.map((r) => {
              const state = r.inMovie ? "inmovie" : !r.file ? "missing" : r.on ? "on" : "off";
              const where = r.from === "folder" ? "เจอข้างไฟล์ซับ" : r.from === "user" ? "ฟอนต์ที่ลงไว้ในเครื่อง" : r.from === "system" ? "ฟอนต์ของ Windows" : "เพิ่มเอง";
              const text = r.inMovie ? `มีในไฟล์หนังแล้ว ไม่ต้องฝังซ้ำ · ${baseName(r.file!)}`
                : !r.file ? "ไม่เจอในเครื่อง · ลากไฟล์ฟอนต์ (.ttf .otf .ttc) มาวางที่หน้านี้ หรือกดเลือกไฟล์ฟอนต์"
                : `${where} · ${baseName(r.file)} · ${fmtSize(r.size)}`;
              const lock = working || !r.file || r.inMovie;
              return (
                <div key={r.name + (r.file ?? "")} className="fontrow" data-font={r.name} data-font-state={state}>
                  {/* มีในหนังแล้ว ติ๊กไว้แบบจาง (ฟอนต์อยู่ในไฟล์ใหม่ เพราะไฟล์แนบเดิมติดไป) · เดิมเป็นช่องว่าง ดูเหมือนฟอนต์จะหาย */}
                  <div className={"chk" + (lock ? " off" : "")} aria-checked={r.on || r.inMovie} aria-disabled={lock || undefined}
                    {...kb(() => { if (lock) return; const f = r.file!; setAv((s) => ({ fontOff: r.on ? [...s.fontOff, f] : s.fontOff.filter((x) => x !== f) })); })} role="checkbox">
                    <span className={"cbx " + (r.on || r.inMovie ? "on" : "off") + (r.inMovie ? " dim" : "")}>{(r.on || r.inMovie) && <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="4" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5" /></svg>}</span>
                    <span className="fontname">{r.name}</span>
                  </div>
                  <span className={"small" + (state === "missing" ? " fontmiss" : "")}><Phr>{text}</Phr></span>
                </div>
              );
            })}
            <div className="minirow" style={{ marginTop: 8, alignItems: "center" }}>
              <button type="button" className={"btn btn-sm " + (working ? "btn-wait" : "btn-ghost")} aria-disabled={working || undefined} title={working ? BUSY : undefined}
                onClick={async () => { if (working) return; const f = await pickFonts(); if (f.length) addFonts(f); }} data-font-pick><IcFile size={15} />เลือกไฟล์ฟอนต์</button>
              <span className="small"><Phr>หาฟอนต์จากโฟลเดอร์ข้างไฟล์ซับก่อน แล้วฟอนต์ที่ลงไว้ในเครื่อง · ลงฟอนต์ใหม่ระหว่างเปิดโปรแกรม ต้องปิดเปิดโปรแกรมใหม่</Phr></span>
            </div>
            {output === "mp4" && fontFiles.length > 0 && <div className="stat warn" style={{ marginTop: 8 }} data-fonts-mp4><CardIcon kind="warn" /><div><b>MP4 ฝังฟอนต์ไม่ได้</b><Phr>เลือกไฟล์ที่ได้เป็น MKV ถ้าต้องการฟอนต์ไปกับไฟล์</Phr></div></div>}
          </div>
        )}

        {/* วิธี · รวมเข้าไฟล์หนัง หรือจับคู่ไว้ ไม่รวม */}
        <div className="card" data-method={method}>
          <h3>วิธี</h3>
          <div style={{ display: "flex" }}><Seg label="วิธี" value={method} onChange={(v) => { setMethod(v); setPaired(null); }} disabledReason={working ? BUSY : undefined}
            options={[{ value: "merge", label: <><IcMix size={14} />รวมเข้าไฟล์หนัง</> }, { value: "pair", label: <><IcLink size={14} />จับคู่ไว้ ไม่รวม</> }]} /></div>
          {method === "pair" && <div className="stat info" style={{ marginTop: 8 }}><CardIcon kind="info" /><div><b>ไฟล์หนังไม่ถูกแตะ</b>
            <Phr>{`จับคู่ได้เฉพาะเสียงกับซับที่เพิ่ม (${pairable.length} ไฟล์) · แปลงชนิด เอาแทร็กออก เรียงลำดับ ใส่ปก ทำได้เฉพาะตอนรวม · ดีเลย์ใช้ได้ทั้งสองแบบ · ไฟล์ที่จับคู่อยู่โฟลเดอร์ไหนก็ได้ โปรแกรมจำไว้กับหนังในคลัง`}</Phr></div></div>}
          {method === "pair" && pairsNotInTable.length > 0 && <div className="stat warn" style={{ marginTop: 8 }} data-pairs-saved><CardIcon kind="warn" /><div>
            <b>{`เรื่องนี้จับคู่ไว้แล้ว ${savedPairs.length} ไฟล์ · ยังไม่อยู่ในตาราง ${pairsNotInTable.length} ไฟล์`}</b>
            <Phr>กดจับคู่ไว้กับหนังเรื่องนี้แล้ว ชุดเดิมถูกแทนทั้งชุด · ใส่ไฟล์ที่จับคู่ไว้ลงตารางก่อน ถ้าจะเก็บไว้ด้วย</Phr>
            <div style={{ marginTop: 6 }}><button type="button" className="btn btn-ghost btn-sm" onClick={() => { void loadSavedPairs(); }} disabled={working} data-pairs-load>{`ใส่ไฟล์ที่จับคู่ไว้ ${pairsNotInTable.length} ไฟล์ลงตาราง`}</button></div></div></div>}
          {method === "pair" && paired && (paired.err ? <div className="stat bad" style={{ marginTop: 8 }}><CardIcon kind="bad" /><div><b>จับคู่ไม่สำเร็จ</b><Phr>{paired.err}</Phr></div></div>
            : <div className="stat ok" style={{ marginTop: 8 }} data-paired-ok><CardIcon kind="done" /><div><b>{`จับคู่ไว้ ${paired.n} ไฟล์แล้ว`}</b><Phr>เปิดเล่นพร้อมไฟล์ที่จับคู่ได้ที่แผงขวาของชั้นวาง · บันทึกใหม่แทนการจับคู่เดิมของเรื่องนี้ทั้งชุด</Phr></div></div>)}
        </div>

        {/* ไฟล์ที่ได้ · ไฟล์เดิม */}
        {method === "merge" && <div className="card">
          <h3>ไฟล์ที่ได้ · ไฟล์เดิม</h3>
          <div className="optline">
            <Seg small label="ไฟล์ที่ได้" value={output} onChange={(v) => setAv((s) => ({ once: { ...s.once, output: v } }))} disabledReason={working ? BUSY : undefined}
              options={[{ value: "mkv", label: "MKV (แนะนำ)" }, { value: "mp4", label: "MP4" }]} />
            <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              <div className={"chk" + (working ? " off" : "")} aria-checked={original === "keep"} {...kb(() => { if (!working) setAv((s) => ({ once: { ...s.once, original: "keep" } })); })} role="radio">
                <span className={"radio" + (original === "keep" ? " on" : "")} /><span>เก็บไฟล์เดิมไว้ ย้ายไปโฟลเดอร์ "ไฟล์เดิม"</span></div>
              <div className={"chk" + (working ? " off" : "")} aria-checked={original === "trash"} {...kb(() => { if (!working) setAv((s) => ({ once: { ...s.once, original: "trash" } })); })} role="radio">
                <span className={"radio" + (original === "trash" ? " on" : "")} /><span>ลบไฟล์เดิมหลังตรวจไฟล์ใหม่ผ่านแล้ว</span></div>
            </div>
          </div>
          <div className="small" style={{ marginTop: 6 }} data-summary>
            <Phr>{`ไฟล์ใหม่ ${movie.name}.${output} · ขนาดราว ${fmtSize(Math.max(0, estimate))}`}</Phr>{" · "}
            <Phr>{(settings?.checkOutputAfter ?? true) ? "ตรวจไฟล์ใหม่หลังรวมเสร็จ" : "ไม่ได้ตั้งตรวจไฟล์ใหม่ (หน้าตั้งค่า)"}</Phr>
            {output === "mp4" && <><br /><Phr>MP4 ปกขึ้นเป็นไอคอนใน Windows ได้เลย แต่เก็บปกได้รูปเดียว (ปกตั้ง) และเก็บไฟล์แนบอย่างฟอนต์ไม่ได้</Phr></>}
          </div>
        </div>}

        {/* คำเตือนก่อนเริ่ม */}
        {mp4Bad.map((t) => (
          <div key={t.key} data-mp4warn>
            <div className="stat warn"><CardIcon kind="warn" /><div><b>{rowText(t, nth(t)).title} · {ftName(t.kind, t.codec, t.profile)} ใส่ใน MP4 ไม่ได้</b><Phr>{`${t.why ?? ""} ถ้าทำต่อ ${KIND_WORD[t.kind]}นี้จะหายจากไฟล์ใหม่`}</Phr></div></div>
            <div className="minirow" style={{ marginTop: 6 }}>
              <button type="button" className="btn btn-main btn-sm" onClick={() => setAv((s) => ({ once: { ...s.once, output: "mkv" } }))}><IbBack size={15} />กลับไปใช้ MKV</button>
              {/* แทร็กเดิมที่ตั้งแปลงแบบเพิ่มคู่ เปลี่ยนเป็นแทนที่ ได้ทั้งแทร็กที่แปลงและ MP4 (ผู้ช่วยตรวจขั้น 10 ข้อ 2) */}
              {t.convert && t.inMovie && (t.pair ?? true) && t.convert.codec !== "wv"
                ? <button type="button" className="btn btn-ghost btn-sm" onClick={() => patch(t.key, { pair: false })} data-mp4replace><IbSwap size={15} />ใช้แทร็กที่แปลงแทนที่แทร็กเดิม</button>
                : t.kind !== "video" && <button type="button" className="btn btn-ghost btn-sm" onClick={() => (t.inMovie ? patch(t.key, { keep: false, default: false }) : removeAdded(t.src))}><IbTrash size={15} />เอา{KIND_WORD[t.kind]}นี้ออก</button>}
            </div>
          </div>
        ))}
        {mp4Style.length > 0 && <div className="stat info"><CardIcon kind="info" /><div><b>ซับ ASS ใน MP4 สีกับฟอนต์หาย เหลือตัวหนังสือล้วน</b><Phr>{`${mp4Style.length} แทร็ก · ใช้ MKV ถ้าต้องการเก็บสีกับตำแหน่ง`}</Phr></div></div>}
        {vtts.length > 0 && <div className="stat info" data-vttnote><CardIcon kind="info" /><div><b>ซับ VTT จะแปลงเป็น SRT ก่อนรวม</b><Phr>{`${vtts.map((t) => baseName(t.src)).join(" · ")} · โปรแกรมเล่นหลายตัวยังไม่รู้จัก VTT ที่อยู่ใน MKV · ข้อความกับเวลาเหมือนเดิม`}</Phr></div></div>}
        {longer.map((t) => (
          <div key={t.key} className="stat warn" data-longer><CardIcon kind="warn" /><div><b>{baseName(t.src)} {t.longerBy! > 0 ? "ยาวกว่า" : "สั้นกว่า"}หนัง {fmtDuration(Math.abs(t.longerBy!))}</b>
            <Phr>อาจเป็นเสียงจากหนังต่างฉบับ โปรดตั้งความเร็วเสียง หรือตรวจสอบว่าเลือกไฟล์ถูกต้อง · ยังรวมไฟล์ต่อได้ตามปกติ</Phr>
            {t.kind === "audio" && refAudio && <div style={{ marginTop: 6 }}><button type="button" className="btn btn-ghost btn-sm" onClick={() => { if (!working) setDelayFor(t.key); }} data-longer-check><IcGraph size={15} />ให้โปรแกรมเทียบเสียงกับหนัง</button></div>}</div></div>
        ))}

        {/* สถานะงาน */}
        {run.state !== "idle" && <div ref={runBox} className="card workbox" data-run={run.state}><RunCard run={run} pct={pct} runMovie={av.runMovie} onStop={() => setAskStop(true)} onShelf={() => p.onPage("shelf")} onGraph={p.onGraph} onRetry={() => pressStart()} /></div>}

        <div className="avfoot">
          {method === "pair" ? (<>
            {pairBlocked && <div className="hint" style={{ color: "#94680f", margin: 0 }} data-blocked>{pairBlocked}</div>}
            <button type="button" className={"btn " + (pairBlocked ? "btn-wait" : "btn-main")} style={{ height: 44, padding: "0 26px", fontSize: 15 }}
              aria-disabled={!!pairBlocked || undefined} title={pairBlocked ?? undefined} onClick={savePairs} data-pair-save><IcLink size={15} />จับคู่ไว้กับหนังเรื่องนี้</button>
          </>) : (<>
          {blocked && !working && <div className="hint" style={{ color: "#94680f", margin: 0 }} data-blocked>{blocked}</div>}
          <button type="button" className={"btn " + (working ? "btn-wait" : "btn-ghost")} style={{ height: 44 }} aria-disabled={working || undefined} title={working ? BUSY : undefined} onClick={clearAll}><IbTrash size={15} />ล้างทั้งหมด</button>
          <button type="button" className={"btn " + (blocked || working ? "btn-wait" : "btn-main")} style={{ height: 44, padding: "0 26px", fontSize: 15 }}
            aria-disabled={!!blocked || working || undefined} title={blocked ?? undefined} onClick={() => pressStart()} data-start><Keep icon={<IcMix size={15} />} all={["กำลังรวม…", "รวมเป็น MP4", "รวมเข้าไฟล์หนัง"]}>{working ? "กำลังรวม…" : output === "mp4" ? "รวมเป็น MP4" : "รวมเข้าไฟล์หนัง"}</Keep></button>
          </>)}
        </div>
      </div>

      {codecFor && (() => { const ct = tracks.find((t) => t.key === codecFor); return ct ? (
        <CodecPanel track={ct} encoders={encs} speed={codecSpeed} onClose={() => { setCodecFor(null); setCodecSpeed(null); }}
          onApply={(convert, pair, convName) => { patch(ct.key, { convert, pair, convName }); setCodecFor(null); setCodecSpeed(null); }} />) : null; })()}
      {subFor && (() => { const st = tracks.find((t) => t.key === subFor); return st ? (
        <SubViewer track={st} movie={movie.path} refStream={refAudio ? refAudio.ff ?? refAudio.tid : null}
          refIdx={refAudio ? tracks.filter((x) => x.inMovie && x.kind === "audio" && (x.ff ?? x.tid) < (refAudio.ff ?? refAudio.tid)).length : null} onClose={() => setSubFor(null)} />) : null; })()}
      {delayFor && refAudio && (() => { const dt = tracks.find((t) => t.key === delayFor); return dt ? (
        <DelayDialog movie={{ path: movie.path, duration: movie.duration ?? null }} refTrack={refAudio} track={dt} onClose={() => setDelayFor(null)}
          onApply={(d) => { setDelay(dt.key, d); setDelayFor(null); }}
          onSpeed={(pair, d) => { setDelay(dt.key, d); setDelayFor(null); setCodecSpeed(pair.join(">")); openCodec(dt.key); }} />) : null; })()}
      {loading === "cover" && <LoadPill text="กำลังอ่านรูป…" />}
      {crop && (
        <CropDialog key={crop.slot + crop.info.path} info={crop.info} start={crop.start} target={crop.slot} defaultFormat={(settings?.posterFormat ?? "jpg") as "jpg" | "png"} defaultQuality={settings?.jpgQuality ?? 90}
          onCancel={() => setCrop(null)}
          onUse={(c) => { setSlot(crop.slot, { mode: "new", neu: { info: crop.info, choice: c } }); setCrop(null); }}
          onPickImage={(f) => openCover(f, crop.slot)} />
      )}

      {/* ก่อนรวม บอกว่าซับ VTT จะแปลงเป็น SRT (พี่กันสั่ง 7 พ.ย. 2569 *"ระบบจะต้องบอกด้วยนะ ว่าก่อนจะรวม ระบบจะ แปลง vtt เป็น srt เป็น popup ขึ้นก็ได้"*) */}
      <Dialog open={askVtt} onClose={() => setAskVtt(false)} title="ก่อนรวม โปรแกรมจะแปลงซับ VTT เป็น SRT"
        actions={<><button type="button" className="btn btn-ghost btn-sm" onClick={() => setAskVtt(false)}><IbBack size={15} />ย้อนกลับ</button>
          <button type="button" className="btn btn-main btn-sm" onClick={() => { setAskVtt(false); pressStart(true); }} data-vtt-ok><IcMix size={15} />แปลงแล้วรวมต่อ</button></>}>
        <div style={{ fontSize: 14, lineHeight: 1.6 }} data-vtt-dialog>
          {vtts.map((t) => <div key={t.key}><b style={{ overflowWrap: "anywhere" }}>{baseName(t.src)}</b> → SRT</div>)}
          <div style={{ marginTop: 6 }}><Phr>MKV เก็บซับ VTT ได้ แต่โปรแกรมเล่นหลายตัว (mpv และตัวที่ใช้ ffmpeg) ยังอ่านไม่ได้ ซับจะไม่ขึ้น</Phr></div>
          <div><Phr>แปลงเป็น SRT ข้อความกับเวลาเหมือนเดิม หายแค่ตำแหน่งบนจอที่ VTT ตั้งไว้ · ไฟล์ VTT เดิมในเครื่องไม่ถูกแก้</Phr></div>
        </div>
      </Dialog>
      {/* ลบไฟล์เดิม ยืนยัน 2 ขั้น (แบบหน้าใส่โปสเตอร์) · กดนอกหน้าต่างไม่ปิด */}
      <Dialog open={askDelete === 1} onClose={() => setAskDelete(0)} title="ลบไฟล์เดิมหลังตรวจผ่าน · ขั้นที่ 1 จาก 2"
        actions={<><button type="button" className="btn btn-ghost btn-sm" onClick={() => setAskDelete(0)}>ยกเลิก</button><button type="button" className="btn btn-main btn-sm" onClick={() => setAskDelete(2)}><IbNext size={15} />ถัดไป</button></>}>
        <div style={{ fontSize: 14, lineHeight: 1.6 }}><Phr>เมื่อไฟล์ใหม่ตรวจผ่าน ไฟล์เดิมจะถูกย้ายไปถังขยะของ Windows</Phr><br /><b>{baseName(movie.path)}</b> · <span className="nw">{fmtSize(movie.size)}</span><br /><Phr>ถ้าไฟล์ใหม่ตรวจไม่ผ่าน ไฟล์เดิมไม่ถูกลบ</Phr></div>
      </Dialog>
      <Dialog open={askDelete === 2} onClose={() => setAskDelete(1)} title="ยืนยันอีกครั้ง · ขั้นที่ 2 จาก 2" splitActions
        actions={<><button type="button" className="btn btn-danger btn-sm" onClick={() => { setAskDelete(0); start(); }}>ยืนยันลบ</button><button type="button" className="btn btn-ghost btn-sm" onClick={() => setAskDelete(1)}><IbBack size={15} />ย้อนกลับ</button></>}>
        <div style={{ fontSize: 14, lineHeight: 1.6 }}>ลบไฟล์เดิม <b>{baseName(movie.path)}</b> <Phr>หลังตรวจไฟล์ใหม่ผ่าน</Phr><br /><Phr>กู้คืนได้จากถังขยะของ Windows จนกว่าจะล้างถังขยะ</Phr></div>
      </Dialog>
      <StopDialog open={askStop} pct={pct} name={av.runMovie} onClose={() => setAskStop(false)} />
    </div>
  );
}

/** ช่องดีเลย์ ปุ่ม − + ทีละ 100 ms กด Shift ค้างทีละ 10 ms · พิมพ์ได้ทั้ง −120 และ -120 */
function DelayBox(p: { value: number; onChange: (v: number) => void; label: string; wide?: boolean; off?: string }) {
  const [text, setText] = useState<string | null>(null);
  const show = text ?? `${p.value > 0 ? "+" : ""}${p.value.toLocaleString("en-US")}`;
  const commit = () => {
    if (text == null) return;
    const n = Number(text.replace(/[,\s+]/g, "").replace(/[−–]/g, "-"));
    if (Number.isFinite(n)) p.onChange(n);
    setText(null);
  };
  return (
    <div className="delay" onClick={(e) => e.stopPropagation()}>
      <button type="button" aria-label={`ลดดีเลย์ของ ${p.label}`} aria-disabled={!!p.off || undefined} title={p.off ?? "ลด 100 ms · Shift ลด 10 ms"} onClick={(e) => { if (!p.off) p.onChange(p.value - (e.shiftKey ? 10 : 100)); }}>−</button>
      <input className="avnum" style={p.wide ? { width: 92 } : undefined} value={show} readOnly={!!p.off} aria-label={`ดีเลย์ของ ${p.label} มิลลิวินาที`} inputMode="numeric"
        onChange={(e) => setText(e.target.value)} onBlur={commit} onKeyDown={(e) => { if (e.key === "Enter") { commit(); (e.target as HTMLInputElement).blur(); } if (e.key === "Escape") setText(null); }} />
      <button type="button" aria-label={`เพิ่มดีเลย์ของ ${p.label}`} aria-disabled={!!p.off || undefined} title={p.off ?? "เพิ่ม 100 ms · Shift เพิ่ม 10 ms"} onClick={(e) => { if (!p.off) p.onChange(p.value + (e.shiftKey ? 10 : 100)); }}>+</button>
    </div>
  );
}

function CoverSlotBox(p: { slot: CoverTarget; s: CoverSlot; over: boolean; err: string | null; busy?: string; onPick: () => void; onRecrop: () => void; onRemove: () => void; onUndo: () => void }) {
  const tall = p.slot === "cover";
  const label = tall ? "ปกตั้ง" : "ปกนอน";
  const { s } = p;
  const neu = s.mode === "new" ? s.neu : null;
  const img = neu ? neu.choice.render.preview : s.old?.preview?.preview ?? null;
  const name = neu ? `${p.slot}.${neu.choice.format}` : s.old?.att.name ?? `${p.slot}.jpg`;
  const pill = neu ? <span className="tpill new">เพิ่มใหม่</span> : s.old ? (s.mode === "remove" ? <span className="tpill off">เอาออก</span> : <span className="tpill in">ในหนัง</span>) : null;
  const dt = neu ? `จาก ${neu.info.name} · ${neu.choice.render.width} × ${neu.choice.render.height} · ${fmtSize(neu.choice.render.bytes)}`
    : s.old ? `${s.old.preview ? `${s.old.preview.width} × ${s.old.preview.height} · ` : ""}${fmtSize(s.old.att.size)} · ${s.mode === "remove" ? "ไม่ใส่ในไฟล์ใหม่" : "ใช้รูปเดิม"}`
    : `ยังไม่มี${label} · ลากรูป${tall ? "แนวตั้ง" : "แนวนอน"}มาวาง`;
  const btn = (text: React.ReactNode, fn: () => void, extra?: string) => (
    <button type="button" className={"btn btn-sm " + (p.busy ? "btn-wait" : "btn-ghost")} aria-disabled={p.busy ? true : undefined} title={p.busy} onClick={() => { if (!p.busy) fn(); }} data-slot-btn={extra ?? text}>{text}</button>
  );
  return (
    <div className={"pslot" + (p.over ? " over" : p.err ? " bad" : "")} data-drop={p.slot} data-slot={p.slot}>
      {img && s.mode !== "remove" ? <img className={"pth " + (tall ? "tall" : "wide")} src={thumbUrl(img) ?? undefined} alt={label} /> : <div className={"pth none " + (tall ? "tall" : "wide")} />}
      <div style={{ minWidth: 0 }}>
        <div className="nm">{label} · {name} {pill}</div>
        <div className="dt">{p.err ? <span style={{ color: "var(--bad-ink)" }}>{p.err}</span> : p.over ? <b style={{ color: "var(--accent-ink)" }}>ปล่อยเมาส์เพื่อใส่รูปนี้</b> : dt}</div>
        <div style={{ display: "flex", gap: 6, marginTop: 8, flexWrap: "wrap" }}>
          {neu ? <>{btn("ครอปใหม่", p.onRecrop)}{btn("เปลี่ยนรูป", p.onPick)}{btn("เอาออก", p.onRemove)}</>
            : s.old && s.mode === "remove" ? btn("เอากลับ", p.onUndo)
            : s.old ? <>{btn("เปลี่ยนรูป", p.onPick)}{btn("เอาออก", p.onRemove)}</>
            : btn(<><IcPoster size={15} />เลือกรูปจากเครื่อง</>, p.onPick)}
        </div>
      </div>
    </div>
  );
}

function fmtEta(s: number) { return s < 60 ? `${Math.max(1, Math.round(s))} วินาที` : `${Math.floor(s / 60)} นาที ${Math.round(s % 60)} วินาที`; }

function RunCard(p: { run: ReturnType<typeof getAv>["run"]; pct: number; runMovie: string | null; onStop: () => void; onShelf: () => void; onGraph: (path: string) => void; onRetry: () => void }) {
  const { run } = p;
  if (run.state === "working") {
    return (
      <>
        <div style={{ fontSize: 14 }}>{run.progress?.phase ?? "กำลังเริ่ม…"}</div>
        <div className="bar" role="progressbar" aria-valuenow={p.pct} aria-valuemin={0} aria-valuemax={100}><i style={{ width: `${p.pct}%` }} /></div>
        <div className="small">{p.pct}%{run.progress?.eta != null && run.progress.eta > 0 ? <> · เหลือราว <span className="nw">{fmtEta(run.progress.eta)}</span></> : null}
          {run.progress?.next ? <><br />ขั้นถัดไป {run.progress.next}</> : null}</div>
        <button type="button" className="btn btn-bad btn-sm" style={{ alignSelf: "flex-start" }} onClick={p.onStop}><IbStop size={15} />หยุด</button>
        <div className="small"><Phr>กดหยุด ไฟล์ที่ทำค้างถูกลบ ไฟล์เดิมไม่ถูกแตะ</Phr></div>
      </>
    );
  }
  if (run.state === "done") return <DoneCard r={run.result} onShelf={p.onShelf} onGraph={p.onGraph} />;
  if (run.state === "failed") {
    return (
      <>
        <div className={"stat " + (run.problem.kind === "cancelled" ? "warn" : "bad")} role="alert"><CardIcon kind={run.problem.kind === "cancelled" ? "warn" : "bad"} />
          <div><b>{run.problem.title}</b>{run.problem.detail.map((d, i) => <div key={i}><Phr>{d}</Phr></div>)}</div></div>
        <button type="button" className="btn btn-ghost btn-sm" style={{ alignSelf: "flex-start" }} onClick={p.onRetry}><IcRefresh size={15} />ลองใหม่</button>
      </>
    );
  }
  return null;
}

function DoneCard({ r, onShelf, onGraph }: { r: MergeResult; onShelf: () => void; onGraph: (path: string) => void }) {
  const c = r.counts;
  const where = r.original === "kept" && r.originalTo ? r.originalTo.replace(/[\\/][^\\/]+$/, "") : null;
  return (
    <>
      <div className="stat ok" role="status"><CardIcon kind="done" /><div><b>{r.verified ? "รวมเสร็จ ไฟล์ใหม่ตรวจผ่าน" : "รวมเสร็จ"}</b>ภาพ {c.video} · เสียง {c.audio} · ซับ {c.subs} · {r.verified ? "ครบตามที่ตั้ง · ความยาวเท่าเดิม" : "ไม่ได้ตรวจไฟล์ใหม่"}
        <br /><span style={{ overflowWrap: "anywhere" }}>{r.output}</span></div></div>
      {where && <div className="small">ไฟล์เดิมย้ายไปที่ {where}</div>}
      {r.original === "trash" && <div className="small">ไฟล์เดิมอยู่ในถังขยะของ Windows กู้คืนได้จนกว่าจะล้างถังขยะ</div>}
      {r.notes.map((n, i) => <div key={i} className="small"><Phr>{n}</Phr></div>)}
      <div style={{ display: "flex", gap: 6 }}>
        <button type="button" className="btn btn-ok btn-sm" onClick={onShelf}><IcShelf size={15} />ไปดูบนชั้นวาง</button>
        <button type="button" className="btn btn-ghost btn-sm" onClick={() => onGraph(r.output)}><IcGraph size={15} />ดูกราฟเสียง</button>
      </div>
    </>
  );
}

function StopDialog(p: { open: boolean; pct: number; name: string | null; onClose: () => void }) {
  return (
    <Dialog open={p.open} onClose={p.onClose} title="ยืนยันหยุดรวมไฟล์"
      actions={<><button type="button" className="btn btn-ghost btn-sm" onClick={p.onClose}><IbNext size={15} />ทำต่อ</button><button type="button" className="btn btn-bad btn-sm" onClick={() => { p.onClose(); mergeApi.cancel(); }} data-stop-ok><IbStop size={15} />หยุด</button></>}>
      <div style={{ fontSize: 14, lineHeight: 1.6 }}><Phr>{`ไฟล์ใหม่ที่ทำไปได้ ${p.pct}% จะถูกลบทิ้ง`}</Phr> <Phr>{`ไฟล์เดิม ${p.name ? baseName(p.name) : ""} ไม่ถูกแตะ`}</Phr></div>
    </Dialog>
  );
}
