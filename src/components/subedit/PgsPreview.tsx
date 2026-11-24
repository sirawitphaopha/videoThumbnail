/* ฝั่งขวาของหน้าต่างส่งออก PGS ภาพตัวอย่าง ตารางเทียบสี และแถบสถานะท้ายหน้าต่าง
   แยกจาก PgsDialog.tsx ตอนจัดโครงไฟล์ตามความหมาย (BUGS ข้อ 155 ขั้น 10) เนื้อโค้ดยกมาทั้งก้อน */
import InfoTip from "../InfoTip";
import { CardIcon, Phr, Seg } from "../ui";
import { IbBack, IbNext } from "../icons";
import { DE_TIP } from "./pgsTips";
import { nameOf, ENG_NAME, msText } from "./pgsShared";
import type { PgCtx } from "./pgsCtx";

export function PgsRight({ pg }: { pg: PgCtx }) {
  const { ass, at, d, engine, fit, line, lines, prev, sample, seconv, setFit, setLine, setSample, setSrc, src, srcExt, useLine, verdict } = pg;
  return (
    <>
              <div className="se-pgshead">ภาพตัวอย่าง
                <Seg small label="ขนาดภาพตัวอย่าง" value={fit} onChange={setFit} options={[{ value: "fit", label: "พอดีกรอบ" }, { value: "real", label: "ขนาดจริง" }]} /></div>
              {!ass && <div className="se-drow" data-pgs-src><span className="se-dlbl">ข้อความ</span>
                <Seg small label="ข้อความในภาพตัวอย่าง" value={src} onChange={setSrc} options={[{ value: "line", label: "บรรทัดในไฟล์" }, { value: "type", label: "ประโยคที่พิมพ์" }]} /></div>}
              {useLine ? (
                <div className="se-pgspick" data-pgs-line>
                  <button type="button" className="btn btn-ghost btn-sm" aria-disabled={line <= 0 || undefined} title={line <= 0 ? "บรรทัดแรกแล้ว" : "บรรทัดก่อนหน้า"} onClick={() => { if (line > 0) setLine(line - 1); }} data-pgs-line-prev><IbBack size={14} /></button>
                  <span className="small">{lines.length ? `บรรทัดที่ ${(line + 1).toLocaleString("en-US")} จาก ${lines.length.toLocaleString("en-US")} เวลา ${msText(at)}` : "ซับนี้ไม่มีบรรทัดที่ขึ้นบนภาพ"}</span>
                  <button type="button" className="btn btn-ghost btn-sm" aria-disabled={line >= lines.length - 1 || undefined} title={line >= lines.length - 1 ? "บรรทัดสุดท้ายแล้ว" : "บรรทัดถัดไป"} onClick={() => { if (line < lines.length - 1) setLine(line + 1); }} data-pgs-line-next><IbNext size={14} /></button>
                </div>
              ) : (
                <label className="se-drow se-pgssample"><span className="se-dlbl">ประโยคตัวอย่าง</span>
                  <input className="inp" value={sample} onChange={(e) => setSample(e.target.value)} aria-label="ประโยคตัวอย่าง" data-pgs-sample /></label>
              )}
              <div className={"se-pgsimgs" + (fit === "real" ? " real" : "")} data-pgs-imgs data-state={prev.s}>
                {/* ป้ายบอกนามสกุลต้นทางเป็น PGS (พี่กันถาม "ส่งออก PGS มีสองรูป บอกหน่อย จากนามสกุลไหน เป็น PGS") */}
                {ass && <figure><figcaption data-pgs-cap="src">{`ต้นฉบับ ${srcExt} ตอนเล่น`}</figcaption>
                  <div className="se-pgsimg">{d?.ass ? <img src={d.ass} alt={`ภาพซับ ${srcExt} แบบที่ตัวเล่นแสดง`} data-pgs-img-ass /> : <i className="se-pgsskel skel" />}</div></figure>}
                {ass ? <figure><figcaption data-pgs-cap="pgs">{`${srcExt} เป็น PGS .sup ${engine === "shelf" ? "ที่จะได้" : `ที่ ${ENG_NAME[engine]} จะทำ`}`}</figcaption>
                  <div className="se-pgsimg">{d && !d.empty ? <img src={d.pgs} alt="ภาพ PGS ที่จะได้" data-pgs-img-pgs /> : <i className="se-pgsskel skel" />}</div></figure>
                  : ([["dark", "บนพื้นมืด"], ["light", "บนพื้นสว่าง"]] as const).map(([k, cap]) => (
                    // ซับ SRT ไม่มีภาพหนังให้เทียบ วางภาพ PGS พื้นโปร่งใสบนพื้นมืดกับพื้นสว่าง ให้เห็นว่าขอบกับเงาทำงานยังไง
                    <figure key={k}><figcaption data-pgs-cap={k}>{`${srcExt} เป็น PGS .sup ${engine === "shelf" ? "" : `ที่ ${ENG_NAME[engine]} ทำ `}${cap}`}</figcaption>
                      <div className={`se-pgsimg ${k}`}>{d && !d.empty ? <img src={d.pgsAlpha} alt={`ภาพ PGS ${cap}`} data-pgs-img-pgs={k} /> : <i className="se-pgsskel skel" />}</div></figure>
                  ))}
                {prev.s === "busy" && <span className="se-pgswait small" data-pgs-wait>{engine === "shelf" ? "กำลังทำภาพตัวอย่าง…" : `${ENG_NAME[engine]} กำลังทำภาพตัวอย่าง…`}</span>}
              </div>
              {prev.s === "fail" && <div className="stat bad" style={{ margin: 0 }} data-pgs-prev-err><CardIcon kind="bad" /><div><b>ทำภาพตัวอย่างไม่ได้</b><Phr>{prev.err ?? ""}</Phr></div></div>}
              {d?.empty && <div className="small" data-pgs-prev-empty>เวลานี้ไม่มีซับบนภาพ</div>}
              {d && !d.empty && <div className="small se-pgsnote" data-pgs-note><Phr>{`${!ass ? "" : d.bg === "movie" ? "พื้นหลังเป็นภาพจากหนังที่เวลานี้  " : "พื้นหลังเป็นสีเทา  "}ภาพนี้มี ${d.before.toLocaleString("en-US")} สี และ PGS ใช้ ${d.after.toLocaleString("en-US")} สี`}</Phr></div>}
              {/* SeConv วาดตำแหน่งและขนาดของตัวเอง เทียบสีทีละจุดกับต้นฉบับแล้วได้ตัวเลขที่ไม่จริง (ขาวกลายเป็นดำ ΔE 100) จึงไม่แสดงตาราง */}
              {ass && seconv && d && !d.empty && <div className="small se-pgsnote" data-pgs-seconv-note><Phr>Subtitle Edit วาดตำแหน่งและขนาดของตัวเอง จึงเทียบสีทีละจุดกับต้นฉบับไม่ได้ ให้ดูความต่างจากภาพข้างบน</Phr></div>}
              {ass && !seconv && d && !d.empty && d.colors.length > 0 && <div className="se-pgsctab" data-pgs-colors-table>
                <div className="se-pgscrow head"><span>{`สีใน ${srcExt}`}</span><span>สีใน PGS</span><span>ΔE<InfoTip title="ความต่างของสี ΔE" tip={DE_TIP} /></span><span>ผล</span><span>สัดส่วน</span></div>
                {d.colors.map((c) => { const [k, t] = verdict(c.de); return (
                  <div key={c.ass} className="se-pgscrow" data-pgs-crow={k}>
                    <span><i style={{ background: c.ass }} />{c.ass}</span><span><i style={{ background: c.pgs }} />{c.pgs}</span><span>{c.de.toFixed(1)}</span><span className={"se-pgsv " + k}>{t}</span><span>{c.share.toFixed(1)}%</span>
                  </div>); })}
              </div>}
              {ass && !seconv && d && !d.empty && <div className={"small se-pgssum" + (d.colors.every((c) => c.de < 2) ? " ok" : "")} data-pgs-sum><Phr>{
                // ต้นฉบับอาจเป็น .smi หรือซับแบบอื่นที่แปลงเป็น ASS ตอนเปิด จึงเรียกว่าต้นฉบับ ไม่เรียก ASS
                (d.colors.every((c) => c.de < 2) ? "สีหลักของ PGS ตรงกับต้นฉบับทุกสี" : `มี ${d.colors.filter((c) => c.de >= 2).length} สีที่ต่างจากต้นฉบับ ให้ดูตารางข้างบน`)
                + `  ทั้งภาพต่างเฉลี่ย ${d.mean.toFixed(1)} จาก 255`
                + (d.mangled ? "  ซับนี้บอกตารางสีเป็น TV.601 สีจึงปรับแบบที่ mpv แสดงบนหนัง HD" : "")
              }</Phr></div>}
    </>
  );
}

