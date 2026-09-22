package application

import (
	"context"
	"strings"
	"time"
	"unicode/utf8"

	authdomain "myticketin/internal/modules/auth/domain"
	"myticketin/internal/modules/events/domain"
	notifydomain "myticketin/internal/modules/notifications/domain"
	orgdomain "myticketin/internal/modules/organizers/domain"
	platdb "myticketin/internal/platform/db"
)

func (s *Service) requireAdmin(actor authdomain.User) error {
	if s.Policies == nil {
		s.Policies = authdomain.NewRegistry()
	}
	if err := s.Policies.Authorize(authdomain.Actor{User: actor}, authdomain.ActionAdminEvent, authdomain.Resource{}); err != nil {
		return domain.ErrAccessDenied
	}
	return nil
}

func (s *Service) ListAdmin(ctx context.Context, actor authdomain.User, status, q string, limit int, cursorAt *time.Time, cursorID string) ([]domain.QueueItem, error) {
	if err := s.requireAdmin(actor); err != nil {
		return nil, err
	}
	if status == "" {
		status = string(domain.StatusPendingReview)
	}
	if limit <= 0 {
		limit = 25
	}
	rows, err := s.Store.ListModeration(ctx, status, strings.TrimSpace(q), limit, cursorAt, cursorID)
	if err != nil {
		return nil, err
	}
	for i := range rows {
		if rows[i].OrganizerName != "" || s.Profiles == nil {
			continue
		}
		p, err := s.Profiles.GetByID(ctx, rows[i].OrganizerProfileID)
		if err == nil {
			rows[i].OrganizerName = p.Name
		}
	}
	return rows, nil
}

func (s *Service) GetAdmin(ctx context.Context, actor authdomain.User, id string) (domain.Event, []domain.TicketType, error) {
	if err := s.requireAdmin(actor); err != nil {
		return domain.Event{}, nil, err
	}
	e, err := s.Store.GetEvent(ctx, id)
	if err != nil {
		return domain.Event{}, nil, domain.ErrNotFound
	}
	types, _ := s.Store.ListTickets(ctx, id)
	return e, types, nil
}

func (s *Service) Moderate(ctx context.Context, actor authdomain.User, id, decision, reason string, expectedVersion int) (domain.Event, error) {
	if err := s.requireAdmin(actor); err != nil {
		return domain.Event{}, err
	}
	decision = strings.ToUpper(strings.TrimSpace(decision))
	reason = strings.TrimSpace(reason)
	var out domain.Event
	err := s.inTx(ctx, func(ctx context.Context) error {
		e, err := s.Store.GetEventForUpdate(ctx, id)
		if err != nil {
			return domain.ErrNotFound
		}
		if !domain.CanModerate(e.Status) {
			return domain.ErrTransitionInvalid
		}
		if e.Version != expectedVersion {
			return domain.ErrVersionConflict
		}
		before := e
		now := s.Now()
		e.DecidedAt = &now
		uid := actor.ID
		e.DecidedByUserID = &uid
		e.UpdatedAt = now
		switch decision {
		case "APPROVE":
			if utf8.RuneCountInString(reason) > 1000 {
				return domain.ErrReasonRequired
			}
			if reason != "" {
				e.ModerationReason = &reason
			} else {
				e.ModerationReason = nil
			}
			e.Status = domain.StatusPublished
			e.PublishedAt = &now
		case "REJECT":
			if !domain.ReasonLengthOK(reason, 10, 1000) {
				return domain.ErrReasonRequired
			}
			e.Status = domain.StatusRejected
			e.ModerationReason = &reason
		default:
			return domain.ErrTransitionInvalid
		}
		if err := s.Store.UpdateEventLifecycle(ctx, e, expectedVersion); err != nil {
			return err
		}
		e.Version = expectedVersion + 1
		out = e
		action := "event.moderate.reject"
		if decision == "APPROVE" {
			action = "event.moderate.approve"
		}
		return s.record(ctx, actor.ID, action, e.ID, snapshot(before), snapshot(e))
	})
	if err != nil {
		return domain.Event{}, err
	}
	if s.Notify != nil && s.Profiles != nil {
		typ := notifydomain.TypeEventRejected
		path := "/dashboard/event/" + out.ID
		if out.Status == domain.StatusPublished {
			typ, path = notifydomain.TypeEventPublished, "/events/"+out.Slug
		}
		if p, perr := s.Profiles.GetByID(ctx, out.OrganizerProfileID); perr == nil && p.OwnerUserID != "" {
			_ = s.Notify.Enqueue(ctx, notifydomain.Command{
				DomainEventID: "event-moderation:" + out.ID + ":" + string(out.Status),
				RecipientID:   p.OwnerUserID, Type: typ, EntityType: "Event", EntityID: out.ID, ActionPath: path,
			})
		}
	}
	if out.Status == domain.StatusPublished {
		s.emit(ctx, "event_published", actor.ID, out.ID)
	} else {
		s.emit(ctx, "event_rejected", actor.ID, out.ID)
	}
	return out, nil
}

