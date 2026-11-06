//! ชั้นหนัง · ฝั่งทำงานหนักของโปรแกรม

mod jobs;
mod store;
mod tools;

use std::sync::Arc;

use tauri::{Emitter, Manager, RunEvent, WindowEvent};

use jobs::Jobs;
use store::SettingsStore;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let builder = tauri::Builder::default()
        // เปิดได้ทีละหน้าต่าง สองหน้าต่างจะเขียนทับคลังหนังของกันและกัน (TECH-REVIEW ข้อ 12)
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
            if let Some(w) = app.get_webview_window("main") {
                let _ = w.unminimize();
                let _ = w.set_focus();
            }
        }))
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .manage(Arc::new(Jobs::default()))
        .setup(|app| {
            let path = store::settings_path(app.handle())?;
            app.manage(SettingsStore::load(path));
            Ok(())
        })
        // กันปิดตอนมีงาน ทางที่ 1 กดปิดหน้าต่าง (ปุ่มปิดของแถบชื่อ · Alt+F4 · ปิดจากแถบงาน)
        .on_window_event(|window, event| {
            if let WindowEvent::CloseRequested { api, .. } = event {
                let jobs = window.state::<Arc<Jobs>>();
                if !jobs.may_close() {
                    api.prevent_close();
                    let _ = window.emit("close-blocked", jobs.count());
                }
            }
        });

    #[cfg(debug_assertions)]
    let builder = builder.invoke_handler(tauri::generate_handler![
        tools::check_tools, store::get_settings, store::set_settings,
        jobs::running_jobs, jobs::force_close, jobs::dev_fake_job,
    ]);
    #[cfg(not(debug_assertions))]
    let builder = builder.invoke_handler(tauri::generate_handler![
        tools::check_tools, store::get_settings, store::set_settings,
        jobs::running_jobs, jobs::force_close,
    ]);

    builder
        .build(tauri::generate_context!())
        .expect("เปิดโปรแกรมชั้นหนังไม่สำเร็จ")
        // กันปิดตอนมีงาน ทางที่ 2 โปรแกรมกำลังจะออก (หน้าต่างสุดท้ายหายไปด้วยทางอื่น) · ผลตรวจขั้น 0 โค้ดข้อ 6
        .run(|app, event| {
            if let RunEvent::ExitRequested { api, .. } = event {
                let jobs = app.state::<Arc<Jobs>>();
                if !jobs.may_close() {
                    api.prevent_exit();
                    let _ = app.emit("close-blocked", jobs.count());
                }
            }
        });
}
