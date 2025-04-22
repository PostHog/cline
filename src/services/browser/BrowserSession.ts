import { setTimeout as setTimeoutPromise } from 'node:timers/promises'

import * as fs from 'fs/promises'
import pWaitFor from 'p-wait-for'
import * as path from 'path'
// @ts-ignore
import PCR from 'puppeteer-chromium-resolver'
import { Browser, launch, Page, ScreenshotOptions, TimeoutError } from 'puppeteer-core'
import * as vscode from 'vscode'

import { BrowserSettings } from '../../shared/BrowserSettings'
import { BrowserActionResult } from '../../shared/ExtensionMessage'
import { fileExistsAtPath } from '../../utils/fs'
// import * as chromeLauncher from "chrome-launcher"

interface PCRStats {
    puppeteer: { launch: typeof launch }
    executablePath: string
}

// const DEBUG_PORT = 9222 // Chrome's default debugging port

export class BrowserSession {
    private context: vscode.ExtensionContext
    private browser?: Browser
    private page?: Page
    private currentMousePosition?: string
    private logs: string[] = []
    private lastLogTs: number = Date.now()
    browserSettings: BrowserSettings

    constructor(context: vscode.ExtensionContext, browserSettings: BrowserSettings) {
        this.context = context
        this.browserSettings = browserSettings
    }

    private async ensureChromiumExists(): Promise<PCRStats> {
        const globalStoragePath = this.context?.globalStorageUri?.fsPath
        if (!globalStoragePath) {
            throw new Error('Global storage uri is invalid')
        }

        const puppeteerDir = path.join(globalStoragePath, 'puppeteer')
        const dirExists = await fileExistsAtPath(puppeteerDir)
        if (!dirExists) {
            await fs.mkdir(puppeteerDir, { recursive: true })
        }

        const chromeExecutablePath = vscode.workspace.getConfiguration('posthog').get<string>('chromeExecutablePath')
        if (chromeExecutablePath && !(await fileExistsAtPath(chromeExecutablePath))) {
            throw new Error(`Chrome executable not found at path: ${chromeExecutablePath}`)
        }
        const stats: PCRStats = chromeExecutablePath
            ? { puppeteer: require('puppeteer-core'), executablePath: chromeExecutablePath }
            : // if chromium doesn't exist, this will download it to path.join(puppeteerDir, ".chromium-browser-snapshots")
              // if it does exist it will return the path to existing chromium
              await PCR({ downloadPath: puppeteerDir })

        return stats
    }

    // private async checkExistingChromeDebugger(): Promise<boolean> {
    // 	try {
    // 		// Try to connect to existing debugger
    // 		const response = await fetch(`http://localhost:${DEBUG_PORT}/json/version`)
    // 		return response.ok
    // 	} catch {
    // 		return false
    // 	}
    // }

    // async relaunchChromeDebugMode() {
    // 	const result = await vscode.window.showWarningMessage(
    // 		"This will close your existing Chrome tabs and relaunch Chrome in debug mode. Are you sure?",
    // 		{ modal: true },
    // 		"Yes",
    // 	)

    // 	if (result !== "Yes") {
    // 		return
    // 	}

    // 	// // Kill any existing Chrome instances
    // 	// await chromeLauncher.killAll()

    // 	// // Launch Chrome with debug port
    // 	// const launcher = new chromeLauncher.Launcher({
    // 	// 	port: DEBUG_PORT,
    // 	// 	chromeFlags: ["--remote-debugging-port=" + DEBUG_PORT, "--no-first-run", "--no-default-browser-check"],
    // 	// })

    // 	// await launcher.launch()
    // 	const installation = chromeLauncher.Launcher.getFirstInstallation()
    // 	if (!installation) {
    // 		throw new Error("Could not find Chrome installation on this system")
    // 	}
    // 	console.log("chrome installation", installation)
    // }

