/**
 * GitHub Integration Type Definitions
 * Based on GitHub REST API v3 (2022-11-28)
 */

// ============================================================================
// Core GitHub Types
// ============================================================================

export interface GitHubUser {
  login: string;
  id: number;
  node_id: string;
  avatar_url: string;
  gravatar_id?: string;
  url: string;
  html_url: string;
  type: 'User' | 'Bot' | 'Organization';
  site_admin: boolean;
  name?: string;
  email?: string;
  bio?: string;
  company?: string;
  location?: string;
  hireable?: boolean;
  blog?: string;
  public_repos?: number;
  public_gists?: number;
  followers?: number;
  following?: number;
  created_at?: string;
  updated_at?: string;
}

export interface GitHubRepository {
  id: number;
  node_id: string;
  name: string;
  full_name: string;
  owner: GitHubUser;
  private: boolean;
  html_url: string;
  description?: string;
  fork: boolean;
  url: string;
  created_at: string;
  updated_at: string;
  pushed_at: string;
  git_url: string;
  ssh_url: string;
  clone_url: string;
  svn_url: string;
  homepage?: string;
  size: number;
  stargazers_count: number;
  watchers_count: number;
  language?: string;
  has_issues: boolean;
  has_projects: boolean;
  has_downloads: boolean;
  has_wiki: boolean;
  has_pages: boolean;
  forks_count: number;
  mirror_url?: string;
  archived: boolean;
  disabled: boolean;
  open_issues_count: number;
  license?: {
    key: string;
    name: string;
    spdx_id?: string;
    url?: string;
    node_id: string;
  };
  topics?: string[];
  forks: number;
  open_issues: number;
  watchers: number;
  default_branch: string;
  permissions?: {
    admin: boolean;
    maintain?: boolean;
    push: boolean;
    triage?: boolean;
    pull: boolean;
  };
  visibility?: 'public' | 'private' | 'internal';
}

export interface GitHubLabel {
  id: number;
  node_id: string;
  url: string;
  name: string;
  description?: string;
  color: string;
  default: boolean;
}

export interface GitHubMilestone {
  id: number;
  node_id: string;
  number: number;
  state: 'open' | 'closed';
  title: string;
  description?: string;
  creator: GitHubUser;
  open_issues: number;
  closed_issues: number;
  created_at: string;
  updated_at: string;
  closed_at?: string;
  due_on?: string;
}

export interface GitHubIssue {
  id: number;
  node_id: string;
  url: string;
  repository_url: string;
  labels_url: string;
  comments_url: string;
  events_url: string;
  html_url: string;
  number: number;
  state: 'open' | 'closed';
  state_reason?: 'completed' | 'not_planned' | 'reopened';
  title: string;
  body?: string;
  user: GitHubUser;
  labels: GitHubLabel[];
  assignee?: GitHubUser;
  assignees?: GitHubUser[];
  milestone?: GitHubMilestone;
  locked: boolean;
  active_lock_reason?: 'off-topic' | 'too heated' | 'resolved' | 'spam';
  comments: number;
  pull_request?: {
    url: string;
    html_url: string;
    diff_url: string;
    patch_url: string;
  };
  closed_at?: string;
  created_at: string;
  updated_at: string;
  closed_by?: GitHubUser;
  author_association: string;
  reactions?: GitHubReactions;
}

export interface GitHubReactions {
  url: string;
  total_count: number;
  '+1': number;
  '-1': number;
  laugh: number;
  hooray: number;
  confused: number;
  heart: number;
  rocket: number;
  eyes: number;
}

