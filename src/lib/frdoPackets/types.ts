import type { z } from 'zod';
import type * as c from './contract';
export type PacketRef = z.infer<typeof c.packetRefSchema>;
export type ArtifactRef = z.infer<typeof c.artifactRefSchema>;
export type AuthorityRef = z.infer<typeof c.authorityRefSchema>;
export type Authority = z.infer<typeof c.authoritySchema>;
export type SourceCas = z.infer<typeof c.sourceCasSchema>;
export type FrozenCapture = z.infer<typeof c.frozenCaptureSchema>;
export type ManifestSubject = z.infer<typeof c.manifestSubjectSchema>;
export type Action = z.infer<typeof c.actionSchema>;
export type MutationRequest = z.infer<typeof c.mutationRequestSchema>;
export type ReadResult = z.infer<typeof c.readResultSchema>;
export type PacketProjection = z.infer<typeof c.packetProjectionSchema>;
export type PacketEvent = z.infer<typeof c.packetEventSchema>;
export type ArtifactBuild = z.infer<typeof c.artifactBuildSchema>;
export interface PacketContext { organization_id: string; actor_id: string; scope: z.infer<typeof c.scopeSchema> }
