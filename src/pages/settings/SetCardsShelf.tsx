/* การ์ดโทนสี ชั้นวาง โปรแกรมเล่น เครื่องมือเบื้องหลัง และบันทึกการใช้งาน
   แยกจาก SettingsPage.tsx ตอนจัดโครงไฟล์ตามความหมาย (BUGS ข้อ 155 ขั้น 8) เนื้อโค้ดยกมาทั้งก้อน */
import { logApi } from "../../lib/api";
import { IcCoverL, IcCoverM, IcCoverS, IcTall, IcWide, IcFolder, IcRefresh, IbTick, IcClose, IcPlus } from "../../components/icons";
import { J, Keep, Phr, Seg, Skel, Switch } from "../../components/ui";
import { setSkelPreview } from "../../lib/skelPreview";
import ToneCard from "./ToneCard";
import { DEFAULT_TONE, TONES } from "../../lib/tones";
import { IcPlayBox, TOOL_ROLE, verOf } from "./data";
import { LongNameRow } from "./rows";
import type { SetOpen } from "./setCtx";

export default function SetCardsShelf({ pg }: { pg: SetOpen }) {
  const { addPlayer, checking, icaros, logInfo, players, recheck, removePlayer, sec, set, setIcarosHelp, skel, toast, tools } = pg;
  const settings = pg.settings!;
  return (
    <>
      {/* ---------- ชั้นวาง ---------- */}
      <div className="setcard" data-setcard="tone" hidden={sec !== "tone"}><h3>โทนสี</h3>
        <div className="small" style={{ marginBottom: 12 }}><Phr>กดแล้วเปลี่ยนทั้งโปรแกรมทันทีและโปรแกรมจำไว้ ส่วนรูปโปสเตอร์กับสีกราฟเสียงไม่เปลี่ยนตาม</Phr></div>
        <div className="tncards" role="radiogroup" aria-label="โทนสี">
          {TONES.map((t) => <ToneCard key={t.id} t={t} on={(settings.tone || DEFAULT_TONE) === t.id} onPick={() => void set({ tone: t.id })} />)}
        </div>
      </div>

      <div className="setcard" data-setcard="shelf" hidden={sec !== "shelf"}><h3>ชั้นวาง</h3>
        <div className="setrow" data-seg-cover><div className="lbl">ขนาดปก</div>
          <Seg label="ขนาดปก" value={settings.coverSize} onChange={(v) => set({ coverSize: v })} options={[{ value: "s", label: <><IcCoverS />เล็ก</> }, { value: "m", label: <><IcCoverM />กลาง</> }, { value: "l", label: <><IcCoverL />ใหญ่</> }]} /></div>
        <div className="setrow" data-seg-cover><div className="lbl">ดูปก<span className="small"><Phr>เรื่องที่แนบทั้งปกตั้งและปกนอนจะขึ้นแบบที่เลือก ส่วนเรื่องที่มีแบบเดียวขึ้นแบบนั้น</Phr></span></div>
          <Seg label="ดูปก" value={settings.coverOrient} onChange={(v) => set({ coverOrient: v })} options={[{ value: "tall", label: <><IcTall />ปกตั้ง</> }, { value: "wide", label: <><IcWide />ปกนอน</> }]} /></div>
        <div className="setrow"><div className="lbl">ชื่อไฟล์ใต้ปก</div><Switch on={settings.showNames} onChange={(v) => set({ showNames: v })} label="ชื่อไฟล์ใต้ปก" /></div>
        <LongNameRow />
        <div className="setrow"><div className="lbl">ภาพจากหนังในเรื่องที่ยังไม่มีปก<span className="small"><Phr>{"เปิดแล้วเรื่องที่ยังไม่มีปกจะขึ้นภาพหนึ่งภาพที่สุ่มจากในหนังแทนแถบทะแยง ทั้งบนชั้นวาง ในตาราง และแผงขวา ปิดแล้วกลับเป็นแถบทะแยงตามเดิม ภาพเก็บในโฟลเดอร์ของโปรแกรมโดยไม่เขียนลงไฟล์หนัง และไม่นับ" + J + "เป็นปก ตัวกรองจึงยังนับเรื่องนั้นว่ายังไม่มีปก ปุ่มเดียวกันนี้อยู่ที่ปุ่มการแสดงผลบนชั้นวางด้วย"}</Phr></span></div><Switch on={settings.showFrames} onChange={(v) => set({ showFrames: v })} label="ภาพจากหนังในเรื่องที่ยังไม่มีปก" /></div>
        <div className="setrow"><div className="lbl">จุดสีบอกสภาพไฟล์</div><Switch on={settings.showDots} onChange={(v) => set({ showDots: v })} label="จุดสีบอกสภาพไฟล์" /></div>
        <div className="setrow"><div className="lbl">แสดงโครงจางค้างไว้<span className="small"><Phr>ไว้ดูหน้าตาตอนรออ่านโฟลเดอร์ และกลับเป็นปิดเองเมื่อปิดโปรแกรม</Phr></span></div>
          <span data-skelpreview style={{ display: "inline-flex" }}><Switch on={skel} onChange={setSkelPreview} label="แสดงโครงจางค้างไว้" /></span></div>
      </div>

      {/* ---------- เปิดเล่นหนัง ---------- */}
      {/* พี่กันสั่ง 9 พ.ย. 2569 ค่าตั้งต้นคือ MPC-HC · ดูในเครื่องว่ามีโปรแกรมเล่นตัวไหน · มีปุ่มเปลี่ยนค่าตั้งต้น · มีปุ่มเพิ่มโปรแกรม */}
      <div className="setcard" data-setcard="player" hidden={sec !== "player"}><h3>เปิดเล่นหนัง</h3>
        <div className="hint" style={{ margin: "0 0 10px" }}><Phr>กดปุ่มเปิดเล่นแล้วโปรแกรมจะส่งไฟล์ไปโปรแกรมที่เป็นค่าตั้งต้น ถ้ายังไม่ได้เลือกจะใช้ MPC-HC ถ้าเครื่องไม่มีจะใช้ตัวอื่นที่หาเจอ แล้วจึงใช้โปรแกรมหลักของ Windows</Phr></div>
        {players == null
          ? [0, 1, 2].map((i) => <div key={i} className="folder plrow" aria-busy="true"><Skel w={18} h={18} r={4} /><div className="grow"><Skel w="30%" h={13} /><div style={{ height: 6 }} /><Skel w="70%" h={11} /></div><Skel w={150} h={32} r={9} /></div>)
          : <>
            {players.players.map((p) => (
              <div key={p.path} className="folder plrow" data-player={p.path} data-player-default={p.isDefault || undefined}>
                {p.icon ? <img className="plicon" src={p.icon} alt="" /> : <IcPlayBox />}
                <div className="grow"><b>{p.name}</b><div className="small">{p.path}</div>
                  {!p.exists && <div className="plmiss" data-player-missing>หาไฟล์ไม่เจอ อาจถูกย้ายหรือถอนไปแล้ว</div>}</div>
                {p.isDefault
                  ? <span className="pldef"><IbTick size={14} />ค่าตั้งต้น</span>
                  : <button type="button" className={"btn btn-sm plset " + (p.exists ? "btn-ghost" : "btn-wait")} aria-disabled={!p.exists || undefined} title={p.exists ? undefined : "หาไฟล์ไม่เจอ"} data-player-set onClick={() => { if (p.exists) void set({ playerPath: p.path }); }}>ตั้งเป็นค่าตั้งต้น</button>}
                {p.added
                  ? <button type="button" className="icon-btn" aria-label={"เอา " + p.name + " ออกจากรายการ"} title="เอาออกจากรายการ ไฟล์โปรแกรมไม่ถูกลบ" data-player-remove onClick={() => void removePlayer(p.path, p.isDefault)}><IcClose size={14} /></button>
                  : <span className="plgap" />}
              </div>
            ))}
            <div className="folder plrow" data-player="system" data-player-default={players.systemDefault || undefined}>
              {players.systemIcon ? <img className="plicon" src={players.systemIcon} alt="" /> : <IcPlayBox />}
              <div className="grow"><b>โปรแกรมหลักของ Windows</b><div className="small"><Phr>โปรแกรมที่ Windows ตั้งไว้เปิดไฟล์ชนิดนั้น แต่เปิดตรงนาทีไม่ได้ และส่งเสียงกับซับที่จับคู่ไม่ได้</Phr></div></div>
              {players.systemDefault
                ? <span className="pldef"><IbTick size={14} />ค่าตั้งต้น</span>
                : <button type="button" className="btn btn-ghost btn-sm plset" data-player-set onClick={() => void set({ playerPath: "system" })}>ตั้งเป็นค่าตั้งต้น</button>}
              <span className="plgap" />
            </div>
          </>}
        <div className="minirow" style={{ marginTop: 12 }}><button type="button" className="btn btn-ghost" data-player-add onClick={() => void addPlayer()}><IcPlus size={15} />เพิ่มโปรแกรม</button></div>
      </div>

      {/* ---------- เครื่องมือเบื้องหลัง ---------- */}
      <div className="setcard" data-setcard="tools" hidden={sec !== "tools"}><h3>เครื่องมือเบื้องหลัง</h3>
        {tools == null
          ? [0, 1, 2, 3, 4, 5].map((i) => <div key={i} className="setrow" aria-busy="true"><Skel w="45%" h={12} /><Skel w={90} h={20} r={10} /></div>)
          : tools.map((t) => (
            <div key={t.name} className="setrow" data-tool={t.name}><div className="lbl">{t.name}{t.ok && verOf(t.version) && <span className="setver" data-toolver>รุ่น {verOf(t.version)}</span>}<span className="small">{TOOL_ROLE[t.name] ?? ""}{t.ok ? "" : ` ${t.version}`}</span></div>
              {t.ok ? <span className="toolok">พร้อมใช้งาน</span> : <span className="toolbad">ไม่พร้อม</span>}</div>))}
        <div className="setrow" data-tool="Icaros"><div className="lbl">Icaros<span className="small"><Phr>ให้ Windows โชว์โปสเตอร์เป็นไอคอนไฟล์ ถ้าไม่ลงก็ยังใช้โปรแกรมนี้ได้ครบ</Phr></span></div>
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            {icaros == null ? <Skel w={80} h={20} r={10} /> : icaros ? <span className="toolok">ลงแล้ว</span> : <span className="toolwarn">ยังไม่ได้ลง</span>}
            {icaros === false && <button type="button" className="btn btn-ghost btn-sm" onClick={() => setIcarosHelp(true)} data-icaroshelp>วิธีลง</button>}</div></div>
        <div className="setrow"><div className="lbl small" style={{ margin: 0 }}><Phr>ถ้าซ่อนหรือย้ายเครื่องมือ กดตรวจใหม่เพื่อดูสถานะล่าสุด</Phr></div>
          <button type="button" className={"btn btn-sm " + (checking ? "btn-wait" : "btn-ghost")} aria-disabled={checking || undefined} onClick={() => { if (!checking) void recheck(); }} data-retools><Keep icon={<IcRefresh size={15} />} all={["กำลังตรวจ", "ตรวจเครื่องมือใหม่"]}>{checking ? "กำลังตรวจ" : "ตรวจเครื่องมือใหม่"}</Keep></button></div>
      </div>

      {/* ---------- บันทึกการใช้งาน (พี่กันเสนอ 12 พ.ย. 2569 "ทำ log ของโปรแกรม ว่าเราทำอะไรในโปรแกรมมั่ง เอาไว้ตรวจทาน") · ไฟล์อยู่ในเครื่อง ไม่ส่งออกเน็ต ---------- */}
      <div className="setcard" data-setcard="log" hidden={sec !== "log"}>
        <h3 style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10 }}><span>บันทึกการใช้งาน</span>
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => logApi.openDir().catch((e) => toast({ kind: "bad", title: "เปิดโฟลเดอร์บันทึกไม่ได้", detail: String(e) }))} data-actlog-open><IcFolder size={15} />เปิดโฟลเดอร์บันทึก</button></h3>
        <div className="small" style={{ marginBottom: 6 }}><Phr>{"โปรแกรมจดงานที่เขียน ย้าย หรือลบไฟล์ไว้ในเครื่องนี้ ใช้ย้อนดูว่ากดอะไรไปก่อนเจอปัญหา  บันทึกไม่ถูกส่งออกไปที่ไหน และเก็บไว้ 12 เดือนล่าสุด"}</Phr></div>
        {/* คำอธิบายเป็นตัวเล็กใต้หัวข้อแบบแถวอื่นในหน้าตั้งค่า ไม่ซ่อนใน ⓘ (BUGS ข้อ 95 พี่กันทัก 13 พ.ย. 2569 "ปกติ หน้าตั้งค่า พวกคำอธิบาย มันอยู่ใต้หัวข้อนี่นา") */}
        <div className="setrow" data-actlog-count><div className="lbl">เดือนนี้จดไว้<span className="small" data-actlog-what><Phr>{`จดวันเวลา ชื่องาน และค่าที่ส่งไป ของงานที่เขียน ย้าย หรือลบไฟล์ เช่นใส่โปสเตอร์ รวมไฟล์ แปลงเสียง  รวมทั้งค่า${J}ตั้งที่เปลี่ยนและไฟล์ที่ลงถังขยะ  ส่วน${J}การ${J}เปิดดู การเล่นหนัง และการเลื่อนหน้าไม่จด  บันทึกแยกเดือนละไฟล์ เปิดด้วย Notepad ได้`}</Phr></span></div>
          {logInfo == null ? <Skel w={90} h={20} r={10} /> : logInfo === "bad" ? <span className="toolbad">อ่านบันทึกไม่ได้</span> : <span className="setver" style={{ whiteSpace: "nowrap", flex: "none" }} data-actlog-lines>{logInfo.monthLines.toLocaleString("en-US")} รายการ</span>}</div>
        {/* กดที่อยู่แล้วเปิดโฟลเดอร์ใน Explorer (BUGS ข้อ 96 พี่กันทัก 13 พ.ย. 2569 "กดไปไม่ได้อ่ะ" · เดิมเป็นตัวหนังสือธรรมดา ต้องไปกดปุ่มที่หัวการ์ด) */}
        <div className="setrow"><div className="lbl">ที่เก็บ{logInfo && logInfo !== "bad"
          ? <button type="button" className="pathlink" title="กดเพื่อเปิดโฟลเดอร์นี้" onClick={() => logApi.openDir().catch((e) => toast({ kind: "bad", title: "เปิดโฟลเดอร์บันทึกไม่ได้", detail: String(e) }))} data-actlog-dir>{logInfo.dir}</button>
          : <span className="small" data-actlog-dir>—</span>}</div></div>
      </div>

    </>
  );
}
