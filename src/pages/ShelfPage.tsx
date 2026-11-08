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
import { Badge, CardIcon, Phr, Phrases, Seg, Skel, SortArrow, Switch } from "../components/ui";
import Dialog from "../components/Dialog";
import { IcLink, IcCoverL, IcCoverM, IcCoverS, IcTall, IcWide } from "../components/icons";
import { openLinkRow, setLinkJob, setReply, useLinkJob } from "../lib/linkJob";
import type { PosterStart } from "./PosterPage";
import { useToast } from "../components/Toasts";
import { api, linkApi, thumbUrl, type Geometry, type LinkedCover, type Movie, pairApi, pickAddFiles, type Pair, type PairPlay } from "../lib/api";
import { langName } from "../lib/langs";
import { useLibrary } from "../lib/library";
import { useSettings } from "../lib/settings";
import { searchByName, highlightParts } from "../lib/thaiSearch";
import { fmtDateTime, fmtDuration, fmtSize } from "../lib/format";
import { kindOf, KIND_ORDER, SHELF_LABEL, TABLE_LABEL, quickEstimate, fullEstimate, type Kind } from "../lib/status";
import { dropStyle, useDropPlacement } from "../lib/popupFit";
import { useClickOutside, useEscClose, kb } from "../lib/popup";
import { useSkelPreview } from "../lib/skelPreview";
import HoverBig from "../components/HoverBig";
import { IcSearch, IbTrash, IbNext, IcRefresh, IcCheck, IbPencil, IcMix, IcClose, IbEye, IbPlay, IcPoster, IbCrop, IcSettings } from "../components/icons";

const SORTS = [
  { value: "name-asc", label: "ชื่อ ก–ฮ" },
  { value: "name-desc", label: "ชื่อ ฮ–ก" },
  { value: "year", label: "ปีที่ออกฉาย ใหม่ไปเก่า" },
  { value: "added", label: "เพิ่มเข้าชั้นล่าสุด" },
  { value: "size", label: "ขนาดไฟล์ ใหญ่ไปเล็ก" },
  { value: "status", label: "สภาพไฟล์ ที่เสียขึ้นก่อน" },
];
const SIZES = { s: { w: 100, gap: 14 }, m: { w: 140, gap: 18 }, l: { w: 180, gap: 20 } } as const;
const byName = (a: Movie, b: Movie) => a.name.localeCompare(b.name, "th");
const baseName = (p: string) => p.split(/[\\/]/).pop() ?? p;

/** ตัวกรองที่มาของปก (พี่กันเคาะ *"ชั้นวางกรองได้ว่าเรื่องไหนปกมาจากการรวม เรื่องไหนจับคู่"*) · จำไว้ระหว่างเปลี่ยนหน้า ปิดโปรแกรมกลับเป็นทั้งหมด จะได้ไม่งงว่าหนังหาย */
type CoverFilter = "all" | "file" | "linked" | "none";
let filterMemo: CoverFilter = "all";
/** นับตามปกที่กำลังแสดง เรื่องหนึ่งอยู่หมวดเดียว ยอดสามหมวดรวมกันเท่าทั้งหมด */
const coverFrom = (m: Movie): Exclude<CoverFilter, "all"> => (m.shownLink ? "linked" : m.thumb ? "file" : "none");
const LinkMark = () => <span className="linkb" title="ปกจับคู่ไว้ ไม่ได้อยู่ในไฟล์" data-linkb><IcLink size={13} stroke="#b0355f" /></span>;

export function sortMovies(list: Movie[], key: string, reminder: number): Movie[] {
  const l = list.slice();
  switch (key) {
    case "name-desc": return l.sort((a, b) => byName(b, a));
    case "year": return l.sort((a, b) => (b.year ?? -1) - (a.year ?? -1) || byName(a, b));
    case "added": return l.sort((a, b) => b.added - a.added || byName(a, b));
    case "size": return l.sort((a, b) => b.size - a.size || byName(a, b));
    case "status": return l.sort((a, b) => KIND_ORDER[kindOf(a, reminder)] - KIND_ORDER[kindOf(b, reminder)] || byName(a, b));
    default: return l.sort(byName);
  }
}

