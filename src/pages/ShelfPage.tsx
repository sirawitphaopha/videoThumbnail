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
import { Badge, CardIcon, Phr, Phrases, Seg, Skel, Switch } from "../components/ui";
import { useToast } from "../components/Toasts";
import { api, thumbUrl, type Movie } from "../lib/api";
import { useLibrary } from "../lib/library";
import { useSettings } from "../lib/settings";
import { searchByName, highlightParts } from "../lib/thaiSearch";
import { fmtDateTime, fmtDuration, fmtSize } from "../lib/format";
import { kindOf, KIND_ORDER, SHELF_LABEL, TABLE_LABEL, quickEstimate, fullEstimate, type Kind } from "../lib/status";
import { dropStyle, useDropPlacement } from "../lib/popupFit";
import { useClickOutside, useEscClose, kb } from "../lib/popup";

const SORTS = [
  { value: "name-asc", label: "ชื่อ ก–ฮ" },
  { value: "name-desc", label: "ชื่อ ฮ–ก" },
  { value: "year", label: "ปีที่ออกฉาย ใหม่ไปเก่า" },
  { value: "added", label: "เพิ่มเข้าชั้นล่าสุด" },
  { value: "size", label: "ขนาดไฟล์ ใหญ่ไปเล็ก" },
  { value: "status", label: "สภาพไฟล์ ที่เสียขึ้นก่อน" },
];
const SIZES = { s: { w: 80, gap: 12 }, m: { w: 110, gap: 14 }, l: { w: 150, gap: 12 } } as const;
const byName = (a: Movie, b: Movie) => a.name.localeCompare(b.name, "th");

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
export default function ShelfPage({ onPage, onPoster, onInfo, onCheck, onGraph, sel, setSel }: { onPage: (p: Page) => void; onPoster: (path: string) => void; onInfo: (id: string) => void; onCheck: (r: CheckReq) => void; onGraph: (path: string) => void; sel: string | null; setSel: (id: string) => void }) {
  const { settings, update } = useSettings();
  const { movies, folders, scanning, progress, scan } = useLibrary();
  const toast = useToast();
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
  const list = useMemo(() => sortMovies(found.items, sort, reminder).map((m) => withCover(m, orient)), [found.items, sort, reminder, orient]);
  const selected = list.find((m) => m.id === sel) ?? list[0] ?? null;

  const missingFolders = folders.filter((f) => !f.ok);
  const pathText = settings?.folders.length
    ? settings.folders[0] + (settings.folders.length > 1 ? ` และอีก ${settings.folders.length - 1} โฟลเดอร์` : "")
    : "";

  const soon = (what: string, stage: number) => toast({ kind: "info", title: `${what}ทำในขั้น ${stage} ของแผน`, detail: "ปุ่มนี้ใช้ได้เมื่อทำขั้นนั้นเสร็จ" });

  return (
    <>
      <div className="topbar">
        <div className="path" title={settings?.folders.join("\n")}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path d="M3 7a2 2 0 012-2h4l2 2h8a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2z" /></svg>
          <span>{pathText}</span>
        </div>
        <SearchBox value={query} onChange={setQuery} placeholder="ค้นหาชื่อหนัง" label="ค้นหาชื่อหนัง" swapLabel={found.swapped ? found.used : ""} width={query ? 280 : 200} />
        <Dropdown label="เรียง" value={sort} options={SORTS} onChange={(v) => update({ sort: v })} display={(o) => `เรียงตาม${o?.label ?? ""}`} />
        {scanning ? (
          <button type="button" className="btn btn-wait" aria-disabled="true" title="กำลังอ่านโฟลเดอร์อยู่ รอให้เสร็จก่อน">
            <RefreshIcon />กำลังอ่านโฟลเดอร์
          </button>
        ) : (
          <button type="button" className="btn btn-ghost" onClick={scan}><RefreshIcon />อ่านโฟลเดอร์ใหม่</button>
        )}
      </div>
      <div className="content">
        <div className="shelfwrap" ref={wrapRef}>
          <div className="shelfhead">
            <b>
              {query ? <>เจอ {list.length} จาก <span className="nw">{movies.length} เรื่อง</span></> : <>หนังทั้งหมด <span className="nw">{movies.length} เรื่อง</span></>}
            </b>
            <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
              <Seg small label="มุมมอง" value={view} onChange={(v) => update({ viewMode: v })} options={[
                { value: "grid", label: <><GridIcon />ภาพปก</> },
                { value: "table", label: <><ListIcon />ตาราง</> },
              ]} />
              <Seg small label="ขนาดปก" value={size} onChange={(v) => update({ coverSize: v })}
                disabledReason={view === "table" ? "ขนาดปกใช้ได้ตอนดูแบบภาพปก" : undefined}
                options={[{ value: "s", label: "เล็ก" }, { value: "m", label: "กลาง" }, { value: "l", label: "ใหญ่" }]} />
              <Seg small label="ดูปก" value={orient} onChange={(v) => update({ coverOrient: v })}
                options={[{ value: "tall", label: "ปกตั้ง" }, { value: "wide", label: "ปกนอน" }]} />
              <DisplayMenu />
            </div>
          </div>
          {scanning && (
            <div className="hint" style={{ marginTop: 2 }}>
              กำลังอ่าน {pathText} · ปกขึ้นทีละเรื่องเมื่ออ่านเสร็จ
              {progress && progress.total > 0 && <> · อ่านแล้ว <span className="nw">{progress.done} จาก {progress.total} เรื่อง</span></>}
            </div>
          )}
          {settings?.showDots && view === "grid" && list.length > 0 && (
            <div className="legend">
              {(["ok", "warn", "bad", "info"] as Kind[]).map((k) => <span key={k}><i style={{ background: `var(--${k})` }} />{SHELF_LABEL[k]}</span>)}
            </div>
          )}
          {missingFolders.map((f) => (
            <div key={f.path} className="stat bad" style={{ margin: "10px 0 14px" }} data-folder-missing>
              <CardIcon kind="bad" />
              <div style={{ flex: 1 }}>
                <b>หาโฟลเดอร์ {f.path} ไม่เจอ</b>
                <div><Phr>ไดรฟ์อาจถอดออกอยู่ หนังในโฟลเดอร์นี้ยังอยู่บนชั้นแบบจาง ๆ แต่เปิดเล่นไม่ได้จนกว่าจะเสียบไดรฟ์</Phr></div>
                <div className="minirow">
                  <button type="button" className="btn btn-ghost btn-sm" onClick={scan}>ลองใหม่</button>
                  <button type="button" className="btn btn-ghost btn-sm" onClick={() => onPage("settings")}>ไปตั้งค่าโฟลเดอร์</button>
                </div>
              </div>
            </div>
          ))}
          {query && list.length === 0 ? (
            <div className="empty-search">
              <svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="#d29ab0" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><circle cx="11" cy="11" r="7" /><path d="M20 20l-3.5-3.5M8.5 8.5l5 5M13.5 8.5l-5 5" /></svg>
              <div style={{ fontSize: 14 }}>ไม่มีหนังที่ชื่อมีคำว่า <b>{query.trim()}</b></div>
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => setQuery("")}>ล้างคำค้น</button>
            </div>
          ) : scanning && movies.length === 0 ? (
            <SkeletonShelf size={size} />
          ) : view === "grid" ? (
            <ShelfGrid list={list} size={size} selId={selected?.id ?? null} onSel={setSel} used={found.used} reminder={reminder}
              showNames={settings?.showNames ?? true} showDots={settings?.showDots ?? true}
              pending={scanning && !query && progress ? Math.max(0, progress.total - movies.length) : 0} />
          ) : (
            <ShelfTable list={list} selId={selected?.id ?? null} onSel={setSel} used={found.used} reminder={reminder} />
          )}
        </div>
        {/* key ต่อเรื่อง สลับเรื่องแล้วสร้างแผงกับปุ่มใหม่ ไม่ใช้ปุ่มเดิมซ้ำ (เดิมปุ่มชมพูค่อย ๆ เปลี่ยนเป็นเขียวตอนสลับเรื่อง) */}
        {selected && (
          <Detail key={selected.id} m={selected} scanning={scanning} reminder={reminder} onPage={onPage} onCheck={onCheck} onGraph={onGraph} onPoster={onPoster} onInfo={() => onInfo(selected.id)} soon={soon}
            onPlay={() => api.playMovie(selected.path).catch((e) => toast({ kind: "bad", title: "เปิดเล่นไม่ได้", detail: String(e) }))}
            onReveal={() => api.revealMovie(selected.path).catch((e) => toast({ kind: "bad", title: "เปิดโฟลเดอร์ไม่ได้", detail: String(e) }))} />
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
      <button type="button" className={"btn btn-ghost btn-sm" + (open ? " pressed" : "")} aria-haspopup="true" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" aria-hidden="true"><path d="M4 7h10M18 7h2M4 17h4M12 17h8" /><circle cx="16" cy="7" r="2" /><circle cx="10" cy="17" r="2" /></svg>การแสดงผล
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
  return { ref, w, perRow: Math.max(1, Math.floor((w - 28 + gap) / (bw + gap))) };
}

/** ปกที่ชั้นวางใช้ตามที่เลือก ปกตั้งหรือปกนอน · เรื่องที่มีแบบเดียวขึ้นแบบนั้นเสมอ
    ภาพปก ตาราง แผงขวา ใช้ thumb กับ coverAspect ของเรื่องที่ผ่านตรงนี้แล้ว จึงสลับพร้อมกันทุกที่
    (พี่กัน 7 พ.ย. 2569 *"ทำระบบที่ดูรูปแบบเเนวตั้ง หรือเเนวนอนได้ ยกเว้นเรื่องนั้นๆมีเเค่เเนวเดียวมันจะเเสดงเเค่เเนวนั้น"*) */
function withCover(m: Movie, orient: "tall" | "wide"): Movie {
  if (!m.thumb2) return m;
  const want = (a: number) => (orient === "wide" ? a >= 1 : a < 1);
  const a1 = m.coverAspect ?? 0, a2 = m.cover2Aspect ?? 0;
  return want(a1) || !want(a2) ? m : { ...m, thumb: m.thumb2, coverAspect: a2 };
}

/** กว้างของเล่มบนชั้น · ปกแนวนอน (กว้างหารสูงตั้งแต่ 1) สูงเท่าเล่มอื่น กว้างตามสัดส่วนไม่เกิน 16:9 · ปกตั้งกับเล่มที่ยังไม่มีปกกว้างเท่าเดิม
    (พี่กัน 7 พ.ย. 2569 *"ถ้าเราเอาโปสเตอร์แบบเเนวนอนมา มันก็จะเเสดงเป็เเเนวนอนด้วยนะ"*) */
function bookWidth(m: Movie | null, bw: number) {
  const a = m?.thumb ? m.coverAspect ?? 0 : 0;
  return a >= 1 ? Math.round(bw * 1.5 * Math.min(a, 16 / 9)) : bw;
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
  const { w: bw, gap } = SIZES[p.size];
  const skel = Math.min(p.pending, ((perRow - (p.list.length % perRow)) % perRow) + perRow);
  const items: (Movie | null)[] = skel ? [...p.list, ...Array<null>(skel).fill(null)] : p.list;
  return (
    <div ref={ref} className={"size-" + p.size} data-shelf>
      {packRows(items, w - 28, bw, gap).map((row, i) => (
        <div key={i} className="shelf">
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
      aria-label={full + " · " + SHELF_LABEL[k] + (m.missing ? " · หาไฟล์ไม่เจอ" : "")}
      aria-pressed={p.sel}
      data-movie={m.name}
      {...kb(() => p.onSel(m.id))}
    >
      {src ? (
        <div className="cover has-img"><img src={src} alt="" loading="lazy" draggable={false} /></div>
      ) : (
        <div className="cover none">
          <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="#c99aad" strokeWidth="2" aria-hidden="true"><rect x="4" y="3" width="16" height="18" rx="2" /><path d="M8 15l3-3 2 2 3-3 2 2" /></svg>
          ยังไม่มีโปสเตอร์
        </div>
      )}
      {(p.showNames || p.showDots) && (
        <div className="bname" style={p.showNames ? undefined : { minHeight: 0 }}>
          {p.showNames
            ? <><Hl text={m.name} used={p.used} head={p.showDots && <Badge kind={k} title={SHELF_LABEL[k]} />} />{m.ext !== "mkv" && <> <span className="ext">.{m.ext}</span></>}</>
            : <Badge kind={k} title={SHELF_LABEL[k]} />}
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
          {on && <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" aria-hidden="true" style={{ marginLeft: 4 }}>
            <path d={sort!.dir === 1 ? "M6 15l6-6 6 6" : "M6 9l6 6 6-6"} /></svg>}
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
                <td><Hl text={m.name + "." + m.ext} used={p.used} /></td>
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
function Detail(p: { m: Movie; scanning: boolean; reminder: number; onPage: (pg: Page) => void; onCheck: (r: CheckReq) => void; onGraph: (path: string) => void; onPoster: (path: string) => void; onInfo: () => void; soon: (what: string, stage: number) => void; onPlay: () => void; onReveal: () => void }) {
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
  return (
    <aside className="detail" aria-label="รายละเอียดไฟล์">
      {src && imgOk ? (
        <img className={"dposter" + ((m.coverAspect ?? 0) >= 1 ? " wide" : "")} src={src} alt={"โปสเตอร์ " + m.name} onError={() => setImgOk(false)} />
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
      <div className="actions">
        {m.missing ? (
          <button type="button" className="btn btn-wait" aria-disabled="true" title="หาไฟล์ไม่เจอ ไดรฟ์อาจถอดออกอยู่" onClick={p.onPlay}><PlayIcon />เปิดเล่น</button>
        ) : (
          <button type="button" className="btn btn-main" onClick={p.onPlay}><PlayIcon />เปิดเล่น</button>
        )}
        <button type="button" className={"btn " + (renameBlock ? "btn-wait" : "btn-ghost")} aria-disabled={!!renameBlock || undefined}
          title={renameBlock ? "เปลี่ยนชื่อไม่ได้ · " + renameBlock : undefined} onClick={startRename}>เปลี่ยนชื่อ</button>
        <button type="button" className={"btn " + (m.missing ? "btn-wait" : "btn-ghost")} aria-disabled={m.missing || undefined}
          title={m.missing ? "หาไฟล์ไม่เจอ ไดรฟ์อาจถอดออกอยู่" : undefined} onClick={() => { if (!m.missing) p.onPoster(m.path); }}>เปลี่ยนโปสเตอร์</button>
        <button type="button" className="btn btn-ghost" onClick={() => p.onCheck({ ids: [m.id] })}>ตรวจไฟล์</button>
        <button type="button" onClick={() => { if (!m.missing) p.onInfo(); }} className={"btn " + (m.missing ? "btn-wait" : "btn-ghost")} aria-disabled={m.missing || undefined} title={m.missing ? "หาไฟล์ไม่เจอ ไดรฟ์อาจถอดออกอยู่" : undefined}>
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><circle cx="12" cy="12" r="9" /><path d="M12 11v6M12 7.5h.01" /></svg>ข้อมูลไฟล์
        </button>
        <button type="button" className="btn btn-ghost" onClick={p.onReveal}>
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path d="M3 7a2 2 0 012-2h4l2 2h8a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2z" /></svg>เปิดโฟลเดอร์
        </button>
        {/* ปุ่มที่ 7 เต็มแถว (มอคอัปกราฟเสียง) */}
        {(() => { const block = m.missing ? "หาไฟล์ไม่เจอ ไดรฟ์อาจถอดออกอยู่" : m.audio.length === 0 ? "ไฟล์นี้ไม่มีแทร็กเสียง" : null; return (
          <button type="button" className={"btn " + (block ? "btn-wait" : "btn-ghost")} style={{ gridColumn: "1 / -1" }} aria-disabled={!!block || undefined} title={block ?? undefined}
            onClick={() => { if (!block) p.onGraph(m.path); }} data-shelfgraph>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path d="M3 12h2M7 7v10M11 4v16M15 8v8M19 10v4" /></svg>กราฟเสียง
          </button>); })()}
      </div>
    </aside>
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
          <button type="button" className="btn btn-ghost" onClick={() => onCheck({ ids: [m.id], open: m.id })}>ดูรายละเอียดผลตรวจ</button>
          <button type="button" className="btn btn-ghost" onClick={() => onCheck({ ids: [m.id], mode: "full" })}>ตรวจซ้ำ</button>
        </div>
      </>
    );
  }
  if (k === "info") {
    return (
      <>
        <div className="stat info"><CardIcon kind="info" /><div><b>ยังไม่ได้ครอบเป็น MKV</b><Phr>{`ไฟล์นี้เป็น ${m.ext.toUpperCase()} ใส่โปสเตอร์ได้หลังครอบเป็น MKV`}</Phr><br /><Phr>ภาพและเสียงไม่ถูกแปลงใหม่ คุณภาพเท่าเดิม</Phr></div></div>
        <div className="minirow" style={{ marginTop: -4 }}><button type="button" className="btn btn-main" onClick={onPoster}>ครอบเป็น MKV พร้อมโปสเตอร์</button></div>
      </>
    );
  }
  if (k === "warn") {
    const title = m.status === "changed" ? "ไฟล์ถูกเปลี่ยนตั้งแต่ตรวจครั้งก่อน" : m.status === "unchecked" ? "ยังไม่เคยตรวจไฟล์นี้" : "ถึงเวลาตรวจซ้ำ";
    return (
      <>
        <div className="stat warn"><CardIcon kind="warn" /><div><b>{title}</b>ตรวจแบบเร็วใช้เวลา{quickEstimate(m)}<br />ตรวจละเอียด<span className="nw">{fullEstimate(m)}</span></div></div>
        <div className="minirow" style={{ marginTop: -4 }}>
          <button type="button" className="btn btn-ok" onClick={() => onCheck({ ids: [m.id], mode: "quick" })}>ตรวจแบบเร็ว</button>
          <button type="button" className="btn btn-ghost" onClick={() => onCheck({ ids: [m.id], mode: "full" })}>ตรวจละเอียด</button>
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