func (s *Service) Resubmit(ctx context.Context, actor authdomain.User, id string, expectedVersion int) (domain.Event, error) {
	var out domain.Event
	err := s.inTx(ctx, func(ctx context.Context) error {
		e, err := s.Store.GetEventForUpdate(ctx, id)
		if err != nil {
			return domain.ErrNotFound
		}
		orgID, err := s.requireOrg(ctx, actor)
		if err != nil {
			return err
		}
		if e.OrganizerProfileID != orgID {
			return domain.ErrNotFound
		}
		if e.Status != domain.StatusRejected {
			return domain.ErrTransitionInvalid
		}
		if e.Version != expectedVersion {
			return domain.ErrVersionConflict
		}
		types, err := s.Store.ListTickets(ctx, id)
		if err != nil {
			return err
		}
		if err := s.validateSubmit(ctx, e, types); err != nil {
			return err
		}
		before := e
		now := s.Now()
		e.Status = domain.StatusPendingReview
		e.SubmittedAt = &now
		e.ModerationReason = nil
		e.DecidedAt = nil
		e.DecidedByUserID = nil
		e.UpdatedAt = now
		if err := s.Store.UpdateEvent(ctx, e, expectedVersion); err != nil {
			return err
		}
		e.Version = expectedVersion + 1
		out = e
		return s.record(ctx, actor.ID, "event.resubmit", e.ID, snapshot(before), snapshot(e))
	})
	if err != nil {
		return domain.Event{}, err
	}
	s.emit(ctx, "event_submitted", actor.ID, out.ID)
	return out, nil
}

func (s *Service) Cancel(ctx context.Context, actor authdomain.User, id, reason string, expectedVersion int, asAdmin bool) (domain.Event, error) {
	reason = strings.TrimSpace(reason)
	if !domain.ReasonLengthOK(reason, 10, 1000) {
		return domain.Event{}, domain.ErrReasonRequired
	}
	if asAdmin {
		if err := s.requireAdmin(actor); err != nil {
			return domain.Event{}, err
		}
	}
	var out domain.Event
	err := s.inTx(ctx, func(ctx context.Context) error {
		e, err := s.Store.GetEventForUpdate(ctx, id)
		if err != nil {
			return domain.ErrNotFound
		}
		if e.Status == domain.StatusCancelled {
			return domain.ErrAlreadyCancelled
		}
		if !asAdmin {
			orgID, err := s.requireOrg(ctx, actor)
			if err != nil {
				return err
			}
			if e.OrganizerProfileID != orgID {
				return domain.ErrNotFound
			}
		}
		if !domain.CanCancel(e.Status) {
			return domain.ErrTransitionInvalid
		}
		if e.Version != expectedVersion {
			return domain.ErrVersionConflict
		}
		before := e
		now := s.Now()
		uid := actor.ID
		e.Status = domain.StatusCancelled
		e.CancelledAt = &now
		e.CancelledByUserID = &uid
		e.CancellationReason = &reason
		e.UpdatedAt = now
		if err := s.Store.UpdateEventLifecycle(ctx, e, expectedVersion); err != nil {
			return err
		}
		e.Version = expectedVersion + 1
		out = e
		if s.Tickets != nil {
			if err := s.Tickets.CancelUnusedForEvent(ctx, e.ID); err != nil {
				return err
			}
		}
		if s.Notify != nil {
			ids, err := s.Notify.RecipientsForCancelledEvent(ctx, e.ID)
			if err != nil {
				return err
			}
			for _, uid := range ids {
				if err := s.Notify.Enqueue(ctx, notifydomain.Command{
					DomainEventID: "event-cancelled:" + e.ID,
					RecipientID:   uid, Type: notifydomain.TypeEventCancelled, EntityType: "Event", EntityID: e.ID, ActionPath: "/tickets",
				}); err != nil {
					return err
				}
			}
			if s.Profiles != nil {
				if p, err := s.Profiles.GetByID(ctx, e.OrganizerProfileID); err == nil {
					_ = s.Notify.Enqueue(ctx, notifydomain.Command{
						DomainEventID: "event-cancelled-owner:" + e.ID,
						RecipientID:   p.OwnerUserID, Type: notifydomain.TypeEventCancelled, EntityType: "Event", EntityID: e.ID, ActionPath: "/organizer/events/" + e.ID,
					})
				}
			}
		}
		return s.record(ctx, actor.ID, "event.cancel", e.ID, snapshot(before), snapshot(e))
	})
	if err != nil {
		return domain.Event{}, err
	}
	s.emit(ctx, "event_cancelled", actor.ID, out.ID)
	if s.PendingOrders != nil {
		_ = s.PendingOrders.CancelPendingForEvent(ctx, out.ID, reason)
	}
	return out, nil
}

