#!/usr/bin/env node
import { App, Tags, Validations } from 'aws-cdk-lib';
import { AwsSolutionsChecks } from 'cdk-nag';
import { GroundTruthDeploymentRolesStack } from '../lib/deployment-roles-stack';

const app = new App();
const account = process.env.CDK_DEFAULT_ACCOUNT;
const region = process.env.CDK_DEFAULT_REGION;
if (!account || !region) {
  throw new Error('Deployment foundation requires an authenticated, environment-specific CDK session.');
}

new GroundTruthDeploymentRolesStack(app, 'GroundTruthDeploymentFoundation', {
  env: { account, region },
  githubOwner: 'N87236',
  githubRepository: 'groundtruth-systems-site',
  description: 'GroundTruth Systems GitHub OIDC deployment trust foundation',
  terminationProtection: true,
});

for (const [key, value] of Object.entries({
  Project: 'GroundTruthSystems',
  Environment: 'shared',
  ManagedBy: 'CDK',
  Application: 'groundtruth',
  Owner: 'GroundTruthSystems',
})) {
  Tags.of(app).add(key, value);
}

Validations.of(app).addPlugins(new AwsSolutionsChecks(app, { verbose: true }));
