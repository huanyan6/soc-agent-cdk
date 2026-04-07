// Simple approval callback: invoked via Lambda Function URL (no auth for demo).
// Expects query parameters:
//   token=<taskToken>
//   decision=approved|rejected
// Optionally decision can be 'approved' to send success; anything else sends failure.

const AWS = require('aws-sdk');
const stepfunctions = new AWS.StepFunctions();

exports.handler = async (event = {}) => {
  console.log('Approval callback event', JSON.stringify(event, null, 2));

  const token =
    event.queryStringParameters?.token ||
    event.token ||
    event.body?.token; // allow JSON body
  const decision =
    (event.queryStringParameters?.decision || event.decision || 'approved').toLowerCase();

  if (!token) {
    return {
      statusCode: 400,
      body: 'Missing token query parameter',
    };
  }

  const approved = decision === 'approved' || decision === 'approve';

  try {
    if (approved) {
      await stepfunctions
        .sendTaskSuccess({
          taskToken: token,
          output: JSON.stringify({ approval: 'approved' }),
        })
        .promise();
    } else {
      await stepfunctions
        .sendTaskFailure({
          taskToken: token,
          error: 'ApprovalRejected',
          cause: 'User rejected remediation',
        })
        .promise();
    }

    return {
      statusCode: 200,
      body: approved ? 'Approved' : 'Rejected',
    };
  } catch (err) {
    console.error(err);
    return {
      statusCode: 500,
      body: 'Error sending task callback',
    };
  }
};
