/* ชั้นวาง แผงรายละเอียดด้านขวา (Detail) · ปุ่มจับคู่ปก การ์ดปกที่จับคู่ การ์ดคู่ที่จับไว้ การ์ดสถานะไฟล์
   แยกจาก ShelfPage.tsx ตอนแบ่งไฟล์ทั้งโปรเจกต์ (BUGS ข้อ 153 · แผนแบ่งไฟล์ขั้น 4.2) ย้ายมาทั้งก้อน เนื้อโค้ดไม่เปลี่ยน */
import { useEffect, useState } from "react";
import type { CheckReq } from "../check/CheckPage";
import type { Page } from "../../components/Sidebar";
import RenameBox from "./RenameBox";
import { CardIcon, J, Keep, Phr, Seg, Skel } from "../../components/ui";
import Dialog from "../../components/Dialog";
import { IcBitrate, IcLink } from "../../components/icons";
import { openLinkRow, setReply } from "../../lib/linkJob";
import type { PosterStart } from "../poster/PosterPage";
import { useToast } from "../../components/Toasts";
import { useMovieFrame } from "../../lib/frames";
import { linkApi, thumbUrl, type Geometry, type LinkedCover, type Movie, pairApi, pickAddFiles, type Pair, type PairPlay } from "../../lib/api";
import { langName } from "../../lib/langs";
import { fmtDateTime, fmtDuration, fmtSize } from "../../lib/format";
import { kindOf } from "../../lib/status";
import HoverBig from "../../components/HoverBig";
import { usePageActive } from "../../lib/pageActive";
import { IcSearch, IbTrash, IbNext, IcCheck, IbPencil, IcMix, IbPlay, IcPoster, IbCrop } from "../../components/icons";
import { Hl, baseName, tracks } from "./common";
import { Stars } from "./ShelfGrid";

