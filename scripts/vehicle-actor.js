import CPRChat from "../../../systems/cyberpunk-red-core/modules/chat/cpr-chat.js";
import {
  chooseMountTypeForWeapon,
  getVehicleWeaponState,
  isVehicleWeaponItem,
  partitionVehicleWeapons,
} from "./vehicle-weapon-handling.js";

const DAMAGE_CARD_TEMPLATE = `systems/cyberpunk-red-core/templates/chat/cpr-damage-application-card.hbs`;
const DEFAULT_VEHICLE_IMG = "systems/cyberpunk-red-core/icons/compendium/default/Default_Vehicle.svg";
const MODULE_ID = "cyberpunk-red-vehicles";
const CORE_SYSTEM_ID = "cyberpunk-red-core";
const INSTALLED_FLAG = "installed";
const BASE_STATS_FLAG = "baseStats";
const MIGRATION_VERSION_FLAG = "upgradeInstallStateMigrationVersion";
const UPGRADE_INSTALL_MIGRATION_VERSION = 1;
const ARMORED_CHASSIS = "Armored Chassis";
const ARMORED_CHASSIS_SP = 13;
const VEHICLE_WEAPON_FLAG = "vehicleWeapon";

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

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

  _onUpdateDescendantDocuments(parent, collection, documents, changes, options, userId) {
    super._onUpdateDescendantDocuments(parent, collection, documents, changes, options, userId);
    if (collection !== "items" || userId !== game.user.id) return;
    if (!documents.some((doc) => this._isVehicleUpgrade(doc))) return;
    this.recalculateVehicleUpgrades();
  }

  _onCreateDescendantDocuments(parent, collection, documents, data, options, userId) {
    super._onCreateDescendantDocuments(parent, collection, documents, data, options, userId);
    if (collection !== "items" || userId !== game.user.id) return;

    const itemUpdates = [];
    for (const item of documents) {
      if (!this._isVehicleUpgrade(item)) continue;
      itemUpdates.push({
        _id: item.id,
        [`flags.${MODULE_ID}.${INSTALLED_FLAG}`]: false,
      });
    }

    const recalculate = () => this.recalculateVehicleUpgrades();
    if (itemUpdates.length > 0) {
      this.updateEmbeddedDocuments("Item", itemUpdates).then(recalculate);
    } else {
      recalculate();
    }
  }

  _onDeleteDescendantDocuments(parent, collection, documents, ids, options, userId) {
    super._onDeleteDescendantDocuments(parent, collection, documents, ids, options, userId);
    if (collection !== "items" || userId !== game.user.id) return;
    this.recalculateVehicleUpgrades();
  }

  _isVehicleUpgrade(item) {
    return item?.type === "itemUpgrade" && item.system?.type === "vehicle";
  }

  getOwnedItem(itemId) {
    return this.items.find((item) => item._id === itemId || item.uuid === itemId);
  }

  getMultipleOwnedItems(itemIds) {
    return itemIds.map((id) => this.getOwnedItem(id));
  }

  _isVehicleUpgradeInstalled(item) {
    return item.getFlag(MODULE_ID, INSTALLED_FLAG) === true;
  }

  _getItemPackId(item) {
    if (item.pack) return item.pack;

    const sourceId = item.flags?.core?.sourceId;
    if (typeof sourceId === "string" && sourceId.startsWith("Compendium.")) {
      const [scope, packageName] = sourceId.split(".").slice(1, 3);
      if (scope && packageName) return `${scope}.${packageName}`;
    }

    return "world";
  }

  _normalizeName(name) {
    return String(name ?? "").trim().toLowerCase();
  }

  _getUpgradeUniqueKey(item) {
    return `${this._normalizeName(item.name)}::${this._getItemPackId(item)}`;
  }

  _getUpgradeModifierValue(item, modifierKey) {
    const mod = item.system?.modifiers?.[modifierKey];
    if (mod?.type !== "modifier") return 0;
    const value = Number(mod.value ?? 0);
    return Number.isFinite(value) ? value : 0;
  }

  _collectUpgradeTotals(items) {
    const totals = {
      sdpMax: 0,
      seats: 0,
      speedCombat: 0,
      hasArmoredChassis: false,
    };

    for (const item of items) {
      totals.sdpMax += this._getUpgradeModifierValue(item, "sdp");
      totals.seats += this._getUpgradeModifierValue(item, "seats");
      totals.speedCombat += this._getUpgradeModifierValue(item, "speedCombat");
      totals.hasArmoredChassis ||= this._isArmoredChassis(item);
    }

    return totals;
  }

  _getCurrentStatsSnapshot() {
    return {
      sdpMax: Number(this.system.sdp.max ?? 0),
      spMax: Number(this.system.sp.max ?? 0),
      seats: Number(this.system.seats ?? 0),
      speedCombat: Number(this.system.speedCombat ?? 0),
    };
  }

  _getBaseStats() {
    const current = this._getCurrentStatsSnapshot();
    const raw = this.getFlag(MODULE_ID, BASE_STATS_FLAG) ?? {};
    return {
      sdpMax: Math.max(0, Number(raw.sdpMax ?? current.sdpMax ?? 0)),
      spMax: Math.max(0, Number(raw.spMax ?? current.spMax ?? 0)),
      seats: Math.max(0, Number(raw.seats ?? current.seats ?? 0)),
      speedCombat: Math.max(0, Number(raw.speedCombat ?? current.speedCombat ?? 0)),
    };
  }

  _computeBaseStatsFromCurrentWithUpgrades(upgrades) {
    const current = this._getCurrentStatsSnapshot();
    const totals = this._collectUpgradeTotals(upgrades);
    return {
      sdpMax: Math.max(0, current.sdpMax - totals.sdpMax),
      spMax: Math.max(
        0,
        current.spMax - (totals.hasArmoredChassis ? ARMORED_CHASSIS_SP : 0)
      ),
      seats: Math.max(0, current.seats - totals.seats),
      speedCombat: Math.max(0, current.speedCombat - totals.speedCombat),
    };
  }

  isVehicleUpgradeInstalled(item) {
    return this._isVehicleUpgrade(item) && this._isVehicleUpgradeInstalled(item);
  }

  async setVehicleBaseStats(baseStats) {
    const safeBaseStats = {
      sdpMax: Math.max(0, Number(baseStats?.sdpMax ?? 0)),
      spMax: Math.max(0, Number(baseStats?.spMax ?? 0)),
      seats: Math.max(0, Number(baseStats?.seats ?? 0)),
      speedCombat: Math.max(0, Number(baseStats?.speedCombat ?? 0)),
    };
    await this.setFlag(MODULE_ID, BASE_STATS_FLAG, safeBaseStats);
  }

  async setVehicleUpgradeInstalled(itemId, installed) {
    const item = this.items.get(itemId);
    if (!this._isVehicleUpgrade(item)) {
      return false;
    }

    const desiredState = installed === true;
    if (desiredState) {
      const targetKey = this._getUpgradeUniqueKey(item);
      const conflict = this.items.find((ownedItem) => {
        if (ownedItem.id === item.id) return false;
        if (!this._isVehicleUpgradeInstalled(ownedItem)) return false;
        return this._getUpgradeUniqueKey(ownedItem) === targetKey;
      });

      if (conflict) {
        ui.notifications.warn(
          game.i18n.format("CPRVEHICLES.Notifications.UpgradeAlreadyInstalled", {
            itemName: item.name,
            conflictName: conflict.name,
          })
        );
        return false;
      }
    }

    await item.setFlag(MODULE_ID, INSTALLED_FLAG, desiredState);
    await this.recalculateVehicleUpgrades();
    return true;
  }

  async ensureVehicleUpgradeInstallStateMigration() {
    const vehicleUpgrades = this.items
      .filter((item) => this._isVehicleUpgrade(item))
      .sort((a, b) => a.id.localeCompare(b.id));

    const migrationVersion = this.getFlag(MODULE_ID, MIGRATION_VERSION_FLAG) ?? 0;
    const hasExplicitInstallState = vehicleUpgrades.some(
      (item) => item.getFlag(MODULE_ID, INSTALLED_FLAG) !== undefined
    );

    if (
      migrationVersion >= UPGRADE_INSTALL_MIGRATION_VERSION ||
      hasExplicitInstallState
    ) {
      const itemUpdates = [];
      for (const item of vehicleUpgrades) {
        if (item.getFlag(MODULE_ID, INSTALLED_FLAG) !== undefined) continue;
        itemUpdates.push({
          _id: item.id,
          [`flags.${MODULE_ID}.${INSTALLED_FLAG}`]: false,
        });
      }
      if (itemUpdates.length > 0) {
        await this.updateEmbeddedDocuments("Item", itemUpdates);
      }

      if (!this.getFlag(MODULE_ID, BASE_STATS_FLAG)) {
        const installedUpgrades = vehicleUpgrades.filter((item) =>
          this._isVehicleUpgradeInstalled(item)
        );
        await this.setVehicleBaseStats(
          this._computeBaseStatsFromCurrentWithUpgrades(installedUpgrades)
        );
      }

      if (migrationVersion < UPGRADE_INSTALL_MIGRATION_VERSION) {
        await this.setFlag(
          MODULE_ID,
          MIGRATION_VERSION_FLAG,
          UPGRADE_INSTALL_MIGRATION_VERSION
        );
      }

      await this.recalculateVehicleUpgrades();
      return;
    }

    const baseStats = this._computeBaseStatsFromCurrentWithUpgrades(vehicleUpgrades);
    const seenKeys = new Set();
    const itemUpdates = [];

    for (const item of vehicleUpgrades) {
      const uniqueKey = this._getUpgradeUniqueKey(item);
      const shouldInstall = !seenKeys.has(uniqueKey);
      seenKeys.add(uniqueKey);
      itemUpdates.push({
        _id: item.id,
        [`flags.${MODULE_ID}.${INSTALLED_FLAG}`]: shouldInstall,
      });
    }

    if (itemUpdates.length > 0) {
      await this.updateEmbeddedDocuments("Item", itemUpdates);
    }

    await this.setVehicleBaseStats(baseStats);
    await this.setFlag(
      MODULE_ID,
      MIGRATION_VERSION_FLAG,
      UPGRADE_INSTALL_MIGRATION_VERSION
    );
    await this.recalculateVehicleUpgrades();
  }

  async recalculateVehicleUpgrades() {
    const base = this._getBaseStats();
    const installedUpgrades = this.items.filter((item) =>
      this._isVehicleUpgradeInstalled(item)
    );
    const totals = this._collectUpgradeTotals(installedUpgrades);

    const oldSdpMax = Number(this.system.sdp.max ?? 0);
    const oldSdpValue = Number(this.system.sdp.value ?? 0);
    const oldSpMax = Number(this.system.sp.max ?? 0);
    const oldSpValue = Number(this.system.sp.value ?? 0);

    const nextSdpMax = Math.max(0, base.sdpMax + totals.sdpMax);
    const nextSpMax = Math.max(
      0,
      base.spMax + (totals.hasArmoredChassis ? ARMORED_CHASSIS_SP : 0)
    );
    const nextSeats = Math.max(0, base.seats + totals.seats);
    const nextSpeedCombat = Math.max(0, base.speedCombat + totals.speedCombat);
    const nextSdpValue = clamp(
      oldSdpValue + (nextSdpMax - oldSdpMax),
      0,
      nextSdpMax
    );
    const nextSpValue = clamp(oldSpValue + (nextSpMax - oldSpMax), 0, nextSpMax);

    const updates = {};
    if (this.system.sdp.max !== nextSdpMax) updates["system.sdp.max"] = nextSdpMax;
    if (this.system.sdp.value !== nextSdpValue) {
      updates["system.sdp.value"] = nextSdpValue;
    }
    if (this.system.sp.max !== nextSpMax) updates["system.sp.max"] = nextSpMax;
    if (this.system.sp.value !== nextSpValue) updates["system.sp.value"] = nextSpValue;
    if (this.system.seats !== nextSeats) updates["system.seats"] = nextSeats;
    if (this.system.speedCombat !== nextSpeedCombat) {
      updates["system.speedCombat"] = nextSpeedCombat;
    }

    if (Object.keys(updates).length > 0) {
      await this.update(updates);
    }
  }

  _isArmoredChassis(item) {
    if (item.type !== "itemUpgrade") return false;
    const originalName = item.flags?.babele?.originalName ?? item.name;
    return item.name === ARMORED_CHASSIS || originalName === ARMORED_CHASSIS;
  }

  _getVehicleWeaponFlagPath() {
    return `flags.${MODULE_ID}.${VEHICLE_WEAPON_FLAG}`;
  }

  _getVehicleWeaponState(item) {
    return getVehicleWeaponState(item, MODULE_ID);
  }

  isVehicleWeaponMounted(item) {
    if (!isVehicleWeaponItem(item)) return false;
    return this._getVehicleWeaponState(item).installed;
  }

  _getMountedWeaponItem(itemId) {
    const item = this.items.get(itemId);
    if (!isVehicleWeaponItem(item)) return null;
    return this.isVehicleWeaponMounted(item) ? item : null;
  }

  async installVehicleWeapon(itemId) {
    const weapon = this.items.get(itemId);
    if (!isVehicleWeaponItem(weapon)) {
      return { ok: false, reason: "weaponNotSupported" };
    }

    if (this._getVehicleWeaponState(weapon).installed) {
      return { ok: false, reason: "alreadyInstalled" };
    }

    const choice = chooseMountTypeForWeapon(this, weapon, MODULE_ID);
    if (!choice.ok) return choice;

    await weapon.update({
      [this._getVehicleWeaponFlagPath()]: {
        installed: true,
        mountType: choice.mountType,
      },
    });

    return { ok: true, mountType: choice.mountType };
  }

  async uninstallVehicleWeapon(itemId) {
    const weapon = this.items.get(itemId);
    if (!isVehicleWeaponItem(weapon)) {
      return { ok: false, reason: "weaponNotSupported" };
    }

    if (!this._getVehicleWeaponState(weapon).installed) {
      return { ok: false, reason: "notInstalled" };
    }

    await weapon.update({
      [this._getVehicleWeaponFlagPath()]: {
        installed: false,
        mountType: null,
      },
    });

    return { ok: true };
  }

  _getWeaponFireMode(itemId) {
    return this.getFlag(CORE_SYSTEM_ID, `firetype-${itemId}`) ?? "attack";
  }

  async toggleVehicleWeaponFireMode(itemId, fireMode) {
    const weapon = this._getMountedWeaponItem(itemId);
    if (!weapon) return { ok: false, reason: "notInstalled" };

    const flagName = `firetype-${itemId}`;
    const current = this.getFlag(CORE_SYSTEM_ID, flagName);
    if (current === fireMode) {
      await this.unsetFlag(CORE_SYSTEM_ID, flagName);
    } else {
      await this.setFlag(CORE_SYSTEM_ID, flagName, fireMode);
    }
    return { ok: true };
  }

  async applyVehicleWeaponAction(itemId, actionType) {
    const weapon = this._getMountedWeaponItem(itemId);
    if (!weapon) return { ok: false, reason: "notInstalled" };

    if (actionType === "change-ammo") {
      if (typeof weapon.load === "function") {
        await weapon.load();
        return { ok: true };
      }
      return { ok: false, reason: "actionNotSupported" };
    }

    if (actionType === "reload") {
      if (typeof weapon.reload === "function") {
        await weapon.reload();
        return { ok: true };
      }
      return { ok: false, reason: "actionNotSupported" };
    }

    return { ok: false, reason: "actionNotSupported" };
  }

  _getSelectableAttackActors() {
    return game.actors
      .filter((actor) => actor.testUserPermission(game.user, "OWNER"))
      .filter((actor) => ["character", "mook"].includes(actor.type));
  }

  async _promptAttackActorSelection() {
    const candidates = this._getSelectableAttackActors();
    if (candidates.length === 0) return null;

    const options = candidates
      .map((actor) => `<option value="${actor.id}">${actor.name}</option>`)
      .join("");
    const content = `
      <form>
        <div class="form-group">
          <label>${game.i18n.localize("CPRVEHICLES.Dialog.ActorPicker.Label")}</label>
          <select name="actorId">${options}</select>
        </div>
      </form>
    `;

    return new Promise((resolve) => {
      new Dialog({
        title: game.i18n.localize("CPRVEHICLES.Dialog.ActorPicker.Title"),
        content,
        buttons: {
          confirm: {
            label: game.i18n.localize("CPRVEHICLES.Dialog.ActorPicker.Confirm"),
            callback: (html) => {
              const actorId = html.find("select[name='actorId']").val();
              resolve(game.actors.get(actorId) ?? null);
            },
          },
          cancel: {
            label: game.i18n.localize("CPRVEHICLES.Dialog.ActorPicker.Cancel"),
            callback: () => resolve(null),
          },
        },
        default: "confirm",
        close: () => resolve(null),
      }).render(true);
    });
  }

  async _resolveVehicleAttackActor() {
    if (game.user.character) return game.user.character;
    return this._promptAttackActorSelection();
  }

  _createActorIndependentDamageProxy() {
    return {
      itemTypes: { role: [] },
      allApplicableEffects: () => [],
      getFlag: () => null,
      setFlag: async () => {},
      unsetFlag: async () => {},
      getStat: () => 0,
      getSkillLevel: () => 0,
      getArmorPenaltyMods: () => 0,
      getWoundStateMods: () => 0,
    };
  }

  async _rollAndSendToChat(cprRoll, actorForCard, item, event, entityActor = this) {
    const keepRolling = await cprRoll.handleRollDialog(event ?? {}, actorForCard, item);
    if (!keepRolling) return { ok: false, reason: "rollCancelled" };

    if (item) {
      cprRoll = await item.confirmRoll(cprRoll);
    }

    await cprRoll.roll();
    cprRoll.entityData = {
      actor: entityActor?.id ?? actorForCard?.id ?? this.id,
      token: null,
      tokens: [],
      item: item?.id,
    };
    CPRChat.RenderRollCard(cprRoll);
    return { ok: true };
  }

  async rollVehicleWeaponAttack(itemId, eventContext = {}) {
    const weapon = this._getMountedWeaponItem(itemId);
    if (!weapon) return { ok: false, reason: "notInstalled" };

    const attackActor = await this._resolveVehicleAttackActor();
    if (!attackActor) return { ok: false, reason: "actorSelectionCancelled" };

    const fireMode = this._getWeaponFireMode(itemId);
    const cprRoll = weapon.createRoll(fireMode, attackActor);
    if (!cprRoll) return { ok: false, reason: "rollUnavailable" };

    return this._rollAndSendToChat(
      cprRoll,
      attackActor,
      weapon,
      eventContext.event,
      this
    );
  }

  async rollVehicleWeaponDamage(itemId, eventContext = {}) {
    const weapon = this._getMountedWeaponItem(itemId);
    if (!weapon) return { ok: false, reason: "notInstalled" };

    const fireMode = this._getWeaponFireMode(itemId);
    if (fireMode === "suppressive") {
      return { ok: false, reason: "damageNotAvailableForSuppressive" };
    }

    const damageType = fireMode === "aimed" ? "aimed" : fireMode;
    const proxyActor = this._createActorIndependentDamageProxy();
    const cprRoll = weapon.createRoll("damage", proxyActor, { damageType });
    if (!cprRoll) return { ok: false, reason: "rollUnavailable" };

    return this._rollAndSendToChat(cprRoll, this, weapon, eventContext.event);
  }

  _getVehicleWeaponAmmoLabel(weapon) {
    if (!weapon.system?.isRanged) {
      return game.i18n.localize("CPR.global.itemType.skill.meleeWeapon");
    }

    if (!weapon.system?.hasAmmoLoaded) {
      return game.i18n.localize("CPR.mookSheet.items.unloaded");
    }

    const ammoType = weapon.system?.loadedAmmo?.system?.type;
    const ammoLabel = ammoType
      ? game.i18n.localize(`CPR.global.ammo.type.${ammoType}`)
      : game.i18n.localize("CPRVEHICLES.Fields.Ammo");
    return `${ammoLabel}: ${weapon.system.magazine.value}/${weapon.system.magazine.max}`;
  }

  _toVehicleWeaponSheetData(weapon) {
    const fireMode = this._getWeaponFireMode(weapon.id);
    return {
      id: weapon.id,
      img: weapon.img,
      name: weapon.name,
      ammoLabel: this._getVehicleWeaponAmmoLabel(weapon),
      isRanged: weapon.system?.isRanged === true,
      rof: weapon.system?.rof ?? 1,
      damage: weapon.getWeaponDamage?.() ?? weapon.system?.damage ?? "-",
      supportsAutofire: Number(weapon.system?.fireModes?.autoFire ?? 0) > 0,
      autofireMax: Number(weapon.system?.fireModes?.autoFire ?? 0),
      supportsSuppressive: weapon.system?.fireModes?.suppressiveFire === true,
      fireModeAimed: fireMode === "aimed",
      fireModeAutofire: fireMode === "autofire",
      fireModeSuppressive: fireMode === "suppressive",
      canRollDamage: fireMode !== "suppressive",
    };
  }

  getVehicleWeaponsForSheet() {
    const buckets = partitionVehicleWeapons(this, MODULE_ID);
    return {
      mounted: buckets.mounted.map((weapon) => this._toVehicleWeaponSheetData(weapon)),
      cargo: buckets.cargo.map((weapon) => this._toVehicleWeaponSheetData(weapon)),
    };
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
