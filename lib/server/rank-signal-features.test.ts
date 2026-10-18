import { test } from "node:test";
import assert from "node:assert/strict";
import {
  CATALOG_VERSION,
  FEATURE_CATALOG,
  RUN_ORDER,
  checkPair,
  getSignal,
  hasAttribution,
  hasBoldQueryTerm,
  hasBulletList,
  hasDefinition,
  hasExactQuery,
  hasFirstPerson,
  hasFreshnessClause,
  hasNumber,
  hasQuestionHeading,
  hasSuperlative,
  hedgeCount,
  isEligible,
  wordSimilarity,
  type SignalContext,
} from "./rank-signal-features";
import { splitSentences } from "./rank-signal-passages";

const ctx: SignalContext = {
  keyword: "healthy meal kit",
  now: new Date(2026, 8, 25),
};

const BASE =
  "The service ships chef-designed recipes every week. Each box includes pre-portioned ingredients and simple cards. Customers pick dishes from a rotating menu that changes weekly. Delivery windows are set during checkout, and a healthy meal kit plan can be paused at any time.";

function sig(id: string) {
  const s = getSignal(id);
  assert.ok(s, id);
  return s;
}

test("catalog: 15 rows, 4 code-built, S00 first then code then LLM", () => {
  assert.equal(CATALOG_VERSION, 2);
  assert.equal(FEATURE_CATALOG.length, 15);
  assert.equal(FEATURE_CATALOG.filter((s) => s.build === "code").length, 4);
  assert.deepEqual(RUN_ORDER.slice(0, 5), ["S00", "S05", "S06", "S12", "S13"]);
  assert.equal(new Set(RUN_ORDER).size, 15);
  for (const s of FEATURE_CATALOG) {
    assert.match(s.id, /^S\d{2}$/);
    if (s.build === "code") {
      assert.ok(s.addOnly && s.transform && s.detect, s.id);
    }
  }
  assert.ok(sig("S00").addOnly && sig("S14").addOnly);
  assert.equal(sig("S00").checks.detector, false);
  assert.equal(sig("S05").checks.similarity, null);
  assert.equal(sig("S14").checks.similarity, null);
  assert.deepEqual(sig("S14").checks.lengthRatio, [0.5, 0.75]);
});

test("detectors on hand-written positive and negative passages", () => {
  assert.ok(hasNumber("Plans start at $9.99 per serving."));
  assert.ok(hasNumber("Most recipes take 15 minutes."));
  assert.ok(hasNumber("About 42% of buyers cancel."));
  assert.ok(!hasNumber("Founded in 2019, the company ships weekly."));
  assert.ok(!hasNumber(BASE));

  assert.ok(
    hasAttribution("According to Consumer Reports, the kits are fresh."),
  );
  assert.ok(hasAttribution("A survey by YouGov found strong demand."));
  assert.ok(!hasAttribution("according to taste, add salt."));
  assert.ok(!hasAttribution(BASE));

  assert.ok(hasFirstPerson("We tested six kits over a month."));
  assert.ok(hasFirstPerson("In my kitchen, I found it quick."));
  assert.ok(!hasFirstPerson(BASE));

  assert.equal(hedgeCount("It may help, and it might possibly save time."), 3);
  assert.equal(hedgeCount("Released in May 2026 with no changes."), 0);
  assert.equal(hedgeCount(BASE), 0);

  assert.ok(
    hasSuperlative("This is a world-class, unbeatable kit.", ctx.keyword),
  );
  assert.ok(!hasSuperlative(BASE, ctx.keyword));
  // A superlative that is part of the query is not counted
  assert.ok(
    !hasSuperlative("The best meal kit ships weekly.", "best meal kit"),
  );

  assert.ok(
    hasDefinition(
      "A healthy meal kit is a box of pre-portioned food.",
      ctx.keyword,
    ),
  );
  assert.ok(!hasDefinition(BASE, ctx.keyword));

  assert.ok(hasExactQuery(BASE, ctx.keyword));
  assert.ok(hasExactQuery("Which Healthy-Meal Kit wins?", ctx.keyword));
  assert.ok(!hasExactQuery("Healthy food in a kit.", ctx.keyword));

  assert.ok(hasBulletList("- one\n- two"));
  assert.ok(!hasBulletList("- one only"));

  assert.ok(hasFreshnessClause("As of September 2026, prices rose."));
  assert.ok(!hasFreshnessClause("Prices rose as of September 2026, sadly."));

  assert.ok(hasQuestionHeading("## What is a healthy meal kit?\n\nBody."));
  assert.ok(!hasQuestionHeading("## Pricing\n\nBody?"));

  assert.ok(hasBoldQueryTerm("A **healthy** choice.", ctx.keyword));
  assert.ok(!hasBoldQueryTerm("A **cheap** choice for meals.", ctx.keyword));
});

