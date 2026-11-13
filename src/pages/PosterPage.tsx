/* หน้า 2 ใส่โปสเตอร์ (สเปกข้อ 7 · ต้นแบบบรรทัด 725–931 · แผนขั้น 4)
   การ์ด ① ไฟล์หนัง ② รูปโปสเตอร์ ③ หน้าตาที่จะได้ · ตัวเลือก · ไฟล์ที่ได้ MKV / MP4 · ปุ่มล่าง
   ลากไฟล์จาก Explorer มาวางที่ช่อง หรือที่ไหนก็ได้ในหน้า (เลือกช่องตามชนิดไฟล์) · วางผิดชนิดช่องแดงค้างจนกว่าจะวางใหม่
   วางรูปแล้วหน้าต่างครอปขึ้นเองทุกครั้ง · MKV อยู่แล้วเปลี่ยนแค่รูปแนบ · ไฟล์อื่นครอบเป็น MKV ไม่แปลงภาพเสียงใหม่
   กำลังทำ บอกเปอร์เซ็นต์ เวลาที่เหลือ ขั้นถัดไป ปุ่มหยุด (ถามก่อน) · เลือกลบไฟล์เดิม ยืนยัน 2 ขั้นตอนกดเริ่ม */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { usePageActiveRef } from "../lib/pageActive";
import type { Page } from "../components/Sidebar";
import Dialog from "../components/Dialog";
import ImageViewer from "../components/ImageViewer";
import CropDialog, { type CropChoice } from "../components/CropDialog";
import { CardIcon, Keep, LoadPill, Phr, Seg, dropClick } from "../components/ui";
import ThaiInput from "../components/ThaiInput";
import { frameApi, inApp, pickFile, posterApi, thumbUrl, type Geometry, type ApplyProblem, type ApplyResult, type FolderImage, type MovieInfo, type PosterInfo, type RenameProblem, type StreamInfo } from "../lib/api";
import { useSettings } from "../lib/settings";
import { useLibrary } from "../lib/library";
import { fmtDuration, fmtSize } from "../lib/format";
import { ftName } from "../lib/ftypes";
import { kb } from "../lib/popup";
import { useToast } from "../components/Toasts";
import { getPosterJob, setPosterJob, usePosterJob, type Run } from "../lib/posterJob";
import { IcFile, IcPoster, IcFolder, IcExpand, IcClose } from "../components/icons";
import { IbTrash, IbBack, IbNext, IbStop, IcRefresh, IcShelf } from "../components/icons";
import { IbCrop } from "../components/icons";

const MOVIE_EXT = ["mkv", "mp4", "m4v", "mov", "avi", "webm", "ts", "m2ts", "mpg", "mpeg", "vob", "flv"];
const IMAGE_EXT = ["jpg", "jpeg", "png", "webp", "bmp", "tif", "tiff", "heic", "heif"];
const extOf = (p: string) => (p.match(/\.([^.\\/]+)$/)?.[1] ?? "").toLowerCase();
const baseName = (p: string) => p.split(/[\\/]/).pop() ?? p;


/** ปุ่มรวมเข้าไฟล์ของปกจับคู่ · รูปกับค่าครอปที่ทำไว้แล้ว ไม่ต้องครอปซ้ำ · เปิดหน้าครอปแก้ต่อได้จากการ์ดรูป */
export type PosterStart = { path: string; geo: Geometry };

