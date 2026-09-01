# Architecture

## Current

```text
Internet
  -> Netlify
    -> GroundTruth Website
```

## Target website

```text
Internet
  -> Route 53
    -> CloudFront
      -> private S3 origin through Origin Access Control
        -> GroundTruth Website
```

The S3 bucket has public access blocked and does not use S3 website hosting. CloudFront terminates HTTPS using an ACM certificate in `us-east-1`. The apex domain is canonical. Requests whose host is `www.groundtruth-systems.com` receive a permanent redirect to the equivalent apex URL.

## Lead intake

```text
Website
  -> /api/leads
    -> API Gateway
      -> Lambda
        /       \
   DynamoDB     SES
```

The Lambda validates and normalizes input, rejects a populated honeypot, creates the lead record with status `NEW`, and requests an SES notification to `admin@poole-holdings.com`. It emits structured logs without logging the submitted message or other unnecessary personal data. The public contact address remains `nate@poole-holdings.com`.

## Environments

- `dev`: CloudFront-generated hostname initially; optional `dev.groundtruth-systems.com` after DNS is managed in AWS
- `prod`: `groundtruth-systems.com` and `www.groundtruth-systems.com`, deployed only after manual GitHub environment approval

Each environment receives separate buckets, tables, functions, APIs, log groups, alarms, and stacks. Production stateful resources are retained and stacks use termination protection.

## CDK stacks

- `GroundTruthDnsStack`: hosted-zone references, ACM certificate, apex and `www` records; deployed only during the controlled DNS phase
- `GroundTruthLeadIntakeStack`: API Gateway, Lambda, DynamoDB, SES integration, throttling, validation, and logs
- `GroundTruthWebsiteStack`: private S3 origin, deployment assets, CloudFront OAC, headers, aliases, and redirect logic
- `GroundTruthObservabilityStack`: CloudWatch alarms/dashboard, notification topic, CloudTrail bucket/trail, and budget

The DNS stack is intentionally separable so preview hosting can be deployed without changing authoritative DNS.

## Future boundaries

The marketing site remains a bounded workload. Future portal, mission, spatial storage, processing, and AI stacks should integrate through versioned APIs and events rather than sharing the website bucket or lead table.

Planned data namespaces are `raw-data`, `processed-data`, `reports`, and `models`, organized conceptually as customer/site/mission. No processing fleet, database cluster, customer identity system, or GPU capacity is part of this migration.