func (s *Service) Complete(ctx context.Context, actor authdomain.User, id string, expectedVersion int) (domain.Event, error) {
	var out domain.Event
	err := s.inTx(ctx, func(ctx context.Context) error {
		e, err := s.Store.GetEventForUpdate(ctx, id)
		if err != nil {
			return domain.ErrNotFound
		}
		orgID, err := s.requireOrg(ctx, actor)
		if err != nil {
			if s.requireAdmin(actor) != nil {
				return err
			}
		} else if e.OrganizerProfileID != orgID {
			if s.requireAdmin(actor) != nil {
				return domain.ErrNotFound
			}
		}
		if e.Status == domain.StatusCompleted {
			out = e
			return nil
		}
		if e.Status != domain.StatusPublished {
			return domain.ErrTransitionInvalid
		}
		if e.Version != expectedVersion {
			return domain.ErrVersionConflict
		}
		if s.Now().Before(e.EndsAt) {
			return domain.ErrNotEnded
		}
		before := e
		now := s.Now()
		e.Status = domain.StatusCompleted
		e.CompletedAt = &now
		e.UpdatedAt = now
		if err := s.Store.UpdateEventLifecycle(ctx, e, expectedVersion); err != nil {
			return err
		}
		e.Version = expectedVersion + 1
		out = e
		return s.record(ctx, actor.ID, "event.complete", e.ID, snapshot(before), snapshot(e))
	})
	return out, err
}

func (s *Service) RequestCancel(ctx context.Context, actor authdomain.User, id, reason string) (domain.LifecycleRequest, error) {
	reason = strings.TrimSpace(reason)
	if !domain.ReasonLengthOK(reason, 10, 1000) {
		return domain.LifecycleRequest{}, domain.ErrReasonRequired
	}
	var out domain.LifecycleRequest
	err := s.inTx(ctx, func(ctx context.Context) error {
		e, _, err := s.owned(ctx, actor, id)
		if err != nil {
			return err
		}
		if !domain.CanCancel(e.Status) {
			return domain.ErrTransitionInvalid
		}
		existing, err := s.Store.ListEventLifecycleRequests(ctx, id)
		if err != nil {
			return err
		}
		for _, row := range existing {
			if row.Status == domain.LifecyclePending && row.Kind == domain.KindCancelEvent {
				return domain.ErrLifecyclePending
			}
		}
		now := s.Now()
		rid, err := platdb.NewID()
		if err != nil {
			return err
		}
		req := domain.LifecycleRequest{
			ID: rid, EventID: id, Kind: domain.KindCancelEvent, Status: domain.LifecyclePending,
			Reason: reason, RequestedByUserID: actor.ID, RequestedAt: now, CreatedAt: now, UpdatedAt: now, Version: 1,
			EventTitle: e.Title,
		}
		if err := s.Store.CreateLifecycleRequest(ctx, req); err != nil {
			return err
		}
		out = req
		return s.record(ctx, actor.ID, "event.cancel.request", id, nil, map[string]any{"requestId": rid, "reason": reason})
	})
	return out, err
}

