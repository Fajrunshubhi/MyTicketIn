package application

import (
	"context"
	"errors"

	"myticketin/internal/modules/organizers/domain"
)

type StatusLookup struct {
	Store Store
}

func (l StatusLookup) LookupOrganizerStatus(ctx context.Context, ownerUserID string) (string, bool, error) {
	if l.Store == nil {
		return "", false, nil
	}
	p, err := l.Store.GetByOwner(ctx, ownerUserID)
	if err != nil {
		if errors.Is(err, domain.ErrNotFound) {
			return "", false, nil
		}
		return "", false, err
	}
	return string(p.Status), true, nil
}
