# แตกเครื่องมือจาก vendor ลง src-tauri\tools
# เช็ก SHA-256 ของไฟล์บีบอัดกับค่าที่จดไว้ใน vendor\README.md ก่อนแตกทุกครั้ง ค่าไม่ตรง = หยุด ไม่แตก
# ใช้ tar ของ Windows (System32) เพราะอ่าน .7z ได้ · tar ของ Git Bash อ่านไม่ได้
# รันซ้ำได้ ทับของเดิมใน src-tauri\tools

$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$tar  = Join-Path $env:WINDIR 'System32\tar.exe'

$mkv = @{ path = 'vendor\mkvtoolnix\mkvtoolnix-64-bit-103.0.7z';        sha = '01d76dbfdbd5615d9e02f69b0710d1429a902d47a98c8eee33bd884c4fcb3cbf' }
$ff  = @{ path = 'vendor\ffmpeg\ffmpeg-9.0.2-full_build.7z';            sha = 'f0e46253c70dfe902bac915dfb4224f0cf1b7c6eeab9da2ccc9a5581f9a71b13' }
$mi  = @{ path = 'vendor\mediainfo\MediaInfo_CLI_26.10_Windows_x64.zip'; sha = '4cc94bd272903914c04f4f9a9f53a6c94b5ea6c6454cf738d29fa182c41e8a29' }
# ตัวแปลงเสียงของหน้าเสียงและซับกับหน้ากราฟเสียง (พี่กันอนุญาตโหลด 7 พ.ย. 2569 "โหลดเลย / และ mp3 เอาล่าสุด ล่าสุดทุกตัว")
$fl  = @{ path = 'vendor\flac\flac-1.5.0-win.zip';                      sha = '53f1500f0d6e7c61379d7fee50d4a9f7f504c650009506d9ba015530d76c0dde' }
$op  = @{ path = 'vendor\opus-tools\opus-tools-0.2-52-g5f894e9(using libopus 1.6.1-11-g788cc89)-x64.zip'; sha = 'e6ed867d539f609da32f4780af70fffe2ed75a2a7a9751d42537341ca7995a09' }
$lm  = @{ path = 'vendor\lame\lame-4.0-x64.zip';                        sha = '722f4311e2795d5c852076a579b3183beeb76e9010d9cab1e7f9d2e86d9d0808' }
$wv  = @{ path = 'vendor\wavpack\wavpack-5.9.0-x64.zip';                sha = 'ad5e94bcde6f4edfc859210d98f144f225805a391c633c68f6dbb15a9e52570e' }
# Monkey's Audio 13.46 (ออก 7 พ.ย. 2569) · ชุด SDK ให้ข้อความสัญญาอนุญาต · ตัวติดตั้งให้ MACDll64.dll รุ่นจริง
# MACDll64.dll ในชุด SDK 13.45 และ 13.46 เป็นไฟล์เก่ารุ่น 12.36 ที่ผู้ทำไม่ได้สร้างใหม่ (vendor\README.md)
# พี่กันอนุญาตโหลดตัวติดตั้ง 8 พ.ย. 2569 "จัดเลย / ลิง เอาไงงง ไปหามา"
$ma  = @{ path = 'vendor\monkeys-audio\MAC_1346_SDK.zip';               sha = '17359c36099b7e1000da40306905f027088ac798fed1cb5e2405c33aaa030f83' }
$mai = @{ path = 'vendor\monkeys-audio\MAC_1346_x64.exe';               sha = '6a45c39588160e4154f23cb71607062131fbbec1cc4f566ddb92efc5bddbcf49' }
$macDllSha = '281a72e6e27a49c03a41b02542490f296f235fd2fec30e62c1b0783f653c3a6c'
# TAK 2.3.3 ฟรีสำหรับใช้ส่วนตัว แจกต่อได้เฉพาะไฟล์ zip เดิมทั้งไฟล์ไม่ดัดแปลง · แนบ zip ทั้งไฟล์ โปรแกรมแตก Takc.exe เอง (encode.rs ensure_tak)
# พี่กันสั่ง 7 พ.ย. 2569 "ลิง และ TAK เอามาด้วยนะ" · เว็บผู้ทำมีแต่ http · Takc.exe ในนี้ตรงทุกไบต์กับตัวที่ตัวติดตั้ง Monkey's Audio ที่มีลายเซ็นแนบมา
# qaac 3.07 (qaac64 refalac64 libsoxr64) Public Domain · ALAC ข้างในเป็น Apache 2.0 · แนบแบบ foobar2000 encoder pack · ไฟล์ของ Apple ไม่แนบ ผู้ใช้ติดตั้ง iTunes เอง
# พี่กันสั่ง 10 พ.ย. 2569 "อันไหนฟรี ทำได้ เอาเข้าหมด โดยไม่ต้องถาม ส่วน qaac เอาเข้าได้ แต่ต้องบอกผู้ใช้ให้โหลด itune เอง"
$qa  = @{ path = 'vendor\qaac\qaac_3.07.zip';                          sha = '1fb3ab4aa81725e2607ac1b31afa0e13d2617ee6eb5900f5070c092f5271cbb3' }
$tk  = @{ path = 'vendor\tak\TAK_2.3.3.zip';                            sha = '40d26992266f1377d576b88b84b88d2ab256dc321e47f90314402a80692aba6a' }

