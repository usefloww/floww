/**
 * GitHub REST API Client
 * Handles all HTTP requests to GitHub API with rate limiting and error handling
 */

import type {
  GitHubApiConfig,
  GitHubAPIError,
  GitHubRepository,
  GitHubIssue,
  GitHubPullRequest,
  GitHubComment,
  GitHubRelease,
  GitHubCommit,
  GitHubBranch,
  GitHubTag,
  GitHubFile,
  GitHubUser,
  GitHubWorkflow,
  GitHubWorkflowRun,
  GitHubLabel,
  GitHubMilestone,
  GitHubReview,
  RateLimitInfo,
  // Action parameter types
  GetRepositoryArgs,
  ListRepositoriesArgs,
  CreateRepositoryArgs,
  UpdateRepositoryArgs,
  GetIssueArgs,
  ListIssuesArgs,
  CreateIssueArgs,
  UpdateIssueArgs,
  CloseIssueArgs,
  ReopenIssueArgs,
  AddLabelsArgs,
  RemoveLabelArgs,
  AddAssigneesArgs,
  RemoveAssigneesArgs,
  LockIssueArgs,
  UnlockIssueArgs,
  GetPullRequestArgs,
  ListPullRequestsArgs,
  CreatePullRequestArgs,
  UpdatePullRequestArgs,
  MergePullRequestArgs,
  ClosePullRequestArgs,
  RequestReviewersArgs,
  RemoveRequestedReviewersArgs,
  ListPullRequestFilesArgs,
  ListPullRequestCommitsArgs,
  CreateReviewArgs,
  SubmitReviewArgs,
  DismissReviewArgs,
  ListIssueCommentsArgs,
  CreateCommentArgs,
  UpdateCommentArgs,
  DeleteCommentArgs,
  CreatePullRequestReviewCommentArgs,
  GetReleaseArgs,
  GetLatestReleaseArgs,
  GetReleaseByTagArgs,
  ListReleasesArgs,
  CreateReleaseArgs,
  UpdateReleaseArgs,
  DeleteReleaseArgs,
  GenerateReleaseNotesArgs,
  GetCommitArgs,
  ListCommitsArgs,
  CompareCommitsArgs,
  ListBranchesArgs,
  GetBranchArgs,
  CreateBranchArgs,
  DeleteBranchArgs,
  GetBranchProtectionArgs,
  UpdateBranchProtectionArgs,
  DeleteBranchProtectionArgs,
  ListTagsArgs,
  CreateTagArgs,
  DeleteTagArgs,
  GetFileContentArgs,
  CreateOrUpdateFileArgs,
  DeleteFileArgs,
  GetRepositoryContentArgs,
  ListWorkflowsArgs,
  GetWorkflowArgs,
  TriggerWorkflowArgs,
  ListWorkflowRunsArgs,
  GetWorkflowRunArgs,
  RerunWorkflowArgs,
  CancelWorkflowRunArgs,
  DeleteWorkflowRunArgs,
  ListCollaboratorsArgs,
  AddCollaboratorArgs,
  RemoveCollaboratorArgs,
  CheckCollaboratorArgs,
  ListLabelsArgs,
  GetLabelArgs,
  CreateLabelArgs,
  UpdateLabelArgs,
  DeleteLabelArgs,
  ListMilestonesArgs,
  GetMilestoneArgs,
  CreateMilestoneArgs,
  UpdateMilestoneArgs,
  DeleteMilestoneArgs,
  SearchIssuesArgs,
  SearchRepositoriesArgs,
  SearchCodeArgs,
  SearchCommitsArgs,
  SearchUsersArgs,
  GetCurrentUserArgs,
  GetUserArgs,
} from './types';

/**
 * Rate limiter for GitHub API
 */
class RateLimiter {
  private limit: number = 5000;
  private remaining: number = 5000;
  private reset: number = 0;

  updateFromHeaders(headers: Headers): void {
    const limit = headers.get('x-ratelimit-limit');
    const remaining = headers.get('x-ratelimit-remaining');
    const reset = headers.get('x-ratelimit-reset');

    if (limit) this.limit = parseInt(limit);
    if (remaining) this.remaining = parseInt(remaining);
    if (reset) this.reset = parseInt(reset) * 1000; // Convert to milliseconds
  }

  shouldWait(): number {
    if (this.remaining === 0) {
      const waitTime = this.reset - Date.now();
      if (waitTime > 0) {
        return waitTime;
      }
    }
    return 0;
  }

  async wait(): Promise<void> {
    const waitTime = this.shouldWait();
    if (waitTime > 0) {
      console.warn(`GitHub rate limit reached. Waiting ${waitTime}ms...`);
      await new Promise((resolve) => setTimeout(resolve, waitTime));
    }
  }