/* ---------- แผงรายละเอียด (ต้นแบบบรรทัด 388–426) ---------- */
export function Detail(p: { m: Movie; renameAsk?: boolean; onRenameAsked?: () => void; showFrames: boolean; scanning: boolean; reminder: number; onPage: (pg: Page) => void; onCheck: (r: CheckReq) => void; onGraph: (path: string) => void; onBitrate: (path: string) => void; onAv: (path: string) => void; onPoster: (path: string) => void; onMerge: (path: string, image: PosterStart) => void; onInfo: () => void; onPlay: () => void; onReveal: () => void; onClose: () => void }) {
  const { m } = p;
  const src = thumbUrl(m.thumb);
  const [imgOk, setImgOk] = useState(true);
  useEffect(() => setImgOk(true), [src]);
  const frame = useMovieFrame(m, p.showFrames && !src);
  // เปลี่ยนชื่อ (สเปกข้อ 2) · ⑤ สำเร็จ การ์ดเขียวหายเองใน 3 วินาที
  const [editing, setEditing] = useState(false);
  const [renamed, setRenamed] = useState(false);
  useEffect(() => { if (!renamed) return; const t = setTimeout(() => setRenamed(false), 3000); return () => clearTimeout(t); }, [renamed]);
  const renameBlock = m.missing ? "หาไฟล์ไม่เจอ ไดรฟ์อาจถอดออกอยู่" : p.scanning ? "กำลังอ่านโฟลเดอร์อยู่ รอให้เสร็จก่อน" : null;
  const startRename = () => { if (!renameBlock) { setRenamed(false); setEditing(true); } };
  // กดเปลี่ยนชื่อจากเมนูคลิกขวา (BUGS ข้อ 163.7) เปิดช่องเปลี่ยนชื่อแล้วบอกให้ล้างค่า
  useEffect(() => { if (p.renameAsk) { startRename(); p.onRenameAsked?.(); } });
  // รูปต้นทางของตัวดูรูป · ปกจับคู่เปิดไฟล์ที่โปรแกรมเก็บไว้ หรือรูปต้นฉบับพร้อมค่าครอป · ปกในไฟล์หนังใช้ภาพที่มี
  const shownCover = m.shownLink ? (m.linked ?? []).find((c) => c.thumb === m.thumb) ?? null : null;
  const linkedView = shownCover ? { path: shownCover.file ?? shownCover.source, geo: shownCover.file ? null : shownCover.geo, name: m.name, folder: null } : undefined;
  return (
    <aside className="detail" aria-label="รายละเอียดไฟล์" data-detail>
      <div className="dhead"><span>รายละเอียดไฟล์</span>
        <button type="button" className="dclose" onClick={p.onClose} aria-label="ปิดแผงรายละเอียด" title="ปิดแผงรายละเอียด ชั้นวางกว้างขึ้น" data-detailclose>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" /></svg>
        </button>
      </div>
      {src && imgOk ? (
        <HoverBig noPop className="dpbig" src={src} name={m.name} view={linkedView}><img className={"dposter" + ((m.coverAspect ?? 0) >= 1 ? " wide" : "")} src={src} alt={"โปสเตอร์ " + m.name} onError={() => setImgOk(false)} /></HoverBig>
      ) : frame.url ? (
        <div data-frame><img className="dposter wide" src={thumbUrl(frame.url) ?? undefined} alt="" /><div className="small" style={{ textAlign: "center", marginTop: 6 }}>ภาพจากหนัง ยังไม่ใช่ปก</div></div>
      ) : (
        <div ref={frame.ref} className="dposter none">
          <svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="#c99aad" strokeWidth="2" aria-hidden="true"><rect x="4" y="3" width="16" height="18" rx="2" /><path d="M8 15l3-3 2 2 3-3 2 2" /></svg>
          ยังไม่มีโปสเตอร์
        </div>
      )}
      {editing ? (
        <RenameBox m={m} onCancel={() => setEditing(false)} onDone={(_, changed) => { setEditing(false); setRenamed(changed); }} />
      ) : (
        <div className="fname">
          <div className="nm"><Hl text={m.name} used="" tail={<span className="ext">.{m.ext}</span>} /></div>
          <button type="button" className={"icon-btn" + (renameBlock ? " off" : "")} aria-label="เปลี่ยนชื่อไฟล์" aria-disabled={!!renameBlock || undefined}
            title={renameBlock ? "เปลี่ยนชื่อไม่ได้ " + renameBlock : "เปลี่ยนชื่อไฟล์"} onClick={startRename}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" aria-hidden="true"><path d="M4 20h4L19 9l-4-4L4 16z" /><path d="M14 6l4 4" /></svg>
          </button>
        </div>
      )}
      {!editing && <div className="fstars"><Stars m={m} /></div>}
      {renamed && !editing && (
        <div className="stat ok" style={{ marginTop: 0, marginBottom: 12 }} role="status" data-renamed>
          <CardIcon kind="done" /><div><b>เปลี่ยนชื่อไฟล์แล้ว</b><Phr>ชื่อในเครื่องเปลี่ยนตามแล้ว แถบนี้หายเองใน 3 วินาที</Phr></div>
        </div>
      )}
      <dl className="kv">
        <dt>File size</dt><dd><span className="nw">{fmtSize(m.size)}</span></dd>
        <dt>Duration</dt><dd><span className="nw">{fmtDuration(m.duration)}</span></dd>
        <dt>Video</dt><dd>{m.video?.replace(" · ", " ") ?? "—"}</dd>{/* คลังที่อ่านก่อน 11 พ.ย. 2569 เก็บแบบมีจุดคั่น */}
        <dt>Audio</dt><dd>{tracks(m.audio, true) || "ไม่มี"}</dd>
        <dt>Subtitle</dt><dd>{tracks(m.subs, false) || "ไม่มี"}</dd>
        <dt>Attachment</dt><dd>{m.images ? `${m.hasCover ? "โปสเตอร์" : "รูป"} ${m.images} รูป` : "ไม่มี"}</dd>
      </dl>
      <StatusCard m={m} reminder={p.reminder} onCheck={p.onCheck} onPoster={() => p.onPoster(m.path)} />
      {/* ปกเสียไม่ใช่อ่านไฟล์ไม่ได้ การ์ดสภาพไฟล์ยังอยู่ บอกสั้น ๆ ต่อใต้ (AUDIT ข้อ 47) · ข้อความจากเครื่องมืออยู่ใน title */}
      {m.coverError && !m.missing && !m.error && <div className="stat warn" data-cover-error title={m.coverError}><CardIcon kind="warn" /><div><b>ทำภาพปกไม่ได้</b><Phr>{"รูปปกที่แนบในไฟล์อาจเสีย\nส่วนภาพ เสียง และซับอ่านได้ครบ"}</Phr></div></div>}
      {(m.pairs?.length ?? 0) > 0 && <PairCard m={m} onEdit={() => p.onAv(m.path)} />}
      {(m.linked?.length ?? 0) > 0 && <LinkCard m={m} onPage={p.onPage} onMerge={p.onMerge} />}
      <div className="actions">
        {m.missing ? (
          <button type="button" className="btn btn-wait" aria-disabled="true" title="หาไฟล์ไม่เจอ ไดรฟ์อาจถอดออกอยู่" onClick={p.onPlay}><PlayIcon />เปิดเล่น</button>
        ) : (
          <button type="button" className="btn btn-main" onClick={p.onPlay}><PlayIcon />เปิดเล่น</button>
        )}
        <button type="button" className={"btn " + (renameBlock ? "btn-wait" : "btn-ghost")} aria-disabled={!!renameBlock || undefined}
          title={renameBlock ? "เปลี่ยนชื่อไม่ได้ " + renameBlock : undefined} onClick={startRename}><IbPencil size={15} />เปลี่ยนชื่อ</button>
        <button type="button" className={"btn " + (m.missing ? "btn-wait" : "btn-ghost")} aria-disabled={m.missing || undefined}
          title={m.missing ? "หาไฟล์ไม่เจอ ไดรฟ์อาจถอดออกอยู่" : undefined} onClick={() => { if (!m.missing) p.onPoster(m.path); }}><IcPoster size={15} />เปลี่ยนโปสเตอร์</button>
        <button type="button" className="btn btn-ghost" onClick={() => p.onCheck({ ids: [m.id] })}><IcCheck size={15} />ตรวจไฟล์</button>
        <button type="button" onClick={() => { if (!m.missing) p.onInfo(); }} className={"btn " + (m.missing ? "btn-wait" : "btn-ghost")} aria-disabled={m.missing || undefined} title={m.missing ? "หาไฟล์ไม่เจอ ไดรฟ์อาจถอดออกอยู่" : undefined}>
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><circle cx="12" cy="12" r="9" /><path d="M12 11v6M12 7.5h.01" /></svg>MediaInfo
        </button>
        <button type="button" className="btn btn-ghost" onClick={p.onReveal}>
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path d="M3 7a2 2 0 012-2h4l2 2h8a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2z" /></svg>เปิดโฟลเดอร์
        </button>
        {!(m.linked?.length) && <LinkPairButton m={m} onPage={p.onPage} />}
        {/* ปุ่มที่ 7 กราฟเสียง คู่กับปุ่มที่ 8 เสียงและซับ (มอคอัปเสียงและซับ *"แผงขวาของชั้นวางเพิ่มปุ่มที่ 8 คู่กับกราฟเสียง"*) */}
        {(() => { const block = m.missing ? "หาไฟล์ไม่เจอ ไดรฟ์อาจถอดออกอยู่" : m.audio.length === 0 ? "ไฟล์นี้ไม่มีแทร็กเสียง" : null; return (
          <button type="button" className={"btn " + (block ? "btn-wait" : "btn-ghost")} aria-disabled={!!block || undefined} title={block ?? undefined}
            onClick={() => { if (!block) p.onGraph(m.path); }} data-shelfgraph>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path d="M3 12h2M7 7v10M11 4v16M15 8v8M19 10v4" /></svg>กราฟเสียง
          </button>); })()}
        <button type="button" className={"btn " + (m.missing ? "btn-wait" : "btn-ghost")} aria-disabled={m.missing || undefined} title={m.missing ? "หาไฟล์ไม่เจอ ไดรฟ์อาจถอดออกอยู่" : undefined}
          onClick={() => { if (!m.missing) p.onAv(m.path); }} data-shelfav>
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path d="M4 21v-7M4 10V3M12 21v-9M12 8V3M20 21v-5M20 12V3M1 14h6M9 8h6M17 16h6" /></svg>เสียงและซับ
        </button>
        {/* ปุ่ม Bitrate (พี่กันสั่ง 10 พ.ย. 2569 "บิตเรต ภาษาอังกฤษ") เปิดหน้าบิตเรตพร้อมไฟล์นี้ ไฟล์มีหลายแทร็กหน้าบิตเรตถามก่อน · ไม่มีวิดีโอก็ดูบิตเรตเสียงได้ (พี่กันสั่ง 10 พ.ย. 2569 "เพิ่ม สามารถกดดูบิตเรตได้จาก ชั้นหนัง หน้าโปรไฟล์") */}
        {(() => { const block = m.missing ? "หาไฟล์ไม่เจอ ไดรฟ์อาจถอดออกอยู่" : null; return (
          <button type="button" className={"btn " + (block ? "btn-wait" : "btn-ghost")} aria-disabled={!!block || undefined} title={block ?? undefined}
            onClick={() => { if (!block) p.onBitrate(m.path); }} data-shelfbitrate>
            <IcBitrate size={15} />Bitrate
          </button>); })()}
      </div>
    </aside>
  );
}

