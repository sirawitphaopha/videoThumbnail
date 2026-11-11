/* หน้า 4 ตั้งค่า (ต้นแบบบรรทัด 1002–1100 · สเปกข้อ 9 · ขั้น 7)
   ตั้งแล้วมีผลทันที ไม่ต้องกดบันทึก · สวิตช์ชมพู = เปิด · ค่าเก็บในไฟล์ค่าตั้งของโปรแกรมผ่าน set_settings (store.rs เขียนแบบปลอดภัยมีสำรอง)
   ค่าที่นี่คือค่าตั้งต้น ทุกครั้งที่ใส่โปสเตอร์หรือตรวจไฟล์ยังเปลี่ยนเฉพาะครั้งนั้นได้ */
import { useEffect, useRef, useState } from "react";
import { GRAPH_IMG_DEFAULT, api, encodeApi, graphApi, linkApi, pickExe, pickFolder, playerApi, type EncoderInfo, type LatestInfo, type GraphImg, type PlayerList, type Settings, type ToolCheck } from "../lib/api";
import { kb } from "../lib/popup";
import { listen } from "@tauri-apps/api/event";
import { inApp } from "../lib/api";
import { useSettings } from "../lib/settings";
import { useLibrary } from "../lib/library";
import { useToast } from "../components/Toasts";
import Dialog from "../components/Dialog";
import Dropdown from "../components/Dropdown";
import { IcPalette, IcCheck, IcCoverL, IcCoverM, IcCoverS, IcTall, IcWide, IcFolder, IcGraph, IcLink, IcMix, IcPoster, IcSettings, IcShelf } from "../components/icons";
import { Keep, Phr, Range, Seg, Skel, Switch } from "../components/ui";
import { setSkelPreview, useSkelPreview } from "../lib/skelPreview";
import { fmtSize } from "../lib/format";
import "../styles/av.css";
import ToneCard from "../components/ToneCard";
import { DEFAULT_TONE, TONES } from "../lib/tones";
import { IbTrash, IcRefresh } from "../components/icons";
import { IbTick, IcClose, IcPlus, IbTable, IbPlay, IbEye, IbCrop, IcFile } from "../components/icons";

const FolderIcon = () => <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#b0355f" strokeWidth="2" aria-hidden="true"><path d="M3 7a2 2 0 012-2h4l2 2h8a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2z" /></svg>;

const IcHeart = () => <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M12 20s-7.5-4.6-9.2-9.1C1.7 7.8 3.6 5 6.6 5c2.1 0 3.9 1.1 5.4 3 1.5-1.9 3.3-3 5.4-3 3 0 4.9 2.8 3.8 5.9C19.5 15.4 12 20 12 20z" /></svg>;

/* พี่กันสั่ง 9 พ.ย. 2569 "อยากให้เมนูนึงในตั้งค่า นั่นคือเขียนว่าบางหน้าเราเอาไอเดีย เอาซอสโค้ดมาจากเจ้าไหน เขียนขอบคุณเขาหน่อย"
   ข้อความเช็กกับของจริง · ที่อยู่เว็บกดเปิดในเบราว์เซอร์หลัก รายการตายตัวอยู่ฝั่ง Rust โปรแกรมไม่ออกเน็ตเอง */
/* พี่กันบอก 9 พ.ย. 2569 "เราหมายถึง icon โปรแกรมนั้น ๆ ของจริงนะ" · ใช้แบบเวกเตอร์จากคลังเปิดก่อน (SVG Logos กับ Simple Icons CC0 · Wikimedia Commons) ไม่มีค่อยใช้จากเว็บทางการหรือไฟล์โปรแกรม เก็บในโปรแกรม เปิดหน้านี้ไม่ออกเน็ต · ตัวที่หาไม่ได้ใช้ไอคอนกลาง */
const THANK_FILES = import.meta.glob("../assets/thanks/*", { eager: true, query: "?url", import: "default" }) as Record<string, string>;
const THANK_ICON: Record<string, string> = { "Spek": "spek.png", "FFBitrateViewer": "ffbitrateviewer.ico", "Claude": "claude.svg", "TypeScript": "typescript.svg", "Vite": "vite.svg", "ห้องสมุด Rust อื่น ๆ": "rust.svg", "ไอคอนในหน้านี้": "simpleicons.svg", "Bitrate Viewer": "bitrateviewer.ico", "Audacity": "audacity.svg", "Aegisub": "aegisub.svg", "Kodi": "kodi.svg", "Claude Desktop": "claude.svg", "FFmpeg": "ffmpeg.png", "MKVToolNix": "mkvtoolnix.png", "MediaInfo": "mediainfo.svg", "FLAC": "flac.svg", "LAME กับ libmpg123": "lame.ico", "opus-tools": "opus.svg", "WavPack": "wavpack.svg", "Monkey's Audio": "monkeys.ico", "TAK": "tak.png", "libheif กับ libde265": "libheif.png", "Visual C++ Runtime": "microsoft.svg", "Rust": "rust.svg", "Tauri": "tauri.svg", "React": "react.svg", "image (Rust)": "image-rs.png" };
/** MKVToolNix ใช้สองไอคอน พื้นหลังขาว (พี่กันสั่ง 10 พ.ย. 2569 "เอาใส่ทั้งสอง icon แต่ขอพื้นหลังขาว" · ยืนยันว่าเป็นของ MKVToolNix ทั้งคู่) */
const WHITE_ICON = new Set(["MKVToolNix"]);
const THANK_ICON2: Record<string, string> = { "MKVToolNix": "mkvtoolnix-2.png" };
const thankImg2 = (name: string) => { const f = THANK_ICON2[name]; return f ? THANK_FILES["../assets/thanks/" + f] : undefined; };
const thankImg = (name: string) => { const f = THANK_ICON[name]; return f ? THANK_FILES["../assets/thanks/" + f] : undefined; };