  getInfo(): RateLimitInfo {
    return {
      limit: this.limit,
      remaining: this.remaining,
      reset: this.reset,
      used: this.limit - this.remaining,
      resource: 'core',
    };
  }
}

/**
 * GitHub API Client
 */
export class GitHubApi {
  private baseUrl: string;
  private accessToken: string;
  private rateLimiter: RateLimiter;

  constructor(config: GitHubApiConfig) {
    this.baseUrl = config.baseUrl;
    this.accessToken = config.accessToken;
    this.rateLimiter = new RateLimiter();
  }

  /**
   * Make an HTTP request to GitHub API
   */
  private async request<T = any>(
    method: string,
    endpoint: string,
    options: {
      body?: any;
      query?: Record<string, string | number | boolean | undefined>;
    } = {}
  ): Promise<T> {
    // Wait for rate limit
    await this.rateLimiter.wait();

    const url = new URL(`${this.baseUrl}${endpoint}`);

    // Add query parameters
    if (options.query) {
      Object.entries(options.query).forEach(([key, value]) => {
        if (value !== undefined) {
          url.searchParams.append(key, String(value));
        }
      });
    }

    // Prepare headers
    const headers: Record<string, string> = {
      Authorization: `Bearer ${this.accessToken}`,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
    };

    let body: string | undefined;
    if (options.body) {
      headers['Content-Type'] = 'application/json';
      body = JSON.stringify(options.body);
    }

    // Make request with retry logic
    let lastError: Error | null = null;
    const maxRetries = 3;

    for (let attempt = 0; attempt < maxRetries; attempt++) {
      try {
        const response = await fetch(url.toString(), {
          method,
          headers,
          body,
        });

        // Update rate limit info
        this.rateLimiter.updateFromHeaders(response.headers);

        // Handle rate limit (403 with rate limit headers)
        if (response.status === 403) {
          const rateLimitRemaining = response.headers.get('x-ratelimit-remaining');
          if (rateLimitRemaining === '0') {
            const retryAfter = this.rateLimiter.shouldWait();
            if (retryAfter > 0) {
              await new Promise((resolve) => setTimeout(resolve, retryAfter));
              continue; // Retry
            }
          }
        }

        // Handle successful responses
        if (response.ok) {
          // Some endpoints return 204 No Content
          if (response.status === 204) {
            return undefined as T;
          }

          const data = await response.json();
          return data as T;
        }

        // Handle error responses
        let errorData: GitHubAPIError;
        try {
          errorData = (await response.json()) as GitHubAPIError;
        } catch {
          errorData = { message: response.statusText };
        }

        const { GitHubError: GHError } = await import('./types');
        throw GHError.fromResponse(response.status, errorData);
      } catch (error) {
        lastError = error as Error;

        // Don't retry on client errors (4xx except 403 rate limit)
        if ((error as any).statusCode && (error as any).statusCode >= 400 && (error as any).statusCode < 500) {
          // Allow retry for rate limits
          if ((error as any).statusCode !== 403) {
            throw error;
          }
        }

        // Exponential backoff for server errors
        if (attempt < maxRetries - 1) {
          await new Promise((resolve) => setTimeout(resolve, Math.pow(2, attempt) * 1000));
        }
      }
    }

    throw lastError || new Error('Request failed after retries');
  }

  // ============================================================================
  // Repository Methods
  // ============================================================================

  async getRepository(args: GetRepositoryArgs): Promise<GitHubRepository> {
    return this.request<GitHubRepository>('GET', `/repos/${args.owner}/${args.repo}`);
  }

  async listRepositories(args: ListRepositoriesArgs = {}): Promise<GitHubRepository[]> {
    return this.request<GitHubRepository[]>('GET', '/user/repos', {
      query: {
        type: args.type,
        sort: args.sort,
        direction: args.direction,
        per_page: args.per_page,
        page: args.page,
      },
    });
  }

  async createRepository(args: CreateRepositoryArgs): Promise<GitHubRepository> {
    return this.request<GitHubRepository>('POST', '/user/repos', {
      body: {
        name: args.name,
        description: args.description,
        homepage: args.homepage,
        private: args.private,
        has_issues: args.has_issues,
        has_projects: args.has_projects,
        has_wiki: args.has_wiki,
        auto_init: args.auto_init,
        gitignore_template: args.gitignore_template,
        license_template: args.license_template,
      },
    });
  }

