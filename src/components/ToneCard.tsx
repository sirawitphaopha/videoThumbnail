/* การ์ดเลือกโทนสีในหน้าตั้งค่า พร้อมรูปตัวอย่าง · หน้าตาเดียวกับการ์ดในหน้าเลือกโทน · สีของการ์ดเป็นของโทนนั้น ไม่เปลี่ยนตามโทนที่ใช้อยู่ (data-keepcolor) */
import { minContrast, ratio, type Tone } from "../lib/tones";

const POSTERS = ["linear-gradient(170deg,#0f2747,#1e5a7a 55%,#7fc1c4)", "linear-gradient(170deg,#7a1f2b,#c9503a 55%,#f3b96a)", "linear-gradient(170deg,#0b3a42,#147a78 60%,#e0b44c)"];

export default function ToneCard({ t, on, onPick }: { t: Tone; on: boolean; onPick: () => void }) {
  const v = t.v;
  const vars = { "--t-canvas": v.canvas, "--t-surface": v.surface, "--t-line": v["line-s"], "--t-txt": v.txt, "--t-txt2": v.txt2, "--t-txt3": v.txt3, "--t-accent": v.accent, "--t-on": v.on, "--t-side": v.side, "--t-sideline": v["side-line"] } as React.CSSProperties;
  return (
    <button type="button" className={"tncard" + (on ? " on" : "")} role="radio" aria-checked={on} data-tone={t.id} data-keepcolor style={vars} onClick={onPick}>
      <span className="tnmini"><i className="tnside" /><span className="tnposters">{POSTERS.map((g) => <i key={g} style={{ background: g }} />)}</span></span>
      <span className="tnbody">
        <span className="tnname">{t.name}{t.rec && <span className="tnrec">แนะนำ</span>}</span>
        <span className="tnratio" title="สัดส่วนสี 60 30 10"><i style={{ width: "60%", background: v.canvas }} /><i style={{ width: "30%", background: v.panel }} /><i style={{ width: "10%", background: v.accent }} /></span>
        <span className="tnrgb">{([["พื้น", v.canvas], ["รอง", v.panel], ["เน้น", v.accent]] as const).map(([n, c]) => <span key={n}><i style={{ background: c }} /><b>{n}</b>{c.toUpperCase()}</span>)}</span>
        <span className="tndesc"><span className="tnli">{t.how}</span>{t.why.split(" · ").map((x) => <span key={x} className="tnli">{x}</span>)}</span>
        <span className="tncon"><span className="tnli">ตัวหนังสือเข้มกับพื้น {ratio(v.txt, v.canvas).toFixed(1)} เท่า</span><span className="tnli">คู่ที่จางสุด {minContrast(t).toFixed(1)} เท่า เกณฑ์ 4.5</span></span>
      </span>
    </button>
  );
}
