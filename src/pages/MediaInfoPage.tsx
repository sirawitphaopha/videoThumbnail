/* หน้า MediaInfo ในเมนูซ้าย (BUGS ข้อ 54 · พี่กันแทรก 12 พ.ย. 2569 "เราขออีกอันในชุดนี้ คือ สร้างเเถบเมนู media infor อันนี้")
   เดิมหน้า MediaInfo เปิดได้ทางเดียวจากปุ่มในแผงขวาของชั้นวาง ไฟล์ที่ไม่อยู่ในชั้นวางเปิดดูไม่ได้
   ลากหรือเลือกไฟล์หนังหรือไฟล์เสียงไหนก็ได้ แล้วใช้หน้า MediaInfo เดิมทั้งหน้า (FileInfoPage) อ่านอย่างเดียว ไฟล์ไม่ถูกแตะ
   หน้านี้ค้างไว้ตอนไปเมนูอื่น ไฟล์ที่เปิดอยู่จึงไม่หาย (BUGS ข้อ 9) · แผนระบบ MediaInfo เต็มอยู่โรดแมป ทำหลังปิดชุด 9
   ข้อ 54 (ต่อ) · เปิดเพลงแล้วขึ้นปกที่ฝังในไฟล์ (พี่กัน "เอ่เพลงเข้า ก็ต้องเเดงปกด้วย") · หน้าว่างมีไฟล์ที่ดูล่าสุด (พี่กัน "ไฟล์ที่ดูล่าสุดเเสดงด้วยสิ") */
import { useEffect, useRef, useState } from "react";
import { AUDIO_EXT, convertApi, graphApi, inApp, pickFile, thumbUrl, type Movie } from "../lib/api";
import { useLibrary } from "../lib/library";
import { usePageActiveRef } from "../lib/pageActive";
import { Phr, dropClick } from "../components/ui";
import { IcFile, IcShelf } from "../components/icons";
import FileInfoPage from "./FileInfoPage";

const MOVIE_EXT = ["mkv", "mp4", "m4v", "mov", "avi", "webm", "ts", "m2ts", "mpg", "mpeg", "vob", "flv"];
const OK_EXT = [...MOVIE_EXT, ...AUDIO_EXT];
const extOf = (p: string) => (p.match(/\.([^.\\/]+)$/)?.[1] ?? "").toLowerCase();
const nameOf = (p: string) => p.split(/[\\/]/).pop() ?? p;
const RECENT_KEY = "mi-recent";
const RECENT_MAX = 8;
const readRecent = (): string[] => { try { const v = JSON.parse(localStorage.getItem(RECENT_KEY) ?? "[]"); return Array.isArray(v) ? v.filter((x) => typeof x === "string") : []; } catch { return []; } };
const saveRecent = (l: string[]) => { try { localStorage.setItem(RECENT_KEY, JSON.stringify(l)); } catch { /* เก็บไม่ได้ก็ใช้ในหน้าไป */ } };

/** ไฟล์ที่ไม่อยู่ในชั้นวาง · หน้า MediaInfo ใช้แค่ที่อยู่ ชื่อ นามสกุล ปก */
function bare(path: string): Movie {
  const file = nameOf(path);
  const ext = extOf(file);
  return {
    id: path, path, root: path.replace(/[\\/][^\\/]+$/, ""), name: ext ? file.slice(0, -(ext.length + 1)) : file, ext,
    size: 0, mtime: 0, added: 0, year: null, duration: null, video: null, videoShort: null, audio: [], subs: [],
    images: 0, hasCover: false, coverName: null, coverSha256: null, thumb: null,
    status: "unchecked", check: null, sha256: null, missing: false, error: null,
  };
}

const film = <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="4" y="3" width="16" height="18" rx="2" /><path d="M8 3v18M16 3v18M4 8h4M4 12h4M4 16h4M16 8h4M16 12h4M16 16h4" /></svg>;
const music = <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path d="M9 18V5l11-2v13" /><circle cx="6" cy="18" r="3" /><circle cx="17" cy="16" r="3" /></svg>;

