/* หน้าต่างย้ายที่เก็บ การ์ดโฟลเดอร์หนัง และการ์ดใส่โปสเตอร์
   แยกจาก SettingsPage.tsx ตอนจัดโครงไฟล์ตามความหมาย (BUGS ข้อ 155 ขั้น 8) เนื้อโค้ดยกมาทั้งก้อน */
import Dialog from "../../components/Dialog";
import { IcFolder, IbTrash, IbTick } from "../../components/icons";
import { CardIcon, Keep, Phr, Range, Seg, Skel, Switch } from "../../components/ui";
import { fmtSize } from "../../lib/format";
import { driveName, freePct, isLow } from "../../lib/drives";
import { FolderIcon } from "./data";
import type { SetOpen } from "./setCtx";

export default function SetCardsFiles({ pg }: { pg: SetOpen }) {
  const { addFolder, askMigrate, changeOriginals, countOf, drives, folderCount, jpgNow, migrate, migrateCount, migrateProg, migrating, modeName, onJpg, sec, set, setAskMigrate, setRemoving } = pg;
  const settings = pg.settings!;
  return (
    <>
      <Dialog open={askMigrate} onClose={() => { if (!migrating) setAskMigrate(false); }} kind="work" confirm title={<>ย้าย <span className="nw">{migrateCount} เรื่อง</span>ไปแบบ {modeName}</>}
        actions={<>
          <button type="button" className="btn btn-ghost" onClick={() => { if (!migrating) setAskMigrate(false); }}>ยังไม่ย้าย</button>
          <button type="button" className={"btn " + (migrating ? "btn-wait" : "btn-main")} aria-disabled={migrating || undefined} data-link-migrate-ok onClick={migrate}><Keep all={["กำลังย้าย 000 จาก 000 เรื่อง…", "ย้ายเลย"]}>{migrating ? (migrateProg ? `กำลังย้าย ${migrateProg.done} จาก ${migrateProg.total} เรื่อง…` : "กำลังย้าย…") : "ย้ายเลย"}</Keep></button>
        </>}>
        <div className="small" style={{ fontSize: 14, color: "var(--txt2)" }}>
          <div><Phr>โปรแกรมทำไฟล์ใหม่ก่อน เมื่อสำเร็จแล้วจึงเอาของเก่าออก</Phr></div>
          <div><Phr>ของเก่าที่โปรแกรมคัดลอกไว้ย้ายลงถังขยะ ส่วนไฟล์ที่โปรแกรมไม่ได้สร้างจะไม่ถูกลบ</Phr></div>
          <div><Phr>เรื่องที่รูปต้นฉบับหายไปแล้วย้ายเป็นแบบจับคู่อย่างเดียวไม่ได้ จึงคงแบบเดิมไว้แล้วบอกให้รู้</Phr></div>
          <div>ไฟล์หนังกับรูปต้นฉบับไม่ถูกแตะ</div>
        </div>
      </Dialog>
      {/* ---------- โฟลเดอร์หนัง ---------- */}
      <div className="setcard" data-setcard="folders" hidden={sec !== "folders"}><h3>โฟลเดอร์หนัง</h3>
        <div className="small"><Phr>โปรแกรมอ่านหนังจากโฟลเดอร์ในรายการนี้มาขึ้นชั้น</Phr></div>
        {settings.folders.map((f) => {
          const st = countOf(f);
          return (
            <div key={f} className="folder" data-folder={f}><FolderIcon /><div className="grow" style={{ wordBreak: "break-all" }}>{f}
              <span className="small" style={{ display: "block" }} data-folder-count>{st && !st.ok ? <span style={{ color: "var(--bad-ink)" }}>หาโฟลเดอร์ไม่เจอ ไดรฟ์อาจถอดออกอยู่</span> : <span className="nw">{folderCount(f, st) ?? "—"}{folderCount(f, st) != null && " เรื่อง"}</span>}</span></div>
              <button type="button" className="btn btn-bad btn-sm" onClick={() => setRemoving(f)} data-removefolder><IbTrash size={15} />เอาออกจากชั้น</button></div>
          );
        })}
        <div className="small" style={{ margin: "8px 0 10px" }}><Phr>เอาออกจากชั้นแล้วไฟล์ในเครื่องยังอยู่ครบ ไม่ถูกลบ</Phr></div>
        <button type="button" className="btn btn-ghost btn-sm" onClick={addFolder} data-addfolder><IcFolder size={15} />เพิ่มโฟลเดอร์</button>
        {/* ความจุไดรฟ์ (BUGS ข้อ 88 พี่กันแทรก 13 พ.ย. 2569 "เเสดงความจุของไดรฟ์ที่โฟลเดอร์หนังใช้อยู่ด้วย") · ไดรฟ์ของโปรแกรมรวมด้วย เพราะบันทึกค่าตั้งไม่ได้ตอนไดรฟ์นั้นเต็ม */}
        {/* คำอธิบายเป็นตัวเล็กใต้หัวข้อแบบแถวอื่นในหน้าตั้งค่า ไม่ซ่อนใน ⓘ (พี่กันทัก 13 พ.ย. 2569 "ปกติ หน้าตั้งค่า พวกคำอธิบาย มันอยู่ใต้หัวข้อนี่นา") */}
        <h4 className="imghead" style={{ marginTop: 16 }}>ความจุไดรฟ์</h4>
        <div className="small" style={{ marginBottom: 2 }}><Phr>{"ไดรฟ์ที่โฟลเดอร์หนังอยู่ และไดรฟ์ที่ชั้นหนังเก็บค่าตั้ง คลังหนัง และภาพปก  ถ้าไดรฟ์ไหนเหลือที่ว่างไม่ถึง 10% ชั้นวางจะเตือน"}</Phr></div>
        <div data-drives>
          {drives.list == null
            ? (drives.failed
              ? <div className="small" data-drives-bad><span style={{ color: "var(--bad-ink)" }}>อ่านความจุไดรฟ์ไม่ได้</span> <button type="button" className="latlink" onClick={drives.refresh}>ลองอีกครั้ง</button></div>
              : <div aria-busy="true"><Skel w="55%" h={12} style={{ marginTop: 8 }} /><Skel w="100%" h={8} style={{ marginTop: 8 }} /></div>)
            : drives.list.map((d) => {
              const low = isLow(d), used = Math.round(((d.total - d.free) / d.total) * 100);
              return <div key={d.root} className={"drive" + (low ? " low" : "")} data-drive={d.root}>
                <div className="drivehead"><b>{driveName(d.root)}</b>
                  <span className="small">ว่าง <span className="nw">{fmtSize(d.free)}</span> จาก <span className="nw">{fmtSize(d.total)}</span>{!low && <> เหลือ <span className="nw" data-drive-pct>{freePct(d)}</span></>}</span>
                  {low && <span className="drivewarn" data-drive-low title="ไดรฟ์ที่เหลือที่ว่างไม่ถึง 10% จะเตือนที่ชั้นวาง"><CardIcon kind="warn" />เหลือ {freePct(d)}</span>}</div>
                <div className="drivebar" role="img" aria-label={`ใช้ไป ${used}%`}><i style={{ width: `${used}%` }} /></div>
                <div className="small"><Phr>{[d.folders.length ? `มีโฟลเดอร์หนัง ${d.folders.length} โฟลเดอร์` : "", d.app ? "ชั้นหนังเก็บค่าตั้ง คลังหนัง และภาพปกไว้ที่ไดรฟ์นี้" : ""].filter(Boolean).join(" และ")}</Phr></div>
              </div>;
            })}
        </div>
        <div className="setrow setmain" style={{ marginTop: 10, borderTop: "1px solid var(--line)" }}><div className="lbl">อ่านโฟลเดอร์ใหม่ทุกครั้งที่เปิดโปรแกรม<span className="small"><Phr>หนังที่โหลดมาเพิ่มจะขึ้นชั้นเอง</Phr></span></div>
          <Switch on={settings.rescanOnStart} onChange={(v) => set({ rescanOnStart: v })} label="อ่านโฟลเดอร์ใหม่ทุกครั้งที่เปิดโปรแกรม" /></div>
      </div>

      {/* ---------- ใส่โปสเตอร์ ---------- */}
      <div className="setcard" data-setcard="poster" hidden={sec !== "poster"}><h3>ใส่โปสเตอร์</h3>
        <div className="setrow"><div className="lbl">ตรวจไฟล์ต้นทางก่อนห่อเป็น MKV<span className="small"><Phr>ถ้าไฟล์เสียอยู่แล้วจะบอกก่อนลงมือ</Phr></span></div>
          <Switch on={settings.checkSourceBefore} onChange={(v) => set({ checkSourceBefore: v })} label="ตรวจไฟล์ต้นทางก่อนห่อเป็น MKV" /></div>
        <div className="setrow"><div className="lbl">ตรวจไฟล์ใหม่หลังห่อเป็น MKV<span className="small"><Phr>เทียบว่าภาพ เสียง และซับครบเท่าต้นทาง</Phr></span></div>
          <Switch on={settings.checkOutputAfter} onChange={(v) => set({ checkOutputAfter: v })} label="ตรวจไฟล์ใหม่หลังห่อเป็น MKV" /></div>
        <div className="setrow" data-seg260><div className="lbl">ไฟล์ที่ได้</div>
          <Seg label="ไฟล์ที่ได้" value={settings.outputFormat} onChange={(v) => set({ outputFormat: v })} options={[{ value: "mkv", label: "MKV" }, { value: "mp4", label: "MP4" }]} /></div>
        <div className="setrow" data-seg260><div className="lbl">ไฟล์เดิมหลังห่อเป็น MKV</div>
          <Seg label="ไฟล์เดิมหลังห่อเป็น MKV" value={settings.originalAfter} onChange={(v) => set({ originalAfter: v })} options={[{ value: "keep", label: <><IbTick size={14} />เก็บไว้</> }, { value: "trash", label: <><IbTrash size={14} />ลบเมื่อตรวจผ่าน</> }]} /></div>
        <div className="setrow"><div className="lbl">โฟลเดอร์เก็บไฟล์เดิม
          <span className="small" style={{ wordBreak: "break-all" }} data-originals>{settings.originalsFolder || <Phr>ข้างไฟล์หนังในโฟลเดอร์ชื่อ “ไฟล์เดิม”</Phr>}</span>
          <span className="small"><Phr>โฟลเดอร์นี้ต้องอยู่ไดรฟ์เดียวกับไฟล์หนัง ถ้าอยู่คนละไดรฟ์จะใช้โฟลเดอร์ “ไฟล์เดิม” ข้างไฟล์หนังแทน</Phr></span></div>
          <div style={{ display: "flex", gap: 6 }}>
            {settings.originalsFolder && <button type="button" className="btn btn-ghost btn-sm" onClick={() => set({ originalsFolder: "" })}>ใช้ข้างไฟล์หนัง</button>}
            <button type="button" className="btn btn-ghost btn-sm" onClick={changeOriginals} data-orig-change><IcFolder size={15} />เปลี่ยน</button></div></div>
        <div className="setrow" data-seg260><div className="lbl">รูปโปสเตอร์ที่แนบ<span className="small"><Phr>ใช้กับรูปที่ต้องแปลงและรูปที่ครอป</Phr></span></div>
          <Seg label="รูปโปสเตอร์ที่แนบ" value={settings.posterFormat} onChange={(v) => set({ posterFormat: v })} options={[{ value: "jpg", label: "JPG" }, { value: "png", label: "PNG" }]} /></div>
        <div className="setrow" style={{ display: "block" }}><div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <span style={{ fontSize: 14, whiteSpace: "nowrap" }}>คุณภาพ JPG</span>
          <Range value={jpgNow} min={50} max={100} onChange={onJpg} label="คุณภาพ JPG" format={(v) => `${v}%`} />
          <span className="small" style={{ whiteSpace: "nowrap", minWidth: 36, textAlign: "right" }} data-jpgq>{jpgNow}%</span></div></div>
        <div className="setrow"><div className="lbl">ย่อรูปโปสเตอร์ที่ใหญ่เกิน<span className="small"><Phr>ย่อเหลือ</Phr> <span className="nw">1000 × 1500 px</span> <Phr>เพื่อไม่ให้ไฟล์หนังบวม  และเปิดปิดที่หน้าครอปได้ด้วย</Phr></span></div>
          <Switch on={settings.shrinkLargePosters} onChange={(v) => set({ shrinkLargePosters: v })} label="ย่อรูปโปสเตอร์ที่ใหญ่เกิน" /></div>
      </div>

    </>
  );
}
