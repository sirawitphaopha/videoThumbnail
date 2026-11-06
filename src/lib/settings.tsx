/* การตั้งค่าของโปรแกรม ใช้ร่วมทุกหน้า · ตั้งแล้วมีผลทันที ไม่ต้องกดบันทึก (สเปกข้อ 9)
   🔴 บันทึกลงไฟล์ฝั่ง Rust สำเร็จก่อน ค่าบนจอถึงเปลี่ยน · บันทึกไม่สำเร็จขึ้นแถบแดงที่ไม่หายเอง (สกิล save-status)
   🔴 ส่งเฉพาะช่องที่เปลี่ยน ช่องอื่นฝั่ง Rust คงเดิม (สกิล data-integrity ข้อ ①) */
import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { api, type LoadedFrom, type Settings } from "./api";
import { useToast } from "../components/Toasts";

type Ctx = {
  settings: Settings | null;
  update: (patch: Partial<Settings>) => Promise<boolean>;
};

const SettingsCtx = createContext<Ctx>({ settings: null, update: async () => false });
export const useSettings = () => useContext(SettingsCtx);

export function SettingsHost({ children }: { children: React.ReactNode }) {
  const [settings, setSettings] = useState<Settings | null>(null);
  const toast = useToast();

  // โหมดทดสอบของ React รันตัวนี้สองรอบ ผลของรอบที่ถูกยกเลิกต้องทิ้ง ไม่งั้นแถบแจ้งขึ้นซ้ำสองแถบ
  useEffect(() => {
    let live = true;
    api.getSettings().then(({ settings, loadedFrom }) => {
      if (!live) return;
      setSettings(settings);
      warnLoaded(loadedFrom, toast);
    }).catch((e) => { if (live) toast({ kind: "bad", title: "อ่านการตั้งค่าไม่สำเร็จ", detail: String(e) }); });
    return () => { live = false; };
  }, [toast]);

  const update = useCallback(async (patch: Partial<Settings>) => {
    try {
      const next = await api.setSettings(patch);
      setSettings(next);
      return true;
    } catch (e) {
      toast({ kind: "bad", title: "บันทึกการตั้งค่าไม่สำเร็จ", detail: `ค่าเดิมยังอยู่ ลองใหม่อีกครั้ง · ${String(e)}` });
      return false;
    }
  }, [toast]);

  return <SettingsCtx.Provider value={{ settings, update }}>{children}</SettingsCtx.Provider>;
}

/** ไฟล์ตั้งค่าเสียตอนเปิดโปรแกรม ต้องบอกให้รู้ ไม่ใช่เงียบแล้วค่าที่ตั้งไว้หาย */
function warnLoaded(from: LoadedFrom, toast: ReturnType<typeof useToast>) {
  if (from === "backup") {
    toast({ kind: "warn", title: "ไฟล์ตั้งค่าเสีย ใช้ชุดที่สำรองไว้แทน", detail: "การตั้งค่าย้อนกลับไปเป็นครั้งก่อนหน้าหนึ่งครั้ง · หนังบนชั้นวางกับไฟล์หนังในเครื่องไม่ได้รับผลกระทบ" });
  } else if (from === "defaults") {
    toast({ kind: "bad", title: "ไฟล์ตั้งค่าเสียทั้งสองชุด กลับไปใช้ค่าเริ่มต้น", detail: "ตั้งค่าใหม่ได้ที่หน้าตั้งค่า · ไฟล์หนังในเครื่องไม่ได้รับผลกระทบ" });
  }
}
