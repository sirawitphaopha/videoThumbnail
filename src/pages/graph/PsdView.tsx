/* หน้ากราฟเสียง มุมมองความถี่เฉลี่ย (PsdView) · ช่องซ้ายขวากลาง ความดังตามความถี่ คำอธิบาย Mid Side
   แยกจาก GraphPage.tsx ตอนแบ่งไฟล์ทั้งโปรเจกต์ (BUGS ข้อ 153 · แผนแบ่งไฟล์ขั้น 1.8) ย้ายมาทั้งก้อน เนื้อโค้ดไม่เปลี่ยน
   จัดโครงตามความหมาย 24 พ.ย. 2569 (BUGS ข้อ 155 ขั้น 7) ข้อมูลอยู่ usePsdData การวาดอยู่ usePsdDraw ของระดับไฟล์อยู่ psdShared ไฟล์นี้เหลือหน้าจอ */
import Dropdown from "../../components/Dropdown";
import { Switch } from "../../components/ui";
import InfoTip from "../../components/InfoTip";
import { IbSave } from "../../components/icons";
import { WARN, minus, noteOf, spanDigits, tfmt, tfmtD } from "./common";
import { SaveBtn } from "./draw";
import { VBar } from "./parts";
import { FZoom, Overview, TimeScroll } from "./zoom";
import { PSM, MS_TIP, PSD_TIPS } from "./psdShared";
import { usePsdData, type PsdProps } from "./usePsdData";
import { usePsdDraw } from "./usePsdDraw";
export { PSM, LOUD_TIP, PSD_HZ_MAX } from "./psdShared";

