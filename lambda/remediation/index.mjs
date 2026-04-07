// Placeholder remediation handler; wire SSM RunCommand / AWS APIs when approvals are present.
const AWS = require('aws-sdk');
const s3 = new AWS.S3();

exports.handler = async (event = {}) => {
  console.log('Remediation request', JSON.stringify(event, null, 2));

  if (event.approval !== 'approved') {
    console.warn('No human approval, skipping remediation.');
    return { status: 'skipped', reason: 'approval_required' };
  }

  // TODO: implement real actions (SSM automation, ACM rotation, etc.)
  const evidence = {
    time: new Date().toISOString(),
    actions: event.recommendedActions || [],
    detail: event.detail || {},
  };

  if (process.env.EVIDENCE_BUCKET) {
    await s3
      .putObject({
        Bucket: process.env.EVIDENCE_BUCKET,
        Key: `remediation/${Date.now()}.json`,
        Body: JSON.stringify(evidence),
      })
      .promise();
  }

  return { status: 'completed', evidence };
};
