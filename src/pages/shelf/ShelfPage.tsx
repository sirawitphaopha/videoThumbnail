/* หน้า 1 ชั้นวางหนัง (สเปกข้อ 1 3 4 5 · ต้นแบบบรรทัด 335–603)
   แถบบน ที่อยู่โฟลเดอร์ ค้นหา เรียง อ่านโฟลเดอร์ใหม่ · หัวชั้น ภาพปก/ตาราง เล็ก/กลาง/ใหญ่ การแสดงผล
   ชั้นไม้ แถวละกี่เรื่องคิดจากความกว้างจริง · ตารางกดหัวคอลัมน์เรียง · แผงรายละเอียด การ์ดสถานะทุกแบบ ปุ่ม 6 ปุ่ม
   ไดรฟ์ที่ถอดออก หนังยังอยู่บนชั้นแบบจาง เปิดเล่นไม่ได้ · กำลังอ่านมีโครงจาง ปกขึ้นทีละเรื่อง */
import { useEffect, useMemo, useRef, useState } from "react";
import type { CheckReq } from "../check/CheckPage";
import type { Page } from "../../components/Sidebar";
import SearchBox from "../../components/SearchBox";
import Dropdown from "../../components/Dropdown";
import { Badge, CardIcon, Phr, Seg, Switch } from "../../components/ui";
import { IcClock, IcFolder, IcLink, IcCoverL, IcCoverM, IcCoverS, IcTall, IcWide } from "../../components/icons";
import { setLinkJob, useLinkJob } from "../../lib/linkJob";
import type { PosterStart } from "../poster/PosterPage";
import { useToast } from "../../components/Toasts";
import { api, driveApi } from "../../lib/api";
import { useLibrary } from "../../lib/library";
import { useSettings } from "../../lib/settings";
import { searchByName } from "../../lib/thaiSearch";
import { fmtSize } from "../../lib/format";
import { SHELF_LABEL, type Kind } from "../../lib/status";
import { dropStyle, sideStyle, useDropPlacement, useSideFit } from "../../lib/popupFit";
import { useClickOutside, useEscClose } from "../../lib/popup";
import { useSkelPreview } from "../../lib/skelPreview";
import { driveName, freePct, isLow, requestSettingsSec, sizeNb, useDriveSpace } from "../../lib/drives";
import { IbNext, IcRefresh, IcSettings } from "../../components/icons";
import { CoverFilter, LinkMark, SORTS, STAR_FILTERS, StarFilter, coverFrom, passStars, sortMovies } from "./common";
import { ShelfGrid, SkeletonShelf, withCover } from "./ShelfGrid";
import { ShelfTable } from "./ShelfTable";
import { Detail } from "./Detail";
import { emptyNote } from "./ShelfEmpty";
import { useMovieMenu } from "./useMovieMenu";
import type { Movie } from "../../lib/api";


let filterMemo: CoverFilter = "all";
let starMemo: StarFilter = "all";
/** ไดรฟ์ที่กดไว้ทีหลังในคำเตือนไดรฟ์ใกล้เต็ม จำจนปิดโปรแกรม (BUGS ข้อ 88) */
const driveLater = new Set<string>();

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
  // เปิดเล่นกับเปิดโฟลเดอร์ ใช้ทั้งปุ่มแผงขวาและเมนูคลิกขวา (BUGS ข้อ 163.7)
  const play = (m: Movie) => api.playMovie(m.path).catch((e) => {
    toast({ kind: "bad", title: "เปิดเล่นไม่ได้", detail: String(e) });
    // โปรแกรมเล่นที่เลือกเองหาไม่เจอ พากลับไปตั้งที่หน้าตั้งค่า (สเปกข้อ 9)
    if (String(e).includes("หาโปรแกรมเล่นหนัง")) onPage("settings");
  });
  const reveal = (m: Movie) => api.revealMovie(m.path).catch((e) => toast({ kind: "bad", title: "เปิดโฟลเดอร์ไม่ได้", detail: String(e) }));
  const mm = useMovieMenu({ movies, scanning, selId: sel, setSel, onPage, onPoster, onInfo, onCheck, onGraph, onBitrate, onAv, play, reveal });
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
        <div className="shelfwrap" ref={wrapRef} onContextMenu={mm.onContextMenu} onClickCapture={mm.onClickCapture}>
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
          {emptyNote({ scanning, skelPreview, movies, folders, missingFolders, query, setQuery, list, found, filter, setFilter, star, setStar, scan,
            goFolders: () => { requestSettingsSec("folders"); onPage("settings"); } }) ?? ((scanning && movies.length === 0) || skelPreview ? (
            <SkeletonShelf size={size} />
          ) : view === "grid" ? (
            <ShelfGrid multi={mm.multi} list={list} size={size} selId={selected?.id ?? null} onSel={(id) => setSel(selected?.id === id ? null : id)} used={found.used} reminder={reminder}
              showNames={settings?.showNames ?? true} showDots={settings?.showDots ?? true} showFrames={settings?.showFrames ?? false}
              pending={scanning && !query && progress ? Math.max(0, progress.total - movies.length) : 0} />
          ) : (
            <ShelfTable multi={mm.multi} size={size} list={list} selId={selected?.id ?? null} onSel={(id) => setSel(selected?.id === id ? null : id)} used={found.used} reminder={reminder} showFrames={settings?.showFrames ?? false} />
          ))}
        </div>
        {/* key ต่อเรื่อง สลับเรื่องแล้วสร้างแผงกับปุ่มใหม่ ไม่ใช้ปุ่มเดิมซ้ำ (เดิมปุ่มชมพูค่อย ๆ เปลี่ยนเป็นเขียวตอนสลับเรื่อง) */}
        {selected && (
          <Detail key={selected.id} m={selected} showFrames={settings?.showFrames ?? false} scanning={scanning} reminder={reminder} onPage={onPage} onCheck={onCheck} onGraph={onGraph} onBitrate={onBitrate} onAv={onAv} onPoster={onPoster} onMerge={onMerge} onInfo={() => onInfo(selected.id)} onClose={() => setSel(null)}
            renameAsk={mm.renameFor === selected.id} onRenameAsked={mm.renameDone} unlinkAsk={mm.unlinkFor === selected.id} onUnlinkAsked={mm.unlinkDone}
            onPlay={() => play(selected)} onReveal={() => reveal(selected)} />
        )}
      </div>
      {mm.node}
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




const RefreshIcon = () => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" aria-hidden="true"><path d="M4 4v6h6M20 20v-6h-6" /><path d="M20 10a8 8 0 00-14-4L4 10M4 14a8 8 0 0014 4l2-4" /></svg>;
const GridIcon = () => <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" aria-hidden="true"><rect x="4" y="4" width="6" height="7" rx="1" /><rect x="14" y="4" width="6" height="7" rx="1" /><rect x="4" y="14" width="6" height="7" rx="1" /><rect x="14" y="14" width="6" height="7" rx="1" /></svg>;
const ListIcon = () => <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" aria-hidden="true"><path d="M9 6h11M9 12h11M9 18h11" /><rect x="3.5" y="4.5" width="3" height="3" rx=".6" /><rect x="3.5" y="10.5" width="3" height="3" rx=".6" /><rect x="3.5" y="16.5" width="3" height="3" rx=".6" /></svg>;
