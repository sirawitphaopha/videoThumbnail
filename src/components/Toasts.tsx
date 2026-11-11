/* แถบแจ้งผล ลอยกลางล่าง (สกิล save-status ข้อ 3)
   🔴 สำเร็จหายเองใน 3 วินาที (ต้นแบบ: แถบนี้หายเองใน 3 วินาที) · ผิดพลาดไม่หายเอง ต้องกดปิด
   🔴 ข้อความหลายท่อนคั่นด้วย " · " แยกเป็นบรรทัดจริง คำไทยไม่ถูกตัดกลาง
   🔴 ปิดเองได้เสมอ */
import { createContext, useCallback, useContext, useRef, useState } from "react";
import { IcClose } from "./icons";
import { Phr, StatIcon } from "./ui";

/** ok หายเองใน 3 วินาที · bad warn info ไม่หายเอง ต้องกดปิด · warn ใช้กับเรื่องที่ต้องรู้แต่ไม่ใช่ความผิดพลาด (เช่น ใช้ไฟล์สำรอง) */
export type ToastKind = "ok" | "bad" | "warn" | "info";
type Toast = { id: number; kind: ToastKind; title: string; detail?: string };
type Push = (t: Omit<Toast, "id">) => void;

const Ctx = createContext<Push>(() => {});
export const useToast = () => useContext(Ctx);

export function ToastHost({ children }: { children: React.ReactNode }) {
  const [list, setList] = useState<Toast[]>([]);
  const next = useRef(1);
  const remove = useCallback((id: number) => setList((l) => l.filter((t) => t.id !== id)), []);
  const push = useCallback<Push>((t) => {
    const id = next.current++;
    setList((l) => [...l.slice(-3), { ...t, id }]);
    if (t.kind === "ok") setTimeout(() => remove(id), 3000);
  }, [remove]);

  return (
    <Ctx.Provider value={push}>
      {children}
      <div className="toasts" role="status" aria-live="polite">
        {list.map((t) => (
          <div key={t.id} className={"toast " + t.kind}>
            <StatIcon kind={t.kind} />
            <div className="grow">
              <b>{t.title}</b>
              {t.detail?.split(/ · |  /).map((line) => <div key={line}><Phr>{line}</Phr></div>)}
            </div>
            <button type="button" className="x" aria-label="ปิดแถบนี้" title="ปิดแถบนี้" onClick={() => remove(t.id)}>
              <IcClose />
            </button>
          </div>
        ))}
      </div>
    </Ctx.Provider>
  );
}
