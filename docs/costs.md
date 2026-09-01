# Cost model

Primary cost drivers are Route 53 hosted-zone/query charges, CloudFront transfer and requests, S3 storage/requests, API Gateway requests, Lambda invocations, DynamoDB requests/storage/backups, SES messages, CloudWatch logs/alarms, CloudTrail storage, and AWS Budgets actions/notifications where configured.

The following planning bands are estimates, not a quote. Validate them with the AWS Pricing Calculator for the deployment region and actual response sizes before production approval.

| Band | Planning workload | Expected profile |
| --- | --- | --- |
| low traffic | up to roughly 10,000 page views and 100 leads/month | mostly fixed Route 53, logging, alarm, and audit costs; request-driven services remain small |
| medium traffic | roughly 100,000 page views and 1,000 leads/month | CloudFront transfer becomes the main variable cost; serverless lead costs remain modest |
| growth traffic | roughly 1,000,000 page views and 10,000 leads/month | CloudFront transfer/request charges dominate; review cache hit rate, image formats, logs, WAF need, and support plan |

The architecture avoids NAT Gateway, always-on EC2, RDS, ECS, and load balancers. A monthly GroundTruth budget and cost-allocation tags provide early warning. Exact numeric estimates will be calculated from current AWS price data before deployment because rates and free-tier terms change.

