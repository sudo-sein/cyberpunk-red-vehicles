const UPGRADE_MOUNT_RULES = [
  { upgradeName: "Onboard Machine Gun", mountType: "machineGun" },
  { upgradeName: "Vehicle Heavy Weapon Mount", mountType: "heavyMount" },
  { upgradeName: "Onboard Rocket Pod", mountType: "rocketPod" },
  { upgradeName: "Onboard Flamethrower", mountType: "flamethrower" },
  { upgradeName: "Onboard Melee Weapon", mountType: "meleeMount" },
];

const DEFAULT_MOUNT_ORDER = [
  "machineGun",
  "heavyMount",
  "rocketPod",
  "flamethrower",
  "meleeMount",
];

const WEAPON_TYPE_PRIORITY = {
  rocketlauncher: ["rocketPod", "heavyMount"],
};

const FLAMETHROWER_MOUNT_PRIORITY = [
  "flamethrower",
  "heavyMount",
  "machineGun",
  "rocketPod",
  "meleeMount",
];

const MELEE_WEAPON_TYPES = new Set([
  "lightmelee",
  "medmelee",
  "heavymelee",
  "vheavymelee",
]);

function normalize(value) {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "");
}

function getItemOriginalName(item) {
  return item?.flags?.babele?.originalName ?? item?.name ?? "";
}

function isNamedUpgrade(item, expectedName) {
  const expected = normalize(expectedName);
  return (
    normalize(item?.name) === expected ||
    normalize(getItemOriginalName(item)) === expected
  );
}

function isHeavyWeaponSkill(weapon) {
  return normalize(weapon?.system?.weaponSkill) === "heavyweapons";
}

function getWeaponTypeKey(weapon) {
  return normalize(weapon?.system?.weaponType);
}

function isFlamethrowerWeapon(weapon) {
  return (
    normalize(weapon?.name).includes("flamethrower") ||
    normalize(getItemOriginalName(weapon)).includes("flamethrower")
  );
}

export function getVehicleWeaponState(item, moduleId) {
  const data = item?.getFlag(moduleId, "vehicleWeapon") ?? {};
  return {
    installed: data.installed === true,
    mountType: typeof data.mountType === "string" ? data.mountType : null,
  };
}

export function isVehicleWeaponItem(item) {
  return item?.type === "weapon";
}

export function getAvailableMounts(actor) {
  const mounts = {
    machineGun: 0,
    heavyMount: 0,
    rocketPod: 0,
    flamethrower: 0,
    meleeMount: 0,
  };

  const installedUpgrades = actor.items.filter(
    (item) =>
      item?.type === "itemUpgrade" &&
      item?.system?.type === "vehicle" &&
      actor.isVehicleUpgradeInstalled(item)
  );

  for (const rule of UPGRADE_MOUNT_RULES) {
    const hasUpgrade = installedUpgrades.some((upgrade) =>
      isNamedUpgrade(upgrade, rule.upgradeName)
    );
    if (hasUpgrade) mounts[rule.mountType] = 1;
  }

  return mounts;
}

export function getMountedWeapons(actor, moduleId) {
  return actor.items.filter((item) => {
    if (!isVehicleWeaponItem(item)) return false;
    return getVehicleWeaponState(item, moduleId).installed;
  });
}

export function getOccupiedMounts(actor, moduleId) {
  const occupied = {
    machineGun: 0,
    heavyMount: 0,
    rocketPod: 0,
    flamethrower: 0,
    meleeMount: 0,
  };
  for (const weapon of getMountedWeapons(actor, moduleId)) {
    const { mountType } = getVehicleWeaponState(weapon, moduleId);
    if (mountType && Object.hasOwn(occupied, mountType)) {
      occupied[mountType] += 1;
    }
  }
  return occupied;
}

export function getWeaponAllowedMounts(weapon) {
  const typeKey = getWeaponTypeKey(weapon);
  const mounts = new Set();

  if (typeKey === "assaultrifle") mounts.add("machineGun");
  if (typeKey === "rocketlauncher") mounts.add("rocketPod");
  if (typeKey === "flamethrower" || isFlamethrowerWeapon(weapon)) {
    mounts.add("flamethrower");
  }
  if (typeKey === "meleeweapon" || MELEE_WEAPON_TYPES.has(typeKey)) {
    mounts.add("meleeMount");
  }

  if (typeKey === "rocketlauncher" || typeKey === "grenadelauncher" || isHeavyWeaponSkill(weapon)) {
    mounts.add("heavyMount");
  }

  return Array.from(mounts);
}

export function chooseMountTypeForWeapon(actor, weapon, moduleId) {
  if (!isVehicleWeaponItem(weapon)) {
    return { ok: false, reason: "weaponNotSupported" };
  }

  const allowedMounts = getWeaponAllowedMounts(weapon);
  if (allowedMounts.length === 0) {
    return { ok: false, reason: "weaponNotSupported" };
  }

  const available = getAvailableMounts(actor);
  const occupied = getOccupiedMounts(actor, moduleId);
  const availableAllowed = allowedMounts.filter((mountType) => available[mountType] > 0);

  if (availableAllowed.length === 0) {
    return { ok: false, reason: "missingUpgrade" };
  }

  const typeKey = getWeaponTypeKey(weapon);
  const priority = isFlamethrowerWeapon(weapon)
    ? FLAMETHROWER_MOUNT_PRIORITY
    : WEAPON_TYPE_PRIORITY[typeKey] ?? DEFAULT_MOUNT_ORDER;
  const sortedChoices = availableAllowed.sort(
    (a, b) => priority.indexOf(a) - priority.indexOf(b)
  );

  const mountType = sortedChoices.find((choice) => occupied[choice] < available[choice]);
  if (!mountType) {
    return { ok: false, reason: "slotOccupied" };
  }

  return { ok: true, mountType };
}

export function partitionVehicleWeapons(actor, moduleId) {
  const mounted = [];
  const cargo = [];

  for (const item of actor.items) {
    if (!isVehicleWeaponItem(item)) continue;
    const state = getVehicleWeaponState(item, moduleId);
    if (state.installed) mounted.push(item);
    else cargo.push(item);
  }

  mounted.sort((a, b) => a.name.localeCompare(b.name));
  cargo.sort((a, b) => a.name.localeCompare(b.name));

  return { mounted, cargo };
}