func (s *Service) RequestStopSales(ctx context.Context, actor authdomain.User, eventID, ticketID, reason string) (domain.LifecycleRequest, error) {
	reason = strings.TrimSpace(reason)
	if !domain.ReasonLengthOK(reason, 10, 500) {
		return domain.LifecycleRequest{}, domain.ErrReasonRequired
	}
	var out domain.LifecycleRequest
	err := s.inTx(ctx, func(ctx context.Context) error {
		e, _, err := s.owned(ctx, actor, eventID)
		if err != nil {
			return err
		}
		if e.Status != domain.StatusPublished {
			return domain.ErrTransitionInvalid
		}
		list, err := s.Store.ListTickets(ctx, eventID)
		if err != nil {
			return err
		}
		var t domain.TicketType
		found := false
		for _, row := range list {
			if row.ID == ticketID {
				t = row
				found = true
				break
			}
		}
		if !found {
			return domain.ErrNotFound
		}
		if t.SalesStoppedAt != nil {
			return domain.ErrSalesAlreadyStopped
		}
		existing, err := s.Store.ListEventLifecycleRequests(ctx, eventID)
		if err != nil {
			return err
		}
		for _, row := range existing {
			if row.Status == domain.LifecyclePending && row.Kind == domain.KindStopSales && row.TicketTypeID != nil && *row.TicketTypeID == ticketID {
				return domain.ErrLifecyclePending
			}
		}
		now := s.Now()
		rid, err := platdb.NewID()
		if err != nil {
			return err
		}
		tid := ticketID
		req := domain.LifecycleRequest{
			ID: rid, EventID: eventID, TicketTypeID: &tid, Kind: domain.KindStopSales, Status: domain.LifecyclePending,
			Reason: reason, RequestedByUserID: actor.ID, RequestedAt: now, CreatedAt: now, UpdatedAt: now, Version: 1,
			EventTitle: e.Title, TicketTypeName: t.Name,
		}
		if err := s.Store.CreateLifecycleRequest(ctx, req); err != nil {
			return err
		}
		out = req
		return s.record(ctx, actor.ID, "event.ticket.stop_sales.request", eventID, nil, map[string]any{"requestId": rid, "ticketId": ticketID})
	})
	return out, err
}

func (s *Service) ListPendingLifecycleRequests(ctx context.Context, actor authdomain.User) ([]domain.LifecycleRequest, error) {
	if err := s.requireAdmin(actor); err != nil {
		return nil, err
	}
	return s.Store.ListPendingLifecycleRequests(ctx)
}

func (s *Service) ListEventLifecycleRequests(ctx context.Context, actor authdomain.User, eventID string) ([]domain.LifecycleRequest, error) {
	if _, _, err := s.owned(ctx, actor, eventID); err != nil {
		return nil, err
	}
	return s.Store.ListEventLifecycleRequests(ctx, eventID)
}

func (s *Service) DecideLifecycleRequest(ctx context.Context, actor authdomain.User, requestID, decision, decisionReason string) (domain.LifecycleRequest, error) {
	if err := s.requireAdmin(actor); err != nil {
		return domain.LifecycleRequest{}, err
	}
	decision = strings.ToUpper(strings.TrimSpace(decision))
	decisionReason = strings.TrimSpace(decisionReason)
	if decision != "APPROVE" && decision != "REJECT" {
		return domain.LifecycleRequest{}, domain.ErrTransitionInvalid
	}
	if decision == "REJECT" && !domain.ReasonLengthOK(decisionReason, 10, 1000) {
		return domain.LifecycleRequest{}, domain.ErrReasonRequired
	}
	var out domain.LifecycleRequest
	err := s.inTx(ctx, func(ctx context.Context) error {
		req, err := s.Store.GetLifecycleRequestForUpdate(ctx, requestID)
		if err != nil {
			return domain.ErrLifecycleNotFound
		}
		if req.Status != domain.LifecyclePending {
			return domain.ErrLifecycleDecided
		}
		if decision == "APPROVE" {
			if req.Kind == domain.KindCancelEvent {
				e, err := s.Store.GetEventForUpdate(ctx, req.EventID)
				if err != nil {
					return domain.ErrNotFound
				}
				if _, err := s.Cancel(ctx, actor, req.EventID, req.Reason, e.Version, true); err != nil {
					return err
				}
			} else {
				if req.TicketTypeID == nil {
					return domain.ErrTicketInvalid
				}
				e, err := s.Store.GetEventForUpdate(ctx, req.EventID)
				if err != nil {
					return domain.ErrNotFound
				}
				_ = e
				list, err := s.Store.ListTickets(ctx, req.EventID)
				if err != nil {
					return err
				}
				ver := 0
				found := false
				for _, t := range list {
					if t.ID == *req.TicketTypeID {
						ver = t.Version
						found = true
						break
					}
				}
				if !found {
					return domain.ErrNotFound
				}
				if _, err := s.applyStopSales(ctx, actor, req.EventID, *req.TicketTypeID, req.Reason, ver, true); err != nil {
					return err
				}
			}
		}
		now := s.Now()
		uid := actor.ID
		req.Status = domain.LifecycleApproved
		if decision == "REJECT" {
			req.Status = domain.LifecycleRejected
			req.DecisionReason = &decisionReason
		}
		req.DecidedByUserID = &uid
		req.DecidedAt = &now
		req.UpdatedAt = now
		if err := s.Store.UpdateLifecycleRequest(ctx, req, req.Version); err != nil {
			return err
		}
		req.Version++
		out = req
		return s.record(ctx, actor.ID, "event.lifecycle.decide", req.EventID, nil, map[string]any{"requestId": req.ID, "decision": decision, "kind": req.Kind})
	})
	return out, err
}

