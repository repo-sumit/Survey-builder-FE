/**
 * Public API paths — endpoints that intentionally do NOT carry an
 * Authorization header from the FE.
 *
 * Why this lives in its own module:
 *   - api.js imports axios, which CRA's Jest setup does not transform.
 *     Keeping the skip-list helper here lets us unit-test it without
 *     dragging axios into the Jest module graph.
 *   - The axios request interceptor in api.js consumes these via
 *     `isPublicApiPath(config.url)`.
 *
 * Why skip auth on these paths:
 *   1. Warmup probes (/api/health) shouldn't pay the cost of awaiting
 *      supabase.auth.getSession() — that round-trip adds 50–150 ms per
 *      call and forces a Supabase client init even when the user is not
 *      signed in.
 *   2. External uptime monitors hitting these endpoints should look
 *      identical to anonymous traffic on the BE access log / audit
 *      trail. An accidental Authorization header would mislead either.
 */

const PUBLIC_API_PATHS = ['/api/health', '/api/ready', '/api/keep-alive'];

function isPublicApiPath(url) {
  if (typeof url !== 'string' || !url) return false;
  // Strip query string so '/api/health?x=1' matches the same as '/api/health'.
  const path = url.split('?')[0];
  return PUBLIC_API_PATHS.some((p) => path === p || path.endsWith(p));
}

module.exports = { PUBLIC_API_PATHS, isPublicApiPath };
