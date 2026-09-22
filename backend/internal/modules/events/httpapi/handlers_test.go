package httpapi

import (
	"bytes"
	"context"
	"encoding/json"
	"io"
	"log/slog"
	"mime/multipart"
	"net/http"
	"net/http/httptest"
	"strconv"
	"strings"
	"testing"
	"time"

	"github.com/go-chi/chi/v5"

	authapp "myticketin/internal/modules/auth/application"
	authhttp "myticketin/internal/modules/auth/httpapi"
	eventapp "myticketin/internal/modules/events/application"
	orgapp "myticketin/internal/modules/organizers/application"
	orghttp "myticketin/internal/modules/organizers/httpapi"
	"myticketin/internal/platform/env"
	"myticketin/internal/platform/httpx"
)

func testHandler(t *testing.T) (http.Handler, *authapp.Memory) {
	t.Helper()
	users := authapp.NewMemory()
	h := authapp.StaticHasher{
		HashFn:    func(p string) (string, error) { return "h:" + p, nil },
		CompareFn: func(hash, password string) bool { return hash == "h:"+password },
	}
	orgMem := orgapp.NewMemory()
	authSvc := authapp.NewService(users, users, users, h)
	authSvc.Organizers = orgapp.StatusLookup{Store: orgMem}
	orgSvc := orgapp.NewService(orgMem)
	evSvc := eventapp.NewService(eventapp.NewMemory(), orgSvc)
	evSvc.AI = eventapp.DisabledAI{}
	evSvc.Users = users
	evSvc.GalleryDir = t.TempDir()
	authAPI := authhttp.API{Cfg: env.Config{AppEnv: "test", WebOrigin: "http://localhost:3000", SessionSecret: "test-session-secret-32-chars-long"}, Svc: authSvc}
	orgAPI := orghttp.API{Auth: authAPI, Svc: orgSvc, Secret: "test-session-secret-32-chars-long"}
	api := API{Auth: authAPI, Svc: evSvc, Secret: "test-session-secret-32-chars-long"}
	handler := httpx.NewRouter(authAPI.Cfg, slog.New(slog.NewTextHandler(io.Discard, nil)), nil, func(r chi.Router) {
		authAPI.Mount(r)
		orgAPI.Mount(r)
		api.Mount(r)
	})
	return handler, users
}

func csrf(t *testing.T, h http.Handler) (string, []*http.Cookie) {
	t.Helper()
	req := httptest.NewRequest(http.MethodGet, "/api/auth/csrf", nil)
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, req)
	var body map[string]string
	_ = json.Unmarshal(rec.Body.Bytes(), &body)
	return body["csrfToken"], rec.Result().Cookies()
}

func withCookies(req *http.Request, cookies []*http.Cookie) {
	for _, c := range cookies {
		req.AddCookie(c)
	}
}

func csrfFrom(cookies []*http.Cookie) string {
	for _, c := range cookies {
		if c.Name == "mti_csrf" {
			return c.Value
		}
	}
	return ""
}

func registerLogin(t *testing.T, h http.Handler, username, email string) []*http.Cookie {
	t.Helper()
	token, cookies := csrf(t, h)
	req := httptest.NewRequest(http.MethodPost, "/api/register", strings.NewReader(`{"name":"Nama User","username":"`+username+`","email":"`+email+`","password":"password12","confirmPassword":"password12"}`))
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("X-CSRF-Token", token)
	withCookies(req, cookies)
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, req)
	if rec.Code != http.StatusCreated {
		t.Fatalf("register %d %s", rec.Code, rec.Body.String())
	}
	token, cookies = csrf(t, h)
	req = httptest.NewRequest(http.MethodPost, "/api/auth/login", strings.NewReader(`{"username":"`+username+`","password":"password12"}`))
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("X-CSRF-Token", token)
	withCookies(req, cookies)
	rec = httptest.NewRecorder()
	h.ServeHTTP(rec, req)
	if rec.Code != http.StatusOK {
		t.Fatalf("login %d %s", rec.Code, rec.Body.String())
	}
	return rec.Result().Cookies()
}

func jsonGet(m map[string]any, keys ...string) any {
	cur := any(m)
	for _, k := range keys {
		obj, ok := cur.(map[string]any)
		if !ok {
			return nil
		}
		cur = obj[k]
	}
	return cur
}

func doJSON(t *testing.T, h http.Handler, cookies []*http.Cookie, method, path, body string) *httptest.ResponseRecorder {
	t.Helper()
	req := httptest.NewRequest(method, path, strings.NewReader(body))
	if body != "" {
		req.Header.Set("Content-Type", "application/json")
	}
	if method != http.MethodGet {
		req.Header.Set("X-CSRF-Token", csrfFrom(cookies))
	}
	withCookies(req, cookies)
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, req)
	return rec
}

