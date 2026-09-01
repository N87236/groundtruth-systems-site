# Deployment

Deployment is intentionally disabled until the CDK app, AWS account/region inputs, GitHub OIDC roles, SES identity, and preview acceptance checks are complete.

The recoverability target is:

```text
git clone
+ documented AWS login
+ npm ci
+ cdk deploy
= reproducible GroundTruth infrastructure
```

Use short-lived AWS IAM Identity Center or role credentials. Never add access keys, session tokens, account IDs, hosted-zone IDs, or certificate validation secrets to source control.

The deployment order is lead intake, preview website, observability, parity validation, and finally DNS. Production deployment requires a reviewed commit and protected GitHub environment approval.

