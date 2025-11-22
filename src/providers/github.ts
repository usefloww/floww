import {
  WebhookTrigger,
  Handler,
  WebhookEvent,
  WebhookContext,
} from "../common";
import { BaseProvider, BaseProviderConfig } from "./base";
import { GitHubApi } from "./github/api";
import { registerTrigger } from "../userCode/providers";
import type {
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
  GitHubPushEvent,
  GitHubPullRequestEvent,
  GitHubIssueEvent,
  GitHubIssueCommentEvent,
  GitHubReleaseEvent,
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
} from "./github/types";

export type GitHubConfig = BaseProviderConfig & {
  baseUrl?: string; // For GitHub Enterprise support
};

// ============================================================================
// Trigger Event Args Types
// ============================================================================

export type GitHubOnPushArgs = {
  owner: string;
  repository: string;
  branch?: string; // Optional: filter by specific branch
  handler: Handler<WebhookEvent<GitHubPushEvent>, WebhookContext>;
};

export type GitHubOnPullRequestArgs = {
  owner: string;
  repository: string;
  actions?: ('opened' | 'closed' | 'reopened' | 'synchronize' | 'edited' | 'assigned' | 'unassigned' | 'review_requested' | 'review_request_removed' | 'labeled' | 'unlabeled' | 'ready_for_review' | 'converted_to_draft' | 'locked' | 'unlocked')[]; // Optional: filter by specific PR actions
  handler: Handler<WebhookEvent<GitHubPullRequestEvent>, WebhookContext>;
};

export type GitHubOnIssueArgs = {
  owner: string;
  repository: string;
  actions?: ('opened' | 'edited' | 'deleted' | 'pinned' | 'unpinned' | 'closed' | 'reopened' | 'assigned' | 'unassigned' | 'labeled' | 'unlabeled' | 'locked' | 'unlocked' | 'transferred' | 'milestoned' | 'demilestoned')[]; // Optional: filter by specific issue actions
  handler: Handler<WebhookEvent<GitHubIssueEvent>, WebhookContext>;
};

export type GitHubOnIssueCommentArgs = {
  owner: string;
  repository: string;
  actions?: ('created' | 'edited' | 'deleted')[]; // Optional: filter by comment actions
  handler: Handler<WebhookEvent<GitHubIssueCommentEvent>, WebhookContext>;
};

export type GitHubOnReleaseArgs = {
  owner: string;
  repository: string;
  actions?: ('published' | 'unpublished' | 'created' | 'edited' | 'deleted' | 'prereleased' | 'released')[]; // Optional: filter by release actions
  handler: Handler<WebhookEvent<GitHubReleaseEvent>, WebhookContext>;
};

// ============================================================================
// Actions Class
// ============================================================================

class GitHubActions {
  constructor(private getApi: () => GitHubApi) {}

  // ==========================================================================
  // Repository Actions
  // ==========================================================================

  /**
   * Get details of a GitHub repository
   */
  async getRepository(args: GetRepositoryArgs): Promise<GitHubRepository> {
    const api = this.getApi();
    return await api.getRepository(args);
  }

  /**
   * List repositories for the authenticated user
   */
  async listRepositories(args?: ListRepositoriesArgs): Promise<GitHubRepository[]> {
    const api = this.getApi();
    return await api.listRepositories(args);
  }

  /**
   * Create a new GitHub repository
   */
  async createRepository(args: CreateRepositoryArgs): Promise<GitHubRepository> {
    const api = this.getApi();
    return await api.createRepository(args);
  }

  /**
   * Update a GitHub repository's settings
   */
  async updateRepository(args: UpdateRepositoryArgs): Promise<GitHubRepository> {
    const api = this.getApi();
    return await api.updateRepository(args);
  }

  // ==========================================================================
  // Issue Actions
  // ==========================================================================

  /**
   * Get details of a GitHub issue
   */
  async getIssue(args: GetIssueArgs): Promise<GitHubIssue> {
    const api = this.getApi();
    return await api.getIssue(args);
  }

