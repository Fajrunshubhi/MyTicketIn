package infrastructure

import (
	"context"
	"errors"
	"fmt"
	"strings"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
	"github.com/jackc/pgx/v5/pgxpool"

	"myticketin/internal/modules/events/domain"
	platdb "myticketin/internal/platform/db"
)

type Store struct {
	pool *pgxpool.Pool
}

func NewStore(pool *platdb.Pool) *Store { return &Store{pool: pool.Raw()} }

const eventCols = `id, organizer_profile_id, slug, title, description, category, venue_name, address_line, city, province, latitude, longitude, tags, timezone, starts_at, ends_at, terms, contact_email, contact_phone, status::text, inventory_mode::text, submitted_at, moderation_reason, decided_at, decided_by_user_id, published_at, cancelled_at, cancelled_by_user_id, cancellation_reason, completed_at, created_at, updated_at, version`

func (s *Store) CreateEvent(ctx context.Context, e domain.Event) error {
	if e.Tags == nil {
		e.Tags = []string{}
	}
	if e.GalleryURLs == nil {
		e.GalleryURLs = []string{}
	}
	_, err := exec(ctx, s, `INSERT INTO events (id, organizer_profile_id, slug, title, description, category, venue_name, address_line, city, province, latitude, longitude, tags, timezone, starts_at, ends_at, terms, contact_email, contact_phone, status, inventory_mode, submitted_at, created_at, updated_at, version)
		VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25)`,
		e.ID, e.OrganizerProfileID, e.Slug, e.Title, e.Description, e.Category, e.VenueName, e.AddressLine, e.City, e.Province, e.Latitude, e.Longitude, e.Tags, e.Timezone, e.StartsAt, e.EndsAt, e.Terms, e.ContactEmail, e.ContactPhone, e.Status, e.InventoryMode, e.SubmittedAt, e.CreatedAt, e.UpdatedAt, e.Version)
	if err != nil {
		return mapErr(err)
	}
	if err := s.replaceTags(ctx, e.ID, e.Tags); err != nil {
		return err
	}
	return s.replaceGallery(ctx, e.ID, e.GalleryURLs)
}

func (s *Store) GetEvent(ctx context.Context, id string) (domain.Event, error) {
	return scanEvent(ctx, s, rowQ(ctx, s, `SELECT `+eventCols+` FROM events WHERE id=$1`, id))
}

func (s *Store) GetEventBySlug(ctx context.Context, slug string) (domain.Event, error) {
	return scanEvent(ctx, s, rowQ(ctx, s, `SELECT `+eventCols+` FROM events WHERE slug=$1`, slug))
}

func (s *Store) GetEventForUpdate(ctx context.Context, id string) (domain.Event, error) {
	return scanEvent(ctx, s, rowQ(ctx, s, `SELECT `+eventCols+` FROM events WHERE id=$1 FOR UPDATE`, id))
}

func (s *Store) UpdateEvent(ctx context.Context, e domain.Event, expectedVersion int) error {
	if e.Tags == nil {
		e.Tags = []string{}
	}
	if e.GalleryURLs == nil {
		e.GalleryURLs = []string{}
	}
	tag, err := exec(ctx, s, `UPDATE events SET title=$1, description=$2, category=$3, venue_name=$4, address_line=$5, city=$6, province=$7, latitude=$8, longitude=$9, tags=$10, timezone=$11, starts_at=$12, ends_at=$13, terms=$14, contact_email=$15, contact_phone=$16, status=$17, inventory_mode=$18, submitted_at=$19, moderation_reason=$20, decided_at=$21, decided_by_user_id=$22, published_at=$23, cancelled_at=$24, cancelled_by_user_id=$25, cancellation_reason=$26, completed_at=$27, updated_at=$28, version=version+1 WHERE id=$29 AND version=$30`,
		e.Title, e.Description, e.Category, e.VenueName, e.AddressLine, e.City, e.Province, e.Latitude, e.Longitude, e.Tags, e.Timezone, e.StartsAt, e.EndsAt, e.Terms, e.ContactEmail, e.ContactPhone, e.Status, e.InventoryMode, e.SubmittedAt, e.ModerationReason, e.DecidedAt, e.DecidedByUserID, e.PublishedAt, e.CancelledAt, e.CancelledByUserID, e.CancellationReason, e.CompletedAt, e.UpdatedAt, e.ID, expectedVersion)
	if err != nil {
		return mapErr(err)
	}
	if cmd, ok := tag.(pgconn.CommandTag); ok && cmd.RowsAffected() == 0 {
		return domain.ErrVersionConflict
	}
	if err := s.replaceTags(ctx, e.ID, e.Tags); err != nil {
		return err
	}
	return s.replaceGallery(ctx, e.ID, e.GalleryURLs)
}

