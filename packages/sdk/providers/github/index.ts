import {
  WebhookTrigger,
  Handler,
  WebhookEvent,
  WebhookContext,
} from "../../common";
import { BaseProvider, BaseProviderConfig } from "../base";
import { GitHubApi } from "./api";
import { registerTrigger } from "../../userCode/providers";
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
  GetUserArgs,
} from "./types";

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

  async getRepository(args: GetRepositoryArgs): Promise<GitHubRepository> {
    const api = this.getApi();
    return await api.getRepository(args);
  }

  async listRepositories(args?: ListRepositoriesArgs): Promise<GitHubRepository[]> {
    const api = this.getApi();
    return await api.listRepositories(args);
  }

  async createRepository(args: CreateRepositoryArgs): Promise<GitHubRepository> {
    const api = this.getApi();
    return await api.createRepository(args);
  }

  async updateRepository(args: UpdateRepositoryArgs): Promise<GitHubRepository> {
    const api = this.getApi();
    return await api.updateRepository(args);
  }

  // ==========================================================================
  // Issue Actions
  // ==========================================================================

  async getIssue(args: GetIssueArgs): Promise<GitHubIssue> {
    const api = this.getApi();
    return await api.getIssue(args);
  }

  async listIssues(args: ListIssuesArgs): Promise<GitHubIssue[]> {
    const api = this.getApi();
    return await api.listIssues(args);
  }

  async createIssue(args: CreateIssueArgs): Promise<GitHubIssue> {
    const api = this.getApi();
    return await api.createIssue(args);
  }

  async updateIssue(args: UpdateIssueArgs): Promise<GitHubIssue> {
    const api = this.getApi();
    return await api.updateIssue(args);
  }

  async closeIssue(args: CloseIssueArgs): Promise<GitHubIssue> {
    const api = this.getApi();
    return await api.closeIssue(args);
  }

  async reopenIssue(args: ReopenIssueArgs): Promise<GitHubIssue> {
    const api = this.getApi();
    return await api.reopenIssue(args);
  }

  async addLabels(args: AddLabelsArgs): Promise<GitHubLabel[]> {
    const api = this.getApi();
    return await api.addLabels(args);
  }

  async removeLabel(args: RemoveLabelArgs): Promise<void> {
    const api = this.getApi();
    return await api.removeLabel(args);
  }

  async addAssignees(args: AddAssigneesArgs): Promise<GitHubIssue> {
    const api = this.getApi();
    return await api.addAssignees(args);
  }

  async removeAssignees(args: RemoveAssigneesArgs): Promise<GitHubIssue> {
    const api = this.getApi();
    return await api.removeAssignees(args);
  }

  async lockIssue(args: LockIssueArgs): Promise<void> {
    const api = this.getApi();
    return await api.lockIssue(args);
  }

  async unlockIssue(args: UnlockIssueArgs): Promise<void> {
    const api = this.getApi();
    return await api.unlockIssue(args);
  }

  // ==========================================================================
  // Pull Request Actions
  // ==========================================================================

  async getPullRequest(args: GetPullRequestArgs): Promise<GitHubPullRequest> {
    const api = this.getApi();
    return await api.getPullRequest(args);
  }

  async listPullRequests(args: ListPullRequestsArgs): Promise<GitHubPullRequest[]> {
    const api = this.getApi();
    return await api.listPullRequests(args);
  }

  async createPullRequest(args: CreatePullRequestArgs): Promise<GitHubPullRequest> {
    const api = this.getApi();
    return await api.createPullRequest(args);
  }

  async updatePullRequest(args: UpdatePullRequestArgs): Promise<GitHubPullRequest> {
    const api = this.getApi();
    return await api.updatePullRequest(args);
  }

  async mergePullRequest(args: MergePullRequestArgs): Promise<{ sha: string; merged: boolean; message: string }> {
    const api = this.getApi();
    return await api.mergePullRequest(args);
  }

  async closePullRequest(args: ClosePullRequestArgs): Promise<GitHubPullRequest> {
    const api = this.getApi();
    return await api.closePullRequest(args);
  }

  async requestReviewers(args: RequestReviewersArgs): Promise<GitHubPullRequest> {
    const api = this.getApi();
    return await api.requestReviewers(args);
  }

  async removeRequestedReviewers(args: RemoveRequestedReviewersArgs): Promise<GitHubPullRequest> {
    const api = this.getApi();
    return await api.removeRequestedReviewers(args);
  }

  async listPullRequestFiles(args: ListPullRequestFilesArgs): Promise<any[]> {
    const api = this.getApi();
    return await api.listPullRequestFiles(args);
  }

  async listPullRequestCommits(args: ListPullRequestCommitsArgs): Promise<GitHubCommit[]> {
    const api = this.getApi();
    return await api.listPullRequestCommits(args);
  }

  // ==========================================================================
  // Review Actions
  // ==========================================================================

  async createReview(args: CreateReviewArgs): Promise<any> {
    const api = this.getApi();
    return await api.createReview(args);
  }

  async submitReview(args: SubmitReviewArgs): Promise<any> {
    const api = this.getApi();
    return await api.submitReview(args);
  }

  async dismissReview(args: DismissReviewArgs): Promise<any> {
    const api = this.getApi();
    return await api.dismissReview(args);
  }

  // ==========================================================================
  // Comment Actions
  // ==========================================================================

  async listIssueComments(args: ListIssueCommentsArgs): Promise<GitHubComment[]> {
    const api = this.getApi();
    return await api.listIssueComments(args);
  }

  async createComment(args: CreateCommentArgs): Promise<GitHubComment> {
    const api = this.getApi();
    return await api.createComment(args);
  }

  async updateComment(args: UpdateCommentArgs): Promise<GitHubComment> {
    const api = this.getApi();
    return await api.updateComment(args);
  }

  async deleteComment(args: DeleteCommentArgs): Promise<void> {
    const api = this.getApi();
    return await api.deleteComment(args);
  }

  async createPullRequestReviewComment(args: CreatePullRequestReviewCommentArgs): Promise<GitHubComment> {
    const api = this.getApi();
    return await api.createPullRequestReviewComment(args);
  }

  // ==========================================================================
  // Release Actions
  // ==========================================================================

  async getRelease(args: GetReleaseArgs): Promise<GitHubRelease> {
    const api = this.getApi();
    return await api.getRelease(args);
  }

  async getLatestRelease(args: GetLatestReleaseArgs): Promise<GitHubRelease> {
    const api = this.getApi();
    return await api.getLatestRelease(args);
  }

  async getReleaseByTag(args: GetReleaseByTagArgs): Promise<GitHubRelease> {
    const api = this.getApi();
    return await api.getReleaseByTag(args);
  }

  async listReleases(args: ListReleasesArgs): Promise<GitHubRelease[]> {
    const api = this.getApi();
    return await api.listReleases(args);
  }

  async createRelease(args: CreateReleaseArgs): Promise<GitHubRelease> {
    const api = this.getApi();
    return await api.createRelease(args);
  }

  async updateRelease(args: UpdateReleaseArgs): Promise<GitHubRelease> {
    const api = this.getApi();
    return await api.updateRelease(args);
  }

  async deleteRelease(args: DeleteReleaseArgs): Promise<void> {
    const api = this.getApi();
    return await api.deleteRelease(args);
  }

  async generateReleaseNotes(args: GenerateReleaseNotesArgs): Promise<{ name: string; body: string }> {
    const api = this.getApi();
    return await api.generateReleaseNotes(args);
  }

  // ==========================================================================
  // Commit Actions
  // ==========================================================================

  async getCommit(args: GetCommitArgs): Promise<GitHubCommit> {
    const api = this.getApi();
    return await api.getCommit(args);
  }

  async listCommits(args: ListCommitsArgs): Promise<GitHubCommit[]> {
    const api = this.getApi();
    return await api.listCommits(args);
  }

  async compareCommits(args: CompareCommitsArgs): Promise<any> {
    const api = this.getApi();
    return await api.compareCommits(args);
  }

  // ==========================================================================
  // Branch Actions
  // ==========================================================================

  async listBranches(args: ListBranchesArgs): Promise<GitHubBranch[]> {
    const api = this.getApi();
    return await api.listBranches(args);
  }

  async getBranch(args: GetBranchArgs): Promise<GitHubBranch> {
    const api = this.getApi();
    return await api.getBranch(args);
  }

  async createBranch(args: CreateBranchArgs): Promise<any> {
    const api = this.getApi();
    return await api.createBranch(args);
  }

  async deleteBranch(args: DeleteBranchArgs): Promise<void> {
    const api = this.getApi();
    return await api.deleteBranch(args);
  }

  async getBranchProtection(args: GetBranchProtectionArgs): Promise<any> {
    const api = this.getApi();
    return await api.getBranchProtection(args);
  }

  async updateBranchProtection(args: UpdateBranchProtectionArgs): Promise<any> {
    const api = this.getApi();
    return await api.updateBranchProtection(args);
  }

  async deleteBranchProtection(args: DeleteBranchProtectionArgs): Promise<void> {
    const api = this.getApi();
    return await api.deleteBranchProtection(args);
  }

  // ==========================================================================
  // Tag Actions
  // ==========================================================================

  async listTags(args: ListTagsArgs): Promise<GitHubTag[]> {
    const api = this.getApi();
    return await api.listTags(args);
  }

  async createTag(args: CreateTagArgs): Promise<any> {
    const api = this.getApi();
    return await api.createTag(args);
  }

  async deleteTag(args: DeleteTagArgs): Promise<void> {
    const api = this.getApi();
    return await api.deleteTag(args);
  }

  // ==========================================================================
  // File Actions
  // ==========================================================================

  async getFileContent(args: GetFileContentArgs): Promise<GitHubFile> {
    const api = this.getApi();
    return await api.getFileContent(args);
  }

  async createOrUpdateFile(args: CreateOrUpdateFileArgs): Promise<any> {
    const api = this.getApi();
    return await api.createOrUpdateFile(args);
  }

  async deleteFile(args: DeleteFileArgs): Promise<any> {
    const api = this.getApi();
    return await api.deleteFile(args);
  }

  async getRepositoryContent(args: GetRepositoryContentArgs): Promise<GitHubFile | GitHubFile[]> {
    const api = this.getApi();
    return await api.getRepositoryContent(args);
  }

  // ==========================================================================
  // Workflow Actions
  // ==========================================================================

  async listWorkflows(args: ListWorkflowsArgs): Promise<{ total_count: number; workflows: GitHubWorkflow[] }> {
    const api = this.getApi();
    return await api.listWorkflows(args);
  }

  async getWorkflow(args: GetWorkflowArgs): Promise<GitHubWorkflow> {
    const api = this.getApi();
    return await api.getWorkflow(args);
  }

  async triggerWorkflow(args: TriggerWorkflowArgs): Promise<void> {
    const api = this.getApi();
    return await api.triggerWorkflow(args);
  }

  async listWorkflowRuns(args: ListWorkflowRunsArgs): Promise<{ total_count: number; workflow_runs: GitHubWorkflowRun[] }> {
    const api = this.getApi();
    return await api.listWorkflowRuns(args);
  }

  async getWorkflowRun(args: GetWorkflowRunArgs): Promise<GitHubWorkflowRun> {
    const api = this.getApi();
    return await api.getWorkflowRun(args);
  }

  async rerunWorkflow(args: RerunWorkflowArgs): Promise<void> {
    const api = this.getApi();
    return await api.rerunWorkflow(args);
  }

  async cancelWorkflowRun(args: CancelWorkflowRunArgs): Promise<void> {
    const api = this.getApi();
    return await api.cancelWorkflowRun(args);
  }

  async deleteWorkflowRun(args: DeleteWorkflowRunArgs): Promise<void> {
    const api = this.getApi();
    return await api.deleteWorkflowRun(args);
  }

  // ==========================================================================
  // Collaborator Actions
  // ==========================================================================

  async listCollaborators(args: ListCollaboratorsArgs): Promise<GitHubUser[]> {
    const api = this.getApi();
    return await api.listCollaborators(args);
  }

  async addCollaborator(args: AddCollaboratorArgs): Promise<void> {
    const api = this.getApi();
    return await api.addCollaborator(args);
  }

  async removeCollaborator(args: RemoveCollaboratorArgs): Promise<void> {
    const api = this.getApi();
    return await api.removeCollaborator(args);
  }

  async checkCollaborator(args: CheckCollaboratorArgs): Promise<void> {
    const api = this.getApi();
    return await api.checkCollaborator(args);
  }

  // ==========================================================================
  // Label Actions
  // ==========================================================================

  async listLabels(args: ListLabelsArgs): Promise<GitHubLabel[]> {
    const api = this.getApi();
    return await api.listLabels(args);
  }

  async getLabel(args: GetLabelArgs): Promise<GitHubLabel> {
    const api = this.getApi();
    return await api.getLabel(args);
  }

  async createLabel(args: CreateLabelArgs): Promise<GitHubLabel> {
    const api = this.getApi();
    return await api.createLabel(args);
  }

  async updateLabel(args: UpdateLabelArgs): Promise<GitHubLabel> {
    const api = this.getApi();
    return await api.updateLabel(args);
  }

  async deleteLabel(args: DeleteLabelArgs): Promise<void> {
    const api = this.getApi();
    return await api.deleteLabel(args);
  }

  // ==========================================================================
  // Milestone Actions
  // ==========================================================================

  async listMilestones(args: ListMilestonesArgs): Promise<GitHubMilestone[]> {
    const api = this.getApi();
    return await api.listMilestones(args);
  }

  async getMilestone(args: GetMilestoneArgs): Promise<GitHubMilestone> {
    const api = this.getApi();
    return await api.getMilestone(args);
  }

  async createMilestone(args: CreateMilestoneArgs): Promise<GitHubMilestone> {
    const api = this.getApi();
    return await api.createMilestone(args);
  }

  async updateMilestone(args: UpdateMilestoneArgs): Promise<GitHubMilestone> {
    const api = this.getApi();
    return await api.updateMilestone(args);
  }

  async deleteMilestone(args: DeleteMilestoneArgs): Promise<void> {
    const api = this.getApi();
    return await api.deleteMilestone(args);
  }

  // ==========================================================================
  // Search Actions
  // ==========================================================================

  async searchIssues(args: SearchIssuesArgs): Promise<{ total_count: number; incomplete_results: boolean; items: GitHubIssue[] }> {
    const api = this.getApi();
    return await api.searchIssues(args);
  }

  async searchRepositories(args: SearchRepositoriesArgs): Promise<{ total_count: number; incomplete_results: boolean; items: GitHubRepository[] }> {
    const api = this.getApi();
    return await api.searchRepositories(args);
  }

  async searchCode(args: SearchCodeArgs): Promise<{ total_count: number; incomplete_results: boolean; items: any[] }> {
    const api = this.getApi();
    return await api.searchCode(args);
  }

  async searchCommits(args: SearchCommitsArgs): Promise<{ total_count: number; incomplete_results: boolean; items: GitHubCommit[] }> {
    const api = this.getApi();
    return await api.searchCommits(args);
  }

  async searchUsers(args: SearchUsersArgs): Promise<{ total_count: number; incomplete_results: boolean; items: GitHubUser[] }> {
    const api = this.getApi();
    return await api.searchUsers(args);
  }

  // ==========================================================================
  // User Actions
  // ==========================================================================

  async getCurrentUser(): Promise<GitHubUser> {
    const api = this.getApi();
    return await api.getCurrentUser({});
  }

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
} from "./types";
