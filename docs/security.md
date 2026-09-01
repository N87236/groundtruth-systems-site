# Security

- private S3 origin with all public access blocked
- CloudFront Origin Access Control and HTTPS redirect
- TLS certificate managed by ACM
- least-privilege runtime roles generated from the resources each function uses
- GitHub OIDC short-lived deployment sessions; no permanent AWS keys
- server-side field allow-list, type/length/email checks, honeypot, API throttling, and bounded request size
- DynamoDB encryption, point-in-time recovery in production, and retained production data
- structured logs that exclude project descriptions and unnecessary personal data
- CloudWatch alarms for CloudFront, API Gateway, Lambda, and lead failures
- CloudTrail management-event audit log with validation and protected storage
- security headers through CloudFront; CSP is tested before strict enforcement
- no EC2, SSH, public admin endpoint, local bot, or workstation-specific runtime state

Personal data in the lead table must have an approved retention period and deletion procedure before production launch. Access to lead data and logs is limited to authorized operators using MFA-backed short-lived sessions.