export interface GitHubPullRequest {
  id: number;
  node_id: string;
  url: string;
  html_url: string;
  diff_url: string;
  patch_url: string;
  issue_url: string;
  number: number;
  state: 'open' | 'closed';
  locked: boolean;
  title: string;
  body?: string;
  user: GitHubUser;
  created_at: string;
  updated_at: string;
  closed_at?: string;
  merged_at?: string;
  merge_commit_sha?: string;
  assignee?: GitHubUser;
  assignees?: GitHubUser[];
  requested_reviewers?: GitHubUser[];
  requested_teams?: GitHubTeam[];
  labels: GitHubLabel[];
  milestone?: GitHubMilestone;
  draft: boolean;
  commits_url: string;
  review_comments_url: string;
  review_comment_url: string;
  comments_url: string;
  statuses_url: string;
  head: GitHubPullRequestRef;
  base: GitHubPullRequestRef;
  _links: {
    self: { href: string };
    html: { href: string };
    issue: { href: string };
    comments: { href: string };
    review_comments: { href: string };
    review_comment: { href: string };
    commits: { href: string };
    statuses: { href: string };
  };
  author_association: string;
  auto_merge?: any;
  active_lock_reason?: string;
  merged?: boolean;
  mergeable?: boolean;
  rebaseable?: boolean;
  mergeable_state?: string;
  merged_by?: GitHubUser;
  comments?: number;
  review_comments?: number;
  maintainer_can_modify?: boolean;
  commits?: number;
  additions?: number;
  deletions?: number;
  changed_files?: number;
}

export interface GitHubPullRequestRef {
  label: string;
  ref: string;
  sha: string;
  user: GitHubUser;
  repo: GitHubRepository;
}

export interface GitHubComment {
  id: number;
  node_id: string;
  url: string;
  html_url: string;
  body: string;
  user: GitHubUser;
  created_at: string;
  updated_at: string;
  issue_url?: string;
  author_association: string;
  reactions?: GitHubReactions;
}

export interface GitHubReview {
  id: number;
  node_id: string;
  user: GitHubUser;
  body: string;
  state: 'APPROVED' | 'CHANGES_REQUESTED' | 'COMMENTED' | 'DISMISSED' | 'PENDING';
  html_url: string;
  pull_request_url: string;
  commit_id: string;
  submitted_at?: string;
  author_association: string;
}

export interface GitHubRelease {
  id: number;
  node_id: string;
  url: string;
  html_url: string;
  assets_url: string;
  upload_url: string;
  tarball_url: string;
  zipball_url: string;
  tag_name: string;
  target_commitish: string;
  name?: string;
  body?: string;
  draft: boolean;
  prerelease: boolean;
  created_at: string;
  published_at?: string;
  author: GitHubUser;
  assets: GitHubReleaseAsset[];
}

export interface GitHubReleaseAsset {
  id: number;
  node_id: string;
  name: string;
  label?: string;
  uploader: GitHubUser;
  content_type: string;
  state: 'uploaded' | 'open';
  size: number;
  download_count: number;
  created_at: string;
  updated_at: string;
  browser_download_url: string;
  url: string;
}

export interface GitHubCommit {
  sha: string;
  node_id: string;
  url: string;
  html_url: string;
  comments_url: string;
  commit: {
    url: string;
    author: {
      name: string;
      email: string;
      date: string;
    };
    committer: {
      name: string;
      email: string;
      date: string;
    };
    message: string;
    tree: {
      sha: string;
      url: string;
    };
    comment_count: number;
    verification?: {
      verified: boolean;
      reason: string;
      signature?: string;
      payload?: string;
    };
  };
  author?: GitHubUser;
  committer?: GitHubUser;
  parents: Array<{
    sha: string;
    url: string;
    html_url: string;
  }>;
  stats?: {
    additions: number;
    deletions: number;
    total: number;
  };
  files?: GitHubCommitFile[];
}

export interface GitHubCommitFile {
  sha: string;
  filename: string;
  status: 'added' | 'removed' | 'modified' | 'renamed' | 'copied' | 'changed' | 'unchanged';
  additions: number;
  deletions: number;
  changes: number;
  blob_url: string;
  raw_url: string;
  contents_url: string;
  patch?: string;
  previous_filename?: string;
}

export interface GitHubBranch {
  name: string;
  commit: {
    sha: string;
    url: string;
  };
  protected: boolean;
  protection?: GitHubBranchProtection;
  protection_url?: string;
}

export interface GitHubBranchProtection {
  url: string;
  required_status_checks?: {
    url: string;
    enforcement_level: string;
    contexts: string[];
    contexts_url: string;
    strict: boolean;
  };
  required_pull_request_reviews?: {
    url: string;
    dismiss_stale_reviews: boolean;
    require_code_owner_reviews: boolean;
    required_approving_review_count: number;
  };
  required_signatures?: {
    url: string;
    enabled: boolean;
  };
  enforce_admins?: {
    url: string;
    enabled: boolean;
  };
  required_linear_history?: {
    enabled: boolean;
  };
  allow_force_pushes?: {
    enabled: boolean;
  };
  allow_deletions?: {
    enabled: boolean;
  };
}

