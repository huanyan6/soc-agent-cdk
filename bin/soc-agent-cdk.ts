#!/usr/bin/env node
import 'source-map-support/register';
import { App, Tags } from 'aws-cdk-lib';
import { SocAgentStack } from '../lib/soc-agent-stack';

const app = new App();

const stack = new SocAgentStack(app, 'SocAgentStack', {
  description:
    'Agentic SOC demo: Bedrock supervisor + action Lambdas + EventBridge/StepFunctions scaffold',
});

Tags.of(stack).add('Project', 'Agentic-SOC-Demo');
Tags.of(stack).add('Owner', 'SecurityOps');

app.synth();
