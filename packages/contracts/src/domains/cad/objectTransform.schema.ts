import * as z from "zod/v4";

export const OBJECT_TRANSFORM_LIMITS = Object.freeze({
  position: 1_000_000,
  rotation: 360_000,
  minimumScale: 0.000_001,
  maximumScale: 1_000_000,
});
const position = z
  .number()
  .finite()
  .min(-OBJECT_TRANSFORM_LIMITS.position)
  .max(OBJECT_TRANSFORM_LIMITS.position);
const rotation = z
  .number()
  .finite()
  .min(-OBJECT_TRANSFORM_LIMITS.rotation)
  .max(OBJECT_TRANSFORM_LIMITS.rotation);
const scale = z
  .number()
  .finite()
  .min(OBJECT_TRANSFORM_LIMITS.minimumScale)
  .max(OBJECT_TRANSFORM_LIMITS.maximumScale);

/** Local-origin scale, then X/Y/Z rotations in degrees, then world translation in mm. */
export const objectTransformSchema = z
  .object({
    position: z.tuple([position, position, position]),
    rotation: z.tuple([rotation, rotation, rotation]),
    scale: z.tuple([scale, scale, scale]),
  })
  .strict();
export type ObjectTransform = z.infer<typeof objectTransformSchema>;

export function defaultObjectTransform(): ObjectTransform {
  return { position: [0, 0, 0], rotation: [0, 0, 0], scale: [1, 1, 1] };
}
export function objectTransform(object: {
  transform?: ObjectTransform | undefined;
}): ObjectTransform {
  return structuredClone(object.transform ?? defaultObjectTransform());
}
export function objectTransformIsIdentity(transform: ObjectTransform): boolean {
  return (
    transform.position.every((value) => value === 0) &&
    transform.rotation.every((value) => value === 0) &&
    transform.scale.every((value) => value === 1)
  );
}
