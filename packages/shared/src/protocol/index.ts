/**
 * The bxvtt protocol: every HTTP request and response under `/api`, and every WebSocket message on `/ws`, as
 * zod schemas with inferred TypeScript types. The server validates every request body and client message with
 * these schemas. bxapi models inside responses, such as the player view, are typed with the generated bxapi
 * types and pass through unchanged.
 */
export * from './adventures';
export * from './annotations';
export * from './battle';
export * from './characters';
export * from './common';
export * from './feed';
export * from './game';
export * from './health';
export * from './notes';
export * from './problems';
export * from './rejoin';
export * from './rules';
export * from './saves';
export * from './tables';
export * from './users';
export * from './ws';
