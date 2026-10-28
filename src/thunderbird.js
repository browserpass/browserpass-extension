"use strict";

const helpers = require("./helpers/base");
const sha1 = require("sha1");

// =============================================================================
// Store Configuration Validation
// =============================================================================

// Track if we've already warned about missing store configuration
let storeWarningShown = false;

/**
 * Gets the first configured store ID.
 * @param {Object} settings - Extension settings
 * @returns {string|null} Store ID or null if none configured
 */
function getStoreId(settings) {
    const storeIds = Object.keys(settings.stores || {});
    return storeIds.length > 0 ? storeIds[0] : null;
}

/**
 * Logs a warning about missing password store configuration and shows a notification.
 * Only logs once per session to avoid spamming the console and user.
 */
function warnMissingStore() {
    if (!storeWarningShown) {
        storeWarningShown = true;
        const message =
            "Please configure a password store in the extension preferences or set PASSWORD_STORE_DIR environment variable.";

        console.warn("Browserpass: No password store configured. " + message);

        try {
            browser.notifications.create("browserpass-no-store", {
                type: "basic",
                iconUrl: browser.runtime.getURL("icon.svg"),
                title: "Browserpass - Password Store Not Configured",
                message: message,
            });
        } catch (e) {
            // Notifications might not be available in all contexts, silently fail
        }
    }
}

// =============================================================================
// Native Messaging
// =============================================================================

/**
 * Sends a message to the browserpass native host application.
 * @param {string} appID - The native application ID
 * @param {Object} request - The request payload
 * @returns {Promise<Object>} The native host response
 */
function sendNativeMessage(appID, request) {
    return chrome.runtime.sendNativeMessage(appID, request);
}

/**
 * Saves a file to the password store.
 * @param {Object} settings - Extension settings
 * @param {string} storeId - Password store ID
 * @param {string} file - File path including the .gpg extension
 * @param {string} contents - File contents
 * @returns {Promise<boolean>} True if save succeeded
 */
async function saveFile(settings, storeId, file, contents) {
    console.debug("Browserpass: Saving credential to:", file, "in store:", storeId);
    const response = await sendNativeMessage(settings.appID, {
        settings,
        action: "save",
        storeId,
        file,
        contents,
    });
    if (response.status !== "ok") {
        console.error("Browserpass: Failed to save credential:", response);
    }
    return response.status === "ok";
}

// =============================================================================
// Password Parsing
// =============================================================================

/**
 * Parses password file contents from standard pass format.
 * @param {string} contents - Raw file contents
 * @param {string} filepath - Path for identification
 * @returns {{password: string, login: string|null, name: string}} Parsed data
 */
function parsePasswordContents(contents, filepath) {
    const lines = contents.split(/[\r\n]+/).filter((line) => line.trim().length > 0);
    const data = {
        password: lines[0] || "",
        login: null,
        name: filepath,
    };

    for (let i = 1; i < lines.length; i++) {
        const parts = lines[i].match(/^(.+?):(.*)$/);
        if (!parts) continue;

        const key = parts[1].trim().toLowerCase();
        const value = parts[2].trim();

        if (helpers.fieldsPrefix.login.includes(key)) {
            data.login = value;
        }
    }

    return data;
}

// =============================================================================
// OAuth URL Parsing
// =============================================================================

/**
 * Checks if a Thunderbird host string refers to an OAuth token.
 * @param {string} host - Host string (e.g. oauth://accounts.google.com)
 * @returns {boolean}
 */
function isOAuthHost(host) {
    return typeof host === "string" && host.startsWith("oauth:");
}

/**
 * Parses Thunderbird's OAuth origin format to extract provider hostname and scope.
 * Thunderbird uses: "oauth://hostname (scope1 scope2 ...)" or plain "oauth://hostname"
 *
 * @param {string} host - OAuth host string from Thunderbird
 * @returns {{ provider: string, scope: string }}
 */
