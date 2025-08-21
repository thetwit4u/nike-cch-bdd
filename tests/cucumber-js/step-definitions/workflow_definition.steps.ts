import { Given } from '@cucumber/cucumber';
import { CchWorld } from '../support/world';
import fs from 'fs';
import path from 'path';
import { uploadText, uploadJson, grantReadForRole } from '../support/s3';
import { GetQueueAttributesCommand } from '@aws-sdk/client-sqs';
import { ListEventSourceMappingsCommand, GetFunctionConfigurationCommand } from '@aws-sdk/client-lambda';
import { interpolate } from '../support/interpolator';

Given('I set workflow definition from local file {string} with s3 dest {string}', async function(this: CchWorld, localRel: string, s3Key: string) {
  const bucket = this.env.START_S3_BUCKET;
  if (!bucket) throw new Error('START_S3_BUCKET not set (used as definitions bucket here)');
  const p = path.join((this.ctx as any).scenarioPath, localRel);
  const yaml = fs.readFileSync(p, 'utf-8');
  await uploadText(this.s3, bucket, s3Key, yaml, 'application/x-yaml');
  this.ctx.workflowDefinitionUri = `s3://${bucket}/${s3Key}`;
  // Derive orchestrator role ARN from command queue attributes if not provided
  let roleArn = this.env.ORCHESTRATOR_LAMBDA_ROLE_ARN;
  if (!roleArn && this.env.COMMAND_QUEUE_URL) {
    try {
      // Derive QueueArn from QueueUrl (if an ARN was provided as URL, use directly)
      const v = this.env.COMMAND_QUEUE_URL.trim();
      let queueArn: string | undefined = v.startsWith('arn:aws:sqs:') ? v : undefined;
      if (!queueArn) {
        const attrs = await this.sqs.send(new GetQueueAttributesCommand({
          QueueUrl: v,
          AttributeNames: ['QueueArn']
        }));
        queueArn = attrs.Attributes?.QueueArn;
      }
      if (queueArn) {
        // Find Lambda event source mappings for this queue
        const mappings = await this.lambda.send(new ListEventSourceMappingsCommand({ EventSourceArn: queueArn }));
        const mapping = (mappings.EventSourceMappings || [])[0];
        const functionArn = mapping?.FunctionArn;
        if (functionArn) {
          const cfg = await this.lambda.send(new GetFunctionConfigurationCommand({ FunctionName: functionArn }));
          if (cfg.Role) roleArn = cfg.Role;
        }
      }
    } catch {}
  }
  // Grant orchestrator lambda role read access if resolved/provided
  if (roleArn) {
    const prefix = s3Key.includes('/') ? s3Key.split('/')[0] + '/' : '';
    await grantReadForRole(this.s3, bucket, roleArn, prefix);
    this.attach(`Granted s3:GetObject for ${roleArn} on s3://${bucket}/${prefix}*`);
  }
});

Given('I set workflow definition s3 URI {string}', function(this: CchWorld, s3Uri: string) {
  this.ctx.workflowDefinitionUri = s3Uri;
});

Given('I will inject the workflow definition URI into the initial command', function(this: CchWorld) {
  // No-op: orchestrator start step already injects workflowDefinitionURI when set in ctx
  (this.ctx as any).injectDefinition = true;
});

Given('I upload consignment {string} to s3 dest {string} and set its URI in context', async function(this: CchWorld, localRel: string, s3Key: string) {
  const bucket = this.env.START_S3_BUCKET;
  if (!bucket) throw new Error('START_S3_BUCKET not set');
  const p = path.join((this.ctx as any).scenarioPath, localRel);
  const consignment = JSON.parse(fs.readFileSync(p, 'utf-8'));
  // Interpolate placeholders in the destination key (e.g., ${correlationId})
  (this.ctx as any).ctx = { ...(this.ctx as any).ctx, correlationId: this.ctx.correlationId, workflowInstanceId: this.ctx.workflowInstanceId, businessKey: this.ctx.businessKey };
  const effectiveKey = interpolate(s3Key, this.ctx, this.env) as unknown as string;
  await uploadJson(this.s3, bucket, effectiveKey, consignment);
  (this.ctx as any).ctx = (this.ctx as any).ctx || {};
  (this.ctx as any).ctx.consignmentURI = `s3://${bucket}/${effectiveKey}`;
});


