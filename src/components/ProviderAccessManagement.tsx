import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { handleApiError } from "@/lib/api";
import { AccessRole } from "@/types/api";
import {
  getProviderAccess,
  grantProviderAccess,
  updateProviderAccessRole,
  revokeProviderAccess,
  type ProviderAccessEntry,
} from "@/lib/server/access";
import { getOrganizationMembers, type OrganizationMemberInfo } from "@/lib/server/organizations";
import { Loader } from "@/components/Loader";
import {
  Users,
  Crown,
  User,
  UserPlus,
  Trash2,
  ChevronDown,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface ProviderAccessManagementProps {
  providerId: string;
  providerName: string;
  organizationId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function ProviderAccessManagement({
  providerId,
  providerName,
  organizationId,
  open,
  onOpenChange,
}: ProviderAccessManagementProps) {
  const queryClient = useQueryClient();
  const [showAddUserModal, setShowAddUserModal] = useState(false);
  const [selectedUserId, setSelectedUserId] = useState<string>("");
  const [selectedRole, setSelectedRole] = useState<AccessRole>(AccessRole.USER);
  const [addError, setAddError] = useState<string | null>(null);
  const [userToRemove, setUserToRemove] = useState<ProviderAccessEntry | null>(
    null
  );
  const [removeError, setRemoveError] = useState<string | null>(null);

  // Fetch provider access list
  const {
    data: accessData,
    isLoading: accessLoading,
    error: accessError,
  } = useQuery({
    queryKey: ["provider-access", providerId],
    queryFn: async () => {
      const data = await getProviderAccess({ data: { providerId } });
      return data.results || [];
    },
    enabled: open,
  });

  // Fetch organization members for the "add user" dropdown
  const { data: membersData, isLoading: membersLoading } = useQuery({
    queryKey: ["organization-members", organizationId],
    queryFn: async () => {
      const data = await getOrganizationMembers({ data: { organizationId } });
      return data.results;
    },
    enabled: open && showAddUserModal,
  });

  // Grant access mutation
  const grantAccessMutation = useMutation({
    mutationFn: async (data: { userId: string; role: AccessRole }) => {
      return grantProviderAccess({
        data: {
          providerId,
          userId: data.userId,
          role: data.role === AccessRole.OWNER ? 'OWNER' : 'USER',
        },
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["provider-access", providerId],
      });
      setShowAddUserModal(false);
      setSelectedUserId("");
      setSelectedRole(AccessRole.USER);
      setAddError(null);
    },
    onError: (error) => {
      setAddError(handleApiError(error));
    },
  });

  // Update role mutation
  const updateRoleMutation = useMutation({
    mutationFn: async (data: { userId: string; role: AccessRole }) => {
      return updateProviderAccessRole({
        data: {
          providerId,
          userId: data.userId,
          role: data.role === AccessRole.OWNER ? 'OWNER' : 'USER',
        },
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["provider-access", providerId],
      });
    },
  });

  // Revoke access mutation
  const revokeAccessMutation = useMutation({
    mutationFn: async (userId: string) => {
      return revokeProviderAccess({ data: { providerId, userId } });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["provider-access", providerId],
      });
      setUserToRemove(null);
      setRemoveError(null);
    },
    onError: (error) => {
      setRemoveError(handleApiError(error));
    },
  });

  const accessList: ProviderAccessEntry[] = accessData || [];
  const members: OrganizationMemberInfo[] = membersData || [];
  const errorMessage = accessError ? handleApiError(accessError) : null;

  // Filter out users who already have access
  const existingUserIds = new Set(accessList.map((a: ProviderAccessEntry) => a.userId));
  const availableMembers = members.filter(
    (m: OrganizationMemberInfo) => !existingUserIds.has(m.userId)
  );

  const handleGrantAccess = () => {
    if (!selectedUserId) {
      setAddError("Please select a user");
      return;
    }
    grantAccessMutation.mutate({ userId: selectedUserId, role: selectedRole });
  };

  const handleRevokeAccess = () => {
    if (userToRemove) {
      revokeAccessMutation.mutate(userToRemove.userId);
    }
  };

  const getRoleIcon = (role: string) => {
    switch (role) {
      case 'owner':
      case AccessRole.OWNER:
        return <Crown className="h-4 w-4 text-yellow-600 dark:text-yellow-400" />;
      case 'user':
      case AccessRole.USER:
        return <User className="h-4 w-4 text-muted-foreground" />;
      default:
        return <User className="h-4 w-4 text-muted-foreground" />;
    }
  };

  const getRoleColor = (role: string) => {
    switch (role) {
      case 'owner':
      case AccessRole.OWNER:
        return "text-yellow-700 bg-yellow-50 dark:bg-yellow-900/30 border-yellow-200 dark:border-yellow-800/50";
      case 'user':
      case AccessRole.USER:
        return "text-foreground bg-muted border-border";
      default:
        return "text-foreground bg-muted border-border";
    }
  };

  const getUserDisplayName = (entry: ProviderAccessEntry) => {
    if (entry.userFirstName && entry.userLastName) {
      return `${entry.userFirstName} ${entry.userLastName}`;
    }
    return entry.userEmail || "Unknown User";
  };

  const getUserInitials = (entry: ProviderAccessEntry) => {
    if (entry.userFirstName && entry.userLastName) {
      return `${entry.userFirstName[0]}${entry.userLastName[0]}`.toUpperCase();
    }
    if (entry.userEmail) {
      return entry.userEmail.substring(0, 2).toUpperCase();
    }
    return "??";
  };

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Users className="h-5 w-5" />
              Manage Access - {providerName}
            </DialogTitle>
            <DialogDescription>
              Control which users can access this provider.
            </DialogDescription>
          </DialogHeader>

          <Loader
            isLoading={accessLoading}
            loadingMessage="Loading access list..."
          >
            <div className="space-y-4 pt-2">
              {/* Header with Add User button */}
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">
                  {accessList.length} user{accessList.length !== 1 ? "s" : ""}{" "}
                  with access
                </span>
                <Button size="sm" onClick={() => setShowAddUserModal(true)}>
                  <UserPlus className="h-4 w-4 mr-2" />
                  Add User
                </Button>
              </div>

              {/* Error message */}
              {errorMessage && (
                <div className="bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800/50 text-red-700 dark:text-red-300 px-4 py-3 rounded-lg">
                  {errorMessage}
                </div>
              )}

              {/* Access list */}
              {accessList.length === 0 ? (
                <div className="text-center py-8">
                  <Users className="mx-auto h-12 w-12 text-muted-foreground" />
                  <h3 className="mt-2 text-sm font-medium text-foreground">
                    No users with access
                  </h3>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Add users to grant them access to this provider.
                  </p>
                </div>
              ) : (
                <div className="border border-border rounded-lg overflow-hidden">
                  <table className="min-w-full divide-y divide-border">
                    <thead className="bg-muted">
                      <tr>
                        <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                          User
                        </th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                          Role
                        </th>
                        <th className="px-4 py-3 text-right text-xs font-medium text-muted-foreground uppercase tracking-wider">
                          Actions
                        </th>
                      </tr>
                    </thead>
                    <tbody className="bg-card divide-y divide-border">
                      {accessList.map((entry) => (
                        <tr key={entry.id} className="hover:bg-muted/50">
                          <td className="px-4 py-3 whitespace-nowrap">
                            <div className="flex items-center">
                              <div className="flex-shrink-0 h-8 w-8">
                                <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center">
                                  <span className="text-xs font-medium text-primary">
                                    {getUserInitials(entry)}
                                  </span>
                                </div>
                              </div>
                              <div className="ml-3">
                                <div className="text-sm font-medium text-foreground">
                                  {getUserDisplayName(entry)}
                                </div>
                                {entry.userEmail &&
                                  entry.userFirstName &&
                                  entry.userLastName && (
                                    <div className="text-xs text-muted-foreground">
                                      {entry.userEmail}
                                    </div>
                                  )}
                              </div>
                            </div>
                          </td>
                          <td className="px-4 py-3 whitespace-nowrap">
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <button className="flex items-center space-x-2 hover:opacity-80 transition-opacity">
                                  {getRoleIcon(entry.role)}
                                  <span
                                    className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full border ${getRoleColor(entry.role)}`}
                                  >
                                    {entry.role}
                                  </span>
                                  <ChevronDown className="h-3 w-3 text-muted-foreground" />
                                </button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="start">
                                <DropdownMenuItem
                                  onClick={() =>
                                    updateRoleMutation.mutate({
                                      userId: entry.userId,
                                      role: AccessRole.OWNER,
                                    })
                                  }
                                  disabled={entry.role === 'OWNER'}
                                >
                                  <Crown className="h-4 w-4 mr-2 text-yellow-600" />
                                  Owner
                                </DropdownMenuItem>
                                <DropdownMenuItem
                                  onClick={() =>
                                    updateRoleMutation.mutate({
                                      userId: entry.userId,
                                      role: AccessRole.USER,
                                    })
                                  }
                                  disabled={entry.role === 'USER'}
                                >
                                  <User className="h-4 w-4 mr-2" />
                                  User
                                </DropdownMenuItem>
                              </DropdownMenuContent>
                            </DropdownMenu>
                          </td>
                          <td className="px-4 py-3 whitespace-nowrap text-right">
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => setUserToRemove(entry)}
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
              )}
            </div>
          </Loader>
        </DialogContent>
      </Dialog>

      {/* Add User Modal */}
      <Dialog open={showAddUserModal} onOpenChange={setShowAddUserModal}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add User Access</DialogTitle>
            <DialogDescription>
              Grant a user access to this provider.
            </DialogDescription>
          </DialogHeader>
          <Loader isLoading={membersLoading} loadingMessage="Loading users...">
            <div className="space-y-4 pt-4">
              <div>
                <label className="block text-sm font-medium mb-2">User</label>
                <Select value={selectedUserId} onValueChange={setSelectedUserId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select a user..." />
                  </SelectTrigger>
                  <SelectContent>
                    {availableMembers.length === 0 ? (
                      <SelectItem value="_none" disabled>
                        No users available
                      </SelectItem>
                    ) : (
                      availableMembers.map((member) => (
                        <SelectItem key={member.userId} value={member.userId}>
                          {member.user?.firstName && member.user?.lastName
                            ? `${member.user.firstName} ${member.user.lastName}`
                            : member.user?.email || member.userId}
                        </SelectItem>
                      ))
                    )}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <label className="block text-sm font-medium mb-2">Role</label>
                <Select
                  value={selectedRole}
                  onValueChange={(v) => setSelectedRole(v as AccessRole)}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={AccessRole.USER}>
                      <div className="flex items-center gap-2">
                        <User className="h-4 w-4" />
                        User - Can use the provider
                      </div>
                    </SelectItem>
                    <SelectItem value={AccessRole.OWNER}>
                      <div className="flex items-center gap-2">
                        <Crown className="h-4 w-4 text-yellow-600" />
                        Owner - Full control
                      </div>
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {addError && (
                <div className="text-sm text-red-600 dark:text-red-400">
                  {addError}
                </div>
              )}

              <div className="flex justify-end space-x-2">
                <Button
                  variant="outline"
                  onClick={() => {
                    setShowAddUserModal(false);
                    setSelectedUserId("");
                    setAddError(null);
                  }}
                >
                  Cancel
                </Button>
                <Button
                  onClick={handleGrantAccess}
                  disabled={grantAccessMutation.isPending || !selectedUserId}
                >
                  {grantAccessMutation.isPending ? "Adding..." : "Add User"}
                </Button>
              </div>
            </div>
          </Loader>
        </DialogContent>
      </Dialog>

      {/* Remove User Confirmation Modal */}
      <Dialog open={!!userToRemove} onOpenChange={() => setUserToRemove(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Remove Access</DialogTitle>
            <DialogDescription>
              Are you sure you want to remove access for{" "}
              <strong>
                {userToRemove
                  ? getUserDisplayName(userToRemove)
                  : "this user"}
              </strong>
              ?
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 pt-4">
            {removeError && (
              <div className="text-sm text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-950/30 p-3 rounded-lg">
                {removeError}
              </div>
            )}
            <div className="flex justify-end space-x-2">
              <Button
                variant="outline"
                onClick={() => {
                  setUserToRemove(null);
                  setRemoveError(null);
                }}
              >
                Cancel
              </Button>
              <Button
                variant="destructive"
                onClick={handleRevokeAccess}
                disabled={revokeAccessMutation.isPending}
              >
                {revokeAccessMutation.isPending ? "Removing..." : "Remove Access"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}



