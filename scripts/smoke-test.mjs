const baseUrl = process.argv[2]?.replace(/\/$/, '');
if (!baseUrl) throw new Error('Usage: node scripts/smoke-test.mjs <base-url>');

const checks = [
  ['/', 'text/html'],
  ['/assets/images/hero.jpg', 'image/jpeg'],
  ['/assets/reports/dragon-fruit-farm-intelligence-report.png', 'image/png'],
  ['/version.json', 'application/json'],
];
for (const [path, contentType] of checks) {
  const response = await fetch(`${baseUrl}${path}`, { redirect: 'error' });
  if (response.status !== 200) throw new Error(`${path} returned ${response.status}`);
  const actualType = response.headers.get('content-type') ?? '';
  if (!actualType.includes(contentType)) {
    throw new Error(`${path} returned unexpected content type ${actualType}`);
  }
}
console.log(`Smoke tests passed for ${baseUrl}`);
