/**
 * PostgreSQL SSL configuration for Railway and production environments.
 * Returns SSL config for database connections.
 */

export function getPostgresSsl(): { rejectUnauthorized: boolean; ca?: string } {
  // Railway provides CA certs for encrypted connections
  if (process.env.NODE_ENV === "production") {
    return {
      rejectUnauthorized: true,
    };
  }
  // Development: allow self-signed certs
  return {
    rejectUnauthorized: false,
  };
}

export default getPostgresSsl;
