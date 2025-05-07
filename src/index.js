import jsonStringify from "json-stringify-deterministic";
import * as JsonPointer from "@hyperjump/json-pointer";
import { parseIriReference, resolveIri, toAbsoluteIri } from "@hyperjump/uri";
import {
  assertNodeType,
  toJsonNode,
  jsonObjectHas,
  jsonObjectKeys,
  jsonPointerGet,
  jsonPointerStep,
  jsonValue
} from "./jsonast-util.js";

/**
 * @import { Json, JsonNode, JsonObjectNode, JsonStringNode } from "./jsonast.d.ts"
 */


/**
 * @typedef {{
 *   instanceLocation: string;
 *   absoluteKeywordLocation: string;
 *   keywordLocation?: string;
 *   error?: string;
 * }} OutputUnit
 *
 * @typedef {{
 *   valid: true;
 * } | {
 *   valid: false;
 *   errors?: OutputUnit[];
 * }} Output
 */

/** @type (schema: Json, instance: Json) => Output */
export const validate = (schema, instance) => {
  // Determine schema identifier
  const uri = typeof schema === "object" && schema !== null && !Array.isArray(schema)
    && typeof schema.$id === "string" ? schema.$id : "";
  registerSchema(schema, uri);

  const schemaNode = /** @type NonNullable<JsonNode> */ (schemaRegistry.get(uri));

  // Verify the dialect is supported
  if (schemaNode.jsonType === "object" && jsonObjectHas("$schema", schemaNode)) {
    const $schema = jsonPointerStep("$schema", schemaNode);
    if ($schema.jsonType === "string" && $schema.value !== "https://json-schema.org/draft/2020-12/schema") {
      throw Error(`Dialect '${$schema.value}' is not supported. Use 2020-12.`);
    }
  }

  /** @type OutputUnit[] */
  const errors = [];
  const valid = validateSchema(schemaNode, toJsonNode(instance), errors);

  schemaRegistry.delete(uri);

  return valid ? { valid } : { valid, errors };
};

/** @type (schemaNode: JsonNode, instanceNode: JsonNode, errors: OutputUnit[]) => boolean */
const validateSchema = (schemaNode, instanceNode, errors) => {
  if (schemaNode.type === "json") {
    switch (schemaNode.jsonType) {
      case "boolean":
        if (!schemaNode.value) {
          errors.push({
            absoluteKeywordLocation: schemaNode.location,
            instanceLocation: instanceNode.location
          });
        }
        return schemaNode.value;

      case "object":
        let isValid = true;
        for (const propertyNode of schemaNode.children) {
          const [keywordNode, keywordValueNode] = propertyNode.children;
          const keywordHandler = keywordHandlers.get(keywordNode.value);
          if (keywordHandler) {
            /** @type OutputUnit[] */
            const keywordErrors = [];
            if (!keywordHandler(keywordValueNode, instanceNode, schemaNode, keywordErrors)) {
              isValid = false;
              errors.push({
                absoluteKeywordLocation: keywordValueNode.location,
                instanceLocation: instanceNode.location
              });
              errors.push(...keywordErrors);
            }
          }
        }

        return isValid;
    }
  }

  throw Error("Invalid Schema");
};

/** @type Map<string, JsonNode> */
const schemaRegistry = new Map();

/** @type (schema: Json, uri: string) => void */
export const registerSchema = (schema, uri) => {
  schemaRegistry.set(uri, toJsonNode(schema, uri));
};

/**
 * @typedef {(
 *   keywordNode: JsonNode,
 *   instanceNode: JsonNode,
 *   schemaNode: JsonObjectNode,
 *   errors: OutputUnit[],
 * ) => boolean} KeywordHandler
 */

/** @type Map<string, KeywordHandler> */
const keywordHandlers = new Map();

