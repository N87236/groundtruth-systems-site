import { App } from 'aws-cdk-lib';
import { Match, Template } from 'aws-cdk-lib/assertions';
import { environmentConfig } from '../infrastructure/lib/config';
import { GroundTruthLeadIntakeStack } from '../infrastructure/lib/lead-intake-stack';
import { GroundTruthWebsiteStack } from '../infrastructure/lib/website-stack';

test('website uses a private encrypted S3 bucket and CloudFront OAC', () => {
  const app = new App();
  const config = environmentConfig('dev');
  const stack = new GroundTruthWebsiteStack(app, 'WebsiteTest', {
    config,
    apiDomainName: 'example.execute-api.us-east-1.amazonaws.com',
    apiStageName: 'v1',
  });
  const template = Template.fromStack(stack);
  template.hasResourceProperties('AWS::S3::Bucket', {
    BucketEncryption: Match.anyValue(),
    PublicAccessBlockConfiguration: {
      BlockPublicAcls: true,
      BlockPublicPolicy: true,
      IgnorePublicAcls: true,
      RestrictPublicBuckets: true,
    },
    VersioningConfiguration: { Status: 'Enabled' },
  });
  template.resourceCountIs('AWS::CloudFront::OriginAccessControl', 1);
  template.hasResourceProperties('AWS::CloudFront::Distribution', {
    DistributionConfig: Match.objectLike({
      DefaultRootObject: 'index.html',
      Enabled: true,
      HttpVersion: 'http2',
    }),
  });
});

test('lead intake is throttled and stores leads in encrypted DynamoDB', () => {
  const app = new App();
  const stack = new GroundTruthLeadIntakeStack(app, 'LeadTest', {
    config: environmentConfig('prod'),
  });
  const template = Template.fromStack(stack);
  template.hasResourceProperties('AWS::DynamoDB::Table', {
    BillingMode: 'PAY_PER_REQUEST',
    PointInTimeRecoverySpecification: { PointInTimeRecoveryEnabled: true },
    SSESpecification: { SSEEnabled: true },
  });
  template.hasResourceProperties('AWS::ApiGateway::Stage', {
    MethodSettings: [
      Match.objectLike({
        ThrottlingBurstLimit: 10,
        ThrottlingRateLimit: 5,
      }),
    ],
  });
  template.hasResourceProperties('AWS::Lambda::Function', {
    Runtime: 'nodejs22.x',
    ReservedConcurrentExecutions: 10,
    TracingConfig: { Mode: 'Active' },
  });
});
