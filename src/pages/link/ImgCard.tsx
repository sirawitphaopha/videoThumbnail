/* การ์ดรูปกับช่องหนังบนกระดานจับคู่ปก
   แยกจาก LinkBoard.tsx ตอนจัดโครงไฟล์ตามความหมาย (BUGS ข้อ 155 ขั้น 8) เนื้อโค้ดยกมาทั้งก้อน */
import { thumbUrl, type LinkImage, type Movie } from "../../lib/api/index";
import { thumbOf } from "../../lib/linkJob";
import { IbBack } from "../../components/icons";
import { baseName, type Over } from "./boardShared";


export function ImgCard(p: { i: LinkImage; sel: boolean; dragging?: boolean; onPick: () => void; onDown: (e: React.PointerEvent) => void; onKey: (e: React.KeyboardEvent) => void }) {
  const { i } = p;
  const src = thumbUrl(thumbOf(i));
  const wide = i.width > i.height;
  return (
    <button type="button" className={"bimg" + (p.sel ? " sel" : "") + (p.dragging ? " drag" : "") + (wide ? " wide" : "")} title={i.name} aria-label={"รูป " + i.name} aria-pressed={p.sel} data-board-img={i.name}
      onClick={p.onPick} onPointerDown={p.onDown} onKeyDown={p.onKey} onDragStart={(e) => e.preventDefault()}>
      {src ? <img src={src} alt="" loading="lazy" draggable={false} /> : <span className="bimgph">{i.error ? "อ่านไม่ได้" : ""}</span>}
      <span className="fn">{i.name}</span>
    </button>
  );
}

export function MovieCell(p: { m: Movie; title: string; only: boolean; selected: string | null; over: Over; sent: boolean; pick: { thumb: string | null; name: string; path: string } | null; onPick: () => void; onUndo: () => void }) {
  const { m, over } = p;
  const pickSrc = p.sent && p.pick ? thumbUrl(thumbOf(p.pick as never)) : null;
  const cover = thumbUrl(m.thumb);
  const cls = (over ? " target" : "") + (over?.bad ? " bad" : "") + (p.sent ? " sent" : "");
  const dropText = over?.bad ? "ไม่ใช่รูป ไม่รับ" : "ปล่อยเมาส์เพื่อใช้รูปนี้";
  if (p.only) {
    return (
      <div className={"mt" + cls} title={[m.name, p.sent && p.pick ? `ส่งรูป ${p.pick.name} ไปรอยืนยันที่ตารางแล้ว` : ""].filter(Boolean).join("\n")} data-board-movie={m.id} data-board-title={p.title}
        role="button" tabIndex={0} aria-label={p.title} onClick={() => { if (!p.sent) p.onPick(); }} onKeyDown={(e) => { if (e.key === "Enter" && !p.sent) p.onPick(); }}>
        {pickSrc ? <img className="slot" src={pickSrc} alt="" draggable={false} />
          : cover ? <img className="slot" src={cover} alt="" draggable={false} />
          : <span className="slot none"><b>{p.title}</b>{over && <em>{dropText}</em>}</span>}
        {(pickSrc || cover) && over && <span className="mtover">{dropText}</span>}
        {p.sent && <button type="button" className="btn btn-ghost btn-sm undo" data-board-undo onClick={(e) => { e.stopPropagation(); p.onUndo(); }}><IbBack size={15} />ย้อน</button>}
      </div>
    );
  }
  return (
    <div className={"mvrow" + cls} data-board-movie={m.id} data-board-title={p.title} role="button" tabIndex={0} aria-label={p.title}
      onClick={() => { if (!p.sent) p.onPick(); }} onKeyDown={(e) => { if (e.key === "Enter" && !p.sent) p.onPick(); }}>
      {pickSrc ? <img className="lthumb small" src={pickSrc} alt="" draggable={false} />
        : cover ? <img className="lthumb small" src={cover} alt="" draggable={false} />
        : <span className="lthumb small none">ไม่มีปก</span>}
      <div className="lname"><b>{p.title}</b><span className="fn" title={m.path}>{p.sent && p.pick ? `ส่งรูป ${p.pick.name} ไปรอยืนยันที่ตารางแล้ว` : `${baseName(m.path)} ใน ${m.root}`}</span></div>
      {over ? <span className="small mvhint">{dropText}{over.names ? <><br />{over.names}</> : null}</span>
        : p.sent ? <button type="button" className="btn btn-ghost btn-sm" data-board-undo onClick={(e) => { e.stopPropagation(); p.onUndo(); }}><IbBack size={15} />ย้อน</button>
        : p.selected ? <span className="small mvhint">กดเพื่อใช้รูปที่เลือก</span> : null}
    </div>
  );
}
