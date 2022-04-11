export interface JiraBuildReference {
	commit: {
		id: string;
		repositoryUri: string;
	};
	ref: {
		name: string;
		uri: string;
	};
}

export interface JiraBuild {
	schemaVersion: string;
	pipelineId: string;
	buildNumber: number;
	updateSequenceNumber: number;
	displayName: string;
	url: string;
	state: string;
	lastUpdated: string;
	issueKeys: string[];
	references?: JiraBuildReference[];
}

export interface JiraBuildData {
	product: string;
	builds: JiraBuild[];
}

export interface JiraBranch {
	createPullRequestUrl: string,
	lastCommit: JiraCommit,
	id: string,
	issueKeys: string[],
	name: string,
	url: string,
	updateSequenceId: number
}

export interface JiraBranchData {
	branches: JiraBranch[],
	id: number,
	name: string,
	url: string,
	updateSequenceId: number
}

export interface JiraCommit {
	author: JiraAuthor;
	authorTimestamp: string;
	displayId: string;
	fileCount: number;
	hash: string;
	id: string;
	issueKeys: string[];
	message: string;
	url: string;
	updateSequenceId: number;

	files?: JiraCommitFile[];
	flags?: string[];
}

export interface JiraPullRequest {
	author: JiraAuthor;
	id: string;
	issueKeys: string[];
	updateSequenceId: number;
	status: string;
	title: string;
	commentCount: number;
	sourceBranch: string;
	sourceBranchUrl?: string;
	lastUpdate: string;
	destinationBranch: string;
	destinationBranchUrl?: string;
	url: string;
	displayId: string;
	reviewers?: JiraPullRequestReviewer[];
}

export interface JiraPullRequestReviewer {
	name: string;
	approvalStatus?: string;
	url?: string;
	avatar?: string;
	email?: string;
	accountId?: string;
}

export interface JiraIssue {
	id: string;
	self: string;
	key: string;
	fields: {
		summary: string;
	};
}

export interface JiraCommitFile {
	path: string;
	changeType: string;
	linesAdded?: string[];
	linesRemoved?: string[];
	url: string;
}

export interface JiraAuthor {
	avatar?: string;
	email: string;
	name: string;
	url?: string;
}

export interface JiraCommitData {
	commits: JiraCommit[];
	id: string;
	name: string;
	url: string;
	updateSequenceId: number;
}

export interface JiraDeployment {
	schemaVersion: string;
	deploymentSequenceNumber: number;
	updateSequenceNumber: number;
	issueKeys: string[],
	displayName: string;
	url: string;
	description: string;
	lastUpdated: Date;
	state: string;
	pipeline: {
		id: string;
		displayName: string;
		url: string;
	},
	environment: {
		id: string;
		displayName: string;
		type: string;
	},
}

export interface JiraDeploymentData {
	deployments: JiraDeployment[];
}

export interface JiraBulkUpdateData {
	preventTransitions: boolean;
	properties: {
		installationId: number;
	},
	repositories: JiraRepositoryData[];
}

export interface JiraRepositoryData {
	commits?: JiraCommit[];
	branches?: JiraBranch[],
	pullRequests?: JiraPullRequest[],
	id: string;
	name: string;
	url: string;
	updateSequenceId: number;
}
