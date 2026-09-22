package domain

import "errors"

type Status string

const (
	StatusPending   Status = "PENDING"
	StatusApproved  Status = "APPROVED"
	StatusRejected  Status = "REJECTED"
	StatusSuspended Status = "SUSPENDED"
)

type Decision string

const (
	DecisionApprove Decision = "APPROVE"
	DecisionReject  Decision = "REJECT"
	DecisionSuspend Decision = "SUSPEND"
	DecisionRestore Decision = "RESTORE"
)

var (
	ErrExists            = errors.New("ORGANIZER_APPLICATION_EXISTS")
	ErrNotFound          = errors.New("ORGANIZER_APPLICATION_NOT_FOUND")
	ErrPending           = errors.New("ORGANIZER_APPLICATION_PENDING")
	ErrAlreadyApproved   = errors.New("ORGANIZER_ALREADY_APPROVED")
	ErrNotApproved       = errors.New("ORGANIZER_NOT_APPROVED")
	ErrRequired          = errors.New("ORGANIZER_REQUIRED")
	ErrTransitionInvalid = errors.New("ORGANIZER_TRANSITION_INVALID")
	ErrVersionConflict   = errors.New("ORGANIZER_VERSION_CONFLICT")
	ErrReasonRequired    = errors.New("ORGANIZER_REASON_REQUIRED")
	ErrContactInvalid    = errors.New("ORGANIZER_CONTACT_INVALID")
	ErrRateLimited       = errors.New("ORGANIZER_RATE_LIMITED")
	ErrAccessDenied      = errors.New("ORGANIZER_ACCESS_DENIED")
)

func TargetStatus(from Status, decision Decision) (Status, error) {
	switch decision {
	case DecisionApprove:
		if from == StatusPending {
			return StatusApproved, nil
		}
	case DecisionReject:
		if from == StatusPending {
			return StatusRejected, nil
		}
	case DecisionSuspend:
		if from == StatusApproved {
			return StatusSuspended, nil
		}
	case DecisionRestore:
		if from == StatusSuspended {
			return StatusApproved, nil
		}
	}
	return "", ErrTransitionInvalid
}

type TransitionError struct {
	From     Status
	Decision Decision
}

func (e TransitionError) Error() string { return ErrTransitionInvalid.Error() }

func (e TransitionError) Unwrap() error { return ErrTransitionInvalid }

func AllowedDecisions(from Status) []Decision {
	switch from {
	case StatusPending:
		return []Decision{DecisionApprove, DecisionReject}
	case StatusApproved:
		return []Decision{DecisionSuspend}
	case StatusSuspended:
		return []Decision{DecisionRestore}
	default:
		return nil
	}
}

func TransitionHint(from Status, decision Decision) string {
	switch from {
	case StatusPending:
		return "Pengajuan masih menunggu tinjauan. Gunakan Setujui atau Tolak."
	case StatusApproved:
		return "Organizer sudah disetujui. Keputusan berikutnya hanya Tangguhkan."
	case StatusRejected:
		return "Pengajuan ditolak. Admin tidak dapat menyetujui lagi sebelum organizer mengajukan ulang."
	case StatusSuspended:
		return "Organizer ditangguhkan. Keputusan berikutnya hanya Pulihkan."
	default:
		return "Transisi status tidak valid."
	}
}

func CanOwnerEdit(status Status) bool {
	return status == StatusRejected
}

func CanOwnerResubmit(status Status) bool {
	return status == StatusRejected
}

func HasOrganizerCapability(status Status) bool {
	return status == StatusApproved
}
