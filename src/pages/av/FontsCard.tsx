/* การ์ดฟอนต์ของซับ ASS
   แยกจาก AvPage.tsx ตอนจัดโครงไฟล์ตามความหมาย (BUGS ข้อ 155 ขั้น 2) เนื้อโค้ดยกมาทั้งก้อน */
import { CardIcon, Phr } from "../../components/ui";
import { pickFonts } from "../../lib/api";
import { fmtSize } from "../../lib/format";
import { kb } from "../../lib/popup";
import { setAv } from "../../lib/avJob";
import { IcFile } from "../../components/icons";
import { BUSY, baseName } from "./parts";
import type { AvCtx } from "./avCtx";

export default function FontsCard({ pg }: { pg: AvCtx }) {
  const { addFonts, fontBytes, fontFiles, fontRows, method, offIn, output, working } = pg;
  return (
    <>
        {/* ฟอนต์ของซับ ASS (พี่กันสั่ง 8 พ.ย. 2569 "พวกซับ ass มันต้องฝังฟ้อนด้วยนี่นา") · ขึ้นเมื่อเพิ่มซับ ASS ที่เรียกฟอนต์ */}
        {fontRows.length > 0 && offIn(method !== "merge",
          <div className="card" data-fonts>
            <h3 style={{ justifyContent: "space-between" }}><span>ฟอนต์ของซับ ASS</span>
              <span className="small" style={{ fontWeight: 400 }} data-fonts-sum>{fontFiles.length ? `ฝังไปด้วย ${fontFiles.length} ไฟล์ ขนาด ${fmtSize(fontBytes)}` : "ไม่ได้ฝังฟอนต์"}</span></h3>
            <div className="small" style={{ marginBottom: 4 }}><Phr>ซับ ASS บอกแค่ชื่อฟอนต์ จึงฝังไฟล์ฟอนต์ไปกับไฟล์ใหม่ด้วย เครื่องอื่นหรือทีวีที่ไม่มีฟอนต์นี้จะเห็นซับหน้าตาเดิม และภาษาไทยไม่เป็นกล่อง</Phr></div>
            {fontRows.map((r) => {
              const state = r.inMovie ? "inmovie" : !r.file ? "missing" : r.on ? "on" : "off";
              const where = r.from === "folder" ? "เจอข้างไฟล์ซับ" : r.from === "user" ? "ฟอนต์ที่ลงไว้ในเครื่อง" : r.from === "system" ? "ฟอนต์ของ Windows" : "เพิ่มเอง";
              const text = r.inMovie ? `มีในไฟล์หนังแล้ว ไม่ต้องฝังซ้ำ (${baseName(r.file!)})`
                : !r.file ? "ไม่เจอในเครื่อง ลากไฟล์ฟอนต์ (.ttf .otf .ttc) มาวางที่หน้านี้ หรือกดเลือกไฟล์ฟอนต์"
                : `${where} ${baseName(r.file)} ขนาด ${fmtSize(r.size)}`;
              const lock = working || !r.file || r.inMovie;
              return (
                <div key={r.name + (r.file ?? "")} className="fontrow" data-font={r.name} data-font-state={state}>
                  {/* มีในหนังแล้ว ติ๊กไว้แบบจาง (ฟอนต์อยู่ในไฟล์ใหม่ เพราะไฟล์แนบเดิมติดไป) · เดิมเป็นช่องว่าง ดูเหมือนฟอนต์จะหาย */}
                  <div className={"chk" + (lock ? " off" : "")} aria-checked={r.on || r.inMovie} aria-disabled={lock || undefined}
                    {...kb(() => { if (lock) return; const f = r.file!; setAv((s) => ({ fontOff: r.on ? [...s.fontOff, f] : s.fontOff.filter((x) => x !== f) })); })} role="checkbox">
                    <span className={"cbx " + (r.on || r.inMovie ? "on" : "off") + (r.inMovie ? " dim" : "")}>{(r.on || r.inMovie) && <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="4" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5" /></svg>}</span>
                    <span className="fontname">{r.name}</span>
                  </div>
                  <span className={"small" + (state === "missing" ? " fontmiss" : "")}><Phr>{text}</Phr></span>
                </div>
              );
            })}
            <div className="minirow" style={{ marginTop: 8, alignItems: "center" }}>
              <button type="button" className={"btn btn-sm " + (working ? "btn-wait" : "btn-ghost")} aria-disabled={working || undefined} title={working ? BUSY : undefined}
                onClick={async () => { if (working) return; const f = await pickFonts(); if (f.length) addFonts(f); }} data-font-pick><IcFile size={15} />เลือกไฟล์ฟอนต์</button>
              <span className="small"><Phr>หาฟอนต์จากโฟลเดอร์ข้างไฟล์ซับก่อน แล้วจึงหาฟอนต์ที่ลงไว้ในเครื่อง ถ้าลงฟอนต์ใหม่ระหว่างเปิดโปรแกรม ต้องปิดเปิดโปรแกรมใหม่</Phr></span>
            </div>
            {output === "mp4" && fontFiles.length > 0 && <div className="stat warn" style={{ marginTop: 8 }} data-fonts-mp4><CardIcon kind="warn" /><div><b>MP4 ฝังฟอนต์ไม่ได้</b><Phr>เลือกไฟล์ที่ได้เป็น MKV ถ้าต้องการฟอนต์ไปกับไฟล์</Phr></div></div>}
          </div>
        )}

    </>
  );
}
