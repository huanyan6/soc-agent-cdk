// Sends approval request with Step Functions task token; waits for callback.
const AWS = require('aws-sdk');
const sns = new AWS.SNS();
const stepfunctions = new AWS.StepFunctions();

exports.handler = async (event = {}) => {
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
      'Approve by running: aws stepfunctions send-task-success --task-token <token> --task-output \"{\\\"approval\\\":\\\"approved\\\"}\"',
    taskToken: event.taskToken,
  };

  await sns
    .publish({
      TopicArn: process.env.APPROVAL_TOPIC_ARN,
      Message: JSON.stringify(message, null, 2),
      Subject: 'SOC Agent approval required',
    })
    .promise();

  // Suspend until callback; Step Functions will resume via sendTaskSuccess/Failure.
  // We still return a placeholder; SFN ignores payload until callback.
  return { status: 'waiting_for_approval' };
};
