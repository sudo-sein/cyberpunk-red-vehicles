import VehicleDataModel from "./vehicle-datamodel.js";
import CPRVehicleActor from "./vehicle-actor.js";
import CPRVehicleSheet from "./vehicle-sheet.js";

const MODULE_ID = "cyberpunk-red-vehicles";
const VEHICLE_TYPE = `${MODULE_ID}.vehicle`;

Hooks.once("init", () => {
  console.log(`${MODULE_ID} | Initializing CPR Vehicles module`);

  Handlebars.registerHelper("eq", function (a, b) {
    return a === b;
  });

  CONFIG.Actor.dataModels[VEHICLE_TYPE] = VehicleDataModel;

  const SystemActorClass = CONFIG.Actor.documentClass;
  CONFIG.Actor.documentClass = new Proxy(SystemActorClass, {
    construct(target, args) {
      const [data] = args;
      if (data.type === VEHICLE_TYPE) {
        return new CPRVehicleActor(...args);
      }
      return Reflect.construct(target, args);
    },
    get(target, prop, receiver) {
      if (prop === "create") {
        return function (data, options) {
          if (data.type === VEHICLE_TYPE) {
            return CPRVehicleActor.create(data, options);
          }
          return target.create(data, options);
        };
      }
      if (prop === Symbol.hasInstance) {
        return function (instance) {
          if (instance?.type === VEHICLE_TYPE) {
            return instance instanceof CPRVehicleActor;
          }
          if (typeof target[Symbol.hasInstance] === "function") {
            return target[Symbol.hasInstance](instance);
          }
          return false;
        };
      }
      return Reflect.get(target, prop, receiver);
    },
  });

  Actors.registerSheet(MODULE_ID, CPRVehicleSheet, {
    types: [VEHICLE_TYPE],
    makeDefault: true,
    label: game.i18n.localize("CPRVEHICLES.SheetLabel"),
  });

  console.log(`${MODULE_ID} | Data model, actor proxy, and sheet registered`);
});

Hooks.once("ready", () => {
  console.log(`${MODULE_ID} | Module ready. Actor.TYPES:`, Actor.TYPES);
});
