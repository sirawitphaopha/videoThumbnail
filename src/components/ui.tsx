/* ชิ้นส่วนเล็กที่ใช้ทั้งโปรแกรม · สีอยู่ใน styles/app.css ทั้งหมด ในแท็กเก็บแค่ตำแหน่งกับขนาด */
import { useRef } from "react";

/* ---------- ปุ่มคู่ ปุ่มสาม ---------- */
/** off = ปิดเฉพาะตัวเลือกนี้ พร้อมเหตุผลตอนชี้ (10 พ.ย. 2569 ปิด CBR ของ qaac) */
type SegOpt<T extends string> = { value: T; label: React.ReactNode; aria?: string; off?: string };
export function Seg<T extends string>(p: {
  options: SegOpt<T>[];
  value: T;
  onChange: (v: T) => void;
  small?: boolean;
  /** ปิดอยู่พร้อมเหตุผล · เหตุผลขึ้นตอนชี้ (ต้นแบบ: ขนาดปกใช้ได้ตอนดูแบบภาพปก) */
  disabledReason?: string;
  label: string;
}) {
  const off = !!p.disabledReason;
  return (
    <div className={"seg" + (p.small ? " sm" : "") + (off ? " seg-off" : "")} role="group" aria-label={p.label} title={p.disabledReason}>
      {p.options.map((o) => (
        <button
          key={o.value}
          type="button"
          className={(p.value === o.value ? "on" : "") + (o.off ? " off" : "")}
          aria-pressed={p.value === o.value}
          aria-disabled={off || !!o.off || undefined}
          aria-label={o.aria}
          title={o.off}
          onClick={() => { if (!off && !o.off) p.onChange(o.value); }}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

/* ---------- สวิตช์ ---------- */
export function Switch(p: { on: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={p.on}
      aria-label={p.label}
      className={"switch " + (p.on ? "on" : "off")}
      onClick={() => p.onChange(!p.on)}
    />
  );
}

/* ---------- แถบเลื่อนค่า (ซูม คุณภาพ JPG) ---------- */
export function Range(p: { value: number; min: number; max: number; step?: number; onChange: (v: number) => void; label: string; format?: (v: number) => string }) {
  const ref = useRef<HTMLDivElement>(null);
  const step = p.step ?? 1;
  const pct = ((p.value - p.min) / (p.max - p.min)) * 100;
  const set = (v: number) => p.onChange(Math.min(p.max, Math.max(p.min, Math.round(v / step) * step)));
  const fromX = (x: number) => {
    const r = ref.current!.getBoundingClientRect();
    set(p.min + ((x - r.left) / r.width) * (p.max - p.min));
  };
  return (
    <div
      ref={ref}
      className="range"
      role="slider"
      tabIndex={0}
      aria-label={p.label}
      aria-valuemin={p.min}
      aria-valuemax={p.max}
      aria-valuenow={p.value}
      aria-valuetext={p.format ? p.format(p.value) : String(p.value)}
      onPointerDown={(e) => { e.currentTarget.setPointerCapture(e.pointerId); fromX(e.clientX); }}
      onPointerMove={(e) => { if (e.buttons & 1) fromX(e.clientX); }}
      onKeyDown={(e) => {
        if (e.key === "ArrowRight" || e.key === "ArrowUp") { e.preventDefault(); set(p.value + step); }
        if (e.key === "ArrowLeft" || e.key === "ArrowDown") { e.preventDefault(); set(p.value - step); }
        if (e.key === "Home") { e.preventDefault(); set(p.min); }
        if (e.key === "End") { e.preventDefault(); set(p.max); }
      }}
    >
      <i style={{ width: `${pct}%` }} />
      <b style={{ left: `${pct}%` }} />
    </div>
  );
}

/* ---------- โครงจาง ---------- */
export function Skel(p: { w: number | string; h: number; r?: number; style?: React.CSSProperties }) {
  return <div className="skel" aria-hidden="true" style={{ width: p.w, height: p.h, borderRadius: p.r ?? 6, ...p.style }} />;
}

/* ---------- ไอคอนเส้นในการ์ดสถานะของแผงรายละเอียด (ต้นแบบบรรทัด 400 418 421 424) ----------
   done = เครื่องหมายถูกเปล่า ใช้กับการ์ดบอกว่าทำสำเร็จ (ต้นแบบเปลี่ยนชื่อสำเร็จ บรรทัด 452) · ok = โล่ ใช้กับไฟล์สมบูรณ์ */
/** ป้ายกำลังโหลดลอยกลางจอ อยู่เหนือหน้าต่างทุกชั้น ไม่ดันเนื้อหา · งานรอทุกอย่างที่ไม่มีแถบความคืบหน้าใช้ตัวนี้ */
export function LoadPill({ text }: { text: string }) {
  return <div className="loadpill" role="status" aria-live="polite" data-load-pill><span className="spinner" aria-hidden="true" />{text}</div>;
}

export function CardIcon({ kind }: { kind: "ok" | "bad" | "warn" | "info" | "done" }) {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {kind === "ok" && <><path d="M12 3l8 3v6c0 4.5-3.4 8-8 9-4.6-1-8-4.5-8-9V6z" /><path d="M8.5 12l2.5 2.5 4.5-5" /></>}
      {kind === "bad" && <><path d="M12 3l9.5 17h-19z" /><path d="M12 10v4.5M12 17.5h.01" /></>}
      {kind === "warn" && <><circle cx="12" cy="12" r="9" /><path d="M12 7v6M12 16.5h.01" /></>}
      {kind === "info" && <><circle cx="12" cy="12" r="9" /><path d="M12 11v6M12 7.5h.01" /></>}
      {kind === "done" && <path d="M5 12.5l4.5 4.5L19 7.5" />}
    </svg>
  );
}

/* ---------- จุดสีบอกสภาพไฟล์หน้าชื่อบนชั้นวาง (ต้นแบบบรรทัด 86–87 · 269–270) ---------- */
export function Badge({ kind, title }: { kind: "ok" | "bad" | "warn" | "info"; title: string }) {
  return (
    <span className={"badge b-" + kind} title={title} aria-label={title} role="img">
      {kind === "ok" && <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="4"><path d="M5 12.5l4.5 4.5L19 7.5" /></svg>}
      {kind === "bad" && <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="4"><path d="M7 7l10 10M17 7L7 17" /></svg>}
      {kind === "warn" && <svg width="14" height="14" viewBox="0 0 24 24" fill="#7a5410"><rect x="10" y="3.5" width="4" height="11" rx="2" /><circle cx="12" cy="19" r="2.3" /></svg>}
      {kind === "info" && <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="4"><path d="M12 6v12M6 12h12" /></svg>}
    </span>
  );
}

/* ---------- ไอคอนในการ์ดสถานะ (ต้นแบบใช้วงกลมสีทึบกับเครื่องหมายสีขาว) ---------- */
export function StatIcon({ kind }: { kind: "ok" | "bad" | "warn" | "info" }) {
  const fill = { ok: "var(--ok)", bad: "var(--bad)", warn: "var(--warn)", info: "var(--info)" }[kind];
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="12" cy="12" r="11" fill={fill} />
      {kind === "ok" && <path d="M7 12.5l3.2 3.2L17 9" fill="none" stroke="#fff" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />}
      {kind === "bad" && <path d="M8 8l8 8M16 8l-8 8" stroke="#fff" strokeWidth="2.6" strokeLinecap="round" />}
      {kind === "warn" && <path d="M12 6.5v7M12 17.2v.3" stroke="#fff" strokeWidth="2.8" strokeLinecap="round" />}
      {kind === "info" && <path d="M12 7v10M7 12h10" stroke="#fff" strokeWidth="2.6" strokeLinecap="round" />}
    </svg>
  );
}

/* ---------- ข้อความไทยตัดบรรทัดตรงเว้นวรรค ----------
   ภาษาไทยเว้นวรรคระหว่างวลี แต่เบราว์เซอร์ตัดกลางวลีได้ตามพจนานุกรม (ขาด|ท้าย · คุณภาพเท่า|เดิม)
   ยิ่งเปิด text-wrap: balance ยิ่งตัดกลางวลีบ่อย · word-break: keep-all ไม่มีผลกับภาษาไทยใน WebView2 (ลองแล้ว)
   ทางแก้ แต่ละวลีเป็นกล่อง .phr (inline-block กว้างไม่เกินช่อง) บรรทัดจึงขึ้นใหม่เฉพาะตรงเว้นวรรค
   วลีที่ยาวกว่าช่องเองค่อยตัดในวลีตามพจนานุกรม · ไม้ยมก ๆ ติดกับวลีหน้าเสมอ ห้ามขึ้นต้นบรรทัด
   head = ของที่นำหน้าวลีแรก (จุดสีบนชั้น) ไม่ให้ค้างอยู่บรรทัดเดียวโดด ๆ · tail = ของที่ต่อท้ายวลีสุดท้าย (นามสกุลไฟล์) */
type Part = { text: string; hit?: boolean };
/** ข้อความที่มีเว้นวรรคผูก (ตัวเลขกับคำ ไม้ยมก) ล็อกเฉพาะคำที่ติดเว้นวรรคนั้น ไม่ล็อกทั้งวลีไทยที่ติดกัน
 *  เช่น "ผู้ทำแนะนำราว 256" ล็อกแค่ "ราว 256" ส่วน "ผู้ทำแนะนำ" ตัดที่ขอบคำได้ บรรทัดเต็ม กระจายแบบไทยไม่ถ่าง (พี่กันทัก 11 พ.ย. 2569 "ระยะห่างมึงไปแหกตาด้วย") */
const thaiWords = typeof Intl !== "undefined" && "Segmenter" in Intl ? new Intl.Segmenter("th", { granularity: "word" }) : null;
export function keepNodes(text: string, next: () => number): React.ReactNode[] {
  const parts = text.split(" ");
  if (parts.length < 2 || !thaiWords) return [<span key={next()} className="keep">{text}</span>];
  const seg = (p: string) => [...thaiWords.segment(p)].map((x) => x.segment);
  const out: React.ReactNode[] = [];
  let keep = "";
  parts.forEach((p, i) => {
    const w = seg(p);
    if (i === 0) { out.push(w.slice(0, -1).join("")); keep = w[w.length - 1] ?? ""; return; }
    keep += " " + (w[0] ?? "");
    if (w.length > 1) { out.push(<span key={next()} className="keep">{keep}</span>, w.slice(1, -1).join("")); keep = w[w.length - 1]; }
  });
  out.push(<span key={next()} className="keep">{keep}</span>);
  return out.filter((x) => x !== "");
}

/** คำประสมที่ตัวตัดคำของระบบแยกเป็นสองคำ แต่ห้ามตัดบรรทัดกลางคำ (เจอ "ตัว|แปลง" "ติด|ตั้ง" ตอนตรวจภาพ 11 พ.ย. 2569) · เจอคำใหม่เพิ่มที่นี่ */
const COMPOUNDS = ["ตัวแปลง", "ติดตั้ง", "เครื่องเล่น", "ไฟล์หนัง", "ไฟล์เสียง", "โปรแกรม", "โฟลเดอร์", "บิตเรต", "ความถี่", "ความดัง", "ความยาว", "ความเร็ว", "แปลงเสียง", "ถังขยะ", "ต้นฉบับ", "ชั้นวาง", "โปสเตอร์", "หน้าตั้งค่า", "ค่าตั้งต้น", "ช่องเสียง", "ลำโพง", "เสียงพูด", "เสียงร้อง", "ปกจับคู่", "จับคู่", "ไม่เสียคุณภาพ", "เสียคุณภาพ"];
const COMPOUND_RE = new RegExp(`(${[...COMPOUNDS].sort((a, b) => b.length - a.length).join("|")})`);
/** คำท้ายวลีที่ห้ามตกไปขึ้นต้นบรรทัด ผูกกับคำหน้าเสมอ (เจอ "แนบมากับโปรแกรม|แล้ว" ตอนตรวจภาพหน้าตั้งค่า 11 พ.ย. 2569) */
const GLUE = new Set(["แล้ว", "ด้วย", "เอง", "ก่อน", "ไว้", "อยู่", "ได้", "นั้น", "นี้", "กัน", "ไหม"]);
/** คำนำที่ห้ามค้างท้ายบรรทัด ผูกกับคำถัดไปเสมอ (เจอ "ไม่|นับเป็นปก" 11 พ.ย. 2569) */
const PREFIX = new Set(["ไม่", "การ", "ความ", "และ", "แต่", "หรือ", "ถ้า", "จะ", "ที่", "ซึ่ง", "ของ", "เมื่อ", "เพื่อ"]);
/** ตัวเชื่อมคำ (U+2060) ใส่ระหว่างคำที่ห้ามตัดบรรทัดตรงนั้น ตัวอักษรยังกระจายได้ ไม่เป็นกล่อง · ใช้ตอนอ่านภาพแล้วเจอวลีขาดกลาง */
export const J = "⁠";
export function thaiKeep(text: string, next: () => number): React.ReactNode[] {
  // แบ่งเป็นหน่วย คำประสมเป็นหน่วยล็อก คำอื่นแยกตามพจนานุกรม แล้วผูกคำท้ายวลีเข้ากับหน่วยหน้า
  const units: { t: string; lock: boolean; pre?: boolean }[] = [];
  for (const part of text.split(COMPOUND_RE).filter(Boolean)) {
    const prev0 = units[units.length - 1];
    if (COMPOUNDS.includes(part)) {
      if (prev0?.pre) { prev0.t += part; prev0.lock = true; prev0.pre = false; } else units.push({ t: part, lock: true });
      continue;
    }
    for (const w of thaiWords ? [...thaiWords.segment(part)].map((x) => x.segment) : [part]) {
      const prev = units[units.length - 1];
      if (prev && (GLUE.has(w) || prev.pre)) { prev.t += w; prev.lock = true; prev.pre = PREFIX.has(w); } else units.push({ t: w, lock: false, pre: PREFIX.has(w) });
    }
  }
  const out: React.ReactNode[] = [];
  let plain = "";
  for (const u of units) {
    if (!u.lock) { plain += u.t; continue; }
    if (plain) { out.push(plain); plain = ""; }
    out.push(<span key={next()} className="kw">{u.t}</span>);
  }
  if (plain) out.push(plain);
  return out;
}

export function Phrases({ parts, head, tail }: { parts: Part[]; head?: React.ReactNode; tail?: React.ReactNode }) {
  let out: React.ReactNode[] = [];
  let k = 0;
  let cur: React.ReactNode[] = head ? [<span key={k++}>{head}</span>] : [];
  // ล็อกเฉพาะก้อนที่ผูกหลายคำ (ตัวเลขกับคำ ไม้ยมก) คำเดี่ยวตัดที่ขอบคำไทยได้ตามปกติ ให้กระจายแบบไทยเติมระยะน้อย
  const flush = () => {
    if (!cur.length) return;
    const bound = cur.length > 1 || cur.some((x) => typeof x === "string" && x.includes(" "));
    if (bound && cur.every((x) => typeof x === "string")) out.push(<span key={k++} className="phr">{keepNodes((cur as string[]).join(""), () => k++)}</span>);
    // คำที่ไม่มีตัวไทย (ตัวอังกฤษ ตัวเลข) เป็นกล่อง ไม่ถูกถ่างตอนกระจายแบบไทย
    else if (!bound && cur.length === 1 && typeof cur[0] === "string" && /[฀-๿]/.test(cur[0])) out.push(<span key={k++} className="phr">{thaiKeep(cur[0], () => k++)}</span>);
    else out.push(<span key={k++} className={bound || cur.every((x) => typeof x === "string" && !/[฀-๿]/.test(x)) ? "phr keep" : "phr"}>{cur}</span>);
    cur = [];
  };
  // เว้นวรรคสองช่อง = รอยต่อประโยค แต่ละประโยคเป็นก้อน ไม่พอที่ย้ายลงทั้งก้อน ตัดบรรทัดตามความหมาย (CLAUDE.md · พี่กันสั่ง 11 พ.ย. 2569)
  // ข้อความที่มีประโยคเดียวไม่ห่อ หน้าอื่นหน้าตาเหมือนเดิม
  const clauses: React.ReactNode[][] = [];
  const endClause = () => { flush(); clauses.push(out); out = []; };
  let numOnly = false; // วลีที่เพิ่งจบเป็นตัวเลขล้วน · เลขกับคำถัดไป (3 วินาที · 19 เรื่อง) ห้ามแยกบรรทัด
  for (const p of parts) {
    // ขึ้นบรรทัดใหม่ในข้อความแสดงเป็นบรรทัดจริง (แทนจุดคั่น · ที่ห้ามใช้บนจอ · สกิล web-craft)
    // ไม้ยมกติดกับคำหน้าและคำหลัง "พอ ๆ กัน" "ค่อย ๆ เหลื่อม" ไม่แยกบรรทัด
    const toks = p.text.split(/(\n| {2,}|(?<!ๆ)(?: +)(?!ๆ))/).filter(Boolean);
    for (let ti = 0; ti < toks.length; ti++) {
      const s = toks[ti];
      if (s === "\n") { flush(); out.push(<br key={k++} />); numOnly = false; continue; }
      if (/^ {2,}$/.test(s)) { endClause(); numOnly = false; continue; }
      // คำกับตัวเลขที่ตามมาอยู่ด้วยกัน "เสียง 5.1" "ราว 256" (CLAUDE.md ตัดบรรทัดตามความหมาย)
      // ก้อนที่มีตัวเลขอยู่แล้วไม่ผูกตัวเลขตัวถัดไปเพิ่ม กันต่อกันยาว "ระดับ 0 ถึง 127 ระดับ 91"
      const nextNum = /^[−+≈-]?\d/.test(toks[ti + 1] ?? "") && !cur.some((x) => typeof x === "string" && /\d/.test(x));
      if (!s.trim()) { if (numOnly || nextNum) { cur.push(s); numOnly = false; continue; } flush(); out.push(s); continue; }
      numOnly = /^[\d.,:]+$/.test(s);
      cur.push(p.hit ? <span key={k++} className="hl">{s}</span> : s);
    }
  }
  if (tail) cur.push(<span key={k++}>{tail}</span>);
  flush();
  if (!clauses.length) return <>{out}</>;
  clauses.push(out);
  return <>{clauses.map((c, i) => <span key={`c${i}`}>{i > 0 && " "}<span className="clause">{c}</span></span>)}</>;
}
/** ลูกศรหัวตาราง · เรียงอยู่บอกทิศจริง · คอลัมน์ที่กดเรียงได้แต่ยังไม่ได้เรียง ขึ้นลูกศรคู่จาง ๆ ให้รู้ว่ากดได้ */
export const SortArrow = ({ dir }: { dir: 1 | -1 | 0 }) => (
  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" aria-hidden="true" style={{ marginLeft: 4, flex: "none", opacity: dir ? 1 : 0.4 }}>
    <path d={dir === 1 ? "M6 15l6-6 6 6" : dir === -1 ? "M6 9l6 6 6-6" : "M8 10l4-4 4 4M8 14l4 4 4-4"} /></svg>
);
/** ข้อความบนปุ่มที่เปลี่ยนตามสถานะ กันที่ไว้เท่าข้อความยาวสุดใน all ปุ่มไม่หดขยาย */
export const Keep = ({ all, icon, children }: { all: string[]; icon?: React.ReactNode; children: React.ReactNode }) => (
  <span className="tfix keep">{all.map((x) => <i key={x} aria-hidden="true">{icon}{x}</i>)}<span>{icon}{children}</span></span>
);
/** เวลาบนปุ่ม กันที่ไว้เท่าเวลายาวสุดของไฟล์ ปุ่มไม่หดขยายตามตัวเลข · longest คือเวลายาวสุด ไม่ส่งใช้แบบ ชม:นาที:วินาที */
export const FixedTime = ({ t, longest = "0:00:00" }: { t: string; longest?: string }) => {
  const ghost = (longest.length >= t.length ? longest : t).replace(/\d/g, "0");
  return <span className="tfix"><i aria-hidden="true">{ghost}</i><span>{t}</span></span>;
};
export const Phr = ({ children, tail }: { children: string; tail?: React.ReactNode }) => <Phrases parts={[{ text: children }]} tail={tail} />;

/** กดช่องลากไฟล์แล้วเปิดกล่องเลือกไฟล์ · กดปุ่มที่อยู่ในช่องไม่ทำซ้ำ (พี่กันสั่ง 9 พ.ย. 2569 "เรานึกว่าพอกดตรงนี้ มันจะเด้องให้อัปเลย") */
export const dropClick = (fn: () => void) => (e: React.MouseEvent) => {
  if ((e.target as HTMLElement).closest("button, a, input")) return;
  fn();
};
