import { envVars } from "config/env";
import axios, { AxiosInstance, AxiosResponse } from "axios";
import { getLogger } from "config/logger";

export enum EncryptionSecretKeyEnum {
	GITHUB_SERVER_APP = "github-server-app-secrets"
}

export type EncryptionContext = Record<string, string | number>;
const logger = getLogger("encryption-client");

interface EncryptResponse {
	cipherText: string;
}

interface DecryptResponse {
	plainText: string;
}

/**
 * This client calling using Cryptor side-car to encrypt/decrypt data.
 *
 * How to use:
 *
 * - Without encryption context: Same, but just don't pass the context
 *   const encrypted = await EncryptionClient.encrypt(EncryptionSecretKeyEnum.GITHUB_SERVER_APP, "super-secret-secret");
 *
 */
export class EncryptionClient {

	private static readonly axiosInst: AxiosInstance = axios.create({
		baseURL: envVars.CRYPTOR_URL,
		headers: {
			"X-Cryptor-Client": envVars.CRYPTOR_SIDECAR_CLIENT_IDENTIFICATION_CHALLENGE,
			"Content-Type": "application/json; charset=utf-8"
		}
	});

	static async encrypt(secretKey: EncryptionSecretKeyEnum, plainText: string, encryptionContext: EncryptionContext = {}): Promise<string> {
		try {
			const response = await EncryptionClient.axiosInst.post<EncryptResponse>(`/cryptor/encrypt/micros/github-for-jira/${secretKey}`, {
				plainText,
				encryptionContext
			});
			return response.data.cipherText;
		} catch (e) {
			e.message = e.message?.replace(plainText, "<censored>");
			logger.warn(e, "Cryptor request failed");
			throw e;
		}
	}

	static async decrypt(cipherText: string, encryptionContext: EncryptionContext = {}): Promise<string> {
		try {
			const response = await EncryptionClient.axiosInst.post<DecryptResponse>(`/cryptor/decrypt`, {
				cipherText,
				encryptionContext
			});
			return response.data.plainText;
		} catch (e) {
			logger.warn(e, "Decryption request failed");
			throw e;
		}
	}

	static async healthcheck(): Promise<AxiosResponse> {
		return await EncryptionClient.axiosInst.get("/healthcheck");
	}
}