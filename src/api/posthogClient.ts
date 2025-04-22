import axios, { AxiosError, AxiosInstance } from 'axios'
import * as vscode from 'vscode'

import { PostHogProject } from './types'

export class PostHogClient {
    private api!: AxiosInstance // Using definite assignment assertion
    private apiKey?: string // Use definite assignment assertion
    private apiHost?: string

    constructor(apiHost?: string, apiKey?: string) {
        this.apiKey = apiKey
        this.apiHost = apiHost
        this.initializeApi()
    }

    /**
     * Initialize the API instance with the current configuration
     */
    private initializeApi() {
        this.api = axios.create({
            baseURL: this.apiHost,
            headers: {
                Authorization: `Bearer ${this.apiKey}`,
                'Content-Type': 'application/json',
            },
        })

        // Add response interceptor for debugging
        this.api.interceptors.response.use(
            (response) => response,
            (error: Error | AxiosError) => {
                if (axios.isAxiosError(error)) {
                    console.error('API Error:', error.response?.data || error.message)
                } else {
                    console.error('API Error:', error.message)
                }
                return Promise.reject(error)
            }
        )
    }

    /**
     * List all projects
     */
    async listProjects(): Promise<PostHogProject[]> {
        if (!this.apiKey) {
            throw new Error('No API key provided')
        }
        try {
            // Include personal_api_key in the query string as an alternative authentication method
            const response = await this.api.get('/api/organizations/@current/projects/')
            return response.data.results
        } catch (error) {
            this.handleApiError(error, 'Failed to fetch projects')
            return []
        }
    }

    /**
     * Handle API errors
     */
    private handleApiError(error: unknown, message: string): void {
        console.error(error)

        // Extract the error message if available
        let errorDetail = message
        let errorType = 'unknown_error'
        let errorCode = 'unknown_code'
        let statusCode = 0

        if (axios.isAxiosError(error)) {
            errorDetail = error.response?.data?.detail || error.message || message
            errorType = error.response?.data?.type || 'unknown_error'
            errorCode = error.response?.data?.code || 'unknown_code'
            statusCode = error.response?.status || 0
        } else if (error instanceof Error) {
            errorDetail = error.message
        }

        if (statusCode === 401) {
            vscode.window.showErrorMessage(
                `Authentication error: Please check your PostHog API key (${errorDetail}). Make sure you're using a personal API key with proper scopes.`
            )
        } else {
            vscode.window.showErrorMessage(`${message}: ${errorDetail} (Type: ${errorType}, Code: ${errorCode})`)
        }
    }
}
