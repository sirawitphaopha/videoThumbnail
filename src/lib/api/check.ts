/* คำสั่งของหน้าตรวจไฟล์ (checkApi) กับโปรแกรมเล่นหนัง (playerApi)
   แยกจาก src/lib/api.ts ตอนแบ่งไฟล์ทั้งโปรเจกต์ (BUGS ข้อ 153 · แผนแบ่งไฟล์ขั้น 6.1) ย้ายมาทั้งก้อน เนื้อโค้ดไม่เปลี่ยน · ไฟล์อื่น import ผ่าน src/lib/api (index.ts ส่งต่อทุกชื่อ) */
import { call } from "./core";

/* ---------- หน้าตรวจไฟล์ (check.rs · ขั้น 6) ---------- */
export type CheckMode = "quick" | "full";
export type CheckSpan = { from: number; to: number; what: string; tail?: boolean };
export type CheckProgress = { id: string; percent: number; index: number; total: number };
export type CheckItem = { id: string; error: string | null };
export type CheckFinished = { mode: CheckMode; total: number; done: number; ok: number; bad: number; changed: number; partial: number; failed: number; cancelled: boolean; seconds: number; at: number };
export type PlayResult = { player: string; seeked: boolean };
export type PlayerInfo = { path: string; name: string; exists: boolean; added: boolean; isDefault: boolean; icon?: string | null };
export type PlayerList = { players: PlayerInfo[]; systemDefault: boolean; systemIcon?: string | null };

/** โปรแกรมเล่นในเครื่อง (players.rs) */
export const playerApi = {
  list: () => call<PlayerList>("list_players"),
};

export const checkApi = {
  /** เริ่มตรวจเรื่องที่เลือกเบื้องหลัง · ผลมาทางเหตุการณ์ check-started check-progress movie-updated check-item check-finished */
  start: (ids: string[], mode: CheckMode) => call<void>("check_start", { ids, mode }),
  cancel: () => call<void>("check_cancel"),
  running: () => call<boolean>("check_running"),
  /** เปิดเล่นที่วินาทีนั้น · โปรแกรมที่ตั้งไว้ หรือที่หาเจอในเครื่อง (VLC MPC-HC PotPlayer mpv) */
  playAt: (path: string, secs: number) => call<PlayResult>("play_at", { path, secs }),
};
