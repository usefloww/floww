import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api, handleApiError } from "@/lib/api";
import { OrganizationRole, OrganizationMember, OrganizationUser } from "@/types/api";
import {
  getOrganizationInvitations,
  sendOrganizationInvitation,
  revokeOrganizationInvitation,
  type InvitationInfo,
} from "@/lib/server/organizations";
import { Loader } from "@/components/Loader";
import { Users, Crown, Shield, User, Calendar, UserPlus, Trash2, Mail, Clock, X, ChevronDown, Lock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

interface OrganizationUserManagementProps {
  organizationId: string;
  isTeamPlan?: boolean;
}

export function OrganizationUserManagement({
  organizationId,
  isTeamPlan = false,
}: OrganizationUserManagementProps) {
  const queryClient = useQueryClient();
  const [showInviteModal, setShowInviteModal] = useState(false);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteError, setInviteError] = useState<string | null>(null);
  const [memberToRemove, setMemberToRemove] = useState<OrganizationMember | null>(null);
  const [removeError, setRemoveError] = useState<string | null>(null);

  // Fetch members
  const { data: membersData, isLoading: membersLoading, error: membersError } = useQuery({
    queryKey: ['organization-members', organizationId],
    queryFn: async () => {
      const data = await api.get<OrganizationMember[]>(`/organizations/${organizationId}/members`);
      return Array.isArray(data) ? data : [];
    },
  });

  // Fetch invitations using server function
  const { data: invitationsData, isLoading: invitationsLoading } = useQuery({
    queryKey: ['organization-invitations', organizationId],
    queryFn: async () => {
      const data = await getOrganizationInvitations({ data: { organizationId } });
      return Array.isArray(data) ? data : [];
    },
  });

  // Send invitation mutation using server function
  const sendInvitationMutation = useMutation({
    mutationFn: async (data: { email: string }) => {
      return sendOrganizationInvitation({ data: { organizationId, email: data.email } });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['organization-invitations', organizationId] });
      setShowInviteModal(false);
      setInviteEmail("");
      setInviteError(null);
    },
    onError: (error) => {
      setInviteError(handleApiError(error));
    },
  });

  // Revoke invitation mutation using server function
  const revokeInvitationMutation = useMutation({
    mutationFn: async (invitationId: string) => {
      return revokeOrganizationInvitation({ data: { organizationId, invitationId } });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['organization-invitations', organizationId] });
    },
  });

  // Update member role mutation
  const updateRoleMutation = useMutation({
    mutationFn: async ({ userId, role }: { userId: string; role: OrganizationRole }) => {
      return api.patch(`/organizations/${organizationId}/members/${userId}`, { role });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['organization-members', organizationId] });
    },
  });

  // Remove member mutation
  const removeMemberMutation = useMutation({
    mutationFn: async (userId: string) => {
      return api.delete(`/organizations/${organizationId}/members/${userId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['organization-members', organizationId] });
      setMemberToRemove(null);
      setRemoveError(null);
    },
    onError: (error) => {
      setRemoveError(handleApiError(error));
    },
  });

  const members = membersData || [];
  const invitations: InvitationInfo[] = invitationsData || [];
  const pendingInvitations = invitations.filter((inv: InvitationInfo) => inv.state === "pending");
  const errorMessage = membersError ? handleApiError(membersError) : null;

  const handleSendInvitation = () => {
    if (!inviteEmail.trim()) {
      setInviteError("Please enter an email address");
      return;
    }
    sendInvitationMutation.mutate({ email: inviteEmail.trim() });
  };

  const handleRemoveMember = () => {
    if (memberToRemove) {
      removeMemberMutation.mutate(memberToRemove.userId);
    }
  };

  const getRoleIcon = (role: OrganizationRole) => {
    switch (role) {
      case OrganizationRole.OWNER:
        return <Crown className="h-4 w-4 text-yellow-600 dark:text-yellow-400" />;
      case OrganizationRole.ADMIN:
        return <Shield className="h-4 w-4 text-blue-600 dark:text-blue-400" />;
      case OrganizationRole.MEMBER:
        return <User className="h-4 w-4 text-muted-foreground" />;
      default:
        return <User className="h-4 w-4 text-muted-foreground" />;
    }
  };

  const getRoleColor = (role: OrganizationRole) => {
    switch (role) {
      case OrganizationRole.OWNER:
        return "text-yellow-700 bg-yellow-50 dark:bg-yellow-900/30 border-yellow-200 dark:border-yellow-800/50";
      case OrganizationRole.ADMIN:
        return "text-blue-700 bg-blue-50 dark:bg-blue-900/30 border-blue-200 dark:border-blue-800/50";
      case OrganizationRole.MEMBER:
        return "text-foreground bg-muted border-border";
      default:
        return "text-foreground bg-muted border-border";
    }
  };

  const getUserInitials = (user: OrganizationUser) => {
    if (user.firstName && user.lastName) {
      return `${user.firstName[0]}${user.lastName[0]}`.toUpperCase();
    }
    if (user.firstName) {
      return user.firstName.substring(0, 2).toUpperCase();
    }
    if (user.lastName) {
      return user.lastName.substring(0, 2).toUpperCase();
    }
    if (user.email) {
      return user.email.substring(0, 2).toUpperCase();
    }
    return (user.workosUserId || user.id).substring(0, 2).toUpperCase();
  };

  const getEmailInitials = (email: string) => {
    return email.substring(0, 2).toUpperCase();
  };

  const isLoading = membersLoading || invitationsLoading;

  return (
    <Loader isLoading={isLoading} loadingMessage="Loading organization members...">
      <div className="bg-card border border-border rounded-lg p-6">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center space-x-2">
            <Users className="h-5 w-5 text-muted-foreground" />
            <h2 className="text-lg font-semibold">Organization Members</h2>
            <span className="bg-muted text-muted-foreground text-xs px-2 py-1 rounded">
              {members.length} member{members.length !== 1 ? 's' : ''}
            </span>
          </div>
          {isTeamPlan ? (
            <Button onClick={() => setShowInviteModal(true)} size="sm">
              <UserPlus className="h-4 w-4 mr-2" />
              Invite User
            </Button>
          ) : (
            <div className="flex items-center gap-2">
              <Button size="sm" disabled variant="outline">
                <Lock className="h-4 w-4 mr-2" />
                Invite User
              </Button>
              <span className="text-xs text-muted-foreground">Team plan required</span>
            </div>
          )}
        </div>

        {errorMessage && (
          <div className="bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800/50 text-red-700 dark:text-red-300 px-4 py-3 rounded-lg mb-4">
            {errorMessage}
          </div>
        )}

        {/* Pending Invitations */}
        {pendingInvitations.length > 0 && (
          <div className="mb-6">
            <h3 className="text-sm font-medium text-muted-foreground mb-3 flex items-center gap-2">
              <Mail className="h-4 w-4" />
              Pending Invitations ({pendingInvitations.length})
            </h3>
            <div className="space-y-2">
              {pendingInvitations.map((invitation) => (
                <div key={invitation.id} className="flex items-center justify-between bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800/50 rounded-lg px-4 py-3">
                  <div className="flex items-center space-x-3">
                    <div className="h-8 w-8 rounded-full bg-amber-100 dark:bg-amber-900/50 flex items-center justify-center">
                      <span className="text-xs font-medium text-amber-700 dark:text-amber-300">
                        {getEmailInitials(invitation.email)}
                      </span>
                    </div>
                    <div>
                      <div className="text-sm font-medium text-foreground">{invitation.email}</div>
                      <div className="text-xs text-muted-foreground flex items-center gap-1">
                        <Clock className="h-3 w-3" />
                        Expires {new Date(invitation.expiresAt).toLocaleDateString()}
                      </div>
                    </div>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => revokeInvitationMutation.mutate(invitation.id)}
                    disabled={revokeInvitationMutation.isPending}
                    className="text-red-600 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-950/30"
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              ))}
            </div>
          </div>
        )}

        {members.length === 0 ? (
          <div className="text-center py-8">
            <Users className="mx-auto h-12 w-12 text-muted-foreground" />
            <h3 className="mt-2 text-sm font-medium text-foreground">No members found</h3>
            <p className="mt-1 text-sm text-muted-foreground">
              This organization doesn't have any members yet.
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {/* Desktop table view */}
            <div className="hidden md:block">
              <div className="overflow-hidden border border-border rounded-lg">
                <table className="min-w-full divide-y divide-border">
                  <thead className="bg-muted">
                    <tr>
                      <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                        User
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                        Role
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                        Joined
                      </th>
                      <th className="px-6 py-3 text-right text-xs font-medium text-muted-foreground uppercase tracking-wider">
                        Actions
                      </th>
                    </tr>
                  </thead>
                  <tbody className="bg-card divide-y divide-border">
                    {members.map((member) => (
                      <tr key={member.id} className="hover:bg-muted">
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div className="flex items-center">
                            <div className="flex-shrink-0 h-8 w-8">
                              <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center">
                                <span className="text-xs font-medium text-primary">
                                  {getUserInitials(member.user)}
                                </span>
                              </div>
                            </div>
                            <div className="ml-4">
                              <div className="text-sm font-medium text-foreground">
                                {member.user.firstName && member.user.lastName
                                  ? `${member.user.firstName} ${member.user.lastName}`
                                  : member.user.email || member.user.workosUserId
                                }
                              </div>
                              <div className="text-sm text-muted-foreground">
                                {member.user.email && (member.user.firstName || member.user.lastName) && (
                                  <div>{member.user.email}</div>
                                )}
                              </div>
                            </div>
                          </div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <button className="flex items-center space-x-2 hover:opacity-80 transition-opacity">
                                {getRoleIcon(member.role)}
                                <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full border ${getRoleColor(member.role)}`}>
                                  {member.role}
                                </span>
                                <ChevronDown className="h-3 w-3 text-muted-foreground" />
                              </button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="start">
                              <DropdownMenuItem
                                onClick={() => updateRoleMutation.mutate({ userId: member.userId, role: OrganizationRole.OWNER })}
                                disabled={member.role === OrganizationRole.OWNER}
                              >
                                <Crown className="h-4 w-4 mr-2 text-yellow-600" />
                                Owner
                              </DropdownMenuItem>
                              <DropdownMenuItem
                                onClick={() => updateRoleMutation.mutate({ userId: member.userId, role: OrganizationRole.ADMIN })}
                                disabled={member.role === OrganizationRole.ADMIN}
                              >
                                <Shield className="h-4 w-4 mr-2 text-blue-600" />
                                Admin
                              </DropdownMenuItem>
                              <DropdownMenuItem
                                onClick={() => updateRoleMutation.mutate({ userId: member.userId, role: OrganizationRole.MEMBER })}
                                disabled={member.role === OrganizationRole.MEMBER}
                              >
                                <User className="h-4 w-4 mr-2" />
                                Member
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-muted-foreground">
                          <div className="flex items-center space-x-1">
                            <Calendar className="h-3 w-3" />
                            <span>{new Date(member.createdAt).toLocaleDateString()}</span>
                          </div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-right">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setMemberToRemove(member)}
                            className="text-red-600 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-950/30"
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Mobile card view */}
            <div className="md:hidden space-y-3">
              {members.map((member) => (
                <div key={member.id} className="bg-muted border border-border rounded-lg p-4">
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center space-x-3">
                      <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center">
                        <span className="text-xs font-medium text-primary">
                          {getUserInitials(member.user)}
                        </span>
                      </div>
                      <div>
                        <div className="font-medium text-foreground">
                          {member.user.firstName && member.user.lastName
                            ? `${member.user.firstName} ${member.user.lastName}`
                            : member.user.email || member.user.workosUserId
                          }
                        </div>
                        <div className="text-sm text-muted-foreground">
                          {member.user.email && (member.user.firstName || member.user.lastName) && (
                            <div>{member.user.email}</div>
                          )}
                        </div>
                      </div>
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setMemberToRemove(member)}
                      className="text-red-600 hover:text-red-700"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-2">
                      {getRoleIcon(member.role)}
                      <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full border ${getRoleColor(member.role)}`}>
                        {member.role}
                      </span>
                    </div>
                    <div className="flex items-center space-x-1 text-sm text-muted-foreground">
                      <Calendar className="h-3 w-3" />
                      <span>{new Date(member.createdAt).toLocaleDateString()}</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Invite User Modal */}
        <Dialog open={showInviteModal} onOpenChange={setShowInviteModal}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Invite User</DialogTitle>
              <DialogDescription>
                Send an invitation email to add a new member to this organization.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 pt-4">
              <div>
                <label htmlFor="invite-email" className="block text-sm font-medium mb-2">
                  Email Address
                </label>
                <Input
                  id="invite-email"
                  type="email"
                  placeholder="user@example.com"
                  value={inviteEmail}
                  onChange={(e) => {
                    setInviteEmail(e.target.value);
                    setInviteError(null);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      handleSendInvitation();
                    }
                  }}
                />
              </div>
              {inviteError && (
                <div className="text-sm text-red-600 dark:text-red-400">
                  {inviteError}
                </div>
              )}
              <div className="flex justify-end space-x-2">
                <Button variant="outline" onClick={() => setShowInviteModal(false)}>
                  Cancel
                </Button>
                <Button onClick={handleSendInvitation} disabled={sendInvitationMutation.isPending}>
                  {sendInvitationMutation.isPending ? "Sending..." : "Send Invitation"}
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>

        {/* Remove Member Confirmation Modal */}
        <Dialog open={!!memberToRemove} onOpenChange={() => setMemberToRemove(null)}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Remove Member</DialogTitle>
              <DialogDescription>
                Are you sure you want to remove{" "}
                <strong>
                  {memberToRemove?.user.firstName && memberToRemove?.user.lastName
                    ? `${memberToRemove.user.firstName} ${memberToRemove.user.lastName}`
                    : memberToRemove?.user.email || "this member"}
                </strong>{" "}
                from the organization?
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 pt-4">
              {removeError && (
                <div className="text-sm text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-950/30 p-3 rounded-lg">
                  {removeError}
                </div>
              )}
              <div className="flex justify-end space-x-2">
                <Button variant="outline" onClick={() => {
                  setMemberToRemove(null);
                  setRemoveError(null);
                }}>
                  Cancel
                </Button>
                <Button
                  variant="destructive"
                  onClick={handleRemoveMember}
                  disabled={removeMemberMutation.isPending}
                >
                  {removeMemberMutation.isPending ? "Removing..." : "Remove Member"}
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </Loader>
  );
}
