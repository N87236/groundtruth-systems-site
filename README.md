# GroundTruth Systems

Authoritative application source and AWS infrastructure for [groundtruth-systems.com](https://groundtruth-systems.com).

Migration work is isolated on `migration/aws-platform`. The current Netlify production site remains authoritative until the AWS preview passes visual, functional, lead-delivery, and rollback acceptance checks. Do not deploy the legacy root HTML files.

## Repository layout

- `site/`: recovered current production site and versioned assets
- `infrastructure/`: AWS CDK application and stacks
- `services/lead-intake/`: validated Lambda lead intake
- `test/`: unit and infrastructure assertions
- `scripts/`: deterministic source/site validation
- `docs/`: audit, architecture, migration, deployment, DNS, security, operations, recovery, and cost documentation

## Local validation

Node.js 22 or newer is required.

```text
npm ci
npm run validate
```

Validation type-checks the CDK/Lambda source, runs unit and infrastructure tests, checks the recovered site for missing assets/IDs/alt text, and performs strict credential-free CDK synthesis.

## Safe migration status

- current production HTML and owned assets recovered into `site/`
- Netlify-injected RUM excluded from authored source
- machine-local `/home/nate/.openclaw/...` paths removed
- private S3/CloudFront OAC dev infrastructure synthesizes
- lead API, DynamoDB persistence, SES notification, validation, honeypot, throttling, and logs synthesize
- production CDK synthesis and DNS operations remain gated
- no AWS resources, DNS records, Route 53 zones, or Netlify production settings have been changed

Read [the current-state audit](docs/current-state-audit.md) and [the pre-cutover migration report](docs/aws-migration.md) before reviewing infrastructure changes.

## Deployment principle

```text
git clone
+ documented AWS login
+ npm ci
+ cdk deploy
= recoverable GroundTruth infrastructure
```

Use IAM Identity Center or another MFA-backed short-lived session for human access. GitHub deployment uses OIDC roles and never permanent AWS keys.
