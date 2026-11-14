/* เมนูซ้าย กาง 200 · ย่อ 64 เหลือไอคอน (ต้นแบบบรรทัด 460–489 · web-craft 6.22 ③)
   ย่ออยู่ ชี้ไอคอนแล้วขึ้นกล่องชื่อเมนูข้างไอคอนทางขวา ไม่บังเมนูอื่น · เลขนับกลายเป็นจุดชมพูที่มุมไอคอน
   ค่าย่อกางจำไว้ในการตั้งค่า (sidebarCollapsed) เปิดครั้งหน้ายังเหมือนเดิม */
import { useState } from "react";
import { version } from "../../package.json";
import { IcBitrate, IcBrand, IcCheck, IcCollapse, IcGraph, IcInfo, IcLink, IcMix, IcSubtitle, IcPoster, IcSettings, IcShelf } from "./icons";

export type Page = "shelf" | "poster" | "link" | "av" | "subtitle" | "check" | "graph" | "bitrate" | "mediainfo" | "settings";

/** en คำอังกฤษคำเดียวใต้ไอคอนตอนเมนูพับ (BUGS ข้อ 116 พี่กันสั่ง "เพิ่มคำภาษษอังกิดตัวเล็กๆ ใต้ icon ที เเค่ 1 คำ") */
type Item = { id: Page; label: string; en: string; icon: React.ReactNode; count?: number; tip?: string };

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
    { id: "shelf", label: "ชั้นวางหนัง", en: "Shelf", icon: <IcShelf />, count: shelfCount },
    { id: "poster", label: "ใส่โปสเตอร์", en: "Poster", icon: <IcPoster /> },
    // หน้าจับคู่ปก ต่อจากใส่โปสเตอร์ (พี่กันเคาะ *"แยกหน้า"* · มอคอัป docs/mockups/poster-link.html)
    {
      id: "link", label: "จับคู่ปก", en: "Link", icon: <IcLink />, count: linkCount || undefined,
      tip: linkCount ? `จับคู่ปก มีคู่รอยืนยัน ${linkCount} คู่` : undefined,
    },
    // หน้าเสียงและซับ ต่อจากใส่โปสเตอร์ (มอคอัป docs/mockups/audio-merge.html · แผนเสียงและซับ ขั้น 2)
    { id: "av", label: "เสียงและซับ", en: "Tracks", icon: <IcMix /> },
    // หน้าซับไตเติล ไว้รอ งานเต็มอยู่ ROADMAP (BUGS ข้อ 101 พี่กันสั่ง 13 พ.ย. 2569 "สร้าเมนู ซับไตเติลไว้รอด้วย")
    { id: "subtitle", label: "ซับไตเติล", en: "Subtitle", icon: <IcSubtitle /> },
    {
      id: "check", label: "ตรวจไฟล์", en: "Check", icon: <IcCheck />, count: checkCount || undefined,
      tip: checkCount ? `ตรวจไฟล์ มี ${checkCount} เรื่องที่ควรตรวจ` : undefined,
    },
    { id: "graph", label: "กราฟเสียง", en: "Audio", icon: <IcGraph /> },
    // หน้าบิตเรตวิดีโอแบบ Bitrate Viewer (พี่กันสั่ง 9 พ.ย. 2569 "เอาใส่สักหน้านึงในโปรแกรมก่อน ค่อยย้าย")
    { id: "bitrate", label: "บิตเรต", en: "Bitrate", icon: <IcBitrate /> }, // ดูได้ทั้งวิดีโอและเสียงแล้ว (พี่กันสั่ง 10 พ.ย. 2569 เปลี่ยนชื่อ)
    // หน้า MediaInfo เปิดไฟล์ไหนก็ได้ ไม่ต้องอยู่ในชั้นวาง (BUGS ข้อ 54 พี่กันแทรก 12 พ.ย. 2569 "สร้างเเถบเมนู media infor")
    { id: "mediainfo", label: "MediaInfo", en: "Info", icon: <IcInfo /> },
    { id: "settings", label: "ตั้งค่า", en: "Settings", icon: <IcSettings /> },
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
          <span className="naven" aria-hidden="true">{it.en}</span>
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
        <span className="naven" aria-hidden="true">Expand</span>
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
