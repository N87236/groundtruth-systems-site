import { SESv2Client, SendEmailCommand } from '@aws-sdk/client-sesv2';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, PutCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import type { APIGatewayProxyHandler } from 'aws-lambda';
import { randomUUID } from 'node:crypto';
import { validateLead } from './validation';

const documentClient = DynamoDBDocumentClient.from(new DynamoDBClient({}), {
  marshallOptions: { removeUndefinedValues: true },
});
const ses = new SESv2Client({});

const tableName = process.env.LEADS_TABLE_NAME;
const notificationEmail = process.env.NOTIFICATION_EMAIL;
const senderEmail = process.env.SENDER_EMAIL;

const json = (statusCode: number, body: Record<string, unknown>) => ({
  statusCode,
  headers: {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
  },
  body: JSON.stringify(body),
});

export const handler: APIGatewayProxyHandler = async (event, context) => {
  if (!tableName || !notificationEmail || !senderEmail) {
    console.error(JSON.stringify({ event: 'configuration_error', requestId: context.awsRequestId }));
    return json(500, { message: 'Unable to accept requests at this time.' });
  }
  if (!event.body || Buffer.byteLength(event.body, 'utf8') > 12_000) {
    return json(400, { message: 'Invalid request.' });
  }

  let body: unknown;
  try {
    body = JSON.parse(event.body);
  } catch {
    return json(400, { message: 'Invalid request.' });
  }
  const result = validateLead(body);
  if (!result.ok) {
    console.info(
      JSON.stringify({
        event: 'lead_rejected',
        requestId: context.awsRequestId,
        categories: result.errors,
      }),
    );
    return json(400, { message: 'Please review the submitted fields.', errors: result.errors });
  }
  if (result.honeypot) {
    console.info(JSON.stringify({ event: 'honeypot_rejected', requestId: context.awsRequestId }));
    return json(202, { message: 'Request received.' });
  }

  const leadId = randomUUID();
  const timestamp = new Date().toISOString();
  const item = {
    leadId,
    timestamp,
    ...result.lead,
    status: 'NEW',
    notificationStatus: 'PENDING',
  };

  try {
    await documentClient.send(
      new PutCommand({
        TableName: tableName,
        Item: item,
        ConditionExpression: 'attribute_not_exists(leadId)',
      }),
    );
  } catch (error) {
    console.error(
      JSON.stringify({
        event: 'lead_persistence_failed',
        leadId,
        requestId: context.awsRequestId,
        errorName: error instanceof Error ? error.name : 'UnknownError',
      }),
    );
    return json(500, { message: 'Unable to accept requests at this time.' });
  }

  try {
    await ses.send(
      new SendEmailCommand({
        FromEmailAddress: senderEmail,
        Destination: { ToAddresses: [notificationEmail] },
        Content: {
          Simple: {
            Subject: { Data: `GroundTruth lead ${leadId}` },
            Body: {
              Text: {
                Data: [
                  `Lead ID: ${leadId}`,
                  `Received: ${timestamp}`,
                  `Name: ${result.lead.name}`,
                  `Company: ${result.lead.company ?? ''}`,
                  `Email: ${result.lead.email}`,
                  `Phone: ${result.lead.phone ?? ''}`,
                  `Location: ${result.lead.location ?? ''}`,
                  `Service: ${result.lead.serviceInterest ?? ''}`,
                  `Preferred contact: ${result.lead.preferredContactMethod ?? ''}`,
                  '',
                  result.lead.projectDescription,
                ].join('\n'),
              },
            },
          },
        },
      }),
    );
    await documentClient.send(
      new UpdateCommand({
        TableName: tableName,
        Key: { leadId },
        UpdateExpression: 'SET notificationStatus = :sent',
        ExpressionAttributeValues: { ':sent': 'SENT' },
      }),
    );
  } catch (error) {
    console.error(
      JSON.stringify({
        event: 'lead_notification_failed',
        leadId,
        requestId: context.awsRequestId,
        errorName: error instanceof Error ? error.name : 'UnknownError',
      }),
    );
    await documentClient
      .send(
        new UpdateCommand({
          TableName: tableName,
          Key: { leadId },
          UpdateExpression: 'SET notificationStatus = :failed',
          ExpressionAttributeValues: { ':failed': 'FAILED' },
        }),
      )
      .catch(() => undefined);
  }

  console.info(JSON.stringify({ event: 'lead_accepted', leadId, requestId: context.awsRequestId }));
  return json(202, {
    leadId,
    message: 'Request received. GroundTruth Systems will review your operational requirements and follow up shortly.',
  });
};
