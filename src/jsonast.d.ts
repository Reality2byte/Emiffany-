export type Json = null | boolean | number | string | JsonArray | JsonObject;
export type JsonArray = Json[];
export type JsonObject = { [property: string]: Json };

export type JsonNullNode = {
  type: "json";
  jsonType: "null";
  value: null;
  location: string;
};

export type JsonBooleanNode = {
  type: "json";
  jsonType: "boolean";
  value: boolean;
  location: string;
};

export type JsonNumberNode = {
  type: "json";
  jsonType: "number";
  value: number;
  location: string;
};

export type JsonStringNode = {
  type: "json";
  jsonType: "string";
  value: string;
  location: string;
};

export type JsonArrayNode = {
  type: "json";
  jsonType: "array";
  children: JsonNode[];
  location: string;
};

export type JsonPropertyNameNode = {
  type: "json-property-name";
  value: string;
};

export type JsonPropertyNode = {
  type: "json-property";
  children: [JsonPropertyNameNode, JsonNode];
};

export type JsonObjectNode = {
  type: "json";
  jsonType: "object";
  children: JsonPropertyNode[];
  location: string;
};

export type JsonNode = JsonObjectNode
  | JsonArrayNode
  | JsonStringNode
  | JsonNumberNode
  | JsonBooleanNode
  | JsonNullNode;
