/* หน้า 2 ใส่โปสเตอร์ (สเปกข้อ 7 · ต้นแบบบรรทัด 725–931 · แผนขั้น 4)
   การ์ด ① ไฟล์หนัง ② รูปโปสเตอร์ ③ หน้าตาที่จะได้ · ตัวเลือก · ไฟล์ที่ได้ MKV / MP4 · ปุ่มล่าง
   ลากไฟล์จาก Explorer มาวางที่ช่อง หรือที่ไหนก็ได้ในหน้า (เลือกช่องตามชนิดไฟล์) · วางผิดชนิดช่องแดงค้างจนกว่าจะวางใหม่
   วางรูปแล้วหน้าต่างครอปขึ้นเองทุกครั้ง · MKV อยู่แล้วเปลี่ยนแค่รูปแนบ · ไฟล์อื่นครอบเป็น MKV ไม่แปลงภาพเสียงใหม่
   กำลังทำ บอกเปอร์เซ็นต์ เวลาที่เหลือ ขั้นถัดไป ปุ่มหยุด (ถามก่อน) · เลือกลบไฟล์เดิม ยืนยัน 2 ขั้นตอนกดเริ่ม */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { listen } from "@tauri-apps/api/event";
import type { Page } from "../components/Sidebar";
import Dialog from "../components/Dialog";
import CropDialog, { type CropChoice } from "../components/CropDialog";
import { CardIcon, Phr, Seg } from "../components/ui";
import { inApp, pickFile, posterApi, thumbUrl, type ApplyProblem, type ApplyResult, type FolderImage, type MovieInfo, type PosterInfo, type PosterProgress, type StreamInfo } from "../lib/api";
import { useSettings } from "../lib/settings";
import { useLibrary } from "../lib/library";
import { fmtDuration, fmtSize } from "../lib/format";
import { kb } from "../lib/popup";

const MOVIE_EXT = ["mkv", "mp4", "m4v", "mov", "avi", "webm", "ts", "m2ts", "mpg", "mpeg", "vob", "flv"];
const IMAGE_EXT = ["jpg", "jpeg", "png", "webp", "bmp", "tif", "tiff", "heic", "heif"];
const extOf = (p: string) => (p.match(/\.([^.\\/]+)$/)?.[1] ?? "").toLowerCase();
const baseName = (p: string) => p.split(/[\\/]/).pop() ?? p;

type Run =
  | { state: "idle" }
  | { state: "working"; progress: PosterProgress | null }
  | { state: "done"; result: ApplyResult }
  | { state: "failed"; problem: ApplyProblem };

