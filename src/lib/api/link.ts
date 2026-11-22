/* คำสั่งของหน้าจับคู่ปก (linkApi) กับชนิดข้อมูล
   แยกจาก src/lib/api.ts ตอนแบ่งไฟล์ทั้งโปรเจกต์ (BUGS ข้อ 153 · แผนแบ่งไฟล์ขั้น 6.1) ย้ายมาทั้งก้อน เนื้อโค้ดไม่เปลี่ยน · ไฟล์อื่น import ผ่าน src/lib/api (index.ts ส่งต่อทุกชื่อ) */
import { call } from "./core";
import type { Geometry } from "./poster";
import type { Movie } from "./types";

/* จับคู่รูปปก (แผนจับคู่รูปปก · link.rs) · ทุกวิธีจับคู่ไปรอที่ตารางตรวจผล ยืนยันแล้วค่อยเก็บรูปจริง */
export type LinkPick = { path: string; name: string; folder: string; width: number; height: number; thumb: string | null; geo: Geometry | null; cropThumb?: string | null };
export type LinkStatus = "sure" | "unsure" | "none" | "manual" | "saved";
export type LinkRow = {
  id: string; movie: string; title: string; hasCover: boolean; status: LinkStatus; reason: string; via: "auto" | "board" | "explorer" | "shelf";
  tall: LinkPick | null; wide: LinkPick | null; derivedTall: boolean; candidates: LinkPick[]; score: number; ticked: boolean;
  error: string | null; prev: unknown | null; conflict: string | null; storeOverride: string | null; touched?: boolean;
};
export type LinkReplyData = { rows: LinkRow[]; imageFolders: string[]; loose: string[]; scope: "nocover" | "all"; waiting: number };
export type LinkImage = { path: string; name: string; folder: string; width: number; height: number; thumb: string | null; used: boolean; error: string | null };
export type AutoSummary = { images: number; sure: number; unsure: number; none: number; tall: number; wide: number; reply: LinkReplyData };
export type ConfirmResult = { done: number; failed: number; stopped: boolean; notes: string[]; reply: LinkReplyData };
export type LinkProgress = { done: number; total: number; title: string };
export type RowPatch = { ticked?: boolean; choose?: string; orient?: "tall" | "wide"; geo?: Geometry; skip?: boolean };
export const linkApi = {
  state: () => call<LinkReplyData>("link_state"),
  titles: (paths: string[]) => call<string[]>("link_titles", { paths }),
  isDir: (paths: string[]) => call<boolean[]>("link_is_dir", { paths }),
  images: () => call<LinkImage[]>("link_images"),
  addImages: (paths: string[]) => call<LinkReplyData>("link_add_images", { paths }),
  removeImages: (path: string) => call<LinkReplyData>("link_remove_images", { path }),
  auto: (scope: "nocover" | "all") => call<AutoSummary>("link_auto", { scope }),
  pair: (id: string, paths: string[], via: "board" | "explorer" | "shelf") => call<LinkReplyData>("link_pair", { id, paths, via }),
  undo: (id: string) => call<LinkReplyData>("link_undo", { id }),
  update: (id: string, patch: RowPatch) => call<LinkReplyData>("link_row_update", { id, patch }),
  setCrop: (id: string, orient: "tall" | "wide", geo: Geometry) => call<LinkReplyData>("link_set_crop", { id, orient, geo }),
  /** ticked ที่ติ๊กไว้ · all ทั้งหมด · ไม่งั้นเป็นเลขแถว */
  confirm: (which: string) => call<ConfirmResult>("link_confirm", { which }),
  cancel: () => call<void>("link_cancel"),
  resolve: (id: string, how: "use" | "app") => call<LinkReplyData>("link_resolve", { id, how }),
  unsave: (id: string) => call<{ notes: string[]; reply: LinkReplyData }>("link_unsave", { id }),
  remove: (id: string) => call<{ notes: string[]; reply: LinkReplyData }>("link_remove", { id }),
  openRow: (id: string) => call<LinkReplyData>("link_open_row", { id }),
  coverPick: (id: string, pick: "file" | "linked") => call<Movie>("link_cover_pick", { id, pick }),
  migrate: (to: "beside" | "app" | "link") => call<{ done: number; failed: number; notes: string[] }>("link_migrate", { to }),
};
