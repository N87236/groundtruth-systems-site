import { writeFile } from 'node:fs/promises';

const commit = process.argv[2] || process.env.GITHUB_SHA || 'local';
const environment = process.argv[3] || process.env.GROUNDTRUTH_ENVIRONMENT || 'dev';
if (!['dev', 'prod'].includes(environment)) throw new Error('environment must be dev or prod');

await writeFile(
  new URL('../site/version.json', import.meta.url),
  `${JSON.stringify({ commit, environment, deployedAt: new Date().toISOString() }, null, 2)}\n`,
);
