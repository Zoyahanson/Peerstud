import { publicFetch } from "./api";

export type SchoolEmailPolicy = {
  allowed_domains: string[];
  requires_verified_email: boolean;
};

export function getConfiguredSchoolDomains(): string[] {
  const raw = process.env.NEXT_PUBLIC_ALLOWED_SCHOOL_EMAIL_DOMAINS ?? "";
  return raw
    .split(",")
    .map((domain) => domain.trim().toLowerCase())
    .filter(Boolean);
}

export function isAllowedSchoolEmail(email: string, allowedDomains: string[]): boolean {
  if (!allowedDomains.length) {
    return true;
  }
  const domain = email.trim().toLowerCase().split("@")[1] ?? "";
  return allowedDomains.includes(domain);
}

export function formatAllowedDomains(allowedDomains: string[]): string {
  if (!allowedDomains.length) {
    return "your configured school email domain";
  }
  return allowedDomains.join(", ");
}

export async function loadSchoolEmailPolicy(): Promise<SchoolEmailPolicy> {
  try {
    return await publicFetch<SchoolEmailPolicy>("/users/auth-policy");
  } catch {
    return {
      allowed_domains: getConfiguredSchoolDomains(),
      requires_verified_email: true,
    };
  }
}