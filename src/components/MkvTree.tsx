/* โครงสร้างข้างในไฟล์ MKV แบบ mkvinfo (BUGS ข้อ 131 พี่กันสั่ง "เอา เเละอธิบายเพิ่มด้วย" กับ "เอาเข้าคิว")
   ฝั่ง Rust อ่านแบบ EBML เอง (mkvtree.rs) อ่านอย่างเดียว · กดปุ่มแล้วค่อยอ่าน ไม่ให้ดิสก์ทำงานทุกครั้งที่เปิดหน้า
   ต้นไม้กางพับได้ ชั้นที่สำคัญมีปุ่ม ⓘ อธิบายภาษาไทย ชื่อชั้นเป็นคำอังกฤษตามมาตรฐาน Matroska (กฎคำเทคนิคใช้คำอังกฤษ) */
import { useState } from "react";
import { infoApi, type MkvNode } from "../lib/api";
import InfoTip from "./InfoTip";
import { CardIcon, Phr, Skel } from "./ui";
import type { Tip } from "../lib/codecAdv";

const t = (w: string): Tip => ({ w });
/** คำอธิบายของแต่ละชั้น · ชื่อตรงกับ element() ใน mkvtree.rs */
export const MKV_TIPS: Record<string, Tip> = {
  EBML: t("หัวไฟล์ บอกว่าไฟล์นี้เขียนแบบ EBML และเป็นชนิดไหน (DocType)\nโปรแกรมเล่นอ่านส่วนนี้ก่อนเพื่อรู้ว่าเปิดไฟล์ได้ไหม"),
  DocType: t("matroska คือไฟล์ MKV MKA MKS ส่วน webm คือไฟล์ WebM"),
  DocTypeVersion: t("รุ่นของมาตรฐาน Matroska ที่ไฟล์ใช้\nโดยโปรแกรมเล่นต้องรองรับรุ่นตาม DocTypeReadVersion"),
  Segment: t("กล่องใหญ่ที่เก็บทุกอย่างของหนัง\nทั้งแทร็ก Chapter แท็ก และภาพเสียง โดยไฟล์ปกติมี Segment เดียว"),
  SeekHead: t("สารบัญของไฟล์ บอกว่าส่วนสำคัญแต่ละส่วนอยู่ที่ไบต์ไหน\nโปรแกรมเล่นจึงกระโดดไปอ่านได้เลยโดยไม่ต้องไล่อ่านทั้งไฟล์"),
  Seek: t("หนึ่งบรรทัดในสารบัญ บอกชื่อส่วนใน SeekID\nกับตำแหน่งนับจากต้น Segment ใน SeekPosition"),
  Info: t("ข้อมูลของเรื่อง เช่นความยาว ชื่อเรื่อง และโปรแกรมที่ทำไฟล์"),
  TimestampScale: t("หน่วยของเวลาในไฟล์ นาโนวินาทีต่อหนึ่งหน่วย\nค่า 1,000,000 แปลว่าเวลาในไฟล์นับเป็นมิลลิวินาที"),
  Duration: t("ความยาวของเรื่องเป็นหน่วยตาม TimestampScale\nโดยในวงเล็บแปลงเป็นเวลาให้แล้ว"),
  DateUTC: t("วันที่ทำไฟล์ตามเวลาสากล UTC ซึ่งช้ากว่าเวลาไทย 7 ชั่วโมง"),
  Title: t("ชื่อเรื่องที่ตั้งไว้ในไฟล์ ซึ่งโปรแกรมเล่นบางตัวแสดงแทนชื่อไฟล์"),
  MuxingApp: t("ไลบรารีที่ใช้เขียนไฟล์\nเช่น libebml กับ libmatroska ของ MKVToolNix"),
  WritingApp: t("โปรแกรมที่ทำไฟล์นี้พร้อมรุ่น\nเช่น mkvmerge หรือ Lavf ซึ่งเป็นตัวเขียนไฟล์ของ ffmpeg"),
  SegmentUUID: t("รหัสประจำไฟล์แบบสุ่ม ใช้ตอนไฟล์หลายไฟล์ต่อกันเป็นเรื่องเดียว"),
  Tracks: t("รายการแทร็กทั้งหมดในไฟล์ ทั้งภาพ เสียง และซับ"),
  TrackEntry: t("ข้อมูลของหนึ่งแทร็ก เช่นชนิด codec ภาษา และค่าตั้งต้น"),
  TrackNumber: t("เลขแทร็กที่ก้อนข้อมูลใน Cluster ใช้อ้าง เริ่มที่ 1\nซึ่งต่างจากเลขของ mkvmerge ที่เริ่มที่ 0"),
  TrackUID: t("รหัสประจำแทร็กแบบสุ่ม ใช้ให้แท็กกับ Chapter อ้างถึงแทร็กนี้"),
  TrackType: t("ชนิดแทร็ก 1 คือภาพ 2 คือเสียง และ 17 คือซับ"),
  FlagDefault: t("1 คือแทร็กหลักที่โปรแกรมเล่นเลือกให้เองเมื่อผู้ดูไม่ได้เลือก"),
  FlagForced: t("1 คือซับบังคับ ที่ต้องขึ้นเสมอ เช่นคำแปลป้ายหรือภาษาต่างดาว"),
  FlagLacing: t("1 คืออนุญาตให้รวมหลายเฟรมไว้ในก้อนเดียว\nซึ่งช่วยให้ไฟล์เสียงเล็กลงเล็กน้อย"),
  FlagEnabled: t("1 คือแทร็กนี้ใช้งานได้ ส่วน 0 คือปิดไว้"),
  DefaultDuration: t("ความยาวของหนึ่งเฟรมเป็นนาโนวินาที\nโดยในวงเล็บแปลงเป็นจำนวนเฟรมต่อวินาทีให้แล้ว"),
  Name: t("ชื่อแทร็กที่ตั้งไว้ เช่น พากย์ไทย หรือ Commentary"),
  Language: t("ภาษาของแทร็กแบบรหัสสามตัว เช่น tha eng ส่วน und คือไม่ระบุ"),
  LanguageBCP47: t("ภาษาแบบละเอียดตามมาตรฐาน BCP 47 เช่น th หรือ zh-Hant ซึ่งใหม่กว่า Language"),
  CodecID: t("ชนิดข้อมูลของแทร็กตามแบบ Matroska\nเช่น V_MPEG4/ISO/AVC คือภาพ H.264 และ A_AC3 คือเสียง AC-3"),
  CodecPrivate: t("ข้อมูลตั้งต้นที่ตัวถอดต้องใช้ก่อนเริ่ม เช่นค่าตั้งของภาพ H.264\nหรือหัวไฟล์ซับ ASS ที่มีสไตล์"),
  CodecName: t("ชื่อ codec ที่อ่านง่ายซึ่งโปรแกรมที่ทำไฟล์ใส่ไว้"),
  CodecDelay: t("ดีเลย์ของตัวถอดเสียงเป็นนาโนวินาที\nซึ่งเสียง Opus ใช้บอกให้ตัดเสียงเงียบตอนต้น"),
  Video: t("ข้อมูลของภาพ เช่นขนาดเป็นพิกเซล ขนาดที่แสดง และสี"),
  PixelWidth: t("ความกว้างของภาพที่เก็บจริงเป็นพิกเซล"),
  PixelHeight: t("ความสูงของภาพที่เก็บจริงเป็นพิกเซล"),
  DisplayWidth: t("ความกว้างตอนแสดงผล ถ้าต่างจาก PixelWidth ภาพจะถูกยืดตามสัดส่วนนี้"),
  DisplayHeight: t("ความสูงตอนแสดงผล ใช้คู่กับ DisplayWidth บอกสัดส่วนภาพ"),
  Colour: t("ข้อมูลสีของภาพ เช่นช่วงสีและแบบแปลงสี ซึ่งภาพ HDR ต้องมีส่วนนี้"),
  Audio: t("ข้อมูลของเสียง เช่นอัตราสุ่ม จำนวนช่อง และความลึกบิต"),
  SamplingFrequency: t("อัตราสุ่มเสียงเป็นเฮิรตซ์ เช่น 48000 คือ 48 kHz"),
  Channels: t("จำนวนช่องเสียง 2 คือสเตอริโอ ส่วน 6 คือ 5.1"),
  BitDepth: t("ความลึกบิตของเสียง เช่น 16 หรือ 24 บิต\nซึ่งเสียงที่บีบอัดแบบเสียคุณภาพมักไม่มีค่านี้"),
  ContentEncodings: t("การบีบอัดหรือเข้ารหัสข้อมูลของแทร็กเพิ่มอีกชั้น\nเช่นซับที่บีบอัดด้วย zlib ซึ่งเครื่องเล่นบางเครื่องเปิดไม่ได้"),
  Chapters: t("Chapter ของเรื่อง แบ่งเป็นตอนพร้อมชื่อและเวลาเริ่ม"),
  EditionEntry: t("ชุด Chapter หนึ่งชุด ซึ่งไฟล์ส่วนใหญ่มีชุดเดียว\nส่วนแผ่นบางแผ่นมีหลายชุดให้เลือก"),
  ChapterAtom: t("Chapter หนึ่งตอน มีเวลาเริ่ม เวลาจบ และชื่อ"),
  ChapterTimeStart: t("เวลาเริ่มของ Chapter นี้"),
  ChapterTimeEnd: t("เวลาจบของ Chapter นี้ ซึ่งไม่ใส่ก็ได้\nโดยโปรแกรมเล่นถือว่าจบตอน Chapter ถัดไปเริ่ม"),
  ChapterDisplay: t("ชื่อที่แสดงของ Chapter แยกตามภาษา"),
  ChapString: t("ชื่อ Chapter ที่โปรแกรมเล่นแสดงในรายการตอน"),
  Attachments: t("ไฟล์แนบในหนัง เช่นรูปปก cover.jpg และฟอนต์ของซับ ASS"),
  AttachedFile: t("ไฟล์แนบหนึ่งไฟล์ มีชื่อ ชนิด และข้อมูลไฟล์"),
  FileName: t("ชื่อไฟล์แนบ ซึ่งรูปชื่อ cover.jpg กับ cover_land.jpg โปรแกรมเล่นใช้เป็นปก"),
  FileMediaType: t("ชนิดของไฟล์แนบ เช่น image/jpeg หรือ font/ttf"),
  FileData: t("ข้อมูลของไฟล์แนบ โปรแกรมบอกแค่ขนาด ไม่อ่านข้อมูลจริง"),
  Tags: t("แท็กของไฟล์ เช่นชื่อเรื่อง ปี หรือข้อมูลของแต่ละแทร็ก\nซึ่งแยกเป็น XML ได้ในหน้าเสียงและซับ"),
  Tag: t("แท็กหนึ่งชุด มี Targets บอกว่าเป็นของทั้งเรื่องหรือของแทร็กไหน"),
  Targets: t("บอกว่าแท็กชุดนี้เป็นของอะไร\nถ้ามี TagTrackUID คือของแทร็กนั้น ถ้าไม่มีคือของทั้งเรื่อง"),
  SimpleTag: t("แท็กหนึ่งค่า\nเช่น TagName เป็น BPS กับ TagString เป็นตัวเลขบิตเรต"),
  TagName: t("ชื่อแท็ก เช่น TITLE หรือ BPS\nซึ่ง mkvmerge ใส่สถิติของแทร็กเป็นแท็กพวกนี้"),
  TagString: t("ค่าของแท็กเป็นข้อความ"),
  Cues: t("สารบัญกระโดด บอกว่าแต่ละช่วงเวลาอยู่ที่ไบต์ไหน\nทำให้ลากแถบเวลาแล้วภาพมาเร็ว ไม่มีส่วนนี้การกรอจะช้า"),
  CuePoint: t("หนึ่งจุดในสารบัญกระโดด\nมีเวลาใน CueTime กับตำแหน่งของ Cluster"),
  CueTime: t("เวลาของจุดนี้เป็นหน่วยตาม TimestampScale\nโดยในวงเล็บแปลงเป็นเวลาให้แล้ว"),
  CueClusterPosition: t("ตำแหน่งของ Cluster ที่มีเฟรมนี้ นับจากต้น Segment"),
  Cluster: t("ก้อนข้อมูลภาพและเสียงจริง แต่ละก้อนยาวไม่กี่วินาที\nโปรแกรมแสดงแค่สามก้อนแรก แล้วนับจำนวนที่เหลือให้"),
  Timestamp: t("เวลาเริ่มของ Cluster นี้ เวลาของแต่ละก้อนข้างในนับต่อจากค่านี้"),
  SimpleBlock: t("ข้อมูลเฟรมของแทร็กเดียว บอกเลขแทร็กและเวลานับจาก Cluster\nส่วน keyframe คือเฟรมที่กระโดดมาเล่นได้เลย"),
  BlockGroup: t("ก้อนข้อมูลแบบเก่าที่มีข้อมูลเพิ่ม\nเช่นความยาวของซับใน BlockDuration"),
  BlockDuration: t("ความยาวของก้อนนี้ ซึ่งซับใช้บอกว่าข้อความขึ้นนานเท่าไหร่"),
  Void: t("ที่ว่างที่จองไว้ ให้โปรแกรมแก้ข้อมูลข้างหน้าได้\nโดยไม่ต้องเขียนไฟล์ใหม่ทั้งไฟล์"),
  "CRC-32": t("ค่าตรวจความถูกต้องของชั้นนี้ ใช้รู้ว่าข้อมูลส่วนนี้เสียหรือไม่"),
};

