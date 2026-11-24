/* หน้าต่างบอกเหตุตอนกดตัวแปลงที่ยังใช้ไม่ได้ ตารางเทียบต้นฉบับกับไฟล์ที่จะได้ และแถวเลือกชนิด ตัวแปลง แบบตั้งค่า
   แยกจาก CodecPanel.tsx ตอนจัดโครงไฟล์ตามความหมาย (BUGS ข้อ 155 ขั้น 9) เนื้อโค้ดยกมาทั้งก้อน */
import Dialog from "../Dialog";
import InfoTip from "../InfoTip";
import { Phr, Seg } from "../ui";
import { encodeApi } from "../../lib/api";
import { CODECS, type Codec } from "../../lib/codecs";
import { ADV, TIPS, aacKbps } from "../../lib/codecAdv";
import { fmtSize } from "../../lib/format";
import { IbTick, IcSettings } from "../icons";
import type { CpCtx } from "./codecCtx";

export function CodecNoEng({ pg }: { pg: CpCtx }) {
  const { c, engs, noEng, p, setEng, setNoEng } = pg;
  return (
    <>
    {noEng && (() => {
      // กดตัวแปลงที่ยังใช้ไม่ได้ ขึ้นหน้าต่างบอกเหตุกับทางแก้ (เดิมกดแล้วเงียบ)
      const reg = noEng === "qaac" ? "qaac64" : noEng === "native" ? (c.native ?? "") : noEng;
      const info = p.encoders?.find((e) => e.name === reg);
      const itunes = noEng === "qaac" && !!info?.problem?.startsWith("ต้องติดตั้ง iTunes");
      const label = engs.find((e) => e.value === noEng)?.label ?? reg;
      const close = () => setNoEng(null);
      return (
        <Dialog open onClose={close} confirm width={520} title={itunes ? "AAC ของ Apple ต้องติดตั้ง iTunes ก่อน" : `ยังไม่ได้ใส่ ${label}`}
          // ปุ่มสามปุ่มกว้างเท่ากัน (พี่กันสั่ง 10 พ.ย. 2569 "เท่ากันที") · แบ่งเต็มแถวสามส่วนเท่ากัน (พี่กันสั่ง 11 พ.ย. 2569 "เเบ่งสามส่วนเท่ากัน")
          actions={<div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 8, width: "100%" }} data-noeng-acts>
            <button type="button" className="btn btn-ghost btn-sm" onClick={close}>ปิด</button>
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => { setEng("ffmpeg"); close(); }} data-noeng-ffmpeg>ใช้ ffmpeg แทน</button>
            <button type="button" className="btn btn-main btn-sm" onClick={() => { void (itunes ? encodeApi.openItunes() : encodeApi.openPage(reg)).catch(() => {}); }} data-noeng-open>{itunes ? "เปิดหน้าโหลด iTunes" : `เปิดหน้าโหลด ${reg}`}</button>
          </div>}>
          <div style={{ display: "flex", flexDirection: "column", gap: 8, fontSize: 13.5 }} data-noeng={noEng}>
            {itunes ? <>
              <p style={{ margin: 0 }}><Phr>{"qaac ไม่มีตัวเข้ารหัสอยู่ในตัว ต้องเรียกใช้ตัวเข้ารหัส AAC ของ Apple ที่มากับ iTunes แต่เครื่องนี้ยังไม่มี iTunes จึงแปลงด้วย qaac ไม่ได้"}</Phr></p>
              <p style={{ margin: 0 }}><Phr>{"กดเปิดหน้าโหลด เลือกโหลด iTunes สำหรับ Windows ติดตั้งให้เสร็จ แล้วเปิดหน้าต่างนี้ใหม่ โปรแกรมจะหาเจอเอง ไม่ต้องตั้งค่าเพิ่ม"}</Phr></p>
              <p className="small" style={{ margin: 0 }}><Phr>{"ระหว่างนี้ใช้ ffmpeg แปลง AAC แทนได้ แต่เสียงด้อยกว่าตัวของ Apple เมื่อบิตเรตต่ำ ส่วน ALAC ใช้ refalac ได้โดยไม่ต้องมี iTunes"}</Phr></p>
            </> : <>
              <p style={{ margin: 0 }}><Phr>{info?.problem ?? `ยังไม่เจอ ${reg}.exe ในโฟลเดอร์ตัวแปลง ให้โหลดชุดของผู้ทำ แล้ววางทุกไฟล์ที่มากับชุดไว้ในโฟลเดอร์ตัวแปลง ซึ่งเปิดได้จากปุ่มในหน้าตั้งค่า หัวข้อตัวแปลง`}</Phr></p>
              {noEng === "qaac" && <p className="small" style={{ margin: 0 }}><Phr>{"qaac ต้องติดตั้ง iTunes ด้วย"}</Phr></p>}
              <p className="small" style={{ margin: 0 }}><Phr>{"ระหว่างนี้ใช้ ffmpeg แทนได้"}</Phr></p>
            </>}
          </div>
        </Dialog>
      );
    })()}
    </>
  );
}

