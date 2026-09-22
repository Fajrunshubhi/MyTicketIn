package httpapi

import (
	"crypto/hmac"
	"crypto/rand"
	"crypto/sha256"
	"encoding/base64"
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"net/url"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"

	"myticketin/internal/modules/auth/application"
	"myticketin/internal/modules/auth/domain"
	notifydomain "myticketin/internal/modules/notifications/domain"
	"myticketin/internal/platform/env"
	apierrors "myticketin/internal/platform/errors"
	"myticketin/internal/platform/logger"
)

const (
	cookieSession = "mti_session"
	cookieCSRF    = "mti_csrf"
	cookieOAuth   = "mti_oauth"
)

type API struct {
	Cfg  env.Config
	Svc  *application.Service
	HTTP *http.Client
}

func (a API) Mount(r chi.Router) {
	r.Post("/api/register", a.register)
	r.Post("/api/auth/login", a.loginJSON)
	r.Post("/api/auth/callback/credentials", a.loginForm)
	r.Get("/api/auth/csrf", a.csrf)
	r.Get("/api/auth/session", a.session)
	r.Post("/api/auth/signout", a.signout)
	r.Get("/api/auth/signin/google", a.googleStart)
	r.Get("/api/auth/callback/google", a.googleCallback)
	r.Get("/api/auth/providers", a.providers)
	r.Get("/api/me", a.me)
	r.Patch("/api/me", a.updateMe)
	r.Post("/api/me/sessions/revoke", a.revoke)
	r.Get("/api/users/{id}", a.getUser)
	r.Get("/api/admin/ping", a.adminPing)
	r.Post("/api/auth/password-reset/request", a.resetRequest)
	r.Post("/api/auth/password-reset/confirm", a.resetConfirm)
	r.Post("/api/admin/users/{userId}/password-reset-assistance", a.resetAssist)
}

func (a API) register(w http.ResponseWriter, r *http.Request) {
	if err := a.requireCSRF(r); err != nil {
		writeErr(w, r, err)
		return
	}
	var body struct {
		Name            string `json:"name"`
		Username        string `json:"username"`
		Email           string `json:"email"`
		Password        string `json:"password"`
		ConfirmPassword string `json:"confirmPassword"`
		Intent          string `json:"intent"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		writeErr(w, r, domain.ErrValidation)
		return
	}
	intent, err := application.ParseRegisterIntent(body.Intent)
	if err != nil {
		writeErr(w, r, err)
		return
	}
	user, err := a.Svc.Register(r.Context(), body.Name, body.Username, body.Email, body.Password, body.ConfirmPassword, clientIP(r))
	if err != nil {
		writeErr(w, r, err)
		return
	}
	acc := a.Svc.AccessFor(r.Context(), user)
	writeData(w, http.StatusCreated, a.userPayload(user, intent, acc, ""))
}

func (a API) loginJSON(w http.ResponseWriter, r *http.Request) {
	if err := a.requireCSRF(r); err != nil {
		writeErr(w, r, err)
		return
	}
	var body struct {
		Username    string `json:"username"`
		Password    string `json:"password"`
		CallbackURL string `json:"callbackUrl"`
		Portal      string `json:"portal"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		writeErr(w, r, domain.ErrValidation)
		return
	}
	user, sess, raw, csrf, err := a.Svc.Login(r.Context(), body.Username, body.Password, clientIP(r), body.Portal)
	if err != nil {
		if errors.Is(err, domain.ErrPortalDenied) {
			a.clearAuthCookies(w)
		}
		writeErr(w, r, err)
		return
	}
	a.setAuthCookies(w, raw, csrf, sess.ExpiresAt)
	acc := a.Svc.AccessFor(r.Context(), user)
	portal, _ := application.ResolvePortal(body.Portal, acc)
	writeData(w, http.StatusOK, a.userPayload(user, portal, acc, body.CallbackURL))
}

