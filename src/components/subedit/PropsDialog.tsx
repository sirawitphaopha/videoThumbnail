/* หน้าต่างคุณสมบัติสคริปต์ (BUGS ข้อ 113 · แบบ dialog_properties.cpp ของ Aegisub)
   ช่องข้อความ 8 ช่องของ [Script Info] · ความละเอียดของสคริปต์ (PlayRes) กับ Layout (LayoutRes) พร้อมปุ่มจากวิดีโอ · YCbCr Matrix พร้อมปุ่มจากวิดีโอ
   ตัดบรรทัด (WrapStyle 0 ถึง 3) · ขนาดเส้นขอบและเงา (ScaledBorderAndShadow)
   ต่างจาก Aegisub ที่เดียว Aegisub กดตกลงแล้วเขียนค่าตั้งต้นของทุกช่องลงไฟล์แม้ไม่ได้แก้ (เช่น WrapStyle: 0 ScaledBorderAndShadow: no)
   ของเราเขียนเฉพาะช่องที่แก้ ไฟล์ที่เปิดแล้วกดตกลงเฉย ๆ เหมือนเดิมทุกไบต์ (แคลร์ตั้ง) · ช่องที่ลบจนว่างลบบรรทัดนั้นออกแบบ SetScriptInfo
   ทั้งหน้าต่างเป็นการแก้ขั้นเดียว เลิกทำได้ทีเดียว */
import { useEffect, useRef, useState } from "react";
import { vidApi, type SubDoc } from "../../lib/api";
import type { Tip } from "../../lib/codecAdv";
import { edit } from "../../lib/subEdit";
import { infoGet, infoPut } from "../../lib/subStyle";
import Dialog from "../Dialog";
import Dropdown from "../Dropdown";
import InfoTip from "../InfoTip";
import { Switch } from "../ui";

/** ช่องข้อความ ชื่อในไฟล์ ป้ายบนจอ (คำไทยตาม Aegisub ภาษาไทยที่พี่กันใช้ คำเทคนิคเป็นคำอังกฤษ) */
const TEXT_KEYS: [string, string][] = [
  ["Title", "หัวเรื่อง"],
  ["Original Script", "สคริปต์ต้นฉบับ"],
  ["Original Translation", "ผู้แปล"],
  ["Original Editing", "ผู้แก้ไข"],
  ["Original Timing", "Timing"],
  ["Synch Point", "Synch point"],
  ["Script Updated By", "อัปเดตโดย"],
  ["Update Details", "รายละเอียดการอัปเดต"],
];
/** ชื่อที่ใช้ได้ของ YCbCr Matrix (agi::ycbcr::valid_header_strings) */
const YCC = ["None", "TV.601", "PC.601", "TV.709", "PC.709", "TV.FCC", "PC.FCC", "TV.240M", "PC.240M"] as const;
const WRAP: [string, string][] = [
  ["0", "0 ตัดเอง บรรทัดบนกว้างกว่า"],
  ["1", "1 ตัดเฉพาะตรงที่ใส่ \\N"],
  ["2", "2 ไม่ตัดเอง \\n กับ \\N ขึ้นบรรทัด"],
  ["3", "3 ตัดเอง บรรทัดล่างกว้างกว่า"],
];

