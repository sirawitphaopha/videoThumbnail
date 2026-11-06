/* หน้าที่ยังไม่ถึงขั้นของมัน · แต่ละหน้าทำตามลำดับแผน แทนที่ตัวนี้ทีละหน้า
   ชั้นวาง ขั้น 2 · ใส่โปสเตอร์ ขั้น 4 · ตรวจไฟล์ ขั้น 6 · ตั้งค่า ขั้น 7 */
export default function Placeholder({ title, stage }: { title: string; stage: number }) {
  return (
    <div className="pagewrap" style={{ padding: 22 }}>
      <div className="card" style={{ maxWidth: 560 }}>
        <h3>{title}</h3>
        <div className="small" style={{ fontSize: 14 }}>หน้านี้ทำในขั้น {stage} ของแผน</div>
      </div>
    </div>
  );
}
