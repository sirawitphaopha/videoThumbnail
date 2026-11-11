# แกะตัวติดตั้ง NSIS ของ MediaInfo แบบอ่านอย่างเดียวในหน่วยความจำ ไม่เขียนไฟล์ ไม่รันอะไร
# ลองถอด LZMA แบบดิบ (คุณสมบัติ 5 ไบต์ ไม่มีความยาว) ทั้งแบบก้อนเดียว และแบบมีความยาว 4 ไบต์นำหน้า แล้วลอง zlib bzip2
import bz2, lzma, re, struct, sys, zlib
x = open(sys.argv[1], "rb").read()
i = x.find(b"NullsoftInst")
if i < 0:
    sys.exit("ไม่ใช่ NSIS")
base = i + 12 + 8
def raw_lzma(buf):
    p = buf[0]; dict_size = struct.unpack_from("<I", buf, 1)[0]
    lc, rem = p % 9, p // 9; lp, pb = rem % 5, rem // 5
    f = [{"id": lzma.FILTER_LZMA1, "dict_size": dict_size, "lc": lc, "lp": lp, "pb": pb}]
    return lzma.LZMADecompressor(format=lzma.FORMAT_RAW, filters=f).decompress(buf[5:], max_length=300_000_000)
data, how = None, ""
for skip, name in ((0, "LZMA ก้อนเดียว"), (4, "LZMA ทีละก้อน")):
    try:
        d = raw_lzma(x[base + skip:])
        if len(d) > 10_000:
            data, how = d, name; break
    except Exception as e:
        pass
if data is None:
    for skip in (0, 4):
        for name, fn in (("zlib", lambda b: zlib.decompressobj(-15).decompress(b, 300_000_000)), ("bzip2", bz2.decompress)):
            try:
                d = fn(x[base + skip:])
                if len(d) > 10_000:
                    data, how = d, name; break
            except Exception:
                pass
        if data: break
if data is None:
    sys.exit("ถอดไม่ได้ทุกแบบ")
print("ถอดได้แบบ", how, len(data), "ไบต์")
words = set()
for enc, pat in (("utf-16le", rb"(?:[\x20-\x7e]\x00){4,60}"), ("latin1", rb"[\x20-\x7e]{4,60}")):
    for m in re.finditer(pat, data):
        s = m.group().decode(enc, "ignore").strip()
        if re.search(r"(?i)\b(easy|sheet|tree view|treeview|text view|html|xml|json|csv|compare|export|ebucore|pbcore|mpeg-7|nfo|shell extension|context menu|infotip|tooltip|graph)\b", s):
            words.add(s)
for w in sorted(words)[:150]:
    print(w)
