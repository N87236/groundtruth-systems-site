import { Validations } from 'aws-cdk-lib';
import { IConstruct } from 'constructs';

export interface ValidationAcknowledgement {
  readonly id: string;
  readonly reason: string;
}

export function acknowledgeRecursively(
  root: IConstruct,
  acknowledgements: readonly ValidationAcknowledgement[],
): void {
  for (const construct of root.node.findAll()) {
    for (const acknowledgement of acknowledgements) {
      Validations.of(construct).acknowledge(acknowledgement);
    }
  }
}

export function acknowledgeGranularMetadataRecursively(
  root: IConstruct,
  acknowledgements: Readonly<Record<string, string>>,
): void {
  for (const construct of root.node.findAll()) {
    construct.node.addMetadata(Validations.ACKNOWLEDGED_RULES_METADATA_KEY, acknowledgements);
  }
}