const THANKS: { title: string; note: string; rows: { name: string; ver?: string; what: string; tag: string; url: string; icon: React.ReactNode }[] }[] = [
  { title: "ไอเดียและหน้าตา", note: "ดูเป็นแบบแล้วเขียนเอง ไม่ได้ใช้โค้ดของโปรแกรมเหล่านี้", rows: [
    { icon: <IcGraph />, name: "Spek", ver: "0.8.5", what: "หน้าวิเคราะห์ในกราฟเสียง หน้าตากราฟกับการบันทึกเป็นรูป", tag: "ไอเดีย", url: "github.com/alexkay/spek" },
    { icon: <IcGraph />, name: "Bitrate Viewer", ver: "2.3", what: "หน้าบิตเรตวิดีโอ หน้าตา สี วิธีคิด 4 แบบ ซูม เส้นค่าเฉลี่ย", tag: "ไอเดีย", url: "videohelp.com/software/Bitrate-Viewer" },
    { icon: <IcGraph />, name: "FFBitrateViewer", ver: "0.9.7.2", what: "วิธีอ่านบิตเรตด้วย ffprobe ทีละแพ็กเก็ต ในหน้าบิตเรต", tag: "ไอเดีย · MIT", url: "github.com/fifonik/FFBitrateViewer" },
    { icon: <IcMix />, name: "Audacity", ver: "4.0.2", what: "รูปคลื่นแบบ Audacity ในกราฟเสียง", tag: "ไอเดีย", url: "audacityteam.org" },
    { icon: <IbTable />, name: "Aegisub", ver: "3.5.1", what: "ตัวดูซับแบบตารางบรรทัด", tag: "ไอเดีย", url: "aegisub.org" },
    { icon: <IcPoster />, name: "Kodi", ver: "21.3", what: "ชื่อไฟล์รูปลงท้าย -poster กับ -landscape ในหน้าจับคู่ปก", tag: "ไอเดีย", url: "kodi.tv" },
    { icon: <IcSettings />, name: "Claude Desktop", ver: "4.23118.0", what: "รูปแบบเมนูหัวข้อของหน้าตั้งค่า", tag: "ไอเดีย", url: "claude.ai" },
  ] },
  { title: "เครื่องมือที่แนบมาทำงานจริง", note: "ใช้ตามสัญญาอนุญาตของแต่ละตัว ข้อความเต็มอยู่ในโฟลเดอร์ tools\\licenses", rows: [
    { icon: <IbPlay />, name: "FFmpeg", ver: "9.0.2", what: "ถอด แปลง ตรวจไฟล์เสีย อ่านเสียงมาวาดกราฟ และอ่านบิตเรตวิดีโอ · ชุดจาก gyan.dev · ไอคอนจาก Icons8", tag: "GPLv3", url: "ffmpeg.org" },
    { icon: <IcFile />, name: "MKVToolNix", ver: "103.0", what: "ครอบ MKV แนบปก แยกแทร็ก", tag: "GPLv2", url: "mkvtoolnix.download" },
    { icon: <IbEye />, name: "MediaInfo", ver: "26.10", what: "รายละเอียดไฟล์", tag: "BSD-2", url: "mediaarea.net" },
    { icon: <IcMix />, name: "FLAC", ver: "1.5.0", what: "แปลงเสียง FLAC", tag: "GPLv2 · BSD", url: "xiph.org/flac" },
    { icon: <IcMix />, name: "LAME กับ libmpg123", ver: "4.0", what: "แปลงเสียง MP3 · ชุดจาก RareWares", tag: "LGPL", url: "lame.sourceforge.io" },
    { icon: <IcMix />, name: "opus-tools", ver: "0.2 · libopus 1.6.1", what: "แปลงเสียง Opus · ชุดจาก RareWares", tag: "BSD-2", url: "opus-codec.org" },
    { icon: <IcMix />, name: "WavPack", ver: "5.9.0", what: "แปลงเสียง WavPack", tag: "BSD-3", url: "wavpack.com" },
    // qaac เป็น Public Domain · ตัวเข้ารหัส ALAC ข้างในเป็นของ Apple (Apache 2.0) · ไม่แนบ ผู้ใช้วางเอง (อ่าน COPYING ของ qaac 10 พ.ย. 2569)
    { icon: <IcMix />, name: "qaac กับ refalac", ver: "3.07", what: "แปลงเสียง AAC ด้วยตัวของ Apple (ต้องติดตั้ง iTunes เอง) กับ ALAC · แนบมากับโปรแกรม", tag: "Public Domain · ALAC Apache 2.0", url: "github.com/nu774/qaac" },
    { icon: <IcMix />, name: "Monkey's Audio", ver: "13.46", what: "แปลงเสียง APE", tag: "BSD-3", url: "monkeysaudio.com" },
    { icon: <IcMix />, name: "TAK", ver: "2.3.3", what: "แปลงเสียง TAK · แนบไฟล์เดิมทั้งชุด", tag: "ฟรีใช้ส่วนตัว", url: "thbeck.de/Tak" },
    { icon: <IcPoster />, name: "libheif กับ libde265", ver: "1.23.7 · 1.1.3", what: "บันทึกรูปกราฟเป็น HEIC · ชุดจาก conda-forge", tag: "LGPLv3", url: "github.com/strukturag/libheif" },
    { icon: <IcPoster />, name: "x265", ver: "3.5", what: "เข้ารหัสภาพใน HEIC", tag: "GPLv2", url: "bitbucket.org/multicoreware/x265_git" },
    { icon: <IcPoster />, name: "aom · dav1d · libsharpyuv", ver: "3.15.3 · 1.5.4 · 1.6.0", what: "ไฟล์ที่ libheif ต้องใช้", tag: "BSD", url: "aomedia.org · videolan.org · chromium.googlesource.com/webm/libwebp" },
    { icon: <IcSettings />, name: "Visual C++ Runtime", ver: "14.51", what: "ไฟล์ที่ libheif ต้องใช้ · ของ Microsoft", tag: "ข้อตกลง MS", url: "microsoft.com" },
  ] },
  { title: "ใช้สร้างโปรแกรม", note: "ซอร์สโค้ดของห้องสมุดเหล่านี้รวมอยู่ในตัวโปรแกรมตอนสร้าง", rows: [
    { icon: <IcSettings />, name: "Claude", what: "ตัวช่วยเขียนโปรแกรม · Claude Code กับโมเดล Claude Opus 5.5 ของ Anthropic", tag: "Anthropic", url: "claude.com/claude-code" },
    { icon: <IcSettings />, name: "Rust", ver: "1.99.1", what: "ฝั่งหลังบ้านทั้งหมด อ่านไฟล์ เรียกเครื่องมือ เขียนไฟล์ · รุ่นที่ใช้สร้างโปรแกรม", tag: "MIT · Apache-2.0", url: "rust-lang.org" },
    { icon: <IcShelf />, name: "Tauri", ver: "2.12.5", what: "โครงโปรแกรมบน Windows", tag: "MIT · Apache-2.0", url: "tauri.app" },
    { icon: <IbTable />, name: "TypeScript", ver: "7.0.2", what: "ภาษาที่เขียนหน้าจอทั้งหมด", tag: "Apache-2.0", url: "typescriptlang.org" },
    { icon: <IbTable />, name: "Vite", ver: "8.3.6", what: "ตัวสร้างหน้าจอ รวมไฟล์ตอนสร้างโปรแกรม", tag: "MIT", url: "vite.dev" },
    { icon: <IbTable />, name: "React", ver: "19.3.1", what: "หน้าจอทั้งหมด", tag: "MIT", url: "react.dev" },
    { icon: <IbCrop />, name: "image (Rust)", ver: "0.25.10", what: "อ่าน ครอป และเข้ารหัสรูป", tag: "MIT · Apache-2.0", url: "github.com/image-rs/image" },
    { icon: <IcSettings />, name: "ห้องสมุด Rust อื่น ๆ", what: "serde อ่านเขียนข้อมูล · qcms แปลงสีรูป · jpeg-encoder · sha2 md-5 sha1 crc32fast คิดค่า hash · windows-sys", tag: "MIT · Apache-2.0", url: "crates.io" },
    { icon: <b>ก</b>, name: "ฟอนต์ Sarabun", what: "ตัวหนังสือทั้งโปรแกรม · Cadson Demak · ชุดจาก Fontsource", tag: "OFL", url: "fonts.google.com/specimen/Sarabun" },
    { icon: <IcPalette />, name: "ไอคอนในหน้านี้", what: "Simple Icons กับ SVG Logos (CC0) · Icons8 · Wikimedia Commons · ไอคอนจากตัวโปรแกรมของแต่ละโครงการ", tag: "ตามแต่ละรูป", url: "simpleicons.org · icons8.com · commons.wikimedia.org" },
  ] },
];

const IcPlayBox = () => <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><rect x="3" y="4" width="18" height="16" rx="2" /><path d="M10 9l5 3-5 3z" fill="currentColor" /></svg>;

/** เลขรุ่นจากข้อความของเครื่องมือ เช่น mkvmerge v103.0 ('The Darkness') 64-bit ได้ 103.0 */
const verOf = (s: string) => s.match(/\d+(?:\.\d+)+/)?.[0] ?? "";

/* เมนูหัวข้อซ้าย เปิดดูทีละหัวข้อ (พี่กันส่งภาพหน้าการตั้งค่าของโปรแกรม Claude เป็นแบบ 8 พ.ย. 2569) · ชื่อกลุ่มแคลร์ตั้ง */
const SET_GROUPS: { title: string; items: { id: string; label: string; icon: React.ReactNode }[] }[] = [
  { title: "ชั้นหนัง", items: [
    { id: "folders", label: "โฟลเดอร์หนัง", icon: <IcFolder /> },
    { id: "shelf", label: "ชั้นวาง", icon: <IcShelf /> },
    { id: "tone", label: "โทนสี", icon: <IcPalette /> },
    { id: "player", label: "เปิดเล่นหนัง", icon: <IcPlayBox /> },
  ] },
  { title: "งาน", items: [
    { id: "poster", label: "ใส่โปสเตอร์", icon: <IcPoster /> },
    { id: "link", label: "เก็บรูปที่จับคู่", icon: <IcLink /> },
    { id: "check", label: "ตรวจไฟล์", icon: <IcCheck /> },
    { id: "graph", label: "กราฟเสียง", icon: <IcGraph /> },
  ] },
  { title: "เครื่องมือ", items: [
    { id: "tools", label: "เครื่องมือเบื้องหลัง", icon: <IcSettings /> },
    { id: "encoders", label: "ตัวแปลงเสียง", icon: <IcMix /> },
  ] },
  { title: "เกี่ยวกับ", items: [
    { id: "thanks", label: "ขอบคุณ", icon: <IcHeart /> },
  ] },
];
/** จำหัวข้อล่าสุดไว้ ออกไปหน้าอื่นแล้วกลับมายังอยู่หัวข้อเดิม */
let lastSec = "folders";

/** หน้าที่ของเครื่องมือแต่ละตัว (สเปกข้อ 12 หน้าที่ของ ffmpeg = ส่งออก MP4 และตรวจละเอียด) */
const TOOL_ROLE: Record<string, string> = {
  mkvmerge: "ใช้ครอบ MKV และแนบโปสเตอร์",
  mkvextract: "ใช้ดึงปกออกมาโชว์และแยกไฟล์",
  mkvpropedit: "ใช้เปลี่ยนรูปแนบใน MKV",
  ffmpeg: "ใช้ส่งออก MP4 ตรวจละเอียด และกราฟเสียง",
  ffprobe: "ใช้อ่านข้อมูลไฟล์หนัง",
  MediaInfo: "ใช้หน้า MediaInfo",
};

/** เก็บรูปที่จับคู่ไว้ที่ไหน 3 แบบ (พี่กันเคาะข้อ 1 · มอคอัปจับคู่ปกหัวข้อหน้าตั้งค่า) */
const LINK_MODES: { v: Settings["linkStore"]; title: string; rec?: string; lines: string[]; sample?: string[] }[] = [
  { v: "beside", title: "คัดลอกไปไว้ข้างไฟล์หนัง", rec: "ค่าตั้งต้น",
    lines: ["คัดลอกรูปที่ครอปแล้วไปไว้โฟลเดอร์เดียวกับหนัง ชื่อเหมือนไฟล์หนัง · รูปต้นฉบับอยู่ที่เดิม ไม่ถูกแก้ กลับมาครอปใหม่ได้", "ชื่อลงท้ายแบบที่ Kodi อ่านได้ · เปลี่ยนรูปทีหลัง ไฟล์นี้เปลี่ยนตาม · เปลี่ยนชื่อหนังในชั้นหนัง รูปเปลี่ยนชื่อตาม · มีไฟล์ชื่อนี้อยู่แล้วที่โปรแกรมไม่ได้ทำ ไม่เขียนทับ ถามก่อน"],
    sample: ["ดาวเหนือ (2023).mkv", "ดาวเหนือ (2023)-poster.jpg", "ดาวเหนือ (2023)-landscape.jpg"] },
  { v: "app", title: "เก็บสำเนาไว้ในโปรแกรม",
    lines: ["คัดลอกรูปที่ครอปแล้วไปไว้โฟลเดอร์ข้อมูลของโปรแกรม ไม่มีไฟล์เพิ่มในโฟลเดอร์หนัง · ลบหรือย้ายรูปต้นฉบับแล้วปกไม่หาย · มีแต่ชั้นหนังที่เห็น โปรแกรมอื่นไม่เห็น"] },
  { v: "link", title: "จับคู่อย่างเดียว",
    lines: ["ไม่คัดลอก รูปอยู่ชื่อเดิมที่เดิม โปรแกรมจำแค่ที่อยู่รูปแล้วดึงมาแสดง · ไม่ใช้ที่เพิ่มเลย · ย้ายหรือลบรูปต้นฉบับ ชั้นวางขึ้นว่าหารูปไม่เจอ ต้องจับคู่ใหม่"] },
];

/** ผลเช็กรุ่นล่าสุดครั้งล่าสุด จำไว้นอกหน้า (เปลี่ยนหน้าแล้วไม่หาย ไม่ออกเน็ตซ้ำเอง) */
let latestMemo: { at: Date; list: LatestInfo[] } | null = null;

