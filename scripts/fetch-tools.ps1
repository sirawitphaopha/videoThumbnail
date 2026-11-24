# แตกเครื่องมือจาก vendor ลง src-tauri\tools
# เช็ก SHA-256 ของไฟล์บีบอัดกับค่าที่จดไว้ใน vendor\README.md ก่อนแตกทุกครั้ง ค่าไม่ตรง = หยุด ไม่แตก
# ใช้ tar ของ Windows (System32) เพราะอ่าน .7z ได้ · tar ของ Git Bash อ่านไม่ได้
# รันซ้ำได้ ทับของเดิมใน src-tauri\tools

$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$tar  = Join-Path $env:WINDIR 'System32\tar.exe'

$mkv = @{ path = 'vendor\mkvtoolnix\mkvtoolnix-64-bit-103.0.7z';        sha = '01d76dbfdbd5615d9e02f69b0710d1429a902d47a98c8eee33bd884c4fcb3cbf' }
# FFmpeg 9.1 ชุด full ของ gyan.dev ออก 20 พ.ย. 2569 · อัปเดตจาก 9.0.2 พี่กันสั่ง 24 พ.ย. 2569 "อัปเดต เเละแก้ 156 เลย" (BUGS ข้อ 158) · ค่า SHA-256 ตรงกับที่ GitHub ของผู้ทำ (GyanD/codexffmpeg) ให้มา
$ff  = @{ path = 'vendor\ffmpeg\ffmpeg-9.1-full_build.7z';              sha = '1a86f2c8b51b4990ae9a0b0f8bd4f345f5c79389d293ac3fda128a58ec507b16' }
$mi  = @{ path = 'vendor\mediainfo\MediaInfo_CLI_26.10_Windows_x64.zip'; sha = '4cc94bd272903914c04f4f9a9f53a6c94b5ea6c6454cf738d29fa182c41e8a29' }
# ตัวแปลงเสียงของหน้าเสียงและซับกับหน้ากราฟเสียง (พี่กันอนุญาตโหลด 7 พ.ย. 2569 "โหลดเลย / และ mp3 เอาล่าสุด ล่าสุดทุกตัว")
$fl  = @{ path = 'vendor\flac\flac-1.5.0-win.zip';                      sha = '53f1500f0d6e7c61379d7fee50d4a9f7f504c650009506d9ba015530d76c0dde' }
$op  = @{ path = 'vendor\opus-tools\opus-tools-0.2-52-g5f894e9(using libopus 1.6.1-11-g788cc89)-x64.zip'; sha = 'e6ed867d539f609da32f4780af70fffe2ed75a2a7a9751d42537341ca7995a09' }
$lm  = @{ path = 'vendor\lame\lame-4.0-x64.zip';                        sha = '722f4311e2795d5c852076a579b3183beeb76e9010d9cab1e7f9d2e86d9d0808' }
$wv  = @{ path = 'vendor\wavpack\wavpack-5.9.0-x64.zip';                sha = 'ad5e94bcde6f4edfc859210d98f144f225805a391c633c68f6dbb15a9e52570e' }
# Monkey's Audio 13.50 · ชุด SDK ให้ข้อความสัญญาอนุญาต · ตัวติดตั้งให้ MACDll64.dll รุ่นจริง
# MACDll64.dll ในชุด SDK 13.45 และ 13.46 เป็นไฟล์เก่ารุ่น 12.36 ที่ผู้ทำไม่ได้สร้างใหม่ (vendor\README.md) จึงถอดจากตัวติดตั้งตลอด
# พี่กันอนุญาตโหลดตัวติดตั้ง 8 พ.ย. 2569 "จัดเลย / ลิง เอาไงงง ไปหามา" · อัปเดตเป็น 13.50 พี่กันสั่ง 24 พ.ย. 2569 "อัปเดต เเละแก้ 156 เลย" (BUGS ข้อ 158)
$ma  = @{ path = 'vendor\monkeys-audio\MAC_1350_SDK.zip';               sha = '64a347668211efbc564a8543b28be612895caddf0a5f317b9404255fcffc0be1' }
$mai = @{ path = 'vendor\monkeys-audio\MAC_1350_x64.exe';               sha = '970d7c70c9ba48ff1aec998e3f4405f0aad92f25ffbb3fe7028e13f9baca0a8d' }
$macDllSha = 'ebda7497b6d0b9f3292c83b9f6f4b348bf232469a19b7de01635d57069075fca'
# TAK 2.3.3 ฟรีสำหรับใช้ส่วนตัว แจกต่อได้เฉพาะไฟล์ zip เดิมทั้งไฟล์ไม่ดัดแปลง · แนบ zip ทั้งไฟล์ โปรแกรมแตก Takc.exe เอง (encode.rs ensure_tak)
# พี่กันสั่ง 7 พ.ย. 2569 "ลิง และ TAK เอามาด้วยนะ" · เว็บผู้ทำมีแต่ http · Takc.exe ในนี้ตรงทุกไบต์กับตัวที่ตัวติดตั้ง Monkey's Audio ที่มีลายเซ็นแนบมา
# qaac 3.07 (qaac64 refalac64 libsoxr64) Public Domain · ALAC ข้างในเป็น Apache 2.0 · แนบแบบ foobar2000 encoder pack · ไฟล์ของ Apple ไม่แนบ ผู้ใช้ติดตั้ง iTunes เอง
# พี่กันสั่ง 10 พ.ย. 2569 "อันไหนฟรี ทำได้ เอาเข้าหมด โดยไม่ต้องถาม ส่วน qaac เอาเข้าได้ แต่ต้องบอกผู้ใช้ให้โหลด itune เอง"
$qa  = @{ path = 'vendor\qaac\qaac_3.07.zip';                          sha = '1fb3ab4aa81725e2607ac1b31afa0e13d2617ee6eb5900f5070c092f5271cbb3' }
# libmpv ตัวเล่นหนังในหน้าแก้ซับแบบ Subtitle Edit (BUGS ข้อ 111 พี่กันสั่ง 14 พ.ย. 2569 "ทำตอนนี้เลย") ชุดของ shinchiro ที่หน้าเว็บ mpv แนะนำสำหรับ Windows
# ค่า SHA-256 ตรงกับที่หน้ารุ่นบน GitHub ให้มา · แบบธรรมดา x86_64 ไม่ใช่แบบ v3 ที่ต้องใช้ซีพียูรุ่นใหม่
$mpv = @{ path = 'vendor\mpv\mpv-dev-x86_64-20261111-git-bcde6b93cc.7z'; sha = '273c079b11ea5575822f972756f4c9a71149a5c10130353abeb8586738938452' }
$tk  = @{ path = 'vendor\tak\TAK_2.3.3.zip';                            sha = '40d26992266f1377d576b88b84b88d2ab256dc321e47f90314402a80692aba6a' }
# SUPer ตัวสร้าง PGS แบบมาตรฐาน Blu-ray ในหน้าต่างส่งออก PGS (พี่กันสั่ง 14 พ.ย. 2569 "ใส่ตัวสร้าง PGS ตอนที่ส่งออกด้วย") ชุดของผู้ทำ cubicibo
# โหลดจาก https://github.com/cubicibo/SUPer/releases รุ่น 0.3.0 · ค่า SHA-256 จดตอนเทียบเครื่องมือ PGS (docs/research/pgs-ส่งออกจาก-ass.md)
$sup = @{ path = 'vendor\super\win_x64_SUPer_CLI_v0.3.0.7z';            sha = 'f7036fa394f9ff7faa58183c515bf454f1e185c158cd5ac8fa2b9ea1b00754af' }
# SeConv ตัวแปลงซับแบบบรรทัดคำสั่งของ Subtitle Edit 5.4.0 ตัวสร้าง PGS ตัวที่สาม วาดด้วยตัววาดของมันเอง (พี่กันสั่ง 15 พ.ย. 2569 "เอามาด้วยก็ดีนะ เเต่ใส่หมายเหตุ")
# โหลดจาก https://github.com/SubtitleEdit/subtitleedit/releases รุ่น 5.4.0 · ค่า SHA-256 จดตอนเทียบเครื่องมือ PGS
$sec = @{ path = 'vendor\seconv\SeConv-Windows-x64.zip';                 sha = 'aea19664f460fcfb84e8ba8eca72419091818c6005d4e063d9950c41ea81062d' }
# BDSup2Sub++ ตัวแปลงซับภาพเป็นซับภาพ (BUGS ข้อ 125 พี่กันอนุญาตโหลด 15 พ.ย. 2569) รุ่น C++ ไม่ต้องมี Java
# โหลดจาก https://github.com/TheGreatMcPain/BDSup2SubPlusPlus/releases รุ่น 1.0.5 · ค่า SHA-256 ตรงกับที่หน้ารุ่นบน GitHub ให้มา
$bds = @{ path = 'vendor\bdsup2sub\bdsup2subplusplus-1.0.5-mingw-64bit.zip'; sha = 'e54385821c4b81ce6c68ad66d52239a08753ff648bcf743ef5beb1ae1feac955' }

