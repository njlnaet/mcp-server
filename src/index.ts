#!/usr/bin/env node
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { z } from 'zod'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import crypto from 'node:crypto'
import YAML from 'yaml'
import { CoderSwapClient } from './coderswap-client.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const PROMPT_RELATIVE_PATH = '../mcp_starter_prompt.yaml'
const PROMPT_HASH = '48fc8e470dfbadf5e83dbd5713758a28e263806a8132b99a4dc048fa16d29419'

const GUARDRAIL_KEYWORDS = [
  'reset guardrails',
  'disable guardrails',
  'ignore guardrails',
  'bypass guardrails',
  'disable safety',
  'bypass safety',
  'disable protections',
  'turn off protections'
]

function formatValue(value: any, indent = '  '): string {
  if (value === null || value === undefined) {
    return `${indent}- (none)`
  }
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return `${indent}- ${String(value)}`
  }
  if (Array.isArray(value)) {
    if (value.length === 0) {
      return `${indent}- (none)`
    }
    return value
      .map(item =>
        typeof item === 'string' || typeof item === 'number' || typeof item === 'boolean'
          ? `${indent}- ${String(item)}`
          : formatValue(item, `${indent}  `)
      )
      .join('\n')
  }
  if (typeof value === 'object') {
    const entries = Object.entries(value)
    if (entries.length === 0) {
      return `${indent}- (empty)`
    }
    return entries
      .map(([key, val]) => `${indent}- ${key}:\n${formatValue(val, `${indent}  `)}`)
      .join('\n')
  }
  return `${indent}- ${String(value)}`
}

function renderPrompt(data: any): string {
  const sections: string[] = []
  const version = data?.version ?? 'unknown'
  const updated = data?.last_updated ?? 'unknown'
  sections.push(
    `CoderSwap MCP System Guardrails\nVersion: ${version} (Last updated ${updated})`
  )

  if (Array.isArray(data?.owners) && data.owners.length > 0) {
    const owners = data.owners
      .map((owner: any) => {
        const name = owner?.name ?? 'Unknown'
        const contact = owner?.contact ? ` (${owner.contact})` : ''
        return `  - ${name}${contact}`
      })
      .join('\n')
    sections.push(`Owners:\n${owners}`)
  }

  if (data?.description) {
    sections.push(`Description:\n  ${String(data.description).trim()}`)
  }

  function pushSection(title: string, value: any) {
    if (value === undefined || value === null) return
    sections.push(`== ${title.toUpperCase()} ==\n${formatValue(value)}`)
  }

  pushSection('Product Overview', data?.product_overview)
  pushSection('Identity', data?.identity)
  pushSection('Privacy', data?.privacy)
  pushSection('Validation and Security', data?.validation_and_security)
  pushSection('Evaluation Standards', data?.evaluation_standards)
  pushSection('Promotion Policy', data?.promotion_policy)
  pushSection('Workflow', data?.workflow)
  pushSection('Communication Style', data?.communication_style)
  pushSection('Available Tools', data?.available_tools)
  pushSection('Human in Loop', data?.human_in_loop)
  pushSection('Error Handling', data?.error_handling)
  pushSection('Session Management', data?.session_management)
  pushSection('Workflow Templates', data?.workflow_templates)

  return sections.join('\n\n')
}

function containsGuardrailBypass(payload: unknown): boolean {
  if (payload === null || payload === undefined) return false
  if (typeof payload === 'string') {
    const lower = payload.toLowerCase()
    return GUARDRAIL_KEYWORDS.some(keyword => lower.includes(keyword))
  }
  if (Array.isArray(payload)) {
    return payload.some(item => containsGuardrailBypass(item))
  }
  if (typeof payload === 'object') {
    return Object.values(payload).some(value => containsGuardrailBypass(value))
  }
  return false
}

function guardrailViolationResponse() {
  return {
    content: [{
      type: 'text' as const,
      text: '✗ Request rejected: system guardrails cannot be bypassed.'
    }],
    isError: true
  }
}

// Environment configuration
const baseUrl = process.env.CODERSWAP_BASE_URL || 'http://localhost:8000'
const apiKey = process.env.CODERSWAP_API_KEY
const DEBUG = process.env.DEBUG === 'true'