func applyAndApprove(t *testing.T, h http.Handler, mem *authapp.Memory, ownerCookies []*http.Cookie, ownerUsername string) {
	t.Helper()
	rec := doJSON(t, h, ownerCookies, http.MethodPost, "/api/organizer/applications", `{"name":"Organizer Satu","contactEmail":"org@example.test","description":"Deskripsi organizer yang cukup panjang."}`)
	if rec.Code != http.StatusCreated {
		t.Fatalf("apply %d %s", rec.Code, rec.Body.String())
	}
	var created map[string]any
	_ = json.Unmarshal(rec.Body.Bytes(), &created)
	id, _ := jsonGet(created, "data", "id").(string)
	ver := int(jsonGet(created, "data", "version").(float64))
	adminName := "adm" + ownerUsername
	admin := registerLogin(t, h, adminName, adminName+"@example.test")
	u, err := mem.GetByUsernameOrEmail(context.Background(), adminName)
	if err != nil {
		t.Fatal(err)
	}
	mem.PromoteAdmin(u.ID)
	body, _ := json.Marshal(map[string]any{"decision": "APPROVE", "reason": "Data organizer lengkap.", "expectedVersion": ver})
	dec := doJSON(t, h, admin, http.MethodPost, "/api/admin/organizer-applications/"+id+"/decisions", string(body))
	if dec.Code != http.StatusOK {
		t.Fatalf("approve %d %s", dec.Code, dec.Body.String())
	}
}

func eventBody() string {
	start := time.Now().UTC().Add(72 * time.Hour).Truncate(time.Second).Format(time.RFC3339)
	end := time.Now().UTC().Add(76 * time.Hour).Truncate(time.Second).Format(time.RFC3339)
	return `{"title":"Konser Kota Tua","description":"Deskripsi event tatap muka yang cukup panjang.","category":"Musik","venueName":"Gedung Kesenian","addressLine":"Jl Veteran 1","city":"Jakarta","province":"DKI Jakarta","latitude":-6.1665,"longitude":106.8271,"tags":["jakarta-events","musik"],"timezone":"Asia/Jakarta","startsAt":"` + start + `","endsAt":"` + end + `","terms":"Tiket tidak dapat diuangkan.","contactEmail":"org@example.test","inventoryMode":"GENERAL_ADMISSION"}`
}

func TestUnapprovedCannotCreateEvent(t *testing.T) {
	h, _ := testHandler(t)
	cookies := registerLogin(t, h, "namauser", "nama@example.test")
	rec := doJSON(t, h, cookies, http.MethodPost, "/api/organizer/events", eventBody())
	if rec.Code != http.StatusForbidden {
		t.Fatalf("expected 403 got %d %s", rec.Code, rec.Body.String())
	}
}

func TestApprovedCreatesListAndCrossTenantHidden(t *testing.T) {
	h, mem := testHandler(t)
	a := registerLogin(t, h, "userone", "one@example.test")
	applyAndApprove(t, h, mem, a, "userone")
	rec := doJSON(t, h, a, http.MethodPost, "/api/organizer/events", eventBody())
	if rec.Code != http.StatusCreated {
		t.Fatalf("create %d %s", rec.Code, rec.Body.String())
	}
	var created map[string]any
	_ = json.Unmarshal(rec.Body.Bytes(), &created)
	id, _ := jsonGet(created, "data", "event", "id").(string)
	if id == "" {
		t.Fatal("missing id")
	}
	list := doJSON(t, h, a, http.MethodGet, "/api/organizer/events", "")
	if list.Code != http.StatusOK {
		t.Fatalf("list %d %s", list.Code, list.Body.String())
	}
	img := doJSON(t, h, a, http.MethodPost, "/api/organizer/events/"+id+"/images/upload-intents", `{"fileName":"a.png","mimeType":"image/png","byteSize":12,"altText":"Poster event"}`)
	if img.Code != http.StatusServiceUnavailable || !strings.Contains(img.Body.String(), "STORAGE_NOT_CONFIGURED") {
		t.Fatalf("storage %d %s", img.Code, img.Body.String())
	}

	b := registerLogin(t, h, "usertwo", "two@example.test")
	applyAndApprove(t, h, mem, b, "usertwo")
	hidden := doJSON(t, h, b, http.MethodGet, "/api/organizer/events/"+id, "")
	if hidden.Code != http.StatusNotFound {
		t.Fatalf("cross tenant %d %s", hidden.Code, hidden.Body.String())
	}
}

