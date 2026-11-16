# โหลดของที่แนบมากับระบบ OCR ซับรูปลง vendor/ocr (แผน OCR ขั้น 0 · BUGS ข้อ 143)
# พี่กันสั่ง 16 พ.ย. 2569 "ก็เอามาทุกตัวที่เอาเข้ามาได้ ใส่ในโปรแกรมเลย เอาให้ครบ ไม่ต้อโหลดเเยก"
# ใช้ตอนพัฒนาเท่านั้น ผู้ใช้ไม่ต้องมี Python · ทุกไฟล์ล็อกรุ่นด้วยรหัส commit และจด sha256 ลง vendor/ocr/manifest.json
# ไฟล์ที่มีอยู่แล้วและ sha256 ตรงไม่โหลดซ้ำ · ใช้: py -3 scripts/fetch-ocr.py
import hashlib, json, os, sys, urllib.request

sys.stdout.reconfigure(encoding="utf-8")
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, "vendor", "ocr")
UA = {"User-Agent": "movie-shelf-fetch"}

PADDLE = ["PP-OCRv6_tiny_rec", "PP-OCRv6_small_rec", "PP-OCRv6_medium_rec", "PP-OCRv6_tiny_det", "PP-OCRv6_small_det", "PP-OCRv6_medium_det",
          "th_PP-OCRv5_mobile_rec", "en_PP-OCRv5_mobile_rec", "latin_PP-OCRv5_mobile_rec", "korean_PP-OCRv5_mobile_rec", "cyrillic_PP-OCRv5_mobile_rec",
          "arabic_PP-OCRv5_mobile_rec", "devanagari_PP-OCRv5_mobile_rec", "el_PP-OCRv5_mobile_rec", "eslav_PP-OCRv5_mobile_rec", "ta_PP-OCRv5_mobile_rec",
          "te_PP-OCRv5_mobile_rec", "PP-LCNet_x0_25_textline_ori", "PP-LCNet_x1_0_textline_ori"]
ORT_VER = "1.32.0"
TESSDATA = ["eng", "tha", "jpn", "jpn_vert", "osd"]
HUNSPELL = ["en_US", "en_GB", "th_TH"]


def get_json(url):
    return json.load(urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=60))


def sha256(path):
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for b in iter(lambda: f.read(1 << 20), b""):
            h.update(b)
    return h.hexdigest()


manifest = {}
mpath = os.path.join(OUT, "manifest.json")
if os.path.exists(mpath):
    manifest = json.load(open(mpath, encoding="utf-8"))


def fetch(rel, url, want=None):
    path = os.path.join(OUT, rel)
    os.makedirs(os.path.dirname(path), exist_ok=True)
    old = manifest.get(rel)
    if os.path.exists(path) and old and sha256(path) == old["sha256"]:
        print("มีแล้ว", rel)
        return
    tmp = path + ".partial"
    with urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=120) as r, open(tmp, "wb") as f:
        while True:
            b = r.read(1 << 20)
            if not b:
                break
            f.write(b)
    got = sha256(tmp)
    if want and got != want:
        os.remove(tmp)
        raise SystemExit(f"sha256 ไม่ตรง {rel} ได้ {got} ต้องเป็น {want}")
    os.replace(tmp, path)
    manifest[rel] = {"url": url, "sha256": got, "size": os.path.getsize(path)}
    print("โหลดแล้ว", rel, os.path.getsize(path))
    json.dump(manifest, open(mpath, "w", encoding="utf-8"), ensure_ascii=False, indent=1)


# PaddleOCR แบบ ONNX ของ PaddlePaddle บน Hugging Face · ล็อกที่ commit ล่าสุดตอนโหลด · sha256 ของไฟล์ใหญ่มาจาก LFS ของ Hugging Face
for mid in PADDLE:
    repo = f"PaddlePaddle/{mid}_onnx"
    d = get_json(f"https://huggingface.co/api/models/{repo}?blobs=true")
    rev = d["sha"]
    for s in d["siblings"]:
        name = s["rfilename"]
        if name in (".gitattributes", "README.md"):
            continue
        want = (s.get("lfs") or {}).get("sha256")
        fetch(f"paddle/{mid}/{name}", f"https://huggingface.co/{repo}/resolve/{rev}/{name}", want)

