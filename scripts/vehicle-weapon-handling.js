const MELEE_WEAPON_TYPES = new Set([
  "lightmelee",
  "medmelee",
  "heavymelee",
  "vheavymelee",
]);

// Display-only priority. A weapon may match several categories (e.g. a rocket
// launcher allows both rocketPod and heavyMount); the first match wins.
const MOUNT_LABEL_PRIORITY = [
  "flamethrower",
  "machineGun",
  "rocketPod",
  "meleeMount",
  "heavyMount",
];

function normalize(value) {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "");
}

function getItemOriginalName(item) {
  return item?.flags?.babele?.originalName ?? item?.name ?? "";
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

export function deriveWeaponMountLabel(weapon) {
  const allowed = getWeaponAllowedMounts(weapon);
  return MOUNT_LABEL_PRIORITY.find((mount) => allowed.includes(mount)) ?? "generic";
}

export function getMountedWeapons(actor, moduleId) {
  return actor.items.filter((item) => {
    if (!isVehicleWeaponItem(item)) return false;
    return getVehicleWeaponState(item, moduleId).installed;
  });
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
