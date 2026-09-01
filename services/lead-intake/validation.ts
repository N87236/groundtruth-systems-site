export interface LeadInput {
  readonly name: string;
  readonly company?: string;
  readonly email: string;
  readonly phone?: string;
  readonly location?: string;
  readonly serviceInterest?: string;
  readonly projectDescription: string;
  readonly preferredContactMethod?: 'EMAIL' | 'PHONE';
  readonly sourcePage?: string;
  readonly referrer?: string;
  readonly website?: string;
}

export interface ValidatedLead extends Omit<LeadInput, 'website'> {}

const limits = {
  name: 120,
  company: 160,
  email: 254,
  phone: 40,
  location: 200,
  serviceInterest: 120,
  projectDescription: 4000,
  sourcePage: 500,
  referrer: 1000,
} as const;

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function optionalString(
  value: unknown,
  field: keyof typeof limits,
  errors: string[],
): string | undefined {
  if (value === undefined || value === null || value === '') return undefined;
  if (typeof value !== 'string') {
    errors.push(`${field} must be a string`);
    return undefined;
  }
  const normalized = value.trim();
  if (normalized.length > limits[field]) errors.push(`${field} is too long`);
  return normalized;
}

export function validateLead(value: unknown):
  | { readonly ok: true; readonly lead: ValidatedLead; readonly honeypot: boolean }
  | { readonly ok: false; readonly errors: readonly string[] } {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return { ok: false, errors: ['request body must be an object'] };
  }
  const input = value as Record<string, unknown>;
  const errors: string[] = [];
  const allowed = new Set([
    'name',
    'company',
    'email',
    'phone',
    'location',
    'serviceInterest',
    'projectDescription',
    'preferredContactMethod',
    'sourcePage',
    'referrer',
    'website',
  ]);
  for (const key of Object.keys(input)) {
    if (!allowed.has(key)) errors.push(`unknown field: ${key}`);
  }

  const name = optionalString(input.name, 'name', errors);
  const email = optionalString(input.email, 'email', errors);
  const projectDescription = optionalString(
    input.projectDescription,
    'projectDescription',
    errors,
  );
  if (!name) errors.push('name is required');
  if (!email) errors.push('email is required');
  else if (!emailPattern.test(email)) errors.push('email is invalid');
  if (!projectDescription) errors.push('projectDescription is required');

  const preferred = input.preferredContactMethod;
  if (preferred !== undefined && preferred !== 'EMAIL' && preferred !== 'PHONE') {
    errors.push('preferredContactMethod must be EMAIL or PHONE');
  }
  const website = typeof input.website === 'string' ? input.website.trim() : '';
  if (errors.length > 0 || !name || !email || !projectDescription) {
    return { ok: false, errors };
  }

  return {
    ok: true,
    honeypot: website.length > 0,
    lead: {
      name,
      company: optionalString(input.company, 'company', errors),
      email: email.toLowerCase(),
      phone: optionalString(input.phone, 'phone', errors),
      location: optionalString(input.location, 'location', errors),
      serviceInterest: optionalString(input.serviceInterest, 'serviceInterest', errors),
      projectDescription,
      preferredContactMethod: preferred as 'EMAIL' | 'PHONE' | undefined,
      sourcePage: optionalString(input.sourcePage, 'sourcePage', errors),
      referrer: optionalString(input.referrer, 'referrer', errors),
    },
  };
}
