/* ร่องรอยตัวเข้ารหัสในไฟล์เสียง กับปุ่มตรวจ FLAC ด้วย MD5 (BUGS ข้อ 164.2 · ROADMAP ข้อ 48 · พี่กันสั่ง "32 ทำเลย")
   การ์ดในแผงซ้ายของหน้ากราฟเสียง ใต้การ์ดข้อมูลเสียง · ข้อมูลจาก MediaInfo (encinfo.rs) ตรวจด้วย flac -t ที่แนบมาอยู่แล้ว
   ป้ายผู้เข้ารหัสอยู่ในส่วนแท็ก โปรแกรมแก้แท็กเขียนทับได้ จึงบอกในปุ่ม ⓘ ว่าเป็นเบาะแส ต้องดูคู่กับกราฟความถี่ */
import { useEffect, useState } from "react";
import InfoTip from "../../components/InfoTip";
import { CardIcon, Phr } from "../../components/ui";
import { IcCheck } from "../../components/icons";
import { graphApi, type EncInfo, type FlacCheck } from "../../lib/api";
import type { Tip } from "../../lib/codecAdv";

export const ENC_TIP: Tip = {
  w: "ชื่อโปรแกรมที่เข้ารหัสเสียงไฟล์นี้ ซึ่งตัวเข้ารหัสฝากไว้ในไฟล์",
  o: [
    ["เป็นเบาะแส", "ข้อความนี้อยู่ในส่วนแท็กซึ่งโปรแกรมแก้แท็กเขียนทับได้\nจึงไม่ใช่หลักฐานเด็ดขาด ต้องดูคู่กับกราฟความถี่", "", ""],
    ["MP3", "LAME จดโหมดไว้ เช่น VBR ระดับ V0 หรือ CBR 320 kbps\nส่วน MP3 ที่ไม่มีข้อความของ LAME มักมาจากตัวเข้ารหัสอื่น", "", ""],
    ["AAC", "แยกได้ว่ามาจาก qaac หรือ iTunes ซึ่งใช้เอนจินของ Apple\nหรือจากตัวเข้ารหัสในตัวของ ffmpeg ซึ่งคุณภาพต่างกันจริง", "", ""],
    ["FLAC", "หัวไฟล์ฝัง MD5 ของเสียงไว้ กดตรวจแล้วถอดเสียงมาเทียบ\nตรงกันแปลว่าเสียงไม่เสียแม้แต่บิตเดียว แม้แท็กหรือปกจะเปลี่ยน", "", ""],
  ],
};

/** MD5 ยาว 32 ตัว แสดงหัวกับท้าย ชี้แล้วเห็นเต็ม */
const shortMd5 = (m: string) => `${m.slice(0, 8)}…${m.slice(-8)}`;
const ZERO = "00000000000000000000000000000000";

export function EncCard({ path, track, codec }: { path: string; track: number; codec: string }) {
  const [all, setAll] = useState<EncInfo[] | null>(null);
  const [run, setRun] = useState<"idle" | "busy">("idle");
  const [res, setRes] = useState<FlacCheck | null>(null);
  const [err, setErr] = useState("");
  useEffect(() => {
    let live = true;
    setAll(null); setRes(null); setErr("");
    graphApi.encoderInfo(path).then((x) => { if (live) setAll(x); }, () => { if (live) setAll([]); });
    return () => { live = false; };
  }, [path]);
  const e = all?.[track] ?? null;
  const flac = /flac/i.test(codec);
  const isFile = /\.(flac|oga)$/i.test(path);
  const rows: [string, string, string?][] = e ? [
    ...(e.library ? [["ตัวเข้ารหัส", e.library] as [string, string]] : []),
    ...(e.hint ? [["สรุป", e.hint] as [string, string]] : []),
    ...(e.settings ? [["ค่าที่ใช้", e.settings] as [string, string]] : []),
    ...(e.app ? [["สร้างด้วย", e.app] as [string, string]] : []),
    ...(e.md5 ? [["MD5 ของเสียง", e.md5 === ZERO ? "ไม่ได้ฝังไว้" : shortMd5(e.md5), e.md5] as [string, string, string]] : []),
  ] : [];
  if (all && rows.length === 0 && !flac) return null;
  const check = async () => {
    if (run === "busy" || !isFile) return;
    setRun("busy"); setRes(null); setErr("");
    try { setRes(await graphApi.flacVerify(path)); } catch (x) { setErr(String(x)); } finally { setRun("idle"); }
  };
  const why = !isFile ? "ตรวจได้เฉพาะไฟล์ .flac เพราะ FLAC ในไฟล์อื่น เช่น MKV ไม่มีหัวไฟล์ของ FLAC" : run === "busy" ? "กำลังตรวจอยู่" : undefined;
  const kind = res?.status === "ok" ? "done" : res?.status === "nomd5" || res?.status === "unsupported" ? "warn" : "bad";
  const title = res?.status === "ok" ? "เสียงตรงกับ MD5 ทุกบิต" : res?.status === "nomd5" ? "ตรวจไม่ได้ เพราะไม่มี MD5" : res?.status === "unsupported" ? "ตรวจไฟล์นี้ไม่ได้" : "เสียงไม่ตรงกับ MD5";
  return (
    <div className="card" data-enccard>
      <h3><span>ร่องรอยตัวเข้ารหัส</span><InfoTip title="ร่องรอยตัวเข้ารหัส" tip={ENC_TIP} noAbbr /></h3>
      {all == null ? <div className="small" data-encwait>กำลังอ่าน…</div>
        : rows.length > 0 ? <dl className="kv" data-encrows>{rows.map(([k, v, full]) => <span key={k} style={{ display: "contents" }}><dt>{k}</dt><dd title={full}>{v}</dd></span>)}</dl>
        : <div className="small" data-encnone><Phr>ตัวเข้ารหัสไม่ได้ฝากชื่อไว้ในไฟล์นี้</Phr></div>}
      {flac && <div style={{ marginTop: 8 }}>
        <button type="button" className={"btn btn-sm " + (why ? "btn-wait" : "btn-ghost")} aria-disabled={why ? true : undefined} title={why} onClick={check} data-flaccheck>
          <IcCheck size={15} />{run === "busy" ? "กำลังตรวจ MD5…" : "ตรวจ MD5 ของเสียง"}</button>
        {res && <div className={"stat " + (kind === "done" ? "ok" : kind)} style={{ marginTop: 8 }} role="status" data-flacres={res.status}>
          <CardIcon kind={kind} /><div><b>{title}</b><Phr>{res.detail}</Phr>{res.secs > 0 && <span className="small" style={{ display: "block" }}>ใช้เวลา <span className="nw">{res.secs.toFixed(1)} วินาที</span></span>}</div></div>}
        {err && <div className="stat bad" style={{ marginTop: 8 }} role="alert" data-flacres="error"><CardIcon kind="bad" /><div><b>ตรวจไม่สำเร็จ</b><Phr>{err}</Phr></div></div>}
      </div>}
    </div>
  );
}
