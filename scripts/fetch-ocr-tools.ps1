# แตกของระบบ OCR ซับรูปจาก vendor\ocr ลง src-tauri\tools\ocr (แผน OCR ขั้น 0 · BUGS ข้อ 143)
# fetch-tools.ps1 เรียกตัวนี้ต่อท้าย · รันเดี่ยวได้เมื่อแก้เฉพาะของ OCR ไม่ต้องแตกเครื่องมือทั้งหมดใหม่ (แตกทั้งหมดหนัก เครื่องแรม 8 GB ค้างได้ 16 พ.ย. 2569)
# ที่ทำงานชั่วคราวอยู่ไดรฟ์ D (ไดรฟ์ C ที่ว่างน้อย)

$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$tar  = Join-Path $env:WINDIR 'System32\tar.exe'
$dest = Join-Path $root 'src-tauri\tools'
$lic  = Join-Path $dest 'licenses'
$work = 'D:\dev\tmp\movie-shelf-ocr-tools'
if (Test-Path -LiteralPath $work) { Remove-Item -LiteralPath $work -Recurse -Force }
New-Item -ItemType Directory -Force $work, $lic | Out-Null
# ระบบ OCR ซับรูป (แผน OCR ขั้น 0 · BUGS ข้อ 143) ของทั้งหมดอยู่ vendor\ocr โหลดด้วย scripts\fetch-ocr.py จด sha256 ใน vendor\ocr\manifest.json
# พี่กันสั่ง 16 พ.ย. 2569 "ก็เอามาทุกตัวที่เอาเข้ามาได้ ใส่ในโปรแกรมเลย เอาให้ครบ ไม่ต้อโหลดเเยก" · แตกลง tools\ocr
$ocrSrc = Join-Path $root 'vendor\ocr'
$ocrMan = Get-Content -LiteralPath (Join-Path $ocrSrc 'manifest.json') -Raw -Encoding UTF8 | ConvertFrom-Json
foreach ($p in $ocrMan.PSObject.Properties) {
  $f = Join-Path $ocrSrc $p.Name
  if (-not (Test-Path -LiteralPath $f)) { throw "ไม่มีไฟล์ $($p.Name) ใน vendor\ocr รัน py -3 scripts\fetch-ocr.py ก่อน" }
  $h = (Get-FileHash -LiteralPath $f -Algorithm SHA256).Hash.ToLower()
  if ($h -ne $p.Value.sha256) { throw "SHA-256 ของ vendor\ocr\$($p.Name) ไม่ตรงกับ manifest.json" }
}
$ocrDest = Join-Path $dest 'ocr'
if (Test-Path -LiteralPath $ocrDest) { Remove-Item -LiteralPath $ocrDest -Recurse -Force }
New-Item -ItemType Directory -Force $ocrDest | Out-Null
# ONNX Runtime ใช้แค่ onnxruntime.dll กับ onnxruntime_providers_shared.dll (ส่วนอื่นในชุดเป็นของนักพัฒนา)
$ortWork = Join-Path $work 'ort'
New-Item -ItemType Directory -Force $ortWork | Out-Null
$ortZip = Get-ChildItem -LiteralPath $ocrSrc -Filter 'onnxruntime-win-x64-*.zip' | Select-Object -First 1
& $tar -xf $ortZip.FullName -C $ortWork
if ($LASTEXITCODE -ne 0) { throw 'แตก ONNX Runtime ไม่สำเร็จ' }
$ortLib = Get-ChildItem -LiteralPath $ortWork -Directory | Select-Object -First 1
New-Item -ItemType Directory -Force (Join-Path $ocrDest 'onnxruntime') | Out-Null
foreach ($n in 'onnxruntime.dll', 'onnxruntime_providers_shared.dll') { Copy-Item -LiteralPath (Join-Path $ortLib.FullName "lib\$n") -Destination (Join-Path $ocrDest "onnxruntime\$n") -Force }
Copy-Item -LiteralPath (Join-Path $ortLib.FullName 'LICENSE') -Destination (Join-Path $lic 'onnxruntime-MIT.txt') -Force
# โมเดล PaddleOCR (โฟลเดอร์ละโมเดล inference.onnx กับ inference.yml ที่มีพจนานุกรมตัวอักษร)
# แนบเฉพาะ PP-OCRv6 (อังกฤษ ญี่ปุ่น จีน) ตัวหาบรรทัด ตัวหมุนบรรทัด และ PP-OCRv5 ไทยกับอังกฤษ · ภาษาอื่นเก้าภาษาผู้ใช้กดโหลดในโปรแกรม (paddle_dl.rs)
# พี่กันสั่ง 17 พ.ย. 2569 "ส่วนโมเดลภาษาอ่ะ เราต้องการแค่ อัฃกิด  ไทย ญี่ปุ่น ที่เหลือไว้โหลดเพิ่ม (ทำตอนนี้)" (BUGS ข้อ 152)
$paddleSkip = 'korean', 'latin', 'cyrillic', 'eslav', 'arabic', 'devanagari', 'el', 'ta', 'te' | ForEach-Object { "${_}_PP-OCRv5_mobile_rec" }
$paddleDest = Join-Path $ocrDest 'paddle'
if (Test-Path -LiteralPath $paddleDest) { Remove-Item -LiteralPath $paddleDest -Recurse -Force }
New-Item -ItemType Directory -Force $paddleDest | Out-Null
Get-ChildItem -LiteralPath (Join-Path $ocrSrc 'paddle') -Directory | Where-Object { $paddleSkip -notcontains $_.Name } | ForEach-Object { Copy-Item -LiteralPath $_.FullName -Destination (Join-Path $paddleDest $_.Name) -Recurse -Force }
Copy-Item -LiteralPath (Join-Path $ocrSrc 'tesseract-LICENSE') -Destination (Join-Path $lic 'PaddleOCR-models-Apache-2.0.txt') -Force
# Tesseract 5.5.3 แบบไม่ต้องติดตั้ง แตกทั้งชุดลง tools\ocr\tesseract แล้ววางชุดภาษาแบบ best ทับใน tessdata
$tesDest = Join-Path $ocrDest 'tesseract'
New-Item -ItemType Directory -Force $tesDest | Out-Null
& $tar -xf (Join-Path $ocrSrc 'Tesseract553.zip') -C $tesDest
if ($LASTEXITCODE -ne 0) { throw 'แตก Tesseract ไม่สำเร็จ' }
if (-not (Test-Path -LiteralPath (Join-Path $tesDest 'tesseract.exe'))) { throw 'ไม่เจอ tesseract.exe หลังแตก' }
Get-ChildItem -LiteralPath (Join-Path $ocrSrc 'tessdata') -Filter '*.traineddata' | Copy-Item -Destination (Join-Path $tesDest 'tessdata') -Force
Copy-Item -LiteralPath (Join-Path $ocrSrc 'tesseract-LICENSE') -Destination (Join-Path $lic 'Tesseract-Apache-2.0.txt') -Force
Copy-Item -LiteralPath (Join-Path $ocrSrc 'tessdata\LICENSE') -Destination (Join-Path $lic 'tessdata_best-Apache-2.0.txt') -Force
# พจนานุกรม Hunspell en_US en_GB th_TH
New-Item -ItemType Directory -Force (Join-Path $ocrDest 'hunspell') | Out-Null
Get-ChildItem -LiteralPath (Join-Path $ocrSrc 'hunspell') -Include '*.aff', '*.dic' -Recurse | Copy-Item -Destination (Join-Path $ocrDest 'hunspell') -Force
Get-ChildItem -LiteralPath (Join-Path $ocrSrc 'hunspell') -Filter 'README_*.txt' | ForEach-Object { Copy-Item -LiteralPath $_.FullName -Destination (Join-Path $lic "Hunspell-$($_.Name)") -Force }
# ฐาน nOCR Binary OCR รายการแก้คำ ชื่อเฉพาะ และรายการแยกคำของ Subtitle Edit
Copy-Item -LiteralPath (Join-Path $ocrSrc 'subtitleedit\Dictionaries') -Destination (Join-Path $ocrDest 'Dictionaries') -Recurse -Force
Copy-Item -LiteralPath (Join-Path $ocrSrc 'subtitleedit\Ocr') -Destination (Join-Path $ocrDest 'Ocr') -Recurse -Force
Copy-Item -LiteralPath (Join-Path $ocrSrc 'subtitleedit\LICENSE') -Destination (Join-Path $lic 'SubtitleEdit-OCR-MIT.txt') -Force

Remove-Item -LiteralPath $work -Recurse -Force
Write-Host ('แตกของ OCR ลง ' + (Join-Path $dest 'ocr') + ' แล้ว')
