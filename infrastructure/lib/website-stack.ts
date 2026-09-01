import {
  CfnOutput,
  Duration,
  RemovalPolicy,
  Stack,
  StackProps,
  Token,
  Validations,
  aws_certificatemanager as acm,
  aws_cloudfront as cloudfront,
  aws_cloudfront_origins as origins,
  aws_route53 as route53,
  aws_route53_targets as route53Targets,
  aws_s3 as s3,
  aws_s3_deployment as s3deploy,
} from 'aws-cdk-lib';
import { Construct } from 'constructs';
import path from 'node:path';
import { GroundTruthConfig } from './config';
import {
  acknowledgeGranularMetadataRecursively,
  acknowledgeRecursively,
} from './validation-acknowledgements';

export interface WebsiteStackProps extends StackProps {
  readonly config: GroundTruthConfig;
  readonly apiDomainName: string;
  readonly apiStageName: string;
  readonly certificate?: acm.ICertificate;
  readonly hostedZone?: route53.IHostedZone;
}

export class GroundTruthWebsiteStack extends Stack {
  public readonly distribution: cloudfront.Distribution;

  public constructor(scope: Construct, id: string, props: WebsiteStackProps) {
    super(scope, id, props);

    const production = props.config.environment === 'prod';
    if (production && props.certificate === undefined) {
      throw new Error('Production website requires an ACM certificate');
    }
    if (production && props.hostedZone === undefined) {
      throw new Error('Production website requires a Route 53 hosted zone');
    }

    const accessLogBucket = new s3.Bucket(this, 'AccessLogBucket', {
      bucketName: `gts-access-logs-${props.config.environment}-${this.account}-${this.region}`,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      encryption: s3.BucketEncryption.S3_MANAGED,
      enforceSSL: true,
      objectOwnership: s3.ObjectOwnership.OBJECT_WRITER,
      lifecycleRules: [{ expiration: Duration.days(production ? 90 : 30) }],
      removalPolicy: production ? RemovalPolicy.RETAIN : RemovalPolicy.DESTROY,
      autoDeleteObjects: !production,
    });
    Validations.of(accessLogBucket).acknowledge({
      id: 'AwsSolutions-S1',
      reason: 'Dedicated access-log destination does not log to itself to avoid recursion.',
    });
    const bucket = new s3.Bucket(this, 'SiteBucket', {
      bucketName: `gts-site-${props.config.environment}-${this.account}-${this.region}`,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      encryption: s3.BucketEncryption.S3_MANAGED,
      enforceSSL: true,
      versioned: true,
      serverAccessLogsBucket: accessLogBucket,
      serverAccessLogsPrefix: 'site-bucket/',
      removalPolicy: production ? RemovalPolicy.RETAIN : RemovalPolicy.DESTROY,
      autoDeleteObjects: !production,
    });

    const headers = new cloudfront.ResponseHeadersPolicy(this, 'SecurityHeaders', {
      responseHeadersPolicyName: `gts-security-headers-${props.config.environment}`,
      securityHeadersBehavior: {
        contentTypeOptions: { override: true },
        frameOptions: { frameOption: cloudfront.HeadersFrameOption.DENY, override: true },
        referrerPolicy: {
          referrerPolicy: cloudfront.HeadersReferrerPolicy.STRICT_ORIGIN_WHEN_CROSS_ORIGIN,
          override: true,
        },
        strictTransportSecurity: {
          accessControlMaxAge: Duration.days(365),
          includeSubdomains: true,
          preload: true,
          override: true,
        },
        xssProtection: { protection: true, modeBlock: true, override: true },
      },
      customHeadersBehavior: {
        customHeaders: [
          {
            header: 'Content-Security-Policy-Report-Only',
            value:
              "default-src 'self'; img-src 'self' data: https:; style-src 'self' 'unsafe-inline' https://cdnjs.cloudflare.com https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com https://cdnjs.cloudflare.com; script-src 'self' 'unsafe-inline' https://cdn.tailwindcss.com; connect-src 'self' https://*.execute-api.us-east-1.amazonaws.com; frame-ancestors 'none'; base-uri 'self'; form-action 'self'",
            override: true,
          },
          {
            header: 'Permissions-Policy',
            value: 'camera=(), geolocation=(), microphone=(), payment=(), usb=()',
            override: true,
          },
        ],
      },
    });

    const redirectFunction = production
      ? new cloudfront.Function(this, 'CanonicalRedirect', {
          functionName: `gts-canonical-redirect-${props.config.environment}`,
          code: cloudfront.FunctionCode.fromInline(
            `function handler(event) {
  var request = event.request;
  var host = request.headers.host && request.headers.host.value;
  if (host === 'www.groundtruth-systems.com') {
    var query = request.querystring;
    var pairs = [];
    for (var key in query) {
      var item = query[key];
      if (item.multiValue) {
        for (var i = 0; i < item.multiValue.length; i++) pairs.push(encodeURIComponent(key) + '=' + encodeURIComponent(item.multiValue[i].value));
      } else if (item.value !== undefined) {
        pairs.push(encodeURIComponent(key) + '=' + encodeURIComponent(item.value));
      }
    }
    return { statusCode: 301, statusDescription: 'Moved Permanently', headers: { location: { value: 'https://groundtruth-systems.com' + request.uri + (pairs.length ? '?' + pairs.join('&') : '') } } };
  }
  return request;
}`,
          ),
        })
      : undefined;

    const distribution = new cloudfront.Distribution(this, 'Distribution', {
      comment: `GroundTruth Systems ${props.config.environment} website`,
      defaultRootObject: 'index.html',
      domainNames: production
        ? [props.config.canonicalHost!, ...props.config.alternateHosts]
        : undefined,
      certificate: props.certificate,
      minimumProtocolVersion: props.certificate
        ? cloudfront.SecurityPolicyProtocol.TLS_V1_2_2021
        : undefined,
      enableIpv6: true,
      enableLogging: true,
      logBucket: accessLogBucket,
      logFilePrefix: `cloudfront/${props.config.environment}/`,
      priceClass: cloudfront.PriceClass.PRICE_CLASS_100,
      defaultBehavior: {
        origin: origins.S3BucketOrigin.withOriginAccessControl(bucket),
        viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
        allowedMethods: cloudfront.AllowedMethods.ALLOW_GET_HEAD_OPTIONS,
        cachedMethods: cloudfront.CachedMethods.CACHE_GET_HEAD_OPTIONS,
        cachePolicy: cloudfront.CachePolicy.CACHING_OPTIMIZED,
        compress: true,
        responseHeadersPolicy: headers,
        functionAssociations: redirectFunction
          ? [
              {
                function: redirectFunction,
                eventType: cloudfront.FunctionEventType.VIEWER_REQUEST,
              },
            ]
          : undefined,
      },
      additionalBehaviors: {
        'api/*': {
          origin: new origins.HttpOrigin(props.apiDomainName, {
            originPath: `/${props.apiStageName}`,
            protocolPolicy: cloudfront.OriginProtocolPolicy.HTTPS_ONLY,
          }),
          viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
          allowedMethods: cloudfront.AllowedMethods.ALLOW_ALL,
          cachePolicy: cloudfront.CachePolicy.CACHING_DISABLED,
          originRequestPolicy: cloudfront.OriginRequestPolicy.ALL_VIEWER_EXCEPT_HOST_HEADER,
          responseHeadersPolicy: headers,
        },
      },
    });

    new s3deploy.BucketDeployment(this, 'AssetDeployment', {
      destinationBucket: bucket,
      destinationKeyPrefix: 'assets',
      sources: [s3deploy.Source.asset(path.join(__dirname, '../../site/assets'))],
      prune: true,
      retainOnDelete: production,
      cacheControl: [s3deploy.CacheControl.maxAge(Duration.days(365)), s3deploy.CacheControl.immutable()],
      distribution,
      distributionPaths: ['/assets/*'],
    });
    new s3deploy.BucketDeployment(this, 'DocumentDeployment', {
      destinationBucket: bucket,
      sources: [
        s3deploy.Source.asset(path.join(__dirname, '../../site'), { exclude: ['assets/**'] }),
      ],
      distribution,
      distributionPaths: ['/', '/index.html'],
      prune: false,
      retainOnDelete: production,
      cacheControl: [s3deploy.CacheControl.noCache()],
    });

    this.distribution = distribution;
    for (const acknowledgment of [
      {
        id: 'AwsSolutions-CFR1',
        reason: 'GroundTruth serves prospective customers without geographic restriction.',
      },
      {
        id: 'AwsSolutions-CFR2',
        reason:
          'WAF is deferred until observed abuse warrants recurring rules; throttling, validation, and bounded concurrency are enabled.',
      },
      ...(!production
        ? [
            {
              id: 'AwsSolutions-CFR4',
              reason:
                'The dev preview uses the CloudFront-generated hostname and default certificate; production requires ACM and TLS 1.2.',
            },
          ]
        : []),
    ]) {
      Validations.of(distribution).acknowledge(acknowledgment);
    }

    const deploymentHelper = this.node.tryFindChild(
      'Custom::CDKBucketDeployment8693BB64968944B69AAFB0CC9EB8756C',
    );
    if (deploymentHelper) {
      for (const acknowledgment of [
          {
            id: 'AwsSolutions-IAM4',
            reason: 'CDK deployment helper uses the Lambda basic execution policy.',
          },
          {
            id: 'AwsSolutions-IAM5',
            reason:
              'CDK deployment helper needs wildcard object actions within the bootstrap and target buckets.',
          },
          {
            id: 'AwsSolutions-L1',
            reason: 'Runtime version is controlled by the current aws-cdk-lib deployment provider.',
          },
        ]) {
        Validations.of(deploymentHelper).acknowledge(acknowledgment);
      }
      acknowledgeRecursively(deploymentHelper, [
        {
          id: 'AwsSolutions-IAM4',
          reason: 'CDK deployment helper uses only Lambda basic execution.',
        },
        {
          id: 'AwsSolutions-IAM5',
          reason:
            'CDK deployment helper scopes wildcard object actions to its bootstrap and target buckets.',
        },
        {
          id: 'AwsSolutions-L1',
          reason: 'Runtime version is controlled by the current aws-cdk-lib deployment provider.',
        },
      ]);
      acknowledgeGranularMetadataRecursively(deploymentHelper, {
        'AwsSolutions-IAM4[Policy::arn:<AWS::Partition>:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole]':
          'CDK deployment helper uses only Lambda basic execution.',
        'AwsSolutions-IAM5[Resource::*]':
          'The provider runtime APIs that do not support resource scoping require Resource *.',
        'AwsSolutions-IAM5[Action::s3:GetBucket*]':
          'CDK deployment helper reads bucket metadata for its scoped deployment operation.',
        'AwsSolutions-IAM5[Action::s3:GetObject*]':
          'CDK deployment helper reads objects from only the bootstrap asset bucket.',
        'AwsSolutions-IAM5[Action::s3:List*]':
          'CDK deployment helper lists only the bootstrap and target buckets.',
        'AwsSolutions-IAM5[Action::s3:Abort*]':
          'CDK deployment helper can abort incomplete multipart uploads in the target bucket.',
        'AwsSolutions-IAM5[Action::s3:DeleteObject*]':
          'Pruning requires deletion beneath only the target site bucket.',
        'AwsSolutions-IAM5[Resource::arn:<AWS::Partition>:s3:::cdk-hnb659fds-assets-<AWS::AccountId>-<AWS::Region>/*]':
          'Read access is restricted to objects in the CDK bootstrap asset bucket.',
        ...(!Token.isUnresolved(this.account) && !Token.isUnresolved(this.region)
          ? {
              [`AwsSolutions-IAM5[Resource::arn:<AWS::Partition>:s3:::cdk-hnb659fds-assets-${this.account}-${this.region}/*]`]:
                'Read access is restricted to objects in the environment-specific CDK bootstrap asset bucket.',
            }
          : {}),
        'AwsSolutions-IAM5[Resource::<SiteBucket397A1860.Arn>/*]':
          'Write and prune access is restricted to objects in the GroundTruth site bucket.',
      });
    }
    for (const acknowledgment of [
      {
        id: 'AwsSolutions-IAM4',
        reason: 'Only the CDK-managed bucket deployment helper uses Lambda basic execution.',
      },
      {
        id: 'AwsSolutions-IAM5',
        reason:
          'The CDK deployment helper scopes wildcard object actions to its bootstrap asset and target site buckets.',
      },
      {
        id: 'AwsSolutions-L1',
        reason: 'The deployment helper runtime is managed by the current aws-cdk-lib provider.',
      },
    ]) {
      Validations.of(this).acknowledge(acknowledgment);
    }

    if (production && props.hostedZone) {
      const target = route53.RecordTarget.fromAlias(
        new route53Targets.CloudFrontTarget(distribution),
      );
      new route53.ARecord(this, 'ApexAliasA', {
        zone: props.hostedZone,
        recordName: props.config.canonicalHost,
        target,
      });
      new route53.AaaaRecord(this, 'ApexAliasAaaa', {
        zone: props.hostedZone,
        recordName: props.config.canonicalHost,
        target,
      });
      new route53.ARecord(this, 'WwwAliasA', {
        zone: props.hostedZone,
        recordName: 'www',
        target,
      });
      new route53.AaaaRecord(this, 'WwwAliasAaaa', {
        zone: props.hostedZone,
        recordName: 'www',
        target,
      });
    }
    new CfnOutput(this, 'CloudFrontUrl', { value: `https://${distribution.domainName}` });
  }
}
