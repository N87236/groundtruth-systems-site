# Disaster recovery and migration rollback

## Before DNS cutover

Netlify is the recovery target. Preserve its site, deploy, domain configuration, and every current DNS record. Record screenshots/exports and verify a known-good Netlify URL before changing DNS.

## Cutover rollback

If the AWS site fails parity, TLS, lead delivery, or availability checks:

1. stop further production deployment
2. restore the recorded Netlify DNS target or registrar delegation
3. verify apex and `www` over HTTPS from independent resolvers
4. verify hero, reports, lightbox, responsive layout, and contact path
5. preserve AWS logs and the failed commit for diagnosis

Do not delete AWS resources during an incident. Do not delete Netlify until AWS has remained stable for the agreed 7-14 day observation period.

## AWS recovery target

Infrastructure is recreated from CDK and site artifacts from Git. Production DynamoDB uses point-in-time recovery and retained deletion policies. S3 versioning protects deployed content. Recovery exercises must be documented after the first production deployment.

