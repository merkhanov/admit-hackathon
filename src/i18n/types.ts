export type Vars = Record<string, string | number>;

/** A translated text: a template with {name} placeholders, or a function for grammar a template can't do. */
export type Entry = string | ((vars: Vars) => string);
