import {
  CfnOutput,
  Duration,
  RemovalPolicy,
  Stack,
  StackProps,
  Validations,
  aws_apigateway as apigateway,
  aws_dynamodb as dynamodb,
  aws_iam as iam,
  aws_lambda as lambda,
  aws_lambda_nodejs as lambdaNodejs,
  aws_logs as logs,
} from 'aws-cdk-lib';
import { Construct } from 'constructs';
import path from 'node:path';
import { GroundTruthConfig } from './config';
import {
  acknowledgeGranularMetadataRecursively,
  acknowledgeRecursively,
} from './validation-acknowledgements';

export interface LeadIntakeStackProps extends StackProps {
  readonly config: GroundTruthConfig;
}

export class GroundTruthLeadIntakeStack extends Stack {
  public readonly api: apigateway.RestApi;
  public readonly apiDomainName: string;
  public readonly handler: lambda.IFunction;
  public readonly table: dynamodb.ITable;

  public constructor(scope: Construct, id: string, props: LeadIntakeStackProps) {
    super(scope, id, props);

    const production = props.config.environment === 'prod';
    const removalPolicy = production ? RemovalPolicy.RETAIN : RemovalPolicy.DESTROY;

    const table = new dynamodb.Table(this, 'LeadsTable', {
      tableName: `gts-leads-${props.config.environment}`,
      partitionKey: { name: 'leadId', type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      encryption: dynamodb.TableEncryption.AWS_MANAGED,
      pointInTimeRecoverySpecification: { pointInTimeRecoveryEnabled: true },
      deletionProtection: production,
      removalPolicy,
    });

    const logGroup = new logs.LogGroup(this, 'LeadHandlerLogs', {
      logGroupName: `/gts/${props.config.environment}/lead-intake`,
      retention: production ? logs.RetentionDays.THREE_MONTHS : logs.RetentionDays.TWO_WEEKS,
      removalPolicy,
    });

    const handler = new lambdaNodejs.NodejsFunction(this, 'LeadHandler', {
      functionName: `gts-lead-intake-${props.config.environment}`,
      entry: path.join(__dirname, '../../services/lead-intake/handler.ts'),
      handler: 'handler',
      runtime: lambda.Runtime.NODEJS_22_X,
      architecture: lambda.Architecture.ARM_64,
      timeout: Duration.seconds(10),
      memorySize: 256,
      logGroup,
      tracing: lambda.Tracing.ACTIVE,
      environment: {
        LEADS_TABLE_NAME: table.tableName,
        NOTIFICATION_EMAIL: props.config.notificationEmail,
        SENDER_EMAIL: props.config.senderEmail,
      },
      bundling: {
        minify: true,
        sourceMap: true,
        target: 'node22',
      },
    });
    table.grantReadWriteData(handler);
    handler.addToRolePolicy(
      new iam.PolicyStatement({
        sid: 'SendGroundTruthLeadNotification',
        actions: ['ses:SendEmail'],
        resources: [
          `arn:${this.partition}:ses:${this.region}:${this.account}:identity/${props.config.domainName}`,
        ],
      }),
    );

    const accessLogs = new logs.LogGroup(this, 'ApiAccessLogs', {
      logGroupName: `/gts/${props.config.environment}/lead-api-access`,
      retention: production ? logs.RetentionDays.THREE_MONTHS : logs.RetentionDays.TWO_WEEKS,
      removalPolicy,
    });
    const api = new apigateway.RestApi(this, 'LeadApi', {
      restApiName: `gts-leads-${props.config.environment}`,
      endpointTypes: [apigateway.EndpointType.REGIONAL],
      cloudWatchRole: true,
      deployOptions: {
        stageName: 'v1',
        throttlingBurstLimit: 10,
        throttlingRateLimit: 5,
        loggingLevel: apigateway.MethodLoggingLevel.ERROR,
        dataTraceEnabled: false,
        metricsEnabled: true,
        accessLogDestination: new apigateway.LogGroupLogDestination(accessLogs),
        accessLogFormat: apigateway.AccessLogFormat.jsonWithStandardFields({
          caller: false,
          httpMethod: true,
          ip: false,
          protocol: true,
          requestTime: true,
          resourcePath: true,
          responseLength: true,
          status: true,
          user: false,
        }),
      },
      defaultCorsPreflightOptions: {
        allowOrigins: production
          ? ['https://groundtruth-systems.com', 'https://www.groundtruth-systems.com']
          : apigateway.Cors.ALL_ORIGINS,
        allowMethods: ['POST', 'OPTIONS'],
        allowHeaders: ['Content-Type'],
        maxAge: Duration.hours(1),
      },
    });
    const leadModel = api.addModel('LeadRequestModel', {
      contentType: 'application/json',
      modelName: `GroundTruthLead${props.config.environment}`,
      schema: {
        schema: apigateway.JsonSchemaVersion.DRAFT4,
        type: apigateway.JsonSchemaType.OBJECT,
        required: ['name', 'email', 'projectDescription'],
        additionalProperties: false,
        properties: {
          name: { type: apigateway.JsonSchemaType.STRING, minLength: 1, maxLength: 120 },
          company: { type: apigateway.JsonSchemaType.STRING, maxLength: 160 },
          email: { type: apigateway.JsonSchemaType.STRING, minLength: 3, maxLength: 254 },
          phone: { type: apigateway.JsonSchemaType.STRING, maxLength: 40 },
          location: { type: apigateway.JsonSchemaType.STRING, maxLength: 200 },
          serviceInterest: { type: apigateway.JsonSchemaType.STRING, maxLength: 120 },
          projectDescription: {
            type: apigateway.JsonSchemaType.STRING,
            minLength: 1,
            maxLength: 4000,
          },
          preferredContactMethod: {
            type: apigateway.JsonSchemaType.STRING,
            enum: ['EMAIL', 'PHONE'],
          },
          sourcePage: { type: apigateway.JsonSchemaType.STRING, maxLength: 500 },
          referrer: { type: apigateway.JsonSchemaType.STRING, maxLength: 1000 },
          website: { type: apigateway.JsonSchemaType.STRING, maxLength: 500 },
        },
      },
    });
    const validator = api.addRequestValidator('LeadBodyValidator', {
      requestValidatorName: 'lead-body-validator',
      validateRequestBody: true,
      validateRequestParameters: false,
    });
    const postMethod = api.root
      .addResource('api')
      .addResource('leads')
      .addMethod('POST', new apigateway.LambdaIntegration(handler), {
        authorizationType: apigateway.AuthorizationType.NONE,
        requestModels: { 'application/json': leadModel },
        requestValidator: validator,
      });

    for (const acknowledgment of [
        {
          id: 'AwsSolutions-APIG4',
          reason:
            'Public marketing lead intake is intentionally unauthenticated and protected by schema validation, throttling, a honeypot, and bounded Lambda concurrency.',
        },
        {
          id: 'AwsSolutions-COG4',
          reason: 'Prospective customers must be able to submit a lead without a customer account.',
        },
      ]) {
      Validations.of(postMethod).acknowledge(acknowledgment);
    }
    for (const acknowledgment of [
        {
          id: 'AwsSolutions-L1',
          reason: 'The function explicitly uses the current Node.js 22 Lambda runtime.',
        },
        {
          id: 'AwsSolutions-IAM4',
          reason: 'CDK attaches the Lambda basic execution policy for runtime log delivery.',
        },
        {
          id: 'AwsSolutions-IAM5',
          reason: 'X-Ray trace publishing APIs require Resource *.',
        },
      ]) {
      Validations.of(handler).acknowledge(acknowledgment);
    }
    for (const acknowledgment of [
        {
          id: 'AwsSolutions-IAM4',
          reason: 'API Gateway uses its AWS-managed account role to publish execution logs.',
        },
        {
          id: 'AwsSolutions-APIG3',
          reason:
            'The bounded lead endpoint starts with API throttling and validation; WAF will be added only if observed abuse justifies its recurring cost.',
        },
      ]) {
      Validations.of(api).acknowledge(acknowledgment);
    }
    for (const acknowledgment of [
      {
        id: 'AwsSolutions-IAM4',
        reason:
          'Only CDK-generated Lambda basic logging and API Gateway logging roles use AWS-managed service policies.',
      },
      {
        id: 'AwsSolutions-IAM5',
        reason:
          'Only X-Ray trace publishing uses Resource * because those APIs do not support resource-level permissions.',
      },
      {
        id: 'AwsSolutions-APIG2',
        reason:
          'The POST method has an explicit JSON schema request model and body request validator plus deeper Lambda validation.',
      },
    ]) {
      Validations.of(this).acknowledge(acknowledgment);
    }
    acknowledgeRecursively(handler, [
      {
        id: 'AwsSolutions-IAM4',
        reason: 'CDK attaches only Lambda basic execution for runtime log delivery.',
      },
      {
        id: 'AwsSolutions-IAM5',
        reason: 'X-Ray trace publishing APIs require Resource *.',
      },
    ]);
    acknowledgeGranularMetadataRecursively(handler, {
      'AwsSolutions-IAM4[Policy::arn:<AWS::Partition>:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole]':
        'CDK attaches only Lambda basic execution for runtime log delivery.',
      'AwsSolutions-IAM5[Resource::*]':
        'X-Ray PutTraceSegments and PutTelemetryRecords do not support resource-level permissions.',
    });
    acknowledgeRecursively(api, [
      {
        id: 'AwsSolutions-IAM4',
        reason: 'API Gateway uses its AWS-managed account role only for execution log delivery.',
      },
      {
        id: 'AwsSolutions-APIG2',
        reason:
          'The POST method has an explicit JSON schema model, body validator, and deeper Lambda validation.',
      },
    ]);
    acknowledgeGranularMetadataRecursively(api, {
      'AwsSolutions-IAM4[Policy::arn:<AWS::Partition>:iam::aws:policy/service-role/AmazonAPIGatewayPushToCloudWatchLogs]':
        'API Gateway uses its AWS-managed account role only for execution log delivery.',
    });

    this.api = api;
    this.apiDomainName = `${api.restApiId}.execute-api.${this.region}.${this.urlSuffix}`;
    this.handler = handler;
    this.table = table;

    new CfnOutput(this, 'LeadApiUrl', { value: api.urlForPath('/api/leads') });
  }
}
