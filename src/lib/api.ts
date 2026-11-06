/* ทางเดียวที่หน้าจอคุยกับฝั่ง Rust
   เปิดในโปรแกรมจริง = เรียกคำสั่งฝั่ง Rust · เปิดในเบราว์เซอร์ (ตรวจหน้าตา) = ใช้ข้อมูลจำลองใน mock.ts
   หน้าจอห้ามเรียก invoke เองที่อื่น จะได้มีที่เดียวให้ตรวจว่าเรียกอะไรบ้าง */
import { invoke, isTauri } from "@tauri-apps/api/core";
import { mock } from "./mock";

export type Settings = {
  folders: string[];
  rescanOnStart: boolean;
  checkSourceBefore: boolean;
  checkOutputAfter: boolean;
  outputFormat: "mkv" | "mp4";
  originalAfter: "keep" | "trash";
  originalsFolder: string;
  posterFormat: "jpg" | "png";
  jpgQuality: number;
  shrinkLargePosters: boolean;
  defaultCheck: "quick" | "full";
  quickCheckOnStart: boolean;
  recheckReminderDays: 0 | 7 | 30 | 90;
  coverSize: "s" | "m" | "l";
  showNames: boolean;
  showDots: boolean;
  playerPath: string;
  sidebarCollapsed: boolean;
  viewMode: "grid" | "table";
  sort: string;
};

export type LoadedFrom = "file" | "backup" | "defaults" | "new";
export type ToolCheck = { name: string; ok: boolean; version: string };

export const inApp = isTauri();

async function call<T>(cmd: string, args?: Record<string, unknown>): Promise<T> {
  if (!inApp) return mock<T>(cmd, args);
  return invoke<T>(cmd, args);
}

export const api = {
  getSettings: () => call<{ settings: Settings; loadedFrom: LoadedFrom }>("get_settings"),
  setSettings: (patch: Partial<Settings>) => call<Settings>("set_settings", { patch }),
  checkTools: () => call<ToolCheck[]>("check_tools"),
  /** มีงานกำลังรันอยู่กี่งาน · ใช้ตอนกดปิดโปรแกรม */
  runningJobs: () => call<number>("running_jobs"),
  /** ปิดโปรแกรมจริง หลังผู้ใช้ยืนยันในหน้าต่างถาม */
  forceClose: () => call<void>("force_close"),
};
