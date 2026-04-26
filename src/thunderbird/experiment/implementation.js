/* globals ChromeUtils, Cc, Ci, Components, XPCOMUtils, globalThis*/
/* eslint eslint-comments/no-use: off */
/* eslint {"indent": ["error", "tab", {"SwitchCase": 1, "outerIIFEBody": 0}]}*/
"use strict";
((exports) => {
    // ============================================================================
    // Module Imports (Thunderbird 128+)
    // ============================================================================

    const { ExtensionCommon } = ChromeUtils.importESModule(
        "resource://gre/modules/ExtensionCommon.sys.mjs"
    );
    const { ExtensionParent } = ChromeUtils.importESModule(
        "resource://gre/modules/ExtensionParent.sys.mjs"
    );
    const { setTimeout, clearTimeout, setInterval, clearInterval } = ChromeUtils.importESModule(
        "resource://gre/modules/Timer.sys.mjs"
    );

    // ============================================================================
    // Extension Setup
    // ============================================================================

    const extension = ExtensionParent.GlobalManager.getExtension("browserpass@maximbaz.com");

    const resProto = Cc["@mozilla.org/network/protocol;1?name=resource"].getService(
        Ci.nsISubstitutingProtocolHandler
    );

    resProto.setSubstitutionWithFlags(
        "browserpass",
        Services.io.newURI("thunderbird/experiment", null, extension.rootURI),
        resProto.ALLOW_CONTENT_ACCESS
    );

    console.debug("Browserpass: Experimental API initializing...");

    // ============================================================================
    // Offline Startup Control
    // ============================================================================
    // Ensures Thunderbird starts offline so our hooks are ready before any
    // credential requests occur.
    //
    // On shutdown: Save user's offline.startup_state, then set to ALWAYS_OFFLINE (3)
    // On startup: Restore user's preference and go online when hooks are ready

    const OFFLINE_STARTUP_PREF = "offline.startup_state";
    const SAVED_STARTUP_STATE_PREF = "browserpass.saved_offline_startup_state";
    const ALWAYS_OFFLINE = 3;

    // Import Thunderbird's OfflineStartup module to re-run startup logic
    const { OfflineStartup } = ChromeUtils.importESModule(
        "resource:///modules/OfflineStartup.sys.mjs"
    );

    // Force offline immediately (may be too late but helps in some cases)
    Services.io.offline = true;

    const offlineControl = {
        initialized: false,
        observing: false,

        /**
         * Called when first listener registers - restore online state.
         */
        applyStartupState: function () {
            if (this.initialized) {
                return;
            }
            this.initialized = true;

            try {
                console.debug("Browserpass: Extension ready - restoring online state");

                // Restore saved preference if exists
                let userWantsOffline = false;
                if (Services.prefs.prefHasUserValue(SAVED_STARTUP_STATE_PREF)) {
                    const savedState = Services.prefs.getIntPref(SAVED_STARTUP_STATE_PREF);
                    Services.prefs.clearUserPref(SAVED_STARTUP_STATE_PREF);
                    Services.prefs.setIntPref(OFFLINE_STARTUP_PREF, savedState);
                    console.debug("Browserpass: Restored offline.startup_state to:", savedState);
                    userWantsOffline = savedState === ALWAYS_OFFLINE;
                } else {
                    // Check current preference
                    const currentState = Services.prefs.getIntPref(OFFLINE_STARTUP_PREF, 0);
                    userWantsOffline = currentState === ALWAYS_OFFLINE;
                }

                if (userWantsOffline) {
                    console.debug(
                        "Browserpass: User preference is Always offline - staying offline"
                    );
                    return;
                }

                // Re-run Thunderbird's startup logic to go online
                console.debug(
                    "Browserpass: Re-running Thunderbird's OfflineStartup.onProfileStartup()"
                );
                startupReady = true;
                OfflineStartup.prototype.onProfileStartup();

                // Enable auto-detect if configured
                if (Services.prefs.getBoolPref("offline.autoDetect", false)) {
                    console.debug("Browserpass: autoDetect enabled - enabling manageOfflineStatus");
                    Services.io.offline = false;
                    Services.io.manageOfflineStatus = true;
                }
            } catch (e) {
                console.error("Browserpass: Error in offlineControl.applyStartupState:", e);
                Services.io.offline = false;
            }
        },

        /**
         * Start observing shutdown to save preferences.
         */
        startObserving: function () {
            if (this.observing) return;
            this.observing = true;
            Services.obs.addObserver(this, "quit-application-granted");
            console.debug("Browserpass: Started observing quit-application-granted");
        },

        /**
         * Stop observing shutdown.
         */
        stopObserving: function () {
            if (!this.observing) return;
            this.observing = false;
            try {
                Services.obs.removeObserver(this, "quit-application-granted");
            } catch (e) {
                // Observer may not be registered
            }
        },

        /**
         * Observer interface implementation.
         */
        observe: function (subject, topic, data) {
            if (topic === "quit-application-granted") {
                this.onShutdown();
            }
        },

        /**
         * Called on shutdown - save user's preference and force offline for next startup.
         */
        onShutdown: function () {
            try {
                const currentState = Services.prefs.getIntPref(OFFLINE_STARTUP_PREF, 0);

                // Only save if not already ALWAYS_OFFLINE (user's explicit choice)
                if (currentState !== ALWAYS_OFFLINE) {
                    console.debug(
                        "Browserpass: Shutdown - saving offline.startup_state:",
                        currentState
                    );
                    Services.prefs.setIntPref(SAVED_STARTUP_STATE_PREF, currentState);
                    Services.prefs.setIntPref(OFFLINE_STARTUP_PREF, ALWAYS_OFFLINE);
                    console.debug(
                        "Browserpass: Set offline.startup_state to ALWAYS_OFFLINE for next startup"
                    );
                }
            } catch (e) {
                console.error("Browserpass: Error in offlineControl.onShutdown:", e);
            }
        },
    };

    // Start observing shutdown immediately
    offlineControl.startObserving();

    // ============================================================================
    // Event Emitters
    // ============================================================================

    const passwordRequestEmitter = new ExtensionCommon.EventEmitter();
    const passwordEmitter = new ExtensionCommon.EventEmitter();

    let requestListenerCount = 0;
    let storeListenerCount = 0;

    // Track if we're in account setup mode (disable token injection during setup)
    let accountSetupInProgress = false;
    // Set to true once the extension's request listener is registered and the
    // startup state has been applied. handleOAuthWindow skips windows that open
    // before this flag is set (TB bug 2008995 opens a CalDAV OAuth window before
    // our hook is installed; we must not set accountSetupInProgress for that
    // window or it blocks all subsequent getRefreshToken lookups until dismissed).
    let startupReady = false;

    // Queue for storing credentials when no listener is available yet
    const pendingStores = [];

    // Store extension context for waking up background script
    let extensionContext = null;

    // Promise that resolves when first request listener is available
    // This is recreated each time listeners go to 0
    let listenerReadyPromise = null;
    let listenerReadyResolve = null;

    // Promise that resolves when first store listener is available
    let storeListenerReadyPromise = null;
    let storeListenerReadyResolve = null;

    /**
     * Returns a promise that resolves when a credential request listener is available.
     * Attempts to wake up the extension if no listener is registered.
     *
     * @returns {Promise<void>} Resolves when listener is ready or times out
     */
    async function getListenerReadyPromise() {
        if (requestListenerCount > 0) {
            return Promise.resolve();
        }

        // Try to wake up the extension and wait for listener
        for (let attempt = 0; attempt < 3; attempt++) {
            console.debug(
                "Browserpass: Waiting for request listener... (attempt",
                attempt + 1,
                "of 3)"
            );

            const wokenUp = await wakeUpExtension();
            if (wokenUp && requestListenerCount > 0) {
                console.debug("Browserpass: Listener registered after wake-up");
                return Promise.resolve();
            }

            if (requestListenerCount > 0) {
                return Promise.resolve();
            }

            // Wait a bit for listener to register
            await new Promise((resolve) => setTimeout(resolve, 500));

            if (requestListenerCount > 0) {
                return Promise.resolve();
            }
        }

        // Still no listener after attempts - wait with timeout
        if (!listenerReadyPromise) {
            console.debug(
                "Browserpass: No listener after wake-up attempts, waiting with timeout..."
            );
            listenerReadyPromise = new Promise((resolve) => {
                listenerReadyResolve = resolve;
                // Timeout after 5 seconds
                setTimeout(() => {
                    if (listenerReadyResolve === resolve) {
                        console.debug(
                            "Browserpass: Request listener wait timed out after 5 seconds"
                        );
                        resolve();
                        listenerReadyResolve = null;
                        listenerReadyPromise = null;
                    }
                }, 5000);
            });
        }
        return listenerReadyPromise;
    }

    /**
     * Returns a promise that resolves when a credential store listener is available.
     * Attempts to wake up the extension if no listener is registered.
     *
     * @returns {Promise<void>} Resolves when listener is ready or times out
     */
    async function getStoreListenerReadyPromise() {
        if (storeListenerCount > 0) {
            return Promise.resolve();
        }

        // Try to wake up the extension and wait for listener
        for (let attempt = 0; attempt < 3; attempt++) {
            console.debug(
                "Browserpass: Waiting for store listener... (attempt",
                attempt + 1,
                "of 3)"
            );

            const wokenUp = await wakeUpExtension();
            if (wokenUp && storeListenerCount > 0) {
                console.debug("Browserpass: Store listener registered after wake-up");
                return Promise.resolve();
            }

            if (storeListenerCount > 0) {
                return Promise.resolve();
            }

            // Wait a bit for listener to register
            await new Promise((resolve) => setTimeout(resolve, 500));

            if (storeListenerCount > 0) {
                return Promise.resolve();
            }
        }

        // Still no listener after attempts - wait with timeout
        if (!storeListenerReadyPromise) {
            console.debug(
                "Browserpass: No store listener after wake-up attempts, waiting with timeout..."
            );
            storeListenerReadyPromise = new Promise((resolve) => {
                storeListenerReadyResolve = resolve;
                // Timeout after 30 seconds to avoid blocking forever
                setTimeout(() => {
                    if (storeListenerReadyResolve === resolve) {
                        console.debug(
                            "Browserpass: Store listener wait timed out after 30 seconds"
                        );
                        resolve();
                        storeListenerReadyResolve = null;
                        storeListenerReadyPromise = null;
                    }
                }, 30000);
            });
        }
        return storeListenerReadyPromise;
    }

    /**
     * Signals that a request listener has become available.
     */
    function signalListenerReady() {
        if (listenerReadyResolve) {
            listenerReadyResolve();
            listenerReadyResolve = null;
            listenerReadyPromise = null;
        }
    }

    /**
     * Signals that a store listener has become available.
     */
    function signalStoreListenerReady() {
        if (storeListenerReadyResolve) {
            storeListenerReadyResolve();
            storeListenerReadyResolve = null;
            storeListenerReadyPromise = null;
        }
    }

    // ============================================================================
    // Synchronous Wait Helper
    // ============================================================================
    // Thunderbird's auth callbacks require synchronous returns, but our
    // credential lookup is async. This bridges the gap by spinning the
    // event loop until the promise resolves.
    // Timeout is set to 60 seconds to allow for hardware GPG key entry.

    /**
     * Synchronously waits for an async operation by spinning the event loop.
     * Used to bridge async credential lookups with Thunderbird's sync auth callbacks.
     * Timeout is set to 60 seconds to allow for hardware GPG key entry.
     *
     * @param {Promise} asyncOp - The async operation to wait for
     * @param {*} fallback - Value to return on timeout or error
     * @param {number} [timeoutMs=60000] - Timeout in milliseconds
     * @param {Function|null} [abortFn] - If provided, exit the spin early when this returns true.
     * @param {Function|null} [onThen] - If provided, called inside the .then() handler with the
     *   resolved value, BEFORE done=true is set in .finally(). Use this to perform side-effects
     *   (e.g. clearing pendingLookups) that nested spin-waiters are blocked on, so they can exit
     *   in the same processNextEvent() turn that delivers the result — avoiding a deadlock where
     *   inner spins block the outer spin from ever checking done=true.
     * @returns {*} The result of asyncOp or fallback on timeout
     */
    function awaitSync(asyncOp, fallback, timeoutMs = 60000, abortFn = null, onThen = null) {
        let done = false;
        let result = fallback;
        let timedOut = false;

        asyncOp
            .then((val) => {
                if (onThen) onThen(val);
                result = val;
            })
            .catch((err) => console.error("Browserpass: Async operation failed:", err))
            .finally(() => {
                done = true;
            });

        // Set a timeout to prevent infinite spinning
        const timeoutHandle = setTimeout(() => {
            timedOut = true;
            console.error("Browserpass: Async operation timeout after", timeoutMs, "ms");
        }, timeoutMs);

        const spinLoop =
            Services.tm.spinEventLoopUntilOrShutdown ||
            (Services.tm.spinEventLoopUntilOrQuit
                ? (fn) => Services.tm.spinEventLoopUntilOrQuit("browserpass:await", fn)
                : null);

        if (spinLoop) {
            spinLoop(() => done || timedOut || (abortFn !== null && abortFn()));
        } else {
            console.error("Browserpass: Warning: No synchronous wait mechanism available");
        }

        clearTimeout(timeoutHandle);
        return result;
    }

    /**
     * Emits credential request to extension and collects responses.
     *
     * @param {object} credentialInfo - The credential request details
     * @returns {Promise<object>} Object with autoSubmit and credentials array
     */
    async function requestCredentials(credentialInfo) {
        if (requestListenerCount === 0) {
            await getListenerReadyPromise();
        }

        if (requestListenerCount === 0) {
            return { autoSubmit: true, credentials: [] };
        }

        const eventData = await passwordRequestEmitter.emit("password-requested", credentialInfo);
        return (eventData || []).reduce(
            (details, currentDetails) => {
                if (!currentDetails) {
                    return details;
                }
                if (currentDetails.autoSubmit !== undefined) {
                    details.autoSubmit &= currentDetails.autoSubmit;
                }
                if (currentDetails.credentials && currentDetails.credentials.length) {
                    details.credentials = details.credentials.concat(currentDetails.credentials);
                }
                return details;
            },
            { autoSubmit: true, credentials: [] }
        );
    }

    /**
     * Synchronously waits for credentials from pass.
     * Blocks the current thread by spinning the event loop until resolved.
     *
     * @param {object} data - Request data with host, login, etc.
     * @returns {object|false} Credentials result or false on timeout
     */
    function waitForCredentials(data, onThen = null) {
        data.openChoiceDialog = true;
        // abortFn: exit the spin as soon as the background conduit closes
        // (requestListenerCount drops to 0).  This allows the caller to retry
        // quickly once the background is revived instead of waiting 60 s for
        // the awaitSync timeout.  Combined with the onThen mechanism (see
        // getRefreshTokenForAccount) this also breaks the nested-spin deadlock
        // that forms when multiple CalDAV calendars call getRefreshToken
        // simultaneously and the background is killed mid-decrypt.
        return awaitSync(
            requestCredentials(data),
            false,
            60000,
            () => requestListenerCount === 0,
            onThen
        );
    }

    /**
     * Stores credentials asynchronously, waiting for listener if needed.
     *
     * @param {object} data - Credential data with host, login, password
     * @returns {Promise<Array>} Array of store results
     */
    async function storeCredentials(data) {
        console.debug("Browserpass: Storing credentials for:", data.host);
        if (storeListenerCount === 0) {
            await getStoreListenerReadyPromise();
        }

        if (storeListenerCount === 0) {
            console.error("Browserpass: No store listeners available - credential not saved");
            return [false];
        }

        return passwordEmitter.emit("password", data);
    }

    /**
     * Synchronously waits for credential store operation to complete.
     *
     * @param {object} data - Credential data with host, login, password
     * @returns {boolean} True if stored successfully
     */
    function waitForPasswordStore(data) {
        const results = awaitSync(storeCredentials(data), [], 35000);
        return (results || []).reduce((alreadyStored, stored) => alreadyStored || stored, false);
    }

    const queuedCredentialKeys = new Set();

    /**
     * Queues credential store for async processing with deduplication.
     *
     * @param {object} data - Credential data with host, login, password
     */
    function queueCredentialStore(data) {
        const key = `${data.login}|${data.host}`;

        if (queuedCredentialKeys.has(key)) {
            return;
        }

        queuedCredentialKeys.add(key);
        data.callback = () => queuedCredentialKeys.delete(key);

        if (storeListenerCount > 0) {
            passwordEmitter.emit("password", data);
        } else {
            pendingStores.push(data);
            startPendingStoreRetry();
        }
    }

    let pendingStoreRetryTimer = null;
    const PENDING_STORE_RETRY_INTERVAL = 2000;
    const PENDING_STORE_MAX_RETRIES = 30;
    let pendingStoreRetryCount = 0;

    /**
     * Starts retry mechanism for pending credential stores.
     * Checks periodically until a store listener becomes available.
     */
    function startPendingStoreRetry() {
        if (pendingStoreRetryTimer) {
            return;
        }
        pendingStoreRetryCount = 0;

        pendingStoreRetryTimer = setInterval(() => {
            pendingStoreRetryCount++;

            if (pendingStores.length === 0) {
                stopPendingStoreRetry();
                return;
            }

            if (pendingStoreRetryCount > PENDING_STORE_MAX_RETRIES) {
                console.warn(
                    "Browserpass: Giving up on",
                    pendingStores.length,
                    "pending credential stores"
                );
                stopPendingStoreRetry();
                return;
            }

            if (storeListenerCount > 0) {
                processPendingStores();
                stopPendingStoreRetry();
                return;
            }

            // Actively try to revive the background so the store listener
            // re-registers. Without this the retry loop only polls passively
            // and the background stays dead, causing the token to be lost
            // after PENDING_STORE_MAX_RETRIES * PENDING_STORE_RETRY_INTERVAL.
            wakeUpExtension().catch(() => {});
        }, PENDING_STORE_RETRY_INTERVAL);
    }

    /**
     * Stops the pending store retry mechanism.
     */
    function stopPendingStoreRetry() {
        if (pendingStoreRetryTimer) {
            clearInterval(pendingStoreRetryTimer);
            pendingStoreRetryTimer = null;
        }
    }

    /**
     * Wakes up the extension's background script.
     * Uses MV3 wakeupBackground() to ensure the background is running.
     *
     * @returns {Promise<boolean>} True if wake-up succeeded
     */
    async function wakeUpExtension() {
        if (!extensionContext) {
            return false;
        }
        try {
            const extension = extensionContext.extension;
            if (extension) {
                await extension.wakeupBackground();
                await new Promise((resolve) => setTimeout(resolve, 100));
                return true;
            }
        } catch (e) {
            console.error("Browserpass: Failed to wake up extension:", e.message);
        }
        return false;
    }

    /**
     * Processes any pending credential store requests.
     * Called when a store listener becomes available.
     */
    async function processPendingStores() {
        if (storeListenerCount === 0 || pendingStores.length === 0) {
            return;
        }
        const pending = pendingStores.splice(0);
        for (const data of pending) {
            await passwordEmitter.emit("password", data);
        }
    }

    // ============================================================================
    // Original Function Storage
    // ============================================================================

    const originalFunctions = [];

    // ============================================================================
    // Credential Helpers
    // ============================================================================

    /**
     * Extracts the first credential from a result set.
     *
     * @param {object} result - Result object with credentials array
     * @returns {object|null} First credential or null if none
     */
    function getFirstCredential(result) {
        if (result && result.credentials && result.credentials.length > 0) {
            return result.credentials[0];
        }
        return null;
    }

    /**
     * Populates Thunderbird's authInfo object with credential data.
     *
     * @param {nsIAuthInformation} authInfo - Thunderbird auth info object
     * @param {object} credential - Credential with login and password
     */
    function fillAuthInfo(authInfo, credential) {
        if (authInfo && credential) {
            if (credential.login) {
                authInfo.username = credential.login;
            }
            authInfo.password = credential.password;
        }
    }

    /**
     * Sets .value property on XPCOM out-parameter objects.
     *
     * @param {object} obj - XPCOM out-parameter object
     * @param {*} value - Value to set
     */
    function setObjectValue(obj, value) {
        if (obj && typeof obj === "object" && "value" in obj) {
            obj.value = value;
        }
    }

    /**
     * Extracts host and login from authentication realm string.
     *
     * @param {MsgAuthPrompt} prompter - The prompter instance
     * @param {string} realm - The authentication realm
     * @returns {{host: string, login: string}} Parsed host and login
     */
    function parseRealm(prompter, realm) {
        let host = realm;
        let login = "";

        if (prompter._getRealmInfo) {
            try {
                const [realmHost, , realmLogin] = prompter._getRealmInfo(realm);
                if (realmHost) {
                    host = realmHost.replace(/^mailbox:\/\//, "pop3://");
                }
                if (realmLogin) {
                    login = decodeURIComponent(realmLogin);
                }
            } catch (e) {
                console.error("Browserpass: _getRealmInfo failed:", e.message);
            }
        }

        return { host, login };
    }

    // ============================================================================
    // Failed Authentication Tracking
    // ============================================================================
    // Track recently failed authentication attempts to allow manual password entry
    const failedAuthAttempts = new Map();
    const lastPromptTime = new Map();
    const FAILED_AUTH_TIMEOUT = 60000;
    const PROMPT_RETRY_THRESHOLD = 30000;

    /**
     * Records a failed authentication attempt with auto-expiry.
     *
     * @param {string} host - The host that failed authentication
     * @param {string} login - The username that failed
     */
    function markAuthenticationFailed(host, login) {
        const key = `${host}|${login}`;
        failedAuthAttempts.set(key, Date.now());

        setTimeout(() => {
            if (failedAuthAttempts.has(key)) {
                failedAuthAttempts.delete(key);
            }
        }, FAILED_AUTH_TIMEOUT);
    }

    /**
     * Detects if this is a repeated prompt (indicates auth failure).
     *
     * @param {string} host - The host being prompted
     * @param {string} login - The username being prompted
     * @returns {boolean} True if this is a repeated prompt
     */
    function checkForRepeatedPrompt(host, login) {
        const key = `${host}|${login}`;
        const now = Date.now();
        const lastTime = lastPromptTime.get(key);

        lastPromptTime.set(key, now);

        // If we were prompted for the same credential recently, it means auth failed
        if (lastTime && now - lastTime < PROMPT_RETRY_THRESHOLD) {
            console.error(
                "Browserpass: Repeated prompt detected within",
                now - lastTime,
                "ms - marking as failed"
            );
            markAuthenticationFailed(host, login);
            return true;
        }

        return false;
    }

    /**
     * Checks if there was a recent auth failure for this host/login.
     *
     * @param {string} host - The host to check
     * @param {string} login - The username to check
     * @returns {boolean} True if there was a recent failure
     */
    function hasRecentAuthFailure(host, login) {
        const key = `${host}|${login}`;
        const failedTime = failedAuthAttempts.get(key);
        if (failedTime && Date.now() - failedTime < FAILED_AUTH_TIMEOUT) {
            return true;
        }
        return false;
    }

    /**
     * Clears auth failure tracking after successful authentication.
     *
     * @param {string} host - The host to clear
     * @param {string} login - The username to clear
     */
    function clearAuthFailure(host, login) {
        const key = `${host}|${login}`;
        failedAuthAttempts.delete(key);
        lastPromptTime.delete(key);
    }

    // ============================================================================
    // OAuth Token Cache
    // ============================================================================
    // Session-only cache so each pass file is decrypted at most once per session.
    // Pass is the sole credential store; tokens are never written to loginManager.

    const tokenCache = new Map();
    // Tracks keys for which a GPG decrypt is currently in progress.
    // Prevents concurrent CalDAV calendar syncs from each triggering a separate
    // YubiKey touch for the same OAuth token.
    const pendingLookups = new Set();

    /**
     * Generates cache key for OAuth token storage.
     *
     * @param {string} username - The account username
     * @param {string} origin - The login origin
     * @returns {string} The cache key
     */
    function getCacheKey(username, origin) {
        return `${username}|${origin}`;
    }

    /**
     * Caches OAuth token for the current session.
     *
     * @param {string} key - The cache key
     * @param {string} token - The token to cache
     */
    function setCachedToken(key, token) {
        tokenCache.set(key, token);
    }

    /**
     * Retrieves cached OAuth token if available.
     *
     * @param {string} key - The cache key
     * @returns {string|null} The cached token or null
     */
    function getCachedToken(key) {
        return tokenCache.get(key) || null;
    }

    /**
     * Checks if a token is already cached (used to prevent redundant storage).
     *
     * @param {string} key - The cache key
     * @param {string} token - The token to check
     * @returns {boolean} True if token matches cached value
     */
    function isTokenCached(key, token) {
        return getCachedToken(key) === token;
    }

    /**
     * Fetches OAuth refresh token from cache or pass storage.
     *
     * @param {string} username - The account username
     * @param {string} loginOrigin - The login origin (e.g., oauth://accounts.google.com)
     * @returns {string|null} The refresh token or null
     */
    function getRefreshTokenForAccount(username, loginOrigin) {
        const key = getCacheKey(username, loginOrigin);

        // Direct spin function reused for two purposes below:
        // 1. Spin-waiting for the primary lookup to finish (pendingLookups).
        // 2. Waiting for the background to come up before retrying.
        const _spinFn =
            Services.tm.spinEventLoopUntilOrShutdown ||
            (Services.tm.spinEventLoopUntilOrQuit
                ? (fn) => Services.tm.spinEventLoopUntilOrQuit("browserpass:pendingwait", fn)
                : null);

        // Up to 6 passes: spin-waiters consume passes while the primary caller
        // decrypts via GPG; the primary retries if the background was unloaded
        // mid-decrypt.  Typically resolves in 1-2 passes.
        for (let pass = 0; pass < 6; pass++) {
            // Fast path: cache already populated by a previous lookup.
            const cached = getCachedToken(key);
            if (cached) {
                console.debug(
                    "Browserpass: OAuth token found in cache for:",
                    username,
                    "origin:",
                    loginOrigin
                );
                return cached;
            }

            // Another caller already holds the primary role — spin until it
            // finishes (success) or gives up.  On the next pass we either read
            // the token from cache or become the new primary.
            //
            // DEADLOCK PREVENTION: also exit when requestListenerCount === 0.
            // When the background is killed while the primary's awaitSync is
            // spinning (level 1), the waiter spins are at level 2+.  Without
            // this extra condition the waiters can only exit via their 90-second
            // deadline, which keeps level 1 stuck and the whole chain deadlocked
            // for 90 s.  Exiting on background-death lets the levels unwind
            // quickly; the primary's abortFn (requestListenerCount===0, also
            // checked in waitForCredentials) exits level 1 as well.
            if (pendingLookups.has(key)) {
                console.debug(
                    "Browserpass: OAuth lookup in progress for:",
                    username,
                    "- waiting for result"
                );
                const deadline = Date.now() + 90000;
                if (_spinFn) {
                    _spinFn(
                        () =>
                            !pendingLookups.has(key) ||
                            requestListenerCount === 0 ||
                            Date.now() > deadline
                    );
                }
                continue;
            }

            // Wait for the background to be available before becoming primary.
            if (requestListenerCount === 0) {
                console.debug(
                    "Browserpass: No listener available, waiting for background...",
                    pass > 0 ? `(retry ${pass})` : ""
                );
                const deadline = Date.now() + 30000;
                if (_spinFn) {
                    _spinFn(() => requestListenerCount > 0 || Date.now() > deadline);
                }
            }
            if (requestListenerCount === 0) {
                console.debug("Browserpass: Background unavailable, cannot look up OAuth token");
                break;
            }

            // We are the primary for this pass.
            console.debug(
                "Browserpass: Looking up OAuth token - user:",
                username,
                "origin:",
                loginOrigin,
                pass > 0 ? `(retry ${pass})` : ""
            );

            pendingLookups.add(key);
            let credResult = null;

            // onThen runs INSIDE awaitSync's .then() — as a microtask, BEFORE
            // done=true is set in .finally().  Deleting from pendingLookups here
            // (rather than in a try/finally around waitForCredentials) means that
            // nested spin-waiters' _spinFn(!pendingLookups.has(key)) condition
            // becomes true during the SAME processNextEvent() call that delivers
            // the GPG result, so they can exit before the outer awaitSync spin
            // (level 1) checks done=true — breaking the deadlock.
            const onThen = (credentials) => {
                const c = getFirstCredential(credentials);
                if (c && typeof c.password === "string") {
                    setCachedToken(key, c.password);
                    credResult = c.password;
                    console.debug(
                        "Browserpass: Found OAuth token in pass for:",
                        username,
                        "origin:",
                        loginOrigin
                    );
                } else {
                    console.debug(
                        "Browserpass: OAuth token NOT found in pass for:",
                        username,
                        "origin:",
                        loginOrigin
                    );
                }
                // Must be last: unblocks nested spin-waiters.
                pendingLookups.delete(key);
            };

            waitForCredentials({ login: username, host: loginOrigin }, onThen);

            // If abortFn fired (background died before .then could run),
            // onThen may not have deleted pendingLookups yet — clean up now.
            pendingLookups.delete(key);

            if (credResult !== null) {
                return credResult;
            }
            // If the background is alive, the token is genuinely not in pass.
            // No point retrying - break immediately.
            if (requestListenerCount > 0) {
                console.debug(
                    "Browserpass: OAuth token not in pass for:",
                    username,
                    "- not retrying"
                );
                break;
            }
            // Background died during the lookup - retry once the background revives.
        }

        return null;
    }

    // ============================================================================
    // MsgAuthPrompt Hooks (IMAP/SMTP/POP3/NNTP)
    // ============================================================================

    const PASSWORD_SAVE_DISABLED = 0; // Prevents Thunderbird from saving passwords

    // Hooks Thunderbird's auth prompts to intercept IMAP/SMTP/POP3/NNTP credentials
    function setupMsgAuthPromptHooks() {
        try {
            const { MsgAuthPrompt } = ChromeUtils.importESModule(
                "resource:///modules/MsgAsyncPrompter.sys.mjs"
            );

            if (!MsgAuthPrompt || !MsgAuthPrompt.prototype) {
                console.error("Browserpass: MsgAuthPrompt not available");
                return;
            }

            // Hook promptAuth
            if (MsgAuthPrompt.prototype.promptAuth) {
                const originalPromptAuth = MsgAuthPrompt.prototype.promptAuth;
                originalFunctions.push({
                    object: MsgAuthPrompt.prototype,
                    name: "promptAuth",
                    original: originalPromptAuth,
                });

                MsgAuthPrompt.prototype.promptAuth = function (
                    channel,
                    level,
                    authInfo,
                    checkboxLabel,
                    checkValue
                ) {
                    const uri = channel?.URI;
                    const scheme = uri?.scheme;
                    const host = uri?.host;
                    const port = uri?.port;

                    console.debug("Browserpass: MsgAuthPrompt.promptAuth:", {
                        scheme,
                        host,
                        port,
                        username: authInfo?.username,
                    });

                    if (scheme && ["imap", "smtp", "pop3", "nntp"].includes(scheme)) {
                        const hostname = port && port > 0 ? `${host}:${port}` : host;
                        const fullHost = `${scheme}://${hostname}`;

                        const result = waitForCredentials({
                            host: fullHost,
                            login: authInfo?.username || "",
                            loginChangeable: true,
                        });

                        const cred = getFirstCredential(result);
                        if (cred) {
                            console.debug("Browserpass: Got credentials from pass for:", fullHost);
                            fillAuthInfo(authInfo, cred);
                            return true;
                        }

                        console.debug(
                            "Browserpass: No credentials found, falling through to original"
                        );

                        const accepted = originalPromptAuth.call(
                            this,
                            channel,
                            level,
                            authInfo,
                            checkboxLabel,
                            PASSWORD_SAVE_DISABLED
                        );

                        if (accepted && authInfo?.password) {
                            console.log("Browserpass: Saving credentials to pass");
                            waitForPasswordStore({
                                host: fullHost,
                                login: authInfo.username || "",
                                password: authInfo.password,
                            });
                        }

                        return accepted;
                    }

                    return originalPromptAuth.call(
                        this,
                        channel,
                        level,
                        authInfo,
                        checkboxLabel,
                        checkValue
                    );
                };
            }

            // Hook promptPassword
            if (MsgAuthPrompt.prototype.promptPassword) {
                const originalPromptPassword = MsgAuthPrompt.prototype.promptPassword;
                originalFunctions.push({
                    object: MsgAuthPrompt.prototype,
                    name: "promptPassword",
                    original: originalPromptPassword,
                });

                MsgAuthPrompt.prototype.promptPassword = function (
                    dialogTitle,
                    text,
                    realm,
                    savePassword,
                    passwordObj
                ) {
                    const { host, login } = parseRealm(this, realm);

                    // Check if this is a repeated prompt (auth failure) BEFORE fetching from pass
                    const isRepeatedPrompt = checkForRepeatedPrompt(host, login);

                    if (isRepeatedPrompt || hasRecentAuthFailure(host, login)) {
                        console.log(
                            "Browserpass: Auth failure detected - prompting for new password"
                        );
                        const accepted = originalPromptPassword.call(
                            this,
                            dialogTitle,
                            text,
                            realm,
                            PASSWORD_SAVE_DISABLED,
                            passwordObj
                        );

                        if (accepted && passwordObj?.value) {
                            console.debug(
                                "Browserpass: New password entered - saving to pass and clearing failure marker"
                            );
                            clearAuthFailure(host, login);
                            waitForPasswordStore({
                                host: host,
                                login: login,
                                password: passwordObj.value,
                            });
                        }

                        return accepted;
                    }

                    const result = waitForCredentials({
                        host: host,
                        login: login,
                        loginChangeable: false,
                    });

                    const cred = getFirstCredential(result);
                    if (cred) {
                        console.debug("Browserpass: Got credentials from pass for:", host);
                        setObjectValue(passwordObj, cred.password);
                        return true;
                    }

                    const accepted = originalPromptPassword.call(
                        this,
                        dialogTitle,
                        text,
                        realm,
                        PASSWORD_SAVE_DISABLED,
                        passwordObj
                    );

                    // If user clicked OK and entered a password, save it to pass
                    if (accepted && passwordObj?.value) {
                        console.log("Browserpass: Saving password to pass");
                        waitForPasswordStore({
                            host: host,
                            login: login,
                            password: passwordObj.value,
                        });
                    }

                    return accepted;
                };
            }

            // Hook promptUsernameAndPassword
            if (MsgAuthPrompt.prototype.promptUsernameAndPassword) {
                const originalPromptUsernameAndPassword =
                    MsgAuthPrompt.prototype.promptUsernameAndPassword;
                originalFunctions.push({
                    object: MsgAuthPrompt.prototype,
                    name: "promptUsernameAndPassword",
                    original: originalPromptUsernameAndPassword,
                });

                MsgAuthPrompt.prototype.promptUsernameAndPassword = function (
                    dialogTitle,
                    text,
                    realm,
                    savePassword,
                    usernameObj,
                    passwordObj
                ) {
                    console.debug("Browserpass: MsgAuthPrompt.promptUsernameAndPassword:", {
                        dialogTitle,
                        realm,
                        savePassword,
                    });

                    const { host, login } = parseRealm(this, realm);
                    const result = waitForCredentials({
                        host: host,
                        login: login,
                        loginChangeable: true,
                    });

                    const cred = getFirstCredential(result);
                    if (cred) {
                        console.debug("Browserpass: Got credentials from pass for:", host);
                        setObjectValue(usernameObj, cred.login);
                        setObjectValue(passwordObj, cred.password);
                        return true;
                    }

                    const accepted = originalPromptUsernameAndPassword.call(
                        this,
                        dialogTitle,
                        text,
                        realm,
                        PASSWORD_SAVE_DISABLED,
                        usernameObj,
                        passwordObj
                    );

                    console.debug("Browserpass: promptUsernameAndPassword result:", {
                        accepted,
                        hasUsername: !!usernameObj?.value,
                        hasPassword: !!passwordObj?.value,
                        originalSavePassword: savePassword,
                    });

                    if (accepted && passwordObj?.value) {
                        const username = usernameObj?.value || login;
                        console.log("Browserpass: Saving credentials to pass");
                        waitForPasswordStore({
                            host: host,
                            login: username,
                            password: passwordObj.value,
                        });
                    }

                    return accepted;
                };
            }

            console.debug("Browserpass: MsgAuthPrompt hooks setup complete");
        } catch (error) {
            console.error("Browserpass: Failed to setup MsgAuthPrompt hooks:", error.message);
        }
    }

    // ============================================================================
    // OAuth2Module Hooks (CalDAV/CardDAV)
    // ============================================================================

    // Hooks OAuth2Module for CalDAV/CardDAV token storage
    function setupOAuth2ModuleHooks() {
        try {
            const { OAuth2Module } = ChromeUtils.importESModule(
                "resource:///modules/OAuth2Module.sys.mjs"
            );

            if (!OAuth2Module || !OAuth2Module.prototype) {
                console.error("Browserpass: OAuth2Module not available");
                return;
            }

            // Hook getRefreshToken
            if (typeof OAuth2Module.prototype.getRefreshToken === "function") {
                const originalGetRefreshToken = OAuth2Module.prototype.getRefreshToken;
                originalFunctions.push({
                    object: OAuth2Module.prototype,
                    name: "getRefreshToken",
                    original: originalGetRefreshToken,
                });

                OAuth2Module.prototype.getRefreshToken = function () {
                    console.debug(
                        "Browserpass: getRefreshToken called - user:",
                        this._username,
                        "origin:",
                        this._loginOrigin,
                        "_scope:",
                        this._scope,
                        "_requiredScopes:",
                        this._requiredScopes,
                        "accountSetupInProgress:",
                        accountSetupInProgress
                    );

                    // Always check in-memory cache first, even during account setup.
                    // setRefreshToken populates the cache when the OAuth exchange completes.
                    // getRefreshToken must be able to return that cached token so Thunderbird
                    // can verify the newly established account (account setup would otherwise
                    // fail because accountSetupInProgress blocks the pass lookup below).
                    const cacheKey = getCacheKey(this._username, this._loginOrigin);
                    const cachedToken = getCachedToken(cacheKey);
                    if (cachedToken) {
                        console.debug(
                            "Browserpass: getRefreshToken - returning cached token for:",
                            this._username
                        );
                        return cachedToken;
                    }

                    if (accountSetupInProgress) {
                        console.debug(
                            "Browserpass: Skipping token lookup during account setup for:",
                            this._loginOrigin
                        );
                        return undefined;
                    }

                    const token = getRefreshTokenForAccount(this._username, this._loginOrigin);
                    if (token !== null) {
                        console.debug(
                            "Browserpass: getRefreshToken returning token from pass for:",
                            this._username
                        );
                        return token;
                    }

                    // Not found in pass - let Thunderbird handle it naturally
                    // (e.g. show an OAuth window so the user can authenticate).
                    return originalGetRefreshToken.call(this);
                };
            }

            // Hook setRefreshToken
            if (typeof OAuth2Module.prototype.setRefreshToken === "function") {
                const originalSetRefreshToken = OAuth2Module.prototype.setRefreshToken;
                originalFunctions.push({
                    object: OAuth2Module.prototype,
                    name: "setRefreshToken",
                    original: originalSetRefreshToken,
                });

                OAuth2Module.prototype.setRefreshToken = async function (refreshToken) {
                    if (!refreshToken) {
                        // Token cleared by Thunderbird (e.g. auth failure) - propagate the
                        // clear to loginManager so stale entries don't linger there.
                        return await originalSetRefreshToken.call(this, refreshToken);
                    }

                    const key = getCacheKey(this._username, this._loginOrigin);

                    // Token already in cache and presumably already in pass - no-op.
                    if (isTokenCached(key, refreshToken)) {
                        console.debug(
                            "Browserpass: setRefreshToken - token matches cache, skipping:",
                            this._username
                        );
                        return;
                    }

                    const scope = this._oauth?.scope || this._scope || "";

                    // Check if token already exists in pass.
                    const existingToken = getRefreshTokenForAccount(
                        this._username,
                        this._loginOrigin
                    );
                    if (existingToken === refreshToken) {
                        console.debug(
                            "Browserpass: setRefreshToken - token matches pass storage:",
                            this._username
                        );
                        setCachedToken(key, refreshToken);
                        return;
                    }

                    // Token is new or different - cache it and queue save to pass.
                    setCachedToken(key, refreshToken);

                    console.debug(
                        "Browserpass: New/updated OAuth token for:",
                        this._username,
                        "scope:",
                        scope
                    );

                    queueCredentialStore({
                        host: this._loginOrigin,
                        login: this._username,
                        password: refreshToken,
                        scope: scope,
                    });
                    // Do NOT call originalSetRefreshToken - we do not write tokens to
                    // Thunderbird's loginManager. Pass is the sole credential store.
                };
            }

            // Hook OAuth2.prototype.connect to populate refreshToken before connect().
            //
            // Root cause of TB bug 2008995 startup OAuth windows:
            //   - getRefreshToken() is called ONLY inside initFromHostname() when a NEW
            //     OAuth2 object is created. All Google calendars SHARE one cached OAuth2
            //     instance (oAuth2Objects in OAuth2Module.sys.mjs).
            //   - That shared instance is created BEFORE our hook is installed (startup
            //     race), so its refreshToken is set to "" from the empty loginManager.
            //   - OAuth2Module.connect() calls this._oauth.connect() WITHOUT calling
            //     getRefreshToken() again — so the empty refreshToken persists and
            //     connect() opens an OAuth window on every sync attempt.
            //
            // Hooking connect() lets us populate this.refreshToken from pass/cache
            // just before the check, transparently, for every connect() invocation.
            try {
                const { OAuth2 } = ChromeUtils.importESModule("resource:///modules/OAuth2.sys.mjs");

                if (OAuth2?.prototype && typeof OAuth2.prototype.connect === "function") {
                    const originalOAuth2Connect = OAuth2.prototype.connect;
                    originalFunctions.push({
                        object: OAuth2.prototype,
                        name: "connect",
                        original: originalOAuth2Connect,
                    });

                    OAuth2.prototype.connect = function (aWithUI, aRefresh) {
                        if (!this.refreshToken && this.username) {
                            try {
                                const host = new URL(this.authorizationEndpoint).hostname;
                                const oauthOrigin = `oauth://${host}`;
                                const token = getRefreshTokenForAccount(this.username, oauthOrigin);
                                if (token) {
                                    console.debug(
                                        "Browserpass: Populated refresh token from pass for:",
                                        this.username
                                    );
                                    this.refreshToken = token;
                                }
                            } catch (e) {
                                // Don't block the OAuth flow if our lookup fails
                            }
                        }
                        return originalOAuth2Connect.call(this, aWithUI, aRefresh);
                    };
                }
            } catch (e) {
                console.error("Browserpass: Failed to hook OAuth2.prototype.connect:", e.message);
            }

            console.debug("Browserpass: OAuth2Module hooks setup complete");
        } catch (error) {
            console.error("Browserpass: Failed to setup OAuth2Module hooks:", error.message);
        }
    }

    // ============================================================================
    // OAuth Browser Window Hooks (clipboard-based autofill)
    // ============================================================================

    // Handles OAuth browser windows with clipboard-based credential autofill
    function setupBrowserRequestHooks() {
        try {
            const { ExtensionSupport } = ChromeUtils.importESModule(
                "resource:///modules/ExtensionSupport.sys.mjs"
            );

            // Track last copied text and timer for auto-clearing
            let lastCopiedText = null;
            let clearClipboardTimer = null;

            function readFromClipboard() {
                try {
                    const clipboard = Cc["@mozilla.org/widget/clipboard;1"].getService(
                        Ci.nsIClipboard
                    );
                    const transferable = Cc["@mozilla.org/widget/transferable;1"].createInstance(
                        Ci.nsITransferable
                    );

                    transferable.init(null);
                    transferable.addDataFlavor("text/plain");

                    clipboard.getData(transferable, Ci.nsIClipboard.kGlobalClipboard);

                    const data = {};
                    transferable.getTransferData("text/plain", data);

                    if (data.value) {
                        return data.value.QueryInterface(Ci.nsISupportsString).data;
                    }
                    return "";
                } catch (e) {
                    console.error("Browserpass: Clipboard read failed:", e.message);
                    return "";
                }
            }

            function copyToClipboard(text, autoClear = true) {
                try {
                    const clipboardHelper = Cc["@mozilla.org/widget/clipboardhelper;1"].getService(
                        Ci.nsIClipboardHelper
                    );
                    clipboardHelper.copyString(text);

                    // Schedule clipboard clearing after 60 seconds (like Firefox implementation)
                    if (autoClear && text) {
                        lastCopiedText = text;
                        if (clearClipboardTimer) {
                            clearClipboardTimer.cancel();
                        }
                        clearClipboardTimer = Cc["@mozilla.org/timer;1"].createInstance(
                            Ci.nsITimer
                        );
                        clearClipboardTimer.initWithCallback(
                            {
                                notify: function () {
                                    try {
                                        // Only clear if clipboard still contains what we copied
                                        const current = readFromClipboard();
                                        if (current === lastCopiedText) {
                                            clipboardHelper.copyString("");
                                            console.log(
                                                "Browserpass: Clipboard auto-cleared after 60 seconds"
                                            );
                                        } else {
                                            console.log(
                                                "Browserpass: Clipboard changed, not clearing"
                                            );
                                        }
                                        lastCopiedText = null;
                                        clearClipboardTimer = null;
                                    } catch (e) {
                                        console.error(
                                            "Browserpass: Clipboard clear failed:",
                                            e.message
                                        );
                                    }
                                },
                            },
                            60000,
                            Ci.nsITimer.TYPE_ONE_SHOT
                        );
                    }

                    return true;
                } catch (e) {
                    console.error("Browserpass: Clipboard copy failed:", e.message);
                    return false;
                }
            }

            function showHintBanner(window, text) {
                // Reuse existing banner rather than stacking multiple banners.
                let banner = window.document.getElementById("browserpass-hint");
                if (banner) {
                    banner.textContent = text;
                    return;
                }
                try {
                    banner = window.document.createElementNS("http://www.w3.org/1999/xhtml", "div");
                    banner.id = "browserpass-hint";
                    banner.setAttribute(
                        "style",
                        "background:#1a1a2e;color:#cce;padding:6px 12px;font-size:12px;" +
                            "font-family:monospace;line-height:1.5;border-bottom:2px solid #4444cc"
                    );
                    banner.textContent = text;
                    const frame = window.document.getElementById("requestFrame");
                    if (frame && frame.parentNode) {
                        frame.parentNode.insertBefore(banner, frame);
                    }
                } catch (e) {
                    console.warn("Browserpass: Could not show hint banner:", e.message);
                }
            }

            function getCredentialInfoFromWindow(window) {
                try {
                    const request = window.arguments[0]?.wrappedJSObject;
                    if (!request || !request.url) {
                        return null;
                    }

                    const url = Services.io.newURI(request.url);
                    let login = "";
                    let scope = "";

                    if (request.oauth?.extraAuthParams) {
                        const params = request.oauth.extraAuthParams;
                        for (let i = 0; i < params.length; i++) {
                            if (Array.isArray(params[i])) {
                                if (params[i][0] === "login_hint") {
                                    login = params[i][1];
                                } else if (params[i][0] === "scope") {
                                    scope = params[i][1];
                                }
                            } else if (params[i] === "login_hint" && params[i + 1]) {
                                login = params[i + 1];
                            }
                        }
                    }

                    // Try to extract scope from URL if not found in extraAuthParams
                    if (!scope && request.url.includes("scope=")) {
                        const match = request.url.match(/scope=([^&]+)/);
                        if (match) {
                            scope = decodeURIComponent(match[1]);
                        }
                    }

                    if (!login && request.url.includes("login_hint=")) {
                        const match = request.url.match(/login_hint=([^&]+)/);
                        if (match) {
                            login = decodeURIComponent(match[1]);
                        }
                    }

                    console.debug(
                        "Browserpass: OAuth window credential info - host:",
                        url.host,
                        "login:",
                        login,
                        "scope:",
                        scope
                    );

                    return { host: url.host, login: login, scope: scope };
                } catch (e) {
                    console.error(
                        "Browserpass: Error getting credential info from window:",
                        e.message
                    );
                    return null;
                }
            }

            function handleOAuthWindow(window, credentialInfo) {
                const scopeStr = credentialInfo.scope ? ` (scope: ${credentialInfo.scope})` : "";

                // TB bug 2008995: CalDAV fires getRefreshToken before our hook is
                // installed, causing an OAuth window to open at startup. By the time
                // setupBrowserRequestHooks() runs, that window is already open and
                // onLoadWindow fires immediately. We must NOT handle it here because:
                //   1. The background is not yet connected, so waitForCredentials would
                //      spin the event loop and block startup (hang).
                //   2. Setting accountSetupInProgress=true would block all subsequent
                //      getRefreshToken lookups until the window is dismissed, causing
                //      a second OAuth window when the user clicks Sync.
                // Leave the flag unset; the user can dismiss the startup window.
                // https://bugzilla.mozilla.org/show_bug.cgi?id=2008995
                if (!startupReady) {
                    console.debug(
                        "Browserpass: Ignoring OAuth window opened before hooks were ready (TB bug 2008995):",
                        credentialInfo.host
                    );
                    return;
                }

                console.debug(
                    "Browserpass: OAuth browser window opened for:",
                    credentialInfo.host + scopeStr
                );

                // Genuine new-account OAuth setup: block other token lookups while
                // the user completes the OAuth dance in the browser window.
                // (When the token is already in pass, OAuth2.prototype.connect populates
                // this.refreshToken before connect() runs, so no window opens and this
                // code is never reached for "known account" restarts.)
                accountSetupInProgress = true;

                // Clear setup flag after 2 minutes (setup should be done by then)
                setTimeout(() => {
                    accountSetupInProgress = false;
                    console.debug(
                        "Browserpass: Account setup phase timeout - re-enabling token injection"
                    );
                }, 120000);

                const offeredHosts = new Set();
                const requestFrame = window.document.getElementById("requestFrame");

                if (!requestFrame) {
                    console.debug("Browserpass: No requestFrame found");
                    return;
                }

                function offerCredentialsForHost(host) {
                    if (offeredHosts.has(host)) {
                        return;
                    }
                    offeredHosts.add(host);

                    const credRequest = {
                        host: `https://${host}`,
                        login: credentialInfo.login || "",
                        loginChangeable: true,
                        openChoiceDialog: true,
                    };

                    const result = waitForCredentials(credRequest);

                    const cred = getFirstCredential(result);
                    if (cred) {
                        const scopeStr = credentialInfo.scope
                            ? ` (scope: ${credentialInfo.scope})`
                            : "";
                        console.debug(
                            "Browserpass: Found OAuth credentials for:",
                            host + scopeStr,
                            "- login:",
                            cred.login
                        );

                        if (copyToClipboard(cred.login)) {
                            console.debug("Browserpass: Username copied to clipboard:", cred.login);
                            showHintBanner(
                                window,
                                `Browserpass: Username copied \u2014 paste with Ctrl+V\n` +
                                    `Then press Ctrl+Shift+P to copy password, Ctrl+V to paste`
                            );
                        }

                        window._browserpassPassword = cred.password;
                        window._browserpassLogin = cred.login;

                        // Cache the token with OAuth origin format so setRefreshToken won't re-store it
                        // credentialInfo.host is the OAuth provider (e.g., accounts.google.com)
                        if (cred.password) {
                            const oauthOrigin = `oauth://${credentialInfo.host}`;
                            const key = getCacheKey(cred.login, oauthOrigin);
                            setCachedToken(key, cred.password);
                        }
                    } else {
                        const scopeStr = credentialInfo.scope
                            ? ` (scope: ${credentialInfo.scope})`
                            : "";
                        console.log("Browserpass: No credentials found for:", host + scopeStr);
                    }
                }

                const progressListener = {
                    QueryInterface: ChromeUtils.generateQI([
                        Ci.nsIWebProgressListener,
                        Ci.nsISupportsWeakReference,
                    ]),
                    onLocationChange: function (_webProgress, _request, location) {
                        if (!location) {
                            return;
                        }

                        // location.host can throw for certain URI types (about:, data:, etc.)
                        let host;
                        try {
                            host = location.host;
                        } catch (e) {
                            return; // URI doesn't have a host
                        }

                        if (!host || host.includes("gstatic") || host.includes("doubleclick")) {
                            return;
                        }

                        offerCredentialsForHost(host);
                    },
                    onStateChange: function () {},
                    onProgressChange: function () {},
                    onStatusChange: function () {},
                    onSecurityChange: function () {},
                };

                try {
                    requestFrame.addProgressListener(
                        progressListener,
                        Ci.nsIWebProgress.NOTIFY_LOCATION
                    );
                } catch (e) {
                    console.error("Browserpass: Error adding location listener:", e.message);
                }

                window.addEventListener("keydown", function (event) {
                    if (event.ctrlKey && event.shiftKey && event.key === "P") {
                        event.preventDefault();
                        if (
                            window._browserpassPassword &&
                            copyToClipboard(window._browserpassPassword)
                        ) {
                            console.debug("Browserpass: Password copied to clipboard");
                            showHintBanner(
                                window,
                                "Browserpass: Password copied \u2014 paste with Ctrl+V"
                            );
                        }
                    } else if (event.ctrlKey && event.shiftKey && event.key === "U") {
                        event.preventDefault();
                        if (window._browserpassLogin && copyToClipboard(window._browserpassLogin)) {
                            console.debug(
                                "Browserpass: Username copied to clipboard:",
                                window._browserpassLogin
                            );
                            showHintBanner(
                                window,
                                "Browserpass: Username copied \u2014 paste with Ctrl+V"
                            );
                        }
                    }
                });

                window._browserpassProgressListener = progressListener;
            }

            ExtensionSupport.registerWindowListener("browserpass-oauth-window", {
                chromeURLs: [
                    "chrome://messenger/content/browserRequest.xhtml",
                    "chrome://gdata-provider/content/browserRequest.xul",
                ],
                onLoadWindow: function (window) {
                    const credentialInfo = getCredentialInfoFromWindow(window);
                    if (credentialInfo) {
                        handleOAuthWindow(window, credentialInfo);
                    }
                },
                onUnloadWindow: function (window) {
                    if (window._browserpassProgressListener) {
                        try {
                            const requestFrame = window.document.getElementById("requestFrame");
                            if (requestFrame) {
                                requestFrame.removeProgressListener(
                                    window._browserpassProgressListener
                                );
                            }
                        } catch (e) {
                            // Window may already be closed
                        }
                    }

                    accountSetupInProgress = false;
                    console.debug(
                        "Browserpass: OAuth window closed - account setup phase complete"
                    );
                },
            });

            originalFunctions.push({
                object: null,
                name: "browserpass-oauth-window",
                cleanup: function () {
                    ExtensionSupport.unregisterWindowListener("browserpass-oauth-window");
                },
            });

            console.debug("Browserpass: BrowserRequest hooks setup complete");
        } catch (error) {
            console.error("Browserpass: Failed to setup BrowserRequest hooks:", error.message);
        }
    }

    // ============================================================================
    // Hook Initialization
    // ============================================================================

    let hooksInitialized = false;

    function initializeHooks() {
        if (hooksInitialized) {
            return;
        }
        hooksInitialized = true;

        setupMsgAuthPromptHooks();
        setupOAuth2ModuleHooks();
        setupBrowserRequestHooks();

        console.debug("Browserpass: All hooks initialized");
    }

    initializeHooks();

    console.debug("Browserpass: Experimental API initialized");

    // ============================================================================
    // Extension API Export
    // ============================================================================

    exports.credentials = class extends ExtensionCommon.ExtensionAPI {
        getAPI(context) {
            // Store context for wake-up calls
            extensionContext = context;
            console.debug("Browserpass: Extension context stored for wake-up capability");

            // Process any pending stores that accumulated before context was available
            if (pendingStores.length > 0) {
                console.debug(
                    "Browserpass: Found",
                    pendingStores.length,
                    "pending stores on context init"
                );
            }

            return {
                credentials: {
                    /**
                     * Returns all credentials stored in Thunderbird's password manager.
                     * Used for migration to pass.
                     */
                    getThunderbirdSavedLogins: async function () {
                        const logins = Services.logins.findLogins("", null, "");
                        return logins.map((login) => ({
                            host: login.origin || login.hostname,
                            login: login.username,
                            password: login.password,
                            httpRealm: login.httpRealm,
                            formActionOrigin: login.formActionOrigin,
                        }));
                    },

                    /**
                     * Event fired when Thunderbird requests credentials.
                     *
                     * Triggered by: auth prompts (IMAP/SMTP/POP3), token lookups, account setup
                     * Listener returns: array of matching credentials from pass
                     */
                    onCredentialRequested: new ExtensionCommon.EventManager({
                        context,
                        name: "credentials.onCredentialRequested",
                        register(fire) {
                            // Callback receives (event, credentialInfo) from emit()
                            async function callback(event, credentialInfo) {
                                try {
                                    return await fire.async(credentialInfo);
                                } catch (e) {
                                    console.error(e);
                                    return false;
                                }
                            }

                            passwordRequestEmitter.on("password-requested", callback);
                            requestListenerCount++;
                            console.debug(
                                "Browserpass: Request listener added, count:",
                                requestListenerCount
                            );

                            // Signal that listener is ready
                            if (requestListenerCount === 1) {
                                signalListenerReady();
                                // Extension is ready - apply the user's startup state
                                offlineControl.applyStartupState();
                            }

                            return function () {
                                passwordRequestEmitter.off("password-requested", callback);
                                requestListenerCount--;
                                console.debug(
                                    "Browserpass: Request listener removed, count:",
                                    requestListenerCount
                                );
                            };
                        },
                    }).api(),

                    /**
                     * Event fired when new credentials need to be stored to pass.
                     *
                     * Triggered by: password prompts, OAuth authentication, manual password entry
                     * Listener receives: credential data (host, login, password, scope)
                     * Listener returns: boolean indicating success/failure of storage
                     */
                    onNewCredential: new ExtensionCommon.EventManager({
                        context,
                        name: "credentials.onNewCredential",
                        register(fire) {
                            async function callback(event, credentialInfo) {
                                try {
                                    const cb = credentialInfo.callback;
                                    delete credentialInfo.callback;
                                    const returnValue = await fire.async(credentialInfo);
                                    if (cb) {
                                        await cb(returnValue);
                                    }
                                    return returnValue;
                                } catch (e) {
                                    console.error(e);
                                    return false;
                                }
                            }

                            passwordEmitter.on("password", callback);
                            storeListenerCount++;
                            console.debug(
                                "Browserpass: Store listener added, count:",
                                storeListenerCount
                            );

                            // Signal that store listener is ready and process any pending stores
                            if (storeListenerCount === 1) {
                                signalStoreListenerReady();
                                processPendingStores();
                            }

                            return function () {
                                passwordEmitter.off("password", callback);
                                storeListenerCount--;
                                console.debug(
                                    "Browserpass: Store listener removed, count:",
                                    storeListenerCount
                                );
                            };
                        },
                    }).api(),
                },
            };
        }

        /**
         * Called when extension is being unloaded.
         * Restores original hooked functions and cleans up resources.
         *
         * @param {boolean} isAppShutdown - True if Thunderbird is shutting down
         */
        onShutdown(isAppShutdown) {
            // Always stop timers first — a live setInterval prevents the module
            // from being garbage-collected and blocks Thunderbird's shutdown.
            stopPendingStoreRetry();
            // Prevent wakeUpExtension() from being called during shutdown.
            extensionContext = null;

            if (isAppShutdown) {
                return;
            }

            offlineControl.stopObserving();

            originalFunctions.forEach((item) => {
                if (item.cleanup) {
                    item.cleanup();
                } else if (item.object && item.name && item.original) {
                    item.object[item.name] = item.original;
                }
            });

            tokenCache.clear();

            resProto.setSubstitution("browserpass", null);

            Services.obs.notifyObservers(null, "startupcache-invalidate");
        }
    };
})(this);
