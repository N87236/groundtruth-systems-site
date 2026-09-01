import { validateLead } from '../services/lead-intake/validation';

test('accepts and normalizes a valid lead', () => {
  const result = validateLead({
    name: ' Nate Poole ',
    email: 'NATE@EXAMPLE.COM',
    projectDescription: ' Site assessment ',
    preferredContactMethod: 'EMAIL',
  });
  expect(result).toEqual({
    ok: true,
    honeypot: false,
    lead: expect.objectContaining({
      name: 'Nate Poole',
      email: 'nate@example.com',
      projectDescription: 'Site assessment',
    }),
  });
});

test('rejects invalid and unexpected fields', () => {
  const result = validateLead({
    name: '',
    email: 'not-an-email',
    projectDescription: '',
    admin: true,
  });
  expect(result.ok).toBe(false);
  if (!result.ok) {
    expect(result.errors).toEqual(
      expect.arrayContaining([
        'unknown field: admin',
        'name is required',
        'email is invalid',
        'projectDescription is required',
      ]),
    );
  }
});

test('identifies a populated honeypot without persisting it', () => {
  const result = validateLead({
    name: 'Test User',
    email: 'test@example.com',
    projectDescription: 'Test project',
    website: 'spam.example',
  });
  expect(result.ok && result.honeypot).toBe(true);
});
