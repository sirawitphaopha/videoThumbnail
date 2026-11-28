/* หน้ากราฟเสียง (มอคอัป docs/mockups/audio-graph.html · พี่กันสั่ง "ลงมือทำเลย" 7 พ.ย. 2569)
   6 แบบ รูปคลื่น (เส้นละเอียด หรือ แท่ง) · ความถี่ (สีตามชุด หรือ สีรุ้ง) · ความดัง · ซ้อนเทียบ · วิเคราะห์ (แบบ Spek) · ความถี่เฉลี่ย (แบบ Plot Spectrum ของ Audacity)
   ข้อมูลจริงจาก audiograph.rs · ภาพรวมทั้งไฟล์อ่านครั้งเดียว ช่วงที่ซูมอ่านเฉพาะช่วง ระหว่างรอใช้ภาพรวมวาดไปก่อน ไม่มีจอว่าง
   จัดโครงตามความหมาย 24 พ.ย. 2569 (BUGS ข้อ 155 ขั้น 4) ค่าและงานอยู่ชุด hook useGraph*.ts รวมใน useGraphPage ชิ้นหน้าจออยู่ graphBits graphHead graphPanel graphPlot หน้าที่ยังไม่เห็นกราฟอยู่ GraphHome GraphState */
import { Component } from "react";
import { LoadPill } from "../../components/ui";
import { IcGraph } from "../../components/icons";
import { SavingCtx } from "./draw";
import "../../styles/av.css";
import { useGraphPage } from "./useGraphPage";
import type { GraphProps } from "./useGraphBase";
import { modeBits } from "./graphBits";
import { headBits } from "./graphHead";
import { panelBits } from "./graphPanel";
import { plotBits } from "./graphPlot";
import { cmpView, convertView, startView } from "./GraphHome";
import { errorView, loadingView } from "./GraphState";
import { PlayBar } from "./playBar";
export { SPEK_RES_KEY } from "./graphPrefs";

/** track ลำดับแทร็กเสียงที่จะเปิด (หน้าบิตเรตส่งแทร็กที่ดูอยู่ BUGS ข้อ 119) · ไม่ส่งเปิดแทร็กแรก */
export type GraphReq = { path: string; t?: number; track?: number };

export default function GraphPage(props: GraphProps) {
  const pg = useGraphPage(props);
  const b1 = { ...pg, ...modeBits(pg) };
  // ทางแยกเรียกเป็นฟังก์ชัน ไม่วางเป็นแท็ก JSX · แท็กคนละตัวทำให้ React สร้างกล่องบนใหม่ทุกครั้งที่สลับ (ปุ่มโหมดสีไม่ค่อย ๆ จาง โฟกัสหลุด)
  // เรียกตรงแล้วได้กล่อง div.ag ชุดเดียวกับโค้ดเดิมที่ React ใช้ต่อ (ผู้ช่วยตรวจทานขั้น 13 ของ BUGS ข้อ 155) · ฟังก์ชัน *View ห้ามมี hook
  if (b1.cmp) return cmpView({ pg: b1 });
  if (b1.mode === "convert") return convertView({ pg: b1 });
  /* ---------- ยังไม่เลือกไฟล์ ---------- */
  if (!b1.path) return startView({ pg: b1 });
  const b2 = { ...b1, ...headBits(b1) };
  const b3 = { ...b2, ...panelBits(b2) };
  /* ---------- กำลังอ่าน · อ่านไม่ได้ ---------- */
  if (b3.error && !b3.ov) return errorView({ pg: b3 });
  if (!b3.ov || !b3.src) return loadingView({ pg: b3 });
  /* ---------- กราฟ ---------- */
  const g = { ...b3, ...plotBits(b3) };
  const { ctl, head, panel, plot, prefs, saving, tagDlg, view, viewSlow, gplay, dur, playStart } = g;
  return (
    <SavingCtx.Provider value={saving}><div className="ag" data-graph data-graphview={view}>
      <div className="agstick">{head}{ctl}<PlayBar ctl={gplay.ctl} dur={dur} at={playStart} /></div>
      <div className={"agb" + (prefs.wide ? " wide" : "")}>{prefs.wide ? null : panel}{plot}{viewSlow && !saving && <LoadPill text="กำลังโหลดกราฟ…" />}</div>
      {tagDlg}
    </div></SavingCtx.Provider>
  );
}

/** กรอบกันพัง · หน้ากราฟวาดพังกับไฟล์แปลก ๆ ขึ้นข้อความในหน้านี้ เมนูกับหน้าอื่นยังใช้ได้ ไม่ว่างทั้งโปรแกรม */
export class GraphBoundary extends Component<{ children: React.ReactNode }, { err: string | null }> {
  state = { err: null as string | null };
  static getDerivedStateFromError(e: unknown) { return { err: String(e) }; }
  render() {
    if (!this.state.err) return this.props.children;
    return (
      <div className="ag" data-graph>
        <div className="stat bad" data-graphcrash>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" aria-hidden="true"><circle cx="12" cy="12" r="9" /><path d="M12 7v6M12 16.5v.5" /></svg>
          <div><b>หน้ากราฟเสียงวาดกราฟของไฟล์นี้ไม่ได้</b>{this.state.err} ไฟล์ไม่ถูกแก้
            <div style={{ marginTop: 8 }}><button type="button" className="btn btn-ghost btn-sm" onClick={() => this.setState({ err: null })}><IcGraph size={15} />เปิดหน้ากราฟใหม่</button></div></div>
        </div>
      </div>
    );
  }
}
