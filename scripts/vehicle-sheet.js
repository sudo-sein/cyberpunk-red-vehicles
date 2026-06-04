import { hasVehicleBaseStatField } from "./vehicle-upgrade-stats.mjs";

export default class CPRVehicleSheet extends ActorSheet {
  static MODULE_ID = "cyberpunk-red-vehicles";

  static get defaultOptions() {
    return foundry.utils.mergeObject(super.defaultOptions, {
      classes: ["cyberpunk-red-vehicles", "vehicle-sheet"],
      template: "modules/cyberpunk-red-vehicles/templates/vehicle-sheet.hbs",
      width: 560,
      height: 500,
      resizable: true,
    });
  }

  async getData() {
    const context = await super.getData();
    const system = this.actor.system;
    context.system = system;
    context.sdpPercent = system.sdp.max > 0
      ? Math.round((system.sdp.value / system.sdp.max) * 100)
      : 0;
    context.vehicleTypeChoices = {
      land: game.i18n.localize("CPRVEHICLES.VehicleType.Land"),
      air: game.i18n.localize("CPRVEHICLES.VehicleType.Air"),
      sea: game.i18n.localize("CPRVEHICLES.VehicleType.Sea"),
    };
    context.installedVehicleUpgrades = [];
    context.storedItemsByType = {};
    context.mountedWeapons = [];

    const weaponBuckets = this.actor.getVehicleWeaponsForSheet();
    context.mountedWeapons = weaponBuckets.mounted;
    const mountedWeaponIds = new Set(context.mountedWeapons.map((weapon) => weapon.id));

    for (const item of this.actor.items) {
      if (item.type === "weapon" && mountedWeaponIds.has(item.id)) continue;

      const isVehicleUpgrade =
        item.type === "itemUpgrade" && item.system?.type === "vehicle";
      const isInstalled = isVehicleUpgrade && this.actor.isVehicleUpgradeInstalled(item);
      const enrichedItem = {
        id: item.id,
        img: item.img,
        name: item.name,
        type: item.type,
        amount: Number.isFinite(Number(item.system?.amount))
          ? Math.max(0, Number(item.system.amount))
          : 1,
        canEditAmount: item.type === "ammo",
        canToggleInstall: isVehicleUpgrade,
        isInstalled,
      };

      if (isInstalled) {
        context.installedVehicleUpgrades.push(enrichedItem);
        continue;
      }

      if (!context.storedItemsByType[item.type]) {
        context.storedItemsByType[item.type] = [];
      }
      context.storedItemsByType[item.type].push(enrichedItem);
    }

    context.typeLabels = {};
    for (const type of Object.keys(context.storedItemsByType)) {
      context.typeLabels[type] = game.i18n.localize(`TYPES.Item.${type}`);
    }

    context.hasItems = this.actor.items.size > 0;
    context.hasInstalledVehicleUpgrades = context.installedVehicleUpgrades.length > 0;
    context.hasStoredItems = Object.keys(context.storedItemsByType).length > 0;
    context.hasMountedWeapons = context.mountedWeapons.length > 0;
    context.editable = this.isEditable;
    context.sourceItemUuid = this.actor.getFlag("cyberpunk-red-vehicles", "sourceItemUuid") || null;
    context.enrichedNotes = await TextEditor.enrichHTML(system.notes, { async: true });
    return context;
  }

  async _updateObject(event, formData) {
    await super._updateObject(event, formData);
    if (!hasVehicleBaseStatField(formData)) return;

    await this.actor.updateVehicleBaseStatsFromCurrent();
    await this.actor.recalculateVehicleUpgrades();
  }

