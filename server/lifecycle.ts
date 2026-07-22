export async function closeResources(
  closeHttpServer: () => Promise<void>,
  closeDatabase: () => Promise<void>,
): Promise<void> {
  const errors: unknown[] = []

  try {
    await closeHttpServer()
  } catch (error) {
    errors.push(error)
  }

  try {
    await closeDatabase()
  } catch (error) {
    errors.push(error)
  }

  if (errors.length > 0) {
    const shutdownError = new Error('Resource shutdown failed')
    Object.assign(shutdownError, { errors })
    throw shutdownError
  }
}
