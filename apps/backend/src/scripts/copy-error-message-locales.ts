import { cp, mkdir } from 'fs/promises'
import { dirname, resolve } from 'path'
import { fileURLToPath } from 'url'

export async function copyErrorMessageLocales(sourceDir: string, destinationDir: string) {
  await mkdir(destinationDir, { recursive: true })
  await cp(sourceDir, destinationDir, { recursive: true })
}

const isDirectRun = process.argv[1] === fileURLToPath(import.meta.url)

if (isDirectRun) {
  const currentDir = dirname(fileURLToPath(import.meta.url))
  const sourceDir = resolve(currentDir, '../services/error-messages/locales')
  const destinationDir = resolve(currentDir, '../../dist/services/error-messages/locales')

  copyErrorMessageLocales(sourceDir, destinationDir).catch((error) => {
    console.error('Failed to copy error message locales:', error)
    process.exit(1)
  })
}
