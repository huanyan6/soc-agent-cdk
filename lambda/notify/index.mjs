// Sends approval requests to SNS (email/Slack endpoints can subscribe).
const AWS = require('aws-sdk');
const sns = new AWS.SNS();

exports.handler = async (event = {}) => {
  console.log('Notify payload', JSON.stringify(event, null, 2));

  if (!process.env.APPROVAL_TOPIC_ARN) {
    throw new Error('APPROVAL_TOPIC_ARN not set');
  }

  const message = {
    approvalToken: event.approvalToken,
    summary: event.summary || 'No summary provided',
    instructions: 'Reply/approve via downstream workflow; this is a stub.',
  };

  await sns
    .publish({
      TopicArn: process.env.APPROVAL_TOPIC_ARN,
      Message: JSON.stringify(message),
      Subject: 'SOC Agent approval required',
    })
    .promise();

  // In real flow, store approval in DynamoDB and wait for callback/Step Functions task token
  return { status: 'sent', approval: 'pending' };
};
