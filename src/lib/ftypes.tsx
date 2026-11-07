/* ชนิดไฟล์ของแทร็ก (คอลัมน์ ชนิด ในหน้าเสียงและซับ) · ยกจากมอคอัป docs/mockups/audio-merge.html FT_GROUPS FT_FULL ftChip
   พี่กันสั่ง *"ใส่คอลัมน์นึงที่แสดงชนิดไฟล์ด้วย"* และ *"ไม่ได้หมายถึงแค่ชนิดพวกนี้ แต่ทุกตัว และใส่สีต่างกันด้วย"*
   เลขคือสี (มุมบนวงล้อสี) ไม่ซ้ำกัน · สีโทนเดียวกันคือตระกูลเดียวกัน · ชนิดที่ไม่อยู่ในรายการขึ้นสีเทา
   ชื่อเต็มขึ้นตอนชี้ (พี่กันสั่ง *"ชื่อ codec ทั้งหมดใส่ ชื่อเต็มด้วย"*) */

export const FT_GROUPS: [string, [string, number][]][] = [
  ["ภาพ", [["H.264", 210], ["H.265", 250], ["AV1", 175], ["VP9", 125], ["MPEG-2", 30]]],
  ["เสียง Dolby", [["AC-3", 22], ["E-AC-3", 37], ["TrueHD", 50]]],
  ["เสียง DTS", [["DTS", 0], ["DTS-HD MA", 345]]],
  ["เสียง Lossy อื่น", [["AAC", 325], ["Opus", 285], ["MP3", 262], ["Vorbis", 305]]],
  ["เสียง Lossless อื่น", [["FLAC", 170], ["PCM", 95], ["ALAC", 225], ["WavPack", 72], ["TTA", 200], ["APE", 125], ["TAK", 150]]],
  ["ซับ ตัวหนังสือ", [["SRT", 48], ["ASS", 15], ["VTT", 160]]],
  ["ซับ รูป", [["PGS", 270], ["VobSub", 220]]],
];
const HUE: Record<string, number> = Object.fromEntries(FT_GROUPS.flatMap((g) => g[1]));

export const FT_FULL: Record<string, string> = {
  "H.264": "Advanced Video Coding (AVC)", "H.265": "High Efficiency Video Coding (HEVC)", "AV1": "AOMedia Video 1", "VP9": "Google VP9", "MPEG-2": "MPEG-2 Video (H.262)",
  "AC-3": "Dolby Digital", "E-AC-3": "Dolby Digital Plus", "TrueHD": "Dolby TrueHD", "DTS": "Digital Theater Systems", "DTS-HD MA": "DTS-HD Master Audio",
  "AAC": "Advanced Audio Coding", "Opus": "Opus Interactive Audio Codec", "MP3": "MPEG-1 Audio Layer III", "Vorbis": "Ogg Vorbis",
  "FLAC": "Free Lossless Audio Codec", "PCM": "Pulse-Code Modulation", "ALAC": "Apple Lossless Audio Codec", "WavPack": "WavPack Hybrid Lossless", "TTA": "True Audio", "APE": "Monkey's Audio", "TAK": "Tom's lossless Audio Kompressor",
  "SRT": "SubRip Text", "ASS": "Advanced SubStation Alpha", "VTT": "Web Video Text Tracks", "PGS": "Presentation Graphic Stream", "VobSub": "VOB Subtitle (ซับ DVD)",
  "DTS Express": "DTS Express", "DTS-HD HRA": "DTS-HD High Resolution Audio", "MP2": "MPEG-1 Audio Layer II", "WMA": "Windows Media Audio", "MPEG-4": "MPEG-4 Part 2", "mov_text": "MP4 Timed Text (ซับใน MP4)",
};
/** APE กับ TAK ใช้เฉพาะหน้าแปลงเสียง · ป้ายพื้นขาวขอบประ แยกจาก FLAC ที่สีใกล้กัน */
const FT_LINE = new Set(["APE", "TAK"]);

/** ชื่อชนิดที่แสดงบนป้าย จากชื่อ codec ของ ffprobe กับ profile */
export function ftName(kind: string, codec: string, profile?: string | null): string {
  const c = codec.toLowerCase();
  if (kind === "video") {
    return ({ h264: "H.264", hevc: "H.265", av1: "AV1", vp9: "VP9", mpeg2video: "MPEG-2", mpeg4: "MPEG-4", vp8: "VP8" } as Record<string, string>)[c] ?? codec.toUpperCase();
  }
  if (kind === "audio") {
    if (c === "dts") {
      const p = (profile ?? "").toLowerCase();
      return p.includes("ma") ? "DTS-HD MA" : p.includes("hra") || p.includes("high resolution") ? "DTS-HD HRA" : p.includes("express") ? "DTS Express" : "DTS";
    }
    if (c.startsWith("pcm_")) return "PCM";
    if (c.startsWith("wma")) return "WMA";
    return ({ ac3: "AC-3", eac3: "E-AC-3", truehd: "TrueHD", mlp: "TrueHD", aac: "AAC", opus: "Opus", mp3: "MP3", mp2: "MP2", vorbis: "Vorbis",
      flac: "FLAC", alac: "ALAC", wavpack: "WavPack", tta: "TTA", ape: "APE", tak: "TAK" } as Record<string, string>)[c] ?? codec.toUpperCase();
  }
  return ({ subrip: "SRT", srt: "SRT", ass: "ASS", ssa: "ASS", webvtt: "VTT", hdmv_pgs_subtitle: "PGS", dvd_subtitle: "VobSub", mov_text: "mov_text" } as Record<string, string>)[c] ?? codec;
}

/** แบบไม่เสียคุณภาพไหม · ใช้เตือนเรื่องแปลงซ้อน */
export function isLossless(name: string): boolean {
  return ["FLAC", "PCM", "ALAC", "WavPack", "TTA", "APE", "TAK", "TrueHD", "DTS-HD MA"].includes(name);
}

export function FtChip({ name }: { name: string }) {
  const h = HUE[name];
  const full = FT_FULL[name] ?? name;
  if (h == null) return <span className="ft unk" title={full}>{name}</span>;
  return <span className={"ft" + (FT_LINE.has(name) ? " line" : "")} style={{ ["--h" as string]: h } as React.CSSProperties} title={full}>{name}</span>;
}