func (a API) loginForm(w http.ResponseWriter, r *http.Request) {
	if err := r.ParseForm(); err != nil {
		http.Redirect(w, r, "/login?error=AUTH_INVALID_CREDENTIALS", http.StatusFound)
		return
	}
	if err := a.requireCSRF(r); err != nil {
		http.Redirect(w, r, "/login?error=AUTH_CSRF_INVALID", http.StatusFound)
		return
	}
	portal := r.Form.Get("portal")
	user, sess, raw, csrf, err := a.Svc.Login(r.Context(), r.Form.Get("username"), r.Form.Get("password"), clientIP(r), portal)
	if err != nil {
		if errors.Is(err, domain.ErrPortalDenied) {
			a.clearAuthCookies(w)
		}
		q := "/login?error=" + url.QueryEscape(err.Error())
		if portal != "" {
			q += "&portal=" + url.QueryEscape(portal)
		}
		var pe domain.PortalDeniedError
		if errors.As(err, &pe) && pe.Reason != "" {
			q += "&reason=" + url.QueryEscape(pe.Reason)
		}
		http.Redirect(w, r, a.Cfg.WebOrigin+q, http.StatusFound)
		return
	}
	a.setAuthCookies(w, raw, csrf, sess.ExpiresAt)
	acc := a.Svc.AccessFor(r.Context(), user)
	parsed, _ := application.ResolvePortal(portal, acc)
	next := application.PortalNextPath(parsed, acc, r.Form.Get("callbackUrl"))
	http.Redirect(w, r, a.Cfg.WebOrigin+next, http.StatusFound)
}

func (a API) csrf(w http.ResponseWriter, r *http.Request) {
	token := readCookie(r, cookieCSRF)
	if token == "" {
		token = newToken()
		a.setCookie(w, cookieCSRF, token, time.Now().UTC().Add(domain.SessionTTL), false)
	}
	writeJSON(w, http.StatusOK, map[string]string{"csrfToken": token})
}

func (a API) session(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Cache-Control", "private, no-store")
	user, sess, err := a.currentUser(r)
	if err != nil {
		writeJSON(w, http.StatusOK, map[string]any{})
		return
	}
	acc := a.Svc.AccessFor(r.Context(), user)
	writeJSON(w, http.StatusOK, map[string]any{
		"user":    a.userPayload(user, acc.Kind, acc, ""),
		"expires": sess.ExpiresAt.UTC().Format(time.RFC3339),
	})
}

func (a API) signout(w http.ResponseWriter, r *http.Request) {
	if err := a.requireCSRF(r); err != nil {
		writeErr(w, r, err)
		return
	}
	_ = a.Svc.SignOut(r.Context(), readCookie(r, cookieSession))
	a.clearAuthCookies(w)
	w.WriteHeader(http.StatusNoContent)
}

func (a API) me(w http.ResponseWriter, r *http.Request) {
	user, _, err := a.requireUser(w, r)
	if err != nil {
		return
	}
	acc := a.Svc.AccessFor(r.Context(), user)
	writeData(w, http.StatusOK, a.userPayload(user, acc.Kind, acc, ""))
}

func (a API) updateMe(w http.ResponseWriter, r *http.Request) {
	if err := a.requireCSRF(r); err != nil {
		writeErr(w, r, err)
		return
	}
	user, _, err := a.requireUser(w, r)
	if err != nil {
		return
	}
	var body struct {
		Name  string `json:"name"`
		Email string `json:"email"`
	}
	if err := json.NewDecoder(io.LimitReader(r.Body, 1<<12)).Decode(&body); err != nil {
		writeErr(w, r, domain.ErrValidation)
		return
	}
	updated, err := a.Svc.UpdateProfile(r.Context(), user, body.Name, body.Email)
	if err != nil {
		writeErr(w, r, err)
		return
	}
	acc := a.Svc.AccessFor(r.Context(), updated)
	writeData(w, http.StatusOK, a.userPayload(updated, acc.Kind, acc, ""))
}

