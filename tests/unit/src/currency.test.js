import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { stroopsToDisplay, displayToStroops } from "@delego/utils";

describe("currency", () => {
  it("converts stroops to display", () => {
    assert.equal(stroopsToDisplay(10_000_000n), "1.0000000");
  });

  it("converts display to stroops", () => {
    assert.equal(displayToStroops("1.5"), 15_000_000n);
  });
});