  /**
   * List issues in a repository
   */
  async listIssues(args: ListIssuesArgs): Promise<GitHubIssue[]> {
    const api = this.getApi();
    return await api.listIssues(args);
  }

  /**
   * Create a new GitHub issue
   */
  async createIssue(args: CreateIssueArgs): Promise<GitHubIssue> {
    const api = this.getApi();
    return await api.createIssue(args);
  }

  /**
   * Update a GitHub issue
   */
  async updateIssue(args: UpdateIssueArgs): Promise<GitHubIssue> {
    const api = this.getApi();
    return await api.updateIssue(args);
  }

  /**
   * Close a GitHub issue
   */
  async closeIssue(args: CloseIssueArgs): Promise<GitHubIssue> {
    const api = this.getApi();
    return await api.closeIssue(args);
  }

  /**
   * Reopen a closed GitHub issue
   */
  async reopenIssue(args: ReopenIssueArgs): Promise<GitHubIssue> {
    const api = this.getApi();
    return await api.reopenIssue(args);
  }

  /**
   * Add labels to a GitHub issue
   */
  async addLabels(args: AddLabelsArgs): Promise<GitHubLabel[]> {
    const api = this.getApi();
    return await api.addLabels(args);
  }

  /**
   * Remove a label from a GitHub issue
   */
  async removeLabel(args: RemoveLabelArgs): Promise<void> {
    const api = this.getApi();
    return await api.removeLabel(args);
  }

  /**
   * Add assignees to a GitHub issue
   */
  async addAssignees(args: AddAssigneesArgs): Promise<GitHubIssue> {
    const api = this.getApi();
    return await api.addAssignees(args);
  }

  /**
   * Remove assignees from a GitHub issue
   */
  async removeAssignees(args: RemoveAssigneesArgs): Promise<GitHubIssue> {
    const api = this.getApi();
    return await api.removeAssignees(args);
  }

  /**
   * Lock a GitHub issue
   */
  async lockIssue(args: LockIssueArgs): Promise<void> {
    const api = this.getApi();
    return await api.lockIssue(args);
  }

  /**
   * Unlock a GitHub issue
   */
  async unlockIssue(args: UnlockIssueArgs): Promise<void> {
    const api = this.getApi();
    return await api.unlockIssue(args);
  }

  // ==========================================================================
  // Pull Request Actions
  // ==========================================================================

  /**
   * Get details of a GitHub pull request
   */
  async getPullRequest(args: GetPullRequestArgs): Promise<GitHubPullRequest> {
    const api = this.getApi();
    return await api.getPullRequest(args);
  }

  /**
   * List pull requests in a repository
   */
  async listPullRequests(args: ListPullRequestsArgs): Promise<GitHubPullRequest[]> {
    const api = this.getApi();
    return await api.listPullRequests(args);
  }

  /**
   * Create a new GitHub pull request
   */
  async createPullRequest(args: CreatePullRequestArgs): Promise<GitHubPullRequest> {
    const api = this.getApi();
    return await api.createPullRequest(args);
  }

  /**
   * Update a GitHub pull request
   */
  async updatePullRequest(args: UpdatePullRequestArgs): Promise<GitHubPullRequest> {
    const api = this.getApi();
    return await api.updatePullRequest(args);
  }

  /**
   * Merge a GitHub pull request
   */
  async mergePullRequest(args: MergePullRequestArgs): Promise<{ sha: string; merged: boolean; message: string }> {
    const api = this.getApi();
    return await api.mergePullRequest(args);
  }

  /**
   * Close a GitHub pull request without merging
   */
  async closePullRequest(args: ClosePullRequestArgs): Promise<GitHubPullRequest> {
    const api = this.getApi();
    return await api.closePullRequest(args);
  }

  /**
   * Request reviewers for a pull request
   */
  async requestReviewers(args: RequestReviewersArgs): Promise<GitHubPullRequest> {
    const api = this.getApi();
    return await api.requestReviewers(args);
  }

