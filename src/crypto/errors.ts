// GCM tag check failed: wrong key/password, or the bytes were changed
export class DecryptError extends Error {
  constructor(message = 'Decryption failed') {
    super(message)
    this.name = 'DecryptError'
  }
}
