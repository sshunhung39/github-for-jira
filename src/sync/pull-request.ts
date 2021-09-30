import url from "url";
import transformPullRequest from "./transforms/pull-request";
import statsd from "../config/statsd";
import { GitHubAPI } from "probot";
import { getLogger } from "../config/logger";
import { metricHttpRequest } from "../config/metric-names";
import { Repository } from "../models/subscription";

const logger = getLogger("sync.pull-request");

/**
 * Find the next page number from the response headers.
 */
export const getNextPage = (headers: Headers = {}): number | undefined => {
	const nextUrl = ((headers.link || "").match(/<([^>]+)>;\s*rel="next"/) ||
		[])[1];
	if (!nextUrl) {
		return undefined;
	}
	logger.debug("Extracting next PRs page url");
	const parsed = url.parse(nextUrl)?.query?.split("&");
	let nextPage;
	parsed?.forEach((query) => {
		const [key, value] = query.split("=");
		if (key === "page") {
			nextPage = Number(value);
		}
	});
	return nextPage;
};

interface Headers {
	link?: string;
}

export default async function(
	github: GitHubAPI,
	repository: Repository,
	cursor?: string | number,
	perPage?: number
) {
	let status: number;
	let headers: Headers = {};
	let edges;
	if (!cursor) {
		cursor = 1;
	} else {
		cursor = Number(cursor);
	}
	const vars = {
		owner: repository.owner.login,
		repo: repository.name,
		per_page: perPage,
		page: cursor
	};

	const asyncTags:any[] = [];
	// TODO: use graphql here instead of rest API
	await statsd.asyncTimer(
		async () => {
			({
				data: edges,
				status,
				headers
			} = await github.pulls.list({
				...vars,
				state: "all",
				sort: "created",
				direction: "desc"
				// Retry up to 6 times pausing for 10s, for *very* large repos we need to wait a while for the result to succeed in dotcom
			}));
			asyncTags.push(`status:${status}`);
		},
		metricHttpRequest.syncPullRequest,
		1,
		asyncTags
	)();

	// Force us to go to a non-existant page if we're past the max number of pages
	const nextPage = getNextPage(headers) || cursor + 1;

	// Attach the "cursor" (next page number) to each edge, because the function that uses this data
	// fetches the cursor from one of the edges instead of letting us return it explicitly.
	edges.forEach((edge) => (edge.cursor = nextPage));

	// TODO: change this to reduce
	const pullRequests = (
		await Promise.all(
			edges.map(async (pull) => {
				const data = await transformPullRequest(
					{ pullRequest: pull, repository },
					github
				);
				return data?.pullRequests[0];
			})
		)
	).filter((value) => !!value);

	return {
		edges,
		jiraPayload:
			pullRequests?.length
				? {
					id: repository.id,
					name: repository.full_name,
					pullRequests,
					url: repository.html_url,
					updateSequenceId: Date.now()
				}
				: undefined
	};
}
