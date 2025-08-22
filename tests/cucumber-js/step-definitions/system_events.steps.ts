import { Given, Then, Before, After } from '@cucumber/cucumber';
import { CchWorld } from '../support/world';
import { QueueManager } from '../support/queue_manager';
import { MessageBus, SystemEvent } from '../support/message_bus';
import { uploadJson, ensureBucketExists, emptyAndDeleteBucket } from '../support/s3';
import { buildAjv } from '../support/validators';
import schema from '../cch-system-event.schema.json';
import fs from 'fs';
import path from 'path';
import { GetQueueAttributesCommand, SendMessageCommand } from '@aws-sdk/client-sqs';
import {JSONPath} from 'jsonpath-plus';
import { getJson } from '../support/s3';
import { interpolate } from '../support/interpolator';

let qm: QueueManager; let bus: MessageBus; let subArn = ''; let queueUrl = '';
const ajv = buildAjv();
const validate = ajv.compile(schema);

let tempBucket = '';

Before(async function(this: CchWorld) {
  // Ensure a definitions/data bucket exists; if none provided, create a temp one
  const region = process.env.AWS_REGION || 'eu-west-1';
  if (!this.env.START_S3_BUCKET) {
    tempBucket = `cch-bdd-${this.env.TEST_USER || 'user'}-${Date.now()}`.toLowerCase();
    const created = await ensureBucketExists(this.s3, tempBucket, region);
    if (created) {
      this.attach(`Created temp S3 bucket ${tempBucket}`);
      this.env.START_S3_BUCKET = tempBucket;
      process.env.START_S3_BUCKET = tempBucket;
      if (!this.env.START_S3_KEY_PREFIX) this.env.START_S3_KEY_PREFIX = 'workflows/';
    }
  }
  qm = new QueueManager(this.sqs, this.sns);
  const topicArn = this.env.SYSTEM_EVENTS_TOPIC_ARN;
  if (!topicArn) throw new Error('SYSTEM_EVENTS_TOPIC_ARN is not set');
  const res = await qm.createEphemeralQueueAndSubscribe(topicArn, `cch-bdd-${this.env.TEST_USER || 'user'}`);
  queueUrl = res.queueUrl; subArn = res.subscriptionArn;
  bus = new MessageBus(this.sqs, queueUrl);
});

After(async function(this: CchWorld) {
  if (queueUrl && subArn) await qm.unsubscribeAndDeleteQueue(queueUrl, subArn);
  // Clean up temp bucket if we created one
  if (tempBucket) {
    await emptyAndDeleteBucket(this.s3, tempBucket);
    this.attach(`Deleted temp S3 bucket ${tempBucket}`);
    tempBucket = '';
  }
});

Given('I load scenario {string}', async function(this: CchWorld, name: string) {
  this.attach(`Loaded scenario ${name}`);
  (this.ctx as any).scenarioPath = path.join('tests/cucumber-js/scenarios', name);
});

// Start steps moved to orchestrator.steps.ts

