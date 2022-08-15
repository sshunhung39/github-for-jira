import crypto from "crypto";
import url from "url";
import { NextFunction, Request, Response, Router } from "express";
import axios from "axios";
import { getLogger } from "config/logger";
import { booleanFlag, BooleanFlags } from "config/feature-flags";
import { Tracer } from "config/tracer";
import { envVars } from "config/env";
import { GithubAPI } from "config/github-api";
import { Errors } from "config/errors";
import { getGitHubApiUrl } from "~/src/util/get-github-client-config";
import { createHashWithSharedSecret } from "utils/encryption";

const logger = getLogger("github-oauth");
const appUrl = envVars.APP_URL;
const scopes = ["user", "repo"];
const callbackPath = "/callback";

const getRedirectUrl = async (req, res, state) => {
	const { baseUrl } = req;
	const { hostname, clientId } = res.locals.gitHubAppConfig;
	const callbackURI = `${appUrl}${baseUrl}${callbackPath}`;
	return `${hostname}/login/oauth/authorize?client_id=${clientId}&scope=${encodeURIComponent(scopes.join(" "))}&redirect_uri=${encodeURIComponent(callbackURI)}&state=${state}`;
};

const GithubOAuthLoginGet = async (req: Request, res: Response): Promise<void> => {
	const traceLogsEnabled = await booleanFlag(BooleanFlags.TRACE_LOGGING, false);
	const tracer = new Tracer(logger, "login", traceLogsEnabled);

	// TODO: We really should be using an Auth library for this, like @octokit/github-auth
	// Create unique state for each oauth request
	const state = crypto.randomBytes(8).toString("hex");

	req.session["timestamp_before_oauth"] = Date.now();

	// Save the redirect that may have been specified earlier into session to be retrieved later
	req.session[state] =
		res.locals.redirect ||
		`/github/configuration${url.parse(req.originalUrl).search || ""}`;
	// Find callback URL based on current url of this route
	const redirectUrl = await getRedirectUrl(req, res, state);
	req.log.info("redirectUrl:", redirectUrl);

	req.log.info({
		redirectUrl,
		postLoginUrl: req.session[state]
	}, `Received request for ${req.url}, redirecting to Github OAuth flow`);
	tracer.trace(`redirecting to ${redirectUrl}`);
	res.redirect(redirectUrl);
};

const GithubOAuthCallbackGet = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
	const {
		error,
		error_description,
		error_uri,
		code,
		state
	} = req.query as Record<string, string>;

	const traceLogsEnabled = await booleanFlag(BooleanFlags.TRACE_LOGGING, false);
	const tracer = new Tracer(logger, "callback", traceLogsEnabled);

	const timestampBefore = req.session["timestamp_before_oauth"] as number;
	if (timestampBefore) {
		const timestampAfter = Date.now();
		tracer.trace(`callback called after spending ${timestampAfter - timestampBefore} ms on GitHub servers`);
	}

	// Show the oauth error if there is one
	if (error) {
		tracer.trace(`OAuth Error: ${error}`);
		return next(`OAuth Error: ${error}
      URL: ${error_uri}
      ${error_description}`);
	}

	// Take save redirect url and delete it from session
	const redirectUrl = req.session[state] as string;
	delete req.session[state];

	tracer.trace(`extracted redirectUrl from session: ${redirectUrl}`);
	req.log.info({ query: req.query }, `Received request to ${req.url}`);

	// Check if state is available and matches a previous request
	if (!state || !redirectUrl) return next("Missing matching Auth state parameter");
	if (!code) return next("Missing OAuth Code");

	const { jiraHost, gitHubAppConfig } = res.locals;
	const { hostname, clientId, gitHubClientSecret } = gitHubAppConfig;
	req.log.info({ jiraHost }, "Jira Host attempting to auth with GitHub");
	tracer.trace(`extracted jiraHost from redirect url: ${jiraHost}`);

	logger.info(`${createHashWithSharedSecret(gitHubClientSecret)} is used`);

	try {
		const response = await axios.get(
			`${hostname}/login/oauth/access_token`,
			{
				params: {
					client_id: clientId,
					client_secret: gitHubClientSecret,
					code,
					state
				},
				headers: {
					accept: "application/json",
					"content-type": "application/json"
				},
				responseType: "json"
			}
		);

		// Saving it to session be used later
		req.session.githubToken = response.data.access_token;

		if (!req.session.githubToken) {
			tracer.trace(`didn't get access token from GitHub`);
			return next(new Error("Missing Access Token from Github OAuth Flow."));
		}

		tracer.trace(`got access token from GitHub, redirecting to ${redirectUrl}`);

		req.log.info({ redirectUrl }, "Github OAuth code valid, redirecting to internal URL");
		return res.redirect(redirectUrl);
	} catch (e) {
		tracer.trace(`Cannot retrieve access token from Github`);
		return next(new Error("Cannot retrieve access token from Github"));
	}
};

export const GithubAuthMiddleware = async (req: Request, res: Response, next: NextFunction) => {
	try {
		const { githubToken } = req.session;
		const { jiraHost, gitHubAppId } = res.locals;
		if (!githubToken) {
			req.log.info("github token missing, calling login()");
			throw "Missing github token";
		}
		req.log.debug("found github token in session. validating token with API.");

		const url = await getGitHubApiUrl(jiraHost, gitHubAppId);
		await axios.get(url, {
			headers: {
				Authorization: `Bearer ${githubToken}`
			}
		});

		req.log.debug(`Github token is valid, continuing...`);

		// Everything's good, set it to res.locals
		res.locals.githubToken = githubToken;
		// TODO: Not a great place to put this, but it'll do for now
		res.locals.github = GithubAPI({ auth: githubToken });
		const state = crypto.randomBytes(8).toString("hex");
		// Find callback URL based on current url of this route
		await getRedirectUrl(req, res, state);
		return next();
	} catch (e) {
		req.log.debug(`Github token is not valid.`);
		// If it's a GET request, we can redirect to login and try again
		if (req.method == "GET") {
			req.log.debug(`Trying to get new Github token...`);
			res.locals.redirect = req.originalUrl;
			return GithubOAuthLoginGet(req, res);
		}

		// For any other requests, it should just error
		return res.status(401).send(Errors.MISSING_GITHUB_TOKEN);
	}
};

// IMPORTANT: We need to keep the login/callback/middleware functions
// in the same file as they reference each other
export const GithubOAuthRouter = Router();
GithubOAuthRouter.get("/login", GithubOAuthLoginGet);
GithubOAuthRouter.get(callbackPath, GithubOAuthCallbackGet);
