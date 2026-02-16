/// <reference types="vite/client" />
import {
  HeadContent,
  Outlet,
  Scripts,
  createRootRoute,
  redirect,
  useLocation,
} from '@tanstack/react-router'
import { TanStackRouterDevtools } from '@tanstack/react-router-devtools'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import appCss from '../styles/app.css?url'
import { NotificationContainer } from '@/components/NotificationToast'
import { Sidebar } from '@/components/Sidebar'
import { AuthProvider } from '@/components/AuthProvider'
import { getCurrentUser } from '@/lib/server/auth'
import { useTheme } from '@/hooks/useTheme'
import { initSentry } from '@/lib/sentry'
import { ErrorBoundary } from '@/components/ErrorBoundary'

// Initialize Sentry on the client side
initSentry();

// Create a client
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60, // 1 minute
      refetchOnWindowFocus: false,
    },
  },
})

export const Route = createRootRoute({
  head: () => ({
    links: [{ rel: 'stylesheet', href: appCss }],
  }),
  component: RootComponent,
    beforeLoad: async ({ location }) => {
    // Skip authentication for public endpoints
    const publicPaths = ['/health', '/auth/login', '/auth/callback', '/auth/logout', '/login', '/setup']
    if (publicPaths.some(path => location.pathname.startsWith(path))) {
      return {}
    }

    // Check authentication server-side before loading any route
    const user = await getCurrentUser()

    if (!user) {
      // Redirect to backend login page if not authenticated
      // Use the current pathname + searchStr (location.search is an object, not a string)
      const currentPath = location.pathname + (location.searchStr || '')
      const nextParam = encodeURIComponent(currentPath)
      throw redirect({
        href: `/auth/login?next=${nextParam}`,
      })
    }

    return { user }
  },
  errorComponent: () => {
    <>Something went wrong</>
  },
  notFoundComponent: () => {
    <>Not found</>
  }
})

function RootComponent() {
  useTheme();
  return <RootDocument />
}

const AUTH_PAGE_PATHS = ['/login', '/setup']

function RootDocument() {
  const location = useLocation()
  const isAuthPage = AUTH_PAGE_PATHS.some((path) => location.pathname === path)

  return (
    <html suppressHydrationWarning>
      <head>
        <HeadContent />
      </head>

      <body className="h-screen overflow-hidden">
        <ErrorBoundary>
          <QueryClientProvider client={queryClient}>
            <AuthProvider>
              <div className="h-screen">
                {isAuthPage ? (
                  <div className="h-screen flex flex-col items-center justify-center bg-background">
                    <Outlet />
                    <NotificationContainer />
                    <TanStackRouterDevtools />
                  </div>
                ) : (
                  <>
                    <div className="flex h-full">
                      <Sidebar />
                      <main className="flex-1 overflow-auto">
                        <div className="p-8">
                          <Outlet />
                        </div>
                      </main>
                    </div>
                    <NotificationContainer />
                    <TanStackRouterDevtools />
                  </>
                )}
              </div>
            </AuthProvider>
          </QueryClientProvider>
        </ErrorBoundary>
        <Scripts />
      </body>
    </html>
  )
}


