-- Dummy PUBLISHED events for organizer username joko (sandbox).
-- Images served from /dummy-events (Unsplash License, stored locally for CSP).

INSERT INTO events (
  id, organizer_profile_id, slug, title, description, category, venue_name, address_line,
  city, province, latitude, longitude, tags, timezone, starts_at, ends_at, terms,
  contact_email, contact_phone, status, inventory_mode, submitted_at, decided_at,
  decided_by_user_id, published_at, created_at, updated_at, version
) VALUES
(
  'dummy-joko-jazz-2026',
  'ccfaf6b54a8ed10166619285163de285',
  'jazz-on-the-park-jakarta-2026',
  'Jazz on the Park Jakarta',
  'Konser jazz terbuka di kawasan Gelora Bung Karno dengan lineup combo lokal dan tamu spesial. Format terinspirasi festival jazz kota besar: panggung taman, food court, dan zona duduk berjenjang. Cocok untuk pecinta musik live di Jakarta.',
  'Musik',
  'Plaza Barat Gelora Bung Karno',
  'Jl. Jenderal Sudirman, Gelora, Tanah Abang',
  'Jakarta',
  'DKI Jakarta',
  -6.218500, 106.802200,
  ARRAY['musik','jazz','live-music','jakarta']::text[],
  'Asia/Jakarta',
  TIMESTAMPTZ '2026-10-18 19:00:00+07',
  TIMESTAMPTZ '2026-10-18 23:00:00+07',
  'Tiket sandbox uji. Pintu buka 17.30 WIB. Dilarang membawa minuman dari luar. Tiket tidak dapat dialihkan setelah check-in.',
  'joko@gmail.com', '+628111222333', 'PUBLISHED', 'GENERAL_ADMISSION',
  TIMESTAMPTZ '2026-09-10 10:00:00+07', TIMESTAMPTZ '2026-09-11 09:00:00+07', 'seed-admin',
  TIMESTAMPTZ '2026-09-11 09:05:00+07', NOW(), NOW(), 1
),
(
  'dummy-joko-kuliner-2026',
  'ccfaf6b54a8ed10166619285163de285',
  'festival-kuliner-nusantara-jakarta-2026',
  'Festival Kuliner Nusantara Jakarta',
  'Festival dua hari yang menampilkan booth makanan dari Sumatera, Jawa, Kalimantan, Sulawesi, Bali, dan Papua. Ada panggung demo masak, area keluarga, dan zona UMKM. Referensi konsep mirip festival kuliner kota di lapangan terbuka pusat Jakarta.',
  'Festival',
  'Lapangan Banteng',
  'Jl. Lapangan Banteng Utara, Pasar Baru, Sawah Besar',
  'Jakarta',
  'DKI Jakarta',
  -6.170200, 106.833900,
  ARRAY['festival','kuliner','nusantara','keluarga']::text[],
  'Asia/Jakarta',
  TIMESTAMPTZ '2026-11-07 10:00:00+07',
  TIMESTAMPTZ '2026-11-08 22:00:00+07',
  'Tiket berlaku per hari sesuai jenis. Anak di bawah 5 tahun gratis tanpa kursi demo. Jaga kebersihan area booth.',
  'joko@gmail.com', '+628111222333', 'PUBLISHED', 'GENERAL_ADMISSION',
  TIMESTAMPTZ '2026-09-12 11:00:00+07', TIMESTAMPTZ '2026-09-13 08:30:00+07', 'seed-admin',
  TIMESTAMPTZ '2026-09-13 08:40:00+07', NOW(), NOW(), 1
),
(
  'dummy-joko-run-2026',
  'ccfaf6b54a8ed10166619285163de285',
  'jakarta-night-run-10k-2026',
  'Jakarta Night Run 10K',
  'Lari komunitas 5K dan 10K di koridor GBK dengan start malam hari, medali finisher, dan hydration station. Referensi visual dan suasana dari lomba lari kota Jakarta di kawasan Monas/GBK. Bukan event federasi resmi; data uji sandbox.',
  'Olahraga',
  'Area Start Plaza Barat GBK',
  'Jl. Pintu Satu Senayan, Gelora',
  'Jakarta',
  'DKI Jakarta',
  -6.218600, 106.801900,
  ARRAY['olahraga','lari','komunitas','jakarta']::text[],
  'Asia/Jakarta',
  TIMESTAMPTZ '2026-10-25 19:00:00+07',
  TIMESTAMPTZ '2026-10-25 22:30:00+07',
  'Wajib race pack dan nomor dada. Tutup registrasi 3 hari sebelum start. Ikuti arahan marshal. Tiket sandbox tidak termasuk asuransi produksi.',
  'joko@gmail.com', '+628111222333', 'PUBLISHED', 'GENERAL_ADMISSION',
  TIMESTAMPTZ '2026-09-08 09:00:00+07', TIMESTAMPTZ '2026-09-09 10:00:00+07', 'seed-admin',
  TIMESTAMPTZ '2026-09-09 10:10:00+07', NOW(), NOW(), 1
),
(
  'dummy-joko-summit-2026',
  'ccfaf6b54a8ed10166619285163de285',
  'indonesia-creative-industry-summit-2026',
  'Indonesia Creative Industry Summit',
  'Konferensi sehari di Jakarta Convention Center untuk pelaku film, musik, desain, dan game. Ada keynote, panel, dan ruang networking. Format mengikuti summit industri kreatif di JCC Senayan, dengan tiket berjenjang untuk peserta umum dan undangan.',
  'Seminar',
  'Jakarta Convention Center',
  'Jl. Gatot Subroto, Gelora, Tanah Abang',
  'Jakarta',
  'DKI Jakarta',
  -6.214600, 106.804400,
  ARRAY['seminar','industri-kreatif','bisnis','jcc']::text[],
  'Asia/Jakarta',
  TIMESTAMPTZ '2026-11-21 09:00:00+07',
  TIMESTAMPTZ '2026-11-21 17:00:00+07',
  'Registrasi ulang mulai 07.30 WIB. Dress code smart casual. Materi sesi bersifat sandbox dan tidak untuk disitasi akademik sebagai data produksi.',
  'joko@gmail.com', '+628111222333', 'PUBLISHED', 'GENERAL_ADMISSION',
  TIMESTAMPTZ '2026-09-14 13:00:00+07', TIMESTAMPTZ '2026-09-15 09:15:00+07', 'seed-admin',
  TIMESTAMPTZ '2026-09-15 09:20:00+07', NOW(), NOW(), 1
),
(
  'dummy-joko-teater-2026',
  'ccfaf6b54a8ed10166619285163de285',
  'pagelaran-teater-malam-tim-2026',
  'Pagelaran Teater Malam di TIM',
  'Pertunjukan teater kontemporer berdurasi 120 menit di Teater Jakarta, Taman Ismail Marzuki, Cikini. Konsep malam seni dengan orkestra mini. Referensi venue: kompleks TIM yang biasa dipakai pagelaran teater dan musik.',
  'Seni',
  'Teater Jakarta, Taman Ismail Marzuki',
  'Jl. Cikini Raya No. 73, Menteng',
  'Jakarta',
  'DKI Jakarta',
  -6.189400, 106.839800,
  ARRAY['seni','teater','orkestra','cikini']::text[],
  'Asia/Jakarta',
  TIMESTAMPTZ '2026-12-05 19:30:00+07',
  TIMESTAMPTZ '2026-12-05 22:00:00+07',
  'Pintu tutup 15 menit sebelum mulai. Dilarang merekam tanpa izin. Anak di bawah 12 tahun didampingi orang dewasa.',
  'joko@gmail.com', '+628111222333', 'PUBLISHED', 'GENERAL_ADMISSION',
  TIMESTAMPTZ '2026-09-16 16:00:00+07', TIMESTAMPTZ '2026-09-17 11:00:00+07', 'seed-admin',
  TIMESTAMPTZ '2026-09-17 11:05:00+07', NOW(), NOW(), 1
)
ON CONFLICT (id) DO NOTHING;

