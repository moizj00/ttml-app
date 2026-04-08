/**
 * Barrel — re-exports all route registration functions.
 * Import this from the main routes.ts orchestrator.
 */
export { registerSignupLoginRoutes } from "./signup-login";
export { registerAdmin2FARoutes } from "./admin-2fa";
export { registerPasswordRoutes } from "./password";
export { registerVerificationRoutes } from "./verification";
export { registerOAuthRoutes } from "./oauth";
