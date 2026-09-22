export type UserRole = "USER" | "ADMIN";

export type AppUser = {
  id: string;
  name: string;
  username: string;
  email: string;
  passwordHash: string | null;
  role: string;
  googleId: string | null;
  createdAt: string | Date;
};

export type PgUserRow = {
  id: string;
  name: string;
  username: string;
  email: string;
  password_hash: string | null;
  role: string;
  google_id: string | null;
  created_at: string | Date;
};

export type CreateUserInput = {
  username: string;
  email: string;
  name: string;
  password: string;
  role?: string;
};

export type GoogleUserInput = {
  email?: string | null;
  name?: string | null;
  googleId: string;
};
