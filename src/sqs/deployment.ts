import { WebhookPayloadDeploymentStatus } from "@octokit/webhooks";
import { Context, MessageHandler } from "./sqs";
import { workerApp } from "../worker/app";
import { processDeployment } from "../github/deployment";
import { GitHubInstallationClient } from "../github/client/github-installation-client";
import { getCloudInstallationId } from "../github/client/installation-id";
import {getGitHubBaseUrl} from "utils/check-github-app-type";

export type DeploymentMessagePayload = {
	jiraHost: string,
	installationId: number,
	webhookReceived: number,
	webhookId: string,

	// The original webhook payload from GitHub. We don't need to worry about the SQS size limit because metrics show
	// that payload size for deployment_status webhooks maxes out at 13KB.
	webhookPayload: WebhookPayloadDeploymentStatus,
}

export const deploymentQueueMessageHandler: MessageHandler<DeploymentMessagePayload> = async (context: Context<DeploymentMessagePayload>) => {


	const messagePayload: DeploymentMessagePayload = context.payload;

	const { webhookId, jiraHost, installationId } = messagePayload;

	context.log = context.log.child({
		webhookId,
		jiraHost,
		installationId
	});

	context.log.info("Handling deployment message from the SQS queue");

	const github = await workerApp.auth(installationId);
	const gitHubBaseUrl = await getGitHubBaseUrl(jiraHost);
	const newGitHubClient = new GitHubInstallationClient(getCloudInstallationId(installationId, gitHubBaseUrl), context.log, gitHubBaseUrl);

	await processDeployment(
		github,
		newGitHubClient,
		webhookId,
		messagePayload.webhookPayload,
		new Date(messagePayload.webhookReceived),
		jiraHost,
		installationId,
		context.log);
};
