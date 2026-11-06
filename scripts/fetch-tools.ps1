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

foreach ($a in @($mkv, $ff, $mi)) {
  $full = Join-Path $root $a.path
  $h = (Get-FileHash -LiteralPath $full -Algorithm SHA256).Hash.ToLower()
  if ($h -ne $a.sha) { throw "ค่า SHA-256 ไม่ตรงกับที่จดไว้: $($a.path)" }
  Write-Host "SHA-256 ตรง: $($a.path)"
}

$work = Join-Path $env:TEMP 'movie-shelf-tools'
if (Test-Path -LiteralPath $work) { Remove-Item -LiteralPath $work -Recurse -Force }
New-Item -ItemType Directory -Force $work | Out-Null
New-Item -ItemType Directory -Force (Join-Path $work 'mediainfo') | Out-Null

& $tar -xf (Join-Path $root $mkv.path) -C $work `
  'mkvtoolnix/mkvmerge.exe' 'mkvtoolnix/mkvextract.exe' 'mkvtoolnix/mkvpropedit.exe' 'mkvtoolnix/doc/COPYING.txt'
if ($LASTEXITCODE -ne 0) { throw 'แตก MKVToolNix ไม่สำเร็จ' }

& $tar -xf (Join-Path $root $ff.path) -C $work `
  'ffmpeg-9.0.2-full_build/bin/ffmpeg.exe' 'ffmpeg-9.0.2-full_build/bin/ffprobe.exe' 'ffmpeg-9.0.2-full_build/LICENSE'
if ($LASTEXITCODE -ne 0) { throw 'แตก FFmpeg ไม่สำเร็จ' }

& $tar -xf (Join-Path $root $mi.path) -C (Join-Path $work 'mediainfo') 'MediaInfo.exe' 'LIBCURL.DLL' 'LICENSE'
if ($LASTEXITCODE -ne 0) { throw 'แตก MediaInfo ไม่สำเร็จ' }

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
  @('mediainfo\LICENSE',                           'licenses\MediaInfo-LICENSE.txt')
)
foreach ($c in $copies) {
  Copy-Item -LiteralPath (Join-Path $work $c[0]) -Destination (Join-Path $dest $c[1]) -Force
}

$sources = @"
ที่มาของเครื่องมือในโฟลเดอร์นี้ (แตกจาก vendor ด้วย scripts\fetch-tools.ps1)
- MKVToolNix 103.0 แบบพกพา 64 บิต · สัญญา GPL v2 · ซอร์สโค้ด https://mkvtoolnix.download/source.html (เก็บสำเนาไว้ที่ vendor\mkvtoolnix-source)
- FFmpeg 9.0.2 full build จาก https://www.gyan.dev/ffmpeg/builds/ · สัญญา GPL v3 · ซอร์สโค้ด https://ffmpeg.org/download.html
- MediaInfo CLI 26.10 จาก https://mediaarea.net/ · สัญญา BSD-2-Clause
"@
Set-Content -LiteralPath (Join-Path $lic 'SOURCES.txt') -Value $sources -Encoding UTF8

Remove-Item -LiteralPath $work -Recurse -Force

Write-Host ''
Write-Host 'ไฟล์ใน src-tauri\tools:'
Get-ChildItem -LiteralPath $dest -File | ForEach-Object {
  '{0,-16} {1,12:N0} ไบต์  {2}' -f $_.Name, $_.Length, (Get-FileHash -LiteralPath $_.FullName -Algorithm SHA256).Hash.Substring(0, 16).ToLower()
}
