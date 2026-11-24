/* แบบง่าย ชุดค่าสี่ชุดกับความเร็ว Gain ความดังมาตรฐาน และขั้นสูง การ์ดละช่องที่มีแถบเลื่อนเป็นขั้นกับช่องพิมพ์ค่าเอง
   แยกจาก CodecPanel.tsx ตอนจัดโครงไฟล์ตามความหมาย (BUGS ข้อ 155 ขั้น 9) เนื้อโค้ดยกมาทั้งก้อน */
import { useEffect, useState } from "react";
import Dropdown from "../Dropdown";
import InfoTip, { abbrer } from "../InfoTip";
import { Phr, Range, Seg } from "../ui";
import { TIPS, advSize, type Card } from "../../lib/codecAdv";
import { fmtSize } from "../../lib/format";
import { presetVals, fmtNum, nearestIdx, arrange } from "./codecCalc";
import type { CpCtx } from "./codecCtx";

/** ช่องพิมพ์ค่าเอง · พิมพ์ค่าที่ไม่อยู่ในขั้น แถบชี้ขั้นที่ใกล้ที่สุด · ช่องที่ตัวแปลงปัดค่าเอง (snap) ปัดให้เห็นเลย */
function VBox({ k, value, onCommit }: { k: Card; value: number; onCommit: (v: number) => void }) {
  const show = fmtNum(value, k.signed);
  const [txt, setTxt] = useState(show);
  useEffect(() => setTxt(show), [show]);
  const stops = k.stops!;
  const w = Math.max(...stops.map((s) => fmtNum(s, k.signed).length), k.free ? String(k.free[1]).length : 0) + 0.8;
  const commit = () => {
    let x = parseFloat(txt.replace("−", "-").replace(/[^\d.+-]/g, ""));
    if (Number.isNaN(x)) x = value;
    const [lo, hi] = k.free ?? [stops[0], stops[stops.length - 1]];
    x = Math.round(Math.min(hi, Math.max(lo, x)));
    const v = k.free && !k.snap ? x : stops[nearestIdx(stops, x)];
    setTxt(fmtNum(v, k.signed));
    if (v !== value) onCommit(v);
  };
  return (
    <span className="vbox">{k.pre && <span className="px">{k.pre}</span>}
      <input value={txt} inputMode="numeric" aria-label={`พิมพ์ค่า ${k.label} เอง`} style={{ width: `${w}ch` }} data-vin={k.key}
        onChange={(e) => setTxt(e.target.value)} onBlur={commit} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); commit(); } }} />
      {k.unit && <span className="u">{k.unit}</span>}</span>
  );
}

/** แถบเลื่อนเป็นขั้นตามค่าที่ตัวแปลงใช้ได้จริง ขีดทุกขั้น ป้ายเฉพาะขั้นหลัก */
function StepCtl({ k, value, onChange }: { k: Card; value: number; onChange: (v: number) => void }) {
  const stops = k.stops!, n = stops.length, major = k.major ?? stops;
  const pct = (i: number) => `${(i / (n - 1)) * 100}%`;
  const lbl = (s: number) => (k.pre ?? "") + fmtNum(s, k.signed);
  return (
    <div className="stepw" data-step={k.key}>
      <Range label={k.label} min={0} max={n - 1} value={nearestIdx(stops, value)} onChange={(i) => onChange(stops[i])} format={(i) => `${lbl(stops[i])}${k.unit ? " " + k.unit : ""}`} />
      <div className="ticks" aria-hidden="true">{stops.map((s, i) => <i key={s} style={{ left: pct(i) }} className={major.includes(s) ? "mj" : undefined} />)}</div>
      <div className="tlabels" aria-hidden="true">{major.map((s) => <span key={s} style={{ left: pct(stops.indexOf(s)) }}>{lbl(s)}</span>)}</div>
    </div>
  );
}

