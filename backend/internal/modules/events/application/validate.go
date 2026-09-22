package application

import (
	"net/mail"
	"net/url"
	"regexp"
	"strings"
	"time"
	"unicode/utf8"

	authapp "myticketin/internal/modules/auth/application"
	"myticketin/internal/modules/events/domain"
)

var slugRE = regexp.MustCompile(`^[a-z0-9]+(?:-[a-z0-9]+)*$`)
var phoneRE = regexp.MustCompile(`^\+?[0-9]{8,15}$`)

type EventInput struct {
	Title         string
	Description   string
	Category      string
	VenueName     string
	AddressLine   string
	City          string
	Province      string
	Latitude      *float64
	Longitude     *float64
	Tags          []string
	GalleryURLs   []string
	Timezone      string
	StartsAt      time.Time
	EndsAt        time.Time
	Terms         string
	ContactEmail  string
	ContactPhone  string
	InventoryMode domain.InventoryMode
}

func NormalizeEvent(in EventInput) (EventInput, error) {
	fields := authapp.FieldErrors{}
	in.Title = strings.TrimSpace(in.Title)
	if n := utf8.RuneCountInString(in.Title); n < 3 || n > 160 {
		fields["title"] = "Judul wajib 3–160 karakter."
	}
	in.Description = strings.TrimSpace(in.Description)
	if n := utf8.RuneCountInString(in.Description); n < 20 || n > 10000 {
		fields["description"] = "Deskripsi wajib 20–10.000 karakter."
	}
	in.Category = strings.TrimSpace(in.Category)
	if n := utf8.RuneCountInString(in.Category); n < 2 || n > 80 {
		fields["category"] = "Kategori wajib 2–80 karakter."
	}
	in.VenueName = strings.TrimSpace(in.VenueName)
	if n := utf8.RuneCountInString(in.VenueName); n < 2 || n > 160 {
		fields["venueName"] = "Nama venue wajib 2–160 karakter."
	}
	in.AddressLine = strings.TrimSpace(in.AddressLine)
	if n := utf8.RuneCountInString(in.AddressLine); n < 2 || n > 500 {
		fields["addressLine"] = "Alamat wajib 2–500 karakter."
	}
	in.City = strings.TrimSpace(in.City)
	if n := utf8.RuneCountInString(in.City); n < 2 || n > 100 {
		fields["city"] = "Kota wajib 2–100 karakter."
	}
	in.Province = strings.TrimSpace(in.Province)
	if n := utf8.RuneCountInString(in.Province); n < 2 || n > 100 {
		fields["province"] = "Provinsi wajib 2–100 karakter."
	}
	if in.Latitude == nil || in.Longitude == nil {
		fields["latitude"] = "Koordinat lokasi wajib diisi agar peta dapat dibuka."
	} else if !domain.ValidCoordinates(*in.Latitude, *in.Longitude) {
		fields["latitude"] = "Koordinat tidak valid."
	}
	tags, err := domain.NormalizeTags(in.Tags)
	if err != nil {
		fields["tags"] = "Setiap tag 2–32 karakter (huruf, angka, tanda hubung), maksimal 8 tag."
	} else {
		in.Tags = tags
	}
	urls, err := NormalizeGalleryURLs(in.GalleryURLs)
	if err != nil {
		fields["galleryUrls"] = "Setiap gambar harus berkas yang diunggah atau URL https (maksimal 8)."
	} else {
		in.GalleryURLs = urls
	}
	in.Timezone = strings.TrimSpace(in.Timezone)
	if !domain.AllowedTimezone(in.Timezone) {
		fields["timezone"] = "Zona waktu harus Asia/Jakarta, Asia/Makassar, atau Asia/Jayapura."
	}
	if in.StartsAt.IsZero() || in.EndsAt.IsZero() || !in.StartsAt.Before(in.EndsAt) {
		fields["startsAt"] = "Waktu mulai harus sebelum waktu selesai."
	}
	in.Terms = strings.TrimSpace(in.Terms)
	if n := utf8.RuneCountInString(in.Terms); n < 2 || n > 5000 {
		fields["terms"] = "Syarat wajib 2–5000 karakter."
	}
	in.ContactEmail = strings.ToLower(strings.TrimSpace(in.ContactEmail))
	if _, err := mail.ParseAddress(in.ContactEmail); err != nil || !strings.Contains(in.ContactEmail, "@") {
		fields["contactEmail"] = "Email kontak tidak valid."
	}
	in.ContactPhone = strings.TrimSpace(in.ContactPhone)
	if in.ContactPhone != "" && !phoneRE.MatchString(in.ContactPhone) {
		fields["contactPhone"] = "Nomor telepon 8–15 digit, boleh diawali +."
	}
	if in.InventoryMode == "" {
		in.InventoryMode = domain.ModeGA
	}
	if _, err := domain.ParseMode(string(in.InventoryMode)); err != nil {
		fields["inventoryMode"] = "Mode inventori tidak valid."
	}
	if len(fields) > 0 {
		return EventInput{}, authapp.ValidationError{Fields: fields}
	}
	return in, nil
}

