/* วิธีใส่ปก ภาพจากหนัง ชื่อไฟล์ใหม่ ที่ว่าง เริ่มงาน ครอปใหม่ ล้างทั้งหมด
   แยกจาก PosterPage.tsx ตอนจัดโครงไฟล์ตามความหมาย (BUGS ข้อ 155 ขั้น 8) เนื้อโค้ดยกมาทั้งก้อน */
import { useEffect, useRef, useState } from "react";
import { frameApi, posterApi, type Geometry, type ApplyProblem, type RenameProblem, type StreamInfo } from "../../lib/api/index";
import { setPosterJob } from "../../lib/posterJob";
import { spaceShort, useFree } from "../../lib/drives";
import { centerCrop } from "./parts";
import type { Po1 } from "./posterCtx";

export function usePosterRun(c: Po1) {
  const { ack, checkOutput, checkSource, choice, drop, job, movie, moviePath, movies, original, output, poster, run, setAskDelete, setAskMp4, setChoice, setDrop, setMovie, setMovieErr, setMoviePath, setOnce, setPoster, setPosterErr, setRun, setTyped, setUserCrop, toast, typed } = c;
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
  // ที่ว่างในโฟลเดอร์ของหนัง · สูตรเดียวกับ poster.rs เปลี่ยนรูปแนบ MKV ใช้สองเท่าของรูปบวก 16 MB ครอบใหม่ใช้ขนาดหนังบวกรูปบวก 64 MB ไม่พอเตือนข้างปุ่มก่อนกด (BUGS ข้อ 94)
  const posterFree = useFree(moviePath);
  const pBytes = choice?.render.bytes ?? 0;
  const posterShort = movie && choice ? spaceShort(posterFree, mode === "cover" ? pBytes * 2 + 16 * 1024 * 1024 : movie.size + pBytes + 64 * 1024 * 1024) : null;
  const startLabel = output === "mp4" ? "ส่งออกเป็น MP4 พร้อมโปสเตอร์" : isMkv ? (inLib?.hasCover ? "เปลี่ยนโปสเตอร์" : "ใส่โปสเตอร์ลงไฟล์นี้") : "ครอบเป็น MKV พร้อมโปสเตอร์";
  const blocked = !movie ? "ยังกดไม่ได้ ใส่ไฟล์หนังก่อน"
    : !choice ? "ยังกดไม่ได้ ใส่รูปโปสเตอร์ก่อน"
    : mp4VideoBad ? "ไฟล์นี้ส่งออกเป็น MP4 ไม่ได้ ใช้ MKV แทน"
    : nameProblem ? nameProblem.title
    : posterShort;

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
      // เปลี่ยนแบบปกบนการ์ดใช้กรอบปกตั้งเสมอ ไม่พาค่าปกนอนไปด้วย (AUDIT ข้อ 8)
      geo = { ...geo, mode: patch.mode, aspect: "" };
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
  return { isMkv, mode, mp4Bad, mp4VideoBad, inLib, frameUrl, setFrameUrl, hasCover, framePath, frameDur, newStem, nameProblem, setNameProblem, nameSeq, posterFree, pBytes, posterShort, startLabel, blocked, start, pendingDrop, pressStart, rendering, setRendering, rechoose, clearAll, working, runMode, runBox, pct, newAr, newExt, newName };
}
