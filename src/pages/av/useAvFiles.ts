/* เปิดไฟล์หนัง เพิ่มเสียงซับ ฟอนต์ เปิดรูปปก และลากไฟล์จาก Explorer มาวาง
   แยกจาก AvPage.tsx ตอนจัดโครงไฟล์ตามความหมาย (BUGS ข้อ 155 ขั้น 2) เนื้อโค้ดยกมาทั้งก้อน */
import { useCallback, useEffect, useRef, useState } from "react";
import { usePageActiveRef } from "../../lib/pageActive";
import { type CropChoice } from "../../components/CropDialog";
import { ADD_EXT, FONT_EXT, IMAGE_EXT, MOVIE_EXT, inApp, mergeApi, posterApi, type CoverTarget, type PosterInfo } from "../../lib/api";
import { getAv, setAv, trackFrom, tracksOfAdded, type CoverSlot } from "../../lib/avJob";
import { baseName, extOf } from "./parts";
import type { C0 } from "./avCtx";

export function useAvFiles(c: C0) {
  const { movie, p, toast } = c;
  const [loading, setLoading] = useState<string | null>(null);
  /** เลขคำขอเปิดหนังล่าสุด (ผู้ช่วยตรวจขั้น 10 ข้อ 20) */
  const loadSeq = useRef(0);
  const [movieErr, setMovieErr] = useState<string | null>(null);
  const [over, setOver] = useState<string | null>(null);
  const [crop, setCrop] = useState<{ slot: CoverTarget; info: PosterInfo; start: CropChoice | null } | null>(null);
  const [slotErr, setSlotErr] = useState<{ slot: CoverTarget; text: string } | null>(null);
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
      setAv({ movie: m, tracks: m.tracks.map((t) => trackFrom(t)), sel: null, covers: { cover: slot("cover"), cover_land: slot("cover_land") }, run: { state: "idle" }, fontExtra: [], fontOff: [], xPick: [], xRaw: [] });
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
    if (!m) { toast({ kind: "warn", ms: 6000, key: "av-add", title: "ใส่ไฟล์หนังก่อน", detail: "ลากไฟล์หนังมาวาง แล้วค่อยลากเสียงหรือซับตามมา" }); return; }
    for (const path of paths) {
      // เปลี่ยนหนังระหว่างอ่านไฟล์ที่ลากมาหลายไฟล์ ไฟล์ที่เหลือไม่เพิ่มเข้าหนังเรื่องใหม่ (ข้อ 20)
      if (getAv().movie?.path !== m.path) break;
      if (path.toLowerCase() === m.path.toLowerCase()) {
        toast({ kind: "warn", ms: 6000, key: "av-add", title: "ไฟล์นี้คือไฟล์หนังที่เปิดอยู่", detail: "แทร็กของหนังอยู่ในตารางแล้ว ไม่ต้องเพิ่มซ้ำ" });
        continue;
      }
      if (getAv().tracks.some((t) => !t.inMovie && t.src.toLowerCase() === path.toLowerCase())) {
        toast({ kind: "warn", ms: 6000, key: "av-add", title: "ไฟล์นี้เพิ่มไว้แล้ว", detail: baseName(path) });
        continue;
      }
      // ไม่ทับสถานะกำลังอ่านไฟล์หนังที่อาจยังอ่านอยู่ (AUDIT ข้อ 86)
      setLoading((l) => (l === "movie" ? l : "add"));
      try {
        const f = await mergeApi.addFile(path, m.duration);
        if (getAv().movie?.path !== m.path) break;
        // ฝั่ง Rust เปลี่ยน .sub เป็น .idx เทียบซ้ำด้วยที่อยู่ที่คืนมาอีกรอบ ลาก .sub เดิมซ้ำไม่ได้สองแถว (AUDIT ข้อ 86)
        if (f.path.toLowerCase() !== path.toLowerCase() && getAv().tracks.some((t) => !t.inMovie && t.src.toLowerCase() === f.path.toLowerCase())) {
          toast({ kind: "warn", ms: 6000, key: "av-add", title: "ไฟล์นี้เพิ่มไว้แล้ว", detail: baseName(f.path) });
          continue;
        }
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
        setLoading((l) => (l === "add" ? null : l));
      }
    }
  }, [toast]);

  // ---------- ฟอนต์ของซับ ASS ที่ลากมาเพิ่มเอง (พี่กันสั่ง 8 พ.ย. 2569) ----------
  const addFonts = useCallback(async (paths: string[]) => {
    if (!getAv().movie) { toast({ kind: "warn", ms: 6000, key: "av-add", title: "ใส่ไฟล์หนังก่อน", detail: "ฟอนต์ใช้ฝังไปกับซับ ASS ตอนรวม" }); return; }
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
  /* การ์ดโปสเตอร์ไม่ขึ้นจนกว่าจะกดแถวรูปปกในตาราง หรือลากรูปมาใส่ (BUGS ข้อ 67 พี่กันสั่ง 12 พ.ย. 2569 "อันนี้ปิดเอาไว้ ต้องกดที่ข้อรูปก่อน หรือลากรูปไปใส่" · "เราบอกเเล้วนะ")
     รอบแรกแคลร์เหลือหัวการ์ดให้กดเปิด ไม่ตรงที่สั่ง · มีปกใหม่หรือเอาปกออกที่ยังไม่ได้รวม การ์ดขึ้นค้าง · เปลี่ยนหนังแล้วซ่อนใหม่ */
  /* จำว่าเปิดการ์ดไว้ของหนังเรื่องไหน เปลี่ยนหนังแล้วซ่อนเอง · รอบก่อนจำแค่เปิดหรือปิด หน้าต่างที่เปิดหนังเรื่องเดิมค้างไว้ตอนแก้โค้ดสดเลยยังเห็นการ์ด (พี่กันทัก "มันยังขึ้นอยู่เลย") */
  const [posterFor, setPosterFor] = useState<string | null>(null);
  const posterOpen = !!movie && posterFor === movie.path;
  const setPosterOpen = (on: boolean) => setPosterFor(on ? getAv().movie?.path ?? null : null);
  const openCover = useCallback(async (path: string, slot: CoverTarget | null) => {
    setSlotErr(null);
    setPosterOpen(true);
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
    if (other.length) toast({ kind: "warn", ms: 6000, key: "av-add", title: `ใช้ไม่ได้ ${other.length} ไฟล์`, detail: other.map(baseName).join(", ") });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loadMovie, addFiles, addFonts, openCover, toast]);
  const pageOn = usePageActiveRef();
  useEffect(() => {
    if (!inApp) return;
    let off: (() => void) | undefined;
    let live = true;
    import("@tauri-apps/api/webview").then(({ getCurrentWebview }) => getCurrentWebview().onDragDropEvent((e) => {
      if (!pageOn.current) return; // หน้านี้ซ่อนอยู่ (ไปเมนูอื่นแล้ว) ไม่รับไฟล์ที่ลากมา (BUGS ข้อ 9)
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
  return { loading, setLoading, loadSeq, movieErr, setMovieErr, over, setOver, crop, setCrop, slotErr, setSlotErr, loadMovie, addFiles, addFonts, posterFor, setPosterFor, posterOpen, setPosterOpen, openCover, setSlot, zoneAt, handleDrop, pageOn };
}
