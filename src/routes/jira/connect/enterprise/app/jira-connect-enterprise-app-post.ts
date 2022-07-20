import { NextFunction, Request, Response } from "express";

export const JiraConnectEnterpriseAppPost = async (
	req: Request,
	res: Response,
	next: NextFunction
): Promise<void> => {
	try {
		req.log.debug("Received Jira Connect Enterprise App Post page request");

		// TODO: Add logic for adding new manual apps

		req.log.debug("Jira Connect Enterprise App Post page rendered successfully.", res.locals);
	} catch (error) {
		return next(new Error(`Failed to render Jira Connect Enterprise App Post page: ${error}`));
	}
};