export interface GitHubTag {
  name: string;
  commit: {
    sha: string;
    url: string;
  };
  zipball_url: string;
  tarball_url: string;
  node_id: string;
}

export interface GitHubFile {
  type: 'file' | 'dir' | 'symlink' | 'submodule';
  encoding?: string;
  size: number;
  name: string;
  path: string;
  content?: string;
  sha: string;
  url: string;
  git_url?: string;
  html_url?: string;
  download_url?: string;
  target?: string;
  submodule_git_url?: string;
  _links?: {
    self: string;
    git?: string;
    html?: string;
  };
}

export interface GitHubTeam {
  id: number;
  node_id: string;
  name: string;
  slug: string;
  description?: string;
  privacy?: 'secret' | 'closed';
  permission: 'pull' | 'push' | 'admin' | 'maintain' | 'triage';
  url: string;
  html_url: string;
  members_url: string;
  repositories_url: string;
  parent?: GitHubTeam;
}

export interface GitHubWorkflow {
  id: number;
  node_id: string;
  name: string;
  path: string;
  state: 'active' | 'disabled' | 'deleted';
  created_at: string;
  updated_at: string;
  url: string;
  html_url: string;
  badge_url: string;
}

export interface GitHubWorkflowRun {
  id: number;
  name?: string;
  node_id: string;
  head_branch: string;
  head_sha: string;
  path: string;
  run_number: number;
  run_attempt: number;
  event: string;
  status: 'queued' | 'in_progress' | 'completed' | 'waiting';
  conclusion?: 'success' | 'failure' | 'neutral' | 'cancelled' | 'skipped' | 'timed_out' | 'action_required';
  workflow_id: number;
  url: string;
  html_url: string;
  pull_requests: Array<{
    url: string;
    id: number;
    number: number;
    head: GitHubPullRequestRef;
    base: GitHubPullRequestRef;
  }>;
  created_at: string;
  updated_at: string;
  actor?: GitHubUser;
  run_started_at?: string;
  triggering_actor?: GitHubUser;
  jobs_url: string;
  logs_url: string;
  check_suite_url: string;
  artifacts_url: string;
  cancel_url: string;
  rerun_url: string;
  previous_attempt_url?: string;
  workflow_url: string;
  head_commit: {
    id: string;
    tree_id: string;
    message: string;
    timestamp: string;
    author: {
      name: string;
      email: string;
    };
    committer: {
      name: string;
      email: string;
    };
  };
  repository: GitHubRepository;
  head_repository: GitHubRepository;
}

// ============================================================================
// Webhook Event Types
// ============================================================================

export interface GitHubPushEvent {
  ref: string;
  before: string;
  after: string;
  created: boolean;
  deleted: boolean;
  forced: boolean;
  base_ref?: string;
  compare: string;
  commits: Array<{
    id: string;
    tree_id: string;
    distinct: boolean;
    message: string;
    timestamp: string;
    url: string;
    author: {
      name: string;
      email: string;
      username?: string;
    };
    committer: {
      name: string;
      email: string;
      username?: string;
    };
    added: string[];
    removed: string[];
    modified: string[];
  }>;
  head_commit: {
    id: string;
    tree_id: string;
    distinct: boolean;
    message: string;
    timestamp: string;
    url: string;
    author: {
      name: string;
      email: string;
      username?: string;
    };
    committer: {
      name: string;
      email: string;
      username?: string;
    };
    added: string[];
    removed: string[];
    modified: string[];
  };
  repository: GitHubRepository;
  pusher: {
    name: string;
    email: string;
  };
  sender: GitHubUser;
}

export interface GitHubPullRequestEvent {
  action: 'opened' | 'closed' | 'reopened' | 'synchronize' | 'edited' | 'assigned' | 'unassigned' | 'review_requested' | 'review_request_removed' | 'labeled' | 'unlabeled' | 'ready_for_review' | 'converted_to_draft' | 'locked' | 'unlocked';
  number: number;
  pull_request: GitHubPullRequest;
  repository: GitHubRepository;
  sender: GitHubUser;
  changes?: any;
  requested_reviewer?: GitHubUser;
  requested_team?: GitHubTeam;
  label?: GitHubLabel;
}

