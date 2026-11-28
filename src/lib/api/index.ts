/* ทางเดียวที่หน้าจอคุยกับฝั่ง Rust
   เปิดในโปรแกรมจริง = เรียกคำสั่งฝั่ง Rust · เปิดในเบราว์เซอร์ (ตรวจหน้าตา) = ใช้ข้อมูลจำลองใน mock.ts
   หน้าจอห้ามเรียก invoke เองที่อื่น จะได้มีที่เดียวให้ตรวจว่าเรียกอะไรบ้าง */
import { call } from "./core";
import { DriveSpace, LibraryReply, LoadedFrom, Movie, RenameProblem, Settings, ToolCheck } from "./types";





// ส่งต่อทุกชื่อของไฟล์ย่อย ไฟล์อื่นในโปรแกรม import จาก src/lib/api ที่เดียวเหมือนเดิม (แบ่งไฟล์ขั้น 6.1) · call ไม่ส่งต่อ ใช้ได้เฉพาะในโฟลเดอร์นี้
export { inApp } from "./core";
export * from "./ocr";
export * from "./types";
export * from "./files";
export * from "./poster";
export * from "./link";
export * from "./av";
export * from "./subs";
export * from "./info";
export * from "./graph";
export * from "./check";



export const api = {
  getSettings: () => call<{ settings: Settings; loadedFrom: LoadedFrom; recoveredFolders?: number }>("get_settings"),
  /** ความจุไดรฟ์ของโฟลเดอร์หนังกับไดรฟ์ของโปรแกรม อ่านอย่างเดียว (BUGS ข้อ 88) */
  driveSpace: (folders: string[]) => call<DriveSpace[]>("drive_space", { folders }),
  setSettings: (patch: Partial<Settings>) => call<Settings>("set_settings", { patch }),
  checkTools: () => call<ToolCheck[]>("check_tools"),
  /** ลง Icaros แล้วหรือยัง (หน้าตั้งค่า การ์ดเครื่องมือเบื้องหลัง) */
  checkIcaros: () => call<boolean>("check_icaros"),
  /** เปิดหน้าเว็บผู้พัฒนา Icaros ในเบราว์เซอร์หลัก (ที่อยู่ตายตัวในฝั่ง Rust) */
  openIcarosPage: () => call<void>("open_icaros_page"),
  /** มีงานกำลังรันอยู่กี่งาน · ใช้ตอนกดปิดโปรแกรม */
  runningJobs: () => call<number>("running_jobs"),
  /** ปิดโปรแกรมจริง หลังผู้ใช้ยืนยันในหน้าต่างถาม */
  forceClose: () => call<void>("force_close"),
  getLibrary: () => call<LibraryReply>("get_library"),
  /** เริ่มอ่านโฟลเดอร์เบื้องหลัง · ผลมาทางเหตุการณ์ movie-updated scan-progress scan-finished */
  scanLibrary: () => call<void>("scan_library"),
  playMovie: (path: string) => call<void>("play_movie", { path }),
  /** เปิดเล่นด้วยโปรแกรมในรายการโปรแกรมเล่นของเครื่อง (เมนูคลิกขวา BUGS ข้อ 164.5) */
  playMovieWith: (path: string, player: string) => call<void>("play_movie_with", { path, player }),
  revealMovie: (path: string) => call<void>("reveal_movie", { path }),
  /** ให้คะแนนดาว · 0 ล้างคะแนน */
  setRating: (id: string, stars: number) => call<Movie>("set_rating", { id, stars }),
  /** เช็กชื่อใหม่ตอนพิมพ์ (ไม่รวมนามสกุล) · null = ใช้ได้ หรือชื่อเหมือนเดิม · ตัวเช็กอยู่ฝั่ง Rust ที่เดียว (rename.rs) */
  checkRename: (id: string, stem: string) => call<RenameProblem | null>("check_rename", { id, stem }),
  /** เปลี่ยนชื่อไฟล์จริงแบบไม่เขียนทับ · ไม่สำเร็จ promise ล้มพร้อม RenameProblem */
  renameMovie: (id: string, stem: string) => call<Movie>("rename_movie", { id, stem }),
};

/** บันทึกการใช้งาน (actlog.rs) · ไฟล์ข้อความรายเดือนในเครื่อง จดงานที่เขียน ย้าย หรือลบไฟล์ */
export type LogInfo = { dir: string; monthLines: number };
/** เปิดรากไดรฟ์ใน Explorer จากคำเตือนไดรฟ์ใกล้เต็ม เปิดได้เฉพาะไดรฟ์ในรายการความจุ (BUGS ข้อ 88) */
export const driveApi = {
  open: (root: string) => call<void>("drive_open", { root }),
  /** ที่ว่างของไดรฟ์ที่ไฟล์หรือโฟลเดอร์นี้อยู่ ตัวเลขเดียวกับที่งานเช็กตอนเริ่ม (BUGS ข้อ 94) */
  free: (path: string) => call<FreeInfo>("drive_free", { path }),
};
export type FreeInfo = { free: number; drive: string };

export const logApi = {
  info: () => call<LogInfo>("actlog_info"),
  openDir: () => call<string>("actlog_open_dir"),
};

