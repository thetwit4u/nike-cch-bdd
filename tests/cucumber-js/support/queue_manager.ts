import { SNSClient, SubscribeCommand, UnsubscribeCommand } from '@aws-sdk/client-sns';
import { SQSClient, CreateQueueCommand, DeleteQueueCommand, GetQueueAttributesCommand, SetQueueAttributesCommand } from '@aws-sdk/client-sqs';

export class QueueManager {
  constructor(private sqs: SQSClient, private sns: SNSClient) {}

  async createEphemeralQueueAndSubscribe(topicArn: string, namePrefix: string): Promise<{ queueUrl: string; subscriptionArn: string; }> {
    const queueName = `${namePrefix}-${Date.now()}`;
    const { QueueUrl } = await this.sqs.send(new CreateQueueCommand({ QueueName: queueName }));
    if (!QueueUrl) throw new Error('Failed to create SQS queue');
    const attrs = await this.sqs.send(new GetQueueAttributesCommand({ QueueUrl, AttributeNames: ['QueueArn'] }));
    const queueArn = attrs.Attributes?.QueueArn as string;

    const policy = {
      Version: '2012-10-17',
      Statement: [
        {
          Sid: 'Allow-SNS-Publish',
          Effect: 'Allow',
          Principal: '*',
          Action: 'SQS:SendMessage',
          Resource: queueArn,
          Condition: {
            ArnEquals: { 'aws:SourceArn': topicArn }
          }
        }
      ]
    };
    await this.sqs.send(new SetQueueAttributesCommand({ QueueUrl, Attributes: { Policy: JSON.stringify(policy) } }));
    const sub = await this.sns.send(new SubscribeCommand({ TopicArn: topicArn, Protocol: 'sqs', Endpoint: queueArn, Attributes: { RawMessageDelivery: 'true' } }));
    const subscriptionArn = sub.SubscriptionArn as string;
    return { queueUrl: QueueUrl, subscriptionArn };
  }

  async unsubscribeAndDeleteQueue(queueUrl: string, subscriptionArn: string) {
    await this.sns.send(new UnsubscribeCommand({ SubscriptionArn: subscriptionArn }));
    await this.sqs.send(new DeleteQueueCommand({ QueueUrl: queueUrl }));
  }
}


