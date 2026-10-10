/** One part of a proportional split; `key` must be unique and breaks ties. */
export interface ProportionalWeight {
  key: string;
  weight: bigint;
}

/** One allocated amount; `key` matches the corresponding weight. */
export interface ProportionalPart {
  amount: bigint;
  key: string;
}

/** Divide two integers and round down. JavaScript's `/` operator rounds towards zero. */
export function floorDiv(dividend: bigint, divisor: bigint): bigint {
  const quotient = dividend / divisor;
  return dividend % divisor !== 0n && dividend < 0n ? quotient - 1n : quotient;
}

/** Compare two keys lexicographically, we avoid locale-specific sorting. */
function compareKeys(a: string, b: string): number {
  if (a < b) {
    return -1;
  }
  if (a > b) {
    return 1;
  }
  return 0;
}

/**
 * Splits `total` in proportion to `weights` with the largest remainder method.
 * Leftover units go to the largest remainders, ties to the lower key, so the
 * result depends only on the (key, weight) pairs, never on their order.
 * Returns one `{ key, amount }` per weight, in input order, summing exactly
 * to `total`. `total` may be negative; weights must be non-negative and not
 * all zero.
 */
export function distributeProportionally(
  total: bigint,
  weights: readonly ProportionalWeight[]
): ProportionalPart[] {
  const keys = new Set<string>();
  let weightSum = 0n;
  for (const { key, weight } of weights) {
    if (keys.has(key)) {
      throw new RangeError(`Duplicate key: ${key}`);
    }
    if (weight < 0n) {
      throw new RangeError(`Negative weight for key: ${key}`);
    }
    keys.add(key);
    weightSum += weight;
  }
  if (weightSum === 0n) {
    throw new RangeError("Weights must not all be zero");
  }

  const parts = weights.map(({ weight }) =>
    floorDiv(total * weight, weightSum)
  );
  const remainders = weights.map(
    ({ weight }, index) => total * weight - parts[index] * weightSum
  );
  const leftover = total - parts.reduce((acc, part) => acc + part, 0n);

  const order = weights
    .map((_, index) => index)
    .sort((a, b) => {
      if (remainders[a] > remainders[b]) {
        return -1;
      }
      if (remainders[a] < remainders[b]) {
        return 1;
      }
      return compareKeys(weights[a].key, weights[b].key);
    });

  // Distribute the leftover units to the largest remainders, in order.
  for (let rank = 0; BigInt(rank) < leftover; rank += 1) {
    parts[order[rank]] += 1n;
  }

  return weights.map(({ key }, index) => ({ key, amount: parts[index] }));
}
