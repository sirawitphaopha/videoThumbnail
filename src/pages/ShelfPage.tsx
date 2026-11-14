/* หน้า 1 ชั้นวางหนัง (สเปกข้อ 1 3 4 5 · ต้นแบบบรรทัด 335–603)
   แถบบน ที่อยู่โฟลเดอร์ ค้นหา เรียง อ่านโฟลเดอร์ใหม่ · หัวชั้น ภาพปก/ตาราง เล็ก/กลาง/ใหญ่ การแสดงผล
   ชั้นไม้ แถวละกี่เรื่องคิดจากความกว้างจริง · ตารางกดหัวคอลัมน์เรียง · แผงรายละเอียด การ์ดสถานะทุกแบบ ปุ่ม 6 ปุ่ม
   ไดรฟ์ที่ถอดออก หนังยังอยู่บนชั้นแบบจาง เปิดเล่นไม่ได้ · กำลังอ่านมีโครงจาง ปกขึ้นทีละเรื่อง */
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { CheckReq } from "./CheckPage";
import type { Page } from "../components/Sidebar";
import SearchBox from "../components/SearchBox";
import RenameBox from "../components/RenameBox";
import Dropdown from "../components/Dropdown";
import { Badge, CardIcon, J, Keep, Phr, Phrases, Seg, Skel, SortArrow, Switch, chText } from "../components/ui";
import Dialog from "../components/Dialog";
import { IcBitrate, IcClock, IcFolder, IcLink, IcCoverL, IcCoverM, IcCoverS, IcTall, IcWide } from "../components/icons";
import { openLinkRow, setLinkJob, setReply, useLinkJob } from "../lib/linkJob";
import type { PosterStart } from "./PosterPage";
import { useToast } from "../components/Toasts";
import { useMovieFrame } from "../lib/frames";
import { api, driveApi, linkApi, thumbUrl, type Geometry, type LinkedCover, type Movie, pairApi, pickAddFiles, type Pair, type PairPlay } from "../lib/api";
import { langName } from "../lib/langs";
import { useLibrary } from "../lib/library";
import { useSettings } from "../lib/settings";
import { searchByName, highlightParts } from "../lib/thaiSearch";
import { fmtDateTime, fmtDuration, fmtSize } from "../lib/format";
import { kindOf, KIND_ORDER, SHELF_LABEL, TABLE_LABEL, type Kind } from "../lib/status";
import { dropStyle, sideStyle, useDropPlacement, useSideFit } from "../lib/popupFit";
import { useClickOutside, useEscClose, kb } from "../lib/popup";
import { useSkelPreview } from "../lib/skelPreview";
import { driveName, freePct, isLow, requestSettingsSec, sizeNb, useDriveSpace } from "../lib/drives";
import HoverBig from "../components/HoverBig";
import { usePageActive } from "../lib/pageActive";
import { ftLook } from "../lib/ftypes";
import { IcSearch, IbTrash, IbNext, IcRefresh, IcCheck, IbPencil, IcMix, IcClose, IbEye, IbPlay, IcPoster, IbCrop, IcSettings } from "../components/icons";

const SORTS = [
  { value: "name-asc", label: "ชื่อ ก–ฮ" },
  { value: "name-desc", label: "ชื่อ ฮ–ก" },
  { value: "year", label: "ปีที่ออกฉาย ใหม่ไปเก่า" },
  { value: "added", label: "เพิ่มเข้าชั้นล่าสุด" },
  { value: "size", label: "ขนาดไฟล์ ใหญ่ไปเล็ก" },
  { value: "status", label: "สภาพไฟล์ ที่เสียขึ้นก่อน" },
  { value: "rating", label: "ดาวมากไปน้อย" },
];
const SIZES = { s: { w: 100, gap: 14 }, m: { w: 140, gap: 18 }, l: { w: 180, gap: 20 } } as const;
const byName = (a: Movie, b: Movie) => a.name.localeCompare(b.name, "th");
const baseName = (p: string) => p.split(/[\\/]/).pop() ?? p;

/** ตัวกรองที่มาของปก (พี่กันเคาะ *"ชั้นวางกรองได้ว่าเรื่องไหนปกมาจากการรวม เรื่องไหนจับคู่"*) · จำไว้ระหว่างเปลี่ยนหน้า ปิดโปรแกรมกลับเป็นทั้งหมด จะได้ไม่งงว่าหนังหาย */
type CoverFilter = "all" | "file" | "linked" | "none";
let filterMemo: CoverFilter = "all";
/** นับตามปกที่กำลังแสดง เรื่องหนึ่งอยู่หมวดเดียว ยอดสามหมวดรวมกันเท่าทั้งหมด */
const coverFrom = (m: Movie): Exclude<CoverFilter, "all"> => (m.shownLink ? "linked" : m.thumb ? "file" : "none");
/** ตัวกรองคะแนนดาว · จำไว้ระหว่างเปลี่ยนหน้าแบบเดียวกับตัวกรองปก */
type StarFilter = "all" | "5" | "4" | "3" | "2" | "1" | "none";
const STAR_FILTERS: { value: StarFilter; label: string }[] = [
  { value: "all", label: "ทุกดาว" }, { value: "5", label: "5 ดาว" }, { value: "4", label: "4 ดาวขึ้นไป" }, { value: "3", label: "3 ดาวขึ้นไป" }, { value: "2", label: "2 ดาวขึ้นไป" }, { value: "1", label: "1 ดาวขึ้นไป" }, { value: "none", label: "ยังไม่ให้ดาว" },
];
let starMemo: StarFilter = "all";
/** ไดรฟ์ที่กดไว้ทีหลังในคำเตือนไดรฟ์ใกล้เต็ม จำจนปิดโปรแกรม (BUGS ข้อ 88) */
const driveLater = new Set<string>();
const passStars = (m: Movie, f: StarFilter) => (f === "all" ? true : f === "none" ? !m.rating : (m.rating ?? 0) >= Number(f));
const LinkMark = () => <span className="linkb" title="ปกจับคู่ไว้ ไม่ได้อยู่ในไฟล์" data-linkb><IcLink size={13} stroke="#b0355f" /></span>;

export function sortMovies(list: Movie[], key: string, reminder: number): Movie[] {
  const l = list.slice();
  switch (key) {
    case "name-desc": return l.sort((a, b) => byName(b, a));
    case "year": return l.sort((a, b) => (b.year ?? -1) - (a.year ?? -1) || byName(a, b));
    case "added": return l.sort((a, b) => b.added - a.added || byName(a, b));
    case "size": return l.sort((a, b) => b.size - a.size || byName(a, b));
    case "rating": return l.sort((a, b) => (b.rating ?? 0) - (a.rating ?? 0) || byName(a, b));
    case "status": return l.sort((a, b) => KIND_ORDER[kindOf(a, reminder)] - KIND_ORDER[kindOf(b, reminder)] || byName(a, b));
    default: return l.sort(byName);
  }
}

const tracks = (t: Movie["audio"], withLayout: boolean) =>
  t.map((x) => [x.lang, x.codec, withLayout ? chText(x.layout) : null].filter(Boolean).join(" ")).join(", ");

/** ชื่อหนังพร้อมไฮไลต์คำที่ค้น · ตัดบรรทัดตรงเว้นวรรค (ui.tsx Phrases) · tail ต่อท้ายวลีสุดท้ายไม่แยกบรรทัด */
function Hl({ text, used, head, tail }: { text: string; used: string; head?: React.ReactNode; tail?: React.ReactNode }) {
  return <Phrases parts={highlightParts(text, used).map((p) => ({ text: p.text, hit: p.hit }))} head={head} tail={tail} />;
}