  /**
   * Remove requested reviewers from a pull request
   */
  async removeRequestedReviewers(args: RemoveRequestedReviewersArgs): Promise<GitHubPullRequest> {
    const api = this.getApi();
    return await api.removeRequestedReviewers(args);
  }

  /**
   * List files changed in a pull request
   */
  async listPullRequestFiles(args: ListPullRequestFilesArgs): Promise<any[]> {
    const api = this.getApi();
    return await api.listPullRequestFiles(args);
  }

  /**
   * List commits in a pull request
   */
  async listPullRequestCommits(args: ListPullRequestCommitsArgs): Promise<GitHubCommit[]> {
    const api = this.getApi();
    return await api.listPullRequestCommits(args);
  }

  // ==========================================================================
  // Review Actions
  // ==========================================================================

  /**
   * Create a review for a pull request
   */
  async createReview(args: CreateReviewArgs): Promise<any> {
    const api = this.getApi();
    return await api.createReview(args);
  }

  /**
   * Submit a pending review for a pull request
   */
  async submitReview(args: SubmitReviewArgs): Promise<any> {
    const api = this.getApi();
    return await api.submitReview(args);
  }

  /**
   * Dismiss a review for a pull request
   */
  async dismissReview(args: DismissReviewArgs): Promise<any> {
    const api = this.getApi();
    return await api.dismissReview(args);
  }

  // ==========================================================================
  // Comment Actions
  // ==========================================================================

  /**
   * List comments on an issue or pull request
   */
  async listIssueComments(args: ListIssueCommentsArgs): Promise<GitHubComment[]> {
    const api = this.getApi();
    return await api.listIssueComments(args);
  }

  /**
   * Create a comment on an issue or pull request
   */
  async createComment(args: CreateCommentArgs): Promise<GitHubComment> {
    const api = this.getApi();
    return await api.createComment(args);
  }

  /**
   * Update an existing comment
   */
  async updateComment(args: UpdateCommentArgs): Promise<GitHubComment> {
    const api = this.getApi();
    return await api.updateComment(args);
  }

  /**
   * Delete a comment
   */
  async deleteComment(args: DeleteCommentArgs): Promise<void> {
    const api = this.getApi();
    return await api.deleteComment(args);
  }

  /**
   * Create a review comment on a pull request
   */
  async createPullRequestReviewComment(args: CreatePullRequestReviewCommentArgs): Promise<GitHubComment> {
    const api = this.getApi();
    return await api.createPullRequestReviewComment(args);
  }

  // ==========================================================================
  // Release Actions
  // ==========================================================================

  /**
   * Get details of a GitHub release
   */
  async getRelease(args: GetReleaseArgs): Promise<GitHubRelease> {
    const api = this.getApi();
    return await api.getRelease(args);
  }

  /**
   * Get the latest release for a repository
   */
  async getLatestRelease(args: GetLatestReleaseArgs): Promise<GitHubRelease> {
    const api = this.getApi();
    return await api.getLatestRelease(args);
  }

  /**
   * Get a release by tag name
   */
  async getReleaseByTag(args: GetReleaseByTagArgs): Promise<GitHubRelease> {
    const api = this.getApi();
    return await api.getReleaseByTag(args);
  }

  /**
   * List releases in a repository
   */
  async listReleases(args: ListReleasesArgs): Promise<GitHubRelease[]> {
    const api = this.getApi();
    return await api.listReleases(args);
  }

  /**
   * Create a new GitHub release
   */
  async createRelease(args: CreateReleaseArgs): Promise<GitHubRelease> {
    const api = this.getApi();
    return await api.createRelease(args);
  }

  /**
   * Update a GitHub release
   */
  async updateRelease(args: UpdateReleaseArgs): Promise<GitHubRelease> {
    const api = this.getApi();
    return await api.updateRelease(args);
  }

  /**
   * Delete a GitHub release
   */
  async deleteRelease(args: DeleteReleaseArgs): Promise<void> {
    const api = this.getApi();
    return await api.deleteRelease(args);
  }

