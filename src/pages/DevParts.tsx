/* ห้องชิ้นส่วน · มีเฉพาะตอนทดสอบ (import.meta.env.DEV) เปิดด้วย #parts ต่อท้ายที่อยู่หน้า
   วางชิ้นส่วนกลางทุกแบบไว้หน้าเดียว ไว้วัดสี ขนาด ความโค้ง ตอนชี้ จากหน้าต่างจริงเทียบกับต้นแบบ (แผนขั้น 1 ตารางตรวจผล)
   ตัวติดตั้งจริงไม่มีหน้านี้ */
import { useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import Dialog from "../components/Dialog";
import Dropdown from "../components/Dropdown";
import { useToast } from "../components/Toasts";
import { Range, Seg, Skel, StatIcon, Switch } from "../components/ui";
import { inApp } from "../lib/api";

const SORTS = [
  { value: "name-asc", label: "ชื่อ ก–ฮ" },
  { value: "name-desc", label: "ชื่อ ฮ–ก" },
  { value: "year", label: "ปีที่ออกฉาย ใหม่ไปเก่า" },
  { value: "added", label: "เพิ่มเข้าชั้นล่าสุด" },
  { value: "size", label: "ขนาดไฟล์ ใหญ่ไปเล็ก" },
  { value: "status", label: "สภาพไฟล์ ที่เสียขึ้นก่อน" },
];

export default function DevParts() {
  const toast = useToast();
  const [view, setView] = useState<"grid" | "table">("grid");
  const [size, setSize] = useState<"s" | "m" | "l">("m");
  const [sw, setSw] = useState(true);
  const [q, setQ] = useState(90);
  const [chk, setChk] = useState(true);
  const [radio, setRadio] = useState<"keep" | "trash">("keep");
  const [sort, setSort] = useState("name-asc");
  const [dlg, setDlg] = useState<0 | 1 | 2>(0);

  return (
    <div className="pagewrap" data-parts style={{ padding: 22, display: "flex", flexDirection: "column", gap: 22 }}>
      {/* ดรอปดาวน์ใกล้ขอบบน ที่ว่างด้านล่างพอ ต้องกางลง */}
      <div data-part="dd-top" style={{ display: "flex" }}>
        <Dropdown label="เรียงด้านบน" value={sort} onChange={setSort} options={SORTS} display={(o) => `เรียงตาม${o?.label ?? ""}`} />
      </div>
      <section data-part="buttons">
        <h3 style={{ margin: "0 0 10px", fontSize: 15 }}>ปุ่ม</h3>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
          <button type="button" className="btn btn-main" data-btn="main">เปิดเล่น</button>
          <button type="button" className="btn btn-ghost" data-btn="ghost">เปลี่ยนชื่อ</button>
          <button type="button" className="btn btn-ok" data-btn="ok">ไปดูบนชั้นวาง</button>
          <button type="button" className="btn btn-bad" data-btn="bad">ตรวจซ้ำ</button>
          <button type="button" className="btn btn-danger" data-btn="danger">ยืนยันลบ</button>
          <button type="button" className="btn btn-wait" data-btn="wait" aria-disabled="true">ยังกดไม่ได้ ใส่รูปโปสเตอร์ก่อน</button>
          <button type="button" className="btn btn-ghost btn-sm" data-btn="sm">การแสดงผล</button>
          <button type="button" className="icon-btn" data-btn="icon" aria-label="เปลี่ยนชื่อ">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 20h4L19 9l-4-4L4 16v4z" /></svg>
          </button>
        </div>
      </section>

      <section data-part="seg">
        <h3 style={{ margin: "0 0 10px", fontSize: 15 }}>ปุ่มคู่ ปุ่มสาม</h3>
        <div style={{ display: "flex", gap: 14, flexWrap: "wrap", alignItems: "center" }}>
          <Seg label="มุมมอง" value={view} onChange={setView} options={[{ value: "grid", label: "ภาพปก" }, { value: "table", label: "ตาราง" }]} />
          <Seg label="ขนาดปก" small value={size} onChange={setSize} options={[{ value: "s", label: "เล็ก" }, { value: "m", label: "กลาง" }, { value: "l", label: "ใหญ่" }]} />
          <Seg label="ขนาดปก" small disabledReason="ขนาดปกใช้ได้ตอนดูแบบภาพปก" value={size} onChange={setSize} options={[{ value: "s", label: "เล็ก" }, { value: "m", label: "กลาง" }, { value: "l", label: "ใหญ่" }]} />
        </div>
      </section>

      <section data-part="controls" style={{ display: "flex", gap: 28, flexWrap: "wrap", alignItems: "center" }}>
        <label style={{ display: "flex", gap: 10, alignItems: "center" }}><Switch on={sw} onChange={setSw} label="ชื่อไฟล์ใต้ปก" />ชื่อไฟล์ใต้ปก</label>
        <Switch on={false} onChange={() => {}} label="สวิตช์ปิด" />
        <div style={{ display: "flex", gap: 10, alignItems: "center", width: 280 }}>
          <span className="small">คุณภาพ JPG</span>
          <Range label="คุณภาพ JPG" min={50} max={100} value={q} onChange={setQ} format={(v) => `${v}%`} />
          <span style={{ width: 40 }}>{q}%</span>
        </div>
        <div className="chk" role="checkbox" aria-checked={chk} tabIndex={0} onClick={() => setChk(!chk)} onKeyDown={(e) => { if (e.key === " " || e.key === "Enter") { e.preventDefault(); setChk(!chk); } }}>
          <span className={"box" + (chk ? " on" : "")}>{chk && <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3.5"><path d="M5 12.5l4.5 4.5L19 7.5" /></svg>}</span>
          ตรวจไฟล์ต้นทางก่อนครอบ
        </div>
        {(["keep", "trash"] as const).map((v) => (
          <div key={v} className="chk" role="radio" aria-checked={radio === v} tabIndex={0} onClick={() => setRadio(v)} onKeyDown={(e) => { if (e.key === " " || e.key === "Enter") { e.preventDefault(); setRadio(v); } }}>
            <span className={"radio" + (radio === v ? " on" : "")} />{v === "keep" ? "เก็บไฟล์เดิมไว้" : "ลบไฟล์เดิมหลังตรวจผ่าน"}
          </div>
        ))}
      </section>

      <section data-part="status" style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12 }}>
        <div className="stat ok"><StatIcon kind="ok" /><div><b>ไฟล์สมบูรณ์</b>ไม่พบภาพหรือเสียงเสีย</div></div>
        <div className="stat bad"><StatIcon kind="bad" /><div><b>ไฟล์เสียหาย</b>ภาพเสียช่วงนาที 1:12:30 ถึง 1:12:41</div></div>
        <div className="stat warn"><StatIcon kind="warn" /><div><b>ยังไม่เคยตรวจไฟล์นี้</b>ตรวจแบบเร็วใช้เวลาไม่กี่วินาที</div></div>
        <div className="stat info"><StatIcon kind="info" /><div><b>ยังไม่ได้ครอบเป็น MKV</b>ภาพและเสียงไม่ถูกแปลงใหม่</div></div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "flex-start", alignContent: "flex-start" }}>
          <span className="pill p-ok">สมบูรณ์</span><span className="pill p-bad">เสียหาย</span>
          <span className="pill p-warn">ควรตรวจ</span><span className="pill p-info">ยังไม่ได้ครอบ</span>
        </div>
        <div className="bar" style={{ alignSelf: "center" }}><i style={{ width: "64%" }} /></div>
        <div style={{ display: "flex", gap: 10, alignItems: "flex-end" }} data-part="skel">
          <Skel w={72} h={108} r={5} /><div style={{ flex: 1 }}><Skel w="80%" h={14} /><Skel w="50%" h={12} style={{ marginTop: 8 }} /></div>
        </div>
      </section>

      <section data-part="popups" style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
        <button type="button" className="btn btn-ghost" onClick={() => setDlg(1)} data-open="dialog">เปิดหน้าต่างถาม</button>
        <button type="button" className="btn btn-ghost" onClick={() => setDlg(2)} data-open="delete2">เปิดหน้าต่างลบขั้นที่ 2</button>
        <button type="button" className="btn btn-ghost" data-open="toast-ok" onClick={() => toast({ kind: "ok", title: "เปลี่ยนชื่อไฟล์แล้ว", detail: "ชื่อในเครื่องเปลี่ยนตามแล้ว แถบนี้หายเองใน 3 วินาที" })}>แถบสำเร็จ</button>
        <button type="button" className="btn btn-ghost" data-open="toast-bad" onClick={() => toast({ kind: "bad", title: "ไฟล์ถูกเปิดอยู่ในโปรแกรมอื่น", detail: "ปิดโปรแกรมเล่นหนังก่อน แล้วกดลองใหม่ · แถบนี้ไม่หายเอง" })}>แถบผิดพลาด</button>
        {inApp && <button type="button" className="btn btn-ghost" data-open="fake-job" onClick={() => invoke("dev_fake_job", { seconds: 120 })}>งานปลอม 2 นาที</button>}
      </section>

      <div style={{ height: 120 }} />
      {/* ดรอปดาวน์ใกล้ขอบล่างหน้าต่าง ต้องพลิกขึ้น (popup-fit) */}
      <div data-part="dd-bottom" style={{ position: "fixed", right: 30, bottom: 18, zIndex: 5 }}>
        <Dropdown label="เรียง" value={sort} onChange={setSort} options={SORTS} display={(o) => `เรียงตาม${o?.label ?? ""}`} />
      </div>
      <Dialog
        open={dlg === 1}
        onClose={() => setDlg(0)}
        kind="work"
        title="ลบไฟล์เดิมหลังตรวจผ่าน · ขั้นที่ 1 จาก 2"
        actions={<><button type="button" className="btn btn-ghost" onClick={() => setDlg(0)}>ยกเลิก</button><button type="button" className="btn btn-main" onClick={() => setDlg(2)}>ถัดไป</button></>}
      >
        <div className="small" style={{ fontSize: 14, color: "var(--txt2)" }}>ไฟล์เดิมจะไปอยู่ในถังขยะของ Windows หลังไฟล์ใหม่ตรวจผ่านแล้วเท่านั้น</div>
      </Dialog>
      <Dialog
        open={dlg === 2}
        onClose={() => setDlg(0)}
        kind="work"
        confirm
        splitActions
        title="ยืนยันอีกครั้ง · ขั้นที่ 2 จาก 2"
        actions={<><button type="button" className="btn btn-danger" onClick={() => setDlg(0)}>ยืนยันลบ</button><button type="button" className="btn btn-ghost" onClick={() => setDlg(1)}>ย้อนกลับ</button></>}
      >
        <div className="small" style={{ fontSize: 14, color: "var(--txt2)" }}>กู้คืนได้จากถังขยะของ Windows จนกว่าจะล้างถังขยะ</div>
      </Dialog>
    </div>
  );
}
