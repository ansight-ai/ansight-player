// Shared presentation and session contracts. Private cloud administration models stay in ansight-cloud.

export type TeamRole = 'admin' | 'owner'

export type TeamWorkspaceKind = 'personal' | 'organisation'

export type SessionAccessStatus = 'team' | 'public_with_auth' | 'public_no_auth'

export type AiProvider = 'openai' | 'anthropic' | 'gemini'

export type SessionAiExtractionKind = 'analysis' | 'mermaid'

export type SessionAiExtractionMode = 'fast' | 'thorough'

export type SessionAiExtractionStatus = 'queued' | 'running' | 'succeeded' | 'failed' | 'cancelled'

export type SessionAiSourcePart =
  | 'session_metadata'
  | 'logs'
  | 'screenshots'
  | 'visual_tree'
  | 'metrics'
  | 'annotations'
  | 'artifacts'

export type Team = {
  id: string
  name: string
  workspace_kind: TeamWorkspaceKind
  image_storage_path: string | null
  member_cap: number
  session_attachment_max_file_bytes: number
  session_attachment_max_total_bytes: number
  allowed_app_ids: string[]
  companion_machines_allow_by_default: boolean
  automatic_session_summary_enabled: boolean
  created_by_user_id: string | null
  created_at: string
  updated_at: string
}

export type TeamMember = {
  team_id: string
  user_id: string
  display_name: string
  email: string
  invited_by_user_id: string | null
  joined_at: string
}

export type TeamInvitation = {
  id: string
  team_id: string
  email: string
  role: TeamRole | null
  invited_by_user_id: string
  accepted_by_user_id: string | null
  accepted_at: string | null
  revoked_at: string | null
  expires_at: string | null
  created_at: string
}

export type TeamSession = {
  id: string
  team_id: string
  uploaded_by_user_id: string | null
  app_id: string | null
  app_name: string | null
  session_id: string | null
  title: string
  description: string
  storage_bucket: string
  storage_path: string
  storage_layout: string
  manifest_storage_path: string | null
  stream_byte_size: number
  stream_file_count: number
  archive_byte_size: number
  archive_content_type: string
  captured_start_at: string | null
  captured_end_at: string | null
  uploaded_at: string
  updated_at: string
  duration_ms: number | null
  log_count: number
  screenshot_count: number
  visual_tree_snapshot_count: number
  artifact_snapshot_count: number
  artifact_file_count: number
  artifact_byte_size: number
  annotation_count: number
  analysis_count: number
  metric_sample_count: number
  metric_channel_count: number
  author_user_id: string | null
  author_email: string | null
  author_name: string | null
  author_company: string | null
  platform_key: string | null
  operating_system: string | null
  app_version: string | null
  sdk_name: string | null
  sdk_version: string | null
  sdk_language: string | null
  device_model: string | null
  device_os_name: string | null
  is_emulator: boolean | null
  tags: string[]
  metadata: unknown
  access_status: SessionAccessStatus
  archived_at: string | null
  archived_by_user_id: string | null
  capture_upload_id: string | null
  upload_source: 'ansight' | 'offline_capture_api'
}

export type SessionAttachment = {
  id: string
  session_id: string
  team_id: string
  uploaded_by_user_id: string | null
  name: string
  notes: string
  storage_bucket: string
  storage_path: string
  byte_size: number
  content_type: string
  original_file_name: string
  created_at: string
  updated_at: string
}

export type TeamMemberWithRole = TeamMember & {
  role: TeamRole | null
}

export type TeamContext = {
  teams: Team[]
  selectedTeam: Team | null
  members: TeamMemberWithRole[]
  invitations: TeamInvitation[]
  currentUserRole: TeamRole | null
}

export type AppGraphDestinationKind = 'screen' | 'dialog' | 'state'

export type AppGraphNodeKind = AppGraphDestinationKind

export type AppGraphNode = {
  id: string
  kind: AppGraphNodeKind
  /** Canonical human name for this screen, dialog, or named state. */
  name: string
  /** Alternative names an agent or user may use for this destination. */
  synonyms: string[]
  /** Why this destination exists and what the user can accomplish there. */
  purpose: string
  /** A state from which pathfinding may begin, even when navigation can also return to it. */
  isEntry?: boolean
  /** The reusable screen or navigation host that structurally contains this destination. */
  parentScreen?: string
  x: number
  y: number
  confidence?: number
  provenanceObservationIds?: string[]
}

export type AppGraphBindingMechanism = 'app_link' | 'native_route' | 'app_tool' | 'ui_action'

export type AppGraphBindingCandidate = {
  mechanism: AppGraphBindingMechanism
  configuration: Record<string, unknown>
  preconditions: string[]
  postconditions: string[]
  confidence: number
}

export type AppGraphElementAction = {
  /** Stable automation/accessibility/test identifier for the element that performs the action. */
  automationId: string
  /** Product-level meaning of using the element, independent of gesture or framework. */
  semanticMeaning: string
}

