/* แผงข้อมูลซ้าย ข้อมูลไฟล์ ข้อมูลเพลง จุดที่ปักไว้
   แยกจาก GraphPage.tsx ตอนจัดโครงไฟล์ตามความหมาย (BUGS ข้อ 155 ขั้น 4) เนื้อโค้ดยกมาทั้งก้อน */
import { tagRows, whyNone } from "./TagDialog";
import { FixedTime, Phr, Skel, chText } from "../../components/ui";
import { IcSearch } from "../../components/icons";
import { WARN, tfmt } from "./common";
import { Speakers } from "./parts";
import type { B2 } from "./graphCtx";

/** แถวข้อมูล · ค่าที่มีวงเล็บท้าย เช่น MPEG-1 Layer 3 (LAME 4.0) ตัดบรรทัดได้เฉพาะหน้าวงเล็บ ไม่ตัดกลางวงเล็บ (พี่กันทัก 10 พ.ย. 2569 "แบ่งบรรทัดดี ๆ") */
function FragmentKV({ k, v }: { k: string; v: string }) {
  const at = v.lastIndexOf(" (");
  return <><dt>{k}</dt><dd>{at > 0 && v.endsWith(")") ? <><span className="nw">{v.slice(0, at)}</span> <span className="nw">{v.slice(at + 1)}</span></> : v}</dd></>;
}

export function panelBits(pg: B2) {
  const { codecDetail, dur, hidden, levels, marks, movie, names, path, setCenter, setPref, setTagFor, setTip, setZoom, t, tagCover, tagFile, th, toggleCh, view, vis } = pg;
  const infoRows: [string, string][] = t ? [
    ["Codec", codecDetail[t.index] ?? t.codec], ["Channels", `${chText(t.layout)}, ${names.length} ${names.length === 1 ? "channel" : "channels"}`], ["Sample rate", `${(t.rate / 1000).toLocaleString("en-US", { maximumFractionDigits: 1 })} kHz`],
    ...(t.bits ? [["Bit depth", `${t.bits}-bit`] as [string, string]] : []), ...(t.bitrate ? [["Bitrate", `${Math.round(t.bitrate / 1000).toLocaleString("en-US")} kb/s`] as [string, string]] : []),
    ...(t.lang ? [["Language", t.lang] as [string, string]] : []),
  ] : [];
  const firstMark = marks[0];
  // แถวสั้น ของยาวกับค่าเทคนิคดูเต็มได้จากการกดปกหรือชื่อไฟล์
  const tagShow = tagFile ? tagRows(tagFile, null).filter(([k]) => !["รูปปก", "ค่าความดัง", "หมายเหตุ"].includes(k)) /* ป้ายชื่อเรื่องของไฟล์หนังมาจาก tagRows แล้ว (AUDIT ข้อ 117) */ : [];
  const panel = (
    <div className="apanel">
      <div className="card"><h3><span>ช่องเสียง {chText(t?.layout)}</span><span className="small" style={{ color: "var(--txt3)" }}>{hidden.length ? `แสดง ${vis.length} จาก ${names.length} ช่อง` : `${names.length} ช่อง`}</span></h3>
        {names.length > 0 && <Speakers names={names} th={th} levels={levels} hidden={hidden} onToggle={toggleCh} />}
        <div className="small" style={{ textAlign: "center", marginTop: 4 }}>{names.length > 1 ? "กดลำโพงเพื่อปิดหรือเปิดช่องนั้น" : "ไฟล์นี้มีเสียงช่องเดียว"}</div></div>
      {t && <div className="card"><h3>ข้อมูลเสียง</h3><dl className="kv" data-graphinfo>{infoRows.map(([k, v]) => <FragmentKV key={k} k={k} v={v} />)}</dl></div>}
      {path && <div className="card gtag" data-graphtagcard><h3>{tagFile && !tagFile.audioOnly ? "ข้อมูลในไฟล์" : "ข้อมูลเพลง"}</h3>
        <div className="gcover">{tagCover === undefined ? <Skel w="100%" h={120} r={0} />
          : tagCover ? <button type="button" onClick={() => setTagFor(path)} title="ดูข้อมูลเพลงทั้งหมด" aria-label="ดูข้อมูลเพลงทั้งหมด" data-graphcover><img src={tagCover.url} alt="รูปปก" /></button>
          : <div className="none" data-graphcover="none">ไม่มีรูปปก</div>}</div>
        {tagShow.length > 0 ? <dl className="kv" data-graphtags-kv>{tagShow.map(([k, v]) => <FragmentKV key={k} k={k} v={v} />)}</dl>
          : tagFile && <div className="small" style={{ marginTop: 8 }} data-graphtags-none><Phr>{whyNone(tagFile)}</Phr></div>}</div>}
      {firstMark && <div className="stat warn">{WARN}<div><b>{movie?.check?.spans?.length ? "ผลตรวจล่าสุด" : "ช่วงเงียบผิดปกติ"}</b><span className="nw">{firstMark.text.replace(" (ผลตรวจ)", "")}</span> <span className="nw">ที่ {tfmt(firstMark.from)}</span>
        <div style={{ marginTop: 6 }}><button type="button" className="btn btn-ghost btn-sm" onClick={() => { setCenter(firstMark.from + 1); setTip(firstMark.from); setZoom(30); if (view !== "wave" && view !== "spec") setPref("view", "wave"); }} data-goto><IcSearch size={15} /><span>ซูมไปที่ <FixedTime t={tfmt(firstMark.from)} longest={tfmt(dur)} /></span></button></div></div></div>}
    </div>
  );
  return { infoRows, firstMark, tagShow, panel };
}