/** ปุ่มจับคู่รูปปก เรื่องที่ยังไม่มีปกจับคู่ · พาไปแถวของเรื่องนี้ในตารางตรวจผล เลือกรูปหรือลากรูปมาวางที่นั่น (มอคอัปทางที่ 3) */
function LinkPairButton({ m, onPage }: { m: Movie; onPage: (pg: Page) => void }) {
  const toast = useToast();
  const block = m.missing ? "หาไฟล์ไม่เจอ ไดรฟ์อาจถอดออกอยู่" : null;
  return (
    <button type="button" className={"btn " + (block ? "btn-wait" : "btn-ghost")} aria-disabled={!!block || undefined} title={block ?? undefined} data-shelflink
      onClick={async () => {
        if (block) return;
        try { await openLinkRow(m.id); onPage("link"); } catch (e) { toast({ kind: "bad", title: "เปิดตารางจับคู่ไม่ได้", detail: String(e) }); }
      }}>
      <IcLink size={15} />จับคู่รูปปก
    </button>
  );
}

/** ค่าที่ใช้ตอนรวมเข้าไฟล์จากสำเนา รูปต้นฉบับหายแล้ว · สำเนาครอปมาแล้ว ใช้ทั้งรูป */
const WHOLE: Geometry = { rotate: 0, flip: false, mode: "original", pad: "#f6dbe5", x: 0, y: 0, w: 1, h: 1 };
const whereAll = (c: LinkedCover) => whereText(c) + (c.appCopy ? " และเก็บสำเนาไว้ในโปรแกรมด้วย" : "");
const whereText = (c: LinkedCover) => c.store === "app" ? "เก็บสำเนาไว้ในโปรแกรม"
  : c.store === "link" ? "จับคู่อย่างเดียว ใช้รูปต้นฉบับ"
  : c.owned ? `คัดลอกไว้ข้างไฟล์หนัง ${baseName(c.file ?? "")}` : `ใช้ไฟล์ ${baseName(c.file ?? "")} ที่อยู่ข้างหนัง`;

