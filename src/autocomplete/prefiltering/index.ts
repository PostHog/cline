import ignore from 'ignore'

import { findUriInDirs } from '../../utils/uri'
import { getWorkspaceDirs } from '../../utils/vscode'
import { AutocompleteHelperVars } from '../util/AutocompleteHelperVars'

async function isDisabledForFile(currentFilepath: string, disableInFiles: string[] | undefined) {
    if (disableInFiles) {
        // Relative path needed for `ignore`
        const workspaceDirs = await getWorkspaceDirs()
        const { relativePathOrBasename } = findUriInDirs(currentFilepath, workspaceDirs)

        // @ts-ignore
        const pattern = ignore.default().add(disableInFiles)
        if (pattern.ignores(relativePathOrBasename)) {
            return true
        }
    }
    return false
}

export async function shouldPrefilter(helper: AutocompleteHelperVars): Promise<boolean> {
    // Allow disabling autocomplete from config.json
    if (helper.options.disable) {
        return true
    }

    // Check whether autocomplete is disabled for this file
    const disableInFiles = [...(helper.options.disableInFiles ?? []), '*.prompt']
    if (await isDisabledForFile(helper.filepath, disableInFiles)) {
        return true
    }

    // Don't offer completions when we have no information (untitled file and no file contents)
    if (helper.filepath.includes('Untitled') && helper.fileContents.trim() === '') {
        return true
    }

    // if (
    //   helper.options.transform &&
    //   (await shouldLanguageSpecificPrefilter(helper))
    // ) {
    //   return true;
    // }

    return false
}
