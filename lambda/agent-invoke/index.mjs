import { randomUUID } from 'crypto';
import { BedrockAgentRuntimeClient, InvokeAgentCommand } from '@aws-sdk/client-bedrock-agent-runtime';

const agentId = process.env.AGENT_ID;
const agentAliasId = process.env.AGENT_ALIAS_ID || undefined;
const bedrockRegion = process.env.BEDROCK_REGION || process.env.AWS_REGION || 'ap-southeast-2';

if (!agentId) {
  console.warn('AGENT_ID not set; Lambda will throw on invoke');
}

const client = new BedrockAgentRuntimeClient({ region: bedrockRegion });

export const handler = async (event = {}) => {
  console.log('Incoming trigger', JSON.stringify(event, null, 2));

  if (!agentId) {
    throw new Error('Missing env AGENT_ID. Set BEDROCK_AGENT_ID in CDK context/environment.');
  }

  const sessionId = event.sessionId || randomUUID();
  const inputText =
    event.detail?.summary ||
    event.trigger ||
    'Analyze latest security signals and propose remediation. Always require human approval.';

  const payload = {
    agentId,
    sessionId,
    inputText,
    // You can pass context from Security Lake/GuardDuty here via `sessionState` or `memoryId`
  };
  if (agentAliasId) {
    payload.agentAliasId = agentAliasId;
  }

  const command = new InvokeAgentCommand(payload);

  const result = await client.send(command);

  // Bedrock returns a stream of agent events; collect the text parts.
  const messages = [];
  for await (const part of result.completion) {
    if (part.chunk?.bytes) {
      messages.push(Buffer.from(part.chunk.bytes).toString('utf8'));
    }
  }
  const combined = messages.join('');

  return {
    approvalToken: randomUUID(),
    summary: combined || 'Agent returned no text; check agent logs.',
    recommendedActions: [], // downstream agent output can be parsed into actions
  };
};
