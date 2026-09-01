import {
  Duration,
  RemovalPolicy,
  Stack,
  StackProps,
  Validations,
  aws_budgets as budgets,
  aws_cloudfront as cloudfront,
  aws_cloudtrail as cloudtrail,
  aws_cloudwatch as cloudwatch,
  aws_logs as logs,
  aws_cloudwatch_actions as cloudwatchActions,
  aws_dynamodb as dynamodb,
  aws_lambda as lambda,
  aws_s3 as s3,
  aws_sns as sns,
  aws_sns_subscriptions as subscriptions,
} from 'aws-cdk-lib';
import { Construct } from 'constructs';
import { GroundTruthConfig } from './config';

export interface ObservabilityStackProps extends StackProps {
  readonly config: GroundTruthConfig;
  readonly distribution: cloudfront.Distribution;
  readonly leadHandler: lambda.IFunction;
  readonly leadTable: dynamodb.ITable;
  readonly apiName: string;
}

export class GroundTruthObservabilityStack extends Stack {
  public constructor(scope: Construct, id: string, props: ObservabilityStackProps) {
    super(scope, id, props);

    const production = props.config.environment === 'prod';
    const removalPolicy = production ? RemovalPolicy.RETAIN : RemovalPolicy.DESTROY;
    const topic = new sns.Topic(this, 'OperationsTopic', {
      topicName: `gts-operations-${props.config.environment}`,
      displayName: `GroundTruth ${props.config.environment} operational alarms`,
      enforceSSL: true,
    });
    topic.addSubscription(new subscriptions.EmailSubscription(props.config.notificationEmail));

    const lambdaErrorRate = new cloudwatch.Alarm(this, 'LambdaErrorRate', {
      alarmName: `gts-${props.config.environment}-lead-lambda-error-rate`,
      metric: new cloudwatch.MathExpression({
        expression: 'IF(invocations > 0, errors * 100 / invocations, 0)',
        usingMetrics: {
          errors: props.leadHandler.metricErrors({ period: Duration.minutes(1) }),
          invocations: props.leadHandler.metricInvocations({ period: Duration.minutes(1) }),
        },
        period: Duration.minutes(1),
        label: 'Lambda error rate',
      }),
      threshold: 5,
      evaluationPeriods: 3,
      datapointsToAlarm: 2,
      comparisonOperator: cloudwatch.ComparisonOperator.GREATER_THAN_THRESHOLD,
      treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
    });

    const apiErrors = new cloudwatch.Alarm(this, 'ApiServerErrors', {
      alarmName: `gts-${props.config.environment}-lead-api-5xx`,
      metric: new cloudwatch.Metric({
        namespace: 'AWS/ApiGateway',
        metricName: '5XXError',
        dimensionsMap: { ApiName: props.apiName },
        statistic: 'Sum',
        period: Duration.minutes(1),
      }),
      threshold: 2,
      evaluationPeriods: 3,
      datapointsToAlarm: 2,
      comparisonOperator: cloudwatch.ComparisonOperator.GREATER_THAN_OR_EQUAL_TO_THRESHOLD,
      treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
    });

    const cloudFront5xx = new cloudwatch.Alarm(this, 'CloudFrontServerErrorRate', {
      alarmName: `gts-${props.config.environment}-cloudfront-5xx-rate`,
      metric: props.distribution.metric5xxErrorRate({ period: Duration.minutes(1) }),
      threshold: 5,
      evaluationPeriods: 3,
      datapointsToAlarm: 2,
      comparisonOperator: cloudwatch.ComparisonOperator.GREATER_THAN_THRESHOLD,
      treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
    });

    const cloudFront4xx = new cloudwatch.Alarm(this, 'CloudFrontClientErrorRate', {
      alarmName: `gts-${props.config.environment}-cloudfront-4xx-rate`,
      metric: props.distribution.metric4xxErrorRate({ period: Duration.minutes(5) }),
      threshold: 10,
      evaluationPeriods: 3,
      datapointsToAlarm: 2,
      comparisonOperator: cloudwatch.ComparisonOperator.GREATER_THAN_THRESHOLD,
      treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
    });

    const leadThrottles = new cloudwatch.Alarm(this, 'LeadTableThrottles', {
      alarmName: `gts-${props.config.environment}-lead-table-throttles`,
      metric: props.leadTable.metricThrottledRequestsForOperations({
        operations: [dynamodb.Operation.PUT_ITEM, dynamodb.Operation.UPDATE_ITEM],
        period: Duration.minutes(1),
      }),
      threshold: 1,
      evaluationPeriods: 3,
      datapointsToAlarm: 2,
      comparisonOperator: cloudwatch.ComparisonOperator.GREATER_THAN_OR_EQUAL_TO_THRESHOLD,
      treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
    });

    const leadProcessingFailures = new logs.MetricFilter(this, 'LeadProcessingFailures', {
      logGroup: logs.LogGroup.fromLogGroupName(this, 'LeadLogGroup', `/gts/${props.config.environment}/lead-intake`),
      metricNamespace: 'GroundTruth/LeadIntake',
      metricName: 'ProcessingFailures',
      filterPattern: logs.FilterPattern.anyTerm('lead_persistence_failed', 'lead_notification_failed', 'configuration_error'),
      metricValue: '1',
    }).metric({ period: Duration.minutes(1), statistic: 'Sum' });
    const leadFailures = new cloudwatch.Alarm(this, 'LeadProcessingFailuresAlarm', {
      alarmName: `gts-${props.config.environment}-lead-processing-failures`,
      metric: leadProcessingFailures,
      threshold: 1,
      evaluationPeriods: 3,
      datapointsToAlarm: 2,
      comparisonOperator: cloudwatch.ComparisonOperator.GREATER_THAN_OR_EQUAL_TO_THRESHOLD,
      treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
    });

    const alarms = [lambdaErrorRate, apiErrors, cloudFront5xx, cloudFront4xx, leadThrottles, leadFailures];
    const action = new cloudwatchActions.SnsAction(topic);
    alarms.forEach((alarm) => alarm.addAlarmAction(action));

    const dashboard = new cloudwatch.Dashboard(this, 'OperationsDashboard', {
      dashboardName: `gts-${props.config.environment}-operations`,
    });
    dashboard.addWidgets(
      new cloudwatch.AlarmStatusWidget({ title: 'GroundTruth alarm status', alarms, width: 24 }),
      new cloudwatch.GraphWidget({
        title: 'Lead API and Lambda errors',
        left: [props.leadHandler.metricErrors(), props.leadHandler.metricThrottles()],
        width: 12,
      }),
      new cloudwatch.GraphWidget({
        title: 'CloudFront error rates',
        left: [props.distribution.metric4xxErrorRate(), props.distribution.metric5xxErrorRate()],
        width: 12,
      }),
    );

    const auditAccessLogs = new s3.Bucket(this, 'AuditAccessLogs', {
      bucketName: `gts-audit-access-${props.config.environment}-${this.account}-${this.region}`,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      encryption: s3.BucketEncryption.S3_MANAGED,
      enforceSSL: true,
      lifecycleRules: [{ expiration: Duration.days(production ? 365 : 90) }],
      removalPolicy,
      autoDeleteObjects: !production,
    });
    Validations.of(auditAccessLogs).acknowledge({
      id: 'AwsSolutions-S1',
      reason: 'Dedicated audit access-log destination does not log to itself to avoid recursion.',
    });
    const trailBucket = new s3.Bucket(this, 'AuditBucket', {
      bucketName: `gts-audit-${props.config.environment}-${this.account}-${this.region}`,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      encryption: s3.BucketEncryption.S3_MANAGED,
      enforceSSL: true,
      versioned: true,
      serverAccessLogsBucket: auditAccessLogs,
      serverAccessLogsPrefix: 'cloudtrail-bucket/',
      lifecycleRules: [{ expiration: Duration.days(production ? 365 : 90) }],
      removalPolicy,
      autoDeleteObjects: !production,
    });
    new cloudtrail.Trail(this, 'ManagementTrail', {
      trailName: `gts-management-${props.config.environment}`,
      bucket: trailBucket,
      includeGlobalServiceEvents: true,
      isMultiRegionTrail: true,
      enableFileValidation: true,
      sendToCloudWatchLogs: false,
    });

    new budgets.CfnBudget(this, 'MonthlyBudget', {
      budget: {
        budgetName: `GroundTruth-${props.config.environment}-Monthly-v2`,
        budgetType: 'COST',
        timeUnit: 'MONTHLY',
        budgetLimit: { amount: props.config.budgetUsd, unit: 'USD' },
        costFilters: {
          TagKeyValue: [`user:Project$${props.config.tags.Project}`],
        },
      },
      notificationsWithSubscribers: [
        {
          notification: {
            notificationType: 'ACTUAL',
            comparisonOperator: 'GREATER_THAN',
            threshold: 80,
            thresholdType: 'PERCENTAGE',
          },
          subscribers: [{ subscriptionType: 'EMAIL', address: props.config.notificationEmail }],
        },
        {
          notification: {
            notificationType: 'FORECASTED',
            comparisonOperator: 'GREATER_THAN',
            threshold: 100,
            thresholdType: 'PERCENTAGE',
          },
          subscribers: [{ subscriptionType: 'EMAIL', address: props.config.notificationEmail }],
        },
      ],
    });
  }
}
