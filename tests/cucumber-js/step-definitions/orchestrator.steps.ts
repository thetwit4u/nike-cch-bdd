import { When } from '@cucumber/cucumber';
import { CchWorld } from '../support/world';
import fs from 'fs';
import path from 'path';
import { GetQueueAttributesCommand, SendMessageCommand } from '@aws-sdk/client-sqs';
import { uploadJson } from '../support/s3';
import { interpolate } from '../support/interpolator';

When('I start the scenario via {string}', async function(this: CchWorld, mode: string) {
  const scenarioPath = (this.ctx as any).scenarioPath as string;
  let initial = JSON.parse(fs.readFileSync(path.join(scenarioPath, 'initial.json'), 'utf-8'));
  // interpolate placeholders
  (this.ctx as any).ctx = { ...(this.ctx as any).ctx, correlationId: this.ctx.correlationId, workflowInstanceId: this.ctx.workflowInstanceId, businessKey: this.ctx.businessKey };
  initial = interpolate(initial, this.ctx, this.env);
  // inject optional definition URI
  if (this.ctx.workflowDefinitionUri) initial.workflowDefinitionURI = this.ctx.workflowDefinitionUri;
  if (mode === 'sqs') {
    const url = this.env.COMMAND_QUEUE_URL;
    if (!url) throw new Error('COMMAND_QUEUE_URL not set');
    // Detect FIFO to set required attributes
    let isFifo = false;
    try {
      const attrs = await this.sqs.send(new GetQueueAttributesCommand({ QueueUrl: url, AttributeNames: ['FifoQueue'] }));
      isFifo = (attrs.Attributes?.FifoQueue || 'false').toLowerCase() === 'true';
    } catch {}
    const params: any = { QueueUrl: url, MessageBody: JSON.stringify(initial) };
    if (isFifo) {
      params.MessageGroupId = this.ctx.correlationId;
      params.MessageDeduplicationId = this.ctx.workflowInstanceId;
    }
    await this.sqs.send(new SendMessageCommand(params));
    this.attach(`Sent initial message to SQS ${url}`);
  } else if (mode === 's3') {
    const bucket = this.env.START_S3_BUCKET; const prefix = this.env.START_S3_KEY_PREFIX || 'workflows/';
    if (!bucket) throw new Error('START_S3_BUCKET not set');
    const key = `${prefix}${this.ctx.correlationId}.json`;
    await uploadJson(this.s3, bucket, key, initial);
    this.attach(`Uploaded s3://${bucket}/${key}`);
  } else {
    throw new Error(`Unknown start mode ${mode}`);
  }
});


