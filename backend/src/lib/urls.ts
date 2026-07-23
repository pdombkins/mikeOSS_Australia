/**
 * Front-end URL helpers.
 *
 * FRONTEND_URL may be a single origin or a comma-separated list of allowed
 * browser origins (e.g. the *.workers.dev URL plus a custom domain). CORS
 * accepts any origin in the list; anything that builds an outbound link
 * (invite emails, notification links) uses the PRIMARY origin — the first
 * entry — so put your canonical front-end URL first.
 */

function raw(): string {
    return process.env.FRONTEND_URL ?? "http://localhost:3000";
}

/** Every allowed browser origin, trimmed and without a trailing slash. */
export function allowedOrigins(): string[] {
    return raw()
        .split(",")
        .map((o) => o.trim().replace(/\/+$/, ""))
        .filter(Boolean);
}

/** The primary front-end origin (first entry) for building links. */
export function frontendBaseUrl(): string {
    return allowedOrigins()[0] ?? "http://localhost:3000";
}