export function CodecHead({ pg }: { pg: CpCtx }) {
  const { c, cols, ctx, engUse, engs, est1, headAudio, live, p, pickCodec, probed, setEng, setNoEng, setTab, sizePct, t, tab } = pg;
  const cmpCard = (
    <div className="cpcmp" data-cpcmp>
      <div className="cpcmp-grid" style={{ gridTemplateColumns: `auto repeat(${cols.length}, minmax(0, 1fr))` }}>
        <span className="h"></span>{cols.map((x) => <span key={x.k} className="h">{x.k}</span>)}
        <span className="rl">ต้นฉบับ</span>{cols.map((x) => <span key={x.k} className="a" data-cmpa={x.k}>{x.a}</span>)}
        <span className="rl">ไฟล์ที่จะได้<InfoTip title="ต้นฉบับกับไฟล์ที่จะได้" tip={{ w: "เทียบเสียงต้นฉบับกับไฟล์ที่จะได้ตามค่าที่ตั้งอยู่ตอนนี้ ช่องที่เปลี่ยนจะเน้นสี", o: [
          ["บิตเรตกับขนาด", "โปรแกรมลองแปลงจริง 4 ช่วง ช่วงละ 10 วินาที แล้วคูณขยายเป็นทั้งเพลง (เพลงไม่เกิน 1 นาทีแปลงทั้งเพลง) คลาดจากของจริงราวไม่เกิน 3% ระหว่างรอผลเป็นตัวเลขคร่าว ๆ จากสูตร", "", ""],
          ["บิต", "มีเฉพาะแบบไม่เสียคุณภาพ เพราะแบบเสียคุณภาพเก็บเสียงคนละวิธีจึงไม่นับเป็นบิต", "", ""],
        ] }} /></span>
        {cols.map((x) => { const on = x.a !== x.b; return <span key={x.k} className={"b" + (on ? " on" : "")} data-cmpb={x.k} data-changed={on || undefined}>{x.approx && x.b !== "—" ? "≈ " : ""}{x.b}</span>; })}
      </div>
      {sizePct != null && <span className={"cpcmp-sum" + (sizePct > 0 ? " up" : "")} title={probed ? "จากการลองแปลงจริง 4 ช่วง ช่วงละ 10 วินาที แล้วคูณขยาย" : "ตัวเลขคร่าว ๆ จากสูตร กำลังลองแปลงจริงให้แม่นขึ้น"} data-cmpsum data-cmpsrc={probed ? "probe" : est1 != null ? "src" : "formula"}>{sizePct <= 0 ? `เล็กลงราว ${-sizePct}%` : `ใหญ่ขึ้นราว ${sizePct}%`}</span>}
    </div>
  );
  return (
    <>
        {t.codec && cmpCard}
        <div className="cp2">
          <div><div className="small ilbl" style={{ marginBottom: 4 }}><b style={{ color: "var(--txt2)" }}>Lossy</b>&nbsp;(เสียคุณภาพ ไฟล์เล็ก)<InfoTip title="Lossy" tip={TIPS.lossy} /></div>
            <Seg small label="ชนิดแบบเสียคุณภาพ" value={c.lossless ? ("" as Codec["id"]) : c.id} onChange={pickCodec} options={CODECS.filter((x) => !x.lossless).map((x) => ({ value: x.id, label: x.name }))} /></div>
          <div><div className="small ilbl" style={{ marginBottom: 4 }}><b style={{ color: "var(--txt2)" }}>Lossless</b>&nbsp;(ไม่เสียคุณภาพ)<InfoTip title="Lossless" tip={TIPS.lossless} /></div>
            <Seg small label="ชนิดแบบไม่เสียคุณภาพ" value={c.lossless ? c.id : ("" as Codec["id"])} onChange={pickCodec} options={CODECS.filter((x) => x.lossless && (!x.only || p.convertPage)).map((x) => ({ value: x.id, label: x.name }))} /></div>
        </div>
        <div className="small ilbl" style={{ display: "block" }}><b style={{ color: "var(--txt)" }}>{c.name}</b> <span className="ab">({c.full})</span><InfoTip title={c.name} tip={ADV[c.id].tip} /> <Phr>{c.brief}</Phr></div>
        <div className="cpsep" aria-hidden="true" />
        <div className="cp2">
          <div><div className="small ilbl" style={{ marginBottom: 4 }}><b style={{ color: "var(--txt2)" }}>Encoder</b>&nbsp;(ตัวแปลง)<InfoTip title="Encoder" tip={TIPS.engine} /></div>
            <Seg small label="ตัวแปลง" value={engUse} onChange={(v) => { if (engs.find((e) => e.value === v)?.ok) setEng(v); else setNoEng(v); }}
              options={engs.map((e) => ({ value: e.value, label: e.ok ? e.label : `${e.label} (${e.miss ?? "ยังไม่ได้ใส่"})` }))} /></div>
          <div><div className="cphead"><span className="small ilbl"><b style={{ color: "var(--txt2)" }}>แบบตั้งค่า</b><InfoTip title="แบบง่ายกับขั้นสูง" tip={TIPS.mode} /></span>
              {/* ขนาดของแทร็กเสียงล้วน เท่ากับการ์ดของชุดที่เลือก ส่วนตารางเทียบด้านบนเป็นขนาดไฟล์ที่รวมรูปปกที่ติดไปด้วย */}
              <span className="small" data-headsz>ขนาดที่คาดของแทร็กนี้ <b style={{ color: "var(--txt)" }}>{headAudio ? `ราว ${fmtSize(headAudio)}` : "ไม่รู้ความยาวแทร็ก"}</b>
                {c.id === "aac" && ctx ? `, เฉลี่ยราว ${Math.round(aacKbps(live, engUse, ctx.ch))} kbps` : ""}</span></div>
            <Seg small label="แบบตั้งค่า" value={tab} onChange={setTab} options={[{ value: "easy", label: <><IbTick size={14} />แบบง่าย</> }, { value: "adv", label: <><IcSettings size={14} />ขั้นสูง</> }]} /></div>
        </div>
    </>
  );
}
