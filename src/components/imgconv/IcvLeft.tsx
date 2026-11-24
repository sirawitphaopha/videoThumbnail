/* ฝั่งซ้ายของหน้าต่างแปลงซับภาพ ที่เก็บ ตัวแปลง ชนิดไฟล์ ขนาดภาพ เวลา ตำแหน่ง สีและซับบังคับ และค่าเฉพาะ VobSub
   แยกจาก ImgConvDialog.tsx ตอนจัดโครงไฟล์ตามความหมาย (BUGS ข้อ 155 ขั้น 9) เนื้อโค้ดยกมาทั้งก้อน */
import { type ImgReq } from "../../lib/api";
import { LANG_ALL } from "../../lib/langs";
import Dropdown from "../Dropdown";
import InfoTip from "../InfoTip";
import { Phr, Range, Seg, Switch } from "../ui";
import { IbRevert, IcFolder } from "../icons";
import { NumBox } from "../subedit/StyleDialogs";
import { OPTS0, FPS, RES, FILTERS, INTRO_TIP, ENGINE_TIP, OUT_TIP, RES_TIP, SCALE_TIP, FILTER_TIP, FPS_TIP, DELAY_TIP, SHORT_TIP, MOVEY_TIP, RATIO_TIP, MOVEX_TIP, PAL_TIP, INVIS_TIP, FORCED_TIP, FORCEALL_TIP, LANG_TIP, ALPHA_TIP, LUM_TIP, type Opts } from "./icvData";
import type { IcvCtx } from "./icvCtx";

