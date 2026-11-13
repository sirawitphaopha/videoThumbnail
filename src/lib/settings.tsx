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
    api.getSettings().then(({ settings, loadedFrom, recoveredFolders }) => {
      if (!live) return;
      setSettings(settings);
      warnLoaded(loadedFrom, recoveredFolders ?? 0, toast);
    }).catch((e) => { if (live) toast({ kind: "bad", title: "อ่านการตั้งค่าไม่สำเร็จ", detail: String(e) }); });
    return () => { live = false; };
  }, [toast]);

  // แถบแดงขึ้นที่นี่ที่เดียว หน้าที่เรียกห้ามขึ้นซ้ำ และงานที่ทำต่อต้องรอผล true ก่อน (AUDIT ข้อ 135 · เดิมหน้าตั้งค่าขึ้นแถบแดงซ้ำอีกแถบ แล้วขึ้นแถบเขียวว่าเพิ่มโฟลเดอร์แล้วทั้งที่ยังไม่ได้บันทึก)
  const update = useCallback(async (patch: Partial<Settings>) => {
    try {
      // รุ่นทดสอบ ตัวตรวจจำลองบันทึกไม่สำเร็จ เช่น "DISK_FULL:C" ผ่าน window.__settingsFail · ตัวจริงไม่มีทางนี้
      const fail = import.meta.env.DEV ? (window as unknown as { __settingsFail?: string }).__settingsFail : undefined;
      if (fail) throw fail;
      const next = await api.setSettings(patch);
      setSettings(next);
      return true;
    } catch (e) {
      const msg = String(e);
      // ไดรฟ์เต็มบอกตรง ๆ ว่าไดรฟ์ไหน (BUGS ข้อ 88 ① พี่กันสั่ง "ต้องบอกด้วยว่าตอนนี้ไดรฟ์เต็ม") · ฝั่ง Rust ส่ง DISK_FULL:ตัวอักษรไดรฟ์
      const full = /DISK_FULL:([A-Za-z]+)/.exec(msg);
      // เว้นวรรคสองช่องแยกเป็นสองประโยค · ไดรฟ์ C ก่อน ใช้ช่องว่างไม่ตัดบรรทัด วลีไม่ขาดกลาง (พี่กันทัก 13 พ.ย. 2569 "ไดรฟ์ C เเล้วเเบ่งบรรทัด ก่อน")
      if (full) toast({ kind: "bad", title: `ไดรฟ์ ${full[1]} เต็ม จึงบันทึกการตั้งค่าไม่ได้`, detail: `ค่าที่เพิ่งเปลี่ยนยังไม่เข้าเครื่อง และค่าเดิมยังอยู่ครบ  ให้ลบหรือย้ายไฟล์ที่ไม่ใช้ออกจากไดรฟ์ ${full[1]} ก่อน แล้วลองใหม่อีกครั้ง` });
      else toast({ kind: "bad", title: "บันทึกการตั้งค่าไม่สำเร็จ", detail: `ค่าที่เพิ่งเปลี่ยนยังไม่เข้าเครื่องและค่าเดิมยังอยู่ ให้ลองใหม่อีกครั้ง  ${msg}` });
      return false;
    }
  }, [toast]);

  return <SettingsCtx.Provider value={{ settings, update }}>{children}</SettingsCtx.Provider>;
}

/** ไฟล์ตั้งค่าเสียตอนเปิดโปรแกรม ต้องบอกให้รู้ ไม่ใช่เงียบแล้วค่าที่ตั้งไว้หาย */
function warnLoaded(from: LoadedFrom, recovered: number, toast: ReturnType<typeof useToast>) {
  if (from === "partial") {
    // ช่องเดียวผิดชนิด ไม่ทิ้งทั้งไฟล์แล้ว (AUDIT ข้อ 129)
    toast({ kind: "warn", title: "ไฟล์ตั้งค่าเสียบางช่อง จึงกลับเป็นค่าตั้งต้นเฉพาะช่องนั้น", detail: "ค่าอื่นกับรายชื่อโฟลเดอร์หนังยังอยู่ครบ ส่วนหนังบนชั้นวางกับไฟล์หนังในเครื่องไม่ได้รับผลกระทบ" });
  } else if (from === "backup") {
    toast({ kind: "warn", title: "ไฟล์ตั้งค่าเสีย ใช้ชุดที่สำรองไว้แทน", detail: "การตั้งค่าย้อนกลับไปเป็นครั้งก่อนหน้าหนึ่งครั้ง ส่วนหนังบนชั้นวางกับไฟล์หนังในเครื่องไม่ได้รับผลกระทบ" });
  } else if (from === "defaults") {
    // รายชื่อโฟลเดอร์คืนจากคลังหนัง ชั้นวางกับประวัติตรวจไม่หาย (AUDIT ข้อ 129)
    toast({ kind: "bad", title: "ไฟล์ตั้งค่าเสียทั้งสองชุด กลับไปใช้ค่าเริ่มต้น", detail: recovered > 0
      ? `เอารายชื่อโฟลเดอร์หนัง ${recovered} โฟลเดอร์คืนจากชั้นวางแล้ว ส่วนค่าอื่นตั้งใหม่ได้ที่หน้าตั้งค่า และไฟล์หนังในเครื่องไม่ได้รับผลกระทบ`
      : "ตั้งค่าใหม่ได้ที่หน้าตั้งค่า และไฟล์หนังในเครื่องไม่ได้รับผลกระทบ" });
  }
}
