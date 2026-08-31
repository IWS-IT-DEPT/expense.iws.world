import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";

import * as schema from "./schema";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error("DATABASE_URL is not set. Copy .env.example to .env.local and fill it in.");
}

// Neon's HTTP driver works from Node and edge runtimes alike, so this single
// client is safe to import from middleware, route handlers, and RSCs.
export const db = drizzle(neon(connectionString), { schema });

export { schema };
