/* แถบปุ่มย่อของหน้าแก้ซับ แบบแถบเครื่องมือหลักของ Aegisub (BUGS ข้อ 113 · default_toolbar.json ส่วน main)
   ปุ่มไอคอนอย่างเดียว ชี้แล้วขึ้นชื่อคำสั่งกับคีย์ลัด · กลุ่มคั่นด้วยเส้นตามแถบของ Aegisub
   แถบกว้างเท่าที่ว่างที่เหลือในแถว ใส่กลุ่มเท่าที่พอ กลุ่มที่เหลือไปอยู่ในเมนูปุ่มอื่น (จุดสามจุด) กดถึงทุกปุ่ม
   ความกว้างคิดจากขนาดปุ่มตายตัว ไม่วัดจากของในแถบ แถบจึงไม่กระพริบสลับไปมา */
import { Fragment, useLayoutEffect, useRef, useState } from "react";
import { dropStyle, sideStyle, useDropPlacement, useSideFit } from "../../lib/popupFit";
import { useClickOutside, useEscClose } from "../../lib/popup";
import { IbMore } from "../icons";

export type TbItem = {
  id: string;
  /** ชื่อคำสั่งในเมนูปุ่มอื่น */
  label: string;
  /** คำอธิบายตอนชี้ */
  title: string;
  icon: React.ReactNode;
  /** สีไอคอนตามหน้าที่ (คลาส se-c-* ชุดเดียวกับแถวปุ่มเสียง) */
  tone?: string;
  key?: string;
  /** เหตุผลที่ตอนนี้กดไม่ได้ */
  why?: string;
  run: () => void;
};

/** ขนาดที่ใช้คิด ปุ่มกว้าง 28 ช่องว่าง 2 · เส้นคั่นกว้าง 1 ขอบข้างละ 3 บวกช่องว่างเพิ่มอีกหนึ่งช่อง · ปุ่มอื่นกว้าง 28 */
export const TB = { btn: 28, gap: 2, sep: 11, more: 28 };
export const groupW = (g: TbItem[]) => g.length * TB.btn + Math.max(0, g.length - 1) * TB.gap;
/** ความกว้างของ n กลุ่มแรก ถ้ายังมีกลุ่มเหลือบวกปุ่มอื่น */
export function groupsW(groups: TbItem[][], n: number) {
  let w = 0;
  for (let i = 0; i < n; i++) w += groupW(groups[i]) + (i ? TB.sep : 0);
  return n < groups.length ? w + (n ? TB.gap : 0) + TB.more : w;
}

export default function MainBar(p: { groups: TbItem[][] }) {
  const wrap = useRef<HTMLDivElement>(null);
  const [w, setW] = useState(0);
  useLayoutEffect(() => {
    const el = wrap.current;
    if (!el) return;
    const f = () => setW(el.clientWidth);
    f();
    const ro = new ResizeObserver(f);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const g = p.groups.filter((x) => x.length);
  let n = g.length;
  while (n > 0 && groupsW(g, n) > w) n--;
  const shown = g.slice(0, n), hidden = g.slice(n);
  return (
    <div ref={wrap} className="se-tbar" role="toolbar" aria-label="แถบปุ่มย่อ" data-mainbar data-tbshown={shown.reduce((s, x) => s + x.length, 0)}>
      {shown.map((grp, i) => (
        <Fragment key={grp[0].id}>
          {i > 0 && <span className="se-tbsep" aria-hidden="true" />}
          {grp.map((it) => (
            <button key={it.id} type="button" className={"se-tbtn" + (it.why ? " off" : "")} aria-disabled={!!it.why || undefined} aria-label={it.label}
              title={it.why ? `${it.label}  ${it.why}` : it.title + (it.key ? ` (${it.key})` : "")} onClick={() => { if (!it.why) it.run(); }} data-tb={it.id}>
              <span className={it.tone ? `se-c-${it.tone}` : undefined}>{it.icon}</span>
            </button>
          ))}
        </Fragment>
      ))}
      {hidden.length > 0 && <MoreMenu groups={hidden} />}
    </div>
  );
}

/** เมนูปุ่มที่ไม่พอที่ในแถบ · กางตามที่ว่างบนจอ (popup-fit) · Esc ปิดเฉพาะเมนู */
function MoreMenu(p: { groups: TbItem[][] }) {
  const [open, setOpen] = useState(false);
  const wrap = useRef<HTMLDivElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const place = useDropPlacement(open, wrap, panel);
  const side = useSideFit(open, wrap, panel, "left");
  useEscClose(open, () => setOpen(false));
  useClickOutside(open, wrap, () => setOpen(false));
  const count = p.groups.reduce((s, x) => s + x.length, 0);
  return (
    <div ref={wrap} className="se-vmenuwrap se-tbmorewrap">
      <button type="button" className={"se-tbtn" + (open ? " on" : "")} aria-haspopup="true" aria-expanded={open} aria-label="ปุ่มอื่น"
        title={`ปุ่มอื่นอีก ${count} ปุ่มที่ไม่พอที่ในแถบ`} onClick={() => setOpen((o) => !o)} data-tb-more>
        <IbMore size={15} />
      </button>
      {open && (
        <div ref={panel} className="menu pop-in se-vmenu se-cmenu" role="menu" aria-label="ปุ่มอื่น" style={{ position: "absolute", ...sideStyle(side, "left"), width: 340, zIndex: "var(--z-menu)" as unknown as number, overflowY: "auto", ...dropStyle(place) }} data-tb-morepanel>
          {p.groups.map((grp) => (
            <div key={grp[0].id} className="se-vmsec">
              {grp.map((it) => (
                <button key={it.id} type="button" role="menuitem" className={"se-vmi se-tbmi" + (it.why ? " off" : "")} aria-disabled={!!it.why || undefined} title={it.why ?? it.title}
                  onClick={() => { if (it.why) return; setOpen(false); it.run(); }} data-tbm={it.id}>
                  <span className={"se-tbmic" + (it.tone ? ` se-c-${it.tone}` : "")}>{it.icon}</span><span className="se-cml">{it.label}</span>{it.key && <span className="se-ckey">{it.key}</span>}
                </button>
              ))}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
