import { useNavigate } from 'react-router-dom'
import { useCrumbs } from '@/hooks/useCrumbs'
import { CreateVaultModal } from '../components/CreateVaultModal'

// /vaults/new is just the create dialog; closing it goes back to where you were
export default function NewVaultPage() {
  const navigate = useNavigate()
  useCrumbs({ label: 'Vaults', to: '/vaults' }, 'New vault')

  return (
    <CreateVaultModal
      open
      onClose={() => (window.history.length > 1 ? navigate(-1) : navigate('/vaults'))}
      onCreated={(vault) => navigate(`/vaults/${vault.id}`, { replace: true })}
    />
  )
}