  async updateRepository(args: UpdateRepositoryArgs): Promise<GitHubRepository> {
    return this.request<GitHubRepository>('PATCH', `/repos/${args.owner}/${args.repo}`, {
      body: {
        name: args.name,
        description: args.description,
        homepage: args.homepage,
        private: args.private,
        has_issues: args.has_issues,
        has_projects: args.has_projects,
        has_wiki: args.has_wiki,
        default_branch: args.default_branch,
        archived: args.archived,
      },
    });
  }

  // ============================================================================
  // Issue Methods
  // ============================================================================

  async getIssue(args: GetIssueArgs): Promise<GitHubIssue> {
    return this.request<GitHubIssue>('GET', `/repos/${args.owner}/${args.repo}/issues/${args.issueNumber}`);
  }

  async listIssues(args: ListIssuesArgs): Promise<GitHubIssue[]> {
    return this.request<GitHubIssue[]>('GET', `/repos/${args.owner}/${args.repo}/issues`, {
      query: {
        state: args.state,
        labels: args.labels,
        sort: args.sort,
        direction: args.direction,
        since: args.since,
        per_page: args.per_page,
        page: args.page,
      },
    });
  }

  async createIssue(args: CreateIssueArgs): Promise<GitHubIssue> {
    return this.request<GitHubIssue>('POST', `/repos/${args.owner}/${args.repo}/issues`, {
      body: {
        title: args.title,
        body: args.body,
        assignees: args.assignees,
        milestone: args.milestone,
        labels: args.labels,
      },
    });
  }

  async updateIssue(args: UpdateIssueArgs): Promise<GitHubIssue> {
    return this.request<GitHubIssue>('PATCH', `/repos/${args.owner}/${args.repo}/issues/${args.issueNumber}`, {
      body: {
        title: args.title,
        body: args.body,
        state: args.state,
        state_reason: args.state_reason,
        assignees: args.assignees,
        milestone: args.milestone,
        labels: args.labels,
      },
    });
  }

  async closeIssue(args: CloseIssueArgs): Promise<GitHubIssue> {
    return this.request<GitHubIssue>('PATCH', `/repos/${args.owner}/${args.repo}/issues/${args.issueNumber}`, {
      body: {
        state: 'closed',
        state_reason: args.state_reason,
      },
    });
  }

  async reopenIssue(args: ReopenIssueArgs): Promise<GitHubIssue> {
    return this.request<GitHubIssue>('PATCH', `/repos/${args.owner}/${args.repo}/issues/${args.issueNumber}`, {
      body: {
        state: 'open',
        state_reason: 'reopened',
      },
    });
  }

  async addLabels(args: AddLabelsArgs): Promise<GitHubLabel[]> {
    return this.request<GitHubLabel[]>(
      'POST',
      `/repos/${args.owner}/${args.repo}/issues/${args.issueNumber}/labels`,
      {
        body: { labels: args.labels },
      }
    );
  }

  async removeLabel(args: RemoveLabelArgs): Promise<void> {
    return this.request<void>(
      'DELETE',
      `/repos/${args.owner}/${args.repo}/issues/${args.issueNumber}/labels/${encodeURIComponent(args.label)}`
    );
  }

  async addAssignees(args: AddAssigneesArgs): Promise<GitHubIssue> {
    return this.request<GitHubIssue>(
      'POST',
      `/repos/${args.owner}/${args.repo}/issues/${args.issueNumber}/assignees`,
      {
        body: { assignees: args.assignees },
      }
    );
  }

  async removeAssignees(args: RemoveAssigneesArgs): Promise<GitHubIssue> {
    return this.request<GitHubIssue>(
      'DELETE',
      `/repos/${args.owner}/${args.repo}/issues/${args.issueNumber}/assignees`,
      {
        body: { assignees: args.assignees },
      }
    );
  }

  async lockIssue(args: LockIssueArgs): Promise<void> {
    return this.request<void>('PUT', `/repos/${args.owner}/${args.repo}/issues/${args.issueNumber}/lock`, {
      body: args.lock_reason ? { lock_reason: args.lock_reason } : undefined,
    });
  }

  async unlockIssue(args: UnlockIssueArgs): Promise<void> {
    return this.request<void>('DELETE', `/repos/${args.owner}/${args.repo}/issues/${args.issueNumber}/lock`);
  }

  // ============================================================================
  // Pull Request Methods
  // ============================================================================

  async getPullRequest(args: GetPullRequestArgs): Promise<GitHubPullRequest> {
    return this.request<GitHubPullRequest>('GET', `/repos/${args.owner}/${args.repo}/pulls/${args.pullNumber}`);
  }

  async listPullRequests(args: ListPullRequestsArgs): Promise<GitHubPullRequest[]> {
    return this.request<GitHubPullRequest[]>('GET', `/repos/${args.owner}/${args.repo}/pulls`, {
      query: {
        state: args.state,
        head: args.head,
        base: args.base,
        sort: args.sort,
        direction: args.direction,
        per_page: args.per_page,
        page: args.page,
      },
    });
  }

