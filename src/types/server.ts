export type ServerHealth = {
	status: string;
	subscriptions: number;
	videos: number;
	lastUpdated: string | null;
	dataIntegrity?: Array<{
		file: string;
		status: "ok" | "initialized" | "restored";
		backupFile: string | null;
	}>;
};

export type ServerVersion = {
	version: string;
	appVersion?: string;
};

export type FailedChannel = {
	id: string;
	title: string;
	reason: string;
};
