/*!
 * GeoLeaf Connector — Login UI (v1.2.3)
 * Accessible login modal with close button, overlay dismiss, and optional
 * signup / forgot-password links. Colors follow the active GeoLeaf theme
 * (light / dark / green / alt) through --gl-color-* custom properties.
 * CSS is inlined as a constant — no external stylesheet required.
 */

import type { ConnectorConfig } from "./config-schema.js";
import { TokenStore } from "./token-store.js";
import { AuthClient, AuthError } from "./auth-client.js";

// ─── CSS ──────────────────────────────────────────────────────────────────────

const _CSS = `
.gc-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.55);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 99999;
  font-family: system-ui, -apple-system, sans-serif;
}
.gc-modal {
  position: relative;
  background: var(--gl-color-bg-surface, #ffffff);
  color: var(--gl-color-text-main, #0f172a);
  border: 1px solid var(--gl-color-border-soft, rgba(15,23,42,0.08));
  border-radius: 8px;
  box-shadow: 0 8px 32px rgba(0,0,0,0.24);
  padding: 2rem;
  width: 100%;
  max-width: 360px;
  box-sizing: border-box;
}
.gc-modal h2 {
  margin: 0 0 1.25rem;
  font-size: 1.25rem;
  font-weight: 600;
  color: var(--gl-color-text-main, #0f172a);
}
.gc-modal label {
  display: block;
  margin-bottom: 0.25rem;
  font-size: 0.875rem;
  font-weight: 500;
  color: var(--gl-color-text-muted, #374151);
}
.gc-modal input {
  display: block;
  width: 100%;
  padding: 0.5rem 0.75rem;
  margin-bottom: 1rem;
  background: var(--gl-color-bg-surface-muted, #f9fafb);
  color: var(--gl-color-text-main, #0f172a);
  border: 1px solid var(--gl-color-border-strong, rgba(15,23,42,0.22));
  border-radius: 6px;
  font-size: 1rem;
  box-sizing: border-box;
  outline: none;
  transition: border-color 0.15s, box-shadow 0.15s;
}
.gc-modal input::placeholder {
  color: var(--gl-color-text-muted, #9ca3af);
  opacity: 0.7;
}
.gc-modal input:focus {
  border-color: var(--gl-color-accent, #3b82f6);
  box-shadow: 0 0 0 2px var(--gl-color-accent-soft, rgba(59,130,246,0.25));
}
.gc-modal button[type="submit"] {
  width: 100%;
  padding: 0.625rem 1rem;
  background: var(--gl-color-accent, #3b82f6);
  color: var(--gl-color-accent-contrast, #ffffff);
  border: none;
  border-radius: 6px;
  font-size: 1rem;
  font-weight: 500;
  cursor: pointer;
  transition: background 0.15s;
}
.gc-modal button[type="submit"]:hover:not(:disabled) {
  background: var(--gl-color-accent-hover, #2563eb);
}
.gc-modal button[type="submit"]:disabled {
  background: var(--gl-color-accent-soft, #93c5fd);
  color: var(--gl-color-text-muted, #ffffff);
  cursor: not-allowed;
}
.gc-error {
  color: #dc2626;
  font-size: 0.875rem;
  margin: 0 0 0.75rem;
  min-height: 1.25em;
}
.gc-close {
  position: absolute;
  top: 12px;
  right: 12px;
  width: 28px;
  height: 28px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: transparent;
  border: none;
  color: var(--gl-color-text-muted, #6b7280);
  cursor: pointer;
  border-radius: 4px;
  padding: 0;
  transition: background 0.15s, color 0.15s;
}
.gc-close:hover {
  background: var(--gl-color-bg-surface-muted, #f3f4f6);
  color: var(--gl-color-text-main, #111);
}
.gc-close:focus-visible {
  outline: 2px solid var(--gl-color-focus-ring, #2684FF);
  outline-offset: 1px;
}
.gc-links {
  display: flex;
  justify-content: space-between;
  gap: 1rem;
  margin-top: 1rem;
  padding-top: 1rem;
  border-top: 1px solid var(--gl-color-border-soft, rgba(15,23,42,0.08));
  font-size: 0.875rem;
  color: var(--gl-color-text-muted, #6b7280);
}
.gc-links a {
  color: var(--gl-color-accent, #3b82f6);
  text-decoration: none;
}
.gc-links a:hover { text-decoration: underline; }
.gc-links a:focus-visible {
  outline: 2px solid var(--gl-color-focus-ring, #2684FF);
  outline-offset: 2px;
  border-radius: 2px;
}
`;

// ─── Focus trap helpers ───────────────────────────────────────────────────────

const FOCUSABLE = "input:not([disabled]), button:not([disabled]), a[href]:not([hidden])";

function _trapFocus(overlay: HTMLElement): (e: KeyboardEvent) => void {
    return (e: KeyboardEvent) => {
        if (e.key !== "Tab") return;
        const focusable = Array.from(overlay.querySelectorAll<HTMLElement>(FOCUSABLE));
        if (focusable.length === 0) return;
        const first = focusable[0];
        const last = focusable.at(-1)!;
        if (e.shiftKey) {
            if (document.activeElement === first) {
                e.preventDefault();
                last.focus();
            }
        } else if (document.activeElement === last) {
            e.preventDefault();
            first.focus();
        }
    };
}