export function IcvLeft({ pg }: { pg: IcvCtx }) {
  const { bdBad, browse, busy, engine, ft, lang, opts, path, ratioBad, req, se, set, setLang, setOpts, tools } = pg;
  const langOpts = LANG_ALL.filter((l) => l[3]).map((l) => ({ value: l[3], label: `${l[0] || l[1]} ${l[3]}` }));
  const row = (label: React.ReactNode, body: React.ReactNode, data?: string) => <div className="icv-row" data-icv-row={data}><span className="icv-lbl">{label}</span>{body}</div>;
  const onOff = (k: "useRes" | "useScale" | "useFps" | "useMove", label: string) => <Switch on={opts[k]} onChange={(v) => set(k, v)} label={label} />;
  return (
    <>
          <div className="icv-l" data-icv-left>
            <div className="icv-intro"><Phr>{`แปลงซับภาพ ${ft} เป็นไฟล์ชนิดอื่น และย่อขยายภาพ เปลี่ยนอัตราเฟรม หรือเลื่อนเวลาได้ในรอบเดียว`}</Phr> <InfoTip title="แปลงซับภาพ" tip={INTRO_TIP} /></div>
            {row("ที่เก็บ", <><span className="icv-path small" title={path} data-icv-path>{path.split(/(?<=[\\/])/).map((s, i) => <span key={i}>{s}<wbr /></span>)}</span>
              <button type="button" className={"btn btn-ghost btn-sm" + (busy ? " btn-wait" : "")} aria-disabled={busy || undefined} onClick={() => { if (!busy) void browse(); }} data-icv-browse><IcFolder size={15} />เปลี่ยนที่เก็บ</button></>)}

            <div className="icv-head">ตัวแปลง<InfoTip title="ตัวแปลงซับภาพ" tip={ENGINE_TIP} />
              <button type="button" className="btn btn-ghost btn-sm icv-reset" onClick={() => setOpts({ ...OPTS0, out: opts.out })} data-icv-reset><IbRevert size={14} />ค่าตั้งต้น</button></div>
            <div className="icv-engs" role="radiogroup" aria-label="ตัวแปลงซับภาพ">
              {([["bdsup", "BDSup2Sub++", "ย่อขยายภาพ เปลี่ยนอัตราเฟรม และย้ายตำแหน่งได้", tools && !tools.bdsupOk ? "ยังไม่มี BDSup2Sub++ ในโฟลเดอร์เครื่องมือ" : bdBad ? (tools?.seconvOk ? "อ่านไฟล์นี้ไม่ได้ จึงใช้ Subtitle Edit แทน" : "อ่านไฟล์นี้ไม่ได้") : undefined],
                ["seconv", "Subtitle Edit", "ใช้แทนเมื่อ BDSup2Sub++ อ่านไฟล์ไม่ได้", tools && !tools.seconvOk ? "ยังไม่มี Subtitle Edit ในโฟลเดอร์เครื่องมือ" : undefined]] as const).map(([k, name, note, no]) => (
                <button key={k} type="button" role="radio" aria-checked={engine === k} aria-disabled={busy || !!no || undefined} title={no}
                  className={"icv-eng" + (engine === k ? " on" : "") + (no ? " off" : "")} onClick={() => { if (!busy && !no) set("engine", k); }} data-icv-engine={k} data-icv-bdbad={k === "bdsup" && bdBad ? "" : undefined}>
                  <span className="icv-engt"><b>{name}</b>{k === "bdsup" && !no && <span className="icv-badge">แนะนำ</span>}</span>
                  <span className="small">{no ?? note}</span>
                </button>))}
            </div>
            {row(<>ชนิดไฟล์<InfoTip title="ชนิดไฟล์" tip={OUT_TIP} /></>, <Seg small label="ชนิดไฟล์" value={opts.out} onChange={(v) => set("out", v)} options={[{ value: "sup", label: "PGS .sup" }, { value: "idx", label: "VobSub .idx" }, { value: "xml", label: "BDN XML" }]} />, "out")}

            {se ? <div className="small icv-note" data-icv-se-note><Phr>Subtitle Edit ทำได้แค่เปลี่ยนชนิดไฟล์ เลื่อนเวลาให้ซับขึ้นช้าลง และเลือกเฉพาะซับบังคับ ตัวเลือกอื่นจึงซ่อนไว้</Phr></div> : <>
              <div className="icv-head">ขนาดภาพ</div>
              {row(<>เปลี่ยนขนาดจอ<InfoTip title="ขนาดจอ" tip={RES_TIP} /></>, <>{onOff("useRes", "เปลี่ยนขนาดจอ")}
                <Dropdown label="ขนาดจอ" value={opts.resolution} disabled={!opts.useRes ? "เปิดสวิตช์ก่อน" : undefined} options={RES.map((r) => ({ value: r.v, label: r.label }))} onChange={(v) => set("resolution", v as ImgReq["resolution"])} /></>, "res")}
              {row(<>ย่อขยายภาพซับ<InfoTip title="ย่อขยายภาพซับ" tip={SCALE_TIP} /></>, <>{onOff("useScale", "ย่อขยายภาพซับ")}
                <label className="icv-f">แนวนอน<NumBox value={opts.scaleX} onChange={(x) => set("scaleX", Math.max(0.5, Math.min(2, x)))} width={60} data="icv-scale-x" />เท่า</label>
                <label className="icv-f">แนวตั้ง<NumBox value={opts.scaleY} onChange={(x) => set("scaleY", Math.max(0.5, Math.min(2, x)))} width={60} data="icv-scale-y" />เท่า</label></>, "scale")}
              {row(<>วิธีย่อขยาย<InfoTip title="วิธีย่อขยาย" tip={FILTER_TIP} /></>, <Dropdown label="วิธีย่อขยาย" value={opts.filter} options={FILTERS.map(([v, l]) => ({ value: v, label: l }))} onChange={(v) => set("filter", v)} />, "filter")}
            </>}

            <div className="icv-head">เวลา</div>
            {!se && row(<>อัตราเฟรม<InfoTip title="อัตราเฟรม" tip={FPS_TIP} /></>, <>{onOff("useFps", "เปลี่ยนอัตราเฟรม")}
              <Dropdown label="อัตราเฟรมต้นทาง" value={opts.fpsSource} disabled={!opts.useFps ? "เปิดสวิตช์ก่อน" : undefined} options={[{ value: "auto", label: "อัตโนมัติ" }, ...FPS.map((f) => ({ value: f, label: `${f} fps` }))]} onChange={(v) => set("fpsSource", v)} />
              <span className="small">เป็น</span>
              <Dropdown label="อัตราเฟรมปลายทาง" value={opts.fpsTarget} disabled={!opts.useFps ? "เปิดสวิตช์ก่อน" : undefined} options={[{ value: "keep", label: "เท่าเดิม" }, ...FPS.map((f) => ({ value: f, label: `${f} fps` }))]} onChange={(v) => set("fpsTarget", v)} /></>, "fps")}
            {row(<>เลื่อนเวลา<InfoTip title="เลื่อนเวลา" tip={DELAY_TIP} /></>, <><NumBox value={opts.delay} onChange={(x) => set("delay", Math.round(Math.max(se ? 0 : -3600000, Math.min(3600000, x))))} width={84} data="icv-delay" />
              <span className="small">{se ? "มิลลิวินาที และเลื่อนให้ช้าลงได้อย่างเดียว" : "มิลลิวินาที"}</span></>, "delay")}
            {!se && row(<>ภาพที่ขึ้นสั้นไป<InfoTip title="ภาพที่ขึ้นสั้นไป" tip={SHORT_TIP} /></>, <><Switch on={opts.fixShort} onChange={(v) => set("fixShort", v)} label="ยืดภาพที่ขึ้นสั้นไป" />
              <span className="small">ขั้นต่ำ</span><NumBox value={opts.minTime} onChange={(x) => set("minTime", Math.round(Math.max(1, Math.min(60000, x))))} width={72} data="icv-min-time" /><span className="small">มิลลิวินาที</span></>, "short")}

            {!se && <>
              <div className="icv-head">ตำแหน่ง</div>
              {row(<>ย้ายแนวตั้ง<InfoTip title="ย้ายแนวตั้ง" tip={MOVEY_TIP} /></>, <>{onOff("useMove", "ย้ายตำแหน่ง")}
                <Dropdown label="ย้ายแนวตั้ง" value={opts.moveY} disabled={!opts.useMove ? "เปิดสวิตช์ย้ายตำแหน่งก่อน" : undefined} onChange={(v) => set("moveY", v as Opts["moveY"])}
                  options={[{ value: "none", label: "ไม่ย้าย" }, { value: "inside", label: "ย้ายเข้าในภาพ" }, { value: "outside", label: "ย้ายออกนอกภาพ" }, { value: "up", label: "เลื่อนขึ้น" }, { value: "down", label: "เลื่อนลง" }]} />
                <label className="icv-f">ระยะ<NumBox value={opts.moveYOffset} onChange={(x) => set("moveYOffset", Math.round(Math.max(-2000, Math.min(2000, x))))} width={60} data="icv-move-y" />จุด</label></>, "move-y")}
              {opts.useMove && (opts.moveY === "inside" || opts.moveY === "outside") && row(<>สัดส่วนภาพหนัง<InfoTip title="สัดส่วนภาพหนัง" tip={RATIO_TIP} /></>, <>
                <NumBox value={opts.ratio} onChange={(x) => set("ratio", x)} width={60} data="icv-ratio" />{ratioBad && <span className="small icv-bad">ต้องกว้างกว่า 1.78</span>}</>, "ratio")}
              {row(<>ย้ายแนวนอน<InfoTip title="ย้ายแนวนอน" tip={MOVEX_TIP} /></>, <>
                <Dropdown label="ย้ายแนวนอน" value={opts.moveX} disabled={!opts.useMove ? "เปิดสวิตช์ย้ายตำแหน่งก่อน" : undefined} onChange={(v) => set("moveX", v as Opts["moveX"])}
                  options={[{ value: "none", label: "ไม่ย้าย" }, { value: "left", label: "ชิดซ้าย" }, { value: "right", label: "ชิดขวา" }, { value: "center", label: "กึ่งกลาง" }, { value: "origin", label: "ตำแหน่งเดิม" }]} />
                <label className="icv-f">ระยะ<NumBox value={opts.moveXOffset} onChange={(x) => set("moveXOffset", Math.round(Math.max(-2000, Math.min(2000, x))))} width={60} data="icv-move-x" />จุด</label></>, "move-x")}

              <div className="icv-head">สีและซับบังคับ</div>
              {row(<>จานสี<InfoTip title="จานสี" tip={PAL_TIP} /></>, <Seg small label="จานสี" value={opts.palette} onChange={(v) => set("palette", v)} options={[{ value: "keep", label: "คงเดิม" }, { value: "create", label: "สร้างใหม่" }, { value: "dither", label: "กระจายจุดสี" }]} />, "palette")}
              {row(<>ภาพที่มองไม่เห็น<InfoTip title="ภาพที่มองไม่เห็น" tip={INVIS_TIP} /></>, <><Switch on={opts.fixInvisible} onChange={(v) => set("fixInvisible", v)} label="แก้ภาพที่มองไม่เห็น" /><span className="small">ให้ภาพที่ใสทั้งภาพกลับมาเห็น</span></>, "invisible")}
            </>}
            {se && <div className="icv-head">ซับบังคับ</div>}
            {row(<>ภาพที่แปลง<InfoTip title="ซับบังคับ" tip={FORCED_TIP} /></>, <Seg small label="ภาพที่แปลง" value={req.forced} onChange={(v) => set("forced", v)}
              options={se ? [{ value: "all", label: "ทุกภาพ" }, { value: "only", label: "เฉพาะซับบังคับ" }] : [{ value: "all", label: "ทุกภาพ" }, { value: "only", label: "เฉพาะซับบังคับ" }, { value: "exclude", label: "ยกเว้นซับบังคับ" }]} />, "forced")}
            {!se && row(<>ป้ายซับบังคับ<InfoTip title="ป้ายซับบังคับ" tip={FORCEALL_TIP} /></>, <Seg small label="ป้ายซับบังคับ" value={opts.forceAll} onChange={(v) => set("forceAll", v)} options={[{ value: "", label: "คงเดิม" }, { value: "set", label: "ติดทุกภาพ" }, { value: "clear", label: "เอาออกทุกภาพ" }]} />, "force-all")}

            {opts.out === "idx" && <>
              <div className="icv-head">เฉพาะ VobSub</div>
              {row(<>ภาษา<InfoTip title="ภาษาของ VobSub" tip={LANG_TIP} /></>, <Dropdown label="ภาษา" value={lang} search hint="พิมพ์ค้น เช่น tha หรือ ไทย" options={langOpts} onChange={setLang} />, "lang")}
              {!se && row(<>เกณฑ์ความทึบ<InfoTip title="เกณฑ์ความทึบ" tip={ALPHA_TIP} /></>, <><div className="icv-range" data-icv-alpha><Range value={opts.alphaThr} min={0} max={255} step={1} onChange={(v) => set("alphaThr", v)} label="เกณฑ์ความทึบ" /></div><span className="icv-val">{opts.alphaThr}</span></>, "alpha")}
              {!se && row(<>เกณฑ์ความสว่าง<InfoTip title="เกณฑ์ความสว่าง" tip={LUM_TIP} /></>, <>
                <label className="icv-f">ระหว่างเข้มกับกลาง<NumBox value={opts.lumLow} onChange={(x) => set("lumLow", Math.round(Math.max(0, Math.min(255, x))))} width={56} data="icv-lum-low" /></label>
                <label className="icv-f">ระหว่างกลางกับสว่าง<NumBox value={opts.lumHi} onChange={(x) => set("lumHi", Math.round(Math.max(0, Math.min(255, x))))} width={56} data="icv-lum-hi" /></label></>, "lum")}
            </>}
          </div>
    </>
  );
}
