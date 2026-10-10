const MAX_SAFE = BigInt(Number.MAX_SAFE_INTEGER);
const INTEGER_PATTERN = /^-?\d+$/;

/**
 * Converts an integer read from PostgreSQL (`bigint` and `numeric` arrive as
 * strings) to a number, throwing instead of losing precision.
 */
export function toSafeInteger(value: string | bigint | number): number {
  if (typeof value === "number") {
    if (!Number.isSafeInteger(value)) {
      throw new RangeError(`Not a safe integer: ${value}`);
    }
    return value;
  }
  if (typeof value === "string" && !INTEGER_PATTERN.test(value)) {
    throw new RangeError(`Not an integer: ${value}`);
  }
  const big = BigInt(value);
  if (big > MAX_SAFE || big < -MAX_SAFE) {
    throw new RangeError(`Not a safe integer: ${value}`);
  }
  return Number(big);
}
