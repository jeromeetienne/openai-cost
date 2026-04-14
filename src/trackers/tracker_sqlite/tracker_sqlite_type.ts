///////////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////
//	typescript types
///////////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////

export type OpenAiCostTrackerSqliteEntry = {
	dateIso: string;
	bucketId: string;
	modelName: string;
	costSpent: number;
	costSaved: number;
}

export type OpenAiCostTrackerSqliteModelCost = {
	modelName: string;
	costSpent: number;
	costSaved: number;
}

export type OpenAiCostTrackerSqliteBucketCost = {
	bucketId: string;
	costSpent: number;
	costSaved: number;
	models: OpenAiCostTrackerSqliteModelCost[];
}

export type OpenAiCostTrackerSqliteCostSummary = {
	total: {
		costSpent: number;
		costSaved: number;
	};
	buckets: OpenAiCostTrackerSqliteBucketCost[];
}
