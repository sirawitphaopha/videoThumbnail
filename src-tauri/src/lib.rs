//! ชั้นหนัง · ฝั่งทำงานหนักของโปรแกรม

mod ape;
mod audiograph;
mod check;
mod convert;
mod delay;
mod encode;
mod extract;
mod fileinfo;
mod fonts;
mod hashes;
mod jobs;
mod latest;
mod library;
mod link;
mod merge;
mod outfile;
mod pairs;
mod poster;
mod poster_image;
mod probe;
mod rename;
mod store;
mod subs;
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
        .manage(merge::MergeState::default())
        .manage(convert::ConvertState::default())
        .setup(|app| {
            let path = store::settings_path(app.handle())?;
            app.manage(SettingsStore::load(path));
            let lib = library::library_path(app.handle())?;
            app.manage(Arc::new(library::LibraryStore::load(lib)));
            let pending = link::link_path(app.handle())?;
            app.manage(Arc::new(link::LinkStore::load(pending)));
            // กวาดไฟล์ชั่วคราวที่ค้างจากงานที่โดนปิดกลางทางหรือไฟดับ (โปรแกรมเปิดได้ทีละตัว ตอนนี้ยังไม่มีงานไหนถือไฟล์)
            // ไดรฟ์ C ที่ว่างน้อย เสียงที่แปลงตอนรวมค้างได้หลาย GB (ผู้ช่วยตรวจขั้น 10 ข้อ 11) · ภาพซับรูป subimg- เป็นของที่เก็บไว้ใช้ซ้ำ ไม่ลบ
            if let Ok(tmp) = app.path().app_local_data_dir().map(|d| d.join("tmp")) {
                for e in std::fs::read_dir(&tmp).into_iter().flatten().flatten() {
                    let n = e.file_name().to_string_lossy().to_string();
                    if ["merge-conv-", "merge-vtt-", "merge-oldcover-", "conv-cover-", "sub-"].iter().any(|p| n.starts_with(p)) && e.path().is_file() {
                        let _ = std::fs::remove_file(e.path());
                    }
                }
            }
            // หน้าต่างตั้งไว้ไม่แสดงตอนสร้าง (tauri.conf.json visible:false) แสดงที่นี่
            // ตอนเทสผ่าน scripts/dev-app.ps1 เปิดแบบไม่แย่งโฟกัส อยู่หลังหน้าต่างอื่น · เปิดปกติขึ้นหน้าตามปกติ
            // รุ่นจริงที่ติดตั้งแล้วก็ใช้ได้เมื่อคนเปิดตั้งตัวแปรนี้เอง ใช้เทสตัวติดตั้งตอนพี่กันลงเวร ไม่ให้หน้าต่างเด้งขึ้นหน้าจอคนอื่น (ขั้น 8)
            // ตัวแปรนี้แค่วางหน้าต่างไว้หลังสุด ไม่เปิดสิทธิ์หรือคำสั่งอะไรเพิ่ม
            match app.get_webview_window("main") {
                Some(w) if std::env::var("MOVIE_SHELF_BACKGROUND").as_deref() == Ok("1") => {
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
        // กันปิดตอนมีงาน ทางที่ 1 กดปิดหน้าต่าง (ปุ่มปิดของแถบชื่อ · Alt+F4 · ปิดจากแถบงาน) · มีคู่รูปปกที่ยังไม่ยืนยันก็ถามที่นี่
        .on_window_event(|window, event| {
            if let WindowEvent::CloseRequested { api, .. } = event {
                if jobs::guard_close(window.app_handle()) {
                    api.prevent_close();
                }
            }
        });

    #[cfg(debug_assertions)]
    let builder = builder.invoke_handler(tauri::generate_handler![
        tools::check_tools, tools::check_icaros, tools::open_icaros_page, store::get_settings, store::set_settings,
        jobs::running_jobs, jobs::force_close, jobs::dev_fake_job, poster::dev_fake_free, library::dev_set_check, library::dev_clear_parked,
        library::get_library, library::scan_library, library::play_movie, library::reveal_movie,
        rename::check_rename, rename::rename_movie,
        poster::poster_open, poster::poster_render, poster::poster_clear, poster::poster_folder_images,
        poster::poster_inspect, poster::poster_apply, poster::poster_cancel,
        merge::merge_inspect, merge::merge_add_file, merge::merge_apply, merge::merge_cancel, merge::merge_cover_preview, merge::merge_cover_drop, encode::encode_preview, encode::encoders_status, encode::encoders_open_dir, encode::encoders_user_dir, latest::encoders_latest, latest::encoders_open_page, fonts::font_info,
        delay::delay_find, delay::delay_view, delay::delay_preview,
        subs::sub_text, subs::sub_frame, subs::sub_wave, subs::sub_images,
        pairs::pair_set, pairs::pair_check, pairs::pair_play,
        link::link_state, link::link_titles, link::link_is_dir, link::link_images, link::link_add_images, link::link_remove_images, link::link_auto, link::link_pair, link::link_undo, link::link_row_update, link::link_set_crop, link::link_confirm, link::link_cancel, link::link_resolve, link::link_unsave, link::link_remove, link::link_open_row, link::link_cover_pick, link::link_migrate,
        convert::convert_probe, convert::convert_cover, convert::convert_one, convert::convert_cancel,
        fileinfo::media_info, fileinfo::hash_file, fileinfo::hash_cancel, fileinfo::hash_running, fileinfo::hash_compare, fileinfo::hash_save,
        extract::extract_start, extract::extract_cancel, extract::extract_running, extract::extract_default_folder,
        check::check_start, check::check_cancel, check::check_running, check::play_at,
        audiograph::graph_info, audiograph::graph_overview, audiograph::graph_window, audiograph::graph_psd, audiograph::graph_cancel, audiograph::graph_save,
        audiograph::graph_cache_info, audiograph::graph_cache_clear, audiograph::graph_dev_forget,
    ]);
    #[cfg(not(debug_assertions))]
    let builder = builder.invoke_handler(tauri::generate_handler![
        tools::check_tools, tools::check_icaros, tools::open_icaros_page, store::get_settings, store::set_settings,
        jobs::running_jobs, jobs::force_close,
        library::get_library, library::scan_library, library::play_movie, library::reveal_movie,
        rename::check_rename, rename::rename_movie,
        poster::poster_open, poster::poster_render, poster::poster_clear, poster::poster_folder_images,
        poster::poster_inspect, poster::poster_apply, poster::poster_cancel,
        merge::merge_inspect, merge::merge_add_file, merge::merge_apply, merge::merge_cancel, merge::merge_cover_preview, merge::merge_cover_drop, encode::encode_preview, encode::encoders_status, encode::encoders_open_dir, encode::encoders_user_dir, latest::encoders_latest, latest::encoders_open_page, fonts::font_info,
        delay::delay_find, delay::delay_view, delay::delay_preview,
        subs::sub_text, subs::sub_frame, subs::sub_wave, subs::sub_images,
        pairs::pair_set, pairs::pair_check, pairs::pair_play,
        link::link_state, link::link_titles, link::link_is_dir, link::link_images, link::link_add_images, link::link_remove_images, link::link_auto, link::link_pair, link::link_undo, link::link_row_update, link::link_set_crop, link::link_confirm, link::link_cancel, link::link_resolve, link::link_unsave, link::link_remove, link::link_open_row, link::link_cover_pick, link::link_migrate,
        convert::convert_probe, convert::convert_cover, convert::convert_one, convert::convert_cancel,
        fileinfo::media_info, fileinfo::hash_file, fileinfo::hash_cancel, fileinfo::hash_running, fileinfo::hash_compare, fileinfo::hash_save,
        extract::extract_start, extract::extract_cancel, extract::extract_running, extract::extract_default_folder,
        check::check_start, check::check_cancel, check::check_running, check::play_at,
        audiograph::graph_info, audiograph::graph_overview, audiograph::graph_window, audiograph::graph_psd, audiograph::graph_cancel, audiograph::graph_save,
        audiograph::graph_cache_info, audiograph::graph_cache_clear,
    ]);

    builder
        .build(tauri::generate_context!())
        .expect("เปิดโปรแกรมชั้นหนังไม่สำเร็จ")
        // กันปิดตอนมีงาน ทางที่ 2 โปรแกรมกำลังจะออก (หน้าต่างสุดท้ายหายไปด้วยทางอื่น) · ผลตรวจขั้น 0 โค้ดข้อ 6
        // ทางนี้ไม่กันเรื่องคู่รูปปก หน้าต่างหายไปแล้วถามไม่ได้ โปรแกรมจะค้างโดยไม่มีหน้าต่าง · คู่ที่รอจดลงไฟล์ไว้แล้ว ไม่หาย
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
