import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { config as loadDotEnv } from 'dotenv'
import { findWorkspaceRoot, getPackageRoot } from './path-utils.js'

let didLoadEnvironment = false

export function loadEnvironment(importMetaUrl: string) {
    if (didLoadEnvironment) {
        return
    }

    didLoadEnvironment = true

    const packageRoot = getPackageRoot(importMetaUrl)
    const workspaceRoot = findWorkspaceRoot(packageRoot)
    const candidatePaths = [join(packageRoot, '.env'), join(workspaceRoot, '.env')]

    for (const envPath of candidatePaths) {
        if (existsSync(envPath)) {
            loadDotEnv({ path: envPath })
            return
        }
    }

    loadDotEnv()
}
