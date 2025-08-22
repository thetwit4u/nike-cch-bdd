import dotenv from 'dotenv';
// Allow selecting env file via:
// 1) CLI: --env dev (or --env=dev) or --env-file path
// 2) Env vars: ENV=dev or BDD_ENV=dev or ENV_FILE=/path/to/file
function getCliArg(name: string): string | undefined {
  const idx = process.argv.findIndex(a => a === `--${name}` || a.startsWith(`--${name}=`));
  if (idx === -1) return undefined;
  const val = process.argv[idx].includes('=') ? process.argv[idx].split('=')[1] : process.argv[idx + 1];
  return val;
}
const cliEnv = getCliArg('env');
const cliEnvFile = getCliArg('env-file');
const selectedEnv = cliEnv || process.env.ENV || process.env.BDD_ENV;
const selectedEnvFile = cliEnvFile || process.env.ENV_FILE || (selectedEnv ? `tests/cucumber-js/.env.${selectedEnv}` : 'tests/cucumber-js/.local.env');
dotenv.config({ path: selectedEnvFile });

import { setWorldConstructor, IWorldOptions, World, setDefaultTimeout } from '@cucumber/cucumber';
import { SQSClient } from '@aws-sdk/client-sqs';
import { SNSClient } from '@aws-sdk/client-sns';
import { S3Client } from '@aws-sdk/client-s3';
import { STSClient } from '@aws-sdk/client-sts';
import { LambdaClient } from '@aws-sdk/client-lambda';
import { randomUUID } from 'crypto';

export interface RunnerContext {
  correlationId: string;
  workflowInstanceId: string;
  captures: Record<string, unknown>;
  businessKey?: string;
  workflowDefinitionUri?: string;
}

export class CchWorld extends World {
  sqs: SQSClient;
  sns: SNSClient;
  s3: S3Client;
  sts: STSClient;
  lambda: LambdaClient;
  ctx: RunnerContext;
  env: Record<string, string>;

  constructor(options: IWorldOptions) {
    super(options);
    const region = process.env.AWS_REGION || 'eu-west-1';
    this.sqs = new SQSClient({ region });
    this.sns = new SNSClient({ region });
    this.s3 = new S3Client({ region });
    this.sts = new STSClient({ region });
    this.lambda = new LambdaClient({ region });
    const user = process.env.TEST_USER || process.env.USER || 'user';
    const now = new Date();
    const nowCompact = now.toISOString().replace(/[-:TZ.]/g, '').slice(0, 14);
    const businessKey = '';
    const correlationId = `${businessKey ? businessKey + '-' : ''}${user}-${nowCompact}`;
    this.ctx = {
      correlationId,
      workflowInstanceId: randomUUID(),
      captures: {},
      businessKey,
    };
    this.env = process.env as Record<string, string>;
  }
}

setWorldConstructor(CchWorld);

// Increase default step timeout based on env (default 120s)
const defaultTimeoutSec = Number(process.env.SCENARIO_TIMEOUT_SECONDS || '120');
setDefaultTimeout(defaultTimeoutSec * 1000);


