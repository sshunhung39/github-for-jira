/**
 * NOTE: This method needs to be run ONLY AFTER THE START OF THE NODE APP
 * This method simply copies the defined env variables to the React app in /spa
 */
import fs from "fs";

const ENV_VARS_TO_BE_COPIED = [
	{ LAUNCHDARKLY_CLIENT_KEY: process.env.LAUNCHDARKLY_CLIENT_KEY },
	{ GLOBAL_HASH_SECRET: process.env.GLOBAL_HASH_SECRET }
];

const copyEnvVarsInSpa = () => {
	let envVars = "";

	ENV_VARS_TO_BE_COPIED.forEach(variable => {
		envVars += `REACT_APP_${Object.keys(variable)[0]}=${Object.values(variable)[0]} \n`;
	});

	fs.writeFileSync("spa/.env", envVars);
};

export default copyEnvVarsInSpa;