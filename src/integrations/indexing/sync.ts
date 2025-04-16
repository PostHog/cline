import * as vscode from 'vscode'
import { Logger } from '../../services/logging/Logger'
import { CodebaseTag } from './codebase-tag'

export interface Codebase {
    id: string
    user: number
    team: number
}

export class CodebaseSyncIntegration {
    private context: vscode.ExtensionContext
    private projectId: number
    private apiKey?: string
    private apiBase: string
    private codebaseId: string | null
    private codebaseTag: CodebaseTag

    initialized: boolean = false

    constructor(context: vscode.ExtensionContext, projectId: number, host?: string, apiKey?: string) {
        this.context = context
        this.projectId = projectId
        this.codebaseId = null
        this.apiKey = apiKey
        this.apiBase = process.env.IS_DEV ? 'http://localhost:8010' : `https://${host || 'us.posthog.com'}`
        this.codebaseTag = new CodebaseTag()
    }

    async init() {
        try {
            let codebaseId = await this.context.workspaceState.get<string>('codebase_id')
            if (!codebaseId) {
                codebaseId = await this.createCodebase()
                await this.context.workspaceState.update('codebase_id', codebaseId)
            }
            this.codebaseId = codebaseId
            this.initialized = true
        } catch (e) {
            Logger.log(`Failed to initialize the CodebaseSync: ${e}.`)
        }
    }

    async sync() {
        if (!this.codebaseId) {
            throw new Error('Codebase ID is required.')
        }
    }

    private async createCodebase(): Promise<string> {
        const url = new URL(`/api/v1/projects/${this.projectId}/codebases`, this.apiBase)
        const response = await fetch(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${this.apiKey}`,
            },
        })
        const data = (await response.json()) as Codebase
        return data.id
    }

    private get codebaseTags() {
        this.codebaseTag.getBranch()
    }
}
