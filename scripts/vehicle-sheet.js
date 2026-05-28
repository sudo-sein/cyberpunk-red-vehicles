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

    for (const item of this.actor.items) {
      const isVehicleUpgrade =
        item.type === "itemUpgrade" && item.system?.type === "vehicle";
      const isInstalled = isVehicleUpgrade && this.actor.isVehicleUpgradeInstalled(item);
      const enrichedItem = {
        id: item.id,
        img: item.img,
        name: item.name,
        type: item.type,
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
    context.editable = this.isEditable;
    context.sourceItemUuid = this.actor.getFlag("cyberpunk-red-vehicles", "sourceItemUuid") || null;
    context.enrichedNotes = await TextEditor.enrichHTML(system.notes, { async: true });
    return context;
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
