# Role-Based Access Control (RBAC) Enforcement

**Principle**: Access to sensitive operations is strictly gated by tRPC middleware, verifying `userRole` before execution.

**Guidelines for Claude Code**:

*   **Procedure Guards**: Always use the appropriate tRPC procedure guards (`publicProcedure`, `protectedProcedure`, `subscriberProcedure`, `employeeProcedure`, `attorneyProcedure`, `adminProcedure`) defined in `server/_core/trpc.ts`.
*   **Role Verification**: Before implementing any new feature or modifying an existing one, identify the minimum required `userRole` and ensure the corresponding procedure guard is applied.
*   **No Client-Side Enforcement**: Never rely solely on client-side checks for access control. All authorization logic must reside on the server.

**Relevant Code References**:
*   `server/_core/trpc.ts` (for procedure definitions)
*   `server/routers/` (for application of procedure guards to routes)
*   `shared/types.ts` (for `UserRole` enum)
