package main

import (
	"context"
	"log/slog"
	"net/http"
	"os"
	"time"

	"github.com/go-chi/chi/v5"

	analyticsapp "myticketin/internal/modules/analytics/application"
	analyticshttp "myticketin/internal/modules/analytics/httpapi"
	analyticsinfra "myticketin/internal/modules/analytics/infrastructure"
	auditapp "myticketin/internal/modules/audit/application"
	audithttp "myticketin/internal/modules/audit/httpapi"
	auditinfra "myticketin/internal/modules/audit/infrastructure"
	"myticketin/internal/modules/auth/application"
	authdomain "myticketin/internal/modules/auth/domain"
	"myticketin/internal/modules/auth/httpapi"
	"myticketin/internal/modules/auth/infrastructure"
	checkinapp "myticketin/internal/modules/checkin/application"
	checkinhttp "myticketin/internal/modules/checkin/httpapi"
	checkininfra "myticketin/internal/modules/checkin/infrastructure"
	eventapp "myticketin/internal/modules/events/application"
	eventhttp "myticketin/internal/modules/events/httpapi"
	eventinfra "myticketin/internal/modules/events/infrastructure"
	notifyapp "myticketin/internal/modules/notifications/application"
	notifyhttp "myticketin/internal/modules/notifications/httpapi"
	notifyinfra "myticketin/internal/modules/notifications/infrastructure"
	orderapp "myticketin/internal/modules/orders/application"
	orderhttp "myticketin/internal/modules/orders/httpapi"
	orderinfra "myticketin/internal/modules/orders/infrastructure"
	orgapp "myticketin/internal/modules/organizers/application"
	orghttp "myticketin/internal/modules/organizers/httpapi"
	orginfra "myticketin/internal/modules/organizers/infrastructure"
	payapp "myticketin/internal/modules/payments/application"
	payhttp "myticketin/internal/modules/payments/httpapi"
	payinfra "myticketin/internal/modules/payments/infrastructure"
	reportapp "myticketin/internal/modules/reporting/application"
	reporthttp "myticketin/internal/modules/reporting/httpapi"
	reportinfra "myticketin/internal/modules/reporting/infrastructure"
	ticketapp "myticketin/internal/modules/tickets/application"
	ticketdomain "myticketin/internal/modules/tickets/domain"
	tickethhttp "myticketin/internal/modules/tickets/httpapi"
	ticketinfra "myticketin/internal/modules/tickets/infrastructure"
	"myticketin/internal/platform/db"
	"myticketin/internal/platform/env"
	"myticketin/internal/platform/httpx"
	"myticketin/internal/platform/logger"
	"myticketin/internal/platform/opshttp"
)

