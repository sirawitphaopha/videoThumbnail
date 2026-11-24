/* การ์ดเก็บรูปที่จับคู่ เสียงและซับ และตรวจไฟล์
   แยกจาก SettingsPage.tsx ตอนจัดโครงไฟล์ตามความหมาย (BUGS ข้อ 155 ขั้น 8) เนื้อโค้ดยกมาทั้งก้อน */
import { type Settings } from "../../lib/api";
import { kb } from "../../lib/popup";
import Dropdown from "../../components/Dropdown";
import InfoTip from "../../components/InfoTip";
import { IcCheck, IcExpand } from "../../components/icons";
import { CardIcon, Keep, Phr, Seg, Switch } from "../../components/ui";
import { fmtSize } from "../../lib/format";
import { DEFAULT_PATTERN } from "../../lib/extractName";
import { driveName, freePct } from "../../lib/drives";
import { TRACK_PANEL_DEFAULT, setTrackPanel } from "../../lib/trackPanel";
import ImageViewer from "../../components/ImageViewer";
import { LINK_MODES, TP_OPTS } from "./data";
import { PATTERN_TIP, PatternRow, SUB_PLAYER_TIP } from "./rows";
import type { SetOpen } from "./setCtx";

export default function SetCardsLinkAv({ pg }: { pg: SetOpen }) {
  const { appLow, migrateCount, migrateProg, migrating, mpvOk, sec, set, setAskMigrate, setTpBig, stores, toggleStore, tpBig, trackPanel } = pg;
  const settings = pg.settings!;
  return (
    <>
      {/* ---------- เก็บรูปที่จับคู่ไว้ที่ไหน 3 แบบ ---------- */}
      <div className="setcard" data-setcard="link" hidden={sec !== "link"}><h3>เก็บรูปที่จับคู่ไว้ที่ไหน</h3>
        <div className="small" style={{ marginBottom: 10 }}><Phr>ใช้ตอนกดยืนยันในหน้าจับคู่ปก ติ๊กได้หลายแบบพร้อมกัน และทุกแบบไม่แตะไฟล์หนัง โปรแกรมจำที่อยู่รูปต้นฉบับไว้เสมอ ถ้าติ๊กจับคู่อย่างเดียวคู่กับแบบอื่น ก็จะคัดลอกตามแบบนั้นด้วย</Phr></div>
        <div className="modes three" role="group" aria-label="เก็บรูปที่จับคู่ไว้ที่ไหน">
          {LINK_MODES.map((x) => {
            const on = stores.includes(x.v);
            return (
              <div key={x.v} className={"mode" + (on ? " on" : "")} {...kb(() => toggleStore(x.v))} role="checkbox" aria-checked={on} data-link-mode={x.v}>
                <h4><span className={"cbx " + (on ? "on" : "off")}>{on && <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="4" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5" /></svg>}</span>{x.title}{x.rec && <span className="extag" style={{ marginLeft: 2 }}>{x.rec}</span>}</h4>
                <div className="small"><Phr>{x.lines[0]}</Phr></div>
                {x.sample && <div className="pathsample">{x.sample.map((l) => <div key={l}>{l}</div>)}</div>}
                {x.lines[1] && <div className="small"><Phr>{x.lines[1]}</Phr></div>}
                {/* ติ๊กเก็บสำเนาไว้ในโปรแกรม แล้วไดรฟ์ของโปรแกรมเหลือไม่ถึง 10% เตือนในการ์ดนี้ (BUGS ข้อ 88 ④ พี่กันสั่ง "ถ้าเก็บไว้ในโปรแกรม เเล้วเนื้อที่ต่ำกว่า10% ต้องเตือนตรงนี้ด้วย") */}
                {x.v === "app" && on && appLow && <div className="stat warn" style={{ marginTop: 8 }} data-link-app-low><CardIcon kind="warn" /><div>
                  <b>{driveName(appLow.root)} เหลือที่ว่าง <span className="nw">{fmtSize(appLow.free)}</span> หรือ <span className="nw">{freePct(appLow)}</span></b>
                  <Phr>สำเนาปกที่เก็บในโปรแกรมอยู่บนไดรฟ์นี้ ถ้าไดรฟ์เต็มจะยืนยันปกไม่ได้ ให้ย้ายไฟล์ที่ไม่ใช้ออกก่อน หรือเลือกคัดลอกไปไว้ข้างไฟล์หนังแทน</Phr></div></div>}
              </div>
            );
          })}
        </div>
        <div className="small" style={{ marginTop: 10 }}><Phr>ย้ายหรือเปลี่ยนชื่อไฟล์หนังผ่านชั้นหนัง ปกจะตามไปด้วย ถ้าย้ายด้วย Explorer ในไดรฟ์เดียวกัน โปรแกรมยังตามเจอ แต่ย้ายข้ามไดรฟ์ต้องจับคู่ใหม่ และการเปลี่ยนแบบทีหลังมีผลเฉพาะเรื่องที่จับคู่ใหม่</Phr></div>
        {migrateCount > 0 && (
          <div className="minirow" style={{ marginTop: 10 }} data-link-migrate>
            <span className="small" style={{ alignSelf: "center" }}>มี <span className="nw">{migrateCount} เรื่อง</span>ที่จับคู่ไว้แบบอื่น</span>
            <button type="button" className={"btn btn-sm " + (migrating ? "btn-wait" : "btn-ghost")} aria-disabled={migrating || undefined} data-link-migrate-go onClick={() => { if (!migrating) setAskMigrate(true); }}><Keep all={["กำลังย้าย 000 จาก 000 เรื่อง…", "ย้ายมาแบบนี้ทีเดียว"]}>{migrating ? (migrateProg ? `กำลังย้าย ${migrateProg.done} จาก ${migrateProg.total} เรื่อง…` : "กำลังย้าย…") : "ย้ายมาแบบนี้ทีเดียว"}</Keep></button>
          </div>
        )}
      </div>

      {/* ---------- เสียงและซับ ----------
          ส่วนตั้งค่าแทร็กขึ้นแบบไหน (BUGS ข้อ 33 พี่กันเลือกแบบ 2 กางใต้แถวที่กด 12 พ.ย. 2569 "ชอบแบบ2 แต่ 1 3 เอาไว้ เอาไปใส่ในตั้งค่าละกัน เผื่ออยากเปลี่ยน") */}
      <div className="setcard" data-setcard="av" hidden={sec !== "av"}><h3>เสียงและซับ</h3>
        {/* การ์ดมีรูปตัวอย่างจากหน้าจริง ความละเอียดสองเท่า กดปุ่มมุมรูปขยายดูเต็มจอ (พี่กันสั่ง 12 พ.ย. 2569 "หน้าตั่งค่า ใส่รูปไว้หน่อยนะ แบบความละเอียดสูง ตอนจะเลือกแบบ 1 3 จะได้เห็นภาพ") */}
        <div className="setrow" data-track-panel-set style={{ display: "block" }}><div className="lbl">ส่วนตั้งค่าแทร็กขึ้นแบบ
          <span className="small"><Phr>{"กดแถวเสียงหรือซับในตารางแทร็กแล้ว ส่วนตั้งค่าแทร็กขึ้นตามแบบที่เลือก  กดการ์ดเพื่อเลือก หรือกดปุ่มมุมรูปเพื่อขยายดูเต็มจอ"}</Phr></span></div>
          <div className="tpcards" role="radiogroup" aria-label="ส่วนตั้งค่าแทร็กขึ้นแบบ">
            {TP_OPTS.map((o) => { const on = trackPanel === o.value; return (
              <div key={o.value} className={"tpcard" + (on ? " on" : "")} {...kb(() => setTrackPanel(o.value))} role="radio" aria-checked={on} data-track-panel={o.value}>
                <span className="tpimg"><img src={o.img} alt={`ตัวอย่างแบบ${o.name}`} draggable={false} />
                  <button type="button" className="bigbtn tpbig" title="ขยายดูเต็มจอ" aria-label={`ขยายดูรูปแบบ${o.name}เต็มจอ`} data-tp-big={o.value} onKeyDown={(e) => e.stopPropagation()}
                    onClick={(e) => { e.stopPropagation(); setTpBig({ src: o.img, rect: (e.currentTarget.parentElement ?? e.currentTarget).getBoundingClientRect(), name: `ส่วนตั้งค่าแทร็กแบบ${o.name}` }); }}><IcExpand size={14} /></button></span>
                <span className="tpname"><span className={"radio" + (on ? " on" : "")} aria-hidden="true" />{o.name}{o.value === TRACK_PANEL_DEFAULT && <span className="tptag">ค่าตั้งต้น</span>}</span>
                <span className="small"><Phr>{o.desc}</Phr></span>
              </div>); })}
          </div></div>
        {tpBig && <ImageViewer src={tpBig.src} thumb={tpBig.src} originRect={tpBig.rect} info={{ name: tpBig.name }} onClose={() => setTpBig(null)} />}
        {/* BUGS ข้อ 111 พี่กันสั่ง 14 พ.ย. 2569 "ทำตอนนี้เลย เเต่ระบบเล่นของ aegi ที่ทำมาไม่ลบ เเต่เอาไว้เปิดตอนตั้งค่าได้" · ค่าตั้งต้น mpv (แคลร์ตั้ง) */}
        <div className="setrow" data-subplayer-set><div className="lbl"><span>ตัวเล่นหนังในหน้าแก้ซับ <InfoTip title="ตัวเล่นหนังสองแบบ" tip={SUB_PLAYER_TIP} /></span>
          <span className="small"><Phr>{mpvOk === false ? "ไม่พบไฟล์ libmpv-2.dll ในโฟลเดอร์เครื่องมือ โปรแกรมจึงเล่นแบบ Aegisub แทน" : "กดปุ่มเล่นใต้ภาพหนังหรือกด Ctrl+P แล้วโปรแกรมเล่นด้วยตัวที่เลือก"}</Phr></span></div>
          <Seg label="ตัวเล่นหนังในหน้าแก้ซับ" value={settings.subPlayer === "aegisub" ? "aegisub" : "mpv"} onChange={(v) => set({ subPlayer: v })} options={[{ value: "mpv", label: "mpv" }, { value: "aegisub", label: "แบบ Aegisub" }]} /></div>
        {/* รูปแบบชื่อไฟล์ที่แยก แบบ gMKVExtractGUI (BUGS ข้อ 130 พี่กันสั่ง "เอาเข้าคิว") · ค่าตั้งต้นได้ชื่อแบบเดิม (แคลร์ตั้ง) */}
        <div className="setrow" data-extract-pattern-set style={{ display: "block" }}><div className="lbl"><span>รูปแบบชื่อไฟล์ที่แยก <InfoTip title="รูปแบบชื่อไฟล์ที่แยก" tip={PATTERN_TIP} /></span>
          <span className="small"><Phr>ใช้ตั้งชื่อไฟล์แทร็กภาพ เสียง และซับ ตอนแยกออกจากหนังในหน้าเสียงและซับ</Phr></span></div>
          <PatternRow value={settings.extractPattern || DEFAULT_PATTERN} onChange={(v) => set({ extractPattern: v })} /></div>
      </div>

      {/* ---------- ตรวจไฟล์ ---------- */}
      <div className="setcard" data-setcard="check" hidden={sec !== "check"}><h3>ตรวจไฟล์</h3>
        <div className="setrow" data-seg260><div className="lbl">แบบตรวจตั้งต้น</div>
          <Seg label="แบบตรวจตั้งต้น" value={settings.defaultCheck} onChange={(v) => set({ defaultCheck: v })} options={[{ value: "quick", label: <><IcCheck size={14} />ตรวจแบบเร็ว</> }, { value: "full", label: <><IcCheck size={14} />ตรวจละเอียด</> }]} /></div>
        <div className="setrow"><div className="lbl">ตรวจแบบเร็วทุกเรื่องตอนเปิดโปรแกรม<span className="small"><Phr>ช่วยจับไฟล์ที่เสียระหว่างย้ายไดรฟ์</Phr></span></div>
          <Switch on={settings.quickCheckOnStart} onChange={(v) => set({ quickCheckOnStart: v })} label="ตรวจแบบเร็วทุกเรื่องตอนเปิดโปรแกรม" /></div>
        <div className="setrow"><div className="lbl">เตือนให้ตรวจซ้ำ<span className="small"><Phr>จุดบนปกเปลี่ยนเป็นสีเหลืองเมื่อถึงเวลา</Phr></span></div>
          <span data-recheck data-seg260><Dropdown label="เตือนให้ตรวจซ้ำ" value={String(settings.recheckReminderDays)} onChange={(v) => set({ recheckReminderDays: Number(v) as Settings["recheckReminderDays"] })}
            options={[{ value: "0", label: "ไม่ต้องเตือน" }, { value: "7", label: "ทุก 7 วัน" }, { value: "30", label: "ทุก 30 วัน" }, { value: "90", label: "ทุก 90 วัน" }]} /></span></div>
        {/* BUGS ข้อ 30 พี่กันเคาะ "ตั้งค่าได้ว่าถามหรือบันทึกข้างไฟล์" · ค่าตั้งต้นถาม (แคลร์ตั้ง) */}
        <div className="setrow" data-hashask><div className="lbl"><span>ถามที่บันทึกไฟล์ .sha256 ทุกครั้ง <InfoTip title="ไฟล์ .sha256 คืออะไร" tip={{ w: "ไฟล์ข้อความเล็ก ๆ ที่จดค่า SHA-256 ของไฟล์หนังไว้ ใช้เทียบภายหลังว่าไฟล์ยังครบทุกไบต์ไหม โปรแกรม 7-Zip และคำสั่ง sha256sum เปิดตรวจได้ บันทึกจากปุ่มในหน้าค่า hash ของหน้าข้อมูลไฟล์" }} /></span>
          <span className="small"><Phr>{"เปิดไว้ โปรแกรมเปิดหน้าต่างให้เลือกที่บันทึกทุกครั้ง ปิดไว้ บันทึกข้างไฟล์หนังทันที"}</Phr></span></div>
          <Switch on={settings.hashSaveAsk !== false} onChange={(v) => set({ hashSaveAsk: v })} label="ถามที่บันทึกไฟล์ .sha256 ทุกครั้ง" /></div>
      </div>

    </>
  );
}