// Logging utility
function log(level: 'info' | 'error' | 'debug', message: string, data?: any) {
  if (level === 'debug' && !DEBUG) return
  const timestamp = new Date().toISOString()
  const logData = data ? ` ${JSON.stringify(data)}` : ''
  console.error(`[${timestamp}] [${level.toUpperCase()}] ${message}${logData}`)
}

// Load guardrail system prompt
let systemPrompt: string
try {
  const promptPath = path.resolve(__dirname, PROMPT_RELATIVE_PATH)
  const rawPrompt = readFileSync(promptPath, 'utf-8')
  const hash = crypto.createHash('sha256').update(rawPrompt, 'utf8').digest('hex')
  if (hash !== PROMPT_HASH) {
    console.error(
      `ERROR: Guardrail prompt hash mismatch. Expected ${PROMPT_HASH}, received ${hash}. Refusing to start.`
    )
    process.exit(1)
  }
  const parsedPrompt = YAML.parse(rawPrompt)
  if (!parsedPrompt || typeof parsedPrompt !== 'object') {
    throw new Error('Parsed prompt is empty or invalid.')
  }
  systemPrompt = renderPrompt(parsedPrompt)
  if (!systemPrompt || !systemPrompt.trim()) {
    throw new Error('Rendered system prompt is empty.')
  }
  log('info', 'Guardrail prompt loaded successfully', { prompt_hash: hash })
} catch (error) {
  console.error(
    'ERROR: Failed to load guardrail prompt.',
    error instanceof Error ? error.message : error
  )
  process.exit(1)
}

// Validate API key
if (!apiKey) {
  console.error('ERROR: CODERSWAP_API_KEY environment variable is required')
  process.exit(1)
}

// Initialize CoderSwap API client
const client = new CoderSwapClient({ baseUrl, apiKey })
log('info', `CoderSwap MCP Server starting with backend: ${baseUrl}`)

// Initialize MCP Server
const server = new McpServer({
  name: 'coderswap-mcp',
  version: '0.1.0',
  systemPrompt
})

// Tool 0: Create Project
server.registerTool(
  'coderswap_create_project',
  {
    title: 'Create CoderSwap Project',
    description: 'Create a new vector search project in CoderSwap',
    inputSchema: {
      name: z.string().min(1, 'Project name is required'),
      description: z.string().optional()
    },
    outputSchema: {
      project_id: z.string(),
      name: z.string(),
      status: z.string().optional()
    }
  },
  async ({ name, description }) => {
    try {
      log('debug', 'Creating project', { name, description })
      const project: any = await client.createProject({ name, description })

      const output = {
        project_id: project.project_id,
        name: project.name || name,
        status: project.status
      }

      log('info', `Created project: ${project.project_id}`)

      return {
        content: [{
          type: 'text',
          text: `✓ Created project "${name}" (ID: ${project.project_id})`
        }],
        structuredContent: output
      }
    } catch (error) {
      log('error', 'Failed to create project', { error: error instanceof Error ? error.message : error })
      return {
        content: [{
          type: 'text',
          text: `✗ Failed to create project: ${error instanceof Error ? error.message : 'Unknown error'}`
        }],
        isError: true
      }
    }
  }
)