/** ชั้นที่กางไว้ตอนเปิด · หัวไฟล์ Segment ข้อมูลเรื่อง และรายการแทร็ก */
const OPEN0 = new Set(["EBML", "Segment", "Info", "Tracks"]);

function Row({ n, depth, path, open, toggle }: { n: MkvNode; depth: number; path: string; open: Set<string>; toggle: (p: string) => void }) {
  const has = n.kids.length > 0;
  const on = open.has(path);
  const tip = MKV_TIPS[n.name];
  return (
    <>
      <div className="mkt-row" style={{ paddingLeft: 8 + depth * 18 }} data-mkt={n.name} data-mkt-path={path}>
        {has ? <button type="button" className={"mkt-car" + (on ? " on" : "")} aria-expanded={on} aria-label={`${on ? "พับ" : "กาง"} ${n.name}`} onClick={() => toggle(path)} data-mkt-toggle={path}>
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" aria-hidden="true"><path d="M9 6l6 6-6 6" /></svg></button> : <span className="mkt-car none" />}
        <b className="mkt-name">{n.name}</b>
        {tip && <InfoTip title={n.name} tip={tip} noAbbr />}
        {n.value != null && <span className="mkt-val" data-mkt-val>{n.value}</span>}
        {n.id && <span className="small mkt-pos">{`ไบต์ที่ ${n.pos.toLocaleString("en-US")}${n.size != null ? ` ขนาด ${n.size.toLocaleString("en-US")}` : " ไม่รู้ขนาด"}`}</span>}
      </div>
      {has && on && n.kids.map((k, i) => <Row key={i} n={k} depth={depth + 1} path={`${path}/${i}`} open={open} toggle={toggle} />)}
    </>
  );
}

export default function MkvTree({ path }: { path: string }) {
  const [st, setSt] = useState<{ s: "idle" | "busy" | "done" | "fail"; root?: MkvNode; err?: string }>({ s: "idle" });
  const [open, setOpen] = useState<Set<string>>(new Set());
  const load = () => {
    setSt({ s: "busy" });
    infoApi.mkvTree(path).then((root) => {
      const o = new Set<string>(["r"]);
      const walk = (n: MkvNode, p: string) => n.kids.forEach((k, i) => { if (OPEN0.has(k.name)) { o.add(`${p}/${i}`); walk(k, `${p}/${i}`); } });
      walk(root, "r");
      setOpen(o); setSt({ s: "done", root });
    }, (e) => setSt({ s: "fail", err: String(e) }));
  };
  const toggle = (p: string) => setOpen((o) => { const n = new Set(o); if (n.has(p)) n.delete(p); else n.add(p); return n; });
  const all = (on: boolean) => {
    if (!st.root) return;
    const o = new Set<string>(["r"]);
    if (on) { const walk = (n: MkvNode, p: string) => n.kids.forEach((k, i) => { if (k.kids.length) { o.add(`${p}/${i}`); walk(k, `${p}/${i}`); } }); walk(st.root, "r"); }
    setOpen(o);
  };
  return (
    <div className="card" data-mkvtree>
      <h3 style={{ justifyContent: "space-between" }}><span>โครงสร้างไฟล์ MKV <InfoTip title="โครงสร้างไฟล์ MKV" tip={TREE_TIP} noAbbr /></span>
        {st.s === "done" && <span className="minirow" style={{ margin: 0 }}>
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => all(true)} data-mkt-all>กางทั้งหมด</button>
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => all(false)} data-mkt-none>พับทั้งหมด</button></span>}</h3>
      {st.s === "idle" && <div className="minirow" style={{ marginTop: 0, alignItems: "center" }}>
        <button type="button" className="btn btn-ghost btn-sm" onClick={load} data-mkvtree-load>อ่านโครงสร้าง</button>
        <span className="small"><Phr>ดูชั้นข้อมูลข้างในไฟล์แบบโปรแกรม mkvinfo ทั้งหัวไฟล์ แทร็ก Chapter แท็ก และสารบัญกระโดด โปรแกรมอ่านอย่างเดียว</Phr></span></div>}
      {st.s === "busy" && <div aria-busy="true" data-mkvtree-busy>{Array.from({ length: 8 }, (_, i) => <Skel key={i} w={`${30 + ((i * 29) % 45)}%`} h={12} style={{ margin: "8px 0", marginLeft: (i % 3) * 18 }} />)}</div>}
      {st.s === "fail" && <div className="stat bad" data-mkvtree-err><CardIcon kind="bad" /><div><b>อ่านโครงสร้างไม่ได้</b><Phr>{st.err ?? ""}</Phr></div></div>}
      {st.s === "done" && st.root && <div className="mkt" data-mkvtree-root>{st.root.kids.map((k, i) => <Row key={i} n={k} depth={0} path={`r/${i}`} open={open} toggle={toggle} />)}</div>}
    </div>
  );
}

const TREE_TIP: Tip = {
  w: "ไฟล์ MKV เก็บข้อมูลเป็นชั้นซ้อนกันแบบ EBML คล้ายกล่องในกล่อง\nแต่ละแถวคือหนึ่งชั้น มีชื่อตามมาตรฐาน Matroska ค่าของชั้นนั้น ตำแหน่งไบต์ และขนาด",
  o: [["กดลูกศร", "กางหรือพับชั้นที่มีชั้นย่อย", "", ""], ["ปุ่ม ⓘ ข้างชื่อ", "อธิบายว่าชั้นนั้นเก็บอะไร และอ่านค่ายังไง", "", ""], ["Cluster กับ CuePoint", "มีเป็นพัน โปรแกรมแสดงแค่ส่วนแรกแล้วบอกจำนวนทั้งหมด", "", ""]],
};
