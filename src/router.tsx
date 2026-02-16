import { createRouter as createTanStackRouter } from "@tanstack/react-router";
import { routeTree } from "./routeTree.gen";

// Create the router instance
export function createRouter() {
  return createTanStackRouter({
    routeTree,
    defaultPreload: false,
    defaultGcTime: 5,
    defaultPreloadGcTime: 5,
    defaultPreloadStaleTime: 5,
  });
}

// Export getRouter for TanStack Start
export function getRouter() {
  return createRouter();
}

// Create and export the router instance
export const router = createRouter();

// Register the router instance for type safety
declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}
