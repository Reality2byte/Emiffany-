import * as JsonPointer from "@hyperjump/json-pointer";

/**
 * @import {
 *   Json,
 *   JsonArray,
 *   JsonArrayNode,
 *   JsonBooleanNode,
 *   JsonNode,
 *   JsonNullNode,
 *   JsonNumberNode,
 *   JsonObject,
 *   JsonObjectNode,
 *   JsonPropertyNode,
 *   JsonStringNode
 * } from "./jsonast.d.ts"
 */


/** @type (json: Json, uri?: string, pointer?: string) => JsonNode */
export const toJsonNode = (json, uri = "", pointer = "") => {
  const location = `${uri}#${encodeURI(pointer)}`;

  switch (typeof json) {
    case "boolean":
      return { type: "json", jsonType: "boolean", value: json, location: location };
    case "number":
      return { type: "json", jsonType: "number", value: json, location: location };
    case "string":
      return { type: "json", jsonType: "string", value: json, location: location };
    case "object":
      if (json === null) {
        return { type: "json", jsonType: "null", value: json, location: location };
      } else if (Array.isArray(json)) {
        return {
          type: "json",
          jsonType: "array",
          children: json.map((item, index) => {
            return toJsonNode(item, uri, JsonPointer.append(`${index}`, pointer));
          }),
          location: `${uri}#${pointer}`
        };
      } else {
        /** @type JsonObjectNode */
        const objectNode = { type: "json", jsonType: "object", children: [], location: location };

        for (const property in json) {
          /** @type JsonPropertyNode */
          const propertyNode = {
            type: "json-property",
            children: [
              { type: "json-property-name", value: property },
              toJsonNode(json[property], uri, JsonPointer.append(property, pointer))
            ]
          };
          objectNode.children.push(propertyNode);
        }

        return objectNode;
      }
  }
};

/** @type (segment: string, node: JsonNode, uri?: string) => JsonNode */
export const jsonPointerStep = (segment, node, uri = "#") => {
  switch (node.jsonType) {
    case "object": {
      for (const propertyNode of node.children) {
        if (propertyNode.children[0].value === segment) {
          return propertyNode.children[1];
        }
      }
      const uriMessage = uri ? ` at ${uri}` : "";
      throw new Error(`Property '${segment}' doesn't exist${uriMessage}`);
    }
    case "array": {
      const index = segment === "-" ? node.children.length : parseInt(segment);
      if (!node.children[index]) {
        const uriMessage = uri ? ` at ${uri}` : "";
        throw new Error(`Index '${index}' doesn't exist${uriMessage}`);
      }
      return node.children[index];
    }
    default: {
      const uriMessage = uri ? ` at ${uri}` : "";
      throw new Error(`Can't index into scalar value${uriMessage}`);
    }
  }
};

/** @type (pointer: string, tree: JsonNode, uri?: string) => JsonNode */
export const jsonPointerGet = (pointer, tree, uri = "") => {
  let currentPointer = "";
  let node = tree;
  for (const segment of pointerSegments(pointer)) {
    currentPointer += "/" + escapePointerSegment(segment);
    node = jsonPointerStep(segment, node, `${uri}#${currentPointer}`);
  }

  return node;
};

/** @type (pointer: string) => Generator<string> */
const pointerSegments = function* (pointer) {
  if (pointer.length > 0 && !pointer.startsWith("/")) {
    throw Error("Invalid JSON Pointer");
  }

  let segmentStart = 1;
  let segmentEnd = 0;

  while (segmentEnd < pointer.length) {
    const position = pointer.indexOf("/", segmentStart);
    segmentEnd = position === -1 ? pointer.length : position;
    const segment = pointer.slice(segmentStart, segmentEnd);
    segmentStart = segmentEnd + 1;

    yield unescapePointerSegment(segment);
  }
};

/** @type (segment: string) => string */
const unescapePointerSegment = (segment) => segment.toString().replace(/~1/g, "/").replace(/~0/g, "~");

/** @type (segment: string) => string */
const escapePointerSegment = (segment) => segment.toString().replace(/~/g, "~0").replace(/\//g, "~1");

/** @type (key: string, node: JsonObjectNode) => boolean */
export const jsonObjectHas = (key, node) => {
  for (const property of node.children) {
    if (property.children[0].value === key) {
      return true;
    }
  }

  return false;
};

/** @type (node: JsonObjectNode) => string[] */
export const jsonObjectKeys = (node) => {
  return node.children.map((propertyNode) => propertyNode.children[0].value);
};

/**
 * @overload
 * @param {JsonObjectNode} node
 * @returns {JsonObject}
 *
 * @overload
 * @param {JsonArrayNode} node
 * @returns {JsonArray}
 *
 * @overload
 * @param {JsonStringNode} node
 * @returns {string}
 *
 * @overload
 * @param {JsonNumberNode} node
 * @returns {number}
 *
 * @overload
 * @param {JsonBooleanNode} node
 * @returns {boolean}
 *
 * @overload
 * @param {JsonNullNode} node
 * @returns {null}
 *
 * @overload
 * @param {JsonNode} node
 * @returns {Json}
 *
 * @param {JsonNode} node
 * @returns {Json}
 */
export const jsonValue = (node) => {
  switch (node.jsonType) {
    case "object":
      /** @type JsonObject */
      const object = {};
      for (const propertyNode of node.children) {
        const [keyNode, valueNode] = propertyNode.children;
        object[keyNode.value] = jsonValue(valueNode);
      }
      return object;
    case "array":
      return node.children.map(jsonValue);
    case "string":
    case "number":
    case "boolean":
    case "null":
      return node.value;
  }
};

/**
 * @overload
 * @param {JsonNode} node
 * @param {"object"} type
 * @returns {asserts node is JsonObjectNode}
 *
 * @overload
 * @param {JsonNode} node
 * @param {"array"} type
 * @returns {asserts node is JsonArrayNode}
 *
 * @overload
 * @param {JsonNode} node
 * @param {"string"} type
 * @returns {asserts node is JsonStringNode}
 *
 * @overload
 * @param {JsonNode} node
 * @param {"number"} type
 * @returns {asserts node is JsonNumberNode}
 *
 * @overload
 * @param {JsonNode} node
 * @param {"boolean"} type
 * @returns {asserts node is JsonBooleanNode}
 *
 * @overload
 * @param {JsonNode} node
 * @param {"null"} type
 * @returns {asserts node is JsonNullNode}
 *
 * @overload
 * @param {JsonNode} node
 * @param {string} type
 * @returns {node is SchemaNode}
 *
 * @param {JsonNode} node
 * @param {string} type
 * @returns {void}
 */
export const assertNodeType = (node, type) => {
  if (node.jsonType !== type) {
    throw Error("Invalid Schema");
  }
};
