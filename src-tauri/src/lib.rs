//! ชั้นหนัง · ฝั่งทำงานหนักของโปรแกรม

mod check;
mod extract;
mod fileinfo;
mod hashes;
mod jobs;
mod library;
mod poster;
mod poster_image;
mod probe;
mod rename;
mod store;
mod tools;
mod winutil;

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
        .manage(poster::PosterState::default())
        .setup(|app| {
            let path = store::settings_path(app.handle())?;
            app.manage(SettingsStore::load(path));
            let lib = library::library_path(app.handle())?;
            app.manage(Arc::new(library::LibraryStore::load(lib)));
            // หน้าต่างตั้งไว้ไม่แสดงตอนสร้าง (tauri.conf.json visible:false) แสดงที่นี่
            // ตอนเทสผ่าน scripts/dev-app.ps1 เปิดแบบไม่แย่งโฟกัส อยู่หลังหน้าต่างอื่น · ตัวจริงขึ้นหน้าตามปกติ
            match app.get_webview_window("main") {
                Some(w) if cfg!(debug_assertions) && std::env::var("MOVIE_SHELF_BACKGROUND").as_deref() == Ok("1") => {
                    winutil::show_behind(&w);
                    eprintln!("ชั้นหนัง: หน้าต่างเทสเปิดแบบไม่แย่งโฟกัส อยู่หลังสุด");
                }
                Some(w) => {
                    w.show()?;
                    w.set_focus()?;
                }
                None => eprintln!("ชั้นหนัง: ยังไม่มีหน้าต่าง main ตอน setup"),
            }
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
        jobs::running_jobs, jobs::force_close, jobs::dev_fake_job, poster::dev_fake_free, library::dev_set_check,
        library::get_library, library::scan_library, library::play_movie, library::reveal_movie,
        rename::check_rename, rename::rename_movie,
        poster::poster_open, poster::poster_render, poster::poster_clear, poster::poster_folder_images,
        poster::poster_inspect, poster::poster_apply, poster::poster_cancel,
        fileinfo::media_info, fileinfo::hash_file, fileinfo::hash_cancel, fileinfo::hash_compare, fileinfo::hash_save,
        extract::extract_start, extract::extract_cancel, extract::extract_default_folder,
    ]);
    #[cfg(not(debug_assertions))]
    let builder = builder.invoke_handler(tauri::generate_handler![
        tools::check_tools, store::get_settings, store::set_settings,
        jobs::running_jobs, jobs::force_close,
        library::get_library, library::scan_library, library::play_movie, library::reveal_movie,
        rename::check_rename, rename::rename_movie,
        poster::poster_open, poster::poster_render, poster::poster_clear, poster::poster_folder_images,
        poster::poster_inspect, poster::poster_apply, poster::poster_cancel,
        fileinfo::media_info, fileinfo::hash_file, fileinfo::hash_cancel, fileinfo::hash_compare, fileinfo::hash_save,
        extract::extract_start, extract::extract_cancel, extract::extract_default_folder,
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
