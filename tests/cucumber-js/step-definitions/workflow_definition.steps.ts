import { Given } from '@cucumber/cucumber';
import { CchWorld } from '../support/world';
import fs from 'fs';
import path from 'path';
import { uploadText } from '../support/s3';
import { uploadJson } from '../support/s3';
import { interpolate } from '../support/interpolator';

Given('I set workflow definition from local file {string} with s3 dest {string}', async function(this: CchWorld, localRel: string, s3Key: string) {
  const bucket = this.env.START_S3_BUCKET;
  if (!bucket) throw new Error('START_S3_BUCKET not set (used as definitions bucket here)');
  const p = path.join((this.ctx as any).scenarioPath, localRel);
  const yaml = fs.readFileSync(p, 'utf-8');
  await uploadText(this.s3, bucket, s3Key, yaml, 'application/x-yaml');
  this.ctx.workflowDefinitionUri = `s3://${bucket}/${s3Key}`;
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
  (this.ctx as any).ctx.consignmentUri = `s3://${bucket}/${effectiveKey}`;
});


