# DNS migration

DNS is frozen during source recovery and AWS preview work.

Before cutover, export the complete current zone including apex, `www`, MX, TXT, SPF, DKIM, DMARC, CAA, validation, and any unrelated subdomains. Do not infer that the two observed website A records represent the whole zone.

The target uses the apex as canonical and redirects `www` at CloudFront. ACM certificate validation must finish before application records change. Email-related records must be preserved byte-for-byte unless a separately reviewed mail change requires otherwise.

Cutover and rollback require explicit approval. Keep Netlify available for 7-14 days after successful cutover.

