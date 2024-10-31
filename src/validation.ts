import { z } from 'zod';

export type Literal = string | number | boolean | null;
export type Json = Literal | { [key: string]: Json } | Json[];

export const LiteralSchema = z.union([
  z.string(),
  z.number(),
  z.boolean(),
  z.null(),
]);

export const JsonSchema: z.ZodType<Json> = z.lazy(() =>
  z.union([LiteralSchema, z.array(JsonSchema), z.record(JsonSchema)])
);

export const SerializedValueSchema = z
  .object({
    _type: z.string(),
    value: z.union([z.string(), z.record(z.any())]),
  })
  .strict();

export const SerializedFieldSchema = z
  .object({
    _type: z.literal('Field'),
    value: z.string(),
  })
  .strict();

export const SerializedPublicKeySchema = z
  .object({
    _type: z.literal('PublicKey'),
    value: z.string(),
  })
  .strict();

export const SerializedSignatureSchema = z
  .object({
    _type: z.literal('Signature'),
    value: z.object({
      r: z.string(),
      s: z.string(),
    }),
  })
  .strict();

export const SimpleWitnessSchema = z
  .object({
    type: z.literal('simple'),
    issuer: SerializedPublicKeySchema,
    issuerSignature: SerializedSignatureSchema,
  })
  .strict();

export const RecursiveWitnessSchema = z
  .object({
    type: z.literal('recursive'),
    vk: z
      .object({
        data: z.string(),
        hash: SerializedFieldSchema,
      })
      .strict(),
    proof: z
      .object({
        publicInput: JsonSchema,
        publicOutput: JsonSchema,
        maxProofsVerified: z.number().min(0).max(2),
        proof: z.string(),
      })
      .strict(),
  })
  .strict();

export const UnsignedWitnessSchema = z
  .object({
    type: z.literal('unsigned'),
  })
  .strict();

export const WitnessSchema = z.discriminatedUnion('type', [
  SimpleWitnessSchema,
  RecursiveWitnessSchema,
  UnsignedWitnessSchema,
]);

export const CredentialSchema = z
  .object({
    owner: SerializedPublicKeySchema,
    data: z.record(SerializedValueSchema),
  })
  .strict();

export const StoredCredentialSchema = z
  .object({
    version: z.literal('v0'),
    witness: WitnessSchema,
    metadata: JsonSchema.optional(),
    credential: CredentialSchema,
  })
  .strict();

// we could infer the type of StoredCredential from the validation
// export type StoredCredential = z.infer<typeof StoredCredentialSchema>;
