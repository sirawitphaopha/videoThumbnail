/* แถวของตารางตรวจผล ภาพเล็ก รูปใหญ่ตอนชี้ ปุ่มของแถว (แยกจาก LinkPage.tsx BUGS ข้อ 161 ชุด 3) */
import { thumbUrl, type LinkPick, type LinkRow } from "../../lib/api/index";
import { thumbOf } from "../../lib/linkJob";
import { IcPoster } from "../../components/icons";
import HoverBig from "../../components/HoverBig";
import { IbBack, IbTick, IbCrop } from "../../components/icons";
import { PILL, baseName, pathNodes } from "./linkUtil";

export function ThumbImg({ p, wide }: { p: LinkPick | null; wide?: boolean }) {
  const src = thumbUrl(p?.cropThumb ?? thumbOf(p));
  return src ? <img className={"lthumb" + (wide ? " wide" : "")} src={src} alt="" loading="lazy" draggable={false} /> : <span className={"lthumb none" + (wide ? " wide" : "")} />;
}

/** ชี้แล้วขึ้นรูปใหญ่ ปุ่มมุมรูปดูเต็มจอ · ครอปแล้วใช้สัดส่วนช่องปก ยังไม่ครอปใช้สัดส่วนรูปจริง */
export function BigOf({ p, wide, children }: { p: LinkPick | null; wide?: boolean; children: React.ReactNode }) {
  const src = thumbUrl(p?.cropThumb ?? thumbOf(p));
  if (!p || !src) return <>{children}</>;
  const ratio = p.cropThumb || !p.width || !p.height ? (wide ? 16 / 9 : 2 / 3) : p.width / p.height;
  return <HoverBig src={src} ratio={ratio} view={{ path: p.path, geo: p.geo, name: p.name, folder: p.folder }}>{children}</HoverBig>;
}

export function Thumb({ p, wide }: { p: LinkPick | null; wide?: boolean }) {
  return <BigOf p={p} wide={wide}><ThumbImg p={p} wide={wide} /></BigOf>;
}

