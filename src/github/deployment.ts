import { transformDeployment } from "../transforms/transform-deployment";
import { emitWebhookProcessedMetrics } from "utils/webhook-utils";
import { getJiraClient, DeploymentsResult } from "../jira/client/jira-client";
import { sqsQueues } from "../sqs/queues";
import { WebhookPayloadDeploymentStatus } from "@octokit/webhooks";
import Logger from "bunyan";
import { isBlocked } from "config/feature-flags";
import { GitHubInstallationClient } from "./client/github-installation-client";
import { JiraDeploymentBulkSubmitData } from "interfaces/jira";
import { WebhookContext } from "routes/github/webhook/webhook-context";
import { getLogger } from "config/logger";

export const deploymentWebhookHandler = async (context: WebhookContext, jiraClient, _util, gitHubInstallationId: number): Promise<void> => {
	await sqsQueues.deployment.sendMessage({
		jiraHost: jiraClient.baseURL,
		installationId: gitHubInstallationId,
		webhookPayload: context.payload,
		webhookReceived: Date.now(),
		webhookId: context.id,
		gitHubAppConfig: context.gitHubAppConfig
	});
};

export const processDeployment = async (
	newGitHubClient: GitHubInstallationClient,
	webhookId: string,
	webhookPayload: WebhookPayloadDeploymentStatus,
	webhookReceivedDate: Date,
	jiraHost: string,
	gitHubInstallationId: number,
	rootLogger: Logger,
	gitHubAppId: number | undefined
) => {

	const logger = rootLogger.child({
		webhookId: webhookId,
		gitHubInstallationId,
		jiraHost,
		webhookReceived: webhookReceivedDate
	});

	const unsafeLogger = getLogger("process-deployment-unsafe", { level: "warn", unsafe: true });

	if (await isBlocked(gitHubInstallationId, logger)) {
		logger.warn("blocking processing of push message because installationId is on the blocklist");
		return;
	}

	logger.info("processing deployment message!");

	const jiraPayload: JiraDeploymentBulkSubmitData | undefined = await transformDeployment(newGitHubClient, webhookPayload, jiraHost, logger, gitHubAppId);

	logger.info("deployment message transformed");

	if (!jiraPayload) {
		logger.info(
			{ noop: "no_jira_payload_deployment" },
			"Halting further execution for deployment since jiraPayload is empty"
		);
		return;
	}

	const jiraClient = await getJiraClient(
		jiraHost,
		gitHubInstallationId,
		gitHubAppId,
		logger
	);

	const result: DeploymentsResult = await jiraClient.deployment.submit(jiraPayload);
	if (result.rejectedDeployments?.length) {
		unsafeLogger.warn({ rejectedDeployments: result.rejectedDeployments, jiraPayload, jiraHost }, "Jira API rejected deployment!");
		logger.warn({ rejectedDeployments: result.rejectedDeployments }, "Jira API rejected deployment!");
	}

	emitWebhookProcessedMetrics(
		webhookReceivedDate.getTime(),
		"deployment_status",
		logger,
		result?.status,
		gitHubAppId
	);
};