// ─── Close button SVG builder ─────────────────────────────────────────────────

function _buildCloseSvg(): SVGElement {
    const ns = "http://www.w3.org/2000/svg";
    const svg = document.createElementNS(ns, "svg");
    svg.setAttribute("width", "16");
    svg.setAttribute("height", "16");
    svg.setAttribute("viewBox", "0 0 24 24");
    svg.setAttribute("fill", "none");
    svg.setAttribute("stroke", "currentColor");
    svg.setAttribute("stroke-width", "2");
    svg.setAttribute("stroke-linecap", "round");
    svg.setAttribute("stroke-linejoin", "round");
    svg.setAttribute("aria-hidden", "true");
    const path = document.createElementNS(ns, "path");
    path.setAttribute("d", "M18 6L6 18M6 6l12 12");
    svg.appendChild(path);
    return svg;
}

// ─── Modal builder ────────────────────────────────────────────────────────────

interface ModalElements {
    overlay: HTMLDivElement;
    closeBtn: HTMLButtonElement;
    loginInput: HTMLInputElement;
    passwordInput: HTMLInputElement;
    submitBtn: HTMLButtonElement;
    errorEl: HTMLParagraphElement;
    form: HTMLFormElement;
    linksDiv: HTMLDivElement;
    signupLink: HTMLAnchorElement;
    forgotLink: HTMLAnchorElement;
}