func main() {
	cfg, err := env.Load()
	if err != nil {
		slog.Error("config invalid", "err", err.Error())
		os.Exit(1)
	}
	log := logger.New("myticketin-api", cfg.AppEnv)

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	pool, err := db.Open(ctx, cfg.DatabaseURL)
	var pinger httpx.Pinger
	var mount func(chi.Router)
	if err != nil {
		log.Error("database unavailable at startup", "err", "DATABASE_UNAVAILABLE")
	} else {
		defer pool.Close()
		pinger = pool
		store := infrastructure.NewStore(pool)
		auditStore := auditinfra.NewStore(pool)
		analyticsStore := analyticsinfra.NewStore(pool)
		writer := &auditapp.Writer{Store: auditStore, Log: log}
		emitter := &analyticsapp.Emitter{Store: analyticsStore, Log: log, Metrics: &analyticsapp.Metrics{}}
		cost := 12
		if cfg.AppEnv == "test" {
			cost = 4
		}
		svc := application.NewService(store, store, store, application.NewBcryptHasher(cost))
		svc.UoW = pool.InTx
		svc.Audit = writer
		svc.Analytics = emitter
		svc.RelaxedLimits = cfg.AppEnv == "development"
		orgStore := orginfra.NewStore(pool)
		svc.Organizers = orgapp.StatusLookup{Store: orgStore}
		orgSvc := orgapp.NewService(orgStore)
		orgSvc.UoW = pool.InTx
		orgSvc.Audit = writer
		orgSvc.Analytics = emitter
		orgSvc.Rates = store
		orgSvc.HashKey = application.TokenHash
		authAPI := httpapi.API{Cfg: cfg, Svc: svc, HTTP: &http.Client{Timeout: 10 * time.Second}}
		auditAPI := audithttp.API{Auth: authAPI, Query: &auditapp.QueryService{Store: auditStore, Secret: cfg.SessionSecret}}
		analAPI := analyticshttp.API{Auth: authAPI, Emit: emitter, Rates: store}
		organizerAPI := orghttp.API{Auth: authAPI, Svc: orgSvc, Audit: auditStore, Secret: cfg.SessionSecret}
		evStore := eventinfra.NewStore(pool)
		evSvc := eventapp.NewService(evStore, orgSvc)
		evSvc.RelaxedLimits = cfg.AppEnv == "development"
		evSvc.UoW = pool.InTx
		evSvc.Audit = writer
		evSvc.Analytics = emitter
		evSvc.Rates = store
		evSvc.HashKey = application.TokenHash
		evSvc.AI = eventapp.DisabledAI{}
		evSvc.Users = store
		evSvc.GalleryDir = "var/uploads/gallery"
		evSvc.Profiles = orgStore
		orderStore := orderinfra.NewStore(pool)
		orderSvc := orderapp.NewService(orderStore)
		orderSvc.UoW = pool.InSerializableTx
		orderSvc.Audit = writer
		orderSvc.Analytics = emitter
		orderSvc.Rates = store
		orderSvc.HashKey = application.TokenHash
		orderSvc.Profiles = orgStore
		orderSvc.BuyerGate = func(ctx context.Context, actor authdomain.User) error {
			if !svc.AccessFor(ctx, actor).CanBuy {
				return authdomain.ErrForbidden
			}
			return nil
		}
		keys, err := ticketdomain.ParseKeys(cfg.QREncryptionKeys, cfg.QRActiveKeyVersion)
		if err != nil {
			log.Error("qr keys invalid", "err", err.Error())
			os.Exit(1)
		}
		ticketStore := ticketinfra.NewStore(pool)
		ticketSvc := ticketapp.NewService(ticketStore, ticketdomain.Crypto{
			Pepper: cfg.QRTokenPepper, ActiveVersion: cfg.QRActiveKeyVersion, Keys: keys,
		}, ticketinfra.QRRenderer{})
		ticketSvc.UoW = pool.InSerializableTx
		ticketSvc.Audit = writer
		ticketSvc.Analytics = emitter
		ticketSvc.Rates = store
		ticketSvc.HashKey = application.TokenHash
		orderSvc.Issuer = ticketSvc
		orderSvc.Tickets = ticketSvc
		evSvc.Holds = orderStore
		evSvc.PendingOrders = orderSvc
		evSvc.Tickets = ticketSvc
		payStore := payinfra.NewStore(pool)
		paySvc := payapp.NewService(payStore, orderSvc, payinfra.HMACSandbox{Secret: cfg.PaymentWebhookSecret})
		paySvc.UoW = pool.InSerializableTx
		paySvc.Audit = writer
		paySvc.Rates = store
		paySvc.HashKey = application.TokenHash
		paySvc.AllowDev = cfg.AppEnv == "development" || cfg.AppEnv == "test"
		paySvc.AppEnv = cfg.AppEnv
		paySvc.Guard = ticketSvc
		eventAPI := eventhttp.API{Auth: authAPI, Svc: evSvc, Audit: auditStore, Secret: cfg.SessionSecret}
		orderAPI := orderhttp.API{Auth: authAPI, Svc: orderSvc, SchedulerSecret: cfg.SchedulerSecret}
		payAPI := payhttp.API{Auth: authAPI, Svc: paySvc}
		ticketAPI := tickethhttp.API{Auth: authAPI, Svc: ticketSvc, SchedulerSecret: cfg.SchedulerSecret}
		checkinStore := checkininfra.NewStore(pool)
		checkinSvc := checkinapp.NewService(checkinStore, cfg.QRTokenPepper, cfg.CheckinFingerprintKey)
		checkinSvc.UoW = pool.InTx
		checkinSvc.Audit = writer
		checkinSvc.Analytics = emitter
		checkinSvc.Rates = store
		checkinSvc.HashKey = application.TokenHash
		checkinAPI := checkinhttp.API{Auth: authAPI, Svc: checkinSvc}
		reportStore := reportinfra.NewStore(pool)
		reportSvc := reportapp.NewService(reportStore, cfg.SessionSecret)
		reportSvc.UoW = pool.InRepeatableReadTx
		reportSvc.Audit = writer
		reportSvc.Rates = store
		reportSvc.HashKey = application.TokenHash
		reportSvc.EnableTrend = cfg.EnableSalesTrend
		reportSvc.EnableSearch = cfg.EnableAdminSearch
		reportAPI := reporthttp.API{Auth: authAPI, Svc: reportSvc}
		notifyStore := notifyinfra.NewStore(pool)
		mailer := &notifyapp.SandboxMailer{}
		notifySvc := notifyapp.NewService(notifyStore, mailer, cfg.SessionSecret)
		notifySvc.Rates = store
		notifySvc.HashKey = application.TokenHash
		svc.Resets = store
		svc.Mail = mailer
		svc.Notify = notifySvc
		orgSvc.Notify = notifySvc
		evSvc.Notify = notifySvc
		paySvc.Notify = notifySvc
		ticketSvc.Notify = notifySvc
		notifyAPI := notifyhttp.API{Auth: authAPI, Svc: notifySvc, SchedulerSecret: cfg.SchedulerSecret}
		opsAPI := opshttp.API{Auth: authAPI, Cfg: cfg, Pool: pool.Raw(), Pay: paySvc}
		mount = func(r chi.Router) {
			authAPI.Mount(r)
			auditAPI.Mount(r)
			analAPI.Mount(r)
			organizerAPI.Mount(r)
			eventAPI.Mount(r)
			orderAPI.Mount(r)
			payAPI.Mount(r)
			ticketAPI.Mount(r)
			checkinAPI.Mount(r)
			reportAPI.Mount(r)
			notifyAPI.Mount(r)
			opsAPI.Mount(r)
		}
	}

	srv := &http.Server{
		Addr:              cfg.APIAddr,
		Handler:           httpx.NewRouter(cfg, log, pinger, mount),
		ReadHeaderTimeout: 5 * time.Second,
	}
	log.Info("api listening", "addr", cfg.APIAddr, "env", cfg.AppEnv)
	if err := srv.ListenAndServe(); err != nil && err != http.ErrServerClosed {
		log.Error("listen failed")
		os.Exit(1)
	}
}