  async createPullRequest(args: CreatePullRequestArgs): Promise<GitHubPullRequest> {
    return this.request<GitHubPullRequest>('POST', `/repos/${args.owner}/${args.repo}/pulls`, {
      body: {
        title: args.title,
        head: args.head,
        base: args.base,
        body: args.body,
        draft: args.draft,
        maintainer_can_modify: args.maintainer_can_modify,
      },
    });
  }

  async updatePullRequest(args: UpdatePullRequestArgs): Promise<GitHubPullRequest> {
    return this.request<GitHubPullRequest>('PATCH', `/repos/${args.owner}/${args.repo}/pulls/${args.pullNumber}`, {
      body: {
        title: args.title,
        body: args.body,
        state: args.state,
        base: args.base,
        maintainer_can_modify: args.maintainer_can_modify,
      },
    });
  }

  async mergePullRequest(
    args: MergePullRequestArgs
  ): Promise<{ sha: string; merged: boolean; message: string }> {
    return this.request<{ sha: string; merged: boolean; message: string }>(
      'PUT',
      `/repos/${args.owner}/${args.repo}/pulls/${args.pullNumber}/merge`,
      {
        body: {
          commit_title: args.commit_title,
          commit_message: args.commit_message,
          sha: args.sha,
          merge_method: args.merge_method,
        },
      }
    );
  }

  async closePullRequest(args: ClosePullRequestArgs): Promise<GitHubPullRequest> {
    return this.request<GitHubPullRequest>('PATCH', `/repos/${args.owner}/${args.repo}/pulls/${args.pullNumber}`, {
      body: { state: 'closed' },
    });
  }

  async requestReviewers(args: RequestReviewersArgs): Promise<GitHubPullRequest> {
    return this.request<GitHubPullRequest>(
      'POST',
      `/repos/${args.owner}/${args.repo}/pulls/${args.pullNumber}/requested_reviewers`,
      {
        body: {
          reviewers: args.reviewers,
          team_reviewers: args.team_reviewers,
        },
      }
    );
  }

  async removeRequestedReviewers(args: RemoveRequestedReviewersArgs): Promise<GitHubPullRequest> {
    return this.request<GitHubPullRequest>(
      'DELETE',
      `/repos/${args.owner}/${args.repo}/pulls/${args.pullNumber}/requested_reviewers`,
      {
        body: {
          reviewers: args.reviewers,
          team_reviewers: args.team_reviewers,
        },
      }
    );
  }

  async listPullRequestFiles(args: ListPullRequestFilesArgs): Promise<any[]> {
    return this.request<any[]>('GET', `/repos/${args.owner}/${args.repo}/pulls/${args.pullNumber}/files`, {
      query: {
        per_page: args.per_page,
        page: args.page,
      },
    });
  }

  async listPullRequestCommits(args: ListPullRequestCommitsArgs): Promise<GitHubCommit[]> {
    return this.request<GitHubCommit[]>('GET', `/repos/${args.owner}/${args.repo}/pulls/${args.pullNumber}/commits`, {
      query: {
        per_page: args.per_page,
        page: args.page,
      },
    });
  }

  // ============================================================================
  // Review Methods
  // ============================================================================

  async createReview(args: CreateReviewArgs): Promise<GitHubReview> {
    return this.request<GitHubReview>(
      'POST',
      `/repos/${args.owner}/${args.repo}/pulls/${args.pullNumber}/reviews`,
      {
        body: {
          commit_id: args.commit_id,
          body: args.body,
          event: args.event,
          comments: args.comments,
        },
      }
    );
  }

  async submitReview(args: SubmitReviewArgs): Promise<GitHubReview> {
    return this.request<GitHubReview>(
      'POST',
      `/repos/${args.owner}/${args.repo}/pulls/${args.pullNumber}/reviews/${args.reviewId}/events`,
      {
        body: {
          body: args.body,
          event: args.event,
        },
      }
    );
  }

  async dismissReview(args: DismissReviewArgs): Promise<GitHubReview> {
    return this.request<GitHubReview>(
      'PUT',
      `/repos/${args.owner}/${args.repo}/pulls/${args.pullNumber}/reviews/${args.reviewId}/dismissals`,
      {
        body: {
          message: args.message,
        },
      }
    );
  }

  // ============================================================================
  // Comment Methods
  // ============================================================================

  async listIssueComments(args: ListIssueCommentsArgs): Promise<GitHubComment[]> {
    return this.request<GitHubComment[]>(
      'GET',
      `/repos/${args.owner}/${args.repo}/issues/${args.issueNumber}/comments`,
      {
        query: {
          since: args.since,
          per_page: args.per_page,
          page: args.page,
        },
      }
    );
  }