foreach ($a in @($mkv, $ff, $mi, $fl, $op, $lm, $wv, $ma, $mai, $tk, $qa)) {
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
  'ffmpeg-9.0.2-full_build/bin/ffmpeg.exe' 'ffmpeg-9.0.2-full_build/bin/ffprobe.exe' 'ffmpeg-9.0.2-full_build/LICENSE'
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
  @('ffmpeg-9.0.2-full_build\bin\ffmpeg.exe',      'ffmpeg.exe'),
  @('ffmpeg-9.0.2-full_build\bin\ffprobe.exe',     'ffprobe.exe'),
  @('mediainfo\MediaInfo.exe',                     'MediaInfo.exe'),
  @('mediainfo\LIBCURL.DLL',                       'LIBCURL.DLL'),
  @('mkvtoolnix\doc\COPYING.txt',                  'licenses\MKVToolNix-GPL-2.0.txt'),
  @('ffmpeg-9.0.2-full_build\LICENSE',             'licenses\FFmpeg-LICENSE.txt'),
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
  @('License.txt',                                 'licenses\MonkeysAudio-BSD-3.txt')
)
foreach ($c in $copies) {
  Copy-Item -LiteralPath (Join-Path $work $c[0]) -Destination (Join-Path $dest $c[1]) -Force
}
# ไฟล์ zip ของ qaac ไม่มีข้อความสัญญา ใช้ COPYING จากที่เก็บของผู้ทำ (เก็บสำเนาไว้ที่ vendor\qaac\COPYING.txt)
Copy-Item -LiteralPath (Join-Path $root 'vendor\qaac\COPYING.txt') -Destination (Join-Path $lic 'qaac-COPYING.txt') -Force
# TAK แนบไฟล์ zip เดิมทั้งไฟล์ ตามเงื่อนไขการแจกของผู้ทำ (สัญญาอยู่ใน Readme.html ของแต่ละโฟลเดอร์ใน zip)
Copy-Item -LiteralPath (Join-Path $root $tk.path) -Destination (Join-Path $dest 'TAK_2.3.3.zip') -Force

# libheif ตัวจริงสำหรับบันทึกรูปกราฟเป็น HEIC เช็ก hash กับลายเซ็นในตัวนั้น
& (Join-Path $PSScriptRoot 'fetch-heif.ps1')

