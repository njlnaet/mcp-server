import { z } from 'zod'

export const createProjectSchema = z.object({
  name: z.string().min(1, 'Project name is required'),
  description: z.string().optional()
})

export const researchIngestSchema = z.object({
  project_id: z.string().min(1, 'project_id is required'),
  research_summary: z.string().optional(),
  urls: z.array(z.string().url()).default([]),
  intent: z.string().optional(),
  depth: z.number().min(0).max(1).default(0),
  generate_dsl: z.boolean().default(true)
})

export const searchSchema = z.object({
  project_id: z.string().min(1, 'project_id is required'),
  query: z.string().min(1, 'query is required'),
  top_k: z.number().min(1).max(50).optional(),
  snippet_length: z.number().min(50).max(1000).optional()
})

export const jobStatusSchema = z.object({
  job_id: z.string().min(1)
})

export const listProjectsSchema = z.object({})

export const projectStatsSchema = z.object({
  project_id: z.string().min(1)
})

export const testSearchQualitySchema = z.object({
  project_id: z.string().min(1),
  test_queries: z.array(z.string().min(1)).optional(),
  run_full_suite: z.boolean().optional()
})

export type CreateProjectInput = z.infer<typeof createProjectSchema>
export type ResearchIngestInput = z.infer<typeof researchIngestSchema>
export type SearchInput = z.infer<typeof searchSchema>
export type JobStatusInput = z.infer<typeof jobStatusSchema>
export type ListProjectsInput = z.infer<typeof listProjectsSchema>
export type ProjectStatsInput = z.infer<typeof projectStatsSchema>
export type TestSearchQualityInput = z.infer<typeof testSearchQualitySchema>
