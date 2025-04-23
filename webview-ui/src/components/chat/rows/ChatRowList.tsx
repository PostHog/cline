import { useState, ReactNode } from 'react'

export type ChatRowListProps = {
    items: ReactNode[]
}

export const ChatRowList = ({ items }: ChatRowListProps) => (
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
                key={index}
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

export type CollapsibleListProps = {
    title: string
    items: ReactNode[]
    defaultOpen?: boolean
}

export const CollapsibleList = ({ title, items, defaultOpen = false }: CollapsibleListProps) => {
    const [open, setOpen] = useState(defaultOpen)

    const iconName = open ? 'codicon-chevron-down' : 'codicon-chevron-right'

    return (
        <div style={{ marginTop: '8px' }}>
            <button
                onClick={() => setOpen((o) => !o)}
                style={{
                    display: 'flex',
                    alignItems: 'center',
                    color: 'var(--vscode-sideBar-foreground)',
                    width: '100%',
                    padding: '8px 12px',
                    fontSize: '12px',
                    backgroundColor: 'var(--vscode-editor-background)',
                    border: '1px solid var(--vscode-widget-border)',
                    borderRadius: '6px',
                    cursor: 'pointer',
                    fontFamily: 'var(--vscode-editor-font-family)',
                }}
            >
                <span className={`codicon ${iconName}`} style={{ marginBottom: '-1.5px' }}></span>
                <span style={{ marginLeft: '8px' }}>{title}</span>
            </button>
            {open && <div style={{ marginTop: '4px' }}>{items}</div>}
        </div>
    )
}

export type CollapsibleEventListProps = {
    title: string
    events: string[]
    defaultOpen?: boolean
}

export const CollapsibleEventList = ({ title, events, defaultOpen = false }: CollapsibleEventListProps) => {
    const items = events.map((event, index) => (
        <div
            style={{
                color: 'var(--vscode-sideBar-foreground)',
                fontSize: '12px',
                fontFamily: 'var(--vscode-editor-font-family)',
                padding: '3px 6px',
            }}
            key={event + index}
        >
            <strong>{event}</strong>
        </div>
    ))
    return <CollapsibleList title={title} items={items} defaultOpen={defaultOpen} />
}

export type CollapsibleFileListProps = {
    title: string
    paths: string[]
    defaultOpen?: boolean
}

export const CollapsibleFileList = ({ title, paths, defaultOpen = false }: CollapsibleFileListProps) => {
    const items = paths.map((path, index) => {
        const filename = path.split('/').pop() || path
        const relPath = path.split('/').slice(0, -1).join('/')

        const truncatedRelPath = relPath.length > 45 ? '...' + relPath.slice(-45) : relPath
        return (
            <div
                key={path + index}
                style={{
                    display: 'flex',
                    flexDirection: 'row',
                    alignItems: 'center',
                    padding: '3px 6px',
                    gap: '6px',
                    marginBottom: index < paths.length - 1 ? '6px' : undefined,
                    backgroundColor: 'var(--vscode-sideBar-background)',
                    borderRadius: '4px',
                    fontSize: '12px',
                    fontFamily: 'var(--vscode-editor-font-family)',
                }}
            >
                <strong>{filename}</strong>
                <div style={{ fontSize: '10px', color: 'var(--vscode-descriptionForeground)' }}>{truncatedRelPath}</div>
            </div>
        )
    })

    return <CollapsibleList title={title} items={items} defaultOpen={defaultOpen} />
}
