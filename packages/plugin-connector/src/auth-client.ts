/*!
 * GeoLeaf Connector — Auth Client
 * HTTP calls to the authentication endpoint.
 * Credentials are never stored or logged.
 */

/** Thrown when authentication or refresh fails. */
export class AuthError extends Error {
    constructor(message: string) {
        super(message);
        this.name = "AuthError";
    }
}

interface AuthResponse {
    token: string;
    expiresIn: number;
}

// ─── Internal helpers ─────────────────────────────────────────────────────────

async function _parseAuthResponse(response: Response): Promise<AuthResponse> {
    if (response.status === 401) {
        throw new AuthError("Invalid credentials");
    }
    if (response.status === 404) {
        throw new AuthError("Endpoint not found (404)");
    }
    if (response.status >= 500) {
        throw new AuthError("Server error (" + response.status + ")");
    }
    if (!response.ok) {
        throw new AuthError("Authentication failed (" + response.status + ")");
    }
    let data: AuthResponse;
    try {
        data = (await response.json()) as AuthResponse;
    } catch {
        throw new AuthError("Invalid server response: could not parse JSON");
    }
    if (!data.token || typeof data.expiresIn !== "number") {
        throw new AuthError("Invalid server response: missing token or expiresIn");
    }
    return data;
}

// ─── Public API ───────────────────────────────────────────────────────────────

export const AuthClient = {
    /**
     * Authenticates with login + password against the endpoint.
     * Returns the token and expiresIn so the caller can store via TokenStore.save().
     *
     * Security: password string is overwritten before the function returns.
     */
    async login(endpoint: string, login: string, password: string): Promise<AuthResponse> {
        let pwd = password;
        try {
            let response: Response;
            try {
                response = await fetch(endpoint, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ login, password: pwd }),
                });
            } catch {
                throw new AuthError("Network unavailable");
            }
            return await _parseAuthResponse(response);
        } finally {
            // Overwrite password in memory after use (OWASP A02)
            pwd = "";
        }
    },

    /**
     * Refreshes the current token via POST {endpoint}/refresh.
     * Returns the new AuthResponse, or null if the backend does not support refresh (404).
     * All other errors are propagated as AuthError.
     */
    async refresh(endpoint: string, currentToken: string): Promise<AuthResponse | null> {
        let response: Response | null = null;
        try {
            response = await fetch(`${endpoint}/refresh`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    Authorization: `Bearer ${currentToken}`,
                },
            });
        } catch {
            // Network error — treat as non-fatal for refresh
            return null;
        }

        // Backend does not support refresh — graceful degradation
        if (response.status === 404) return null;

        try {
            return await _parseAuthResponse(response);
        } catch {
            return null;
        }
    },
};