/** sel เก็บที่ตัวโปรแกรม (App) ไม่ใช่ในหน้านี้ · ไปหน้าข้อมูลไฟล์หรือใส่โปสเตอร์แล้วกลับมา ต้องยังเลือกเรื่องเดิมอยู่ */
export default function ShelfPage({ onPage, onPoster, onMerge, onInfo, onCheck, onGraph, onBitrate, onAv, sel, setSel }: { onPage: (p: Page) => void; onPoster: (path: string) => void; onMerge: (path: string, image: PosterStart) => void; onInfo: (id: string) => void; onCheck: (r: CheckReq) => void; onGraph: (path: string) => void; onBitrate: (path: string) => void; onAv: (path: string) => void; sel: string | null; setSel: (id: string | null) => void }) {
  const { settings, update } = useSettings();
  const { movies, folders, scanning, progress, scan } = useLibrary();
  const toast = useToast();
  const skelPreview = useSkelPreview();
  const [query, setQuery] = useState("");
  const reminder = settings?.recheckReminderDays ?? 30;
  const sort = settings?.sort ?? "name-asc";
  const view = settings?.viewMode ?? "grid";
  const size = settings?.coverSize ?? "m";
  // สลับภาพปกกับตารางแล้วเลื่อนกลับบนสุด ของข้างในคนละแบบ ระยะเลื่อนเดิมไม่มีความหมาย (เดิมหัวชั้นโดนตัดครึ่ง)
  const wrapRef = useRef<HTMLDivElement>(null);
  useEffect(() => { wrapRef.current?.scrollTo({ top: 0 }); }, [view]);

  const orient = settings?.coverOrient ?? "tall";
  const found = useMemo(() => searchByName(movies, query, (m) => m.name), [movies, query]);
  const covered = useMemo(() => sortMovies(found.items, sort, reminder).map((m) => withCover(m, orient)), [found.items, sort, reminder, orient]);
  const [filter, setFilterNow] = useState<CoverFilter>(filterMemo);
  const setFilter = (v: CoverFilter) => { filterMemo = v; setFilterNow(v); };
  const [star, setStarNow] = useState<StarFilter>(starMemo);
  const setStar = (v: StarFilter) => { starMemo = v; setStarNow(v); };
  // กรองดาวก่อน เลขบนปุ่มกรองปกจึงตรงกับที่เห็นบนชั้น
  const starred = useMemo(() => (star === "all" ? covered : covered.filter((m) => passStars(m, star))), [covered, star]);
  const counts = useMemo(() => {
    const c = { all: starred.length, file: 0, linked: 0, none: 0 };
    for (const m of starred) c[coverFrom(m)]++;
    return c;
  }, [starred]);
  const list = useMemo(() => (filter === "all" ? starred : starred.filter((m) => coverFrom(m) === filter)), [starred, filter]);
  const linkJob = useLinkJob();
  const resume = linkJob.resume ? linkJob.reply.waiting : 0;
  // แผงขวาขึ้นเฉพาะตอนกดเลือกเรื่อง ปิดได้ ชั้นวางกว้างขึ้น (พี่กัน 7 พ.ย. 2569 *"แถบนี้ เราอยากให้มันขึ้นตอนที่กดหนังนั้นๆ เเละมีปุ่มปิดได้ เราอยากห้มันเเสดงชั้นวางมากกว่า"*)
  // เดิมไม่ได้เลือกก็ขึ้นเรื่องแรกค้างไว้ตลอด
  const selected = list.find((m) => m.id === sel) ?? null;

  const missingFolders = folders.filter((f) => !f.ok);
  // ไดรฟ์ใกล้เต็ม (BUGS ข้อ 88 ③) · ที่กดไว้ทีหลังจำไว้จนปิดโปรแกรม
  const drives = useDriveSpace();
  const [, setLaterN] = useState(0);
  const lowAll = (drives.list ?? []).filter(isLow);
  const lowDrives = lowAll.filter((d) => !driveLater.has(d.root));
  /** ไดรฟ์ที่กดไว้ทีหลังแล้วยังใกล้เต็มอยู่ ขึ้นป้ายจาง ๆ ที่แถบล่าง กดแล้วการ์ดเตือนกลับมา (พี่กันเสนอ 13 พ.ย. 2569 "เตือนจางๆข้างล่างดีมั้ย" หลังถามว่ากดไว้ทีหลังแล้วจะเตือนอีกตอนไหน) */
  const lowLater = lowAll.filter((d) => driveLater.has(d.root));
  const openDrive = (root: string) => {
    // รุ่นทดสอบ ตัวตรวจตั้ง window.__openDry ไว้ จดว่ากดแทนการเปิด Explorer ที่จะเด้งขึ้นจอ · ตัวจริงไม่มีทางนี้
    const w = window as unknown as { __openDry?: boolean; __openDryLog?: string[] };
    if (import.meta.env.DEV && w.__openDry) { (w.__openDryLog ??= []).push(root); return; }
    driveApi.open(root).catch((e) => toast({ kind: "bad", title: `เปิด${driveName(root)}ไม่ได้`, detail: String(e) }));
  };
  const pathText = settings?.folders.length
    ? settings.folders[0] + (settings.folders.length > 1 ? ` และอีก ${settings.folders.length - 1} โฟลเดอร์` : "")
    : "";


  return (
    <>
      <div className="topbar">
        <div className="tbleft">
          <div className="path" title={settings?.folders.join("\n")}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path d="M3 7a2 2 0 012-2h4l2 2h8a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2z" /></svg>
            <span>{pathText}</span>
          </div>
          {movies.length > 0 && <div className="tbstar" data-star-filter><Dropdown label="กรองคะแนนดาว" value={star} options={STAR_FILTERS} onChange={setStar} stretch /></div>}
        </div>
        <SearchBox value={query} onChange={setQuery} placeholder="ค้นหาชื่อหนัง" label="ค้นหาชื่อหนัง" swapLabel={found.swapped ? found.used : ""} width="100%" />
        <Dropdown label="เรียง" value={sort} options={SORTS} onChange={(v) => update({ sort: v })} display={(o) => `เรียงตาม${o?.label ?? ""}`} />
        {scanning ? (
          <button type="button" className="btn btn-wait" aria-disabled="true" title="กำลังอ่านโฟลเดอร์อยู่ รอให้เสร็จก่อน">
            <RefreshIcon />กำลังอ่านโฟลเดอร์
          </button>
        ) : (
          <button type="button" className="btn btn-ghost" onClick={scan}><RefreshIcon />อ่านโฟลเดอร์ใหม่</button>
        )}
      </div>
      {/* แถบที่สองอยู่นอกกล่องเลื่อน ใช้คอลัมน์เดียวกับแถบบน ปุ่มภาพปกกว้างเท่าแถบค้นหา ตรงแนวกันเสมอ แม้แผงขวาเปิดอยู่ (พี่กันสั่ง 8 พ.ย. 2569) */}
      <div className="topbar shelfhead">
        {movies.length > 0 ? (
          <div className="seg sm shelffilter" role="tablist" aria-label="กรองตามที่มาของปก" data-shelf-filter>
            {([["all", "ทั้งหมด"], ["file", "ปกในไฟล์"], ["linked", "ปกจับคู่"], ["none", "ยังไม่มีปก"]] as const).map(([v, label]) => (
              <button key={v} type="button" role="tab" aria-selected={filter === v} className={filter === v ? "on" : ""} data-shelf-tab={v} onClick={() => setFilter(v)}>{v === "linked" && <IcLink size={13} />}{label} {counts[v]}</button>
            ))}
          </div>
        ) : <div />}
        <Seg small label="มุมมอง" value={view} onChange={(v) => update({ viewMode: v })} options={[
          { value: "grid", label: <><GridIcon />ภาพปก</> },
          { value: "table", label: <><ListIcon />ตาราง</> },
        ]} />
        <Seg small label="ขนาดปก" value={size} onChange={(v) => update({ coverSize: v })}
          options={[{ value: "s", label: <><IcCoverS />เล็ก</> }, { value: "m", label: <><IcCoverM />กลาง</> }, { value: "l", label: <><IcCoverL />ใหญ่</> }]} />
        <div className="tborient">
          <Seg small label="ดูปก" value={orient} onChange={(v) => update({ coverOrient: v })}
            options={[{ value: "tall", label: <><IcTall />ปกตั้ง</> }, { value: "wide", label: <><IcWide />ปกนอน</> }]} />
          <DisplayMenu />
        </div>
      </div>
      <div className="content">
        <div className="shelfwrap" ref={wrapRef}>
          {resume > 0 && (
            <div className="stat info" style={{ margin: "0 0 12px" }} data-link-resume>
              <CardIcon kind="info" />
              <div style={{ flex: 1 }}>
                <b>ทำต่อ <span className="nw">{resume} คู่</span>ที่ค้างไว้</b>
                <Phr>จับคู่รูปปกไว้แล้วแต่ยังไม่ได้ยืนยัน โปรแกรมจำไว้ให้ ปกยังไม่ขึ้นชั้นวาง</Phr>
                <div className="minirow">
                  <button type="button" className="btn btn-main btn-sm" data-link-resume-go onClick={() => { setLinkJob({ view: "table" }); onPage("link"); }}><IbNext size={15} />ทำต่อ</button>
                  <button type="button" className="btn btn-ghost btn-sm" data-link-resume-later onClick={() => setLinkJob({ resume: false })}><IcClock size={15} />ไว้ทีหลัง</button>
                </div>
              </div>
            </div>
          )}
          {/* ไดรฟ์ที่เหลือไม่ถึง 10% (BUGS ข้อ 88 ③ พี่กันสั่ง "ถ้าเนื้อที่เหลือ 10% ไปเตือนที่หน้าชั้นวาง หาที่ใส่ให้ที") · วางที่เดียวกับการ์ดทำต่อ ซึ่งเป็นที่ชั้นวางใช้บอกเรื่องที่ต้องทำ (แคลร์เลือก)
              กดไว้ทีหลังแล้วหายจนปิดโปรแกรม ถ้าไดรฟ์อื่นใกล้เต็มเพิ่มจะขึ้นใหม่ */}
          {lowDrives.length > 0 && (
            <div className="stat warn" style={{ margin: "0 0 12px" }} data-drive-low-shelf>
              <CardIcon kind="warn" />
              <div style={{ flex: 1 }}>
                <b>{lowDrives.map((d) => `${driveName(d.root)} เหลือที่ว่าง ${freePct(d)}`).join(" และ ")}</b>
                <Phr>{`${lowDrives.map((d) => `${driveName(d.root)} ว่าง ${sizeNb(fmtSize(d.free))} จาก ${sizeNb(fmtSize(d.total))}`).join(" และ ")}  ถ้าไดรฟ์เต็ม การใส่โปสเตอร์ รวมไฟล์ แปลงเสียง${lowDrives.some((d) => d.app) ? " และการบันทึกค่าตั้ง" : ""}จะทำไม่สำเร็จ`}</Phr>
                <div className="minirow">
                  <button type="button" className="btn btn-ghost btn-sm" data-drive-low-go onClick={() => { requestSettingsSec("folders"); onPage("settings"); }}><IcSettings size={15} />ดูความจุไดรฟ์</button>
                  {/* ปุ่มที่สาม เปิดไดรฟ์ใน Explorer ไปลบหรือย้ายไฟล์ได้ทันที ไดรฟ์ละปุ่ม (พี่กันสั่ง 13 พ.ย. 2569 "ให้กดเเล้วเปิดโฟลเด้อไดรฟื C เลย" · "เพิ่มปุ่มที่สาม") */}
                  {lowDrives.map((d) => <button key={d.root} type="button" className="btn btn-ghost btn-sm" data-drive-low-open={d.root} onClick={() => openDrive(d.root)}><IcFolder size={15} />เปิด{driveName(d.root)}</button>)}
                  <button type="button" className="btn btn-ghost btn-sm" data-drive-low-later onClick={() => { lowDrives.forEach((d) => driveLater.add(d.root)); setLaterN((n) => n + 1); }}><IcClock size={15} />ไว้ทีหลัง</button>
                </div>
              </div>
            </div>
          )}
          {scanning && (
            <div className="hint" style={{ marginTop: 2 }}>
              กำลังอ่าน {pathText} ปกจะขึ้นทีละเรื่องเมื่ออ่านเสร็จ
              {progress && progress.total > 0 && <> อ่านแล้ว <span className="nw">{progress.done} จาก {progress.total} เรื่อง</span></>}
            </div>
          )}
          {missingFolders.map((f) => (
            <div key={f.path} className="stat bad" style={{ margin: "10px 0 14px" }} data-folder-missing>
              <CardIcon kind="bad" />
              <div style={{ flex: 1 }}>
                <b>หาโฟลเดอร์ {f.path} ไม่เจอ</b>
                <div><Phr>ไดรฟ์อาจถอดออกอยู่ หนังในโฟลเดอร์นี้ยังอยู่บนชั้นแบบจาง ๆ แต่เปิดเล่นไม่ได้จนกว่าจะเสียบไดรฟ์</Phr></div>
                <div className="minirow">
                  <button type="button" className="btn btn-ghost btn-sm" onClick={scan}><IcRefresh size={15} />ลองใหม่</button>
                  <button type="button" className="btn btn-ghost btn-sm" onClick={() => onPage("settings")}><IcSettings size={15} />ไปตั้งค่าโฟลเดอร์</button>
                </div>
              </div>
            </div>
          ))}
          {!query && filter !== "all" && list.length === 0 && !scanning ? (
            <div className="empty-search" data-shelf-empty>
              <div style={{ fontSize: 14 }}>ไม่มีเรื่องในหมวดนี้</div>
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => setFilter("all")}><IbEye size={15} />ดูทั้งหมด</button>
            </div>
          ) : star !== "all" && list.length === 0 && !query ? (
            <div className="empty-search" data-star-empty>
              <div style={{ fontSize: 14 }}>ไม่มีหนังที่ตรงกับ <b>{STAR_FILTERS.find((x) => x.value === star)?.label}</b></div>
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => setStar("all")}><IbEye size={15} />ดูทุกดาว</button>
            </div>
          ) : query && list.length === 0 ? (
            <div className="empty-search">
              <svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="#c99aad" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><circle cx="11" cy="11" r="7" /><path d="M20 20l-3.5-3.5M8.5 8.5l5 5M13.5 8.5l-5 5" /></svg>
              <div style={{ fontSize: 14 }}>ไม่มีหนังที่ชื่อมีคำว่า <b>{query.trim()}</b></div>
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => setQuery("")}><IcClose size={15} />ล้างคำค้น</button>
            </div>
          ) : (scanning && movies.length === 0) || skelPreview ? (
            <SkeletonShelf size={size} />
          ) : view === "grid" ? (
            <ShelfGrid list={list} size={size} selId={selected?.id ?? null} onSel={(id) => setSel(selected?.id === id ? null : id)} used={found.used} reminder={reminder}
              showNames={settings?.showNames ?? true} showDots={settings?.showDots ?? true} showFrames={settings?.showFrames ?? false}
              pending={scanning && !query && progress ? Math.max(0, progress.total - movies.length) : 0} />
          ) : (
            <ShelfTable size={size} list={list} selId={selected?.id ?? null} onSel={(id) => setSel(selected?.id === id ? null : id)} used={found.used} reminder={reminder} showFrames={settings?.showFrames ?? false} />
          )}
        </div>
        {/* key ต่อเรื่อง สลับเรื่องแล้วสร้างแผงกับปุ่มใหม่ ไม่ใช้ปุ่มเดิมซ้ำ (เดิมปุ่มชมพูค่อย ๆ เปลี่ยนเป็นเขียวตอนสลับเรื่อง) */}
        {selected && (
          <Detail key={selected.id} m={selected} showFrames={settings?.showFrames ?? false} scanning={scanning} reminder={reminder} onPage={onPage} onCheck={onCheck} onGraph={onGraph} onBitrate={onBitrate} onAv={onAv} onPoster={onPoster} onMerge={onMerge} onInfo={() => onInfo(selected.id)} onClose={() => setSel(null)}
            onPlay={() => api.playMovie(selected.path).catch((e) => {
              toast({ kind: "bad", title: "เปิดเล่นไม่ได้", detail: String(e) });
              // โปรแกรมเล่นที่เลือกเองหาไม่เจอ พากลับไปตั้งที่หน้าตั้งค่า (สเปกข้อ 9 *"หาไม่เจอวันหลัง กดเปิดเล่นแล้วบอก และพากลับมาตั้ง"*)
              if (String(e).includes("หาโปรแกรมเล่นหนัง")) onPage("settings");
            })}
            onReveal={() => api.revealMovie(selected.path).catch((e) => toast({ kind: "bad", title: "เปิดโฟลเดอร์ไม่ได้", detail: String(e) }))} />
        )}
      </div>
      {/* แถบสถานะล่างแบบโปรแกรม บอกจำนวนเรื่องกับความหมายเครื่องหมาย ไม่กินที่ด้านบน · ใช้รูปเดียวกับบนชั้น (พี่กันสั่ง 9 พ.ย. 2569 "มันมีเเค่สี มันควรเป้นรูปเดียวกัน") */}
      <div className="statusbar" data-statusbar>
        <span className="sbleft"><span>{query || filter !== "all" || star !== "all" ? <>เจอ {list.length} จาก <span className="nw">{movies.length} เรื่อง</span></> : <>หนังทั้งหมด <span className="nw">{movies.length} เรื่อง</span></>}</span>
        {lowLater.length > 0 && <button type="button" className="drivechip" title={`${lowLater.map((d) => `${driveName(d.root)} ว่าง ${fmtSize(d.free)} จาก ${fmtSize(d.total)}`).join(" และ ")} กดเพื่อดูคำเตือนอีกครั้ง`} data-drive-low-chip
          onClick={() => { lowLater.forEach((d) => driveLater.delete(d.root)); setLaterN((n) => n + 1); wrapRef.current?.scrollTo({ top: 0, behavior: "smooth" }); }}><CardIcon kind="warn" />{lowLater.map((d) => `${driveName(d.root)} เหลือ ${freePct(d)}`).join(" และ ")}</button>}</span>
        {settings?.showDots && view === "grid" && list.length > 0 && (
          <div className="legend">
            {(["ok", "warn", "bad", "info"] as Kind[]).map((k) => <span key={k} data-legend={k}><Badge kind={k} title={SHELF_LABEL[k]} />{SHELF_LABEL[k]}</span>)}
            <span data-legend="link"><LinkMark />ปกจับคู่</span>
          </div>
        )}
      </div>
    </>
  );
}

