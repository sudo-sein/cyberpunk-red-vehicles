import test from "node:test";
import assert from "node:assert/strict";

import {
  chooseMountTypeForWeapon,
  getWeaponAllowedMounts,
} from "../scripts/vehicle-weapon-handling.js";

const MODULE_ID = "cyberpunk-red-vehicles";

function weapon({ name, weaponType, weaponSkill = "" }) {
  return {
    type: "weapon",
    name,
    system: { weaponType, weaponSkill },
    getFlag: () => undefined,
  };
}

function upgrade(name) {
  return {
    type: "itemUpgrade",
    name,
    system: { type: "vehicle" },
  };
}

function actorWithInstalledUpgrades(upgrades) {
  return {
    items: upgrades,
    isVehicleUpgradeInstalled: () => true,
  };
}

test("allows core Flamethrower item on a flamethrower mount", () => {
  const coreFlamethrower = weapon({
    name: "Flamethrower",
    weaponType: "shotgun",
    weaponSkill: "Heavy Weapons",
  });

  assert.equal(
    chooseMountTypeForWeapon(
      actorWithInstalledUpgrades([upgrade("Onboard Flamethrower")]),
      coreFlamethrower,
      MODULE_ID
    ).mountType,
    "flamethrower"
  );
});

test("prefers flamethrower mount over generic heavy mount for Flamethrowers", () => {
  const coreFlamethrower = weapon({
    name: "Flamethrower",
    weaponType: "shotgun",
    weaponSkill: "Heavy Weapons",
  });

  assert.equal(
    chooseMountTypeForWeapon(
      actorWithInstalledUpgrades([
        upgrade("Vehicle Heavy Weapon Mount"),
        upgrade("Onboard Flamethrower"),
      ]),
      coreFlamethrower,
      MODULE_ID
    ).mountType,
    "flamethrower"
  );
});

test("allows core melee weapon types on melee mounts", () => {
  for (const weaponType of ["lightMelee", "medMelee", "heavyMelee", "vHeavyMelee"]) {
    assert.deepEqual(
      getWeaponAllowedMounts(weapon({ name: weaponType, weaponType })),
      ["meleeMount"]
    );
  }
});
