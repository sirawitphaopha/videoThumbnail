/* รายการชิ้นที่แยกออกจากหนังได้ แบบหน้า MediaInfo กับแถวแยกแบบ gMKVExtractGUI
   แยกจาก AvPage.tsx ตอนจัดโครงไฟล์ตามความหมาย (BUGS ข้อ 155 ขั้น 2) เนื้อโค้ดยกมาทั้งก้อน */
import { useEffect, useState } from "react";
import { type ExtractPick } from "./ExtractCard";
import { type Tip } from "../../lib/codecAdv";
import { infoApi, type MiSection, type ExtractInfo, type ExtractItem } from "../../lib/api";
import { setAv, type AvTrack } from "../../lib/avJob";
import { CUE_TIP, OGM_TIP, TAGS_TIP, TS_TIP } from "./parts";
import type { C4 } from "./avCtx";

export function useExtract(c: C4) {
  const { av, movie, nth } = c;
  /** หัวข้อ MediaInfo ของหนังที่เปิดอยู่ อ่านตอนเลือกวิธีแยก · ชนิด ลำดับ นามสกุล ภาษาของแต่ละชิ้น ใช้ตัวแยกเดิมของหน้า MediaInfo (extract.rs) */
  const [mi, setMi] = useState<{ path: string; sections: MiSection[] } | null>(null);
  const [miErr, setMiErr] = useState<string | null>(null);
  const [xInfo, setXInfo] = useState<{ path: string; info: ExtractInfo } | null>(null);
  /* อ่าน MediaInfo ตั้งแต่เปิดหนังทุกวิธี แถวไฟล์แนบกับบทในตารางขึ้นทั้งตอนรวมและตอนแยก สลับวิธีแล้วหน้าไม่ขยับ (BUGS ข้อ 35 ต่อ) */
  useEffect(() => {
    if (!movie || mi?.path === movie.path) return;
    let live = true;
    setMiErr(null);
    infoApi.mediaInfo(movie.path).then((r) => { if (live) setMi({ path: movie.path, sections: r.sections }); }).catch((e) => { if (live) setMiErr(String(e)); });
    infoApi.extractInfo(movie.path).then((info) => { if (live) setXInfo({ path: movie.path, info }); }).catch(() => { if (live) setXInfo(null); });
    return () => { live = false; };
  }, [movie?.path]); // eslint-disable-line react-hooks/exhaustive-deps
  /** ชิ้นที่แยกได้ เรียงตาม MediaInfo · นับลำดับในชนิดเดียวกัน (Audio #2 = แทร็กเสียงที่ 2) แบบหน้า MediaInfo เดิม */
  const xItems = (() => {
    if (!movie || mi?.path !== movie.path) return [];
    const seen: Record<string, number> = {};
    return mi.sections.map((s) => {
      seen[s.kind] = (seen[s.kind] ?? 0) + 1;
      const n = seen[s.kind];
      const name = s.kind === "attachment" ? s.rows.find((r) => r[0] === "File name")?.[1] ?? null : null;
      /* ภาพ AVC กับ HEVC แยกเป็นสตรีมล้วนได้ แบบที่ mkvextract ทำ (พี่กัน "มันสามารถเเยกเป้น h264 เดี่ยวๆได้นี่นา") · ภาพชนิดอื่นแยกเป็น .mkv อย่างเดียว */
      const fmt = s.rows.find((r) => r[0] === "Format")?.[1] ?? "";
      const raw = s.kind === "video" ? (fmt === "AVC" ? "h264" : fmt === "HEVC" ? "h265" : null) : null;
      const ext = raw && av.xRaw.includes(`${s.kind}:${n}`) ? raw : s.ext;
      const item = ext ? { kind: s.kind, nth: n, ext, lang: s.lang, name } : null;
      /* ชื่อแบบเดียวกับตารางแทร็ก (เสียงที่ 2 ซับที่ 1) ไม่ใช้ชื่อหมวด MediaInfo (Audio #2) ที่หน้านี้ไม่มีให้เห็น */
      const many = mi.sections.filter((x) => x.kind === s.kind).length > 1;
      const label = s.kind === "attachment" ? (name ?? s.title) : s.kind === "menu" ? "Chapter ของหนัง"
        : s.kind === "video" ? (many ? `ภาพที่ ${n}` : "ภาพ") : s.kind === "audio" ? `เสียงที่ ${n}` : s.kind === "text" ? `ซับที่ ${n}` : s.title;
      return { key: `${s.kind}:${n}`, s, item, label, raw, rowLabel: s.kind === "attachment" ? label : `${label} .${ext ?? ""}` };
    }).filter((x) => x.s.kind !== "general");
  })();
  const xKeyOf = (t: AvTrack) => `${t.kind === "subtitle" ? "text" : t.kind}:${nth(t)}`;
  /* แถวแยกแบบ gMKVExtractGUI เฉพาะไฟล์ MKV (BUGS ข้อ 130 พี่กันสั่ง "เอา" "เอาเข้าคิว") · แท็ก chapter แบบ OGM CUE sheet และเวลาของแต่ละเฟรมของแทร็กที่ติ๊ก */
  const xi = movie && xInfo?.path === movie.path && xInfo.info.mkv ? xInfo.info : null;
  const trackPicks = xItems.filter((x) => x.item && av.xPick.includes(x.key) && ["video", "audio", "text"].includes(x.s.kind));
  const xExtra = !xi ? [] : ([
    xi.tags && { key: "tags:1", kind: "tags", ext: "xml", chip: "XML", title: "แท็กของไฟล์", what: "แยกเป็นไฟล์ XML ที่ใส่กลับเข้าหนังด้วย MKVToolNix ได้", tip: TAGS_TIP },
    xi.chapters && { key: "ogm:1", kind: "ogm", ext: "txt", chip: "TXT", title: "Chapter แบบ OGM", what: "ข้อความ CHAPTER01= ที่โปรแกรมรุ่นเก่าอ่านได้", tip: OGM_TIP },
    xi.chapters && { key: "cue:1", kind: "cue", ext: "cue", chip: "CUE", title: "CUE sheet", what: "รายการเพลงตาม Chapter ที่โปรแกรมเล่นเพลงอ่านได้", tip: CUE_TIP },
    { key: "ts:1", kind: "timestamps", ext: "txt", chip: "TXT", title: "เวลาของแต่ละเฟรม", what: trackPicks.length ? `ของแทร็กที่ติ๊ก ${trackPicks.length} แทร็ก ไฟล์ละแทร็ก` : "ติ๊กแทร็กภาพ เสียง หรือซับก่อน", tip: TS_TIP },
  ].filter(Boolean) as { key: string; kind: string; ext: string; chip: string; title: string; what: string; tip: Tip }[]);
  const extraPicks: ExtractPick[] = xExtra.filter((x) => av.xPick.includes(x.key)).flatMap((x): ExtractPick[] => x.kind === "timestamps"
    ? trackPicks.map((t) => ({ item: { kind: "timestamps", nth: t.item!.nth, ext: "txt", lang: t.item!.lang, name: null, of: t.s.kind } as ExtractItem, label: `เวลาของเฟรม${t.label}`, rowLabel: `เวลาของเฟรม${t.label} .txt` }))
    : [{ item: { kind: x.kind, nth: 1, ext: x.ext, lang: null, name: null }, label: x.title, rowLabel: `${x.title} .${x.ext}` }]);
  const xPicks: ExtractPick[] = [...xItems.filter((x) => x.item && av.xPick.includes(x.key)).map((x) => ({ item: x.item!, label: x.label, rowLabel: x.rowLabel })), ...extraPicks];
  const xToggle = (key: string) => setAv((s) => ({ xPick: s.xPick.includes(key) ? s.xPick.filter((k) => k !== key) : [...s.xPick, key] }));
  const xOthers = xItems.filter((x) => x.s.kind === "attachment" || x.s.kind === "menu");
  /* ชนิดสตรีมล้วนที่หนังเรื่องนี้แยกได้จริง ใช้ในกล่องอธิบาย ไม่ฝังว่า H.264 ตายตัว (ภาพรวมชุด 9 หนัง HEVC ได้ .h265) */
  const xRawWord = [...new Set(xItems.map((x) => x.raw).filter(Boolean))].map((r) => r === "h264" ? "H.264" : "H.265").join(" หรือ ");
  return { mi, setMi, miErr, setMiErr, xInfo, setXInfo, xItems, xKeyOf, xi, trackPicks, xExtra, extraPicks, xPicks, xToggle, xOthers, xRawWord };
}
