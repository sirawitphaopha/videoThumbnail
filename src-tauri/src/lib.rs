//! ชั้นหนัง · ฝั่งทำงานหนักของโปรแกรม

mod app;
mod audio;
mod media;
mod subtitle;
mod cover;
mod merge;
mod video;
mod ocr;

use std::sync::Arc;

use tauri::{Emitter, Manager, RunEvent, WindowEvent};

use app::jobs::Jobs;
use app::store::SettingsStore;

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
        .manage(cover::poster::PosterState::default())
        .manage(merge::MergeState::default())
        .manage(audio::convert::ConvertState::default())
        .setup(|app| {
            // บันทึกการใช้งาน ตั้งก่อนอย่างอื่น งานที่ตามมาจะได้จดลงไฟล์ได้ (พี่กันเสนอ 12 พ.ย. 2569)
            if let Ok(local) = app.path().app_local_data_dir() {
                app::actlog::init(local.join("logs"));
                app::actlog::note("เปิดโปรแกรม", &format!("รุ่น {}", app.package_info().version));
            }
            let path = app::store::settings_path(app.handle())?;
            let settings = SettingsStore::load(path);
            if settings.loaded_from == app::store::LoadedFrom::Partial {
                app::actlog::note("ไฟล์ตั้งค่าเสียบางช่อง", &format!("กลับเป็นค่าตั้งต้นเฉพาะ {}", settings.reset_fields.join(", ")));
            }
            let lib = app::library::library_path(app.handle())?;
            let library = app::library::LibraryStore::load(lib);
            // ไฟล์ตั้งค่าเสียทั้งสองชุด รายชื่อโฟลเดอร์คืนจากคลังหนัง ชั้นวางกับประวัติตรวจไม่หาย (AUDIT ข้อ 129)
            let roots: Vec<String> = library.movies.lock().unwrap().iter().map(|m| m.root.clone()).filter(|r| !r.is_empty()).collect();
            let n = settings.recover_folders(roots);
            if n > 0 { app::actlog::note("ไฟล์ตั้งค่าเสียทั้งสองชุด", &format!("เอารายชื่อโฟลเดอร์หนังคืนจากคลังหนัง {n} โฟลเดอร์")); }
            app.manage(settings);
            app.manage(Arc::new(library));
            let pending = cover::link::link_path(app.handle())?;
            app.manage(Arc::new(cover::link::LinkStore::load(pending)));
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
            // ไฟล์ทำค้างข้างไฟล์ของผู้ใช้ที่จดไว้รอบก่อน ลบหรือย้ายเข้าชื่อจริง แล้วจดลงบันทึกการใช้งาน (BUGS ข้อ 162.4 · app/inflight.rs)
            if let Ok(local) = app.path().app_local_data_dir() {
                let _ = std::fs::create_dir_all(&local);
                for n in crate::app::inflight::init(local.join("inflight.json")) { crate::app::actlog::note("เก็บกวาดไฟล์ทำค้าง", &n); }
            }
            // กวาดไฟล์ชั่วคราวที่ค้างจากงานที่โดนปิดกลางทางหรือไฟดับ (โปรแกรมเปิดได้ทีละตัว ตอนนี้ยังไม่มีงานไหนถือไฟล์)
            // ไดรฟ์ C ที่ว่างน้อย เสียงที่แปลงตอนรวมค้างได้หลาย GB (ผู้ช่วยตรวจขั้น 10 ข้อ 11) · ภาพซับรูป subimg- เป็นของที่เก็บไว้ใช้ซ้ำ ไม่ลบ
            if let Ok(tmp) = app.path().app_local_data_dir().map(|d| d.join("tmp")) {
                for e in std::fs::read_dir(&tmp).into_iter().flatten().flatten() {
                    let n = e.file_name().to_string_lossy().to_string();
                    if crate::app::tools::TMP_SWEEP.iter().any(|p| n.starts_with(p)) && e.path().is_file() {
                        let _ = std::fs::remove_file(e.path());
                    }
                }
            }
            // หน้าต่างตั้งไว้ไม่แสดงตอนสร้าง (tauri.conf.json visible:false) แสดงที่นี่
            // ตอนเทสผ่าน scripts/dev-app.ps1 เปิดแบบไม่แย่งโฟกัส อยู่หลังหน้าต่างอื่น · เปิดปกติขึ้นหน้าตามปกติ
            // รุ่นจริงที่ติดตั้งแล้วก็ใช้ได้เมื่อคนเปิดตั้งตัวแปรนี้เอง ใช้เทสตัวติดตั้งตอนพี่กันลงเวร ไม่ให้หน้าต่างเด้งขึ้นหน้าจอคนอื่น (ขั้น 8)
            // ตัวแปรนี้แค่วางหน้าต่างไว้หลังสุด ไม่เปิดสิทธิ์หรือคำสั่งอะไรเพิ่ม
            // หน้าต่างใหญ่กว่าจอ (จอเล็ก หรือจำขนาดจากจอใหญ่) ย่อให้พอดีก่อนแสดง
            if let Some(w) = app.get_webview_window("main") { app::winutil::fit_monitor(&w); }
            match app.get_webview_window("main") {
                Some(w) if std::env::var("MOVIE_SHELF_BACKGROUND").as_deref() == Ok("1") => {
                    app::winutil::show_behind(&w);
                    eprintln!("ชั้นหนัง: หน้าต่างเทสเปิดแบบไม่แย่งโฟกัส อยู่หลังสุด");
                }
                Some(w) => {
                    // ปิดครั้งก่อนตอนขยายเต็มจอ เปิดมาขยายเต็มจอเลย (BUGS ข้อ 89) · ตัวเทสที่เปิดอยู่หลังสุดไม่ขยาย ไม่ไปกินทั้งจอของคนที่ใช้คอม
                    if app.state::<SettingsStore>().current.lock().unwrap().window_maximized { let _ = w.maximize(); }
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
                        if MOVES.load(std::sync::atomic::Ordering::SeqCst) == n { app::winutil::fit_monitor(&w); }
                    });
                }
            }
            if let WindowEvent::CloseRequested { api, .. } = event {
                // จำว่ากดปิดตอนขยายเต็มจอไหม (BUGS ข้อ 89) · ปิดจากแถบงานตอนย่ออยู่ ไม่รู้ว่าก่อนย่อเป็นแบบไหน จึงคงค่าเดิม
                if !window.is_minimized().unwrap_or(false) {
                    window.app_handle().state::<SettingsStore>().remember_maximized(window.is_maximized().unwrap_or(false));
                }
                if app::jobs::guard_close(window.app_handle()) {
                    api.prevent_close();
                }
            }
        });

    // ทางเข้ากลางของคำสั่งจากหน้าจอ จดงานที่เขียน ย้าย หรือลบไฟล์ลงบันทึกการใช้งานก่อนส่งต่อ (actlog.rs WATCH)
    // typed บอกชนิดของรายการคำสั่งตั้งแต่ตอนสร้าง ไม่งั้นตัวคอมไพล์เดาชนิดไม่ได้เมื่อห่อด้วยตัวจด
    fn typed<F: Fn(tauri::ipc::Invoke<tauri::Wry>) -> bool>(f: F) -> F { f }
    #[cfg(debug_assertions)]
    let handler = typed(tauri::generate_handler![
        app::actlog::actlog_info, app::actlog::actlog_open_dir,
        app::tools::check_tools, app::tools::check_icaros, app::tools::open_icaros_page, app::store::get_settings, app::store::set_settings, app::drives::drive_space, app::drives::drive_open, app::drives::drive_free, media::chapters::chapters_read,
        app::jobs::running_jobs, app::jobs::force_close, app::jobs::dev_fake_job, cover::poster::dev_fake_free, app::library::dev_set_check, app::library::dev_clear_parked,
        app::library::get_library, app::library::scan_library, app::library::play_movie, app::library::reveal_movie, app::library::set_rating,
        cover::rename::check_rename, cover::rename::rename_movie,
        cover::poster::poster_open, cover::poster::poster_view, cover::poster::poster_render, cover::poster::poster_clear, cover::poster::poster_restore, cover::poster::poster_folder_images,
        cover::poster::poster_inspect, cover::poster::poster_apply, cover::poster::poster_cancel, cover::poster::poster_check_name,
        app::latest::thanks_open, media::bitrate::bitrate_start, media::bitrate::bitrate_tracks, media::bitrate::bitrate_stop, merge::inspect::merge_inspect, merge::inspect::remux_fonts, merge::inspect::merge_add_file, merge::merge_apply, merge::merge_cancel, merge::merge_cover_preview, merge::merge_cover_drop, audio::encode::encode_preview, audio::encode::encoders_status, audio::encode::encoders_open_dir, audio::encode::encoders_user_dir, app::latest::encoders_latest, app::latest::encoders_open_page, app::latest::open_itunes_page, subtitle::fonts::font_info,
        audio::delay::delay_find, audio::delay::delay_view, audio::delay::delay_preview,
        subtitle::subs::movie_frame, subtitle::subs::sub_text, subtitle::subs::sub_frame, subtitle::subs::sub_wave, subtitle::subs::sub_images, subtitle::subs::sub_image_times, subtitle::subs::sub_images_cancel, ocr::ocrsrc::ocr_source, ocr::ocrsrc::ocr_source_pngs, subtitle::subs::ocr_vobsub_recolor, subtitle::subs::ocr_vobsub_preview, ocr::ocrjob::ocr_read, ocr::ocrjob::ocr_teach, ocr::ocrjob::ocr_word, ocr::ocrjob::ocr_suggest, ocr::ocrjob::ocr_names, ocr::ocrjob::ocr_dbs, ocr::ocrjob::ocr_history, ocr::ocrjob::ocr_history_update, ocr::ocrjob::ocr_history_delete, ocr::ocrjob::ocr_inspect, ocr::ocrjob::ocr_inspect_update, ocr::ocrjob::ocr_inspect_delete, ocr::ocrjob::ocr_inspect_draw, ocr::ocrjob::ocr_inspect_teach, ocr::ocrjob::ocr_inspect_reload, ocr::ocrjob::ocr_remove_items, ocr::ocrjob::ocr_stop, ocr::ocrjob::ocr_prep_preview, ocr::ocrjob::ocr_paddle_models, ocr::ocrjob::ocr_db_delete, ocr::ocrjob::ocr_image_out, ocr::ocrmanual::ocr_db_new, ocr::ocrmanual::ocr_db_rename, ocr::ocrmanual::ocr_db_chars, ocr::ocrmanual::ocr_db_char_update, ocr::ocrmanual::ocr_db_char_delete, ocr::ocrmanual::ocr_train, ocr::ocrmanual::ocr_train_cancel, ocr::ocrmanual::ocr_train_preview, ocr::ocrmanual::ocr_db_optimize, ocr::ocrexport::ocr_export_formats, ocr::ocrexport::ocr_export_preview, ocr::ocrexport::ocr_export, ocr::ocrexport::ocr_export_doc, ocr::ocrexport::ocr_save_html, ocr::tesseract::ocr_tess_langs, ocr::tesseract::ocr_tess_download, ocr::tesseract::ocr_tess_cancel, ocr::paddle_dl::ocr_paddle_langs, ocr::paddle_dl::ocr_paddle_download, ocr::paddle_dl::ocr_paddle_cancel,
        subtitle::subdoc::subdoc_open, subtitle::subdoc::subdoc_stamp, subtitle::subdoc::subdoc_save, subtitle::subdoc::subdoc_convert, subtitle::subdoc::subdoc_free_name, subtitle::subdoc::subdoc_render, subtitle::subdoc::subdoc_parse_text, subtitle::subdoc::subdoc_temp, subtitle::subshot::sub_overlay, subtitle::subshot::vid_snapshot, video::vidframes::vid_colorspace,
        subtitle::subdoc::subdoc_set_dirty, subtitle::subdoc::subdoc_autosave, subtitle::subdoc::subdoc_autosaves, subtitle::subdoc::subdoc_open_autosave, subtitle::fonts::font_families,
        video::vidframes::vid_table, video::vidframes::vid_table_stop, video::vidframes::vid_frames, video::vidframes::vid_scenes, video::vidframes::vid_scenes_stop, video::vidframes::vid_keys_load, video::vidframes::vid_keys_save, video::vidplay::vid_play, video::vidplay::vid_play_stop, video::mpvplay::mpv_play, video::mpvplay::mpv_state, video::mpvplay::mpv_rect, video::mpvplay::mpv_sub, video::mpvplay::mpv_volume, video::mpvplay::mpv_stop, video::mpvplay::mpv_available, video::mpvplay::mpv_dev_props, video::mpvplay::mpv_dev_shot,
        subtitle::subaudio::sub_pcm, subtitle::subaudio::sub_audio_save, subtitle::subaudio::sub_peaks, subtitle::pgs::pgs_export, subtitle::pgs::pgs_cancel, subtitle::pgs::pgs_preview, subtitle::pgs::pgs_engines, subtitle::pgs::pgs_estimate, subtitle::imgconv::imgsub_convert, subtitle::imgconv::imgsub_cancel, subtitle::imgconv::imgsub_tools, subtitle::imgconv::imgsub_preview,
        cover::pairs::pair_set, cover::pairs::pair_check, cover::pairs::pair_play,
        cover::link::rows::link_state, cover::link::link_titles, cover::link::link_is_dir, cover::link::rows::link_images, cover::link::rows::link_add_images, cover::link::rows::link_remove_images, cover::link::rows::link_auto, cover::link::rows::link_pair, cover::link::rows::link_undo, cover::link::rows::link_row_update, cover::link::rows::link_set_crop, cover::link::commands::link_confirm, cover::link::commands::link_cancel, cover::link::commands::link_resolve, cover::link::commands::link_unsave, cover::link::commands::link_remove, cover::link::commands::link_open_row, cover::link::commands::link_cover_pick, cover::link::commands::link_migrate,
        audio::convert::convert_probe, audio::convert::convert_size_probe, audio::convert::convert_cover, audio::convert::convert_expand, audio::convert::convert_one, audio::convert::convert_cancel,
        media::fileinfo::media_info, media::mkvtree::mkv_tree, media::fileinfo::audio_codec_detail, media::encinfo::audio_encoder_info, media::encinfo::flac_verify, media::fileinfo::hash_file, media::fileinfo::hash_cancel, media::fileinfo::hash_running, media::fileinfo::hash_compare, media::fileinfo::hash_save, app::winutil::clipboard_text,
        media::extract::extract_start, media::extract::extract_info, media::extract::extract_cancel, media::extract::extract_running, media::extract::extract_default_folder,
        media::check::check_start, media::check::check_cancel, media::check::check_running, media::check::play_at, media::players::list_players,
        audio::audiograph::graph_info, audio::audiograph::graph_exist, audio::audiograph::graph_overview, audio::audiograph::graph_window, audio::audiograph::play::graph_pcm, audio::audiograph::graph_psd, audio::audiograph::graph_cancel, audio::audiograph::graph_save, audio::graphimg::graph_save_image,
        audio::audiograph::graph_cache_info, audio::audiograph::graph_cache_clear, audio::audiograph::graph_dev_forget,
    ]);
    #[cfg(not(debug_assertions))]
    let handler = typed(tauri::generate_handler![
        app::actlog::actlog_info, app::actlog::actlog_open_dir,
        app::tools::check_tools, app::tools::check_icaros, app::tools::open_icaros_page, app::store::get_settings, app::store::set_settings, app::drives::drive_space, app::drives::drive_open, app::drives::drive_free, media::chapters::chapters_read,
        app::jobs::running_jobs, app::jobs::force_close,
        app::library::get_library, app::library::scan_library, app::library::play_movie, app::library::reveal_movie, app::library::set_rating,
        cover::rename::check_rename, cover::rename::rename_movie,
        cover::poster::poster_open, cover::poster::poster_view, cover::poster::poster_render, cover::poster::poster_clear, cover::poster::poster_restore, cover::poster::poster_folder_images,
        cover::poster::poster_inspect, cover::poster::poster_apply, cover::poster::poster_cancel, cover::poster::poster_check_name,
        app::latest::thanks_open, media::bitrate::bitrate_start, media::bitrate::bitrate_tracks, media::bitrate::bitrate_stop, merge::inspect::merge_inspect, merge::inspect::remux_fonts, merge::inspect::merge_add_file, merge::merge_apply, merge::merge_cancel, merge::merge_cover_preview, merge::merge_cover_drop, audio::encode::encode_preview, audio::encode::encoders_status, audio::encode::encoders_open_dir, audio::encode::encoders_user_dir, app::latest::encoders_latest, app::latest::encoders_open_page, app::latest::open_itunes_page, subtitle::fonts::font_info,
        audio::delay::delay_find, audio::delay::delay_view, audio::delay::delay_preview,
        subtitle::subs::movie_frame, subtitle::subs::sub_text, subtitle::subs::sub_frame, subtitle::subs::sub_wave, subtitle::subs::sub_images, subtitle::subs::sub_image_times, subtitle::subs::sub_images_cancel, ocr::ocrsrc::ocr_source, ocr::ocrsrc::ocr_source_pngs, subtitle::subs::ocr_vobsub_recolor, subtitle::subs::ocr_vobsub_preview, ocr::ocrjob::ocr_read, ocr::ocrjob::ocr_teach, ocr::ocrjob::ocr_word, ocr::ocrjob::ocr_suggest, ocr::ocrjob::ocr_names, ocr::ocrjob::ocr_dbs, ocr::ocrjob::ocr_history, ocr::ocrjob::ocr_history_update, ocr::ocrjob::ocr_history_delete, ocr::ocrjob::ocr_inspect, ocr::ocrjob::ocr_inspect_update, ocr::ocrjob::ocr_inspect_delete, ocr::ocrjob::ocr_inspect_draw, ocr::ocrjob::ocr_inspect_teach, ocr::ocrjob::ocr_inspect_reload, ocr::ocrjob::ocr_remove_items, ocr::ocrjob::ocr_stop, ocr::ocrjob::ocr_prep_preview, ocr::ocrjob::ocr_paddle_models, ocr::ocrjob::ocr_db_delete, ocr::ocrjob::ocr_image_out, ocr::ocrmanual::ocr_db_new, ocr::ocrmanual::ocr_db_rename, ocr::ocrmanual::ocr_db_chars, ocr::ocrmanual::ocr_db_char_update, ocr::ocrmanual::ocr_db_char_delete, ocr::ocrmanual::ocr_train, ocr::ocrmanual::ocr_train_cancel, ocr::ocrmanual::ocr_train_preview, ocr::ocrmanual::ocr_db_optimize, ocr::ocrexport::ocr_export_formats, ocr::ocrexport::ocr_export_preview, ocr::ocrexport::ocr_export, ocr::ocrexport::ocr_export_doc, ocr::ocrexport::ocr_save_html, ocr::tesseract::ocr_tess_langs, ocr::tesseract::ocr_tess_download, ocr::tesseract::ocr_tess_cancel, ocr::paddle_dl::ocr_paddle_langs, ocr::paddle_dl::ocr_paddle_download, ocr::paddle_dl::ocr_paddle_cancel,
        subtitle::subdoc::subdoc_open, subtitle::subdoc::subdoc_stamp, subtitle::subdoc::subdoc_save, subtitle::subdoc::subdoc_convert, subtitle::subdoc::subdoc_free_name, subtitle::subdoc::subdoc_render, subtitle::subdoc::subdoc_parse_text, subtitle::subdoc::subdoc_temp, subtitle::subshot::sub_overlay, subtitle::subshot::vid_snapshot, video::vidframes::vid_colorspace,
        subtitle::subdoc::subdoc_set_dirty, subtitle::subdoc::subdoc_autosave, subtitle::subdoc::subdoc_autosaves, subtitle::subdoc::subdoc_open_autosave, subtitle::fonts::font_families,
        video::vidframes::vid_table, video::vidframes::vid_table_stop, video::vidframes::vid_frames, video::vidframes::vid_scenes, video::vidframes::vid_scenes_stop, video::vidframes::vid_keys_load, video::vidframes::vid_keys_save, video::vidplay::vid_play, video::vidplay::vid_play_stop, video::mpvplay::mpv_play, video::mpvplay::mpv_state, video::mpvplay::mpv_rect, video::mpvplay::mpv_sub, video::mpvplay::mpv_volume, video::mpvplay::mpv_stop, video::mpvplay::mpv_available, video::mpvplay::mpv_dev_props, video::mpvplay::mpv_dev_shot,
        subtitle::subaudio::sub_pcm, subtitle::subaudio::sub_audio_save, subtitle::subaudio::sub_peaks, subtitle::pgs::pgs_export, subtitle::pgs::pgs_cancel, subtitle::pgs::pgs_preview, subtitle::pgs::pgs_engines, subtitle::pgs::pgs_estimate, subtitle::imgconv::imgsub_convert, subtitle::imgconv::imgsub_cancel, subtitle::imgconv::imgsub_tools, subtitle::imgconv::imgsub_preview,
        cover::pairs::pair_set, cover::pairs::pair_check, cover::pairs::pair_play,
        cover::link::rows::link_state, cover::link::link_titles, cover::link::link_is_dir, cover::link::rows::link_images, cover::link::rows::link_add_images, cover::link::rows::link_remove_images, cover::link::rows::link_auto, cover::link::rows::link_pair, cover::link::rows::link_undo, cover::link::rows::link_row_update, cover::link::rows::link_set_crop, cover::link::commands::link_confirm, cover::link::commands::link_cancel, cover::link::commands::link_resolve, cover::link::commands::link_unsave, cover::link::commands::link_remove, cover::link::commands::link_open_row, cover::link::commands::link_cover_pick, cover::link::commands::link_migrate,
        audio::convert::convert_probe, audio::convert::convert_size_probe, audio::convert::convert_cover, audio::convert::convert_expand, audio::convert::convert_one, audio::convert::convert_cancel,
        media::fileinfo::media_info, media::mkvtree::mkv_tree, media::fileinfo::audio_codec_detail, media::encinfo::audio_encoder_info, media::encinfo::flac_verify, media::fileinfo::hash_file, media::fileinfo::hash_cancel, media::fileinfo::hash_running, media::fileinfo::hash_compare, media::fileinfo::hash_save, app::winutil::clipboard_text,
        media::extract::extract_start, media::extract::extract_info, media::extract::extract_cancel, media::extract::extract_running, media::extract::extract_default_folder,
        media::check::check_start, media::check::check_cancel, media::check::check_running, media::check::play_at, media::players::list_players,
        audio::audiograph::graph_info, audio::audiograph::graph_exist, audio::audiograph::graph_overview, audio::audiograph::graph_window, audio::audiograph::play::graph_pcm, audio::audiograph::graph_psd, audio::audiograph::graph_cancel, audio::audiograph::graph_save, audio::graphimg::graph_save_image,
        audio::audiograph::graph_cache_info, audio::audiograph::graph_cache_clear,
    ]);
    let builder = builder.invoke_handler(move |invoke| {
        app::actlog::invoke(invoke.message.command(), invoke.message.payload());
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
