import { existsSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const WORKSPACE_MARKERS = ['pnpm-workspace.yaml', '.git']

export function getPackageRoot(importMetaUrl: string) {
    return resolve(dirname(fileURLToPath(importMetaUrl)), '../..')
}

export function findWorkspaceRoot(startDirectory: string) {
    let currentDirectory = resolve(startDirectory)

    while (true) {
        const hasWorkspaceMarker = WORKSPACE_MARKERS.some((marker) => existsSync(join(currentDirectory, marker)))

        if (hasWorkspaceMarker) {
            return currentDirectory
        }

        const parentDirectory = dirname(currentDirectory)

        if (parentDirectory === currentDirectory) {
            return startDirectory
        }

        currentDirectory = parentDirectory
    }
}
