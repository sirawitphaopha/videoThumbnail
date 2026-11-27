/* ชั้นวาง มุมมองตาราง (ShelfTable) · ป้ายเสียงซับในตาราง ภาพไม่มีปก
   แยกจาก ShelfPage.tsx ตอนแบ่งไฟล์ทั้งโปรเจกต์ (BUGS ข้อ 153 · แผนแบ่งไฟล์ขั้น 4.3) ย้ายมาทั้งก้อน เนื้อโค้ดไม่เปลี่ยน */
import { useLayoutEffect, useMemo, useRef, useState } from "react";
import { Badge, SortArrow, chText } from "../../components/ui";
import { useMovieFrame } from "../../lib/frames";
import { thumbUrl, type Movie } from "../../lib/api";
import { fmtSize } from "../../lib/format";
import { kindOf, KIND_ORDER, labelOf, TABLE_LABEL } from "../../lib/status";
import { kb } from "../../lib/popup";
import HoverBig from "../../components/HoverBig";
import { ftLook } from "../../lib/ftypes";
import { Hl, LinkMark, byName, tracks } from "./common";
import { Stars } from "./ShelfGrid";

/* ---------- มุมมองตาราง (ต้นแบบบรรทัด 510–557) ---------- */
type Col = "name" | "size" | "video" | "audio" | "subs" | "status";
/** รูปย่อในตาราง เรื่องที่ไม่มีปกเป็นแถบทะแยง หรือภาพจากหนังเมื่อเปิดไว้ */
function NoCoverTh({ m, on }: { m: Movie; on: boolean }) {
  const frame = useMovieFrame(m, on);
  const url = frame.url ? thumbUrl(frame.url) : null;
  return url ? <HoverBig src={url} ratio={16 / 9} name={m.name + " (ภาพจากหนัง ยังไม่ใช่ปก)"}><img className="th" src={url} alt="" title="ภาพจากหนัง ยังไม่ใช่ปก" data-frame /></HoverBig> : <span ref={frame.ref} className="th none" />;
}

/** ป้าย ภาษา ชนิด แชนแนล · สีตามชนิด */
type Chip = { text: string; ft: string };
const trackChips = (t: Movie["audio"], withLayout: boolean): Chip[] => t.map((x) => ({ text: [x.lang, x.codec, withLayout ? chText(x.layout) : null].filter(Boolean).join(" "), ft: x.codec }));
/** ป้าย Video เช่น HEVC 2160p HDR สีจากคำแรก */
const videoChips = (v: string | null | undefined): Chip[] => (v ? [{ text: v, ft: v.split(" ")[0] }] : []);

/** ป้ายแถวเดียวในตาราง ไม่พอช่องซ่อนตัวท้ายแล้วบอก +จำนวน ชี้ที่ช่องดูครบ · คอลัมน์กว้างตายตัว การซ่อนจึงไม่ย้อนมาเปลี่ยนความกว้างช่อง
    (พี่กันสั่ง 9 พ.ย. 2569 "เสียง มันสองเเถวอ่ะ" · "ต้องบอกภาษษด้วย" · "เปลี่ยนเป็นการ์ดที") */
function ChipRow({ items }: { items: Chip[] }) {
  const ref = useRef<HTMLDivElement>(null);
  const key = items.map((c) => c.text).join("|");
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const fit = () => {
      const chips = [...el.querySelectorAll<HTMLElement>(":scope > .lvchip")];
      const more = el.querySelector<HTMLElement>(":scope > .lvmore");
      if (!more || !el.clientWidth) return; // หน้าถูกซ่อน กว้าง 0 ป้ายที่จัดไว้คงเดิม (แบบเดียวกับแถบใต้ปก)
      el.classList.remove("tight");
      chips.forEach((c) => { c.style.display = ""; });
      more.style.display = "none";
      const GAP = 4, room = el.clientWidth, w = chips.map((c) => c.offsetWidth);
      if (w.reduce((a, b) => a + b, 0) + GAP * (w.length - 1) <= room) return;
      more.textContent = "+" + chips.length;
      more.style.display = "";
      const mw = more.offsetWidth;
      let used = 0, n = 0;
      for (let i = 0; i < w.length; i++) {
        const next = used + w[i] + (i ? GAP : 0);
        if (next + GAP + mw > room) break;
        used = next;
        n = i + 1;
      }
      n = Math.max(1, n);
      chips.forEach((c, i) => { c.style.display = i < n ? "" : "none"; });
      more.textContent = "+" + (chips.length - n);
      // ป้ายเดียวยาวเกินช่อง ไม่มีอะไรซ่อน ไม่ขึ้น +0 ตัดท้ายป้ายแทน
      if (n === chips.length) more.style.display = "none";
      el.classList.toggle("tight", n === 1);
    };
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(el);
    return () => ro.disconnect();
  }, [key]);
  if (!items.length) return <>—</>;
  return (
    <div ref={ref} className="lvchips">
      {items.map((c, i) => { const look = ftLook(c.ft); return <span key={i} className={look.className + " lvchip"} style={look.style}>{c.text}</span>; })}
      <span className="lvmore" style={{ display: "none" }} />
    </div>
  );
}