  /**
   * Generate release notes for a tag
   */
  async generateReleaseNotes(args: GenerateReleaseNotesArgs): Promise<{ name: string; body: string }> {
    const api = this.getApi();
    return await api.generateReleaseNotes(args);
  }

  // ==========================================================================
  // Commit Actions
  // ==========================================================================

  /**
   * Get details of a commit
   */
  async getCommit(args: GetCommitArgs): Promise<GitHubCommit> {
    const api = this.getApi();
    return await api.getCommit(args);
  }

  /**
   * List commits in a repository
   */
  async listCommits(args: ListCommitsArgs): Promise<GitHubCommit[]> {
    const api = this.getApi();
    return await api.listCommits(args);
  }

  /**
   * Compare two commits or branches
   */
  async compareCommits(args: CompareCommitsArgs): Promise<any> {
    const api = this.getApi();
    return await api.compareCommits(args);
  }

  // ==========================================================================
  // Branch Actions
  // ==========================================================================

  /**
   * List branches in a repository
   */
  async listBranches(args: ListBranchesArgs): Promise<GitHubBranch[]> {
    const api = this.getApi();
    return await api.listBranches(args);
  }

  /**
   * Get details of a branch
   */
  async getBranch(args: GetBranchArgs): Promise<GitHubBranch> {
    const api = this.getApi();
    return await api.getBranch(args);
  }

  /**
   * Create a new branch
   */
  async createBranch(args: CreateBranchArgs): Promise<any> {
    const api = this.getApi();
    return await api.createBranch(args);
  }

  /**
   * Delete a branch
   */
  async deleteBranch(args: DeleteBranchArgs): Promise<void> {
    const api = this.getApi();
    return await api.deleteBranch(args);
  }

  /**
   * Get branch protection rules
   */
  async getBranchProtection(args: GetBranchProtectionArgs): Promise<any> {
    const api = this.getApi();
    return await api.getBranchProtection(args);
  }

  /**
   * Update branch protection rules
   */
  async updateBranchProtection(args: UpdateBranchProtectionArgs): Promise<any> {
    const api = this.getApi();
    return await api.updateBranchProtection(args);
  }

  /**
   * Remove branch protection
   */
  async deleteBranchProtection(args: DeleteBranchProtectionArgs): Promise<void> {
    const api = this.getApi();
    return await api.deleteBranchProtection(args);
  }

  // ==========================================================================
  // Tag Actions
  // ==========================================================================

  /**
   * List tags in a repository
   */
  async listTags(args: ListTagsArgs): Promise<GitHubTag[]> {
    const api = this.getApi();
    return await api.listTags(args);
  }

  /**
   * Create a new tag
   */
  async createTag(args: CreateTagArgs): Promise<any> {
    const api = this.getApi();
    return await api.createTag(args);
  }

  /**
   * Delete a tag
   */
  async deleteTag(args: DeleteTagArgs): Promise<void> {
    const api = this.getApi();
    return await api.deleteTag(args);
  }

  // ==========================================================================
  // File Actions
  // ==========================================================================

  /**
   * Get file content from a repository
   */
  async getFileContent(args: GetFileContentArgs): Promise<GitHubFile> {
    const api = this.getApi();
    return await api.getFileContent(args);
  }

  /**
   * Create or update a file in a repository
   */
  async createOrUpdateFile(args: CreateOrUpdateFileArgs): Promise<any> {
    const api = this.getApi();
    return await api.createOrUpdateFile(args);
  }

  /**
   * Delete a file from a repository
   */
  async deleteFile(args: DeleteFileArgs): Promise<any> {
    const api = this.getApi();
    return await api.deleteFile(args);
  }

  /**
   * Get repository content (file or directory listing)
   */
  async getRepositoryContent(args: GetRepositoryContentArgs): Promise<GitHubFile | GitHubFile[]> {
    const api = this.getApi();
    return await api.getRepositoryContent(args);
  }

  // ==========================================================================
  // Workflow Actions
  // ==========================================================================

