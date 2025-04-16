import { VSCodeDropdown, VSCodeOption, VSCodeCheckbox } from '@vscode/webview-ui-toolkit/react'
import { Fragment, useCallback, useMemo, useState } from 'react'
import styled from 'styled-components'
import {
    anthropicDefaultModelId,
    anthropicModels,
    ApiConfiguration,
    ApiProvider,
    geminiDefaultModelId,
    geminiModels,
    getDefaultModelId,
    ModelInfo,
    openaiDefaultModelId,
    openaiModels,
} from '../../../../src/shared/api'
import { useExtensionState } from '../../context/ExtensionStateContext'
import ModelDescriptionMarkdown from './ModelDescriptionMarkdown'

interface ApiOptionsProps {
    modelIdErrorMessage?: string
    isPopup?: boolean
    mode: 'ask' | 'plan' | 'act'
}

const Container = styled.div`
    display: flex;
    flex-direction: column;
    gap: 10px;
`

export const DropdownContainer = styled.div<{ zIndex?: number }>`
    position: relative;
    z-index: ${(props) => props.zIndex || 4};

    // Force dropdowns to open downward
    & vscode-dropdown::part(listbox) {
        position: absolute !important;
        top: 100% !important;
        bottom: auto !important;
    }
`

declare module 'vscode' {
    interface LanguageModelChatSelector {
        vendor?: string
        family?: string
        version?: string
        id?: string
    }
}

const ApiOptions = ({ modelIdErrorMessage, isPopup, mode }: ApiOptionsProps) => {
    const { chatSettings, setChatSettings } = useExtensionState()
    const [isDescriptionExpanded, setIsDescriptionExpanded] = useState(false)

    const handleInputChange = useCallback(
        (field: keyof ApiConfiguration) => (event: any) => {
            if (!chatSettings) return

            const newValue = event.target.value
            const modeSettings = chatSettings[mode]

            if (field === 'apiProvider') {
                setChatSettings({
                    ...chatSettings,
                    [mode]: {
                        ...modeSettings,
                        apiProvider: newValue as ApiProvider,
                        apiModelId: getDefaultModelId(newValue),
                    },
                })
            } else {
                setChatSettings({
                    ...chatSettings,
                    [mode]: {
                        ...modeSettings,
                        [field]: newValue,
                    },
                })
            }
        },
        [chatSettings, mode]
    )

    const handleToggleChange = useCallback(
        (event: any) => {
            const isChecked = (event.target as HTMLInputElement).checked
            if (!chatSettings) {
                return
            }
            setChatSettings({
                ...chatSettings,
                [mode]: {
                    ...chatSettings[mode],
                    thinkingEnabled: isChecked,
                },
            })
        },
        [chatSettings, mode]
    )
    // Memoize the normalized configuration
    const { selectedProvider, selectedModelId, selectedModelInfo } = useMemo(() => {
        if (!chatSettings)
            return { selectedProvider: 'Loading...', selectedModelId: 'Loading...', selectedModelInfo: {} }
        const apiConfiguration = chatSettings[mode]
        return normalizeApiConfiguration(apiConfiguration)
    }, [chatSettings, mode])

    // Memoize the dropdown creation function
    const createDropdown = useCallback(
        (models: Record<string, ModelInfo>) => (
            <VSCodeDropdown
                id="model-id"
                value={selectedModelId}
                onChange={handleInputChange('apiModelId')}
                style={{ width: '100%' }}
            >
                <VSCodeOption value="">Select a model...</VSCodeOption>
                {Object.keys(models).map((modelId) => (
                    <VSCodeOption
                        key={modelId}
                        value={modelId}
                        style={{
                            whiteSpace: 'normal',
                            wordWrap: 'break-word',
                            maxWidth: '100%',
                        }}
                    >
                        {modelId}
                    </VSCodeOption>
                ))}
            </VSCodeDropdown>
        ),
        [selectedModelId, handleInputChange]
    )

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 5, marginBottom: isPopup ? -10 : 0 }}>
            <>
                <DropdownContainer className="dropdown-container">
                    <label htmlFor="api-provider">
                        <span style={{ fontWeight: 500 }}>API Provider</span>
                    </label>
                    <VSCodeDropdown
                        id="api-provider"
                        value={selectedProvider}
                        onChange={handleInputChange('apiProvider')}
                        style={{
                            minWidth: 130,
                            position: 'relative',
                        }}
                    >
                        <VSCodeOption value="anthropic">Anthropic</VSCodeOption>
                        <VSCodeOption value="openai">OpenAI</VSCodeOption>
                        <VSCodeOption value="gemini">Google Gemini</VSCodeOption>
                    </VSCodeDropdown>
                </DropdownContainer>
                <DropdownContainer zIndex={2} className="dropdown-container">
                    <label htmlFor="model-id">
                        <span style={{ fontWeight: 500 }}>Model</span>
                    </label>
                    {selectedProvider === 'anthropic' && createDropdown(anthropicModels)}
                    {selectedProvider === 'openai' && createDropdown(openaiModels)}
                    {selectedProvider === 'gemini' && createDropdown(geminiModels)}
                </DropdownContainer>

                {selectedProvider === 'anthropic' && selectedModelId === 'claude-3-7-sonnet-20250219' && (
                    <Container>
                        <VSCodeCheckbox checked={chatSettings?.[mode]?.thinkingEnabled} onChange={handleToggleChange}>
                            Enable extended thinking
                        </VSCodeCheckbox>
                    </Container>
                )}

                <ModelInfoView
                    modelInfo={selectedModelInfo}
                    isDescriptionExpanded={isDescriptionExpanded}
                    setIsDescriptionExpanded={setIsDescriptionExpanded}
                    isPopup={isPopup}
                />
            </>

            {modelIdErrorMessage && (
                <p
                    style={{
                        margin: '-10px 0 4px 0',
                        fontSize: 12,
                        color: 'var(--vscode-errorForeground)',
                    }}
                >
                    {modelIdErrorMessage}
                </p>
            )}
        </div>
    )
}

