// Represents the result of compiling a pattern
export type CompiledPattern = {
	regExp: RegExp;   // Generated regex used for matching
	patternVariables: string[];  // Ordered list of extracted keys (e.g. ['userId', 'skillId'])
};


export class OpenAiSqliteBucketPatternHelper {
	/**
	 * Compile a pattern like:
	 *   "tracker_bucket/{userId}/{skillId}/{sessionId}"
	 *
	 * Into:
	 *   - a RegExp for matching
	 *   - a list of keys to extract
	 */
	static compilePatternDef(patternDef: string): CompiledPattern {
		const keys: string[] = [];

		// Escape slashes and replace {key} with a capture group
		const regexString = patternDef
			.replace(/\//g, '\\/') // escape "/"
			.replace(/\{(\w+)\}/g, (_, key: string) => {
				keys.push(key);
				return '([^/]+)'; // capture anything except "/"
			});

		return {
			regExp: new RegExp(`^${regexString}$`),
			patternVariables: keys,
		};
	}

	/**
	 * Extract structured data from a bucketId using a compiled pattern.
	 *
	 * Example:
	 *   extract("tracker_bucket/A/B/C", compiledPattern)
	 *   → { userId: "A", skillId: "B", sessionId: "C" }
	 */
	static extract(
		bucketId: string,
		compiledPattern: CompiledPattern
	): Record<string, string> | null {
		const match = bucketId.match(compiledPattern.regExp);

		// If it doesn't match the pattern, return null
		if (!match) return null;

		const result: Record<string, string> = {};

		// Map captured groups to their corresponding keys
		compiledPattern.patternVariables.forEach((key, index) => {
			result[key] = match[index + 1]; // +1 because match[0] is the full string
		});

		return result;
	}


	/**
	 * Convert bucketIds into glob strings by replacing specified pattern variables with '*'.
	 *
	 * Example:
	 *   bucketIds: "ns/userA/skillX/s1", "ns/userA/skillY/s2"
	 *   patternDef: "{namespace}/{userId}/{skillId}/{sessionId}"
	 *   patternVariables: "namespace", "userId"
	 *   result: "ns/userA/star/star"
	 */
	static toGlobs(
		bucketIds: string[],
		compiledPattern: CompiledPattern,
		patternVariables: string[],
	): string[] {
		// Validate that all patternVariables exist in the compiled pattern
		for (const patternVariable of patternVariables) {
			if (compiledPattern.patternVariables.includes(patternVariable) === false) {
				throw new Error(`Pattern variable "${patternVariable}" does not exist in the compiled pattern. Available variables: ${compiledPattern.patternVariables.join(', ')}`);
			}
		}

		const globSet = new Set<string>();

		for (const bucketId of bucketIds) {
			const extracted = OpenAiSqliteBucketPatternHelper.extract(bucketId, compiledPattern);
			if (extracted === null) continue;

			// Rebuild the bucketId, replacing non-grouped variables with '*'
			const parts = bucketId.split('/');
			const allVariables = compiledPattern.patternVariables;

			const match = bucketId.match(compiledPattern.regExp);
			if (!match) continue;

			let variableIndex = 0;
			const resultParts: string[] = [];
			const segmentIsVariable = OpenAiSqliteBucketPatternHelper.getVariableSegmentIndices(compiledPattern, bucketId);

			for (let i = 0; i < parts.length; i++) {
				if (segmentIsVariable.has(i)) {
					const varName = allVariables[variableIndex];
					variableIndex++;
					resultParts.push(patternVariables.includes(varName) ? parts[i] : '*');
				} else {
					resultParts.push(parts[i]);
				}
			}

			globSet.add(resultParts.join('/'));
		}

		return Array.from(globSet);
	}

	/**
	 * Get the segment indices that correspond to pattern variables.
	 */
	private static getVariableSegmentIndices(
		compiledPattern: CompiledPattern,
		bucketId: string
	): Set<number> {
		const parts = bucketId.split('/');
		const match = bucketId.match(compiledPattern.regExp);
		if (match === null) return new Set();

		const indices = new Set<number>();
		let captureIndex = 1; // match[0] is full string

		for (let i = 0; i < parts.length && captureIndex <= compiledPattern.patternVariables.length; i++) {
			if (parts[i] === match[captureIndex]) {
				indices.add(i);
				captureIndex++;
			}
		}

		return indices;
	}
}

///////////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////
//	
///////////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////

async function main() {
	const patternDefinition = '{namespace}/{userId}/{skilletId}/{sessionId}';
	const compiledPattern = OpenAiSqliteBucketPatternHelper.compilePatternDef(patternDefinition);

	console.log('Compiled Pattern:', compiledPattern);

	const bucketId = 'tracker_bucket/Jerome-Etienne_102848659911729905069/web_browser/session123';
	const extractedData = OpenAiSqliteBucketPatternHelper.extract(bucketId, compiledPattern);

	console.log('Extracted Data:', extractedData);

	// Test toGlobs
	const bucketIds = [
		'tracker_bucket/Jerome-Etienne_102848659911729905069/web_browser/session123',
		'tracker_bucket/Jerome-Etienne_102848659911729905069/web_browser/session456',
		'tracker_bucket/Jerome-Etienne_102848659911729905069/code_editor/session789',
		'tracker_bucket/John_doe_102848659911729905069/web_browser/session456',
	];
	const globs = OpenAiSqliteBucketPatternHelper.toGlobs(bucketIds, compiledPattern, ['skilletId']);
	console.log('Globs:', globs);
}

if (require.main === module) {
	main().catch((err) => {
		console.error("Error in main:", err);
		process.exit(1);
	});
}	