func (a API) revoke(w http.ResponseWriter, r *http.Request) {
	if err := a.requireCSRF(r); err != nil {
		writeErr(w, r, err)
		return
	}
	user, _, err := a.requireUser(w, r)
	if err != nil {
		return
	}
	if err := a.Svc.RevokeAll(r.Context(), user); err != nil {
		writeErr(w, r, err)
		return
	}
	a.clearAuthCookies(w)
	w.WriteHeader(http.StatusNoContent)
}

func (a API) getUser(w http.ResponseWriter, r *http.Request) {
	actor, _, err := a.requireUser(w, r)
	if err != nil {
		return
	}
	id := chi.URLParam(r, "id")
	if err := a.Svc.ViewProfile(r.Context(), actor, id); err != nil {
		writeErr(w, r, err)
		return
	}
	user, err := a.Svc.Users.GetByID(r.Context(), id)
	if err != nil {
		writeErr(w, r, domain.ErrForbidden)
		return
	}
	writeData(w, http.StatusOK, publicUser(user))
}

func (a API) adminPing(w http.ResponseWriter, r *http.Request) {
	actor, _, err := a.requireUser(w, r)
	if err != nil {
		return
	}
	if err := a.Svc.AdminPing(r.Context(), actor); err != nil {
		writeErr(w, r, err)
		return
	}
	writeData(w, http.StatusOK, map[string]string{"status": "ok"})
}

func (a API) resetRequest(w http.ResponseWriter, r *http.Request) {
	if err := a.requireCSRF(r); err != nil {
		writeErr(w, r, err)
		return
	}
	var body struct {
		Email string `json:"email"`
	}
	_ = json.NewDecoder(io.LimitReader(r.Body, 1<<12)).Decode(&body)
	if err := a.Svc.RequestPasswordReset(r.Context(), body.Email, clientIP(r)); err != nil && errors.Is(err, notifydomain.ErrResetRateLimited) {
		writeErr(w, r, err)
		return
	}
	writeJSON(w, http.StatusAccepted, map[string]any{
		"data": map[string]string{"message": "Jika akun memenuhi syarat, instruksi pemulihan akan dikirim."},
	})
}

func (a API) resetConfirm(w http.ResponseWriter, r *http.Request) {
	if err := a.requireCSRF(r); err != nil {
		writeErr(w, r, err)
		return
	}
	var body struct {
		Token           string `json:"token"`
		NewPassword     string `json:"newPassword"`
		ConfirmPassword string `json:"confirmPassword"`
	}
	if err := json.NewDecoder(io.LimitReader(r.Body, 1<<12)).Decode(&body); err != nil {
		writeErr(w, r, domain.ErrValidation)
		return
	}
	if err := a.Svc.ConfirmPasswordReset(r.Context(), body.Token, body.NewPassword, body.ConfirmPassword); err != nil {
		writeErr(w, r, err)
		return
	}
	writeData(w, http.StatusOK, map[string]string{"message": "Kata sandi berhasil diubah. Silakan masuk kembali."})
}

func (a API) resetAssist(w http.ResponseWriter, r *http.Request) {
	if err := a.requireCSRF(r); err != nil {
		writeErr(w, r, err)
		return
	}
	actor, err := a.RequireUser(w, r)
	if err != nil {
		return
	}
	var body struct {
		Reason string `json:"reason"`
	}
	_ = json.NewDecoder(io.LimitReader(r.Body, 1<<12)).Decode(&body)
	token, err := a.Svc.AssistPasswordReset(r.Context(), actor, chi.URLParam(r, "userId"), body.Reason)
	if err != nil {
		writeErr(w, r, err)
		return
	}
	writeJSON(w, http.StatusAccepted, map[string]any{"data": map[string]any{
		"message":          "Pemulihan disiapkan. Serahkan token sekali pakai melalui kanal demo terkontrol.",
		"expiresInMinutes": 30,
		"oneTimeToken":     token,
		"sandbox":          true,
	}})
}

func (a API) providers(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, http.StatusOK, map[string]bool{"google": a.googleEnabled()})
}

func (a API) googleEnabled() bool {
	return a.Cfg.GoogleClientID != "" && a.Cfg.GoogleClientSecret != ""
}

