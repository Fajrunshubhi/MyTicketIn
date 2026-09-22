package infrastructure

import (
	"context"
	"time"

	"myticketin/internal/modules/events/domain"
)

func (s *Store) ListCatalog(ctx context.Context, q domain.CatalogQuery, now time.Time, limit int, cursorAt *time.Time, cursorID string) ([]domain.CatalogListRow, error) {
	var from, toExcl *time.Time
	if q.DateFrom != "" {
		f, t, err := domain.JakartaDayBounds(q.DateFrom, q.DateTo)
		if err != nil {
			return nil, err
		}
		from, toExcl = &f, &t
	}
	order := `e.starts_at ASC, e.id ASC`
	keyset := `($9::timestamptz IS NULL OR (e.starts_at, e.id) > ($9, $10))`
	if q.Sort == domain.SortNewest {
		order = `e.published_at DESC NULLS LAST, e.id DESC`
		keyset = `($9::timestamptz IS NULL OR (e.published_at, e.id) < ($9, $10))`
	}
	sql := `SELECT ` + eventCols + ` FROM events e
	WHERE e.status = 'PUBLISHED'
	  AND e.starts_at > $1
	  AND ($2::text = '' OR e.search_document @@ plainto_tsquery('simple', $2)
	       OR EXISTS (SELECT 1 FROM event_tags et WHERE et.event_id = e.id AND et.tag = ANY (regexp_split_to_array(lower($2), '\s+'))))
	  AND ($3::text = '' OR lower(e.category) = $3)
	  AND ($4::text = '' OR lower(e.city) = $4)
	  AND ($5::text = '' OR lower(e.province) = $5)
	  AND ($11::text = '' OR $11 = ANY (e.tags))
	  AND ($6::timestamptz IS NULL OR e.ends_at >= $6)
	  AND ($7::timestamptz IS NULL OR e.starts_at < $7)
	  AND ` + keyset + `
	ORDER BY ` + order + `
	LIMIT $8`
	rows, err := query(ctx, s, sql, now, q.Q, q.Category, q.City, q.Province, from, toExcl, limit, cursorAt, cursorID, q.Tag)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []domain.CatalogListRow
	for rows.Next() {
		e, err := scanEventRow(ctx, s, rows)
		if err != nil {
			return nil, err
		}
		out = append(out, domain.CatalogListRow{Event: e})
	}
	return out, rows.Err()
}

func (s *Store) ListCatalogFilters(ctx context.Context, now time.Time) (domain.CatalogFilters, error) {
	catRows, err := query(ctx, s, `SELECT category FROM events WHERE status='PUBLISHED' AND starts_at > $1 GROUP BY category ORDER BY lower(category) LIMIT 200`, now)
	if err != nil {
		return domain.CatalogFilters{}, err
	}
	defer catRows.Close()
	var cats []string
	for catRows.Next() {
		var c string
		if err := catRows.Scan(&c); err != nil {
			return domain.CatalogFilters{}, err
		}
		cats = append(cats, c)
	}
	locRows, err := query(ctx, s, `SELECT city, province FROM events WHERE status='PUBLISHED' AND starts_at > $1 GROUP BY city, province ORDER BY lower(city), lower(province) LIMIT 200`, now)
	if err != nil {
		return domain.CatalogFilters{}, err
	}
	defer locRows.Close()
	var locs []domain.CatalogLocation
	for locRows.Next() {
		var loc domain.CatalogLocation
		if err := locRows.Scan(&loc.City, &loc.Province); err != nil {
			return domain.CatalogFilters{}, err
		}
		locs = append(locs, loc)
	}
	tagRows, err := query(ctx, s, `SELECT t FROM (
		SELECT DISTINCT unnest(tags) AS t FROM events WHERE status='PUBLISHED' AND starts_at > $1 AND cardinality(tags) > 0
	) x ORDER BY t LIMIT 200`, now)
	if err != nil {
		return domain.CatalogFilters{}, err
	}
	defer tagRows.Close()
	var tags []string
	for tagRows.Next() {
		var tag string
		if err := tagRows.Scan(&tag); err != nil {
			return domain.CatalogFilters{}, err
		}
		tags = append(tags, tag)
	}
	return domain.CatalogFilters{Categories: cats, Locations: locs, Tags: tags}, nil
}