export function PgsStatus({ pg }: { pg: PgCtx }) {
  const { busy, doneText, err, exists, out, path, pct } = pg;
  const run = pg.run!;
  return (
    <>
          {(busy || exists || err || out) && <div className="se-pgsstat" data-pgs-status>
            {busy && run.phase === "seconv" && <div className="se-drow" data-pgs-prog-seconv><span className="small">Subtitle Edit กำลังวาดซับทุกบรรทัดและทำไฟล์ .sup ซึ่งไม่บอกความคืบหน้าระหว่างทำ</span></div>}
            {busy && run.phase !== "seconv" && <div className="se-drow"><div className="se-vprog" style={{ flex: 1 }} data-pgs-prog><div style={{ width: `${pct}%` }} /></div>
              <span className="small">{run.total ? (run.phase === "super" ? `SUPer หากรอบภาพที่ ${run.done.toLocaleString("en-US")} จาก ${run.total.toLocaleString("en-US")}` : `วาดภาพที่ ${run.done.toLocaleString("en-US")} จาก ${run.total.toLocaleString("en-US")}`) : "เริ่ม…"}</span></div>}
            {exists && <div className="small se-rmwarn" data-pgs-exists><Phr>{`${nameOf(path)} มีอยู่แล้ว โปรแกรมไม่เขียนทับ ตั้งชื่อใหม่ต่อเลข หรือเลือกที่เก็บใหม่`}</Phr></div>}
            {err && <div className="stat bad" style={{ margin: 0 }} role="alert" data-pgs-err><CardIcon kind="bad" /><div><b>ส่งออกไม่สำเร็จ</b><Phr>{err}</Phr></div></div>}
            {out && <div className="stat ok" style={{ margin: 0 }} data-pgs-done><CardIcon kind="ok" /><div>
              <b>{`ส่งออกแล้ว ${nameOf(out.path)}`}</b>
              <Phr>{doneText(out)}</Phr>
            </div></div>}
          </div>}
    </>
  );
}
