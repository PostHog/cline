export interface PostHogProject {
    id: number
    uuid: string
    organization: string
    api_token: string
    name: string
    created_at?: string
    updated_at?: string
    timezone?: string
}
