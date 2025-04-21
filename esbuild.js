const esbuild = require('esbuild')
const fs = require('fs')
const path = require('path')

const production = process.argv.includes('--production')
const test = process.argv.includes('--test')
const watch = process.argv.includes('--watch')

/**
 * @type {import('esbuild').Plugin}
 */
const esbuildProblemMatcherPlugin = {
    name: 'esbuild-problem-matcher',

    setup(build) {
        build.onStart(() => {
            console.log('[watch] build started')
        })
        build.onEnd((result) => {
            result.errors.forEach(({ text, location }) => {
                console.error(`✘ [ERROR] ${text}`)
                console.error(`    ${location.file}:${location.line}:${location.column}:`)
            })
            console.log('[watch] build finished')
        })
    },
}

/**
 * @type {import('esbuild').Plugin}
 */
const copyNativeModules = {
    name: 'copy-native-modules',
    setup(build) {
        build.onEnd(() => {
            const distDir = path.join(__dirname, build.initialOptions.outdir || 'dist')
            const nodeModulesDir = path.join(__dirname, 'node_modules')
            // Copy SQLite3 binary
            const sourcePath = 'node_modules/sqlite3/build/Release/node_sqlite3.node'
            const targetDir = path.join(distDir, 'build', 'Release')
            const targetPath = path.join(targetDir, 'node_sqlite3.node')
            // There needs to be a dummy package.json so that sqlite3 bindings are properly resolved - apparently
            fs.writeFileSync(path.join(distDir, 'package.json'), JSON.stringify({ name: 'posthog-dummy' }, null, 2))
            fs.mkdirSync(targetDir, { recursive: true })
            fs.copyFileSync(sourcePath, targetPath)
        })
    },
}

/**
 * @type {import('esbuild').Plugin}
 */
const copyWasmFiles = {
    name: 'copy-wasm-files',
    setup(build) {
        build.onEnd(() => {
            const distDir = path.join(__dirname, build.initialOptions.outdir || 'dist')

            // tree sitter
            const sourceDir = path.join(__dirname, 'node_modules', 'web-tree-sitter')

            // Copy tree-sitter.wasm
            fs.copyFileSync(path.join(sourceDir, 'tree-sitter.wasm'), path.join(distDir, 'tree-sitter.wasm'))

            // Copy language-specific WASM files
            const languageWasmDir = path.join(__dirname, 'node_modules', 'tree-sitter-wasms', 'out')
            const languages = [
                'typescript',
                'tsx',
                'python',
                'rust',
                'javascript',
                'go',
                'cpp',
                'c',
                'c_sharp',
                'ruby',
                'java',
                'php',
                'swift',
                'kotlin',
            ]

            languages.forEach((lang) => {
                const filename = `tree-sitter-${lang}.wasm`
                fs.copyFileSync(path.join(languageWasmDir, filename), path.join(distDir, filename))
            })
        })
    },
}

/**
 * @type {import('esbuild').BuildOptions}
 */
const sharedConfig = {
    bundle: true,
    minify: production,
    sourcemap: !production,
    plugins: [copyWasmFiles, copyNativeModules, esbuildProblemMatcherPlugin],
    format: 'cjs',
    platform: 'node',
    external: ['vscode'],
    target: 'node16',
}

/**
 * @type {import('esbuild').BuildOptions}
 */
const extensionConfig = {
    ...sharedConfig,
    logLevel: 'silent',
    entryPoints: ['src/extension.ts'],
    sourcesContent: false,
    outfile: 'dist/extension.js',
    mainFields: ['main', 'module'],
}

/**
 * @type {import('esbuild').BuildOptions}
 */
const testConfig = {
    ...sharedConfig,
    entryPoints: ['src/**/*.test.ts'],
    outdir: 'out',
    external: [...sharedConfig.external, 'mocha', 'should', 'chai', 'sinon'],
    tsconfig: 'tsconfig.test.json',
}

async function main() {
    const config = test ? testConfig : extensionConfig
    const extensionCtx = await esbuild.context(config)
    if (watch) {
        await extensionCtx.watch()
    } else {
        await extensionCtx.rebuild()
        await extensionCtx.dispose()
    }
}

main().catch((e) => {
    console.error(e)
    process.exit(1)
})
