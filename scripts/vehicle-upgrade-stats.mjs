export const VEHICLE_BASE_STAT_FIELDS = [
  "system.sdp.max",
  "system.sp.max",
  "system.seats",
  "system.speedCombat",
];

export function hasVehicleBaseStatField(formData) {
  return VEHICLE_BASE_STAT_FIELDS.some((field) =>
    Object.prototype.hasOwnProperty.call(formData, field)
  );
}

export function computeVehicleBaseStatsFromCurrent(
  current,
  totals,
  armoredChassisSP = 13
) {
  return {
    sdpMax: Math.max(0, Number(current.sdpMax ?? 0) - Number(totals.sdpMax ?? 0)),
    spMax: Math.max(
      0,
      Number(current.spMax ?? 0) - (totals.hasArmoredChassis ? armoredChassisSP : 0)
    ),
    seats: Math.max(0, Number(current.seats ?? 0) - Number(totals.seats ?? 0)),
    speedCombat: Math.max(
      0,
      Number(current.speedCombat ?? 0) - Number(totals.speedCombat ?? 0)
    ),
  };
}
