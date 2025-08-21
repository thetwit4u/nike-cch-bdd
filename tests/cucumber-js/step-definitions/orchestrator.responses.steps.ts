import { When } from '@cucumber/cucumber';
import { CchWorld } from '../support/world';
import fs from 'fs';
import path from 'path';
import { GetQueueAttributesCommand, SendMessageCommand } from '@aws-sdk/client-sqs';
import { interpolate } from '../support/interpolator';

async function send(world: CchWorld, body: any) {
  const url = world.env.COMMAND_QUEUE_URL;
  if (!url) throw new Error('COMMAND_QUEUE_URL not set');
  let isFifo = false;
  try {
    const attrs = await world.sqs.send(new GetQueueAttributesCommand({ QueueUrl: url, AttributeNames: ['FifoQueue'] }));
    isFifo = (attrs.Attributes?.FifoQueue || 'false').toLowerCase() === 'true';
  } catch {}
  const params: any = { QueueUrl: url, MessageBody: JSON.stringify(body) };
  if (isFifo) {
    params.MessageGroupId = world.ctx.correlationId;
    params.MessageDeduplicationId = world.ctx.workflowInstanceId + '-resp';
  }
  await world.sqs.send(new SendMessageCommand(params));
}

When('I send ASYNC_RESP from fixture {string}', async function(this: CchWorld, fixtureRel: string) {
  const p = path.join((this.ctx as any).scenarioPath, fixtureRel);
  let msg = JSON.parse(fs.readFileSync(p, 'utf-8'));
  msg = interpolate(msg, this.ctx, this.env);
  msg.workflowInstanceId = this.ctx.workflowInstanceId;
  msg.correlationId = this.ctx.correlationId;
  await send(this, msg);
});

When('I send EVENT_WAIT_RESP from fixture {string}', async function(this: CchWorld, fixtureRel: string) {
  const p = path.join((this.ctx as any).scenarioPath, fixtureRel);
  let msg = JSON.parse(fs.readFileSync(p, 'utf-8'));
  msg = interpolate(msg, this.ctx, this.env);
  msg.workflowInstanceId = this.ctx.workflowInstanceId;
  msg.correlationId = this.ctx.correlationId;
  await send(this, msg);
});