export function CodecEasy({ pg }: { pg: CpCtx }) {
  const { c, ctxOf, engUse, gain, loud, pi, pickPreset, setGain, setLoud, setSpeed, sizeFix, speed, speedOpts, srcCh } = pg;
  return (
    <>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 8 }} role="radiogroup" aria-label="ชุดค่า">
            {c.presets.map((x, i) => {
              const pv = presetVals(c, i, srcCh), pc = ctxOf(pv);
              const sz0 = pc ? advSize(c.id, engUse, pv, pc) : null;
              const sz = sz0 ? sz0 * sizeFix : sz0;
              return (
                <button key={x.label} type="button" role="radio" aria-checked={i === pi} onClick={() => pickPreset(i)} data-preset={i}
                  className={"btn preset" + (i === pi ? " on" : "")} style={{ height: "auto", flexDirection: "column", alignItems: "flex-start", gap: 2, padding: "8px 10px", textAlign: "left" }}>
                  <b style={{ fontSize: 13.5 }}>{x.label}</b>
                  <span className="small" style={{ color: "var(--txt2)" }}>{x.detail}</span>
                  <span className="small">{sz ? `ทั้งแทร็กราว ${fmtSize(sz)}` : ""}</span>
                </button>
              );
            })}
          </div>
          <div className="small"><Phr>{`${pi < 0 ? "ค่าที่แก้ในขั้นสูงยังไม่ตรงกับชุดไหน กดชุดค่าเพื่อกลับไปใช้ชุดนั้นได้ " : ""}ชุดค่าตั้งตามคำแนะนำของผู้ทำตัวแปลง กดขั้นสูงเพื่อดูหรือแก้ทุกตัวเลือกของชุดที่เลือก`}</Phr></div>
          <div className="cpsep" aria-hidden="true" />
          <div className="cp3" data-extra>
            <div><div className="small ilbl" style={{ marginBottom: 4 }}><b style={{ color: "var(--txt2)" }}>ความเร็วเสียง</b>&nbsp;(เสียงที่เหลื่อมเพิ่มขึ้นเรื่อย ๆ)<InfoTip title="ความเร็วเสียง" tip={TIPS.speed} /></div>
              <Dropdown label="ความเร็วเสียง" value={speed} onChange={setSpeed} options={speedOpts} /></div>
            <div><div className="small ilbl" style={{ marginBottom: 4 }}><b style={{ color: "var(--txt2)" }}>Gain</b>&nbsp;(ปรับความดัง dB)<InfoTip title="Gain" tip={TIPS.gain} /></div>
              <div className="delay"><button type="button" aria-label="ลดความดัง 1 dB" onClick={() => setGain((g) => Math.max(-12, g - 1))}>−</button>
                <span className="avnum" style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", flex: 1 }} data-gain>{gain > 0 ? `+${gain}` : gain} dB</span>
                <button type="button" aria-label="เพิ่มความดัง 1 dB" onClick={() => setGain((g) => Math.min(12, g + 1))}>+</button></div></div>
            <div><div className="small ilbl" style={{ marginBottom: 4 }}><b style={{ color: "var(--txt2)" }}>Loudness normalize</b>&nbsp;(ความดังมาตรฐาน)<InfoTip title="Loudness normalize" tip={TIPS.loud} /></div>
              <div style={{ display: "flex" }}><Seg small label="ความดังมาตรฐาน" value={loud ? "on" : "off"} onChange={(v) => setLoud(v === "on")}
                options={[{ value: "off", label: "Off" }, { value: "on", label: "EBU R128 −23 LUFS" }]} /></div></div>
          </div>
    </>
  );
}

