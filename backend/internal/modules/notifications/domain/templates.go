package domain

func Template(t Type) (title, body, action, templateKey string) {
	switch t {
	case TypeOrganizerApproved:
		return "Pengajuan organizer disetujui", "Akun penyelenggara Anda telah disetujui. Anda dapat membuat event.", "/organizer/events", "organizer_approved"
	case TypeOrganizerRejected:
		return "Pengajuan organizer ditolak", "Pengajuan penyelenggara belum disetujui. Periksa alasan di status pengajuan.", "/organizer/status", "organizer_rejected"
	case TypeOrganizerSuspended:
		return "Akun organizer ditangguhkan", "Akses penyelenggara ditangguhkan. Hubungi admin bila ini keliru.", "/organizer/status", "organizer_suspended"
	case TypeEventPublished:
		return "Event dipublikasikan", "Event Anda sudah tampil di katalog. SANDBOX/UJI.", "/organizer/events", "event_published"
	case TypeEventRejected:
		return "Event ditolak", "Event belum dipublikasikan. Periksa alasan moderasi.", "/organizer/events", "event_rejected"
	case TypeEventCancelled:
		return "Event dibatalkan", "Event terkait tiket Anda dibatalkan. SANDBOX—bukan refund uang nyata otomatis.", "/tickets", "event_cancelled"
	case TypePaymentSucceeded:
		return "Pembayaran berhasil", "Pembayaran sandbox berhasil. Tiket akan tersedia di dompet.", "/orders", "payment_succeeded"
	case TypePaymentFailed:
		return "Pembayaran gagal", "Pembayaran sandbox tidak berhasil. Anda dapat mencoba lagi selama kuota tersedia.", "/orders", "payment_failed"
	case TypeTicketIssued:
		return "Tiket diterbitkan", "Tiket sandbox sudah ada di dompet Anda.", "/tickets", "ticket_issued"
	case TypeRefundUpdated:
		return "Status refund diperbarui", "Ada pembaruan refund sandbox pada order Anda. Bukan pencairan uang nyata.", "/orders", "refund_updated"
	case TypeEventReminder:
		return "Pengingat event", "Event Anda dimulai dalam 24 jam. Siapkan tiket di dompet. SANDBOX/UJI.", "/tickets", "event_reminder"
	case TypePasswordResetAssisted:
		return "Pemulihan akun disiapkan", "Admin menyiapkan pemulihan kata sandi. Ikuti instruksi yang dikirim bila akun memenuhi syarat.", "/login", "password_reset_assisted"
	default:
		return "Pemberitahuan", "Ada pembaruan pada akun MyTicketIn.", "/dashboard", "generic"
	}
}
