# Deployed Inventory (ap-southeast-2, account 978564887660)

| Resource | Type | Identifier / ARN | Notes |
| --- | --- | --- | --- |
| SocAgentStateMachine | Step Functions | arn:aws:states:ap-southeast-2:978564887660:stateMachine:SocAgentStateMachine4D0C0248-HYR6iIOPbrXc | Orchestrates invoke → notify → remediate |
| MonthlyCertRotation | EventBridge Rule | cron 0 0 1 * ? * | Triggers monthly cert rotation / vulnerability scan |
| GuardDutyFindings | EventBridge Rule | source=aws.guardduty, detail-type=GuardDuty Finding | Real-time finding trigger |
| AgentInvokerFn | Lambda | SocAgentStack-AgentInvokerFn6BAAFC11 | Calls Bedrock InvokeAgent; env `AGENT_ID` unset; uses Bedrock region from env/stack |
| NotifyFn | Lambda | SocAgentStack-NotifyFn73D5825E | Publishes to approval SNS topic |
| RemediationFn | Lambda | SocAgentStack-RemediationFn1A0207D9 | Stub remediation, writes evidence |
| ApprovalTopic | SNS Topic | arn:aws:sns:ap-southeast-2:978564887660:SocAgentStack-ApprovalTopic1D517B4C-bhilp4hV5ubo | Subscribe email/Slack for approvals |
| EvidenceBucket | S3 Bucket | socagentstack-evidencebucketfba44255-cwja5suzllcg | Stores remediation evidence |
| KbPoliciesBucket | S3 Bucket | socagentstack-kbpoliciesbucket6f6b34fc-yuu8dfaaznlu | Upload policies / runbooks |
| KbIncidentsBucket | S3 Bucket | socagentstack-kbincidentsbucketf87b9ab8-owmuopspjwfj | Upload historical incidents |
| ActionLambdaRole | IAM Role | SocAgentStack-ActionLambdaRole4F752F93 | Lambda exec + SSM/ACM/Config/SecurityHub/Inspector/InvokeAgent permissions |
| SocAgentStateMachineRole | IAM Role | SocAgentStack-SocAgentStateMachineRole54DCA2AF | State machine task role |
| SocAgentStateMachineEventsRole | IAM Role | SocAgentStack-SocAgentStateMachineEventsRoleB9B54B3C | EventBridge → Step Functions invoke |
| LogRetention Service Role | IAM Role | SocAgentStack-LogRetention...ServiceRole9741ECFB | CDK-managed log retention helper |
| CDKToolkit | CloudFormation Stack | aws://978564887660/ap-southeast-2 | Provides staging bucket/roles for CDK assets |
| SocAgentStack | CloudFormation Stack | arn:aws:cloudformation:ap-southeast-2:978564887660:stack/SocAgentStack/1ce18500-3220-11f1-af13-06231152a2ab | Deployed app stack |

Generated: 2026-04-07