  /**
   * List workflows in a repository
   */
  async listWorkflows(args: ListWorkflowsArgs): Promise<{ total_count: number; workflows: GitHubWorkflow[] }> {
    const api = this.getApi();
    return await api.listWorkflows(args);
  }

  /**
   * Get details of a workflow
   */
  async getWorkflow(args: GetWorkflowArgs): Promise<GitHubWorkflow> {
    const api = this.getApi();
    return await api.getWorkflow(args);
  }

  /**
   * Trigger a workflow run
   */
  async triggerWorkflow(args: TriggerWorkflowArgs): Promise<void> {
    const api = this.getApi();
    return await api.triggerWorkflow(args);
  }

  /**
   * List workflow runs
   */
  async listWorkflowRuns(args: ListWorkflowRunsArgs): Promise<{ total_count: number; workflow_runs: GitHubWorkflowRun[] }> {
    const api = this.getApi();
    return await api.listWorkflowRuns(args);
  }

  /**
   * Get details of a workflow run
   */
  async getWorkflowRun(args: GetWorkflowRunArgs): Promise<GitHubWorkflowRun> {
    const api = this.getApi();
    return await api.getWorkflowRun(args);
  }

  /**
   * Rerun a workflow
   */
  async rerunWorkflow(args: RerunWorkflowArgs): Promise<void> {
    const api = this.getApi();
    return await api.rerunWorkflow(args);
  }

  /**
   * Cancel a workflow run
   */
  async cancelWorkflowRun(args: CancelWorkflowRunArgs): Promise<void> {
    const api = this.getApi();
    return await api.cancelWorkflowRun(args);
  }

  /**
   * Delete a workflow run
   */
  async deleteWorkflowRun(args: DeleteWorkflowRunArgs): Promise<void> {
    const api = this.getApi();
    return await api.deleteWorkflowRun(args);
  }

  // ==========================================================================
  // Collaborator Actions
  // ==========================================================================

  /**
   * List collaborators in a repository
   */
  async listCollaborators(args: ListCollaboratorsArgs): Promise<GitHubUser[]> {
    const api = this.getApi();
    return await api.listCollaborators(args);
  }

  /**
   * Add a collaborator to a repository
   */
  async addCollaborator(args: AddCollaboratorArgs): Promise<void> {
    const api = this.getApi();
    return await api.addCollaborator(args);
  }

  /**
   * Remove a collaborator from a repository
   */
  async removeCollaborator(args: RemoveCollaboratorArgs): Promise<void> {
    const api = this.getApi();
    return await api.removeCollaborator(args);
  }

  /**
   * Check if a user is a collaborator
   */
  async checkCollaborator(args: CheckCollaboratorArgs): Promise<void> {
    const api = this.getApi();
    return await api.checkCollaborator(args);
  }

  // ==========================================================================
  // Label Actions
  // ==========================================================================

  /**
   * List labels in a repository
   */
  async listLabels(args: ListLabelsArgs): Promise<GitHubLabel[]> {
    const api = this.getApi();
    return await api.listLabels(args);
  }

  /**
   * Get details of a label
   */
  async getLabel(args: GetLabelArgs): Promise<GitHubLabel> {
    const api = this.getApi();
    return await api.getLabel(args);
  }

  /**
   * Create a new label
   */
  async createLabel(args: CreateLabelArgs): Promise<GitHubLabel> {
    const api = this.getApi();
    return await api.createLabel(args);
  }

  /**
   * Update a label
   */
  async updateLabel(args: UpdateLabelArgs): Promise<GitHubLabel> {
    const api = this.getApi();
    return await api.updateLabel(args);
  }

  /**
   * Delete a label
   */
  async deleteLabel(args: DeleteLabelArgs): Promise<void> {
    const api = this.getApi();
    return await api.deleteLabel(args);
  }

  // ==========================================================================
  // Milestone Actions
  // ==========================================================================

  /**
   * List milestones in a repository
   */
  async listMilestones(args: ListMilestonesArgs): Promise<GitHubMilestone[]> {
    const api = this.getApi();
    return await api.listMilestones(args);
  }

