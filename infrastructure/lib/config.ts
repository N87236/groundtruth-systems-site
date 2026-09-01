export type GroundTruthEnvironment = 'dev' | 'prod';

export interface GroundTruthConfig {
  readonly environment: GroundTruthEnvironment;
  readonly domainName: string;
  readonly canonicalHost?: string;
  readonly alternateHosts: readonly string[];
  readonly notificationEmail: string;
  readonly senderEmail: string;
  readonly budgetUsd: number;
  readonly tags: Readonly<Record<string, string>>;
}

export function environmentConfig(environment: GroundTruthEnvironment): GroundTruthConfig {
  const production = environment === 'prod';
  return {
    environment,
    domainName: 'groundtruth-systems.com',
    canonicalHost: production ? 'groundtruth-systems.com' : undefined,
    alternateHosts: production ? ['www.groundtruth-systems.com'] : [],
    notificationEmail: 'nate@poole-holdings.com',
    senderEmail: 'leads@groundtruth-systems.com',
    budgetUsd: production ? 50 : 15,
    tags: {
      Project: 'GroundTruthSystems',
      Environment: environment,
      ManagedBy: 'CDK',
      Application: 'groundtruth',
      Owner: 'GroundTruthSystems',
    },
  };
}