export default function PosterPage(p: { initialPath: string | null; initialImage?: PosterStart | null; onPage: (pg: Page) => void; onConsumed: () => void }) {
  const { settings } = useSettings();
  const toast = useToast();
  const { movies } = useLibrary();
  const [moviePath, setMoviePath] = useState<string | null>(null);
  const [movie, setMovie] = useState<MovieInfo | null>(null);
  const [movieErr, setMovieErr] = useState<string | null>(null);
  const [poster, setPoster] = useState<PosterInfo | null>(null);
  const [posterErr, setPosterErr] = useState<string | null>(null);
  const [choice, setChoice] = useState<CropChoice | null>(null);
  /** ผู้ใช้ครอปเองในหน้าต่างครอปแล้ว · ไม่ขึ้นกล่องเลือกแบบปกบนการ์ด อยากเปลี่ยนก็กดครอปภาพใหม่ (BUGS ข้อ 8 · พี่กันเคาะ "เพราะถ้าผู้ใช้อยากจะแก้ ก็เเค่ไปครอบใหม่") */
  const [userCrop, setUserCrop] = useState(false);
  const [cropOpen, setCropOpen] = useState(false);
  const [listOpen, setListOpen] = useState(false);
  const [over, setOver] = useState<"movie" | "poster" | null>(null);
  const [loading, setLoading] = useState<"movie" | "poster" | null>(null);
  // สถานะงานอยู่ระดับโปรแกรม (lib/posterJob) เปลี่ยนหน้าแล้วกลับมายังเห็นงานเดิม ปุ่มหยุด และผล
  const job = usePosterJob();
  const run = job.run;
  const setRun = (r: Run) => setPosterJob({ run: r });
  const [askDelete, setAskDelete] = useState<0 | 1 | 2>(0);
  const [askStop, setAskStop] = useState(false);
  const [runMore, setRunMore] = useState<{ title: string; lines: string[] } | null>(null);
  const [drop, setDrop] = useState<number[]>([]);
  /** ซับ ASS ที่กดทำต่อแล้ว (ใส่ MP4 ได้แต่สีกับฟอนต์หาย) */
  const [ack, setAck] = useState<number[]>([]);
  /** หน้าต่างเตือนแทร็กที่ใส่ใน MP4 ไม่ได้ · เดิมขึ้นในการ์ดไฟล์ที่ได้ กรอบสูงขึ้นจนหกกรอบเปลี่ยนขนาด (BUGS ข้อ 57 พี่กันสั่ง 12 พ.ย. 2569 "ไปหาเตือนที่อื่น ... มัน 6 กรอบ ต้องขนาดเท่ากันตลอด")
      "pick" ขึ้นตอนกดเลือก MP4 · "start" ขึ้นตอนกดเริ่ม (เปลี่ยนไฟล์หนังทีหลังแล้วเจอแทร็กที่ใส่ไม่ได้) */
  const [askMp4, setAskMp4] = useState<null | "pick" | "start">(null);
  /** ดูรูปเต็มจอจากปุ่มมุมรูปของสามการ์ด (BUGS ข้อ 56 พี่กันสั่ง 12 พ.ย. 2569 "ส่ปุ่มขยายดูรูปให้ครบทั้งสามอัน") · ตัวดูรูปเดียวกับชั้นวาง */
  const [big, setBig] = useState<{ src: string; rect: DOMRect; name: string } | null>(null);
  const bigBtn = (src: string | null | undefined, name: string) => src ? (
    <button type="button" className="bigbtn pbig" title="ขยายดูเต็มจอ" aria-label={"ขยายดู " + name + " เต็มจอ"} data-pbig={name}
      onClick={(e) => { e.stopPropagation(); setBig({ src, rect: (e.currentTarget.parentElement ?? e.currentTarget).getBoundingClientRect(), name }); }}><IcExpand size={13} /></button>
  ) : null;
  /** ชื่อไฟล์ใหม่ที่พิมพ์ (พี่กันสั่ง 9 พ.ย. 2569 "ให้ตั้งชื่อไฟล์ด้วยสิ") · ยังไม่พิมพ์ใช้ชื่อไฟล์ต้นทาง · เปลี่ยนไฟล์หนังแล้วล้าง */
  const [typed, setTyped] = useState<string | null>(null);
  /* ตัวเลือกบนหน้านี้เปลี่ยนเฉพาะครั้งนี้ ไม่เขียนทับค่าตั้งต้นในหน้าตั้งค่า (ต้นแบบหน้าตั้งค่า *"ค่าที่ตั้งตรงนี้คือค่าตั้งต้น ทุกครั้งที่ใส่โปสเตอร์หรือตรวจไฟล์ยังเปลี่ยนเฉพาะครั้งนั้นได้"*)
     เดิมกดบนหน้านี้แล้วค่าตั้งต้นเปลี่ยนถาวร เลือกลบไฟล์เดิมครั้งเดียว ไฟล์ถัดไปเริ่มที่ลบ (ผู้ช่วยตรวจสเปกเจอ) · ยังไม่ได้แตะ ใช้ค่าตั้งต้น · ล้างทั้งหมดกลับเป็นค่าตั้งต้น */
  const [once, setOnce] = useState<{ outputFormat?: "mkv" | "mp4"; originalAfter?: "keep" | "trash"; checkSourceBefore?: boolean; checkOutputAfter?: boolean }>({});
  const setOne = (patch: typeof once) => setOnce((o) => ({ ...o, ...patch }));
  const output = (once.outputFormat ?? settings?.outputFormat ?? "mkv") as "mkv" | "mp4";
  const original = (once.originalAfter ?? settings?.originalAfter ?? "keep") as "keep" | "trash";
  const checkSource = once.checkSourceBefore ?? settings?.checkSourceBefore ?? true;
  const checkOutput = once.checkOutputAfter ?? settings?.checkOutputAfter ?? true;

  // ---------- ไฟล์หนัง ----------
  const loadMovie = useCallback(async (path: string) => {
    setTyped(null);
    setMovieErr(null);
    setRun({ state: "idle" });
    setDrop([]);
    setAck([]);
    const ext = extOf(path);
    // WMV ต้องแปลงก่อน · ISO ต้องแตกไฟล์ก่อน (สเปกข้อ 10) · เดิมบอกแค่ใช้ไม่ได้ ไม่บอกทางไปต่อ (ผู้ช่วยตรวจสเปกเจอ)
    if (!MOVIE_EXT.includes(ext)) { setMovieErr(`${ext ? "ไฟล์ ." + ext : "ไฟล์ที่ไม่มีนามสกุล"} ใช้ไม่ได้${ext === "wmv" ? " ต้องแปลงเป็น MKV หรือ MP4 ก่อน" : ext === "iso" ? " ต้องแตกไฟล์หนังออกจากอิมเมจแผ่นก่อน" : ""}`); return; }
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
    setRun({ state: "idle" });
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
      toast({ kind: "info", title: "กำลังใส่โปสเตอร์อีกเรื่องอยู่", detail: "รอให้เสร็จก่อน แล้วค่อยกดใหม่" });
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
  const handleDrop = useCallback((paths: string[], x: number, y: number) => {
    setOver(null);
    const f = paths[0];
    if (!f) return;
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
  const isMkv = movie?.ext === "mkv";
  const mode = output === "mp4" ? "mp4" : isMkv ? "cover" : "wrap";
  const mp4Bad: StreamInfo[] = output === "mp4" && movie ? movie.streams.filter((s) => (s.mp4 === "no" && !drop.includes(s.index)) || (s.mp4 === "style" && !ack.includes(s.index) && !drop.includes(s.index))) : [];
  const mp4VideoBad = mp4Bad.some((s) => s.kind === "video" && s.mp4 === "no");
  const inLib = movies.find((m) => moviePath && m.path.toLowerCase() === moviePath.toLowerCase());
  // รูปตัวอย่างหนัง เรื่องที่ยังไม่มีปกใช้ภาพจริงจากในหนัง ดึงไม่ได้เป็นพื้นสีตามเดิม (พี่กันสั่ง 9 พ.ย. 2569 "ขยายรูตัวอย่างกนังด้วย")
  const [frameUrl, setFrameUrl] = useState<string | null>(null);
  const hasCover = !!inLib?.thumb, framePath = movie?.path ?? null, frameDur = movie?.duration ?? 0;
  useEffect(() => {
    setFrameUrl(null);
    if (!framePath || hasCover) return;
    let live = true;
    frameApi.movie(framePath, frameDur).then((p) => { if (live) setFrameUrl(p); }, () => { /* ดึงไม่ได้ ใช้พื้นสี */ });
    return () => { live = false; };
  }, [framePath, frameDur, hasCover]);
  const newStem = typed ?? movie?.name ?? "";
  const [nameProblem, setNameProblem] = useState<RenameProblem | null>(null);
  const nameSeq = useRef(0);
  // เช็กชื่อตอนพิมพ์ ตัวเช็กเดียวกับปุ่มเปลี่ยนชื่อบนชั้นวาง · ผลที่มาช้ากว่าตัวที่พิมพ์ล่าสุดทิ้ง · ชื่อไฟล์ต้นทางก็ชนได้ จึงเช็กตั้งแต่ใส่ไฟล์
  useEffect(() => {
    const n = ++nameSeq.current;
    if (!moviePath || mode === "cover" || run.state === "working") { setNameProblem(null); return; }
    const t = setTimeout(() => {
      posterApi.checkName(moviePath, output, newStem).then((r) => { if (n === nameSeq.current) setNameProblem(r ?? null); }).catch(() => {});
    }, 120);
    return () => clearTimeout(t);
  }, [moviePath, mode, output, newStem, run.state]);
  const startLabel = output === "mp4" ? "ส่งออกเป็น MP4 พร้อมโปสเตอร์" : isMkv ? (inLib?.hasCover ? "เปลี่ยนโปสเตอร์" : "ใส่โปสเตอร์ลงไฟล์นี้") : "ครอบเป็น MKV พร้อมโปสเตอร์";
  const blocked = !movie ? "ยังกดไม่ได้ ใส่ไฟล์หนังก่อน"
    : !choice ? "ยังกดไม่ได้ ใส่รูปโปสเตอร์ก่อน"
    : mp4VideoBad ? "ไฟล์นี้ส่งออกเป็น MP4 ไม่ได้ ใช้ MKV แทน"
    : nameProblem ? nameProblem.title
    : null;

  const start = async (dropNow: number[] = drop) => {
    if (!movie || !moviePath || !choice) return;
    setPosterJob({ run: { state: "working", progress: null }, path: moviePath, movie, mode, poster, choice, name: mode === "cover" ? null : newStem });
    try {
      const result = await posterApi.apply({
        path: moviePath, output, checkSource, checkOutput,
        original: mode === "cover" ? "keep" : original, drop: dropNow,
        name: mode === "cover" ? undefined : newStem,
      });
      setRun({ state: "done", result });
      if (result.mode !== "cover") { setMovie(null); setMoviePath(null); setTyped(null); setPosterJob({ path: null, movie: null, name: null }); }
      else posterApi.inspect(moviePath).then((m) => { setMovie(m); setPosterJob({ movie: m }); }).catch(() => {});
    } catch (e) {
      const problem = e && typeof e === "object" && "title" in e ? (e as ApplyProblem) : { kind: "other", title: "ใส่โปสเตอร์ไม่สำเร็จ", detail: [String(e)] };
      setRun({ state: "failed", problem });
    }
  };
  /** ทุกทางที่เริ่มงานผ่านตัวนี้ (ปุ่มเริ่ม · ลองใหม่ · ทิ้งแทร็กแล้วทำต่อ) ให้หน้าต่างยืนยันลบ 2 ขั้นขึ้นทุกครั้งที่ตั้งลบไฟล์เดิม
      เดิมปุ่มลองใหม่กับปุ่มทิ้งแทร็กเรียก start ตรง ไฟล์เดิมลงถังขยะได้โดยไม่ถาม (ผู้ช่วยตรวจโค้ดเจอ)
      ready = ผู้เรียกรู้แล้วว่าพร้อม (ปุ่มทิ้งแทร็กข้อสุดท้าย สถานะยังไม่ทันอัปเดต blocked ยังค้างเป็นข้อนั้น) */
  const pendingDrop = useRef<number[] | null>(null);
  const pressStart = (dropNow: number[] = drop, ready = false) => {
    if ((blocked && !ready) || run.state === "working") return;
    if (!ready && mp4Bad.length) { setAskMp4("start"); return; }
    if (mode !== "cover" && original === "trash") { pendingDrop.current = dropNow; setAskDelete(1); return; }
    start(dropNow);
  };
  /** เลือกแบบปกหรือชนิดไฟล์จากการ์ดรูป · ทำรูปใหม่ด้วยค่าเดิม เปลี่ยนแค่แบบหรือชนิด · กลับเป็นตัดให้พอดีปก ใช้กรอบกลางรูป */
  const [rendering, setRendering] = useState(false);
  const rechoose = async (patch: { mode?: Geometry["mode"]; format?: "jpg" | "png" }) => {
    if (!poster || !choice) return;
    let geo = choice.geo;
    if (patch.mode && patch.mode !== geo.mode) {
      geo = { ...geo, mode: patch.mode };
      if (patch.mode === "crop") { const [x, y, w, h] = centerCrop(poster, geo.rotate); geo = { ...geo, x, y, w, h }; }
    }
    const format = patch.format ?? choice.format;
    setRendering(true);
    try {
      const render = await posterApi.render(geo, format, choice.quality, { choose: true });
      setChoice({ geo, format, quality: choice.quality, render });
    } catch (e) {
      toast({ kind: "bad", title: "ทำรูปโปสเตอร์ไม่ได้", detail: String(e) });
    } finally { setRendering(false); }
  };
  const clearAll = () => {
    if (run.state === "working") return;
    setMovie(null); setMoviePath(null); setMovieErr(null); setPoster(null); setPosterErr(null); setChoice(null); setUserCrop(false); setDrop([]); setOnce({}); setTyped(null); setRun({ state: "idle" });
    posterApi.clear().catch(() => {});
  };

  const working = run.state === "working";
  const runMode = working ? job.mode : mode;
  // กำลังทำ เสร็จ ไม่สำเร็จ ต้องเห็นได้โดยไม่ต้องเลื่อนหา (สกิล save-status) · การ์ดอยู่ล่างหน้า เลื่อนมาให้เห็นเอง
  const runBox = useRef<HTMLDivElement>(null);
  useEffect(() => { runBox.current?.scrollIntoView({ block: "nearest", behavior: "smooth" }); }, [run.state]);
  const pct = working && run.progress ? Math.round(run.progress.percent) : 0;
  /** สัดส่วนปกใหม่ ไม่เกิน 16 : 9 แบบเดียวกับที่ชั้นวางวาง */
  const newAr = choice ? Math.min(choice.render.width / choice.render.height, 16 / 9) : 2 / 3;
  const newExt = output === "mp4" ? ".mp4" : ".mkv";
  const newName = movie ? movie.name + newExt : "";

  return (
    <div className="pagewrap" data-poster-page>
      <div className="wrapin">
        <div className="three">
          {/* ① ไฟล์หนัง */}
          <div className="card" data-card="movie">
            <h3><span className="step">1</span>ไฟล์หนัง</h3>
            {movie && !movieErr && over !== "movie" ? (
              <>
                <div className="vfile" data-drop="movie">
                  <div className="pbigwrap">
                    {inLib?.thumb ? <img className="vthumb cover" src={thumbUrl(inLib.thumb) ?? undefined} alt="" data-moviethumb /> : frameUrl ? <img className="vthumb" src={thumbUrl(frameUrl) ?? undefined} alt="ภาพจากหนัง" data-moviethumb /> : <div className="vthumb" data-moviethumb />}
                    {bigBtn(inLib?.thumb ? thumbUrl(inLib.thumb) : frameUrl ? thumbUrl(frameUrl) : null, movie ? baseName(movie.path) : "ไฟล์หนัง")}
                  </div>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontWeight: 600, fontSize: 14, lineHeight: 1.5, wordBreak: "break-word" }}><Phr>{baseName(movie.path)}</Phr></div>
                    <div className="small"><span className="nw">{fmtSize(movie.size)}</span>{movie.duration ? <> ยาว <span className="nw">{fmtDuration(movie.duration)}</span></> : null}<br />{/* ขนาดภาพกับ codec ใช้คำอังกฤษทั่วไป (BUGS ข้อ 64 พี่กันสั่ง 12 พ.ย. 2569 "ขนาดภาพ เเละ codec ขอภาษษอังกิต ที่คำทั่วไป" · ข้อ 64 ต่อ "เอา res ออก ใส่ px") */}<span className="nw">{movie.width} × {movie.height} px</span>{movie.streams.find((x) => x.kind === "video") && <>, Codec <span data-moviecodec>{ftName("video", movie.streams.find((x) => x.kind === "video")!.codec)}</span></>}{movie.streams.some((x) => x.kind === "audio") && <><br />เสียง <span data-movieaudio>{[...new Set(movie.streams.filter((x) => x.kind === "audio").map((x) => ftName("audio", x.codec)))].join(", ")}</span></>}</div>
                    <div className="small">ลากไฟล์อื่นมาวางทับเพื่อเปลี่ยนได้</div>
                  </div>
                </div>
                <Btn off={working && BUSY} style={{ marginTop: 10 }} onClick={async () => { const f = await pickFile("movie"); if (f) loadMovie(f); }}><IcFile size={15} />เลือกไฟล์จากเครื่อง</Btn>
              </>
            ) : (
              <>
                <div className={"drop" + (over === "movie" ? " over" : movieErr ? " bad" : "")} data-drop="movie" onClick={dropClick(async () => { if (working) return; const f = await pickFile("movie"); if (f) loadMovie(f); })}>
                  {over === "movie" ? <b>ปล่อยเมาส์เพื่อใส่ไฟล์นี้</b>
                    : movieErr ? <><b>{movieErr}</b><div><Phr>ไฟล์หนังรองรับ MKV MP4 M4V MOV AVI WebM TS M2TS MPG MPEG VOB FLV</Phr></div></>
                    : loading === "movie" ? "กำลังอ่านไฟล์หนัง…" : <>ลากไฟล์หนังมาวางตรงนี้<br />MKV MP4 และอีก 10 ชนิด</>}
                  <Btn off={working && BUSY} onClick={async () => { const f = await pickFile("movie"); if (f) loadMovie(f); }}><IcFile size={15} />เลือกไฟล์จากเครื่อง</Btn>
                </div>
              </>
            )}
            <div className="small pcap" style={{ marginTop: 10 }}><div>รองรับ MKV MP4 M4V MOV<br />AVI WebM TS M2TS MPG MPEG VOB และ FLV</div></div>
          </div>

          {/* ② รูปโปสเตอร์ */}
          <div className="card" data-card="poster">
            <h3><span className="step">2</span>รูปโปสเตอร์</h3>
            {poster && choice && !posterErr && over !== "poster" ? (
              <div className="pprev" data-drop="poster">
                <div className="pbigwrap">
                  <img className="pp" src={thumbUrl(choice.render.preview) ?? undefined} alt="รูปโปสเตอร์ที่จะแนบ" data-pp />
                  {bigBtn(thumbUrl(choice.render.preview), poster.name)}
                </div>
                <div className="ppinfo">
                <div className="small" style={{ minWidth: 0, flex: 1 }}>
                  <span style={{ wordBreak: "break-all" }}>{poster.name}</span><br />
                  {poster.attachable ? <><span className="extag ok">.{poster.ext}</span> แนบได้เลย</> : <><span className="extag extcv">.{poster.ext}→.{choice.format}</span> แปลงให้ก่อนแนบ</>}<br />
                  <span className="nw">{choice.render.width} × {choice.render.height} px</span> ขนาด <span className="nw">{fmtSize(choice.render.bytes)}</span><br />
                  <span className="ppmode">{poster.twoThree ? "สัดส่วน 2 : 3 พอดีปก" : choice.geo.mode === "pad" ? "เติมขอบให้เต็มปก" : choice.geo.mode === "original" ? "ใช้ตามรูปเดิม ไม่ตัด" : "ครอปให้พอดีปกแล้ว"}<br /></span>
                  {/* กติกาเดียวกับ poster.rs กว้างมากกว่าสูงเป็นปกนอน นอกนั้นปกตั้ง · MP4 ไม่มีชื่อไฟล์แนบ ฝังเป็นรูปปกของไฟล์ */}
                  <span data-attach-name><b style={{ color: "var(--txt)" }}>{choice.render.width > choice.render.height ? "ปกนอน" : "ปกตั้ง"}</b> {output === "mp4" ? "ฝังเป็นรูปปกของ MP4" : <>แนบเป็น <span className="nw">{choice.render.width > choice.render.height ? "cover_land" : "cover"}.{choice.format}</span></>}</span>
                </div>
                <span className="ppbtns">
                  {/* สามปุ่มชุดเดียวกับช่องปกของหน้าเสียงและซับ (BUGS ข้อ 59 พี่กันสั่ง 12 พ.ย. 2569 "เอาสามอัน เปลี่ยนรูป ครอบ/แปลงภาพ เเละ เอาออก เเละใส่ icon ด้วย" · ข้อ 59 ต่อ "เราเอาคำเดียว จะเอารูป หรือ ภาพ" ใช้ รูป) */}
                  <Btn off={working && BUSY} onClick={() => setListOpen(true)}><IcPoster size={15} />เปลี่ยนรูป</Btn>
                  <Btn off={working && BUSY} onClick={() => setCropOpen(true)}><IbCrop size={15} />ครอป/แปลงรูป</Btn>
                  <Btn off={working && BUSY} onClick={() => { setPoster(null); setChoice(null); setPosterErr(null); setUserCrop(false); posterApi.clear().catch(() => {}); }}><IcClose size={15} />เอารูปออก</Btn>
                </span>
                </div>
              </div>
            ) : (
              <>
                <div className={"drop" + (over === "poster" ? " over" : posterErr ? " bad" : "")} data-drop="poster" onClick={dropClick(async () => { if (working) return; const f = await pickFile("image"); if (f) loadPoster(f); })}>
                  {over === "poster" ? <b>ปล่อยเมาส์เพื่อใส่รูปนี้</b>
                    : posterErr ? <><b>{posterErr.split(/ · |  /)[0]}</b><div><Phr>รับรูป JPG PNG WebP BMP TIFF และ HEIC</Phr></div></>
                    : loading === "poster" ? "กำลังอ่านรูป…" : <>{movie && !poster && <b data-moviefirst>ไฟล์หนังใส่ให้แล้ว เหลือรูปโปสเตอร์</b>}ลากรูปโปสเตอร์มาวางตรงนี้<br />JPG PNG WebP BMP TIFF และ HEIC</>}
                  <span style={{ display: "flex", gap: 6, justifyContent: "center", flexWrap: "wrap" }}>
                    <Btn off={working && BUSY} onClick={async () => { const f = await pickFile("image"); if (f) loadPoster(f); }}><IcPoster size={15} />เลือกรูปจากเครื่อง</Btn>
                    {moviePath && <Btn off={working && BUSY} onClick={() => setListOpen(true)}><IcFolder size={15} />รูปในโฟลเดอร์หนัง</Btn>}
                  </span>
                </div>
              </>
            )}
            {/* รูปไม่ใช่ 2:3 เลือกแบบปกบนการ์ดได้เลย (สเปกข้อ 7 · เดิมบอกแค่แบบที่เลือกไว้ ต้องเปิดหน้าต่างครอปถึงเปลี่ยนได้ ผู้ช่วยตรวจสเปกเจอ) · ตามรูปเดิม พี่กันสั่งเพิ่ม */}
            {poster && !poster.twoThree && choice && !userCrop && (
              <div className="stat warn" style={{ marginTop: 12, flexWrap: "wrap" }} data-not23><CardIcon kind="warn" /><div style={{ flex: 1, minWidth: 0 }}><b>รูปนี้เป็น{poster.aspect.replace(/^รูป/, "")}</b></div>
                <div className="not23seg">
                  <Seg small label="แบบปก" value={choice.geo.mode} onChange={(v) => { if (!working && !rendering) rechoose({ mode: v }); }} disabledReason={working ? "รอให้งานที่ทำอยู่เสร็จก่อน" : undefined}
                    options={[{ value: "crop", label: <><IbCrop size={14} />ตัดพอดี</> }, { value: "pad", label: <><IcPoster size={14} />เติมขอบ</> }, { value: "original", label: <><IcFile size={14} />ตามรูปเดิม</> }]} />
                </div></div>
            )}
            {/* รูปที่แนบใน MKV ตรง ๆ ไม่ได้ (สเปกข้อ 7 ส่วนแปลงชนิดรูป) · แจ้งสั้น ๆ ชื่อรูปกับนามสกุลที่จะได้ เหตุผลกับปุ่มเลือก JPG PNG อยู่ในหน้าครอปที่เลือกไปแล้ว
                เดิมมีปุ่มเลือกซ้ำในการ์ดนี้ (BUGS ข้อ 55 พี่กันสั่ง 12 พ.ย. 2569 "เราเลือกการแปลงเเเล้วเราจะมาให้กดอีกรอบทำไม" · "ถ้าจะเเจ้งที่หน้าหลัก ก็สั้นๆ") */}
            {poster && !poster.attachable && choice && (
              <div className="stat warn" style={{ marginTop: 12 }} data-convert><CardIcon kind="warn" /><div style={{ minWidth: 0 }}><b style={{ wordBreak: "break-all" }}>{poster.name} ต้องแปลงก่อนแนบ</b>
                <div>นามสกุลเดิม <span className="extag extcv">.{poster.ext} → .{choice.format}</span></div></div></div>
            )}
            <div className="small pcap" style={{ marginTop: 10 }}><div>JPG และ PNG แนบได้เลย<br />ส่วน WebP BMP TIFF และ HEIC จะแปลงให้ก่อนแนบ</div></div>
          </div>

          {/* ③ หน้าตาที่จะได้ */}
          <div className="card" data-card="result">
            <h3><span className="step">3</span>หน้าตาที่จะได้</h3>
            <div className="resbox">
              <div className={"resmain" + (mode === "cover" && inLib?.thumb && choice ? " two" : "")} style={{ "--sum": 2 / 3 + newAr } as React.CSSProperties}>
              {mode === "cover" && inLib?.thumb && choice && (
                <div style={{ textAlign: "center" }}><img className="mc" src={thumbUrl(inLib.thumb) ?? undefined} alt="ปกเดิม" /><div className="small" style={{ marginTop: 6 }}>ปกเดิม</div></div>
              )}
              <div style={{ textAlign: "center" }}>
                {choice ? <span className="pbigwrap res"><img className="mc" style={{ "--ar": newAr } as React.CSSProperties} src={thumbUrl(choice.render.preview) ?? undefined} alt="ปกใหม่" data-newcover />{bigBtn(thumbUrl(choice.render.preview), "หน้าตาที่จะได้")}</span> : <div className="mc none" />}
                {mode === "cover" && inLib?.thumb && choice && <div className="small" style={{ marginTop: 6 }}>ปกใหม่</div>}
              </div>
              </div>
              <div className="small rescap pcap" style={{ minWidth: 0 }}><div>
                ตัวอย่างหน้าตาบนชั้นวางของโปรแกรมนี้<br />
                {movie ? (mode === "cover" ? <>ไฟล์เดิม<br /><b style={{ color: "var(--txt)", wordBreak: "break-word" }}><Phr>{newName}</Phr></b><br /><b style={{ color: "var(--txt)" }}><Phr>ไฟล์เป็น MKV อยู่แล้ว เปลี่ยนแค่รูปแนบ ไม่ต้องครอบใหม่</Phr></b></>
                  : <>ไฟล์ใหม่ ตั้งชื่อได้
                    <div data-newname><ThaiInput value={newStem} onChange={setTyped} label={"ชื่อไฟล์ใหม่ ไม่รวมนามสกุล " + newExt} suffix={newExt} err={!!nameProblem} readOnly={working} describedBy="newname-hint" /></div>
                    {nameProblem
                      ? <div id="newname-hint" className="pnerr" role="alert" data-newname-err><Phr>{nameProblem.title}</Phr></div>
                      : <div id="newname-hint">ขนาดราว <span className="nw">{fmtSize(movie.size + (choice?.render.bytes ?? 0))}</span> เท่าเดิม</div>}</>)
                  : choice ? "ใส่ไฟล์หนังก่อนจึงจะเห็นตัวอย่าง" : "ใส่ไฟล์หนังกับรูปโปสเตอร์ก่อนจึงจะเห็นตัวอย่าง"}
              </div></div>
            </div>
          </div>
        </div>

        {/* ตัวเลือก 3 กลุ่ม ตรงแนวกับ 3 ช่องข้างบน · ชื่อกลุ่มแคลร์ตั้ง */}
        <div className="three">
          <div className="card" data-opt="check">
            <h3>ตรวจไฟล์</h3>
            <div className="opts">
              <Check on={checkSource} onChange={(v) => setOne({ checkSourceBefore: v })} title={mode === "cover" ? "ตรวจไฟล์ก่อนเปลี่ยนรูปแนบ" : "ตรวจไฟล์ต้นทางก่อนครอบ"} note="ถ้าไฟล์เสียอยู่แล้วจะบอกก่อนลงมือ" disabled={working} />
              <Check on={checkOutput} onChange={(v) => setOne({ checkOutputAfter: v })} title={mode === "cover" ? "ตรวจรูปแนบหลังเปลี่ยนเสร็จ" : "ตรวจไฟล์ใหม่หลังครอบเสร็จ"} note={mode === "cover" ? "ดึงปกออกมาเทียบกับรูปที่ทำทุกไบต์" : "เทียบว่าภาพ เสียง และซับครบเท่าต้นทาง"} disabled={working} />
            </div>
          </div>
          <div className="card" data-opt="original">
            <h3>ไฟล์เดิมหลังครอบ</h3>
            <div className="opts" title={mode === "cover" ? "ไฟล์เป็น MKV อยู่แล้ว เปลี่ยนแค่รูปแนบ ไม่มีไฟล์เดิมแยก" : undefined}>
              <Radio on={original === "keep"} onChange={() => setOne({ originalAfter: "keep" })} disabled={working || mode === "cover"}
                title={`เก็บไฟล์เดิมไว้ ย้ายไปโฟลเดอร์ "ไฟล์เดิม"`} note={movie ? `ปลอดภัยที่สุด แต่ใช้พื้นที่เพิ่ม ${fmtSize(movie.size)}` : "ปลอดภัยที่สุด แต่ใช้พื้นที่เพิ่มเท่าไฟล์หนัง"} />
              <Radio on={original === "trash"} onChange={() => setOne({ originalAfter: "trash" })} disabled={working || mode === "cover"}
                title="ลบไฟล์เดิมหลังตรวจไฟล์ใหม่ผ่านแล้ว" note={mode === "cover" ? "ไฟล์เป็น MKV อยู่แล้ว ไม่มีไฟล์เดิมแยก" : "ไม่ลบถ้าไฟล์ใหม่ตรวจไม่ผ่าน"} />
            </div>
          </div>
          <div className="card" data-opt="output">
          <h3>ไฟล์ที่ได้</h3>
          <div>
            <Seg label="ไฟล์ที่ได้" value={output} onChange={(v) => { setDrop([]); setAck([]); setOne({ outputFormat: v }); if (v === "mp4" && movie?.streams.some((x) => x.mp4 === "no" || x.mp4 === "style")) setAskMp4("pick"); }}
              disabledReason={working ? "รอให้งานที่ทำอยู่เสร็จก่อน" : undefined}
              options={[{ value: "mkv", label: "MKV (แนะนำ)" }, { value: "mp4", label: "MP4" }]} />
            <div className="small" style={{ marginTop: 8 }}><Phr>{"MKV ใส่ซับและเสียงได้ทุกแบบ ส่วน MP4 ปกขึ้นเป็นไอคอนใน Windows ได้เลยโดยไม่ต้องลง Icaros แต่ใส่ซับบางแบบไม่ได้"}</Phr></div>
          </div>
          </div>
        </div>

        <div className="three pactions">
          <div className="pact-msg">
            {/* สถานะงานอยู่ในแถบนี้ ไม่เพิ่มความสูงหน้า · รายละเอียดยาวเปิดดูจากปุ่ม · ยังไม่เริ่มก็แสดงแถบเปล่าไว้ ไม่มีอะไรโผล่ทีหลัง */}
            {run.state === "idle" && (
              <div className="runline idle" data-run-idle>
                <div className="runtxt">
                  <div className="runl1">ยังไม่เริ่ม 0%</div>
                  <div className="bar" role="progressbar" aria-label="ความคืบหน้า" aria-valuenow={0} aria-valuemin={0} aria-valuemax={100}><i style={{ width: 0 }} /></div>
                </div>
              </div>
            )}
            {run.state === "working" && (
              <div ref={runBox} className="runline" data-run="working">
                <div className="runtxt">
                  <div className="runl1">{run.progress?.phase ?? "กำลังเริ่ม…"} {pct}%{run.progress?.eta != null && run.progress.eta > 0 ? <> เหลือราว <span className="nw">{fmtEta(run.progress.eta)}</span></> : null}{run.progress?.next ? <> ขั้นถัดไปคือ{run.progress.next}</> : null}</div>
                  <div className="bar" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}><i style={{ width: `${pct}%` }} /></div>
                </div>
                {/* เปลี่ยนรูปแนบแก้ไฟล์เดิมตรง ๆ หยุดได้เฉพาะช่วงตรวจไฟล์ต้นทาง (ยังไม่แตะไฟล์) · ช่วงแก้ไฟล์ใช้ไม่กี่วินาที หยุดกลางทางไม่ได้ */}
                {runMode === "cover" && !(run.progress?.phase ?? "กำลังตรวจไฟล์ต้นทาง").startsWith("กำลังตรวจไฟล์ต้นทาง")
                  ? <div className="small" data-nostop>หยุดกลางทางไม่ได้</div>
                  : <button type="button" className="btn btn-bad btn-sm" onClick={() => setAskStop(true)}><IbStop size={15} />หยุด</button>}
              </div>
            )}
            {run.state === "done" && <div ref={runBox} className="runline ok" data-run="done" role="status"><DoneCard r={run.result} onShelf={() => p.onPage("shelf")} onClose={() => setRun({ state: "idle" })} onMore={setRunMore} /></div>}
            {run.state === "failed" && (
              <div ref={runBox} className={"runline " + (run.problem.kind === "cancelled" ? "warn" : "bad")} data-run="failed" role="alert">
                <CardIcon kind={run.problem.kind === "cancelled" ? "warn" : "bad"} />
                <div className="runtxt" title={run.problem.detail.join(" ")}><b>{run.problem.title}</b><div className="runl2">{run.problem.detail[0]}</div></div>
                {run.problem.detail.length > 1 && <button type="button" className="btn btn-ghost btn-sm" data-run-more onClick={() => setRunMore({ title: run.problem.title, lines: run.problem.detail })}>รายละเอียด</button>}
                <button type="button" className="btn btn-ghost btn-sm" onClick={() => pressStart()}><IcRefresh size={15} />ลองใหม่</button>
                <button type="button" className="btn btn-ghost btn-sm" onClick={() => setRun({ state: "idle" })} data-run-close>ปิด</button>
              </div>
            )}
          </div>
          <div className="pact-btns">
          <button type="button" className={"btn " + (working ? "btn-wait" : "btn-ghost")} style={{ height: 44 }} aria-disabled={working || undefined} title={working ? "รอให้งานที่ทำอยู่เสร็จก่อน" : undefined} onClick={clearAll}><IbTrash size={15} />ล้างทั้งหมด</button>
          <button type="button" className={"btn " + (blocked || working ? "btn-wait" : "btn-main")} style={{ height: 44, padding: "0 9px", fontSize: 14, flex: 1 }}
            aria-disabled={!!blocked || working || undefined} title={blocked ?? undefined} onClick={() => pressStart()} data-start><Keep icon={<IcPoster size={15} />} all={["กำลังทำ…", startLabel]}>{working ? "กำลังทำ…" : startLabel}</Keep></button>
          </div>
        </div>
      </div>

      {loading === "poster" && <LoadPill text="กำลังอ่านรูป…" />}
      {loading === "movie" && <LoadPill text="กำลังอ่านไฟล์หนัง…" />}
      {rendering && <LoadPill text="กำลังทำรูป…" />}
      {runMore && (
        <Dialog open onClose={() => setRunMore(null)} width={520} title={runMore.title} actions={<button type="button" className="btn btn-ghost btn-sm" onClick={() => setRunMore(null)}>ปิด</button>}>
          <div data-run-detail style={{ display: "flex", flexDirection: "column", gap: 6, fontSize: 14, overflowWrap: "anywhere" }}>{runMore.lines.map((l, i) => <div key={i}><Phr>{l}</Phr></div>)}</div>
        </Dialog>
      )}
      {cropOpen && poster && (
        <CropDialog key={poster.path} info={poster} start={choice} defaultFormat={(settings?.posterFormat ?? "jpg") as "jpg" | "png"} defaultQuality={settings?.jpgQuality ?? 90}
          onCancel={() => { setCropOpen(false); if (!choice) { setPoster(null); posterApi.clear().catch(() => {}); } }}
          onUse={(c) => { setChoice(c); setUserCrop(true); setCropOpen(false); }}
          onPickImage={loadPoster} />
      )}
      <FolderImages open={listOpen} movie={moviePath} format={(settings?.posterFormat ?? "jpg") as "jpg" | "png"} onClose={() => setListOpen(false)}
        onPick={(f) => { setListOpen(false); loadPoster(f); }} />

      {big && <ImageViewer src={big.src} thumb={big.src} originRect={big.rect} info={{ name: big.name }} onClose={() => setBig(null)} />}
      {/* แทร็กที่ใส่ใน MP4 ไม่ได้ · ทำต่อแล้วแทร็กที่ใส่ไม่ได้ถูกทิ้ง ซับ ASS เหลือตัวหนังสือล้วน · มาจากปุ่มเริ่มแล้วเริ่มงานต่อเลย (BUGS ข้อ 57) */}
      {/* ภาพใส่ MP4 ไม่ได้ ทิ้งภาพไม่ได้ เหลือปุ่มกลับไปใช้ MKV อย่างเดียว · เดิมปุ่มทิ้งแทร็กทิ้งภาพไปด้วย ได้ MP4 ที่มีแต่เสียงแต่ขึ้นตรวจผ่าน (AUDIT 12 พ.ย. 2569 ข้อ 7) */}
      <Dialog open={!!askMp4 && mp4Bad.length > 0} onClose={() => setAskMp4(null)} width={520} title={mp4VideoBad ? "ไฟล์นี้ส่งออกเป็น MP4 ไม่ได้" : "บางแทร็กใส่ใน MP4 ไม่ได้เต็มที่"}
        actions={<>
          {!mp4VideoBad && <button type="button" className="btn btn-ghost btn-sm" onClick={() => {
            const nextDrop = drop.concat(mp4Bad.filter((x) => x.mp4 === "no" && x.kind !== "video").map((x) => x.index));
            setDrop(nextDrop); setAck(ack.concat(mp4Bad.filter((x) => x.mp4 === "style").map((x) => x.index)));
            const from = askMp4; setAskMp4(null);
            if (from === "start" && choice && run.state !== "working") pressStart(nextDrop, true);
          }} data-mp4-go>{mp4Bad.some((x) => x.mp4 === "no") ? "ทิ้งแทร็กที่ใส่ไม่ได้แล้วทำต่อ" : "ทำต่อด้วย MP4"}</button>}
          <button type="button" className="btn btn-main btn-sm" onClick={() => { setDrop([]); setAck([]); setOne({ outputFormat: "mkv" }); setAskMp4(null); }} data-mp4-mkv><IbBack size={15} />กลับไปใช้ MKV</button>
        </>}>
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }} data-mp4warn>
          {mp4Bad.map((x) => (
            <div key={x.index} className="stat warn"><CardIcon kind="warn" /><div><b>{trackTitle(x)}</b><Phr>{x.mp4 === "style" ? (x.why ?? "") : x.kind === "video" ? `ภาพเป็นชนิด ${x.codec} ไฟล์ MP4 ต้องมีภาพ จึงต้องใช้ MKV แทน` : `${x.why ?? ""} ถ้าทำต่อ ${kindWord(x.kind)}นี้จะหายจากไฟล์ใหม่`}</Phr></div></div>
          ))}
        </div>
      </Dialog>

      {/* ลบไฟล์เดิม ยืนยัน 2 ขั้น (ต้นแบบบรรทัด 917–930) · กดนอกหน้าต่างไม่ปิด */}
      <Dialog open={askDelete === 1} onClose={() => setAskDelete(0)} title="ลบไฟล์เดิมหลังตรวจผ่าน (ขั้นที่ 1 จาก 2)"
        actions={<><button type="button" className="btn btn-ghost btn-sm" onClick={() => setAskDelete(0)}>ยกเลิก</button><button type="button" className="btn btn-main btn-sm" onClick={() => setAskDelete(2)}><IbNext size={15} />ถัดไป</button></>}>
        <div style={{ fontSize: 14, lineHeight: 1.6 }}><Phr>เมื่อไฟล์ใหม่ตรวจผ่าน ไฟล์เดิมจะถูกย้ายไปถังขยะของ Windows</Phr><br /><b>{movie ? baseName(movie.path) : ""}</b> ขนาด <span className="nw">{movie ? fmtSize(movie.size) : ""}</span><br /><Phr>ถ้าไฟล์ใหม่ตรวจไม่ผ่าน ไฟล์เดิมไม่ถูกลบ</Phr></div>
      </Dialog>
      <Dialog open={askDelete === 2} onClose={() => setAskDelete(1)} title="ยืนยันอีกครั้ง (ขั้นที่ 2 จาก 2)" splitActions
        actions={<><button type="button" className="btn btn-danger btn-sm" onClick={() => { setAskDelete(0); start(pendingDrop.current ?? drop); pendingDrop.current = null; }}>ยืนยันลบ</button><button type="button" className="btn btn-ghost btn-sm" onClick={() => setAskDelete(1)}><IbBack size={15} />ย้อนกลับ</button></>}>
        <div style={{ fontSize: 14, lineHeight: 1.6 }}>ลบไฟล์เดิม <b>{movie ? baseName(movie.path) : ""}</b> <Phr>หลังตรวจไฟล์ใหม่ผ่าน</Phr><br /><Phr>กู้คืนได้จากถังขยะของ Windows จนกว่าจะล้างถังขยะ</Phr></div>
      </Dialog>
      {/* ยืนยันหยุด */}
      <Dialog open={askStop} onClose={() => setAskStop(false)} title={runMode === "cover" ? "ยืนยันหยุดเปลี่ยนโปสเตอร์" : runMode === "mp4" ? "ยืนยันหยุดส่งออก MP4" : "ยืนยันหยุดครอบไฟล์"}
        actions={<><button type="button" className="btn btn-ghost btn-sm" onClick={() => setAskStop(false)}><IbNext size={15} />ทำต่อ</button><button type="button" className="btn btn-bad btn-sm" onClick={() => { setAskStop(false); posterApi.cancel(); }}><IbStop size={15} />หยุด</button></>}>
        <div style={{ fontSize: 14, lineHeight: 1.6 }}>{runMode === "cover"
          ? <><Phr>ยังไม่ได้เปลี่ยนรูปแนบ หยุดตอนนี้</Phr> <Phr>{`ไฟล์เดิม ${movie ? baseName(movie.path) : ""} ไม่ถูกแตะ`}</Phr></>
          : <><Phr>{`ไฟล์ใหม่ที่ทำไปได้ ${pct}% จะถูกลบทิ้ง`}</Phr> <Phr>{`ไฟล์เดิม ${movie ? baseName(movie.path) : ""} ไม่ถูกแตะ`}</Phr></>}</div>
      </Dialog>
    </div>
  );
}