  /**
   * Get details of a milestone
   */
  async getMilestone(args: GetMilestoneArgs): Promise<GitHubMilestone> {
    const api = this.getApi();
    return await api.getMilestone(args);
  }

  /**
   * Create a new milestone
   */
  async createMilestone(args: CreateMilestoneArgs): Promise<GitHubMilestone> {
    const api = this.getApi();
    return await api.createMilestone(args);
  }

  /**
   * Update a milestone
   */
  async updateMilestone(args: UpdateMilestoneArgs): Promise<GitHubMilestone> {
    const api = this.getApi();
    return await api.updateMilestone(args);
  }

  /**
   * Delete a milestone
   */
  async deleteMilestone(args: DeleteMilestoneArgs): Promise<void> {
    const api = this.getApi();
    return await api.deleteMilestone(args);
  }

  // ==========================================================================
  // Search Actions
  // ==========================================================================

  /**
   * Search for issues and pull requests
   */
  async searchIssues(args: SearchIssuesArgs): Promise<{ total_count: number; incomplete_results: boolean; items: GitHubIssue[] }> {
    const api = this.getApi();
    return await api.searchIssues(args);
  }

  /**
   * Search for repositories
   */
  async searchRepositories(args: SearchRepositoriesArgs): Promise<{ total_count: number; incomplete_results: boolean; items: GitHubRepository[] }> {
    const api = this.getApi();
    return await api.searchRepositories(args);
  }

  /**
   * Search for code
   */
  async searchCode(args: SearchCodeArgs): Promise<{ total_count: number; incomplete_results: boolean; items: any[] }> {
    const api = this.getApi();
    return await api.searchCode(args);
  }

  /**
   * Search for commits
   */
  async searchCommits(args: SearchCommitsArgs): Promise<{ total_count: number; incomplete_results: boolean; items: GitHubCommit[] }> {
    const api = this.getApi();
    return await api.searchCommits(args);
  }

  /**
   * Search for users
   */
  async searchUsers(args: SearchUsersArgs): Promise<{ total_count: number; incomplete_results: boolean; items: GitHubUser[] }> {
    const api = this.getApi();
    return await api.searchUsers(args);
  }

  // ==========================================================================
  // User Actions
  // ==========================================================================

  /**
   * Get the authenticated user
   */
  async getCurrentUser(): Promise<GitHubUser> {
    const api = this.getApi();
    return await api.getCurrentUser({});
  }

  /**
   * Get details of a user
   */
  async getUser(args: GetUserArgs): Promise<GitHubUser> {
    const api = this.getApi();
    return await api.getUser(args);
  }
}

// ============================================================================
// GitHub Provider Class
// ============================================================================

export class GitHub extends BaseProvider {
  private api?: GitHubApi;
  actions: GitHubActions;

  constructor(config?: GitHubConfig | string) {
    super("github", config);
    this.actions = new GitHubActions(() => this.getApi());
  }

  private getApi(): GitHubApi {
    if (!this.api) {
      const baseUrl = this.getConfig("server_url", "https://api.github.com") as string;
      const accessToken = this.getSecret("access_token");

      this.api = new GitHubApi({ baseUrl, accessToken });
    }
    return this.api;
  }

