const { SchemaField, NumberField, StringField, HTMLField } = foundry.data.fields;

export default class VehicleDataModel extends foundry.abstract.TypeDataModel {
  static defineSchema() {
    return {
      sdp: new SchemaField({
        value: new NumberField({
          required: true,
          nullable: false,
          integer: true,
          initial: 50,
          min: 0,
        }),
        max: new NumberField({
          required: true,
          nullable: false,
          integer: true,
          initial: 50,
          min: 1,
        }),
      }),
      sp: new SchemaField({
        value: new NumberField({
          required: true,
          nullable: false,
          integer: true,
          initial: 0,
          min: 0,
        }),
        max: new NumberField({
          required: true,
          nullable: false,
          integer: true,
          initial: 0,
          min: 0,
        }),
      }),
      seats: new NumberField({
        required: true,
        nullable: false,
        integer: true,
        initial: 2,
        min: 0,
      }),
      speedCombat: new NumberField({
        required: true,
        nullable: false,
        integer: true,
        initial: 20,
        min: 0,
      }),
      speedNarrative: new StringField({
        required: true,
        blank: true,
        initial: "",
      }),
      vehicleType: new StringField({
        required: true,
        initial: "land",
        choices: ["land", "air", "sea"],
      }),
      notes: new HTMLField({
        required: true,
        blank: true,
        initial: "",
      }),
    };
  }
}
