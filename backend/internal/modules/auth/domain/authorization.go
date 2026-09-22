package domain

// Action identifiers for the default-deny policy registry.
const (
	ActionViewProfile    = "user.profile.view"
	ActionRevokeSessions = "user.sessions.revoke"
	ActionAdminPing      = "admin.ping"
	ActionAdminAudit     = "admin.audit.read"
	ActionOrganizerApply = "organizer.application.submit"
	ActionOrganizerOwn   = "organizer.application.own"
	ActionAdminOrganizer = "admin.organizer.moderate"
	ActionAdminEvent     = "admin.event.moderate"
)

type PolicyFunc func(actor Actor, resource Resource) bool

type Registry struct {
	policies map[string]PolicyFunc
}

func NewRegistry() *Registry {
	r := &Registry{policies: map[string]PolicyFunc{}}
	r.Register(ActionViewProfile, func(actor Actor, resource Resource) bool {
		if !actor.User.IsActive() {
			return false
		}
		if actor.User.Role == RoleAdmin {
			return true
		}
		return resource.OwnerID != "" && actor.User.ID == resource.OwnerID
	})
	r.Register(ActionRevokeSessions, func(actor Actor, resource Resource) bool {
		return actor.User.IsActive() && actor.User.ID == resource.OwnerID
	})
	r.Register(ActionAdminPing, func(actor Actor, _ Resource) bool {
		return actor.User.IsActive() && actor.User.Role == RoleAdmin
	})
	r.Register(ActionAdminAudit, func(actor Actor, _ Resource) bool {
		return actor.User.IsActive() && actor.User.Role == RoleAdmin
	})
	r.Register(ActionOrganizerApply, func(actor Actor, _ Resource) bool {
		return actor.User.IsActive() && actor.User.Role != RoleAdmin
	})
	r.Register(ActionOrganizerOwn, func(actor Actor, resource Resource) bool {
		return actor.User.IsActive() && resource.OwnerID != "" && actor.User.ID == resource.OwnerID
	})
	r.Register(ActionAdminOrganizer, func(actor Actor, _ Resource) bool {
		return actor.User.IsActive() && actor.User.Role == RoleAdmin
	})
	r.Register(ActionAdminEvent, func(actor Actor, _ Resource) bool {
		return actor.User.IsActive() && actor.User.Role == RoleAdmin
	})
	return r
}

func (r *Registry) Register(action string, fn PolicyFunc) {
	r.policies[action] = fn
}

func (r *Registry) Authorize(actor Actor, action string, resource Resource) error {
	if !actor.User.IsActive() {
		if actor.User.Status == StatusSuspended {
			return ErrAccountSuspended
		}
		if actor.User.Status == StatusDisabled {
			return ErrAccountDisabled
		}
		return ErrForbidden
	}
	fn, ok := r.policies[action]
	if !ok {
		return ErrForbidden
	}
	if !fn(actor, resource) {
		return ErrForbidden
	}
	return nil
}