const BUSY = "รอให้งานที่ทำอยู่เสร็จก่อน";

/** กรอบ 2 : 3 ใหญ่สุดกลางรูป หลังหมุน (เหมือน default_crop ใน poster_image.rs) · หมุน 90 270 ด้านกว้างยาวสลับกัน */
function centerCrop(p: PosterInfo, rotate: number): [number, number, number, number] {
  if (rotate % 180 === 0) return p.crop;
  const ratio = p.height / p.width, target = 2 / 3;
  if (ratio > target) { const cw = target / ratio; return [(1 - cw) / 2, 0, cw, 1]; }
  const ch = ratio / target;
  return [0, (1 - ch) / 2, 1, ch];
}
/** ปุ่มเล็กแบบโปร่ง · off = เหตุผลที่กดไม่ได้ ปุ่มเป็นแบบกดไม่ได้ ชี้แล้วบอกเหตุผล (สกิล button-feedback) */
function Btn(p: { off?: string | false; onClick: () => void; children: React.ReactNode; style?: React.CSSProperties }) {
  return (
    <button type="button" className={"btn btn-sm " + (p.off ? "btn-wait" : "btn-ghost")} style={p.style} aria-disabled={p.off ? true : undefined}
      title={p.off || undefined} onClick={() => { if (!p.off) p.onClick(); }}>{p.children}</button>
  );
}