  async createComment(args: CreateCommentArgs): Promise<GitHubComment> {
    return this.request<GitHubComment>(
      'POST',
      `/repos/${args.owner}/${args.repo}/issues/${args.issueNumber}/comments`,
      {
        body: { body: args.body },
      }
    );
  }

  async updateComment(args: UpdateCommentArgs): Promise<GitHubComment> {
    return this.request<GitHubComment>('PATCH', `/repos/${args.owner}/${args.repo}/issues/comments/${args.commentId}`, {
      body: { body: args.body },
    });
  }

  async deleteComment(args: DeleteCommentArgs): Promise<void> {
    return this.request<void>('DELETE', `/repos/${args.owner}/${args.repo}/issues/comments/${args.commentId}`);
  }

  async createPullRequestReviewComment(args: CreatePullRequestReviewCommentArgs): Promise<GitHubComment> {
    return this.request<GitHubComment>(
      'POST',
      `/repos/${args.owner}/${args.repo}/pulls/${args.pullNumber}/comments`,
      {
        body: {
          body: args.body,
          commit_id: args.commit_id,
          path: args.path,
          position: args.position,
          side: args.side,
          line: args.line,
          start_line: args.start_line,
          start_side: args.start_side,
          in_reply_to: args.in_reply_to,
        },
      }
    );
  }

  // ============================================================================
  // Release Methods
  // ============================================================================

  async getRelease(args: GetReleaseArgs): Promise<GitHubRelease> {
    return this.request<GitHubRelease>('GET', `/repos/${args.owner}/${args.repo}/releases/${args.releaseId}`);
  }

  async getLatestRelease(args: GetLatestReleaseArgs): Promise<GitHubRelease> {
    return this.request<GitHubRelease>('GET', `/repos/${args.owner}/${args.repo}/releases/latest`);
  }

  async getReleaseByTag(args: GetReleaseByTagArgs): Promise<GitHubRelease> {
    return this.request<GitHubRelease>('GET', `/repos/${args.owner}/${args.repo}/releases/tags/${args.tag}`);
  }

  async listReleases(args: ListReleasesArgs): Promise<GitHubRelease[]> {
    return this.request<GitHubRelease[]>('GET', `/repos/${args.owner}/${args.repo}/releases`, {
      query: {
        per_page: args.per_page,
        page: args.page,
      },
    });
  }

  async createRelease(args: CreateReleaseArgs): Promise<GitHubRelease> {
    return this.request<GitHubRelease>('POST', `/repos/${args.owner}/${args.repo}/releases`, {
      body: {
        tag_name: args.tag_name,
        target_commitish: args.target_commitish,
        name: args.name,
        body: args.body,
        draft: args.draft,
        prerelease: args.prerelease,
        generate_release_notes: args.generate_release_notes,
      },
    });
  }

  async updateRelease(args: UpdateReleaseArgs): Promise<GitHubRelease> {
    return this.request<GitHubRelease>('PATCH', `/repos/${args.owner}/${args.repo}/releases/${args.releaseId}`, {
      body: {
        tag_name: args.tag_name,
        target_commitish: args.target_commitish,
        name: args.name,
        body: args.body,
        draft: args.draft,
        prerelease: args.prerelease,
      },
    });
  }

  async deleteRelease(args: DeleteReleaseArgs): Promise<void> {
    return this.request<void>('DELETE', `/repos/${args.owner}/${args.repo}/releases/${args.releaseId}`);
  }

  async generateReleaseNotes(args: GenerateReleaseNotesArgs): Promise<{ name: string; body: string }> {
    return this.request<{ name: string; body: string }>(
      'POST',
      `/repos/${args.owner}/${args.repo}/releases/generate-notes`,
      {
        body: {
          tag_name: args.tag_name,
          target_commitish: args.target_commitish,
          previous_tag_name: args.previous_tag_name,
          configuration_file_path: args.configuration_file_path,
        },
      }
    );
  }

  // ============================================================================
  // Commit Methods
  // ============================================================================

  async getCommit(args: GetCommitArgs): Promise<GitHubCommit> {
    return this.request<GitHubCommit>('GET', `/repos/${args.owner}/${args.repo}/commits/${args.ref}`);
  }

  async listCommits(args: ListCommitsArgs): Promise<GitHubCommit[]> {
    return this.request<GitHubCommit[]>('GET', `/repos/${args.owner}/${args.repo}/commits`, {
      query: {
        sha: args.sha,
        path: args.path,
        author: args.author,
        since: args.since,
        until: args.until,
        per_page: args.per_page,
        page: args.page,
      },
    });
  }