function _buildModal(): ModalElements {
    // Inject styles once
    if (!document.getElementById("gc-style")) {
        const style = document.createElement("style");
        style.id = "gc-style";
        // textContent avoids innerHTML XSS risk (static string, no user data)
        style.textContent = _CSS;
        document.head.appendChild(style);
    }

    const overlay = document.createElement("div");
    overlay.className = "gc-overlay";
    overlay.setAttribute("role", "dialog");
    overlay.setAttribute("aria-modal", "true");
    overlay.setAttribute("aria-labelledby", "gc-modal-title");

    const modal = document.createElement("div");
    modal.className = "gc-modal";

    // Close button (top-right)
    const closeBtn = document.createElement("button");
    closeBtn.type = "button";
    closeBtn.className = "gc-close";
    closeBtn.setAttribute("aria-label", "Fermer");
    closeBtn.appendChild(_buildCloseSvg());

    const title = document.createElement("h2");
    title.id = "gc-modal-title";
    title.textContent = "Connexion";

    const form = document.createElement("form");
    form.id = "gc-login-form";
    form.setAttribute("novalidate", "");

    const loginLabel = document.createElement("label");
    loginLabel.setAttribute("for", "gc-login");
    loginLabel.textContent = "Identifiant";

    const loginInput = document.createElement("input");
    loginInput.id = "gc-login";
    loginInput.type = "text";
    loginInput.setAttribute("autocomplete", "username");
    loginInput.required = true;

    const passwordLabel = document.createElement("label");
    passwordLabel.setAttribute("for", "gc-password");
    passwordLabel.textContent = "Mot de passe"; // NOSONAR: UI label text, not a credential

    const passwordInput = document.createElement("input");
    passwordInput.id = "gc-password"; // NOSONAR: element ID, not a credential
    passwordInput.type = "password"; // NOSONAR: input type, not a credential
    passwordInput.setAttribute("autocomplete", "current-password");
    passwordInput.required = true;

    const errorEl = document.createElement("p");
    errorEl.id = "gc-error";
    errorEl.className = "gc-error";
    errorEl.setAttribute("role", "alert");
    errorEl.setAttribute("aria-live", "polite");
    errorEl.hidden = true;

    const submitBtn = document.createElement("button");
    submitBtn.type = "submit";
    submitBtn.textContent = "Se connecter";

    form.appendChild(loginLabel);
    form.appendChild(loginInput);
    form.appendChild(passwordLabel);
    form.appendChild(passwordInput);
    form.appendChild(errorEl);
    form.appendChild(submitBtn);

    // External links container (hidden by default)
    const linksDiv = document.createElement("div");
    linksDiv.className = "gc-links";
    linksDiv.hidden = true;

    const signupLink = document.createElement("a");
    signupLink.id = "gc-link-signup";
    signupLink.textContent = "Créer un compte";
    signupLink.target = "_blank";
    signupLink.rel = "noopener noreferrer";
    signupLink.hidden = true;

    const forgotLink = document.createElement("a");
    forgotLink.id = "gc-link-forgot";
    forgotLink.textContent = "Mot de passe oublié";
    forgotLink.target = "_blank";
    forgotLink.rel = "noopener noreferrer";
    forgotLink.hidden = true;

    linksDiv.appendChild(signupLink);
    linksDiv.appendChild(forgotLink);

    modal.appendChild(closeBtn);
    modal.appendChild(title);
    modal.appendChild(form);
    modal.appendChild(linksDiv);
    overlay.appendChild(modal);

    return {
        overlay,
        closeBtn,
        loginInput,
        passwordInput,
        submitBtn,
        errorEl,
        form,
        linksDiv,
        signupLink,
        forgotLink,
    };
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Displays the login modal and resolves when the user authenticates successfully.
 * Rejects with `Error("Modal closed by user")` if the user dismisses the modal
 * via close button, Escape key, or overlay click.
 */
export function showLoginModal(config: ConnectorConfig): Promise<void> {
    return new Promise<void>((resolve, reject) => {
        const {
            overlay,
            closeBtn,
            loginInput,
            passwordInput,
            submitBtn,
            errorEl,
            form,
            linksDiv,
            signupLink,
            forgotLink,
        } = _buildModal();

        // ── Configure external links (Sprint 2) ──────────────────────
        if (config.auth?.signupUrl) {
            signupLink.href = config.auth.signupUrl;
            signupLink.hidden = false;
            linksDiv.hidden = false;
        }
        if (config.auth?.forgotPasswordUrl) {
            forgotLink.href = config.auth.forgotPasswordUrl;
            forgotLink.hidden = false;
            linksDiv.hidden = false;
        }

        // Cancelable event dispatch on link clicks
        signupLink.addEventListener("click", (e) => {
            const evt = new CustomEvent("connector:signup-requested", {
                detail: { url: config.auth!.signupUrl! },
                cancelable: true,
            });
            const notPrevented = document.dispatchEvent(evt);
            if (!notPrevented) e.preventDefault();
        });
        forgotLink.addEventListener("click", (e) => {
            const evt = new CustomEvent("connector:forgot-password-requested", {
                detail: { url: config.auth!.forgotPasswordUrl! },
                cancelable: true,
            });
            const notPrevented = document.dispatchEvent(evt);
            if (!notPrevented) e.preventDefault();
        });

        // ── Focus trap ───────────────────────────────────────────────
        const trapHandler = _trapFocus(overlay);
        document.addEventListener("keydown", trapHandler);

        // ── Shared cleanup ───────────────────────────────────────────
        function _cleanup(): void {
            document.removeEventListener("keydown", trapHandler);
            document.removeEventListener("keydown", _escapeHandler);
            overlay.remove();
        }

        // ── Error helpers ────────────────────────────────────────────
        function _showError(msg: string): void {
            errorEl.textContent = msg;
            errorEl.hidden = false;
        }

        function _clearError(): void {
            errorEl.textContent = "";
            errorEl.hidden = true;
        }

        function _setLoading(loading: boolean): void {
            submitBtn.disabled = loading;
            loginInput.disabled = loading;
            passwordInput.disabled = loading;
            submitBtn.textContent = loading ? "Connexion…" : "Se connecter";
        }

        // ── Close: Escape key ────────────────────────────────────────
        const _escapeHandler = (e: KeyboardEvent): void => {
            if (e.key === "Escape") {
                _cleanup();
                reject(new Error("Modal closed by user"));
            }
        };
        document.addEventListener("keydown", _escapeHandler);

        // ── Close: close button (Sprint 2) ───────────────────────────
        closeBtn.addEventListener("click", () => {
            _cleanup();
            reject(new Error("Modal closed by user"));
        });

        // ── Close: overlay click (Sprint 2) ──────────────────────────
        overlay.addEventListener("click", (e) => {
            if (e.target === overlay) {
                _cleanup();
                reject(new Error("Modal closed by user"));
            }
        });

        // ── Submit handler ───────────────────────────────────────────
        form.addEventListener("submit", async (e) => {
            e.preventDefault();
            _clearError();

            const loginValue = loginInput.value.trim();
            const passwordValue = passwordInput.value;

            if (!loginValue || !passwordValue) {
                _showError("Veuillez remplir tous les champs.");
                return;
            }

            _setLoading(true);

            try {
                const auth = config.auth;
                if (!auth?.endpoint) {
                    _showError("Configuration invalide : endpoint manquant.");
                    _setLoading(false);
                    return;
                }
                const result = await AuthClient.login(auth.endpoint, loginValue, passwordValue);
                const expiresAt = Date.now() + result.expiresIn * 1000;
                await TokenStore.save(config.baseUrl, result.token, expiresAt);

                _cleanup();

                document.dispatchEvent(
                    new CustomEvent("connector:authenticated", {
                        detail: { baseUrl: config.baseUrl },
                    })
                );

                resolve();
            } catch (err) {
                _setLoading(false);
                // Clear password on any error (OWASP A02)
                passwordInput.value = "";

                if (err instanceof AuthError) {
                    if (err.message === "Invalid credentials") {
                        _showError("Identifiant ou mot de passe incorrect.");
                    } else if (err.message === "Network unavailable") {
                        _showError("Serveur inaccessible. Vérifiez votre connexion.");
                    } else {
                        _showError("Erreur : " + err.message);
                    }
                } else {
                    _showError("Une erreur inattendue est survenue.");
                }
            }
        });

        document.body.appendChild(overlay);

        // Focus on first input after mount
        requestAnimationFrame(() => loginInput.focus());
    });
}