func (s *Store) UpdateEventLifecycle(ctx context.Context, e domain.Event, expectedVersion int) error {
	tag, err := exec(ctx, s, `UPDATE events SET status=$1, submitted_at=$2, moderation_reason=$3, decided_at=$4, decided_by_user_id=$5, published_at=$6, cancelled_at=$7, cancelled_by_user_id=$8, cancellation_reason=$9, completed_at=$10, updated_at=$11, version=version+1 WHERE id=$12 AND version=$13`,
		e.Status, e.SubmittedAt, e.ModerationReason, e.DecidedAt, e.DecidedByUserID, e.PublishedAt, e.CancelledAt, e.CancelledByUserID, e.CancellationReason, e.CompletedAt, e.UpdatedAt, e.ID, expectedVersion)
	if err != nil {
		return mapErr(err)
	}
	if cmd, ok := tag.(pgconn.CommandTag); ok && cmd.RowsAffected() == 0 {
		return domain.ErrVersionConflict
	}
	return nil
}

func (s *Store) DeleteEvent(ctx context.Context, id string, expectedVersion int) error {
	_, _ = exec(ctx, s, `DELETE FROM event_tags WHERE event_id=$1`, id)
	_, _ = exec(ctx, s, `DELETE FROM event_staff_assignments WHERE event_id=$1`, id)
	_, _ = exec(ctx, s, `DELETE FROM event_seats WHERE event_id=$1`, id)
	_, _ = exec(ctx, s, `DELETE FROM venue_sections WHERE event_id=$1`, id)
	_, _ = exec(ctx, s, `DELETE FROM event_ticket_types WHERE event_id=$1`, id)
	_, _ = exec(ctx, s, `DELETE FROM seat_map_assets WHERE event_id=$1`, id)
	_, _ = exec(ctx, s, `DELETE FROM event_image_assets WHERE event_id=$1`, id)
	tag, err := exec(ctx, s, `DELETE FROM events WHERE id=$1 AND version=$2`, id, expectedVersion)
	if err != nil {
		return mapErr(err)
	}
	if cmd, ok := tag.(pgconn.CommandTag); ok && cmd.RowsAffected() == 0 {
		return domain.ErrVersionConflict
	}
	return nil
}

