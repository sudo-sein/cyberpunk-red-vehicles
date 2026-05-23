const DAMAGE_CARD_TEMPLATE = `systems/cyberpunk-red-core/templates/chat/cpr-damage-application-card.hbs`;
const DEFAULT_VEHICLE_IMG = "systems/cyberpunk-red-core/icons/compendium/default/Default_Vehicle.svg";
const ARMORED_CHASSIS = "Armored Chassis";
const ARMORED_CHASSIS_SP = 13;

export default class CPRVehicleActor extends Actor {
  static async create(data, options = {}) {
    const createData = foundry.utils.deepClone(data);
    if (!createData.img) createData.img = DEFAULT_VEHICLE_IMG;
    if (!createData.prototypeToken) {
      createData.prototypeToken = {};
    }
    foundry.utils.mergeObject(createData.prototypeToken, {
      actorLink: true,
      disposition: CONST.TOKEN_DISPOSITIONS.NEUTRAL,
      displayBars: CONST.TOKEN_DISPLAY_MODES.NONE,
      bar1: { attribute: "sdp" },
      texture: { src: DEFAULT_VEHICLE_IMG },
    }, { overwrite: false });
    return super.create(createData, options);
  }

  prepareDerivedData() {
    super.prepareDerivedData();
    const s = this.system;
    for (const key of ["sdp", "sp"]) {
      const pool = s[key];
      if (pool.value > pool.max) pool.value = pool.max;
      if (pool.value < 0) pool.value = 0;
    }
  }

  _onCreateDescendantDocuments(parent, collection, documents, data, options, userId) {
    super._onCreateDescendantDocuments(parent, collection, documents, data, options, userId);
    if (collection !== "items" || userId !== game.user.id) return;
    const updates = {};
    if (documents.some((d) => this._isArmoredChassis(d))) {
      updates["system.sp.value"] = ARMORED_CHASSIS_SP;
      updates["system.sp.max"] = ARMORED_CHASSIS_SP;
    }
    this._collectUpgradeDeltas(documents, 1, updates);
    if (Object.keys(updates).length > 0) this.update(updates);
  }

  _onDeleteDescendantDocuments(parent, collection, documents, ids, options, userId) {
    super._onDeleteDescendantDocuments(parent, collection, documents, ids, options, userId);
    if (collection !== "items" || userId !== game.user.id) return;
    const updates = {};
    if (documents.some((d) => this._isArmoredChassis(d))) {
      updates["system.sp.value"] = 0;
      updates["system.sp.max"] = 0;
    }
    this._collectUpgradeDeltas(documents, -1, updates);
    if (Object.keys(updates).length > 0) this.update(updates);
  }

  _collectUpgradeDeltas(items, sign, updates) {
    for (const item of items) {
      if (item.type !== "itemUpgrade" || item.system.type !== "vehicle") continue;
      const mods = item.system.modifiers;

      const sdpMod = mods?.sdp;
      if (sdpMod?.value && sdpMod.type === "modifier") {
        const delta = sdpMod.value * sign;
        updates["system.sdp.max"] = (updates["system.sdp.max"] ?? this.system.sdp.max) + delta;
        updates["system.sdp.value"] = Math.max(
          0,
          (updates["system.sdp.value"] ?? this.system.sdp.value) + delta
        );
      }

      const seatsMod = mods?.seats;
      if (seatsMod?.value && seatsMod.type === "modifier") {
        updates["system.seats"] = Math.max(
          0,
          (updates["system.seats"] ?? this.system.seats) + seatsMod.value * sign
        );
      }

      const speedMod = mods?.speedCombat;
      if (speedMod?.value && speedMod.type === "modifier") {
        updates["system.speedCombat"] = Math.max(
          0,
          (updates["system.speedCombat"] ?? this.system.speedCombat) + speedMod.value * sign
        );
      }
    }
  }

