// ============================================================================
// Core Resource Types
// ============================================================================

export interface LinearUser {
  id: string;
  displayName: string;
}

export interface LinearState {
  id: string;
  name: string;
}

export interface LinearCycle {
  id: string;
  name: string;
}

export interface LinearIssue {
  id: string;
  identifier: string;
  title: string;
  description?: string;
  priority: number;
  archivedAt?: string;
  createdAt: string;
  dueDate?: string;
  assignee?: LinearUser;
  creator?: LinearUser;
  state?: LinearState;
  cycle?: LinearCycle;
}

export interface LinearComment {
  id: string;
  body: string;
  createdAt: string;
  user?: LinearUser;
}

// ============================================================================
// Webhook Event Payload Types
// ============================================================================

export interface LinearIssueEvent {
  action: "create" | "update" | "remove";
  type: "Issue";
  data: LinearIssue;
  url?: string;
  updatedFrom?: Partial<LinearIssue>;
}

export interface LinearCommentEvent {
  action: "create" | "update" | "remove";
  type: "Comment";
  data: LinearComment & { issue?: { id: string; identifier: string; title: string } };
  url?: string;
}