/** ที่เก็บปกแบบสั้น บรรทัดเดียวในการ์ด */
const whereShort = (c: LinkedCover) => c.store === "app" ? "เก็บในโปรแกรม" : c.store === "link" ? `ใช้รูป ${baseName(c.source)}` : baseName(c.file ?? c.source);

/** ปกที่จับคู่ไว้ (มอคอัปหน้า 5) · บอกที่มา ไม่ได้อยู่ในไฟล์ ไอคอนใน Windows ไม่เปลี่ยน · ครอปใหม่กับเปลี่ยนรูปพาไปตาราง แก้แล้วยืนยันอีกครั้งถึงเปลี่ยนบนชั้น
    เอาปกออก รูปที่โปรแกรมคัดลอกเองลงถังขยะ (พี่กันตอบตอนทำแผน) · รวมเข้าไฟล์พาไปหน้าใส่โปสเตอร์พร้อมรูปกับค่าครอป · เรื่องที่มีสองปก เลือกปกที่แสดงได้ */
function LinkCard({ m, onPage, onMerge }: { m: Movie; onPage: (pg: Page) => void; onMerge: (path: string, image: PosterStart) => void }) {
  const toast = useToast();
  const linked = m.linked ?? [];
  const c = m.shownLink ?? linked[0];
  const [found, setFound] = useState<{ file: boolean; source: boolean } | null>(null);
  const [ask, setAsk] = useState(false);
  const [busy, setBusy] = useState(false);
  const shownFile = c.file ?? c.source;
  useEffect(() => {
    let live = true;
    pairApi.check([shownFile, c.source]).then(([f, s]) => { if (live) setFound({ file: f, source: s }); }).catch(() => {});
    return () => { live = false; };
  }, [shownFile, c.source]);
  const go = async (crop: boolean) => {
    try { await openLinkRow(m.id, crop); onPage("link"); }
    catch (e) { toast({ kind: "bad", title: "เปิดตารางจับคู่ไม่ได้", detail: String(e) }); }
  };
  const remove = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const r = await linkApi.remove(m.id);
      setReply(r.reply);
      setAsk(false);
      toast({ kind: "ok", title: "เอาปกจับคู่ออกแล้ว", detail: "ไฟล์หนังกับรูปต้นฉบับไม่ถูกแตะ" });
      r.notes.forEach((n) => toast({ kind: "warn", title: "มีไฟล์ที่ไม่ได้ลบ", detail: n }));
    } catch (e) {
      toast({ kind: "bad", title: "เอาปกออกไม่สำเร็จ", detail: String(e) });
    } finally { setBusy(false); }
  };
  const lost = found ? !found.file : false;
  const noSource = found ? !found.source : false;
  const mergeBlock = m.missing ? "หาไฟล์ไม่เจอ ไดรฟ์อาจถอดออกอยู่" : lost && noSource ? "หารูปไม่เจอ ต้องจับคู่ใหม่ก่อน" : null;
  const cropBlock = noSource ? "หารูปต้นฉบับไม่เจอ ครอปใหม่ไม่ได้ กดเปลี่ยนรูปแทน" : null;
  const trash = linked.filter((x) => x.owned && x.store === "beside" && x.file).map((x) => baseName(x.file!));
  const hasApp = linked.some((x) => (x.owned && x.store === "app") || x.appCopy);
  return (
    <div data-link-card style={{ marginBottom: 12 }}>
      <div className="stat info" style={{ marginTop: 0 }}><span style={{ flex: "none", marginTop: 1 }}><IcLink size={16} /></span><div>
        {/* สั้นสองบรรทัด รายละเอียดเต็มอยู่ตอนชี้ (พี่กันทัก 10 พ.ย. 2569 "ต้องเขียนอธิบายเยอะขนาดนี้เลยเหรอ") */}
        <b>{m.shownLink ? "ปกจับคู่ ไม่ได้อยู่ในไฟล์" : "มีปกจับคู่ด้วย ตอนนี้แสดงปกในไฟล์"}</b>
        <div style={{ overflowWrap: "anywhere" }} data-link-where title={`จากรูป ${baseName(c.source)}${c.cropped ? " และครอปแล้ว" : ""}
${whereAll(c)}
ไอคอนไฟล์ใน Windows ไม่เปลี่ยน เพราะ Icaros อ่านปกจากในไฟล์`}>{whereShort(c)}</div>
      </div></div>
      {lost && (
        <div className="stat warn" style={{ marginTop: 8 }} data-link-lost><CardIcon kind="warn" /><div><b>หารูปไม่เจอ</b><Phr>รูปถูกย้ายหรือลบไปแล้ว ปกที่เห็นเป็นภาพเล็กที่โปรแกรมจำไว้ กดเปลี่ยนรูปเพื่อจับคู่ใหม่</Phr></div></div>
      )}
      {m.fileCover && (
        <div className="setrow" style={{ borderTop: 0, padding: "8px 0 4px" }} data-link-pick>
          <div className="lbl" style={{ fontSize: 13.5 }}>ปกที่แสดง</div>
          <Seg small label="ปกที่แสดง" value={m.coverPick === "file" ? "file" : "linked"} onChange={(v) => { linkApi.coverPick(m.id, v).catch((e) => toast({ kind: "bad", title: "เปลี่ยนปกที่แสดงไม่ได้", detail: String(e) })); }}
            options={[{ value: "linked", label: <><IcLink size={14} />ปกจับคู่</> }, { value: "file", label: <><IcPoster size={14} />ปกในไฟล์</> }]} />
        </div>
      )}
      <div className="actions" style={{ marginTop: 8 }}>
        <button type="button" className={"btn btn-sm " + (cropBlock ? "btn-wait" : "btn-ghost")} aria-disabled={!!cropBlock || undefined} title={cropBlock ?? undefined} data-link-recrop onClick={() => { if (!cropBlock) void go(true); }}><IbCrop size={15} />ครอปใหม่</button>
        <button type="button" className="btn btn-ghost btn-sm" data-link-rechange onClick={() => void go(false)}><IcPoster size={15} />เปลี่ยนรูป</button>
        <button type="button" className="btn btn-ghost btn-sm" data-link-remove onClick={() => setAsk(true)}><IbTrash size={15} />เอาปกออก</button>
        <button type="button" className={"btn btn-sm " + (mergeBlock ? "btn-wait" : "btn-main")} aria-disabled={!!mergeBlock || undefined} title={mergeBlock ?? undefined} data-link-merge
          onClick={() => { if (!mergeBlock) onMerge(m.path, noSource ? { path: shownFile, geo: WHOLE } : { path: c.source, geo: c.geo ?? WHOLE }); }}><IcMix size={15} />รวมเข้าไฟล์</button>
      </div>
      <Dialog open={ask} onClose={() => { if (!busy) setAsk(false); }} kind="work" confirm title={<>เอาปกจับคู่ของ {m.name} ออก</>}
        actions={<>
          <button type="button" className="btn btn-ghost" onClick={() => { if (!busy) setAsk(false); }}>ไม่เอาออก</button>
          <button type="button" className={"btn " + (busy ? "btn-wait" : "btn-bad")} aria-disabled={busy || undefined} data-link-remove-ok onClick={remove}><Keep icon={<IbTrash size={15} />} all={["กำลังเอาออก…", "เอาปกออก"]}>{busy ? "กำลังเอาออก…" : "เอาปกออก"}</Keep></button>
        </>}>
        <div className="small" style={{ fontSize: 14, color: "var(--txt2)" }}>
          {trash.length > 0 && <div style={{ overflowWrap: "anywhere" }}>รูปที่โปรแกรมคัดลอกไว้ {trash.join(", ")} จะย้ายลงถังขยะ กู้คืนได้</div>}
          {hasApp && <div>สำเนาในโปรแกรมจะย้ายลงถังขยะ กู้คืนได้</div>}
          <div>รูปต้นฉบับและไฟล์หนังไม่ถูกแตะ ส่วนไฟล์ที่โปรแกรมไม่ได้สร้างจะไม่ถูกลบ</div>
        </div>
      </Dialog>
    </div>
  );
}