export const ModelInfoView = ({
    modelInfo,
    isDescriptionExpanded,
    setIsDescriptionExpanded,
    isPopup,
}: {
    modelInfo: ModelInfo
    isDescriptionExpanded: boolean
    setIsDescriptionExpanded: (isExpanded: boolean) => void
    isPopup?: boolean
}) => {
    const infoItems = [
        modelInfo.description && (
            <ModelDescriptionMarkdown
                key="description"
                markdown={modelInfo.description}
                isExpanded={isDescriptionExpanded}
                setIsExpanded={setIsDescriptionExpanded}
                isPopup={isPopup}
            />
        ),
        <ModelInfoSupportsItem
            key="supportsImages"
            isSupported={modelInfo.supportsImages ?? false}
            supportsLabel="Supports images"
            doesNotSupportLabel="Does not support images"
        />,
        <ModelInfoSupportsItem
            key="supportsComputerUse"
            isSupported={modelInfo.supportsComputerUse ?? false}
            supportsLabel="Supports computer use"
            doesNotSupportLabel="Does not support computer use"
        />,
    ].filter(Boolean)

    return (
        <p
            style={{
                fontSize: '12px',
                marginTop: '2px',
                color: 'var(--vscode-descriptionForeground)',
            }}
        >
            {infoItems.map((item, index) => (
                <Fragment key={index}>
                    {item}
                    {index < infoItems.length - 1 && <br />}
                </Fragment>
            ))}
        </p>
    )
}

const ModelInfoSupportsItem = ({
    isSupported,
    supportsLabel,
    doesNotSupportLabel,
}: {
    isSupported: boolean
    supportsLabel: string
    doesNotSupportLabel: string
}) => (
    <span
        style={{
            fontWeight: 500,
            color: isSupported ? 'var(--vscode-charts-green)' : 'var(--vscode-errorForeground)',
        }}
    >
        <i
            className={`codicon codicon-${isSupported ? 'check' : 'x'}`}
            style={{
                marginRight: 4,
                marginBottom: isSupported ? 1 : -1,
                fontSize: isSupported ? 11 : 13,
                fontWeight: 700,
                display: 'inline-block',
                verticalAlign: 'bottom',
            }}
        ></i>
        {isSupported ? supportsLabel : doesNotSupportLabel}
    </span>
)

export function normalizeApiConfiguration(apiConfiguration?: ApiConfiguration): {
    selectedProvider: ApiProvider
    selectedModelId: string
    selectedModelInfo: ModelInfo
} {
    const provider = apiConfiguration?.apiProvider || 'anthropic'
    const modelId = apiConfiguration?.apiModelId

    const getProviderData = (models: Record<string, ModelInfo>, defaultId: string) => {
        let selectedModelId: string
        let selectedModelInfo: ModelInfo
        if (modelId && modelId in models) {
            selectedModelId = modelId
            selectedModelInfo = models[modelId]
        } else {
            selectedModelId = defaultId
            selectedModelInfo = models[defaultId]
        }
        return {
            selectedProvider: provider,
            selectedModelId,
            selectedModelInfo,
        }
    }
    switch (provider) {
        case 'anthropic':
            return getProviderData(anthropicModels, anthropicDefaultModelId)
        case 'openai':
            return getProviderData(openaiModels, openaiDefaultModelId)
        case 'gemini':
            return getProviderData(geminiModels, geminiDefaultModelId)
        default:
            return getProviderData(anthropicModels, anthropicDefaultModelId)
    }
}

export default ApiOptions