export function CodecAdv({ pg }: { pg: CpCtx }) {
  const { c, ctx, engUse, gain, live, loud, optsOf, setGain, setLoud, setSpeed, setVal, shown, sizeFix, speed, speedOpts } = pg;
  const cardEl = (k: Card, span: number) => {
    const ex = abbrer();
    const label = ex(k.label);
    const v = live[k.key];
    let ctl: React.ReactNode = null, head: React.ReactNode = null;
    if (k.kind === "step") {
      ctl = <StepCtl k={k} value={Number(v)} onChange={(x) => setVal(k.key, x)} />;
      head = <VBox k={k} value={Number(v)} onCommit={(x) => setVal(k.key, x)} />;
    } else if (k.kind === "seg") {
      ctl = <div style={{ display: "flex", flexWrap: "wrap" }}><Seg small label={k.label} value={String(v)} onChange={(x) => setVal(k.key, x)} options={optsOf(k)} /></div>;
    } else {
      ctl = <div style={{ display: "flex" }}><Dropdown label={k.label} value={String(v)} onChange={(x) => setVal(k.key, x)} options={optsOf(k)} /></div>;
    }
    let size: React.ReactNode;
    if (typeof k.size === "function") {
      const bytes0 = ctx ? k.size(live, ctx) : null;
      const bytes = bytes0 ? bytes0 * sizeFix : bytes0;
      const avg = ctx && bytes && ["tvbr", "vbr", "vbrq"].includes(k.key) ? Math.round(bytes * 8 / ctx.secs / 1000) : null;
      size = <div className="asz"><span>ขนาดที่คาด</span><b data-sz={k.key}>{bytes ? `ทั้งแทร็กราว ${fmtSize(bytes)}` : "ไม่รู้ความยาวแทร็ก"}</b>{avg ? <span className="avg">เฉลี่ยราว {avg} kbps</span> : null}</div>;
    } else if (k.size) size = <div className="asz"><span>ขนาดไฟล์</span><div>{ex(k.size)}</div></div>;
    else size = <div className="asz none">ไม่เปลี่ยนขนาดไฟล์</div>;
    return (
      <div className="acard" key={k.key + k.label} data-card={k.key} style={{ gridColumn: `span ${span}` }}>
        <div className="ach"><span className="lbl ilbl">{label}<InfoTip title={k.label} tip={k.tip} /></span>{head}</div>
        {ctl}{size}
        <div className="small" style={{ margin: 0 }}>{ex(k.note)}</div>
      </div>
    );
  };

  const gainCard: Card = { key: "gain", label: "Gain", kind: "step", def: 0, stops: Array.from({ length: 25 }, (_, i) => i - 12), unit: "dB", signed: true, major: [-12, -9, -6, -3, 0, 3, 6, 9, 12], note: "เพิ่มหรือลดความดังทีละ 1 dB ใช้ได้กับทุกชนิด", tip: TIPS.gain };
  const exTop = abbrer();
  return (
    <>
          <div className="cards acards" data-cards>{arrange(shown).map(([k, span]) => cardEl(k, span))}</div>
          {c.id === "wv" && <div className="small">{exTop("WavPack แบบ Hybrid ได้สองไฟล์ (.wv กับไฟล์แก้ .wvc) ใส่ในไฟล์หนังได้แค่ไฟล์แรก จึงไม่มีในหน้านี้ แต่ใช้ได้ในหน้าแปลงเสียง")}</div>}
          {engUse === "ffmpeg" && c.native && <div className="small">{exTop(`ffmpeg ไม่มีบางช่องของตัวต้นฉบับ ${c.native} การ์ดที่ไม่มีจึงไม่แสดง`)}</div>}
          <div className="cgroup">ใช้กับทุกชนิด</div>
          <div className="cards acards">
            <div className="acard" data-card="gain" style={{ gridColumn: "span 4" }}>
              <div className="ach"><span className="lbl ilbl">Gain<InfoTip title="Gain" tip={TIPS.gain} /></span><VBox k={gainCard} value={gain} onCommit={setGain} /></div>
              <StepCtl k={gainCard} value={gain} onChange={setGain} />
              <div className="asz none">ไม่เปลี่ยนขนาดไฟล์</div>
              <div className="small" style={{ margin: 0 }}>{abbrer()(gainCard.note)}</div>
            </div>
            <div className="acard" data-card="loud" style={{ gridColumn: "span 4" }}>
              <div className="ach"><span className="lbl ilbl">Loudness normalize<InfoTip title="Loudness normalize" tip={TIPS.loud} /></span></div>
              <div style={{ display: "flex" }}><Seg small label="ความดังมาตรฐาน" value={loud ? "on" : "off"} onChange={(v) => setLoud(v === "on")} options={[{ value: "off", label: "Off" }, { value: "on", label: "EBU R128 −23 LUFS" }]} /></div>
              <div className="asz none">ไม่เปลี่ยนขนาดไฟล์</div>
              <div className="small" style={{ margin: 0 }}>{abbrer()("ปรับความดังตามมาตรฐาน EBU R128 ให้ได้ −23 LUFS ทุกแทร็กจึงดังพอ ๆ กัน ใช้ได้กับทุกชนิด")}</div>
            </div>
            <div className="acard" data-card="speed" style={{ gridColumn: "span 4" }}>
              <div className="ach"><span className="lbl ilbl">ความเร็วเสียง<InfoTip title="ความเร็วเสียง" tip={TIPS.speed} /></span></div>
              <div style={{ display: "flex" }}><Dropdown label="ความเร็วเสียง" value={speed} onChange={setSpeed} options={speedOpts} /></div>
              <div className="asz"><span>ขนาดไฟล์</span><div><Phr>{"ความยาวเปลี่ยนตามความเร็ว ขนาดไฟล์จึงเปลี่ยนตาม"}</Phr></div></div>
              <div className="small" style={{ margin: 0 }}>{abbrer()("ใช้แก้เสียงที่ค่อย ๆ เหลื่อมจากภาพ มากขึ้นเรื่อย ๆ จนถึงท้ายเรื่อง และเลือกได้ข้างล่างว่าจะคืนหรือคงระดับเสียง")}</div>
            </div>
          </div>
    </>
  );
}