/** เสียงกับซับที่จับคู่ไว้ ไม่รวม (มอคอัปหัวข้อ 5) · บอกว่าเจอไฟล์ไหม · เปิดเล่นพร้อมไฟล์ที่จับคู่ · ไฟล์หาไม่เจอ หาไฟล์ใหม่หรือเอาออกจากคู่ */
function PairCard({ m, onEdit }: { m: Movie; onEdit: () => void }) {
  const pairs = m.pairs ?? [];
  const [found, setFound] = useState<boolean[] | null>(null);
  const [res, setRes] = useState<{ ok?: PairPlay; err?: string } | null>(null);
  const key = pairs.map((x) => x.path).join("|");
  // เช็กใหม่ทุกครั้งที่กลับมาหน้าชั้นวาง และตอนกลับมาที่หน้าต่างโปรแกรม · ชุด 2 เก็บหน้าไว้ไม่ถอดทิ้ง ผลเช็กเลยค้างค่าเก่า
  // ย้ายไฟล์ที่จับคู่ออกแล้วการ์ดยังบอกเจอไฟล์ (เจอตอนรัน check-av 11 พ.ย. 2569) · ผลเดิมแสดงไว้ระหว่างเช็ก ไม่ขึ้นโครงจางซ้ำ
  const active = usePageActive();
  const [focusTick, setFocusTick] = useState(0);
  useEffect(() => { const f = () => setFocusTick((n) => n + 1); window.addEventListener("focus", f); return () => window.removeEventListener("focus", f); }, []);
  useEffect(() => { setFound(null); }, [key]);
  useEffect(() => { if (!active) return; let live = true; pairApi.check(pairs.map((x) => x.path)).then((f) => { if (live) setFound(f); }, () => {}); return () => { live = false; }; }, [key, active, focusTick]); // eslint-disable-line react-hooks/exhaustive-deps
  const save = (next: Pair[]) => pairApi.set(m.path, next).catch((e) => setRes({ err: String(e) }));
  const relink = async (i: number) => {
    const f = await pickAddFiles();
    if (f[0]) save(pairs.map((x, j) => (j === i ? { ...x, path: f[0] } : x)));
  };
  const label = (x: Pair) => [x.kind === "audio" ? `เสียง${x.lang ? " " + langName(x.lang) : ""}` : `ซับ${x.lang ? langName(x.lang) : ""}`, x.name, x.delay ? `ดีเลย์ ${x.delay > 0 ? "+" : "−"}${Math.abs(x.delay).toLocaleString("en-US")} ms` : ""].filter(Boolean).join(", ");
  const missing = found ? found.filter((f) => !f).length : 0;
  return (
    <div className="paircard" data-pairs>
      <b>จับคู่ไว้ {pairs.length} ไฟล์</b>
      {pairs.map((x, i) => (
        <div key={i} className="pair" data-pair={i}>
          <span className={"kind " + (x.kind === "audio" ? "a" : "s")} aria-hidden="true">{x.kind === "audio"
            ? <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2"><path d="M4 10v4M8 7v10M12 4v16M16 8v8M20 10v4" /></svg>
            : <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2"><rect x="3" y="5" width="18" height="14" rx="2" /><path d="M7 14h4M13 14h4M7 10h10" /></svg>}</span>
          <div style={{ minWidth: 0 }}><div>{label(x)}</div><div className="p">{x.path}</div>
            {found && !found[i] && <div style={{ display: "flex", gap: 6, marginTop: 4 }}>
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => relink(i)}><IcSearch size={15} />หาไฟล์ใหม่</button>
              <button type="button" className="btn btn-bad btn-sm" onClick={() => save(pairs.filter((_, j) => j !== i))} data-pair-drop><IbTrash size={15} />เอาออกจากคู่</button></div>}</div>
          {found ? <span className={"tpill " + (found[i] ? "ok" : "warn")}>{found[i] ? "เจอไฟล์" : "หาไม่เจอ"}</span> : <Skel w={56} h={18} r={9} />}
        </div>
      ))}
      {missing > 0 && <div className="stat warn" data-pair-missing><CardIcon kind="warn" /><div><b>{`หาไฟล์ที่จับคู่ไม่เจอ ${missing} ไฟล์`}</b><Phr>ไดรฟ์อาจถอดออกอยู่หรือไฟล์ถูกย้าย แต่ยังเปิดเล่นพร้อมไฟล์ที่เหลือได้</Phr></div></div>}
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
        <button type="button" className={"btn btn-sm " + (m.missing ? "btn-wait" : "btn-main")} aria-disabled={m.missing || undefined} title={m.missing ? "หาไฟล์หนังไม่เจอ" : undefined}
          onClick={() => { if (m.missing) return; setRes(null); pairApi.play(m.path, (window as unknown as { __pairDry?: boolean }).__pairDry).then((ok) => setRes({ ok }), (e) => setRes({ err: String(e) })); }} data-pair-play><IbPlay size={15} />เปิดเล่นพร้อมเสียงและซับที่จับคู่</button>
        <button type="button" className="btn btn-ghost btn-sm" onClick={onEdit} title="เปิดหน้าเสียงและซับ ลากไฟล์ใหม่แล้วกดจับคู่อีกครั้ง แทนชุดเดิม"><IcLink size={15} />แก้การจับคู่</button>
      </div>
      {res?.ok && <div className="small" data-pair-res data-cmd={res.ok.cmd}><Phr>{res.ok.opened ? `เปิดด้วย ${res.ok.player || "โปรแกรมหลักของ Windows"} และส่งไฟล์ที่จับคู่ ${res.ok.sent} ไฟล์` : `รุ่นทดสอบไม่เปิดโปรแกรมเล่น ถ้าเปิดจริงจะส่งไฟล์ที่จับคู่ ${res.ok.sent} ไฟล์ให้ ${res.ok.player || "โปรแกรมหลักของ Windows"}`}</Phr></div>}
      {/* ไฟล์ที่หาไม่เจอการ์ดบอกอยู่แล้วข้างบน ไม่บอกซ้ำ */}
      {res?.ok?.notes.filter((n) => !n.includes("ที่จับคู่ไม่เจอ")).map((n, i) => <div key={i} className="stat warn" data-pair-note><CardIcon kind="warn" /><div><Phr>{n}</Phr></div></div>)}
      {res?.err && <div className="stat bad"><CardIcon kind="bad" /><div><b>เปิดเล่นไม่ได้</b><Phr>{res.err}</Phr></div></div>}
      <div className="small"><Phr>ปุ่มเปิดเล่นเดิมยังเปิดเฉพาะไฟล์หนัง และจุดเล็กที่มุมปกบนชั้นบอกว่าเรื่องนี้จับคู่ไว้</Phr></div>
    </div>
  );
}

