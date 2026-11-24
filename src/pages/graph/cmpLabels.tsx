/* ชื่อไฟล์บนจอของหน้าเทียบ LABELS กับ CONV และป้ายชื่อ Who
   แยกจาก CompareView.tsx ตอนจัดโครงไฟล์ตามความหมาย (BUGS ข้อ 155 ขั้น 7) · หน้าเทียบตั้งค่าใหม่ทุกครั้งที่วาดผ่าน setLabels ส่วนอื่นอ่านค่าล่าสุดผ่าน import */
import { FILE_C, FILE_INK } from "./compareParts";

/** ชื่อสองไฟล์บนจอ · มาจากคิวแปลงเป็นต้นฉบับกับหลังแปลง · เลือกเทียบเองเป็นไฟล์ 1 ไฟล์ 2 ไม่มีฝั่งไหนเป็นต้นฉบับ · CONV บอกว่าใช้คำแนะนำเรื่องการแปลงได้ */
export let LABELS = ["ต้นฉบับ", "หลังแปลง"], CONV = true;
/** หน้าเทียบตั้งชื่อใหม่ทุกครั้งที่วาด (เดิมกำหนดค่าตรงในตัวหน้า) */
export function setLabels(labels: string[], conv: boolean) { LABELS = labels; CONV = conv; }

export function Who({ i }: { i: number }) {
  return <span className="who" style={{ color: FILE_INK[i] }}><i style={{ background: FILE_C[i] }} />{LABELS[i]}</span>;
}