foreach ($a in @($mkv, $ff, $mi, $fl, $op, $lm, $wv, $ma, $mai, $tk, $qa, $mpv, $sup, $sec, $bds)) {
  $full = Join-Path $root $a.path
  $h = (Get-FileHash -LiteralPath $full -Algorithm SHA256).Hash.ToLower()
  if ($h -ne $a.sha) { throw "ค่า SHA-256 ไม่ตรงกับที่จดไว้: $($a.path)" }
  Write-Host "SHA-256 ตรง: $($a.path)"
}

$work = Join-Path $env:TEMP 'movie-shelf-tools'
if (Test-Path -LiteralPath $work) { Remove-Item -LiteralPath $work -Recurse -Force }
New-Item -ItemType Directory -Force $work | Out-Null
foreach ($d in @('mediainfo', 'opus', 'lame', 'wavpack')) { New-Item -ItemType Directory -Force (Join-Path $work $d) | Out-Null }

& $tar -xf (Join-Path $root $mkv.path) -C $work `
  'mkvtoolnix/mkvmerge.exe' 'mkvtoolnix/mkvextract.exe' 'mkvtoolnix/mkvpropedit.exe' 'mkvtoolnix/doc/COPYING.txt'
if ($LASTEXITCODE -ne 0) { throw 'แตก MKVToolNix ไม่สำเร็จ' }

& $tar -xf (Join-Path $root $ff.path) -C $work `
  'ffmpeg-9.1-full_build/bin/ffmpeg.exe' 'ffmpeg-9.1-full_build/bin/ffprobe.exe' 'ffmpeg-9.1-full_build/LICENSE'
