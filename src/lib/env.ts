/**
 * Environment access. Read lazily, per request: reading at module load would
 * break `next build`, which imports every module without any of these set.
 */

export function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(
      `Missing environment variable ${name}. See interim-billing/.env.example.`,
    );
  }
  return value;
}

export type Company = {
  name: string;
  address: string;
  phone: string;
  email: string;
};

/**
 * The letterhead. Nothing about the company is hard-coded, so this app can
 * serve any dyeing trader, not only the first one.
 */
export function company(): Company {
  return {
    name: process.env.COMPANY_NAME ?? 'Company Name Not Set',
    address: process.env.COMPANY_ADDRESS ?? '',
    phone: process.env.COMPANY_PHONE ?? '',
    email: process.env.COMPANY_EMAIL ?? '',
  };
}
