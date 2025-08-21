import { When } from '@cucumber/cucumber';
import { CchWorld } from '../support/world';
import fs from 'fs';
import path from 'path';
import { GetQueueAttributesCommand, SendMessageCommand, GetQueueUrlCommand } from '@aws-sdk/client-sqs';
import { interpolate } from '../support/interpolator';

async function sendToQueue(world: CchWorld, queueUrl: string, body: any) {
  let isFifo = false;
  try {
    const attrs = await world.sqs.send(new GetQueueAttributesCommand({ QueueUrl: queueUrl, AttributeNames: ['FifoQueue'] }));
    isFifo = (attrs.Attributes?.FifoQueue || 'false').toLowerCase() === 'true';
  } catch {}
  const params: any = { QueueUrl: queueUrl, MessageBody: JSON.stringify(body) };
  if (isFifo) {
    params.MessageGroupId = world.ctx.correlationId;
    params.MessageDeduplicationId = world.ctx.workflowInstanceId;
  }
  await world.sqs.send(new SendMessageCommand(params));
}

async function resolveQueueUrl(world: CchWorld, configured: string | undefined): Promise<string> {
  const val = (configured || '').trim();
  if (!val || val.toLowerCase() === 'null' || val.toLowerCase() === 'undefined') {
    throw new Error('COMMAND_QUEUE_URL not set or invalid');
  }
  if (val.startsWith('arn:aws:sqs:')) {
    // arn:aws:sqs:{region}:{account}:{queueName}
    const parts = val.split(':');
    const queueName = parts[5];
    const accountId = parts[4];
    if (!queueName) throw new Error(`Invalid SQS ARN: ${val}`);
    const resp = await world.sqs.send(new GetQueueUrlCommand({ QueueName: queueName, QueueOwnerAWSAccountId: accountId }));
    if (!resp.QueueUrl) throw new Error(`Failed to resolve QueueUrl from ARN: ${val}`);
    return resp.QueueUrl;
  }
  return val; // assume it's already a QueueUrl
}

// Orchestrator start: always via SQS
When('I start the orchestrator scenario via {string}', async function(this: CchWorld, mode: string) {
  if (mode !== 'sqs') throw new Error('Orchestrator start only supports "sqs"');
  const scenarioPath = (this.ctx as any).scenarioPath as string;
  let initial = JSON.parse(fs.readFileSync(path.join(scenarioPath, 'initial.json'), 'utf-8'));
  // inject dynamic fields into context for interpolation (merge, do not overwrite)
  (this.ctx as any).ctx = { ...(this.ctx as any).ctx, correlationId: this.ctx.correlationId, workflowInstanceId: this.ctx.workflowInstanceId, businessKey: this.ctx.businessKey };
  initial = interpolate(initial, this.ctx, this.env);
  // Ensure consignmentURI is injected if available from context
  if (this.ctx && (this.ctx as any).ctx && (this.ctx as any).ctx.consignmentURI) {
    initial.command = initial.command || {};
    initial.command.payload = initial.command.payload || {};
    if (!initial.command.payload.consignmentURI) {
      initial.command.payload.consignmentURI = (this.ctx as any).ctx.consignmentURI;
    }
  }
  if (this.ctx.workflowDefinitionUri) initial.workflowDefinitionURI = this.ctx.workflowDefinitionUri;
  const url = await resolveQueueUrl(this, this.env.COMMAND_QUEUE_URL);
  await sendToQueue(this, url, initial);
  this.attach(`Sent orchestrator start to ${url}`);
});

// Backward-compatible generic phrasing used by starter scenario (maps to orchestrator SQS start)
When('I start the scenario via {string}', async function(this: CchWorld, mode: string) {
  const scenarioPath = (this.ctx as any).scenarioPath as string;
  const initial = JSON.parse(fs.readFileSync(path.join(scenarioPath, 'initial.json'), 'utf-8'));
  let payload = interpolate(initial, this.ctx, this.env);
  if (this.ctx.workflowDefinitionUri) payload.workflowDefinitionURI = this.ctx.workflowDefinitionUri;
  if (mode === 'sqs') {
    const url = await resolveQueueUrl(this, this.env.COMMAND_QUEUE_URL);
    await sendToQueue(this, url, payload);
    this.attach(`Sent orchestrator start to ${url}`);
  } else {
    throw new Error('Generic start currently only supports "sqs". Use controller start for s3.');
  }
});


