export type Schema =
  | StringSchema
  | NumberSchema
  | BooleanSchema
  | NullSchema
  | IntegerSchema
  | ArraySchema
  | ObjectSchema;

export type StringFormat = 'email' | 'uri' | 'date-time';

export type StringSchema = {
  type: 'string';
  minLength?: number;
  maxLength?: number;
  format?: StringFormat;
  enum?: readonly string[];
}

export type NumberSchema = {
  type: 'number';
  minimum?: number;
  maximum?: number;
  enum?: readonly number[];
}

export type IntegerSchema = {
  type: 'integer';
  minimum?: number;
  maximum?: number;
  enum?: readonly number[];
}

export type BooleanSchema = {
  type: 'boolean';
}

export type NullSchema = {
  type: 'null';
}

export type ArraySchema = {
  type: 'array';
  items: Schema;
  minItems?: number;
  maxItems?: number;
}

export type PropertySchema = Schema & {
  description?: string;
  default?: ValueOf<Schema>;
}

export type ObjectSchema = {
  type: 'object';
  properties: Record<string, PropertySchema>;
  required?: readonly string[]
}

type ElementOf<T extends readonly unknown[]> = T[number];

type PropertyValueOf<T extends ObjectSchema, K extends keyof T["properties"]> = ValueOf<T["properties"][K]>;

type PropertyOf<T extends ObjectSchema, K extends keyof T["properties"]> =
  T["required"] extends readonly unknown[]
    ? K extends ElementOf<T["required"]>
      ? PropertyValueOf<T, K>
      : PropertyValueOf<T, K> | undefined
    : PropertyValueOf<T, K> | undefined;

type StringValueOf<T extends StringSchema> =
  T["enum"] extends readonly string[]
  ? ElementOf<T["enum"]>
  : string;

type NumberValueOf<T extends NumberSchema | IntegerSchema> =
  T["enum"] extends readonly number[]
  ? ElementOf<T["enum"]>
  : number;

export type ValueOf<T extends Schema> = T extends StringSchema
  ? StringValueOf<T>
  : T extends NumberSchema
  ? NumberValueOf<T>
  : T extends IntegerSchema
  ? NumberValueOf<T>
  : T extends BooleanSchema
  ? boolean
  : T extends NullSchema
  ? null
  : T extends ArraySchema
  ? ValueOf<T["items"]>[]
  : T extends ObjectSchema
  ? { [K in keyof T["properties"]]: PropertyOf<T, K> }
  : never;

export function schema<T extends Schema>(schema: T): T {
  return schema;
}

export function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

export function isValidUri(uri: string): boolean {
  try {
    new URL(uri);
    return true;
  } catch (e) {
    return false;
  }
}

export function isValidDateTime(dateTime: string): boolean {
  return !isNaN(new Date(dateTime).getTime());
}

class ParseError extends Error {
  constructor(message: string, public path: string, public input: unknown) {
    super(message);
  }
}

export function parseString<T extends StringSchema>(schema: T, path: string, input: unknown): ValueOf<T> {
  if (typeof input !== 'string') {
    throw new ParseError(`input is not a string: ${input}`, path, input);
  }
  if (schema.maxLength && input.length > schema.maxLength) {
    throw new ParseError(`string is too long: ${input.length} > ${schema.maxLength}`, path, input);
  }
  if (schema.minLength && input.length < schema.minLength) {
    throw new ParseError(`string is too short: ${input.length} < ${schema.minLength}`, path, input);
  }
  if (schema.enum && !schema.enum.includes(input)) {
    throw new ParseError(`string is not in enum ${JSON.stringify(schema.enum)}: ${input}`, path, input);
  }
  if (schema.format === 'email' && !isValidEmail(input)) {
    throw new ParseError(`string is not a valid email: ${input}`, path, input);
  }
  if (schema.format === 'uri' && !isValidUri(input)) {
    throw new ParseError(`string is not a valid uri: ${input}`, path, input);
  }
  if (schema.format === 'date-time' && !isValidDateTime(input)) {
    throw new ParseError(`string is not a valid date-time: ${input}`, path, input);
  }
  return input as ValueOf<T>;
}

export function parseNumber<T extends NumberSchema>(schema: T, path: string, input: unknown): ValueOf<T> {
  if (typeof input !== 'number') {
    throw new ParseError(`input is not a number: ${input}`, path, input);
  }
  if (schema.enum && !schema.enum.includes(input)) {
    throw new ParseError(`number is not in enum ${JSON.stringify(schema.enum)}: ${input}`, path, input);
  }
  if (schema.minimum && input < schema.minimum) {
    throw new ParseError(`number is too small: ${input} < ${schema.minimum}`, path, input);
  }
  if (schema.maximum && input > schema.maximum) {
    throw new ParseError(`number is too large: ${input} > ${schema.maximum}`, path, input);
  }
  return input as ValueOf<T>;
}