function parseOAuthProvider(host) {
    const withoutPrefix = host.replace(/^oauth:\/?\/?\//, "");
    // Hostname is everything before the first space or parenthesis
    const provider = withoutPrefix.split(/[\s(]/)[0].trim();
    // Scope is the content inside parentheses, if present
    const scopeMatch = withoutPrefix.match(/\(([^)]*)\)/);
    const scope = scopeMatch ? scopeMatch[1].trim() : "";
    return { provider, scope };
}

/**
 * Builds the pass path (without .gpg) of an OAuth token. One file per
 * provider and account so several accounts of one provider do not overwrite
 * each other's refresh token.
 *
 * @param {string} provider - OAuth provider hostname
 * @param {string|true|null} [login] - Account username
 * @returns {string} thunderbird/oauth-{provider}[-{login}]
 */
function getOAuthStorePath(provider, login = null) {
    const base = `thunderbird/oauth-${provider}`;
    return typeof login === "string" && login ? `${base}-${login}` : base;
}

/**
 * Derives the pass store path prefix (without the .gpg extension) for a
 * Thunderbird host string, plus the login encoded in the host when present.
 *
 * Naming scheme: thunderbird/{protocol}-{hostname[:port]} and, for OAuth,
 * thunderbird/oauth-{provider}. Shared by credential saving and migration so
 * the layout has a single source of truth.
 *
 * @param {string} host - Host URL (e.g. imap://mail.example.com or oauth://...)
 * @param {string} [login] - Optional login hint; used when the host has none
 * @returns {{path: string, protocol: string, login: string|null}|null} Path
 *   info, or null if the host cannot be parsed
 */
function getThunderbirdStorePath(host, login = null) {
    if (isOAuthHost(host)) {
        const { provider } = parseOAuthProvider(host);
        return { path: getOAuthStorePath(provider, login), protocol: "oauth", login };
    }

    let protocol = "";
    let hostname = host;
    let resolvedLogin = login;
    try {
        const url = new URL(host);
        protocol = url.protocol.replace(":", "");
        hostname = url.hostname;
        if (url.port) {
            hostname += ":" + url.port;
        }
        // Thunderbird's realm embeds the username in the URL (e.g.
        // smtp://user%40host@mail.example.com) but passes an empty login
        // field. Extract it from the URL when login is not provided.
        if (!resolvedLogin && url.username) {
            resolvedLogin = decodeURIComponent(url.username);
        }
    } catch (e) {
        const match = host.match(/^([a-z]+):\/\/(.+)/i);
        if (!match) {
            return null;
        }
        protocol = match[1];
        hostname = match[2].split("/")[0];
    }

    return { path: `thunderbird/${protocol}-${hostname}`, protocol, login: resolvedLogin };
}

// =============================================================================
// Credential Request Handling
// =============================================================================

/**
 * Find credentials in password store for Thunderbird
 *
 * All credentials are stored under thunderbird/ with {protocol}-{hostname} naming:
 * - thunderbird/imap-{server}.gpg - IMAP server credentials
 * - thunderbird/smtp-{server}.gpg - SMTP server credentials
 * - thunderbird/pop3-{server}.gpg - POP3 server credentials
 * - thunderbird/nntp-{server}.gpg - NNTP news server credentials
 * - thunderbird/oauth-{provider}-{login}.gpg - OAuth2 token
 * - thunderbird/https-{server}.gpg - OAuth browser window credentials
 *
 * @param {Array} files - List of password files from store
 * @param {Object} credentialInfo - Credential request information
 * @param {string} credentialInfo.host - Host URL with protocol
 * @param {string} [credentialInfo.login] - Optional login/username
 * @returns {Array} Matching password entries
 */
function findThunderbirdCredentials(files, credentialInfo) {
    const host = credentialInfo.host;

    let protocol = "";
    let hostname = "";
    let hostPort = "";

    if (isOAuthHost(host)) {
        protocol = "oauth";
        hostname = parseOAuthProvider(host).provider;
    } else {
        try {
            const url = new URL(host);
            protocol = url.protocol.replace(":", "");
            hostname = url.hostname;
            hostPort = url.port ? `${hostname}:${url.port}` : hostname;
        } catch (e) {
            hostname = host.replace(/:\d+$/, "");
            hostPort = host.includes(":") ? host : hostname;
        }
    }

    // Build search patterns under thunderbird/ directory
    const searchPatterns = [];

    if (protocol === "oauth") {
        const login = credentialInfo.login;
        if (typeof login === "string" && login) {
            // Exact match only: a prefix match would pick up other accounts' files.
            const exact = `${getOAuthStorePath(hostname, login)}.gpg`.toLowerCase();
            return files.filter((f) => f.toLowerCase() === exact);
        }
        searchPatterns.push(`thunderbird/oauth-${hostname}`);
    } else if (protocol === "https") {
        // OAuth browser window credentials: thunderbird/https-{hostname}.gpg
        searchPatterns.push(`thunderbird/https-${hostname}`);
        if (hostPort !== hostname) {
            searchPatterns.push(`thunderbird/https-${hostPort}`);
        }
    } else if (["imap", "smtp", "pop3", "nntp"].includes(protocol)) {
        // Mail protocol files: thunderbird/{protocol}-{hostname}.gpg
        searchPatterns.push(`thunderbird/${protocol}-${hostname}`);
        if (hostPort !== hostname) {
            searchPatterns.push(`thunderbird/${protocol}-${hostPort}`);
        }
    }

    if (searchPatterns.length === 0) {
        return [];
    }

    return files.filter((file) => {
        const filePath = file.toLowerCase();
        return searchPatterns.some((pattern) => filePath.startsWith(pattern.toLowerCase()));
    });
}

/**
 * Handles credential requests from Thunderbird's auth prompts.
 * @param {Object} settings - Extension settings with store configuration
 * @param {Object} credentialInfo - Request details from Thunderbird
 * @param {string} credentialInfo.host - Host URL (e.g., imap://mail.example.com)
 * @param {string} [credentialInfo.login] - Optional username to match
 * @returns {Promise<{autoSubmit: boolean, credentials: Array}>} Matching credentials
 */
async function handleCredentialRequest(settings, credentialInfo) {
    try {
        if (!getStoreId(settings)) {
            warnMissingStore();
            return { autoSubmit: false, credentials: [] };
        }

        console.debug("Browserpass: Thunderbird credential request:", {
            host: credentialInfo.host,
            login: credentialInfo.login,
        });

        const listResponse = await sendNativeMessage(settings.appID, {
            settings: settings,
            action: "list",
        });

        if (listResponse.status !== "ok") {
            console.error("Browserpass: Failed to list password files:", listResponse);
            return { autoSubmit: false, credentials: [] };
        }

        const allFiles = Object.entries(listResponse.data.files).flatMap(([storeId, files]) =>
            files.map((path) => ({ storeId, path }))
        );

        // Find matching files using protocol-based search
        // For OAuth browser windows, host already has https:// prefix from implementation.js
        const matchingFiles = findThunderbirdCredentials(
            allFiles.map((f) => f.path),
            credentialInfo
        );

        console.debug("Browserpass: Matching files found:", matchingFiles);

        if (matchingFiles.length === 0) {
            // No matching files, but store is working - return autoSubmit: true
            return { autoSubmit: true, credentials: [] };
        }

        // Only try the first matching file: after a hardware GPG key timeout or
        // cancel, further files would prompt for other, possibly unrelated keys.
        const file = matchingFiles[0];
        const storeId = allFiles.find((f) => f.path === file).storeId;

        let fetchResponse = null;
        try {
            fetchResponse = await sendNativeMessage(settings.appID, {
                settings: settings,
                action: "fetch",
                storeId: storeId,
                file: file,
            });
        } catch (e) {
            // Native host disconnected mid-decrypt (e.g. GPG aborted/timed out)
            console.warn("Browserpass: Native fetch failed for", file, e?.message);
        }

        if (fetchResponse?.status !== "ok" || !fetchResponse.data.contents) {
            // A matching file exists but could not be decrypted (e.g. a hardware
            // GPG key was not touched in time), so a retry may succeed.
            console.warn(
                "Browserpass: Decryption failed or cancelled for",
                file,
                "status:",
                fetchResponse?.status
            );
            return {
                autoSubmit: settings.autoSubmit || false,
                credentials: [],
                decryptionFailed: true,
            };
        }

        const parsed = parsePasswordContents(fetchResponse.data.contents, file);
        const loginMatches =
            !credentialInfo.login ||
            credentialInfo.login === true ||
            !parsed.login ||
            parsed.login.toLowerCase() === credentialInfo.login.toLowerCase();
        if (loginMatches) {
            Object.assign(parsed, { uuid: sha1(storeId + file), storeId, file });
        }

        return {
            autoSubmit: settings.autoSubmit || false,
            credentials: loginMatches ? [parsed] : [],
        };
    } catch (error) {
        console.error("Browserpass: Error handling credential request:", error);
        return { autoSubmit: false, credentials: [] };
    }
}

// =============================================================================
// Credential Storage
// =============================================================================

/**
 * Saves an OAuth token file to the password store.
 * One token per provider and account: thunderbird/oauth-{provider}-{login}.gpg
 *
 * @param {Object} settings - Extension settings
 * @param {string} storeId - Password store ID
 * @param {string} username - User's email/login
 * @param {string} password - OAuth refresh token
 * @param {string} host - OAuth host (e.g., oauth://accounts.google.com)
 * @param {string} [scope] - OAuth scope (space-separated URLs)
 * @returns {Promise<boolean>} True if save succeeded
 */
async function saveOAuthFile(settings, storeId, username, password, host, scope) {
    // Parse Thunderbird's OAuth origin format: "oauth://hostname (scope1 scope2 ...)"
    const parsed = parseOAuthProvider(host);
    const filepath = `${getOAuthStorePath(parsed.provider, username)}.gpg`;
    // Use explicitly provided scope, or extract from the host URL format
    const effectiveScope = scope || parsed.scope;
    let contents = password;
    if (username && username !== true) {
        contents += `\nlogin: ${username}`;
    }
    contents += `\nurl: oauth://${parsed.provider}`;
    if (effectiveScope) {
        contents += `\nscope: ${effectiveScope}`;
    }

    return saveFile(settings, storeId, filepath, contents);
}

/**
 * Handles saving new credentials from Thunderbird.
 * @param {Object} settings - Extension settings
 * @param {Object} credentialInfo - Credential data
 * @param {string} credentialInfo.host - Host URL
 * @param {string} [credentialInfo.login] - Username
 * @param {string} credentialInfo.password - Password or token
 * @param {string} [credentialInfo.scope] - OAuth scope (for OAuth tokens)
 * @returns {Promise<boolean>} True if saved successfully
 */
async function handleNewCredential(settings, credentialInfo) {
    try {
        if (!credentialInfo.password) {
            return false;
        }

        const storeId = getStoreId(settings);
        if (!storeId) {
            warnMissingStore();
            return false;
        }

        // Handle OAuth tokens - save to thunderbird/oauth-{provider}-{login}.gpg
        if (isOAuthHost(credentialInfo.host)) {
            const username =
                credentialInfo.login || parseOAuthProvider(credentialInfo.host).provider;

            return await saveOAuthFile(
                settings,
                storeId,
                username,
                credentialInfo.password,
                credentialInfo.host,
                credentialInfo.scope
            );
        }

        // Non-OAuth credentials
        const pathInfo = getThunderbirdStorePath(credentialInfo.host, credentialInfo.login);
        if (!pathInfo) {
            console.error("Browserpass: Invalid URL:", credentialInfo.host);
            return false;
        }

        const { protocol, login } = pathInfo;
        const filepath = `${pathInfo.path}.gpg`;
        // Reconstruct a clean hostname (path is thunderbird/{protocol}-{hostname})
        const hostname = pathInfo.path.slice(`thunderbird/${protocol}-`.length);

        let contents = credentialInfo.password;
        if (login && login !== true) {
            contents += `\nlogin: ${login}`;
        }
        // Store a clean url without userinfo — the filename already encodes
        // protocol + hostname, but the field is useful for human reference.
        contents += `\nurl: ${protocol}://${hostname}`;

        return await saveFile(settings, storeId, filepath, contents);
    } catch (error) {
        console.error("Browserpass: Error handling new credential:", error);
        return false;
    }
}

module.exports = {
    handleCredentialRequest,
    handleNewCredential,
    getThunderbirdStorePath,
};