# ONNX Runtime CPU ของ Microsoft
fetch(f"onnxruntime-win-x64-{ORT_VER}.zip", f"https://github.com/microsoft/onnxruntime/releases/download/v{ORT_VER}/onnxruntime-win-x64-{ORT_VER}.zip")

# Tesseract 5.5.3 แบบไม่ต้องติดตั้งที่ Subtitle Edit ใช้ · ต้นทางออก 5.5.4 แล้ว (28 ต.ค. 2569) แต่ยังไม่มีตัว Windows ที่โหลดได้
# (UB Mannheim บน GitHub มีถึง 5.4.0 เว็บ digi.bib.uni-mannheim.de ตอบ 403 กับโปรแกรม ลอง 16 พ.ย. 2569)
fetch("Tesseract553.zip", "https://github.com/SubtitleEdit/support-files/releases/download/tesseract553/Tesseract553.zip")
# ใน zip ไม่มีไฟล์สัญญา ใช้ของที่เก็บ Tesseract (Apache 2.0) ที่ป้าย 5.5.0 ข้อความเดียวกับรุ่น 5.5.3 · ใช้เป็นข้อความสัญญาของโมเดล PaddleOCR ด้วย (Apache 2.0 เหมือนกัน)
fetch("tesseract-LICENSE", "https://raw.githubusercontent.com/tesseract-ocr/tesseract/5.5.0/LICENSE")

# ชุดภาษา Tesseract แบบ best · ล็อกที่ commit ล่าสุดของ tessdata_best
tb = get_json("https://api.github.com/repos/tesseract-ocr/tessdata_best/commits/main")["sha"]
for lang in TESSDATA:
    fetch(f"tessdata/{lang}.traineddata", f"https://raw.githubusercontent.com/tesseract-ocr/tessdata_best/{tb}/{lang}.traineddata")
fetch("tessdata/LICENSE", f"https://raw.githubusercontent.com/tesseract-ocr/tessdata_best/{tb}/LICENSE")

# พจนานุกรม Hunspell ของ LibreOffice (ลิงก์เดียวกับ Subtitle Edit HunspellDictionaries.json) · ล็อกที่ commit ล่าสุด
lo = get_json("https://api.github.com/repos/LibreOffice/dictionaries/commits/master")["sha"]
for code in HUNSPELL:
    folder = code if code != "en_US" and code != "en_GB" else "en"
    for ext in ("aff", "dic"):
        fetch(f"hunspell/{code}.{ext}", f"https://raw.githubusercontent.com/LibreOffice/dictionaries/{lo}/{folder}/{code}.{ext}")
for f in ("en/README_en_US.txt", "en/README_en_GB.txt", "th_TH/README_th_TH.txt"):
    try:
        fetch(f"hunspell/{os.path.basename(f)}", f"https://raw.githubusercontent.com/LibreOffice/dictionaries/{lo}/{f}")
    except Exception as e:
        print("ไม่มีไฟล์สัญญา", f, e)

# ฐาน nOCR Binary OCR รายการแก้คำ OCR ชื่อเฉพาะ รายการแยกคำ และไฟล์พจนานุกรมอื่นของ Subtitle Edit (MIT) · ล็อกที่ commit ที่แคลร์อ่านซอร์ส
SE_REV = "0a323e27ddf2d9263fd7d1253ce7f7ae284dc827"
tree = get_json(f"https://api.github.com/repos/SubtitleEdit/subtitleedit/git/trees/{SE_REV}?recursive=1")["tree"]
for t in tree:
    p = t["path"]
    if t["type"] == "blob" and (p.startswith("Dictionaries/") or p.startswith("Ocr/")) or p == "LICENSE":
        fetch(f"subtitleedit/{p}", f"https://raw.githubusercontent.com/SubtitleEdit/subtitleedit/{SE_REV}/{p}")

json.dump(manifest, open(mpath, "w", encoding="utf-8"), ensure_ascii=False, indent=1)
print("ครบ", len(manifest), "ไฟล์", round(sum(v["size"] for v in manifest.values()) / 1e6, 1), "MB")