keywordHandlers.set("$ref", (refNode, instanceNode, _schemaNode, errors) => {
  assertNodeType(refNode, "string");

  const uri = refNode.location.startsWith("#")
    ? refNode.value.startsWith("#") ? "" : toAbsoluteIri(refNode.value)
    : toAbsoluteIri(resolveIri(refNode.value, toAbsoluteIri(refNode.location)));

  const schemaNode = schemaRegistry.get(uri);
  if (!schemaNode) {
    throw Error(`Invalid reference: ${uri}`);
  }

  const pointer = decodeURI(parseIriReference(refNode.value).fragment ?? "");
  const referencedSchemaNode = jsonPointerGet(pointer, schemaNode, uri);

  return validateSchema(referencedSchemaNode, instanceNode, errors);
});

keywordHandlers.set("additionalProperties", (additionalPropertiesNode, instanceNode, schemaNode, errors) => {
  if (instanceNode.jsonType !== "object") {
    return true;
  }

  const propertyPatterns = [];

  if (jsonObjectHas("properties", schemaNode)) {
    const propertiesNode = jsonPointerStep("properties", schemaNode);
    if (propertiesNode.jsonType === "object") {
      for (const propertyName of jsonObjectKeys(propertiesNode)) {
        propertyPatterns.push(`^${regexEscape(propertyName)}$`);
      }
    }
  }

  if (jsonObjectHas("patternProperties", schemaNode)) {
    const patternPropertiesNode = jsonPointerStep("patternProperties", schemaNode);
    if (patternPropertiesNode.jsonType === "object") {
      propertyPatterns.push(...jsonObjectKeys(patternPropertiesNode));
    }
  }

  const isDefinedProperty = new RegExp(propertyPatterns.length > 0 ? propertyPatterns.join("|") : "(?!)", "u");

  let isValid = true;
  for (const propertyNode of instanceNode.children) {
    const [propertyNameNode, instancePropertyNode] = propertyNode.children;
    if (!isDefinedProperty.test(propertyNameNode.value) && !validateSchema(additionalPropertiesNode, instancePropertyNode, errors)) {
      isValid = false;
    }
  }

  return isValid;
});

/** @type (string: string) => string */
const regexEscape = (string) => string
  .replace(/[|\\{}()[\]^$+*?.]/g, "\\$&")
  .replace(/-/g, "\\x2d");

keywordHandlers.set("allOf", (allOfNode, instanceNode, _schemaNode, errors) => {
  assertNodeType(allOfNode, "array");

  let isValid = true;
  for (const schemaNode of allOfNode.children) {
    if (!validateSchema(schemaNode, instanceNode, errors)) {
      isValid = false;
    }
  }

  return isValid;
});

keywordHandlers.set("anyOf", (anyOfNode, instanceNode, _schemaNode, errors) => {
  assertNodeType(anyOfNode, "array");

  let isValid = false;
  for (const schemaNode of anyOfNode.children) {
    if (validateSchema(schemaNode, instanceNode, errors)) {
      isValid = true;
    }
  }

  return isValid;
});

keywordHandlers.set("oneOf", (oneOfNode, instanceNode, _schemaNode, errors) => {
  assertNodeType(oneOfNode, "array");

  let matches = 0;
  for (const schemaNode of oneOfNode.children) {
    if (validateSchema(schemaNode, instanceNode, errors)) {
      matches++;
    }
  }

  return matches === 1;
});

keywordHandlers.set("not", (notNode, instanceNode) => {
  return !validateSchema(notNode, instanceNode, []);
});

keywordHandlers.set("contains", (containsNode, instanceNode, schemaNode, errors) => {
  if (instanceNode.jsonType !== "array") {
    return true;
  }

  let minContains = 1;
  if (jsonObjectHas("minContains", schemaNode)) {
    const minContainsNode = jsonPointerStep("minContains", schemaNode);
    if (minContainsNode.jsonType === "number") {
      minContains = minContainsNode.value;
    }
  }

  let maxContains = Number.MAX_SAFE_INTEGER;
  if (jsonObjectHas("maxContains", schemaNode)) {
    const maxContainsNode = jsonPointerStep("maxContains", schemaNode);
    if (maxContainsNode.jsonType === "number") {
      maxContains = maxContainsNode.value;
    }
  }

  let matches = 0;
  for (const itemNode of instanceNode.children) {
    if (validateSchema(containsNode, itemNode, errors)) {
      matches++;
    }
  }

  return matches >= minContains && matches <= maxContains;
});

