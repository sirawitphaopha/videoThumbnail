/* เมนูซ้าย กาง 200 · ย่อ 64 เหลือไอคอน (ต้นแบบบรรทัด 460–489 · web-craft 6.22 ③)
   ย่ออยู่ ชี้ไอคอนแล้วขึ้นกล่องชื่อเมนูข้างไอคอนทางขวา ไม่บังเมนูอื่น · เลขนับกลายเป็นจุดชมพูที่มุมไอคอน
   ค่าย่อกางจำไว้ในการตั้งค่า (sidebarCollapsed) เปิดครั้งหน้ายังเหมือนเดิม */
import { useState } from "react";
import { version } from "../../package.json";
import { IcBitrate, IcBrand, IcCheck, IcCollapse, IcGraph, IcLink, IcMix, IcPoster, IcSettings, IcShelf } from "./icons";

export type Page = "shelf" | "poster" | "link" | "av" | "check" | "graph" | "bitrate" | "settings";

type Item = { id: Page; label: string; icon: React.ReactNode; count?: number; tip?: string };

type Props = {
  page: Page;
  onPage: (p: Page) => void;
  collapsed: boolean;
  onToggle: () => void;
  shelfCount?: number;
  checkCount?: number;
  /** คู่รูปปกที่รอยืนยัน */
  linkCount?: number;
  /** บรรทัดท้ายเมนู · ไม่ส่ง = ไม่แสดง */
  foot?: { folders: number; totalSize: string } | null;
};

export default function Sidebar({ page, onPage, collapsed, onToggle, shelfCount, checkCount, linkCount, foot }: Props) {
  const [tip, setTip] = useState<{ text: string; x: number; y: number } | null>(null);

  const items: Item[] = [
    { id: "shelf", label: "ชั้นวางหนัง", icon: <IcShelf />, count: shelfCount },
    { id: "poster", label: "ใส่โปสเตอร์", icon: <IcPoster /> },
    // หน้าจับคู่ปก ต่อจากใส่โปสเตอร์ (พี่กันเคาะ *"แยกหน้า"* · มอคอัป docs/mockups/poster-link.html)
    {
      id: "link", label: "จับคู่ปก", icon: <IcLink />, count: linkCount || undefined,
      tip: linkCount ? `จับคู่ปก · รอยืนยัน ${linkCount} คู่` : undefined,
    },
    // หน้าเสียงและซับ ต่อจากใส่โปสเตอร์ (มอคอัป docs/mockups/audio-merge.html · แผนเสียงและซับ ขั้น 2)
    { id: "av", label: "เสียงและซับ", icon: <IcMix /> },
    {
      id: "check", label: "ตรวจไฟล์", icon: <IcCheck />, count: checkCount || undefined,
      tip: checkCount ? `ตรวจไฟล์ · มี ${checkCount} เรื่องที่ควรตรวจ` : undefined,
    },
    { id: "graph", label: "กราฟเสียง", icon: <IcGraph /> },
    // หน้าบิตเรตวิดีโอแบบ Bitrate Viewer (พี่กันสั่ง 9 พ.ย. 2569 "เอาใส่สักหน้านึงในโปรแกรมก่อน ค่อยย้าย")
    { id: "bitrate", label: "บิตเรต", icon: <IcBitrate /> }, // ดูได้ทั้งวิดีโอและเสียงแล้ว (พี่กันสั่ง 10 พ.ย. 2569 เปลี่ยนชื่อ)
    { id: "settings", label: "ตั้งค่า", icon: <IcSettings /> },
  ];

  const showTip = (e: React.SyntheticEvent<HTMLElement>, text: string) => {
    if (!collapsed) return;
    const r = e.currentTarget.getBoundingClientRect();
    setTip({ text, x: r.right + 10, y: r.top + r.height / 2 });
  };
  const hideTip = () => setTip(null);

  return (
    /* กรอบนอกเปลี่ยนความกว้างทันที เนื้อหาจัดแถวครั้งเดียวตอนกด · แถบเมนูข้างในค่อย ๆ เลื่อนทับ */
    <div className={"sidewrap" + (collapsed ? " mini" : "")}>
    <aside className={"side" + (collapsed ? " mini-nav" : "")} data-navbar role="navigation" aria-label="เมนูหลัก">
      <div className="brand"><IcBrand /><span className="navtxt">ชั้นหนัง</span></div>
      {items.map((it) => (
        <button
          key={it.id}
          type="button"
          className={"nav" + (page === it.id ? " on" : "")}
          aria-current={page === it.id ? "page" : undefined}
          aria-label={it.tip ?? it.label}
          onClick={() => onPage(it.id)}
          onMouseEnter={(e) => showTip(e, it.tip ?? it.label)}
          onMouseLeave={hideTip}
          onFocus={(e) => showTip(e, it.tip ?? it.label)}
          onBlur={hideTip}
        >
          {it.icon}
          <span className="navtxt">{it.label}</span>
          {it.count != null && <span className="count">{it.count}</span>}
        </button>
      ))}
      {foot && (
        <div className="foot">
          โฟลเดอร์หนัง {foot.folders} โฟลเดอร์<br />ใช้พื้นที่รวม <span className="nw">{foot.totalSize}</span>
        </div>
      )}
      <button
        type="button"
        className="nav navtoggle"
        aria-label={collapsed ? "ขยายเมนู" : "ย่อเมนู"}
        aria-expanded={!collapsed}
        onClick={() => { hideTip(); onToggle(); }}
        onMouseEnter={(e) => showTip(e, "ขยายเมนู")}
        onMouseLeave={hideTip}
      >
        <IcCollapse />
        <span className="navtxt">{collapsed ? "ขยายเมนู" : "ย่อเมนู"}</span>
      </button>
      <div className="navver" title={"ชั้นหนัง รุ่น " + version} data-version>v{version}</div>
      {tip && (
        <div className="navtip" role="tooltip" style={{ left: tip.x, top: tip.y, translate: "0 -50%" }}>
          {tip.text}
        </div>
      )}
    </aside>
    </div>
  );
}