if ($LASTEXITCODE -ne 0) { throw 'แตก FFmpeg ไม่สำเร็จ' }

& $tar -xf (Join-Path $root $mi.path) -C (Join-Path $work 'mediainfo') 'MediaInfo.exe' 'LIBCURL.DLL' 'LICENSE'
if ($LASTEXITCODE -ne 0) { throw 'แตก MediaInfo ไม่สำเร็จ' }

# flac.exe ต้องมี libFLAC.dll ข้างกัน (ลองเปิดแบบไม่มี DLL แล้วไม่ขึ้น) · ตัว flac เป็น GPL ห้องสมุดเป็น BSD (Xiph)
& $tar -xf (Join-Path $root $fl.path) -C $work `
  'flac-1.5.0-win/Win64/flac.exe' 'flac-1.5.0-win/Win64/libFLAC.dll' 'flac-1.5.0-win/COPYING.GPL' 'flac-1.5.0-win/COPYING.Xiph' 'flac-1.5.0-win/COPYING.LGPL'
if ($LASTEXITCODE -ne 0) { throw 'แตก FLAC ไม่สำเร็จ' }

& $tar -xf (Join-Path $root $op.path) -C (Join-Path $work 'opus') 'opusenc.exe'
if ($LASTEXITCODE -ne 0) { throw 'แตก opusenc ไม่สำเร็จ' }

# lame.exe ต้องมี libmpg123-0.dll ข้างกัน (ลองเปิดแบบไม่มี DLL แล้วไม่ขึ้น)
& $tar -xf (Join-Path $root $lm.path) -C (Join-Path $work 'lame') 'lame.exe' 'libmpg123-0.dll'
if ($LASTEXITCODE -ne 0) { throw 'แตก LAME ไม่สำเร็จ' }

& $tar -xf (Join-Path $root $wv.path) -C (Join-Path $work 'wavpack') 'wavpack.exe' 'license.txt'
if ($LASTEXITCODE -ne 0) { throw 'แตก WavPack ไม่สำเร็จ' }

& $tar -xf (Join-Path $root $qa.path) -C $work 'qaac_3.07/x64/qaac64.exe' 'qaac_3.07/x64/refalac64.exe' 'qaac_3.07/x64/libsoxr64.dll'
if ($LASTEXITCODE -ne 0) { throw 'แตก qaac ไม่สำเร็จ' }

New-Item -ItemType Directory -Force (Join-Path $work 'mpv') | Out-Null
& $tar -xf (Join-Path $root $mpv.path) -C (Join-Path $work 'mpv') 'libmpv-2.dll'
if ($LASTEXITCODE -ne 0) { throw 'แตก libmpv ไม่สำเร็จ' }

# Monkey's Audio โปรแกรมเรียก MACDll64.dll ตรงจาก Rust (c_APECompress_StartW AddData Finish)
# ข้อความสัญญาอนุญาตเอาจากชุด SDK · ตัว DLL ดึงจากตัวติดตั้งด้วย scripts\nsis-extract.py (ถอดในเครื่อง ไม่รันตัวติดตั้ง ไม่มีหน้าต่าง)
& $tar -xf (Join-Path $root $ma.path) -C $work 'License.txt'
if ($LASTEXITCODE -ne 0) { throw "แตกสัญญาอนุญาตของ Monkey's Audio ไม่สำเร็จ" }
New-Item -ItemType Directory -Force (Join-Path $work 'Shared\64') | Out-Null
$macDll = Join-Path $work 'Shared\64\MACDll64.dll'
$py = Get-Command py -ErrorAction SilentlyContinue
if (-not $py) { throw 'ต้องมี Python (คำสั่ง py) ไว้ถอด MACDll64.dll จากตัวติดตั้ง Monkey''s Audio' }
& $py.Source -3 -I -X utf8 (Join-Path $PSScriptRoot 'nsis-extract.py') (Join-Path $root $mai.path) 'MACDll64.dll' $macDll
if ($LASTEXITCODE -ne 0) { throw "ถอด MACDll64.dll จากตัวติดตั้ง Monkey's Audio ไม่สำเร็จ" }
if ((Get-FileHash -LiteralPath $macDll -Algorithm SHA256).Hash.ToLower() -ne $macDllSha) { throw 'ค่า SHA-256 ของ MACDll64.dll ไม่ตรงกับที่จดไว้' }
$sig = Get-AuthenticodeSignature -LiteralPath $macDll
if ($sig.Status -ne 'Valid' -or $sig.SignerCertificate.Subject -notlike '*Matthew Ashland*') { throw "ลายเซ็นของ MACDll64.dll ไม่ถูกต้อง: $($sig.Status)" }
Write-Host "ลายเซ็น MACDll64.dll ถูกต้อง: $($sig.SignerCertificate.Subject)"

$dest = Join-Path $root 'src-tauri\tools'
$lic  = Join-Path $dest 'licenses'
New-Item -ItemType Directory -Force $dest | Out-Null
New-Item -ItemType Directory -Force $lic  | Out-Null

$copies = @(
  @('mkvtoolnix\mkvmerge.exe',                     'mkvmerge.exe'),
  @('mkvtoolnix\mkvextract.exe',                   'mkvextract.exe'),
  @('mkvtoolnix\mkvpropedit.exe',                  'mkvpropedit.exe'),
  @('ffmpeg-9.1-full_build\bin\ffmpeg.exe',      'ffmpeg.exe'),
  @('ffmpeg-9.1-full_build\bin\ffprobe.exe',     'ffprobe.exe'),
  @('mediainfo\MediaInfo.exe',                     'MediaInfo.exe'),
  @('mediainfo\LIBCURL.DLL',                       'LIBCURL.DLL'),
  @('mkvtoolnix\doc\COPYING.txt',                  'licenses\MKVToolNix-GPL-2.0.txt'),
  @('ffmpeg-9.1-full_build\LICENSE',             'licenses\FFmpeg-LICENSE.txt'),
  @('mediainfo\LICENSE',                           'licenses\MediaInfo-LICENSE.txt'),
  @('flac-1.5.0-win\Win64\flac.exe',               'flac.exe'),
  @('flac-1.5.0-win\Win64\libFLAC.dll',            'libFLAC.dll'),
  @('opus\opusenc.exe',                            'opusenc.exe'),
  @('lame\lame.exe',                               'lame.exe'),
  @('lame\libmpg123-0.dll',                        'libmpg123-0.dll'),
  @('wavpack\wavpack.exe',                         'wavpack.exe'),
  @('Shared\64\MACDll64.dll',                      'MACDll64.dll'),
  @('qaac_3.07\x64\qaac64.exe',                   'qaac64.exe'),
  @('qaac_3.07\x64\refalac64.exe',                'refalac64.exe'),
  @('qaac_3.07\x64\libsoxr64.dll',                'libsoxr64.dll'),
  @('flac-1.5.0-win\COPYING.GPL',                  'licenses\FLAC-tool-GPL-2.0.txt'),
  @('flac-1.5.0-win\COPYING.Xiph',                 'licenses\FLAC-libFLAC-Xiph-BSD.txt'),
  @('flac-1.5.0-win\COPYING.LGPL',                 'licenses\LAME-libmpg123-LGPL-2.1.txt'),
  @('wavpack\license.txt',                         'licenses\WavPack-BSD.txt'),
  @('License.txt',                                 'licenses\MonkeysAudio-BSD-3.txt'),
  @('mpv\libmpv-2.dll',                           'libmpv-2.dll')
)
foreach ($c in $copies) {
  Copy-Item -LiteralPath (Join-Path $work $c[0]) -Destination (Join-Path $dest $c[1]) -Force
}
# ไฟล์ zip ของ qaac ไม่มีข้อความสัญญา ใช้ COPYING จากที่เก็บของผู้ทำ (เก็บสำเนาไว้ที่ vendor\qaac\COPYING.txt)
Copy-Item -LiteralPath (Join-Path $root 'vendor\qaac\COPYING.txt') -Destination (Join-Path $lic 'qaac-COPYING.txt') -Force
# TAK แนบไฟล์ zip เดิมทั้งไฟล์ ตามเงื่อนไขการแจกของผู้ทำ (สัญญาอยู่ใน Readme.html ของแต่ละโฟลเดอร์ใน zip)
Copy-Item -LiteralPath (Join-Path $root $tk.path) -Destination (Join-Path $dest 'TAK_2.3.3.zip') -Force
# ข้อความสัญญาของ mpv ไม่มีในชุด dev เก็บสำเนาจากที่เก็บของ mpv ไว้ที่ vendor\mpv
Copy-Item -LiteralPath (Join-Path $root 'vendor\mpv\LICENSE.GPL.txt') -Destination (Join-Path $lic 'mpv-GPL-2.0.txt') -Force
Copy-Item -LiteralPath (Join-Path $root 'vendor\mpv\Copyright.txt') -Destination (Join-Path $lic 'mpv-Copyright.txt') -Force
# SUPer แตกทั้งโฟลเดอร์ SUPer_CLI ลง tools\super (โปรแกรม Python ที่รวมทุกอย่างมาแล้ว ราว 300 MB ต้องอยู่ครบทั้งโฟลเดอร์)
# config.ini กับ lib\libimagequant.dll อ้างจากโฟลเดอร์ของมันเอง โปรแกรมรัน SUPer โดยตั้งโฟลเดอร์ทำงานเป็นโฟลเดอร์นี้ (pgs.rs run_super)
$supWork = Join-Path $work 'super-x'
New-Item -ItemType Directory -Force $supWork | Out-Null
& $tar -xf (Join-Path $root $sup.path) -C $supWork
if ($LASTEXITCODE -ne 0) { throw 'แตก SUPer ไม่สำเร็จ' }
$supDest = Join-Path $dest 'super'
if (Test-Path -LiteralPath $supDest) { Remove-Item -LiteralPath $supDest -Recurse -Force }
Copy-Item -LiteralPath (Join-Path $supWork 'SUPer_CLI') -Destination $supDest -Recurse -Force
if (-not (Test-Path -LiteralPath (Join-Path $supDest 'SUPer_CLI.exe'))) { throw 'ไม่เจอ SUPer_CLI.exe หลังแตก' }
# ปิดการใช้การ์ดจอของ SUPer (use_gpu=0) ใช้ซีพียูเร็วพอกัน 8 กับ 9 วินาทีกับซับทดสอบ ไม่พึ่งไดรเวอร์ OpenCL ของการ์ดจอในตัว (15 พ.ย. 2569 · pgs.rs run_super)
$supIni = Join-Path $supDest 'config.ini'
$iniText = [System.IO.File]::ReadAllText($supIni) -replace '(?m)^use_gpu=1', 'use_gpu=0'
[System.IO.File]::WriteAllText($supIni, $iniText)
if ($iniText -notmatch '(?m)^use_gpu=0') { throw 'ตั้ง use_gpu=0 ใน config.ini ของ SUPer ไม่สำเร็จ' }
# SeConv แตกเฉพาะตัวโปรแกรมกับสองไฟล์ที่ตัววาดต้องใช้ลง tools\seconv (libse.xml เป็นคำอธิบายของนักพัฒนา ไม่ต้องใช้)
$secDest = Join-Path $dest 'seconv'
New-Item -ItemType Directory -Force $secDest | Out-Null
& $tar -xf (Join-Path $root $sec.path) -C $secDest 'seconv.exe' 'libSkiaSharp.dll' 'libHarfBuzzSharp.dll'
if ($LASTEXITCODE -ne 0) { throw 'แตก SeConv ไม่สำเร็จ' }
Copy-Item -LiteralPath (Join-Path $root 'vendor\seconv\LICENSE.txt') -Destination (Join-Path $lic 'SubtitleEdit-SeConv-MIT.txt') -Force
# ชุดของผู้ทำไม่มีข้อความสัญญา เก็บสำเนาจากที่เก็บของผู้ทำไว้ที่ vendor\super\LICENSE.txt
Copy-Item -LiteralPath (Join-Path $root 'vendor\super\LICENSE.txt') -Destination (Join-Path $lic 'SUPer-GPL-3.0.txt') -Force
# BDSup2Sub++ ไฟล์เดียว (Qt แบบรวมในตัว เป็นโปรแกรมคอนโซล เปิดแบบซ่อนคอนโซลแล้วไม่มีหน้าต่างเด้ง imgconv.rs) ลง tools\bdsup2sub
$bdsDest = Join-Path $dest 'bdsup2sub'
New-Item -ItemType Directory -Force $bdsDest | Out-Null
& $tar -xf (Join-Path $root $bds.path) -C $bdsDest 'bdsup2sub++.exe'
if ($LASTEXITCODE -ne 0) { throw 'แตก BDSup2Sub++ ไม่สำเร็จ' }
# ชุดของผู้ทำไม่มีข้อความสัญญา เก็บสำเนา apache_license_2.txt จากที่เก็บของผู้ทำไว้ที่ vendor\bdsup2sub\LICENSE.txt
Copy-Item -LiteralPath (Join-Path $root 'vendor\bdsup2sub\LICENSE.txt') -Destination (Join-Path $lic 'BDSup2SubPlusPlus-Apache-2.0.txt') -Force

# ระบบ OCR ซับรูป แตกจาก vendor\ocr ลง tools\ocr (สคริปต์แยก รันเดี่ยวได้)
& (Join-Path $PSScriptRoot 'fetch-ocr-tools.ps1')

# libheif ตัวจริงสำหรับบันทึกรูปกราฟเป็น HEIC เช็ก hash กับลายเซ็นในตัวนั้น
& (Join-Path $PSScriptRoot 'fetch-heif.ps1')

$sources = @"
ที่มาของเครื่องมือในโฟลเดอร์นี้ (แตกจาก vendor ด้วย scripts\fetch-tools.ps1)
- MKVToolNix 103.0 แบบพกพา 64 บิต · สัญญา GPL v2 · ซอร์สโค้ด https://mkvtoolnix.download/source.html (เก็บสำเนาไว้ที่ vendor\mkvtoolnix-source)
- FFmpeg 9.1 full build จาก https://www.gyan.dev/ffmpeg/builds/ · สัญญา GPL v3 · ซอร์สโค้ด https://ffmpeg.org/download.html
- MediaInfo CLI 26.10 จาก https://mediaarea.net/ · สัญญา BSD-2-Clause
- FLAC 1.5.0 (flac.exe libFLAC.dll) จาก https://xiph.org/flac/download.html · ตัว flac สัญญา GPL v2 ห้องสมุด libFLAC สัญญา BSD (Xiph) · ซอร์สโค้ด https://github.com/xiph/flac
- opusenc จาก opus-tools 0.2-52-g5f894e9 ทำด้วย libopus 1.6.1 · ชุดที่ทำโดย RareWares https://www.rarewares.org/files/opus/ · สัญญา BSD 2 ข้อ (Xiph) ไฟล์บีบอัดไม่มีข้อความสัญญาแนบ ข้อความเต็มอยู่ https://github.com/xiph/opus-tools/blob/master/COPYING และ https://opus-codec.org/license/
- LAME 4.0 (lame.exe libmpg123-0.dll) · ชุดที่ทำโดย RareWares https://www.rarewares.org/files/mp3/ · LAME สัญญา LGPL รุ่น 2 หรือใหม่กว่า libmpg123 สัญญา LGPL 2.1 (ใช้ข้อความ LGPL 2.1 จากชุด FLAC เพราะไฟล์บีบอัดไม่มีข้อความสัญญาแนบ) · ซอร์สโค้ด https://lame.sourceforge.io/ และ https://www.mpg123.de/
- WavPack 5.9.0 (wavpack.exe) จาก https://github.com/dbry/WavPack/releases · สัญญา BSD 3 ข้อ
- Monkey's Audio 13.50 (MACDll64.dll จากตัวติดตั้ง MAC_1350_x64.exe มีลายเซ็นของผู้ทำ ข้อความสัญญาจากชุด SDK) จาก https://www.monkeysaudio.com/ · สัญญา BSD 3 ข้อ
- qaac 3.07 (qaac64.exe refalac64.exe libsoxr64.dll) จาก https://github.com/nu774/qaac/releases · ตัว qaac เป็น Public Domain · ตัวเข้ารหัส ALAC ของ Apple ข้างในสัญญา Apache 2.0 (https://www.apache.org/licenses/LICENSE-2.0) · ส่วนอื่นข้างใน (TagLib libsoxr FDK mmtisobmff และอื่น ๆ) ดู licenses\qaac-COPYING.txt · ซอร์สโค้ด https://github.com/nu774/qaac · qaac ใช้ตัวเข้ารหัส AAC ของ Apple ที่มากับ iTunes ไฟล์ของ Apple ไม่ได้แนบ ผู้ใช้ติดตั้ง iTunes เอง
- TAK 2.3.3 (TAK_2.3.3.zip ไฟล์เดิมทั้งไฟล์ โปรแกรมแตก Takc.exe ไปใช้เอง) จาก http://www.thbeck.de/Tak/Tak.html · ฟรีสำหรับใช้ส่วนตัวที่ไม่ใช่การค้า แจกต่อได้เฉพาะไฟล์ zip เดิมทั้งไฟล์ ไม่คิดเงิน
- libheif 1.23.7 (heif.dll ใช้บันทึกรูปกราฟเป็น HEIC) พร้อม libx265 3.5 libde265 1.1.3 aom 3.15.3 dav1d 1.5.4 libsharpyuv จาก libwebp 1.6.0 · ตัวที่ conda-forge สร้าง https://conda-forge.org/ · libheif กับ libde265 สัญญา LGPL รุ่น 3 หรือใหม่กว่า · x265 สัญญา GPL รุ่น 2 หรือใหม่กว่า · aom dav1d libsharpyuv สัญญา BSD · ซอร์สโค้ด https://github.com/strukturag/libheif https://bitbucket.org/multicoreware/x265_git https://github.com/strukturag/libde265 https://aomedia.googlesource.com/aom https://code.videolan.org/videolan/dav1d https://chromium.googlesource.com/webm/libwebp และสูตรสร้าง https://github.com/conda-forge
- libmpv 2 (libmpv-2.dll ตัวเล่นหนังในหน้าแก้ซับ) ชุด mpv-dev-x86_64-20261111-git-bcde6b93cc จาก https://github.com/shinchiro/mpv-winbuild-cmake/releases · สัญญา GPL รุ่น 2 หรือใหม่กว่า · ซอร์สโค้ด https://github.com/mpv-player/mpv และสูตรสร้าง https://github.com/shinchiro/mpv-winbuild-cmake
- SUPer 0.3.0 (โฟลเดอร์ super ตัวสร้าง PGS แบบมาตรฐาน Blu-ray) ชุด win_x64_SUPer_CLI_v0.3.0.7z จาก https://github.com/cubicibo/SUPer/releases · สัญญา GPL รุ่น 3 (licenses\SUPer-GPL-3.0.txt) · ข้างในมี Python numpy Pillow และ libimagequant (lib\libimagequant.dll สัญญา GPL รุ่น 3 หรือใหม่กว่า) สัญญาของแต่ละตัวอยู่ในโฟลเดอร์ super\_internal · ซอร์สโค้ด https://github.com/cubicibo/SUPer และ https://github.com/ImageOptim/libimagequant
- SeConv 5.4.0 (โฟลเดอร์ seconv ตัวแปลงซับแบบบรรทัดคำสั่งของ Subtitle Edit ใช้เป็นตัวสร้าง PGS ตัวที่สาม) ชุด SeConv-Windows-x64.zip จาก https://github.com/SubtitleEdit/subtitleedit/releases · สัญญา MIT (licenses\SubtitleEdit-SeConv-MIT.txt) · ข้างในมี SkiaSharp กับ HarfBuzzSharp (MIT) · ซอร์สโค้ด https://github.com/SubtitleEdit/subtitleedit
- BDSup2Sub++ 1.0.5 (โฟลเดอร์ bdsup2sub ตัวแปลงซับภาพเป็นซับภาพ VobSub PGS BDN XML) ชุด bdsup2subplusplus-1.0.5-mingw-64bit.zip จาก https://github.com/TheGreatMcPain/BDSup2SubPlusPlus/releases · สัญญา Apache 2.0 (licenses\BDSup2SubPlusPlus-Apache-2.0.txt) · ข้างในรวม Qt ไว้ในตัว (LGPL) · ซอร์สโค้ด https://github.com/TheGreatMcPain/BDSup2SubPlusPlus
- ระบบ OCR ซับรูป (โฟลเดอร์ ocr) · ONNX Runtime 1.32.0 CPU (onnxruntime.dll) จาก https://github.com/microsoft/onnxruntime/releases สัญญา MIT (licenses\onnxruntime-MIT.txt) · โมเดล PaddleOCR แบบ ONNX ของ PaddlePaddle บน https://huggingface.co/PaddlePaddle (แนบ PP-OCRv6 tiny small medium rec det · PP-OCRv5 mobile rec ของ th en · PP-LCNet textline_ori · ภาษาอื่นของ PP-OCRv5 ผู้ใช้โหลดในโปรแกรมจากที่เดียวกัน) สัญญา Apache 2.0 · Tesseract 5.5.3 แบบไม่ต้องติดตั้งจาก https://github.com/SubtitleEdit/support-files/releases (tesseract553) สัญญา Apache 2.0 ซอร์สโค้ด https://github.com/tesseract-ocr/tesseract · ข้างใน Tesseract มีห้องสมุดของ MSYS2 (Leptonica BSD 2 ข้อ libpng libjpeg libtiff libwebp zlib libcurl libarchive และอื่น ๆ สัญญาแบบเปิด) · ชุดภาษา eng tha jpn jpn_vert osd จาก https://github.com/tesseract-ocr/tessdata_best สัญญา Apache 2.0 · พจนานุกรม Hunspell en_US en_GB th_TH จาก https://github.com/LibreOffice/dictionaries สัญญาตามไฟล์ licenses\Hunspell-README_*.txt · ฐาน nOCR Binary OCR รายการแก้คำ OCR ชื่อเฉพาะ รายการแยกคำ จาก https://github.com/SubtitleEdit/subtitleedit (commit 0a323e27) สัญญา MIT (licenses\SubtitleEdit-OCR-MIT.txt) · ค่า SHA-256 ทุกไฟล์อยู่ใน vendor\ocr\manifest.json
- Microsoft Visual C++ runtime 14.51 (msvcp140.dll vcruntime140.dll vcruntime140_1.dll มีลายเซ็น Microsoft) แนบให้ heif.dll เปิดได้บนเครื่องที่ไม่มี Visual C++ Redistributable · เงื่อนไขอยู่ใน licenses\MSVC-Runtime-LICENSE.txt
"@
Set-Content -LiteralPath (Join-Path $lic 'SOURCES.txt') -Value $sources -Encoding UTF8

Remove-Item -LiteralPath $work -Recurse -Force

Write-Host ''
Write-Host 'ไฟล์ใน src-tauri\tools:'
Get-ChildItem -LiteralPath $dest -File | ForEach-Object {
  '{0,-16} {1,12:N0} ไบต์  {2}' -f $_.Name, $_.Length, (Get-FileHash -LiteralPath $_.FullName -Algorithm SHA256).Hash.Substring(0, 16).ToLower()
}
