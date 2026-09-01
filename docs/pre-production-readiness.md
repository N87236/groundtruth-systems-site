# GroundTruth pre-production readiness

Date: 2026-09-01  
Branch: `migration/aws-platform`  
DEV URL: https://duybk79ygjthc.cloudfront.net  
Production URL: https://groundtruth-systems.com

## Current decision

**NO-GO for production cutover.** DEV hosting is healthy and the migration remains reversible, but SES identity verification and the real notification test are still outstanding. Production ACM validation, Route 53 changes, and DNS cutover are intentionally not executed.

## Parity evidence

The production and DEV documents expose the same navigation, hero copy, Outputs, Divisions, Process, Contact, six deliverable cards, Crop Stress preview, View Larger lightbox, contact details, section IDs, and report registry. The recovery source uses the same local hero and report assets and the same responsive Tailwind utility classes. The DEV CloudFront smoke test passes at the desktop URL; CSS uses the same responsive breakpoints for tablet and mobile layouts (`sm`, `md`, and `lg`).

Viewport checklist to complete during human browser review:

| Viewport | Hero/nav | Deliverables selection | Report/lightbox | Contact/footer |
|---|---|---|---|---|
| Desktop 1440px | automated DOM match; human screenshot pending | automated registry; human click pending | human click pending | DOM match |
| Tablet 768px | responsive classes present; human screenshot pending | human click pending | human click pending | human screenshot pending |
| Mobile 390px | responsive classes present; human screenshot pending | human click pending | human click pending | human screenshot pending |

## Assets

All 8 local DEV assets returned HTTP 200: favicon SVG, hero JPEG, five SVG reports, and the Crop Stress PNG. No hero or report references use temporary URLs. The page still uses three stable third-party presentation dependencies: Tailwind CDN, Font Awesome CDN, and Google Fonts. They are recorded as an availability/CSP risk and should be vendored in a later hardening change if zero third-party runtime dependency is required.

## Lead intake

The deployed path is Browser -> CloudFront `/api/*` -> API Gateway -> Lambda -> DynamoDB and SES. Server-side schema validation, field limits, JSON parsing, honeypot rejection, API Gateway throttling (5 requests/second, burst 10), and structured failure logging are present. The frontend has distinct success and failure text paths.

SES is **BLOCKED** pending verification of `leads@groundtruth-systems.com` and `admin@poole-holdings.com`. The account is in the SES sandbox with a 200-message daily quota. After both links are confirmed, submit one controlled test lead, verify its `leadId` and `notificationStatus=SENT` in `gts-leads-dev`, and verify delivery in the admin mailbox.

## Security and caching

CloudFront already emits HSTS, X-Content-Type-Options, Referrer-Policy, Permissions-Policy, and frame protections. CSP is now emitted as `Content-Security-Policy-Report-Only` with the documented third-party allowlist. HTML is deployed with `Cache-Control: no-cache`; immutable assets use one-year caching. CDK invalidates `/` and `/index.html` for documents and `/assets/*` for static assets on deployment.

## Monitoring and cost

CloudWatch alarms cover CloudFront 4xx/5xx, API Gateway 5xx, Lambda error rate, DynamoDB throttles, and a log metric for lead persistence/notification/configuration failures. The dashboard is `gts-dev-operations`; the DEV budget is USD 15/month with actual and forecast notifications to Nate. Resource tags are applied by CDK: Project, Environment, ManagedBy, Application, and Owner.

Current planning estimate: DEV is approximately USD 5-15/month at low traffic (mostly CloudFront transfer, logs, and the hosted operational baseline); PROD is budgeted at USD 50/month and should remain below that at low-to-medium marketing traffic. Actual pricing depends on transfer, requests, CloudTrail retention, and SES volume; the budget alarm is the authoritative guardrail.

## DR rehearsal

The clean-machine rehearsal passed on 2026-09-01 from a fresh shallow clone of `migration/aws-platform`: `npm ci`, all tests, site validation, and strict CDK synthesis completed successfully. The tested recovery sequence is `git clone`, `npm ci`, Node.js 22+, authenticated AWS session, `cdk bootstrap` (one-time per account/region), then CDK synth/deploy. GitHub OIDC deployment roles are live and no Netlify/OpenClaw path is referenced by AWS infrastructure.

## Production cutover, prepared only

1. Request/validate an ACM certificate in `us-east-1` for `groundtruth-systems.com` and `www.groundtruth-systems.com`.
2. Capture current Netlify DNS records and lower TTLs without changing targets.
3. Run the protected PROD workflow with the certificate ARN and hosted-zone ID.
4. Confirm CloudFront aliases, TLS, `/version.json`, assets, report interactions, lead API, DynamoDB persistence, SES delivery, alarms, and external HTTPS checks.
5. Change only the reviewed apex and `www` Route 53/registrar targets to CloudFront.
6. Verify from independent resolvers worldwide; retain Netlify for 7-14 days.

## Rollback

Stop deployment, restore the recorded Netlify apex and `www` targets, verify HTTPS and all critical interactions, preserve AWS logs and the failed commit, and do not delete AWS or Netlify resources during incident response.
