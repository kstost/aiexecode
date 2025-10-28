export interface LogFile {
  name: string
  size: number
  modified: string
  created: string
  extension: string
  parsedInfo?: {
    date: string
    timestamp: string
    component: string
    type: 'REQ' | 'RES'
    datetime: string
  }
}

export interface LogData {
  taskName: string
  timestamp: string
  data: any
  provider?: 'openai' | 'anthropic' // AI provider identifier
}

export interface WorkflowGroup {
  id: string
  component: string
  date: string
  files: LogFile[]
  startTime: string
  endTime: string
  duration: number
  status: 'completed' | 'failed' | 'in_progress'
}

export interface RequestPayload {
  model: string
  input: Array<{
    role: string
    content: Array<{
      type: string
      text: string
    }>
  }>
  tools?: any[]
  reasoning?: any
}

export interface ResponsePayload {
  id: string
  object: string
  created_at: number
  status: string
  model: string
  output: Array<{
    id: string
    type: string
    status?: string
    content?: any[]
    name?: string
    arguments?: string
    call_id?: string
  }>
  usage?: {
    input_tokens: number
    output_tokens: number
    total_tokens: number
    cache_creation_input_tokens?: number // Anthropic cache tokens
    cache_read_input_tokens?: number // Anthropic cache tokens
  }
  provider?: 'openai' | 'anthropic' // AI provider identifier
  stop_reason?: string // Anthropic stop reason
  stop_sequence?: string | null // Anthropic stop sequence
}