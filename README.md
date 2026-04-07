# Agentic SOC Demo (AWS CDK)

Skeleton that matches the high-level architecture: EventBridge → Step Functions → Bedrock supervisor (placeholder) → shared Lambda action groups. Knowledge-base buckets are provisioned; Bedrock agent + KB wiring is left for you to fill once you choose regions/models.

## Prereqs
- Node.js 18+ and AWS CDK v2 (`npm i -g aws-cdk`).
- AWS CLI configured with credentials and default region (recommend `us-east-1` or `us-west-2` for Bedrock).
- Bootstrap the account once: `cdk bootstrap --qualifier socagent`.

## Install & synthesize
```bash
cd soc-agent-cdk
npm install
npm run synth
```

## Deploy
```bash
cd soc-agent-cdk
npm run deploy
```
Outputs include:
- `KbPoliciesBucketName`, `KbIncidentsBucketName` – upload runbooks/policies.
- `EvidenceBucketName` – remediation evidence.
- `ApprovalTopicArn` – subscribe email/Slack webhook.
- `StateMachineArn` – central workflow.

## What to customize next
1. **Bedrock agents**: swap `lambda/agent-invoke` with a handler that calls `InvokeAgent` and passes Security Lake/GuardDuty context. Wire Knowledge Bases to the buckets.
2. **Approvals**: Replace `notify` stub with Step Functions callback token + Slack/Approval portal; enforce `"approved"` before remediation.
3. **Remediation actions**: Add SSM Automation docs, ACM/Secrets Manager rotation, Inspector/Config lookups; grant least-privilege IAM to `ActionLambdaRole`.
4. **Event sources**: Add more EventBridge rules (Security Hub standards fails, Config noncompliance, scheduled vuln scans).
5. **Observability**: Pipe Step Functions logs to CloudWatch Logs Insights / OpenTelemetry; emit structured JSON.

## Wiring your Bedrock agent
- Create or identify a Bedrock Agent and alias in the same region (or set `BEDROCK_REGION`).
- Set environment variables before deploy:  
  `set BEDROCK_AGENT_ID=<agent-id>`  
  `set BEDROCK_AGENT_ALIAS_ID=<alias-id or $LATEST>`  
  `set BEDROCK_REGION=ap-southeast-2`
- Deploy: `npx cdk deploy --require-approval never --output .cdk.out`
- The Lambda `AgentInvokerFn` streams the agent response and returns it as the Step Functions summary.

## Approvals quick hook
- Subscribe an email or Slack webhook to the `ApprovalTopic` SNS output.
- Already enforced: `NotifyHuman` uses Step Functions task token. Approve by running:  
  `aws stepfunctions send-task-success --task-token <token> --task-output "{\"approval\":\"approved\"}"`  
  The token is included in the SNS message. Until approval arrives, the state machine pauses before remediation.

## Testing locally
- `npm run build` to type-check.
- `cdk diff` to review changes before deploy.
- Use `sam local invoke` or `aws lambda invoke --function-name ...` after deploy to dry-run action groups.
