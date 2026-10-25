CREATE TABLE `tokens_table` (
	`id` integer PRIMARY KEY,
	`accessToken` text NOT NULL,
	`refreshToken` text NOT NULL,
	`expires` integer NOT NULL
);
