/* หน้า 3 ตรวจไฟล์ (สเปกข้อ 8 · ต้นแบบบรรทัด 934–999)
   เลือกแบบตรวจ · เลือกเรื่อง · เริ่มตรวจ หยุดทั้งชุดได้ · ตารางผล · สรุปหลังตรวจครบ · หน้าต่างผลตรวจพร้อมปุ่มเปิดเล่นที่นาทีที่เสีย
   คิวตรวจอยู่ตัวกลาง lib/check.tsx งานรันฝั่ง Rust (check.rs) ออกจากหน้านี้ไปแล้วงานยังเดินต่อ */
import { useEffect, useMemo, useState } from "react";
import { checkApi, type CheckMode, type CheckSpan, type Movie } from "../lib/api";
import { useLibrary } from "../lib/library";
import { useSettings } from "../lib/settings";
import { useCheck } from "../lib/check";
import { useToast } from "../components/Toasts";
import { kb } from "../lib/popup";
import { fmtDateTime, fmtDuration, fmtRoughMinutes, fmtSize } from "../lib/format";
import { FULL_SPEED, reminderDue } from "../lib/status";
import type { Page } from "../components/Sidebar";
import Dialog from "../components/Dialog";
import { Skel, SortArrow, StatIcon } from "../components/ui";
import type { GraphReq } from "./GraphPage";
import { IbStop, IcGraph, IbTick, IcCheck } from "../components/icons";

type CkCol = "name" | "size" | "at" | "status";
const CK_ORDER: Record<string, number> = { bad: 0, changed: 1, unchecked: 2, ok: 3 };

/** คำขอจากปุ่มบนชั้นวาง · ตรวจเรื่องนี้เลย หรือเปิดผลตรวจของเรื่องนี้ */
export type CheckReq = { ids: string[]; mode?: CheckMode; open?: string };

const Tick = () => (
  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="4" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5" /></svg>
);
const Dash = () => (
  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="4" aria-hidden="true"><path d="M6 12h12" /></svg>
);

/** วันที่กับเวลาแยกกัน ตารางวางวันที่ไม่ให้ตัดกลางบรรทัด */
function dateParts(at: number): [string, string] {
  const [d, t] = fmtDateTime(at).split(" เวลา ");
  return [d, t];
}

/** เวลาโดยประมาณ เกินชั่วโมงครึ่งบอกเป็นชั่วโมง */
function rough(minLow: number, minHigh?: number): string {
  const hi = minHigh ?? minLow;
  if (hi < 90) return fmtRoughMinutes(minLow, minHigh);
  const a = Math.max(1, Math.round(minLow / 60)), b = Math.max(a, Math.round(hi / 60));
  return a === b ? `ราว ${a} ชั่วโมง` : `ราว ${a}–${b} ชั่วโมง`;
}

/** ตรวจแบบเร็ว = อ่านทั้งไฟล์คิด SHA-256 · ฮาร์ดดิสก์ราว 120 MB ต่อวินาที (TECH-REVIEW · status.ts quickEstimate) */
function quickTotal(ms: Movie[]): string {
  const sec = ms.reduce((s, m) => s + m.size, 0) / (120 * 1024 * 1024);
  if (sec < 10) return "ไม่กี่วินาที";
  return sec < 60 ? `ราว ${Math.round(sec)} วินาที` : rough(sec / 60);
}
/** ตรวจละเอียด = ถอดภาพเสียงทุกช่วง ราว 15–30 เท่าของความเร็วเล่นจริง (วัดจริงกับวิดีโอ 1080p ยาว 4 นาที 21 วินาที) */
function fullTotal(ms: Movie[]): string {
  const min = ms.reduce((s, m) => s + (m.duration ?? 0), 0) / 60;
  if (min <= 0) return "หลายนาที";
  return rough(min / FULL_SPEED.fast, min / FULL_SPEED.slow);
}

function elapsed(sec: number): string {
  const s = Math.max(1, Math.round(sec));
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), r = s % 60;
  if (h) return `${h} ชั่วโมง ${m} นาที`;
  if (m) return `${m} นาที ${r} วินาที`;
  return `${r} วินาที`;
}

