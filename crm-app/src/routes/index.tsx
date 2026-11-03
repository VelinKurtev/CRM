import { createBrowserRouter, Navigate } from 'react-router-dom'

import { AppLayout } from '@/components/layout/app-layout'
import { UsersPage } from '@/features/admin/users-page'
import { ForgotPasswordPage } from '@/features/auth/forgot-password-page'
import { LoginPage } from '@/features/auth/login-page'
import { ProfilePage } from '@/features/profile/profile-page'
import { RegisterPage } from '@/features/auth/register-page'
import { ResetPasswordPage } from '@/features/auth/reset-password-page'
import { ComponentsPage } from './components-page'
import { DashboardPage } from './dashboard-page'
import { ProtectedRoute } from './protected-route'
import { RequirePermission } from './require-permission'

export const routes = [
  { path: '/', element: <Navigate to="/dashboard" replace /> },
  { path: '/login', element: <LoginPage /> },
  { path: '/register', element: <RegisterPage /> },
  { path: '/forgot-password', element: <ForgotPasswordPage /> },
  { path: '/reset-password', element: <ResetPasswordPage /> },
  { path: '/components', element: <ComponentsPage /> },
  {
    element: <ProtectedRoute />,
    children: [
      {
        element: <AppLayout />,
        children: [
          { path: '/dashboard', element: <DashboardPage />, handle: { crumb: 'Dashboard' } },
          { path: '/profile', element: <ProfilePage />, handle: { crumb: 'My profile' } },
          {
            element: <RequirePermission permission="users:manage" />,
            children: [
              {
                path: '/admin',
                handle: { crumb: 'Admin' },
                children: [
                  { index: true, element: <Navigate to="/admin/users" replace /> },
                  { path: 'users', element: <UsersPage />, handle: { crumb: 'Users & roles' } },
                ],
              },
            ],
          },
        ],
      },
    ],
  },
]

export const router = createBrowserRouter(routes)