keywordHandlers.set("dependentSchemas", (dependentSchemasNode, instanceNode, _schemaNode, errors) => {
  if (instanceNode.jsonType !== "object") {
    return true;
  }

  assertNodeType(dependentSchemasNode, "object");

  let isValid = true;
  for (const propertyNode of dependentSchemasNode.children) {
    const [keyNode, schemaNode] = propertyNode.children;
    if (jsonObjectHas(keyNode.value, instanceNode) && !validateSchema(schemaNode, instanceNode, errors)) {
      isValid = false;
    }
  }

  return isValid;
});

keywordHandlers.set("then", (thenNode, instanceNode, schemaNode, errors) => {
  if (jsonObjectHas("if", schemaNode)) {
    const ifNode = jsonPointerStep("if", schemaNode);
    if (validateSchema(ifNode, instanceNode, [])) {
      return validateSchema(thenNode, instanceNode, errors);
    }
  }

  return true;
});

keywordHandlers.set("else", (elseNode, instanceNode, schemaNode, errors) => {
  if (jsonObjectHas("if", schemaNode)) {
    const ifNode = jsonPointerStep("if", schemaNode);
    if (!validateSchema(ifNode, instanceNode, [])) {
      return validateSchema(elseNode, instanceNode, errors);
    }
  }

  return true;
});

keywordHandlers.set("items", (itemsNode, instanceNode, schemaNode, errors) => {
  if (instanceNode.jsonType !== "array") {
    return true;
  }

  let numberOfPrefixItems = 0;
  if (jsonObjectHas("prefixItems", schemaNode)) {
    const prefixItemsNode = jsonPointerStep("prefixItems", schemaNode);
    if (prefixItemsNode.jsonType === "array") {
      numberOfPrefixItems = prefixItemsNode.children.length;
    }
  }

  let isValid = true;
  for (const itemNode of instanceNode.children.slice(numberOfPrefixItems)) {
    if (!validateSchema(itemsNode, itemNode, errors)) {
      isValid = false;
    }
  }

  return isValid;
});

keywordHandlers.set("patternProperties", (patternPropertiesNode, instanceNode, _schemaNode, errors) => {
  if (instanceNode.jsonType !== "object") {
    return true;
  }

  assertNodeType(patternPropertiesNode, "object");

  let isValid = true;
  for (const propertyNode of patternPropertiesNode.children) {
    const [patternNode, patternSchemaNode] = propertyNode.children;
    const pattern = new RegExp(patternNode.value, "u");
    for (const propertyNode of instanceNode.children) {
      const [propertyNameNode, propertyValueNode] = propertyNode.children;
      const propertyName = propertyNameNode.value;
      if (pattern.test(propertyName) && !validateSchema(patternSchemaNode, propertyValueNode, errors)) {
        isValid = false;
      }
    }
  }

  return isValid;
});

keywordHandlers.set("prefixItems", (prefixItemsNode, instanceNode, _schemaNode, errors) => {
  if (instanceNode.jsonType !== "array") {
    return true;
  }

  assertNodeType(prefixItemsNode, "array");

  let isValid = true;
  for (let index = 0; index < instanceNode.children.length; index++) {
    if (prefixItemsNode.children[index] && !validateSchema(prefixItemsNode.children[index], instanceNode.children[index], errors)) {
      isValid = false;
    }
  }

  return isValid;
});

keywordHandlers.set("properties", (propertiesNode, instanceNode, _schemaNode, errors) => {
  if (instanceNode.jsonType !== "object") {
    return true;
  }

  assertNodeType(propertiesNode, "object");

  let isValid = true;
  for (const jsonPropertyNode of instanceNode.children) {
    const [propertyNameNode, instancePropertyNode] = jsonPropertyNode.children;
    if (jsonObjectHas(propertyNameNode.value, propertiesNode)) {
      const schemaPropertyNode = jsonPointerStep(propertyNameNode.value, propertiesNode);
      if (!validateSchema(schemaPropertyNode, instancePropertyNode, errors)) {
        isValid = false;
      }
    }
  }

  return isValid;
});

