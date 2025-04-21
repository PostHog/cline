import { ApiConfiguration } from '~/shared/api'

export const getHost = (apiConfiguration: ApiConfiguration) => {
    if (process.env.IS_DEV) {
        return 'http://localhost:8010'
    }
    return apiConfiguration.posthogHost ?? 'https://us.posthog.com'
}
