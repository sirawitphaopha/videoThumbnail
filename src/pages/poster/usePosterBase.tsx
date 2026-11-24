/* ค่าหลักของหน้าใส่โปสเตอร์ ไฟล์หนัง รูป ค่าครอป หน้าต่างที่เปิด งานที่ทำอยู่ ค่าเฉพาะครั้งนี้
   แยกจาก PosterPage.tsx ตอนจัดโครงไฟล์ตามความหมาย (BUGS ข้อ 155 ขั้น 8) เนื้อโค้ดยกมาทั้งก้อน */
import { useState } from "react";
import { type CropChoice } from "../../components/CropDialog";
import { type MovieInfo, type PosterInfo } from "../../lib/api/index";
import { useSettings } from "../../lib/settings";
import { useLibrary } from "../../lib/library";
import { useToast } from "../../components/Toasts";
import { setPosterJob, usePosterJob, type Run } from "../../lib/posterJob";
import { IcExpand } from "../../components/icons";
import { type Page } from "../../components/Sidebar";
import { type PosterStart } from "./PosterPage";

export type PoProps = { initialPath: string | null; initialImage?: PosterStart | null; onPage: (pg: Page) => void; onConsumed: () => void };

export function usePosterBase(p: PoProps) {
  const { settings } = useSettings();
  const toast = useToast();
  const { movies } = useLibrary();
  const [moviePath, setMoviePath] = useState<string | null>(null);
  const [movie, setMovie] = useState<MovieInfo | null>(null);
  const [movieErr, setMovieErr] = useState<string | null>(null);
  const [poster, setPoster] = useState<PosterInfo | null>(null);
  const [posterErr, setPosterErr] = useState<string | null>(null);
  const [choice, setChoice] = useState<CropChoice | null>(null);
  /** ผู้ใช้ครอปเองในหน้าต่างครอปแล้ว · ไม่ขึ้นกล่องเลือกแบบปกบนการ์ด อยากเปลี่ยนก็กดครอปภาพใหม่ (BUGS ข้อ 8 · พี่กันเคาะ "เพราะถ้าผู้ใช้อยากจะแก้ ก็เเค่ไปครอบใหม่") */
  const [userCrop, setUserCrop] = useState(false);
  const [cropOpen, setCropOpen] = useState(false);
  const [listOpen, setListOpen] = useState(false);
  const [over, setOver] = useState<"movie" | "poster" | null>(null);
  const [loading, setLoading] = useState<"movie" | "poster" | null>(null);
  // สถานะงานอยู่ระดับโปรแกรม (lib/posterJob) เปลี่ยนหน้าแล้วกลับมายังเห็นงานเดิม ปุ่มหยุด และผล
  const job = usePosterJob();
  const run = job.run;
  const setRun = (r: Run) => setPosterJob({ run: r });
  const [askDelete, setAskDelete] = useState<0 | 1 | 2>(0);
  const [askStop, setAskStop] = useState(false);
  const [runMore, setRunMore] = useState<{ title: string; lines: string[] } | null>(null);
  const [drop, setDrop] = useState<number[]>([]);
  /** ซับ ASS ที่กดทำต่อแล้ว (ใส่ MP4 ได้แต่สีกับฟอนต์หาย) */
  const [ack, setAck] = useState<number[]>([]);
  /** หน้าต่างเตือนแทร็กที่ใส่ใน MP4 ไม่ได้ · เดิมขึ้นในการ์ดไฟล์ที่ได้ กรอบสูงขึ้นจนหกกรอบเปลี่ยนขนาด (BUGS ข้อ 57 พี่กันสั่ง 12 พ.ย. 2569 "ไปหาเตือนที่อื่น ... มัน 6 กรอบ ต้องขนาดเท่ากันตลอด")
      "pick" ขึ้นตอนกดเลือก MP4 · "start" ขึ้นตอนกดเริ่ม (เปลี่ยนไฟล์หนังทีหลังแล้วเจอแทร็กที่ใส่ไม่ได้) */
  const [askMp4, setAskMp4] = useState<null | "pick" | "start">(null);
  /** ดูรูปเต็มจอจากปุ่มมุมรูปของสามการ์ด (BUGS ข้อ 56 พี่กันสั่ง 12 พ.ย. 2569 "ส่ปุ่มขยายดูรูปให้ครบทั้งสามอัน") · ตัวดูรูปเดียวกับชั้นวาง */
  const [big, setBig] = useState<{ src: string; rect: DOMRect; name: string } | null>(null);
  const bigBtn = (src: string | null | undefined, name: string) => src ? (
    <button type="button" className="bigbtn pbig" title="ขยายดูเต็มจอ" aria-label={"ขยายดู " + name + " เต็มจอ"} data-pbig={name}
      onClick={(e) => { e.stopPropagation(); setBig({ src, rect: (e.currentTarget.parentElement ?? e.currentTarget).getBoundingClientRect(), name }); }}><IcExpand size={13} /></button>
  ) : null;
  /** ชื่อไฟล์ใหม่ที่พิมพ์ (พี่กันสั่ง 9 พ.ย. 2569 "ให้ตั้งชื่อไฟล์ด้วยสิ") · ยังไม่พิมพ์ใช้ชื่อไฟล์ต้นทาง · เปลี่ยนไฟล์หนังแล้วล้าง */
  const [typed, setTyped] = useState<string | null>(null);
  /* ตัวเลือกบนหน้านี้เปลี่ยนเฉพาะครั้งนี้ ไม่เขียนทับค่าตั้งต้นในหน้าตั้งค่า (ต้นแบบหน้าตั้งค่า *"ค่าที่ตั้งตรงนี้คือค่าตั้งต้น ทุกครั้งที่ใส่โปสเตอร์หรือตรวจไฟล์ยังเปลี่ยนเฉพาะครั้งนั้นได้"*)
     เดิมกดบนหน้านี้แล้วค่าตั้งต้นเปลี่ยนถาวร เลือกลบไฟล์เดิมครั้งเดียว ไฟล์ถัดไปเริ่มที่ลบ (ผู้ช่วยตรวจสเปกเจอ) · ยังไม่ได้แตะ ใช้ค่าตั้งต้น · ล้างทั้งหมดกลับเป็นค่าตั้งต้น */
  const [once, setOnce] = useState<{ outputFormat?: "mkv" | "mp4"; originalAfter?: "keep" | "trash"; checkSourceBefore?: boolean; checkOutputAfter?: boolean }>({});
  const setOne = (patch: typeof once) => setOnce((o) => ({ ...o, ...patch }));
  const output = (once.outputFormat ?? settings?.outputFormat ?? "mkv") as "mkv" | "mp4";
  const original = (once.originalAfter ?? settings?.originalAfter ?? "keep") as "keep" | "trash";
  const checkSource = once.checkSourceBefore ?? settings?.checkSourceBefore ?? true;
  const checkOutput = once.checkOutputAfter ?? settings?.checkOutputAfter ?? true;

  return { settings, toast, movies, moviePath, setMoviePath, movie, setMovie, movieErr, setMovieErr, poster, setPoster, posterErr, setPosterErr, choice, setChoice, userCrop, setUserCrop, cropOpen, setCropOpen, listOpen, setListOpen, over, setOver, loading, setLoading, job, run, setRun, askDelete, setAskDelete, askStop, setAskStop, runMore, setRunMore, drop, setDrop, ack, setAck, askMp4, setAskMp4, big, setBig, bigBtn, typed, setTyped, once, setOnce, setOne, output, original, checkSource, checkOutput, p };
}
