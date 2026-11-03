import { useNavigate } from 'react-router-dom'
import { toast } from 'sonner'

import { createContact } from '@/services/contacts'
import { ContactForm } from './contact-form'
import { emptyContact, toNewContact } from './schemas'

export function NewContactPage() {
  const navigate = useNavigate()

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <div>
        <h1 className="text-2xl font-semibold">New contact</h1>
        <p className="text-muted-foreground">Fields marked optional can be filled in later.</p>
      </div>
      <ContactForm
        defaultValues={emptyContact}
        showNote
        submitLabel="Create contact"
        save={(values) => createContact(toNewContact(values))}
        onSaved={(contact) => {
          toast.success(`${contact.firstName} ${contact.lastName} was added to your contacts`, {
            action: { label: 'Edit', onClick: () => navigate(`/contacts/${contact.id}/edit`) },
          })
          navigate('/dashboard')
        }}
        onCancel={() => navigate(-1)}
      />
    </div>
  )
}
