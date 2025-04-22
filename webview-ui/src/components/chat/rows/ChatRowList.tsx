type ChatRowListProps = {
    items: React.ReactNode[]
}

const ChatRowList = ({ items }: ChatRowListProps) => {
    return (
        <div
            style={{
                marginTop: '8px',
                padding: '12px',
                backgroundColor: 'var(--vscode-editor-background)',
                borderRadius: '6px',
                border: '1px solid var(--vscode-widget-border)',
            }}
        >
            {items.map((item, index) => (
                <div
                    style={{
                        padding: '6px 10px',
                        marginBottom: index < items.length - 1 ? '6px' : undefined,
                        backgroundColor: 'var(--vscode-sideBar-background)',
                        borderRadius: '4px',
                        fontSize: '12px',
                        fontFamily: 'var(--vscode-editor-font-family)',
                        display: 'flex',
                        alignItems: 'center',
                    }}
                >
                    {item}
                </div>
            ))}
        </div>
    )
}

export default ChatRowList
