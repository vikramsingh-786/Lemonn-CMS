import { describe, expect, it } from "vitest";
import { parseServerEnv } from "@/lib/env";

describe("parseServerEnv", () => {
  it("accepts a PostgreSQL URL", () => {
    const env = parseServerEnv({ DATABASE_URL: "postgresql://u:p@localhost:5432/db" });
    expect(env.DATABASE_URL).toBe("postgresql://u:p@localhost:5432/db");
  });

  it("rejects a non-PostgreSQL URL without echoing its value", () => {
    const secret = "mysql://admin:s3cret@db.internal/x";
    expect(() => parseServerEnv({ DATABASE_URL: secret })).toThrow(/DATABASE_URL/);
    expect(() => parseServerEnv({ DATABASE_URL: secret })).not.toThrow(/s3cret/);
  });
});
