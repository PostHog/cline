import { VSCodeButton, VSCodeCheckbox, VSCodeLink, VSCodeTextArea } from '@vscode/webview-ui-toolkit/react'
import { memo, useCallback, useEffect, useState } from 'react'
import { useExtensionState } from '../../context/ExtensionStateContext'
import { vscode } from '../../utils/vscode'
import ApiOptions from './ApiOptions'
import { TabButton } from '../mcp/McpView'
import { useEvent } from 'react-use'
import { ExtensionMessage } from '../../../../src/shared/ExtensionMessage'
import AutocompleteOptions from './AutocompleteOptions'
import AutoApproveMenu from './AutoApproveMenu'
import { getAsVar, VSC_TITLEBAR_INACTIVE_FOREGROUND } from '../../utils/vscStyles'
import PostHogConfigOptions from './PostHogConfigOptions'
import BrowserSettingsSection, { BrowserSettingsOptions } from './BrowserSettingsOptions'
const { IS_DEV } = process.env

type SettingsTab = 'privacy' | 'rules' | 'api' | 'general' | 'advanced'

const SettingsView = () => {
    const {
        apiConfiguration,
        version,
        customInstructions,
        setCustomInstructions,
        telemetrySetting,
        setTelemetrySetting,
        chatSettings,
    } = useExtensionState()
    const [apiErrorMessage, setApiErrorMessage] = useState<string | undefined>(undefined)
    const [modelIdErrorMessage, setModelIdErrorMessage] = useState<string | undefined>(undefined)
    const [pendingTabChange, setPendingTabChange] = useState<'ask' | 'plan' | 'act' | null>(null)
    const [activeTab, setActiveTab] = useState<SettingsTab>('general')
    const [hasLoadedPosthogProjects, setHasLoadedPosthogProjects] = useState(false)

    const handleSubmit = () => {
        vscode.postMessage({
            type: 'updateSettings',
            customInstructionsSetting: customInstructions,
            telemetrySetting,
            apiConfiguration: apiConfiguration,
        })
    }

    useEffect(() => {
        setApiErrorMessage(undefined)
        setModelIdErrorMessage(undefined)
    }, [apiConfiguration])

    useEffect(() => {
        if (!hasLoadedPosthogProjects) {
            vscode.postMessage({ type: 'loadPosthogProjects' })
            setHasLoadedPosthogProjects(true)
        }
    }, [hasLoadedPosthogProjects])

    // validate as soon as the component is mounted
    /*
    useEffect will use stale values of variables if they are not included in the dependency array. 
    so trying to use useEffect with a dependency array of only one value for example will use any 
    other variables' old values. In most cases you don't want this, and should opt to use react-use 
    hooks.
    
        // uses someVar and anotherVar
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [someVar])
    If we only want to run code once on mount we can use react-use's useEffectOnce or useMount
    */

    const handleMessage = useCallback(
        (event: MessageEvent) => {
            const message: ExtensionMessage = event.data
            switch (message.type) {
                case 'didUpdateSettings':
                    if (pendingTabChange) {
                        vscode.postMessage({
                            type: 'toggleChatMode',
                            chatMode: pendingTabChange,
                        })
                        setPendingTabChange(null)
                    }
                    break
            }
        },
        [pendingTabChange]
    )

    useEvent('message', handleMessage)

    const handleResetState = () => {
        vscode.postMessage({ type: 'resetState' })
    }

    const handleTabChange = (tab: 'ask' | 'plan' | 'act') => {
        if (tab === chatSettings?.mode) {
            return
        }
        setPendingTabChange(tab)
        handleSubmit()
    }

    const MenuButton = ({ tab, label }: { tab: SettingsTab; label: string }) => (
        <button
            onClick={() => setActiveTab(tab)}
            style={{
                justifyContent: 'flex-start',
                marginBottom: '4px',
                padding: '8px 16px',
                backgroundColor: activeTab === tab ? 'var(--vscode-button-background)' : 'transparent',
                color: activeTab === tab ? 'var(--vscode-button-foreground)' : 'var(--vscode-foreground)',
                border: 'none',
                borderRadius: '4px',
                cursor: 'pointer',
            }}
        >
            {label}
        </button>
    )

    const PrivacySettings = () => (
        <>
            <div style={{ marginBottom: 5 }}>
                <h3 style={{ color: 'var(--vscode-foreground)', margin: 0, marginBottom: '5px' }}>Telemetry</h3>
                <VSCodeCheckbox
                    style={{ marginBottom: '5px' }}
                    checked={telemetrySetting === 'enabled'}
                    onChange={(e: any) => {
                        const checked = e.target.checked === true
                        setTelemetrySetting(checked ? 'enabled' : 'disabled')
                    }}
                >
                    Allow anonymous error and usage reporting
                </VSCodeCheckbox>
                <p style={{ fontSize: '12px', marginTop: '5px', color: 'var(--vscode-descriptionForeground)' }}>
                    Help improve PostHog by sending anonymous usage data and error reports. No code, prompts, or
                    personal information are ever sent. See our{' '}
                    <VSCodeLink href="https://posthog.com/privacy" style={{ fontSize: 'inherit' }}>
                        privacy policy
                    </VSCodeLink>{' '}
                    for more details.
                </p>
            </div>
        </>
    )

    const RulesSettings = () => (
        <>
            <h3 style={{ color: 'var(--vscode-foreground)', margin: 0, marginBottom: '5px', marginTop: '5px' }}>
                Rules
            </h3>
            <div
                style={{
                    height: '0.5px',
                    background: getAsVar(VSC_TITLEBAR_INACTIVE_FOREGROUND),
                    marginBottom: '15px',
                    opacity: 0.2,
                }}
            />
            <div style={{ marginBottom: 5 }}>
                <VSCodeTextArea
                    value={customInstructions ?? ''}
                    style={{ width: '100%' }}
                    resize="vertical"
                    rows={4}
                    placeholder={
                        'e.g. "Run unit tests at the end", "Use TypeScript with async/await", "Speak in Spanish"'
                    }
                    onInput={(e: any) => setCustomInstructions(e.target?.value ?? '')}
                ></VSCodeTextArea>
                <p style={{ fontSize: '12px', marginTop: '5px', color: 'var(--vscode-descriptionForeground)' }}>
                    These instructions are added to the end of the system prompt sent with every request.
                </p>
            </div>
        </>
    )

    const ApiSettings = () => (
        <>
            <h3 style={{ color: 'var(--vscode-foreground)', margin: 0, marginBottom: '5px', marginTop: '5px' }}>
                Provider Configuration
            </h3>
            <div
                style={{
                    height: '0.5px',
                    background: getAsVar(VSC_TITLEBAR_INACTIVE_FOREGROUND),
                    marginBottom: '15px',
                    opacity: 0.2,
                }}
            />
            <div
                style={{
                    border: '1px solid var(--vscode-panel-border)',
                    borderRadius: '4px',
                    padding: '10px',
                    marginBottom: '20px',
                    background: 'var(--vscode-panel-background)',
                }}
            >
                <div
                    style={{
                        display: 'flex',
                        gap: '1px',
                        marginBottom: '10px',
                        marginTop: -8,
                        borderBottom: '1px solid var(--vscode-panel-border)',
                    }}
                >
                    <TabButton isActive={chatSettings?.mode === 'ask'} onClick={() => handleTabChange('ask')}>
                        Ask Mode
                    </TabButton>
                    <TabButton isActive={chatSettings?.mode === 'plan'} onClick={() => handleTabChange('plan')}>
                        Plan Mode
                    </TabButton>
                    <TabButton isActive={chatSettings?.mode === 'act'} onClick={() => handleTabChange('act')}>
                        Act Mode
                    </TabButton>
                </div>
                {chatSettings && (
                    <div style={{ marginBottom: -12 }}>
                        <ApiOptions
                            key={chatSettings.mode}
                            mode={chatSettings.mode}
                            modelIdErrorMessage={modelIdErrorMessage}
                        />
                    </div>
                )}
            </div>
        </>
    )

    const GeneralSettings = () => (
        <>
            <h3 style={{ color: 'var(--vscode-foreground)', margin: 0, marginBottom: '5px' }}>PostHog Configuration</h3>
            <div
                style={{
                    height: '0.5px',
                    background: getAsVar(VSC_TITLEBAR_INACTIVE_FOREGROUND),
                    marginBottom: '15px',
                    opacity: 0.2,
                }}
            />
            <PostHogConfigOptions />
            <h3 style={{ color: 'var(--vscode-foreground)', margin: 0, marginTop: '20px', marginBottom: '5px' }}>
                Auto-Approval
            </h3>
            <AutoApproveMenu />
            <h3 style={{ color: 'var(--vscode-foreground)', margin: 0, marginBottom: '5px', marginTop: '5px' }}>
                Auto-Complete
            </h3>
            <div
                style={{
                    height: '0.5px',
                    background: getAsVar(VSC_TITLEBAR_INACTIVE_FOREGROUND),
                    marginBottom: '15px',
                    opacity: 0.2,
                }}
            />
            <AutocompleteOptions />
            <BrowserSettingsOptions />
        </>
    )

    const AdvancedSettings = () => (
        <>
            <div style={{ marginTop: '10px', marginBottom: '4px' }}>Debug</div>
            <VSCodeButton onClick={handleResetState} style={{ marginTop: '5px', width: 'auto' }}>
                Reset State
            </VSCodeButton>
            <p style={{ fontSize: '12px', marginTop: '5px', color: 'var(--vscode-descriptionForeground)' }}>
                This will reset all global state and secret storage in the extension.
            </p>
        </>
    )

    return (
        <div
            style={{
                position: 'fixed',
                top: 0,
                left: 0,
                right: 0,
                bottom: 0,
                padding: '10px 0px 0px 0px',
                display: 'flex',
                flexDirection: 'column',
                overflow: 'hidden',
            }}
        >
            <div
                style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    marginBottom: '13px',
                    paddingRight: 17,
                    paddingLeft: 20,
                }}
            >
                <h3 style={{ color: 'var(--vscode-foreground)', margin: 0 }}>Settings</h3>
            </div>
            <div
                style={{
                    flexGrow: 1,
                    display: 'flex',
                    overflow: 'hidden',
                }}
            >
                {/* Left Menu */}
                <div
                    style={{
                        width: '200px',
                        padding: '0 10px',
                        borderRight: '1px solid var(--vscode-panel-border)',
                        display: 'flex',
                        flexDirection: 'column',
                    }}
                >
                    <MenuButton tab="general" label="General" />
                    <MenuButton tab="api" label="Provider" />
                    <MenuButton tab="rules" label="Rules" />
                    <MenuButton tab="privacy" label="Privacy" />
                    <MenuButton tab="advanced" label="Advanced" />
                </div>

                {/* Content Area */}
                <div
                    style={{
                        flexGrow: 1,
                        padding: '0 20px',
                        overflowY: 'auto',
                    }}
                >
                    {activeTab === 'rules' && <RulesSettings />}
                    {activeTab === 'api' && <ApiSettings />}
                    {activeTab === 'general' && <GeneralSettings />}
                    {activeTab === 'privacy' && <PrivacySettings />}
                    {activeTab === 'advanced' && IS_DEV && <AdvancedSettings />}

                    {/* Version info at the bottom */}
                    <div
                        style={{
                            textAlign: 'center',
                            color: 'var(--vscode-descriptionForeground)',
                            fontSize: '12px',
                            lineHeight: '1.2',
                            padding: '20px 8px 15px 0',
                            borderTop: '1px solid var(--vscode-panel-border)',
                            marginTop: '20px',
                        }}
                    >
                        <p style={{ wordWrap: 'break-word', margin: 0, padding: 0 }}>
                            If you have any questions or feedback, feel free to open an issue at{' '}
                            <VSCodeLink
                                href="https://github.com/PostHog/posthog-extension"
                                style={{ display: 'inline' }}
                            >
                                https://github.com/PostHog/posthog-extension
                            </VSCodeLink>
                        </p>
                        <p style={{ fontStyle: 'italic', margin: '10px 0 0 0', padding: 0 }}>v{version}</p>
                    </div>
                </div>
            </div>
        </div>
    )
}

export default memo(SettingsView)
