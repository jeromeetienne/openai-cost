# OpenAI Cost Tracker
- a fetch which intercepts OpenAI API calls, extracts usage info, and calculates costs based on the model and usage
  - log the input/output tokens and costs in a nice format
  - make it compatible with `openai-cache` - what if it is cached? usage is still returned but input tokens are not charged, so we need to split that out
    - what about we add a field in the response header like `x-openai-cache-status: hit|miss`? <- YES on constructor options
    - then we can use that to determine whether to charge for input tokens or not
  - openai-cost-tracker -> fetch function
  - openai-cost-tracker -> id to help you track costs per zone, team, project, etc.
  - openai-cost-tracker -> simply callback on exec
    - provide presets for logging to console, file, etc...