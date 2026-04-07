// Certificate rotation helper:
// - Requests a new ACM cert (DNS validation) in us-east-1 for CloudFront compatibility.
// - Creates Route53 validation CNAMEs when the hosted zone is found.
// - Optionally updates a CloudFront distribution to use the new cert.
// - Emits evidence to S3.

const AWS = require('aws-sdk');
const { v4: uuidv4 } = require('uuid');

const acm = new AWS.ACM({ region: 'us-east-1' }); // CloudFront requires us-east-1
const route53 = new AWS.Route53();
const cloudfront = new AWS.CloudFront();
const s3 = new AWS.S3();

const sleep = (ms) => new Promise((res) => setTimeout(res, ms));

exports.handler = async (event = {}) => {
  console.log('Remediation request', JSON.stringify(event, null, 2));

  if (event.approval !== 'approved') {
    console.warn('No human approval, skipping remediation.');
    return { status: 'skipped', reason: 'approval_required' };
  }

  const domain =
    process.env.TARGET_DOMAIN ||
    event.domain ||
    event.detail?.targetService ||
    event.detail?.domain;

  if (!domain) {
    return { status: 'error', reason: 'domain_missing' };
  }

  // 1) Request certificate
  const requestResp = await acm
    .requestCertificate({
      DomainName: domain,
      ValidationMethod: 'DNS',
      IdempotencyToken: uuidv4().replace(/-/g, '').slice(0, 32),
      Options: { CertificateTransparencyLoggingPreference: 'ENABLED' },
    })
    .promise();

  const certArn = requestResp.CertificateArn;
  console.log('Requested cert', certArn);

  // 2) Get validation options
  const describe = await acm.describeCertificate({ CertificateArn: certArn }).promise();
  const validations = describe.Certificate.DomainValidationOptions || [];

  // 3) Try to create Route53 validation records if hosted zone exists
  const validationRecords = [];
  const hostedZone = await findHostedZone(domain);
  if (hostedZone) {
    for (const v of validations) {
      if (!v.ResourceRecord) continue;
      const rr = v.ResourceRecord;
      validationRecords.push(rr);
      await route53
        .changeResourceRecordSets({
          HostedZoneId: hostedZone.Id,
          ChangeBatch: {
            Changes: [
              {
                Action: 'UPSERT',
                ResourceRecordSet: {
                  Name: rr.Name,
                  Type: rr.Type,
                  TTL: 300,
                  ResourceRecords: [{ Value: rr.Value }],
                },
              },
            ],
          },
        })
        .promise();
      console.log('Created validation record', rr);
    }
  } else {
    console.warn('No hosted zone found; return validation CNAMEs for manual setup.');
    for (const v of validations) {
      if (v.ResourceRecord) validationRecords.push(v.ResourceRecord);
    }
  }

  // 4) Poll for issuance (short wait; may still be pending)
  let issued = false;
  for (let i = 0; i < 8; i++) {
    await sleep(15000);
    const d = await acm.describeCertificate({ CertificateArn: certArn }).promise();
    const status = d.Certificate.Status;
    console.log(`Certificate status attempt ${i + 1}: ${status}`);
    if (status === 'ISSUED') {
      issued = true;
      break;
    }
  }

  // 5) If CloudFront distribution provided and cert issued, update it
  let distributionUpdate = null;
  const distId = process.env.CLOUDFRONT_DISTRIBUTION_ID;
  if (issued && distId) {
    const dist = await cloudfront.getDistributionConfig({ Id: distId }).promise();
    const config = dist.DistributionConfig;
    config.ViewerCertificate = {
      ACMCertificateArn: certArn,
      SSLSupportMethod: 'sni-only',
      MinimumProtocolVersion: 'TLSv1.2_2021',
    };
    const update = await cloudfront
      .updateDistribution({
        Id: distId,
        IfMatch: dist.ETag,
        DistributionConfig: config,
      })
      .promise();
    distributionUpdate = {
      status: update.Distribution.Status,
      domainName: update.Distribution.DomainName,
    };
    console.log('Updated CloudFront distribution', distributionUpdate);
  }

  // 6) Evidence
  const evidence = {
    time: new Date().toISOString(),
    domain,
    certificateArn: certArn,
    validationRecords,
    issued,
    distributionUpdate,
    detail: event.detail || {},
  };

  if (process.env.EVIDENCE_BUCKET) {
    await s3
      .putObject({
        Bucket: process.env.EVIDENCE_BUCKET,
        Key: `remediation/${Date.now()}-${domain}.json`,
        Body: JSON.stringify(evidence),
      })
      .promise();
  }

  return {
    status: issued ? 'completed' : 'pending_validation',
    certificateArn: certArn,
    validationRecords,
    distributionUpdate,
    message: issued
      ? 'Certificate issued (or pending distribution update).'
      : 'Certificate requested; complete DNS validation if pending.',
  };
};

async function findHostedZone(domain) {
  const resp = await route53
    .listHostedZonesByName({
      DNSName: domain,
      MaxItems: '5',
    })
    .promise();
  const zones = resp.HostedZones || [];
  // Pick the longest matching suffix
  let best = null;
  for (const z of zones) {
    const name = z.Name.replace(/\.$/, '');
    if (domain === name || domain.endsWith(`.${name}`)) {
      if (!best || name.length > best.Name.length) {
        best = z;
      }
    }
  }
  return best;
}
