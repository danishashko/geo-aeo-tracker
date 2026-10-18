/**
 * Rank Signal statistics. Pure, no imports: used by the server runner and the
 * client panel alike.
 *
 * Posterior: Beta(w + 0.5, n − w + 0.5) (Jeffreys prior), equal-tailed 95% CI.
 * Quantiles by bisection on the regularized incomplete beta, which always
 * converges because the CDF is monotone (Newton can leave (0,1) at a = 0.5).
 */

export interface Posterior {
  mean: number;
  lo: number;
  hi: number;
}

export type StatVerdict =
  | "insufficient"
  | "pending"
  | "positive"
  | "negative"
  | "no_clear_effect";

const LANCZOS = [
  676.5203681218851, -1259.1392167224028, 771.3234287776531, -176.6150291621406,
  12.507343278686905, -0.13857109526572012, 9.984369578019572e-6,
  1.5056327351493116e-7,
];

/** ln Γ(x) for x > 0 (Lanczos, g = 7). */
export function lgamma(x: number): number {
  if (x < 0.5) {
    // Reflection: Γ(x)Γ(1−x) = π / sin(πx)
    return Math.log(Math.PI / Math.abs(Math.sin(Math.PI * x))) - lgamma(1 - x);
  }
  const z = x - 1;
  let a = 0.9999999999998099;
  const t = z + 7.5;
  for (let i = 0; i < LANCZOS.length; i++) a += LANCZOS[i] / (z + i + 1);
  return (
    0.5 * Math.log(2 * Math.PI) + (z + 0.5) * Math.log(t) - t + Math.log(a)
  );
}

/** Continued fraction for I_x(a,b) (Lentz; Numerical Recipes `betacf`). */
function betacf(x: number, a: number, b: number): number {
  const FPMIN = 1e-300;
  const EPS = 1e-15;
  const qab = a + b;
  const qap = a + 1;
  const qam = a - 1;
  let c = 1;
  let d = 1 - (qab * x) / qap;
  if (Math.abs(d) < FPMIN) d = FPMIN;
  d = 1 / d;
  let h = d;
  for (let m = 1; m <= 300; m++) {
    const m2 = 2 * m;
    let aa = (m * (b - m) * x) / ((qam + m2) * (a + m2));
    d = 1 + aa * d;
    if (Math.abs(d) < FPMIN) d = FPMIN;
    c = 1 + aa / c;
    if (Math.abs(c) < FPMIN) c = FPMIN;
    d = 1 / d;
    h *= d * c;
    aa = (-(a + m) * (qab + m) * x) / ((a + m2) * (qap + m2));
    d = 1 + aa * d;
    if (Math.abs(d) < FPMIN) d = FPMIN;
    c = 1 + aa / c;
    if (Math.abs(c) < FPMIN) c = FPMIN;
    d = 1 / d;
    const del = d * c;
    h *= del;
    if (Math.abs(del - 1) < EPS) break;
  }
  return h;
}

/** Regularized incomplete beta I_x(a, b). */
export function betaCdf(x: number, a: number, b: number): number {
  if (x <= 0) return 0;
  if (x >= 1) return 1;
  const lnFront =
    lgamma(a + b) -
    lgamma(a) -
    lgamma(b) +
    a * Math.log(x) +
    b * Math.log(1 - x);
  const front = Math.exp(lnFront);
  if (x < (a + 1) / (a + b + 2)) return (front * betacf(x, a, b)) / a;
  return 1 - (front * betacf(1 - x, b, a)) / b;
}

/** Inverse of I_x(a, b) by bisection on [0, 1], 100 iterations. */
export function betaQuantile(p: number, a: number, b: number): number {
  if (!(p >= 0 && p <= 1)) throw new RangeError(`p out of range: ${p}`);
  if (!(a > 0 && b > 0)) throw new RangeError(`bad shape: a=${a}, b=${b}`);
  if (p === 0) return 0;
  if (p === 1) return 1;
  let lo = 0;
  let hi = 1;
  for (let i = 0; i < 100; i++) {
    const mid = (lo + hi) / 2;
    if (betaCdf(mid, a, b) < p) lo = mid;
    else hi = mid;
  }
  return (lo + hi) / 2;
}

function assertCounts(wins: number, n: number): void {
  if (
    !Number.isInteger(wins) ||
    !Number.isInteger(n) ||
    wins < 0 ||
    n < 0 ||
    wins > n
  ) {
    throw new RangeError(`invalid counts: wins=${wins}, n=${n}`);
  }
}

/** Jeffreys posterior mean and equal-tailed 95% interval for a win rate. */
export function posterior(wins: number, n: number): Posterior {
  assertCounts(wins, n);
  const a = wins + 0.5;
  const b = n - wins + 0.5;
  return {
    mean: a / (a + b),
    lo: betaQuantile(0.025, a, b),
    hi: betaQuantile(0.975, a, b),
  };
}

/**
 * Verdict rule, recomputed on every read and never stored:
 * n < 20 → insufficient; lo > 0.5 → positive; hi < 0.5 → negative;
 * n ≥ 40 → no clear effect; otherwise pending.
 */
export function verdict(wins: number, n: number): StatVerdict {
  assertCounts(wins, n);
  if (n < 20) return "insufficient";
  const { lo, hi } = posterior(wins, n);
  return decide(n, lo, hi);
}

/** The rule on an already-computed interval (strict: lo = 0.5 is not positive). */
export function decide(n: number, lo: number, hi: number): StatVerdict {
  if (n < 20) return "insufficient";
  if (lo > 0.5) return "positive";
  if (hi < 0.5) return "negative";
  if (n >= 40) return "no_clear_effect";
  return "pending";
}

/** Valid-trial counts at which the runner reads the verdict. */
export const CHECKPOINTS = [20, 30, 40] as const;
export const MAX_TRIALS = 40;
