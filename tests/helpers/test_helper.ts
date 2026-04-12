// node imports
import Os from "node:os";
import Path from "node:path";
import Fs from "node:fs";
import { EventEmitter } from "node:events";

///////////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////
//
///////////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////

/**
 * Create a temporary SQLite file path with a unique name
 */
export function createTempSqlitePath(prefix: string): string {
	const uniqueId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
	return Path.join(Os.tmpdir(), `openai-cost-test-${prefix}-${uniqueId}.sqlite`);
}

/**
 * Wait for an event to be emitted on an EventEmitter, with a timeout
 */
export function waitForEvent<T>(emitter: EventEmitter, eventName: string, timeoutMs: number = 30_000): Promise<T> {
	return new Promise((resolve, reject) => {
		const timer = setTimeout(() => {
			reject(new Error(`Timed out waiting for event "${eventName}" after ${timeoutMs}ms`));
		}, timeoutMs);

		emitter.once(eventName, (payload: T) => {
			clearTimeout(timer);
			resolve(payload);
		});
	});
}

/**
 * Safely delete files, ignoring ENOENT errors
 */
export function cleanupFiles(...paths: string[]): void {
	for (const filePath of paths) {
		try {
			Fs.unlinkSync(filePath);
		} catch (err: any) {
			if (err.code !== 'ENOENT') throw err;
		}
	}
}
