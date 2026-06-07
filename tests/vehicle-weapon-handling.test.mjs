import test from "node:test";
import assert from "node:assert/strict";

import {
  deriveWeaponMountLabel,
  getWeaponAllowedMounts,
} from "../scripts/vehicle-weapon-handling.js";

function weapon({ name, weaponType, weaponSkill = "" }) {
  return {
    type: "weapon",
    name,
    system: { weaponType, weaponSkill },
    getFlag: () => undefined,
  };
}

test("derives machineGun label for assault rifles", () => {
  assert.equal(
    deriveWeaponMountLabel(weapon({ name: "AR", weaponType: "assaultRifle" })),
    "machineGun"
  );
});

test("derives rocketPod label (preferred over heavyMount) for rocket launchers", () => {
  assert.equal(
    deriveWeaponMountLabel(
      weapon({ name: "RL", weaponType: "rocketLauncher" })
    ),
    "rocketPod"
  );
});

test("derives flamethrower label for a Flamethrower by name", () => {
  assert.equal(
    deriveWeaponMountLabel(
      weapon({ name: "Flamethrower", weaponType: "shotgun", weaponSkill: "Heavy Weapons" })
    ),
    "flamethrower"
  );
});

test("derives heavyMount label for grenade launchers", () => {
  assert.equal(
    deriveWeaponMountLabel(
      weapon({ name: "GL", weaponType: "grenadeLauncher" })
    ),
    "heavyMount"
  );
});

test("derives generic label for weapons with no mount category (pistols)", () => {
  assert.equal(
    deriveWeaponMountLabel(weapon({ name: "Pistol", weaponType: "pistol" })),
    "generic"
  );
});

test("still maps core melee weapon types to a melee mount", () => {
  for (const weaponType of ["lightMelee", "medMelee", "heavyMelee", "vHeavyMelee"]) {
    assert.deepEqual(
      getWeaponAllowedMounts(weapon({ name: weaponType, weaponType })),
      ["meleeMount"]
    );
  }
});