// Tool 1: List Projects
server.registerTool(
  'coderswap_list_projects',
  {
    title: 'List CoderSwap Projects',
    description: 'List all CoderSwap projects available to your API key',
    inputSchema: {},
    outputSchema: {
      count: z.number(),
      projects: z.array(z.object({
        project_id: z.string(),
        name: z.string().optional(),
        doc_count: z.number().optional()
      }))
    }
  },
  async () => {
    try {
      log('debug', 'Listing projects')
      const projects = await client.listProjects()

      const output = {
        count: projects.length,
        projects: projects.map(p => ({
          project_id: p.project_id,
          name: p.name,
          doc_count: p.doc_count,
          search_mode: (p as any).search_mode
        }))
      }

      if (projects.length === 0) {
        return {
          content: [{
            type: 'text',
            text: 'No projects found'
          }],
          structuredContent: output
        }
      }

      const projectList = projects
        .map(p => {
          const lines = [
            `• ${p.name || 'Untitled Project'}`,
            `  ID: ${p.project_id}`,
            `  Docs: ${p.doc_count ?? 0}`
          ]
          if ((p as any).search_mode) {
            lines.push(`  Search Mode: ${(p as any).search_mode}`)
          }
          return lines.join('\n')
        })
        .join('\n\n')

      log('info', `Found ${projects.length} projects`)

      return {
        content: [{
          type: 'text',
          text: `Found ${projects.length} project(s):\n\n${projectList}`
        }],
        structuredContent: output
      }
    } catch (error) {
      log('error', 'Failed to list projects', { error: error instanceof Error ? error.message : error })
      return {
        content: [{
          type: 'text',
          text: `✗ Failed to list projects: ${error instanceof Error ? error.message : 'Unknown error'}`
        }],
        isError: true
      }
    }
  }
)

// Tool 2: Get Project Stats
server.registerTool(
  'coderswap_get_project_stats',
  {
    title: 'Get CoderSwap Project Stats',
    description: 'Get statistics and information about a specific project',
    inputSchema: {
      project_id: z.string().min(1, 'project_id is required')
    },
    outputSchema: {
      project_id: z.string(),
      name: z.string().optional(),
      doc_count: z.number().optional(),
      created_at: z.string().optional()
    }
  },
  async ({ project_id }) => {
    try {
      log('debug', 'Getting project stats', { project_id })
      const stats = await client.getProjectStats(project_id)

      const output = {
        project_id: stats.project_id,
        name: stats.name,
        doc_count: stats.doc_count,
        created_at: stats.created_at
      }

      log('info', `Retrieved stats for project: ${project_id}`)

      return {
        content: [{
          type: 'text',
          text: `Project: ${stats.name || project_id}\nDocuments: ${stats.doc_count || 0}\nCreated: ${stats.created_at || 'Unknown'}`
        }],
        structuredContent: output
      }
    } catch (error) {
      log('error', 'Failed to get project stats', { project_id, error: error instanceof Error ? error.message : error })
      return {
        content: [{
          type: 'text',
          text: `✗ Failed to get project stats: ${error instanceof Error ? error.message : 'Unknown error'}`
        }],
        isError: true
      }
    }
  }
)

// Tool 3: Research Ingest
server.registerTool(
  'coderswap_research_ingest',
  {
    title: 'CoderSwap Research Ingest',
    description: 'Submit research summary and URLs for web crawling, chunking, embedding, and optional DSL generation',
    inputSchema: {
      project_id: z.string().min(1, 'project_id is required'),
      research_summary: z.string().optional(),
      urls: z.array(z.string().url()).min(1, 'At least one URL is required'),
      intent: z.string().optional(),
      depth: z.number().min(0).max(1).default(0),
      generate_dsl: z.boolean().default(true)
    },
    outputSchema: {
      job_id: z.string(),
      project_id: z.string(),
      status: z.string()
    }
  },
  async ({ project_id, research_summary, urls, intent, depth = 0, generate_dsl = true }) => {
    if (containsGuardrailBypass({ project_id, research_summary, urls, intent })) {
      return guardrailViolationResponse()
    }
    try {
      log('debug', 'Starting research ingest', { project_id, url_count: urls.length, generate_dsl })
      const job: any = await client.researchIngest({
        project_id,
        research_summary,
        urls,
        intent,
        depth,
        generate_dsl
      })

      const output = {
        job_id: job.job_id,
        project_id,
        status: 'queued'
      }

      log('info', `Queued research ingest job: ${job.job_id}`)

      return {
        content: [{
          type: 'text',
          text: `✓ Queued research ingest job: ${job.job_id}\n\nCrawling ${urls.length} URL(s)...\nDSL Generation: ${generate_dsl ? 'enabled' : 'disabled'}\n\nUse coderswap_get_job_status to monitor progress.`
        }],
        structuredContent: output
      }
    } catch (error) {
      log('error', 'Failed to start research ingest', { project_id, error: error instanceof Error ? error.message : error })
      return {
        content: [{
          type: 'text',
          text: `✗ Failed to start research ingest: ${error instanceof Error ? error.message : 'Unknown error'}`
        }],
        isError: true
      }
    }
  }
)

