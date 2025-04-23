import ignore from 'ignore'

export const GIT_DISABLED_SUFFIX = '_disabled'

/**
 * Pattern Management:
 * - Extensible category-based pattern system
 * - Comprehensive file type coverage
 * - Easy pattern updates and maintenance
 */

/**
 * Returns the default list of file and directory patterns to exclude from checkpoints.
 * Combines built-in patterns with workspace-specific LFS patterns.
 *
 * @param lfsPatterns - Optional array of Git LFS patterns from workspace
 * @returns Array of glob patterns to exclude
 * @todo Make this configurable by the user
 */
export const getDefaultExclusions = (lfsPatterns: string[] = []): string[] => [
    // Build and Development Artifacts
    '.git/',
    `.git${GIT_DISABLED_SUFFIX}/`,
    ...getBuildArtifactPatterns(),

    // Media Files
    ...getMediaFilePatterns(),

    // Cache and Temporary Files
    ...getCacheFilePatterns(),

    // Environment and Config Files
    ...getConfigFilePatterns(),

    // Git Ignore Files
    ...getGitIgnorePatterns(),

    // Large Data Files
    ...getLargeDataFilePatterns(),

    // Database Files
    ...getDatabaseFilePatterns(),

    // Geospatial Datasets
    ...getGeospatialPatterns(),

    // Log Files
    ...getLogFilePatterns(),

    // Miscellaneous Files
    ...getMiscellaneousPatterns(),

    ...lfsPatterns,
]

export const ignoreDirsAndFiles = ignore().add(getDefaultExclusions())

/**
 * Returns patterns for common build and development artifact directories
 * @returns Array of glob patterns for build artifacts
 */
function getBuildArtifactPatterns(): string[] {
    return [
        '.gradle/',
        '.idea/',
        '.parcel-cache/',
        '.pytest_cache/',
        '.next/',
        '.nuxt/',
        '.sass-cache/',
        '.vs/',
        '.vscode/',
        'Pods/',
        '__pycache__/',
        'bin/',
        'build/',
        'bundle/',
        'coverage/',
        'deps/',
        'dist/',
        'env/',
        'node_modules/',
        'obj/',
        'out/',
        'pkg/',
        'pycache/',
        'target/dependency/',
        'temp/',
        'vendor/',
        'venv/',
    ]
}

/**
 * Returns patterns for common media and image file types
 * @returns Array of glob patterns for media files
 */
function getMediaFilePatterns(): string[] {
    return [
        '*.jpg',
        '*.jpeg',
        '*.png',
        '*.gif',
        '*.bmp',
        '*.ico',
        '*.webp',
        '*.tiff',
        '*.tif',
        '*.svg',
        '*.raw',
        '*.heic',
        '*.avif',
        '*.eps',
        '*.psd',
        '*.3gp',
        '*.aac',
        '*.aiff',
        '*.asf',
        '*.avi',
        '*.divx',
        '*.flac',
        '*.m4a',
        '*.m4v',
        '*.mkv',
        '*.mov',
        '*.mp3',
        '*.mp4',
        '*.mpeg',
        '*.mpg',
        '*.ogg',
        '*.opus',
        '*.rm',
        '*.rmvb',
        '*.vob',
        '*.wav',
        '*.webm',
        '*.wma',
        '*.wmv',
        '*.ttf',
        '*.woff',
        '*.woff2',
        '*.eot',
        '*.pdf',
        '*.wav',
    ]
}

/**
 * Returns patterns for cache, temporary, and system files
 * @returns Array of glob patterns for cache files
 */
function getCacheFilePatterns(): string[] {
    return [
        '*.DS_Store',
        '*.bak',
        '*.cache',
        '*.crdownload',
        '*.dmp',
        '*.dump',
        '*.eslintcache',
        '*.lock',
        '*-lock.json',
        '*.lockb',
        '*.log',
        '*.old',
        '*.part',
        '*.partial',
        '*.pyc',
        '*.pyo',
        '*.stackdump',
        '*.swo',
        '*.swp',
        '*.temp',
        '*.tmp',
        '*.Thumbs.db',
    ]
}

/**
 * Returns patterns for environment and configuration files
 * @returns Array of glob patterns for config files
 */
function getConfigFilePatterns(): string[] {
    return ['*.env*', '*.local', '*.development', '*.production', 'config.json', 'config.yaml']
}

/**
 * Returns patterns for git ignore files
 * @returns Array of glob patterns for git ignore files
 */
function getGitIgnorePatterns(): string[] {
    return ['*.gitignore', '*.gitkeep', '*.posthogignore']
}

/**
 * Returns patterns for common large binary and archive files
 * @returns Array of glob patterns for large data files
 */
function getLargeDataFilePatterns(): string[] {
    return [
        '*.zip',
        '*.tar',
        '*.tgz',
        '*.gz',
        '*.rar',
        '*.7z',
        '*.iso',
        '*.bin',
        '*.exe',
        '*.dll',
        '*.so',
        '*.dylib',
        '*.lib',
        '*.dat',
        '*.wasm',
        '*.dmg',
        '*.msi',
    ]
}

/**
 * Returns patterns for database and data storage files
 * @returns Array of glob patterns for database files
 */
function getDatabaseFilePatterns(): string[] {
    return [
        '*.arrow',
        '*.accdb',
        '*.aof',
        '*.avro',
        '*.bak',
        '*.bson',
        '*.csv',
        '*.db',
        '*.dbf',
        '*.dmp',
        '*.frm',
        '*.ibd',
        '*.mdb',
        '*.myd',
        '*.myi',
        '*.orc',
        '*.parquet',
        '*.pdb',
        '*.rdb',
        '*.sql',
        '*.sqlite',
        '*.pqt',
    ]
}

/**
 * Returns patterns for geospatial and mapping data files
 * @returns Array of glob patterns for geospatial files
 */
function getGeospatialPatterns(): string[] {
    return [
        '*.shp',
        '*.shx',
        '*.dbf',
        '*.prj',
        '*.sbn',
        '*.sbx',
        '*.shp.xml',
        '*.cpg',
        '*.gdb',
        '*.mdb',
        '*.gpkg',
        '*.kml',
        '*.kmz',
        '*.gml',
        '*.geojson',
        '*.dem',
        '*.asc',
        '*.img',
        '*.ecw',
        '*.las',
        '*.laz',
        '*.mxd',
        '*.qgs',
        '*.grd',
        '*.csv',
        '*.dwg',
        '*.dxf',
    ]
}

/**
 * Returns patterns for log and debug output files
 * @returns Array of glob patterns for log files
 */
function getLogFilePatterns(): string[] {
    return ['*.error', '*.log', '*.logs', '*.npm-debug.log*', '*.out', '*.stdout', 'yarn-debug.log*', 'yarn-error.log*']
}

/**
 * Returns patterns for miscellaneous files
 * @returns Array of glob patterns for miscellaneous files
 */
function getMiscellaneousPatterns(): string[] {
    return [
        '*.o',
        '*.o.d',
        '*.a',
        '*.ncb',
        '*.sdf',
        '*.cur',
        '*.jar',
        '*.onnx',
        '*.plist',
        '*.profraw',
        '*.gcda',
        '*.gcno',
        'go.sum',
        '*.uasset',
        '*.pag',
        '*.jsonl',
    ]
}
