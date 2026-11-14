# ถ่ายภาพหน้าต่างโปรแกรมทดสอบแบบที่ Windows วาดจริง รวมหน้าต่างลูกของ mpv ที่ภาพผ่าน CDP มองไม่เห็น (BUGS ข้อ 111)
# ใช้ PrintWindow แบบ PW_RENDERFULLCONTENT ถ่ายได้แม้หน้าต่างอยู่หลังสุด ไม่ดึงหน้าต่างขึ้นจอ ไม่กดอะไร
# ใช้: powershell -NoProfile -File scripts/winshot.ps1 -Out <ไฟล์ png> [-X -Y -W -H ส่วนที่ตัด เป็นจุดจริงเทียบมุมพื้นที่หน้าต่าง]
# พิมพ์ความสว่างเฉลี่ยของส่วนที่ตัด 0 ถึง 255 ให้ตัวตรวจรู้ว่ามีภาพ (ไม่ใช่ดำล้วน)
param([Parameter(Mandatory = $true)][string]$Out, [int]$X = 0, [int]$Y = 0, [int]$W = 0, [int]$H = 0)
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing
Add-Type @"
using System;
using System.Runtime.InteropServices;
public static class WinShot {
  [StructLayout(LayoutKind.Sequential)] public struct RECT { public int L, T, R, B; }
  [StructLayout(LayoutKind.Sequential)] public struct POINT { public int X, Y; }
  [DllImport("user32.dll")] public static extern bool GetClientRect(IntPtr h, out RECT r);
  [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr h, out RECT r);
  [DllImport("user32.dll")] public static extern bool ClientToScreen(IntPtr h, ref POINT p);
  [DllImport("user32.dll")] public static extern bool PrintWindow(IntPtr h, IntPtr hdc, uint flags);
  [DllImport("user32.dll")] public static extern bool IsWindowVisible(IntPtr h);
  public delegate bool EnumProc(IntPtr h, IntPtr l);
  [DllImport("user32.dll")] public static extern bool EnumWindows(EnumProc f, IntPtr l);
  [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr h, out uint pid);
  // หน้าต่างที่มองเห็นและพื้นที่ใหญ่ที่สุดของโปรเซส (MainWindowHandle อาจเป็นหน้าต่างเล็กของตัวกันเปิดซ้อน)
  public static IntPtr Biggest(uint pid) {
    IntPtr best = IntPtr.Zero; long area = 0;
    EnumWindows((h, l) => {
      uint p; GetWindowThreadProcessId(h, out p);
      if (p != pid || !IsWindowVisible(h)) return true;
      RECT c; GetClientRect(h, out c);
      long a = (long)c.R * c.B;
      if (a > area) { area = a; best = h; }
      return true;
    }, IntPtr.Zero);
    return best;
  }
}
"@
# หน้าต่างของตัวทดสอบ (target\debug\movie-shelf.exe) ไม่แตะตัวที่พี่กันเปิดใช้
$p = Get-Process movie-shelf -ErrorAction SilentlyContinue | Where-Object { $_.Path -like '*\target\debug\*' } | Select-Object -First 1
if (-not $p) { Write-Output 'ไม่เจอหน้าต่างโปรแกรมทดสอบ'; exit 2 }
$hwnd = [WinShot]::Biggest([uint32]$p.Id)
if ($hwnd -eq [IntPtr]::Zero) { Write-Output 'ไม่เจอหน้าต่างโปรแกรมทดสอบ'; exit 2 }
$wr = New-Object WinShot+RECT; [void][WinShot]::GetWindowRect($hwnd, [ref]$wr)
$cr = New-Object WinShot+RECT; [void][WinShot]::GetClientRect($hwnd, [ref]$cr)
$pt = New-Object WinShot+POINT; [void][WinShot]::ClientToScreen($hwnd, [ref]$pt)
$bw = $wr.R - $wr.L; $bh = $wr.B - $wr.T
$bmp = New-Object System.Drawing.Bitmap $bw, $bh
$g = [System.Drawing.Graphics]::FromImage($bmp)
$hdc = $g.GetHdc()
$ok = [WinShot]::PrintWindow($hwnd, $hdc, 2)
$g.ReleaseHdc($hdc); $g.Dispose()
if (-not $ok) { Write-Output 'PrintWindow ไม่สำเร็จ'; exit 3 }
# ภาพของ PrintWindow เริ่มที่มุมหน้าต่าง (มีขอบมองไม่เห็นรอบหน้าต่าง) ส่วนที่ขอเทียบมุมพื้นที่หน้าต่าง ต้องบวกระยะขอบ
$ox = $pt.X - $wr.L; $oy = $pt.Y - $wr.T
if ($W -le 0 -or $H -le 0) { $X = 0; $Y = 0; $W = $cr.R; $H = $cr.B }
$rx = [Math]::Max(0, [Math]::Min($bw - 1, $ox + $X)); $ry = [Math]::Max(0, [Math]::Min($bh - 1, $oy + $Y))
$rw = [Math]::Max(1, [Math]::Min($W, $bw - $rx)); $rh = [Math]::Max(1, [Math]::Min($H, $bh - $ry))
$crop = $bmp.Clone((New-Object System.Drawing.Rectangle $rx, $ry, $rw, $rh), $bmp.PixelFormat)
$sum = 0; $n = 0
for ($yy = 0; $yy -lt $rh; $yy += 4) { for ($xx = 0; $xx -lt $rw; $xx += 4) { $c = $crop.GetPixel($xx, $yy); $sum += $c.R + $c.G + $c.B; $n++ } }
$crop.Save($Out, [System.Drawing.Imaging.ImageFormat]::Png)
$crop.Dispose(); $bmp.Dispose()
Write-Output ("{0:N1}" -f ($sum / [Math]::Max(1, $n) / 3))
