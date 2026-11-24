/* การ์ดตัวแปลงเสียง กราฟเสียง และชนิดไฟล์ที่รองรับ
   แยกจาก SettingsPage.tsx ตอนจัดโครงไฟล์ตามความหมาย (BUGS ข้อ 155 ขั้น 8) เนื้อโค้ดยกมาทั้งก้อน */
import { GRAPH_IMG_DEFAULT, encodeApi } from "../../lib/api";
import InfoTip from "../../components/InfoTip";
import { IcFolder, IbTrash, IcRefresh } from "../../components/icons";
import { Keep, Phr, Skel, Switch } from "../../components/ui";
import { fmtSize } from "../../lib/format";
import { EXT_INFO, FILE_TYPES } from "../../lib/fileTypes";
import { GraphImgRows, LatestLine, OvStartRow, SpekResRow } from "./rows";
import EncHistory from "./EncHistory";
import type { SetOpen } from "./setCtx";

export default function SetCardsMedia({ pg }: { pg: SetOpen }) {
  const { cache, checkLatest, clearCache, encChecking, encDir, encs, goSec, latest, latestChecking, openPage, recheckEnc, sec, set, toast } = pg;
  const settings = pg.settings!;
  return (
    <>
      {/* ---------- ตัวแปลงเสียง (มอคอัปเสียงและซับ หัวข้อ 8) · ตัวที่แนบมากับโปรแกรม กับตัวที่วางเองในโฟลเดอร์ตัวแปลง (ตัวที่สัญญาอนุญาตไม่ให้แจก) ---------- */}
      <div className="setcard" data-setcard="encoders" hidden={sec !== "encoders"}>
        <h3 style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10 }}><span>ตัวแปลงเสียง</span>
          <span style={{ display: "flex", gap: 6 }}>
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => encodeApi.openDir().catch((e) => toast({ kind: "bad", title: "เปิดโฟลเดอร์ตัวแปลงไม่ได้", detail: String(e) }))} data-encdir><IcFolder size={15} />เปิดโฟลเดอร์ตัวแปลง</button>
            <button type="button" className={"btn btn-sm " + (encChecking ? "btn-wait" : "btn-ghost")} aria-disabled={encChecking || undefined} onClick={() => { if (!encChecking) void recheckEnc(); }} data-reenc><Keep icon={<IcRefresh size={15} />} all={["กำลังตรวจ", "ตรวจตัวแปลงใหม่"]}>{encChecking ? "กำลังตรวจ" : "ตรวจตัวแปลงใหม่"}</Keep></button>
          </span></h3>
        {/* กดที่อยู่แล้วเปิดโฟลเดอร์ แบบเดียวกับที่เก็บบันทึก (BUGS ข้อ 96 ไล่ที่อยู่ในหน้าตั้งค่า) */}
        <div className="small" style={{ marginBottom: 6 }}>โฟลเดอร์ตัวแปลงที่ใส่เองอยู่ที่ {encDir ? <button type="button" className="pathlink" style={{ display: "inline", marginTop: 0 }} title="กดเพื่อเปิดโฟลเดอร์นี้" onClick={() => encodeApi.openDir().catch((e) => toast({ kind: "bad", title: "เปิดโฟลเดอร์ตัวแปลงไม่ได้", detail: String(e) }))} data-encdir-path>{encDir}</button> : "กำลังอ่านที่อยู่"} <Phr>{"ตอนแปลงใช้ตัวต้นฉบับเป็นค่าตั้งต้นและใช้ ffmpeg เป็นตัวรอง ถ้าวางรุ่นที่ใหม่กว่าตัวที่แนบมา โปรแกรมจะใช้ตัวที่ใหม่กว่า"}</Phr></div>
        <div className="setrow" data-latest-bar><div className="lbl small" style={{ margin: 0 }}>
          {/* Phr กันคำขาดกลางวลี (เดิม "ล่าสุดแล้ว 5" ขาดเป็น ล่าสุด กับ แล้ว 5) */}
          <Phr>{latest ? (() => {
            const n = (s: string) => latest.list.filter((l) => l.state === s).length;
            // ช่องว่างแบบไม่ตัดบรรทัด ( ) ผูกคำกับเลขของมัน ไม่ให้เลขหลุดไปขึ้นบรรทัดใหม่
            const nb = " ";
            return `เช็กรุ่นล่าสุดกับเว็บผู้ทำเมื่อ ${latest.at.toLocaleTimeString("th-TH", { hour: "2-digit", minute: "2-digit" })}${nb}นาฬิกา  ล่าสุดแล้ว${nb}${n("ok") + n("ahead")}${nb}ตัว มีรุ่นใหม่${nb}${n("new")}${nb}ตัว ยังไม่ได้ใส่${nb}${n("missing")}${nb}ตัว และเช็กไม่ได้${nb}${n("error")}${nb}ตัว`;
          })() : "เช็กว่าตัวแปลงแต่ละตัวเป็นรุ่นล่าสุดหรือยัง โดยออกเน็ตไปดูหน้าเว็บผู้ทำเฉพาะตอนกด และไม่โหลดอะไรมาเปลี่ยนเอง"}</Phr></div>
          <button type="button" className={"btn btn-sm " + (latestChecking ? "btn-wait" : "btn-ghost")} aria-disabled={latestChecking || undefined} onClick={() => { if (!latestChecking) void checkLatest(); }} data-enclatest><Keep icon={<IcRefresh size={15} />} all={["กำลังเช็ก", "เช็กรุ่นล่าสุด"]}>{latestChecking ? "กำลังเช็ก" : "เช็กรุ่นล่าสุด"}</Keep></button></div>
        {encs == null
          ? [0, 1, 2, 3, 4].map((i) => <div key={i} className="setrow" aria-busy="true"><Skel w="45%" h={12} /><Skel w={90} h={20} r={10} /></div>)
          : encs.map((e) => (
            <div key={e.name} className="setrow" data-enc={e.name}><div className="lbl">{e.name}<span className="small">{e.ok ? `${e.codecs}${e.version ? ` รุ่น ${e.version}` : ""}${e.coreAudio ? ` ใช้ CoreAudioToolbox ${e.coreAudio}` : ""} ${e.source === "user" ? "จากโฟลเดอร์ตัวแปลง" : "แนบมากับโปรแกรม"}` : `ตัวแปลง ${e.codecs} ${e.problem ? e.problem : "ยังไม่เจอในโฟลเดอร์ตัวแปลง"}`}</span>
              {(() => { const l = latest?.list.find((x) => x.name === e.name); return l ? <LatestLine l={l} onOpen={openPage} /> : null; })()}</div>
              {e.ok ? <span className="toolok">พร้อมใช้งาน</span> : e.problem ? <span className="toolwarn">{e.problem.startsWith("ต้องติดตั้ง iTunes") ? "ต้องติดตั้ง iTunes" : "ขาดไฟล์ประกอบ"}</span> : <span className="toolwarn">ยังไม่ได้ใส่</span>}</div>))}
        <div className="small" style={{ marginTop: 6 }}><Phr>{"fdkaac (AAC ของ Fraunhofer) สัญญาอนุญาตไม่ให้แจกไปกับตัวติดตั้ง จึงต้องโหลดเองแล้ววางทุกไฟล์ที่มากับชุดไว้ในโฟลเดอร์ตัวแปลง แล้วกดตรวจตัวแปลงใหม่  ส่วน qaac (AAC ของ Apple) กับ refalac (ALAC) แนบมากับโปรแกรมแล้ว แต่ qaac ต้องติดตั้ง iTunes ก่อน เพราะใช้ตัวเข้ารหัสของ Apple ที่มากับ iTunes ซึ่งแจกไปกับโปรแกรมไม่ได้ ขณะที่ refalac ไม่ต้องมี iTunes  สำหรับ TAK แนบชุดเดิมของผู้ทำมาทั้งไฟล์ตามเงื่อนไขการแจก แล้วโปรแกรมแตกออกมาใช้เอง และใช้ได้เฉพาะหน้าแปลงเสียง  ดูรายชื่อ รุ่น และสัญญาอนุญาตของตัวแปลงทุกตัวได้ที่หัวข้อขอบคุณของหน้านี้"}</Phr> <button type="button" className="latlink" onClick={() => goSec("thanks")} data-enc-thanks>ไปหัวข้อขอบคุณ</button></div>
        {/* AUDIT ข้อ 137 · เดิมชี้ไปไฟล์ docs/research/codec-เสียง.md ที่มีเฉพาะในโฟลเดอร์โปรเจกต์ ตัวติดตั้งไม่ได้แนบไปด้วย */}
        <EncHistory />
      </div>

      {/* ---------- กราฟเสียง (แคลร์เพิ่ม · ผลอ่านคลื่นที่เก็บลงเครื่อง คิว 8) ---------- */}
      <div className="setcard" data-setcard="graph" hidden={sec !== "graph"}><h3>กราฟเสียง</h3>
        <div className="setrow"><div className="lbl">ซูมเหมือนกันทุกกราฟ<span className="small"><Phr>เปิดแล้วทุกกราฟใช้ช่วงเวลาซูมเดียวกัน ส่วนเมื่อปิดจะซูมเฉพาะกราฟที่ดูอยู่ และกราฟอื่นเริ่มที่ทั้งไฟล์</Phr></span></div>
          <Switch on={settings.graphZoomAll} onChange={(v) => set({ graphZoomAll: v })} label="ซูมเหมือนกันทุกกราฟ" /></div>
        <SpekResRow />
        <OvStartRow />
        <GraphImgRows value={settings.graphImg ?? GRAPH_IMG_DEFAULT} onChange={(graphImg) => set({ graphImg })} />
        <div className="setrow setmain"><div className="lbl">ผลอ่านคลื่นที่เก็บไว้ในเครื่อง<span className="small"><Phr>เปิดไฟล์เดิมซ้ำไม่ต้องอ่านใหม่ ถ้าไฟล์ถูกแก้จะอ่านใหม่เอง และเก็บรวมไม่เกิน 300 MB</Phr></span>
          <span className="small" data-graphcache>{cache ? `ตอนนี้เก็บไว้ ${cache.files} ไฟล์ ขนาดรวม ${fmtSize(cache.bytes)}` : "—"}</span></div>
          <button type="button" className="btn btn-ghost btn-sm" onClick={clearCache} data-clearcache><IbTrash size={15} />ล้าง</button></div>
      </div>

      {/* ---------- ชนิดไฟล์ที่รองรับ (BUGS ข้อ 127 พี่กันสั่ง 15 พ.ย. 2569 "เขียนชนิดไฟล์ทั้งหมดที่โปรแกรมเรารองรับ เเล้วรายละเอียดคร่าวๆ เพราะเราจำไม่ได้")
          รายการนามสกุลมาจากที่เดียวกับที่ทุกหน้าใช้จริง (lib/fileTypes.ts นำเข้าจาก api.ts) ---------- */}
      <div className="setcard" data-setcard="types" hidden={sec !== "types"}><h3>ชนิดไฟล์ที่รองรับ</h3>
        <div className="small" style={{ marginBottom: 6 }}><Phr>รวมนามสกุลไฟล์ที่โปรแกรมเปิดได้และทำออกมาได้ แยกตามชนิด โดยอ่านจากรายการเดียวกับที่ทุกหน้าใช้จริง</Phr></div>
        {FILE_TYPES.map((g) => <div key={g.key} data-ft-group={g.key}>
          <h4 className="imghead">{g.title}</h4>
          {g.rows.map((r) => <div key={r.data} className="ftrow" data-ft-row={r.data}>
            <div className="ftname">{r.name}</div>
            <div className="ftbody"><div className="ftchips">{r.exts.map((e) => { const x = EXT_INFO[e]; const up = e.toUpperCase(); return x ? <InfoTip key={e} title={x.t.toUpperCase() === up ? x.t : `${up} (${x.t})`} tip={{ w: x.w }} btnClass="ftchip" noAbbr>{up}</InfoTip> : <span key={e} className="ftchip">{up}</span>; })}</div>
              <div className="small"><Phr>{r.what}</Phr></div></div>
          </div>)}
        </div>)}
      </div>

    </>
  );
}