const SCRIPT_TIP: Tip = {
  w: "ข้อมูลของซับที่เก็บไว้ในหัวไฟล์ ไม่ขึ้นบนภาพตอนเล่นหนัง ช่องที่เว้นว่างจะไม่ถูกเขียนลงไฟล์",
  o: [
    ["หัวเรื่อง", "ชื่อของซับหรือชื่อเรื่อง โปรแกรมเล่นบางตัวใช้เป็นชื่อแทร็ก", "", ""],
    ["สคริปต์ต้นฉบับ ผู้แปล ผู้แก้ไข Timing", "ชื่อคนทำซับแต่ละหน้าที่ ใส่ไว้ให้เครดิต โดย Timing คือคนที่ตั้งเวลาขึ้นและหายของซับ", "", ""],
    ["Synch point", "จุดในหนังที่ใช้อ้างอิงเวลาของซับ เช่น นับจากโลโก้ค่ายหนัง ช่วยคนที่เอาซับไปใช้กับหนังอีกฉบับ", "", ""],
    ["อัปเดตโดย และรายละเอียดการอัปเดต", "ชื่อคนที่แก้ซับครั้งล่าสุด และสิ่งที่แก้ไป", "", ""],
  ],
};
const RES_TIP: Tip = {
  w: "ขนาดภาพที่ซับใช้วัดตำแหน่งและขนาดของทุกอย่าง",
  o: [
    ["สคริปต์ (PlayRes)", "ขนาดภาพที่ใช้วัดตำแหน่ง ขนาดตัวอักษร ขอบ และเงาของทุกบรรทัด ควรเท่าขนาดภาพของหนัง", "", "เปลี่ยนช่องนี้อย่างเดียวแล้วซับจะใหญ่หรือเล็กลง ถ้าอยากให้หน้าตาเท่าเดิมใช้เปลี่ยนความละเอียดของคำบรรยายแทน"],
    ["Layout (LayoutRes)", "ขนาดภาพของหนังตอนทำซับ ตัวเล่น libass ใช้ค่านี้คิดสัดส่วนของตัวอักษรเมื่อภาพหนังถูกยืด เว้นว่างได้", "", ""],
    ["จากวิดีโอ", "ใส่ขนาดภาพของหนังที่เปิดอยู่ให้", "", ""],
  ],
};
const YCC_TIP: Tip = {
  w: "บอกตัวเล่นว่าสีของซับต้องแปลงด้วยวิธีเดียวกับสีของหนังแบบไหน ตั้งไม่ตรงแล้วสีซับจะเพี้ยนจากสีที่เลือกไว้เล็กน้อย",
  o: [
    ["TV.709", "หนังความละเอียด HD ขึ้นไปเกือบทั้งหมด", "", ""],
    ["TV.601", "หนังความละเอียดต่ำแบบ DVD", "", ""],
    ["None", "ไม่แปลงสี ใช้สีตามที่ตั้งในไฟล์ตรง ๆ", "", ""],
    ["จากวิดีโอ", "อ่านชนิดสีจากหนังที่เปิดอยู่แล้วเลือกให้แบบ Aegisub ถ้าหนังไม่ได้บอกไว้จะได้ None", "", ""],
  ],
  r: "กดจากวิดีโอ",
};
const WRAP_TIP: Tip = {
  w: "วิธีตัดบรรทัดเมื่อข้อความยาวเกินความกว้างของภาพ \\N คือขึ้นบรรทัดใหม่ที่พิมพ์ไว้เอง",
  o: [
    ["0", "ตัดคำเองให้แต่ละบรรทัดยาวพอ ๆ กัน โดยบรรทัดบนกว้างกว่า", "", ""],
    ["1", "ตัดคำที่ท้ายบรรทัดเมื่อยาวเกินภาพ และขึ้นบรรทัดใหม่ตรงที่ใส่ \\N", "", ""],
    ["2", "ไม่ตัดคำเลย ข้อความยาวเลยขอบภาพได้ ขึ้นบรรทัดเฉพาะตรงที่ใส่ \\n หรือ \\N", "", ""],
    ["3", "เหมือนแบบ 0 แต่บรรทัดล่างกว้างกว่า", "", ""],
  ],
  r: "0",
};
const SCALE_TIP: Tip = {
  w: "เปิดแล้วขอบและเงาของตัวอักษรขยายหรือย่อตามขนาดภาพที่แสดงจริงเหมือนตัวอักษร ปิดแล้วขนาดขอบกับเงาขึ้นกับตัวเล่นแต่ละตัว",
  r: "เปิด",
};

type Vals = Record<string, string>;
const KEYS = [...TEXT_KEYS.map((x) => x[0]), "PlayResX", "PlayResY", "LayoutResX", "LayoutResY", "YCbCr Matrix", "WrapStyle", "ScaledBorderAndShadow"];