    // private async getSystemChromeExecutablePath(): Promise<string> {
    // 	// Find installed Chrome
    // 	const installation = chromeLauncher.Launcher.getFirstInstallation()
    // 	if (!installation) {
    // 		throw new Error("Could not find Chrome installation on this system")
    // 	}
    // 	console.log("chrome installation", installation)
    // 	return installation
    // }

    // /**
    //  * Helper to detect user's default Chrome data dir.
    //  * Adjust for OS if needed.
    //  */
    // private getDefaultChromeUserDataDir(): string {
    // 	const homedir = require("os").homedir()
    // 	switch (process.platform) {
    // 		case "win32":
    // 			return path.join(homedir, "AppData", "Local", "Google", "Chrome", "User Data")
    // 		case "darwin":
    // 			return path.join(homedir, "Library", "Application Support", "Google", "Chrome")
    // 		default:
    // 			return path.join(homedir, ".config", "google-chrome")
    // 	}
    // }

    private setupPageListeners() {
        if (!this.page) {
            return
        }

        this.page.on('console', (msg) => {
            if (msg.type() === 'log') {
                this.logs.push(msg.text())
            } else {
                this.logs.push(`[${msg.type()}] ${msg.text()}`)
            }
            this.lastLogTs = Date.now()
        })

        this.page.on('pageerror', (err) => {
            this.logs.push(`[Page Error] ${err.toString()}`)
            this.lastLogTs = Date.now()
        })

        this.page.on('response', (response) => {
            const request = response.request()
            if (request.resourceType() === 'fetch' || request.resourceType() === 'xhr') {
                const networkLog = `[${request.method()}] ${request.url()} (${response.status()})`
                this.logs.push(networkLog)
                this.lastLogTs = Date.now()
            }
        })

        this.page.on('framenavigated', async (frame) => {
            if (frame === this.page?.mainFrame()) {
                const url = frame.url()
                this.logs.push(`\n[Navigation] Navigated to ${url}\n`)
                this.lastLogTs = Date.now()
            }
        })
    }

    async launchBrowser() {
        console.log('launch browser called')
        if (this.browser) {
            await this.closeBrowser()
        }

        this.logs = []
        this.lastLogTs = Date.now()

        const stats = await this.ensureChromiumExists()
        this.browser = await stats.puppeteer.launch({
            args: [
                '--user-agent=Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36',
            ],
            executablePath: stats.executablePath,
            defaultViewport: this.browserSettings.viewport,
            headless: this.browserSettings.headless,
        })

        this.page = await this.browser?.newPage()

        if (this.page) {
            // Override webdriver flag to bypass PostHog bot detection
            await this.page.evaluateOnNewDocument(() => {
                Object.defineProperty(navigator, 'webdriver', {
                    get: () => false,
                })
            })
        }

        this.setupPageListeners()
    }

    async closeBrowser(): Promise<BrowserActionResult> {
        if (this.browser || this.page) {
            console.log('closing browser...')
            await this.browser?.close().catch(() => {})
            this.browser = undefined
            this.page = undefined
            this.currentMousePosition = undefined
            this.logs = []
        }
        return {}
    }

    async doAction(action: (page: Page) => Promise<void>): Promise<BrowserActionResult> {
        if (!this.page) {
            throw new Error(
                'Browser is not launched. This may occur if the browser was automatically closed by a non-`browser_action` tool.'
            )
        }

        try {
            await action(this.page)
        } catch (err) {
            if (!(err instanceof TimeoutError)) {
                this.logs.push(`[Error] ${err.toString()}`)
            }
        }

        // Wait for console inactivity, with a timeout
        await pWaitFor(() => Date.now() - this.lastLogTs >= 2000, {
            timeout: 5_000,
            interval: 100,
        }).catch(() => {})

        let options: ScreenshotOptions = {
            encoding: 'base64',
        }

        let screenshotBase64 = await this.page.screenshot({
            ...options,
            type: 'webp',
        })
        let screenshot = `data:image/webp;base64,${screenshotBase64}`

        if (!screenshotBase64) {
            console.log('webp screenshot failed, trying png')
            screenshotBase64 = await this.page.screenshot({
                ...options,
                type: 'png',
            })
            screenshot = `data:image/png;base64,${screenshotBase64}`
        }

        if (!screenshotBase64) {
            throw new Error('Failed to take screenshot.')
        }

        return {
            screenshot,
            logs: this.logs.join('\n'),
            currentUrl: this.page.url(),
            currentMousePosition: this.currentMousePosition,
        }
    }