  async compareCommits(
    args: CompareCommitsArgs
  ): Promise<{
    status: string;
    ahead_by: number;
    behind_by: number;
    total_commits: number;
    commits: GitHubCommit[];
    files: any[];
  }> {
    return this.request('GET', `/repos/${args.owner}/${args.repo}/compare/${args.base}...${args.head}`);
  }

  // ============================================================================
  // Branch Methods
  // ============================================================================

  async listBranches(args: ListBranchesArgs): Promise<GitHubBranch[]> {
    return this.request<GitHubBranch[]>('GET', `/repos/${args.owner}/${args.repo}/branches`, {
      query: {
        protected: args.protected,
        per_page: args.per_page,
        page: args.page,
      },
    });
  }

  async getBranch(args: GetBranchArgs): Promise<GitHubBranch> {
    return this.request<GitHubBranch>('GET', `/repos/${args.owner}/${args.repo}/branches/${args.branch}`);
  }

  async createBranch(args: CreateBranchArgs): Promise<{ ref: string; node_id: string; url: string; object: any }> {
    return this.request<{ ref: string; node_id: string; url: string; object: any }>(
      'POST',
      `/repos/${args.owner}/${args.repo}/git/refs`,
      {
        body: {
          ref: `refs/heads/${args.branch}`,
          sha: args.sha,
        },
      }
    );
  }

  async deleteBranch(args: DeleteBranchArgs): Promise<void> {
    return this.request<void>('DELETE', `/repos/${args.owner}/${args.repo}/git/refs/heads/${args.branch}`);
  }

  async getBranchProtection(args: GetBranchProtectionArgs): Promise<any> {
    return this.request('GET', `/repos/${args.owner}/${args.repo}/branches/${args.branch}/protection`);
  }

  async updateBranchProtection(args: UpdateBranchProtectionArgs): Promise<any> {
    return this.request('PUT', `/repos/${args.owner}/${args.repo}/branches/${args.branch}/protection`, {
      body: {
        required_status_checks: args.required_status_checks,
        enforce_admins: args.enforce_admins,
        required_pull_request_reviews: args.required_pull_request_reviews,
        restrictions: args.restrictions,
        required_linear_history: args.required_linear_history,
        allow_force_pushes: args.allow_force_pushes,
        allow_deletions: args.allow_deletions,
      },
    });
  }

  async deleteBranchProtection(args: DeleteBranchProtectionArgs): Promise<void> {
    return this.request<void>('DELETE', `/repos/${args.owner}/${args.repo}/branches/${args.branch}/protection`);
  }

  // ============================================================================
  // Tag Methods
  // ============================================================================

  async listTags(args: ListTagsArgs): Promise<GitHubTag[]> {
    return this.request<GitHubTag[]>('GET', `/repos/${args.owner}/${args.repo}/tags`, {
      query: {
        per_page: args.per_page,
        page: args.page,
      },
    });
  }

  async createTag(args: CreateTagArgs): Promise<any> {
    return this.request('POST', `/repos/${args.owner}/${args.repo}/git/tags`, {
      body: {
        tag: args.tag,
        message: args.message,
        object: args.object,
        type: args.type,
        tagger: args.tagger,
      },
    });
  }

  async deleteTag(args: DeleteTagArgs): Promise<void> {
    return this.request<void>('DELETE', `/repos/${args.owner}/${args.repo}/git/refs/tags/${args.tag}`);
  }

  // ============================================================================
  // File Methods
  // ============================================================================

  async getFileContent(args: GetFileContentArgs): Promise<GitHubFile> {
    return this.request<GitHubFile>('GET', `/repos/${args.owner}/${args.repo}/contents/${args.path}`, {
      query: {
        ref: args.ref,
      },
    });
  }

  async createOrUpdateFile(
    args: CreateOrUpdateFileArgs
  ): Promise<{ content: GitHubFile; commit: { sha: string; node_id: string; url: string } }> {
    return this.request('PUT', `/repos/${args.owner}/${args.repo}/contents/${args.path}`, {
      body: {
        message: args.message,
        content: args.content,
        sha: args.sha,
        branch: args.branch,
        committer: args.committer,
        author: args.author,
      },
    });
  }

  async deleteFile(
    args: DeleteFileArgs
  ): Promise<{ commit: { sha: string; node_id: string; url: string }; content: null }> {
    return this.request('DELETE', `/repos/${args.owner}/${args.repo}/contents/${args.path}`, {
      body: {
        message: args.message,
        sha: args.sha,
        branch: args.branch,
        committer: args.committer,
        author: args.author,
      },
    });
  }