export function RowView(p: {
  r: LinkRow; coverThumb: string | null; busy: boolean; busyWhy?: string; cropping?: boolean; over: { names: string; bad: boolean } | null; onBoard: () => void;
  onTick: (v: boolean) => void; onChoose: (path: string) => void; onCrop: () => void; onChange: () => void; onConfirm: () => void; onSkip: () => void; onUndo: () => void; onUnsave: () => void; onResolve: (how: "use" | "app") => void;
}) {
  const { r } = p;
  const has = !!(r.tall || r.wide);
  const main = r.tall ?? r.wide;
  const second = r.wide && r.tall && (r.wide.path !== r.tall.path || r.wide.geo) ? r.wide : null;
  const saved = r.status === "saved";
  const pillText = saved ? r.reason : r.reason;
  /** ระหว่างยืนยัน ห้ามแก้แถว ฝั่ง Rust กันอยู่แล้ว ปุ่มต้องบอกตั้งแต่บนจอ */
  const g = (f: () => void) => () => { if (!p.busy) f(); };
  const dis = { "aria-disabled": p.busy || undefined, title: p.busy ? (p.busyWhy || "กำลังยืนยันอยู่ รอให้เสร็จก่อน") : undefined };
  const ghost = "btn btn-sm " + (p.busy ? "btn-wait" : "btn-ghost");
  const candThumbs = (
    <div className={"lsugg" + (has ? " mini" : "")} data-link-cands>
      {r.candidates.map((c) => (
        <BigOf key={c.path} p={c}><button type="button" className={"lcand" + (main?.path === c.path ? " sel" : "")} title={c.name} aria-label={"ใช้รูป " + c.name} aria-pressed={main?.path === c.path} data-link-cand={c.name} onClick={() => p.onChoose(c.path)}><ThumbImg p={c} /></button></BigOf>
      ))}
    </div>
  );
  return (
    <div className={"lkrow " + r.status + (p.over ? " over" + (p.over.bad ? " bad" : "") : "")} data-link-row={r.id} data-link-status={r.status}>
      <div>
        {saved ? <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" style={{ color: "var(--ok-ink)" }} strokeWidth="2.6" aria-label="บันทึกแล้ว" data-link-savedtick><path d="M5 12.5l4.5 4.5L19 7.5" /></svg>
          : <button type="button" role="checkbox" aria-checked={r.ticked} aria-label={"ติ๊กเลือก " + r.title} aria-disabled={!has || p.busy || undefined} title={p.busy ? dis.title : !has ? "แถวนี้ยังไม่มีรูป เลือกรูปก่อนจึงติ๊กได้" : undefined} className={"cbx " + (r.ticked ? "on" : "off")} data-link-tick
              onClick={() => { if (has && !p.busy) p.onTick(!r.ticked); }}>{r.ticked && <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="4"><path d="M5 12.5l4.5 4.5L19 7.5" /></svg>}</button>}
      </div>
      <div className="lpick">
        {p.coverThumb ? <HoverBig src={thumbUrl(p.coverThumb)} name={"ปกที่มีอยู่ของ " + r.title}><img className="lthumb" src={thumbUrl(p.coverThumb) ?? undefined} alt="ปกที่เรื่องนี้มีอยู่" loading="lazy" draggable={false} /></HoverBig> : <span className="lthumb none">ไม่มีปก</span>}
        <div className="lname"><b>{r.title}</b><span className="fn" title={r.movie}>{baseName(r.movie)}</span></div>
      </div>
      <div className="larrow" aria-hidden="true">→</div>
      <div>
        {has ? (
          <div className="lpick" data-link-chosen>
            <Thumb p={main} wide={!r.tall} />
            {second && <Thumb p={second} wide />}
            <div className="lname">
              <span className="fn" title={main!.path}>{main!.name}</span>
              <span className="small">{main!.folder ? <span className="lfolder" title={main!.folder}>{pathNodes(main!.folder)}</span> : null}<span className="nw">{main!.width} × {main!.height} เป็น{r.tall && !r.derivedTall ? "ปกตั้ง" : "ปกนอน"}</span>{second ? <> <span className="nw">และมีปกนอนด้วย</span></> : null}</span>
              {(r.tall?.geo || r.wide?.geo) && !r.derivedTall && <span className="small" data-link-cropped>ครอปแล้ว</span>}
              {r.candidates.length > 0 && !saved && candThumbs}
            </div>
          </div>
        ) : null}
        {!has && r.candidates.length > 0 && !saved && (
          <div className="lpick">{candThumbs}<div className="small" style={{ color: "var(--warn-ink)" }}>ชื่อใกล้เคียง {r.candidates.length} รูป กดรูปที่ใช่</div></div>
        )}
        {!has && r.candidates.length === 0 && <span className="small" style={{ color: "var(--bad-ink)" }}>ไม่มีรูปชื่อใกล้เคียง <button type="button" className="addbtn" style={{ color: "inherit" }} data-link-row-board onClick={g(p.onBoard)}>ไปจับคู่เองที่กระดาน</button> หรือลากรูปมาวางบนแถวนี้</span>}
        {p.over && <div className={"hint" + (p.over.bad ? " e" : "")} style={{ marginTop: 6 }} data-link-over>{p.over.bad ? "ไฟล์นี้ไม่ใช่รูป ไม่รับ" : `ปล่อยเมาส์ ใช้รูป ${p.over.names}`}</div>}
        {r.error && (
          <div className="hint e" role="alert" style={{ marginTop: 6 }} data-link-error>{r.error}
            {r.conflict && <span className="row8" style={{ marginTop: 6 }}>
              <button type="button" className={ghost} {...dis} data-link-use onClick={g(() => p.onResolve("use"))}>ใช้ไฟล์ที่มีอยู่</button>
              <button type="button" className={ghost} {...dis} data-link-toapp onClick={g(() => p.onResolve("app"))}>เก็บในโปรแกรมแทน</button>
            </span>}
          </div>
        )}
      </div>
      <div><span className={"pill " + PILL[r.status]} data-link-reason style={{ whiteSpace: "normal" }}>{pillText}</span></div>
      <div className="lacts">
        {saved ? (
          <><span /><span className="pill p-ok">บันทึกแล้ว</span><button type="button" className={ghost} {...dis} data-link-unsave onClick={g(p.onUnsave)}>เอาปกออก</button></>
        ) : (
          <>
            {has ? <button type="button" className={ghost} {...dis} data-link-crop onClick={g(p.onCrop)}><IbCrop size={15} />ครอป</button> : <span />}
            <button type="button" className={ghost} {...dis} data-link-change onClick={g(p.onChange)}><IcPoster size={15} />{has ? "เปลี่ยนรูป" : "เลือกรูป"}</button>
            {has ? <button type="button" className={"btn btn-sm " + (p.busy || p.cropping ? "btn-wait" : "btn-ok")} aria-disabled={p.busy || p.cropping || undefined} title={p.cropping ? "กำลังจำค่าครอป รอให้เสร็จก่อน" : undefined} data-link-confirm onClick={() => { if (!p.busy && !p.cropping) p.onConfirm(); }}><IbTick size={15} />ยืนยัน</button>
              : r.status === "unsure" ? <button type="button" className={ghost} {...dis} data-link-skip onClick={g(p.onSkip)}>ข้ามเรื่อง</button> : <span />}
            {!!r.prev && <button type="button" className={ghost} {...dis} data-link-undo onClick={g(p.onUndo)}><IbBack size={15} />ย้อน</button>}
            {r.via === "shelf" && <button type="button" className={ghost} aria-disabled={p.busy || undefined} data-link-skip title={p.busy ? dis.title : "ปกบนชั้นวางคงเดิม ไม่มีอะไรถูกเขียน"} onClick={g(p.onSkip)}>เลิกแก้</button>}
          </>
        )}
      </div>
    </div>
  );
}