export type AppGraphEdge = {
  id: string
  from: string
  to: string
  action: AppGraphElementAction
  parameters?: string[]
  preconditions?: string[]
  postconditions?: string[]
  confidence?: number
  provenanceObservationIds?: string[]
  /** Evidence-derived ways to execute this transition, ordered from strongest to weakest. */
  bindingCandidates?: AppGraphBindingCandidate[]
}

export type AppGraphNavigationHost = {
  id: string
  kind: 'flyout' | 'drawer' | 'bottom_tabs' | 'top_tabs' | 'navigation_rail' | 'shell' | 'other'
  name: string
  destinationId: string
  activeChildDestinationId: string
  childDestinationIds: string[]
  /** Legacy compatibility projection. The technology descriptor is authoritative. */
  framework: string
  technology?: AppGraphNavigationTechnology
  confidence?: number
}

export type AppGraphNavigationTechnology = {
  framework: string
  /** Framework-owned topology kind, such as shell_flyout or react_navigation_drawer. */
  kind: string
  navigationToolId: string
  structureFingerprint: string
}

export type AppGraphTabGroup = {
  id: string
  parentDestinationId: string
  selectedDestinationId: string
  tabDestinationIds: string[]
  technology?: AppGraphNavigationTechnology
  confidence?: number
}

export type AppGraphDefinition = {
  schema: 'ansight.app-graph/v1'
  nodes: AppGraphNode[]
  edges: AppGraphEdge[]
  navigationHosts?: AppGraphNavigationHost[]
  tabGroups?: AppGraphTabGroup[]
  sourceMermaid?: string
}

export type AppGraphTimelineAnnotationKind = 'state' | 'action' | 'condition' | 'ignore'

export type AppGraphTimelineAnnotation = {
  id: string
  kind: AppGraphTimelineAnnotationKind
  startMs: number
  endMs: number
  label: string
  destinationKind?: AppGraphDestinationKind
  synonyms?: string[]
  purpose?: string
  /** The top-level screen containing this observed state. Empty means this is itself a top-level state. */
  parentStateLabel?: string
  description: string
  parameters: string[]
  preconditions: string[]
  postconditions: string[]
  /** The captured gesture or tool evidence associated with this action annotation. */
  bindingCandidate?: AppGraphBindingCandidate
}

export type AppGraphTrajectoryState = {
  id: string
  annotationId: string
  kind: 'state'
  label: string
  destinationKind?: AppGraphDestinationKind
  synonyms?: string[]
  purpose?: string
  parentStateLabel?: string
  description: string
  startMs: number
  endMs: number
}

export type AppGraphTrajectoryTransition = {
  id: string
  fromStateId: string
  toStateId: string
  annotationIds: string[]
  label: string
  intent: string
  parameters: string[]
  preconditions: string[]
  postconditions: string[]
  bindingCandidates?: AppGraphBindingCandidate[]
}

export type AppGraphReviewedTrajectory = {
  schema: 'ansight.app-graph-trajectory/v1'
  scope: string
  states: AppGraphTrajectoryState[]
  transitions: AppGraphTrajectoryTransition[]
}

export type AppGraphBinding = {
  id: string
  team_id: string
  app_graph_version_id: string
  edge_id: string
  priority: number
  mechanism: AppGraphBindingMechanism
  configuration: Record<string, unknown>
  preconditions: string[]
  postconditions: string[]
  confidence: number
  created_by_user_id: string
  created_at: string
  updated_at: string
}

export type AppGraphRunStepStatus = 'pending' | 'running' | 'succeeded' | 'failed' | 'skipped'

export type SessionAiCapabilities = {
  session_id: string
  team_id: string
  analysis_enabled: boolean
  mermaid_enabled: boolean
  max_session_duration_seconds: number
  thorough_analysis_enabled: boolean
  max_ai_screenshot_count: number
  max_ai_screenshot_request_rounds: number
  max_ai_extraction_wall_clock_seconds: number
  openai_configured: boolean
  anthropic_configured: boolean
  gemini_configured: boolean
  allocated_tokens: number
  consumed_tokens: number
  remaining_tokens: number
}

export type SessionAiExtractionSummary = {
  id: string
  session_id: string
  team_id: string
  requested_by_user_id: string | null
  provider: AiProvider
  model: string
  kind: SessionAiExtractionKind
  analysis_mode: SessionAiExtractionMode
  status: SessionAiExtractionStatus
  source_parts: SessionAiSourcePart[]
  slice_start_ms: number | null
  slice_end_ms: number | null
  max_duration_seconds: number
  prompt_instructions: string
  archived_at: string | null
  archived_by_user_id: string | null
  progress_stage: string
  progress_message: string
  progress_percent: number
  progress_updated_at: string
  requested_at: string
  started_at: string | null
  completed_at: string | null
  error_message: string | null
  summary_markdown: string | null
  mermaid_definition: string | null
  result_json: unknown
  warnings: string[]
  input_tokens: number
  output_tokens: number
  total_tokens: number
  consumed_tokens: number
  cached_input_tokens: number
  cache_write_tokens: number
  reasoning_tokens: number
  tool_tokens: number
  estimated_cost_micros: number | null
  currency: string
}
