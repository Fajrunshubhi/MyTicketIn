export type AccountAccess = {
  kind: string;
  isAdmin: boolean;
  canBuy: boolean;
  canOrganize: boolean;
  canApplyOrganizer: boolean;
  organizerStatus: string | null;
};

export type AccountProfile = {
  id: string;
  name: string;
  username: string;
  email: string;
  role: string;
  access?: AccountAccess;
};

export function roleLabel(me: AccountProfile): string {
  if (me.access?.isAdmin || me.role === "ADMIN") return "Admin aplikasi";
  if (me.access?.canOrganize) return "Penyelenggara event";
  if (me.access?.organizerStatus) return "Calon penyelenggara";
  return "Pembeli tiket";
}
