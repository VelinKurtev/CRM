import { render, screen } from '@testing-library/react'

import App from './App'

describe('App', () => {
  it('sends unauthenticated visitors to the login page', async () => {
    render(<App />)
    expect(
      await screen.findByText('Enter your email and password to access the CRM.'),
    ).toBeInTheDocument()
  })
})
