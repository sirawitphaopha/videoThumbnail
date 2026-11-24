/* ค่าหลักของหน้า ค่าที่จำจากที่เก็บกลาง avJob ค่าตั้ง และหน้าต่างที่เปิดจากแถวแทร็ก
   แยกจาก AvPage.tsx ตอนจัดโครงไฟล์ตามความหมาย (BUGS ข้อ 155 ขั้น 2) เนื้อโค้ดยกมาทั้งก้อน */
import { useState } from "react";
import { useToast } from "../../components/Toasts";
import { encodeApi, type EncoderInfo } from "../../lib/api";
import { useSettings } from "../../lib/settings";
import { useLibrary } from "../../lib/library";
import { setAv, useAv, type AvTrack } from "../../lib/avJob";
import type { Page } from "../../components/Sidebar";

export type AvProps = { initialPath: string | null; onConsumed: () => void; onPage: (pg: Page) => void; onGraph: (path: string, track?: number) => void };

export function useAvBase(p: AvProps) {
  const { settings } = useSettings();
  const toast = useToast();
  const { movies } = useLibrary();
  const av = useAv();
  const { movie, tracks, sel, covers, run } = av;
  /** แถวที่เปิดแผงตั้งค่าเสียง · ตัวแปลงที่มี (อ่านครั้งแรกที่เปิดแผง) */
  const [codecFor, setCodecFor] = useState<string | null>(null);
  /** ความเร็วเสียงที่ตัวช่วยหาดีเลย์เสนอ ส่งต่อให้แผงตั้งค่าเสียง */
  const [codecSpeed, setCodecSpeed] = useState<string | null>(null);
  const [delayFor, setDelayFor] = useState<string | null>(null);
  const [subFor, setSubFor] = useState<string | null>(null);
  /** หน้าต่างดูและแก้บท (BUGS ข้อ 99) */
  const [chapOpen, setChapOpen] = useState(false);
  /** วิธี รวมเข้าไฟล์หนัง จับคู่ไว้ ไม่รวม (มอคอัปหัวข้อ 5) หรือแยกออกจากหนัง (BUGS ข้อ 35) · เก็บใน avJob เปลี่ยนเมนูแล้วไม่หาย */
  const method = av.method;
  const setMethod = (v: "merge" | "pair" | "extract") => setAv({ method: v });
  const [encs, setEncs] = useState<EncoderInfo[] | null>(null);
  const openCodec = (key: string) => { setCodecFor(key); if (!encs) encodeApi.status().then(setEncs, () => setEncs([])); };
  const output = (av.once.output ?? settings?.outputFormat ?? "mkv") as "mkv" | "mp4";
  const original = (av.once.original ?? settings?.originalAfter ?? "keep") as "keep" | "trash";
  const working = run.state === "working";
  const nth = (t: AvTrack) => tracks.filter((x) => x.inMovie && x.kind === t.kind && x.tid <= t.tid).length;
  return { p, settings, toast, movies, av, movie, tracks, sel, covers, run, codecFor, setCodecFor, codecSpeed, setCodecSpeed, delayFor, setDelayFor, subFor, setSubFor, chapOpen, setChapOpen, method, setMethod, encs, setEncs, openCodec, output, original, working, nth };
}