export interface GitHubIssueEvent {
  action: 'opened' | 'edited' | 'deleted' | 'pinned' | 'unpinned' | 'closed' | 'reopened' | 'assigned' | 'unassigned' | 'labeled' | 'unlabeled' | 'locked' | 'unlocked' | 'transferred' | 'milestoned' | 'demilestoned';
  issue: GitHubIssue;
  repository: GitHubRepository;
  sender: GitHubUser;
  changes?: any;
  assignee?: GitHubUser;
  label?: GitHubLabel;
  milestone?: GitHubMilestone;
}

export interface GitHubIssueCommentEvent {
  action: 'created' | 'edited' | 'deleted';
  issue: GitHubIssue;
  comment: GitHubComment;
  repository: GitHubRepository;
  sender: GitHubUser;
  changes?: {
    body?: {
      from: string;
    };
  };
}

export interface GitHubPullRequestReviewEvent {
  action: 'submitted' | 'edited' | 'dismissed';
  review: GitHubReview;
  pull_request: GitHubPullRequest;
  repository: GitHubRepository;
  sender: GitHubUser;
  changes?: any;
}

export interface GitHubPullRequestReviewCommentEvent {
  action: 'created' | 'edited' | 'deleted';
  comment: {
    id: number;
    node_id: string;
    url: string;
    pull_request_review_id: number;
    diff_hunk: string;
    path: string;
    position?: number;
    original_position?: number;
    commit_id: string;
    original_commit_id: string;
    user: GitHubUser;
    body: string;
    created_at: string;
    updated_at: string;
    html_url: string;
    pull_request_url: string;
    author_association: string;
    _links: any;
    start_line?: number;
    original_start_line?: number;
    start_side?: 'LEFT' | 'RIGHT';
    line?: number;
    original_line?: number;
    side?: 'LEFT' | 'RIGHT';
    in_reply_to_id?: number;
  };
  pull_request: GitHubPullRequest;
  repository: GitHubRepository;
  sender: GitHubUser;
  changes?: any;
}

export interface GitHubReleaseEvent {
  action: 'published' | 'unpublished' | 'created' | 'edited' | 'deleted' | 'prereleased' | 'released';
  release: GitHubRelease;
  repository: GitHubRepository;
  sender: GitHubUser;
  changes?: any;
}

export interface GitHubCreateEvent {
  ref: string;
  ref_type: 'branch' | 'tag';
  master_branch: string;
  description: string;
  pusher_type: 'user' | 'deploy_key';
  repository: GitHubRepository;
  sender: GitHubUser;
}

export interface GitHubDeleteEvent {
  ref: string;
  ref_type: 'branch' | 'tag';
  pusher_type: 'user' | 'deploy_key';
  repository: GitHubRepository;
  sender: GitHubUser;
}

export interface GitHubForkEvent {
  forkee: GitHubRepository;
  repository: GitHubRepository;
  sender: GitHubUser;
}

export interface GitHubStarEvent {
  action: 'created' | 'deleted';
  starred_at?: string;
  repository: GitHubRepository;
  sender: GitHubUser;
}

export interface GitHubWatchEvent {
  action: 'started';
  repository: GitHubRepository;
  sender: GitHubUser;
}

export interface GitHubRepositoryEvent {
  action: 'created' | 'deleted' | 'archived' | 'unarchived' | 'edited' | 'renamed' | 'transferred' | 'publicized' | 'privatized';
  repository: GitHubRepository;
  sender: GitHubUser;
  changes?: any;
}

// ============================================================================
// Trigger Input Types
// ============================================================================

export interface GitHubOnPushInput {
  owner: string;
  repository: string;
  branch?: string;
}

export interface GitHubOnPullRequestInput {
  owner: string;
  repository: string;
  actions?: ('opened' | 'closed' | 'reopened' | 'synchronize' | 'edited' | 'assigned' | 'unassigned' | 'review_requested' | 'review_request_removed' | 'labeled' | 'unlabeled' | 'ready_for_review' | 'converted_to_draft' | 'locked' | 'unlocked')[];
}

