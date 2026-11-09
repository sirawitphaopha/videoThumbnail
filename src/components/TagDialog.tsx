/* ข้อมูลเพลงกับรูปปก ดูอย่างเดียว (แผนเสียงและซับ ขั้น 8 · มอคอัปหัวข้อ ข้อมูลเพลง)
   กดชื่อไฟล์บนหน้ากราฟเสียงหรือในคิวแปลง · แก้ไม่ได้ (พี่กันสั่ง การแก้ข้อมูลหนังและเพลงอยู่ในโรดแมป)
   ไฟล์ที่ไม่มีข้อมูลเพลงขึ้นว่าไม่มี พร้อมบอกเหตุ · ปุ่มคัดลอกข้อมูลเป็นข้อความ แบบหน้าข้อมูลไฟล์ */
import { useEffect, useState } from "react";
import Dialog from "./Dialog";
import { CardIcon, Keep, Phr, Skel } from "./ui";
import { convertApi, type AudioFile, type CoverData } from "../lib/api";
import { ftName } from "../lib/ftypes";
import { fmtSize } from "../lib/format";
import { IcCopy } from "./icons";

const LABEL: Record<string, string> = {
  title: "ชื่อเพลง", artist: "ศิลปิน", album: "อัลบั้ม", album_artist: "ศิลปินอัลบั้ม", date: "ปี", track: "แทร็ก", disc: "แผ่น",
  genre: "ประเภท", composer: "ผู้แต่ง", comment: "หมายเหตุ",
};
const minus = (s: string) => s.replace(/^-/, "−");

/** แถวที่แสดง · แทร็ก 3/10 เป็น 3 จาก 10 รวมแผ่น · ค่าความดังอัลบั้มกับเพลงรวมแถวเดียว */
export function tagRows(f: AudioFile, cover: CoverData | null): [string, string][] {
  const get = (k: string) => f.tags.find((t) => t.key === k)?.value;
  const rows: [string, string][] = [];
  for (const k of ["title", "artist", "album", "album_artist", "date"]) { const v = get(k); if (v) rows.push([LABEL[k], v]); }
  const tr = get("track"), disc = get("disc");
  if (tr || disc) {
    const [n, of] = (tr ?? "").split("/");
    rows.push(["แทร็ก", [tr ? (of ? `${n} จาก ${of}` : n) : "", disc ? `แผ่น ${disc.split("/")[0]}` : ""].filter(Boolean).join(" · ")]);
  }
  for (const k of ["genre", "composer", "comment"]) { const v = get(k); if (v) rows.push([LABEL[k], v]); }
  if (f.cover) rows.push(["รูปปก", `${f.cover.codec === "mjpeg" ? "JPG" : f.cover.codec.toUpperCase()} ${f.cover.width.toLocaleString("en-US")} × ${f.cover.height.toLocaleString("en-US")}${cover ? ` · ${fmtSize(cover.bytes)}` : ""}`]);
  const ag = get("replaygain_album_gain"), tg = get("replaygain_track_gain");
  if (ag || tg) rows.push(["ค่าความดัง", [ag ? `อัลบั้ม ${minus(ag)}` : "", tg ? `เพลง ${minus(tg)}` : ""].filter(Boolean).join(" · ")]);
  return rows;
}

/** เหตุที่ไม่มีข้อมูลเพลง ตามชนิดไฟล์ */
function whyNone(f: AudioFile): string {
  const ft = ftName("audio", f.codec, f.profile);
  if (!f.audioOnly) return "ไฟล์หนังเก็บชื่อเรื่องแทนข้อมูลเพลง ดูข้อมูลหนังได้ที่หน้าข้อมูลไฟล์";
  if (ft === "PCM") return "ไฟล์ WAV ส่วนใหญ่ไม่เก็บชื่อเพลงกับรูปปก · แปลงเป็น FLAC แล้วก็ยังไม่มีข้อมูล เพราะต้นฉบับไม่มี";
  if (["AC-3", "E-AC-3", "DTS", "TrueHD"].includes(ft)) return `ไฟล์ ${ft} แยกเดี่ยวไม่มีที่เก็บข้อมูลเพลงกับรูปปก`;
  return "ไฟล์นี้ไม่ได้ใส่ชื่อเพลงกับรูปปกไว้";
}

export default function TagDialog({ path, onClose }: { path: string; onClose: () => void }) {
  const [f, setF] = useState<AudioFile | null>(null);
  const [cover, setCover] = useState<CoverData | null | undefined>(undefined);
  const [err, setErr] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    let live = true;
    convertApi.probe(path).then((x) => {
      if (!live) return;
      setF(x);
      if (x.cover) convertApi.cover(path).then((c) => { if (live) setCover(c); }, () => { if (live) setCover(null); });
      else setCover(null);
    }, (e) => { if (live) setErr(String(e)); });
    return () => { live = false; };
  }, [path]);
  const name = path.split(/[\\/]/).pop() ?? path;
  const rows = f ? tagRows(f, cover ?? null) : [];
  const hasTags = !!f && f.tags.length > 0;
  const copy = () => {
    const txt = [name, ...rows.map(([k, v]) => `${k}\t${v}`)].join("\r\n");
    navigator.clipboard?.writeText(txt).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1500); }).catch(() => {});
  };
  return (
    <Dialog open onClose={onClose} kind="menu" width={620} title={<span>ข้อมูลเพลง · <span style={{ overflowWrap: "anywhere" }}>{name}</span></span>}
      actions={<>
        <span className="small" style={{ marginRight: "auto", alignSelf: "center" }}>ดูอย่างเดียว · การแก้ข้อมูลเพลงอยู่ในโรดแมป</span>
        {hasTags && <button type="button" className="btn btn-ghost btn-sm" onClick={copy} data-tagcopy><Keep icon={<IcCopy size={14} />} all={["คัดลอกแล้ว", "คัดลอกเป็นข้อความ"]}>{copied ? "คัดลอกแล้ว" : "คัดลอกเป็นข้อความ"}</Keep></button>}
        <button type="button" className="btn btn-main btn-sm" onClick={onClose}>ปิด</button>
      </>}>
      <div className="tagview" data-tagview>
        {err ? null : cover === undefined ? <Skel w={150} h={150} r={10} />
          : cover ? <img className="art" src={cover.url} alt="รูปปก" data-tagart />
          : <div className="art none" data-tagart="none">ไม่มีรูปปก</div>}
        {err ? <div className="stat bad"><CardIcon kind="bad" /><div><b>อ่านไฟล์ไม่ได้</b><Phr>{err}</Phr></div></div>
          : !f ? <div style={{ display: "flex", flexDirection: "column", gap: 8, flex: 1 }}>{[0, 1, 2, 3, 4].map((i) => <Skel key={i} w="100%" h={16} />)}</div>
          : hasTags || f.cover ? <dl className="kv" data-tagkv>{rows.map(([k, v]) => <FragmentKV key={k} k={k} v={v} />)}</dl>
          : <div className="stat info" data-tagnone><CardIcon kind="info" /><div><b>ไฟล์นี้ไม่มีข้อมูลเพลง</b><Phr>{whyNone(f)}</Phr></div></div>}
      </div>
      {f && !hasTags && f.cover && <div className="small" style={{ marginTop: 8 }}>มีแต่รูปปก ไม่มีชื่อเพลง</div>}
    </Dialog>
  );
}

function FragmentKV({ k, v }: { k: string; v: string }) { return <><dt>{k}</dt><dd style={{ overflowWrap: "anywhere" }}>{v}</dd></>; }