/** บรรทัดรุ่นล่าสุดใต้ตัวแปลงแต่ละตัว */
function LatestLine({ l, onOpen }: { l: LatestInfo; onOpen: (name: string) => void }) {
  const page = <button type="button" className="latlink" onClick={() => onOpen(l.name)} data-latest-page>เปิดหน้าโหลด</button>;
  if (l.state === "ok") return <span className="small" data-latest="ok"><b className="latok">ล่าสุดแล้ว</b> · เว็บ {l.from} รุ่น {l.latest}</span>;
  if (l.state === "new") return <span className="small" data-latest="new"><b className="latnew">มีรุ่นใหม่ {l.latest}</b> · ใช้อยู่ {l.installed} · {page}</span>;
  if (l.state === "ahead") return <span className="small" data-latest="ahead"><b className="latok">ใหม่กว่าหน้าเว็บ</b> · เว็บ {l.from} ยังเป็น {l.latest}</span>;
  if (l.state === "missing") return <span className="small" data-latest="missing">รุ่นล่าสุดบนเว็บ {l.latest} · {page}</span>;
  return <span className="small" data-latest="error"><b className="latbad">เช็กไม่ได้</b> · {l.error}</span>;
}

export default function SettingsPage() {
  const [sec, setSec] = useState(lastSec);
  const goSec = (id: string) => { lastSec = id; setSec(id); document.querySelector("[data-settingsscroll]")?.scrollTo(0, 0); };
  const { settings, update } = useSettings();
  const { folders, scan, movies } = useLibrary();
  const toast = useToast();
  const skel = useSkelPreview();
  const [removing, setRemoving] = useState<string | null>(null);
  const [icarosHelp, setIcarosHelp] = useState(false);
  const [players, setPlayers] = useState<PlayerList | null>(null);
  const [tools, setTools] = useState<ToolCheck[] | null>(null);
  const [icaros, setIcaros] = useState<boolean | null>(null);
  const [checking, setChecking] = useState(false);
  const [cache, setCache] = useState<{ files: number; bytes: number } | null>(null);
  /** ย้ายปกจับคู่เดิมไปเก็บแบบใหม่ทีเดียว (มอคอัป *"เรื่องเดิมกดย้ายให้ทีเดียวได้"*) */
  const [askMigrate, setAskMigrate] = useState(false);
  const [migrating, setMigrating] = useState(false);
  const [migrateProg, setMigrateProg] = useState<{ done: number; total: number } | null>(null);
  useEffect(() => {
    if (!migrating || !inApp) return;
    let off: (() => void) | undefined;
    let live = true;
    listen<{ done: number; total: number }>("link-progress", (e) => setMigrateProg(e.payload)).then((u) => { if (live) off = u; else u(); });
    return () => { live = false; off?.(); setMigrateProg(null); };
  }, [migrating]);
  const migrate = async () => {
    if (migrating || !settings) return;
    setMigrating(true);
    try {
      const r = await linkApi.migrate(settings.linkStore);
      setAskMigrate(false);
      toast({ kind: r.failed ? "warn" : "ok", title: r.failed ? `ย้ายแล้ว ${r.done} เรื่อง · ไม่สำเร็จ ${r.failed} เรื่อง` : `ย้ายแล้ว ${r.done} เรื่อง`, detail: "ไฟล์หนังกับรูปต้นฉบับไม่ถูกแตะ" });
      r.notes.forEach((n) => toast({ kind: "warn", title: "มีเรื่องที่ต้องดู", detail: n }));
    } catch (e) {
      toast({ kind: "bad", title: "ย้ายไม่สำเร็จ", detail: String(e) });
    } finally { setMigrating(false); }
  };
  /** ตัวแปลงเสียง (แผนเสียงและซับ ขั้น 4 · มอคอัปหน้าตั้งค่า การ์ดตัวแปลงเสียง) */
  const [encs, setEncs] = useState<EncoderInfo[] | null>(null);
  const [encDir, setEncDir] = useState("");
  const [encChecking, setEncChecking] = useState(false);
  const recheckEnc = async () => {
    setEncChecking(true);
    try { const [list, dir] = await Promise.all([encodeApi.status(), encodeApi.userDir()]); setEncs(list); setEncDir(dir); }
    catch (e) { toast({ kind: "bad", title: "ตรวจตัวแปลงเสียงไม่ได้", detail: String(e) }); }
    finally { setEncChecking(false); }
  };
  /** รุ่นล่าสุดบนเว็บผู้ทำ (พี่กันสั่ง 8 พ.ย. 2569) · ออกเน็ตเฉพาะตอนกด · ผลจำไว้จนปิดโปรแกรม เปลี่ยนหน้าแล้วกลับมายังเห็น */
  const [latest, setLatest] = useState(latestMemo);
  const [latestChecking, setLatestChecking] = useState(false);
  const checkLatest = async () => {
    setLatestChecking(true);
    // รุ่นทดสอบ ตัวตรวจป้อนผลจำลองผ่าน window.__latestSample ได้ ไว้ถ่ายสถานะที่ของจริงยังไม่เกิด (มีรุ่นใหม่ เช็กไม่ได้) · ตัวจริงไม่มีทางนี้
    const sample = import.meta.env.DEV ? (window as unknown as { __latestSample?: LatestInfo[] }).__latestSample : undefined;
    try { latestMemo = { at: new Date(), list: sample ?? await encodeApi.latest() }; setLatest(latestMemo); }
    catch (e) { toast({ kind: "bad", title: "เช็กรุ่นล่าสุดไม่ได้", detail: String(e) }); }
    finally { setLatestChecking(false); }
  };
  const openPage = (name: string) => encodeApi.openPage(name).catch((e) => toast({ kind: "bad", title: "เปิดหน้าโหลดไม่ได้", detail: String(e) }));
  // คุณภาพ JPG · แถบเลื่อนส่งค่าทุกครั้งที่ขยับ เก็บลงไฟล์ตอนหยุดลาก 0.3 วินาที ไม่เขียนไฟล์ถี่
  const [jpg, setJpg] = useState<number | null>(null);
  const jpgTimer = useRef<number | undefined>(undefined);

  const recheck = async () => {
    setChecking(true);
    try {
      const [t, i] = await Promise.all([api.checkTools(), api.checkIcaros().catch(() => false)]);
      setTools(t); setIcaros(i);
    } catch (e) {
      toast({ kind: "bad", title: "ตรวจเครื่องมือไม่ได้", detail: String(e) });
    } finally { setChecking(false); }
  };
  // โปรแกรมเล่นในเครื่อง หาใหม่ทุกครั้งที่เปิดหัวข้อนี้ เผื่อเพิ่งลงโปรแกรม · หาไม่สำเร็จยังเลือกโปรแกรมหลักของ Windows ได้
  useEffect(() => {
    if (sec !== "player") return;
    playerApi.list().then(setPlayers, () => setPlayers({ players: [], systemDefault: !settings?.playerPath }));
    /* eslint-disable-next-line react-hooks/exhaustive-deps */
  }, [sec, settings?.playerPath, settings?.players]);
  useEffect(() => { void recheckEnc(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, []);
  useEffect(() => { void recheck(); graphApi.cacheInfo().then(setCache, () => setCache(null)); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, []);

  if (!settings) return <div className="setwrap" aria-busy="true">{[0, 1, 2, 3].map((i) => <div key={i} className="setcard"><Skel w="40%" h={14} /><Skel w="90%" h={12} style={{ marginTop: 14 }} /><Skel w="70%" h={12} style={{ marginTop: 10 }} /></div>)}</div>;

  /** เก็บค่า · เก็บไม่ได้ต้องบอก ไม่เงียบ (save-status) */
  const set = async (patch: Partial<Settings>) => {
    if (!(await update(patch))) toast({ kind: "bad", title: "บันทึกค่าตั้งไม่ได้", detail: "ค่าที่เพิ่งเปลี่ยนยังไม่ได้เก็บลงเครื่อง ลองใหม่อีกครั้ง" });
  };
  const addFolder = async () => {
    const f = await pickFolder("เลือกโฟลเดอร์หนัง");
    if (!f) return;
    if (settings.folders.some((x) => x.toLowerCase() === f.toLowerCase())) { toast({ kind: "info", title: "โฟลเดอร์นี้อยู่บนชั้นแล้ว", detail: f }); return; }
    await set({ folders: [...settings.folders, f] });
    scan();
    toast({ kind: "ok", title: "เพิ่มโฟลเดอร์แล้ว กำลังอ่านขึ้นชั้น", detail: f });
  };
  const removeFolder = async (f: string) => {
    setRemoving(null);
    await set({ folders: settings.folders.filter((x) => x !== f) });
    scan();
    toast({ kind: "ok", title: "เอาออกจากชั้นแล้ว", detail: `${f} · ไฟล์ในเครื่องยังอยู่ครบ ไม่ถูกลบ` });
  };
  const changeOriginals = async () => {
    const f = await pickFolder("เลือกโฟลเดอร์เก็บไฟล์เดิม");
    if (f) await set({ originalsFolder: f });
  };
  const addPlayer = async () => {
    const f = await pickExe();
    if (!f) return;
    const list = settings.players ?? [];
    if (!list.some((x) => x.toLowerCase() === f.toLowerCase())) await set({ players: [...list, f] });
  };
  const removePlayer = (path: string, wasDefault: boolean) =>
    set({ players: (settings.players ?? []).filter((x) => x.toLowerCase() !== path.toLowerCase()), ...(wasDefault ? { playerPath: "" } : {}) });
  const jpgNow = jpg ?? settings.jpgQuality;
  const onJpg = (v: number) => {
    setJpg(v);
    window.clearTimeout(jpgTimer.current);
    jpgTimer.current = window.setTimeout(() => { void set({ jpgQuality: v }); }, 300);
  };
  const clearCache = async () => {
    try { setCache(await graphApi.cacheClear()); toast({ kind: "ok", title: "ล้างผลอ่านคลื่นที่เก็บไว้แล้ว", detail: "เปิดกราฟเสียงครั้งหน้าจะอ่านไฟล์ใหม่ · ไฟล์หนังไม่ถูกแตะ" }); }
    catch (e) { toast({ kind: "bad", title: "ล้างไม่ได้", detail: String(e) }); }
  };
  const countOf = (f: string) => folders.find((x) => x.path.toLowerCase() === f.toLowerCase());
  /** ติ๊กได้หลายแบบพร้อมกัน ต้องเหลืออย่างน้อยหนึ่งแบบ (พี่กันสั่ง 8 พ.ย. 2569 "สามารถเลือกได้ทุกแบบพร้อมกัน") */
  const stores = settings.linkStores?.length ? settings.linkStores : [settings.linkStore];
  const wantCopy = stores.includes("beside") && stores.includes("app");
  const toggleStore = (v: Settings["linkStore"]) => {
    const on = stores.includes(v);
    if (on && stores.length === 1) { toast({ kind: "info", title: "ต้องเลือกอย่างน้อยหนึ่งแบบ", detail: "ติ๊กแบบอื่นก่อน แล้วค่อยเอาแบบนี้ออก" }); return; }
    const next = (["beside", "app", "link"] as const).filter((x) => (x === v ? !on : stores.includes(x)));
    void set({ linkStores: next, linkStore: next[0] });
  };
  const migrateCount = movies.filter((m) => (m.linked ?? []).some((c) => c.store !== settings.linkStore || !!c.appCopy !== wantCopy)).length;
  const modeName = LINK_MODES.filter((x) => stores.includes(x.v)).map((x) => x.title).join(" กับ ");

  return (
    <div className="setpage">
      <nav className="setnav" aria-label="หัวข้อตั้งค่า"><div className="setnav-in">
        {SET_GROUPS.map((g) => (
          <div key={g.title} className="setnav-g">
            <div className="setnav-t">{g.title}</div>
            {g.items.map((it) => (
              <button key={it.id} type="button" className={"setnav-b" + (sec === it.id ? " on" : "")} aria-current={sec === it.id ? "true" : undefined} data-setnav={it.id} onClick={() => goSec(it.id)}>{it.icon}<span>{it.label}</span></button>
            ))}
          </div>
        ))}
      </div></nav>
    <div className="setwrap" data-settings>
      <Dialog open={askMigrate} onClose={() => { if (!migrating) setAskMigrate(false); }} kind="work" confirm title={<>ย้าย <span className="nw">{migrateCount} เรื่อง</span>ไปแบบ {modeName}</>}
        actions={<>
          <button type="button" className="btn btn-ghost" onClick={() => { if (!migrating) setAskMigrate(false); }}>ยังไม่ย้าย</button>
          <button type="button" className={"btn " + (migrating ? "btn-wait" : "btn-main")} aria-disabled={migrating || undefined} data-link-migrate-ok onClick={migrate}><Keep all={["กำลังย้าย 000 จาก 000 เรื่อง…", "ย้ายเลย"]}>{migrating ? (migrateProg ? `กำลังย้าย ${migrateProg.done} จาก ${migrateProg.total} เรื่อง…` : "กำลังย้าย…") : "ย้ายเลย"}</Keep></button>
        </>}>
        <div className="small" style={{ fontSize: 14, color: "var(--txt2)" }}>
          <div>ทำไฟล์ใหม่ก่อน สำเร็จแล้วค่อยเอาของเก่าออก</div>
          <div>ของเก่าที่โปรแกรมคัดลอกไว้ย้ายลงถังขยะ · ไฟล์ที่โปรแกรมไม่ได้ทำไม่ถูกลบ</div>
          <div>เรื่องที่รูปต้นฉบับหายแล้ว ย้ายเป็นจับคู่อย่างเดียวไม่ได้ คงแบบเดิมแล้วบอกให้รู้</div>
          <div>ไฟล์หนังกับรูปต้นฉบับไม่ถูกแตะ</div>
        </div>
      </Dialog>
      {/* ---------- โฟลเดอร์หนัง ---------- */}
      <div className="setcard" data-setcard="folders" hidden={sec !== "folders"}><h3>โฟลเดอร์หนัง</h3>
        <div className="small">โปรแกรมอ่านหนังจากโฟลเดอร์ในรายการนี้ขึ้นชั้น</div>
        {settings.folders.map((f) => {
          const st = countOf(f);
          return (
            <div key={f} className="folder" data-folder={f}><FolderIcon /><div className="grow" style={{ wordBreak: "break-all" }}>{f}
              <span className="small" style={{ display: "block" }}>{st && !st.ok ? <span style={{ color: "var(--bad-ink)" }}>หาโฟลเดอร์ไม่เจอ ไดรฟ์อาจถอดออกอยู่</span> : <span className="nw">{st?.count ?? 0} เรื่อง</span>}</span></div>
              <button type="button" className="btn btn-bad btn-sm" onClick={() => setRemoving(f)} data-removefolder><IbTrash size={15} />เอาออกจากชั้น</button></div>
          );
        })}
        <div className="small" style={{ margin: "8px 0 10px" }}>เอาออกจากชั้นแล้ว ไฟล์ในเครื่องยังอยู่ครบ ไม่ถูกลบ</div>
        <button type="button" className="btn btn-ghost btn-sm" onClick={addFolder} data-addfolder><IcFolder size={15} />เพิ่มโฟลเดอร์</button>
        <div className="setrow" style={{ marginTop: 10, borderTop: "1px solid var(--line)" }}><div className="lbl">อ่านโฟลเดอร์ใหม่ทุกครั้งที่เปิดโปรแกรม<span className="small">หนังที่โหลดมาเพิ่มจะขึ้นชั้นเอง</span></div>
          <Switch on={settings.rescanOnStart} onChange={(v) => set({ rescanOnStart: v })} label="อ่านโฟลเดอร์ใหม่ทุกครั้งที่เปิดโปรแกรม" /></div>
      </div>

      {/* ---------- ใส่โปสเตอร์ ---------- */}
      <div className="setcard" data-setcard="poster" hidden={sec !== "poster"}><h3>ใส่โปสเตอร์</h3>
        <div className="setrow"><div className="lbl">ตรวจไฟล์ต้นทางก่อนครอบ<span className="small">ไฟล์เสียอยู่แล้ว จะบอกก่อนลงมือ</span></div>
          <Switch on={settings.checkSourceBefore} onChange={(v) => set({ checkSourceBefore: v })} label="ตรวจไฟล์ต้นทางก่อนครอบ" /></div>
        <div className="setrow"><div className="lbl">ตรวจไฟล์ใหม่หลังครอบเสร็จ<span className="small">เทียบว่าภาพ เสียง ซับ ครบเท่าต้นทาง</span></div>
          <Switch on={settings.checkOutputAfter} onChange={(v) => set({ checkOutputAfter: v })} label="ตรวจไฟล์ใหม่หลังครอบเสร็จ" /></div>
        <div className="setrow" data-seg165><div className="lbl">ไฟล์ที่ได้</div>
          <Seg label="ไฟล์ที่ได้" value={settings.outputFormat} onChange={(v) => set({ outputFormat: v })} options={[{ value: "mkv", label: "MKV" }, { value: "mp4", label: "MP4" }]} /></div>
        <div className="setrow"><div className="lbl">ไฟล์เดิมหลังครอบ</div>
          <Seg label="ไฟล์เดิมหลังครอบ" value={settings.originalAfter} onChange={(v) => set({ originalAfter: v })} options={[{ value: "keep", label: <><IbTick size={14} />เก็บไว้</> }, { value: "trash", label: <><IbTrash size={14} />ลบเมื่อตรวจผ่าน</> }]} /></div>
        <div className="setrow"><div className="lbl">โฟลเดอร์เก็บไฟล์เดิม
          <span className="small" style={{ wordBreak: "break-all" }} data-originals>{settings.originalsFolder || "ข้างไฟล์หนัง ในโฟลเดอร์ชื่อ ไฟล์เดิม"}</span>
          <span className="small">ต้องอยู่ไดรฟ์เดียวกับไฟล์หนัง คนละไดรฟ์ใช้โฟลเดอร์ ไฟล์เดิม ข้างไฟล์หนังแทน</span></div>
          <div style={{ display: "flex", gap: 6 }}>
            {settings.originalsFolder && <button type="button" className="btn btn-ghost btn-sm" onClick={() => set({ originalsFolder: "" })}>ใช้ข้างไฟล์หนัง</button>}
            <button type="button" className="btn btn-ghost btn-sm" onClick={changeOriginals} data-orig-change><IcFolder size={15} />เปลี่ยน</button></div></div>
        <div className="setrow" data-seg165><div className="lbl">รูปโปสเตอร์ที่แนบ<span className="small">ใช้กับรูปที่ต้องแปลง และรูปที่ครอป</span></div>
          <Seg label="รูปโปสเตอร์ที่แนบ" value={settings.posterFormat} onChange={(v) => set({ posterFormat: v })} options={[{ value: "jpg", label: "JPG" }, { value: "png", label: "PNG" }]} /></div>
        <div className="setrow" style={{ display: "block" }}><div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <span style={{ fontSize: 14, whiteSpace: "nowrap" }}>คุณภาพ JPG</span>
          <Range value={jpgNow} min={50} max={100} onChange={onJpg} label="คุณภาพ JPG" format={(v) => `${v}%`} />
          <span className="small" style={{ whiteSpace: "nowrap", minWidth: 36, textAlign: "right" }} data-jpgq>{jpgNow}%</span></div></div>
        <div className="setrow"><div className="lbl">ย่อรูปโปสเตอร์ที่ใหญ่เกิน<span className="small">ย่อเหลือ <span className="nw">1000 × 1500 px</span> ไฟล์หนังไม่บวม</span></div>
          <Switch on={settings.shrinkLargePosters} onChange={(v) => set({ shrinkLargePosters: v })} label="ย่อรูปโปสเตอร์ที่ใหญ่เกิน" /></div>
      </div>

      {/* ---------- เก็บรูปที่จับคู่ไว้ที่ไหน 3 แบบ ---------- */}
      <div className="setcard" data-setcard="link" hidden={sec !== "link"}><h3>เก็บรูปที่จับคู่ไว้ที่ไหน</h3>
        <div className="small" style={{ marginBottom: 10 }}>ใช้ตอนกดยืนยันในหน้าจับคู่ปก · ติ๊กได้หลายแบบพร้อมกัน · ทุกแบบ ไฟล์หนังไม่ถูกแตะ · โปรแกรมจำที่อยู่รูปต้นฉบับไว้เสมอ ติ๊กจับคู่อย่างเดียวคู่กับแบบอื่น ก็คัดลอกตามแบบนั้น</div>
        <div className="modes three" role="group" aria-label="เก็บรูปที่จับคู่ไว้ที่ไหน">
          {LINK_MODES.map((x) => {
            const on = stores.includes(x.v);
            return (
              <div key={x.v} className={"mode" + (on ? " on" : "")} {...kb(() => toggleStore(x.v))} role="checkbox" aria-checked={on} data-link-mode={x.v}>
                <h4><span className={"cbx " + (on ? "on" : "off")}>{on && <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="4" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5" /></svg>}</span>{x.title}{x.rec && <span className="extag" style={{ marginLeft: 2 }}>{x.rec}</span>}</h4>
                <div className="small"><Phr>{x.lines[0]}</Phr></div>
                {x.sample && <div className="pathsample">{x.sample.map((l) => <div key={l}>{l}</div>)}</div>}
                {x.lines[1] && <div className="small"><Phr>{x.lines[1]}</Phr></div>}
              </div>
            );
          })}
        </div>
        <div className="small" style={{ marginTop: 10 }}>ย้ายหรือเปลี่ยนชื่อไฟล์หนังผ่านชั้นหนัง ปกตามไป · ย้ายด้วย Explorer ในไดรฟ์เดียวกัน โปรแกรมยังตามเจอ ย้ายข้ามไดรฟ์ต้องจับคู่ใหม่ · เปลี่ยนแบบทีหลัง มีผลกับเรื่องที่จับคู่ใหม่</div>
        {migrateCount > 0 && (
          <div className="minirow" style={{ marginTop: 10 }} data-link-migrate>
            <span className="small" style={{ alignSelf: "center" }}>มี <span className="nw">{migrateCount} เรื่อง</span>ที่จับคู่ไว้แบบอื่น</span>
            <button type="button" className={"btn btn-sm " + (migrating ? "btn-wait" : "btn-ghost")} aria-disabled={migrating || undefined} data-link-migrate-go onClick={() => { if (!migrating) setAskMigrate(true); }}><Keep all={["กำลังย้าย 000 จาก 000 เรื่อง…", "ย้ายมาแบบนี้ทีเดียว"]}>{migrating ? (migrateProg ? `กำลังย้าย ${migrateProg.done} จาก ${migrateProg.total} เรื่อง…` : "กำลังย้าย…") : "ย้ายมาแบบนี้ทีเดียว"}</Keep></button>
          </div>
        )}
      </div>

      {/* ---------- ตรวจไฟล์ ---------- */}
      <div className="setcard" data-setcard="check" hidden={sec !== "check"}><h3>ตรวจไฟล์</h3>
        <div className="setrow"><div className="lbl">แบบตรวจตั้งต้น</div>
          <Seg label="แบบตรวจตั้งต้น" value={settings.defaultCheck} onChange={(v) => set({ defaultCheck: v })} options={[{ value: "quick", label: <><IcCheck size={14} />ตรวจแบบเร็ว</> }, { value: "full", label: <><IcCheck size={14} />ตรวจละเอียด</> }]} /></div>
        <div className="setrow"><div className="lbl">ตรวจแบบเร็วทุกเรื่องตอนเปิดโปรแกรม<span className="small">ช่วยจับไฟล์ที่เสียระหว่างย้ายไดรฟ์</span></div>
          <Switch on={settings.quickCheckOnStart} onChange={(v) => set({ quickCheckOnStart: v })} label="ตรวจแบบเร็วทุกเรื่องตอนเปิดโปรแกรม" /></div>
        <div className="setrow"><div className="lbl">เตือนให้ตรวจซ้ำ<span className="small">จุดบนปกเปลี่ยนเป็นสีเหลืองเมื่อถึงเวลา</span></div>
          <span data-recheck><Dropdown label="เตือนให้ตรวจซ้ำ" value={String(settings.recheckReminderDays)} onChange={(v) => set({ recheckReminderDays: Number(v) as Settings["recheckReminderDays"] })}
            options={[{ value: "0", label: "ไม่ต้องเตือน" }, { value: "7", label: "ทุก 7 วัน" }, { value: "30", label: "ทุก 30 วัน" }, { value: "90", label: "ทุก 90 วัน" }]} /></span></div>
      </div>

      {/* ---------- ชั้นวาง ---------- */}
      <div className="setcard" data-setcard="tone" hidden={sec !== "tone"}><h3>โทนสี</h3>
        <div className="small" style={{ marginBottom: 12 }}>กดแล้วเปลี่ยนทั้งโปรแกรมทันที โปรแกรมจำไว้ · รูปโปสเตอร์กับสีกราฟเสียงไม่เปลี่ยนตาม</div>
        <div className="tncards" role="radiogroup" aria-label="โทนสี">
          {TONES.map((t) => <ToneCard key={t.id} t={t} on={(settings.tone || DEFAULT_TONE) === t.id} onPick={() => void set({ tone: t.id })} />)}
        </div>
      </div>

      <div className="setcard" data-setcard="shelf" hidden={sec !== "shelf"}><h3>ชั้นวาง</h3>
        <div className="setrow" data-seg-cover><div className="lbl">ขนาดปก</div>
          <Seg label="ขนาดปก" value={settings.coverSize} onChange={(v) => set({ coverSize: v })} options={[{ value: "s", label: <><IcCoverS />เล็ก</> }, { value: "m", label: <><IcCoverM />กลาง</> }, { value: "l", label: <><IcCoverL />ใหญ่</> }]} /></div>
        <div className="setrow" data-seg-cover><div className="lbl">ดูปก<span className="small">เรื่องที่แนบทั้งปกตั้งและปกนอน · เรื่องที่มีแบบเดียวขึ้นแบบนั้น</span></div>
          <Seg label="ดูปก" value={settings.coverOrient} onChange={(v) => set({ coverOrient: v })} options={[{ value: "tall", label: <><IcTall />ปกตั้ง</> }, { value: "wide", label: <><IcWide />ปกนอน</> }]} /></div>
        <div className="setrow"><div className="lbl">ชื่อไฟล์ใต้ปก</div><Switch on={settings.showNames} onChange={(v) => set({ showNames: v })} label="ชื่อไฟล์ใต้ปก" /></div>
        <div className="setrow"><div className="lbl">ภาพจากหนังในเรื่องที่ยังไม่มีปก<span className="small">เปิดแล้วเรื่องที่ยังไม่มีปกขึ้นภาพหนึ่งภาพที่สุ่มจากในหนัง แทนแถบทะแยง ทั้งบนชั้นวาง ในตาราง และแผงขวา · ปิดแล้วกลับเป็นแถบทะแยงตามเดิม · ภาพเก็บในโฟลเดอร์ของโปรแกรม ไม่เขียนลงไฟล์หนัง · ไม่นับเป็นปก ตัวกรองยังนับเรื่องนั้นว่ายังไม่มีปก · ปุ่มเดียวกันอยู่ที่ปุ่มการแสดงผลบนชั้นวาง</span></div><Switch on={settings.showFrames} onChange={(v) => set({ showFrames: v })} label="ภาพจากหนังในเรื่องที่ยังไม่มีปก" /></div>
        <div className="setrow"><div className="lbl">จุดสีบอกสภาพไฟล์</div><Switch on={settings.showDots} onChange={(v) => set({ showDots: v })} label="จุดสีบอกสภาพไฟล์" /></div>
        <div className="setrow"><div className="lbl">แสดงโครงจางค้างไว้<span className="small">ไว้ดูหน้าตาตอนรออ่านโฟลเดอร์ · ปิดโปรแกรมแล้วกลับเป็นปิดเอง</span></div>
          <span data-skelpreview style={{ display: "inline-flex" }}><Switch on={skel} onChange={setSkelPreview} label="แสดงโครงจางค้างไว้" /></span></div>
      </div>

      {/* ---------- เปิดเล่นหนัง ---------- */}
      {/* พี่กันสั่ง 9 พ.ย. 2569 ค่าตั้งต้นคือ MPC-HC · ดูในเครื่องว่ามีโปรแกรมเล่นตัวไหน · มีปุ่มเปลี่ยนค่าตั้งต้น · มีปุ่มเพิ่มโปรแกรม */}
      <div className="setcard" data-setcard="player" hidden={sec !== "player"}><h3>เปิดเล่นหนัง</h3>
        <div className="hint" style={{ margin: "0 0 10px" }}>กดปุ่มเปิดเล่นแล้วส่งไฟล์ไปโปรแกรมที่เป็นค่าตั้งต้น · ยังไม่ได้เลือก ใช้ MPC-HC ถ้าเครื่องไม่มี ใช้ตัวอื่นที่หาเจอ แล้วค่อยโปรแกรมหลักของ Windows</div>
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
              <div className="grow"><b>โปรแกรมหลักของ Windows</b><div className="small">โปรแกรมที่ Windows ตั้งไว้เปิดไฟล์ชนิดนั้น · เปิดตรงนาทีไม่ได้ · ส่งเสียงกับซับที่จับคู่ไม่ได้</div></div>
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
            <div key={t.name} className="setrow" data-tool={t.name}><div className="lbl">{t.name}{t.ok && verOf(t.version) && <span className="setver" data-toolver>รุ่น {verOf(t.version)}</span>}<span className="small">{TOOL_ROLE[t.name] ?? ""}{t.ok ? "" : ` · ${t.version}`}</span></div>
              {t.ok ? <span className="toolok">พร้อมใช้งาน</span> : <span className="toolbad">ไม่พร้อม</span>}</div>))}
        <div className="setrow" data-tool="Icaros"><div className="lbl">Icaros<span className="small">ให้ Windows โชว์โปสเตอร์เป็นไอคอนไฟล์ ไม่ลงก็ใช้โปรแกรมนี้ได้ครบ</span></div>
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            {icaros == null ? <Skel w={80} h={20} r={10} /> : icaros ? <span className="toolok">ลงแล้ว</span> : <span className="toolwarn">ยังไม่ได้ลง</span>}
            {icaros === false && <button type="button" className="btn btn-ghost btn-sm" onClick={() => setIcarosHelp(true)} data-icaroshelp>วิธีลง</button>}</div></div>
        <div className="setrow"><div className="lbl small" style={{ margin: 0 }}>ซ่อนหรือย้ายเครื่องมือแล้ว กดตรวจใหม่เพื่อดูสถานะล่าสุด</div>
          <button type="button" className={"btn btn-sm " + (checking ? "btn-wait" : "btn-ghost")} aria-disabled={checking || undefined} onClick={() => { if (!checking) void recheck(); }} data-retools><Keep icon={<IcRefresh size={15} />} all={["กำลังตรวจ", "ตรวจเครื่องมือใหม่"]}>{checking ? "กำลังตรวจ" : "ตรวจเครื่องมือใหม่"}</Keep></button></div>
      </div>

      {/* ---------- ตัวแปลงเสียง (มอคอัปเสียงและซับ หัวข้อ 8) · ตัวที่แนบมากับโปรแกรม กับตัวที่วางเองในโฟลเดอร์ตัวแปลง (ตัวที่สัญญาอนุญาตไม่ให้แจก) ---------- */}
      <div className="setcard" data-setcard="encoders" hidden={sec !== "encoders"}>
        <h3 style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10 }}><span>ตัวแปลงเสียง</span>
          <span style={{ display: "flex", gap: 6 }}>
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => encodeApi.openDir().catch((e) => toast({ kind: "bad", title: "เปิดโฟลเดอร์ตัวแปลงไม่ได้", detail: String(e) }))} data-encdir><IcFolder size={15} />เปิดโฟลเดอร์ตัวแปลง</button>
            <button type="button" className={"btn btn-sm " + (encChecking ? "btn-wait" : "btn-ghost")} aria-disabled={encChecking || undefined} onClick={() => { if (!encChecking) void recheckEnc(); }} data-reenc><Keep icon={<IcRefresh size={15} />} all={["กำลังตรวจ", "ตรวจตัวแปลงใหม่"]}>{encChecking ? "กำลังตรวจ" : "ตรวจตัวแปลงใหม่"}</Keep></button>
          </span></h3>
        <div className="small" style={{ marginBottom: 6 }}>โฟลเดอร์ตัวแปลงที่ใส่เอง <span className="nw" style={{ fontFamily: "var(--mono)", overflowWrap: "anywhere" }}>{encDir || "…"}</span> · <Phr>{"ตอนแปลงใช้ตัวต้นฉบับเป็นค่าตั้งต้น ffmpeg เป็นตัวรอง · วางรุ่นใหม่กว่าตัวที่แนบมา โปรแกรมใช้ตัวที่ใหม่กว่า"}</Phr></div>
        <div className="setrow" data-latest-bar><div className="lbl small" style={{ margin: 0 }}>
          {/* Phr กันคำขาดกลางวลี (เดิม "ล่าสุดแล้ว 5" ขาดเป็น ล่าสุด กับ แล้ว 5) */}
          <Phr>{latest ? (() => {
            const n = (s: string) => latest.list.filter((l) => l.state === s).length;
            // ช่องว่างแบบไม่ตัดบรรทัด ( ) ผูกคำกับเลขของมัน ไม่ให้เลขหลุดไปขึ้นบรรทัดใหม่
            const nb = " ";
            return `เช็กรุ่นล่าสุดกับเว็บผู้ทำเมื่อ ${latest.at.toLocaleTimeString("th-TH", { hour: "2-digit", minute: "2-digit" })}${nb}น. · ล่าสุดแล้ว${nb}${n("ok") + n("ahead")} · มีรุ่นใหม่${nb}${n("new")} · ยังไม่ได้ใส่${nb}${n("missing")} · เช็กไม่ได้${nb}${n("error")}`;
          })() : "เช็กว่าตัวแปลงแต่ละตัวเป็นรุ่นล่าสุดไหม · ออกเน็ตไปดูหน้าเว็บผู้ทำเฉพาะตอนกด ไม่โหลดอะไรมาเปลี่ยนเอง"}</Phr></div>
          <button type="button" className={"btn btn-sm " + (latestChecking ? "btn-wait" : "btn-ghost")} aria-disabled={latestChecking || undefined} onClick={() => { if (!latestChecking) void checkLatest(); }} data-enclatest><Keep icon={<IcRefresh size={15} />} all={["กำลังเช็ก", "เช็กรุ่นล่าสุด"]}>{latestChecking ? "กำลังเช็ก" : "เช็กรุ่นล่าสุด"}</Keep></button></div>
        {encs == null
          ? [0, 1, 2, 3, 4].map((i) => <div key={i} className="setrow" aria-busy="true"><Skel w="45%" h={12} /><Skel w={90} h={20} r={10} /></div>)
          : encs.map((e) => (
            <div key={e.name} className="setrow" data-enc={e.name}><div className="lbl">{e.name}<span className="small">{e.codecs} · {e.ok ? `${e.version ?? "ไม่ทราบรุ่น"}${e.coreAudio ? ` · CoreAudioToolbox ${e.coreAudio}` : ""} · ${e.source === "user" ? "โฟลเดอร์ตัวแปลง" : "แนบมากับโปรแกรม"}` : e.problem ? e.problem : "ไม่เจอในโฟลเดอร์ตัวแปลง"}</span>
              {(() => { const l = latest?.list.find((x) => x.name === e.name); return l ? <LatestLine l={l} onOpen={openPage} /> : null; })()}</div>
              {e.ok ? <span className="toolok">พร้อมใช้งาน</span> : e.problem ? <span className="toolwarn">{e.problem.startsWith("ต้องติดตั้ง iTunes") ? "ต้องติดตั้ง iTunes" : "ขาดไฟล์ประกอบ"}</span> : <span className="toolwarn">ยังไม่ได้ใส่</span>}</div>))}
        <div className="small" style={{ marginTop: 6 }}><Phr>{"qaac (AAC ของ Apple) กับ fdkaac (AAC ของ Fraunhofer) สัญญาอนุญาตไม่ให้แจกไปกับตัวติดตั้ง โหลดเองแล้ววางทุกไฟล์ที่มากับชุดไว้ในโฟลเดอร์ตัวแปลง แล้วกดตรวจตัวแปลงใหม่ · qaac กับ refalac (ALAC) แนบมากับโปรแกรมแล้ว · qaac ต้องติดตั้ง iTunes ก่อน เพราะใช้ตัวเข้ารหัส AAC ของ Apple ที่มากับ iTunes · refalac ไม่ต้องมี iTunes · TAK แนบชุดเดิมของผู้ทำมาทั้งไฟล์ตามเงื่อนไขการแจก โปรแกรมแตก Takc.exe ไปใช้เอง ใช้เฉพาะหน้าแปลงเสียง · รายชื่อ รุ่น และสัญญาอนุญาตอยู่ docs/research/codec-เสียง.md"}</Phr></div>
      </div>

      {/* ---------- กราฟเสียง (แคลร์เพิ่ม · ผลอ่านคลื่นที่เก็บลงเครื่อง คิว 8) ---------- */}
      <div className="setcard" data-setcard="graph" hidden={sec !== "graph"}><h3>กราฟเสียง</h3>
        <div className="setrow"><div className="lbl">ซูมเหมือนกันทุกกราฟ<span className="small">เปิดแล้วทุกกราฟใช้ช่วงเวลาซูมเดียวกัน · ปิดแล้วซูมเฉพาะกราฟที่ดูอยู่ กราฟอื่นเริ่มทั้งไฟล์</span></div>
          <Switch on={settings.graphZoomAll} onChange={(v) => set({ graphZoomAll: v })} label="ซูมเหมือนกันทุกกราฟ" /></div>
        <GraphImgRows value={settings.graphImg ?? GRAPH_IMG_DEFAULT} onChange={(graphImg) => set({ graphImg })} />
        <div className="setrow"><div className="lbl">ผลอ่านคลื่นที่เก็บไว้ในเครื่อง<span className="small">เปิดไฟล์เดิมซ้ำไม่ต้องอ่านใหม่ · ไฟล์หนังเปลี่ยนแล้วอ่านใหม่เอง · รวมไม่เกิน 300 MB</span>
          <span className="small" data-graphcache>{cache ? `${cache.files} ไฟล์ · ${fmtSize(cache.bytes)}` : "—"}</span></div>
          <button type="button" className="btn btn-ghost btn-sm" onClick={clearCache} data-clearcache><IbTrash size={15} />ล้าง</button></div>
      </div>

      {/* ---------- ขอบคุณ ---------- */}
      <div className="setcard" data-setcard="thanks" hidden={sec !== "thanks"}><h3>ขอบคุณ</h3>
        <div className="small" style={{ marginBottom: 6 }}>ชั้นหนังพัฒนาขึ้นได้ด้วยผลงานของโครงการและผู้พัฒนาต่อไปนี้ ขอขอบคุณทุกท่าน</div>
        {THANKS.map((g) => <div key={g.title} data-thanks-group>
          <h4 className="imghead">{g.title}</h4>
          <div className="small" style={{ marginBottom: 4 }}>{g.note}</div>
          <div className="thanksgrid">
            {g.rows.map((r) => <div key={r.name} className="thankcard" data-thanks-row>
              <div className="thankhead"><span className={"thankicon" + (WHITE_ICON.has(r.name) ? " white" : "") + (thankImg2(r.name) ? " two" : "")}>{thankImg(r.name) ? <img src={thankImg(r.name)} alt="" draggable={false} /> : r.icon}{thankImg2(r.name) && <img src={thankImg2(r.name)} alt="" draggable={false} />}</span><span className="thankname"><b>{r.name}</b>{r.ver && <span className="thankver" data-thankver>v{r.ver}</span>}</span>{/* ป้ายยาวแยกบรรทัดตรง · ป้ายสั้นอยู่บรรทัดเดียว ทุกป้ายอยู่มุมขวาบนแถวเดียวกับชื่อ (BUGS ข้อ 3) */}<span className={"thanktag" + (r.tag.length > 18 ? " lines" : "")} title={r.tag} data-thanks-tag>{r.tag.split(" · ").map((t, i, a) => <span key={t}>{t}{i < a.length - 1 ? " ·" : ""}{i < a.length - 1 ? " " : ""}</span>)}</span></div>
              {/* ตัดบรรทัดตรงเว้นวรรคเท่านั้น ขยายเต็มจอแล้วไม่ตัดกลางคำ อ่า|น (BUGS ข้อ 4) */}
              <div className="thankwhat"><Phr>{r.what}</Phr></div>
              <div className="thankfoot"><span className="thankurl">{r.url.split(" · ").map((u) => <button key={u} type="button" className="thanklink" title={"เปิด " + u} data-thanks-link={u} onClick={() => { encodeApi.thanksOpen(u).catch((e: unknown) => toast({ kind: "bad", title: "เปิดหน้าเว็บไม่ได้", detail: String(e) })); }}>{u}</button>)}</span></div>
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
        <div className="small">ลงครั้งเดียว ไอคอนไฟล์ MKV ในหน้าต่างโฟลเดอร์จะเป็นโปสเตอร์ · ไม่ลงก็ใช้โปรแกรมชั้นหนังได้ครบ</div>
        <ol className="steps">
          <li>กดปุ่มข้างล่าง เปิดหน้าเว็บของผู้พัฒนา Icaros แล้วโหลดตัวติดตั้ง</li>
          <li>ติดตั้ง แล้วเปิดโปรแกรม Icaros Config</li>
          <li>กดเปิดการสร้างภาพตัวอย่าง (Thumbnailing) และดูว่ามี mkv อยู่ในรายการ</li>
          <li>กลับมาที่นี่ กดตรวจเครื่องมือใหม่ ป้ายจะเปลี่ยนเป็นลงแล้ว</li>
        </ol>
      </Dialog>
    </div>
    </div>
  );
}

/** ตั้งค่ารูปกราฟที่บันทึก (พี่กันสั่ง 9 พ.ย. 2569 "bit dpi เลือกได้ เราขอละเอียดแบบเนิร์ดไปเลย") · ค่าตั้งต้นแคลร์ตั้ง กว้าง 2560 PNG 8 bit 300 dpi */
const IMG_WIDTHS = [0, 1920, 2560, 3840, 7680], IMG_DPIS = [72, 96, 150, 300, 600];
const WIDTH_STOPS = [320, 640, 1280, 1920, 2560, 3200, 3840, 5120, 6400, 7680, 8192], DPI_STOPS = [72, 96, 150, 200, 300, 400, 600, 800, 1200], QUALITY_STOPS = [1, 25, 50, 60, 70, 75, 80, 85, 90, 92, 95, 98, 100];
function NumField({ value, min, max, label, unit, onCommit, data, off }: { value: number; min: number; max: number; label: string; unit: string; onCommit: (v: number) => void; data: string; off?: boolean }) {
  const [txt, setTxt] = useState<string | null>(null);
  const done = () => { if (txt == null) return; const v = parseInt(txt, 10); if (!Number.isNaN(v)) onCommit(Math.max(min, Math.min(max, v))); setTxt(null); };
  return <label className={"imgnum" + (off ? " off" : "")}><input value={txt ?? String(value)} inputMode="numeric" readOnly={off} tabIndex={off ? -1 : undefined} aria-label={label} onChange={(e) => setTxt(e.target.value.replace(/[^0-9]/g, ""))} onBlur={done} onKeyDown={(e) => { if (e.key === "Enter") e.currentTarget.blur(); }} {...{ [data]: "" }} /><span>{unit}</span></label>;
}
/** แถบเลื่อนเป็นขั้น ขีดกับป้ายตามระดับแบบแผงตั้งค่าเสียง · ลากแล้วเลขในช่องขยับตาม บันทึกเมื่อหยุดลาก ไม่เขียนไฟล์ตั้งค่าทุกเฟรม
    (พี่กันสั่ง 9 พ.ย. 2569 "ขอเส้นยาว ๆ ที และแบ่งตามช่อง แบ่งตามระดับได้" · "ตอนเลื่อนบาร์ เลขมันจะขยับด้วย") */
function ImgSlide({ value, stops, major, fineMarks, label, onDrag, onCommit, off, data }: { value: number; stops: number[]; major?: number[]; fineMarks: number[]; label: string; onDrag: (v: number) => void; onCommit: (v: number) => void; off?: boolean; data: string }) {
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);
  // ติ๊กแล้วเลื่อนละเอียดทีละ 1 ไม่ติดขั้น (พี่กันสั่ง 9 พ.ย. 2569 "เราขอทุกบาร์ มีติ๊กแล้วมันจะเปลี่ยนเป็นเลื่อนละเอียด") · จำแยกแต่ละแถบในเครื่องนี้
  const key = "ms.imgFine." + data;
  const [fine, setFine] = useState(() => { try { return localStorage.getItem(key) === "1"; } catch { return false; } });
  const toggle = () => { const v = !fine; setFine(v); try { localStorage.setItem(key, v ? "1" : "0"); } catch { /* จำไม่ได้ก็ใช้ค่านี้ไปก่อน */ } };
  const push = (v: number) => { onDrag(v); if (timer.current) clearTimeout(timer.current); timer.current = setTimeout(() => onCommit(v), 250); };
  const n = stops.length, lo = stops[0], hi = stops[n - 1], marks = major ?? stops;
  const stepPct = (i: number) => (i / (n - 1)) * 100 + "%", finePct = (x: number) => ((x - lo) / (hi - lo)) * 100 + "%";
  const at = stops.reduce((best, x, i) => (Math.abs(x - value) < Math.abs(stops[best] - value) ? i : best), 0);
  return <div className={"imgslidebox" + (off ? " off" : "")} aria-hidden={off || undefined}>
    <button type="button" role="checkbox" aria-checked={fine} className={"imgfine" + (fine ? " on" : "")} tabIndex={off ? -1 : undefined} title="ติ๊กแล้วเลื่อนละเอียดทีละ 1 ไม่ติดขั้น" onClick={toggle} {...{ [data + "-fine"]: "" }}>
      <i aria-hidden="true">{fine && <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.6" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12.5l4.5 4.5L19 7" /></svg>}</i>ละเอียด</button>
    <div className="stepw imgslide" {...{ [data]: "" }}>
      {fine
        ? <Range label={label + " แบบละเอียด"} min={lo} max={hi} value={Math.max(lo, Math.min(hi, value))} format={(v) => String(v)} onChange={push} />
        : <Range label={label} min={0} max={n - 1} value={at} format={(i) => String(stops[i])} onChange={(i) => push(stops[i])} />}
      <div className="ticks" aria-hidden="true">{fine ? fineMarks.map((x) => <i key={x} className="mj" style={{ left: finePct(x) }} />) : stops.map((x, i) => <i key={x} style={{ left: stepPct(i) }} className={marks.includes(x) ? "mj" : undefined} />)}</div>
      <div className="tlabels" aria-hidden="true">{fine ? fineMarks.map((x) => <span key={x} style={{ left: finePct(x) }}>{x}</span>) : marks.map((x) => <span key={x} style={{ left: stepPct(stops.indexOf(x)) }}>{x}</span>)}</div>
    </div>
  </div>;
}
function GraphImgRows({ value: saved, onChange }: { value: GraphImg; onChange: (v: GraphImg) => void }) {
  // ค่าระหว่างลากแถบ ยังไม่บันทึก ช่องตัวเลข ปุ่ม และขนาดพิมพ์อ่านจากค่านี้ เลขจึงขยับตาม
  const [draft, setDraft] = useState<Partial<GraphImg>>({});
  useEffect(() => { setDraft({}); }, [saved]);
  const o: GraphImg = { ...saved, ...draft };
  const up = (p: Partial<GraphImg>) => onChange({ ...saved, ...p });
  const pickDir = async () => { const d = await pickFolder("เลือกโฟลเดอร์เก็บรูปกราฟ"); if (d) up({ dirMode: "folder", dir: d }); };
  // ทุกแถวอยู่ตลอด เปลี่ยนชนิดไฟล์แล้วเพจไม่เลื่อน อันที่ใช้ไม่ได้จางไว้ เหตุผลขึ้นตอนชี้ (พี่กันสั่ง 9 พ.ย. 2569 "ตอนเราเลือกแต่ละนามสกุล ตัวเพจมันเลื่อน เราอยากให้มัน fix และอันไหนปรับไม่ได้จะจางไว้")
  const f = o.format, deepOk = f === "png" || f === "tiff", dpiOk = f === "png" || f === "jpg" || f === "tiff", qualOk = f === "jpg" || f === "heic", subOk = f === "jpg", packOk = f === "png";
  const name = f === "webp" ? "WebP" : f === "heic" ? "HEIC" : f.toUpperCase();
  const cm = o.width && dpiOk ? ` · พิมพ์ได้กว้าง ${(o.width / o.dpi * 2.54).toFixed(1)} ซม.` : "";
  return <>
    <h4 className="imghead">รูปกราฟที่บันทึก</h4>
    <div className="setrow" data-img-row="width"><div className="lbl">ความกว้างรูป<span className="small">ความสูงตามสัดส่วนกราฟ · ตอนบันทึกโปรแกรมอ่านเสียงใหม่ที่ความละเอียดนี้ ไม่ต้องซูมก่อน รูปใหญ่ใช้เวลานานขึ้น{cm}</span></div>
      <span className="imgstack"><span className="imgctl"><Seg small label="ความกว้างรูป" value={String(IMG_WIDTHS.includes(o.width) ? o.width : "own")} onChange={(v) => { if (v !== "own") up({ width: Number(v) }); }}
        options={[{ value: "0", label: "ตามจอ" }, { value: "1920", label: "1920" }, { value: "2560", label: "2560" }, { value: "3840", label: "3840" }, { value: "7680", label: "7680" }]} />
        <NumField value={o.width} min={0} max={8192} label="พิมพ์ความกว้างเอง" unit="px" onCommit={(width) => up({ width: width && width < 320 ? 320 : width })} data="data-img-width" /></span>
        <ImgSlide value={o.width || 320} stops={WIDTH_STOPS} major={[320, 1280, 2560, 3840, 6400, 8192]} fineMarks={[320, 1920, 3840, 5760, 8192]} label="ความกว้างรูป" onDrag={(width) => setDraft({ width })} onCommit={(width) => up({ width })} data="data-img-slide-width" /></span></div>
    <div className="setrow" data-img-row="format"><div className="lbl">ชนิดไฟล์<span className="small">PNG TIFF WebP ไม่เสียคุณภาพ · JPG กับ HEIC ไฟล์เล็ก แต่ขอบตัวหนังสือกับเส้นอาจฟุ้ง</span></div>
      <Seg small label="ชนิดไฟล์" value={o.format} onChange={(format) => up({ format })} options={[{ value: "png", label: "PNG" }, { value: "jpg", label: "JPG" }, { value: "webp", label: "WebP" }, { value: "heic", label: "HEIC" }, { value: "tiff", label: "TIFF" }]} /></div>
    <div className="setrow" data-img-row="bits"><div className="lbl">ความลึกสี<span className="small">ใช้ได้กับ PNG และ TIFF · กราฟวาดจาก 8 bit ต่อช่องสี 16 bit ไฟล์ใหญ่ขึ้น รายละเอียดสีไม่ได้เพิ่ม</span></div>
      <Seg small label="ความลึกสี" value={String(deepOk ? o.bits : 8)} onChange={(v) => up({ bits: Number(v) as 8 | 16 })} disabledReason={deepOk ? undefined : `${name} เก็บได้ 8 bit`} options={[{ value: "8", label: "8 bit" }, { value: "16", label: "16 bit" }]} /></div>
    <div className="setrow" data-img-row="gray"><div className="lbl">ชุดสี<span className="small">ขาวดำเก็บช่องสีเดียว เส้นของแต่ละไฟล์จะแยกกันด้วยสีไม่ได้</span></div>
      <Seg small label="ชุดสี" value={o.gray ? "gray" : "rgb"} onChange={(v) => up({ gray: v === "gray" })} options={[{ value: "rgb", label: "RGB" }, { value: "gray", label: "ขาวดำ" }]} /></div>
    {/* พื้นหลังโปร่งใส (พี่กันสั่ง 10 พ.ย. 2569 "เราชอบตอนบันทึกแล้วพื้นหลังโปร่งใสจัง เอาไปที่ตั้งค่าหน่อย") */}
    <div className="setrow" data-img-row="bg"><div className="lbl">พื้นหลัง<span className="small">โปร่งใส ใช้ได้กับ PNG WebP TIFF · วางบนสไลด์หรือเอกสารสีอื่นแล้วไม่มีกรอบขาว · กราฟสเปกตรัมพื้นดำยังทึบ</span></div>
      <Seg small label="พื้นหลัง" value={o.transparent && o.format !== "jpg" && o.format !== "heic" ? "clear" : "solid"} onChange={(v) => up({ transparent: v === "clear" })} disabledReason={o.format === "jpg" || o.format === "heic" ? `${name} เก็บพื้นโปร่งใสไม่ได้ ใช้ PNG WebP หรือ TIFF` : undefined} options={[{ value: "solid", label: "ทึบ" }, { value: "clear", label: "โปร่งใส" }]} /></div>
    <div className="setrow" data-img-row="dpi"><div className="lbl">DPI<span className="small">ใช้ได้กับ PNG JPG TIFF · ไม่เปลี่ยนจำนวนพิกเซล เป็นค่าบอกขนาดตอนพิมพ์ เก็บในไฟล์จริง</span></div>
      <span className="imgstack"><span className="imgctl"><Seg small label="DPI" value={String(IMG_DPIS.includes(o.dpi) ? o.dpi : "own")} disabledReason={dpiOk ? undefined : `ไฟล์ ${name} ไม่มีที่เก็บค่า DPI`} onChange={(v) => { if (v !== "own") up({ dpi: Number(v) }); }}
        options={IMG_DPIS.map((d) => ({ value: String(d), label: String(d) }))} />
        <NumField off={!dpiOk} value={o.dpi} min={1} max={9600} label="พิมพ์ DPI เอง" unit="dpi" onCommit={(dpi) => up({ dpi })} data="data-img-dpi" /></span>
        <ImgSlide off={!dpiOk} value={o.dpi} stops={DPI_STOPS} fineMarks={[72, 300, 600, 900, 1200]} label="DPI" onDrag={(dpi) => setDraft({ dpi })} onCommit={(dpi) => up({ dpi })} data="data-img-slide-dpi" /></span></div>
    <div className="setrow" data-img-row="quality"><div className="lbl">คุณภาพ<span className="small">ใช้ได้กับ JPG และ HEIC · 1 ถึง 100 · 92 เป็นค่าตั้งต้น เห็นต่างจากต้นฉบับยากแล้ว</span></div>
      <span className="imgstack"><NumField off={!qualOk} value={o.quality} min={1} max={100} label="คุณภาพ" unit="/ 100" onCommit={(quality) => up({ quality })} data="data-img-quality" />
        <ImgSlide off={!qualOk} value={o.quality} stops={QUALITY_STOPS} major={[1, 25, 50, 70, 80, 90, 100]} fineMarks={[1, 25, 50, 75, 100]} label="คุณภาพ" onDrag={(quality) => setDraft({ quality })} onCommit={(quality) => up({ quality })} data="data-img-slide-quality" /></span></div>
    <div className="setrow" data-img-row="sub"><div className="lbl">Chroma subsampling<span className="small">ใช้ได้กับ JPG · 4:4:4 เก็บสีครบ เส้นสีบนกราฟคมกว่า · 4:2:0 ไฟล์เล็กลง · HEIC ใช้ 4:2:0 เปิดได้ทุกโปรแกรม</span></div>
      <Seg small label="Chroma subsampling" value={f === "heic" ? "420" : o.subsampling} disabledReason={subOk ? undefined : "ใช้ได้กับ JPG"} onChange={(subsampling) => up({ subsampling })} options={[{ value: "444", label: "4:4:4" }, { value: "420", label: "4:2:0" }]} /></div>
    <div className="setrow" data-img-row="compress"><div className="lbl">การบีบอัด PNG<span className="small">ใช้ได้กับ PNG · ภาพเหมือนกันทุกระดับ ต่างกันที่ขนาดไฟล์กับเวลาบันทึก</span></div>
      <Seg small label="การบีบอัด PNG" value={o.compress} disabledReason={packOk ? undefined : "ใช้ได้กับ PNG"} onChange={(compress) => up({ compress })} options={[{ value: "fast", label: "เร็ว" }, { value: "default", label: "ปกติ" }, { value: "best", label: "เล็กสุด" }]} /></div>
    {/* พี่กันสั่ง 9 พ.ย. 2569 "เอาที่อยู่ไฟล์เป็นค่าตั้งต้นด้วย" · "เราหมายถึงตั้งค่านี้ ที่อยู่ตรงนี้" */}
    <div className="setrow" data-img-row="dir"><div className="lbl">ที่เก็บรูป<span className="small" style={{ overflowWrap: "anywhere" }}>{o.dirMode === "folder" && o.dir ? o.dir : "โฟลเดอร์เดียวกับไฟล์ที่ดูอยู่ · หน้าเทียบใช้โฟลเดอร์ของไฟล์ 1"}</span></div>
      <span className="imgctl"><Seg small label="ที่เก็บรูป" value={o.dirMode === "folder" && o.dir ? "folder" : "beside"} onChange={(v) => { if (v === "beside") up({ dirMode: "beside" }); else void pickDir(); }}
        options={[{ value: "beside", label: "ข้างไฟล์ที่ดูอยู่" }, { value: "folder", label: "โฟลเดอร์ที่เลือก" }]} />
        <button type="button" className="btn btn-ghost btn-sm" onClick={() => void pickDir()} data-img-dir><IcFolder size={15} />เปลี่ยน</button></span></div>
    <div className="setrow" data-img-row="ask"><div className="lbl">ถามที่เก็บทุกครั้ง<span className="small">เปิด เปิดกล่องเลือกที่เก็บ แก้ชื่อได้ · ปิด กดบันทึกแล้วเก็บเลย ชื่อซ้ำต่อท้าย (2) ไม่เขียนทับ</span></div>
      <Switch on={o.ask} onChange={(ask) => up({ ask })} label="ถามที่เก็บทุกครั้ง" /></div>
    <div className="setrow" data-img-row="title"><div className="lbl">แถบหัวรูป<span className="small">ชื่อไฟล์กับช่วงเวลาบนรูป · หน้าเทียบบอกสีของแต่ละไฟล์ · กราฟวิเคราะห์มีชื่อในตัวอยู่แล้ว</span></div>
      <Switch on={o.title} onChange={(title) => up({ title })} label="แถบหัวรูป" /></div>
    <div className="setrow" data-img-row="name"><div className="lbl">ใส่ชื่อกราฟในชื่อไฟล์<span className="small">เช่น เพลง รูปคลื่น.png · ชื่อซ้ำต่อท้าย (2) ไม่เขียนทับ</span></div>
      <Switch on={o.nameGraph} onChange={(nameGraph) => up({ nameGraph })} label="ใส่ชื่อกราฟในชื่อไฟล์" /></div>
    <div className="setrow"><div className="lbl">กลับค่าตั้งต้น<span className="small">กว้าง 2560 · PNG · 8 bit · RGB · 300 dpi · เก็บข้างไฟล์ · ถามทุกครั้ง</span></div>
      <button type="button" className="btn btn-ghost btn-sm" onClick={() => onChange(GRAPH_IMG_DEFAULT)} data-img-reset><IcRefresh size={15} />กลับค่าตั้งต้น</button></div>
  </>;
}