export function parseInteger<T extends IntegerSchema>(schema: T, path: string, input: unknown): ValueOf<T> {
  if (typeof input !== 'number') {
    throw new ParseError(`input is not a number: ${input}`, path, input);
  }
  if (!Number.isInteger(input)) {
    throw new ParseError(`number is not an integer: ${input}`, path, input);
  }
  if (schema.enum && !schema.enum.includes(input)) {  
    throw new ParseError(`number is not in enum ${JSON.stringify(schema.enum)}: ${input}`, path, input);
  }
  if (schema.minimum && input < schema.minimum) {
    throw new ParseError(`number is too small: ${input} < ${schema.minimum}`, path, input);
  }
  if (schema.maximum && input > schema.maximum) {
    throw new ParseError(`number is too large: ${input} > ${schema.maximum}`, path, input);
  }
  return input as ValueOf<T>;
}

export function parseBoolean<T extends BooleanSchema>(schema: T, path: string, input: unknown): ValueOf<T> {
  if (typeof input !== 'boolean') {
    throw new ParseError(`input is not a boolean: ${input}`, path, input);
  }
  return input as ValueOf<T>;
}

export function parseNull<T extends NullSchema>(schema: T, path: string, input: unknown): ValueOf<T> {
  if (input !== null) {
    throw new ParseError(`input is not null: ${input}`, path, input);
  }
  return null as ValueOf<T>;
}

export function parseArray<T extends ArraySchema>(schema: T, path: string, input: unknown): ValueOf<T> {
  if (!Array.isArray(input)) {
    throw new ParseError(`input is not an array: ${input}`, path, input);
  }
  if (schema.minItems && input.length < schema.minItems) {
    throw new ParseError(`array is too short: ${input.length} < ${schema.minItems}`, path, input);
  }
  if (schema.maxItems && input.length > schema.maxItems) {
    throw new ParseError(`array is too long: ${input.length} > ${schema.maxItems}`, path, input);
  }
  return input.map((item, index) => parseAny(schema.items, `${path}[${index}]`, item)) as ValueOf<T>;
}

export function parseObject<T extends ObjectSchema>(schema: T, path: string, input: unknown): ValueOf<T> {
  if (typeof input !== 'object' || input === null) {
    throw new ParseError(`input is not an object: ${input}`, path, input);
  }
  return Object.entries(schema.properties).reduce((acc, [key, property]) => {
    const value = (input as Record<string, unknown>)[key];
    if (value === undefined) {
      if (schema.required && schema.required.includes(key)) {
        throw new ParseError(`required property "${key}" is missing`, path, input);
      }
      if (property.default !== undefined) {
        (acc as any)[key] = property.default;
      }
    } else {
      (acc as any)[key] = parseAny(property, `${path}.${key}`, value);
    }
    return acc;
  }, {} as Record<string, unknown>) as ValueOf<T>;
}

export function parseAny<T extends Schema>(schema: T, path: string, input: unknown): ValueOf<T> {
  if (schema.type === 'string') {
    return parseString(schema, path, input) as ValueOf<T>;
  }
  if (schema.type === 'number') {
    return parseNumber(schema, path, input) as ValueOf<T>;
  }
  if (schema.type === 'integer') {
    return parseInteger(schema, path, input) as ValueOf<T>;
  }
  if (schema.type === 'boolean') {
    return parseBoolean(schema, path, input) as ValueOf<T>;
  }
  if (schema.type === 'null') {
    return parseNull(schema, path, input) as ValueOf<T>;
  }
  if (schema.type === 'array') {
    return parseArray(schema, path, input) as ValueOf<T>;
  }
  if (schema.type === 'object') {
    return parseObject(schema, path, input) as ValueOf<T>;
  }
  throw new ParseError(`Invalid schema ${JSON.stringify(schema)}`, path, input);
}


export function parse<T extends Schema>(schema: T, input: unknown): ValueOf<T> {
  return parseAny(schema, "", input);
}

export type ParseResult<T extends Schema> = {
  success: true;
  value: ValueOf<T>;
} | {
  success: false;
  error: ParseError;
}

export function safeParse<T extends Schema>(schema: T, input: unknown): ParseResult<T> {
  try {
    return { success: true, value: parse(schema, input) };
  } catch (e) {
    return { success: false, error: e as ParseError };
  }
}