test("S05 transform changes only the layout (same sentences as bullets)", () => {
  const s = sig("S05");
  const out = s.transform!(BASE, ctx)!;
  const lines = out.split("\n");
  assert.ok(lines.every((l) => l.startsWith("- ")));
  assert.equal(
    lines.map((l) => l.slice(2)).join(" "),
    splitSentences(BASE).join(" "),
  );
  assert.deepEqual(checkPair(s, { with: out, without: BASE }, ctx), {
    ok: true,
  });
});

test("S06 transform only prepends the freshness clause", () => {
  const s = sig("S06");
  const out = s.transform!(BASE, ctx)!;
  assert.equal(out, `As of September 2026, the${BASE.slice(3)}`);
  const named = s.transform!(
    "Forkful ships weekly. It is fast. It is cheap.",
    ctx,
  )!;
  assert.equal(
    named,
    "As of September 2026, Forkful ships weekly. It is fast. It is cheap.",
  );
  assert.deepEqual(checkPair(s, { with: out, without: BASE }, ctx), {
    ok: true,
  });
  assert.equal(isEligible(s, "Updated March 2025. " + BASE, ctx), false);
  assert.equal(isEligible(s, "- a list\n- of items", ctx), false);
});

test("S12 transform only adds the question heading", () => {
  const s = sig("S12");
  const out = s.transform!(BASE, ctx)!;
  assert.equal(out, `## What is healthy meal kit?\n\n${BASE}`);
  assert.equal(
    s.transform!(BASE, { ...ctx, keyword: "best meal kit" }),
    `## What is the best meal kit?\n\n${BASE}`,
  );
  assert.equal(
    s.transform!(BASE, { ...ctx, keyword: "how to lower cholesterol" }),
    `## How to lower cholesterol?\n\n${BASE}`,
  );
  assert.deepEqual(checkPair(s, { with: out, without: BASE }, ctx), {
    ok: true,
  });
  assert.equal(isEligible(s, "## Heading\n\n" + BASE, ctx), false);
});

test("S13 transform only wraps query terms in bold", () => {
  const s = sig("S13");
  const out = s.transform!(BASE, ctx)!;
  assert.match(out, /\*\*healthy meal kit\*\*/);
  assert.equal(out.replace(/\*\*/g, ""), BASE);
  assert.deepEqual(checkPair(s, { with: out, without: BASE }, ctx), {
    ok: true,
  });
  assert.equal(isEligible(s, "Already **bold** here. " + BASE, ctx), false);
  assert.equal(
    s.transform!("Nothing relevant here at all.", ctx),
    null,
    "no query term → skip",
  );
});

test("code-built signals skip bases that already have the feature", () => {
  assert.equal(isEligible(sig("S05"), "- a\n- b\n- c", ctx), false);
  assert.equal(isEligible(sig("S06"), `As of May 2026, ${BASE}`, ctx), false);
  assert.equal(
    isEligible(sig("S02"), BASE, ctx),
    true,
    "LLM signals always eligible",
  );
});

test("S14 length check uses its own [0.5, 0.75] target", () => {
  const s = sig("S14");
  const without = Array.from({ length: 100 }, (_, i) => `w${i}`).join(" ");
  const short = (k: number) =>
    Array.from({ length: k }, (_, i) => `w${i}`).join(" ");
  assert.deepEqual(checkPair(s, { with: short(60), without }, ctx), {
    ok: true,
  });
  assert.equal(checkPair(s, { with: short(90), without }, ctx).ok, false);
  assert.equal(checkPair(s, { with: short(40), without }, ctx).ok, false);
});

