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
$ma  = @{ path = 'vendor\monkeys-audio\MAC_1345_SDK.zip';               sha = 'b12bda0eb9e31dbe01d54a970d387add3a8c1079901141021d257de17a6a9106' }

foreach ($a in @($mkv, $ff, $mi, $fl, $op, $lm, $wv, $ma)) {
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

# Monkey's Audio ชุด SDK ไม่มีตัวแปลงแบบคำสั่ง (MAC.exe) มีแต่ MACDll64.dll ที่รับเสียงแบบส่งต่อเนื่องได้
# โปรแกรมเรียก DLL นี้ตรงจาก Rust (c_APECompress_StartW AddData Finish) ไม่ต้องโหลดตัวติดตั้งเพิ่ม
& $tar -xf (Join-Path $root $ma.path) -C $work 'Shared/64/MACDll64.dll' 'License.txt'
if ($LASTEXITCODE -ne 0) { throw "แตก Monkey's Audio ไม่สำเร็จ" }

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
  @('flac-1.5.0-win\COPYING.GPL',                  'licenses\FLAC-tool-GPL-2.0.txt'),
  @('flac-1.5.0-win\COPYING.Xiph',                 'licenses\FLAC-libFLAC-Xiph-BSD.txt'),
  @('flac-1.5.0-win\COPYING.LGPL',                 'licenses\LAME-libmpg123-LGPL-2.1.txt'),
  @('wavpack\license.txt',                         'licenses\WavPack-BSD.txt'),
  @('License.txt',                                 'licenses\MonkeysAudio-BSD-3.txt')
)
foreach ($c in $copies) {
  Copy-Item -LiteralPath (Join-Path $work $c[0]) -Destination (Join-Path $dest $c[1]) -Force
}

$sources = @"
ที่มาของเครื่องมือในโฟลเดอร์นี้ (แตกจาก vendor ด้วย scripts\fetch-tools.ps1)
- MKVToolNix 103.0 แบบพกพา 64 บิต · สัญญา GPL v2 · ซอร์สโค้ด https://mkvtoolnix.download/source.html (เก็บสำเนาไว้ที่ vendor\mkvtoolnix-source)
- FFmpeg 9.0.2 full build จาก https://www.gyan.dev/ffmpeg/builds/ · สัญญา GPL v3 · ซอร์สโค้ด https://ffmpeg.org/download.html
- MediaInfo CLI 26.10 จาก https://mediaarea.net/ · สัญญา BSD-2-Clause
- FLAC 1.5.0 (flac.exe libFLAC.dll) จาก https://xiph.org/flac/download.html · ตัว flac สัญญา GPL v2 ห้องสมุด libFLAC สัญญา BSD (Xiph) · ซอร์สโค้ด https://github.com/xiph/flac
- opusenc จาก opus-tools 0.2-52-g5f894e9 ทำด้วย libopus 1.6.1 · ชุดที่ทำโดย RareWares https://www.rarewares.org/files/opus/ · สัญญา BSD 2 ข้อ (Xiph) ไฟล์บีบอัดไม่มีข้อความสัญญาแนบ ข้อความเต็มอยู่ https://github.com/xiph/opus-tools/blob/master/COPYING และ https://opus-codec.org/license/
- LAME 4.0 (lame.exe libmpg123-0.dll) · ชุดที่ทำโดย RareWares https://www.rarewares.org/files/mp3/ · LAME สัญญา LGPL รุ่น 2 หรือใหม่กว่า libmpg123 สัญญา LGPL 2.1 (ใช้ข้อความ LGPL 2.1 จากชุด FLAC เพราะไฟล์บีบอัดไม่มีข้อความสัญญาแนบ) · ซอร์สโค้ด https://lame.sourceforge.io/ และ https://www.mpg123.de/
- WavPack 5.9.0 (wavpack.exe) จาก https://github.com/dbry/WavPack/releases · สัญญา BSD 3 ข้อ
- Monkey's Audio 13.45 (MACDll64.dll จากชุด SDK) จาก https://www.monkeysaudio.com/ · สัญญา BSD 3 ข้อ
"@
Set-Content -LiteralPath (Join-Path $lic 'SOURCES.txt') -Value $sources -Encoding UTF8

Remove-Item -LiteralPath $work -Recurse -Force

Write-Host ''
Write-Host 'ไฟล์ใน src-tauri\tools:'
Get-ChildItem -LiteralPath $dest -File | ForEach-Object {
  '{0,-16} {1,12:N0} ไบต์  {2}' -f $_.Name, $_.Length, (Get-FileHash -LiteralPath $_.FullName -Algorithm SHA256).Hash.Substring(0, 16).ToLower()
}