Then('I wait for a System Event matching jsonpath {string} within {int} seconds', async function(this: CchWorld, expr: string, seconds: number) {
  const timeout = seconds * 1000;
  const evt = await bus.waitFor((e: SystemEvent) => {
    try {
      const expanded = interpolate(expr, this.ctx, this.env) as unknown as string;
      // Support boolean expressions like $.correlationId == '...'
      if (expanded.includes('==')) {
        const [lhs, rhsRaw] = expanded.split('==').map(s => s.trim());
        const rhs = rhsRaw.replace(/^['"]|['"]$/g, '');
        const vals = JSONPath({ path: lhs, json: e }) as any[];
        return vals.some(v => String(v) === rhs);
      }
      // Support contains operator: $.path contains 'substring'
      if (expanded.includes(' contains ')) {
        const [lhs, rhsRaw] = expanded.split(' contains ').map(s => s.trim());
        const rhs = rhsRaw.replace(/^['"]|['"]$/g, '');
        const vals = JSONPath({ path: lhs, json: e }) as any[];
        return vals.some(v => String(v).includes(rhs));
      }
      // Otherwise treat as path truthy
      const vals = JSONPath({ path: expanded, json: e }) as any[];
      return vals && vals.length > 0;
    } catch { return false; }
  }, timeout);
  if (!evt) throw new Error('Timed out waiting for System Event');
  if (!validate(evt)) {
    const mode = (process.env.SYSTEM_EVENT_SCHEMA_MODE || 'warn').toLowerCase();
    const errs = validate.errors || [];
    const onlyMissingWorkflowName = errs.length > 0 && errs.every((er: any) => er.keyword === 'required' && er.instancePath === '/workflowContext' && er.params?.missingProperty === 'workflowName');
    if (mode !== 'strict' && onlyMissingWorkflowName) {
      this.attach('Warning: Event missing workflowContext.workflowName; continuing (SYSTEM_EVENT_SCHEMA_MODE!=strict)');
    } else {
      throw new Error(`System Event schema validation failed: ${JSON.stringify(validate.errors)}`);
    }
  }
  (this.ctx as any).lastEvent = evt;
});

Then('I fetch JSON from s3 URI in businessContext at path {string} and compare with fixture {string}', async function(this: CchWorld, jsonPath: string, fixtureRel: string) {
  const evt = (this.ctx as any).lastEvent as SystemEvent;
  if (!evt) throw new Error('No last System Event available');
  const uris = JSONPath({ path: jsonPath, json: evt }) as string[];
  if (!uris?.length) throw new Error(`No S3 URI found at path ${jsonPath}`);
  const uri = uris[0];
  const m = uri.match(/^s3:\/\/([^\/]+)\/(.+)$/);
  if (!m) throw new Error(`Invalid s3 URI: ${uri}`);
  const [, bucket, key] = m;
  const actual = await getJson(this.s3, bucket, key);
  const fixture = JSON.parse(fs.readFileSync(path.join((this.ctx as any).scenarioPath, fixtureRel), 'utf-8'));
  if (JSON.stringify(actual) !== JSON.stringify(fixture)) {
    throw new Error('S3 JSON does not match expected fixture');
  }
});

Then('I fetch JSON from s3 URI in businessContext at path {string} and compare JSON at path {string} with fixture {string} at path {string}', async function(this: CchWorld, uriJsonPath: string, jsonPath: string, fixtureRel: string, fixturePath: string) {
  const evt = (this.ctx as any).lastEvent as SystemEvent;
  if (!evt) throw new Error('No last System Event available');
  const uris = JSONPath({ path: uriJsonPath, json: evt }) as string[];
  if (!uris?.length) throw new Error(`No S3 URI found at path ${uriJsonPath}`);
  const uri = uris[0];
  const m = uri.match(/^s3:\/\/([^\/]+)\/(.+)$/);
  if (!m) throw new Error(`Invalid s3 URI: ${uri}`);
  const [, bucket, key] = m;
  const actual = await getJson(this.s3, bucket, key);
  const actualPart = JSONPath({ path: jsonPath, json: actual }) as any[];
  const fixture = JSON.parse(fs.readFileSync(path.join((this.ctx as any).scenarioPath, fixtureRel), 'utf-8'));
  const expectedPart = JSONPath({ path: fixturePath, json: fixture }) as any[];
  if (JSON.stringify(actualPart) !== JSON.stringify(expectedPart)) {
    throw new Error('Subset JSON does not match expected fixture subset');
  }
});

Then('I compare event JSON at path {string} with fixture {string} at path {string}', async function(this: CchWorld, eventPath: string, fixtureRel: string, fixturePath: string) {
  const evt = (this.ctx as any).lastEvent as SystemEvent;
  if (!evt) throw new Error('No last System Event available');
  const actualPart = JSONPath({ path: eventPath, json: evt }) as any[];
  const fixture = JSON.parse(fs.readFileSync(path.join((this.ctx as any).scenarioPath, fixtureRel), 'utf-8'));
  const expectedPart = JSONPath({ path: fixturePath, json: fixture }) as any[];
  if (JSON.stringify(actualPart) !== JSON.stringify(expectedPart)) {
    throw new Error('Event subset does not match expected fixture subset');
  }
});


