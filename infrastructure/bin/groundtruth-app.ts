#!/usr/bin/env node
import {
  App,
  Tags,
  Validations,
  aws_certificatemanager as acm,
  aws_route53 as route53,
} from 'aws-cdk-lib';
import { AwsSolutionsChecks } from 'cdk-nag';
import { environmentConfig, GroundTruthEnvironment } from '../lib/config';
import { GroundTruthLeadIntakeStack } from '../lib/lead-intake-stack';
import { GroundTruthWebsiteStack } from '../lib/website-stack';
import { GroundTruthObservabilityStack } from '../lib/observability-stack';

const app = new App();
const requestedEnvironment: unknown = app.node.tryGetContext('environment');
if (requestedEnvironment !== 'dev' && requestedEnvironment !== 'prod') {
  throw new Error('CDK context environment must be dev or prod');
}
const environment = requestedEnvironment as GroundTruthEnvironment;
const config = environmentConfig(environment);
const env =
  process.env.CDK_DEFAULT_ACCOUNT && process.env.CDK_DEFAULT_REGION
    ? {
        account: process.env.CDK_DEFAULT_ACCOUNT,
        region: process.env.CDK_DEFAULT_REGION,
      }
    : undefined;

const certificateArn: unknown = app.node.tryGetContext('certificateArn');
const hostedZoneId: unknown = app.node.tryGetContext('hostedZoneId');
if (
  environment === 'prod' &&
  (typeof certificateArn !== 'string' || typeof hostedZoneId !== 'string')
) {
  throw new Error(
    'Production requires reviewed certificateArn and hostedZoneId CDK context values.',
  );
}
const certificate =
  typeof certificateArn === 'string'
    ? acm.Certificate.fromCertificateArn(app, 'ProductionCertificate', certificateArn)
    : undefined;
const hostedZone =
  typeof hostedZoneId === 'string'
    ? route53.HostedZone.fromHostedZoneAttributes(app, 'ProductionHostedZone', {
        hostedZoneId,
        zoneName: config.domainName,
      })
    : undefined;

const lead = new GroundTruthLeadIntakeStack(app, `GroundTruthLeadIntake-${environment}`, {
  env,
  config,
  terminationProtection: environment === 'prod',
});

const website = new GroundTruthWebsiteStack(app, `GroundTruthWebsite-${environment}`, {
  env,
  config,
  apiDomainName: lead.apiDomainName,
  apiStageName: lead.api.deploymentStage.stageName,
  certificate,
  hostedZone,
  terminationProtection: environment === 'prod',
});

new GroundTruthObservabilityStack(app, `GroundTruthObservability-${environment}`, {
  env,
  config,
  distribution: website.distribution,
  leadHandler: lead.handler,
  leadTable: lead.table,
  apiName: lead.api.restApiName,
  terminationProtection: environment === 'prod',
});

for (const [key, value] of Object.entries(config.tags)) {
  Tags.of(app).add(key, value);
}

Validations.of(app).addPlugins(new AwsSolutionsChecks(app, { verbose: true }));
