/* เมนูของแถบเหนือตาราง กางตามที่ว่างบนจอ และ Esc ปิดเฉพาะเมนู
   แยกจาก LineCmds.tsx ตอนจัดโครงไฟล์ตามความหมาย (BUGS ข้อ 155 ขั้น 10) เนื้อโค้ดยกมาทั้งก้อน */
import { useRef, useState } from "react";
import { dropStyle, sideStyle, useDropPlacement, useSideFit } from "../../lib/popupFit";
import { useClickOutside, useEscClose } from "../../lib/popup";
import { type Tip } from "../../lib/codecAdv";
import InfoTip from "../InfoTip";
import { IcChevronDown } from "../icons";
import { type Item, type MRow } from "./lineData";

/** เมนูของแถบเหนือตาราง · กางตามที่ว่างบนจอ (popup-fit) · Esc ปิดเฉพาะเมนู */
export function CmdMenu(p: { label: string; icon: React.ReactNode; title: string; head: string; tip: Tip; sections: MRow[][]; data: string; width: number; compact?: boolean }) {
  const [open, setOpen] = useState(false);
  const wrap = useRef<HTMLDivElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const place = useDropPlacement(open, wrap, panel);
  const side = useSideFit(open, wrap, panel, "left");
  useEscClose(open, () => setOpen(false));
  useClickOutside(open, wrap, () => setOpen(false));
  return (
    <div ref={wrap} className="se-vmenuwrap">
      <button type="button" className={"btn btn-ghost btn-sm" + (open ? " pressed" : "")} aria-haspopup="true" aria-expanded={open} title={p.title} onClick={() => setOpen((o) => !o)} data-cmdmenu={p.data}>
        {p.icon}<span className="se-cl">{p.label}</span><IcChevronDown size={13} />
      </button>
      {open && (
        <div ref={panel} className="menu pop-in se-vmenu se-cmenu" role="menu" aria-label={p.title} style={{ position: "absolute", ...sideStyle(side, "left"), width: p.width, zIndex: "var(--z-menu)" as unknown as number, overflowY: "auto", ...dropStyle(place) }} data-cmdpanel={p.data}>
          <div className="se-vmrow se-cmh"><span className="se-vmh">{p.head}</span><InfoTip title={p.head} tip={p.tip} /></div>
          {p.sections.map((sec, i) => (
            <div key={i} className="se-vmsec">
              {sec.map((row) => {
                const btn = (it: Item) => (
                  <button key={it.data} type="button" role="menuitem" className={"se-vmi" + (it.why ? " off" : "")} aria-disabled={!!it.why || undefined} title={it.why}
                    onClick={() => { if (it.why) return; setOpen(false); it.run(); }} data-cmd={it.data}>
                    <span className="se-cml">{it.label}</span>{it.key && <span className="se-ckey">{it.key}</span>}
                  </button>
                );
                return Array.isArray(row) ? <div key={row[0].data} className="se-vmpair">{btn(row[0])}{btn(row[1])}</div> : btn(row);
              })}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
