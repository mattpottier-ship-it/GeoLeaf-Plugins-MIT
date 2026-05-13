/*!
 * GeoLeaf Connector — Entry Point
 * Boot, GeoLeaf.Connector global API, plugin registration.
 * ESM named export createConnector() for suite-connector.
 */

import { validateConfig, ConfigError } from "./config-schema.js";
import type { ConnectorConfig } from "./config-schema.js";
import { TokenStore } from "./token-store.js";
import {
    install as installFetchInterceptor,
    uninstall as uninstallFetchInterceptor,
    getWorkerHeaders,
} from "./fetch-interceptor.js";
import { installMapLibreBridge } from "./maplibre-bridge.js";
import { AuthClient } from "./auth-client.js";
import { showLoginModal } from "./login-ui.js";
import { installCredentialButton, uninstallCredentialButton } from "./credential-button.js";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface ConnectorInstance {
    /** Synchronous token read from RAM cache. Returns null if not loaded yet. */
    getTokenSync(): string | null;
    /** Async token read (IDB → RAM cache). Returns null if not authenticated. */
    getTokenAsync(): Promise<string | null>;
    /** Restores window.fetch, clears RAM cache. Does NOT clear IndexedDB. */
    destroy(): void;
}

// ─── Singleton state (global API) ────────────────────────────────────────────

let _currentInstance: ConnectorInstance | null = null;
let _currentConfig: ConnectorConfig | null = null;

// ─── createConnector — ESM named export ──────────────────────────────────────

/**
 * Creates a ConnectorInstance from a validated config without mutating the
 * global GeoLeaf.Connector state.
 * Intended for use by @geoleaf-plugins/suite-connector and advanced integrators.
 */
export function createConnector(config: ConnectorConfig): ConnectorInstance {
    validateConfig(config);
    let _active = true;

    // Wire refresh delegate if auth.endpoint is configured
    if (config.auth?.endpoint) {
        TokenStore._setRefreshFn(async (baseUrl: string) => {
            const current = TokenStore.getTokenSync(baseUrl);
            if (!current || !config.auth?.endpoint) return null;
            const result = await AuthClient.refresh(config.auth.endpoint, current);
            if (result) {
                const expiresAt = Date.now() + result.expiresIn * 1000;
                await TokenStore.save(baseUrl, result.token, expiresAt);
                if (typeof document !== "undefined") {
                    document.dispatchEvent(
                        new CustomEvent("connector:token-refreshed", { detail: { baseUrl } })
                    );
                }
                return result.token;
            }
            return null;
        });
    }

    return {
        getTokenSync(): string | null {
            if (!_active) return null;
            if (config.getToken) {
                const result = config.getToken();
                // async getToken cannot be used synchronously — return null
                if (result instanceof Promise) return null;
                return result;
            }
            return TokenStore.getTokenSync(config.baseUrl);
        },

        async getTokenAsync(): Promise<string | null> {
            if (!_active) return null;
            if (config.getToken) {
                return config.getToken();
            }
            return TokenStore.getTokenAsync(config.baseUrl);
        },

        destroy(): void {
            _active = false;
            TokenStore._setRefreshFn(null);
        },
    };
}

// ─── configure — global singleton ────────────────────────────────────────────

/**
 * Initializes the Connector singleton.
 * Installs window.fetch monkey-patch and Worker headers hook.
 * If auth.ui is true and no token is found, shows the login modal.
 */
async function _configure(config: ConnectorConfig): Promise<void> {
    validateConfig(config);

    // Destroy the existing instance if any
    if (_currentInstance) {
        uninstallCredentialButton();
        _currentInstance.destroy();
        uninstallFetchInterceptor();
        _currentInstance = null;
        _currentConfig = null;
    }

    _currentConfig = config;

    // Warm up RAM cache from IDB (required before MapLibre bridge reads sync cache)
    if (config.auth?.endpoint) {
        await TokenStore.getTokenAsync(config.baseUrl);

        // Wire refresh delegate for the singleton
        TokenStore._setRefreshFn(async (baseUrl: string) => {
            const current = TokenStore.getTokenSync(baseUrl);
            if (!current || !config.auth?.endpoint) return null;
            const result = await AuthClient.refresh(config.auth.endpoint, current);
            if (result) {
                const expiresAt = Date.now() + result.expiresIn * 1000;
                await TokenStore.save(baseUrl, result.token, expiresAt);
                if (typeof document !== "undefined") {
                    document.dispatchEvent(
                        new CustomEvent("connector:token-refreshed", { detail: { baseUrl } })
                    );
                }
                return result.token;
            }
            return null;
        });
    }

    // Install fetch monkey-patch
    installFetchInterceptor(config);

    // Install Worker headers hook on globalThis
    // worker-manager.ts reads this via __GEOLEAF_WORKER_HEADERS_HOOK__ (no import of this plugin)
    (globalThis as Record<string, unknown>)["__GEOLEAF_WORKER_HEADERS_HOOK__"] = (
        url: string
    ): Record<string, string> | undefined => {
        if (!_currentConfig) return undefined;
        return getWorkerHeaders(url, _currentConfig.baseUrl);
    };

    // Install MapLibre bridge (Phase 1 stub — no-op until Phase 2)
    installMapLibreBridge(config);

    // Resolve current token status
    let token: string | null = null;
    if (config.getToken) {
        token = await config.getToken();
    } else if (config.auth?.endpoint) {
        token = await TokenStore.getTokenAsync(config.baseUrl);
    }

    // No token + auth configured → show login modal or throw
    if (!token && config.auth) {
        if (config.auth.ui) {
            await showLoginModal(config);
        } else {
            throw new ConfigError(
                "[GeoLeaf Connector] No valid token found and auth.ui is not enabled. " +
                    "Configure auth.ui: true to show the login modal, or provide a valid token."
            );
        }
    }

    // Install credential button (Sprint 2 — idempotent, no-op if not enabled)
    installCredentialButton(config);

    _currentInstance = createConnector(config);
}