keywordHandlers.set("propertyNames", (propertyNamesNode, instanceNode, _schemaNode, errors) => {
  if (instanceNode.jsonType !== "object") {
    return true;
  }

  let isValid = true;
  for (const propertyNode of instanceNode.children) {
    /** @type JsonStringNode */
    const keyNode = {
      type: "json",
      jsonType: "string",
      value: propertyNode.children[0].value,
      location: JsonPointer.append(propertyNode.children[0].value, instanceNode.location)
    };
    if (!validateSchema(propertyNamesNode, keyNode, errors)) {
      isValid = false;
    }
  }

  return isValid;
});

keywordHandlers.set("const", (constNode, instanceNode) => {
  return jsonStringify(jsonValue(instanceNode)) === jsonStringify(jsonValue(constNode));
});

keywordHandlers.set("dependentRequired", (dependentRequiredNode, instanceNode) => {
  if (instanceNode.jsonType !== "object") {
    return true;
  }

  assertNodeType(dependentRequiredNode, "object");

  return dependentRequiredNode.children.every((propertyNode) => {
    const [keyNode, requiredPropertiesNode] = propertyNode.children;
    if (!jsonObjectHas(keyNode.value, instanceNode)) {
      return true;
    }

    assertNodeType(requiredPropertiesNode, "array");
    return requiredPropertiesNode.children.every((requiredPropertyNode) => {
      assertNodeType(requiredPropertyNode, "string");
      return jsonObjectHas(requiredPropertyNode.value, instanceNode);
    });
  });
});

keywordHandlers.set("enum", (enumNode, instanceNode) => {
  assertNodeType(enumNode, "array");

  const instanceValue = jsonStringify(jsonValue(instanceNode));
  return enumNode.children.some((enumItemNode) => jsonStringify(jsonValue(enumItemNode)) === instanceValue);
});

keywordHandlers.set("exclusiveMaximum", (exclusiveMaximumNode, instanceNode) => {
  if (instanceNode.jsonType !== "number") {
    return true;
  }

  assertNodeType(exclusiveMaximumNode, "number");

  return instanceNode.value < exclusiveMaximumNode.value;
});

keywordHandlers.set("exclusiveMinimum", (exclusiveMinimumNode, instanceNode) => {
  if (instanceNode.jsonType !== "number") {
    return true;
  }

  assertNodeType(exclusiveMinimumNode, "number");

  return instanceNode.value > exclusiveMinimumNode.value;
});

keywordHandlers.set("maxItems", (maxItemsNode, instanceNode) => {
  if (instanceNode.jsonType !== "array") {
    return true;
  }

  assertNodeType(maxItemsNode, "number");

  return instanceNode.children.length <= maxItemsNode.value;
});

keywordHandlers.set("minItems", (minItemsNode, instanceNode) => {
  if (instanceNode.jsonType !== "array") {
    return true;
  }

  assertNodeType(minItemsNode, "number");

  return instanceNode.children.length >= minItemsNode.value;
});

keywordHandlers.set("maxLength", (maxLengthNode, instanceNode) => {
  if (instanceNode.jsonType !== "string") {
    return true;
  }

  assertNodeType(maxLengthNode, "number");

  return [...instanceNode.value].length <= maxLengthNode.value;
});

keywordHandlers.set("minLength", (minLengthNode, instanceNode) => {
  if (instanceNode.jsonType !== "string") {
    return true;
  }

  assertNodeType(minLengthNode, "number");

  return [...instanceNode.value].length >= minLengthNode.value;
});

keywordHandlers.set("maxProperties", (maxPropertiesNode, instanceNode) => {
  if (instanceNode.jsonType !== "object") {
    return true;
  }

  assertNodeType(maxPropertiesNode, "number");

  return instanceNode.children.length <= maxPropertiesNode.value;
});

keywordHandlers.set("minProperties", (minPropertiesNode, instanceNode) => {
  if (instanceNode.jsonType !== "object") {
    return true;
  }

  assertNodeType(minPropertiesNode, "number");

  return instanceNode.children.length >= minPropertiesNode.value;
});