  activateListeners(html) {
    super.activateListeners(html);
    if (!this.isEditable) return;

    html.find(".item-edit").click((ev) => {
      const itemId = ev.currentTarget.closest("[data-item-id]").dataset.itemId;
      const item = this.actor.items.get(itemId);
      if (item) item.sheet.render(true);
    });

    html.find(".item-delete").click(async (ev) => {
      const itemId = ev.currentTarget.closest("[data-item-id]").dataset.itemId;
      const item = this.actor.items.get(itemId);
      if (!item) return;
      const confirm = await Dialog.confirm({
        title: game.i18n.localize("CPRVEHICLES.Dialog.DeleteItem.Title"),
        content: `<p>${game.i18n.format("CPRVEHICLES.Dialog.DeleteItem.Content", { name: item.name })}</p>`,
      });
      if (confirm) await item.delete();
    });

    html.find(".vehicle-image").click(() => {
      const fp = new FilePicker({
        type: "image",
        current: this.actor.img,
        callback: (path) => this.actor.update({ img: path }),
      });
      fp.browse();
    });

    html.find(".vehicle-image").contextmenu((ev) => {
      ev.preventDefault();
      new ImagePopout(this.actor.img, { title: this.actor.name }).render(true);
    });

    html.find(".configure-from-item").click(() => this._configureFromItem());

    html.find(".item-toggle-install").click(async (ev) => {
      const row = ev.currentTarget.closest("[data-item-id]");
      if (!row?.dataset.itemId) return;
      const targetState = ev.currentTarget.dataset.install === "true";
      await this.actor.setVehicleUpgradeInstalled(row.dataset.itemId, targetState);
    });

    html.find(".vehicle-weapon-install").click(async (ev) => {
      const itemId = ev.currentTarget.closest("[data-item-id]")?.dataset.itemId;
      if (!itemId) return;
      const result = await this.actor.installVehicleWeapon(itemId);
      this._notifyVehicleWeaponResult(result);
    });

    html.find(".vehicle-weapon-uninstall").click(async (ev) => {
      const itemId = ev.currentTarget.closest("[data-item-id]")?.dataset.itemId;
      if (!itemId) return;
      const result = await this.actor.uninstallVehicleWeapon(itemId);
      this._notifyVehicleWeaponResult(result);
    });

    html.find(".vehicle-weapon-action").click(async (ev) => {
      const itemId = ev.currentTarget.closest("[data-item-id]")?.dataset.itemId;
      const actionType = ev.currentTarget.dataset.actionType;
      if (!itemId || !actionType) return;
      const result = await this.actor.applyVehicleWeaponAction(itemId, actionType);
      this._notifyVehicleWeaponResult(result);
    });

    html.find(".vehicle-weapon-fire").click(async (ev) => {
      const itemId = ev.currentTarget.closest("[data-item-id]")?.dataset.itemId;
      const fireMode = ev.currentTarget.dataset.fireMode;
      if (!itemId || !fireMode) return;
      const result = await this.actor.toggleVehicleWeaponFireMode(itemId, fireMode);
      this._notifyVehicleWeaponResult(result);
    });

    html.find(".vehicle-weapon-roll").click(async (ev) => {
      const itemId = ev.currentTarget.closest("[data-item-id]")?.dataset.itemId;
      const rollType = ev.currentTarget.dataset.rollType;
      if (!itemId || !rollType) return;

      const result = rollType === "attack"
        ? await this.actor.rollVehicleWeaponAttack(itemId, { event: ev })
        : await this.actor.rollVehicleWeaponDamage(itemId, { event: ev });

      this._notifyVehicleWeaponResult(result);
    });

    html.find(".trunk-item-amount").change(async (ev) => {
      const input = ev.currentTarget;
      const itemId = input.closest("[data-item-id]")?.dataset.itemId;
      if (!itemId) return;

      const item = this.actor.items.get(itemId);
      if (!item || item.type !== "ammo") {
        input.value = Number.isFinite(Number(item?.system?.amount))
          ? Number(item.system.amount)
          : 1;
        return;
      }

      const parsed = Number.parseInt(input.value, 10);
      const amount = Number.isFinite(parsed) ? Math.max(0, parsed) : 0;
      await item.update({ "system.amount": amount });
      input.value = amount;
    });
  }