/* ---------- กล่องการแสดงผล (ต้นแบบบรรทัด 497–508) · ค่าเดียวกับหน้าตั้งค่า ---------- */
function DisplayMenu() {
  const { settings, update } = useSettings();
  const [open, setOpen] = useState(false);
  const wrap = useRef<HTMLDivElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const place = useDropPlacement(open, wrap, panel);
  const side = useSideFit(open, wrap, panel, "right");
  useEscClose(open, () => setOpen(false));
  useClickOutside(open, wrap, () => setOpen(false));
  return (
    <div ref={wrap} style={{ position: "relative" }}>
      <button type="button" className={"btn btn-ghost btn-sm" + (open ? " pressed" : "")} title="การแสดงผล" aria-label="การแสดงผล" style={{ width: 32, padding: 0, flex: "none" }} aria-haspopup="true" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" aria-hidden="true"><path d="M4 7h10M18 7h2M4 17h4M12 17h8" /><circle cx="16" cy="7" r="2" /><circle cx="10" cy="17" r="2" /></svg>
      </button>
      {open && settings && (
        <div ref={panel} className="menu pop-in" role="dialog" aria-label="การแสดงผล"
          style={{ position: "absolute", ...sideStyle(side, "right"), width: 320, padding: "6px 14px", zIndex: "var(--z-menu)" as unknown as number, ...dropStyle(place) }}>
          <div className="setrow" style={{ borderTop: 0 }}><div className="lbl">ชื่อไฟล์ใต้ปก</div><Switch on={settings.showNames} onChange={(v) => update({ showNames: v })} label="ชื่อไฟล์ใต้ปก" /></div>
          <div className="setrow"><div className="lbl">ภาพจากหนังในเรื่องที่ยังไม่มีปก</div><span data-showframes style={{ display: "inline-flex" }}><Switch on={settings.showFrames} onChange={(v) => update({ showFrames: v })} label="ภาพจากหนังในเรื่องที่ยังไม่มีปก" /></span></div>
          <div className="setrow"><div className="lbl">จุดสีบอกสภาพไฟล์</div><Switch on={settings.showDots} onChange={(v) => update({ showDots: v })} label="จุดสีบอกสภาพไฟล์" /></div>
        </div>
      )}
    </div>
  );
}

/* ---------- ชั้นไม้ ---------- */
function usePerRow(size: keyof typeof SIZES) {
  const ref = useRef<HTMLDivElement>(null);
  const [w, setW] = useState(700);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    // หน้าถูกซ่อน (เปลี่ยนเมนู) กว้าง 0 ข้ามไป จำผังเดิมไว้ · เดิมจำ 0 ผังตอนซ่อนเป็นแถวละเรื่อง กลับมาหน้าชั้นวางเฟรมแรกการ์ดกว้าง 100 ตารางสูง 4,471
    // แล้วจัดใหม่เป็นการ์ด 104 สูง 505 ในเฟรมเดียว ขึ้นข้อความเตือน ResizeObserver loop ทุกครั้งที่เข้าหน้าชั้นวาง (เจอใน check-look ชุด BUGS ข้อ 113 ถึง 121)
    const take = () => { if (el.clientWidth) setW(el.clientWidth); };
    const ro = new ResizeObserver(take);
    ro.observe(el);
    take();
    return () => ro.disconnect();
  }, []);
  const { w: bw, gap } = SIZES[size];
  return { ref, w, perRow: Math.max(1, Math.floor((w + gap) / (bw + gap))) };
}

/** ปกที่ชั้นวางใช้ตามที่เลือก ปกตั้งหรือปกนอน · เรื่องที่มีแบบเดียวขึ้นแบบนั้นเสมอ
    ภาพปก ตาราง แผงขวา ใช้ thumb กับ coverAspect ของเรื่องที่ผ่านตรงนี้แล้ว จึงสลับพร้อมกันทุกที่
    (พี่กัน 7 พ.ย. 2569 *"ทำระบบที่ดูรูปแบบเเนวตั้ง หรือเเนวนอนได้ ยกเว้นเรื่องนั้นๆมีเเค่เเนวเดียวมันจะเเสดงเเค่เเนวนั้น"*) */
function withCover(m: Movie, orient: "tall" | "wide"): Movie {
  const fileCover = !!m.thumb;
  // ปกจับคู่แสดงแบบเดียวกับปกในไฟล์ สลับปกตั้งปกนอนตาม · เรื่องที่มีทั้งสองปก เลือกได้ทีละเรื่อง ค่าตั้งต้นปกจับคู่ (แคลร์ตั้ง · พี่กันตอบ *"เลือกได้"*)
  const linked = m.linked ?? [];
  if (linked.length && (!fileCover || m.coverPick !== "file")) {
    const c = linked.find((x) => x.orient === orient) ?? linked[0];
    return { ...m, fileCover, shownLink: c, thumb: c.thumb, coverAspect: c.aspect };
  }
  if (!m.thumb2) return { ...m, fileCover, shownLink: null };
  const want = (a: number) => (orient === "wide" ? a >= 1 : a < 1);
  const a1 = m.coverAspect ?? 0, a2 = m.cover2Aspect ?? 0;
  return want(a1) || !want(a2) ? { ...m, fileCover, shownLink: null } : { ...m, fileCover, shownLink: null, thumb: m.thumb2, coverAspect: a2 };
}

/** กว้างของเล่มบนชั้น · ปกแนวนอน (กว้างหารสูงตั้งแต่ 1) สูงเท่าเล่มอื่น กว้างตามสัดส่วนไม่เกิน 16:9 · ปกตั้งกับเล่มที่ยังไม่มีปกกว้างเท่าเดิม
    (พี่กัน 7 พ.ย. 2569 *"ถ้าเราเอาโปสเตอร์แบบเเนวนอนมา มันก็จะเเสดงเป็เเเนวนอนด้วยนะ"*) */
function bookWidth(m: Movie | null, bw: number) {
  const a = m?.thumb ? m.coverAspect ?? 0 : 0;
  return a >= 1 ? bw * 1.5 * Math.min(a, 16 / 9) : bw;
}