// Tool 4: Get Job Status
server.registerTool(
  'coderswap_get_job_status',
  {
    title: 'Get CoderSwap Job Status',
    description: 'Check the status of a research ingestion job',
    inputSchema: {
      job_id: z.string().min(1, 'job_id is required')
    },
    outputSchema: {
      job_id: z.string(),
      state: z.string(),
      crawled_count: z.number().optional(),
      failed_count: z.number().optional()
    }
  },
  async ({ job_id }) => {
    try {
      log('debug', 'Checking job status', { job_id })
      const job = await client.getJobStatus(job_id)

      const output = {
        job_id: job.job_id,
        state: job.state,
        crawled_count: job.crawled_count,
        failed_count: job.failed_count
      }

      log('info', `Job ${job_id} status: ${job.state}`)

      let statusText = `Job: ${job_id}\nStatus: ${job.state}`
      if (job.crawled_count !== undefined) {
        statusText += `\nCrawled: ${job.crawled_count} documents`
      }
      if (job.failed_count !== undefined && job.failed_count > 0) {
        statusText += `\nFailed: ${job.failed_count} documents`
      }

      return {
        content: [{
          type: 'text',
          text: statusText
        }],
        structuredContent: output
      }
    } catch (error) {
      log('error', 'Failed to get job status', { job_id, error: error instanceof Error ? error.message : error })
      return {
        content: [{
          type: 'text',
          text: `✗ Failed to get job status: ${error instanceof Error ? error.message : 'Unknown error'}`
        }],
        isError: true
      }
    }
  }
)

// Tool 5: Search
server.registerTool(
  'coderswap_search',
  {
    title: 'CoderSwap Hybrid Search',
    description: 'Execute a hybrid search query against a CoderSwap project using DSL-powered ranking',
    inputSchema: {
      project_id: z.string().min(1, 'project_id is required'),
      query: z.string().min(1, 'query is required'),
      top_k: z.number().min(1).max(50).default(10),
      snippet_length: z.number().min(50).max(1000).default(200)
    },
    outputSchema: {
      query: z.string(),
      result_count: z.number(),
      results: z.array(z.object({
        score: z.number(),
        title: z.string().optional(),
        snippet: z.string().optional()
      }))
    }
  },
  async ({ project_id, query, top_k = 10, snippet_length = 200 }) => {
    try {
      log('debug', 'Executing search', { project_id, query, top_k })
      const result = await client.search({ project_id, query, top_k, snippet_length })

      const output = {
        query,
        result_count: result.results.length,
        results: result.results.slice(0, top_k).map(r => ({
          score: r.score,
          title: r.title,
          snippet: r.snippet
        }))
      }

      if (result.results.length === 0) {
        return {
          content: [{
            type: 'text',
            text: `No results found for: "${query}"`
          }],
          structuredContent: output
        }
      }

      // Format results with rich detail
      const formattedResults = result.results
        .slice(0, top_k)
        .map((r, i) => {
          const medal = i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `${i + 1}.`
          const score = ((r.score ?? 0) * 100).toFixed(1)
          let text = `${medal} Score: ${score}%`
          if (r.title) text += `\n   ${r.title}`
          if (r.snippet) text += `\n   ${r.snippet.substring(0, 150)}...`
          return text
        })
        .join('\n\n')

      log('info', `Search returned ${result.results.length} results`)

      return {
        content: [{
          type: 'text',
          text: `Found ${result.results.length} result(s) for: "${query}"\n\n${formattedResults}`
        }],
        structuredContent: output
      }
    } catch (error) {
      log('error', 'Search failed', { project_id, query, error: error instanceof Error ? error.message : error })
      return {
        content: [{
          type: 'text',
          text: `✗ Search failed: ${error instanceof Error ? error.message : 'Unknown error'}`
        }],
        isError: true
      }
    }
  }
)