test("control checks: empty, echo, identical, detector, length, similarity", () => {
  const s02 = sig("S02");
  const withNum = BASE.replace("every week", "every 7 days");
  assert.deepEqual(checkPair(s02, { with: withNum, without: BASE }, ctx), {
    ok: true,
  });
  assert.equal(checkPair(s02, { with: "", without: BASE }, ctx).ok, false);
  assert.equal(checkPair(s02, { with: BASE, without: BASE }, ctx).ok, false);
  assert.equal(
    checkPair(s02, { with: `Here is the edit: ${withNum}`, without: BASE }, ctx)
      .ok,
    false,
  );
  // Detector: feature must be on `with` and absent from `without`
  assert.equal(
    checkPair(s02, { with: BASE + " Fast.", without: BASE }, ctx).ok,
    false,
  );
  assert.equal(
    checkPair(s02, { with: withNum, without: withNum + " Yes." }, ctx).ok,
    false,
  );
  // Length ratio outside [0.85, 1.18]
  assert.equal(
    checkPair(s02, { with: `${withNum} ${BASE} ${BASE}`, without: BASE }, ctx)
      .ok,
    false,
  );
  // Similarity < 0.80
  const rewritten =
    "Weekly chef recipes arrive in 7 days with portioned food, cards, a rotating menu and pausable plans for families who cook at home quickly and want a healthy meal kit.";
  const r = checkPair(s02, { with: rewritten, without: BASE }, ctx);
  assert.equal(r.ok, false);
});

test("wordSimilarity ignores markdown punctuation", () => {
  assert.equal(wordSimilarity("a **b** c", "a b c"), 1);
  assert.equal(wordSimilarity("a b c d", "a b c e"), 0.75);
  assert.equal(wordSimilarity("", ""), 1);
});

test("S00 placebo: exactly one sentence paraphrased, size-neutral", () => {
  const s = sig("S00");
  const one = BASE.replace(
    "Each box includes pre-portioned ingredients and simple cards.",
    "Every box contains pre-portioned ingredients and simple cards.",
  );
  assert.deepEqual(checkPair(s, { with: one, without: BASE }, ctx), { ok: true });
  // Two sentences reworded
  const two = one.replace("Customers pick dishes", "Subscribers choose dishes");
  assert.equal(checkPair(s, { with: two, without: BASE }, ctx).ok, false);
  // An inserted filler sentence changes the sentence count
  const filler = BASE.replace(
    "cards. ",
    "cards. In practice, this is worth noting. ",
  );
  assert.equal(checkPair(s, { with: filler, without: BASE }, ctx).ok, false);
});

test("no-op pairs are rejected after normalisation", () => {
  const s00 = sig("S00");
  const spaced = BASE.replace(/ /g, "  ").toUpperCase();
  assert.equal(checkPair(s00, { with: spaced, without: BASE }, ctx).ok, false);
  // Rewriter pairs that only change markup carry no wording difference
  const bolded = BASE.replace("healthy meal kit", "**healthy meal kit**");
  assert.equal(checkPair(s00, { with: bolded, without: BASE }, ctx).ok, false);
  // Code-built markup signals are still allowed to differ only in markup
  assert.deepEqual(
    checkPair(sig("S13"), { with: bolded, without: BASE }, ctx),
    { ok: true },
  );
});

test("S06 date skip: words that merely start with a month do not count", () => {
  const s06 = sig("S06");
  for (const word of ["market 2024", "decision 2023", "Marketing 2025", "Decision 2022"]) {
    assert.equal(
      isEligible(s06, `${BASE} The ${word} review was short.`, ctx),
      true,
      word,
    );
  }
  for (const date of ["March 2024", "Mar 2024", "Sept. 2023", "Sep 2023", "May 2026", "March 5, 2024", "dec 2021"]) {
    assert.equal(
      isEligible(s06, `${BASE} Updated ${date}.`, ctx),
      false,
      date,
    );
  }
});