/** แบ่งแถวตามความกว้างจริงของแต่ละเล่ม (เดิมแบ่งจำนวนเท่ากันทุกแถว เพราะทุกเล่มกว้างเท่ากัน) */
function packRows(items: (Movie | null)[], avail: number, bw: number, gap: number) {
  const rows: (Movie | null)[][] = [];
  let cur: (Movie | null)[] = [], used = 0;
  for (const it of items) {
    const w = bookWidth(it, bw), need = cur.length ? used + gap + w : w;
    if (cur.length && need > avail) { rows.push(cur); cur = [it]; used = w; } else { cur.push(it); used = need; }
  }
  if (cur.length) rows.push(cur);
  return rows;
}

/** pending = เรื่องที่เจอในโฟลเดอร์แต่ยังอ่านไม่เสร็จ · ขึ้นเป็นโครงจางต่อท้ายชั้น เต็มแถวที่ค้างกับอีกหนึ่งแถว (ไม่วาดครบทุกเรื่อง ชั้น 500 เรื่องจะหนัก) */
function ShelfGrid(p: { list: Movie[]; size: "s" | "m" | "l"; selId: string | null; onSel: (id: string) => void; used: string; reminder: number; showNames: boolean; showDots: boolean; showFrames: boolean; pending: number }) {
  const { ref, w, perRow } = usePerRow(p.size);
  const { w: base, gap } = SIZES[p.size];
  const skel = Math.min(p.pending, ((perRow - (p.list.length % perRow)) % perRow) + perRow);
  const items: (Movie | null)[] = skel ? [...p.list, ...Array<null>(skel).fill(null)] : p.list;
  // ขยายปกให้เต็มแถว ไม่เหลือที่ว่างขวา · ปกตั้งได้ความกว้างพอดีจำนวนต่อแถว · ปกนอนขยายตามแถวแรกอีกชั้น
  // ทุกแถวระยะห่างเท่ากัน ชิดซ้ายตรงคอลัมน์ · แถวที่ปกนอนตกไปแถวถัดไปเหลือที่ว่างท้ายแถว (เดิมกระจายปกที่เหลือเต็มแถว ระยะห่าง 18 กลายเป็น 100 จุดที่จอ 1366 เจอ 11 พ.ย. 2569 พี่กันสั่งแก้ 12 พ.ย.)
  let bw = Math.max(base, (w - (perRow - 1) * gap) / perRow);
  let rows = packRows(items, w, bw, gap);
  if (rows.length > 1) {
    const room = w - (rows[0].length - 1) * gap, used = rows[0].reduce((n, m) => n + bookWidth(m, bw), 0);
    if (used > 0 && room / used > 1.002) { bw = bw * (room / used); rows = packRows(items, w, bw, gap); }
  }
  return (
    <div ref={ref} className={"size-" + p.size} data-shelf style={{ "--bw": `${bw}px` } as React.CSSProperties}>
      {rows.map((row, i) => (
        <div key={i} className="shelf">
          {row.map((m, j) => m
            ? <Book key={m.id} m={m} width={bookWidth(m, bw)} sel={m.id === p.selId} onSel={p.onSel} used={p.used} reminder={p.reminder} showNames={p.showNames} showDots={p.showDots} showFrames={p.showFrames} />
            : <SkelBook key={"skel" + j} size={p.size} i={j} />)}
        </div>
      ))}
    </div>
  );
}

function SkelBook({ size, i }: { size: "s" | "m" | "l"; i: number }) {
  const { w } = SIZES[size];
  return (
    <div className="book" style={{ cursor: "default" }} aria-hidden="true" data-skel>
      <Skel w={w} h={w * 1.5} r={6} />
      <Skel w={w * (0.5 + ((i * 37) % 40) / 100)} h={10} style={{ marginTop: 22 }} />
    </div>
  );
}

/** ป้ายใต้ปก ไฟล์ เสียง ซับ · สูงสุด 2 บรรทัด ล้นตัดแชนแนลเฉพาะเรื่องนี้ ยังล้นซ่อนป้ายท้ายขึ้น +จำนวน
    (พี่กันสั่ง 9 พ.ย. 2569 "เเต่มันจะเป็นตัวหนาเหมือน tag" · "เสียง ใส่เเชเเนลที" · "ทำให้มันเหลือสูสุดเเค่ 2 บรรทัดได้มั้ย เช่น ถ้าแบบนี้ เฉพาะจุดนี้ เอาเเชเเนลออก" · ข้อ +จำนวนแคลร์ตั้ง) */
function BookTags({ m }: { m: Movie }) {
  const ref = useRef<HTMLDivElement>(null);
  const audio = [...new Map(m.audio.map((a) => [a.codec + "|" + (a.layout ?? ""), a])).values()];
  const subs = [...new Set(m.subs.map((x) => x.codec).filter(Boolean))];
  const key = audio.map((a) => a.codec + a.layout).join() + "|" + subs.join() + "|" + m.ext;
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    let touched = false, lastW = -1;
    const fit = () => {
      const w = el.clientWidth;
      // หน้าถูกซ่อน (เปลี่ยนเมนู) กว้าง 0 ข้ามไป แถบที่จัดไว้คงเดิม · เดิมรีเซ็ตทุกแถบตอนซ่อน กลับมาหน้าชั้นวางต้องจัดใหม่ทุกเรื่องในเฟรมเดียว
      // ความสูงเปลี่ยนซ้ำระหว่างวัด ขึ้นข้อความเตือน ResizeObserver loop ทุกครั้งที่เข้าหน้าชั้นวาง (เจอใน check-look ชุด BUGS ข้อ 113 ถึง 121)
      if (!w || w === lastW) return;
      lastW = w;
      // ป้าย +จำนวน มีคลาส bt ด้วย ต้องตัดออก เดิมลูปซ่อนจากท้ายซ่อนตัวมันเองก่อน ป้ายนี้จึงไม่เคยขึ้น (AUDIT 12 พ.ย. 2569 ข้อ 4)
      const tags = [...el.querySelectorAll<HTMLElement>(":scope > .bt:not(.btmore)")];
      const more = el.querySelector<HTMLElement>(":scope > .btmore");
      if (!more) return;
      if (touched) {
        el.classList.remove("nochan");
        tags.forEach((t) => { t.style.display = ""; });
        more.style.display = "none";
        touched = false;
      }
      const lines = () => new Set([...el.children].filter((x) => (x as HTMLElement).style.display !== "none").map((x) => (x as HTMLElement).offsetTop)).size;
      if (lines() <= 2) return;
      touched = true;
      el.classList.add("nochan");
      // ตัดแชนแนลแล้วชื่อซ้ำ เช่น AAC 2.0 กับ AAC 5.1 เหลือป้ายเดียว
      const seen = new Set<string>();
      tags.forEach((t) => { const b = t.dataset.base; if (b && seen.has(b)) t.style.display = "none"; if (b) seen.add(b); });
      if (lines() <= 2) return;
      more.style.display = "";
      const on = tags.filter((t) => t.style.display !== "none");
      for (let i = on.length - 1; i > 0 && lines() > 2; i--) {
        on[i].style.display = "none";
        more.textContent = "+" + (on.length - i);
      }
    };
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(el);
    return () => ro.disconnect();
  }, [key]);
  const title = [`ไฟล์ ${m.ext.toUpperCase()}`, audio.length ? "เสียง " + tracks(m.audio, true) : "ไม่มีเสียง", m.subs.length ? "ซับ " + tracks(m.subs, false) : "ไม่มีซับ"].join("\n");
  return (
    <div ref={ref} className="bn3" title={title} data-booktags>
      <span className="bt f">{m.ext.toUpperCase()}</span>
      {audio.map((a) => <span key={a.codec + a.layout} className="bt a" data-base={"a" + a.codec}>{a.codec}{a.layout && <span className="ch"> {chText(a.layout)}</span>}</span>)}
      {subs.map((c) => <span key={c} className="bt s">{c}</span>)}
      <span className="bt btmore" style={{ display: "none" }} />
    </div>
  );
}

/** ดาวห้าดวงให้คะแนน (พี่กันเลือก 9 พ.ย. 2569 "ดวงเเบบนี้" แบบ ช จากมอคอัป) · กดดวงเดิมซ้ำล้างคะแนน (แคลร์ตั้ง) · ไม่เลือกเรื่องตอนกดดาว */
function Stars({ m }: { m: Movie }) {
  const toast = useToast();
  const [val, setVal] = useState(m.rating ?? 0);
  const [hover, setHover] = useState(0);
  useEffect(() => setVal(m.rating ?? 0), [m.rating]);
  const pick = (e: React.MouseEvent, n: number) => {
    e.stopPropagation();
    const old = val, next = val === n ? 0 : n;
    setVal(next);
    api.setRating(m.id, next).catch((err) => { setVal(old); toast({ kind: "bad", title: "ให้คะแนนไม่สำเร็จ", detail: String(err) }); });
  };
  const show = hover || val;
  return (
    <span className="stars" role="group" aria-label={`คะแนน ${val} จาก 5 ดาว`} data-stars={val} onMouseLeave={() => setHover(0)} onClick={(e) => e.stopPropagation()} onKeyDown={(e) => e.stopPropagation()}>
      {[1, 2, 3, 4, 5].map((n) => (
        <button key={n} type="button" className={"star" + (n <= show ? " on" : "")} title={val === n ? "กดอีกครั้งเพื่อล้างคะแนน" : `ให้ ${n} ดาว`} aria-label={`ให้ ${n} ดาว`} aria-pressed={val === n} data-star={n} onMouseEnter={() => setHover(n)} onClick={(e) => pick(e, n)}>
          <svg width="12" height="12" viewBox="0 0 24 24" strokeWidth="2" strokeLinejoin="round" aria-hidden="true"><path d="M12 3l2.8 5.8 6.2.9-4.5 4.4 1.1 6.3L12 17.4l-5.6 3 1.1-6.3L3 9.7l6.2-.9z" /></svg>
        </button>
      ))}
    </span>
  );
}

