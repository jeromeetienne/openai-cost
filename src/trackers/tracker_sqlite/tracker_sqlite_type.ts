// local imports
import { ProviderId } from "../../provider-detector";

///////////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////
//	typescript types
///////////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////

export type OpenAiCostTrackerSqliteEntry = {
	dateIso: string;
	bucketId: string;
	provider: ProviderId;
	modelName: string;
	costSpent: number;
	costSaved: number;
}

export type OpenAiCostTrackerSqliteModelCost = {
	provider: ProviderId;
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
