import { create } from 'zustand';

export interface ActionData {
  type: string;
  formData: any;
  summary?: string;
  environmentId: string;
  customerId: string;
  customerName: string;
  environmentName: string;
}

interface ActionStore {
  currentAction: ActionData | null;
  setAction: (action: ActionData) => void;
  clearAction: () => void;
}

export const useActionStore = create<ActionStore>((set) => ({
  currentAction: null,
  setAction: (action) => set({ currentAction: action }),
  clearAction: () => set({ currentAction: null }),
}));
