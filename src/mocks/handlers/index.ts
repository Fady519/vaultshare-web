import { meHandlers } from './me'
import { vaultHandlers } from './vaults'

// one file per area of the API, same split as src/api
export const handlers = [...meHandlers, ...vaultHandlers]
