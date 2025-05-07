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
import { Output } from "./output.js";

/**
 * @import {
 *   Json,
 *   JsonNode,
 *   JsonObjectNode,
 *   JsonStringNode
 * } from "./jsonast.d.ts"
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

  const output = validateSchema(schemaNode, toJsonNode(instance));

  schemaRegistry.delete(uri);

  return output;
};

/** @type (schemaNode: JsonNode, instanceNode: JsonNode) => Output */
const validateSchema = (schemaNode, instanceNode) => {
  if (schemaNode.type === "json") {
    switch (schemaNode.jsonType) {
      case "boolean":
        return new Output(schemaNode.value, schemaNode, instanceNode);
      case "object":
        let isValid = true;
        for (const propertyNode of schemaNode.children) {
          const [keywordNode, keywordValueNode] = propertyNode.children;
          const keywordHandler = keywordHandlers.get(keywordNode.value);
          if (keywordHandler) {
            const keywordOutput = keywordHandler(keywordValueNode, instanceNode, schemaNode);
            if (!keywordOutput.valid) {
              isValid = false;
            }
          }
        }

        return new Output(isValid, schemaNode, instanceNode);
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
 *   schemaNode: JsonObjectNode
 * ) => Output} KeywordHandler
 */

/** @type Map<string, KeywordHandler> */
const keywordHandlers = new Map();

keywordHandlers.set("$ref", (refNode, instanceNode) => {
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

  const keywordOutput = validateSchema(referencedSchemaNode, instanceNode);
  return new Output(keywordOutput.valid, refNode, instanceNode, keywordOutput.errors);
});

keywordHandlers.set("additionalProperties", (additionalPropertiesNode, instanceNode, schemaNode) => {
  if (instanceNode.jsonType !== "object") {
    return new Output(true, additionalPropertiesNode, instanceNode);
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
    if (!isDefinedProperty.test(propertyNameNode.value)) {
      const schemaOutput = validateSchema(additionalPropertiesNode, instancePropertyNode);
      if (!schemaOutput.valid) {
        isValid = false;
      }
    }
  }

  return new Output(isValid, additionalPropertiesNode, instanceNode);
});

/** @type (string: string) => string */
const regexEscape = (string) => string
  .replace(/[|\\{}()[\]^$+*?.]/g, "\\$&")
  .replace(/-/g, "\\x2d");

keywordHandlers.set("allOf", (allOfNode, instanceNode) => {
  assertNodeType(allOfNode, "array");

  let isValid = true;
  for (const schemaNode of allOfNode.children) {
    if (!validateSchema(schemaNode, instanceNode).valid) {
      isValid = false;
    }
  }

  return new Output(isValid, allOfNode, instanceNode);
});

keywordHandlers.set("anyOf", (anyOfNode, instanceNode) => {
  assertNodeType(anyOfNode, "array");

  let isValid = false;
  for (const schemaNode of anyOfNode.children) {
    const schemaOutput = validateSchema(schemaNode, instanceNode);
    if (schemaOutput.valid) {
      isValid = true;
    }
  }
  return new Output(isValid, anyOfNode, instanceNode);
});

keywordHandlers.set("oneOf", (oneOfNode, instanceNode) => {
  assertNodeType(oneOfNode, "array");

  let matches = 0;
  for (const schemaNode of oneOfNode.children) {
    const schemaOutput = validateSchema(schemaNode, instanceNode);
    if (schemaOutput.valid) {
      matches++;
    }
  }

  return new Output(matches === 1, oneOfNode, instanceNode);
});

keywordHandlers.set("not", (notNode, instanceNode) => {
  const schemaOutput = validateSchema(notNode, instanceNode);
  return new Output(!schemaOutput.valid, notNode, instanceNode);
});

keywordHandlers.set("contains", (containsNode, instanceNode, schemaNode) => {
  if (instanceNode.jsonType !== "array") {
    return new Output(true, containsNode, instanceNode);
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
    const schemaOutput = validateSchema(containsNode, itemNode);
    if (schemaOutput.valid) {
      matches++;
    }
  }

  const isValid = matches >= minContains && matches <= maxContains;
  return new Output(isValid, containsNode, instanceNode);
});

keywordHandlers.set("dependentSchemas", (dependentSchemasNode, instanceNode) => {
  if (instanceNode.jsonType !== "object") {
    return new Output(true, dependentSchemasNode, instanceNode);
  }

  assertNodeType(dependentSchemasNode, "object");

  let isValid = true;
  for (const propertyNode of dependentSchemasNode.children) {
    const [keyNode, schemaNode] = propertyNode.children;
    if (jsonObjectHas(keyNode.value, instanceNode)) {
      const schemaOutput = validateSchema(schemaNode, instanceNode);
      if (!schemaOutput.valid) {
        isValid = false;
      }
    }
  }

  return new Output(isValid, dependentSchemasNode, instanceNode);
});

keywordHandlers.set("then", (thenNode, instanceNode, schemaNode) => {
  if (jsonObjectHas("if", schemaNode)) {
    const ifNode = jsonPointerStep("if", schemaNode);
    const schemaOutput = validateSchema(ifNode, instanceNode);
    if (schemaOutput.valid) {
      return validateSchema(thenNode, instanceNode);
    }
  }

  return new Output(true, thenNode, instanceNode);
});

keywordHandlers.set("else", (elseNode, instanceNode, schemaNode) => {
  if (jsonObjectHas("if", schemaNode)) {
    const ifNode = jsonPointerStep("if", schemaNode);
    const schemaOutput = validateSchema(ifNode, instanceNode);
    if (!schemaOutput.valid) {
      return validateSchema(elseNode, instanceNode);
    }
  }

  return new Output(true, elseNode, instanceNode);
});

keywordHandlers.set("items", (itemsNode, instanceNode, schemaNode) => {
  if (instanceNode.jsonType !== "array") {
    return new Output(true, itemsNode, instanceNode);
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
    const schemaOutput = validateSchema(itemsNode, itemNode);
    if (!schemaOutput.valid) {
      isValid = false;
    }
  }

  return new Output(isValid, itemsNode, instanceNode);
});

keywordHandlers.set("patternProperties", (patternPropertiesNode, instanceNode) => {
  if (instanceNode.jsonType !== "object") {
    return new Output(true, patternPropertiesNode, instanceNode);
  }

  assertNodeType(patternPropertiesNode, "object");

  let isValid = true;
  for (const propertyNode of patternPropertiesNode.children) {
    const [patternNode, patternSchemaNode] = propertyNode.children;
    const pattern = new RegExp(patternNode.value, "u");
    for (const propertyNode of instanceNode.children) {
      const [propertyNameNode, propertyValueNode] = propertyNode.children;
      const propertyName = propertyNameNode.value;
      if (pattern.test(propertyName)) {
        const schemaOutput = validateSchema(patternSchemaNode, propertyValueNode);
        if (!schemaOutput.valid) {
          isValid = false;
        }
      }
    }
  }

  return new Output(isValid, patternPropertiesNode, instanceNode);
});

keywordHandlers.set("prefixItems", (prefixItemsNode, instanceNode) => {
  if (instanceNode.jsonType !== "array") {
    return new Output(true, prefixItemsNode, instanceNode);
  }

  assertNodeType(prefixItemsNode, "array");

  let isValid = true;
  for (let index = 0; index < instanceNode.children.length; index++) {
    if (prefixItemsNode.children[index]) {
      const schemaOutput = validateSchema(prefixItemsNode.children[index], instanceNode.children[index]);
      if (!schemaOutput.valid) {
        isValid = false;
      }
    }
  }

  return new Output(isValid, prefixItemsNode, instanceNode);
});

keywordHandlers.set("properties", (propertiesNode, instanceNode) => {
  if (instanceNode.jsonType !== "object") {
    return new Output(true, propertiesNode, instanceNode);
  }

  assertNodeType(propertiesNode, "object");

  let isValid = true;
  for (const jsonPropertyNode of instanceNode.children) {
    const [propertyNameNode, instancePropertyNode] = jsonPropertyNode.children;
    if (jsonObjectHas(propertyNameNode.value, propertiesNode)) {
      const schemaPropertyNode = jsonPointerStep(propertyNameNode.value, propertiesNode);
      const schemaOutput = validateSchema(schemaPropertyNode, instancePropertyNode);
      if (!schemaOutput.valid) {
        isValid = false;
      }
    }
  }

  return new Output(isValid, propertiesNode, instanceNode);
});

keywordHandlers.set("propertyNames", (propertyNamesNode, instanceNode) => {
  if (instanceNode.jsonType !== "object") {
    return new Output(true, propertyNamesNode, instanceNode);
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
    const schemaOutput = validateSchema(propertyNamesNode, keyNode);
    if (!schemaOutput.valid) {
      isValid = false;
    }
  }

  return new Output(isValid, propertyNamesNode, instanceNode);
});

keywordHandlers.set("const", (constNode, instanceNode) => {
  const isValid = jsonStringify(jsonValue(instanceNode)) === jsonStringify(jsonValue(constNode));
  return new Output(isValid, constNode, instanceNode);
});

keywordHandlers.set("dependentRequired", (dependentRequiredNode, instanceNode) => {
  if (instanceNode.jsonType !== "object") {
    return new Output(true, dependentRequiredNode, instanceNode);
  }

  assertNodeType(dependentRequiredNode, "object");

  let isValid = true;
  for (const propertyNode of dependentRequiredNode.children) {
    const [keyNode, requiredPropertiesNode] = propertyNode.children;
    if (jsonObjectHas(keyNode.value, instanceNode)) {
      assertNodeType(requiredPropertiesNode, "array");
      const isConditionValid = requiredPropertiesNode.children.every((requiredPropertyNode) => {
        assertNodeType(requiredPropertyNode, "string");
        return jsonObjectHas(requiredPropertyNode.value, instanceNode);
      });

      if (!isConditionValid) {
        isValid = false;
      }
    }
  }

  return new Output(isValid, dependentRequiredNode, instanceNode);
});

keywordHandlers.set("enum", (enumNode, instanceNode) => {
  assertNodeType(enumNode, "array");

  const instanceValue = jsonStringify(jsonValue(instanceNode));
  for (const enumItemNode of enumNode.children) {
    if (jsonStringify(jsonValue(enumItemNode)) === instanceValue) {
      return new Output(true, enumNode, instanceNode);
    }
  }
  return new Output(false, enumNode, instanceNode);
});

keywordHandlers.set("exclusiveMaximum", (exclusiveMaximumNode, instanceNode) => {
  if (instanceNode.jsonType !== "number") {
    return new Output(true, exclusiveMaximumNode, instanceNode);
  }

  assertNodeType(exclusiveMaximumNode, "number");

  const isValid = instanceNode.value < exclusiveMaximumNode.value;
  return new Output(isValid, exclusiveMaximumNode, instanceNode);
});

keywordHandlers.set("exclusiveMinimum", (exclusiveMinimumNode, instanceNode) => {
  if (instanceNode.jsonType !== "number") {
    return new Output(true, exclusiveMinimumNode, instanceNode);
  }

  assertNodeType(exclusiveMinimumNode, "number");

  const isValid = instanceNode.value > exclusiveMinimumNode.value;
  return new Output(isValid, exclusiveMinimumNode, instanceNode);
});

keywordHandlers.set("maxItems", (maxItemsNode, instanceNode) => {
  if (instanceNode.jsonType !== "array") {
    return new Output(true, maxItemsNode, instanceNode);
  }

  assertNodeType(maxItemsNode, "number");

  const isValid = instanceNode.children.length <= maxItemsNode.value;
  return new Output(isValid, maxItemsNode, instanceNode);
});

keywordHandlers.set("minItems", (minItemsNode, instanceNode) => {
  if (instanceNode.jsonType !== "array") {
    return new Output(true, minItemsNode, instanceNode);
  }

  assertNodeType(minItemsNode, "number");

  const isValid = instanceNode.children.length >= minItemsNode.value;
  return new Output(isValid, minItemsNode, instanceNode);
});

keywordHandlers.set("maxLength", (maxLengthNode, instanceNode) => {
  if (instanceNode.jsonType !== "string") {
    return new Output(true, maxLengthNode, instanceNode);
  }

  assertNodeType(maxLengthNode, "number");

  const isValid = [...instanceNode.value].length <= maxLengthNode.value;
  return new Output(isValid, maxLengthNode, instanceNode);
});

keywordHandlers.set("minLength", (minLengthNode, instanceNode) => {
  if (instanceNode.jsonType !== "string") {
    return new Output(true, minLengthNode, instanceNode);
  }

  assertNodeType(minLengthNode, "number");

  const isValid = [...instanceNode.value].length >= minLengthNode.value;
  return new Output(isValid, minLengthNode, instanceNode);
});

keywordHandlers.set("maxProperties", (maxPropertiesNode, instanceNode) => {
  if (instanceNode.jsonType !== "object") {
    return new Output(true, maxPropertiesNode, instanceNode);
  }

  assertNodeType(maxPropertiesNode, "number");

  const isValid = instanceNode.children.length <= maxPropertiesNode.value;
  return new Output(isValid, maxPropertiesNode, instanceNode);
});

keywordHandlers.set("minProperties", (minPropertiesNode, instanceNode) => {
  if (instanceNode.jsonType !== "object") {
    return new Output(true, minPropertiesNode, instanceNode);
  }

  assertNodeType(minPropertiesNode, "number");

  const isValid = instanceNode.children.length >= minPropertiesNode.value;
  return new Output(isValid, minPropertiesNode, instanceNode);
});

keywordHandlers.set("maximum", (maximumNode, instanceNode) => {
  if (instanceNode.jsonType !== "number") {
    return new Output(true, maximumNode, instanceNode);
  }

  assertNodeType(maximumNode, "number");

  const isValid = instanceNode.value <= maximumNode.value;
  return new Output(isValid, maximumNode, instanceNode);
});

keywordHandlers.set("minimum", (minimumNode, instanceNode) => {
  if (instanceNode.jsonType !== "number") {
    return new Output(true, minimumNode, instanceNode);
  }

  assertNodeType(minimumNode, "number");

  const isValid = instanceNode.value >= minimumNode.value;
  return new Output(isValid, minimumNode, instanceNode);
});

keywordHandlers.set("multipleOf", (multipleOfNode, instanceNode) => {
  if (instanceNode.jsonType !== "number") {
    return new Output(true, multipleOfNode, instanceNode);
  }

  assertNodeType(multipleOfNode, "number");

  const remainder = instanceNode.value % multipleOfNode.value;
  const isValid = numberEqual(0, remainder) || numberEqual(multipleOfNode.value, remainder);
  return new Output(isValid, multipleOfNode, instanceNode);
});

/** @type (a: number, b: number) => boolean */
const numberEqual = (a, b) => Math.abs(a - b) < 1.19209290e-7;

keywordHandlers.set("pattern", (patternNode, instanceNode) => {
  if (instanceNode.jsonType !== "string") {
    return new Output(true, patternNode, instanceNode);
  }

  assertNodeType(patternNode, "string");

  const isValid = new RegExp(patternNode.value, "u").test(instanceNode.value);
  return new Output(isValid, patternNode, instanceNode);
});

keywordHandlers.set("required", (requiredNode, instanceNode) => {
  if (instanceNode.jsonType !== "object") {
    return new Output(true, requiredNode, instanceNode);
  }

  assertNodeType(requiredNode, "array");
  for (const requiredPropertyNode of requiredNode.children) {
    assertNodeType(requiredPropertyNode, "string");
    if (!jsonObjectHas(requiredPropertyNode.value, instanceNode)) {
      return new Output(false, requiredNode, instanceNode);
    }
  }
  return new Output(true, requiredNode, instanceNode);
});

keywordHandlers.set("type", (typeNode, instanceNode) => {
  if (typeNode.type === "json") {
    if (typeNode.jsonType === "string") {
      return new Output(isTypeOf(instanceNode, typeNode.value), typeNode, instanceNode);
    }

    if (typeNode.jsonType === "array") {
      for (const itemNode of typeNode.children) {
        if (itemNode.type !== "json" || itemNode.jsonType != "string") {
          throw Error("Invalid Schema");
        }

        if (isTypeOf(instanceNode, itemNode.value)) {
          return new Output(true, typeNode, instanceNode);
        }
      }

      return new Output(false, typeNode, instanceNode);
    }
  }

  throw Error("Invalid Schema");
});

/** @type (instanceNode: JsonNode, type: string) => boolean */
const isTypeOf = (instance, type) => type === "integer"
  ? instance.jsonType === "number" && Number.isInteger(instance.value)
  : instance.jsonType === type;

keywordHandlers.set("uniqueItems", (uniqueItemsNode, instanceNode) => {
  if (instanceNode.jsonType !== "array") {
    return new Output(true, uniqueItemsNode, instanceNode);
  }

  assertNodeType(uniqueItemsNode, "boolean");

  if (uniqueItemsNode.value === false) {
    return new Output(true, uniqueItemsNode, instanceNode);
  }

  const normalizedItems = instanceNode.children.map((itemNode) => jsonStringify(jsonValue(itemNode)));
  const isValid = new Set(normalizedItems).size === normalizedItems.length;
  return new Output(isValid, uniqueItemsNode, instanceNode);
});

keywordHandlers.set("$id", (idNode, instanceNode, schemaNode) => {
  if (!idNode.location.endsWith("#/$id")) {
    throw Error(`Embedded schemas are not supported. Found at ${schemaNode.location}`);
  }

  return new Output(true, idNode, instanceNode);
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
