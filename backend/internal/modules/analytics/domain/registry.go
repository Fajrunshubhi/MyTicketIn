package domain

const SchemaVersion int16 = 1

type Spec struct {
	Name          string
	ClientAllowed bool
	Active        bool
}

var Registry = []Spec{
	{Name: "user_registered", Active: true},
	{Name: "login_succeeded", Active: true},
	{Name: "login_failed", Active: true},
	{Name: "access_denied", Active: true},
	{Name: "organizer_application_submitted"},
	{Name: "organizer_application_approved"},
	{Name: "organizer_application_rejected"},
	{Name: "event_created", Active: true},
	{Name: "event_submitted", Active: true},
	{Name: "event_published", Active: true},
	{Name: "event_rejected", Active: true},
	{Name: "event_cancelled", Active: true},
	{Name: "catalog_viewed", Active: true},
	{Name: "event_search_performed", Active: true},
	{Name: "event_viewed", Active: true},
	{Name: "catalog_natural_filter_parsed", Active: true},
	{Name: "catalog_natural_filter_fallback", Active: true},
	{Name: "checkout_started", Active: true},
	{Name: "order_created", Active: true},
	{Name: "order_expired", Active: true},
	{Name: "payment_succeeded"},
	{Name: "payment_failed"},
	{Name: "webhook_rejected"},
	{Name: "ticket_issued", Active: true},
	{Name: "ticket_viewed", Active: true, ClientAllowed: true},
	{Name: "checkin_succeeded", Active: true},
	{Name: "checkin_rejected", Active: true},
}

func Lookup(name string) (Spec, bool) {
	for _, s := range Registry {
		if s.Name == name {
			return s, true
		}
	}
	return Spec{}, false
}

func AllNames() []string {
	out := make([]string, 0, len(Registry))
	for _, s := range Registry {
		out = append(out, s.Name)
	}
	return out
}
