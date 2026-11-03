import { createBrowserRouter, Navigate } from 'react-router-dom'

import { ForgotPasswordPage } from '@/features/auth/forgot-password-page'
import { LoginPage } from '@/features/auth/login-page'
import { RegisterPage } from '@/features/auth/register-page'
import { ResetPasswordPage } from '@/features/auth/reset-password-page'
import { ComponentsPage } from './components-page'
import { DashboardPage } from './dashboard-page'
import { ProtectedRoute } from './protected-route'

export const routes = [
  { path: '/', element: <Navigate to="/dashboard" replace /> },
  { path: '/login', element: <LoginPage /> },
  { path: '/register', element: <RegisterPage /> },
  { path: '/forgot-password', element: <ForgotPasswordPage /> },
  { path: '/reset-password', element: <ResetPasswordPage /> },
  { path: '/components', element: <ComponentsPage /> },
  {
    element: <ProtectedRoute />,
    children: [{ path: '/dashboard', element: <DashboardPage /> }],
  },
]

export const router = createBrowserRouter(routes)