const fmtT = (sec: number) => {
  const s = Math.max(0, Math.floor(sec));
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), r = s % 60;
  return h ? `${h}:${String(m).padStart(2, "0")}:${String(r).padStart(2, "0")}` : `${m}:${String(r).padStart(2, "0")}`;
};
const spanTime = (sp: CheckSpan) => (fmtT(sp.from) === fmtT(sp.to) ? fmtT(sp.from) : `${fmtT(sp.from)} – ${fmtT(sp.to)}`);

export default function CheckPage(p: { req: CheckReq | null; onConsumed: () => void; onGraph: (r: GraphReq) => void; onPage: (pg: Page) => void }) {
  const { movies, loaded } = useLibrary();
  const { settings } = useSettings();
  const { s, start, cancel } = useCheck();
  const toast = useToast();
  const reminder = settings?.recheckReminderDays ?? 30;
  const [mode, setMode] = useState<CheckMode>(settings?.defaultCheck ?? "quick");
  const [sel, setSel] = useState<Set<string> | null>(null);
  const [onlyProblems, setOnlyProblems] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);
  const [stopping, setStopping] = useState(false);

  /** กดหัวคอลัมน์เรียง (พี่กันสั่ง 8 พ.ย. 2569 "กดเรียงได้") · ผลเรียงเรื่องที่มีปัญหาขึ้นก่อน · ขนาดกับวันตรวจกดครั้งแรกเรียงจากมากไปน้อย */
  const [sortBy, setSortBy] = useState<{ col: CkCol; dir: 1 | -1 }>({ col: "name", dir: 1 });
  const list = useMemo(() => {
    const fileName = (m: Movie) => m.name + "." + m.ext;
    const key = (m: Movie): string | number => (sortBy.col === "name" ? fileName(m) : sortBy.col === "size" ? m.size : sortBy.col === "at" ? m.check?.at ?? 0 : CK_ORDER[m.status] ?? 4);
    return movies.slice().sort((a, b) => {
      const x = key(a), y = key(b);
      const c = typeof x === "number" && typeof y === "number" ? x - y : String(x).localeCompare(String(y), "th");
      return c * sortBy.dir || fileName(a).localeCompare(fileName(b), "th");
    });
  }, [movies, sortBy]);
  const head = (col: CkCol, label: string, width?: number) => {
    const on = sortBy.col === col;
    return (
      <th style={width ? { width } : undefined} aria-sort={on ? (sortBy.dir === 1 ? "ascending" : "descending") : "none"}>
        <button type="button" className="thsort" data-cksort={col} onClick={() => setSortBy(on ? { col, dir: sortBy.dir === 1 ? -1 : 1 } : { col, dir: col === "size" || col === "at" ? -1 : 1 })}>{label}<SortArrow dir={on ? sortBy.dir : 0} /></button>
      </th>
    );
  };
  // ตั้งต้นเลือกทุกเรื่องที่ไฟล์ยังอยู่ (ต้นแบบ เลือกไว้ทั้งหมด) · เลือกครั้งเดียวตอนคลังพร้อม
  useEffect(() => {
    if (sel === null && loaded) setSel(new Set(movies.filter((m) => !m.missing).map((m) => m.id)));
  }, [loaded, movies, sel]);
  useEffect(() => { if (!s.running) setStopping(false); }, [s.running]);

  // คำขอจากชั้นวาง · ตรวจเรื่องนี้เลย หรือเปิดผลตรวจ
  useEffect(() => {
    if (!p.req) return;
    const r = p.req;
    p.onConsumed();
    if (r.open) setOpenId(r.open);
    // ปุ่มตรวจไฟล์ในแผงรายละเอียด · เลือกไว้เฉพาะเรื่องนั้น รอกดเริ่มตรวจ
    if (!r.mode && !r.open) setSel(new Set(r.ids));
    if (r.mode) {
      setMode(r.mode);
      setSel(new Set(r.ids));
      if (!s.running) start(r.ids, r.mode);
      else toast({ kind: "warn", title: "กำลังตรวจชุดก่อนอยู่", detail: "รอให้เสร็จ หรือกดหยุดตรวจทั้งชุดก่อน แล้วค่อยกดตรวจเรื่องนี้อีกครั้ง" });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [p.req]);

  const selected = list.filter((m) => sel?.has(m.id) && !m.missing);
  const available = list.filter((m) => !m.missing);
  const allOn = available.length > 0 && selected.length === available.length;
  const someOn = selected.length > 0 && !allOn;
  const toggle = (id: string) => setSel((x) => { const n = new Set(x ?? []); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const queued = new Set(s.running ? s.queue.filter((id) => !s.done.includes(id) && s.current?.id !== id) : []);
  const batchProblems = (s.last ? s.queue : []).map((id) => movies.find((m) => m.id === id)).filter((m): m is Movie => !!m && (m.status === "bad" || m.status === "changed"));
  const shown = onlyProblems ? list.filter((m) => m.status === "bad" || m.status === "changed" || s.errors[m.id]) : list;
  const open = openId ? movies.find((m) => m.id === openId) ?? null : null;

  const begin = () => {
    if (!selected.length) return;
    start(selected.map((m) => m.id), mode);
  };
  const stop = () => { setStopping(true); cancel(); };
  const onlyUnchecked = () => {
    const ids = available.filter((m) => m.status === "unchecked").map((m) => m.id);
    if (!ids.length) { toast({ kind: "info", title: "ไม่มีเรื่องที่ยังไม่เคยตรวจ", detail: "ทุกเรื่องบนชั้นเคยตรวจแล้ว" }); return; }
    setSel(new Set(ids));
  };

  return (
    <div className="pagewrap" data-check>
      <div className="wrapin">
        <div className="modes" role="radiogroup" aria-label="แบบตรวจ">
          <div className={"mode" + (mode === "quick" ? " on" : "") + (s.running ? " off" : "")} {...kb(() => { if (!s.running) setMode("quick"); })} role="radio" aria-checked={mode === "quick"} aria-disabled={s.running} title={s.running ? "รอให้ตรวจชุดนี้เสร็จก่อน" : undefined}>
            <h4><span className={"radio" + (mode === "quick" ? " on" : "")} />ตรวจแบบเร็ว · {selected.length ? quickTotal(selected) : "ไม่กี่วินาทีต่อเรื่อง"}</h4>
            <div className="small" style={{ paddingLeft: 28 }}>เช็คว่าโครงไฟล์ครบ ไม่ขาดท้าย และเทียบค่า hash ของไฟล์กับที่บันทึกไว้ตอนตรวจครั้งก่อน ว่าไฟล์ถูกเปลี่ยนหรือเสียไปหรือเปล่า</div>
          </div>
          <div className={"mode" + (mode === "full" ? " on" : "") + (s.running ? " off" : "")} {...kb(() => { if (!s.running) setMode("full"); })} role="radio" aria-checked={mode === "full"} aria-disabled={s.running} title={s.running ? "รอให้ตรวจชุดนี้เสร็จก่อน" : undefined}>
            <h4><span className={"radio" + (mode === "full" ? " on" : "")} />ตรวจละเอียด · {selected.length ? fullTotal(selected) : <span className="nw">ราว 3–6 นาทีต่อเรื่อง</span>}</h4>
            <div className="small" style={{ paddingLeft: 28 }}>อ่านภาพและเสียงทุกช่วงตั้งแต่ต้นจนจบ บอกได้ว่าเสียที่นาทีไหน</div>
          </div>
        </div>

        <div className="ckbar">
          <div className="ckcount" data-ckcount>
            {s.running
              ? <>กำลังตรวจ{s.mode === "full" ? "ละเอียด" : "แบบเร็ว"} <span className="nw">เรื่องที่ {Math.min(s.done.length + 1, s.queue.length || 1)} จาก {s.queue.length || "…"}</span></>
              : <>เลือกไว้ <span className="nw">{selected.length} เรื่อง</span></>}
          </div>
          <div className="ckacts">
            {s.running ? (
              <button type="button" className={"btn " + (stopping ? "btn-wait" : "btn-ghost")} onClick={() => { if (!stopping) stop(); }}
                aria-disabled={stopping || undefined} title={stopping ? "รอให้เรื่องที่กำลังตรวจหยุดก่อน" : undefined} data-ckstop><IbStop size={15} />{stopping ? "กำลังหยุด…" : "หยุดตรวจทั้งชุด"}</button>
            ) : (
              <>
                <button type="button" className="btn btn-ghost" onClick={onlyUnchecked}><IbTick size={15} />เลือกเฉพาะที่ยังไม่เคยตรวจ</button>
                <button type="button" className={"btn " + (selected.length ? "btn-ok" : "btn-wait")} onClick={begin}
                  aria-disabled={!selected.length || undefined} title={selected.length ? undefined : "เลือกเรื่องที่จะตรวจในตารางก่อน"} data-ckstart><IcCheck size={15} />เริ่มตรวจ</button>
              </>
            )}
          </div>
        </div>

        {s.last && !s.running && (
          <div className="card cksum" data-cksum>
            <div className="cksum-stats">
              <div className="stat ok"><b>{s.last.ok}</b>ไฟล์สมบูรณ์</div>
              <div className="stat bad"><b>{s.last.bad}</b>ไฟล์เสียหาย</div>
              <div className="stat warn"><b>{s.last.changed}</b>ไฟล์ถูกเปลี่ยน</div>
            </div>
            <div className="small">
              {s.last.cancelled
                ? <>หยุดกลางทาง ตรวจไป <span className="nw">{s.last.done} จาก {s.last.total} เรื่อง</span> · หยุดเมื่อ </>
                : <>ตรวจ <span className="nw">{s.last.total} เรื่อง</span>เสร็จเมื่อ </>}
              <span className="nw">{fmtDateTime(s.last.at)}</span> · ใช้เวลา <span className="nw">{elapsed(s.last.seconds)}</span>
              {s.last.failed > 0 && <> · ตรวจไม่ได้ <span className="nw">{s.last.failed} เรื่อง</span></>}
            </div>
            {(batchProblems.length > 0 || onlyProblems) && (
              <div className="minirow" style={{ margin: 0 }}>
                <button type="button" className={"btn btn-ghost btn-sm" + (onlyProblems ? " pressed" : "")} aria-pressed={onlyProblems} onClick={() => setOnlyProblems((v) => !v)}>
                  {onlyProblems ? "ดูทุกเรื่อง" : "ดูเฉพาะที่มีปัญหา"}
                </button>
                {batchProblems.length > 0 && (
                  <button type="button" className="btn btn-ghost btn-sm" onClick={() => { setMode("full"); start(batchProblems.map((m) => m.id), "full"); }}><IcCheck size={15} />ตรวจละเอียดเรื่องที่มีปัญหา</button>
                )}
              </div>
            )}
          </div>
        )}

        <div className="tblwrap ckwrap">
          <table className="ck">
            <thead><tr>
              <th style={{ width: 44 }}>
                <span className={"cbx " + (allOn || someOn ? "on" : "off") + (s.running ? " dis" : "")}
                  {...kb(() => { if (!s.running) setSel(allOn ? new Set() : new Set(available.map((m) => m.id))); })}
                  role="checkbox" aria-checked={allOn ? true : someOn ? "mixed" : false} aria-label="เลือกทุกเรื่อง" aria-disabled={s.running}>
                  {allOn ? <Tick /> : someOn ? <Dash /> : null}
                </span>
              </th>
              {head("name", "ชื่อไฟล์")}
              {head("size", "ขนาด", 90)}
              {head("at", "ตรวจล่าสุด", 150)}
              {head("status", "ผล", 150)}
              <th style={{ width: "30%" }}>รายละเอียด</th>
            </tr></thead>
            <tbody>
              {!loaded && [0, 1, 2, 3, 4].map((i) => (
                <tr key={i} aria-hidden="true"><td><Skel w={18} h={18} r={5} /></td><td><Skel w="80%" h={14} /></td><td><Skel w={56} h={14} /></td><td><Skel w={110} h={14} /></td><td><Skel w={90} h={20} r={20} /></td><td><Skel w="60%" h={14} /></td></tr>
              ))}
              {loaded && shown.length === 0 && (
                <tr><td colSpan={6} className="small" style={{ textAlign: "center", padding: 24 }}>{onlyProblems ? "ไม่มีเรื่องที่มีปัญหา" : "ยังไม่มีหนังบนชั้น"}</td></tr>
              )}
              {loaded && shown.map((m) => (
                <Row key={m.id} m={m} on={!!sel?.has(m.id)} running={s.running} reminder={reminder}
                  current={s.current?.id === m.id ? s.current.percent : null} queued={queued.has(m.id)} error={s.errors[m.id]}
                  onToggle={() => { if (!s.running && !m.missing) toggle(m.id); }} onOpen={() => setOpenId(m.id)} />
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {open && open.check && (
        <ResultDialog m={open} onClose={() => setOpenId(null)} onGraph={p.onGraph} onPage={p.onPage}
          onDeep={() => { setOpenId(null); setMode("full"); start([open.id], "full"); }} running={s.running} />
      )}
    </div>
  );
}

function Row(p: { m: Movie; on: boolean; running: boolean; reminder: number; current: number | null; queued: boolean; error?: string; onToggle: () => void; onOpen: () => void }) {
  const { m } = p;
  const c = m.check;
  const pill = p.current != null ? <span className="pill p-info">กำลังตรวจ {Math.floor(p.current)}%</span>
    : p.queued ? <span className="pill p-queue">รอคิว</span>
    : m.missing ? <span className="pill p-queue">หาไฟล์ไม่เจอ</span>
    : p.error ? <span className="pill p-warn">ตรวจไม่ได้</span>
    : m.status === "ok" ? <span className="pill p-ok">ไฟล์สมบูรณ์</span>
    : m.status === "bad" ? <span className="pill p-bad">ไฟล์เสียหาย</span>
    : m.status === "changed" ? <span className="pill p-warn">ไฟล์ถูกเปลี่ยน</span>
    : <span className="pill p-queue">ยังไม่เคยตรวจ</span>;
  const due = m.status === "ok" && reminderDue(m, p.reminder);
  const detail = p.current != null ? <div className="bar" style={{ maxWidth: 220 }}><i style={{ width: `${Math.max(2, p.current)}%` }} /></div>
    : m.missing ? "ไดรฟ์อาจถอดออกอยู่"
    : p.error ? p.error
    : c ? <>{c.summary ?? ""}{due && <span className="ckdue"> · ตรวจครั้งล่าสุดเกิน {p.reminder} วัน ถึงเวลาตรวจซ้ำ</span>}</>
    : "ยังไม่เคยตรวจ";
  const [d, t] = c ? dateParts(c.at) : ["", ""];
  const canOpen = !!c && p.current == null;
  return (
    <tr className={(canOpen ? "click" : "") + (m.missing ? " missing" : "")} data-ckrow={m.name}
      {...(canOpen ? kb(p.onOpen) : {})} aria-label={canOpen ? `ดูผลตรวจ ${m.name}.${m.ext}` : undefined}>
      <td onClick={(e) => e.stopPropagation()} onKeyDown={(e) => e.stopPropagation()}>
        <span className={"cbx " + (p.on ? "on" : "off") + (p.running || m.missing ? " dis" : "")} {...kb(p.onToggle)}
          role="checkbox" aria-checked={p.on} aria-label={`เลือก ${m.name}.${m.ext}`} aria-disabled={p.running || m.missing}>
          {p.on && <Tick />}
        </span>
      </td>
      <td className="ckname">{m.name}.{m.ext}</td>
      <td><span className="nw">{fmtSize(m.size)}</span></td>
      <td>{c ? <><span className="nw">{d}</span> {t}</> : "—"}</td>
      <td>{pill}</td>
      <td className="small ckdetail">{detail}</td>
    </tr>
  );
}

function ResultDialog(p: { m: Movie; onClose: () => void; onDeep: () => void; onGraph: (r: GraphReq) => void; onPage: (pg: Page) => void; running: boolean }) {
  const { m } = p;
  const c = m.check!;
  const toast = useToast();
  const spans = c.spans ?? [];
  const first = spans[0];
  /** จุดเสียที่เป็นเสียง มีปุ่มดูกราฟเสียงช่วงนี้ พาไปหน้ากราฟเสียงซูมที่เวลานั้น (มอคอัปกราฟเสียง) */
  const sound = spans.find((sp) => sp.what.includes("เสียง"));
  const [d, t] = dateParts(c.at);
  const play = async () => {
    try {
      const r = await checkApi.playAt(m.path, first.from);
      if (r.seeked) toast({ kind: "ok", title: `เปิดด้วย ${r.player} ที่ ${fmtT(first.from)}` });
      else if (r.player) toast({ kind: "warn", title: `เปิดด้วย ${r.player} แล้ว แต่เปิดตรงนาทีไม่ได้`, detail: `เลื่อนไปที่ ${fmtT(first.from)} เอง · โปรแกรมที่เปิดตรงนาทีได้ VLC MPC-HC PotPlayer mpv` });
      else toast({ kind: "warn", title: "เปิดด้วยโปรแกรมหลักของ Windows แล้ว แต่เปิดตรงนาทีไม่ได้", detail: `เลื่อนไปที่ ${fmtT(first.from)} เอง · ลง VLC MPC-HC PotPlayer หรือ mpv แล้วกดอีกครั้ง หรือเลือกโปรแกรมเล่นในหน้าตั้งค่า` });
    } catch (e) {
      toast({ kind: "bad", title: "เปิดเล่นไม่ได้", detail: String(e) });
      // โปรแกรมเล่นที่เลือกเองหาไม่เจอ พากลับไปตั้งที่หน้าตั้งค่า (สเปกข้อ 9) · เดิมขึ้นแถบอย่างเดียว ผู้ช่วยตรวจสเปกเจอ
      if (String(e).includes("หาโปรแกรมเล่นหนัง")) { p.onClose(); p.onPage("settings"); }
    }
  };
  return (
    <Dialog open onClose={p.onClose} kind="menu" width={520} title={<>ผลตรวจ {m.name}.{m.ext}</>}
      actions={<>
        {sound && <button type="button" className="btn btn-ghost btn-sm" onClick={() => p.onGraph({ path: m.path, t: sound.from })} data-ckgraph><IcGraph size={15} />ดูกราฟเสียงช่วงนี้</button>}
        {first && <button type="button" className="btn btn-ghost btn-sm" onClick={play} data-ckplay>เปิดเล่นที่ <span className="nw">{fmtT(first.from)}</span></button>}
        {c.result === "changed" && <button type="button" className={"btn btn-sm " + (p.running ? "btn-wait" : "btn-ghost")} onClick={() => { if (!p.running) p.onDeep(); }}
          aria-disabled={p.running || undefined} title={p.running ? "รอให้ชุดที่กำลังตรวจเสร็จก่อน" : undefined}><IcCheck size={15} />ตรวจละเอียดเรื่องนี้</button>}
        <button type="button" className="btn btn-main btn-sm" onClick={p.onClose}>ปิด</button>
      </>}>
      <div className="small">{c.mode === "full" ? "ตรวจละเอียด" : "ตรวจแบบเร็ว"} · <span className="nw">{d}</span> {t} · ความยาว <span className="nw">{fmtDuration(m.duration)}</span></div>
      {spans.length > 0 ? (
        <table className="fmt" data-ckspans>
          <thead><tr><th>ช่วงเวลา</th><th>เสียอะไร</th></tr></thead>
          <tbody>{spans.map((sp, i) => <tr key={i}><td><span className="nw">{spanTime(sp)}</span></td><td>{sp.what}</td></tr>)}</tbody>
        </table>
      ) : (
        <div className="ckres"><StatIcon kind={c.result === "ok" ? "ok" : c.result === "bad" ? "bad" : "warn"} /><span>{c.summary}</span></div>
      )}
      {c.result === "bad" && <div className="small">ต้นเหตุที่พบบ่อย ไฟล์โหลดมาไม่ครบ หรือไดรฟ์มีจุดเสีย · แนะนำให้โหลดใหม่</div>}
    </Dialog>
  );
}
