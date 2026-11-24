/* การ์ดขอบคุณ
   แยกจาก SettingsPage.tsx ตอนจัดโครงไฟล์ตามความหมาย (BUGS ข้อ 155 ขั้น 8) เนื้อโค้ดยกมาทั้งก้อน */
import { api, encodeApi } from "../../lib/api";
import Dialog from "../../components/Dialog";
import { IbTrash } from "../../components/icons";
import { Phr } from "../../components/ui";
import { THANKS, WHITE_ICON, thankImg, thankImg2 } from "./data";
import type { SetOpen } from "./setCtx";

export default function SetThanks({ pg }: { pg: SetOpen }) {
  const { icarosHelp, removeFolder, removing, sec, setIcarosHelp, setRemoving, toast } = pg;
  return (
    <>
      {/* ---------- ขอบคุณ ---------- */}
      <div className="setcard" data-setcard="thanks" hidden={sec !== "thanks"}><h3>ขอบคุณ</h3>
        <div className="small" style={{ marginBottom: 6 }}>ชั้นหนังพัฒนาขึ้นได้ด้วยผลงานของโครงการและผู้พัฒนาต่อไปนี้ ขอขอบคุณทุกท่าน</div>
        {THANKS.map((g) => <div key={g.title} data-thanks-group>
          <h4 className="imghead">{g.title}</h4>
          <div className="small" style={{ marginBottom: 4 }}>{g.note}</div>
          <div className="thanksgrid">
            {g.rows.map((r) => <div key={r.name} className="thankcard" data-thanks-row>
              <div className="thankhead"><span className={"thankicon" + (WHITE_ICON.has(r.name) ? " white" : "") + (thankImg2(r.name) ? " two" : "")}>{thankImg(r.name) ? <img src={thankImg(r.name)} alt="" draggable={false} /> : r.icon}{thankImg2(r.name) && <img src={thankImg2(r.name)} alt="" draggable={false} />}</span><span className="thankname"><b>{r.name}</b>{r.ver && <span className="thankver" data-thankver>v{r.ver}</span>}</span>{/* ป้ายยาวแยกบรรทัดตรง · ป้ายสั้นอยู่บรรทัดเดียว ทุกป้ายอยู่มุมขวาบนแถวเดียวกับชื่อ (BUGS ข้อ 3) */}<span className={"thanktag" + (r.tag.length > 18 ? " lines" : "")} title={r.tag} data-thanks-tag>{r.tag.split(", ").map((t, i, a) => <span key={t}>{t}{i < a.length - 1 ? "," : ""}{i < a.length - 1 ? " " : ""}</span>)}</span></div>
              {/* ตัดบรรทัดตรงเว้นวรรคเท่านั้น ขยายเต็มจอแล้วไม่ตัดกลางคำ อ่า|น (BUGS ข้อ 4) */}
              <div className="thankwhat"><Phr>{r.what}</Phr></div>
              <div className="thankfoot"><span className="thankurl">{r.url.split(", ").map((u) => <button key={u} type="button" className="thanklink" title={"เปิด " + u} data-thanks-link={u} onClick={() => { encodeApi.thanksOpen(u).catch((e: unknown) => toast({ kind: "bad", title: "เปิดหน้าเว็บไม่ได้", detail: String(e) })); }}>{u}</button>)}</span></div>
            </div>)}
          </div>
        </div>)}
      </div>

      <Dialog open={removing != null} onClose={() => setRemoving(null)} kind="work" confirm title={<>เอา <span style={{ wordBreak: "break-all" }}>{removing}</span> <span className="nw">ออกจากชั้น</span></>}
        actions={<><button type="button" className="btn btn-ghost btn-sm" onClick={() => setRemoving(null)}>ยกเลิก</button>
          <button type="button" className="btn btn-bad btn-sm" onClick={() => removing && removeFolder(removing)} data-confirmremove><IbTrash size={15} />เอาออกจากชั้น</button></>}>
        <div style={{ fontSize: 14, lineHeight: 1.6 }}><Phr>หนังในโฟลเดอร์นี้จะหายจากชั้นวาง แต่ไฟล์ในเครื่องยังอยู่ครบ ไม่ถูกลบ</Phr><br />เพิ่มโฟลเดอร์กลับมาเมื่อไหร่ก็ได้</div>
      </Dialog>
      <Dialog open={icarosHelp} onClose={() => setIcarosHelp(false)} kind="menu" title="วิธีลง Icaros"
        actions={<><button type="button" className="btn btn-ghost btn-sm" onClick={() => setIcarosHelp(false)}>ปิด</button>
          <button type="button" className="btn btn-main btn-sm" onClick={() => api.openIcarosPage().catch((e) => toast({ kind: "bad", title: "เปิดหน้าเว็บไม่ได้", detail: String(e) }))} data-openicaros>เปิดหน้าเว็บ Icaros</button></>}>
        <div className="small"><Phr>ลงครั้งเดียวแล้วไอคอนไฟล์ MKV ในหน้าต่างโฟลเดอร์จะเป็นโปสเตอร์ ถ้าไม่ลงก็ยังใช้โปรแกรมชั้นหนังได้ครบ</Phr></div>
        <ol className="steps">
          <li>กดปุ่มข้างล่าง เปิดหน้าเว็บของผู้พัฒนา Icaros แล้วโหลดตัวติดตั้ง</li>
          <li>ติดตั้ง แล้วเปิดโปรแกรม Icaros Config</li>
          <li>กดเปิดการสร้างภาพตัวอย่าง (Thumbnailing) และดูว่ามี mkv อยู่ในรายการ</li>
          <li>กลับมาที่นี่ กดตรวจเครื่องมือใหม่ ป้ายจะเปลี่ยนเป็นลงแล้ว</li>
        </ol>
      </Dialog>
    </>
  );
}