// ─── GeoLeaf global API surface ──────────────────────────────────────────────

interface GeoLeafPluginAPI {
    _version?: string;
    Connector?: unknown;
    plugins?: {
        register(
            name: string,
            opts: {
                version?: string;
                type?: string;
                optional?: string[];
                label?: string;
                healthCheck?: () => boolean;
            }
        ): void;
    };
}

const _g = globalThis as {
    GeoLeaf?: GeoLeafPluginAPI;
};

if (_g.GeoLeaf) {
    _g.GeoLeaf.Connector = {
        configure: _configure,

        /**
         * Opens the login modal on demand.
         * Resolves when authenticated, rejects if the user closes the modal.
         * Requires a prior configure() call with auth configured.
         */
        async openLoginModal(): Promise<void> {
            if (!_currentConfig?.auth) {
                throw new ConfigError(
                    "[GeoLeaf Connector] openLoginModal() requires auth to be configured. " +
                        "Call GeoLeaf.Connector.configure() with auth first."
                );
            }
            return showLoginModal(_currentConfig);
        },
    };
}

// ─── Auto-bootstrap UI-only from profile ui.showCredentialButton ─────────────
// Mounts the credential button without requiring GeoLeaf.Connector.configure().
// Triggered by geoleaf:config:loaded / geoleaf:map:ready. Idempotent.
// If configure() runs later, uninstallCredentialButton() inside _configure
// removes this standalone button and _configure re-installs it with real auth.

let _uiOnlyBooted = false;

function _readUiShowCredentialButtonFlag(): boolean {
    // Read through GeoLeaf.Config.getActiveProfile() — the only runtime-exposed
    // path to the profile's ui section (merged from ui.json). GeoLeaf.config
    // does not exist at runtime.
    const g = globalThis as Record<string, unknown>;
    const gl = g["GeoLeaf"] as Record<string, unknown> | undefined;
    const Config = gl?.["Config"] as
        | { getActiveProfile?: () => Record<string, unknown> | null }
        | undefined;
    const profile = Config?.getActiveProfile?.();
    const ui = (profile?.["ui"] ?? undefined) as Record<string, unknown> | undefined;
    return ui?.["showCredentialButton"] === true;
}

function _autoBootstrapUiOnly(): void {
    if (_uiOnlyBooted) return;
    if (_currentInstance) return; // explicit configure() already ran
    if (_readUiShowCredentialButtonFlag()) {
        _uiOnlyBooted = true;

        // Minimal standalone config — not passed through validateConfig.
        // credential-button._shouldEnable() reads ui.showCredentialButton directly.
        // Empty auth.endpoint signals UI-only click mode (event dispatch only).
        const uiOnlyCfg = {
            baseUrl: typeof location === "undefined" ? "" : location.origin,
            auth: {
                endpoint: "",
                credentialButton: { enabled: true, iconVariant: "lock" as const },
            },
        } as ConnectorConfig;

        installCredentialButton(uiOnlyCfg);
    }
}

/** @internal — exposed for tests only, resets the auto-bootstrap latch. */
export function _resetAutoBootstrapForTests(): void {
    _uiOnlyBooted = false;
}

if (typeof document !== "undefined") {
    // geoleaf:profile:loaded — fired after the active profile (including ui.json)
    //   is loaded and merged; getActiveProfile() is then populated.
    // geoleaf:map:ready — safety net, fires later during boot.
    // geoleaf:config:loaded fires BEFORE profile load so the flag is not yet
    //   readable via getActiveProfile() — not used.
    document.addEventListener("geoleaf:profile:loaded", _autoBootstrapUiOnly, { once: true });
    document.addEventListener("geoleaf:map:ready", _autoBootstrapUiOnly, { once: true });
    // Fallback: plugin script loaded after events already fired
    if (_readUiShowCredentialButtonFlag()) _autoBootstrapUiOnly();
}

if (_g.GeoLeaf?.plugins?.register) {
    _g.GeoLeaf.plugins.register("connector", {
        version: "__GEOLEAF_CONNECTOR_VERSION__",
        type: "standard",
        optional: ["storage", "addpoi"],
        label: "Connector (Auth + Fetch intercept)",
        healthCheck: () => !!_currentInstance,
    });
}
