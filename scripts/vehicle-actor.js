export default class CPRVehicleActor extends Actor {
  static async create(data, options = {}) {
    const createData = foundry.utils.deepClone(data);
    if (!createData.prototypeToken) {
      createData.prototypeToken = {};
    }
    foundry.utils.mergeObject(createData.prototypeToken, {
      actorLink: true,
      disposition: CONST.TOKEN_DISPOSITIONS.NEUTRAL,
      displayBars: CONST.TOKEN_DISPLAY_MODES.OWNER_HOVER,
      bar1: { attribute: "system.sdp" },
    }, { overwrite: false });
    return super.create(createData, options);
  }

  prepareDerivedData() {
    super.prepareDerivedData();
    const s = this.system;

    const mods = this._getUpgradeMods();
    s.sdp.max = this._applyMod(s.sdp.max, mods.sdp);
    s.seats = this._applyMod(s.seats, mods.seats);
    s.speedCombat = this._applyMod(s.speedCombat, mods.speedCombat);

    for (const key of ["sdp", "sp"]) {
      const pool = s[key];
      if (pool.value > pool.max) pool.value = pool.max;
      if (pool.value < 0) pool.value = 0;
    }
  }

  _getUpgradeMods() {
    const result = {};
    const KEYS = ["sdp", "seats", "speedCombat"];
    for (const k of KEYS) result[k] = { type: "modifier", value: 0 };

    const upgrades = this.items.filter(
      (i) => i.type === "itemUpgrade" && i.system.type === "vehicle"
    );
    for (const item of upgrades) {
      const mods = item.system.modifiers;
      for (const k of KEYS) {
        const mod = mods?.[k];
        if (!mod?.value) continue;
        const agg = result[k];
        if (agg.type === "override") {
          if (mod.type === "override" && mod.value > agg.value) agg.value = mod.value;
        } else if (mod.type === "override") {
          agg.type = "override";
          agg.value = mod.value;
        } else {
          agg.value += mod.value;
        }
      }
    }
    return result;
  }

  _applyMod(base, mod) {
    if (mod.type === "override") return mod.value;
    return base + mod.value;
  }
}