func (a API) googleStart(w http.ResponseWriter, r *http.Request) {
	if !a.googleEnabled() {
		http.Redirect(w, r, a.Cfg.WebOrigin+"/login?error=AUTH_OAUTH_FAILED", http.StatusFound)
		return
	}
	state := newToken()
	nonce := newToken()
	portal, err := application.ParsePortal(r.URL.Query().Get("portal"))
	if err != nil {
		portal = domain.PortalBuyer
	}
	callback := application.SafeCallbackPath(r.URL.Query().Get("callbackUrl"), application.PortalNextPath(portal, application.Access{}, ""))
	payload := state + ":" + nonce + ":" + callback + ":" + portal
	a.setCookie(w, cookieOAuth, a.sign(payload), time.Now().UTC().Add(10*time.Minute), true)
	q := url.Values{}
	q.Set("client_id", a.Cfg.GoogleClientID)
	q.Set("redirect_uri", a.Cfg.GoogleCallbackURL())
	q.Set("response_type", "code")
	q.Set("scope", "openid email profile")
	q.Set("state", state)
	q.Set("nonce", nonce)
	http.Redirect(w, r, "https://accounts.google.com/o/oauth2/v2/auth?"+q.Encode(), http.StatusFound)
}

func (a API) googleCallback(w http.ResponseWriter, r *http.Request) {
	if r.URL.Query().Get("error") != "" {
		http.Redirect(w, r, a.Cfg.WebOrigin+"/login?error=AUTH_OAUTH_FAILED", http.StatusFound)
		return
	}
	signed := readCookie(r, cookieOAuth)
	payload, ok := a.unsign(signed)
	if !ok {
		http.Redirect(w, r, a.Cfg.WebOrigin+"/login?error=AUTH_OAUTH_FAILED", http.StatusFound)
		return
	}
	parts := strings.SplitN(payload, ":", 4)
	if len(parts) < 3 || parts[0] != r.URL.Query().Get("state") {
		http.Redirect(w, r, a.Cfg.WebOrigin+"/login?error=AUTH_OAUTH_FAILED", http.StatusFound)
		return
	}
	callback := parts[2]
	oauthPortal := domain.PortalBuyer
	if len(parts) >= 4 {
		oauthPortal = parts[3]
	}
	profile, err := a.exchangeGoogle(r.URL.Query().Get("code"))
	if err != nil {
		http.Redirect(w, r, a.Cfg.WebOrigin+"/login?error=AUTH_OAUTH_FAILED", http.StatusFound)
		return
	}
	var actor *domain.User
	if u, _, err := a.currentUser(r); err == nil {
		actor = &u
	}
	user, sess, raw, csrf, err := a.Svc.ResolveGoogle(r.Context(), profile, actor, clientIP(r))
	if errors.Is(err, domain.ErrAccountLinkRequired) {
		http.Redirect(w, r, a.Cfg.WebOrigin+"/login?error=AUTH_ACCOUNT_LINK_REQUIRED", http.StatusFound)
		return
	}
	if err != nil {
		http.Redirect(w, r, a.Cfg.WebOrigin+"/login?error="+err.Error(), http.StatusFound)
		return
	}
	acc := a.Svc.AccessFor(r.Context(), user)
	parsed, perr := application.ResolvePortal(oauthPortal, acc)
	if perr != nil {
		_ = a.Svc.SignOut(r.Context(), raw)
		http.Redirect(w, r, a.Cfg.WebOrigin+"/login?error=AUTH_PORTAL_DENIED", http.StatusFound)
		return
	}
	if err := application.AuthorizePortal(parsed, acc); err != nil {
		_ = a.Svc.SignOut(r.Context(), raw)
		reason := ""
		var pe domain.PortalDeniedError
		if errors.As(err, &pe) {
			reason = pe.Reason
		}
		q := "/login?error=AUTH_PORTAL_DENIED&portal=" + url.QueryEscape(parsed)
		if reason != "" {
			q += "&reason=" + url.QueryEscape(reason)
		}
		http.Redirect(w, r, a.Cfg.WebOrigin+q, http.StatusFound)
		return
	}
	a.setAuthCookies(w, raw, csrf, sess.ExpiresAt)
	next := application.PortalNextPath(parsed, acc, callback)
	http.Redirect(w, r, a.Cfg.WebOrigin+next, http.StatusFound)
}