export default function MediaInfoPage({ onAv, onShelf }: { onAv: (path: string) => void; onShelf: () => void }) {
  const { movies } = useLibrary();
  const [path, setPath] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [over, setOver] = useState(false);
  const [recent, setRecent] = useState<string[]>(readRecent);
  /** ปกที่ฝังในไฟล์ (เพลง MP4 M4A) ใช้เมื่อไม่มีปกจากคลัง · อ่านอย่างเดียวผ่านคำสั่งเดียวกับหน้ากราฟเสียง (convert_cover) */
  const [cover, setCover] = useState<{ path: string; url: string | null } | null>(null);
  const pageOn = usePageActiveRef();
  const libOf = (p: string) => movies.find((x) => x.path.toLowerCase() === p.toLowerCase()) ?? null;

  const open = (p: string) => {
    const ext = extOf(p);
    if (!OK_EXT.includes(ext)) { setErr(`ไฟล์ .${ext || "?"} ไม่ใช่ไฟล์หนังหรือไฟล์เสียง`); return; }
    setErr(null);
    setPath(p);
    setRecent((l) => { const n = [p, ...l.filter((x) => x.toLowerCase() !== p.toLowerCase())].slice(0, RECENT_MAX); saveRecent(n); return n; });
  };
  const forget = (p: string) => setRecent((l) => { const n = l.filter((x) => x !== p); saveRecent(n); return n; });
  const pick = async () => { const p = await pickFile("media"); if (p) open(p); };
  const openRef = useRef(open); openRef.current = open;

  // ลากไฟล์จาก Explorer มาวาง · หน้านี้ซ่อนอยู่ไม่รับ (BUGS ข้อ 9) · เปิดไฟล์อยู่แล้วลากไฟล์ใหม่มาก็เปลี่ยนเป็นไฟล์นั้น
  useEffect(() => {
    if (!inApp) return;
    let off: (() => void) | undefined, live = true;
    import("@tauri-apps/api/webview").then(({ getCurrentWebview }) => getCurrentWebview().onDragDropEvent((e) => {
      if (!pageOn.current) return;
      if (e.payload.type === "over" || e.payload.type === "enter") setOver(true);
      else if (e.payload.type === "leave") setOver(false);
      else if (e.payload.type === "drop") { setOver(false); if (e.payload.paths[0]) openRef.current(e.payload.paths[0]); }
    })).then((u) => { if (live) off = u; else u(); });
    return () => { live = false; off?.(); };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  // ตัวตรวจเปิดไฟล์ได้โดยไม่ต้องเปิดกล่องเลือกไฟล์ (กล่องจะเด้งขึ้นจอ)
  useEffect(() => { (window as unknown as { __miOpen?: (p: string) => void }).__miOpen = (p) => openRef.current(p); });

  // ปกที่ฝังในไฟล์ · ไฟล์ที่มีปกจากคลังแล้วไม่ต้องอ่าน · ไฟล์ไม่มีปกหรืออ่านไม่ได้ ขึ้นช่องลายเอียงตามเดิม
  const libThumb = path ? libOf(path)?.thumb ?? null : null;
  useEffect(() => {
    if (!path || libThumb || cover?.path === path) return;
    let live = true;
    convertApi.cover(path).then((c) => { if (live) setCover({ path, url: c?.url ?? null }); }, () => { if (live) setCover({ path, url: null }); });
    return () => { live = false; };
  }, [path, libThumb]); // eslint-disable-line react-hooks/exhaustive-deps

  // รายการล่าสุดบอกไฟล์ที่หายก่อนกด แบบหน้ากราฟเสียง · ถามใหม่ทุกครั้งที่กลับมาหน้าว่างหรือกลับมาที่หน้าต่าง
  const [gone, setGone] = useState<Set<string>>(() => new Set());
  useEffect(() => {
    if (path || !recent.length || !inApp) return;
    let live = true;
    const ask = () => graphApi.exist(recent).then((ok) => { if (live) setGone(new Set(recent.filter((_, i) => !ok[i]))); }, () => { /* ถามไม่ได้ ถือว่าไฟล์ยังอยู่ กดแล้วค่อยบอก */ });
    void ask();
    window.addEventListener("focus", ask);
    return () => { live = false; window.removeEventListener("focus", ask); };
  }, [path, recent]);

  if (path) {
    // ไฟล์ที่อยู่ในชั้นวางใช้ข้อมูลเรื่องจากคลัง ได้ปกกับค่า hash ที่จดไว้
    const m = libOf(path) ?? bare(path);
    const isMovie = MOVIE_EXT.includes(extOf(path));
    return <FileInfoPage key={path} m={m} cover={cover?.path === path ? cover.url : null} onBack={() => setPath(null)} backLabel="เลือกไฟล์อื่น" onAv={isMovie ? onAv : undefined} />;
  }
  return (
    <div className="pagewrap" data-mi-page>
      {/* กรอบเลือกไฟล์ขนาด ตำแหน่ง และข้างในแบบเดียวกับหน้ากราฟเสียง (BUGS ข้อ 54 ต่อ พี่กันสั่ง 12 พ.ย. 2569 "กรอบเลือกไฟล์ ขอเท่ากันกับเมนูอื่น")
          เดิมอยู่ในการ์ดที่มีหัว MediaInfo กรอบเล็กกว่าและต่ำกว่าหน้าอื่น */}
      <div className="ag">
        {/* แถบด้านบนแบบหน้าบิตเรตกับหน้ากราฟเสียง กรอบเลือกไฟล์จึงอยู่ตำแหน่งเดียวกับหน้าอื่น (BUGS ข้อ 54 ต่อ พี่กันสั่ง 12 พ.ย. 2569 "หาปุ่มอะไรใส่ไว้ข้างวันหน่อย ให้มันเท่ากัน")
            ปุ่มพาไปหน้าชั้นวาง ทุกเรื่องในชั้นวางมีปุ่ม MediaInfo ที่แผงขวา · ความสูงเท่าช่องเลือกโหมดของหน้าอื่น */}
        <div className="gmodebar">
          <button type="button" className="btn btn-ghost" style={{ height: 36 }} onClick={onShelf} data-mi-shelf><IcShelf />เลือกจากชั้นวาง</button>
          <span className="small"><Phr>ดูข้อมูลภาพ เสียง ซับ และไฟล์แนบแบบโปรแกรม MediaInfo พร้อมค่า hash ได้ทุกไฟล์  โปรแกรมอ่านอย่างเดียว ไฟล์จึงไม่ถูกแตะ</Phr></span>
        </div>
        <div className={"drop" + (over ? " over" : err ? " bad" : "")} style={{ minHeight: 180 }} onClick={dropClick(pick)} data-drop="mediainfo">
          {over ? <b>ปล่อยเมาส์เพื่อเปิดไฟล์นี้</b>
            : err ? <b>{err}</b>
            : <><b style={{ color: "var(--txt2)" }}>ลากไฟล์หนังหรือไฟล์เสียงมาวางตรงนี้</b><span>หรือ</span></>}
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => void pick()}><IcFile size={15} />เลือกไฟล์จากเครื่อง</button>
          <span className="small">{`รับไฟล์หนัง ${MOVIE_EXT.map((e) => e.toUpperCase()).join(" ")} และไฟล์เสียง ${AUDIO_EXT.map((e) => e.toUpperCase()).join(" ")}`}</span>
        </div>
        {recent.length > 0 && (<>
          <div className="small">เปิดล่าสุด กดเพื่อดูอีกครั้ง และกดปุ่มกากบาทเพื่อเอาออกจากรายการ ไฟล์ในเครื่องไม่ถูกแตะ</div>
            <div className="graph-recent" data-mi-recent>{recent.map((p) => {
              const nm = nameOf(p), mv = libOf(p), lost = gone.has(p), th = mv?.thumb ?? mv?.linked?.[0]?.thumb ?? null;
              const audio = AUDIO_EXT.includes(extOf(p));
              const e = extOf(p);
              return (
                <div key={p} className={"recentrow" + (lost ? " lost" : "")}>
                  <button type="button" className="dd" aria-disabled={lost || undefined} onClick={() => { if (!lost) open(p); }} data-mi-recentpick={nm} data-lost={lost || undefined}
                    title={lost ? `หาไฟล์ไม่เจอ ไฟล์อาจถูกย้ายหรือลบ หรือไดรฟ์ถอดออกอยู่\n${p}` : p}>
                    <span style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0, flex: "1 1 auto", overflow: "hidden" }}>
                      <span className="rtype">{audio ? <i className="rnote">{music}</i> : th ? <img src={thumbUrl(th) ?? ""} alt="" style={{ width: 18, height: 27, borderRadius: 3, objectFit: "cover" }} /> : <i className="rnote">{film}</i>}{e && <span className="rext">{e.toUpperCase()}</span>}</span>
                      <span style={{ whiteSpace: "nowrap", minWidth: 0 }}>{nm.replace(/\.[^.]+$/, "")}</span></span>
                    {lost ? <span className="small lostmark" style={{ flex: "none" }}>หาไฟล์ไม่เจอ</span> : mv ? <span className="small" style={{ flex: "none" }}>อยู่ในชั้นวาง</span> : null}
                  </button>
                  <button type="button" className="rmx" onClick={() => forget(p)} aria-label={`เอา ${nm} ออกจากรายการที่ดูล่าสุด`} title="เอาออกจากรายการ ไฟล์ในเครื่องไม่ถูกแตะ" data-mi-forget={nm}>
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.8" strokeLinecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" /></svg>
                  </button>
                </div>
              );
            })}</div>
        </>)}
      </div>
    </div>
  );
}