function kindWord(k: string) { return k === "audio" ? "เสียง" : k === "video" ? "ภาพ" : "ซับ"; }
function trackTitle(s: StreamInfo) {
  if (s.kind === "video") return "ภาพ 1 อันใส่ใน MP4 ไม่ได้";
  const lang = s.lang ? `ภาษา${s.lang}` : "";
  return s.mp4 === "style" ? `ซับ${lang} 1 อันจะเสียสีกับฟอนต์ใน MP4` : `${kindWord(s.kind)}${lang} 1 อันใส่ใน MP4 ไม่ได้`;
}
function fmtEta(s: number) { return s < 60 ? `${Math.max(1, Math.round(s))} วินาที` : `${Math.round(s / 60)} นาที`; }

function DoneCard({ r, onShelf, onClose, onMore }: { r: ApplyResult; onShelf: () => void; onClose: () => void; onMore: (m: { title: string; lines: string[] }) => void }) {
  const c = r.counts;
  const title = r.mode === "cover" ? (r.verified ? "เปลี่ยนโปสเตอร์เสร็จ ไฟล์ตรวจผ่าน" : "เปลี่ยนโปสเตอร์เสร็จ")
    : r.mode === "mp4" ? (r.verified ? "ส่งออก MP4 เสร็จ ไฟล์ใหม่ตรวจผ่าน" : "ส่งออก MP4 เสร็จ")
    : r.verified ? "ครอบเสร็จ ไฟล์ใหม่ตรวจผ่าน" : "ครอบเสร็จ";
  const line2 = r.mode === "cover" ? (r.verified ? "ปกในไฟล์ตรงกับรูปที่ทำทุกไบต์ ภาพ เสียง ซับ เท่าเดิม" : "ไม่ได้ตรวจรูปแนบ") : r.verified ? "ครบเท่าต้นทาง" : "ไม่ได้ตรวจเทียบต้นทาง";
  const where = r.original === "kept" && r.originalTo ? r.originalTo.replace(/[\\/][^\\/]+$/, "") : null;
  const counts = `ภาพ ${c.video} เสียง ${c.audio} ซับ ${c.subs}`;
  const lines = [counts, line2, where ? "ไฟล์เดิมย้ายไปที่ " + where : "", r.original === "trash" ? "ไฟล์เดิมอยู่ในถังขยะของ Windows กู้คืนได้จนกว่าจะล้างถังขยะ" : "", ...r.notes].filter(Boolean);
  return (
    <>
      <CardIcon kind="done" />
      <div className="runtxt" title={lines.join(" ")}><b>{title}</b><div className="runl2">{counts} {line2}</div></div>
      {lines.length > 2 && <button type="button" className="btn btn-ghost btn-sm" data-run-more onClick={() => onMore({ title, lines })}>รายละเอียด</button>}
      <button type="button" className="btn btn-ok btn-sm" onClick={onShelf}><IcShelf size={15} />ไปดูบนชั้นวาง</button>
      <button type="button" className="btn btn-ghost btn-sm" onClick={onClose} data-run-close>ปิด</button>
    </>
  );
}

