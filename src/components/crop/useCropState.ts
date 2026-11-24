/* ค่าของหน้าต่างครอป แบบปก ค่ากรอบ สีขอบ ชนิดไฟล์ คุณภาพ ขนาดไฟล์จริงจากฝั่ง Rust ปุ่มใช้รูปนี้ และสลับช่องปกของหน้าจับคู่ปก
   แยกจาก CropDialog.tsx ตอนจัดโครงไฟล์ตามความหมาย (BUGS ข้อ 155 ขั้น 9) เนื้อโค้ดยกมาทั้งก้อน */
import { useEffect, useMemo, useRef, useState } from "react";
import { posterApi, type CropTarget, type Geometry, type PosterInfo, type RenderInfo } from "../../lib/api";
import { useSettings } from "../../lib/settings";
import { PADS, START, TALL, WIDE, layout, fromGeo, type CropChoice, type View } from "./cropCalc";

export type CrProps = {
  info: PosterInfo;
  start?: CropChoice | null;
  defaultFormat: "jpg" | "png";
  defaultQuality: number;
  onCancel: () => void;
  onUse: (c: CropChoice) => void;
  /** เลือกรูปใหม่จากหน้าต่างนี้ ได้ที่อยู่รูปแล้วหน้าเจ้าของเปิดรูปนั้นต่อ */
  onPickImage: (path: string) => void;
  /** ช่องปกของหน้าเสียงและซับ · ไม่ส่ง = หน้าใส่โปสเตอร์ */
  target?: CropTarget;
  /** ระบบจับคู่รูปปก · เลือกช่องปกตั้งปกนอน ปรับเอียง · ไม่ต้องเลือกชนิดไฟล์กับคุณภาพ ใช้ค่าในหน้าตั้งค่าตอนยืนยัน
      สลับช่อง · keep คือค่าของช่องเดิมที่แก้ไว้ ให้จำลงแถวก่อนเปิดช่องใหม่ ไม่ได้แก้อะไรเป็น null */
  link?: { movie: string; orient: "tall" | "wide"; onOrient: (o: "tall" | "wide", keep: CropChoice | null) => void };
};