/** ค่าจากไฟล์ · ช่องที่ไม่มีเป็นข้อความว่าง ยกเว้น WrapStyle กับขนาดเส้นขอบที่ Aegisub อ่านเป็น 0 กับ no */
function read(d: SubDoc): Vals {
  const v: Vals = {};
  for (const k of KEYS) v[k] = infoGet(d, k) ?? "";
  if (!/^[0-3]$/.test(v.WrapStyle)) v.WrapStyle = "0";
  v.ScaledBorderAndShadow = v.ScaledBorderAndShadow.toLowerCase() === "yes" ? "yes" : "no";
  return v;
}

export default function PropsDialog(p: { open: boolean; onClose: () => void; doc: SubDoc; video: [number, number] | null; movie: string | null; onDone: (msg: string) => void }) {
  const [v, setV] = useState<Vals>({});
  const [init, setInit] = useState<Vals>({});
  const [ycc, setYcc] = useState<{ busy: boolean; err?: string }>({ busy: false });
  const first = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (!p.open) return;
    const r = read(p.doc);
    setV(r); setInit(r); setYcc({ busy: false });
    const t = setTimeout(() => first.current?.focus(), 0);
    return () => clearTimeout(t);
  }, [p.open]); // eslint-disable-line react-hooks/exhaustive-deps
  const set = (k: string, x: string) => setV((o) => ({ ...o, [k]: x }));
  const numBad = (k: string) => !!v[k] && !/^\d+$/.test(v[k].trim());
  const bad = ["PlayResX", "PlayResY", "LayoutResX", "LayoutResY"].find(numBad);
  const changed = KEYS.filter((k) => (v[k] ?? "") !== (init[k] ?? ""));
  const why = bad ? "ความละเอียดต้องเป็นจำนวนเต็ม" : undefined;
  const noVid = p.video ? undefined : "ยังไม่มีวิดีโอ";
  const ok = () => {
    if (why) return;
    if (changed.length) {
      // ค่าความละเอียดตัดช่องว่างหน้าหลัง ข้อความอื่นเก็บตามที่พิมพ์แบบ Aegisub
      edit("แก้คุณสมบัติสคริปต์", (d) => changed.reduce((x, k) => infoPut(x, k, k.startsWith("PlayRes") || k.startsWith("LayoutRes") ? v[k].trim() : v[k]), d));
      p.onDone(`แก้คุณสมบัติสคริปต์แล้ว ${changed.length} ช่อง`);
    }
    p.onClose();
  };
  const yccFromVideo = () => {
    if (!p.movie) { set("YCbCr Matrix", "None"); return; }
    setYcc({ busy: true });
    vidApi.colorspace(p.movie).then((x) => { set("YCbCr Matrix", x); setYcc({ busy: false }); }, (e) => setYcc({ busy: false, err: String(e) }));
  };
  const resRow = (label: string, kx: string, ky: string, data: string, tip?: React.ReactNode) => (
    <div className="se-drow">
      <span className="se-dlbl">{label}{tip}</span>
      <input className={"inp se-num4" + (numBad(kx) ? " err" : "")} value={v[kx] ?? ""} onChange={(e) => set(kx, e.target.value)} aria-label={`${label} กว้าง`} data-pr={kx} />
      <span>×</span>
      <input className={"inp se-num4" + (numBad(ky) ? " err" : "")} value={v[ky] ?? ""} onChange={(e) => set(ky, e.target.value)} aria-label={`${label} สูง`} data-pr={ky} />
      <button type="button" className={"btn btn-ghost btn-sm" + (noVid ? " btn-wait" : "")} aria-disabled={!!noVid || undefined}
        title={noVid ?? `ขนาดภาพของหนัง ${p.video![0]} × ${p.video![1]}`} onClick={() => { if (p.video) { set(kx, String(p.video[0])); set(ky, String(p.video[1])); } }} data-pr-video={data}>จากวิดีโอ</button>
    </div>
  );
  const ycv = v["YCbCr Matrix"] ?? "";
  return (
    <Dialog open={p.open} onClose={p.onClose} kind="work" title="คุณสมบัติสคริปต์" width={640}
      actions={<>
        <button type="button" className="btn btn-ghost" onClick={p.onClose}>ยกเลิก</button>
        <button type="button" className={"btn " + (why ? "btn-wait" : "btn-main")} aria-disabled={!!why || undefined} title={why ?? (changed.length ? `เขียน ${changed.length} ช่องที่แก้ลงซับ เลิกทำได้` : "ยังไม่ได้แก้อะไร กดแล้วปิดหน้าต่าง")} onClick={ok} data-pr-ok>ตกลง</button>
      </>}>
      <div className="se-dummy se-cdlg se-props" data-props>
        <div className="se-prhead">สคริปต์<InfoTip title="ข้อมูลของสคริปต์" tip={SCRIPT_TIP} /></div>
        <div className="se-prgrid">
          {TEXT_KEYS.map(([k, label], i) => (
            <label key={k} className={"se-prf" + (k === "Title" || k === "Update Details" ? " wide" : "")}>
              <span className="se-dlbl">{label}</span>
              <input ref={i === 0 ? first : undefined} className="inp" value={v[k] ?? ""} onChange={(e) => set(k, e.target.value)} data-pr={k} />
            </label>
          ))}
        </div>
        <div className="se-prhead">ความละเอียด<InfoTip title="ความละเอียด" tip={RES_TIP} /></div>
        {resRow("สคริปต์", "PlayResX", "PlayResY", "play")}
        {resRow("Layout", "LayoutResX", "LayoutResY", "layout")}
        <div className="se-drow">
          <span className="se-dlbl">YCbCr Matrix<InfoTip title="YCbCr Matrix" tip={YCC_TIP} /></span>
          <Dropdown label="YCbCr Matrix" value={ycv} display={() => ycv || "—"} sizes={["TV.240M"]}
            options={[...(ycv && !YCC.includes(ycv as typeof YCC[number]) ? [{ value: ycv, label: ycv }] : []), ...(ycv ? [] : [{ value: "", label: "—" }]), ...YCC.map((x) => ({ value: x as string, label: x }))]}
            onChange={(x) => set("YCbCr Matrix", x)} />
          <button type="button" className={"btn btn-ghost btn-sm" + (noVid || ycc.busy ? " btn-wait" : "")} aria-disabled={!!noVid || ycc.busy || undefined}
            title={noVid ?? (ycc.busy ? "กำลังอ่านชนิดสีของหนัง…" : "อ่านชนิดสีจากหนังที่เปิดอยู่")} onClick={() => { if (!noVid && !ycc.busy) yccFromVideo(); }} data-pr-video="ycc">จากวิดีโอ</button>
          {ycc.err && <span className="small se-prerr" role="alert" title={ycc.err}>อ่านชนิดสีไม่ได้</span>}
        </div>
        <div className="se-prhead">ตัวเลือก</div>
        <div className="se-drow">
          <span className="se-dlbl">การตัดบรรทัด<InfoTip title="การตัดบรรทัด (WrapStyle)" tip={WRAP_TIP} /></span>
          <Dropdown label="การตัดบรรทัด" value={v.WrapStyle ?? "0"} options={WRAP.map(([value, label]) => ({ value, label }))} onChange={(x) => set("WrapStyle", x)} />
        </div>
        <div className="se-drow">
          <span className="se-dlbl" />
          <span className="se-dsw2"><Switch on={v.ScaledBorderAndShadow === "yes"} onChange={(x) => set("ScaledBorderAndShadow", x ? "yes" : "no")} label="ขนาดเส้นขอบและเงา" />ขนาดเส้นขอบและเงาตามภาพ<InfoTip title="ขนาดเส้นขอบและเงา (ScaledBorderAndShadow)" tip={SCALE_TIP} /></span>
        </div>
      </div>
    </Dialog>
  );
}
