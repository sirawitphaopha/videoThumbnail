// ไม่ให้มีหน้าต่างดำโผล่ตอนเปิดโปรแกรมตัวจริง ห้ามลบ
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    movie_shelf_lib::run();
}