func (s *Service) StopSales(ctx context.Context, actor authdomain.User, eventID, ticketID, reason string, expectedVersion int) (domain.TicketType, error) {
	return s.applyStopSales(ctx, actor, eventID, ticketID, reason, expectedVersion, false)
}

func (s *Service) applyStopSales(ctx context.Context, actor authdomain.User, eventID, ticketID, reason string, expectedVersion int, asAdmin bool) (domain.TicketType, error) {
	reason = strings.TrimSpace(reason)
	if !domain.ReasonLengthOK(reason, 10, 500) {
		return domain.TicketType{}, domain.ErrReasonRequired
	}
	var out domain.TicketType
	apply := func(ctx context.Context) error {
		var e domain.Event
		var err error
		if asAdmin {
			if err := s.requireAdmin(actor); err != nil {
				return err
			}
			e, err = s.Store.GetEventForUpdate(ctx, eventID)
			if err != nil {
				return domain.ErrNotFound
			}
		} else {
			e, _, err = s.owned(ctx, actor, eventID)
			if err != nil {
				return err
			}
		}
		if e.Status != domain.StatusPublished {
			return domain.ErrTransitionInvalid
		}
		list, err := s.Store.ListTickets(ctx, eventID)
		if err != nil {
			return err
		}
		var t domain.TicketType
		found := false
		for _, row := range list {
			if row.ID == ticketID {
				t = row
				found = true
				break
			}
		}
		if !found {
			return domain.ErrNotFound
		}
		if t.SalesStoppedAt != nil {
			return domain.ErrSalesAlreadyStopped
		}
		now := s.Now()
		uid := actor.ID
		t.SalesStoppedAt = &now
		t.SalesStoppedByUserID = &uid
		t.SalesStopReason = &reason
		t.UpdatedAt = now
		if err := s.Store.StopTicket(ctx, t, expectedVersion); err != nil {
			return err
		}
		t.Version = expectedVersion + 1
		out = t
		return s.record(ctx, actor.ID, "event.ticket.stop_sales", eventID, nil, map[string]any{"ticketId": ticketID})
	}
	if asAdmin {
		err := apply(ctx)
		return out, err
	}
	err := s.inTx(ctx, apply)
	return out, err
}

func (s *Service) ListStaff(ctx context.Context, actor authdomain.User, eventID string) ([]domain.StaffAssignment, error) {
	if _, _, err := s.owned(ctx, actor, eventID); err != nil {
		return nil, err
	}
	return s.Store.ListStaff(ctx, eventID)
}

func (s *Service) SearchStaffCandidates(ctx context.Context, actor authdomain.User, q, ip string) ([]authdomain.User, error) {
	if _, err := s.requireOrg(ctx, actor); err != nil {
		return nil, err
	}
	q = strings.TrimSpace(q)
	if utf8.RuneCountInString(q) < 3 {
		return nil, domain.ErrStaffUserNotFound
	}
	if err := s.limit(ctx, "staff", actor.ID, ip, 30, time.Hour); err != nil {
		return nil, err
	}
	if s.Users == nil {
		return nil, domain.ErrStaffUserNotFound
	}
	return s.Users.SearchActiveStaff(ctx, q, 20)
}

