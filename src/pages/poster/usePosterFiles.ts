/* เปิดไฟล์หนัง เปิดรูป รูปที่เลือกมาจากหน้าอื่น และลากไฟล์จาก Explorer มาวาง
   แยกจาก PosterPage.tsx ตอนจัดโครงไฟล์ตามความหมาย (BUGS ข้อ 155 ขั้น 8) เนื้อโค้ดยกมาทั้งก้อน */
import { useCallback, useEffect } from "react";
import { usePageActiveRef } from "../../lib/pageActive";
import { type CropChoice } from "../../components/CropDialog";
import { IMAGE_EXT, MOVIE_EXT, inApp, posterApi } from "../../lib/api/index";
import { getPosterJob } from "../../lib/posterJob";
import { extOf } from "./parts";
import { type PosterStart } from "./PosterPage";
import type { Po0 } from "./posterCtx";

export function usePosterFiles(c: Po0) {
  const { p, setAck, setChoice, setCropOpen, setDrop, setLoading, setMovie, setMovieErr, setMoviePath, setOnce, setOver, setPoster, setPosterErr, setRun, setTyped, setUserCrop, settings, toast } = c;
  // ---------- ไฟล์หนัง ----------
  const loadMovie = useCallback(async (path: string) => {
    setTyped(null);
    setMovieErr(null);
    // ล้างไฟล์หนังเรื่องก่อนทันที เปิดไฟล์ใหม่ไม่สำเร็จแล้วปุ่มเริ่มกดไม่ได้ ไม่ไปแก้ไฟล์เรื่องก่อน
    // เดิมไฟล์ใหม่ใช้ไม่ได้แต่โปรแกรมยังจำไฟล์เก่า กดเริ่มแล้วโปสเตอร์ไปลงไฟล์เก่า (AUDIT 12 พ.ย. 2569 ข้อ 6)
    setMovie(null);
    setMoviePath(null);
    // ไม่ทับสถานะงานที่กำลังวิ่ง (AUDIT ข้อ 5)
    if (getPosterJob().run.state !== "working") setRun({ state: "idle" });
    setDrop([]);
    setAck([]);
    const ext = extOf(path);
    // WMV ต้องแปลงก่อน · ISO ต้องแตกไฟล์ก่อน (สเปกข้อ 10) · เดิมบอกแค่ใช้ไม่ได้ ไม่บอกทางไปต่อ (ผู้ช่วยตรวจสเปกเจอ)
    // ไม่มีคำว่าใช้ไม่ได้ในกรณีที่บอกทางไปต่อ หัวการ์ดสั้นพอไม่ตัดกลางวลี (เดิม "ไฟล์ .wmv ใช้ไม่ได้ ต้องแปลงเป็น MKV หรือ ⏎ MP4 ก่อน" เจอ 15 พ.ย. 2569)
    if (!MOVIE_EXT.includes(ext)) { const n = ext ? "ไฟล์ ." + ext : "ไฟล์ที่ไม่มีนามสกุล"; setMovieErr(ext === "wmv" ? `${n} ต้องแปลงเป็น MKV หรือ MP4 ก่อน` : ext === "iso" ? `${n} ต้องแตกไฟล์หนังออกจากอิมเมจแผ่นก่อน` : `${n} ใช้ไม่ได้`); return; }
    setLoading("movie");
    try {
      const m = await posterApi.inspect(path);
      setMoviePath(path);
      setMovie(m);
    } catch (e) {
      setMovieErr(String(e));
    } finally {
      setLoading(null);
    }
  }, []);

  // ---------- รูป ----------
  const loadPoster = useCallback(async (path: string) => {
    setPosterErr(null);
    if (getPosterJob().run.state !== "working") setRun({ state: "idle" });
    const ext = extOf(path);
    if (!IMAGE_EXT.includes(ext)) { setPosterErr(`ไฟล์ .${ext || "?"} ใช้ไม่ได้`); return; }
    setLoading("poster");
    try {
      const info = await posterApi.open(path);
      setPoster(info);
      setChoice(null);
      setCropOpen(true); // วางรูปแล้วหน้าต่างครอปขึ้นเองทุกครั้ง (สเปกข้อ 7)
    } catch (e) {
      setCropOpen(false); // เลือกรูปใหม่จากหน้าต่างครอปแล้วเปิดไม่ได้ ปิดให้เห็นเหตุผลบนการ์ดรูป
      setPosterErr(String(e));
    } finally {
      setLoading(null);
    }
  }, []);

  /** รูปที่ครอปไว้แล้วจากปกจับคู่ · ทำรูปด้วยค่าเดิม ไม่เปิดหน้าครอป */
  const loadChosen = async (img: PosterStart) => {
    setPosterErr(null);
    setLoading("poster");
    try {
      const format = (settings?.posterFormat ?? "jpg") as "jpg" | "png", quality = settings?.jpgQuality ?? 90;
      const info = await posterApi.open(img.path);
      const render = await posterApi.render(img.geo, format, quality, { choose: true });
      setPoster(info);
      setChoice({ geo: img.geo, format, quality, render });
      setUserCrop(false);
      setCropOpen(false);
    } catch (e) {
      setPosterErr(String(e));
    } finally {
      setLoading(null);
    }
  };

  // มาจากปุ่มเปลี่ยนโปสเตอร์บนชั้นวาง · ไฟล์หนังใส่ให้แล้ว
  useEffect(() => {
    if (!p.initialPath) return;
    if (getPosterJob().run.state === "working") {
      toast({ kind: "warn", ms: 6000, key: "poster-busy", title: "กำลังใส่โปสเตอร์อีกเรื่องอยู่", detail: "รอให้เสร็จก่อน แล้วค่อยกดใหม่" });
      p.onConsumed();
      return;
    }
    // เริ่มเรื่องใหม่เหมือนเปิดหน้าครั้งแรก ล้างรูปกับค่าเฉพาะครั้งของงานก่อน · ตั้งแต่ชุด 2 หน้านี้ไม่ถูกสร้างใหม่ตอนเปลี่ยนเมนู
    // รูปของเรื่องก่อนค้างอยู่ กดเริ่มแล้วรูปผิดเรื่องถูกแนบ (เจอตอนรันตัวตรวจ 11 พ.ย. 2569)
    setPoster(null); setChoice(null); setPosterErr(null); setUserCrop(false); setCropOpen(false); setOnce({});
    loadMovie(p.initialPath);
    if (p.initialImage) void loadChosen(p.initialImage);
    p.onConsumed();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [p.initialPath, loadMovie, p]);

  // ---------- ลากไฟล์จาก Explorer มาวาง ----------
  // ตำแหน่งเมาส์ที่ได้เป็นพิกเซลจริงของจอ หารด้วยอัตราขยายของจอก่อนหาช่องใต้เมาส์ (TECH-REVIEW ข้อ 11)
  const zoneAt = (x: number, y: number, paths: string[]): "movie" | "poster" | null => {
    const el = document.elementFromPoint(x / devicePixelRatio, y / devicePixelRatio)?.closest<HTMLElement>("[data-drop]");
    if (el) return el.dataset.drop as "movie" | "poster";
    const e = extOf(paths[0] ?? "");
    return IMAGE_EXT.includes(e) ? "poster" : MOVIE_EXT.includes(e) ? "movie" : null;
  };
  // ระหว่างใส่โปสเตอร์ลากไฟล์มาวางไม่ได้ ช่องลากไม่ขึ้นสีรับไฟล์ และวางแล้วบอกให้รอ
  // เดิมรับไฟล์แล้วตั้งสถานะงานเป็นยังไม่เริ่ม ปุ่มหยุดหาย ทั้งที่งานยังวิ่งอยู่ (AUDIT 12 พ.ย. 2569 ข้อ 5 · พี่กันสั่ง "ตอนทำงานอยู่ ทำให้มันลากมาไม่ได้")
  const busyNow = () => getPosterJob().run.state === "working";
  const handleDrop = useCallback((paths: string[], x: number, y: number) => {
    setOver(null);
    const f = paths[0];
    if (!f) return;
    if (busyNow()) { toast({ kind: "warn", ms: 6000, key: "poster-busy", title: "กำลังใส่โปสเตอร์อยู่", detail: "รอให้งานนี้เสร็จก่อน แล้วค่อยลากไฟล์มาใหม่" }); return; }
    const zone = zoneAt(x, y, paths) ?? "movie";
    if (zone === "poster") loadPoster(f); else loadMovie(f);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loadMovie, loadPoster]);
  const pageOn = usePageActiveRef();
  useEffect(() => {
    if (!inApp) return;
    let off: (() => void) | undefined;
    let live = true;
    import("@tauri-apps/api/webview").then(({ getCurrentWebview }) => getCurrentWebview().onDragDropEvent((e) => {
      if (!pageOn.current) return; // หน้านี้ซ่อนอยู่ (ไปเมนูอื่นแล้ว) ไม่รับไฟล์ที่ลากมา (BUGS ข้อ 9)
      const t = e.payload.type;
      if (t === "over" || t === "enter") {
        if (busyNow()) { setOver(null); return; }
        const pos = e.payload.position;
        const paths = t === "enter" ? e.payload.paths : [];
        setOver((old) => zoneAt(pos.x, pos.y, paths) ?? old);
      } else if (t === "drop") {
        handleDrop(e.payload.paths, e.payload.position.x, e.payload.position.y);
      } else {
        setOver(null);
      }
    })).then((u) => { if (live) off = u; else u(); });
    return () => { live = false; off?.(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [handleDrop]);
  // ตัวเทสหน้าจอเรียกตรงนี้แทนการลากจริง (มีเฉพาะตอนทดสอบ) · ลากจริงจาก Explorer ต้องให้คนลองเอง
  useEffect(() => {
    if (!import.meta.env.DEV) return;
    const w = window as unknown as Record<string, unknown>;
    w.__posterDrop = handleDrop;
    w.__posterOver = setOver;
    return () => { delete w.__posterDrop; delete w.__posterOver; };
  }, [handleDrop]);

  // ---------- ความคืบหน้า ----------
  // กลับมาหน้านี้ระหว่างงานหรือหลังงานจบ · ใส่ไฟล์หนังของงานนั้นกลับให้
  useEffect(() => {
    const j = getPosterJob();
    if (j.run.state !== "idle" && !p.initialPath) { setMoviePath(j.path); setMovie(j.movie); setPoster(j.poster); setChoice(j.choice as CropChoice | null); setTyped(j.name); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ---------- เงื่อนไขปุ่มเริ่ม ----------
  return { loadMovie, loadPoster, loadChosen, zoneAt, busyNow, handleDrop, pageOn };
}