  async getRepositoryContent(args: GetRepositoryContentArgs): Promise<GitHubFile | GitHubFile[]> {
    const path = args.path || '';
    return this.request<GitHubFile | GitHubFile[]>('GET', `/repos/${args.owner}/${args.repo}/contents/${path}`, {
      query: {
        ref: args.ref,
      },
    });
  }

  // ============================================================================
  // Workflow Methods
  // ============================================================================

  async listWorkflows(args: ListWorkflowsArgs): Promise<{ total_count: number; workflows: GitHubWorkflow[] }> {
    return this.request('GET', `/repos/${args.owner}/${args.repo}/actions/workflows`, {
      query: {
        per_page: args.per_page,
        page: args.page,
      },
    });
  }

  async getWorkflow(args: GetWorkflowArgs): Promise<GitHubWorkflow> {
    return this.request<GitHubWorkflow>('GET', `/repos/${args.owner}/${args.repo}/actions/workflows/${args.workflowId}`);
  }

  async triggerWorkflow(args: TriggerWorkflowArgs): Promise<void> {
    return this.request<void>(
      'POST',
      `/repos/${args.owner}/${args.repo}/actions/workflows/${args.workflowId}/dispatches`,
      {
        body: {
          ref: args.ref,
          inputs: args.inputs,
        },
      }
    );
  }

  async listWorkflowRuns(args: ListWorkflowRunsArgs): Promise<{ total_count: number; workflow_runs: GitHubWorkflowRun[] }> {
    const endpoint = args.workflowId
      ? `/repos/${args.owner}/${args.repo}/actions/workflows/${args.workflowId}/runs`
      : `/repos/${args.owner}/${args.repo}/actions/runs`;

    return this.request('GET', endpoint, {
      query: {
        actor: args.actor,
        branch: args.branch,
        event: args.event,
        status: args.status,
        per_page: args.per_page,
        page: args.page,
      },
    });
  }

  async getWorkflowRun(args: GetWorkflowRunArgs): Promise<GitHubWorkflowRun> {
    return this.request<GitHubWorkflowRun>('GET', `/repos/${args.owner}/${args.repo}/actions/runs/${args.runId}`);
  }

  async rerunWorkflow(args: RerunWorkflowArgs): Promise<void> {
    return this.request<void>('POST', `/repos/${args.owner}/${args.repo}/actions/runs/${args.runId}/rerun`, {
      body: {
        enable_debug_logging: args.enable_debug_logging,
      },
    });
  }

  async cancelWorkflowRun(args: CancelWorkflowRunArgs): Promise<void> {
    return this.request<void>('POST', `/repos/${args.owner}/${args.repo}/actions/runs/${args.runId}/cancel`);
  }

  async deleteWorkflowRun(args: DeleteWorkflowRunArgs): Promise<void> {
    return this.request<void>('DELETE', `/repos/${args.owner}/${args.repo}/actions/runs/${args.runId}`);
  }

  // ============================================================================
  // Collaborator Methods
  // ============================================================================

  async listCollaborators(args: ListCollaboratorsArgs): Promise<GitHubUser[]> {
    return this.request<GitHubUser[]>('GET', `/repos/${args.owner}/${args.repo}/collaborators`, {
      query: {
        affiliation: args.affiliation,
        per_page: args.per_page,
        page: args.page,
      },
    });
  }

  async addCollaborator(args: AddCollaboratorArgs): Promise<void> {
    return this.request<void>('PUT', `/repos/${args.owner}/${args.repo}/collaborators/${args.username}`, {
      body: {
        permission: args.permission,
      },
    });
  }

  async removeCollaborator(args: RemoveCollaboratorArgs): Promise<void> {
    return this.request<void>('DELETE', `/repos/${args.owner}/${args.repo}/collaborators/${args.username}`);
  }

  async checkCollaborator(args: CheckCollaboratorArgs): Promise<void> {
    return this.request<void>('GET', `/repos/${args.owner}/${args.repo}/collaborators/${args.username}`);
  }

  // ============================================================================
  // Label Methods
  // ============================================================================

  async listLabels(args: ListLabelsArgs): Promise<GitHubLabel[]> {
    return this.request<GitHubLabel[]>('GET', `/repos/${args.owner}/${args.repo}/labels`, {
      query: {
        per_page: args.per_page,
        page: args.page,
      },
    });
  }

  async getLabel(args: GetLabelArgs): Promise<GitHubLabel> {
    return this.request<GitHubLabel>('GET', `/repos/${args.owner}/${args.repo}/labels/${encodeURIComponent(args.name)}`);
  }

