// --loader options doesn't work in mocha/vscode-test, so we need to install the hook manually.
require('source-map-support').install({ hookRequire: true })
