---
name: tavily-search
description: Search the web using the Tavily Search API for real-time information, research, and fact-checking.
metadata: {"openclaw":{"emoji":"🔍","requires":{"env":["TAVILY_API_KEY"]},"primaryEnv":"TAVILY_API_KEY"}}
---

# Tavily Search

Web search via the Tavily Search API. Use this when the user needs current information, research, fact-checking, or any question that benefits from real-time web data.

## When to use

- User asks about recent events, news, or current data
- Questions requiring up-to-date information beyond training data
- Research tasks needing multiple web sources
- Fact verification or finding official documentation
- "Search for", "look up", "find out", "what's the latest on"

## How to search

Use `curl` to call the Tavily API:

```bash
curl -s https://api.tavily.com/search \
  -H "Content-Type: application/json" \
  -d '{
    "api_key": "'"$TAVILY_API_KEY"'",
    "query": "YOUR SEARCH QUERY HERE",
    "search_depth": "basic",
    "max_results": 5,
    "include_answer": true
  }'
```

### Parameters

- `query` (required): The search query string.
- `search_depth`: `"basic"` (fast, default) or `"advanced"` (slower, more thorough).
- `max_results`: Number of results to return (default: 5, max: 20).
- `include_answer`: `true` to get an AI-generated summary answer.
- `include_raw_content`: `true` to include full page content (use sparingly — large responses).
- `topic`: `"general"` (default) or `"news"` for news-focused results.

### Response format

The API returns JSON with:
- `answer`: AI-generated summary (if `include_answer: true`)
- `results[]`: Array of search results, each with `title`, `url`, `content` (snippet)
- `response_time`: Time taken in seconds

### Tips

- Use `search_depth: "advanced"` for complex research questions.
- Use `topic: "news"` for current events and breaking news.
- Always cite sources by including URLs from the results.
- For deep research, run multiple searches with different queries.
- Parse JSON output with `jq` for cleaner processing: `curl ... | jq '.results[] | {title, url, content}'`