INSERT INTO event_ticket_types (
  id, event_id, name, description, price_rupiah, quota, max_per_account,
  sale_starts_at, sale_ends_at, sort_order, reserved_quantity, paid_quantity
) VALUES
('dummy-joko-jazz-eb', 'dummy-joko-jazz-2026', 'Early Bird', 'Harga awal hingga stok habis.', 250000, 200, 5, TIMESTAMPTZ '2026-09-01 00:00:00+07', TIMESTAMPTZ '2026-10-18 18:00:00+07', 0, 0, 0),
('dummy-joko-jazz-reg', 'dummy-joko-jazz-2026', 'Reguler', 'Area standing dan duduk bebas.', 350000, 500, 5, TIMESTAMPTZ '2026-09-01 00:00:00+07', TIMESTAMPTZ '2026-10-18 18:00:00+07', 1, 0, 0),
('dummy-joko-jazz-vip', 'dummy-joko-jazz-2026', 'VIP', 'Area duduk dekat panggung plus welcome drink sandbox.', 750000, 80, 5, TIMESTAMPTZ '2026-09-01 00:00:00+07', TIMESTAMPTZ '2026-10-18 18:00:00+07', 2, 0, 0),
('dummy-joko-food-hari1', 'dummy-joko-kuliner-2026', 'Tiket Hari 1', 'Akses 7 November 2026.', 45000, 1500, 5, TIMESTAMPTZ '2026-09-01 00:00:00+07', TIMESTAMPTZ '2026-11-07 09:00:00+07', 0, 0, 0),
('dummy-joko-food-hari2', 'dummy-joko-kuliner-2026', 'Tiket Hari 2', 'Akses 8 November 2026.', 45000, 1500, 5, TIMESTAMPTZ '2026-09-01 00:00:00+07', TIMESTAMPTZ '2026-11-08 09:00:00+07', 1, 0, 0),
('dummy-joko-food-pass', 'dummy-joko-kuliner-2026', 'Pass Dua Hari', 'Akses kedua hari festival.', 75000, 800, 5, TIMESTAMPTZ '2026-09-01 00:00:00+07', TIMESTAMPTZ '2026-11-07 09:00:00+07', 2, 0, 0),
('dummy-joko-run-5k', 'dummy-joko-run-2026', '5K Komunitas', 'Termasuk nomor dada dan medali finisher.', 175000, 800, 5, TIMESTAMPTZ '2026-09-01 00:00:00+07', TIMESTAMPTZ '2026-10-22 23:59:00+07', 0, 0, 0),
('dummy-joko-run-10k', 'dummy-joko-run-2026', '10K Night Run', 'Termasuk race pack dan medali finisher.', 250000, 1200, 5, TIMESTAMPTZ '2026-09-01 00:00:00+07', TIMESTAMPTZ '2026-10-22 23:59:00+07', 1, 0, 0),
('dummy-joko-sum-early', 'dummy-joko-summit-2026', 'Early Bird', 'Akses seluruh sesi keynote dan panel.', 150000, 300, 5, TIMESTAMPTZ '2026-09-01 00:00:00+07', TIMESTAMPTZ '2026-11-20 17:00:00+07', 0, 0, 0),
('dummy-joko-sum-reg', 'dummy-joko-summit-2026', 'Peserta Umum', 'Akses aula utama dan ruang networking.', 250000, 700, 5, TIMESTAMPTZ '2026-09-01 00:00:00+07', TIMESTAMPTZ '2026-11-20 17:00:00+07', 1, 0, 0),
('dummy-joko-sum-vip', 'dummy-joko-summit-2026', 'VIP Delegate', 'Termasuk lunch sandbox dan seating depan.', 500000, 120, 5, TIMESTAMPTZ '2026-09-01 00:00:00+07', TIMESTAMPTZ '2026-11-20 17:00:00+07', 2, 0, 0),
('dummy-joko-tea-reg', 'dummy-joko-teater-2026', 'Reguler', 'Kursi auditorium standar.', 120000, 400, 5, TIMESTAMPTZ '2026-09-01 00:00:00+07', TIMESTAMPTZ '2026-12-05 18:00:00+07', 0, 0, 0),
('dummy-joko-tea-pre', 'dummy-joko-teater-2026', 'Premiere', 'Baris depan plus program malam.', 200000, 150, 5, TIMESTAMPTZ '2026-09-01 00:00:00+07', TIMESTAMPTZ '2026-12-05 18:00:00+07', 1, 0, 0)
ON CONFLICT (id) DO NOTHING;

