import type { ComponentType } from 'react'
import { QueryClientProvider } from '@tanstack/react-query'
import { createBrowserRouter, Navigate, RouterProvider, type RouteObject } from 'react-router-dom'
import { queryClient } from '@/api/queryClient'
import { Toaster } from '@/components'
import { AppShell } from '@/layouts/AppShell/AppShell'
import { PublicLayout } from '@/layouts/PublicLayout/PublicLayout'
import RouteError from '@/features/errors/RouteError'
import { GuestOnly, RequireSession } from '@/features/auth/guards'

type PageModule = { default: ComponentType }

// every page is its own chunk, so the first load stays small
const page = (load: () => Promise<PageModule>) => async () => ({
  Component: (await load()).default,
})

const routes: RouteObject[] = [
  {
    errorElement: <RouteError />,
    children: [
      {
        element: <PublicLayout />,
        children: [{ index: true, lazy: page(() => import('@/features/auth/pages/LandingPage')) }],
      },

      // onboarding & auth (figma page 01)
      {
        element: <GuestOnly />,
        children: [
          { path: 'signup', lazy: page(() => import('@/features/auth/pages/SignUpPage')) },
          { path: 'signin', lazy: page(() => import('@/features/auth/pages/SignInPage')) },
        ],
      },
      { path: 'signin/2fa', lazy: page(() => import('@/features/auth/pages/TwoFactorPage')) },
      { path: 'verify-email', lazy: page(() => import('@/features/auth/pages/VerifyEmailPage')) },
      { path: 'invite/:token', lazy: page(() => import('@/features/auth/pages/AcceptInvitePage')) },
      { path: 'forgot', lazy: page(() => import('@/features/auth/pages/ForgotPasswordPage')) },
      { path: 'reset', lazy: page(() => import('@/features/auth/pages/ResetPasswordPage')) },

      // the account exists but has no keys yet
      {
        element: <RequireSession allow={['pendingKeys']} />,
        children: [
          { path: 'setup/keys', lazy: page(() => import('@/features/auth/pages/KeyCeremonyPage')) },
        ],
      },

      // keys exist, second factor not set up yet
      {
        element: <RequireSession allow={['pendingMfa']} />,
        children: [
          { path: 'setup/2fa', lazy: page(() => import('@/features/auth/pages/SecondFactorPage')) },
          {
            path: 'setup/2fa/app',
            lazy: page(() => import('@/features/auth/pages/AuthenticatorSetupPage')),
          },
          {
            path: 'setup/2fa/key',
            lazy: page(() => import('@/features/auth/pages/SecurityKeySetupPage')),
          },
          {
            path: 'setup/recovery-codes',
            lazy: page(() => import('@/features/auth/pages/RecoveryCodesPage')),
          },
        ],
      },

      // public secure link, the key is in the #fragment
      { path: 's/:token', lazy: page(() => import('@/features/sharing/pages/OpenLinkPage')) },

      {
        element: <RequireSession allow={['active']} />,
        children: [
          {
            element: <AppShell />,
            children: [
              // vault & files (figma page 02)
              {
                path: 'vaults',
                lazy: page(() => import('@/features/vault/pages/VaultsIndexPage')),
              },
              {
                path: 'vaults/new',
                lazy: page(() => import('@/features/vault/pages/NewVaultPage')),
              },
              {
                path: 'vaults/:vaultId',
                lazy: page(() => import('@/features/vault/pages/VaultPage')),
              },
              {
                path: 'files/:fileId',
                lazy: page(() => import('@/features/files/pages/FileDetailPage')),
              },
              {
                path: 'files/:fileId/versions',
                lazy: page(() => import('@/features/files/pages/VersionHistoryPage')),
              },
              {
                path: 'files/:fileId/preview',
                lazy: page(() => import('@/features/files/pages/FilePreviewPage')),
              },
              {
                path: 'favorites',
                lazy: page(() => import('@/features/vault/pages/FavoritesPage')),
              },
              { path: 'recent', lazy: page(() => import('@/features/vault/pages/RecentPage')) },
              { path: 'search', lazy: page(() => import('@/features/vault/pages/SearchPage')) },
              { path: 'trash', lazy: page(() => import('@/features/vault/pages/TrashPage')) },

              // sharing & permissions (figma page 03)
              {
                path: 'shared/with-me',
                lazy: page(() => import('@/features/sharing/pages/SharedWithMePage')),
              },
              {
                path: 'shared/by-me',
                lazy: page(() => import('@/features/sharing/pages/SharedByMePage')),
              },
              {
                path: 'vaults/:vaultId/members',
                lazy: page(() => import('@/features/sharing/pages/MembersPage')),
              },

              // settings & admin (figma page 04)
              { path: 'settings', element: <Navigate to="/settings/profile" replace /> },
              {
                path: 'settings/profile',
                lazy: page(() => import('@/features/settings/pages/ProfilePage')),
              },
              {
                path: 'settings/security',
                lazy: page(() => import('@/features/settings/pages/SecurityPage')),
              },
              {
                path: 'settings/sessions',
                lazy: page(() => import('@/features/settings/pages/SessionsPage')),
              },
              {
                path: 'settings/keys',
                lazy: page(() => import('@/features/settings/pages/KeysPage')),
              },
              {
                path: 'settings/notifications',
                lazy: page(() => import('@/features/settings/pages/NotificationSettingsPage')),
              },
              {
                path: 'settings/danger',
                lazy: page(() => import('@/features/settings/pages/DangerZonePage')),
              },
              {
                path: 'notifications',
                lazy: page(() => import('@/features/settings/pages/NotificationsPage')),
              },
              { path: 'team', lazy: page(() => import('@/features/admin/pages/TeamPage')) },
              { path: 'storage', lazy: page(() => import('@/features/admin/pages/StoragePage')) },
              { path: 'admin', lazy: page(() => import('@/features/admin/pages/AdminPage')) },
              { path: 'audit', lazy: page(() => import('@/features/admin/pages/AuditLogPage')) },
            ],
          },
        ],
      },

      ...(import.meta.env.DEV
        ? [{ path: 'dev/ui', lazy: page(() => import('@/features/dev/UiKitPage')) }]
        : []),

      { path: '*', lazy: page(() => import('@/features/errors/NotFoundPage')) },
    ],
  },
]

// opt in to the v7 behaviour now so upgrading later is a no-op
const router = createBrowserRouter(routes, {
  future: {
    v7_relativeSplatPath: true,
    v7_fetcherPersist: true,
    v7_normalizeFormMethod: true,
    v7_partialHydration: true,
    v7_skipActionErrorRevalidation: true,
  },
})

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} future={{ v7_startTransition: true }} />
      <Toaster />
    </QueryClientProvider>
  )
}
