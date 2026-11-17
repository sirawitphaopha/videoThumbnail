/* หน้าต่างซ้อน (web-craft 6.4 · 6.24)
   kind="work" แผงที่มีงานค้างหรือยืนยันลบ กดข้างนอกไม่ปิด ต้องกดปุ่มเอง (ต้นแบบ: กดนอกหน้าต่างไม่ปิด)
   kind="menu" กดข้างนอกปิดได้
   ทั้งสองแบบปิดด้วย Esc ได้เสมอ · role=dialog aria-modal · ระหว่างเปิด กล่องเนื้อหาข้างหลังเลื่อนไม่ได้
   confirm = ป๊อปยืนยัน อยู่ชั้นบนสุดของหน้าต่างทั้งหมด */
import { useEffect, useRef } from "react";
import { useEscClose } from "../lib/popup";
import { usePageActive } from "../lib/pageActive";

let openCount = 0;

export default function Dialog(p: {
  open: boolean;
  onClose: () => void;
  title: React.ReactNode;
  children?: React.ReactNode;
  actions?: React.ReactNode;
  kind?: "work" | "menu";
  confirm?: boolean;
  /** ปุ่มยืนยันแยกไว้ซ้าย ปุ่มย้อนกลับไว้ขวา กันเผลอกด (ต้นแบบ ลบขั้นที่ 2) */
  splitActions?: boolean;
  width?: number;
  /** ความสูงตายตัว สลับเนื้อหาแล้วหน้าต่างไม่ขยับ · เนื้อยาวกว่าก็เลื่อนในหน้าต่าง */
  height?: string;
}) {
  const box = useRef<HTMLDivElement>(null);
  // หน้าต่างของหน้าที่ซ่อนอยู่ (ไปเมนูอื่นแล้ว) ยังไม่แสดง ไม่ลงชั้น Esc ไม่ปิดคีย์ลัดของหน้าที่ดูอยู่ · กลับมาที่หน้านั้นแล้วค่อยขึ้น
  // (ผู้ช่วยตรวจทาน U5 · เดิมหน้าต่างสอนตัวอักษรของงาน OCR เปิดในหน้าที่ซ่อน มองไม่เห็นแต่คีย์ลัดทั้งโปรแกรมใช้ไม่ได้ และกด Esc แล้วงานหยุด)
  const active = usePageActive();
  const shown = p.open && active;
  useEscClose(shown, p.onClose);

  useEffect(() => {
    if (!shown) return;
    openCount++;
    document.body.dataset.dialogOpen = "1";
    const prev = document.activeElement as HTMLElement | null;
    // โฟกัสปุ่มแรกที่ไม่ใช่ปุ่มอันตราย คนกด Enter ทันทีจะได้ไม่ลบโดยไม่ตั้งใจ
    const first = box.current?.querySelector<HTMLElement>("button:not(.btn-danger), [tabindex='0']");
    first?.focus();
    return () => {
      openCount--;
      if (openCount <= 0) { openCount = 0; delete document.body.dataset.dialogOpen; }
      prev?.focus?.();
    };
  }, [shown]);

  if (!shown) return null;
  return (
    <div
      className={"dlg-back" + (p.confirm ? " confirm" : "")}
      onMouseDown={(e) => { if (p.kind === "menu" && e.target === e.currentTarget) p.onClose(); }}
    >
      <div ref={box} className="dlg" role="dialog" aria-modal="true" style={{ maxWidth: p.width ?? 440, height: p.height }}>
        <h4>{p.title}</h4>
        {p.children}
        {p.actions && <div className={"acts" + (p.splitActions ? " split" : "")}>{p.actions}</div>}
      </div>
    </div>
  );
}