INSERT INTO event_gallery_images (id, event_id, image_url, sort_order) VALUES
('dummy-joko-jazz-2026:g:0', 'dummy-joko-jazz-2026', '/dummy-events/jazz-1.jpg', 0),
('dummy-joko-jazz-2026:g:1', 'dummy-joko-jazz-2026', '/dummy-events/jazz-2.jpg', 1),
('dummy-joko-kuliner-2026:g:0', 'dummy-joko-kuliner-2026', '/dummy-events/food-1.jpg', 0),
('dummy-joko-kuliner-2026:g:1', 'dummy-joko-kuliner-2026', '/dummy-events/food-2.jpg', 1),
('dummy-joko-run-2026:g:0', 'dummy-joko-run-2026', '/dummy-events/run-jakarta.jpg', 0),
('dummy-joko-run-2026:g:1', 'dummy-joko-run-2026', '/dummy-events/run-1.jpg', 1),
('dummy-joko-run-2026:g:2', 'dummy-joko-run-2026', '/dummy-events/run-2.jpg', 2),
('dummy-joko-summit-2026:g:0', 'dummy-joko-summit-2026', '/dummy-events/summit-1.jpg', 0),
('dummy-joko-summit-2026:g:1', 'dummy-joko-summit-2026', '/dummy-events/summit-2.jpg', 1),
('dummy-joko-teater-2026:g:0', 'dummy-joko-teater-2026', '/dummy-events/theater-1.jpg', 0),
('dummy-joko-teater-2026:g:1', 'dummy-joko-teater-2026', '/dummy-events/theater-2.jpg', 1)
ON CONFLICT DO NOTHING;

INSERT INTO event_tags (event_id, tag)
SELECT e.id, t.tag
FROM events e
CROSS JOIN LATERAL unnest(e.tags) AS t(tag)
WHERE e.id LIKE 'dummy-joko-%'
ON CONFLICT DO NOTHING;
