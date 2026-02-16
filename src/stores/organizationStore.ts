import { create } from "zustand";
import { persist, createJSONStorage } from 'zustand/middleware'
import { api } from "@/lib/api";
import { Organization } from "@/types/api";

interface OrganizationState {
  organizations: Organization[];
  currentOrganization: Organization | null;
  isLoading: boolean;
  error: string | null;

  // Actions
  setCurrentOrganization: (org: Organization | null) => void;
  fetchOrganizations: () => Promise<void>;
  createOrganization: (data: { displayName: string }) => Promise<Organization>;
  updateOrganization: (id: string, data: { displayName?: string }) => Promise<Organization>;
  deleteOrganization: (id: string) => Promise<void>;
}

export const useOrganizationStore = create<OrganizationState>()(
  persist(
    (set, get) => ({
      organizations: [],
      currentOrganization: null,
      isLoading: false,
      error: null,

      setCurrentOrganization: (org: Organization | null) => {
        set({ currentOrganization: org });
      },

      fetchOrganizations: async () => {
        try {
          set({ isLoading: true, error: null });
          const organizationsData = await api.get<Organization[]>('/organizations');
          const organizations = Array.isArray(organizationsData) ? organizationsData : [];

          // If no current organization is set, set the first one
          const current = get().currentOrganization;
          const newCurrent = current && organizations.find(org => org.id === current.id)
            ? current
            : organizations[0] || null;

          set({
            organizations,
            currentOrganization: newCurrent,
            isLoading: false
          });
        } catch (error) {
          set({
            error: error instanceof Error ? error.message : 'Failed to fetch organizations',
            organizations: [], // Ensure we always have an array
            isLoading: false
          });
        }
      },

      createOrganization: async (data) => {
        try {
          set({ isLoading: true, error: null });
          const newOrg = await api.post<Organization>('/organizations', data);

          const organizations = [...get().organizations, newOrg];
          set({
            organizations,
            isLoading: false
          });

          return newOrg;
        } catch (error) {
          set({
            error: error instanceof Error ? error.message : 'Failed to create organization',
            isLoading: false
          });
          throw error;
        }
      },

      updateOrganization: async (id, data) => {
        try {
          set({ isLoading: true, error: null });
          const updatedOrg = await api.patch<Organization>(`/organizations/${id}`, data);

          const organizations = get().organizations.map(org =>
            org.id === id ? updatedOrg : org
          );

          // Update current org if it's the one being updated
          const currentOrg = get().currentOrganization;
          const newCurrentOrg = currentOrg?.id === id ? updatedOrg : currentOrg;

          set({
            organizations,
            currentOrganization: newCurrentOrg,
            isLoading: false
          });

          return updatedOrg;
        } catch (error) {
          set({
            error: error instanceof Error ? error.message : 'Failed to update organization',
            isLoading: false
          });
          throw error;
        }
      },

      deleteOrganization: async (id) => {
        try {
          set({ isLoading: true, error: null });
          await api.delete(`/organizations/${id}`);

          const organizations = get().organizations.filter(org => org.id !== id);

          // If current org was deleted, switch to first available
          const currentOrg = get().currentOrganization;
          const newCurrentOrg = currentOrg?.id === id
            ? organizations[0] || null
            : currentOrg;

          set({
            organizations,
            currentOrganization: newCurrentOrg,
            isLoading: false
          });
        } catch (error) {
          set({
            error: error instanceof Error ? error.message : 'Failed to delete organization',
            isLoading: false
          });
          throw error;
        }
      },
    }),
    {
      name: "organization-storage",
      storage: createJSONStorage(() => localStorage),
      // Only persist current organization, not the full list
      partialize: (state) => ({
        currentOrganization: state.currentOrganization
      }),
    }
  )
);