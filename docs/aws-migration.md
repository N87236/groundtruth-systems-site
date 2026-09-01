# AWS migration plan and pre-destructive-change report

No production or DNS destructive work is authorized by this document. It is the required review artifact before any cutover action.

## 1. Current repository architecture

An older multi-page static site is on `main`, with local assets, external images/fonts, a Netlify form, Netlify state, and machine-local build paths. See `current-state-audit.md`.

## 2. Current production architecture

Netlify currently serves a newer single-page static experience for the apex and `www` hostnames. Production remains authoritative during migration.

## 3. Repository-versus-production differences

The repository lacks the current hero/content architecture, report selector, report assets, lightbox, divisions, and current contact details. Production lacks a working AWS lead form, complete SEO metadata, a process target, and reproducible local frontend dependencies.

## 4. Target AWS architecture

Route 53 -> CloudFront -> private S3 with OAC. `/api/leads` routes to API Gateway -> Lambda -> DynamoDB and SES. ACM provides TLS. CloudWatch and CloudTrail provide operations and audit visibility.

## 5. Files and resources to create

- recovered `site/` source and assets
- CDK app, stacks, tests, and environment configuration under `infrastructure/`
- lead handler and tests under `services/lead-intake/`
- GitHub validation, dev deployment, and manually approved production workflows
- private site buckets, CloudFront distributions, certificates, DNS records, lead tables/APIs/functions, logs, alarms, trail, audit bucket, and budget

## 6. Files and resources to retire

After the agreed 7-14 day stabilization period and explicit approval: `.netlify/netlify.toml`, `.netlify/state.json`, Netlify form behavior, Netlify RUM, and Netlify production hosting. Git history is retained.

## 7. CDK stacks

`GroundTruthDnsStack`, `GroundTruthWebsiteStack`, `GroundTruthLeadIntakeStack`, and `GroundTruthObservabilityStack`, independently instantiated for dev/prod where applicable.

## 8. Estimated monthly cost

The cost model is documented in `costs.md`. Cost is traffic-dependent; the design intentionally avoids NAT Gateway, EC2, RDS, ECS, and load balancers.

## 9. CI/CD approach

Pull requests run deterministic checks. Merges deploy dev through GitHub OIDC. Production uses a protected GitHub environment and manual approval. Deployments use CDK and immutable Git commits, then run smoke tests and a scoped CloudFront invalidation. No permanent AWS keys are stored in GitHub.

## 10. DNS migration procedure

Inventory every current DNS record, validate certificate records, prove the CloudFront preview, lower relevant TTLs, create Route 53 records, update registrar delegation only during the approved window, and verify apex/`www`, TLS, email records, and global resolution.

## 11. Rollback procedure

Keep Netlify intact. Record current Netlify DNS targets and zone records before cutover. If acceptance checks fail, restore the known-good Netlify records/delegation, verify HTTPS and interactions, and preserve AWS for diagnosis. See `disaster-recovery.md`.

## 12. Risks and mitigations

| Risk | Mitigation |
| --- | --- |
| stale repository overwrites production | production capture and parity gate; no current production deployment from `main` |
| missing generated or report asset | manifest, hashes, link tests, and preview smoke tests |
| frontend CDN changes break styling | preserve current dependencies for parity, then replace through a separately reviewed build change |
| CSP breaks Tailwind/fonts/icons | report-only evaluation and browser testing before enforcement |
| DNS or certificate outage | DNS inventory, prevalidated ACM certificate, low TTL, controlled window, Netlify rollback |
| duplicate/lost leads | generated lead ID, conditional DynamoDB write, structured error logging, alarms, and end-to-end test |
| SES sandbox/delivery limitation | verify identity and production access before cutover; test notification and persistence independently |
| deploy role privilege expansion | OIDC, short-lived sessions, scoped trust, CDK bootstrap roles, permissions boundary, protected production environment |
| one-workstation dependency | Git, CDK, documented login/deploy/recovery, and no local absolute paths |

