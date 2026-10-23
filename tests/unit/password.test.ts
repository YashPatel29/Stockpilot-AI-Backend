import { describe, it, expect } from "vitest";
import { hashPassword, verifyPassword } from "../../src/common/utils/password.util";

describe("Password Utility (bcrypt)", () => {
  it("should hash a plaintext password successfully", async () => {
    const plain = "SuperSecretPassword123!";
    const hash = await hashPassword(plain);

    expect(hash).toBeDefined();
    expect(hash).not.toBe(plain);
    expect(hash.startsWith("$2b$")).toBe(true);
  });

  it("should generate different hashes for the same password due to salting", async () => {
    const plain = "MyP@ssw0rd99";
    const hash1 = await hashPassword(plain);
    const hash2 = await hashPassword(plain);

    expect(hash1).not.toBe(hash2);
    expect(await verifyPassword(plain, hash1)).toBe(true);
    expect(await verifyPassword(plain, hash2)).toBe(true);
  });

  it("should verify correct password candidate against hash", async () => {
    const plain = "CorrectHorseBatteryStaple";
    const hash = await hashPassword(plain);

    const isValid = await verifyPassword(plain, hash);
    expect(isValid).toBe(true);
  });

  it("should reject incorrect password candidate against hash", async () => {
    const plain = "CorrectHorseBatteryStaple";
    const wrong = "WrongPassword123";
    const hash = await hashPassword(plain);

    const isValid = await verifyPassword(wrong, hash);
    expect(isValid).toBe(false);
  });
});
