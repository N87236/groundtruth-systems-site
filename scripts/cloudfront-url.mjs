import { readFile } from 'node:fs/promises';

const file = process.argv[2];
if (!file) throw new Error('Usage: node scripts/cloudfront-url.mjs <cdk-outputs.json>');
const outputs = JSON.parse(await readFile(file, 'utf8'));
const stack = Object.values(outputs).find((value) => value && typeof value.CloudFrontUrl === 'string');
if (!stack) throw new Error('CloudFrontUrl was not found in CDK outputs');
process.stdout.write(stack.CloudFrontUrl);
