import { When } from '@cucumber/cucumber';
import { CchWorld } from '../support/world';
import fs from 'fs';
import path from 'path';
import { uploadJson } from '../support/s3';
import { GetQueueAttributesCommand, SendMessageCommand } from '@aws-sdk/client-sqs';
import { interpolate } from '../support/interpolator';
import { randomUUID } from 'crypto';

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
  let initial = JSON.parse(fs.readFileSync(path.join(scenarioPath, 'initial.json'), 'utf-8'));
  // Support sample-overlay: if `$sample` path is provided, load sample and override only specified fields
  if ((initial as any).$sample) {
    const sampleRel = (initial as any).$sample as string;
    const samplePath = path.join(scenarioPath, sampleRel);
    let sample = JSON.parse(fs.readFileSync(samplePath, 'utf-8'));
    // Prepare context for interpolation
    (this.ctx as any).captures = { ...(this.ctx as any).captures, controllerStartUuid: (this.ctx as any).captures?.controllerStartUuid || randomUUID() };
    (this.ctx as any).ctx = { ...(this.ctx as any).ctx, correlationId: this.ctx.correlationId, workflowInstanceId: this.ctx.workflowInstanceId, captures: (this.ctx as any).captures };
    // Only allow overriding notification.houseAirwayBillNumber
    const overrideHawb = (initial as any).notification?.houseAirwayBillNumber;
    if (overrideHawb) {
      const hawb = interpolate(overrideHawb, this.ctx, this.env) as unknown as string;
      if (!sample.notification) sample.notification = {};
      sample.notification.houseAirwayBillNumber = hawb;
    }
    initial = sample;
  }
  // Prepare dynamic ctx (if not set by sample-overlay path)
  (this.ctx as any).captures = { ...(this.ctx as any).captures, controllerStartUuid: (this.ctx as any).captures?.controllerStartUuid || randomUUID() };
  (this.ctx as any).ctx = { ...(this.ctx as any).ctx, correlationId: this.ctx.correlationId, workflowInstanceId: this.ctx.workflowInstanceId, captures: (this.ctx as any).captures };
  // Interpolate any tokens present (note: with sample-overlay, only HAWB is interpolated above)
  initial = interpolate(initial, this.ctx, this.env);
  // Also include identifiers for traceability
  (initial as any).workflowInstanceId = this.ctx.workflowInstanceId;
  (initial as any).correlationId = this.ctx.correlationId;
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