export function ShelfTable(p: { size: "s" | "m" | "l"; list: Movie[]; selId: string | null; onSel: (id: string) => void; used: string; reminder: number; showFrames: boolean }) {
  const [sort, setSort] = useState<{ col: Col; dir: 1 | -1 } | null>(null);
  const rows = useMemo(() => {
    if (!sort) return p.list;
    const key = (m: Movie): string | number => ({
      name: m.name, size: m.size, video: m.videoShort ?? "", audio: tracks(m.audio, true), subs: tracks(m.subs, false), status: KIND_ORDER[kindOf(m, p.reminder)],
    })[sort.col];
    return p.list.slice().sort((a, b) => {
      const x = key(a), y = key(b);
      const c = typeof x === "number" && typeof y === "number" ? x - y : String(x).localeCompare(String(y), "th");
      return c * sort.dir || byName(a, b);
    });
  }, [p.list, sort, p.reminder]);
  const head = (col: Col, label: string, cls: string) => {
    const on = sort?.col === col;
    return (
      <th className={cls} aria-sort={on ? (sort!.dir === 1 ? "ascending" : "descending") : "none"}>
        <button type="button" className="thsort" onClick={() => setSort(on ? { col, dir: sort!.dir === 1 ? -1 : 1 } : { col, dir: col === "size" ? -1 : 1 })}>
          {label}
          <SortArrow dir={on ? sort!.dir : 0} />
        </button>
      </th>
    );
  };
  return (
    <div className={"tblwrap tb-" + p.size} data-table>
      <table className="lv">
        <thead><tr>
          <th className="c-th" style={{ textAlign: "center" }}>ปก</th>{head("name", "ชื่อไฟล์", "c-name")}{head("size", "ขนาด", "c-size")}{head("video", "Video", "c-video")}{head("audio", "Audio", "c-a")}{head("subs", "Subtitle", "c-s")}{head("status", "สภาพไฟล์", "c-st")}
        </tr></thead>
        <tbody>
          {rows.map((m) => {
            const k = kindOf(m, p.reminder);
            const src = thumbUrl(m.thumb);
            return (
              <tr key={m.id} className={(m.id === p.selId ? "sel" : "") + (m.missing ? " missing" : "")} {...kb(() => p.onSel(m.id))} aria-selected={m.id === p.selId}>
                {/* ชี้รูปขึ้นภาพใหญ่ ตัวเดียวกับหน้าจับคู่ปก (พี่กันสั่ง 9 พ.ย. 2569 "เอาเมาส์ชี้ที่รูป จะ popup ภาพขึ้นมาดู") */}
                <td>{src ? <HoverBig src={src} ratio={m.coverAspect || 2 / 3} name={m.name}><img className={"th" + ((m.coverAspect ?? 0) >= 1 ? " wide" : "")} src={src} alt="" loading="lazy" /></HoverBig> : <NoCoverTh m={m} on={p.showFrames} />}</td>
                <td><Hl text={m.name} used={p.used} head={m.shownLink ? <LinkMark /> : undefined} tail={<b className="lvext">.{m.ext}</b>} /><div className="lvstars"><Stars m={m} /></div></td>
                <td><span className="nw">{fmtSize(m.size)}</span></td>
                <td className="lv-v" title={m.videoShort ?? undefined}><ChipRow items={videoChips(m.videoShort)} /></td>
                <td className="lv-a" title={tracks(m.audio, true) || undefined}><ChipRow items={trackChips(m.audio, true)} /></td>
                <td className="lv-s" title={tracks(m.subs, false) || undefined}><ChipRow items={trackChips(m.subs, false)} /></td>
                <td style={{ whiteSpace: "nowrap" }}><span className="lvstat"><Badge kind={k} title={labelOf(m, p.reminder)} /><span className="lvword">{TABLE_LABEL[k]}</span></span></td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}