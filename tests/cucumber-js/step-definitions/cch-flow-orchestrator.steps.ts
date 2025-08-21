import { When } from '@cucumber/cucumber';
import { CchWorld } from '../support/world';
import fs from 'fs';
import path from 'path';
import { GetQueueAttributesCommand, SendMessageCommand } from '@aws-sdk/client-sqs';
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

// Orchestrator start: always via SQS
When('I start the orchestrator scenario via {string}', async function(this: CchWorld, mode: string) {
  if (mode !== 'sqs') throw new Error('Orchestrator start only supports "sqs"');
  const scenarioPath = (this.ctx as any).scenarioPath as string;
  let initial = JSON.parse(fs.readFileSync(path.join(scenarioPath, 'initial.json'), 'utf-8'));
  // inject dynamic fields into context for interpolation
  (this.ctx as any).ctx = { correlationId: this.ctx.correlationId, workflowInstanceId: this.ctx.workflowInstanceId, businessKey: this.ctx.businessKey };
  initial = interpolate(initial, this.ctx, this.env);
  if (this.ctx.workflowDefinitionUri) initial.workflowDefinitionURI = this.ctx.workflowDefinitionUri;
  const url = this.env.COMMAND_QUEUE_URL;
  if (!url) throw new Error('COMMAND_QUEUE_URL not set');
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
    const url = this.env.COMMAND_QUEUE_URL;
    if (!url) throw new Error('COMMAND_QUEUE_URL not set');
    await sendToQueue(this, url, payload);
    this.attach(`Sent orchestrator start to ${url}`);
  } else {
    throw new Error('Generic start currently only supports "sqs". Use controller start for s3.');
  }
});


