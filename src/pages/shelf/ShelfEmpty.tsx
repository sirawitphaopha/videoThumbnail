/* ข้อความตอนชั้นวางไม่มีอะไรให้แสดง แยกจาก ShelfPage ให้ก้อนหน้าไม่เกิน 200 บรรทัด (BUGS ข้อ 161 ชุด 1)
   ลำดับเงื่อนไขเหมือนเดิมทุกตัว · คืน null เมื่อชั้นวางมีของให้แสดง ตัวประกอบไปวาดโครงจางหรือชั้นต่อ · ฟังก์ชันธรรมดา ไม่มี hook */
import type { ReactNode } from "react";
import type { Movie } from "../../lib/api";
import { IcRefresh, IcClose, IbEye, IcSettings } from "../../components/icons";
import { STAR_FILTERS, type CoverFilter, type StarFilter } from "./common";

export type EmptyIn = {
  scanning: boolean; skelPreview: boolean; movies: Movie[]; folders: { ok: boolean }[]; missingFolders: unknown[];
  query: string; setQuery: (q: string) => void; list: Movie[]; found: { items: Movie[] };
  filter: CoverFilter; setFilter: (v: CoverFilter) => void; star: StarFilter; setStar: (v: StarFilter) => void;
  scan: () => void; goFolders: () => void;
};

/** อ่านเสร็จแล้วไม่มีหนัง (AUDIT ข้อ 38) · ชื่อตรงแต่โดนตัวกรองซ่อน (AUDIT ข้อ 39) · หมวดว่าง · ดาวว่าง · ค้นไม่เจอ */
export function emptyNote(e: EmptyIn): ReactNode {
  const { scanning, skelPreview, movies, folders, missingFolders, query, setQuery, list, found, filter, setFilter, star, setStar, scan, goFolders } = e;
  // อ่านเสร็จแล้วไม่มีหนังสักเรื่อง บอกให้ต่างจากกำลังอ่านหรือโหลดไม่สำเร็จ (AUDIT ข้อ 38 · เดิมพื้นที่ว่างทั้งหน้า)
  return !scanning && !skelPreview && movies.length === 0 && folders.length > 0 && missingFolders.length < folders.length ? (
    <div className="empty-search" data-shelf-nomovies>
      <div style={{ fontSize: 14 }}>โฟลเดอร์ที่ตั้งไว้ยังไม่มีไฟล์หนังที่โปรแกรมอ่านได้</div>
      <div className="small">ตรวจว่าตั้งโฟลเดอร์ถูก หรือเพิ่มโฟลเดอร์อื่นในหน้าตั้งค่า</div>
      <div className="minirow">
        <button type="button" className="btn btn-ghost btn-sm" onClick={scan}><IcRefresh size={15} />อ่านโฟลเดอร์ใหม่</button>
        <button type="button" className="btn btn-ghost btn-sm" data-shelf-nomovies-go onClick={goFolders}><IcSettings size={15} />ไปตั้งค่าโฟลเดอร์</button>
      </div>
    </div>
  ) : query && list.length === 0 && found.items.length > 0 ? (
    /* ชื่อตรงแต่โดนตัวกรองปกหรือดาวซ่อน ไม่โทษคำค้น (AUDIT ข้อ 39) */
    <div className="empty-search" data-shelf-hidden>
      <div style={{ fontSize: 14 }}>เจอหนังที่ชื่อมีคำว่า <b>{query.trim()}</b> <span className="nw">{found.items.length} เรื่อง</span> แต่อยู่นอกตัวกรองที่เลือกไว้</div>
      <button type="button" className="btn btn-ghost btn-sm" onClick={() => { setFilter("all"); setStar("all"); }}><IbEye size={15} />ดูทั้งหมด</button>
    </div>
  ) : !query && filter !== "all" && list.length === 0 && !scanning ? (
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
  ) : null;
}
