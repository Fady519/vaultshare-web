import { authHandlers } from './auth'
import { devHandlers } from './dev'
import { fileHandlers, storageHandlers } from './files'
import { invitationHandlers } from './invitations'
import { keyHandlers } from './keys'
import { meHandlers } from './me'
import { mfaHandlers } from './mfa'
import { vaultHandlers } from './vaults'

// one file per area of the API, same split as src/api
export const handlers = [
  ...authHandlers,
  ...keyHandlers,
  ...mfaHandlers,
  ...meHandlers,
  ...vaultHandlers,
  ...fileHandlers,
  ...storageHandlers,
  ...invitationHandlers,
  ...devHandlers,
]