export interface GitHubOnIssueInput {
  owner: string;
  repository: string;
  actions?: ('opened' | 'edited' | 'deleted' | 'pinned' | 'unpinned' | 'closed' | 'reopened' | 'assigned' | 'unassigned' | 'labeled' | 'unlabeled' | 'locked' | 'unlocked' | 'transferred' | 'milestoned' | 'demilestoned')[];
}

export interface GitHubOnIssueCommentInput {
  owner: string;
  repository: string;
  actions?: ('created' | 'edited' | 'deleted')[];
}

export interface GitHubOnReleaseInput {
  owner: string;
  repository: string;
  actions?: ('published' | 'unpublished' | 'created' | 'edited' | 'deleted' | 'prereleased' | 'released')[];
}

// ============================================================================
// Action Parameter Types
// ============================================================================

// Repository Actions
export interface GetRepositoryArgs {
  owner: string;
  repo: string;
}

export interface ListRepositoriesArgs {
  type?: 'all' | 'owner' | 'public' | 'private' | 'member';
  sort?: 'created' | 'updated' | 'pushed' | 'full_name';
  direction?: 'asc' | 'desc';
  per_page?: number;
  page?: number;
}

export interface CreateRepositoryArgs {
  name: string;
  description?: string;
  homepage?: string;
  private?: boolean;
  has_issues?: boolean;
  has_projects?: boolean;
  has_wiki?: boolean;
  auto_init?: boolean;
  gitignore_template?: string;
  license_template?: string;
}

export interface UpdateRepositoryArgs {
  owner: string;
  repo: string;
  name?: string;
  description?: string;
  homepage?: string;
  private?: boolean;
  has_issues?: boolean;
  has_projects?: boolean;
  has_wiki?: boolean;
  default_branch?: string;
  archived?: boolean;
}

// Issue Actions
export interface GetIssueArgs {
  owner: string;
  repo: string;
  issueNumber: number;
}

export interface ListIssuesArgs {
  owner: string;
  repo: string;
  state?: 'open' | 'closed' | 'all';
  labels?: string;
  sort?: 'created' | 'updated' | 'comments';
  direction?: 'asc' | 'desc';
  since?: string;
  per_page?: number;
  page?: number;
}

export interface CreateIssueArgs {
  owner: string;
  repo: string;
  title: string;
  body?: string;
  assignees?: string[];
  milestone?: number;
  labels?: string[];
}

export interface UpdateIssueArgs {
  owner: string;
  repo: string;
  issueNumber: number;
  title?: string;
  body?: string;
  state?: 'open' | 'closed';
  state_reason?: 'completed' | 'not_planned' | 'reopened';
  assignees?: string[];
  milestone?: number;
  labels?: string[];
}

export interface CloseIssueArgs {
  owner: string;
  repo: string;
  issueNumber: number;
  state_reason?: 'completed' | 'not_planned';
}

export interface ReopenIssueArgs {
  owner: string;
  repo: string;
  issueNumber: number;
}

export interface AddLabelsArgs {
  owner: string;
  repo: string;
  issueNumber: number;
  labels: string[];
}

export interface RemoveLabelArgs {
  owner: string;
  repo: string;
  issueNumber: number;
  label: string;
}

export interface AddAssigneesArgs {
  owner: string;
  repo: string;
  issueNumber: number;
  assignees: string[];
}

export interface RemoveAssigneesArgs {
  owner: string;
  repo: string;
  issueNumber: number;
  assignees: string[];
}

export interface LockIssueArgs {
  owner: string;
  repo: string;
  issueNumber: number;
  lock_reason?: 'off-topic' | 'too heated' | 'resolved' | 'spam';
}

export interface UnlockIssueArgs {
  owner: string;
  repo: string;
  issueNumber: number;
}

// Pull Request Actions
export interface GetPullRequestArgs {
  owner: string;
  repo: string;
  pullNumber: number;
}

export interface ListPullRequestsArgs {
  owner: string;
  repo: string;
  state?: 'open' | 'closed' | 'all';
  head?: string;
  base?: string;
  sort?: 'created' | 'updated' | 'popularity' | 'long-running';
  direction?: 'asc' | 'desc';
  per_page?: number;
  page?: number;
}

export interface CreatePullRequestArgs {
  owner: string;
  repo: string;
  title: string;
  head: string;
  base: string;
  body?: string;
  draft?: boolean;
  maintainer_can_modify?: boolean;
}

