/* ข้อมูลจำลอง ใช้เฉพาะตอนเปิดหน้าจอในเบราว์เซอร์เพื่อตรวจหน้าตา ไม่ใช่ตอนเปิดในโปรแกรมจริง
   ข้อมูลทั้งหมดเป็นของสมมติแบบเดียวกับในหน้าตาต้นแบบ */
import type { Settings } from "./api";

const defaults: Settings = {
  folders: ["D:\\หนัง"],
  rescanOnStart: true,
  checkSourceBefore: true,
  checkOutputAfter: true,
  outputFormat: "mkv",
  originalAfter: "keep",
  originalsFolder: "",
  posterFormat: "jpg",
  jpgQuality: 90,
  shrinkLargePosters: true,
  defaultCheck: "quick",
  quickCheckOnStart: false,
  recheckReminderDays: 30,
  coverSize: "m",
  showNames: true,
  showDots: true,
  showFrames: false,
  playerPath: "",
  sidebarCollapsed: false,
  viewMode: "grid",
  sort: "name-asc",
  coverOrient: "tall",
  tone: "quartz",
  linkStore: "beside",
  linkStores: ["beside"],
  linkBoardImages: "list",
  linkBoardMovies: "list",
};

let settings: Settings = { ...defaults };

export async function mock<T>(cmd: string, args?: Record<string, unknown>): Promise<T> {
  switch (cmd) {
    case "get_settings":
      return { settings, loadedFrom: "file" } as T;
    case "set_settings":
      settings = { ...settings, ...(args?.patch as Partial<Settings>) };
      return settings as T;
    case "check_tools":
      return [
        { name: "mkvmerge", ok: true, version: "mkvmerge v103.0 (จำลอง)" },
        { name: "mkvextract", ok: true, version: "mkvextract v103.0 (จำลอง)" },
        { name: "mkvpropedit", ok: true, version: "mkvpropedit v103.0 (จำลอง)" },
        { name: "ffmpeg", ok: true, version: "ffmpeg 9.0.2 (จำลอง)" },
        { name: "ffprobe", ok: true, version: "ffprobe 9.0.2 (จำลอง)" },
        { name: "MediaInfo", ok: true, version: "MediaInfo 26.10 (จำลอง)" },
      ] as T;
    case "running_jobs":
      return 0 as T;
    case "force_close":
      return undefined as T;
    case "link_state":
      return { rows: [], imageFolders: [], loose: [], scope: "nocover", waiting: 0 } as T;
    case "link_images":
      return [] as T;
    case "check_running":
    case "extract_running":
    case "hash_running":
      return false as T;
    default:
      throw new Error(`ข้อมูลจำลองยังไม่มีคำสั่ง ${cmd}`);
  }
}