func NormalizeGalleryURLs(raw []string) ([]string, error) {
	seen := map[string]struct{}{}
	out := make([]string, 0, len(raw))
	for _, item := range raw {
		s := strings.TrimSpace(item)
		if s == "" {
			continue
		}
		if utf8.RuneCountInString(s) > 500 {
			return nil, domain.ErrIncomplete
		}
		if strings.HasPrefix(s, "/") && !strings.HasPrefix(s, "//") {
			if !allowedLocalImagePath(s) {
				return nil, domain.ErrIncomplete
			}
			if _, ok := seen[s]; ok {
				continue
			}
			seen[s] = struct{}{}
			out = append(out, s)
		} else {
			u, err := url.Parse(s)
			if err != nil || u.Scheme != "https" || u.Host == "" || strings.Contains(s, " ") {
				return nil, domain.ErrIncomplete
			}
			canon := u.String()
			if _, ok := seen[canon]; ok {
				continue
			}
			seen[canon] = struct{}{}
			out = append(out, canon)
		}
		if len(out) > domain.MaxGalleryURLs {
			return nil, domain.ErrIncomplete
		}
	}
	if out == nil {
		out = []string{}
	}
	return out, nil
}

var (
	uploadedGalleryRE = regexp.MustCompile(`^/uploads/gallery/[a-f0-9]{32}\.(jpg|png|webp)$`)
	dummyGalleryRE    = regexp.MustCompile(`^/dummy-events/[a-zA-Z0-9][a-zA-Z0-9._-]{0,120}\.(jpg|jpeg|png|webp|svg)$`)
)

func allowedLocalImagePath(s string) bool {
	if strings.Contains(s, "..") || strings.ContainsAny(s, " \t\r\n") {
		return false
	}
	if s == "/placeholder-event.svg" {
		return true
	}
	return uploadedGalleryRE.MatchString(s) || dummyGalleryRE.MatchString(s)
}

type TicketInput struct {
	Name          string
	Description   string
	PriceRupiah   int64
	Quota         int
	MaxPerAccount int
	SaleStartsAt  time.Time
	SaleEndsAt    time.Time
	SortOrder     int
}

func NormalizeTicket(in TicketInput) (TicketInput, error) {
	fields := authapp.FieldErrors{}
	in.Name = strings.TrimSpace(in.Name)
	if n := utf8.RuneCountInString(in.Name); n < 2 || n > 120 {
		fields["name"] = "Nama jenis tiket wajib 2–120 karakter."
	}
	in.Description = strings.TrimSpace(in.Description)
	if in.Description != "" && utf8.RuneCountInString(in.Description) > 1000 {
		fields["description"] = "Deskripsi jenis tiket maksimal 1000 karakter."
	}
	if in.PriceRupiah < 0 || in.PriceRupiah > 1_000_000_000 {
		fields["priceRupiah"] = "Harga harus integer Rupiah 0–1.000.000.000."
	}
	if in.Quota <= 0 {
		fields["quota"] = "Kuota harus bilangan bulat positif."
	}
	if in.MaxPerAccount < 1 {
		in.MaxPerAccount = in.Quota
	}
	if in.SaleStartsAt.IsZero() || in.SaleEndsAt.IsZero() || !in.SaleStartsAt.Before(in.SaleEndsAt) {
		fields["saleStartsAt"] = "Periode penjualan tidak valid."
	}
	if in.SortOrder < 0 {
		fields["sortOrder"] = "Urutan tidak boleh negatif."
	}
	if len(fields) > 0 {
		return TicketInput{}, authapp.ValidationError{Fields: fields}
	}
	return in, nil
}

func Slugify(title, suffix string) string {
	title = strings.ToLower(strings.TrimSpace(title))
	var b strings.Builder
	prevDash := false
	for _, r := range title {
		ok := (r >= 'a' && r <= 'z') || (r >= '0' && r <= '9')
		if ok {
			b.WriteRune(r)
			prevDash = false
			continue
		}
		if !prevDash && b.Len() > 0 {
			b.WriteByte('-')
			prevDash = true
		}
	}
	out := strings.Trim(b.String(), "-")
	if out == "" {
		out = "event"
	}
	if suffix != "" {
		out = out + "-" + suffix
	}
	if len(out) > 180 {
		out = out[:180]
		out = strings.Trim(out, "-")
	}
	if !slugRE.MatchString(out) {
		return "event-" + suffix
	}
	return out
}