export interface UpdatePullRequestArgs {
  owner: string;
  repo: string;
  pullNumber: number;
  title?: string;
  body?: string;
  state?: 'open' | 'closed';
  base?: string;
  maintainer_can_modify?: boolean;
}

export interface MergePullRequestArgs {
  owner: string;
  repo: string;
  pullNumber: number;
  commit_title?: string;
  commit_message?: string;
  sha?: string;
  merge_method?: 'merge' | 'squash' | 'rebase';
}

export interface ClosePullRequestArgs {
  owner: string;
  repo: string;
  pullNumber: number;
}

export interface RequestReviewersArgs {
  owner: string;
  repo: string;
  pullNumber: number;
  reviewers?: string[];
  team_reviewers?: string[];
}

export interface RemoveRequestedReviewersArgs {
  owner: string;
  repo: string;
  pullNumber: number;
  reviewers?: string[];
  team_reviewers?: string[];
}

export interface ListPullRequestFilesArgs {
  owner: string;
  repo: string;
  pullNumber: number;
  per_page?: number;
  page?: number;
}

export interface ListPullRequestCommitsArgs {
  owner: string;
  repo: string;
  pullNumber: number;
  per_page?: number;
  page?: number;
}

// Review Actions
export interface CreateReviewArgs {
  owner: string;
  repo: string;
  pullNumber: number;
  commit_id?: string;
  body?: string;
  event?: 'APPROVE' | 'REQUEST_CHANGES' | 'COMMENT';
  comments?: Array<{
    path: string;
    position?: number;
    body: string;
    line?: number;
    side?: 'LEFT' | 'RIGHT';
    start_line?: number;
    start_side?: 'LEFT' | 'RIGHT';
  }>;
}

export interface SubmitReviewArgs {
  owner: string;
  repo: string;
  pullNumber: number;
  reviewId: number;
  body?: string;
  event: 'APPROVE' | 'REQUEST_CHANGES' | 'COMMENT';
}

export interface DismissReviewArgs {
  owner: string;
  repo: string;
  pullNumber: number;
  reviewId: number;
  message: string;
}

// Comment Actions
export interface ListIssueCommentsArgs {
  owner: string;
  repo: string;
  issueNumber: number;
  since?: string;
  per_page?: number;
  page?: number;
}

export interface CreateCommentArgs {
  owner: string;
  repo: string;
  issueNumber: number;
  body: string;
}

export interface UpdateCommentArgs {
  owner: string;
  repo: string;
  commentId: number;
  body: string;
}

export interface DeleteCommentArgs {
  owner: string;
  repo: string;
  commentId: number;
}

export interface CreatePullRequestReviewCommentArgs {
  owner: string;
  repo: string;
  pullNumber: number;
  body: string;
  commit_id: string;
  path: string;
  position?: number;
  side?: 'LEFT' | 'RIGHT';
  line?: number;
  start_line?: number;
  start_side?: 'LEFT' | 'RIGHT';
  in_reply_to?: number;
}

// Release Actions
export interface GetReleaseArgs {
  owner: string;
  repo: string;
  releaseId: number;
}

export interface GetLatestReleaseArgs {
  owner: string;
  repo: string;
}

export interface GetReleaseByTagArgs {
  owner: string;
  repo: string;
  tag: string;
}

export interface ListReleasesArgs {
  owner: string;
  repo: string;
  per_page?: number;
  page?: number;
}

export interface CreateReleaseArgs {
  owner: string;
  repo: string;
  tag_name: string;
  target_commitish?: string;
  name?: string;
  body?: string;
  draft?: boolean;
  prerelease?: boolean;
  generate_release_notes?: boolean;
}

export interface UpdateReleaseArgs {
  owner: string;
  repo: string;
  releaseId: number;
  tag_name?: string;
  target_commitish?: string;
  name?: string;
  body?: string;
  draft?: boolean;
  prerelease?: boolean;
}

export interface DeleteReleaseArgs {
  owner: string;
  repo: string;
  releaseId: number;
}

export interface GenerateReleaseNotesArgs {
  owner: string;
  repo: string;
  tag_name: string;
  target_commitish?: string;
  previous_tag_name?: string;
  configuration_file_path?: string;
}