  _notifyVehicleWeaponResult(result) {
    if (!result || result.ok !== false) return;

    const keyMap = {
      weaponNotSupported: "CPRVEHICLES.Notifications.WeaponNotSupported",
      alreadyInstalled: "CPRVEHICLES.Notifications.WeaponAlreadyInstalled",
      notInstalled: "CPRVEHICLES.Notifications.WeaponNotInstalled",
      actionNotSupported: "CPRVEHICLES.Notifications.WeaponActionNotSupported",
      actorSelectionCancelled: "CPRVEHICLES.Notifications.ActorSelectionCancelled",
      rollUnavailable: "CPRVEHICLES.Notifications.RollUnavailable",
      damageNotAvailableForSuppressive: "CPRVEHICLES.Notifications.DamageUnavailableSuppressive",
      rollCancelled: "CPRVEHICLES.Notifications.RollCancelled",
    };

    const key = keyMap[result.reason];
    if (!key) return;
    ui.notifications.warn(game.i18n.localize(key));
  }

  async _onDropItem(event, data) {
    const item = await Item.implementation.fromDropData(data);
    if (item.type === "itemUpgrade" && item.system.type !== "vehicle") {
      ui.notifications.warn(game.i18n.localize("CPRVEHICLES.Notifications.OnlyVehicleUpgrades"));
      return false;
    }
    return super._onDropItem(event, data);
  }

  async _configureFromItem() {
    const vehicleItems = game.items.filter((i) => i.type === "vehicle");
    if (vehicleItems.length === 0) {
      ui.notifications.warn(game.i18n.localize("CPRVEHICLES.Notifications.NoVehicleItems"));
      return;
    }

    const templatePath = "modules/cyberpunk-red-vehicles/templates/configure-from-item.hbs";
    const html = await renderTemplate(templatePath, {
      vehicles: vehicleItems.map((v) => ({ uuid: v.uuid, name: v.name })),
      currentUuid: this.actor.getFlag("cyberpunk-red-vehicles", "sourceItemUuid") || "",
    });

    const dialog = new Dialog({
      title: game.i18n.localize("CPRVEHICLES.Dialog.ConfigureFromItem.Title"),
      content: html,
      buttons: {
        apply: {
          icon: '<i class="fas fa-check"></i>',
          label: game.i18n.localize("CPRVEHICLES.Dialog.ConfigureFromItem.Apply"),
          callback: async (dialogHtml) => {
            const uuid = dialogHtml.find("select[name='vehicleItemUuid']").val();
            if (!uuid) return;
            const item = await fromUuid(uuid);
            if (!item) return;

            await this.actor.update({
              name: item.name,
              img: item.img,
              "prototypeToken.texture.src": item.img,
              "system.sdp.value": item.system.sdp,
              "system.sdp.max": item.system.sdp,
              "system.sp.value": 0,
              "system.sp.max": 0,
              "system.seats": item.system.seats,
              "system.speedCombat": item.system.speedCombat,
              "system.speedNarrative": item.system.speedNarrative,
              "system.notes": item.system.description?.value ?? "",
            });
            await this.actor.setVehicleBaseStats({
              sdpMax: item.system.sdp,
              spMax: 0,
              seats: item.system.seats,
              speedCombat: item.system.speedCombat,
            });
            await this.actor.setFlag("cyberpunk-red-vehicles", "sourceItemUuid", uuid);
            await this.actor.recalculateVehicleUpgrades();
            ui.notifications.info(
              game.i18n.format("CPRVEHICLES.Notifications.ConfiguredFromItem", { name: item.name })
            );
          },
        },
        unlink: {
          icon: '<i class="fas fa-unlink"></i>',
          label: game.i18n.localize("CPRVEHICLES.Dialog.ConfigureFromItem.Unlink"),
          callback: async () => {
            await this.actor.unsetFlag("cyberpunk-red-vehicles", "sourceItemUuid");
            ui.notifications.info(game.i18n.localize("CPRVEHICLES.Notifications.Unlinked"));
          },
        },
        cancel: {
          icon: '<i class="fas fa-times"></i>',
          label: game.i18n.localize("CPRVEHICLES.Dialog.ConfigureFromItem.Cancel"),
        },
      },
      default: "apply",
    });
    dialog.render(true);
  }
}