func (a API) exchangeGoogle(code string) (domain.GoogleProfile, error) {
	if code == "" {
		return domain.GoogleProfile{}, domain.ErrOAuthFailed
	}
	client := a.HTTP
	if client == nil {
		client = &http.Client{Timeout: 10 * time.Second}
	}
	form := url.Values{}
	form.Set("code", code)
	form.Set("client_id", a.Cfg.GoogleClientID)
	form.Set("client_secret", a.Cfg.GoogleClientSecret)
	form.Set("redirect_uri", a.Cfg.GoogleCallbackURL())
	form.Set("grant_type", "authorization_code")
	resp, err := client.Post("https://oauth2.googleapis.com/token", "application/x-www-form-urlencoded", strings.NewReader(form.Encode()))
	if err != nil {
		return domain.GoogleProfile{}, domain.ErrOAuthFailed
	}
	defer resp.Body.Close()
	body, _ := io.ReadAll(io.LimitReader(resp.Body, 1<<20))
	var tok struct {
		AccessToken string `json:"access_token"`
	}
	if err := json.Unmarshal(body, &tok); err != nil || tok.AccessToken == "" {
		return domain.GoogleProfile{}, domain.ErrOAuthFailed
	}
	req, _ := http.NewRequest(http.MethodGet, "https://openidconnect.googleapis.com/v1/userinfo", nil)
	req.Header.Set("Authorization", "Bearer "+tok.AccessToken)
	info, err := client.Do(req)
	if err != nil {
		return domain.GoogleProfile{}, domain.ErrOAuthFailed
	}
	defer info.Body.Close()
	raw, _ := io.ReadAll(io.LimitReader(info.Body, 1<<20))
	var p struct {
		Sub           string `json:"sub"`
		Email         string `json:"email"`
		EmailVerified bool   `json:"email_verified"`
		Name          string `json:"name"`
	}
	if err := json.Unmarshal(raw, &p); err != nil {
		return domain.GoogleProfile{}, domain.ErrOAuthFailed
	}
	return domain.GoogleProfile{Subject: p.Sub, Email: p.Email, EmailVerified: p.EmailVerified, Name: p.Name}, nil
}

func (a API) requireUser(w http.ResponseWriter, r *http.Request) (domain.User, domain.Session, error) {
	user, sess, err := a.currentUser(r)
	if err != nil {
		writeErr(w, r, err)
		return domain.User{}, domain.Session{}, err
	}
	return user, sess, nil
}

func (a API) currentUser(r *http.Request) (domain.User, domain.Session, error) {
	return a.Svc.SessionFromToken(r.Context(), readCookie(r, cookieSession))
}

func (a API) requireCSRF(r *http.Request) error {
	cookie := readCookie(r, cookieCSRF)
	header := r.Header.Get("X-CSRF-Token")
	if header == "" {
		header = r.FormValue("csrfToken")
	}
	if cookie == "" || header == "" || cookie != header {
		return domain.ErrCSRFInvalid
	}
	return nil
}

func (a API) setAuthCookies(w http.ResponseWriter, raw, csrf string, exp time.Time) {
	a.setCookie(w, cookieSession, raw, exp, true)
	a.setCookie(w, cookieCSRF, csrf, exp, false)
}

func (a API) clearAuthCookies(w http.ResponseWriter) {
	past := time.Unix(0, 0).UTC()
	a.setCookie(w, cookieSession, "", past, true)
	a.setCookie(w, cookieCSRF, "", past, false)
	a.setCookie(w, cookieOAuth, "", past, true)
}

