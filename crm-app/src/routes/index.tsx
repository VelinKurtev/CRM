import { createBrowserRouter } from 'react-router-dom'

import { ComponentsPage } from './components-page'
import { HomePage } from './home-page'

export const router = createBrowserRouter([
  { path: '/', element: <HomePage /> },
  { path: '/components', element: <ComponentsPage /> },
])
