/* คำสั่งของหน้าข้อมูลไฟล์ MediaInfo ค่า hash แยกออกจากหนัง โครงสร้าง MKV (infoApi) กับชนิดข้อมูล
   แยกจาก src/lib/api.ts ตอนแบ่งไฟล์ทั้งโปรเจกต์ (BUGS ข้อ 153 · แผนแบ่งไฟล์ขั้น 6.1) ย้ายมาทั้งก้อน เนื้อโค้ดไม่เปลี่ยน · ไฟล์อื่น import ผ่าน src/lib/api (index.ts ส่งต่อทุกชื่อ) */
import { call } from "./core";

/* ---------- หน้าข้อมูลไฟล์ (fileinfo.rs · hashes.rs · extract.rs) ---------- */
export type MiSection = { title: string; kind: "general" | "video" | "audio" | "text" | "menu" | "attachment" | string; rows: [string, string][]; ext: string | null; lang: string | null };
export type Hashes = { md5: string | null; sha1: string | null; sha256: string | null; crc32: string | null; sha512: string | null; bytes: number; seconds: number };
export type HashCompare = { algo: string | null; same: boolean; diff: string | null };
/** of ใช้กับชิ้นเวลาของแต่ละเฟรม (kind timestamps) บอกว่าเป็นของแทร็กชนิดไหน (BUGS ข้อ 130) */
export type ExtractItem = { kind: string; nth: number; ext: string; lang: string | null; name: string | null; of?: string | null };
/** ไฟล์ MKV มีแท็กกับ chapter ไหม และดีเลย์ของแทร็กเสียงแต่ละแทร็ก มิลลิวินาที (extract.rs info_of) */
export type ExtractInfo = { mkv: boolean; tags: boolean; chapters: boolean; delays: number[] };
/** notes เรื่องที่ควรรู้ เช่น ตัดชื่อให้สั้นลงเพราะที่อยู่ยาวเกินที่ Windows รับ */
export type ExtractResult = { folder: string; states: string[]; files: (string | null)[]; error: string | null; notes?: string[];
  /** ไฟล์ที่สองของชิ้นเดียวกัน ซับ VobSub ได้ .idx ใน files กับ .sub ในช่องนี้ (BUGS ข้อ 150) */
  pair?: (string | null)[];
  /** บรรทัดสุดท้ายที่เครื่องมือพิมพ์ตอนหยุด ใส่ในปุ่ม ⓘ ข้างข้อความไม่สำเร็จ (BUGS ข้อ 150) */
  detail?: string | null };
/** หนึ่งชั้นในโครงสร้างไฟล์ MKV (mkvtree.rs · BUGS ข้อ 131) · แถวสรุปไม่มี id */
export type MkvNode = { name: string; id: string; pos: number; size: number | null; value: string | null; kids: MkvNode[] };
export const infoApi = {
  mediaInfo: (path: string) => call<{ text: string; sections: MiSection[] }>("media_info", { path }),
  hash: (path: string, algos: string[]) => call<Hashes | null>("hash_file", { path, algos }),
  hashCancel: () => call<void>("hash_cancel"),
  compare: (pasted: string, hashes: Hashes) => call<HashCompare>("hash_compare", { pasted, hashes }),
  /** target ว่าง = ข้างไฟล์หนัง · exists มีไฟล์ค่าเดียวกันอยู่แล้ว ไม่สร้างซ้ำ · conflict มีไฟล์ชื่อนี้แต่ค่าไม่ตรง ยังไม่เขียน ถามก่อนแล้วส่ง newName */
  saveSha256: (path: string, sha256: string, target?: string | null, newName?: boolean) =>
    call<{ path: string; status: "saved" | "exists" | "conflict" }>("hash_save", { path, sha256, target: target ?? null, newName: !!newName }),
  /** ข้อความในคลิปบอร์ด อ่านฝั่ง Rust ไม่เด้งหน้าต่างขออนุญาตของ WebView2 (BUGS ข้อ 31) */
  clipboardText: () => call<string>("clipboard_text"),
  defaultFolder: (path: string) => call<string>("extract_default_folder", { path }),
  /** pattern รูปแบบชื่อแทร็ก · batch แยกแบบเดียวกันจากไฟล์อื่น ฝั่ง Rust หาเลขแทร็ก นามสกุล และภาษาของไฟล์นั้นใหม่ (BUGS ข้อ 130) */
  extract: (path: string, folder: string | null, items: ExtractItem[], policy: string[], pattern?: string, batch?: boolean) => call<ExtractResult>("extract_start", { req: { path, folder, items, policy, pattern: pattern ?? null, batch: !!batch } }),
  extractInfo: (path: string) => call<ExtractInfo>("extract_info", { path }),
  mkvTree: (path: string) => call<MkvNode>("mkv_tree", { path }),
  extractCancel: () => call<void>("extract_cancel"),
  /** งานแยกไฟล์หรือ hash ที่เริ่มไว้ก่อนเปลี่ยนหน้ายังทำอยู่ไหม · ฝั่ง Rust ไม่ให้เริ่มซ้อน */
  extractRunning: () => call<boolean>("extract_running"),
  hashRunning: () => call<boolean>("hash_running"),
};
