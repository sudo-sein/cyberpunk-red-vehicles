import test from "node:test";
import assert from "node:assert/strict";

import {
  computeVehicleBaseStatsFromCurrent,
  hasVehicleBaseStatField,
} from "../scripts/vehicle-upgrade-stats.mjs";

test("detects vehicle base stat fields in flattened sheet form data", () => {
  assert.equal(hasVehicleBaseStatField({ "system.sdp.max": 45 }), true);
  assert.equal(hasVehicleBaseStatField({ "system.speedNarrative": "20 MPH" }), false);
});

test("derives base stats from displayed stats by removing installed upgrade totals", () => {
  const current = {
    sdpMax: 55,
    spMax: 13,
    seats: 6,
    speedCombat: 25,
  };
  const totals = {
    sdpMax: 10,
    seats: 2,
    speedCombat: 5,
    hasArmoredChassis: true,
  };

  assert.deepEqual(computeVehicleBaseStatsFromCurrent(current, totals), {
    sdpMax: 45,
    spMax: 0,
    seats: 4,
    speedCombat: 20,
  });
});

test("clamps derived base stats at zero", () => {
  assert.deepEqual(
    computeVehicleBaseStatsFromCurrent(
      { sdpMax: 5, spMax: 0, seats: 1, speedCombat: 2 },
      { sdpMax: 10, seats: 3, speedCombat: 5, hasArmoredChassis: true }
    ),
    { sdpMax: 0, spMax: 0, seats: 0, speedCombat: 0 }
  );
});
