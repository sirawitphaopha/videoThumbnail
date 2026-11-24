/* การ์ดโปสเตอร์ ปกตั้งกับปกนอน
   แยกจาก AvPage.tsx ตอนจัดโครงไฟล์ตามความหมาย (BUGS ข้อ 155 ขั้น 2) เนื้อโค้ดยกมาทั้งก้อน */
import { Phr } from "../../components/ui";
import { mergeApi, pickFile, posterApi, type CoverTarget } from "../../lib/api";
import { BUSY, CoverSlotBox } from "./parts";
import type { AvCtx } from "./avCtx";

export default function PosterCard({ pg }: { pg: AvCtx }) {
  const { covers, loading, method, offIn, openCover, over, postOpen, setCrop, setSlot, setSlotErr, slotErr, working } = pg;
  const movie = pg.movie!;
  return (
    <>
        {/* โปสเตอร์ */}
        {postOpen && offIn(method !== "merge", <div className="card" data-poster-card>
          <h3 style={{ justifyContent: "space-between" }}>
            {/* หัวการ์ดเป็นข้อความธรรมดา ไม่มีปุ่มย่อขยาย การ์ดซ่อนเองเมื่อกดแถวแทร็กอื่น (BUGS ข้อ 67 ต่อ พี่กันสั่ง "เอาปุ่มย่อขยายปกออก") */}
            <span>โปสเตอร์ ใส่ในรอบเดียวกับเสียงและซับ</span>
            <span className="small" style={{ fontWeight: 400 }}>ไม่ต้องไปรวมอีกรอบที่หน้าใส่โปสเตอร์</span></h3>
          <>
          <div className="pslots">
            {(["cover", "cover_land"] as CoverTarget[]).map((slot) => (
              <CoverSlotBox key={slot} slot={slot} s={covers[slot]} over={over === slot} err={slotErr?.slot === slot ? slotErr.text : null} busy={working ? BUSY : loading === "cover" ? "กำลังอ่านรูป…" : undefined}
                onPick={async () => { const f = await pickFile("image"); if (f) openCover(f, slot); }}
                onRecrop={() => { const n = covers[slot].neu; if (n) posterApi.open(n.info.path, slot).then((info) => setCrop({ slot, info, start: n.choice })).catch((e) => setSlotErr({ slot, text: String(e) })); }}
                onRemove={() => { if (covers[slot].mode === "new") { mergeApi.coverDrop(slot).catch(() => {}); setSlot(slot, { mode: covers[slot].old ? "keep" : "keep", neu: null }); } else setSlot(slot, { mode: "remove" }); }}
                onUndo={() => setSlot(slot, { mode: "keep" })} />
            ))}
          </div>
          <div className="small" style={{ marginTop: 8 }} data-poster-hint><Phr>ลากรูปมาวางที่ช่องไหนก็ได้ กดเปลี่ยนรูปจะเปิดหน้าครอปเดียวกับหน้าใส่โปสเตอร์ และรูปเข้าไฟล์ใหม่ในคำสั่งรวมเดียวกับเสียงและซับ</Phr>{movie.attachments.some((a) => !/^cover(_land)?\./i.test(a.name)) ? <> <Phr>{`ไฟล์แนบอื่นในหนัง ${movie.attachments.filter((a) => !/^cover(_land)?\./i.test(a.name)).map((a) => a.name).join(" ")} ติดไปด้วย`}</Phr></> : null}</div>
          </>
        </div>)}
    </>
  );
}