  async createLabel(args: CreateLabelArgs): Promise<GitHubLabel> {
    return this.request<GitHubLabel>('POST', `/repos/${args.owner}/${args.repo}/labels`, {
      body: {
        name: args.name,
        color: args.color,
        description: args.description,
      },
    });
  }

  async updateLabel(args: UpdateLabelArgs): Promise<GitHubLabel> {
    return this.request<GitHubLabel>('PATCH', `/repos/${args.owner}/${args.repo}/labels/${encodeURIComponent(args.name)}`, {
      body: {
        new_name: args.new_name,
        color: args.color,
        description: args.description,
      },
    });
  }

  async deleteLabel(args: DeleteLabelArgs): Promise<void> {
    return this.request<void>('DELETE', `/repos/${args.owner}/${args.repo}/labels/${encodeURIComponent(args.name)}`);
  }

  // ============================================================================
  // Milestone Methods
  // ============================================================================

  async listMilestones(args: ListMilestonesArgs): Promise<GitHubMilestone[]> {
    return this.request<GitHubMilestone[]>('GET', `/repos/${args.owner}/${args.repo}/milestones`, {
      query: {
        state: args.state,
        sort: args.sort,
        direction: args.direction,
        per_page: args.per_page,
        page: args.page,
      },
    });
  }

  async getMilestone(args: GetMilestoneArgs): Promise<GitHubMilestone> {
    return this.request<GitHubMilestone>(
      'GET',
      `/repos/${args.owner}/${args.repo}/milestones/${args.milestoneNumber}`
    );
  }

  async createMilestone(args: CreateMilestoneArgs): Promise<GitHubMilestone> {
    return this.request<GitHubMilestone>('POST', `/repos/${args.owner}/${args.repo}/milestones`, {
      body: {
        title: args.title,
        state: args.state,
        description: args.description,
        due_on: args.due_on,
      },
    });
  }

  async updateMilestone(args: UpdateMilestoneArgs): Promise<GitHubMilestone> {
    return this.request<GitHubMilestone>(
      'PATCH',
      `/repos/${args.owner}/${args.repo}/milestones/${args.milestoneNumber}`,
      {
        body: {
          title: args.title,
          state: args.state,
          description: args.description,
          due_on: args.due_on,
        },
      }
    );
  }

  async deleteMilestone(args: DeleteMilestoneArgs): Promise<void> {
    return this.request<void>('DELETE', `/repos/${args.owner}/${args.repo}/milestones/${args.milestoneNumber}`);
  }

  // ============================================================================
  // Search Methods
  // ============================================================================

  async searchIssues(args: SearchIssuesArgs): Promise<{ total_count: number; incomplete_results: boolean; items: GitHubIssue[] }> {
    return this.request('GET', '/search/issues', {
      query: {
        q: args.query,
        sort: args.sort,
        order: args.order,
        per_page: args.per_page,
        page: args.page,
      },
    });
  }

  async searchRepositories(args: SearchRepositoriesArgs): Promise<{ total_count: number; incomplete_results: boolean; items: GitHubRepository[] }> {
    return this.request('GET', '/search/repositories', {
      query: {
        q: args.query,
        sort: args.sort,
        order: args.order,
        per_page: args.per_page,
        page: args.page,
      },
    });
  }

  async searchCode(args: SearchCodeArgs): Promise<{ total_count: number; incomplete_results: boolean; items: any[] }> {
    return this.request('GET', '/search/code', {
      query: {
        q: args.query,
        sort: args.sort,
        order: args.order,
        per_page: args.per_page,
        page: args.page,
      },
    });
  }

  async searchCommits(args: SearchCommitsArgs): Promise<{ total_count: number; incomplete_results: boolean; items: GitHubCommit[] }> {
    return this.request('GET', '/search/commits', {
      query: {
        q: args.query,
        sort: args.sort,
        order: args.order,
        per_page: args.per_page,
        page: args.page,
      },
    });
  }

  async searchUsers(args: SearchUsersArgs): Promise<{ total_count: number; incomplete_results: boolean; items: GitHubUser[] }> {
    return this.request('GET', '/search/users', {
      query: {
        q: args.query,
        sort: args.sort,
        order: args.order,
        per_page: args.per_page,
        page: args.page,
      },
    });
  }

  // ============================================================================
  // User Methods
  // ============================================================================

  async getCurrentUser(_args: GetCurrentUserArgs = {}): Promise<GitHubUser> {
    return this.request<GitHubUser>('GET', '/user');
  }

  async getUser(args: GetUserArgs): Promise<GitHubUser> {
    return this.request<GitHubUser>('GET', `/users/${args.username}`);
  }

  // ============================================================================
  // Utility Methods
  // ============================================================================

  getRateLimitInfo(): RateLimitInfo {
    return this.rateLimiter.getInfo();
  }
}