const tracks = (t: Movie["audio"], withLayout: boolean) =>
  t.map((x) => [x.lang, x.codec, withLayout ? x.layout : null].filter(Boolean).join(" ")).join(" · ");

/** ชื่อหนังพร้อมไฮไลต์คำที่ค้น · ตัดบรรทัดตรงเว้นวรรค (ui.tsx Phrases) · tail ต่อท้ายวลีสุดท้ายไม่แยกบรรทัด */
function Hl({ text, used, head, tail }: { text: string; used: string; head?: React.ReactNode; tail?: React.ReactNode }) {
  return <Phrases parts={highlightParts(text, used).map((p) => ({ text: p.text, hit: p.hit }))} head={head} tail={tail} />;
}

/** sel เก็บที่ตัวโปรแกรม (App) ไม่ใช่ในหน้านี้ · ไปหน้าข้อมูลไฟล์หรือใส่โปสเตอร์แล้วกลับมา ต้องยังเลือกเรื่องเดิมอยู่ */
export default function ShelfPage({ onPage, onPoster, onMerge, onInfo, onCheck, onGraph, onAv, sel, setSel }: { onPage: (p: Page) => void; onPoster: (path: string) => void; onMerge: (path: string, image: PosterStart) => void; onInfo: (id: string) => void; onCheck: (r: CheckReq) => void; onGraph: (path: string) => void; onAv: (path: string) => void; sel: string | null; setSel: (id: string | null) => void }) {
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
  const counts = useMemo(() => {
    const c = { all: covered.length, file: 0, linked: 0, none: 0 };
    for (const m of covered) c[coverFrom(m)]++;
    return c;
  }, [covered]);
  const list = useMemo(() => (filter === "all" ? covered : covered.filter((m) => coverFrom(m) === filter)), [covered, filter]);
  const linkJob = useLinkJob();
  const resume = linkJob.resume ? linkJob.reply.waiting : 0;
  // แผงขวาขึ้นเฉพาะตอนกดเลือกเรื่อง ปิดได้ ชั้นวางกว้างขึ้น (พี่กัน 7 พ.ย. 2569 *"แถบนี้ เราอยากให้มันขึ้นตอนที่กดหนังนั้นๆ เเละมีปุ่มปิดได้ เราอยากห้มันเเสดงชั้นวางมากกว่า"*)
  // เดิมไม่ได้เลือกก็ขึ้นเรื่องแรกค้างไว้ตลอด
  const selected = list.find((m) => m.id === sel) ?? null;

  const missingFolders = folders.filter((f) => !f.ok);
  const pathText = settings?.folders.length
    ? settings.folders[0] + (settings.folders.length > 1 ? ` และอีก ${settings.folders.length - 1} โฟลเดอร์` : "")
    : "";


  return (
    <>
      <div className="topbar">
        <div className="path" title={settings?.folders.join("\n")}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path d="M3 7a2 2 0 012-2h4l2 2h8a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2z" /></svg>
          <span>{pathText}</span>
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
              <button key={v} type="button" role="tab" aria-selected={filter === v} className={filter === v ? "on" : ""} data-shelf-tab={v} onClick={() => setFilter(v)}>{label} {counts[v]}</button>
            ))}
          </div>
        ) : <div />}
        <Seg small label="มุมมอง" value={view} onChange={(v) => update({ viewMode: v })} options={[
          { value: "grid", label: <><GridIcon />ภาพปก</> },
          { value: "table", label: <><ListIcon />ตาราง</> },
        ]} />
        <Seg small label="ขนาดปก" value={size} onChange={(v) => update({ coverSize: v })}
          disabledReason={view === "table" ? "ขนาดปกใช้ได้ตอนดูแบบภาพปก" : undefined}
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
                  <button type="button" className="btn btn-ghost btn-sm" data-link-resume-later onClick={() => setLinkJob({ resume: false })}>ไว้ทีหลัง</button>
                </div>
              </div>
            </div>
          )}
          {scanning && (
            <div className="hint" style={{ marginTop: 2 }}>
              กำลังอ่าน {pathText} · ปกขึ้นทีละเรื่องเมื่ออ่านเสร็จ
              {progress && progress.total > 0 && <> · อ่านแล้ว <span className="nw">{progress.done} จาก {progress.total} เรื่อง</span></>}
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
              showNames={settings?.showNames ?? true} showDots={settings?.showDots ?? true}
              pending={scanning && !query && progress ? Math.max(0, progress.total - movies.length) : 0} />
          ) : (
            <ShelfTable list={list} selId={selected?.id ?? null} onSel={(id) => setSel(selected?.id === id ? null : id)} used={found.used} reminder={reminder} />
          )}
        </div>
        {/* key ต่อเรื่อง สลับเรื่องแล้วสร้างแผงกับปุ่มใหม่ ไม่ใช้ปุ่มเดิมซ้ำ (เดิมปุ่มชมพูค่อย ๆ เปลี่ยนเป็นเขียวตอนสลับเรื่อง) */}
        {selected && (
          <Detail key={selected.id} m={selected} scanning={scanning} reminder={reminder} onPage={onPage} onCheck={onCheck} onGraph={onGraph} onAv={onAv} onPoster={onPoster} onMerge={onMerge} onInfo={() => onInfo(selected.id)} onClose={() => setSel(null)}
            onPlay={() => api.playMovie(selected.path).catch((e) => {
              toast({ kind: "bad", title: "เปิดเล่นไม่ได้", detail: String(e) });
              // โปรแกรมเล่นที่เลือกเองหาไม่เจอ พากลับไปตั้งที่หน้าตั้งค่า (สเปกข้อ 9 *"หาไม่เจอวันหลัง กดเปิดเล่นแล้วบอก และพากลับมาตั้ง"*)
              if (String(e).includes("หาโปรแกรมเล่นหนัง")) onPage("settings");
            })}
            onReveal={() => api.revealMovie(selected.path).catch((e) => toast({ kind: "bad", title: "เปิดโฟลเดอร์ไม่ได้", detail: String(e) }))} />
        )}
      </div>
      {/* แถบสถานะล่างแบบโปรแกรม บอกจำนวนเรื่องกับความหมายจุดสี ไม่กินที่ด้านบน */}
      <div className="statusbar" data-statusbar>
        <span>{query || filter !== "all" ? <>เจอ {list.length} จาก <span className="nw">{movies.length} เรื่อง</span></> : <>หนังทั้งหมด <span className="nw">{movies.length} เรื่อง</span></>}</span>
        {settings?.showDots && view === "grid" && list.length > 0 && (
          <div className="legend">
            {(["ok", "warn", "bad", "info"] as Kind[]).map((k) => <span key={k}><i style={{ background: `var(--${k})` }} />{SHELF_LABEL[k]}</span>)}
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
  useEscClose(open, () => setOpen(false));
  useClickOutside(open, wrap, () => setOpen(false));
  return (
    <div ref={wrap} style={{ position: "relative" }}>
      <button type="button" className={"btn btn-ghost btn-sm" + (open ? " pressed" : "")} title="การแสดงผล" aria-label="การแสดงผล" style={{ width: 32, padding: 0, flex: "none" }} aria-haspopup="true" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" aria-hidden="true"><path d="M4 7h10M18 7h2M4 17h4M12 17h8" /><circle cx="16" cy="7" r="2" /><circle cx="10" cy="17" r="2" /></svg>
      </button>
      {open && settings && (
        <div ref={panel} className="menu pop-in" role="dialog" aria-label="การแสดงผล"
          style={{ position: "absolute", right: 0, width: 250, padding: "6px 14px", zIndex: "var(--z-menu)" as unknown as number, ...dropStyle(place) }}>
          <div className="setrow" style={{ borderTop: 0 }}><div className="lbl">ชื่อไฟล์ใต้ปก</div><Switch on={settings.showNames} onChange={(v) => update({ showNames: v })} label="ชื่อไฟล์ใต้ปก" /></div>
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
    const ro = new ResizeObserver(() => setW(el.clientWidth));
    ro.observe(el);
    setW(el.clientWidth);
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
function ShelfGrid(p: { list: Movie[]; size: "s" | "m" | "l"; selId: string | null; onSel: (id: string) => void; used: string; reminder: number; showNames: boolean; showDots: boolean; pending: number }) {
  const { ref, w, perRow } = usePerRow(p.size);
  const { w: base, gap } = SIZES[p.size];
  const skel = Math.min(p.pending, ((perRow - (p.list.length % perRow)) % perRow) + perRow);
  const items: (Movie | null)[] = skel ? [...p.list, ...Array<null>(skel).fill(null)] : p.list;
  // ขยายปกให้เต็มแถว ไม่เหลือที่ว่างขวา · ปกตั้งได้ความกว้างพอดีจำนวนต่อแถว · ปกนอนขยายตามแถวแรกอีกชั้น · แถวที่ยังเหลือเศษกระจายระยะห่าง แถวสุดท้ายชิดซ้ายให้ตรงคอลัมน์
  let bw = Math.max(base, (w - (perRow - 1) * gap) / perRow);
  let rows = packRows(items, w, bw, gap);
  if (rows.length > 1) {
    const room = w - (rows[0].length - 1) * gap, used = rows[0].reduce((n, m) => n + bookWidth(m, bw), 0);
    if (used > 0 && room / used > 1.002) { bw = bw * (room / used); rows = packRows(items, w, bw, gap); }
  }
  return (
    <div ref={ref} className={"size-" + p.size} data-shelf style={{ "--bw": `${bw}px` } as React.CSSProperties}>
      {rows.map((row, i) => (
        <div key={i} className="shelf" style={i < rows.length - 1 ? { justifyContent: "space-between" } : undefined}>
          {row.map((m, j) => m
            ? <Book key={m.id} m={m} width={bookWidth(m, bw)} sel={m.id === p.selId} onSel={p.onSel} used={p.used} reminder={p.reminder} showNames={p.showNames} showDots={p.showDots} />
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

function Book(p: { m: Movie; width: number; sel: boolean; onSel: (id: string) => void; used: string; reminder: number; showNames: boolean; showDots: boolean }) {
  const { m } = p;
  const k = kindOf(m, p.reminder);
  const src = thumbUrl(m.thumb);
  const full = m.name + (m.ext === "mkv" ? "" : "." + m.ext);
  const wide = src != null && (m.coverAspect ?? 0) >= 1;
  return (
    <div
      className={"book" + (wide ? " wide" : "") + (p.sel ? " sel" : "") + (m.missing ? " missing" : "")}
      style={wide ? { width: p.width } : undefined}
      title={[p.showNames ? "" : full, m.missing ? "หาไฟล์ไม่เจอ ไดรฟ์อาจถอดออกอยู่" : ""].filter(Boolean).join("\n") || undefined}
      aria-label={full + " · " + SHELF_LABEL[k] + (m.shownLink ? " · ปกจับคู่" : "") + (m.missing ? " · หาไฟล์ไม่เจอ" : "")}
      aria-pressed={p.sel}
      data-movie={m.name}
      {...kb(() => p.onSel(m.id))}
    >
      {(m.pairs?.length ?? 0) > 0 && <span className="pairdot" title="จับคู่เสียงหรือซับไว้" aria-label="จับคู่เสียงหรือซับไว้" data-pairdot />}
      {src ? (
        <div className="cover has-img"><img src={src} alt="" loading="lazy" draggable={false} /></div>
      ) : (
        <div className="cover none">
          <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="#c99aad" strokeWidth="2" aria-hidden="true"><rect x="4" y="3" width="16" height="18" rx="2" /><path d="M8 15l3-3 2 2 3-3 2 2" /></svg>
          ยังไม่มีโปสเตอร์
        </div>
      )}
      {(p.showNames || p.showDots || m.shownLink) && (
        <div className="bname" style={p.showNames ? undefined : { minHeight: 0 }}>
          {p.showNames
            ? <><Hl text={m.name} used={p.used} head={<>{p.showDots && <Badge kind={k} title={SHELF_LABEL[k]} />}{m.shownLink && <LinkMark />}</>} />{m.ext !== "mkv" && <> <span className="ext">.{m.ext}</span></>}</>
            : <><Badge kind={k} title={SHELF_LABEL[k]} />{m.shownLink && <LinkMark />}</>}
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
type Col = "name" | "size" | "video" | "audio" | "status";
function ShelfTable(p: { list: Movie[]; selId: string | null; onSel: (id: string) => void; used: string; reminder: number }) {
  const [sort, setSort] = useState<{ col: Col; dir: 1 | -1 } | null>(null);
  const rows = useMemo(() => {
    if (!sort) return p.list;
    const key = (m: Movie): string | number => ({
      name: m.name, size: m.size, video: m.videoShort ?? "", audio: tracks(m.audio, true), status: KIND_ORDER[kindOf(m, p.reminder)],
    })[sort.col];
    return p.list.slice().sort((a, b) => {
      const x = key(a), y = key(b);
      const c = typeof x === "number" && typeof y === "number" ? x - y : String(x).localeCompare(String(y), "th");
      return c * sort.dir || byName(a, b);
    });
  }, [p.list, sort, p.reminder]);
  const head = (col: Col, label: string, w?: number) => {
    const on = sort?.col === col;
    return (
      <th style={w ? { width: w } : undefined} aria-sort={on ? (sort!.dir === 1 ? "ascending" : "descending") : "none"}>
        <button type="button" className="thsort" onClick={() => setSort(on ? { col, dir: sort!.dir === 1 ? -1 : 1 } : { col, dir: col === "size" ? -1 : 1 })}>
          {label}
          <SortArrow dir={on ? sort!.dir : 0} />
        </button>
      </th>
    );
  };
  return (
    <div className="tblwrap" data-table>
      <table className="lv">
        <thead><tr>
          <th style={{ width: 50, textAlign: "center" }}>ปก</th>{head("name", "ชื่อไฟล์")}{head("size", "ขนาด", 80)}{head("video", "Video", 120)}{head("audio", "Audio", 150)}{head("status", "สภาพไฟล์", 120)}
        </tr></thead>
        <tbody>
          {rows.map((m) => {
            const k = kindOf(m, p.reminder);
            const src = thumbUrl(m.thumb);
            return (
              <tr key={m.id} className={(m.id === p.selId ? "sel" : "") + (m.missing ? " missing" : "")} {...kb(() => p.onSel(m.id))} aria-selected={m.id === p.selId}>
                <td>{src ? <img className={"th" + ((m.coverAspect ?? 0) >= 1 ? " wide" : "")} src={src} alt="" loading="lazy" /> : <span className="th none" />}</td>
                <td><Hl text={m.name + "." + m.ext} used={p.used} head={m.shownLink ? <LinkMark /> : undefined} /></td>
                <td><span className="nw">{fmtSize(m.size)}</span></td>
                <td>{m.videoShort ?? "—"}</td>
                <td>{m.audio.map((a) => [a.codec, a.layout].filter(Boolean).join(" ")).join(" · ") || "—"}</td>
                <td style={{ whiteSpace: "nowrap" }}><span className="dot" style={{ background: `var(--${k})` }} />{TABLE_LABEL[k]}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

/* ---------- แผงรายละเอียด (ต้นแบบบรรทัด 388–426) ---------- */
function Detail(p: { m: Movie; scanning: boolean; reminder: number; onPage: (pg: Page) => void; onCheck: (r: CheckReq) => void; onGraph: (path: string) => void; onAv: (path: string) => void; onPoster: (path: string) => void; onMerge: (path: string, image: PosterStart) => void; onInfo: () => void; onPlay: () => void; onReveal: () => void; onClose: () => void }) {
  const { m } = p;
  const src = thumbUrl(m.thumb);
  const [imgOk, setImgOk] = useState(true);
  useEffect(() => setImgOk(true), [src]);
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
      ) : (
        <div className="dposter none">
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
            title={renameBlock ? "เปลี่ยนชื่อไม่ได้ · " + renameBlock : "เปลี่ยนชื่อไฟล์"} onClick={startRename}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" aria-hidden="true"><path d="M4 20h4L19 9l-4-4L4 16z" /><path d="M14 6l4 4" /></svg>
          </button>
        </div>
      )}
      {renamed && !editing && (
        <div className="stat ok" style={{ marginTop: 0, marginBottom: 12 }} role="status" data-renamed>
          <CardIcon kind="done" /><div><b>เปลี่ยนชื่อไฟล์แล้ว</b><Phr>ชื่อในเครื่องเปลี่ยนตามแล้ว แถบนี้หายเองใน 3 วินาที</Phr></div>
        </div>
      )}
      <dl className="kv">
        <dt>ขนาดไฟล์</dt><dd><span className="nw">{fmtSize(m.size)}</span></dd>
        <dt>ความยาว</dt><dd><span className="nw">{fmtDuration(m.duration)}</span></dd>
        <dt>ภาพ</dt><dd>{m.video ?? "—"}</dd>
        <dt>เสียง</dt><dd>{tracks(m.audio, true) || "ไม่มี"}</dd>
        <dt>ซับไตเติล</dt><dd>{tracks(m.subs, false) || "ไม่มี"}</dd>
        <dt>ไฟล์แนบ</dt><dd>{m.images ? `${m.hasCover ? "โปสเตอร์" : "รูป"} ${m.images} รูป` : "ไม่มี"}</dd>
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
          title={renameBlock ? "เปลี่ยนชื่อไม่ได้ · " + renameBlock : undefined} onClick={startRename}><IbPencil size={15} />เปลี่ยนชื่อ</button>
        <button type="button" className={"btn " + (m.missing ? "btn-wait" : "btn-ghost")} aria-disabled={m.missing || undefined}
          title={m.missing ? "หาไฟล์ไม่เจอ ไดรฟ์อาจถอดออกอยู่" : undefined} onClick={() => { if (!m.missing) p.onPoster(m.path); }}><IcPoster size={15} />เปลี่ยนโปสเตอร์</button>
        <button type="button" className="btn btn-ghost" onClick={() => p.onCheck({ ids: [m.id] })}><IcCheck size={15} />ตรวจไฟล์</button>
        <button type="button" onClick={() => { if (!m.missing) p.onInfo(); }} className={"btn " + (m.missing ? "btn-wait" : "btn-ghost")} aria-disabled={m.missing || undefined} title={m.missing ? "หาไฟล์ไม่เจอ ไดรฟ์อาจถอดออกอยู่" : undefined}>
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><circle cx="12" cy="12" r="9" /><path d="M12 11v6M12 7.5h.01" /></svg>ข้อมูลไฟล์
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
        <b>{m.shownLink ? "ปกจับคู่ไว้ ไม่ได้อยู่ในไฟล์" : "มีปกจับคู่ไว้ด้วย ตอนนี้แสดงปกในไฟล์"}</b>
        <div style={{ overflowWrap: "anywhere" }}>จากรูป {baseName(c.source)}{c.cropped ? " · ครอปแล้ว" : ""}</div>
        <div style={{ overflowWrap: "anywhere" }} data-link-where>{whereAll(c)}</div>
        <Phr>ไอคอนไฟล์ใน Windows ยังไม่เปลี่ยน เพราะ Icaros อ่านปกจากในไฟล์</Phr>
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
          <button type="button" className={"btn " + (busy ? "btn-wait" : "btn-bad")} aria-disabled={busy || undefined} data-link-remove-ok onClick={remove}><IbTrash size={15} />{busy ? "กำลังเอาออก…" : "เอาปกออก"}</button>
        </>}>
        <div className="small" style={{ fontSize: 14, color: "var(--txt2)" }}>
          {trash.length > 0 && <div style={{ overflowWrap: "anywhere" }}>รูปที่โปรแกรมคัดลอกไว้ {trash.join(" · ")} ย้ายลงถังขยะ กู้คืนได้</div>}
          {hasApp && <div>สำเนาในโปรแกรมย้ายลงถังขยะ กู้คืนได้</div>}
          <div>รูปต้นฉบับกับไฟล์หนังไม่ถูกแตะ · ไฟล์ที่โปรแกรมไม่ได้ทำไม่ถูกลบ</div>
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
  useEffect(() => { let live = true; setFound(null); pairApi.check(pairs.map((x) => x.path)).then((f) => { if (live) setFound(f); }, () => {}); return () => { live = false; }; }, [key]); // eslint-disable-line react-hooks/exhaustive-deps
  const save = (next: Pair[]) => pairApi.set(m.path, next).catch((e) => setRes({ err: String(e) }));
  const relink = async (i: number) => {
    const f = await pickAddFiles();
    if (f[0]) save(pairs.map((x, j) => (j === i ? { ...x, path: f[0] } : x)));
  };
  const label = (x: Pair) => [x.kind === "audio" ? `เสียง${x.lang ? " " + langName(x.lang) : ""}` : `ซับ${x.lang ? langName(x.lang) : ""}`, x.name, x.delay ? `ดีเลย์ ${x.delay > 0 ? "+" : "−"}${Math.abs(x.delay).toLocaleString("en-US")} ms` : ""].filter(Boolean).join(" · ");
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
      {missing > 0 && <div className="stat warn" data-pair-missing><CardIcon kind="warn" /><div><b>{`หาไฟล์ที่จับคู่ไม่เจอ ${missing} ไฟล์`}</b><Phr>ไดรฟ์อาจถอดออกอยู่ หรือไฟล์ถูกย้าย · เปิดเล่นได้พร้อมไฟล์ที่เหลือ</Phr></div></div>}
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
        <button type="button" className={"btn btn-sm " + (m.missing ? "btn-wait" : "btn-main")} aria-disabled={m.missing || undefined} title={m.missing ? "หาไฟล์หนังไม่เจอ" : undefined}
          onClick={() => { if (m.missing) return; setRes(null); pairApi.play(m.path, (window as unknown as { __pairDry?: boolean }).__pairDry).then((ok) => setRes({ ok }), (e) => setRes({ err: String(e) })); }} data-pair-play><IbPlay size={15} />เปิดเล่นพร้อมเสียงและซับที่จับคู่</button>
        <button type="button" className="btn btn-ghost btn-sm" onClick={onEdit} title="เปิดหน้าเสียงและซับ ลากไฟล์ใหม่แล้วกดจับคู่อีกครั้ง แทนชุดเดิม"><IcLink size={15} />แก้การจับคู่</button>
      </div>
      {res?.ok && <div className="small" data-pair-res data-cmd={res.ok.cmd}><Phr>{res.ok.opened ? `เปิดด้วย ${res.ok.player || "โปรแกรมหลักของ Windows"} · ส่งไฟล์ที่จับคู่ ${res.ok.sent} ไฟล์` : `รุ่นทดสอบไม่เปิดโปรแกรมเล่น · ${res.ok.player || "โปรแกรมหลักของ Windows"} ส่งไฟล์ที่จับคู่ ${res.ok.sent} ไฟล์`}</Phr></div>}
      {/* ไฟล์ที่หาไม่เจอการ์ดบอกอยู่แล้วข้างบน ไม่บอกซ้ำ */}
      {res?.ok?.notes.filter((n) => !n.includes("ที่จับคู่ไม่เจอ")).map((n, i) => <div key={i} className="stat warn" data-pair-note><CardIcon kind="warn" /><div><Phr>{n}</Phr></div></div>)}
      {res?.err && <div className="stat bad"><CardIcon kind="bad" /><div><b>เปิดเล่นไม่ได้</b><Phr>{res.err}</Phr></div></div>}
      <div className="small"><Phr>ปุ่มเปิดเล่นเดิมยังเปิดเฉพาะไฟล์หนัง · บนชั้นมีจุดเล็กมุมปกบอกว่าเรื่องนี้จับคู่ไว้</Phr></div>
    </div>
  );
}

/** การ์ดสถานะในแผงรายละเอียด ตามสภาพของไฟล์ (สเปกข้อ 1 การ์ดสถานะแบบอื่น) */
function StatusCard({ m, reminder, onCheck, onPoster }: { m: Movie; reminder: number; onCheck: (r: CheckReq) => void; onPoster: () => void }) {
  if (m.missing) {
    return <div className="stat bad"><CardIcon kind="bad" /><div><b>หาไฟล์ไม่เจอ</b><Phr>ไดรฟ์อาจถอดออกอยู่</Phr><br /><Phr>เสียบไดรฟ์แล้วกดอ่านโฟลเดอร์ใหม่</Phr></div></div>;
  }
  if (m.error) {
    return <div className="stat warn"><CardIcon kind="warn" /><div><b>อ่านข้อมูลไฟล์ไม่ได้</b>{m.error}</div></div>;
  }
  const k = kindOf(m, reminder);
  if (k === "bad") {
    const span = m.check?.spans?.[0];
    return (
      <>
        <div className="stat bad"><CardIcon kind="bad" /><div><b>ไฟล์เสียหาย</b>{m.check?.summary ?? (span ? "พบที่เสียในไฟล์" : "ตรวจแล้วพบที่เสีย")}<br /><Phr>ไฟล์น่าจะโหลดมาไม่ครบ ควรโหลดใหม่</Phr></div></div>
        <div className="minirow" style={{ marginTop: -4 }}>
          <button type="button" className="btn btn-ghost" onClick={() => onCheck({ ids: [m.id], open: m.id })}><IcCheck size={15} />ดูรายละเอียดผลตรวจ</button>
          <button type="button" className="btn btn-ghost" onClick={() => onCheck({ ids: [m.id], mode: "full" })}><IcCheck size={15} />ตรวจซ้ำ</button>
        </div>
      </>
    );
  }
  if (k === "info") {
    return (
      <>
        <div className="stat info"><CardIcon kind="info" /><div><b>ยังไม่ได้ครอบเป็น MKV</b><Phr>{`ไฟล์นี้เป็น ${m.ext.toUpperCase()} ใส่โปสเตอร์ได้หลังครอบเป็น MKV`}</Phr><br /><Phr>ภาพและเสียงไม่ถูกแปลงใหม่ คุณภาพเท่าเดิม</Phr></div></div>
        <div className="minirow" style={{ marginTop: -4 }}><button type="button" className="btn btn-main" onClick={onPoster}><IcPoster size={15} />ครอบเป็น MKV พร้อมโปสเตอร์</button></div>
      </>
    );
  }
  if (k === "warn") {
    const title = m.status === "changed" ? "ไฟล์ถูกเปลี่ยนตั้งแต่ตรวจครั้งก่อน" : m.status === "unchecked" ? "ยังไม่เคยตรวจไฟล์นี้" : "ถึงเวลาตรวจซ้ำ";
    return (
      <>
        <div className="stat warn"><CardIcon kind="warn" /><div><b>{title}</b>ตรวจแบบเร็วใช้เวลา{quickEstimate(m)}<br />ตรวจละเอียด<span className="nw">{fullEstimate(m)}</span></div></div>
        <div className="minirow" style={{ marginTop: -4 }}>
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