/** การ์ดสถานะในแผงรายละเอียด ตามสภาพของไฟล์ (สเปกข้อ 1 การ์ดสถานะแบบอื่น) */
function StatusCard({ m, reminder, onCheck, onPoster }: { m: Movie; reminder: number; onCheck: (r: CheckReq) => void; onPoster: () => void }) {
  if (m.missing) {
    return <div className="stat bad"><CardIcon kind="bad" /><div><b>หาไฟล์ไม่เจอ</b><Phr>{"ไดรฟ์อาจถอดออกอยู่  ให้เสียบไดรฟ์แล้วกดอ่านโฟลเดอร์ใหม่"}</Phr></div></div>;
  }
  if (m.error) {
    return <div className="stat warn"><CardIcon kind="warn" /><div><b>อ่านข้อมูลไฟล์ไม่ได้</b>{m.error}</div></div>;
  }
  const k = kindOf(m, reminder);
  if (k === "bad") {
    const span = m.check?.spans?.[0];
    return (
      <>
        <div className="stat bad"><CardIcon kind="bad" /><div><b>ไฟล์เสียหาย</b><Phr>{`${m.check?.summary ?? (span ? "พบที่เสียในไฟล์" : "ตรวจแล้วพบที่เสีย")}  ไฟล์น่าจะโหลดมาไม่ครบ ควรโหลดใหม่`}</Phr></div></div>
        <div className="minirow half" style={{ marginTop: -4 }}>
          <button type="button" className="btn btn-ghost" onClick={() => onCheck({ ids: [m.id], open: m.id })}><IcCheck size={15} />ดูผลตรวจ</button>
          <button type="button" className="btn btn-ghost" onClick={() => onCheck({ ids: [m.id], mode: "full" })}><IcCheck size={15} />ตรวจซ้ำ</button>
        </div>
      </>
    );
  }
  if (k === "info") {
    return (
      <>
        <div className="stat info"><CardIcon kind="info" /><div><b>ยังไม่ได้ห่อเป็น MKV</b><Phr>{`ไฟล์นี้เป็น ${m.ext.toUpperCase()} ห่อ${J}เป็น MKV ก่อนแล้วจึงใส่โปสเตอร์ได้  ภาพและเสียงไม่ถูก${J}แปลง คุณภาพเท่าเดิม`}</Phr></div></div>
        <div className="minirow half" style={{ marginTop: -4 }}><button type="button" className="btn btn-main wide" onClick={onPoster}><IcPoster size={15} />ห่อเป็น MKV พร้อมโปสเตอร์</button></div>
      </>
    );
  }
  if (k === "warn") {
    const title = m.status === "changed" ? "ไฟล์ถูกเปลี่ยนตั้งแต่ตรวจครั้งก่อน" : m.status === "partial" ? "ตรวจแบบเร็วบอกไม่ได้ว่าไฟล์ครบ" : m.status === "unchecked" ? "ยังไม่เคยตรวจไฟล์นี้" : "ถึงเวลาตรวจซ้ำ";
    return (
      <>
        {/* กดการ์ดแล้วไปหน้าตรวจไฟล์พร้อมเลือกเรื่องนี้ (พี่กันสั่ง 9 พ.ย. 2569 "ใส่การ์ด ที่กดเเล้วไปหน้าตรวจเลย") */}
        <button type="button" className="stat warn statgo" title="ไปหน้าตรวจไฟล์" data-statgo onClick={() => onCheck({ ids: [m.id] })}><CardIcon kind="warn" /><div><b>{title}</b></div><IbNext size={15} /></button>
        <div className="minirow half" style={{ marginTop: -4 }}>
          <button type="button" className="btn btn-ok" onClick={() => onCheck({ ids: [m.id], mode: "quick" })}><IcCheck size={15} />ตรวจแบบเร็ว</button>
          <button type="button" className="btn btn-ghost" onClick={() => onCheck({ ids: [m.id], mode: "full" })}><IcCheck size={15} />ตรวจละเอียด</button>
        </div>
      </>
    );
  }
  return (
    <div className="stat ok"><CardIcon kind="ok" /><div><b>ไฟล์สมบูรณ์</b>
      {m.check ? <>{m.check.mode === "full" ? "ตรวจละเอียด" : "ตรวจแบบเร็ว"}เมื่อ <span className="nw">{fmtDateTime(m.check.at)}</span><br /></> : null}
      {m.check?.mode === "full" ? "ไม่พบภาพหรือเสียงเสีย" : "โครงไฟล์ครบ ค่า hash ตรงกับที่จดไว้"}
    </div></div>
  );
}
const PlayIcon = () => <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M7 4.5v15l12-7.5z" /></svg>;