$sources = @"
ที่มาของเครื่องมือในโฟลเดอร์นี้ (แตกจาก vendor ด้วย scripts\fetch-tools.ps1)
- MKVToolNix 103.0 แบบพกพา 64 บิต · สัญญา GPL v2 · ซอร์สโค้ด https://mkvtoolnix.download/source.html (เก็บสำเนาไว้ที่ vendor\mkvtoolnix-source)
- FFmpeg 9.0.2 full build จาก https://www.gyan.dev/ffmpeg/builds/ · สัญญา GPL v3 · ซอร์สโค้ด https://ffmpeg.org/download.html
- MediaInfo CLI 26.10 จาก https://mediaarea.net/ · สัญญา BSD-2-Clause
- FLAC 1.5.0 (flac.exe libFLAC.dll) จาก https://xiph.org/flac/download.html · ตัว flac สัญญา GPL v2 ห้องสมุด libFLAC สัญญา BSD (Xiph) · ซอร์สโค้ด https://github.com/xiph/flac
- opusenc จาก opus-tools 0.2-52-g5f894e9 ทำด้วย libopus 1.6.1 · ชุดที่ทำโดย RareWares https://www.rarewares.org/files/opus/ · สัญญา BSD 2 ข้อ (Xiph) ไฟล์บีบอัดไม่มีข้อความสัญญาแนบ ข้อความเต็มอยู่ https://github.com/xiph/opus-tools/blob/master/COPYING และ https://opus-codec.org/license/
- LAME 4.0 (lame.exe libmpg123-0.dll) · ชุดที่ทำโดย RareWares https://www.rarewares.org/files/mp3/ · LAME สัญญา LGPL รุ่น 2 หรือใหม่กว่า libmpg123 สัญญา LGPL 2.1 (ใช้ข้อความ LGPL 2.1 จากชุด FLAC เพราะไฟล์บีบอัดไม่มีข้อความสัญญาแนบ) · ซอร์สโค้ด https://lame.sourceforge.io/ และ https://www.mpg123.de/
- WavPack 5.9.0 (wavpack.exe) จาก https://github.com/dbry/WavPack/releases · สัญญา BSD 3 ข้อ
- Monkey's Audio 13.46 (MACDll64.dll จากตัวติดตั้ง MAC_1346_x64.exe มีลายเซ็นของผู้ทำ ข้อความสัญญาจากชุด SDK) จาก https://www.monkeysaudio.com/ · สัญญา BSD 3 ข้อ
- qaac 3.07 (qaac64.exe refalac64.exe libsoxr64.dll) จาก https://github.com/nu774/qaac/releases · ตัว qaac เป็น Public Domain · ตัวเข้ารหัส ALAC ของ Apple ข้างในสัญญา Apache 2.0 (https://www.apache.org/licenses/LICENSE-2.0) · ส่วนอื่นข้างใน (TagLib libsoxr FDK mmtisobmff และอื่น ๆ) ดู licenses\qaac-COPYING.txt · ซอร์สโค้ด https://github.com/nu774/qaac · qaac ใช้ตัวเข้ารหัส AAC ของ Apple ที่มากับ iTunes ไฟล์ของ Apple ไม่ได้แนบ ผู้ใช้ติดตั้ง iTunes เอง
- TAK 2.3.3 (TAK_2.3.3.zip ไฟล์เดิมทั้งไฟล์ โปรแกรมแตก Takc.exe ไปใช้เอง) จาก http://www.thbeck.de/Tak/Tak.html · ฟรีสำหรับใช้ส่วนตัวที่ไม่ใช่การค้า แจกต่อได้เฉพาะไฟล์ zip เดิมทั้งไฟล์ ไม่คิดเงิน
- libheif 1.23.7 (heif.dll ใช้บันทึกรูปกราฟเป็น HEIC) พร้อม libx265 3.5 libde265 1.1.3 aom 3.15.3 dav1d 1.5.4 libsharpyuv จาก libwebp 1.6.0 · ตัวที่ conda-forge สร้าง https://conda-forge.org/ · libheif กับ libde265 สัญญา LGPL รุ่น 3 หรือใหม่กว่า · x265 สัญญา GPL รุ่น 2 หรือใหม่กว่า · aom dav1d libsharpyuv สัญญา BSD · ซอร์สโค้ด https://github.com/strukturag/libheif https://bitbucket.org/multicoreware/x265_git https://github.com/strukturag/libde265 https://aomedia.googlesource.com/aom https://code.videolan.org/videolan/dav1d https://chromium.googlesource.com/webm/libwebp และสูตรสร้าง https://github.com/conda-forge
- Microsoft Visual C++ runtime 14.51 (msvcp140.dll vcruntime140.dll vcruntime140_1.dll มีลายเซ็น Microsoft) แนบให้ heif.dll เปิดได้บนเครื่องที่ไม่มี Visual C++ Redistributable · เงื่อนไขอยู่ใน licenses\MSVC-Runtime-LICENSE.txt
"@
Set-Content -LiteralPath (Join-Path $lic 'SOURCES.txt') -Value $sources -Encoding UTF8

Remove-Item -LiteralPath $work -Recurse -Force

Write-Host ''
Write-Host 'ไฟล์ใน src-tauri\tools:'
Get-ChildItem -LiteralPath $dest -File | ForEach-Object {
  '{0,-16} {1,12:N0} ไบต์  {2}' -f $_.Name, $_.Length, (Get-FileHash -LiteralPath $_.FullName -Algorithm SHA256).Hash.Substring(0, 16).ToLower()
}
