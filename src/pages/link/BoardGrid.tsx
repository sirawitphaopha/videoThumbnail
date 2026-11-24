/* สองฝั่งของกระดาน หนังกับรูปที่ยังไม่จับคู่
   แยกจาก LinkBoard.tsx ตอนจัดโครงไฟล์ตามความหมาย (BUGS ข้อ 155 ขั้น 8) เนื้อโค้ดยกมาทั้งก้อน */
import SearchBox from "../../components/SearchBox";
import { Seg } from "../../components/ui";
import { linkApi, pickFile, pickFolder } from "../../lib/api/index";
import { setReply } from "../../lib/linkJob";
import { IcPoster, IbTable } from "../../components/icons";
import { baseName, COUNT, FolderIcon } from "./boardShared";
import { ImgCard, MovieCell } from "./ImgCard";
import type { BoCtx } from "./boardCtx";

export default function BoardGrid({ pg }: { pg: BoCtx }) {
  const { addImages, addMovieFolders, after, drag, folderCount, found, free, imgCount, imgGrid, imgOnly, list, mvOnly, onBoard, onImgKey, over, overPane, query, reply, rowOf, scanning, selected, sent, setQuery, setRemoving, setSelected, settings, startDrag, titles, tryPick, undo, update } = pg;
  return (
    <>
      <div className="board">
        {/* ---------- รูป ---------- */}
        <div className={"card bpane" + (imgOnly ? " only" : "") + (overPane === "images" ? " over" : "")} data-board-pane="images">
          <div className="bhead"><b>รูปที่ยังไม่ได้ใช้ <span className="nw">{COUNT(free.length)} รูป</span></b>
            <Seg small label="มุมมองแผงรูป" value={imgOnly ? "only" : "list"} onChange={(v) => update({ linkBoardImages: v })} options={[{ value: "list", label: <><IbTable size={14} />มีชื่อไฟล์</> }, { value: "only", label: <><IcPoster size={14} />แค่รูป</> }]} /></div>
          <div className="folders" data-board-img-folders>
            {reply.imageFolders.map((f) => (
              <div key={f} className="pathline"><FolderIcon /><b title={f}>{f}</b><span className="small">{COUNT(imgCount(f))} รูป</span>
                <button type="button" className="x" aria-label={"เอาโฟลเดอร์ " + f + " ออกจากกระดาน"} title="เอาออกจากกระดาน รูปในเครื่องไม่ถูกแตะ" onClick={async () => { setReply(await linkApi.removeImages(f)); await after(); }}>×</button></div>
            ))}
            {reply.loose.length > 0 && <div className="pathline"><FolderIcon /><b>รูปที่ลากมาทีละรูป</b><span className="small">{COUNT(reply.loose.length)} รูป</span></div>}
            <div className="addfolder"><button type="button" className="addbtn" data-board-add-images onClick={async () => { const d = await pickFolder("เลือกโฟลเดอร์รูป"); if (d) addImages([d]); }}>+ เพิ่มโฟลเดอร์รูป</button><span>หรือลากโฟลเดอร์หรือรูปมาวาง</span>
              <button type="button" className="addbtn" style={{ marginLeft: "auto" }} onClick={async () => { const f = await pickFile("image"); if (f) addImages([f]); }}><IcPoster size={15} />เลือกรูป</button></div>
          </div>
          <div className="bscroll">
            {free.length === 0 ? <div className="small" style={{ padding: "18px 4px" }} data-board-noimg>ยังไม่มีรูปเหลือ ให้เพิ่มโฟลเดอร์รูป หรือลากรูปจาก Explorer มาวางบนหนังตรง ๆ</div> : (
              <div className="imgs" ref={imgGrid} data-board-imgs>
                {free.map((i) => <ImgCard key={i.path} i={i} sel={selected === i.path} dragging={drag?.moved && drag.path === i.path} onPick={() => setSelected((s) => (s === i.path ? null : i.path))} onDown={(e) => startDrag(e, i.path)} onKey={(e) => onImgKey(e, i.path)} />)}
              </div>
            )}
          </div>
        </div>
        {/* ---------- หนัง ---------- */}
        <div className={"card bpane" + (mvOnly ? " only" : "") + (overPane === "movies" ? " over" : "")} data-board-pane="movies">
          <div className="bhead"><b>{reply.scope === "all" ? "หนังทุกเรื่องบนชั้น" : "หนังที่ยังไม่มีปก"} <span className="nw">{COUNT(onBoard.length)} เรื่อง</span></b>
            <Seg small label="มุมมองแผงหนัง" value={mvOnly ? "only" : "list"} onChange={(v) => update({ linkBoardMovies: v })} options={[{ value: "list", label: <><IbTable size={14} />รายการ</> }, { value: "only", label: <><IcPoster size={14} />แค่รูป</> }]} /></div>
          <div className="folders" data-board-mv-folders>
            {(settings?.folders ?? []).map((f) => (
              <div key={f} className="pathline"><FolderIcon /><b title={f}>{f}</b><span className="small">{COUNT(folderCount(f))} เรื่อง</span>
                <button type="button" className="x" aria-label={"เอาโฟลเดอร์ " + f + " ออกจากชั้น"} title="เอาออกจากชั้นวาง ไฟล์ในเครื่องไม่ถูกแตะ" data-board-rm-folder={f} onClick={() => setRemoving(f)}>×</button></div>
            ))}
            <div className="addfolder"><button type="button" className="addbtn" data-board-add-movies onClick={async () => { const d = await pickFolder("เลือกโฟลเดอร์หนัง"); if (d) addMovieFolders([d]); }}>+ เพิ่มโฟลเดอร์หนัง</button><span>หรือลากโฟลเดอร์มาวาง แล้วหนังจะขึ้นชั้นวางด้วย{scanning ? " กำลังอ่านโฟลเดอร์" : ""}</span></div>
          </div>
          <div style={{ marginBottom: 8 }}><SearchBox value={query} onChange={setQuery} placeholder="ค้นชื่อหนัง" label="ค้นชื่อหนังบนกระดาน" swapLabel={found.swapped ? found.used : ""} width="100%" /></div>
          <div className="bscroll">
            {list.length === 0 ? <div className="small" style={{ padding: "18px 4px" }} data-board-nomovie>{query ? "ไม่มีหนังที่ชื่อตรงกับคำค้น" : "ทุกเรื่องมีปกหรือรอยืนยันอยู่แล้ว ให้กลับไปยืนยันที่ตารางตรวจผล"}</div>
              : <div className={mvOnly ? "mvgrid" : "mvlist"} data-board-movies>
                {list.map((m) => <MovieCell key={m.id} m={m} title={titles[m.id] ?? m.name} only={mvOnly} selected={selected} over={over?.id === m.id ? over : drag?.moved && drag.on === m.id ? { id: m.id, names: baseName(drag.path), bad: false } : null}
                  sent={sent.includes(m.id)} pick={rowOf.get(m.id)?.tall ?? rowOf.get(m.id)?.wide ?? null}
                  onPick={() => tryPick(m.id)} onUndo={() => undo(m.id)} />)}
              </div>}
          </div>
        </div>
      </div>
    </>
  );
}