function Book(p: { m: Movie; width: number; sel: boolean; onSel: (id: string) => void; used: string; reminder: number; showNames: boolean; showDots: boolean; showFrames: boolean }) {
  const { m } = p;
  const k = kindOf(m, p.reminder);
  const src = thumbUrl(m.thumb);
  const full = m.name + (m.ext === "mkv" ? "" : "." + m.ext);
  const wide = src != null && (m.coverAspect ?? 0) >= 1;
  const frame = useMovieFrame(m, p.showFrames && !src);
  return (
    <div
      className={"book" + (wide ? " wide" : "") + (p.sel ? " sel" : "") + (m.missing ? " missing" : "")}
      style={wide ? { width: p.width } : undefined}
      title={[full, m.missing ? "หาไฟล์ไม่เจอ ไดรฟ์อาจถอดออกอยู่" : ""].filter(Boolean).join("\n") || undefined}
      aria-label={full + ", " + SHELF_LABEL[k] + (m.shownLink ? ", ปกจับคู่" : "") + (m.missing ? ", หาไฟล์ไม่เจอ" : "")}
      aria-pressed={p.sel}
      data-movie={m.name}
      {...kb(() => p.onSel(m.id))}
    >
      {(m.pairs?.length ?? 0) > 0 && <span className="pairdot" title="จับคู่เสียงหรือซับไว้" aria-label="จับคู่เสียงหรือซับไว้" data-pairdot />}
      {src ? (
        <div className="cover has-img"><img src={src} alt="" loading="lazy" draggable={false} /></div>
      ) : frame.url ? (
        <div className="cover has-img" title="ภาพจากหนัง ยังไม่ใช่ปก" data-frame><img src={thumbUrl(frame.url) ?? undefined} alt="" draggable={false} /></div>
      ) : (
        <div ref={frame.ref} className="cover none">
          <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="#c99aad" strokeWidth="2" aria-hidden="true"><rect x="4" y="3" width="16" height="18" rx="2" /><path d="M8 15l3-3 2 2 3-3 2 2" /></svg>
          ยังไม่มีโปสเตอร์
        </div>
      )}
      {(p.showNames || p.showDots || m.shownLink) && (
        <div className="bname">
          {/* สามบรรทัด ชื่อ · เครื่องหมาย · ป้าย ตรงแนวกันทุกเรื่อง (พี่กันสั่ง 9 พ.ย. 2569 "ให้มันเป้นระเบีบย" · เลือกแบบ ค จากมอคอัป pick-ui แท็บ 5) · ชื่อยาวตัดท้าย ชี้ดูชื่อเต็ม */}
          {p.showNames && <div className="bn1"><Hl text={m.name} used={p.used} /></div>}
          {(p.showNames || p.showDots || m.shownLink) && <div className="bn2">{p.showDots && <Badge kind={k} title={SHELF_LABEL[k]} />}{m.shownLink && <LinkMark />}{p.showNames && <Stars m={m} />}</div>}
          {p.showNames && <BookTags m={m} />}
        </div>
      )}
    </div>
  );
}

function SkeletonShelf({ size }: { size: "s" | "m" | "l" }) {
  const { ref, perRow } = usePerRow(size);
  return (
    <div ref={ref} className={"size-" + size} aria-busy="true" aria-label="กำลังอ่านโฟลเดอร์">
      {[0, 1].map((r) => (
        <div key={r} className="shelf">
          {Array.from({ length: perRow }, (_, i) => <SkelBook key={i} size={size} i={i} />)}
        </div>
      ))}
    </div>
  );
}

/* ---------- มุมมองตาราง (ต้นแบบบรรทัด 510–557) ---------- */
type Col = "name" | "size" | "video" | "audio" | "subs" | "status";
/** รูปย่อในตาราง เรื่องที่ไม่มีปกเป็นแถบทะแยง หรือภาพจากหนังเมื่อเปิดไว้ */
function NoCoverTh({ m, on }: { m: Movie; on: boolean }) {
  const frame = useMovieFrame(m, on);
  const url = frame.url ? thumbUrl(frame.url) : null;
  return url ? <HoverBig src={url} ratio={16 / 9} name={m.name + " (ภาพจากหนัง ยังไม่ใช่ปก)"}><img className="th" src={url} alt="" title="ภาพจากหนัง ยังไม่ใช่ปก" data-frame /></HoverBig> : <span ref={frame.ref} className="th none" />;
}

/** ป้าย ภาษา ชนิด แชนแนล · สีตามชนิด */
type Chip = { text: string; ft: string };
const trackChips = (t: Movie["audio"], withLayout: boolean): Chip[] => t.map((x) => ({ text: [x.lang, x.codec, withLayout ? chText(x.layout) : null].filter(Boolean).join(" "), ft: x.codec }));
/** ป้าย Video เช่น HEVC 2160p HDR สีจากคำแรก */
const videoChips = (v: string | null | undefined): Chip[] => (v ? [{ text: v, ft: v.split(" ")[0] }] : []);

/** ป้ายแถวเดียวในตาราง ไม่พอช่องซ่อนตัวท้ายแล้วบอก +จำนวน ชี้ที่ช่องดูครบ · คอลัมน์กว้างตายตัว การซ่อนจึงไม่ย้อนมาเปลี่ยนความกว้างช่อง
    (พี่กันสั่ง 9 พ.ย. 2569 "เสียง มันสองเเถวอ่ะ" · "ต้องบอกภาษษด้วย" · "เปลี่ยนเป็นการ์ดที") */
function ChipRow({ items }: { items: Chip[] }) {
  const ref = useRef<HTMLDivElement>(null);
  const key = items.map((c) => c.text).join("|");
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const fit = () => {
      const chips = [...el.querySelectorAll<HTMLElement>(":scope > .lvchip")];
      const more = el.querySelector<HTMLElement>(":scope > .lvmore");
      if (!more || !el.clientWidth) return; // หน้าถูกซ่อน กว้าง 0 ป้ายที่จัดไว้คงเดิม (แบบเดียวกับแถบใต้ปก)
      el.classList.remove("tight");
      chips.forEach((c) => { c.style.display = ""; });
      more.style.display = "none";
      const GAP = 4, room = el.clientWidth, w = chips.map((c) => c.offsetWidth);
      if (w.reduce((a, b) => a + b, 0) + GAP * (w.length - 1) <= room) return;
      more.textContent = "+" + chips.length;
      more.style.display = "";
      const mw = more.offsetWidth;
      let used = 0, n = 0;
      for (let i = 0; i < w.length; i++) {
        const next = used + w[i] + (i ? GAP : 0);
        if (next + GAP + mw > room) break;
        used = next;
        n = i + 1;
      }
      n = Math.max(1, n);
      chips.forEach((c, i) => { c.style.display = i < n ? "" : "none"; });
      more.textContent = "+" + (chips.length - n);
      // ป้ายเดียวยาวเกินช่อง ไม่มีอะไรซ่อน ไม่ขึ้น +0 ตัดท้ายป้ายแทน
      if (n === chips.length) more.style.display = "none";
      el.classList.toggle("tight", n === 1);
    };
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(el);
    return () => ro.disconnect();
  }, [key]);
  if (!items.length) return <>—</>;
  return (
    <div ref={ref} className="lvchips">
      {items.map((c, i) => { const look = ftLook(c.ft); return <span key={i} className={look.className + " lvchip"} style={look.style}>{c.text}</span>; })}
      <span className="lvmore" style={{ display: "none" }} />
    </div>
  );
}

