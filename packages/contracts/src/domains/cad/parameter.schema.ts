import * as z from "zod/v4";

const scalar = z.union([z.string().max(1024), z.number().finite()]);
const common = {
  id: z.string().regex(/^[A-Za-z0-9_-]{1,100}$/),
  binding: z.string().regex(/^[A-Za-z_][A-Za-z0-9_]{0,99}$/),
  label: z.string().trim().min(1).max(200),
  description: z.string().max(2000).optional(),
};
const numeric = {
  ...common,
  defaultValue: z.number().finite(),
  value: z.number().finite(),
  min: z.number().finite().optional(),
  max: z.number().finite().optional(),
  step: z.number().finite().positive().optional(),
  unit: z.string().max(40).optional(),
  control: z.enum(["input", "slider"]).optional(),
};

export const projectParameterSchema = z
  .discriminatedUnion("type", [
    z.object({ ...numeric, type: z.literal("number") }).strict(),
    z.object({ ...numeric, type: z.literal("integer") }).strict(),
    z
      .object({
        ...common,
        type: z.literal("boolean"),
        defaultValue: z.boolean(),
        value: z.boolean(),
        control: z.literal("checkbox").optional(),
      })
      .strict(),
    z
      .object({
        ...common,
        type: z.literal("string"),
        defaultValue: z.string().max(1024),
        value: z.string().max(1024),
        maxLength: z.number().int().min(0).max(1024).optional(),
        control: z.literal("input").optional(),
      })
      .strict(),
    z
      .object({
        ...common,
        type: z.literal("enum"),
        defaultValue: scalar,
        value: scalar,
        options: z
          .array(
            z
              .object({ label: z.string().min(1).max(200), value: scalar })
              .strict(),
          )
          .min(1)
          .max(100),
        control: z.literal("select").optional(),
      })
      .strict(),
  ])
  .superRefine((parameter, context) => {
    const error = (message: string, path: string): void =>
      context.addIssue({ code: "custom", message, path: [path] });
    if (parameter.type === "number" || parameter.type === "integer") {
      if (
        parameter.min !== undefined &&
        parameter.max !== undefined &&
        parameter.min > parameter.max
      )
        error("Minimum must not exceed maximum.", "min");
      for (const key of ["value", "defaultValue"] as const) {
        const value = parameter[key];
        if (parameter.min !== undefined && value < parameter.min)
          error("Value is below minimum.", key);
        if (parameter.max !== undefined && value > parameter.max)
          error("Value exceeds maximum.", key);
        if (parameter.type === "integer" && !Number.isSafeInteger(value))
          error("Expected a safe integer.", key);
        if (parameter.step !== undefined) {
          const steps = (value - (parameter.min ?? 0)) / parameter.step;
          if (
            !Number.isFinite(steps) ||
            Math.abs(steps - Math.round(steps)) > 1e-8
          )
            error("Value must align with step from minimum (or zero).", key);
        }
      }
      if (parameter.type === "integer")
        for (const key of ["min", "max", "step"] as const)
          if (
            parameter[key] !== undefined &&
            !Number.isSafeInteger(parameter[key])
          )
            error("Expected a safe integer.", key);
      if (
        parameter.control === "slider" &&
        (parameter.min === undefined ||
          parameter.max === undefined ||
          parameter.step === undefined ||
          parameter.min >= parameter.max)
      )
        error(
          "Sliders require increasing finite bounds and an explicit step.",
          "control",
        );
    } else if (parameter.type === "string") {
      for (const key of ["value", "defaultValue"] as const)
        if (parameter[key].length > (parameter.maxLength ?? 1024))
          error("String exceeds maximum length.", key);
    } else if (parameter.type === "enum") {
      const values = parameter.options.map((option) => option.value);
      if (new Set(values).size !== values.length)
        error("Enum option values must be unique.", "options");
      if (values.some((value) => typeof value !== typeof values[0]))
        error("Enum options must share one scalar type.", "options");
      for (const key of ["value", "defaultValue"] as const)
        if (!values.includes(parameter[key]))
          error("Value is not an enum option.", key);
    }
  });

export const parameterSnapshotSchema = z
  .array(projectParameterSchema)
  .max(100)
  .superRefine((parameters, context) => {
    if (
      new TextEncoder().encode(JSON.stringify(parameters)).byteLength >
      128 * 1024
    )
      context.addIssue({
        code: "custom",
        message: "Parameter snapshot exceeds 128 KiB.",
      });
    for (const key of ["id", "binding"] as const) {
      const seen = new Set<string>();
      parameters.forEach((parameter, index) => {
        if (seen.has(parameter[key]))
          context.addIssue({
            code: "custom",
            message: `Duplicate parameter ${key}.`,
            path: [index, key],
          });
        seen.add(parameter[key]);
      });
    }
  });

export type ProjectParameter = z.infer<typeof projectParameterSchema>;