func (s *Store) ListEvents(ctx context.Context, organizerID, status string, limit int, cursorAt *time.Time, cursorID string) ([]domain.Event, error) {
	rows, err := query(ctx, s, `SELECT `+eventCols+` FROM events WHERE organizer_profile_id=$1 AND ($2::text='' OR status::text=$2) AND ($3::timestamptz IS NULL OR (updated_at,id) < ($3,$4)) ORDER BY updated_at DESC, id DESC LIMIT $5`, organizerID, status, cursorAt, cursorID, limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []domain.Event
	for rows.Next() {
		e, err := scanEventRow(ctx, s, rows)
		if err != nil {
			return nil, err
		}
		out = append(out, e)
	}
	return out, rows.Err()
}

func (s *Store) CreateTicket(ctx context.Context, t domain.TicketType) error {
	_, err := exec(ctx, s, `INSERT INTO event_ticket_types (id,event_id,name,description,price_rupiah,quota,max_per_account,sale_starts_at,sale_ends_at,sort_order,created_at,updated_at,version) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)`,
		t.ID, t.EventID, t.Name, t.Description, t.PriceRupiah, t.Quota, t.MaxPerAccount, t.SaleStartsAt, t.SaleEndsAt, t.SortOrder, t.CreatedAt, t.UpdatedAt, t.Version)
	return mapErr(err)
}

func (s *Store) UpdateTicket(ctx context.Context, t domain.TicketType, expectedVersion int) error {
	tag, err := exec(ctx, s, `UPDATE event_ticket_types SET name=$1, description=$2, price_rupiah=$3, quota=$4, max_per_account=$5, sale_starts_at=$6, sale_ends_at=$7, sort_order=$8, updated_at=$9, version=version+1 WHERE id=$10 AND event_id=$11 AND version=$12`,
		t.Name, t.Description, t.PriceRupiah, t.Quota, t.MaxPerAccount, t.SaleStartsAt, t.SaleEndsAt, t.SortOrder, t.UpdatedAt, t.ID, t.EventID, expectedVersion)
	if err != nil {
		return mapErr(err)
	}
	if cmd, ok := tag.(pgconn.CommandTag); ok && cmd.RowsAffected() == 0 {
		return domain.ErrVersionConflict
	}
	return nil
}

func (s *Store) DeleteTicket(ctx context.Context, eventID, ticketID string, expectedVersion int) error {
	tag, err := exec(ctx, s, `DELETE FROM event_ticket_types WHERE id=$1 AND event_id=$2 AND version=$3`, ticketID, eventID, expectedVersion)
	if err != nil {
		return mapErr(err)
	}
	if cmd, ok := tag.(pgconn.CommandTag); ok && cmd.RowsAffected() == 0 {
		return domain.ErrVersionConflict
	}
	return nil
}

func (s *Store) ListTickets(ctx context.Context, eventID string) ([]domain.TicketType, error) {
	rows, err := query(ctx, s, `SELECT id,event_id,name,description,price_rupiah,quota,max_per_account,sale_starts_at,sale_ends_at,sort_order,sales_stopped_at,sales_stopped_by_user_id,sales_stop_reason,created_at,updated_at,version,reserved_quantity,paid_quantity FROM event_ticket_types WHERE event_id=$1 ORDER BY sort_order,id`, eventID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []domain.TicketType
	for rows.Next() {
		var t domain.TicketType
		if err := rows.Scan(&t.ID, &t.EventID, &t.Name, &t.Description, &t.PriceRupiah, &t.Quota, &t.MaxPerAccount, &t.SaleStartsAt, &t.SaleEndsAt, &t.SortOrder, &t.SalesStoppedAt, &t.SalesStoppedByUserID, &t.SalesStopReason, &t.CreatedAt, &t.UpdatedAt, &t.Version, &t.ReservedQuantity, &t.PaidQuantity); err != nil {
			return nil, err
		}
		out = append(out, t)
	}
	return out, rows.Err()
}

func (s *Store) ReplaceSections(ctx context.Context, eventID string, sections []domain.Section) error {
	if _, err := exec(ctx, s, `DELETE FROM event_seats WHERE event_id=$1`, eventID); err != nil {
		return err
	}
	if _, err := exec(ctx, s, `DELETE FROM venue_sections WHERE event_id=$1`, eventID); err != nil {
		return err
	}
	for _, sec := range sections {
		if _, err := exec(ctx, s, `INSERT INTO venue_sections (id,event_id,ticket_type_id,name,sort_order) VALUES ($1,$2,$3,$4,$5)`, sec.ID, eventID, sec.TicketTypeID, sec.Name, sec.SortOrder); err != nil {
			return mapErr(err)
		}
	}
	return nil
}

func (s *Store) ListSections(ctx context.Context, eventID string) ([]domain.Section, error) {
	rows, err := query(ctx, s, `SELECT id,event_id,ticket_type_id,name,sort_order FROM venue_sections WHERE event_id=$1 ORDER BY sort_order,id`, eventID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []domain.Section
	for rows.Next() {
		var sec domain.Section
		if err := rows.Scan(&sec.ID, &sec.EventID, &sec.TicketTypeID, &sec.Name, &sec.SortOrder); err != nil {
			return nil, err
		}
		out = append(out, sec)
	}
	return out, rows.Err()
}

func (s *Store) ReplaceSeats(ctx context.Context, eventID string, seats []domain.Seat) error {
	if _, err := exec(ctx, s, `DELETE FROM event_seats WHERE event_id=$1`, eventID); err != nil {
		return err
	}
	for _, seat := range seats {
		if _, err := exec(ctx, s, `INSERT INTO event_seats (id,event_id,section_id,label) VALUES ($1,$2,$3,$4)`, seat.ID, eventID, seat.SectionID, seat.Label); err != nil {
			return mapErr(err)
		}
	}
	return nil
}

func (s *Store) ListSeats(ctx context.Context, eventID string) ([]domain.Seat, error) {
	rows, err := query(ctx, s, `SELECT id,event_id,section_id,label FROM event_seats WHERE event_id=$1 ORDER BY label,id`, eventID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []domain.Seat
	for rows.Next() {
		var seat domain.Seat
		if err := rows.Scan(&seat.ID, &seat.EventID, &seat.SectionID, &seat.Label); err != nil {
			return nil, err
		}
		out = append(out, seat)
	}
	return out, rows.Err()
}

func (s *Store) UpsertSeatMap(ctx context.Context, sm domain.SeatMap) error {
	_, err := exec(ctx, s, `INSERT INTO seat_map_assets (id,event_id,storage_key,mime_type,byte_size,alt_text,legend,status) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
		ON CONFLICT (event_id) DO UPDATE SET storage_key=EXCLUDED.storage_key, mime_type=EXCLUDED.mime_type, byte_size=EXCLUDED.byte_size, alt_text=EXCLUDED.alt_text, legend=EXCLUDED.legend, status=EXCLUDED.status`,
		sm.ID, sm.EventID, sm.StorageKey, sm.MimeType, sm.ByteSize, sm.AltText, sm.Legend, sm.Status)
	return mapErr(err)
}

func (s *Store) GetSeatMap(ctx context.Context, eventID string) (domain.SeatMap, error) {
	row := rowQ(ctx, s, `SELECT id,event_id,storage_key,mime_type,byte_size,alt_text,legend,status::text FROM seat_map_assets WHERE event_id=$1`, eventID)
	var sm domain.SeatMap
	var status string
	err := row.Scan(&sm.ID, &sm.EventID, &sm.StorageKey, &sm.MimeType, &sm.ByteSize, &sm.AltText, &sm.Legend, &status)
	if errors.Is(err, pgx.ErrNoRows) {
		return domain.SeatMap{}, domain.ErrNotFound
	}
	sm.Status = domain.ImageStatus(status)
	return sm, err
}

type scanner interface{ Scan(...any) error }

func scanEvent(ctx context.Context, s *Store, row pgx.Row) (domain.Event, error) {
	e, err := scanEventDest(row)
	if errors.Is(err, pgx.ErrNoRows) {
		return domain.Event{}, domain.ErrNotFound
	}
	if err != nil {
		return e, err
	}
	urls, gerr := s.listGallery(ctx, e.ID)
	if gerr != nil {
		return e, gerr
	}
	e.GalleryURLs = urls
	return e, nil
}

func scanEventRow(ctx context.Context, s *Store, rows pgx.Rows) (domain.Event, error) {
	e, err := scanEventDest(rows)
	if err != nil {
		return e, err
	}
	urls, gerr := s.listGallery(ctx, e.ID)
	if gerr != nil {
		return e, gerr
	}
	e.GalleryURLs = urls
	return e, nil
}

func scanEventDest(row scanner) (domain.Event, error) {
	var e domain.Event
	var status, mode string
	err := row.Scan(&e.ID, &e.OrganizerProfileID, &e.Slug, &e.Title, &e.Description, &e.Category, &e.VenueName, &e.AddressLine, &e.City, &e.Province, &e.Latitude, &e.Longitude, &e.Tags, &e.Timezone, &e.StartsAt, &e.EndsAt, &e.Terms, &e.ContactEmail, &e.ContactPhone, &status, &mode, &e.SubmittedAt, &e.ModerationReason, &e.DecidedAt, &e.DecidedByUserID, &e.PublishedAt, &e.CancelledAt, &e.CancelledByUserID, &e.CancellationReason, &e.CompletedAt, &e.CreatedAt, &e.UpdatedAt, &e.Version)
	e.Status = domain.Status(status)
	e.InventoryMode = domain.InventoryMode(mode)
	if e.Tags == nil {
		e.Tags = []string{}
	}
	if e.GalleryURLs == nil {
		e.GalleryURLs = []string{}
	}
	return e, err
}

func (s *Store) listGallery(ctx context.Context, eventID string) ([]string, error) {
	rows, err := query(ctx, s, `SELECT image_url FROM event_gallery_images WHERE event_id=$1 ORDER BY sort_order, id`, eventID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []string{}
	for rows.Next() {
		var url string
		if err := rows.Scan(&url); err != nil {
			return nil, err
		}
		out = append(out, url)
	}
	return out, rows.Err()
}

func (s *Store) replaceGallery(ctx context.Context, eventID string, urls []string) error {
	if _, err := exec(ctx, s, `DELETE FROM event_gallery_images WHERE event_id=$1`, eventID); err != nil {
		return err
	}
	for i, url := range urls {
		id := fmt.Sprintf("%s:g:%d", eventID, i)
		if _, err := exec(ctx, s, `INSERT INTO event_gallery_images (id,event_id,image_url,sort_order) VALUES ($1,$2,$3,$4)`, id, eventID, url, i); err != nil {
			return mapErr(err)
		}
	}
	return nil
}

func (s *Store) replaceTags(ctx context.Context, eventID string, tags []string) error {
	if _, err := exec(ctx, s, `DELETE FROM event_tags WHERE event_id=$1`, eventID); err != nil {
		return err
	}
	seen := map[string]struct{}{}
	for _, tag := range tags {
		norm := normalizeEventTag(tag)
		if norm == "" {
			continue
		}
		if _, ok := seen[norm]; ok {
			continue
		}
		seen[norm] = struct{}{}
		if _, err := exec(ctx, s, `INSERT INTO event_tags (event_id, tag) VALUES ($1,$2)`, eventID, norm); err != nil {
			return mapErr(err)
		}
	}
	return nil
}

func normalizeEventTag(tag string) string {
	tag = strings.ToLower(strings.TrimSpace(tag))
	var b strings.Builder
	prevHyphen := false
	for _, r := range tag {
		if (r >= 'a' && r <= 'z') || (r >= '0' && r <= '9') {
			b.WriteRune(r)
			prevHyphen = false
			continue
		}
		if (r == ' ' || r == '-' || r == '_') && !prevHyphen && b.Len() > 0 {
			b.WriteByte('-')
			prevHyphen = true
		}
	}
	out := strings.Trim(b.String(), "-")
	if n := len(out); n < 2 || n > 32 {
		return ""
	}
	return out
}

func mapErr(err error) error {
	if err == nil {
		return nil
	}
	var pgErr *pgconn.PgError
	if errors.As(err, &pgErr) && pgErr.Code == "23505" {
		if strings.Contains(pgErr.ConstraintName, "slug") {
			return domain.ErrSlugConflict
		}
		if strings.Contains(pgErr.ConstraintName, "name") {
			return domain.ErrTicketNameExists
		}
		if strings.Contains(pgErr.ConstraintName, "lifecycle_requests_pending") {
			return domain.ErrLifecyclePending
		}
		return domain.ErrVersionConflict
	}
	return err
}

func exec(ctx context.Context, s *Store, sql string, args ...any) (any, error) {
	if tx := platdb.TxFrom(ctx); tx != nil {
		return tx.Exec(ctx, sql, args...)
	}
	return s.pool.Exec(ctx, sql, args...)
}

func rowQ(ctx context.Context, s *Store, sql string, args ...any) pgx.Row {
	if tx := platdb.TxFrom(ctx); tx != nil {
		return tx.QueryRow(ctx, sql, args...)
	}
	return s.pool.QueryRow(ctx, sql, args...)
}

func query(ctx context.Context, s *Store, sql string, args ...any) (pgx.Rows, error) {
	if tx := platdb.TxFrom(ctx); tx != nil {
		return tx.Query(ctx, sql, args...)
	}
	return s.pool.Query(ctx, sql, args...)
}

func (s *Store) ListModeration(ctx context.Context, status, q string, limit int, cursorAt *time.Time, cursorID string) ([]domain.QueueItem, error) {
	like := ""
	if q != "" {
		like = "%" + strings.ToLower(q) + "%"
	}
	rows, err := query(ctx, s, `SELECT `+eventCols+` FROM events
		WHERE ($1::text='' OR status::text=$1)
		  AND ($2::text='' OR lower(title) LIKE $2)
		  AND ($3::timestamptz IS NULL OR (submitted_at, id) > ($3,$4))
		ORDER BY submitted_at ASC NULLS LAST, id ASC LIMIT $5`, status, like, cursorAt, cursorID, limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []domain.QueueItem
	for rows.Next() {
		e, err := scanEventRow(ctx, s, rows)
		if err != nil {
			return nil, err
		}
		out = append(out, domain.QueueItem{Event: e})
	}
	return out, rows.Err()
}

func (s *Store) StopTicket(ctx context.Context, t domain.TicketType, expectedVersion int) error {
	tag, err := exec(ctx, s, `UPDATE event_ticket_types SET sales_stopped_at=$1, sales_stopped_by_user_id=$2, sales_stop_reason=$3, updated_at=$4, version=version+1 WHERE id=$5 AND event_id=$6 AND version=$7`,
		t.SalesStoppedAt, t.SalesStoppedByUserID, t.SalesStopReason, t.UpdatedAt, t.ID, t.EventID, expectedVersion)
	if err != nil {
		return mapErr(err)
	}
	if cmd, ok := tag.(pgconn.CommandTag); ok && cmd.RowsAffected() == 0 {
		return domain.ErrVersionConflict
	}
	return nil
}

func (s *Store) ListStaff(ctx context.Context, eventID string) ([]domain.StaffAssignment, error) {
	rows, err := query(ctx, s, `SELECT id,event_id,user_id,status::text,assigned_by_user_id,assigned_at,revoked_by_user_id,revoked_at,revocation_reason,created_at,updated_at,version FROM event_staff_assignments WHERE event_id=$1 ORDER BY assigned_at DESC, id DESC`, eventID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []domain.StaffAssignment
	for rows.Next() {
		a, err := scanStaff(rows)
		if err != nil {
			return nil, err
		}
		out = append(out, a)
	}
	return out, rows.Err()
}

func (s *Store) GetStaff(ctx context.Context, eventID, assignmentID string) (domain.StaffAssignment, error) {
	row := rowQ(ctx, s, `SELECT id,event_id,user_id,status::text,assigned_by_user_id,assigned_at,revoked_by_user_id,revoked_at,revocation_reason,created_at,updated_at,version FROM event_staff_assignments WHERE event_id=$1 AND id=$2`, eventID, assignmentID)
	a, err := scanStaff(row)
	if errors.Is(err, pgx.ErrNoRows) {
		return domain.StaffAssignment{}, domain.ErrStaffNotFound
	}
	return a, err
}

func (s *Store) GetStaffByUser(ctx context.Context, eventID, userID string) (domain.StaffAssignment, error) {
	row := rowQ(ctx, s, `SELECT id,event_id,user_id,status::text,assigned_by_user_id,assigned_at,revoked_by_user_id,revoked_at,revocation_reason,created_at,updated_at,version FROM event_staff_assignments WHERE event_id=$1 AND user_id=$2`, eventID, userID)
	a, err := scanStaff(row)
	if errors.Is(err, pgx.ErrNoRows) {
		return domain.StaffAssignment{}, domain.ErrStaffNotFound
	}
	return a, err
}

func (s *Store) UpsertStaff(ctx context.Context, a domain.StaffAssignment, expectedVersion int) error {
	if expectedVersion == 0 {
		_, err := exec(ctx, s, `INSERT INTO event_staff_assignments (id,event_id,user_id,status,assigned_by_user_id,assigned_at,revoked_by_user_id,revoked_at,revocation_reason,created_at,updated_at,version)
			VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
			a.ID, a.EventID, a.UserID, a.Status, a.AssignedByUserID, a.AssignedAt, a.RevokedByUserID, a.RevokedAt, a.RevocationReason, a.CreatedAt, a.UpdatedAt, a.Version)
		return mapErr(err)
	}
	tag, err := exec(ctx, s, `UPDATE event_staff_assignments SET status=$1, assigned_by_user_id=$2, assigned_at=$3, revoked_by_user_id=$4, revoked_at=$5, revocation_reason=$6, updated_at=$7, version=version+1 WHERE id=$8 AND event_id=$9 AND version=$10`,
		a.Status, a.AssignedByUserID, a.AssignedAt, a.RevokedByUserID, a.RevokedAt, a.RevocationReason, a.UpdatedAt, a.ID, a.EventID, expectedVersion)
	if err != nil {
		return mapErr(err)
	}
	if cmd, ok := tag.(pgconn.CommandTag); ok && cmd.RowsAffected() == 0 {
		return domain.ErrVersionConflict
	}
	return nil
}

func scanStaff(row scanner) (domain.StaffAssignment, error) {
	var a domain.StaffAssignment
	var status string
	err := row.Scan(&a.ID, &a.EventID, &a.UserID, &status, &a.AssignedByUserID, &a.AssignedAt, &a.RevokedByUserID, &a.RevokedAt, &a.RevocationReason, &a.CreatedAt, &a.UpdatedAt, &a.Version)
	a.Status = domain.StaffStatus(status)
	return a, err
}

const lifecycleCols = `r.id, r.event_id, r.ticket_type_id, r.kind, r.status, r.reason, r.requested_by_user_id, r.requested_at, r.decided_by_user_id, r.decided_at, r.decision_reason, r.created_at, r.updated_at, r.version, e.title, COALESCE(p.name,''), COALESCE(t.name,'')`

func (s *Store) CreateLifecycleRequest(ctx context.Context, r domain.LifecycleRequest) error {
	_, err := exec(ctx, s, `INSERT INTO event_lifecycle_requests (id,event_id,ticket_type_id,kind,status,reason,requested_by_user_id,requested_at,decided_by_user_id,decided_at,decision_reason,created_at,updated_at,version)
		VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)`,
		r.ID, r.EventID, r.TicketTypeID, r.Kind, r.Status, r.Reason, r.RequestedByUserID, r.RequestedAt, r.DecidedByUserID, r.DecidedAt, r.DecisionReason, r.CreatedAt, r.UpdatedAt, r.Version)
	return mapErr(err)
}

func (s *Store) GetLifecycleRequest(ctx context.Context, id string) (domain.LifecycleRequest, error) {
	return scanLifecycle(rowQ(ctx, s, `SELECT `+lifecycleCols+` FROM event_lifecycle_requests r
		JOIN events e ON e.id=r.event_id
		LEFT JOIN organizer_profiles p ON p.id=e.organizer_profile_id
		LEFT JOIN event_ticket_types t ON t.id=r.ticket_type_id
		WHERE r.id=$1`, id))
}

func (s *Store) GetLifecycleRequestForUpdate(ctx context.Context, id string) (domain.LifecycleRequest, error) {
	return scanLifecycle(rowQ(ctx, s, `SELECT `+lifecycleCols+` FROM event_lifecycle_requests r
		JOIN events e ON e.id=r.event_id
		LEFT JOIN organizer_profiles p ON p.id=e.organizer_profile_id
		LEFT JOIN event_ticket_types t ON t.id=r.ticket_type_id
		WHERE r.id=$1 FOR UPDATE OF r`, id))
}

func (s *Store) ListPendingLifecycleRequests(ctx context.Context) ([]domain.LifecycleRequest, error) {
	return listLifecycle(ctx, s, `SELECT `+lifecycleCols+` FROM event_lifecycle_requests r
		JOIN events e ON e.id=r.event_id
		LEFT JOIN organizer_profiles p ON p.id=e.organizer_profile_id
		LEFT JOIN event_ticket_types t ON t.id=r.ticket_type_id
		WHERE r.status='PENDING' ORDER BY r.requested_at ASC, r.id ASC`)
}

func (s *Store) ListEventLifecycleRequests(ctx context.Context, eventID string) ([]domain.LifecycleRequest, error) {
	return listLifecycle(ctx, s, `SELECT `+lifecycleCols+` FROM event_lifecycle_requests r
		JOIN events e ON e.id=r.event_id
		LEFT JOIN organizer_profiles p ON p.id=e.organizer_profile_id
		LEFT JOIN event_ticket_types t ON t.id=r.ticket_type_id
		WHERE r.event_id=$1 ORDER BY r.requested_at DESC, r.id DESC`, eventID)
}

func (s *Store) UpdateLifecycleRequest(ctx context.Context, r domain.LifecycleRequest, expectedVersion int) error {
	tag, err := exec(ctx, s, `UPDATE event_lifecycle_requests SET status=$1, decided_by_user_id=$2, decided_at=$3, decision_reason=$4, updated_at=$5, version=version+1 WHERE id=$6 AND version=$7`,
		r.Status, r.DecidedByUserID, r.DecidedAt, r.DecisionReason, r.UpdatedAt, r.ID, expectedVersion)
	if err != nil {
		return mapErr(err)
	}
	if cmd, ok := tag.(pgconn.CommandTag); ok && cmd.RowsAffected() == 0 {
		return domain.ErrVersionConflict
	}
	return nil
}

func listLifecycle(ctx context.Context, s *Store, sql string, args ...any) ([]domain.LifecycleRequest, error) {
	rows, err := query(ctx, s, sql, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []domain.LifecycleRequest
	for rows.Next() {
		r, err := scanLifecycle(rows)
		if err != nil {
			return nil, err
		}
		out = append(out, r)
	}
	return out, rows.Err()
}

func scanLifecycle(row scanner) (domain.LifecycleRequest, error) {
	var r domain.LifecycleRequest
	var kind, status string
	err := row.Scan(&r.ID, &r.EventID, &r.TicketTypeID, &kind, &status, &r.Reason, &r.RequestedByUserID, &r.RequestedAt, &r.DecidedByUserID, &r.DecidedAt, &r.DecisionReason, &r.CreatedAt, &r.UpdatedAt, &r.Version, &r.EventTitle, &r.OrganizerName, &r.TicketTypeName)
	if errors.Is(err, pgx.ErrNoRows) {
		return domain.LifecycleRequest{}, domain.ErrLifecycleNotFound
	}
	r.Kind = domain.LifecycleKind(kind)
	r.Status = domain.LifecycleStatus(status)
	return r, err
}
