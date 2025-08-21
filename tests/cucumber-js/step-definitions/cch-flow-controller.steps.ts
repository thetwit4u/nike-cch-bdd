import { When } from '@cucumber/cucumber';
import { CchWorld } from '../support/world';
import fs from 'fs';
import path from 'path';
import { uploadJson } from '../support/s3';
import { GetQueueAttributesCommand, SendMessageCommand } from '@aws-sdk/client-sqs';

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

// Controller start: supports s3 or sqs
When('I start the controller scenario via {string}', async function(this: CchWorld, mode: string) {
  const scenarioPath = (this.ctx as any).scenarioPath as string;
  const initial = JSON.parse(fs.readFileSync(path.join(scenarioPath, 'initial.json'), 'utf-8'));
  initial.workflowInstanceId = this.ctx.workflowInstanceId;
  initial.correlationId = this.ctx.correlationId;
  if (mode === 's3') {
    const bucket = this.env.START_S3_BUCKET; const prefix = this.env.START_S3_KEY_PREFIX || 'workflows/';
    if (!bucket) throw new Error('START_S3_BUCKET not set');
    const key = `${prefix}${this.ctx.correlationId}.json`;
    await uploadJson(this.s3, bucket, key, initial);
    this.attach(`Uploaded controller start to s3://${bucket}/${key}`);
  } else if (mode === 'sqs') {
    const url = this.env.CONTROLLER_QUEUE_URL;
    if (!url) throw new Error('CONTROLLER_QUEUE_URL not set');
    await sendToQueue(this, url, initial);
    this.attach(`Sent controller start to ${url}`);
  } else {
    throw new Error(`Unknown controller start mode ${mode}`);
  }
});