function Check(p: { on: boolean; onChange: (v: boolean) => void; title: string; note: string; disabled?: boolean }) {
  return (
    <div className={"chk" + (p.disabled ? " off" : "")} aria-checked={p.on} aria-disabled={p.disabled || undefined}
      {...kb(() => { if (!p.disabled) p.onChange(!p.on); })} role="checkbox">
      <span className={"box" + (p.on ? " on" : "")}>{p.on && <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="4" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5" /></svg>}</span>
      <span>{p.title}<br /><span className="small">{p.note}</span></span>
    </div>
  );
}

function Radio(p: { on: boolean; onChange: () => void; title: string; note: string; disabled?: boolean }) {
  return (
    <div className={"chk" + (p.disabled ? " off" : "")} aria-checked={p.on} aria-disabled={p.disabled || undefined}
      {...kb(() => { if (!p.disabled) p.onChange(); })} role="radio">
      <span className={"radio" + (p.on ? " on" : "")} />
      <span>{p.title}<br /><span className="small">{p.note}</span></span>
    </div>
  );
}

/** รูปในโฟลเดอร์ของหนัง (กด เปลี่ยนรูป) · ป้ายเขียว .jpg แนบได้เลย · ป้ายเหลือง .webp→.jpg ตามค่าในหน้าตั้งค่า */
function FolderImages(p: { open: boolean; movie: string | null; format: "jpg" | "png"; onClose: () => void; onPick: (path: string) => void }) {
  const [items, setItems] = useState<FolderImage[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [picking, setPicking] = useState(false);
  const live = useRef(0);
  useEffect(() => {
    if (!p.open || !p.movie) return;
    const n = ++live.current;
    setItems(null); setErr(null);
    posterApi.folderImages(p.movie).then((r) => { if (n === live.current) setItems(r); }).catch((e) => { if (n === live.current) setErr(String(e)); });
  }, [p.open, p.movie]);
  const list = useMemo(() => items ?? [], [items]);
  return (
    <Dialog open={p.open} onClose={p.onClose} kind="menu" width={520} title="เลือกรูปโปสเตอร์"
      actions={<>
        <button type="button" className="btn btn-ghost btn-sm" onClick={p.onClose}>ปิด</button>
        <button type="button" className={"btn btn-sm " + (picking ? "btn-wait" : "btn-main")} aria-disabled={picking || undefined} onClick={async () => { if (picking) return; setPicking(true); try { const f = await pickFile("image"); if (f) p.onPick(f); } finally { setPicking(false); } }}>{picking ? <span className="spinner" aria-hidden="true" /> : <IcPoster size={15} />}<Keep all={["กำลังเปิดหน้าต่างเลือกไฟล์…", "เลือกรูปจากเครื่อง"]}>{picking ? "กำลังเปิดหน้าต่างเลือกไฟล์…" : "เลือกรูปจากเครื่อง"}</Keep></button>
      </>}>
      <div className="small">{p.movie ? <>รูปในโฟลเดอร์เดียวกับไฟล์หนัง พร้อมบอกว่ารูปไหนต้องแปลงก่อน</> : "ยังไม่ได้ใส่ไฟล์หนัง เลือกรูปจากเครื่องแทน"}</div>
      <div data-folder-images style={{ maxHeight: 360, overflowY: "auto" }}>
        {!p.movie ? null : err ? <div className="hint e">{err}</div> : items === null ? <div className="small" style={{ display: "flex", alignItems: "center", gap: 8 }} data-folder-wait><span className="spinner" aria-hidden="true" />กำลังอ่านรูปในโฟลเดอร์…</div>
          : list.length === 0 ? <div className="small">ไม่มีรูปในโฟลเดอร์นี้</div>
          : list.map((f) => (
            <div key={f.path} className="imgrow" {...kb(() => p.onPick(f.path))} aria-label={"ใช้รูป " + f.name}>
              {f.thumb ? <img className="imgth" src={thumbUrl(f.thumb) ?? undefined} alt="" /> : <span className="imgth" />}
              <div style={{ minWidth: 0, wordBreak: "break-all" }}>{f.name}<div className="small">{f.error ? f.error : <span className="nw">{f.width} × {f.height} px</span>}</div></div>
              <div style={{ fontSize: 12.5, whiteSpace: "nowrap" }}>{f.attachable ? <><span className="extag ok">.{f.ext}</span> แนบได้เลย</> : <span className="extag extcv">.{f.ext}→.{p.format}</span>}</div>
            </div>
          ))}
      </div>
    </Dialog>
  );
}
