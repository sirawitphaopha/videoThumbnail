//! ชั้นหนัง · ฝั่งทำงานหนักของโปรแกรม

mod app;
mod ape;
mod audiograph;
mod media;
mod convert;
mod delay;
mod encode;
mod graphimg;
mod fonts;
mod loudness;
mod cover;
mod merge;
mod subaudio;
mod subconv;
mod imgconv;
mod pgs;
mod subdoc;
mod subs;
mod subshot;
mod vidframes;
mod vidplay;
mod mpvplay;
mod binocr;
mod nocr;
mod nocr_lines;
mod nocr_split;
mod nocr_text;
mod nocr_train;
mod ownocr;
mod ocrprep;
mod ocrfix;
mod suspect;
mod ocrfix_guess;
mod ocrfix_list;
mod ocrfix_words;
mod ocrsrc;
mod ocrjob;
mod ocrbreak;
mod ocrmanual;
mod ocrexport;
mod paddle;
mod paddle_dl;
mod tesseract;
mod vobsub;

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
        .manage(convert::ConvertState::default())
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
            // กวาดไฟล์ชั่วคราวที่ค้างจากงานที่โดนปิดกลางทางหรือไฟดับ (โปรแกรมเปิดได้ทีละตัว ตอนนี้ยังไม่มีงานไหนถือไฟล์)
            // ไดรฟ์ C ที่ว่างน้อย เสียงที่แปลงตอนรวมค้างได้หลาย GB (ผู้ช่วยตรวจขั้น 10 ข้อ 11) · ภาพซับรูป subimg- เป็นของที่เก็บไว้ใช้ซ้ำ ไม่ลบ
            if let Ok(tmp) = app.path().app_local_data_dir().map(|d| d.join("tmp")) {
                for e in std::fs::read_dir(&tmp).into_iter().flatten().flatten() {
                    let n = e.file_name().to_string_lossy().to_string();
                    if ["merge-conv-", "merge-vtt-", "merge-chap-", "merge-oldcover-", "conv-cover-", "sub-"].iter().any(|p| n.starts_with(p)) && e.path().is_file() {
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
        cover::poster::poster_open, cover::poster::poster_view, cover::poster::poster_render, cover::poster::poster_clear, cover::poster::poster_folder_images,
        cover::poster::poster_inspect, cover::poster::poster_apply, cover::poster::poster_cancel, cover::poster::poster_check_name,
        app::latest::thanks_open, media::bitrate::bitrate_start, media::bitrate::bitrate_tracks, media::bitrate::bitrate_stop, merge::merge_inspect, merge::remux_fonts, merge::merge_add_file, merge::merge_apply, merge::merge_cancel, merge::merge_cover_preview, merge::merge_cover_drop, encode::encode_preview, encode::encoders_status, encode::encoders_open_dir, encode::encoders_user_dir, app::latest::encoders_latest, app::latest::encoders_open_page, app::latest::open_itunes_page, fonts::font_info,
        delay::delay_find, delay::delay_view, delay::delay_preview,
        subs::movie_frame, subs::sub_text, subs::sub_frame, subs::sub_wave, subs::sub_images, subs::sub_image_times, ocrsrc::ocr_source, ocrsrc::ocr_source_pngs, subs::ocr_vobsub_recolor, subs::ocr_vobsub_preview, ocrjob::ocr_read, ocrjob::ocr_teach, ocrjob::ocr_word, ocrjob::ocr_suggest, ocrjob::ocr_names, ocrjob::ocr_dbs, ocrjob::ocr_history, ocrjob::ocr_history_update, ocrjob::ocr_history_delete, ocrjob::ocr_inspect, ocrjob::ocr_inspect_update, ocrjob::ocr_inspect_delete, ocrjob::ocr_inspect_draw, ocrjob::ocr_inspect_teach, ocrjob::ocr_inspect_reload, ocrjob::ocr_remove_items, ocrjob::ocr_stop, ocrjob::ocr_prep_preview, ocrjob::ocr_paddle_models, ocrjob::ocr_db_delete, ocrjob::ocr_image_out, ocrmanual::ocr_db_new, ocrmanual::ocr_db_rename, ocrmanual::ocr_db_chars, ocrmanual::ocr_db_char_update, ocrmanual::ocr_db_char_delete, ocrmanual::ocr_train, ocrmanual::ocr_train_cancel, ocrmanual::ocr_train_preview, ocrmanual::ocr_db_optimize, ocrexport::ocr_export_formats, ocrexport::ocr_export_preview, ocrexport::ocr_export, ocrexport::ocr_export_doc, ocrexport::ocr_save_html, tesseract::ocr_tess_langs, tesseract::ocr_tess_download, tesseract::ocr_tess_cancel, paddle_dl::ocr_paddle_langs, paddle_dl::ocr_paddle_download, paddle_dl::ocr_paddle_cancel,
        subdoc::subdoc_open, subdoc::subdoc_stamp, subdoc::subdoc_save, subdoc::subdoc_convert, subdoc::subdoc_free_name, subdoc::subdoc_render, subdoc::subdoc_parse_text, subdoc::subdoc_temp, subshot::sub_overlay, subshot::vid_snapshot, vidframes::vid_colorspace,
        subdoc::subdoc_set_dirty, subdoc::subdoc_autosave, subdoc::subdoc_autosaves, subdoc::subdoc_open_autosave, fonts::font_families,
        vidframes::vid_table, vidframes::vid_table_stop, vidframes::vid_frames, vidframes::vid_scenes, vidframes::vid_scenes_stop, vidframes::vid_keys_load, vidframes::vid_keys_save, vidplay::vid_play, vidplay::vid_play_stop, mpvplay::mpv_play, mpvplay::mpv_state, mpvplay::mpv_rect, mpvplay::mpv_sub, mpvplay::mpv_volume, mpvplay::mpv_stop, mpvplay::mpv_available, mpvplay::mpv_dev_props, mpvplay::mpv_dev_shot,
        subaudio::sub_pcm, subaudio::sub_audio_save, subaudio::sub_peaks, pgs::pgs_export, pgs::pgs_cancel, pgs::pgs_preview, pgs::pgs_engines, pgs::pgs_estimate, imgconv::imgsub_convert, imgconv::imgsub_cancel, imgconv::imgsub_tools, imgconv::imgsub_preview,
        cover::pairs::pair_set, cover::pairs::pair_check, cover::pairs::pair_play,
        cover::link::link_state, cover::link::link_titles, cover::link::link_is_dir, cover::link::link_images, cover::link::link_add_images, cover::link::link_remove_images, cover::link::link_auto, cover::link::link_pair, cover::link::link_undo, cover::link::link_row_update, cover::link::link_set_crop, cover::link::link_confirm, cover::link::link_cancel, cover::link::link_resolve, cover::link::link_unsave, cover::link::link_remove, cover::link::link_open_row, cover::link::link_cover_pick, cover::link::link_migrate,
        convert::convert_probe, convert::convert_size_probe, convert::convert_cover, convert::convert_one, convert::convert_cancel,
        media::fileinfo::media_info, media::mkvtree::mkv_tree, media::fileinfo::audio_codec_detail, media::fileinfo::hash_file, media::fileinfo::hash_cancel, media::fileinfo::hash_running, media::fileinfo::hash_compare, media::fileinfo::hash_save, app::winutil::clipboard_text,
        media::extract::extract_start, media::extract::extract_info, media::extract::extract_cancel, media::extract::extract_running, media::extract::extract_default_folder,
        media::check::check_start, media::check::check_cancel, media::check::check_running, media::check::play_at, media::players::list_players,
        audiograph::graph_info, audiograph::graph_exist, audiograph::graph_overview, audiograph::graph_window, audiograph::graph_psd, audiograph::graph_cancel, audiograph::graph_save, graphimg::graph_save_image,
        audiograph::graph_cache_info, audiograph::graph_cache_clear, audiograph::graph_dev_forget,
    ]);
    #[cfg(not(debug_assertions))]
    let handler = typed(tauri::generate_handler![
        app::actlog::actlog_info, app::actlog::actlog_open_dir,
        app::tools::check_tools, app::tools::check_icaros, app::tools::open_icaros_page, app::store::get_settings, app::store::set_settings, app::drives::drive_space, app::drives::drive_open, app::drives::drive_free, media::chapters::chapters_read,
        app::jobs::running_jobs, app::jobs::force_close,
        app::library::get_library, app::library::scan_library, app::library::play_movie, app::library::reveal_movie, app::library::set_rating,
        cover::rename::check_rename, cover::rename::rename_movie,
        cover::poster::poster_open, cover::poster::poster_view, cover::poster::poster_render, cover::poster::poster_clear, cover::poster::poster_folder_images,
        cover::poster::poster_inspect, cover::poster::poster_apply, cover::poster::poster_cancel, cover::poster::poster_check_name,
        app::latest::thanks_open, media::bitrate::bitrate_start, media::bitrate::bitrate_tracks, media::bitrate::bitrate_stop, merge::merge_inspect, merge::remux_fonts, merge::merge_add_file, merge::merge_apply, merge::merge_cancel, merge::merge_cover_preview, merge::merge_cover_drop, encode::encode_preview, encode::encoders_status, encode::encoders_open_dir, encode::encoders_user_dir, app::latest::encoders_latest, app::latest::encoders_open_page, app::latest::open_itunes_page, fonts::font_info,
        delay::delay_find, delay::delay_view, delay::delay_preview,
        subs::movie_frame, subs::sub_text, subs::sub_frame, subs::sub_wave, subs::sub_images, subs::sub_image_times, ocrsrc::ocr_source, ocrsrc::ocr_source_pngs, subs::ocr_vobsub_recolor, subs::ocr_vobsub_preview, ocrjob::ocr_read, ocrjob::ocr_teach, ocrjob::ocr_word, ocrjob::ocr_suggest, ocrjob::ocr_names, ocrjob::ocr_dbs, ocrjob::ocr_history, ocrjob::ocr_history_update, ocrjob::ocr_history_delete, ocrjob::ocr_inspect, ocrjob::ocr_inspect_update, ocrjob::ocr_inspect_delete, ocrjob::ocr_inspect_draw, ocrjob::ocr_inspect_teach, ocrjob::ocr_inspect_reload, ocrjob::ocr_remove_items, ocrjob::ocr_stop, ocrjob::ocr_prep_preview, ocrjob::ocr_paddle_models, ocrjob::ocr_db_delete, ocrjob::ocr_image_out, ocrmanual::ocr_db_new, ocrmanual::ocr_db_rename, ocrmanual::ocr_db_chars, ocrmanual::ocr_db_char_update, ocrmanual::ocr_db_char_delete, ocrmanual::ocr_train, ocrmanual::ocr_train_cancel, ocrmanual::ocr_train_preview, ocrmanual::ocr_db_optimize, ocrexport::ocr_export_formats, ocrexport::ocr_export_preview, ocrexport::ocr_export, ocrexport::ocr_export_doc, ocrexport::ocr_save_html, tesseract::ocr_tess_langs, tesseract::ocr_tess_download, tesseract::ocr_tess_cancel, paddle_dl::ocr_paddle_langs, paddle_dl::ocr_paddle_download, paddle_dl::ocr_paddle_cancel,
        subdoc::subdoc_open, subdoc::subdoc_stamp, subdoc::subdoc_save, subdoc::subdoc_convert, subdoc::subdoc_free_name, subdoc::subdoc_render, subdoc::subdoc_parse_text, subdoc::subdoc_temp, subshot::sub_overlay, subshot::vid_snapshot, vidframes::vid_colorspace,
        subdoc::subdoc_set_dirty, subdoc::subdoc_autosave, subdoc::subdoc_autosaves, subdoc::subdoc_open_autosave, fonts::font_families,
        vidframes::vid_table, vidframes::vid_table_stop, vidframes::vid_frames, vidframes::vid_scenes, vidframes::vid_scenes_stop, vidframes::vid_keys_load, vidframes::vid_keys_save, vidplay::vid_play, vidplay::vid_play_stop, mpvplay::mpv_play, mpvplay::mpv_state, mpvplay::mpv_rect, mpvplay::mpv_sub, mpvplay::mpv_volume, mpvplay::mpv_stop, mpvplay::mpv_available, mpvplay::mpv_dev_props, mpvplay::mpv_dev_shot,
        subaudio::sub_pcm, subaudio::sub_audio_save, subaudio::sub_peaks, pgs::pgs_export, pgs::pgs_cancel, pgs::pgs_preview, pgs::pgs_engines, pgs::pgs_estimate, imgconv::imgsub_convert, imgconv::imgsub_cancel, imgconv::imgsub_tools, imgconv::imgsub_preview,
        cover::pairs::pair_set, cover::pairs::pair_check, cover::pairs::pair_play,
        cover::link::link_state, cover::link::link_titles, cover::link::link_is_dir, cover::link::link_images, cover::link::link_add_images, cover::link::link_remove_images, cover::link::link_auto, cover::link::link_pair, cover::link::link_undo, cover::link::link_row_update, cover::link::link_set_crop, cover::link::link_confirm, cover::link::link_cancel, cover::link::link_resolve, cover::link::link_unsave, cover::link::link_remove, cover::link::link_open_row, cover::link::link_cover_pick, cover::link::link_migrate,
        convert::convert_probe, convert::convert_size_probe, convert::convert_cover, convert::convert_one, convert::convert_cancel,
        media::fileinfo::media_info, media::mkvtree::mkv_tree, media::fileinfo::audio_codec_detail, media::fileinfo::hash_file, media::fileinfo::hash_cancel, media::fileinfo::hash_running, media::fileinfo::hash_compare, media::fileinfo::hash_save, app::winutil::clipboard_text,
        media::extract::extract_start, media::extract::extract_info, media::extract::extract_cancel, media::extract::extract_running, media::extract::extract_default_folder,
        media::check::check_start, media::check::check_cancel, media::check::check_running, media::check::play_at, media::players::list_players,
        audiograph::graph_info, audiograph::graph_exist, audiograph::graph_overview, audiograph::graph_window, audiograph::graph_psd, audiograph::graph_cancel, audiograph::graph_save, graphimg::graph_save_image,
        audiograph::graph_cache_info, audiograph::graph_cache_clear,
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
