/** Stellar currency helpers — 1 XLM = 10_000_000 stroops */

const STROOPS_PER_XLM = 10_000_000n;

export function stroopsToDisplay(stroops: bigint, decimals = 7): string {
  const whole = stroops / STROOPS_PER_XLM;
  const fraction = stroops % STROOPS_PER_XLM;
  const fractionStr = fraction.toString().padStart(7, "0").slice(0, decimals);
  return `${whole}.${fractionStr}`;
}

export function displayToStroops(amount: string): bigint {
  const [whole = "0", fraction = ""] = amount.split(".");
  const paddedFraction = (fraction + "0000000").slice(0, 7);
  return BigInt(whole) * STROOPS_PER_XLM + BigInt(paddedFraction);
}
