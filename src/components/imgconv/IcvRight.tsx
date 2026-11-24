/* ฝั่งขวาของหน้าต่างแปลงซับภาพ มุมมอง เลือกภาพ ภาพต้นฉบับกับภาพที่จะได้ และคำเตือนของตัวแปลง
   แยกจาก ImgConvDialog.tsx ตอนจัดโครงไฟล์ตามความหมาย (BUGS ข้อ 155 ขั้น 9) เนื้อโค้ดยกมาทั้งก้อน */
import InfoTip from "../InfoTip";
import { CardIcon, Phr, Seg } from "../ui";
import { IbBack, IbNext } from "../icons";
import { OUT_NAME, ts, warnTh, VIEW_TIP } from "./icvData";
import { Crop, Frame } from "./IcvImages";
import type { IcvCtx } from "./icvCtx";

export function IcvRight({ pg }: { pg: IcvCtx }) {
  const { cropOut, cropSrc, d, ft, idx, ob, opts, outInk, page, prev, s0, se, setIdx, setView, src, srcInk, total, view } = pg;
  return (
    <>
          <div className="icv-r" data-icv-right>
            <div className="icv-head icv-rhead">ภาพตัวอย่าง<InfoTip title="มุมมองภาพตัวอย่าง" tip={VIEW_TIP} />
              <span className="icv-viewseg"><Seg small label="มุมมองภาพตัวอย่าง" value={view} onChange={setView} options={[{ value: "full", label: "ทั้งจอ" }, { value: "real", label: "ขนาดจริง" }, { value: "zoom", label: "ขยาย 2 เท่า" }]} /></span></div>
            <div className="icv-pick" data-icv-pick>
              <button type="button" className="btn btn-ghost btn-sm" aria-disabled={idx <= 0 || undefined} title={idx <= 0 ? "ภาพแรกแล้ว" : "ภาพก่อนหน้า"} onClick={() => { if (idx > 0) setIdx(idx - 1); }} data-icv-prev><IbBack size={14} /></button>
              <span className="small">{total ? `ภาพที่ ${(idx + 1).toLocaleString("en-US")} จาก ${total.toLocaleString("en-US")}` : "—"}</span>
              <button type="button" className="btn btn-ghost btn-sm" aria-disabled={idx >= total - 1 || undefined} title={idx >= total - 1 ? "ภาพสุดท้ายแล้ว" : "ภาพถัดไป"} onClick={() => { if (idx < total - 1) setIdx(idx + 1); }} data-icv-next><IbNext size={14} /></button>
            </div>
            <figure className="icv-fig"><figcaption data-icv-cap="src">{`ต้นฉบับเป็น ${ft}${s0 ? ` จอ ${s0.canvas[0]} × ${s0.canvas[1]}` : ""}`}</figcaption>
              {s0 && view !== "full" ? <Crop parts={[{ png: s0.png, x: s0.at[0], y: s0.at[1], w: s0.w, h: s0.h }]} box={srcInk ?? { x: s0.at[0], y: s0.at[1], w: s0.w, h: s0.h }} zoom={view === "zoom" ? 2 : 1} data="src" el={cropSrc} other={cropOut} />
                : s0 ? <Frame cw={s0.canvas[0]} ch={s0.canvas[1]} parts={[{ png: s0.png, x: s0.at[0], y: s0.at[1], w: s0.w, h: s0.h }]} data="src" />
                : src?.err && !src.pages[page] ? <div className={"icv-frame icv-none" + (view !== "full" ? " icv-cropskel" : "")} style={{ aspectRatio: view === "full" ? `${d?.w || 16} / ${d?.h || 9}` : undefined }} data-icv-src-err><span className="small">ตัวถอดภาพต้นฉบับอ่านไฟล์นี้ไม่ได้ จึงไม่มีภาพให้เทียบ</span></div>
                : <div className={"icv-frame skel" + (view !== "full" ? " icv-cropskel" : "")} style={{ aspectRatio: view === "full" ? "16 / 9" : undefined }} />}
              <div className="small icv-info" data-icv-info="src">{s0 ? `ภาพ ${(srcInk ?? s0).w} × ${(srcInk ?? s0).h} ที่ ${srcInk?.x ?? s0.at[0]}, ${srcInk?.y ?? s0.at[1]} เวลา ${ts(s0.start * 1000)}${s0.end != null ? `–${ts(s0.end * 1000)}` : ""}` : " "}</div></figure>
            <figure className="icv-fig"><figcaption data-icv-cap="out">{`ไฟล์ที่จะได้เป็น ${OUT_NAME[opts.out]}${d && d.w ? ` จอ ${d.w} × ${d.h}` : ""}`}</figcaption>
              <div className="icv-wrap">
                {d && ob && view !== "full" ? <Crop parts={d.graphics} box={outInk ?? ob} zoom={view === "zoom" ? 2 : 1} data="out" el={cropOut} other={cropSrc} />
                  : d && d.graphics.length ? <Frame cw={d.w || 1920} ch={d.h || 1080} parts={d.graphics} data="out" />
                  // ทำภาพตัวอย่างไม่ได้ กล่องเหตุผลกับปุ่มใช้ Subtitle Edit อยู่แทนกรอบภาพ เห็นทันทีไม่ต้องเลื่อนลง (เจอจากภาพตรวจ 15 พ.ย. 2569)
                  : prev.s === "fail" ? <div className="stat bad icv-preverr" data-icv-prev-err><CardIcon kind="bad" /><div><b>ทำภาพตัวอย่างไม่ได้</b><Phr>{prev.err ?? ""}</Phr></div></div>
                  : <div className={"icv-frame skel" + (view !== "full" ? " icv-cropskel" : "")} style={{ aspectRatio: view === "full" ? "16 / 9" : undefined }} />}
                {prev.s === "busy" && <span className="icv-wait small" data-icv-wait>{se ? "Subtitle Edit กำลังแปลงภาพตัวอย่าง…" : "BDSup2Sub++ กำลังแปลงภาพตัวอย่าง…"}</span>}
              </div>
              <div className="small icv-info" data-icv-info="out">{d && ob ? `ภาพ ${(outInk ?? ob).w} × ${(outInk ?? ob).h} ที่ ${(outInk ?? ob).x}, ${(outInk ?? ob).y} เวลา ${ts(d.start)}–${ts(d.end)}${d.forced ? " เป็นซับบังคับ" : ""}` : " "}</div></figure>
            {d && d.warnings.length > 0 && <div className="small icv-warn" data-icv-warn>{d.warnings.slice(0, 3).map((w) => <div key={w}><Phr>{warnTh(w)}</Phr></div>)}</div>}
            {d && src && d.total !== src.total && src.total > 0 && <div className="small icv-note" data-icv-count-note><Phr>{`ต้นฉบับมี ${src.total.toLocaleString("en-US")} ภาพ แต่ไฟล์ที่จะได้มี ${d.total.toLocaleString("en-US")} ภาพ เพราะตัวแปลงรวมภาพที่ติดกันหรือข้ามภาพว่าง ภาพเลขเดียวกันจึงอาจไม่ใช่ภาพเดียวกัน`}</Phr></div>}
          </div>
    </>
  );
}