// Commit Actions
export interface GetCommitArgs {
  owner: string;
  repo: string;
  ref: string;
}

export interface ListCommitsArgs {
  owner: string;
  repo: string;
  sha?: string;
  path?: string;
  author?: string;
  since?: string;
  until?: string;
  per_page?: number;
  page?: number;
}

export interface CompareCommitsArgs {
  owner: string;
  repo: string;
  base: string;
  head: string;
}

// Branch Actions
export interface ListBranchesArgs {
  owner: string;
  repo: string;
  protected?: boolean;
  per_page?: number;
  page?: number;
}

export interface GetBranchArgs {
  owner: string;
  repo: string;
  branch: string;
}

export interface CreateBranchArgs {
  owner: string;
  repo: string;
  branch: string;
  sha: string;
}

export interface DeleteBranchArgs {
  owner: string;
  repo: string;
  branch: string;
}

export interface GetBranchProtectionArgs {
  owner: string;
  repo: string;
  branch: string;
}

export interface UpdateBranchProtectionArgs {
  owner: string;
  repo: string;
  branch: string;
  required_status_checks?: {
    strict: boolean;
    contexts: string[];
  } | null;
  enforce_admins?: boolean | null;
  required_pull_request_reviews?: {
    dismiss_stale_reviews?: boolean;
    require_code_owner_reviews?: boolean;
    required_approving_review_count?: number;
  } | null;
  restrictions?: {
    users: string[];
    teams: string[];
    apps?: string[];
  } | null;
  required_linear_history?: boolean;
  allow_force_pushes?: boolean;
  allow_deletions?: boolean;
}

export interface DeleteBranchProtectionArgs {
  owner: string;
  repo: string;
  branch: string;
}

// Tag Actions
export interface ListTagsArgs {
  owner: string;
  repo: string;
  per_page?: number;
  page?: number;
}

export interface CreateTagArgs {
  owner: string;
  repo: string;
  tag: string;
  message: string;
  object: string;
  type: 'commit' | 'tree' | 'blob';
  tagger?: {
    name: string;
    email: string;
    date?: string;
  };
}

export interface DeleteTagArgs {
  owner: string;
  repo: string;
  tag: string;
}

// File Actions
export interface GetFileContentArgs {
  owner: string;
  repo: string;
  path: string;
  ref?: string;
}

export interface CreateOrUpdateFileArgs {
  owner: string;
  repo: string;
  path: string;
  message: string;
  content: string;
  sha?: string;
  branch?: string;
  committer?: {
    name: string;
    email: string;
  };
  author?: {
    name: string;
    email: string;
  };
}

export interface DeleteFileArgs {
  owner: string;
  repo: string;
  path: string;
  message: string;
  sha: string;
  branch?: string;
  committer?: {
    name: string;
    email: string;
  };
  author?: {
    name: string;
    email: string;
  };
}

export interface GetRepositoryContentArgs {
  owner: string;
  repo: string;
  path?: string;
  ref?: string;
}

// Workflow Actions
export interface ListWorkflowsArgs {
  owner: string;
  repo: string;
  per_page?: number;
  page?: number;
}

export interface GetWorkflowArgs {
  owner: string;
  repo: string;
  workflowId: number | string;
}

export interface TriggerWorkflowArgs {
  owner: string;
  repo: string;
  workflowId: number | string;
  ref: string;
  inputs?: Record<string, any>;
}

export interface ListWorkflowRunsArgs {
  owner: string;
  repo: string;
  workflowId?: number | string;
  actor?: string;
  branch?: string;
  event?: string;
  status?: 'queued' | 'in_progress' | 'completed';
  per_page?: number;
  page?: number;
}

export interface GetWorkflowRunArgs {
  owner: string;
  repo: string;
  runId: number;
}

export interface RerunWorkflowArgs {
  owner: string;
  repo: string;
  runId: number;
  enable_debug_logging?: boolean;
}

export interface CancelWorkflowRunArgs {
  owner: string;
  repo: string;
  runId: number;
}

export interface DeleteWorkflowRunArgs {
  owner: string;
  repo: string;
  runId: number;
}

// Collaborator Actions
export interface ListCollaboratorsArgs {
  owner: string;
  repo: string;
  affiliation?: 'outside' | 'direct' | 'all';
  per_page?: number;
  page?: number;
}

