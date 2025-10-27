import {
  CreateProjectInput,
  ResearchIngestInput,
  SearchInput,
  TestSearchQualityInput
} from './types'

export interface CoderSwapClientOptions {
  baseUrl: string
  apiKey: string
}

export interface ProjectSummary {
  project_id: string
  name?: string
  created_at?: string
  doc_count?: number
  status?: string
  search_mode?: string
  embedding_dim?: number
}

export interface IngestJobStatus {
  job_id: string
  state: string
  crawled_count?: number
  failed_count?: number
  total_tokens?: number
  error_log?: unknown
  project_id?: string
}

export interface SearchResult {
  score: number
  title?: string
  snippet?: string
  metadata?: Record<string, unknown>
}

export class CoderSwapClient {
  private readonly baseUrl: string
  private readonly apiKey: string

  constructor(options: CoderSwapClientOptions) {
    this.baseUrl = options.baseUrl.replace(/\/$/, '')
    this.apiKey = options.apiKey
  }

  private get headers() {
    return {
      'Content-Type': 'application/json',
      'X-API-Key': this.apiKey
    }
  }

  private async handleResponse<T>(res: Response): Promise<T> {
    if (!res.ok) {
      let detail = await res.text()
      try {
        const json = JSON.parse(detail)
        if (json.detail) {
          detail = typeof json.detail === 'string' ? json.detail : JSON.stringify(json.detail)
        } else if (json.errors) {
          detail = JSON.stringify(json.errors)
        } else if (json.message) {
          detail = json.message
        }
      } catch (error) {
        // ignore parse error
      }
      throw new Error(`CoderSwap API error (${res.status}): ${detail}`)
    }
    return (await res.json()) as T
  }

  async createProject(input: CreateProjectInput) {
    const res = await fetch(`${this.baseUrl}/v1/projects`, {
      method: 'POST',
      headers: this.headers,
      body: JSON.stringify({
        name: input.name,
        description: input.description,
        embedding_dim: 384
      })
    })
    return this.handleResponse(res)
  }

  async listProjects(): Promise<ProjectSummary[]> {
    const res = await fetch(`${this.baseUrl}/v1/projects`, {
      headers: this.headers
    })
    const data = await this.handleResponse<{ projects: ProjectSummary } | { projects: ProjectSummary[] }>(res)
    return Array.isArray((data as any).projects) ? (data as any).projects : []
  }

  async getProjectStats(projectId: string) {
    const projects = await this.listProjects()
    const project = projects.find((item) => item.project_id === projectId)
    if (!project) {
      throw new Error(`Project ${projectId} not found`)
    }
    return project
  }

  async researchIngest(input: ResearchIngestInput) {
    const form = new FormData()
    form.set('project_id', input.project_id)
    form.set('generate_dsl', String(input.generate_dsl))
    form.set('depth', String(input.depth ?? 0))
    if (input.research_summary) form.set('research_summary', input.research_summary)
    if (input.intent) form.set('intent', input.intent)
    ;(input.urls || []).forEach((url) => form.append('urls', url))

    const res = await fetch(`${this.baseUrl}/research/ingest`, {
      method: 'POST',
      headers: {
        'X-API-Key': this.apiKey
      },
      body: form
    })
    return this.handleResponse(res)
  }

  async getJobStatus(jobId: string): Promise<IngestJobStatus> {
    const res = await fetch(`${this.baseUrl}/research/jobs/${jobId}`, {
      headers: this.headers
    })
    const data = await this.handleResponse<{ job: IngestJobStatus }>(res)
    return data.job
  }

  async search(input: SearchInput) {
    const res = await fetch(`${this.baseUrl}/v1/search`, {
      method: 'POST',
      headers: this.headers,
      body: JSON.stringify({
        project_id: input.project_id,
        query: input.query,
        snippet_length: input.snippet_length ?? 200,
        settings: {
          k: input.top_k ?? 5
        }
      })
    })
    return this.handleResponse<{ results: SearchResult[]; request_id?: string }>(res)
  }

  async testSearchQuality(input: TestSearchQualityInput) {
    const queries = input.run_full_suite
      ? [
          'what is hybrid search',
          'how to implement rag',
          'error troubleshooting vector search',
          'bm25 algorithm',
          'semantic vs keyword search'
        ]
      : input.test_queries || []

    const uniqueQueries = Array.from(new Set(queries))
    if (uniqueQueries.length === 0) {
      throw new Error('No queries provided for search quality test')
    }

    const results = [] as Array<{ query: string; topScore: number; count: number; items: SearchResult[] }>
    for (const query of uniqueQueries) {
      const response = await this.search({ project_id: input.project_id, query })
      const sorted = response.results.sort((a, b) => (b.score ?? 0) - (a.score ?? 0))
      results.push({
        query,
        topScore: sorted[0]?.score ?? 0,
        count: sorted.length,
        items: sorted
      })
    }

    const aggregate = {
      queries_tested: results.length,
      average_top_score:
        results.reduce((sum, item) => sum + (item.topScore || 0), 0) / Math.max(results.length, 1),
      zero_result_queries: results.filter((item) => item.count === 0).map((item) => item.query)
    }

    return { aggregate, results }
  }

}
