import { create } from "zustand";
import { persist, createJSONStorage } from 'zustand/middleware'
import { api } from "@/lib/api";

export interface Namespace {
  id: string;
  organization: {
    id: string;
    displayName: string;
  };
}

interface NamespaceResponse {
  results: Namespace[];
  total: number;
}

interface NamespaceState {
  namespaces: Namespace[];
  currentNamespace: Namespace | null;
  isLoading: boolean;
  error: string | null;

  // Actions
  setCurrentNamespace: (namespace: Namespace | null) => void;
  fetchNamespaces: () => Promise<void>;
  createNamespace: (organizationData: { displayName: string }) => Promise<Namespace>;
}

export const useNamespaceStore = create<NamespaceState>()(
  persist(
    (set, get) => ({
      namespaces: [],
      currentNamespace: null,
      isLoading: false,
      error: null,

      setCurrentNamespace: (namespace: Namespace | null) => {
        set({ currentNamespace: namespace });
      },

      fetchNamespaces: async () => {
        try {
          set({ isLoading: true, error: null });
          const response = await api.get<NamespaceResponse>('/namespaces');
          const namespaces = response.results;

          // If current namespace exists, find the fresh version from the API response
          // Otherwise, default to the first available namespace
          const current = get().currentNamespace;
          const freshCurrent = current 
            ? namespaces.find(ns => ns.id === current.id) || namespaces[0] || null
            : namespaces[0] || null;

          set({
            namespaces,
            currentNamespace: freshCurrent,
            isLoading: false
          });
        } catch (error) {
          set({
            error: error instanceof Error ? error.message : 'Failed to fetch namespaces',
            isLoading: false
          });
        }
      },

      createNamespace: async (organizationData) => {
        try {
          set({ isLoading: true, error: null });

          // Create the organization (namespace will be created automatically)
          await api.post('/organizations', organizationData);

          // Refresh namespaces to get the automatically created namespace
          const response = await api.get<NamespaceResponse>('/namespaces');
          const namespaces = response.results;

          // Find the namespace for the newly created organization
          const newNamespace = namespaces.find(
            ns => ns.organization?.displayName === organizationData.displayName
          );

          // Update state with refreshed namespaces and select the new one
          set({
            namespaces,
            currentNamespace: newNamespace || namespaces[0] || null,
            isLoading: false
          });

          if (!newNamespace) {
            throw new Error('Namespace was not automatically created for the organization');
          }

          return newNamespace;
        } catch (error) {
          set({
            error: error instanceof Error ? error.message : 'Failed to create namespace',
            isLoading: false
          });
          throw error;
        }
      },
    }),
    {
      name: "namespace-storage",
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({
        currentNamespace: state.currentNamespace
      }),
    }
  )
);
