import { authHandlers } from './auth'
import { devHandlers } from './dev'
import { fileActionHandlers } from './fileActions'
import { fileHandlers, storageHandlers } from './files'
import { invitationHandlers } from './invitations'
import { keyHandlers } from './keys'
import { libraryHandlers } from './library'
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
  // before fileHandlers: /files/favorites must not match /files/:fileId
  ...libraryHandlers,
  ...fileHandlers,
  ...fileActionHandlers,
  ...storageHandlers,
  ...invitationHandlers,
  ...devHandlers,
]
