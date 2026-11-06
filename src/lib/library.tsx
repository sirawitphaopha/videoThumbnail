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

  const scan = useCallback(() => {
    setLib((l) => ({ ...l, scanning: true }));
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
          return { ...l, movies, scanning: true };
        });
        // ฝั่ง Rust ส่งความคืบหน้าไม่เกิน 10 ครั้งต่อวินาที แต่ส่งหนังทุกเรื่อง · นับเพิ่มเองทีละเรื่อง
        // ให้คำว่า อ่านแล้ว X จาก N ตรงกับจำนวนปกที่ขึ้นชั้นจริง (เดิมชั้นขึ้น 12 เรื่อง คำบอกยังเป็น 9)
        setProgress((p) => (p ? { ...p, done: Math.min(p.total, p.done + 1) } : p));
      }),
      listen<{ done: number; total: number }>("scan-progress", (e) =>
        setProgress((p) => ({ total: e.payload.total, done: Math.max(e.payload.done, p?.done ?? 0) }))),
      listen<LibraryReply>("scan-finished", (e) => {
        byId.current = new Map(e.payload.movies.map((m) => [m.id, m]));
        setLib(e.payload);
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