export function useCropState(p: CrProps) {
  const { info } = p;
  // รวมเข้าไฟล์จากปกนอน แล้วกดครอปต่อที่หน้าใส่โปสเตอร์ ค่า 16 : 9 ต้องไม่หาย
  // ช่องปกนอนของหน้าเสียงและซับ (target cover_land) ก็เป็นกรอบ 16 : 9 ตั้งแต่เปิด ไม่ต้องรอค่าครอปเดิม (BUGS ข้อ 32)
  /* หน้าใส่โปสเตอร์ (ไม่มี target ไม่ใช่หน้าจับคู่ปก) เลือกได้ว่าเป็นปกตั้งหรือปกนอน · ปกนอนใช้หน้าครอป 16 : 9 ตัวเดียวกับช่องปกนอนของหน้าเสียงและซับ
     ฝั่ง Rust แนบรูปแนวนอนเป็น cover_land และเก็บปกตั้งเดิมไว้เอง (poster.rs) · ตั้งต้นปกตั้ง หรือตามค่าครอปเดิม (BUGS ข้อ 58 พี่กันสั่ง "เอาส่ก่อนเลือกแบบปก") */
  const pickOrient = !p.link && !p.target;
  const [orient, setOrient] = useState<"tall" | "wide">(p.start?.geo.aspect === "wide" ? "wide" : "tall");
  const wideSlot = p.link ? p.link.orient === "wide" : p.target === "cover_land" || (pickOrient ? orient === "wide" : p.start?.geo.aspect === "wide");
  const ar = wideSlot ? WIDE : TALL;
  const [view, setView] = useState<View>(() => p.start ? fromGeo(p.start.geo, info, ar) : START);
  const [mode, setMode] = useState<"crop" | "pad" | "original">(p.start?.geo.mode ?? (info.twoThree ? "crop" : "crop"));
  const [pad, setPad] = useState(p.start?.geo.pad ?? PADS[0].c);
  /** สีที่เลือกเองล่าสุด ขึ้นเป็นช่องสีต่อจากสีให้เลือก กดสีอื่นแล้วยังกดกลับมาได้ (BUGS ข้อ 55 ต่อ) */
  const [own, setOwn] = useState<string | null>(() => (PADS.some((c) => c.c === pad) ? null : pad));
  const pickPad = (c: string) => { setPad(c); if (!PADS.some((x) => x.c === c)) setOwn(c); };
  const [format, setFormat] = useState<"jpg" | "png">(p.start?.format ?? p.defaultFormat);
  const [quality, setQuality] = useState(p.start?.quality ?? p.defaultQuality);
  /** สวิตช์ย่อรูปที่ใหญ่เกิน ตั้งจากปุ่มตั้งค่ารูปในหน้านี้ได้ · เปลี่ยนแล้วคิดขนาดรูปใหม่ (ฝั่ง Rust อ่านค่าตั้งตอนทำรูป) */
  const shrink = useSettings().settings?.shrinkLargePosters;
  /** ตัวเลขที่กำลังพิมพ์ในช่องคุณภาพ · พิมพ์ค้างหรือเกินช่วงไม่ใช้ ออกจากช่องแล้วกลับเป็นค่าล่าสุดที่ใช้ได้ */
  const [qText, setQText] = useState<string | null>(null);
  const [render, setRender] = useState<RenderInfo | null>(null);
  const [jpgBytes, setJpgBytes] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [using, setUsing] = useState(false);
  const [smallOk, setSmallOk] = useState(false);
  const seq = useRef(0);

  const lay = useMemo(() => layout(info, view, ar), [info, view, ar]);
  // ค่าใหม่ส่งเฉพาะตอนใช้ หน้าอื่นได้ค่าเท่าเดิมทุกตัว
  const geo: Geometry = { rotate: view.rotate, flip: view.flip, mode: wideSlot ? "crop" : mode, pad, x: lay.nx, y: lay.ny, w: lay.nw, h: lay.nh, ...(view.tilt ? { tilt: view.tilt } : {}), ...(wideSlot ? { aspect: "wide" } : {}) };
  const geoKey = JSON.stringify(geo);

  // ขนาดไฟล์จริง · คิดใหม่หลังหยุดลากราว 0.25 วินาที · ผลเก่าที่มาช้าทิ้ง
  useEffect(() => {
    const n = ++seq.current;
    setBusy(true);
    const t = setTimeout(() => {
      posterApi.render(geo, format, quality, { sizes: format === "jpg" && !p.link, target: p.target }).then((r) => {
        if (n !== seq.current) return;
        setRender(r);
        if (format === "jpg") setJpgBytes(r.bytes);
        setBusy(false);
      }).catch(() => { if (n === seq.current) setBusy(false); });
    }, 250);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [geoKey, format, quality, shrink]);

  useEffect(() => { if (render && !render.small) setSmallOk(false); }, [render]);

  /** กดใช้รูปนี้ไม่สำเร็จ (เช่น ช่องปกนอนของหน้าเสียงและซับได้รูปแนวตั้ง) ขึ้นเหตุผลข้างปุ่ม · เดิมไม่มีที่บอก กดแล้วเงียบ */
  const [useErr, setUseErr] = useState<string | null>(null);
  useEffect(() => { setUseErr(null); }, [geoKey, format]);
  const use = async () => {
    if (using) return;
    setUsing(true);
    setUseErr(null);
    try {
      const r = await posterApi.render(geo, format, quality, { choose: true, target: p.target });
      p.onUse({ geo, format, quality, render: r });
    } catch (e) {
      setUseErr(String(e));
    } finally {
      setUsing(false);
    }
  };
  /** สลับช่องปกตั้งปกนอน · ค่าที่แก้ไว้ในช่องเดิมต้องไม่หายเงียบ จำลงแถวให้ก่อน · ไม่ได้แก้อะไร ไม่จด แถวจะได้ไม่ขึ้นว่าครอปแล้ว */
  const startKey = useRef(geoKey);
  const switchSlot = async (o: "tall" | "wide") => {
    if (using || !p.link || o === p.link.orient) return;
    if (geoKey === startKey.current) { p.link.onOrient(o, null); return; }
    setUsing(true);
    setUseErr(null);
    try {
      const r = await posterApi.render(geo, format, quality, { choose: true, target: p.target });
      p.link.onOrient(o, { geo, format, quality, render: r });
    } catch (e) {
      setUseErr(String(e));
    } finally {
      setUsing(false);
    }
  };
  return { info, pickOrient, orient, setOrient, wideSlot, ar, view, setView, mode, setMode, pad, setPad, own, setOwn, pickPad, format, setFormat, quality, setQuality, shrink, qText, setQText, render, setRender, jpgBytes, setJpgBytes, busy, setBusy, using, setUsing, smallOk, setSmallOk, seq, lay, geo, geoKey, useErr, setUseErr, use, startKey, switchSlot, p };
}
