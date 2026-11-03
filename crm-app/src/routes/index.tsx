import { createBrowserRouter, Navigate } from 'react-router-dom'

import { AppLayout } from '@/components/layout/app-layout'
import { ContactsPage } from '@/features/contacts/contacts-page'
import { ImportContactsPage } from '@/features/contacts/import-contacts-page'
import { EditContactPage } from '@/features/contacts/edit-contact-page'
import { NewContactPage } from '@/features/contacts/new-contact-page'
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
            element: <RequirePermission permission="contacts:read" />,
            children: [
              {
                path: '/contacts',
                handle: { crumb: 'Contacts' },
                children: [
                  { index: true, element: <ContactsPage /> },
                  {
                    element: <RequirePermission permission="contacts:write" />,
                    children: [
                      {
                        path: 'new',
                        element: <NewContactPage />,
                        handle: { crumb: 'New contact' },
                      },
                      {
                        path: 'import',
                        element: <ImportContactsPage />,
                        handle: { crumb: 'Import' },
                      },
                      {
                        path: ':id/edit',
                        element: <EditContactPage />,
                        handle: { crumb: 'Edit contact' },
                      },
                    ],
                  },
                ],
              },
            ],
          },
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