    async navigateToUrl(url: string): Promise<BrowserActionResult> {
        return this.doAction(async (page) => {
            // networkidle2 isn't good enough since page may take some time to load. we can assume locally running dev sites will reach networkidle0 in a reasonable amount of time
            await page.goto(url, {
                timeout: 7_000,
                waitUntil: ['domcontentloaded', 'networkidle2'],
            })
            // await page.goto(url, { timeout: 10_000, waitUntil: "load" })
            await this.waitTillHTMLStable(page) // in case the page is loading more resources
        })
    }

    // page.goto { waitUntil: "networkidle0" } may not ever resolve, and not waiting could return page content too early before js has loaded
    // https://stackoverflow.com/questions/52497252/puppeteer-wait-until-page-is-completely-loaded/61304202#61304202
    private async waitTillHTMLStable(page: Page, timeout = 5_000) {
        const checkDurationMsecs = 500 // 1000
        const maxChecks = timeout / checkDurationMsecs
        let lastHTMLSize = 0
        let checkCounts = 1
        let countStableSizeIterations = 0
        const minStableSizeIterations = 3

        while (checkCounts++ <= maxChecks) {
            let html = await page.content()
            let currentHTMLSize = html.length

            // let bodyHTMLSize = await page.evaluate(() => document.body.innerHTML.length)
            console.log('last: ', lastHTMLSize, ' <> curr: ', currentHTMLSize)

            if (lastHTMLSize !== 0 && currentHTMLSize === lastHTMLSize) {
                countStableSizeIterations++
            } else {
                countStableSizeIterations = 0 //reset the counter
            }

            if (countStableSizeIterations >= minStableSizeIterations) {
                console.log('Page rendered fully...')
                break
            }

            lastHTMLSize = currentHTMLSize
            await setTimeoutPromise(checkDurationMsecs)
        }
    }

    async click(coordinate: string): Promise<BrowserActionResult> {
        const [x, y] = coordinate.split(',').map(Number)
        return this.doAction(async (page) => {
            // Set up network request monitoring
            let hasNetworkActivity = false
            const requestListener = () => {
                hasNetworkActivity = true
            }
            page.on('request', requestListener)

            // Perform the click
            await page.mouse.click(x, y)
            this.currentMousePosition = coordinate

            // Small delay to check if click triggered any network activity
            await setTimeoutPromise(100)

            if (hasNetworkActivity) {
                // If we detected network activity, wait for navigation/loading
                await page
                    .waitForNavigation({
                        waitUntil: ['domcontentloaded', 'networkidle2'],
                        timeout: 7000,
                    })
                    .catch(() => {})
                await this.waitTillHTMLStable(page)
            }

            // Clean up listener
            page.off('request', requestListener)
        })
    }

    async type(text: string): Promise<BrowserActionResult> {
        return this.doAction(async (page) => {
            await page.keyboard.type(text)
        })
    }

    async scrollDown(): Promise<BrowserActionResult> {
        return this.doAction(async (page) => {
            await page.evaluate(() => {
                window.scrollBy({
                    top: 600,
                    behavior: 'auto',
                })
            })
            await setTimeoutPromise(300)
        })
    }

    async scrollUp(): Promise<BrowserActionResult> {
        return this.doAction(async (page) => {
            await page.evaluate(() => {
                window.scrollBy({
                    top: -600,
                    behavior: 'auto',
                })
            })
            await setTimeoutPromise(300)
        })
    }
}
