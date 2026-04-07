// Sends approval request with Step Functions task token; waits for callback.
import { SNSClient, PublishCommand } from '@aws-sdk/client-sns';

const sns = new SNSClient({});

export const handler = async (event = {}) => {
  console.log('Notify payload', JSON.stringify(event, null, 2));

  if (!process.env.APPROVAL_TOPIC_ARN) {
    throw new Error('APPROVAL_TOPIC_ARN not set');
  }
  if (!event.taskToken) {
    throw new Error('Missing taskToken for callback');
  }

  const message = {
    approvalToken: event.approvalToken,
    summary: event.summary || 'No summary provided',
    instructions:
      'Approve via callback URL in email, or: aws stepfunctions send-task-success --task-token <token> --task-output "{\\"approval\\":\\"approved\\"}"',
    taskToken: event.taskToken,
  };

  await sns.send(
    new PublishCommand({
      TopicArn: process.env.APPROVAL_TOPIC_ARN,
      Message: JSON.stringify(message, null, 2),
      Subject: 'SOC Agent approval required',
    }),
  );

  return { status: 'waiting_for_approval' };
};