keywordHandlers.set("maximum", (maximumNode, instanceNode) => {
  if (instanceNode.jsonType !== "number") {
    return true;
  }

  assertNodeType(maximumNode, "number");

  return instanceNode.value <= maximumNode.value;
});

keywordHandlers.set("minimum", (minimumNode, instanceNode) => {
  if (instanceNode.jsonType !== "number") {
    return true;
  }

  assertNodeType(minimumNode, "number");

  return instanceNode.value >= minimumNode.value;
});

keywordHandlers.set("multipleOf", (multipleOfNode, instanceNode) => {
  if (instanceNode.jsonType !== "number") {
    return true;
  }

  assertNodeType(multipleOfNode, "number");

  const remainder = instanceNode.value % multipleOfNode.value;
  return numberEqual(0, remainder) || numberEqual(multipleOfNode.value, remainder);
});

/** @type (a: number, b: number) => boolean */
const numberEqual = (a, b) => Math.abs(a - b) < 1.19209290e-7;

keywordHandlers.set("pattern", (patternNode, instanceNode) => {
  if (instanceNode.jsonType !== "string") {
    return true;
  }

  assertNodeType(patternNode, "string");

  return new RegExp(patternNode.value, "u").test(instanceNode.value);
});

keywordHandlers.set("required", (requiredNode, instanceNode) => {
  if (instanceNode.jsonType !== "object") {
    return true;
  }

  assertNodeType(requiredNode, "array");

  for (const requiredPropertyNode of requiredNode.children) {
    assertNodeType(requiredPropertyNode, "string");
    if (!jsonObjectHas(requiredPropertyNode.value, instanceNode)) {
      return false;
    }
  }
  return true;
});

keywordHandlers.set("type", (typeNode, instanceNode) => {
  switch (typeNode.jsonType) {
    case "string":
      return isTypeOf(instanceNode, typeNode.value);

    case "array":
      return typeNode.children.some((itemNode) => {
        assertNodeType(itemNode, "string");
        return isTypeOf(instanceNode, itemNode.value);
      });

    default:
      throw Error("Invalid Schema");
  }
});

/** @type (instanceNode: JsonNode, type: string) => boolean */
const isTypeOf = (instance, type) => type === "integer"
  ? instance.jsonType === "number" && Number.isInteger(instance.value)
  : instance.jsonType === type;

keywordHandlers.set("uniqueItems", (uniqueItemsNode, instanceNode) => {
  if (instanceNode.jsonType !== "array") {
    return true;
  }

  assertNodeType(uniqueItemsNode, "boolean");

  if (uniqueItemsNode.value === false) {
    return true;
  }

  const normalizedItems = instanceNode.children.map((itemNode) => jsonStringify(jsonValue(itemNode)));
  return new Set(normalizedItems).size === normalizedItems.length;
});

keywordHandlers.set("$id", (idNode, _instanceNode, schemaNode) => {
  if (!idNode.location.endsWith("#/$id")) {
    throw Error(`Embedded schemas are not supported. Found at ${schemaNode.location}`);
  }

  return true;
});

keywordHandlers.set("$anchor", (anchorNode) => {
  throw Error(`The '$anchor' keyword is not supported. Found at ${anchorNode.location}`);
});

keywordHandlers.set("$dynamicAnchor", (dynamicAnchorNode) => {
  throw Error(`The '$dynamicAnchor' keyword is not supported. Found at ${dynamicAnchorNode.location}`);
});

keywordHandlers.set("$dynamicRef", (dynamicRefNode) => {
  throw Error(`The '$dynamicRef' keyword is not supported. Found at ${dynamicRefNode.location}`);
});

keywordHandlers.set("unevaluatedProperties", (unevaluatedPropertiesNode) => {
  throw Error(`The 'unevaluatedProperties' keyword is not supported. Found at ${unevaluatedPropertiesNode.location}`);
});

keywordHandlers.set("unevaluatedItems", (unevaluatedItemsNode) => {
  throw Error(`The 'unevaluatedItems' keyword is not supported. Found at ${unevaluatedItemsNode.location}`);
});
