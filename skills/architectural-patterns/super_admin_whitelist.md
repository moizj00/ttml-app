# Super Admin Whitelist

**Principle**: Super admin access is restricted to a hard-coded email whitelist in `server/supabaseAuth.ts`. Any non-whitelisted user attempting to gain admin privileges must be silently demoted to `subscriber`.

**Guidelines for Claude Code**:

*   **Immutability**: The `SUPER_ADMIN_EMAILS` array in `server/supabaseAuth.ts` is the single source of truth for super admin identities. Claude Code must not suggest modifications to this list via UI, API, or environment variables.
*   **Self-Healing**: Claude Code should be aware that the authentication layer (`server/supabaseAuth.ts`) includes logic to automatically strip the `admin` role from any user whose email is not in the whitelist, reverting them to `subscriber`.
*   **No UI for Admin Role Assignment**: Claude Code must not generate any UI components or API endpoints that allow dynamic assignment of the `admin` role.

**Relevant Code References**:
*   `server/supabaseAuth.ts` (specifically the `SUPER_ADMIN_EMAILS` constant and the role stripping logic)
*   `server/_core/trpc.ts` (for `adminProcedure` which enforces 2FA and checks role)
