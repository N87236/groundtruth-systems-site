# Operations

Operational checks cover site availability, lead API availability, lead persistence, SES notification status, CloudFront error rate, API errors, Lambda errors, and lead failure metrics.

Alarms should route to an operator-owned notification channel and use multiple evaluation periods where appropriate to avoid noise. Do not log raw lead bodies. Use `leadId`, request ID, outcome, and validation category for correlation.

Every production deployment records the Git commit, runs smoke tests, and checks alarms before completion. CloudFront invalidations are scoped to changed entry documents where practical; fingerprinted assets should use long-lived immutable caching.

