/** Identificadores y valores serializables compartidos entre capas. */
export type EntityId = string;

/** Fecha en formato ISO 8601 para que los contratos sean transportables. */
export type Timestamp = string;

/** Metadatos libres que acompañan comandos y eventos sin acoplar el dominio a la infraestructura. */
export type Metadata = Readonly<Record<string, unknown>>;
