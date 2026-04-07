import {
  Duration,
  RemovalPolicy,
  Stack,
  StackProps,
  aws_events as events,
  aws_events_targets as targets,
  aws_iam as iam,
  aws_lambda as lambda,
  aws_logs as logs,
  aws_s3 as s3,
  aws_sns as sns,
  aws_stepfunctions as sfn,
  aws_stepfunctions_tasks as tasks,
} from 'aws-cdk-lib';
import { Construct } from 'constructs';

export class SocAgentStack extends Stack {
  constructor(scope: Construct, id: string, props?: StackProps) {
    super(scope, id, props);

    //
    // Data / evidence buckets
    //
    const kbPolicies = new s3.Bucket(this, 'KbPoliciesBucket', {
      versioned: true,
      encryption: s3.BucketEncryption.S3_MANAGED,
      removalPolicy: RemovalPolicy.RETAIN,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
    });

    const kbIncidents = new s3.Bucket(this, 'KbIncidentsBucket', {
      versioned: true,
      encryption: s3.BucketEncryption.S3_MANAGED,
      removalPolicy: RemovalPolicy.RETAIN,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
    });

    const evidenceBucket = new s3.Bucket(this, 'EvidenceBucket', {
      versioned: true,
      encryption: s3.BucketEncryption.S3_MANAGED,
      removalPolicy: RemovalPolicy.RETAIN,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      lifecycleRules: [
        {
          transitions: [
            {
              storageClass: s3.StorageClass.INTELLIGENT_TIERING,
              transitionAfter: Duration.days(30),
            },
          ],
        },
      ],
    });

    //
    // Human approval + notification channel
    //
    const approvalTopic = new sns.Topic(this, 'ApprovalTopic', {
      displayName: 'SOC Agent Human Approvals',
    });

    //
    // Shared IAM role for Lambda action groups
    //
    const lambdaRole = new iam.Role(this, 'ActionLambdaRole', {
      assumedBy: new iam.ServicePrincipal('lambda.amazonaws.com'),
      managedPolicies: [
        iam.ManagedPolicy.fromAwsManagedPolicyName('service-role/AWSLambdaBasicExecutionRole'),
      ],
    });

    // Minimal permissions; extend per environment
    lambdaRole.addToPolicy(
      new iam.PolicyStatement({
        actions: [
          'ssm:SendCommand',
          'secretsmanager:GetSecretValue',
          'secretsmanager:PutSecretValue',
          'acm:ListCertificates',
          'acm:DescribeCertificate',
        ],
        resources: ['*'],
      }),
    );

    lambdaRole.addToPolicy(
      new iam.PolicyStatement({
        actions: ['securityhub:GetFindings', 'inspector2:ListFindings', 'config:GetComplianceDetailsByConfigRule'],
        resources: ['*'],
      }),
    );

    lambdaRole.addToPolicy(
      new iam.PolicyStatement({
        actions: ['bedrock:InvokeAgent'],
        resources: ['*'], // tighten to specific agent ARN when known
      }),
    );

    //
    // Lambda functions acting as Bedrock action groups (stubbed)
    //
    const agentInvokerFn = this.createActionLambda('AgentInvokerFn', 'agent-invoke', lambdaRole, {
      APPROVAL_TOPIC_ARN: approvalTopic.topicArn,
      AGENT_ID: process.env.BEDROCK_AGENT_ID ?? '',
      AGENT_ALIAS_ID: process.env.BEDROCK_AGENT_ALIAS_ID ?? '$LATEST',
      BEDROCK_REGION: process.env.BEDROCK_REGION ?? this.region,
    });

    const remediationFn = this.createActionLambda('RemediationFn', 'remediation', lambdaRole, {
      EVIDENCE_BUCKET: evidenceBucket.bucketName,
    });

    const notifyFn = this.createActionLambda('NotifyFn', 'notify', lambdaRole, {
      APPROVAL_TOPIC_ARN: approvalTopic.topicArn,
    });

    approvalTopic.grantPublish(agentInvokerFn);
    approvalTopic.grantPublish(notifyFn);
    evidenceBucket.grantWrite(remediationFn);

    //
    // Step Functions flow: invoke supervisor agent -> notify -> remediate (manual approval hook baked into Lambda)
    //
    const invokeTask = new tasks.LambdaInvoke(this, 'CallSupervisorAgent', {
      lambdaFunction: agentInvokerFn,
      payload: sfn.TaskInput.fromObject({
        detail: sfn.JsonPath.entirePayload,
      }),
      outputPath: '$.Payload',
    });

    const notifyTask = new tasks.LambdaInvoke(this, 'NotifyHuman', {
      lambdaFunction: notifyFn,
      payload: sfn.TaskInput.fromObject({
        approvalToken: sfn.JsonPath.stringAt('$.approvalToken'),
        summary: sfn.JsonPath.stringAt('$.summary'),
      }),
      outputPath: '$.Payload',
    });

    const remediateTask = new tasks.LambdaInvoke(this, 'ExecuteRemediation', {
      lambdaFunction: remediationFn,
      payload: sfn.TaskInput.fromObject({
        approval: sfn.JsonPath.stringAt('$.approval'),
        detail: sfn.JsonPath.entirePayload,
      }),
      outputPath: '$.Payload',
    });

    const definition = invokeTask.next(notifyTask).next(remediateTask);

    const stateMachine = new sfn.StateMachine(this, 'SocAgentStateMachine', {
      definition,
      timeout: Duration.minutes(15),
      logs: {
        destination: new logs.LogGroup(this, 'SocAgentSfnLogs', {
          retention: logs.RetentionDays.ONE_MONTH,
        }),
        level: sfn.LogLevel.ALL,
      },
    });

    //
    // EventBridge: monthly cert rotation + GuardDuty findings
    //
    new events.Rule(this, 'MonthlyCertRotation', {
      description: 'Triggers monthly cert rotation / vulnerability scan',
      schedule: events.Schedule.cron({ minute: '0', hour: '0', day: '1' }),
      targets: [new targets.SfnStateMachine(stateMachine, { input: events.RuleTargetInput.fromObject({ trigger: 'monthly-cert-rotation' }) })],
    });

    new events.Rule(this, 'GuardDutyFindings', {
      description: 'Realtime GuardDuty findings -> agent supervisor',
      eventPattern: {
        source: ['aws.guardduty'],
        detailType: ['GuardDuty Finding'],
      },
      targets: [new targets.SfnStateMachine(stateMachine)],
    });

    //
    // Outputs to feed Knowledge Bases (upload via CLI/R2 later)
    //
    this.exportValue(kbPolicies.bucketName, { name: 'KbPoliciesBucketName' });
    this.exportValue(kbIncidents.bucketName, { name: 'KbIncidentsBucketName' });
    this.exportValue(evidenceBucket.bucketName, { name: 'EvidenceBucketName' });
    this.exportValue(approvalTopic.topicArn, { name: 'ApprovalTopicArn' });
    this.exportValue(stateMachine.stateMachineArn, { name: 'StateMachineArn' });
  }

  private createActionLambda(
    id: string,
    directory: string,
    role: iam.IRole,
    environment?: Record<string, string>,
  ): lambda.Function {
    return new lambda.Function(this, id, {
      runtime: lambda.Runtime.NODEJS_20_X,
      handler: 'index.handler',
      code: lambda.Code.fromAsset(`lambda/${directory}`),
      role,
      timeout: Duration.seconds(30),
      memorySize: 256,
      environment,
      logRetention: logs.RetentionDays.ONE_MONTH,
    });
  }
}