func (a API) setCookie(w http.ResponseWriter, name, value string, exp time.Time, httpOnly bool) {
	secure := a.Cfg.AppEnv == "production-demo" || a.Cfg.AppEnv == "preview" || strings.HasPrefix(a.Cfg.WebOrigin, "https://")
	sameSite := http.SameSiteLaxMode
	c := &http.Cookie{
		Name:     name,
		Value:    value,
		Path:     "/",
		Expires:  exp,
		MaxAge:   int(time.Until(exp).Seconds()),
		HttpOnly: httpOnly,
		Secure:   secure,
		SameSite: sameSite,
	}
	if value == "" {
		c.MaxAge = -1
	}
	http.SetCookie(w, c)
}

func (a API) sign(payload string) string {
	mac := hmac.New(sha256.New, []byte(a.Cfg.SessionSecret))
	_, _ = mac.Write([]byte(payload))
	return base64.RawURLEncoding.EncodeToString(mac.Sum(nil)) + "." + base64.RawURLEncoding.EncodeToString([]byte(payload))
}

func (a API) unsign(token string) (string, bool) {
	parts := strings.SplitN(token, ".", 2)
	if len(parts) != 2 {
		return "", false
	}
	payload, err := base64.RawURLEncoding.DecodeString(parts[1])
	if err != nil {
		return "", false
	}
	mac := hmac.New(sha256.New, []byte(a.Cfg.SessionSecret))
	_, _ = mac.Write(payload)
	want := base64.RawURLEncoding.EncodeToString(mac.Sum(nil))
	if !hmac.Equal([]byte(want), []byte(parts[0])) {
		return "", false
	}
	return string(payload), true
}

func (a API) OptionalUser(r *http.Request) (domain.User, bool) {
	u, _, err := a.currentUser(r)
	if err != nil {
		return domain.User{}, false
	}
	return u, true
}

func (a API) RequireUser(w http.ResponseWriter, r *http.Request) (domain.User, error) {
	u, _, err := a.requireUser(w, r)
	return u, err
}

func (a API) RequireCSRF(r *http.Request) error {
	return a.requireCSRF(r)
}

func (a API) ClientIP(r *http.Request) string {
	return clientIP(r)
}

func publicUser(u domain.User) map[string]any {
	return map[string]any{"id": u.ID, "name": u.Name, "username": u.Username, "email": u.Email, "role": u.Role}
}

func (a API) userPayload(u domain.User, portal string, acc application.Access, callback string) map[string]any {
	out := publicUser(u)
	out["portal"] = portal
	out["access"] = acc
	out["nextPath"] = application.PortalNextPath(portal, acc, callback)
	return out
}

func writeData(w http.ResponseWriter, status int, data any) {
	writeJSON(w, status, map[string]any{"data": data})
}

func portalDeniedMessage(err error) string {
	var pe domain.PortalDeniedError
	if errors.As(err, &pe) {
		switch pe.Reason {
		case domain.PortalDeniedNotAdmin:
			return "Akun ini bukan admin aplikasi."
		case domain.PortalDeniedAdminOnly:
			return "Akun admin harus masuk melalui portal Admin aplikasi."
		case domain.PortalDeniedOrganizerOnly:
			return "Akun ini adalah penyelenggara event. Masuk melalui portal Penyelenggara event."
		case domain.PortalDeniedApplyAfterLogin:
			return "Masuk sebagai pembeli tiket. Pengajuan sebagai penyelenggara dilakukan setelah Anda masuk."
		}
	}
	return "Jenis akun tidak cocok dengan portal yang dipilih."
}

func writeJSON(w http.ResponseWriter, status int, body any) {
	w.Header().Set("Content-Type", "application/json")
	w.Header().Set("Cache-Control", "private, no-store")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(body)
}

