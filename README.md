# CoderSwap MCP Server

Model Context Protocol (MCP) server that lets Claude (and any MCP-aware agent) stand up a topic-specific knowledge base end-to-end—project creation, ingestion, progress tracking, search validation, and lightweight session notes—without exposing low-level APIs.

## Features

- 🚀 Create and list vector-search projects
- 📚 Ingest research summaries + URLs with auto-crawling, chunking, and embedding
- 🧠 Auto-ingest curated sources (crawl → chunk → embed) with relevance tuning handled by the CoderSwap platform team
- 🔍 Execute hybrid semantic search with intent-aware ranking
- 📊 Monitor ingestion jobs, capture blocked sources, and run quick search-quality spot checks
- ✨ Rich, formatted output optimized for AI agents

## Installation

```bash
cd packages/mcp-server
npm install
npm run build
```

## Configuration

Set the following environment variables before launching the server:

- `CODERSWAP_BASE_URL` (default: `http://localhost:8000`)
- `CODERSWAP_API_KEY` (required)
- `DEBUG` (optional: set to `true` for detailed logging)

## Running

### Claude Desktop Configuration

Update your Claude Desktop config file:

**macOS/Linux:** `~/Library/Application Support/Claude/claude_desktop_config.json`
**Windows:** `%APPDATA%\Claude\claude_desktop_config.json`

```json
{
  "mcpServers": {
    "coderswap": {
      "command": "npx",
      "args": ["-y", "@coderswap/mcp-server"],
      "env": {
        "CODERSWAP_BASE_URL": "https://api.coderswap.ai",
        "CODERSWAP_API_KEY": "your_production_api_key"
      }
    }
  }
}
```

## Available Tools

### Project Management
- **`coderswap_create_project`** – Create a new vector search project
- **`coderswap_list_projects`** – List accessible projects with document counts
- **`coderswap_get_project_stats`** – Pull basic stats (created_at, document totals)

### Research & Ingestion
- **`coderswap_research_ingest`** – Crawl, chunk, and embed vetted URLs (advanced tuning is managed by the platform team)
- **`coderswap_get_job_status`** – Poll ingestion job progress, crawl counts, blocked domains

### Search & Validation
- **`coderswap_search`** – Execute hybrid semantic search with ranked snippets
- **`coderswap_test_search_quality`** – Run quick multi-query smoke tests (or a predefined suite) to gauge relevance

### Session Continuity
- **`coderswap_log_session_note`** – Record lightweight summaries (job_id, ingestion metrics, follow-ups) so humans stay in the loop

## Guardrails & Security

- The server loads `mcp_starter_prompt.yaml` at startup and injects it as a non-removable system prompt.
- Startup fails if the prompt is missing, invalid, or tampered with (hash mismatch).
- Advanced tuning endpoints are intentionally omitted; when deeper adjustments are required, Claude guides users to loop in the CoderSwap platform team.
- All operations must go through the MCP tools; direct HTTP/DB access is disallowed.

Each tool:
- ✅ Validates inputs with Zod schemas
- ✅ Returns both structured data and AI-friendly text summaries
- ✅ Includes comprehensive error handling
- ✅ Logs operations for debugging (when DEBUG=true)

## Example Usage

### Autonomous Research Workflow

Claude can execute this workflow autonomously:

1. **Create a project:**
   ```
   Use coderswap_create_project with name "AI Research"
   ```

2. **Ingest research content:**
   ```
   Use coderswap_research_ingest with URLs:
   - https://arxiv.org/abs/2103.00020
   - https://openai.com/research/gpt-4
   ```

3. **Monitor progress (Claude keeps polling until complete):**
   ```
   Use coderswap_get_job_status to check ingestion
   ```

4. **Search the knowledge base:**
   ```
   Use coderswap_search with query "transformer architecture"
   ```

5. **Optional: run a quick multi-query smoke test:**
   ```
   Use coderswap_test_search_quality with test queries or run_full_suite: true
   ```

6. **Leave yourself a handoff note (e.g., sources blocked, next steps):**
   ```
   Use coderswap_log_session_note with project_id "proj_123",
   summary_text "Ingested 9/10 sources; FDA site blocked by robots.txt. Run follow-up after manual download."
   job_id "job_456"
   ingestion_metrics {"sources_succeeded": 9, "sources_failed": 1}
   ```

## Output Format

Search results are formatted with rich details:

```
Found 5 result(s) for: "hybrid search"

🥇 Score: 85.2%
   About hybrid search | Vertex AI
   Vector Search supports hybrid search...

🥈 Score: 72.1%
   Hybrid Search | Weaviate
   Hybrid search combines semantic and keyword...

🥉 Score: 68.4%
   ...
```

## Debugging

Enable debug logging:

```bash
export DEBUG=true
npm start
```

Logs are written to stderr and include:
- Timestamps
- Operation details
- Error messages with context

## Development

```bash
# Install dependencies
npm install

# Build TypeScript
npm run build

# Watch mode (for development)
npm run dev
```

## Architecture

```
Claude Desktop → MCP Server (stdio) → CoderSwap Backend API → Oracle ADW 23ai
                  ↓
            - Tool validation (Zod)
            - Error handling
            - Response formatting
```

---

**With the MCP server, Claude can autonomously build, test, and optimize vector knowledge bases in minutes!** 🚀