// Tool 6: Validate Search Quality
server.registerTool(
  'coderswap_validate_search',
  {
    title: 'Validate CoderSwap Search Quality',
    description: 'Run validation queries to test search quality and coverage (non-DSL quality check)',
    inputSchema: {
      project_id: z.string().min(1, 'project_id is required'),
      test_queries: z.array(z.string()).optional(),
      run_full_suite: z.boolean().default(false)
    },
    outputSchema: {
      queries_tested: z.number(),
      average_top_score: z.number(),
      zero_result_queries: z.array(z.string())
    }
  },
  async ({ project_id, test_queries, run_full_suite = false }) => {
    try {
      log('debug', 'Testing search quality', { project_id, run_full_suite })
      const report = await client.testSearchQuality({ project_id, test_queries, run_full_suite })

      const output = {
        queries_tested: report.aggregate.queries_tested,
        average_top_score: report.aggregate.average_top_score,
        zero_result_queries: report.aggregate.zero_result_queries
      }

      const avgScore = (report.aggregate.average_top_score * 100).toFixed(1)
      const zeroResults = report.aggregate.zero_result_queries.length

      let summary = `Search Quality Report\n${'='.repeat(40)}\n`
      summary += `Queries tested: ${report.aggregate.queries_tested}\n`
      summary += `Average top score: ${avgScore}%\n`
      summary += `Zero-result queries: ${zeroResults}\n\n`

      if (report.results.length > 0) {
        summary += 'Top Results:\n'
        report.results.slice(0, 3).forEach(r => {
          const score = (r.topScore * 100).toFixed(1)
          summary += `  • "${r.query}" → ${score}% (${r.count} results)\n`
        })
      }

      log('info', `Search quality test completed: ${report.aggregate.queries_tested} queries`)

      return {
        content: [{
          type: 'text',
          text: summary
        }],
        structuredContent: output
      }
    } catch (error) {
      log('error', 'Search quality test failed', { project_id, error: error instanceof Error ? error.message : error })
      return {
        content: [{
          type: 'text',
          text: `✗ Search quality test failed: ${error instanceof Error ? error.message : 'Unknown error'}`
        }],
        isError: true
      }
    }
  }
)

// Tool 7: Log Session Note
server.registerTool(
  'coderswap_log_session_note',
  {
    title: 'Log Session Note',
    description: 'Record lightweight ingestion summary for session continuity (non-DSL)',
    inputSchema: {
      project_id: z.string().min(1, 'project_id is required'),
      summary_text: z.string().min(1, 'summary_text is required'),
      job_id: z.string().optional(),
      ingestion_metrics: z.any().optional(),
      tags: z.any().optional()
    },
    outputSchema: {
      note_id: z.string(),
      project_id: z.string(),
      timestamp: z.string()
    }
  },
  async ({ project_id, summary_text, job_id, ingestion_metrics, tags }) => {
    if (containsGuardrailBypass({ project_id, summary_text, job_id, ingestion_metrics, tags })) {
      return guardrailViolationResponse()
    }
    try {
      log('debug', 'Logging session note', { project_id, job_id })

      // Generate a simple note ID
      const timestamp = new Date().toISOString()
      const note_id = `note_${Date.now()}`

      // Log the note (for now, just to console/debug)
      log('info', `Session note logged for project ${project_id}`, {
        note_id,
        summary_text,
        job_id,
        ingestion_metrics,
        tags
      })

      const output = {
        note_id,
        project_id,
        timestamp
      }

      return {
        content: [{
          type: 'text',
          text: `✓ Logged session note: ${summary_text.substring(0, 100)}${summary_text.length > 100 ? '...' : ''}`
        }],
        structuredContent: output
      }
    } catch (error) {
      log('error', 'Failed to log session note', { project_id, error: error instanceof Error ? error.message : error })
      return {
        content: [{
          type: 'text',
          text: `✗ Failed to log session note: ${error instanceof Error ? error.message : 'Unknown error'}`
        }],
        isError: true
      }
    }
  }
)

// Start the server with stdio transport
const transport = new StdioServerTransport()
await server.connect(transport)

log('info', 'CoderSwap MCP Server ready and listening on stdio')