func writeErr(w http.ResponseWriter, r *http.Request, err error) {
	id := logger.CorrelationFrom(r.Context())
	var ve application.ValidationError
	if errors.As(err, &ve) {
		apierrors.WriteFields(w, http.StatusBadRequest, "VALIDATION_ERROR", "Periksa kembali isian formulir.", id, ve.Fields)
		return
	}
	code := err.Error()
	status := http.StatusUnauthorized
	msg := "Tidak dapat menyelesaikan permintaan."
	switch {
	case errors.Is(err, domain.ErrValidation):
		status, msg = http.StatusBadRequest, "Periksa kembali isian formulir."
	case errors.Is(err, domain.ErrInvalidCredentials):
		status, msg = http.StatusUnauthorized, "Username atau kata sandi salah."
	case errors.Is(err, domain.ErrRequired):
		status, msg = http.StatusUnauthorized, "Anda perlu masuk."
	case errors.Is(err, domain.ErrSessionExpired):
		status, msg = http.StatusUnauthorized, "Sesi telah berakhir."
	case errors.Is(err, domain.ErrAccountSuspended):
		status, msg = http.StatusForbidden, "Akun ditangguhkan."
	case errors.Is(err, domain.ErrAccountDisabled):
		status, msg = http.StatusForbidden, "Akun dinonaktifkan."
	case errors.Is(err, domain.ErrAccountLinkRequired):
		status, msg = http.StatusConflict, "Masuk dengan akun lokal untuk menautkan Google."
	case errors.Is(err, domain.ErrOAuthFailed):
		status, msg = http.StatusUnauthorized, "Login Google gagal."
	case errors.Is(err, domain.ErrForbidden):
		status, msg = http.StatusForbidden, "Anda tidak memiliki akses."
	case errors.Is(err, domain.ErrPortalDenied):
		status, msg = http.StatusForbidden, portalDeniedMessage(err)
	case errors.Is(err, domain.ErrCSRFInvalid):
		status, msg = http.StatusForbidden, "Permintaan tidak valid."
	case errors.Is(err, domain.ErrRateLimited):
		status, msg = http.StatusTooManyRequests, "Terlalu banyak percobaan. Coba lagi nanti."
	case errors.Is(err, domain.ErrUsernameExists):
		status, msg = http.StatusConflict, "Username sudah digunakan."
		code = "USERNAME_ALREADY_EXISTS"
	case errors.Is(err, domain.ErrEmailExists):
		status, msg = http.StatusConflict, "Email sudah terdaftar."
		code = "EMAIL_ALREADY_EXISTS"
	case errors.Is(err, domain.ErrUnavailable):
		status, msg = http.StatusServiceUnavailable, "Layanan autentikasi tidak tersedia."
		code = "AUTH_SERVICE_UNAVAILABLE"
	case errors.Is(err, notifydomain.ErrResetRateLimited):
		status, msg = http.StatusTooManyRequests, "Terlalu banyak permintaan pemulihan. Coba lagi nanti."
		code = notifydomain.ErrResetRateLimited.Error()
	case errors.Is(err, notifydomain.ErrResetTokenInvalid):
		status, msg = http.StatusBadRequest, "Tautan pemulihan tidak valid atau sudah tidak berlaku."
		code = notifydomain.ErrResetTokenInvalid.Error()
	case errors.Is(err, notifydomain.ErrResetNotEligible):
		status, msg = http.StatusConflict, "Akun tidak memenuhi syarat pemulihan admin."
		code = notifydomain.ErrResetNotEligible.Error()
	case err.Error() == "AUDIT_WRITE_FAILED":
		status, msg = http.StatusServiceUnavailable, "Pencatatan audit gagal."
		code = "AUDIT_WRITE_FAILED"
	default:
		status, code, msg = http.StatusInternalServerError, apierrors.CodeInternalError, "Terjadi kesalahan internal."
	}
	apierrors.Write(w, status, code, msg, id)
}

func clientIP(r *http.Request) string {
	if xff := r.Header.Get("X-Forwarded-For"); xff != "" {
		return strings.TrimSpace(strings.Split(xff, ",")[0])
	}
	host := r.RemoteAddr
	if i := strings.LastIndex(host, ":"); i > 0 {
		return host[:i]
	}
	return host
}

func readCookie(r *http.Request, name string) string {
	c, err := r.Cookie(name)
	if err != nil {
		return ""
	}
	return c.Value
}

func newToken() string {
	var b [16]byte
	_, _ = rand.Read(b[:])
	return base64.RawURLEncoding.EncodeToString(b[:])
}