func TestSubmitRequiresTicketThenLocks(t *testing.T) {
	h, mem := testHandler(t)
	a := registerLogin(t, h, "userone", "one@example.test")
	applyAndApprove(t, h, mem, a, "userone")
	rec := doJSON(t, h, a, http.MethodPost, "/api/organizer/events", eventBody())
	if rec.Code != http.StatusCreated {
		t.Fatalf("create %d %s", rec.Code, rec.Body.String())
	}
	var created map[string]any
	_ = json.Unmarshal(rec.Body.Bytes(), &created)
	id, _ := jsonGet(created, "data", "event", "id").(string)
	ver := int(jsonGet(created, "data", "event", "version").(float64))
	sub := doJSON(t, h, a, http.MethodPost, "/api/organizer/events/"+id+"/submit", `{"expectedVersion":`+strconv.Itoa(ver)+`}`)
	if sub.Code != http.StatusBadRequest || !strings.Contains(sub.Body.String(), "TICKET_TYPE_REQUIRED") {
		t.Fatalf("submit empty %d %s", sub.Code, sub.Body.String())
	}
	start := time.Now().UTC().Add(24 * time.Hour).Truncate(time.Second).Format(time.RFC3339)
	end := time.Now().UTC().Add(48 * time.Hour).Truncate(time.Second).Format(time.RFC3339)
	ticket := doJSON(t, h, a, http.MethodPost, "/api/organizer/events/"+id+"/ticket-types", `{"name":"Reguler","priceRupiah":150000,"quota":50,"maxPerAccount":2,"saleStartsAt":"`+start+`","saleEndsAt":"`+end+`","sortOrder":0}`)
	if ticket.Code != http.StatusCreated {
		t.Fatalf("ticket %d %s", ticket.Code, ticket.Body.String())
	}
	detail := doJSON(t, h, a, http.MethodGet, "/api/organizer/events/"+id, "")
	var got map[string]any
	_ = json.Unmarshal(detail.Body.Bytes(), &got)
	ver = int(jsonGet(got, "data", "event", "version").(float64))
	sub = doJSON(t, h, a, http.MethodPost, "/api/organizer/events/"+id+"/submit", `{"expectedVersion":`+strconv.Itoa(ver)+`}`)
	if sub.Code != http.StatusOK || !strings.Contains(sub.Body.String(), "PENDING_REVIEW") {
		t.Fatalf("submit %d %s", sub.Code, sub.Body.String())
	}
	del := doJSON(t, h, a, http.MethodDelete, "/api/organizer/events/"+id, `{"expectedVersion":`+strconv.Itoa(ver+1)+`}`)
	if del.Code != http.StatusConflict {
		t.Fatalf("pending delete %d %s", del.Code, del.Body.String())
	}

	denied := doJSON(t, h, a, http.MethodGet, "/api/admin/events", "")
	if denied.Code != http.StatusForbidden {
		t.Fatalf("user admin list %d %s", denied.Code, denied.Body.String())
	}
	adminCookies := registerLogin(t, h, "eventadm", "eventadm@example.test")
	u, err := mem.GetByUsernameOrEmail(context.Background(), "eventadm")
	if err != nil {
		t.Fatal(err)
	}
	mem.PromoteAdmin(u.ID)
	queue := doJSON(t, h, adminCookies, http.MethodGet, "/api/admin/events?status=PENDING_REVIEW", "")
	if queue.Code != http.StatusOK || !strings.Contains(queue.Body.String(), id) {
		t.Fatalf("queue %d %s", queue.Code, queue.Body.String())
	}
	rej := doJSON(t, h, adminCookies, http.MethodPost, "/api/admin/events/"+id+"/decisions", `{"decision":"REJECT","reason":"x","expectedVersion":`+strconv.Itoa(ver+1)+`}`)
	if rej.Code != http.StatusBadRequest {
		t.Fatalf("short reject %d %s", rej.Code, rej.Body.String())
	}
	ok := doJSON(t, h, adminCookies, http.MethodPost, "/api/admin/events/"+id+"/decisions", `{"decision":"APPROVE","reason":"","expectedVersion":`+strconv.Itoa(ver+1)+`}`)
	if ok.Code != http.StatusOK || !strings.Contains(ok.Body.String(), "PUBLISHED") {
		t.Fatalf("approve %d %s", ok.Code, ok.Body.String())
	}
}

func TestGalleryUploadAndServe(t *testing.T) {
	h, mem := testHandler(t)
	a := registerLogin(t, h, "userone", "one@example.test")
	applyAndApprove(t, h, mem, a, "userone")
	png := []byte{0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A, 0, 0, 0, 0, 1, 2, 3, 4}
	var buf bytes.Buffer
	w := multipart.NewWriter(&buf)
	part, err := w.CreateFormFile("image", "poster.png")
	if err != nil {
		t.Fatal(err)
	}
	if _, err := part.Write(png); err != nil {
		t.Fatal(err)
	}
	if err := w.Close(); err != nil {
		t.Fatal(err)
	}
	req := httptest.NewRequest(http.MethodPost, "/api/organizer/gallery-images", &buf)
	req.Header.Set("Content-Type", w.FormDataContentType())
	req.Header.Set("X-CSRF-Token", csrfFrom(a))
	withCookies(req, a)
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, req)
	if rec.Code != http.StatusCreated {
		t.Fatalf("upload %d %s", rec.Code, rec.Body.String())
	}
	var body map[string]any
	_ = json.Unmarshal(rec.Body.Bytes(), &body)
	url, _ := jsonGet(body, "data", "url").(string)
	if !strings.HasPrefix(url, "/uploads/gallery/") || !strings.HasSuffix(url, ".png") {
		t.Fatalf("url %s", url)
	}
	get := httptest.NewRequest(http.MethodGet, url, nil)
	out := httptest.NewRecorder()
	h.ServeHTTP(out, get)
	if out.Code != http.StatusOK || !bytes.Equal(out.Body.Bytes(), png) {
		t.Fatalf("serve %d len=%d", out.Code, out.Body.Len())
	}
}

