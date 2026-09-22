type IconName =
  | "search"
  | "pin"
  | "calendar"
  | "catalog"
  | "dashboard"
  | "ticket"
  | "login"
  | "userPlus"
  | "bell"
  | "logout"
  | "devices"
  | "clock"
  | "mail"
  | "phone"
  | "user"
  | "shield"
  | "building"
  | "orders"
  | "file"
  | "info"
  | "success"
  | "error"
  | "arrow"
  | "chevron"
  | "menu"
  | "close"
  | "chart"
  | "google";

const paths: Record<IconName, string> = {
  search:
    "M11 19a8 8 0 1 1 0-16 8 8 0 0 1 0 16Zm7.3.7-3.5-3.5",
  pin: "M12 21s7-5.4 7-11a7 7 0 1 0-14 0c0 5.6 7 11 7 11Zm0-8.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5Z",
  calendar:
    "M7 4v3M17 4v3M5 9h14M6 6h12a2 2 0 0 1 2 2v11a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2Z",
  catalog:
    "M5 6.5A1.5 1.5 0 0 1 6.5 5H19a1 1 0 0 1 1 1v13.5a1.5 1.5 0 0 1-1.5 1.5h-12A2 2 0 0 1 4 18V8M8 9h8M8 13h5",
  dashboard:
    "M4 5h7v7H4V5Zm9 0h7v4h-7V5ZM4 14h7v6H4v-6Zm9 6v-8h7v8h-7Z",
  ticket:
    "M4 9a2 2 0 0 0 0 6v3h16v-3a2 2 0 0 0 0-6V6H4v3Zm6-1v2M10 14v2",
  login: "M10 17l5-5-5-5M15 12H4M14 4h5v16h-5",
  userPlus:
    "M15 19a6 6 0 0 0-12 0M9 12a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7ZM19 8v6M16 11h6",
  bell: "M15 18a3 3 0 0 1-6 0M6 10a6 6 0 1 1 12 0c0 4 1.5 5.5 1.5 5.5H4.5S6 14 6 10Z",
  logout: "M10 17l-5-5 5-5M5 12h11M14 4h5v16h-5",
  devices:
    "M4 7h10v10H4V7Zm12 3h4v7h-4v-7ZM8 20h8",
  clock: "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Zm0-9V7m0 5 3.5 2.5",
  mail: "M4 7h16v10H4V7Zm0 0 8 6 8-6",
  phone:
    "M7 3h3l1.5 4-2 1.5a12 12 0 0 0 6 6L17 13l4 1.5V18a2 2 0 0 1-2 2C9.5 20 4 14.5 4 7a2 2 0 0 1 2-2Z",
  user: "M18 20a6 6 0 0 0-12 0M12 12a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7Z",
  shield: "M12 3 5 6v6c0 5 3.2 7.8 7 9 3.8-1.2 7-4 7-9V6l-7-3Z",
  building:
    "M4 20V7l8-4 8 4v13M9 20v-5h6v5M8 9h.01M12 9h.01M16 9h.01M8 13h.01M12 13h.01M16 13h.01",
  orders:
    "M7 7h13l-1.5 9H8L6 4H3M9 20a1 1 0 1 0 0-2 1 1 0 0 0 0 2Zm9 0a1 1 0 1 0 0-2 1 1 0 0 0 0 2Z",
  file: "M7 3h7l5 5v13H7V3Zm7 0v5h5",
  info: "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Zm0-9v4m0-7h.01",
  success: "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Zm-4-9 3 3 6-6",
  error: "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Zm0-5v.01M12 8v5",
  arrow: "M5 12h14M13 6l6 6-6 6",
  chevron: "M6 9l6 6 6-6",
  menu: "M4 7h16M4 12h16M4 17h16",
  close: "M6 6l12 12M18 6 6 18",
  chart: "M4 19V5M4 19h16M7 14l4-5 3 3 6-8",
  google: "",
};

export function Icon({
  name,
  className = "h-4 w-4",
}: {
  name: IconName;
  className?: string;
}) {
  if (name === "google") {
    return (
      <svg viewBox="0 0 24 24" className={className} aria-hidden="true">
        <path
          fill="#4285F4"
          d="M22.5 12.3c0-.8-.1-1.6-.2-2.3H12v4.4h5.9c-.3 1.4-1.1 2.6-2.3 3.4v2.8h3.7c2.2-2 3.2-5 3.2-8.3Z"
        />
        <path
          fill="#34A853"
          d="M12 23c3 0 5.5-1 7.3-2.7l-3.7-2.8c-1 .7-2.3 1.1-3.6 1.1-2.8 0-5.2-1.9-6-4.4H2.2v2.9C4 20.5 7.7 23 12 23Z"
        />
        <path
          fill="#FBBC05"
          d="M6 14.2A6.9 6.9 0 0 1 5.6 12c0-.8.1-1.5.4-2.2V6.9H2.2A11 11 0 0 0 1 12c0 1.8.4 3.4 1.2 5.1L6 14.2Z"
        />
        <path
          fill="#EA4335"
          d="M12 5.4c1.6 0 3.1.6 4.2 1.6l3.1-3.1C17.5 2 14.9 1 12 1 7.7 1 4 3.5 2.2 6.9L6 9.8c.8-2.5 3.2-4.4 6-4.4Z"
        />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
      <path d={paths[name]} stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export type { IconName };
