"""ดึงไฟล์ DLL หนึ่งตัวออกจากตัวติดตั้ง NSIS แบบ LZMA ก้อนเดียว (solid) โดยไม่รันตัวติดตั้ง

ใช้กับตัวติดตั้งของ Monkey's Audio (MAC_<รุ่น>_x64.exe) เพราะ MACDll64.dll ที่แนบในชุด SDK 13.45 และ 13.46
เป็นไฟล์เก่ารุ่น 12.36 ที่ผู้ทำไม่ได้สร้างใหม่ ตัวที่ตรงรุ่นจริงมีเฉพาะในตัวติดตั้ง (vendor/README.md)

วิธี  อ่านหัว NSIS (firstheader ที่มีคำว่า NullsoftInst) ถอด LZMA ทั้งก้อน แล้วไล่ทีละก้อนข้อมูล
      (ทุกก้อนขึ้นต้นด้วยความยาว 4 ไบต์) หาก้อนที่เป็นไฟล์โปรแกรมซึ่งตาราง export ตั้งชื่อตัวเองตรงกับชื่อที่ขอ
      ไม่ต้องอ่านสคริปต์ติดตั้ง ไม่เขียนอะไรลงเครื่องนอกจากไฟล์ปลายทาง
ใช้   py -3 -I -X utf8 scripts/nsis-extract.py <ตัวติดตั้ง.exe> <ชื่อ export เช่น MACDll64.dll> <ไฟล์ปลายทาง>
      เจอ = เขียนไฟล์ พิมพ์รุ่นกับ SHA-256 จบด้วยรหัส 0 · ไม่เจอ = จบด้วยรหัส 1
"""
import hashlib
import lzma
import struct
import sys


def pe_export_name(x):
    """ชื่อ DLL ในตาราง export ของไฟล์โปรแกรม · ไม่มีหรืออ่านไม่ได้ = ข้อความว่าง"""
    try:
        lfanew = struct.unpack_from("<I", x, 0x3C)[0]
        if x[lfanew : lfanew + 4] != b"PE\0\0":
            return ""
        coff = lfanew + 4
        nsec = struct.unpack_from("<H", x, coff + 2)[0]
        optsz = struct.unpack_from("<H", x, coff + 16)[0]
        opt = coff + 20
        magic = struct.unpack_from("<H", x, opt)[0]
        exp_rva = struct.unpack_from("<I", x, opt + (112 if magic == 0x20B else 96))[0]
        if not exp_rva:
            return ""
        secs = []
        for k in range(nsec):
            s = opt + optsz + 40 * k
            vsize, vaddr, rsize, rptr = struct.unpack_from("<IIII", x, s + 8)
            secs.append((vaddr, max(vsize, rsize), rptr))

        def off(rva):
            for va, size, raw in secs:
                if va <= rva < va + size:
                    return rva - va + raw
            return None

        eo = off(exp_rva)
        no = off(struct.unpack_from("<I", x, eo + 12)[0]) if eo is not None else None
        return x[no : x.index(b"\0", no)].decode("ascii", "replace") if no is not None else ""
    except (struct.error, ValueError, TypeError):
        return ""


def file_version(x):
    """รุ่นจาก VS_FIXEDFILEINFO เช่น 13.46.0.0"""
    v = x.find(struct.pack("<I", 0xFEEF04BD))
    if v < 0:
        return ""
    ms, ls = struct.unpack_from("<II", x, v + 8)
    return f"{ms >> 16}.{ms & 0xFFFF}.{ls >> 16}.{ls & 0xFFFF}"


def main():
    src, want, dest = sys.argv[1], sys.argv[2], sys.argv[3]
    b = open(src, "rb").read()
    fh = b.find(b"NullsoftInst") - 8
    if fh < 0 or struct.unpack_from("<I", b, fh + 4)[0] != 0xDEADBEEF:
        sys.exit("ไม่ใช่ตัวติดตั้ง NSIS")
    arclen = struct.unpack_from("<I", b, fh + 24)[0]
    d = fh + 28
    props = b[d]
    if props != 0x5D:
        sys.exit(f"ไม่ใช่ LZMA ก้อนเดียวแบบที่รู้จัก (ไบต์แรก {props:#x})")
    dict_size = struct.unpack_from("<I", b, d + 1)[0]
    lc, rest = props % 9, props // 9
    dec = lzma.LZMADecompressor(
        format=lzma.FORMAT_RAW,
        filters=[{"id": lzma.FILTER_LZMA1, "dict_size": dict_size, "lc": lc, "lp": rest % 5, "pb": rest // 5}],
    )
    data = dec.decompress(b[d + 5 : fh + arclen])
    pos, n = 0, 0
    while pos + 4 <= len(data):
        ln = struct.unpack_from("<I", data, pos)[0] & 0x7FFFFFFF
        blk = data[pos + 4 : pos + 4 + ln]
        if len(blk) < ln:
            break
        # ก้อนแรกคือหัวสคริปต์ติดตั้ง ข้าม
        if n > 0 and blk[:2] == b"MZ" and pe_export_name(blk).lower() == want.lower():
            open(dest, "wb").write(blk)
            print(f"{want} รุ่น {file_version(blk)} · {ln:,} ไบต์ · SHA-256 {hashlib.sha256(blk).hexdigest()}")
            return 0
        pos += 4 + ln
        n += 1
    print(f"ไม่เจอ {want} ในตัวติดตั้ง (ไล่ {n} ก้อน)")
    return 1


if __name__ == "__main__":
    sys.exit(main())
