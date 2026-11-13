//! ชั้นหนัง · ฝั่งทำงานหนักของโปรแกรม

mod actlog;
mod ape;
mod audiograph;
mod bitrate;
mod check;
mod convert;
mod delay;
mod encode;
mod graphimg;
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
mod players;
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
            // บันทึกการใช้งาน ตั้งก่อนอย่างอื่น งานที่ตามมาจะได้จดลงไฟล์ได้ (พี่กันเสนอ 12 พ.ย. 2569)
            if let Ok(local) = app.path().app_local_data_dir() {
                actlog::init(local.join("logs"));
                actlog::note("เปิดโปรแกรม", &format!("รุ่น {}", app.package_info().version));
            }
            let path = store::settings_path(app.handle())?;
            app.manage(SettingsStore::load(path));
            let lib = library::library_path(app.handle())?;
            app.manage(Arc::new(library::LibraryStore::load(lib)));
            let pending = link::link_path(app.handle())?;
            app.manage(Arc::new(link::LinkStore::load(pending)));
            // โฟลเดอร์รูปที่หน้าจอเปิดผ่าน asset protocol (thumbs previews frames ใน tauri.conf.json)
            // เปิดโปรแกรมจากโปรแกรมแบบแพ็กเกจของ Windows (เช่นตอนแคลร์เปิดโหมดพัฒนาจากโปรแกรม Claude) Windows เก็บไฟล์ใหม่ไว้ในโฟลเดอร์ของแพ็กเกจแทน
            // Tauri เทียบที่อยู่จริงของไฟล์หลังคลี่ (canonicalize) กับกติกา ไม่ตรง รูปขึ้น 403 · เจอ 11 พ.ย. 2569 รูปในหน้าครอปของโหมดพัฒนาเป็นรูปเสีย
            // ทางแก้ เขียนไฟล์ทดลองในแต่ละโฟลเดอร์ ดูว่าไฟล์ใหม่ไปอยู่ที่ไหนจริง แล้วเพิ่มโฟลเดอร์จริงนั้นเข้ากติกา · เปิดตามปกติได้โฟลเดอร์เดิม ไม่มีอะไรเปลี่ยน
            if let Ok(local) = app.path().app_local_data_dir() {
                for sub in ["thumbs", "previews", "frames"] {
                    let d = local.join(sub);
                    let _ = std::fs::create_dir_all(&d);
                    let probe = d.join(".scope-probe");
                    if std::fs::write(&probe, b"").is_ok() {
                        if let Some(real) = std::fs::canonicalize(&probe).ok().and_then(|p| p.parent().map(|x| x.to_path_buf())) {
                            let _ = app.asset_protocol_scope().allow_directory(&real, true);
                        }
                        let _ = std::fs::remove_file(&probe);
                    }
                }
            }
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
            // หน้าต่างใหญ่กว่าจอ (จอเล็ก หรือจำขนาดจากจอใหญ่) ย่อให้พอดีก่อนแสดง
            if let Some(w) = app.get_webview_window("main") { winutil::fit_monitor(&w); }
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
            // ลากหน้าต่างไปจอที่เล็กกว่า ย่อให้พอดีพื้นที่ใช้ได้ของจอนั้น · รอหยุดลาก 0.4 วินาทีก่อน ไม่สู้มือคนที่ลากอยู่
            if let WindowEvent::Moved(_) = event {
                static MOVES: std::sync::atomic::AtomicU64 = std::sync::atomic::AtomicU64::new(0);
                let n = MOVES.fetch_add(1, std::sync::atomic::Ordering::SeqCst) + 1;
                if let Some(w) = window.app_handle().get_webview_window(window.label()) {
                    std::thread::spawn(move || {
                        std::thread::sleep(std::time::Duration::from_millis(400));
                        if MOVES.load(std::sync::atomic::Ordering::SeqCst) == n { winutil::fit_monitor(&w); }
                    });
                }
            }
            if let WindowEvent::CloseRequested { api, .. } = event {
                if jobs::guard_close(window.app_handle()) {
                    api.prevent_close();
                }
            }
        });

    // ทางเข้ากลางของคำสั่งจากหน้าจอ จดงานที่เขียน ย้าย หรือลบไฟล์ลงบันทึกการใช้งานก่อนส่งต่อ (actlog.rs WATCH)
    // typed บอกชนิดของรายการคำสั่งตั้งแต่ตอนสร้าง ไม่งั้นตัวคอมไพล์เดาชนิดไม่ได้เมื่อห่อด้วยตัวจด
    fn typed<F: Fn(tauri::ipc::Invoke<tauri::Wry>) -> bool>(f: F) -> F { f }
    #[cfg(debug_assertions)]
    let handler = typed(tauri::generate_handler![
        actlog::actlog_info, actlog::actlog_open_dir,
        tools::check_tools, tools::check_icaros, tools::open_icaros_page, store::get_settings, store::set_settings,
        jobs::running_jobs, jobs::force_close, jobs::dev_fake_job, poster::dev_fake_free, library::dev_set_check, library::dev_clear_parked,
        library::get_library, library::scan_library, library::play_movie, library::reveal_movie, library::set_rating,
        rename::check_rename, rename::rename_movie,
        poster::poster_open, poster::poster_view, poster::poster_render, poster::poster_clear, poster::poster_folder_images,
        poster::poster_inspect, poster::poster_apply, poster::poster_cancel, poster::poster_check_name,
        latest::thanks_open, bitrate::bitrate_start, bitrate::bitrate_tracks, bitrate::bitrate_stop, merge::merge_inspect, merge::merge_add_file, merge::merge_apply, merge::merge_cancel, merge::merge_cover_preview, merge::merge_cover_drop, encode::encode_preview, encode::encoders_status, encode::encoders_open_dir, encode::encoders_user_dir, latest::encoders_latest, latest::encoders_open_page, latest::open_itunes_page, fonts::font_info,
        delay::delay_find, delay::delay_view, delay::delay_preview,
        subs::movie_frame, subs::sub_text, subs::sub_frame, subs::sub_wave, subs::sub_images,
        pairs::pair_set, pairs::pair_check, pairs::pair_play,
        link::link_state, link::link_titles, link::link_is_dir, link::link_images, link::link_add_images, link::link_remove_images, link::link_auto, link::link_pair, link::link_undo, link::link_row_update, link::link_set_crop, link::link_confirm, link::link_cancel, link::link_resolve, link::link_unsave, link::link_remove, link::link_open_row, link::link_cover_pick, link::link_migrate,
        convert::convert_probe, convert::convert_cover, convert::convert_one, convert::convert_cancel,
        fileinfo::media_info, fileinfo::audio_codec_detail, fileinfo::hash_file, fileinfo::hash_cancel, fileinfo::hash_running, fileinfo::hash_compare, fileinfo::hash_save, winutil::clipboard_text,
        extract::extract_start, extract::extract_cancel, extract::extract_running, extract::extract_default_folder,
        check::check_start, check::check_cancel, check::check_running, check::play_at, players::list_players,
        audiograph::graph_info, audiograph::graph_exist, audiograph::graph_overview, audiograph::graph_window, audiograph::graph_psd, audiograph::graph_cancel, audiograph::graph_save, graphimg::graph_save_image,
        audiograph::graph_cache_info, audiograph::graph_cache_clear, audiograph::graph_dev_forget,
    ]);
    #[cfg(not(debug_assertions))]
    let handler = typed(tauri::generate_handler![
        actlog::actlog_info, actlog::actlog_open_dir,
        tools::check_tools, tools::check_icaros, tools::open_icaros_page, store::get_settings, store::set_settings,
        jobs::running_jobs, jobs::force_close,
        library::get_library, library::scan_library, library::play_movie, library::reveal_movie, library::set_rating,
        rename::check_rename, rename::rename_movie,
        poster::poster_open, poster::poster_view, poster::poster_render, poster::poster_clear, poster::poster_folder_images,
        poster::poster_inspect, poster::poster_apply, poster::poster_cancel, poster::poster_check_name,
        latest::thanks_open, bitrate::bitrate_start, bitrate::bitrate_tracks, bitrate::bitrate_stop, merge::merge_inspect, merge::merge_add_file, merge::merge_apply, merge::merge_cancel, merge::merge_cover_preview, merge::merge_cover_drop, encode::encode_preview, encode::encoders_status, encode::encoders_open_dir, encode::encoders_user_dir, latest::encoders_latest, latest::encoders_open_page, latest::open_itunes_page, fonts::font_info,
        delay::delay_find, delay::delay_view, delay::delay_preview,
        subs::movie_frame, subs::sub_text, subs::sub_frame, subs::sub_wave, subs::sub_images,
        pairs::pair_set, pairs::pair_check, pairs::pair_play,
        link::link_state, link::link_titles, link::link_is_dir, link::link_images, link::link_add_images, link::link_remove_images, link::link_auto, link::link_pair, link::link_undo, link::link_row_update, link::link_set_crop, link::link_confirm, link::link_cancel, link::link_resolve, link::link_unsave, link::link_remove, link::link_open_row, link::link_cover_pick, link::link_migrate,
        convert::convert_probe, convert::convert_cover, convert::convert_one, convert::convert_cancel,
        fileinfo::media_info, fileinfo::audio_codec_detail, fileinfo::hash_file, fileinfo::hash_cancel, fileinfo::hash_running, fileinfo::hash_compare, fileinfo::hash_save, winutil::clipboard_text,
        extract::extract_start, extract::extract_cancel, extract::extract_running, extract::extract_default_folder,
        check::check_start, check::check_cancel, check::check_running, check::play_at, players::list_players,
        audiograph::graph_info, audiograph::graph_exist, audiograph::graph_overview, audiograph::graph_window, audiograph::graph_psd, audiograph::graph_cancel, audiograph::graph_save, graphimg::graph_save_image,
        audiograph::graph_cache_info, audiograph::graph_cache_clear,
    ]);
    let builder = builder.invoke_handler(move |invoke| {
        actlog::invoke(invoke.message.command(), invoke.message.payload());
        handler(invoke)
    });

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