export default function PosterPage(p: { initialPath: string | null; onPage: (pg: Page) => void; onConsumed: () => void }) {
  const { settings, update } = useSettings();
  const { movies } = useLibrary();
  const [moviePath, setMoviePath] = useState<string | null>(null);
  const [movie, setMovie] = useState<MovieInfo | null>(null);
  const [movieErr, setMovieErr] = useState<string | null>(null);
  const [poster, setPoster] = useState<PosterInfo | null>(null);
  const [posterErr, setPosterErr] = useState<string | null>(null);
  const [choice, setChoice] = useState<CropChoice | null>(null);
  const [cropOpen, setCropOpen] = useState(false);
  const [listOpen, setListOpen] = useState(false);
  const [over, setOver] = useState<"movie" | "poster" | null>(null);
  const [loading, setLoading] = useState<"movie" | "poster" | null>(null);
  const [run, setRun] = useState<Run>({ state: "idle" });
  const [askDelete, setAskDelete] = useState<0 | 1 | 2>(0);
  const [askStop, setAskStop] = useState(false);
  const [drop, setDrop] = useState<number[]>([]);
  /** ซับ ASS ที่กดทำต่อแล้ว (ใส่ MP4 ได้แต่สีกับฟอนต์หาย) */
  const [ack, setAck] = useState<number[]>([]);
  const output = (settings?.outputFormat ?? "mkv") as "mkv" | "mp4";
  const original = (settings?.originalAfter ?? "keep") as "keep" | "trash";

  // ---------- ไฟล์หนัง ----------
  const loadMovie = useCallback(async (path: string) => {
    setMovieErr(null);
    setRun({ state: "idle" });
    setDrop([]);
    setAck([]);
    const ext = extOf(path);
    if (!MOVIE_EXT.includes(ext)) { setMovieErr(`ไฟล์ .${ext || "?"} ใช้ไม่ได้`); return; }
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
      setPosterErr(String(e));
    } finally {
      setLoading(null);
    }
  }, []);

  // มาจากปุ่มเปลี่ยนโปสเตอร์บนชั้นวาง · ไฟล์หนังใส่ให้แล้ว
  useEffect(() => {
    if (p.initialPath) { loadMovie(p.initialPath); p.onConsumed(); }
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
  useEffect(() => {
    if (!inApp) return;
    let off: (() => void) | undefined;
    let live = true;
    import("@tauri-apps/api/webview").then(({ getCurrentWebview }) => getCurrentWebview().onDragDropEvent((e) => {
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
  useEffect(() => {
    if (!inApp) return;
    const off = listen<PosterProgress>("poster-progress", (e) => setRun((r) => (r.state === "working" ? { state: "working", progress: e.payload } : r)));
    return () => { off.then((f) => f()); };
  }, []);

  // ---------- เงื่อนไขปุ่มเริ่ม ----------
  const isMkv = movie?.ext === "mkv";
  const mode = output === "mp4" ? "mp4" : isMkv ? "cover" : "wrap";
  const mp4Bad: StreamInfo[] = output === "mp4" && movie ? movie.streams.filter((s) => (s.mp4 === "no" && !drop.includes(s.index)) || (s.mp4 === "style" && !ack.includes(s.index) && !drop.includes(s.index))) : [];
  const mp4VideoBad = mp4Bad.some((s) => s.kind === "video" && s.mp4 === "no");
  const inLib = movies.find((m) => moviePath && m.path.toLowerCase() === moviePath.toLowerCase());
  const startLabel = output === "mp4" ? "ส่งออกเป็น MP4 พร้อมโปสเตอร์" : isMkv ? (inLib?.hasCover ? "เปลี่ยนโปสเตอร์" : "ใส่โปสเตอร์ลงไฟล์นี้") : "ครอบเป็น MKV พร้อมโปสเตอร์";
  const blocked = !movie ? "ยังกดไม่ได้ ใส่ไฟล์หนังก่อน"
    : !choice ? "ยังกดไม่ได้ ใส่รูปโปสเตอร์ก่อน"
    : mp4VideoBad ? "ไฟล์นี้ส่งออกเป็น MP4 ไม่ได้ ใช้ MKV แทน"
    : mp4Bad.length ? "เลือกก่อนว่าจะทิ้งแทร็กที่ใส่ใน MP4 ไม่ได้ หรือกลับไปใช้ MKV"
    : null;

  const start = async (dropNow: number[] = drop) => {
    if (!movie || !moviePath || !choice) return;
    setRun({ state: "working", progress: null });
    try {
      const result = await posterApi.apply({
        path: moviePath, output, checkSource: settings?.checkSourceBefore ?? true, checkOutput: settings?.checkOutputAfter ?? true,
        original: mode === "cover" ? "keep" : original, drop: dropNow,
      });
      setRun({ state: "done", result });
      if (result.mode !== "cover") { setMovie(null); setMoviePath(null); }
      else posterApi.inspect(moviePath).then(setMovie).catch(() => {});
    } catch (e) {
      const problem = e && typeof e === "object" && "title" in e ? (e as ApplyProblem) : { kind: "other", title: "ใส่โปสเตอร์ไม่สำเร็จ", detail: [String(e)] };
      setRun({ state: "failed", problem });
    }
  };
  const pressStart = () => {
    if (blocked || run.state === "working") return;
    if (mode !== "cover" && original === "trash") { setAskDelete(1); return; }
    start();
  };
  const clearAll = () => {
    if (run.state === "working") return;
    setMovie(null); setMoviePath(null); setMovieErr(null); setPoster(null); setPosterErr(null); setChoice(null); setDrop([]); setRun({ state: "idle" });
    posterApi.clear().catch(() => {});
  };

  const working = run.state === "working";
  // กำลังทำ เสร็จ ไม่สำเร็จ ต้องเห็นได้โดยไม่ต้องเลื่อนหา (สกิล save-status) · การ์ดอยู่ล่างหน้า เลื่อนมาให้เห็นเอง
  const runBox = useRef<HTMLDivElement>(null);
  useEffect(() => { runBox.current?.scrollIntoView({ block: "nearest", behavior: "smooth" }); }, [run.state]);
  const pct = working && run.progress ? Math.round(run.progress.percent) : 0;
  const newName = movie ? `${movie.name}.${output === "mp4" ? "mp4" : "mkv"}` : "";

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
                  {inLib?.thumb ? <img className="vthumb" src={thumbUrl(inLib.thumb) ?? undefined} alt="" style={{ width: 42, height: 63 }} /> : <div className="vthumb" />}
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontWeight: 600, fontSize: 14, lineHeight: 1.5, wordBreak: "break-word" }}><Phr>{baseName(movie.path)}</Phr></div>
                    <div className="small"><span className="nw">{fmtSize(movie.size)}</span>{movie.duration ? <> · <span className="nw">{fmtDuration(movie.duration)}</span></> : null}<br />{movie.width} × {movie.height}</div>
                  </div>
                </div>
                <div className="small" style={{ marginTop: 10 }}>ลากไฟล์อื่นมาวางทับเพื่อเปลี่ยน หรือ</div>
                <Btn off={working && BUSY} style={{ marginTop: 6 }} onClick={async () => { const f = await pickFile("movie"); if (f) loadMovie(f); }}>เลือกไฟล์จากเครื่อง</Btn>
              </>
            ) : (
              <>
                <div className={"drop" + (over === "movie" ? " over" : movieErr ? " bad" : "")} data-drop="movie">
                  {over === "movie" ? <b>ปล่อยเมาส์เพื่อใส่ไฟล์นี้</b>
                    : movieErr ? <><b>{movieErr}</b><div><Phr>ไฟล์หนังรองรับ MKV MP4 M4V MOV AVI WebM TS M2TS MPG MPEG VOB FLV</Phr></div></>
                    : loading === "movie" ? "กำลังอ่านไฟล์หนัง…" : <>ลากไฟล์หนังมาวางตรงนี้<br />MKV MP4 และอีก 10 ชนิด</>}
                </div>
                <Btn off={working && BUSY} style={{ marginTop: 10 }} onClick={async () => { const f = await pickFile("movie"); if (f) loadMovie(f); }}>เลือกไฟล์จากเครื่อง</Btn>
              </>
            )}
            <div className="small" style={{ marginTop: 10 }}>รองรับ MKV · MP4 · M4V · MOV<br />AVI · WebM · TS · M2TS · MPG · MPEG · VOB · FLV</div>
          </div>

          {/* ② รูปโปสเตอร์ */}
          <div className="card" data-card="poster">
            <h3><span className="step">2</span>รูปโปสเตอร์</h3>
            {poster && choice && !posterErr && over !== "poster" ? (
              <div className="pprev" data-drop="poster">
                <img className="pp" src={thumbUrl(choice.render.preview) ?? undefined} alt="รูปโปสเตอร์ที่จะแนบ" />
                <div className="small" style={{ minWidth: 0 }}>
                  <span style={{ wordBreak: "break-all" }}>{poster.name}</span><br />
                  {poster.attachable ? <><span className="extag ok">.{poster.ext}</span> แนบได้เลย</> : <><span className="extag cv">.{poster.ext}→.{choice.format}</span> แปลงให้ก่อนแนบ</>}<br />
                  <span className="nw">{choice.render.width} × {choice.render.height} px</span> · <span className="nw">{fmtSize(choice.render.bytes)}</span><br />
                  {poster.twoThree ? "สัดส่วน 2 : 3 พอดีปก" : choice.geo.mode === "pad" ? "เติมขอบให้เต็มปก" : "ครอปให้พอดีปกแล้ว"}
                  <span style={{ display: "flex", gap: 6, marginTop: 10, flexWrap: "wrap" }}>
                    <Btn off={working && BUSY} onClick={() => setListOpen(true)}>เปลี่ยนรูป</Btn>
                    <Btn off={working && BUSY} onClick={() => setCropOpen(true)}>ครอปภาพ</Btn>
                  </span>
                </div>
              </div>
            ) : (
              <>
                <div className={"drop" + (over === "poster" ? " over" : posterErr ? " bad" : "")} data-drop="poster">
                  {over === "poster" ? <b>ปล่อยเมาส์เพื่อใส่รูปนี้</b>
                    : posterErr ? <><b>{posterErr.split(" · ")[0]}</b><div><Phr>รูปที่รับ JPG PNG WebP BMP TIFF HEIC</Phr></div></>
                    : loading === "poster" ? "กำลังอ่านรูป…" : <>ลากรูปโปสเตอร์มาวางตรงนี้<br />JPG หรือ PNG</>}
                </div>
                <span style={{ display: "flex", gap: 6, marginTop: 10, flexWrap: "wrap" }}>
                  <Btn off={working && BUSY} onClick={async () => { const f = await pickFile("image"); if (f) loadPoster(f); }}>เลือกรูปจากเครื่อง</Btn>
                  {moviePath && <Btn off={working && BUSY} onClick={() => setListOpen(true)}>รูปในโฟลเดอร์หนัง</Btn>}
                </span>
              </>
            )}
            {poster && !poster.twoThree && choice && (
              <div className="stat warn" style={{ marginTop: 12 }} data-not23><CardIcon kind="warn" /><div><b>รูปนี้เป็น{poster.aspect}</b><div>{choice.geo.mode === "pad" ? "เลือกเติมขอบให้เต็มปกไว้" : "เลือกตัดให้พอดีปกไว้"}</div><div><Phr>กดครอปภาพเพื่อเปลี่ยน</Phr></div></div></div>
            )}
            <div className="small" style={{ marginTop: 10 }}>รองรับ JPG · PNG แนบได้เลย<br />WebP BMP TIFF HEIC แปลงให้ก่อนแนบ</div>
          </div>

          {/* ③ หน้าตาที่จะได้ */}
          <div className="card" data-card="result">
            <h3><span className="step">3</span>หน้าตาที่จะได้</h3>
            <div className="small" style={{ marginBottom: 8 }}>บนชั้นวางของโปรแกรมนี้</div>
            <div style={{ display: "flex", gap: 14, alignItems: "flex-end" }}>
              {mode === "cover" && inLib?.thumb && choice && (
                <div style={{ textAlign: "center" }}><img className="mc" src={thumbUrl(inLib.thumb) ?? undefined} alt="ปกเดิม" /><div className="small" style={{ marginTop: 6 }}>ปกเดิม</div></div>
              )}
              <div style={{ textAlign: "center" }}>
                {choice ? <img className="mc" src={thumbUrl(choice.render.preview) ?? undefined} alt="ปกใหม่" /> : <div className="mc none" />}
                {mode === "cover" && inLib?.thumb && choice && <div className="small" style={{ marginTop: 6 }}>ปกใหม่</div>}
              </div>
              <div className="small" style={{ minWidth: 0 }}>
                {movie ? (mode === "cover" ? <>ไฟล์เดิม<br /><b style={{ color: "var(--txt)", wordBreak: "break-word" }}><Phr>{newName}</Phr></b><br /><Phr>เปลี่ยนแค่รูปแนบ ไม่ต้องครอบใหม่</Phr></>
                  : <>ไฟล์ใหม่<br /><b style={{ color: "var(--txt)", wordBreak: "break-word" }}><Phr>{newName}</Phr></b><br />ขนาดราว <span className="nw">{fmtSize(movie.size + (choice?.render.bytes ?? 0))}</span> เท่าเดิม</>)
                  : "ใส่ไฟล์หนังกับรูปโปสเตอร์ก่อน"}
              </div>
            </div>
          </div>
        </div>

        {/* ตัวเลือก */}
        <div className="card">
          <h3>ตัวเลือก</h3>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20 }}>
            <div className="opts">
              <Check on={settings?.checkSourceBefore ?? true} onChange={(v) => update({ checkSourceBefore: v })} title={mode === "cover" ? "ตรวจไฟล์ก่อนเปลี่ยนรูปแนบ" : "ตรวจไฟล์ต้นทางก่อนครอบ"} note="ถ้าไฟล์เสียอยู่แล้ว จะบอกก่อนลงมือ" disabled={working} />
              <Check on={settings?.checkOutputAfter ?? true} onChange={(v) => update({ checkOutputAfter: v })} title={mode === "cover" ? "ตรวจรูปแนบหลังเปลี่ยนเสร็จ" : "ตรวจไฟล์ใหม่หลังครอบเสร็จ"} note={mode === "cover" ? "ดึงปกออกมาเทียบกับรูปที่ทำทุกไบต์" : "เทียบว่าภาพ เสียง ซับ ครบเท่าต้นทาง"} disabled={working} />
            </div>
            <div className="opts" title={mode === "cover" ? "ไฟล์เป็น MKV อยู่แล้ว เปลี่ยนแค่รูปแนบ ไม่มีไฟล์เดิมแยก" : undefined}>
              <Radio on={original === "keep"} onChange={() => update({ originalAfter: "keep" })} disabled={working || mode === "cover"}
                title={`เก็บไฟล์เดิมไว้ ย้ายไปโฟลเดอร์ "ไฟล์เดิม"`} note={movie ? `ปลอดภัยที่สุด แต่ใช้พื้นที่เพิ่ม ${fmtSize(movie.size)}` : "ปลอดภัยที่สุด แต่ใช้พื้นที่เพิ่มเท่าไฟล์หนัง"} />
              <Radio on={original === "trash"} onChange={() => update({ originalAfter: "trash" })} disabled={working || mode === "cover"}
                title="ลบไฟล์เดิมหลังตรวจไฟล์ใหม่ผ่านแล้ว" note="ไม่ลบถ้าไฟล์ใหม่ตรวจไม่ผ่าน" />
              {mode === "cover" && <div className="small">ไฟล์เป็น MKV อยู่แล้ว เปลี่ยนแค่รูปแนบ ไม่มีไฟล์เดิมแยก</div>}
            </div>
          </div>
        </div>

        {/* ไฟล์ที่ได้ */}
        <div className="card">
          <h3>ไฟล์ที่ได้</h3>
          <div style={{ display: "flex", alignItems: "center", gap: 16, flexWrap: "wrap" }}>
            <Seg label="ไฟล์ที่ได้" value={output} onChange={(v) => { setDrop([]); setAck([]); update({ outputFormat: v }); }}
              disabledReason={working ? "รอให้งานที่ทำอยู่เสร็จก่อน" : undefined}
              options={[{ value: "mkv", label: "MKV (แนะนำ)" }, { value: "mp4", label: "MP4" }]} />
            <div className="small" style={{ flex: 1, minWidth: 300 }}>MKV ใส่ซับและเสียงได้ทุกแบบ · MP4 ปกขึ้นเป็นไอคอนใน Windows ได้เลยโดยไม่ต้องลง Icaros แต่ซับบางแบบใส่ไม่ได้</div>
          </div>
          {mp4Bad.length > 0 && (
            <div style={{ marginTop: 12, display: "flex", flexDirection: "column", gap: 10 }} data-mp4warn>
              {mp4Bad.map((s) => (
                <div key={s.index}>
                  <div className="stat warn"><CardIcon kind="warn" /><div><b>{trackTitle(s)}</b><Phr>{s.mp4 === "style" ? (s.why ?? "") : `${s.why ?? ""} ถ้าทำต่อ ${kindWord(s.kind)}นี้จะหายจากไฟล์ใหม่`}</Phr></div></div>
                  <div className="minirow" style={{ marginTop: 6 }}>
                    <button type="button" className="btn btn-main btn-sm" onClick={() => { setDrop([]); setAck([]); update({ outputFormat: "mkv" }); }}>กลับไปใช้ MKV</button>
                    {s.kind !== "video" && (
                      <button type="button" className="btn btn-ghost btn-sm" onClick={() => {
                        // ทำต่อ = ข้อนี้ตกลงแล้ว · ถ้าเป็นข้อสุดท้ายและใส่รูปแล้ว เริ่มงานเลย
                        const nextDrop = s.mp4 === "no" ? drop.concat([s.index]) : drop;
                        if (s.mp4 === "no") setDrop(nextDrop); else setAck(ack.concat([s.index]));
                        if (mp4Bad.length === 1 && choice && run.state !== "working") start(nextDrop);
                      }}>{s.mp4 === "style" ? "ทำต่อ" : `ทิ้ง${kindWord(s.kind)}นี้แล้วทำต่อ`}</button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* สถานะงาน */}
        {run.state !== "idle" && (
          <div ref={runBox} className="card workbox" data-run={run.state}>
            {run.state === "working" && (
              <>
                <div style={{ fontSize: 14 }}>{run.progress?.phase ?? "กำลังเริ่ม…"}</div>
                <div className="bar" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}><i style={{ width: `${pct}%` }} /></div>
                <div className="small">{pct}%{run.progress?.eta != null && run.progress.eta > 0 ? <> · เหลือราว <span className="nw">{fmtEta(run.progress.eta)}</span></> : null}
                  {run.progress?.next ? <><br />ขั้นถัดไป {run.progress.next}</> : null}</div>
                <button type="button" className="btn btn-bad btn-sm" style={{ alignSelf: "flex-start" }} onClick={() => setAskStop(true)}>หยุด</button>
              </>
            )}
            {run.state === "done" && <DoneCard r={run.result} onShelf={() => p.onPage("shelf")} />}
            {run.state === "failed" && (
              <>
                <div className={"stat " + (run.problem.kind === "cancelled" ? "warn" : "bad")} role="alert"><CardIcon kind={run.problem.kind === "cancelled" ? "warn" : "bad"} />
                  <div><b>{run.problem.title}</b>{run.problem.detail.map((d, i) => <div key={i}><Phr>{d}</Phr></div>)}</div></div>
                <button type="button" className="btn btn-ghost btn-sm" style={{ alignSelf: "flex-start" }} onClick={() => start()}>ลองใหม่</button>
              </>
            )}
          </div>
        )}

        <div style={{ display: "flex", justifyContent: "flex-end", alignItems: "center", gap: 10 }}>
          {blocked && !working && <div className="hint" style={{ color: "#94680f", margin: 0 }} data-blocked>{blocked}</div>}
          <button type="button" className={"btn " + (working ? "btn-wait" : "btn-ghost")} style={{ height: 44 }} aria-disabled={working || undefined} title={working ? "รอให้งานที่ทำอยู่เสร็จก่อน" : undefined} onClick={clearAll}>ล้างทั้งหมด</button>
          <button type="button" className={"btn " + (blocked || working ? "btn-wait" : "btn-main")} style={{ height: 44, padding: "0 26px", fontSize: 15 }}
            aria-disabled={!!blocked || working || undefined} title={blocked ?? undefined} onClick={pressStart} data-start>{working ? "กำลังทำ…" : startLabel}</button>
        </div>
      </div>

      {cropOpen && poster && (
        <CropDialog info={poster} start={choice} defaultFormat={(settings?.posterFormat ?? "jpg") as "jpg" | "png"} defaultQuality={settings?.jpgQuality ?? 90}
          onCancel={() => { setCropOpen(false); if (!choice) { setPoster(null); posterApi.clear().catch(() => {}); } }}
          onUse={(c) => { setChoice(c); setCropOpen(false); }}
          onChangeImage={() => { setCropOpen(false); setListOpen(true); }} />
      )}
      <FolderImages open={listOpen} movie={moviePath} format={(settings?.posterFormat ?? "jpg") as "jpg" | "png"} onClose={() => setListOpen(false)}
        onPick={(f) => { setListOpen(false); loadPoster(f); }} />

      {/* ลบไฟล์เดิม ยืนยัน 2 ขั้น (ต้นแบบบรรทัด 917–930) · กดนอกหน้าต่างไม่ปิด */}
      <Dialog open={askDelete === 1} onClose={() => setAskDelete(0)} title="ลบไฟล์เดิมหลังตรวจผ่าน · ขั้นที่ 1 จาก 2"
        actions={<><button type="button" className="btn btn-ghost btn-sm" onClick={() => setAskDelete(0)}>ยกเลิก</button><button type="button" className="btn btn-main btn-sm" onClick={() => setAskDelete(2)}>ถัดไป</button></>}>
        <div style={{ fontSize: 14, lineHeight: 1.6 }}><Phr>เมื่อไฟล์ใหม่ตรวจผ่าน ไฟล์เดิมจะถูกย้ายไปถังขยะของ Windows</Phr><br /><b>{movie ? baseName(movie.path) : ""}</b> · <span className="nw">{movie ? fmtSize(movie.size) : ""}</span><br /><Phr>ถ้าไฟล์ใหม่ตรวจไม่ผ่าน ไฟล์เดิมไม่ถูกลบ</Phr></div>
      </Dialog>
      <Dialog open={askDelete === 2} onClose={() => setAskDelete(1)} title="ยืนยันอีกครั้ง · ขั้นที่ 2 จาก 2" splitActions
        actions={<><button type="button" className="btn btn-danger btn-sm" onClick={() => { setAskDelete(0); start(); }}>ยืนยันลบ</button><button type="button" className="btn btn-ghost btn-sm" onClick={() => setAskDelete(1)}>ย้อนกลับ</button></>}>
        <div style={{ fontSize: 14, lineHeight: 1.6 }}>ลบไฟล์เดิม <b>{movie ? baseName(movie.path) : ""}</b> <Phr>หลังตรวจไฟล์ใหม่ผ่าน</Phr><br /><Phr>กู้คืนได้จากถังขยะของ Windows จนกว่าจะล้างถังขยะ</Phr></div>
      </Dialog>
      {/* ยืนยันหยุด */}
      <Dialog open={askStop} onClose={() => setAskStop(false)} title={mode === "cover" ? "ยืนยันหยุดเปลี่ยนโปสเตอร์" : mode === "mp4" ? "ยืนยันหยุดส่งออก MP4" : "ยืนยันหยุดครอบไฟล์"}
        actions={<><button type="button" className="btn btn-ghost btn-sm" onClick={() => setAskStop(false)}>ทำต่อ</button><button type="button" className="btn btn-bad btn-sm" onClick={() => { setAskStop(false); posterApi.cancel(); }}>หยุด</button></>}>
        <div style={{ fontSize: 14, lineHeight: 1.6 }}><Phr>{`ไฟล์ใหม่ที่ทำไปได้ ${pct}% จะถูกลบทิ้ง`}</Phr> <Phr>{`ไฟล์เดิม ${movie ? baseName(movie.path) : ""} ไม่ถูกแตะ`}</Phr></div>
      </Dialog>
    </div>
  );
}

const BUSY = "รอให้งานที่ทำอยู่เสร็จก่อน";
/** ปุ่มเล็กแบบโปร่ง · off = เหตุผลที่กดไม่ได้ ปุ่มเป็นแบบกดไม่ได้ ชี้แล้วบอกเหตุผล (สกิล button-feedback) */
function Btn(p: { off?: string | false; onClick: () => void; children: React.ReactNode; style?: React.CSSProperties }) {
  return (
    <button type="button" className={"btn btn-sm " + (p.off ? "btn-wait" : "btn-ghost")} style={p.style} aria-disabled={p.off ? true : undefined}
      title={p.off || undefined} onClick={() => { if (!p.off) p.onClick(); }}>{p.children}</button>
  );
}

function kindWord(k: string) { return k === "audio" ? "เสียง" : k === "video" ? "ภาพ" : "ซับ"; }
function trackTitle(s: StreamInfo) {
  if (s.kind === "video") return "ส่งออกเป็น MP4 ไม่ได้";
  const lang = s.lang ? `ภาษา${s.lang}` : "";
  return s.mp4 === "style" ? `ซับ${lang} 1 อันจะเสียสีกับฟอนต์ใน MP4` : `${kindWord(s.kind)}${lang} 1 อันใส่ใน MP4 ไม่ได้`;
}
function fmtEta(s: number) { return s < 60 ? `${Math.max(1, Math.round(s))} วินาที` : `${Math.round(s / 60)} นาที`; }

function DoneCard({ r, onShelf }: { r: ApplyResult; onShelf: () => void }) {
  const c = r.counts;
  const title = r.mode === "cover" ? (r.verified ? "เปลี่ยนโปสเตอร์เสร็จ ไฟล์ตรวจผ่าน" : "เปลี่ยนโปสเตอร์เสร็จ")
    : r.mode === "mp4" ? (r.verified ? "ส่งออก MP4 เสร็จ ไฟล์ใหม่ตรวจผ่าน" : "ส่งออก MP4 เสร็จ")
    : r.verified ? "ครอบเสร็จ ไฟล์ใหม่ตรวจผ่าน" : "ครอบเสร็จ";
  const line2 = r.mode === "cover" ? (r.verified ? "ปกในไฟล์ตรงกับรูปที่ทำทุกไบต์ ภาพ เสียง ซับ เท่าเดิม" : "ไม่ได้ตรวจรูปแนบ") : r.verified ? "ครบเท่าต้นทาง" : "ไม่ได้ตรวจเทียบต้นทาง";
  const where = r.original === "kept" && r.originalTo ? r.originalTo.replace(/[\\/][^\\/]+$/, "") : null;
  return (
    <>
      <div className="stat ok" role="status"><CardIcon kind="done" /><div><b>{title}</b>ภาพ {c.video} · เสียง {c.audio} · ซับ {c.subs}<br /><Phr>{line2}</Phr></div></div>
      {where && <div className="small">ไฟล์เดิมย้ายไปที่ {where}</div>}
      {r.original === "trash" && <div className="small">ไฟล์เดิมอยู่ในถังขยะของ Windows กู้คืนได้จนกว่าจะล้างถังขยะ</div>}
      {r.notes.map((n, i) => <div key={i} className="small"><Phr>{n}</Phr></div>)}
      <button type="button" className="btn btn-ok btn-sm" style={{ alignSelf: "flex-start" }} onClick={onShelf}>ไปดูบนชั้นวาง</button>
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
        <button type="button" className="btn btn-main btn-sm" onClick={async () => { const f = await pickFile("image"); if (f) p.onPick(f); }}>เลือกรูปจากเครื่อง</button>
      </>}>
      <div className="small">{p.movie ? <>รูปในโฟลเดอร์เดียวกับไฟล์หนัง · บอกว่ารูปไหนต้องแปลงก่อน</> : "ยังไม่ได้ใส่ไฟล์หนัง เลือกรูปจากเครื่องแทน"}</div>
      <div data-folder-images style={{ maxHeight: 360, overflowY: "auto" }}>
        {!p.movie ? null : err ? <div className="hint e">{err}</div> : items === null ? <div className="small">กำลังอ่านรูปในโฟลเดอร์…</div>
          : list.length === 0 ? <div className="small">ไม่มีรูปในโฟลเดอร์นี้</div>
          : list.map((f) => (
            <div key={f.path} className="imgrow" {...kb(() => p.onPick(f.path))} aria-label={"ใช้รูป " + f.name}>
              {f.thumb ? <img className="imgth" src={thumbUrl(f.thumb) ?? undefined} alt="" /> : <span className="imgth" />}
              <div style={{ minWidth: 0, wordBreak: "break-all" }}>{f.name}<div className="small">{f.error ? f.error : <span className="nw">{f.width} × {f.height} px</span>}</div></div>
              <div style={{ fontSize: 12.5, whiteSpace: "nowrap" }}>{f.attachable ? <><span className="extag ok">.{f.ext}</span> แนบได้เลย</> : <span className="extag cv">.{f.ext}→.{p.format}</span>}</div>
            </div>
          ))}
      </div>
    </Dialog>
  );
}