function ShelfTable(p: { size: "s" | "m" | "l"; list: Movie[]; selId: string | null; onSel: (id: string) => void; used: string; reminder: number; showFrames: boolean }) {
  const [sort, setSort] = useState<{ col: Col; dir: 1 | -1 } | null>(null);
  const rows = useMemo(() => {
    if (!sort) return p.list;
    const key = (m: Movie): string | number => ({
      name: m.name, size: m.size, video: m.videoShort ?? "", audio: tracks(m.audio, true), subs: tracks(m.subs, false), status: KIND_ORDER[kindOf(m, p.reminder)],
    })[sort.col];
    return p.list.slice().sort((a, b) => {
      const x = key(a), y = key(b);
      const c = typeof x === "number" && typeof y === "number" ? x - y : String(x).localeCompare(String(y), "th");
      return c * sort.dir || byName(a, b);
    });
  }, [p.list, sort, p.reminder]);
  const head = (col: Col, label: string, cls: string) => {
    const on = sort?.col === col;
    return (
      <th className={cls} aria-sort={on ? (sort!.dir === 1 ? "ascending" : "descending") : "none"}>
        <button type="button" className="thsort" onClick={() => setSort(on ? { col, dir: sort!.dir === 1 ? -1 : 1 } : { col, dir: col === "size" ? -1 : 1 })}>
          {label}
          <SortArrow dir={on ? sort!.dir : 0} />
        </button>
      </th>
    );
  };
  return (
    <div className={"tblwrap tb-" + p.size} data-table>
      <table className="lv">
        <thead><tr>
          <th className="c-th" style={{ textAlign: "center" }}>ปก</th>{head("name", "ชื่อไฟล์", "c-name")}{head("size", "ขนาด", "c-size")}{head("video", "Video", "c-video")}{head("audio", "Audio", "c-a")}{head("subs", "Subtitle", "c-s")}{head("status", "สภาพไฟล์", "c-st")}
        </tr></thead>
        <tbody>
          {rows.map((m) => {
            const k = kindOf(m, p.reminder);
            const src = thumbUrl(m.thumb);
            return (
              <tr key={m.id} className={(m.id === p.selId ? "sel" : "") + (m.missing ? " missing" : "")} {...kb(() => p.onSel(m.id))} aria-selected={m.id === p.selId}>
                {/* ชี้รูปขึ้นภาพใหญ่ ตัวเดียวกับหน้าจับคู่ปก (พี่กันสั่ง 9 พ.ย. 2569 "เอาเมาส์ชี้ที่รูป จะ popup ภาพขึ้นมาดู") */}
                <td>{src ? <HoverBig src={src} ratio={m.coverAspect || 2 / 3} name={m.name}><img className={"th" + ((m.coverAspect ?? 0) >= 1 ? " wide" : "")} src={src} alt="" loading="lazy" /></HoverBig> : <NoCoverTh m={m} on={p.showFrames} />}</td>
                <td><Hl text={m.name} used={p.used} head={m.shownLink ? <LinkMark /> : undefined} tail={<b className="lvext">.{m.ext}</b>} /><div className="lvstars"><Stars m={m} /></div></td>
                <td><span className="nw">{fmtSize(m.size)}</span></td>
                <td className="lv-v" title={m.videoShort ?? undefined}><ChipRow items={videoChips(m.videoShort)} /></td>
                <td className="lv-a" title={tracks(m.audio, true) || undefined}><ChipRow items={trackChips(m.audio, true)} /></td>
                <td className="lv-s" title={tracks(m.subs, false) || undefined}><ChipRow items={trackChips(m.subs, false)} /></td>
                <td style={{ whiteSpace: "nowrap" }}><span className="lvstat"><Badge kind={k} title={TABLE_LABEL[k]} /><span className="lvword">{TABLE_LABEL[k]}</span></span></td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

/* ---------- แผงรายละเอียด (ต้นแบบบรรทัด 388–426) ---------- */
function Detail(p: { m: Movie; showFrames: boolean; scanning: boolean; reminder: number; onPage: (pg: Page) => void; onCheck: (r: CheckReq) => void; onGraph: (path: string) => void; onBitrate: (path: string) => void; onAv: (path: string) => void; onPoster: (path: string) => void; onMerge: (path: string, image: PosterStart) => void; onInfo: () => void; onPlay: () => void; onReveal: () => void; onClose: () => void }) {
  const { m } = p;
  const src = thumbUrl(m.thumb);
  const [imgOk, setImgOk] = useState(true);
  useEffect(() => setImgOk(true), [src]);
  const frame = useMovieFrame(m, p.showFrames && !src);
  // เปลี่ยนชื่อ (สเปกข้อ 2) · ⑤ สำเร็จ การ์ดเขียวหายเองใน 3 วินาที
  const [editing, setEditing] = useState(false);
  const [renamed, setRenamed] = useState(false);
  useEffect(() => { if (!renamed) return; const t = setTimeout(() => setRenamed(false), 3000); return () => clearTimeout(t); }, [renamed]);
  const renameBlock = m.missing ? "หาไฟล์ไม่เจอ ไดรฟ์อาจถอดออกอยู่" : p.scanning ? "กำลังอ่านโฟลเดอร์อยู่ รอให้เสร็จก่อน" : null;
  const startRename = () => { if (!renameBlock) { setRenamed(false); setEditing(true); } };
  // รูปต้นทางของตัวดูรูป · ปกจับคู่เปิดไฟล์ที่โปรแกรมเก็บไว้ หรือรูปต้นฉบับพร้อมค่าครอป · ปกในไฟล์หนังใช้ภาพที่มี
  const shownCover = m.shownLink ? (m.linked ?? []).find((c) => c.thumb === m.thumb) ?? null : null;
  const linkedView = shownCover ? { path: shownCover.file ?? shownCover.source, geo: shownCover.file ? null : shownCover.geo, name: m.name, folder: null } : undefined;
  return (
    <aside className="detail" aria-label="รายละเอียดไฟล์" data-detail>
      <div className="dhead"><span>รายละเอียดไฟล์</span>
        <button type="button" className="dclose" onClick={p.onClose} aria-label="ปิดแผงรายละเอียด" title="ปิดแผงรายละเอียด ชั้นวางกว้างขึ้น" data-detailclose>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" /></svg>
        </button>
      </div>
      {src && imgOk ? (
        <HoverBig noPop className="dpbig" src={src} name={m.name} view={linkedView}><img className={"dposter" + ((m.coverAspect ?? 0) >= 1 ? " wide" : "")} src={src} alt={"โปสเตอร์ " + m.name} onError={() => setImgOk(false)} /></HoverBig>
      ) : frame.url ? (
        <div data-frame><img className="dposter wide" src={thumbUrl(frame.url) ?? undefined} alt="" /><div className="small" style={{ textAlign: "center", marginTop: 6 }}>ภาพจากหนัง ยังไม่ใช่ปก</div></div>
      ) : (
        <div ref={frame.ref} className="dposter none">
          <svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="#c99aad" strokeWidth="2" aria-hidden="true"><rect x="4" y="3" width="16" height="18" rx="2" /><path d="M8 15l3-3 2 2 3-3 2 2" /></svg>
          ยังไม่มีโปสเตอร์
        </div>
      )}
      {editing ? (
        <RenameBox m={m} onCancel={() => setEditing(false)} onDone={(_, changed) => { setEditing(false); setRenamed(changed); }} />
      ) : (
        <div className="fname">
          <div className="nm"><Hl text={m.name} used="" tail={<span className="ext">.{m.ext}</span>} /></div>
          <button type="button" className={"icon-btn" + (renameBlock ? " off" : "")} aria-label="เปลี่ยนชื่อไฟล์" aria-disabled={!!renameBlock || undefined}
            title={renameBlock ? "เปลี่ยนชื่อไม่ได้ " + renameBlock : "เปลี่ยนชื่อไฟล์"} onClick={startRename}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" aria-hidden="true"><path d="M4 20h4L19 9l-4-4L4 16z" /><path d="M14 6l4 4" /></svg>
          </button>
        </div>
      )}
      {!editing && <div className="fstars"><Stars m={m} /></div>}
      {renamed && !editing && (
        <div className="stat ok" style={{ marginTop: 0, marginBottom: 12 }} role="status" data-renamed>
          <CardIcon kind="done" /><div><b>เปลี่ยนชื่อไฟล์แล้ว</b><Phr>ชื่อในเครื่องเปลี่ยนตามแล้ว แถบนี้หายเองใน 3 วินาที</Phr></div>
        </div>
      )}
      <dl className="kv">
        <dt>File size</dt><dd><span className="nw">{fmtSize(m.size)}</span></dd>
        <dt>Duration</dt><dd><span className="nw">{fmtDuration(m.duration)}</span></dd>
        <dt>Video</dt><dd>{m.video?.replace(" · ", " ") ?? "—"}</dd>{/* คลังที่อ่านก่อน 11 พ.ย. 2569 เก็บแบบมีจุดคั่น */}
        <dt>Audio</dt><dd>{tracks(m.audio, true) || "ไม่มี"}</dd>
        <dt>Subtitle</dt><dd>{tracks(m.subs, false) || "ไม่มี"}</dd>
        <dt>Attachment</dt><dd>{m.images ? `${m.hasCover ? "โปสเตอร์" : "รูป"} ${m.images} รูป` : "ไม่มี"}</dd>
      </dl>
      <StatusCard m={m} reminder={p.reminder} onCheck={p.onCheck} onPoster={() => p.onPoster(m.path)} />
      {(m.pairs?.length ?? 0) > 0 && <PairCard m={m} onEdit={() => p.onAv(m.path)} />}
      {(m.linked?.length ?? 0) > 0 && <LinkCard m={m} onPage={p.onPage} onMerge={p.onMerge} />}
      <div className="actions">
        {m.missing ? (
          <button type="button" className="btn btn-wait" aria-disabled="true" title="หาไฟล์ไม่เจอ ไดรฟ์อาจถอดออกอยู่" onClick={p.onPlay}><PlayIcon />เปิดเล่น</button>
        ) : (
          <button type="button" className="btn btn-main" onClick={p.onPlay}><PlayIcon />เปิดเล่น</button>
        )}
        <button type="button" className={"btn " + (renameBlock ? "btn-wait" : "btn-ghost")} aria-disabled={!!renameBlock || undefined}
          title={renameBlock ? "เปลี่ยนชื่อไม่ได้ " + renameBlock : undefined} onClick={startRename}><IbPencil size={15} />เปลี่ยนชื่อ</button>
        <button type="button" className={"btn " + (m.missing ? "btn-wait" : "btn-ghost")} aria-disabled={m.missing || undefined}
          title={m.missing ? "หาไฟล์ไม่เจอ ไดรฟ์อาจถอดออกอยู่" : undefined} onClick={() => { if (!m.missing) p.onPoster(m.path); }}><IcPoster size={15} />เปลี่ยนโปสเตอร์</button>
        <button type="button" className="btn btn-ghost" onClick={() => p.onCheck({ ids: [m.id] })}><IcCheck size={15} />ตรวจไฟล์</button>
        <button type="button" onClick={() => { if (!m.missing) p.onInfo(); }} className={"btn " + (m.missing ? "btn-wait" : "btn-ghost")} aria-disabled={m.missing || undefined} title={m.missing ? "หาไฟล์ไม่เจอ ไดรฟ์อาจถอดออกอยู่" : undefined}>
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><circle cx="12" cy="12" r="9" /><path d="M12 11v6M12 7.5h.01" /></svg>MediaInfo
        </button>
        <button type="button" className="btn btn-ghost" onClick={p.onReveal}>
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path d="M3 7a2 2 0 012-2h4l2 2h8a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2z" /></svg>เปิดโฟลเดอร์
        </button>
        {!(m.linked?.length) && <LinkPairButton m={m} onPage={p.onPage} />}
        {/* ปุ่มที่ 7 กราฟเสียง คู่กับปุ่มที่ 8 เสียงและซับ (มอคอัปเสียงและซับ *"แผงขวาของชั้นวางเพิ่มปุ่มที่ 8 คู่กับกราฟเสียง"*) */}
        {(() => { const block = m.missing ? "หาไฟล์ไม่เจอ ไดรฟ์อาจถอดออกอยู่" : m.audio.length === 0 ? "ไฟล์นี้ไม่มีแทร็กเสียง" : null; return (
          <button type="button" className={"btn " + (block ? "btn-wait" : "btn-ghost")} aria-disabled={!!block || undefined} title={block ?? undefined}
            onClick={() => { if (!block) p.onGraph(m.path); }} data-shelfgraph>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path d="M3 12h2M7 7v10M11 4v16M15 8v8M19 10v4" /></svg>กราฟเสียง
          </button>); })()}
        <button type="button" className={"btn " + (m.missing ? "btn-wait" : "btn-ghost")} aria-disabled={m.missing || undefined} title={m.missing ? "หาไฟล์ไม่เจอ ไดรฟ์อาจถอดออกอยู่" : undefined}
          onClick={() => { if (!m.missing) p.onAv(m.path); }} data-shelfav>
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path d="M4 21v-7M4 10V3M12 21v-9M12 8V3M20 21v-5M20 12V3M1 14h6M9 8h6M17 16h6" /></svg>เสียงและซับ
        </button>
        {/* ปุ่ม Bitrate (พี่กันสั่ง 10 พ.ย. 2569 "บิตเรต ภาษาอังกฤษ") เปิดหน้าบิตเรตพร้อมไฟล์นี้ ไฟล์มีหลายแทร็กหน้าบิตเรตถามก่อน · ไม่มีวิดีโอก็ดูบิตเรตเสียงได้ (พี่กันสั่ง 10 พ.ย. 2569 "เพิ่ม สามารถกดดูบิตเรตได้จาก ชั้นหนัง หน้าโปรไฟล์") */}
        {(() => { const block = m.missing ? "หาไฟล์ไม่เจอ ไดรฟ์อาจถอดออกอยู่" : null; return (
          <button type="button" className={"btn " + (block ? "btn-wait" : "btn-ghost")} aria-disabled={!!block || undefined} title={block ?? undefined}
            onClick={() => { if (!block) p.onBitrate(m.path); }} data-shelfbitrate>
            <IcBitrate size={15} />Bitrate
          </button>); })()}
      </div>
    </aside>
  );
}

/** ปุ่มจับคู่รูปปก เรื่องที่ยังไม่มีปกจับคู่ · พาไปแถวของเรื่องนี้ในตารางตรวจผล เลือกรูปหรือลากรูปมาวางที่นั่น (มอคอัปทางที่ 3) */
function LinkPairButton({ m, onPage }: { m: Movie; onPage: (pg: Page) => void }) {
  const toast = useToast();
  const block = m.missing ? "หาไฟล์ไม่เจอ ไดรฟ์อาจถอดออกอยู่" : null;
  return (
    <button type="button" className={"btn " + (block ? "btn-wait" : "btn-ghost")} aria-disabled={!!block || undefined} title={block ?? undefined} data-shelflink
      onClick={async () => {
        if (block) return;
        try { await openLinkRow(m.id); onPage("link"); } catch (e) { toast({ kind: "bad", title: "เปิดตารางจับคู่ไม่ได้", detail: String(e) }); }
      }}>
      <IcLink size={15} />จับคู่รูปปก
    </button>
  );
}

/** ค่าที่ใช้ตอนรวมเข้าไฟล์จากสำเนา รูปต้นฉบับหายแล้ว · สำเนาครอปมาแล้ว ใช้ทั้งรูป */
const WHOLE: Geometry = { rotate: 0, flip: false, mode: "original", pad: "#f6dbe5", x: 0, y: 0, w: 1, h: 1 };
const whereAll = (c: LinkedCover) => whereText(c) + (c.appCopy ? " และเก็บสำเนาไว้ในโปรแกรมด้วย" : "");
const whereText = (c: LinkedCover) => c.store === "app" ? "เก็บสำเนาไว้ในโปรแกรม"
  : c.store === "link" ? "จับคู่อย่างเดียว ใช้รูปต้นฉบับ"
  : c.owned ? `คัดลอกไว้ข้างไฟล์หนัง ${baseName(c.file ?? "")}` : `ใช้ไฟล์ ${baseName(c.file ?? "")} ที่อยู่ข้างหนัง`;

/** ที่เก็บปกแบบสั้น บรรทัดเดียวในการ์ด */
const whereShort = (c: LinkedCover) => c.store === "app" ? "เก็บในโปรแกรม" : c.store === "link" ? `ใช้รูป ${baseName(c.source)}` : baseName(c.file ?? c.source);

/** ปกที่จับคู่ไว้ (มอคอัปหน้า 5) · บอกที่มา ไม่ได้อยู่ในไฟล์ ไอคอนใน Windows ไม่เปลี่ยน · ครอปใหม่กับเปลี่ยนรูปพาไปตาราง แก้แล้วยืนยันอีกครั้งถึงเปลี่ยนบนชั้น
    เอาปกออก รูปที่โปรแกรมคัดลอกเองลงถังขยะ (พี่กันตอบตอนทำแผน) · รวมเข้าไฟล์พาไปหน้าใส่โปสเตอร์พร้อมรูปกับค่าครอป · เรื่องที่มีสองปก เลือกปกที่แสดงได้ */
function LinkCard({ m, onPage, onMerge }: { m: Movie; onPage: (pg: Page) => void; onMerge: (path: string, image: PosterStart) => void }) {
  const toast = useToast();
  const linked = m.linked ?? [];
  const c = m.shownLink ?? linked[0];
  const [found, setFound] = useState<{ file: boolean; source: boolean } | null>(null);
  const [ask, setAsk] = useState(false);
  const [busy, setBusy] = useState(false);
  const shownFile = c.file ?? c.source;
  useEffect(() => {
    let live = true;
    pairApi.check([shownFile, c.source]).then(([f, s]) => { if (live) setFound({ file: f, source: s }); }).catch(() => {});
    return () => { live = false; };
  }, [shownFile, c.source]);
  const go = async (crop: boolean) => {
    try { await openLinkRow(m.id, crop); onPage("link"); }
    catch (e) { toast({ kind: "bad", title: "เปิดตารางจับคู่ไม่ได้", detail: String(e) }); }
  };
  const remove = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const r = await linkApi.remove(m.id);
      setReply(r.reply);
      setAsk(false);
      toast({ kind: "ok", title: "เอาปกจับคู่ออกแล้ว", detail: "ไฟล์หนังกับรูปต้นฉบับไม่ถูกแตะ" });
      r.notes.forEach((n) => toast({ kind: "warn", title: "มีไฟล์ที่ไม่ได้ลบ", detail: n }));
    } catch (e) {
      toast({ kind: "bad", title: "เอาปกออกไม่สำเร็จ", detail: String(e) });
    } finally { setBusy(false); }
  };
  const lost = found ? !found.file : false;
  const noSource = found ? !found.source : false;
  const mergeBlock = m.missing ? "หาไฟล์ไม่เจอ ไดรฟ์อาจถอดออกอยู่" : lost && noSource ? "หารูปไม่เจอ ต้องจับคู่ใหม่ก่อน" : null;
  const cropBlock = noSource ? "หารูปต้นฉบับไม่เจอ ครอปใหม่ไม่ได้ กดเปลี่ยนรูปแทน" : null;
  const trash = linked.filter((x) => x.owned && x.store === "beside" && x.file).map((x) => baseName(x.file!));
  const hasApp = linked.some((x) => (x.owned && x.store === "app") || x.appCopy);
  return (
    <div data-link-card style={{ marginBottom: 12 }}>
      <div className="stat info" style={{ marginTop: 0 }}><span style={{ flex: "none", marginTop: 1 }}><IcLink size={16} /></span><div>
        {/* สั้นสองบรรทัด รายละเอียดเต็มอยู่ตอนชี้ (พี่กันทัก 10 พ.ย. 2569 "ต้องเขียนอธิบายเยอะขนาดนี้เลยเหรอ") */}
        <b>{m.shownLink ? "ปกจับคู่ ไม่ได้อยู่ในไฟล์" : "มีปกจับคู่ด้วย ตอนนี้แสดงปกในไฟล์"}</b>
        <div style={{ overflowWrap: "anywhere" }} data-link-where title={`จากรูป ${baseName(c.source)}${c.cropped ? " และครอปแล้ว" : ""}
${whereAll(c)}
ไอคอนไฟล์ใน Windows ไม่เปลี่ยน เพราะ Icaros อ่านปกจากในไฟล์`}>{whereShort(c)}</div>
      </div></div>
      {lost && (
        <div className="stat warn" style={{ marginTop: 8 }} data-link-lost><CardIcon kind="warn" /><div><b>หารูปไม่เจอ</b><Phr>รูปถูกย้ายหรือลบไปแล้ว ปกที่เห็นเป็นภาพเล็กที่โปรแกรมจำไว้ กดเปลี่ยนรูปเพื่อจับคู่ใหม่</Phr></div></div>
      )}
      {m.fileCover && (
        <div className="setrow" style={{ borderTop: 0, padding: "8px 0 4px" }} data-link-pick>
          <div className="lbl" style={{ fontSize: 13.5 }}>ปกที่แสดง</div>
          <Seg small label="ปกที่แสดง" value={m.coverPick === "file" ? "file" : "linked"} onChange={(v) => { linkApi.coverPick(m.id, v).catch((e) => toast({ kind: "bad", title: "เปลี่ยนปกที่แสดงไม่ได้", detail: String(e) })); }}
            options={[{ value: "linked", label: <><IcLink size={14} />ปกจับคู่</> }, { value: "file", label: <><IcPoster size={14} />ปกในไฟล์</> }]} />
        </div>
      )}
      <div className="actions" style={{ marginTop: 8 }}>
        <button type="button" className={"btn btn-sm " + (cropBlock ? "btn-wait" : "btn-ghost")} aria-disabled={!!cropBlock || undefined} title={cropBlock ?? undefined} data-link-recrop onClick={() => { if (!cropBlock) void go(true); }}><IbCrop size={15} />ครอปใหม่</button>
        <button type="button" className="btn btn-ghost btn-sm" data-link-rechange onClick={() => void go(false)}><IcPoster size={15} />เปลี่ยนรูป</button>
        <button type="button" className="btn btn-ghost btn-sm" data-link-remove onClick={() => setAsk(true)}><IbTrash size={15} />เอาปกออก</button>
        <button type="button" className={"btn btn-sm " + (mergeBlock ? "btn-wait" : "btn-main")} aria-disabled={!!mergeBlock || undefined} title={mergeBlock ?? undefined} data-link-merge
          onClick={() => { if (!mergeBlock) onMerge(m.path, noSource ? { path: shownFile, geo: WHOLE } : { path: c.source, geo: c.geo ?? WHOLE }); }}><IcMix size={15} />รวมเข้าไฟล์</button>
      </div>
      <Dialog open={ask} onClose={() => { if (!busy) setAsk(false); }} kind="work" confirm title={<>เอาปกจับคู่ของ {m.name} ออก</>}
        actions={<>
          <button type="button" className="btn btn-ghost" onClick={() => { if (!busy) setAsk(false); }}>ไม่เอาออก</button>
          <button type="button" className={"btn " + (busy ? "btn-wait" : "btn-bad")} aria-disabled={busy || undefined} data-link-remove-ok onClick={remove}><Keep icon={<IbTrash size={15} />} all={["กำลังเอาออก…", "เอาปกออก"]}>{busy ? "กำลังเอาออก…" : "เอาปกออก"}</Keep></button>
        </>}>
        <div className="small" style={{ fontSize: 14, color: "var(--txt2)" }}>
          {trash.length > 0 && <div style={{ overflowWrap: "anywhere" }}>รูปที่โปรแกรมคัดลอกไว้ {trash.join(", ")} ย้ายลงถังขยะแล้ว กู้คืนได้</div>}
          {hasApp && <div>สำเนาในโปรแกรมย้ายลงถังขยะ กู้คืนได้</div>}
          <div>รูปต้นฉบับและไฟล์หนังไม่ถูกแตะ ส่วนไฟล์ที่โปรแกรมไม่ได้สร้างจะไม่ถูกลบ</div>
        </div>
      </Dialog>
    </div>
  );
}

/** เสียงกับซับที่จับคู่ไว้ ไม่รวม (มอคอัปหัวข้อ 5) · บอกว่าเจอไฟล์ไหม · เปิดเล่นพร้อมไฟล์ที่จับคู่ · ไฟล์หาไม่เจอ หาไฟล์ใหม่หรือเอาออกจากคู่ */
function PairCard({ m, onEdit }: { m: Movie; onEdit: () => void }) {
  const pairs = m.pairs ?? [];
  const [found, setFound] = useState<boolean[] | null>(null);
  const [res, setRes] = useState<{ ok?: PairPlay; err?: string } | null>(null);
  const key = pairs.map((x) => x.path).join("|");
  // เช็กใหม่ทุกครั้งที่กลับมาหน้าชั้นวาง และตอนกลับมาที่หน้าต่างโปรแกรม · ชุด 2 เก็บหน้าไว้ไม่ถอดทิ้ง ผลเช็กเลยค้างค่าเก่า
  // ย้ายไฟล์ที่จับคู่ออกแล้วการ์ดยังบอกเจอไฟล์ (เจอตอนรัน check-av 11 พ.ย. 2569) · ผลเดิมแสดงไว้ระหว่างเช็ก ไม่ขึ้นโครงจางซ้ำ
  const active = usePageActive();
  const [focusTick, setFocusTick] = useState(0);
  useEffect(() => { const f = () => setFocusTick((n) => n + 1); window.addEventListener("focus", f); return () => window.removeEventListener("focus", f); }, []);
  useEffect(() => { setFound(null); }, [key]);
  useEffect(() => { if (!active) return; let live = true; pairApi.check(pairs.map((x) => x.path)).then((f) => { if (live) setFound(f); }, () => {}); return () => { live = false; }; }, [key, active, focusTick]); // eslint-disable-line react-hooks/exhaustive-deps
  const save = (next: Pair[]) => pairApi.set(m.path, next).catch((e) => setRes({ err: String(e) }));
  const relink = async (i: number) => {
    const f = await pickAddFiles();
    if (f[0]) save(pairs.map((x, j) => (j === i ? { ...x, path: f[0] } : x)));
  };
  const label = (x: Pair) => [x.kind === "audio" ? `เสียง${x.lang ? " " + langName(x.lang) : ""}` : `ซับ${x.lang ? langName(x.lang) : ""}`, x.name, x.delay ? `ดีเลย์ ${x.delay > 0 ? "+" : "−"}${Math.abs(x.delay).toLocaleString("en-US")} ms` : ""].filter(Boolean).join(", ");
  const missing = found ? found.filter((f) => !f).length : 0;
  return (
    <div className="paircard" data-pairs>
      <b>จับคู่ไว้ {pairs.length} ไฟล์</b>
      {pairs.map((x, i) => (
        <div key={i} className="pair" data-pair={i}>
          <span className={"kind " + (x.kind === "audio" ? "a" : "s")} aria-hidden="true">{x.kind === "audio"
            ? <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2"><path d="M4 10v4M8 7v10M12 4v16M16 8v8M20 10v4" /></svg>
            : <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2"><rect x="3" y="5" width="18" height="14" rx="2" /><path d="M7 14h4M13 14h4M7 10h10" /></svg>}</span>
          <div style={{ minWidth: 0 }}><div>{label(x)}</div><div className="p">{x.path}</div>
            {found && !found[i] && <div style={{ display: "flex", gap: 6, marginTop: 4 }}>
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => relink(i)}><IcSearch size={15} />หาไฟล์ใหม่</button>
              <button type="button" className="btn btn-bad btn-sm" onClick={() => save(pairs.filter((_, j) => j !== i))} data-pair-drop><IbTrash size={15} />เอาออกจากคู่</button></div>}</div>
          {found ? <span className={"tpill " + (found[i] ? "ok" : "warn")}>{found[i] ? "เจอไฟล์" : "หาไม่เจอ"}</span> : <Skel w={56} h={18} r={9} />}
        </div>
      ))}
      {missing > 0 && <div className="stat warn" data-pair-missing><CardIcon kind="warn" /><div><b>{`หาไฟล์ที่จับคู่ไม่เจอ ${missing} ไฟล์`}</b><Phr>ไดรฟ์อาจถอดออกอยู่หรือไฟล์ถูกย้าย แต่ยังเปิดเล่นพร้อมไฟล์ที่เหลือได้</Phr></div></div>}
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
        <button type="button" className={"btn btn-sm " + (m.missing ? "btn-wait" : "btn-main")} aria-disabled={m.missing || undefined} title={m.missing ? "หาไฟล์หนังไม่เจอ" : undefined}
          onClick={() => { if (m.missing) return; setRes(null); pairApi.play(m.path, (window as unknown as { __pairDry?: boolean }).__pairDry).then((ok) => setRes({ ok }), (e) => setRes({ err: String(e) })); }} data-pair-play><IbPlay size={15} />เปิดเล่นพร้อมเสียงและซับที่จับคู่</button>
        <button type="button" className="btn btn-ghost btn-sm" onClick={onEdit} title="เปิดหน้าเสียงและซับ ลากไฟล์ใหม่แล้วกดจับคู่อีกครั้ง แทนชุดเดิม"><IcLink size={15} />แก้การจับคู่</button>
      </div>
      {res?.ok && <div className="small" data-pair-res data-cmd={res.ok.cmd}><Phr>{res.ok.opened ? `เปิดด้วย ${res.ok.player || "โปรแกรมหลักของ Windows"} และส่งไฟล์ที่จับคู่ ${res.ok.sent} ไฟล์` : `รุ่นทดสอบไม่เปิดโปรแกรมเล่น ถ้าเปิดจริงจะส่งไฟล์ที่จับคู่ ${res.ok.sent} ไฟล์ให้ ${res.ok.player || "โปรแกรมหลักของ Windows"}`}</Phr></div>}
      {/* ไฟล์ที่หาไม่เจอการ์ดบอกอยู่แล้วข้างบน ไม่บอกซ้ำ */}
      {res?.ok?.notes.filter((n) => !n.includes("ที่จับคู่ไม่เจอ")).map((n, i) => <div key={i} className="stat warn" data-pair-note><CardIcon kind="warn" /><div><Phr>{n}</Phr></div></div>)}
      {res?.err && <div className="stat bad"><CardIcon kind="bad" /><div><b>เปิดเล่นไม่ได้</b><Phr>{res.err}</Phr></div></div>}
      <div className="small"><Phr>ปุ่มเปิดเล่นเดิมยังเปิดเฉพาะไฟล์หนัง และจุดเล็กที่มุมปกบนชั้นบอกว่าเรื่องนี้จับคู่ไว้</Phr></div>
    </div>
  );
}

/** การ์ดสถานะในแผงรายละเอียด ตามสภาพของไฟล์ (สเปกข้อ 1 การ์ดสถานะแบบอื่น) */
function StatusCard({ m, reminder, onCheck, onPoster }: { m: Movie; reminder: number; onCheck: (r: CheckReq) => void; onPoster: () => void }) {
  if (m.missing) {
    return <div className="stat bad"><CardIcon kind="bad" /><div><b>หาไฟล์ไม่เจอ</b><Phr>{"ไดรฟ์อาจถอดออกอยู่  ให้เสียบไดรฟ์แล้วกดอ่านโฟลเดอร์ใหม่"}</Phr></div></div>;
  }
  if (m.error) {
    return <div className="stat warn"><CardIcon kind="warn" /><div><b>อ่านข้อมูลไฟล์ไม่ได้</b>{m.error}</div></div>;
  }
  const k = kindOf(m, reminder);
  if (k === "bad") {
    const span = m.check?.spans?.[0];
    return (
      <>
        <div className="stat bad"><CardIcon kind="bad" /><div><b>ไฟล์เสียหาย</b><Phr>{`${m.check?.summary ?? (span ? "พบที่เสียในไฟล์" : "ตรวจแล้วพบที่เสีย")}  ไฟล์น่าจะโหลดมาไม่ครบ ควรโหลดใหม่`}</Phr></div></div>
        <div className="minirow half" style={{ marginTop: -4 }}>
          <button type="button" className="btn btn-ghost" onClick={() => onCheck({ ids: [m.id], open: m.id })}><IcCheck size={15} />ดูผลตรวจ</button>
          <button type="button" className="btn btn-ghost" onClick={() => onCheck({ ids: [m.id], mode: "full" })}><IcCheck size={15} />ตรวจซ้ำ</button>
        </div>
      </>
    );
  }
  if (k === "info") {
    return (
      <>
        <div className="stat info"><CardIcon kind="info" /><div><b>ยังไม่ได้ครอบเป็น MKV</b><Phr>{`ไฟล์นี้เป็น ${m.ext.toUpperCase()} ครอบ${J}เป็น MKV ก่อนแล้วจึงใส่โปสเตอร์ได้  ภาพและเสียงไม่ถูก${J}แปลง คุณภาพเท่าเดิม`}</Phr></div></div>
        <div className="minirow half" style={{ marginTop: -4 }}><button type="button" className="btn btn-main wide" onClick={onPoster}><IcPoster size={15} />ครอบเป็น MKV พร้อมโปสเตอร์</button></div>
      </>
    );
  }
  if (k === "warn") {
    const title = m.status === "changed" ? "ไฟล์ถูกเปลี่ยนตั้งแต่ตรวจครั้งก่อน" : m.status === "unchecked" ? "ยังไม่เคยตรวจไฟล์นี้" : "ถึงเวลาตรวจซ้ำ";
    return (
      <>
        {/* กดการ์ดแล้วไปหน้าตรวจไฟล์พร้อมเลือกเรื่องนี้ (พี่กันสั่ง 9 พ.ย. 2569 "ใส่การ์ด ที่กดเเล้วไปหน้าตรวจเลย") */}
        <button type="button" className="stat warn statgo" title="ไปหน้าตรวจไฟล์" data-statgo onClick={() => onCheck({ ids: [m.id] })}><CardIcon kind="warn" /><div><b>{title}</b></div><IbNext size={15} /></button>
        <div className="minirow half" style={{ marginTop: -4 }}>
          <button type="button" className="btn btn-ok" onClick={() => onCheck({ ids: [m.id], mode: "quick" })}><IcCheck size={15} />ตรวจแบบเร็ว</button>
          <button type="button" className="btn btn-ghost" onClick={() => onCheck({ ids: [m.id], mode: "full" })}><IcCheck size={15} />ตรวจละเอียด</button>
        </div>
      </>
    );
  }
  return (
    <div className="stat ok"><CardIcon kind="ok" /><div><b>ไฟล์สมบูรณ์</b>
      {m.check ? <>{m.check.mode === "full" ? "ตรวจละเอียด" : "ตรวจแบบเร็ว"}เมื่อ <span className="nw">{fmtDateTime(m.check.at)}</span><br /></> : null}
      {m.check?.mode === "full" ? "ไม่พบภาพหรือเสียงเสีย" : "โครงไฟล์ครบ ค่า hash ตรงกับที่จดไว้"}
    </div></div>
  );
}

const RefreshIcon = () => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" aria-hidden="true"><path d="M4 4v6h6M20 20v-6h-6" /><path d="M20 10a8 8 0 00-14-4L4 10M4 14a8 8 0 0014 4l2-4" /></svg>;
const PlayIcon = () => <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M7 4.5v15l12-7.5z" /></svg>;
const GridIcon = () => <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" aria-hidden="true"><rect x="4" y="4" width="6" height="7" rx="1" /><rect x="14" y="4" width="6" height="7" rx="1" /><rect x="4" y="14" width="6" height="7" rx="1" /><rect x="14" y="14" width="6" height="7" rx="1" /></svg>;
const ListIcon = () => <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" aria-hidden="true"><path d="M9 6h11M9 12h11M9 18h11" /><rect x="3.5" y="4.5" width="3" height="3" rx=".6" /><rect x="3.5" y="10.5" width="3" height="3" rx=".6" /><rect x="3.5" y="16.5" width="3" height="3" rx=".6" /></svg>;
