# แตก libheif ตัวจริงกับไฟล์ที่มันต้องใช้ จาก vendor\heif ลง src-tauri\tools
# โปรแกรมเรียก heif.dll ตรงจาก Rust ตอนบันทึกรูปกราฟเป็น HEIC (graphimg.rs) · พี่กันเลือก 9 พ.ย. 2569 "เอาอันนี้ก็ได้" หลังบอกว่า "ขอแบบของจริง"
# libheif ทางการมีแต่ซอร์สโค้ด ไฟล์สำหรับ Windows มาจาก conda-forge · ค่า SHA-256 ตรงกับที่ conda-forge แจ้งตอนโหลด
# เช็ก SHA-256 ก่อนแตกทุกครั้ง ค่าไม่ตรง = หยุด ไม่แตก · ไม่รันไฟล์ใด ๆ · รันซ้ำได้ ทับของเดิม
# fetch-tools.ps1 เรียกตัวนี้ตอนท้าย รันเดี่ยวได้ถ้าต้องการแค่ชุดนี้

$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$tar  = Join-Path $env:WINDIR 'System32\tar.exe'
$dest = Join-Path $root 'src-tauri\tools'
$lic  = Join-Path $dest 'licenses'

# ทุกตัวอยู่ใน Library\bin ยกเว้น runtime ของ Microsoft ที่อยู่รากแพ็กเกจ
$pkgs = @(
  @{ file = 'libheif-1.23.7-gpl_h67fb079_103.conda';      sha = '687983f329527d15ec4048b2ec3f7cbb66f6c7bddad589327aa2a13d3560d056'; dlls = @('Library\bin\heif.dll');        lic = 'COPYING'; to = 'libheif-LGPL-3.0.txt' },
  @{ file = 'libwebp-base-1.6.0-h4d5522a_1.conda';        sha = '4470d98d3178b0d45492eed4808afe421d2e7808352b8d06c2dc29166b75d94d'; dlls = @('Library\bin\libsharpyuv.dll'); lic = 'COPYING'; to = 'libsharpyuv-BSD-3.txt' },
  @{ file = 'libde265-1.1.3-h477610d_1.conda';            sha = '1ad6ce985e8306ce74026a110898a7c91b41b927d1bfa57f3935270f5e199d5d'; dlls = @('Library\bin\libde265.dll');    lic = 'COPYING'; to = 'libde265-LGPL-3.0.txt' },
  @{ file = 'libdav1d7-1.5.4-h6a83c73_4.conda';           sha = '8c4514f16f22eabec86afaf737285efded4b09633e0e4fb50d58e51830b3471e'; dlls = @('Library\bin\dav1d.dll');       lic = 'COPYING'; to = 'dav1d-BSD-2.txt' },
  @{ file = 'x265-3.5-h3ee6617_4.conda';                  sha = '684d28d37d808e4cefbcc87e8039f8f0cc3a6ed16c91d05731f6e1f0bf79a3eb'; dlls = @('Library\bin\libx265.dll');     lic = 'COPYING'; to = 'x265-GPL-2.0.txt' },
  @{ file = 'aom-3.15.3-pl5321h06fc181_0.conda';          sha = '302f726d93ad4c113a8f7b8d72b5d1bcf1ad3ff10950ee6161b99787025458da'; dlls = @('Library\bin\aom.dll');         lic = 'LICENSE'; to = 'aom-BSD-2.txt' },
  @{ file = 'vc14_runtime-14.51.36247-habf1de7_42.conda'; sha = '8dfbfd68ebf53249d11e528cbb80ad5a2460b0c5b4636eed82ee0d3950827a3d'; dlls = @('msvcp140.dll', 'vcruntime140.dll', 'vcruntime140_1.dll'); lic = 'LICENSE.TXT'; to = 'MSVC-Runtime-LICENSE.txt' }
)

foreach ($p in $pkgs) {
  $full = Join-Path $root "vendor\heif\$($p.file)"
  $h = (Get-FileHash -LiteralPath $full -Algorithm SHA256).Hash.ToLower()
  if ($h -ne $p.sha) { throw "ค่า SHA-256 ไม่ตรงกับที่จดไว้: $($p.file)" }
  Write-Host "SHA-256 ตรง: $($p.file)"
}

$work = Join-Path $env:TEMP 'movie-shelf-heif'
if (Test-Path -LiteralPath $work) { Remove-Item -LiteralPath $work -Recurse -Force }
New-Item -ItemType Directory -Force $work | Out-Null
New-Item -ItemType Directory -Force $dest | Out-Null
New-Item -ItemType Directory -Force $lic  | Out-Null

foreach ($p in $pkgs) {
  $d = Join-Path $work $p.file
  New-Item -ItemType Directory -Force $d | Out-Null
  & $tar -xf (Join-Path $root "vendor\heif\$($p.file)") -C $d
  if ($LASTEXITCODE -ne 0) { throw "แตก $($p.file) ไม่สำเร็จ" }
  # ในไฟล์ .conda มีก้อน pkg-*.tar.zst กับ info-*.tar.zst
  foreach ($z in Get-ChildItem -LiteralPath $d -Filter '*.tar.zst' -File) {
    & $tar -xf $z.FullName -C $d
    if ($LASTEXITCODE -ne 0) { throw "แตก $($z.Name) ไม่สำเร็จ" }
  }
  foreach ($x in $p.dlls) { Copy-Item -LiteralPath (Join-Path $d $x) -Destination $dest -Force }
  Copy-Item -LiteralPath (Join-Path $d "info\licenses\$($p.lic)") -Destination (Join-Path $lic $p.to) -Force
}

# runtime ต้องเป็นไฟล์ของ Microsoft จริง เช็กลายเซ็นทุกครั้ง · แนบไว้เพราะเครื่องที่ไม่มี Visual C++ Redistributable เปิด heif.dll ไม่ได้
foreach ($n in 'msvcp140.dll', 'vcruntime140.dll', 'vcruntime140_1.dll') {
  $sig = Get-AuthenticodeSignature -LiteralPath (Join-Path $dest $n)
  if ($sig.Status -ne 'Valid' -or $sig.SignerCertificate.Subject -notlike '*Microsoft*') { throw "ลายเซ็นของ $n ไม่ถูกต้อง: $($sig.Status)" }
}
Write-Host 'ลายเซ็น Microsoft ของ runtime ถูกต้องครบ 3 ไฟล์'

Remove-Item -LiteralPath $work -Recurse -Force

foreach ($p in $pkgs) {
  foreach ($x in $p.dlls) {
    $f = Join-Path $dest (Split-Path -Leaf $x)
    '{0,-20} {1,12:N0} ไบต์  {2}' -f (Split-Path -Leaf $x), (Get-Item -LiteralPath $f).Length, (Get-FileHash -LiteralPath $f -Algorithm SHA256).Hash.ToLower()
  }
}