func (s *Service) AssignStaff(ctx context.Context, actor authdomain.User, eventID, userID string, expectedExistingVersion int) (domain.StaffAssignment, int, error) {
	if s.Users == nil {
		return domain.StaffAssignment{}, 0, domain.ErrStaffUserNotFound
	}
	target, err := s.Users.GetByID(ctx, userID)
	if err != nil {
		return domain.StaffAssignment{}, 0, domain.ErrStaffUserNotFound
	}
	if target.Role == authdomain.RoleAdmin {
		return domain.StaffAssignment{}, 0, domain.ErrStaffAccessDenied
	}
	if !target.IsActive() {
		return domain.StaffAssignment{}, 0, domain.ErrStaffUserInactive
	}
	var out domain.StaffAssignment
	status := 201
	err = s.inTx(ctx, func(ctx context.Context) error {
		if _, _, err := s.owned(ctx, actor, eventID); err != nil {
			return err
		}
		existing, err := s.Store.GetStaffByUser(ctx, eventID, userID)
		now := s.Now()
		if err == nil {
			if existing.Status == domain.StaffActive {
				return domain.ErrStaffConflict
			}
			if expectedExistingVersion != 0 && existing.Version != expectedExistingVersion {
				return domain.ErrVersionConflict
			}
			existing.Status = domain.StaffActive
			existing.AssignedByUserID = actor.ID
			existing.AssignedAt = now
			existing.RevokedAt = nil
			existing.RevokedByUserID = nil
			existing.RevocationReason = nil
			existing.UpdatedAt = now
			if err := s.Store.UpsertStaff(ctx, existing, existing.Version); err != nil {
				return err
			}
			existing.Version++
			out = existing
			status = 200
			return s.record(ctx, actor.ID, "event.staff.reactivate", eventID, nil, map[string]any{"assignmentId": existing.ID})
		}
		id, err := platdb.NewID()
		if err != nil {
			return err
		}
		a := domain.StaffAssignment{
			ID: id, EventID: eventID, UserID: userID, Status: domain.StaffActive,
			AssignedByUserID: actor.ID, AssignedAt: now, CreatedAt: now, UpdatedAt: now, Version: 1,
		}
		if err := s.Store.UpsertStaff(ctx, a, 0); err != nil {
			return err
		}
		out = a
		return s.record(ctx, actor.ID, "event.staff.assign", eventID, nil, map[string]any{"assignmentId": a.ID})
	})
	return out, status, err
}

func (s *Service) RevokeStaff(ctx context.Context, actor authdomain.User, eventID, assignmentID, reason string, expectedVersion int) (domain.StaffAssignment, error) {
	reason = strings.TrimSpace(reason)
	if !domain.ReasonLengthOK(reason, 10, 500) {
		return domain.StaffAssignment{}, domain.ErrReasonRequired
	}
	var out domain.StaffAssignment
	err := s.inTx(ctx, func(ctx context.Context) error {
		if _, _, err := s.owned(ctx, actor, eventID); err != nil {
			return err
		}
		a, err := s.Store.GetStaff(ctx, eventID, assignmentID)
		if err != nil {
			return domain.ErrStaffNotFound
		}
		if a.Status == domain.StaffRevoked {
			return domain.ErrStaffConflict
		}
		now := s.Now()
		uid := actor.ID
		a.Status = domain.StaffRevoked
		a.RevokedAt = &now
		a.RevokedByUserID = &uid
		a.RevocationReason = &reason
		a.UpdatedAt = now
		if err := s.Store.UpsertStaff(ctx, a, expectedVersion); err != nil {
			return err
		}
		a.Version = expectedVersion + 1
		out = a
		return s.record(ctx, actor.ID, "event.staff.revoke", eventID, nil, map[string]any{"assignmentId": assignmentID})
	})
	return out, err
}

func (s *Service) IsOperator(ctx context.Context, userID, eventID string) bool {
	e, err := s.Store.GetEvent(ctx, eventID)
	if err != nil {
		return false
	}
	approved := false
	ownerID := ""
	if s.Profiles != nil {
		p, err := s.Profiles.GetByID(ctx, e.OrganizerProfileID)
		if err == nil {
			ownerID = p.OwnerUserID
			approved = orgdomain.HasOrganizerCapability(p.Status)
		}
	}
	active := false
	if a, err := s.Store.GetStaffByUser(ctx, eventID, userID); err == nil {
		active = a.Status == domain.StaffActive
	}
	return domain.IsEventOperator(ownerID, approved, userID, active)
}
