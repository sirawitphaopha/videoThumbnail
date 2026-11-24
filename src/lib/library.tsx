/* คลังหนังฝั่งหน้าจอ ใช้ร่วมทุกหน้า (ชั้นวาง เมนูซ้าย ตรวจไฟล์)
   อ่านคลังจากฝั่ง Rust ตอนเปิด · ฟังเหตุการณ์ตอนอ่านโฟลเดอร์ ปกขึ้นทีละเรื่อง (สเปกข้อ 5)
   อ่านโฟลเดอร์ใหม่ตอนเปิดโปรแกรมครั้งเดียว ถ้าการตั้งค่าเปิดไว้ (สเปกข้อ 9 ตั้งต้นเปิด) */
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { listen } from "@tauri-apps/api/event";
import { api, inApp, type FolderState, type LibraryReply, type Movie } from "./api";
import { useSettings } from "./settings";
import { useToast } from "../components/Toasts";

type Ctx = {
  movies: Movie[];
  folders: FolderState[];
  loaded: boolean;
  scanning: boolean;
  progress: { done: number; total: number } | null;
  scan: () => void;
};

const LibCtx = createContext<Ctx>({ movies: [], folders: [], loaded: false, scanning: false, progress: null, scan: () => {} });
export const useLibrary = () => useContext(LibCtx);

/** อ่านโฟลเดอร์ตอนเปิดโปรแกรมแล้วหรือยัง · กันโหมดทดสอบของ React สั่งซ้ำสองรอบ */
let startedOnce = false;

export function LibraryHost({ children }: { children: React.ReactNode }) {
  const { settings } = useSettings();
  const toast = useToast();
  const [lib, setLib] = useState<LibraryReply>({ movies: [], folders: [], scanning: false });
  const [loaded, setLoaded] = useState(false);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const byId = useRef(new Map<string, Movie>());
  // หนังที่ขึ้นชั้นแล้วในรอบอ่านนี้ คำว่า อ่านแล้ว X ใช้เลขนี้อย่างเดียว (ดูที่ scan-progress)
  const seen = useRef(0);

  const scan = useCallback(() => {
    setLib((l) => ({ ...l, scanning: true }));
    // ไม่ล้าง seen ตรงนี้ กดอ่านซ้ำระหว่างกำลังอ่าน ฝั่ง Rust อ่านรอบเดิมต่อ ล้างเฉพาะตอน scan-started กับ scan-finished
    setProgress(null);
    api.scanLibrary().catch((e) => {
      setLib((l) => ({ ...l, scanning: false }));
      toast({ kind: "bad", title: "อ่านโฟลเดอร์ไม่สำเร็จ", detail: String(e) });
    });
  }, [toast]);

  // อ่านคลังที่จำไว้ทันที หนังขึ้นชั้นก่อน แล้วค่อยอ่านโฟลเดอร์ใหม่เบื้องหลัง
  useEffect(() => {
    let live = true;
    api.getLibrary().then((r) => {
      if (!live) return;
      byId.current = new Map(r.movies.map((m) => [m.id, m]));
      setLib(r);
      setLoaded(true);
    }).catch((e) => toast({ kind: "bad", title: "อ่านคลังหนังไม่สำเร็จ", detail: String(e) }));
    return () => { live = false; };
  }, [toast]);

  useEffect(() => {
    if (!inApp) return;
    const offs: Promise<() => void>[] = [
      listen<Movie>("movie-updated", (e) => {
        byId.current.set(e.payload.id, e.payload);
        setLib((l) => {
          const i = l.movies.findIndex((m) => m.id === e.payload.id || m.path === e.payload.path);
          const movies = l.movies.slice();
          if (i >= 0) movies[i] = e.payload; else movies.push(e.payload);
          // ไม่แตะสถานะกำลังอ่าน · เหตุการณ์นี้มาจากงานอื่นได้ด้วย (เปลี่ยนชื่อ) เดิมตั้ง scanning เป็นจริงทุกครั้ง
          // เปลี่ยนชื่อเสร็จแล้วหน้าจอค้างว่ากำลังอ่านโฟลเดอร์ ปุ่มดินสอกับปุ่มอ่านโฟลเดอร์ใหม่กดไม่ได้ตลอด
          return { ...l, movies };
        });
        // ฝั่ง Rust ส่งความคืบหน้าไม่เกิน 10 ครั้งต่อวินาที แต่ส่งหนังทุกเรื่อง · นับเพิ่มเองทีละเรื่อง
        // ให้คำว่า อ่านแล้ว X จาก N ตรงกับจำนวนปกที่ขึ้นชั้นจริง (เดิมชั้นขึ้น 12 เรื่อง คำบอกยังเป็น 9)
        seen.current += 1;
        setProgress((p) => (p ? { ...p, done: Math.min(p.total, seen.current) } : p));
      }),
      listen("scan-started", () => { seen.current = 0; setLib((l) => ({ ...l, scanning: true })); }),
      // ใช้แค่จำนวนทั้งหมดจากฝั่ง Rust ส่วนเลขที่อ่านแล้วนับจากหนังที่ขึ้นชั้นจริง
      // ฝั่ง Rust อ่านสามไฟล์พร้อมกัน เธรดที่ได้เลข 5 ส่งความคืบหน้าก่อนเธรดเลข 4 ส่งหนังได้ เดิมใช้เลขของ Rust คำบอกขึ้น 5 ขณะปกบนชั้นมี 4 (check-stage2 เจอ 24 พ.ย. 2569 BUGS ข้อ 157)
      listen<{ done: number; total: number }>("scan-progress", (e) =>
        setProgress({ total: e.payload.total, done: Math.min(e.payload.total, seen.current) })),
      listen<LibraryReply>("scan-finished", (e) => {
        byId.current = new Map(e.payload.movies.map((m) => [m.id, m]));
        setLib(e.payload);
        seen.current = 0;
        setProgress(null);
      }),
      listen<string>("library-error", (e) => toast({ kind: "bad", title: "บันทึกคลังหนังไม่สำเร็จ", detail: e.payload })),
    ];
    return () => { offs.forEach((p) => p.then((off) => off())); };
  }, [toast]);

  // อ่านโฟลเดอร์ตอนเปิดโปรแกรม ครั้งเดียว
  useEffect(() => {
    if (!loaded || !settings || startedOnce) return;
    if (settings.folders.length && settings.rescanOnStart) {
      startedOnce = true;
      scan();
    }
  }, [loaded, settings, scan]);

  const value = useMemo<Ctx>(() => ({
    movies: lib.movies, folders: lib.folders, loaded, scanning: lib.scanning, progress, scan,
  }), [lib, loaded, progress, scan]);

  return <LibCtx.Provider value={value}>{children}</LibCtx.Provider>;
}
