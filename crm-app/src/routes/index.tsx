import { createBrowserRouter, Navigate } from 'react-router-dom'

import { AppLayout } from '@/components/layout/app-layout'
import { CompaniesPage } from '@/features/companies/companies-page'
import { CompanyDetailPage } from '@/features/companies/company-detail-page'
import { EditCompanyPage } from '@/features/companies/edit-company-page'
import { NewCompanyPage } from '@/features/companies/new-company-page'
import { DealsPage } from '@/features/deals/deals-page'
import { EditDealPage } from '@/features/deals/edit-deal-page'
import { NewDealPage } from '@/features/deals/new-deal-page'
import { EditLeadPage } from '@/features/leads/edit-lead-page'
import { LeadsPage } from '@/features/leads/leads-page'
import { NewLeadPage } from '@/features/leads/new-lead-page'
import { ContactsPage } from '@/features/contacts/contacts-page'
import { ContactDetailPage } from '@/features/contacts/contact-detail-page'
import { ImportContactsPage } from '@/features/contacts/import-contacts-page'
import { EditContactPage } from '@/features/contacts/edit-contact-page'
import { NewContactPage } from '@/features/contacts/new-contact-page'
import { TagsPage } from '@/features/tags/tags-page'
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
                    path: ':id',
                    element: <ContactDetailPage />,
                    handle: { crumb: 'Contact' },
                  },
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
            element: <RequirePermission permission="companies:read" />,
            children: [
              {
                path: '/companies',
                handle: { crumb: 'Companies' },
                children: [
                  { index: true, element: <CompaniesPage /> },
                  {
                    path: ':id',
                    element: <CompanyDetailPage />,
                    handle: { crumb: 'Company' },
                  },
                  {
                    element: <RequirePermission permission="companies:write" />,
                    children: [
                      {
                        path: 'new',
                        element: <NewCompanyPage />,
                        handle: { crumb: 'New company' },
                      },
                      {
                        path: ':id/edit',
                        element: <EditCompanyPage />,
                        handle: { crumb: 'Edit company' },
                      },
                    ],
                  },
                ],
              },
            ],
          },
          {
            element: <RequirePermission permission="deals:read" />,
            children: [
              {
                path: '/deals',
                handle: { crumb: 'Deals' },
                children: [
                  { index: true, element: <DealsPage /> },
                  {
                    element: <RequirePermission permission="deals:write" />,
                    children: [
                      { path: 'new', element: <NewDealPage />, handle: { crumb: 'New deal' } },
                      {
                        path: ':id/edit',
                        element: <EditDealPage />,
                        handle: { crumb: 'Edit deal' },
                      },
                    ],
                  },
                ],
              },
            ],
          },
          {
            element: <RequirePermission permission="leads:read" />,
            children: [
              {
                path: '/leads',
                handle: { crumb: 'Leads' },
                children: [
                  { index: true, element: <LeadsPage /> },
                  {
                    element: <RequirePermission permission="leads:write" />,
                    children: [
                      { path: 'new', element: <NewLeadPage />, handle: { crumb: 'New lead' } },
                      {
                        path: ':id/edit',
                        element: <EditLeadPage />,
                        handle: { crumb: 'Edit lead' },
                      },
                    ],
                  },
                ],
              },
            ],
          },
          {
            element: <RequirePermission permission="tags:manage" />,
            children: [{ path: '/tags', element: <TagsPage />, handle: { crumb: 'Tags' } }],
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
