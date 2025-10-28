// JSON data types for tree editing
export type JsonValue = string | number | boolean | null | JsonObject | JsonArray

export interface JsonObject {
  [key: string]: JsonValue
}

export interface JsonArray extends Array<JsonValue> {}

export type JsonType = 'string' | 'number' | 'boolean' | 'null' | 'object' | 'array'

export interface TreeNode {
  key: string
  value: JsonValue
  type: JsonType
  path: string[]
  children?: TreeNode[]
}

export interface PathValue {
  path: string[]
  value: JsonValue
  type: string
  parentType: 'object' | 'array'
}