  triggers = {
    /**
     * Triggers when commits are pushed to a GitHub repository.
     *
     * The trigger is registered on the backend and filtering is handled server-side.
     * A webhook is automatically created in the GitHub repository.
     *
     * @param args Configuration for the push trigger
     * @param args.owner The repository owner (username or organization)
     * @param args.repository The repository name
     * @param args.branch Optional: Filter pushes to a specific branch
     * @param args.handler Function to handle incoming push events
     */
    onPush: (
      args: GitHubOnPushArgs
    ): WebhookTrigger<GitHubPushEvent> => {
      return registerTrigger(
        {
          type: "webhook",
          handler: args.handler,
          method: "POST",
        },
        {
          type: this.providerType,
          alias: this.credentialName,
          triggerType: "onPush",
          input: {
            owner: args.owner,
            repository: args.repository,
            branch: args.branch,
          },
        }
      );
    },

    /**
     * Triggers when a pull request is opened, closed, updated, etc.
     *
     * The trigger is registered on the backend and filtering is handled server-side.
     * A webhook is automatically created in the GitHub repository.
     *
     * @param args Configuration for the pull request trigger
     * @param args.owner The repository owner (username or organization)
     * @param args.repository The repository name
     * @param args.actions Optional: Filter by PR actions (opened, closed, synchronize, etc.)
     * @param args.handler Function to handle incoming pull request events
     */
    onPullRequest: (
      args: GitHubOnPullRequestArgs
    ): WebhookTrigger<GitHubPullRequestEvent> => {
      return registerTrigger(
        {
          type: "webhook",
          handler: args.handler,
          method: "POST",
        },
        {
          type: this.providerType,
          alias: this.credentialName,
          triggerType: "onPullRequest",
          input: {
            owner: args.owner,
            repository: args.repository,
            actions: args.actions,
          },
        }
      );
    },

    /**
     * Triggers when an issue is opened, closed, edited, etc.
     *
     * The trigger is registered on the backend and filtering is handled server-side.
     * A webhook is automatically created in the GitHub repository.
     *
     * @param args Configuration for the issue trigger
     * @param args.owner The repository owner (username or organization)
     * @param args.repository The repository name
     * @param args.actions Optional: Filter by issue actions (opened, closed, edited, etc.)
     * @param args.handler Function to handle incoming issue events
     */
    onIssue: (
      args: GitHubOnIssueArgs
    ): WebhookTrigger<GitHubIssueEvent> => {
      return registerTrigger(
        {
          type: "webhook",
          handler: args.handler,
          method: "POST",
        },
        {
          type: this.providerType,
          alias: this.credentialName,
          triggerType: "onIssue",
          input: {
            owner: args.owner,
            repository: args.repository,
            actions: args.actions,
          },
        }
      );
    },

    /**
     * Triggers when a comment is created, edited, or deleted on an issue or pull request.
     *
     * The trigger is registered on the backend and filtering is handled server-side.
     * A webhook is automatically created in the GitHub repository.
     *
     * @param args Configuration for the issue comment trigger
     * @param args.owner The repository owner (username or organization)
     * @param args.repository The repository name
     * @param args.actions Optional: Filter by comment actions (created, edited, deleted)
     * @param args.handler Function to handle incoming comment events
     */
    onIssueComment: (
      args: GitHubOnIssueCommentArgs
    ): WebhookTrigger<GitHubIssueCommentEvent> => {
      return registerTrigger(
        {
          type: "webhook",
          handler: args.handler,
          method: "POST",
        },
        {
          type: this.providerType,
          alias: this.credentialName,
          triggerType: "onIssueComment",
          input: {
            owner: args.owner,
            repository: args.repository,
            actions: args.actions,
          },
        }
      );
    },

    /**
     * Triggers when a release is published, created, edited, or deleted.
     *
     * The trigger is registered on the backend and filtering is handled server-side.
     * A webhook is automatically created in the GitHub repository.
     *
     * @param args Configuration for the release trigger
     * @param args.owner The repository owner (username or organization)
     * @param args.repository The repository name
     * @param args.actions Optional: Filter by release actions (published, created, edited, deleted)
     * @param args.handler Function to handle incoming release events
     */
    onRelease: (
      args: GitHubOnReleaseArgs
    ): WebhookTrigger<GitHubReleaseEvent> => {
      return registerTrigger(
        {
          type: "webhook",
          handler: args.handler,
          method: "POST",
        },
        {
          type: this.providerType,
          alias: this.credentialName,
          triggerType: "onRelease",
          input: {
            owner: args.owner,
            repository: args.repository,
            actions: args.actions,
          },
        }
      );
    },
  };
}

// Export commonly used types for user convenience
export type {
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
  GitHubPushEvent,
  GitHubPullRequestEvent,
  GitHubIssueEvent,
  GitHubIssueCommentEvent,
  GitHubReleaseEvent,
} from "./github/types";
