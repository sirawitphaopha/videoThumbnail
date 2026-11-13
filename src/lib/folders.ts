/** ตัวเทียบโฟลเดอร์ซ้ำ ตรงกับ folder_key ใน src-tauri/src/store.rs · ไม่สนตัวพิมพ์ ไม่สนช่องว่าง และไม่สนเครื่องหมาย \ หรือ / ท้าย (AUDIT ข้อ 130)
    ใช้เทียบอย่างเดียว ค่าที่เก็บยังเป็นแบบที่พี่กันเลือก */
export const folderKey = (f: string) => f.trim().replace(/[\\/]+$/, "").toLowerCase();
