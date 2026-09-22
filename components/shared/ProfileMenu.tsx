"use client";

import { useEffect, useId, useRef, useState } from "react";
import Link from "next/link";
import { Icon } from "@/components/ui/Icon";
import { roleLabel, type AccountProfile } from "@/lib/account";

export function ProfileMenu({ appearance = "nav" }: { appearance?: "nav" | "chip" }) {
  const [open, setOpen] = useState(false);
  const [profile, setProfile] = useState<AccountProfile | null>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const panelId = useId();

  useEffect(() => {
    fetch("/api/me", { credentials: "include", cache: "no-store" })
      .then(async (res) => {
        if (!res.ok) {
          return;
        }
        const body = (await res.json()) as { data?: AccountProfile };
        if (body.data) {
          setProfile(body.data);
        }
      })
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    function onDoc(event: MouseEvent) {
      if (!wrapRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    }
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, []);

  function cancelClose() {
    if (closeTimer.current) {
      window.clearTimeout(closeTimer.current);
      closeTimer.current = undefined;
    }
  }

  function scheduleClose() {
    cancelClose();
      closeTimer.current = setTimeout(() => setOpen(false), 160);
  }

  const label = profile ? roleLabel(profile) : "Memuat…";

  return (
    <div
      ref={wrapRef}
      className={appearance === "chip" ? "relative shrink-0" : "relative w-full md:w-auto"}
      onMouseEnter={() => {
        cancelClose();
        setOpen(true);
      }}
      onMouseLeave={scheduleClose}
    >
      <button
        type="button"
        className={
          appearance === "chip"
            ? "inline-flex min-h-11 max-w-full items-center gap-2 rounded-full bg-white px-2 py-1.5 text-sm font-medium text-ink hover:bg-stone-50"
            : "inline-flex min-h-11 w-full items-center gap-2 rounded-full px-3 py-2 text-sm font-medium text-ink/80 hover:bg-white md:w-auto"
        }
        aria-expanded={open}
        aria-haspopup="dialog"
        aria-controls={panelId}
        onClick={() => {
          cancelClose();
          setOpen((cur) => !cur);
        }}
      >
        {appearance === "chip" ? (
          <>
            <span className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gold-500 text-xs font-semibold text-white" aria-hidden="true">
              {(profile?.name || profile?.username || "?").slice(0, 1).toUpperCase()}
            </span>
            <span className="hidden max-w-[9rem] truncate sm:inline">{profile?.name || profile?.username || "Profil"}</span>
            <Icon name="chevron" className="hidden h-4 w-4 shrink-0 text-ink/40 sm:block" />
          </>
        ) : (
          <>
            <Icon name="user" className="h-4 w-4 shrink-0" />
            Profil
          </>
        )}
      </button>
      {open ? (
        <div
          id={panelId}
          role="dialog"
          aria-label="Profil akun"
          className="absolute left-0 right-0 z-50 mt-2 w-full rounded-2xl border border-stone-200 bg-white p-4 shadow-card md:left-auto md:right-0 md:w-72"
        >
          {profile ? (
            <>
              <p className="text-xs font-medium uppercase tracking-[0.18em] text-gold-700">Akun masuk</p>
              <dl className="mt-3 space-y-2 text-sm">
                <div>
                  <dt className="text-ink/45">Username</dt>
                  <dd className="font-medium text-ink">{profile.username}</dd>
                </div>
                <div>
                  <dt className="text-ink/45">Email</dt>
                  <dd className="break-all text-ink">{profile.email}</dd>
                </div>
                <div>
                  <dt className="text-ink/45">Peran</dt>
                  <dd className="text-ink">{label}</dd>
                </div>
              </dl>
              <Link
                href="/dashboard/profile"
                className="mt-4 inline-flex min-h-11 w-full items-center justify-center rounded-full bg-gold-500 px-4 py-2 text-sm font-semibold text-white"
                onClick={() => setOpen(false)}
              >
                Edit
              </Link>
            </>
          ) : (
            <p role="status" className="text-sm text-ink/65">
              Memuat profil…
            </p>
          )}
        </div>
      ) : null}
    </div>
  );
}