  _isArmoredChassis(item) {
    if (item.type !== "itemUpgrade") return false;
    const originalName = item.flags?.babele?.originalName ?? item.name;
    return item.name === ARMORED_CHASSIS || originalName === ARMORED_CHASSIS;
  }

  async _applyDamage(
    damage,
    bonusDamage,
    location,
    ablation,
    ammoVariety,
    ignoreArmorPercent,
    ignoreBelowSP,
    damageLethal,
    formData
  ) {
    const currentSDP = this.system.sdp.value;
    const currentSP = this.system.sp.value;

    let effectiveSP = currentSP;
    let ignoreArmorEntirely = false;

    if (effectiveSP < ignoreBelowSP) {
      ignoreArmorEntirely = true;
    }

    if (ignoreArmorPercent !== 0 && !ignoreArmorEntirely) {
      effectiveSP = Math.round(
        effectiveSP - effectiveSP * (ignoreArmorPercent / 100)
      );
    }

    const armorData = {
      value: ignoreArmorEntirely ? 0 : effectiveSP,
      equipped: currentSP > 0,
    };

    const armorSPRef = ignoreArmorEntirely ? 0 : effectiveSP;
    let rawDamageDealt = 0;
    let totalDamageDealt = bonusDamage;

    if (damage <= armorSPRef && !ignoreArmorEntirely) {
      const takenDamage = Math.max(totalDamageDealt, 0);
      await this.update({
        "system.sdp.value": Math.max(currentSDP - takenDamage, 0),
      });
      this._renderDamageCard({
        damage,
        bonusDamage,
        hpReduction: takenDamage,
        rawDamageDealt,
        totalDamageDealt,
        location: "body",
        totalDamageReduction: 0,
        armorData,
        ablation: 0,
        shieldAblation: 0,
      });
      return;
    }

    rawDamageDealt = damage - armorSPRef;
    totalDamageDealt += rawDamageDealt;

    const takenDamage = Math.max(totalDamageDealt, 0);
    const appliedAblation = currentSP > 0 ? ablation : 0;

    const updates = {
      "system.sdp.value": Math.max(currentSDP - takenDamage, 0),
    };
    if (appliedAblation > 0) {
      updates["system.sp.value"] = Math.max(currentSP - appliedAblation, 0);
    }
    await this.update(updates);

    this._renderDamageCard({
      damage,
      bonusDamage,
      hpReduction: takenDamage,
      rawDamageDealt,
      totalDamageDealt,
      location: "body",
      totalDamageReduction: 0,
      armorData,
      ignoreArmorPercent,
      ignoreArmorEntirely,
      ignoreBelowSP,
      ablation: appliedAblation,
      shieldAblation: 0,
      damageLethal,
    });
  }

  async _reverseDamage(hpReduction, _location, ablation, _shieldAblation) {
    await this.update({
      "system.sdp.value": Math.min(
        this.system.sdp.value + hpReduction,
        this.system.sdp.max
      ),
      "system.sp.value": Math.min(
        this.system.sp.value + ablation,
        this.system.sp.max
      ),
    });
    ui.notifications.info(
      game.i18n.format("CPRVEHICLES.Notifications.DamageReversed", {
        damage: hpReduction,
        name: this.name,
      })
    );
  }

  _renderDamageCard(damageData) {
    renderTemplate(DAMAGE_CARD_TEMPLATE, {
      ...damageData,
      actor: this,
    }).then((html) => {
      const chatData = {
        user: game.user.id,
        rollMode: game.settings.get("core", "rollMode"),
        content: html,
      };
      if (["gmroll", "blindroll"].includes(chatData.rollMode)) {
        chatData.whisper = ChatMessage.getWhisperRecipients("GM").map(
          (u) => u.id
        );
      }
      if (chatData.rollMode === "selfroll") {
        chatData.whisper = [game.user.id];
      }
      ChatMessage.create(chatData);
    });
  }
}