export interface AddCollaboratorArgs {
  owner: string;
  repo: string;
  username: string;
  permission?: 'pull' | 'push' | 'admin' | 'maintain' | 'triage';
}

export interface RemoveCollaboratorArgs {
  owner: string;
  repo: string;
  username: string;
}

export interface CheckCollaboratorArgs {
  owner: string;
  repo: string;
  username: string;
}

// Label Actions
export interface ListLabelsArgs {
  owner: string;
  repo: string;
  per_page?: number;
  page?: number;
}

export interface GetLabelArgs {
  owner: string;
  repo: string;
  name: string;
}

export interface CreateLabelArgs {
  owner: string;
  repo: string;
  name: string;
  color: string;
  description?: string;
}

export interface UpdateLabelArgs {
  owner: string;
  repo: string;
  name: string;
  new_name?: string;
  color?: string;
  description?: string;
}

export interface DeleteLabelArgs {
  owner: string;
  repo: string;
  name: string;
}

// Milestone Actions
export interface ListMilestonesArgs {
  owner: string;
  repo: string;
  state?: 'open' | 'closed' | 'all';
  sort?: 'due_on' | 'completeness';
  direction?: 'asc' | 'desc';
  per_page?: number;
  page?: number;
}

export interface GetMilestoneArgs {
  owner: string;
  repo: string;
  milestoneNumber: number;
}

export interface CreateMilestoneArgs {
  owner: string;
  repo: string;
  title: string;
  state?: 'open' | 'closed';
  description?: string;
  due_on?: string;
}

export interface UpdateMilestoneArgs {
  owner: string;
  repo: string;
  milestoneNumber: number;
  title?: string;
  state?: 'open' | 'closed';
  description?: string;
  due_on?: string;
}

export interface DeleteMilestoneArgs {
  owner: string;
  repo: string;
  milestoneNumber: number;
}

// Search Actions
export interface SearchIssuesArgs {
  query: string;
  sort?: 'comments' | 'reactions' | 'reactions-+1' | 'reactions--1' | 'reactions-smile' | 'reactions-thinking_face' | 'reactions-heart' | 'reactions-tada' | 'interactions' | 'created' | 'updated';
  order?: 'asc' | 'desc';
  per_page?: number;
  page?: number;
}

export interface SearchRepositoriesArgs {
  query: string;
  sort?: 'stars' | 'forks' | 'help-wanted-issues' | 'updated';
  order?: 'asc' | 'desc';
  per_page?: number;
  page?: number;
}

export interface SearchCodeArgs {
  query: string;
  sort?: 'indexed';
  order?: 'asc' | 'desc';
  per_page?: number;
  page?: number;
}

export interface SearchCommitsArgs {
  query: string;
  sort?: 'author-date' | 'committer-date';
  order?: 'asc' | 'desc';
  per_page?: number;
  page?: number;
}

export interface SearchUsersArgs {
  query: string;
  sort?: 'followers' | 'repositories' | 'joined';
  order?: 'asc' | 'desc';
  per_page?: number;
  page?: number;
}

// User Actions
export interface GetCurrentUserArgs {}

export interface GetUserArgs {
  username: string;
}

// ============================================================================
// API Error Types
// ============================================================================

export interface GitHubAPIError {
  message: string;
  documentation_url?: string;
  errors?: Array<{
    resource: string;
    code: string;
    field: string;
    message?: string;
  }>;
}

export class GitHubError extends Error {
  constructor(
    message: string,
    public statusCode?: number,
    public errors?: any,
    public documentationUrl?: string
  ) {
    super(message);
    this.name = 'GitHubError';
  }

  static fromResponse(status: number, data: GitHubAPIError): GitHubError {
    const message = data.message || 'Unknown GitHub API error';
    return new GitHubError(
      message,
      status,
      data.errors,
      data.documentation_url
    );
  }
}

// ============================================================================
// Rate Limit Types
// ============================================================================

export interface RateLimitInfo {
  limit: number;
  remaining: number;
  reset: number;
  used: number;
  resource: string;
}

// ============================================================================
// Configuration Types
// ============================================================================

export interface GitHubConfig {
  credential?: string;
  server_url?: string;
  access_token?: string;
}

export interface GitHubApiConfig {
  baseUrl: string;
  accessToken: string;
}
