import {
  CfnOutput,
  Stack,
  StackProps,
  aws_certificatemanager as acm,
  aws_route53 as route53,
} from 'aws-cdk-lib';
import { Construct } from 'constructs';
import { GroundTruthConfig } from './config';

export interface DnsStackProps extends StackProps {
  readonly config: GroundTruthConfig;
}

export class GroundTruthDnsStack extends Stack {
  public readonly hostedZone: route53.HostedZone;
  public readonly certificate: acm.Certificate;

  public constructor(scope: Construct, id: string, props: DnsStackProps) {
    super(scope, id, props);
    if (props.config.environment !== 'prod') {
      throw new Error('GroundTruthDnsStack is production-only');
    }
    if (this.region !== 'us-east-1') {
      throw new Error('CloudFront certificate stack must deploy in us-east-1');
    }

    const hostedZone = new route53.HostedZone(this, 'HostedZone', {
      zoneName: props.config.domainName,
      comment: 'GroundTruth Systems production public zone - delegation changes only at cutover',
    });
    const certificate = new acm.Certificate(this, 'WebsiteCertificate', {
      domainName: props.config.domainName,
      subjectAlternativeNames: [`www.${props.config.domainName}`],
      validation: acm.CertificateValidation.fromDns(hostedZone),
    });

    this.hostedZone = hostedZone;
    this.certificate = certificate;
    new CfnOutput(this, 'HostedZoneId', { value: hostedZone.hostedZoneId });
    new CfnOutput(this, 'HostedZoneNameServers', {
      value: hostedZone.hostedZoneNameServers?.join(',') ?? 'available-after-deployment',
    });
    new CfnOutput(this, 'CertificateArn', { value: certificate.certificateArn });
  }
}
