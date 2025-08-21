import { SQSClient, ReceiveMessageCommand, DeleteMessageCommand } from '@aws-sdk/client-sqs';

export interface SystemEvent {
  eventId: string;
  eventType: string;
  eventTimestamp: string;
  source: string;
  correlationId: string;
  workflowContext?: any;
  controllerContext?: any;
  transition?: any;
  businessContext?: any;
  messages?: any[];
}

export class MessageBus {
  constructor(private sqs: SQSClient, private queueUrl: string) {}

  async waitFor(predicate: (evt: SystemEvent) => boolean, timeoutMs: number): Promise<SystemEvent | null> {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
      const resp = await this.sqs.send(new ReceiveMessageCommand({ QueueUrl: this.queueUrl, MaxNumberOfMessages: 1, WaitTimeSeconds: 20 }));
      for (const m of resp.Messages || []) {
        const body = m.Body ? JSON.parse(m.Body) : null;
        const evt: SystemEvent = body?.Message ? JSON.parse(body.Message) : body; // SNS → SQS or raw
        if (evt && predicate(evt)) {
          if (m.ReceiptHandle) {
            await this.sqs.send(new DeleteMessageCommand({ QueueUrl: this.queueUrl, ReceiptHandle: m.ReceiptHandle }));
          }
          return evt;
        }
      }
    }
    return null;
  }
}


