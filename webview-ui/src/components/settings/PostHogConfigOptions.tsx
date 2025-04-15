import {
    VSCodeButton,
    VSCodeTextField,
    VSCodeRadioGroup,
    VSCodeRadio,
    VSCodeDropdown,
    VSCodeOption,
} from '@vscode/webview-ui-toolkit/react'
import { memo, useEffect, useState } from 'react'
import { useExtensionState } from '../../context/ExtensionStateContext'
import VSCodeButtonLink from '../common/VSCodeButtonLink'
import { vscode } from '../../utils/vscode'

const PostHogConfigOptions = () => {
    const { apiConfiguration, setApiConfiguration, posthogProjects } = useExtensionState()
    const [personalApiKey, setPersonalApiKey] = useState(apiConfiguration?.posthogApiKey)
    const [posthogProjectId, setPosthogProjectId] = useState(apiConfiguration?.posthogProjectId)
    const [cloud, setCloud] = useState<'us' | 'eu'>(
        apiConfiguration?.posthogHost === 'https://eu.posthog.com' ? 'eu' : 'us'
    )

    useEffect(() => {
        setPersonalApiKey(apiConfiguration?.posthogApiKey)
        setCloud(apiConfiguration?.posthogHost === 'https://eu.posthog.com' ? 'eu' : 'us')
    }, [apiConfiguration])

    const handleSubmit = () => {
        setApiConfiguration({
            ...apiConfiguration,
            posthogApiKey: personalApiKey,
            posthogHost: cloud === 'us' ? 'https://us.posthog.com' : 'https://eu.posthog.com',
        })
    }

    const handlePosthogProjectIdChange = (e: any) => {
        setPosthogProjectId(e.target.value)
        setApiConfiguration({
            ...apiConfiguration,
            posthogProjectId: e.target.value,
        })
    }

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 5, marginBottom: 0 }}>
            <div>
                <div style={{ display: 'flex', gap: 5 }}>
                    <VSCodeTextField
                        value={personalApiKey}
                        style={{ width: '100%' }}
                        type="password"
                        onInput={(e: any) => setPersonalApiKey(e.target?.value)}
                        placeholder="Enter PostHog personal API key..."
                    >
                        <span style={{ fontWeight: 500, marginBottom: 5 }}>PostHog personal API key</span>
                    </VSCodeTextField>
                    {personalApiKey && (
                        <VSCodeButton onClick={handleSubmit} style={{ marginTop: 17 }}>
                            Save
                        </VSCodeButton>
                    )}
                </div>
                <p
                    style={{
                        fontSize: '12px',
                        marginTop: 3,
                        color: 'var(--vscode-descriptionForeground)',
                    }}
                >
                    This key is stored locally and only used to make API requests from this extension.{' '}
                </p>

                <div style={{ display: 'flex', flexDirection: 'column', gap: 5, marginTop: 10 }}>
                    <span style={{ fontWeight: 500 }}>PostHog Cloud</span>
                    <VSCodeRadioGroup value={cloud} onChange={(e: any) => setCloud(e.target.value)}>
                        <VSCodeRadio value="us">US Cloud</VSCodeRadio>
                        <VSCodeRadio value="eu">EU Cloud</VSCodeRadio>
                    </VSCodeRadioGroup>
                </div>
                {personalApiKey && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 5, marginTop: 10 }}>
                        <span style={{ fontWeight: 500 }}>PostHog Project</span>
                        <VSCodeDropdown value={posthogProjectId} onChange={handlePosthogProjectIdChange}>
                            <VSCodeOption value="">Select a project...</VSCodeOption>
                            {posthogProjects.map((project) => (
                                <VSCodeOption key={project.id} value={project.id.toString()}>
                                    {project.name}
                                </VSCodeOption>
                            ))}
                        </VSCodeDropdown>
                    </div>
                )}
                {!personalApiKey && (
                    <VSCodeButtonLink
                        href="https://app.posthog.com/settings/user-api-keys?preset=editor"
                        style={{ marginTop: 10, width: '100%' }}
                    >
                        Create a PostHog personal API key
                    </VSCodeButtonLink>
                )}
            </div>
        </div>
    )
}

export default memo(PostHogConfigOptions)
