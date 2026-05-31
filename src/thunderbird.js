"use strict";

const helpers = require("./helpers/base");
const sha1 = require("sha1");

// =============================================================================
// Store Configuration Validation
// =============================================================================

// Track if we've already warned about missing store configuration
let storeWarningShown = false;

/**
 * Checks if a valid password store is configured.
 * @param {Object} settings - Extension settings
 * @returns {boolean} True if at least one store is configured
 */
function hasConfiguredStore(settings) {
    const storeIds = Object.keys(settings.stores || {});
    return storeIds.length > 0;
}

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
    if (host.startsWith("oauth://") || host.startsWith("oauth:")) {
        const { provider } = parseOAuthProvider(host);
        return { path: `thunderbird/oauth-${provider}`, protocol: "oauth", login };
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
 * - thunderbird/oauth-{provider}.gpg - OAuth2 token (single per provider hostname)
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

    // Handle oauth: and oauth:// formats from Thunderbird.
    // Thunderbird uses "oauth://hostname (scope1 scope2 ...)" format.
    if (host.startsWith("oauth://") || host.startsWith("oauth:")) {
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
        // Single OAuth token per provider: thunderbird/oauth-{provider}.gpg
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
        // Check if a password store is configured
        if (!hasConfiguredStore(settings)) {
            warnMissingStore();
            return { autoSubmit: false, credentials: [] };
        }

        const isOAuth = credentialInfo.host?.startsWith("oauth");

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

        // Flatten all files from all stores
        const allFiles = [];
        for (const storeId in listResponse.data.files) {
            const storeFiles = listResponse.data.files[storeId];
            storeFiles.forEach((file) => {
                allFiles.push({ storeId: storeId, path: file });
            });
        }

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

        // IMPORTANT: Only try the first matching file to avoid multiple GPG key prompts
        // If YubiKey times out or user cancels, trying additional files will cause GPG
        // to prompt for other keys in the keyring that may not be related to pass
        console.debug(
            "Browserpass: Found",
            matchingFiles.length,
            "matching file(s), will only attempt first one to avoid multiple GPG prompts"
        );
        const filesToTry = [matchingFiles[0]];

        // Fetch and parse password contents
        const credentials = [];
        // True when a matching file exists but could not be decrypted (e.g. a
        // hardware GPG key was not touched in time). Signals the caller that a
        // retry may succeed, as opposed to the credential being genuinely absent.
        let decryptionFailed = false;
        for (const matchingFile of filesToTry) {
            const fileObj = allFiles.find((f) => f.path === matchingFile);
            if (!fileObj) continue;

            let fetchResponse;
            try {
                fetchResponse = await sendNativeMessage(settings.appID, {
                    settings: settings,
                    action: "fetch",
                    storeId: fileObj.storeId,
                    file: matchingFile,
                });
            } catch (e) {
                // Native host disconnected mid-decrypt (e.g. GPG aborted/timed out)
                console.warn("Browserpass: Native fetch failed for", matchingFile, e?.message);
                decryptionFailed = true;
                break;
            }

            if (fetchResponse.status === "ok" && fetchResponse.data.contents) {
                const parsed = parsePasswordContents(fetchResponse.data.contents, matchingFile);

                // Filter by login if specified
                if (
                    credentialInfo.login &&
                    credentialInfo.login !== true &&
                    parsed.login &&
                    parsed.login.toLowerCase() !== credentialInfo.login.toLowerCase()
                ) {
                    continue;
                }

                parsed.uuid = sha1(fileObj.storeId + matchingFile);
                parsed.storeId = fileObj.storeId;
                parsed.file = matchingFile;

                credentials.push(parsed);
            } else {
                // Decryption failed (timeout, cancelled, wrong key, no contents, etc.)
                // Stop trying other files immediately to avoid repeated GPG prompts
                console.warn(
                    "Browserpass: Decryption failed or cancelled for",
                    matchingFile,
                    "status:",
                    fetchResponse.status,
                    "- stopping further attempts to avoid repeated GPG prompts"
                );
                decryptionFailed = true;
                break;
            }
        }

        if (credentials.length === 0 && isOAuth) {
            console.debug("Browserpass: No OAuth token found for:", credentialInfo.host);
        }

        if (isOAuth && credentials.length > 0) {
            console.debug(
                "Browserpass: Returning OAuth credentials for",
                credentialInfo.host,
                "files:",
                credentials.map((c) => c.file).join(", ")
            );
        }

        return {
            autoSubmit: settings.autoSubmit || false,
            credentials: credentials,
            decryptionFailed: credentials.length === 0 && decryptionFailed,
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
 * Single token per provider hostname: thunderbird/oauth-{provider}.gpg
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
    const filepath = `thunderbird/oauth-${parsed.provider}.gpg`;
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

    console.debug("Browserpass: Saving OAuth token to:", filepath);

    const saveResponse = await sendNativeMessage(settings.appID, {
        settings: settings,
        action: "save",
        storeId: storeId,
        file: filepath,
        contents: contents,
    });

    return saveResponse.status === "ok";
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

        // Check if a password store is configured
        const storeId = getStoreId(settings);
        if (!storeId) {
            warnMissingStore();
            return false;
        }

        // Handle OAuth tokens - save to thunderbird/oauth-{provider}.gpg
        if (
            credentialInfo.host.startsWith("oauth://") ||
            credentialInfo.host.startsWith("oauth:")
        ) {
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

        console.debug("Browserpass: Saving credential to:", filepath, "in store:", storeId);

        const saveResponse = await sendNativeMessage(settings.appID, {
            settings: settings,
            action: "save",
            storeId: storeId,
            file: filepath,
            contents: contents,
        });

        if (saveResponse.status === "ok") {
            return true;
        } else {
            console.error("Browserpass: Failed to save credential:", saveResponse);
            return false;
        }
    } catch (error) {
        console.error("Browserpass: Error handling new credential:", error);
        return false;
    }
}

module.exports = {
    handleCredentialRequest,
    handleNewCredential,
    parseOAuthProvider,
    getThunderbirdStorePath,
};