export function PsdView(p: PsdProps) {
  const d = usePsdData(p);
  const pg = { ...d, ...usePsdDraw(d) };
  const { H, W, X, Yof, checks, cur, cx, exportCsv, f, fAt, fill, grab, grids, hr, hzTxt, hzoomBox, lo, off, onPick, opts, ov, pk, plotRef, psd, psdCh, psdLog, psdSize, range, ref, resetBtn, save, scroller, series, setBox, setF, setFill, setGrids, setOff, setPsdCh, setPsdLog, setPsdSize, setRange, shown, t0, t1, th, top, topF, valAt, vr, zoomBox } = pg;
  return (
    <div className="plot" data-plot ref={plotRef as React.RefObject<HTMLDivElement>}>
      <div className="plotstick">
      {/* แถบซูมแกนความถี่อยู่แถวบนเหมือนมุมมองอื่น · แถวไม่พอ ปุ่มช่องเป็นดรอปดาวน์ (BUGS ข้อ 15 พี่กัน "ทำไม … ปุ่มซูมเเนวนอนไปอยุ่ด้านล่าง" · "ถ้าไม่พอ ไปเปลี่ยนตามรูป ให้เป็นดรอปดาว") */}
      <div className="plothead"><span style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}><b>ความถี่เฉลี่ย</b>
        <span className="psdch-seg"><div className="seg sm">{opts.map(([k, l]) => <button key={k} type="button" className={psdCh === k ? "on" : ""} onClick={() => setPsdCh(k)} data-psdch={k}>{l}</button>)}</div></span>
        <span className="psdch-dd" data-psdchdd><Dropdown label="ช่องที่ดู" value={psdCh} onChange={setPsdCh} options={opts.map(([value, l]) => ({ value, label: l }))} /></span></span>
        <span className="psdright" style={{ display: "flex", alignItems: "center", gap: 10, justifyContent: "flex-end", minWidth: 0 }}>{hzoomBox}<span className="fsep" aria-hidden="true" />{zoomBox}<span className="fsep" aria-hidden="true" />{resetBtn}</span></div>
      <Overview ov={ov} th={th} t0={t0} t1={t1} onPick={onPick} left={52} caption={t1 - t0 >= ov.duration - 0.01 ? `เฉลี่ยทั้งไฟล์ ${tfmt(ov.duration)}` : `ช่วงที่เอามาเฉลี่ย ${tfmtD(t0, spanDigits(t1 - t0))}–${tfmtD(t1, spanDigits(t1 - t0))}`} />
      {scroller?.(52, 0)}
      </div>
      <div style={{ flex: "1 0 300px", marginTop: 8, display: "flex", gap: 8, minHeight: 0 }}>
      <div className={grab.cls} style={{ position: "relative", flex: 1, minWidth: 0 }} ref={setBox} data-psdbox onWheel={vr.wheel} {...grab.props}
        onPointerMove={(e) => { if (grab.move(e)) return; const r = e.currentTarget.getBoundingClientRect(), PW = r.width - PSM.L - PSM.R, x = Math.min(PW, Math.max(0, e.clientX - r.left - PSM.L)); setF(Math.max(1, fAt(x, PW))); }}
        onPointerLeave={() => setF(null)}>
        <canvas className="cv fillcv" ref={ref} data-psd />
        {/* เส้นตั้งกับวงยอดขึ้นเฉพาะตอนเมาส์ชี้ (พี่กัน *"ต้องให้เเสดงเฉพาะเมาส์ชี้"*) · ช่องบอกค่าใต้กราฟยังอยู่ตลอด */}
        {psd && W > 0 && f != null && <>
          <div className="xh" style={{ left: cx, top: PSM.T, bottom: PSM.B }} />
          {pk && pk[1] >= lo && pk[1] <= top && X(pk[0], W) >= PSM.L && X(pk[0], W) <= W - PSM.R && <div className="psdpk" style={{ left: X(pk[0], W), top: Yof(pk[1], H) }} />}
        </>}
        <VBar v={vr} right={PSM.R + 4} top={PSM.T} bottom={PSM.B} />
      </div>
      <FZoom value={vr.z} onChange={vr.setZ} />
      </div>
      {/* แถบเลื่อนแกนความถี่ตรงกับขอบกราฟ เว้นขวาเท่าแถบซูมแนวตั้ง · ซูมแนวนอนอยู่ท้ายแถวบอกค่า หัวกราฟเต็มแล้ว */}
      <div style={{ marginRight: 30 }} data-psdhscroll><TimeScroll dur={1} t0={hr.b} t1={hr.b + 1 / hr.z} left={PSM.L} right={PSM.R} onPan={(c) => hr.setB(hr.clampB(c - 0.5 / hr.z, hr.z))} /></div>
      {/* ช่องบอกค่าใต้กราฟ แบบ Cursor กับ Peak ของ Audacity */}
      <div className="psdread" data-psdreadout>
        {/* ป้ายสีเส้นย้ายมาแทนที่แถบซูมเดิม ปุ่มเล็กลง ยังกดซ่อนแสดงเส้นได้ (BUGS ข้อ 19 พี่กัน "งั้นย้ายไปเเทนที่เเถบซูมเเนวนอน" · "อ๋อ มันคือปุ่มกด") · ⓘ อธิบาย M S (ข้อ 21) */}
        {series.length > 1 && <span className="psdlg" style={{ order: 9, marginLeft: "auto" }} data-psdlegend>{series.map((sr) => {
          const on = !off.includes(sr.key), last = on && shown.length === 1;
          return <button key={sr.key} type="button" className={"psdk" + (on ? " on" : "")} aria-pressed={on} aria-disabled={last || undefined}
            title={last ? "ต้องเหลืออย่างน้อยหนึ่งเส้น" : on ? `กดเพื่อซ่อน ${sr.long}` : `กดเพื่อแสดง ${sr.long}`} data-psdkey={sr.key}
            onClick={() => { if (!last) setOff((o) => (on ? [...o, sr.key] : o.filter((k) => k !== sr.key))); }}>
            <i style={on ? { background: sr.color, borderColor: sr.color } : { borderColor: sr.color }} />{sr.long}</button>;
        })}{series.some((sr) => sr.key === "M") && <InfoTip title="M กับ S คืออะไร" tip={MS_TIP} />}</span>}
        <span className="lbl">ตำแหน่งชี้</span>
        <span className="psdbox" data-psdcursor>{psd && f == null ? "ชี้ที่กราฟเพื่อดูค่า" : psd ? `${hzTxt(cur)} (${noteOf(cur)}) = ${shown.map((s) => (series.length > 1 ? s.name + " " : "") + minus(Math.round(valAt(s.d, cur)).toString()) + " dB").join(", ")}` : "—"}</span>
        <span className="lbl">ยอดใกล้สุด</span>
        <span className="psdbox" data-psdpeak>{pk ? `${hzTxt(pk[0])} (${noteOf(pk[0])}) = ${minus(pk[1].toFixed(1))} dB` : "—"}</span>
      </div>
      {/* ผลตรวจ บอกว่าน่าสงสัย ไม่ตัดสินเด็ดขาด ทุกข้อมีปุ่ม ⓘ (BUGS ข้อ 25 พี่กัน "เราคิดว่ามันคือฮัมเพลง ต้อเปลี่ยนคำ" · ตรวจเพิ่ม 4 อย่าง พี่กันเคาะ "ได้") */}
      {psd && <div className="psdchecks" data-psdchecks data-top={Math.round(topF)}>{checks.map((c) => (
        <div key={c.k} className={"stat " + (c.warn ? "warn" : "info") + (c.d ? "" : " slim")} data-psdcheck={c.k}>{c.warn ? WARN : <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" aria-hidden="true"><circle cx="12" cy="12" r="9" /><path d="M12 11v6M12 7.5v.5" /></svg>}
          <div className="psdck-txt" title={c.d ? `${c.b} ${c.d}` : c.b}><b>{c.b}</b>{c.d && <span> {c.d}</span>}</div><InfoTip title={c.title} tip={{ w: c.tip }} /></div>))}</div>}
      {/* ช่วงสั้นกว่าขนาด FFT ฝั่ง Rust คิดแบบเติมศูนย์ บอกแทนบรรทัดเดิม บรรทัดเดียวเท่าเดิม กรอบไม่เปลี่ยนขนาด (AUDIT ข้อ 107) */}
      {psd?.short ? <div className="small" style={{ marginTop: 6 }} data-psdshort>{`ช่วงที่เลือกสั้นเกินไป ความละเอียด ${psd.size.toLocaleString("en-US")} ต้องใช้ช่วงอย่างน้อย ${(psd.need ?? 0).toFixed(2)} วินาที เส้นจึงหยาบกว่าปกติ`}</div>
        : <div className="small" style={{ marginTop: 6 }}>{psd ? `เสียงสูงสุดที่มีราว ${(topF / 1000).toFixed(1)} kHz ใน` : ""}ช่วงที่เลือก {tfmtD(t0, spanDigits(t1 - t0))} ถึง {tfmtD(t1, spanDigits(t1 - t0))} และกดที่แถบบนเพื่อย้ายช่วงได้</div>}
      {/* แต่ละตัวเลือกจับคู่กับปุ่ม ⓘ ของมัน ตกบรรทัดแล้วไม่แยกกัน (เจอตอนตรวจภาพ ⓘ ของเส้นตารางหลุดไปต้นบรรทัดใหม่) */}
      <div className="agfoot"><div className="psdopts" style={{ display: "flex", alignItems: "center", columnGap: 14, rowGap: 6, flexWrap: "wrap" }}>
        <span className="psdopt"><span className="lbl">แกนความถี่</span><InfoTip title="แกนความถี่" tip={PSD_TIPS.axis} />
        <div className="seg sm"><button type="button" className={psdLog ? "on" : ""} onClick={() => setPsdLog(true)} data-psdaxis="log">Log</button><button type="button" className={!psdLog ? "on" : ""} onClick={() => setPsdLog(false)} data-psdaxis="lin">Linear</button></div></span>
        <span className="psdopt"><span data-psdsize title="ยิ่งมากยิ่งแยกความถี่ละเอียด แต่ช้าลง"><Dropdown label="ความละเอียด" value={String(psdSize)} onChange={(v) => setPsdSize(Number(v))}
          options={[1024, 4096, 16384].map((n) => ({ value: String(n), label: `ความละเอียด ${n.toLocaleString("en-US")}` }))} /></span><InfoTip title="ความละเอียด" tip={PSD_TIPS.size} /></span>
        <span className="psdopt"><span className="lbl">ช่วง</span>
        <div className="seg sm">{[60, 90, 120].map((r) => <button key={r} type="button" className={range === r ? "on" : ""} onClick={() => setRange(r)} data-psdrange={r}>{r} dB</button>)}</div><InfoTip title="ช่วง dB" tip={PSD_TIPS.range} /></span>
        <span className="psdopt"><span className="lbl">เส้นตาราง</span><span data-psdgrid style={{ display: "inline-flex" }}><Switch on={grids} onChange={setGrids} label="เส้นตาราง" /></span><InfoTip title="เส้นตาราง" tip={PSD_TIPS.grid} /></span>
        <span className="psdopt"><span className="lbl">สีทึบใต้เส้น</span><span data-psdfill style={{ display: "inline-flex" }}><Switch on={fill} onChange={setFill} label="สีทึบใต้เส้น" /></span><InfoTip title="สีทึบใต้เส้น" tip={PSD_TIPS.fill} /></span></div>
        <div style={{ display: "flex", gap: 8 }}><button type="button" className="btn btn-ghost btn-sm" onClick={exportCsv}><IbSave size={15} />ส่งออกเป็นตาราง</button><SaveBtn onClick={save} /></div></div>
    </div>
  );
}
