import { readdir, readFile } from "node:fs/promises";
import { describe, test, expect, beforeAll } from "vitest";
import { toAbsoluteIri } from "@hyperjump/uri";
import { registerSchema, validate } from "./index.js";
import { basename } from "node:path";

/**
 * @import { Json, JsonObject } from "./jsonast.d.ts"
 */

/**
 * @typedef {{
 *   description: string;
 *   schema: Json;
 *   tests: Test[];
 * }} Suite
 */

/**
 * @typedef {{
 *   description: string;
 *   data: Json;
 *   valid: boolean;
 * }} Test
 */

/** @type Set<string> */
const skip = new Set([
  "|anchor.json",
  "|defs.json",
  "|dynamicRef.json",
  "|not.json|collect annotations inside a 'not', even if collection is disabled",
  "|ref.json|remote ref, containing refs itself",
  "|ref.json|Recursive references between schemas",
  "|ref.json|ref creates new scope when adjacent to keywords",
  "|ref.json|refs with relative uris and defs",
  "|ref.json|relative refs with absolute uris and defs",
  "|ref.json|$id must be resolved against nearest parent, not just immediate parent",
  "|ref.json|order of evaluation: $id and $ref",
  "|ref.json|order of evaluation: $id and $anchor and $ref",
  "|ref.json|simple URN base URI with $ref via the URN",
  "|ref.json|URN base URI with URN and anchor ref",
  "|ref.json|URN ref with nested pointer ref",
  "|ref.json|ref to if",
  "|ref.json|ref to then",
  "|ref.json|ref to else",
  "|ref.json|ref with absolute-path-reference",
  "|refRemote.json|anchor within remote ref",
  "|refRemote.json|base URI change",
  "|refRemote.json|base URI change - change folder",
  "|refRemote.json|base URI change - change folder in subschema",
  "|refRemote.json|Location-independent identifier in remote ref",
  "|refRemote.json|remote HTTP ref with nested absolute ref",
  "|refRemote.json|$ref to $ref finds detached $anchor",
  "|unevaluatedItems.json",
  "|unevaluatedProperties.json",
  "|vocabulary.json"
]);

/** @type (path: string[]) => boolean */
const shouldSkip = (path) => {
  let key = "";
  for (const segment of path) {
    key = `${key}|${segment}`;
    if (skip.has(key)) {
      return true;
    }
  }
  return false;
};

const testSuitePath = "./node_modules/json-schema-test-suite";
const draft = "draft2020-12";
const dialectUri = "https://json-schema.org/draft/2020-12/schema";
const testSuiteFilePath = `${testSuitePath}/tests/${draft}`;

/** @type (filePath: string, uri: string) => Promise<void> */
const addRemotes = async (filePath, url) => {
  for (const entry of await readdir(filePath, { withFileTypes: true })) {
    if (entry.isFile() && entry.name.endsWith(".json")) {
      /** @type JsonObject */
      const remote = JSON.parse(await readFile(`${filePath}/${entry.name}`, "utf8")); // eslint-disable-line @typescript-eslint/no-unsafe-assignment
      if (typeof remote.$schema !== "string" || toAbsoluteIri(remote.$schema) === dialectUri) {
        registerSchema(remote, `${url}/${basename(entry.name, ".schema.json")}`);
      }
    } else if (entry.isDirectory()) {
      await addRemotes(`${filePath}/${entry.name}`, `${url}/${entry.name}`);
    }
  }
};

describe(draft, async () => {
  beforeAll(async () => {
    await addRemotes(`${testSuitePath}/remotes`, "http://localhost:1234");
    await addRemotes("./src/json-schema.org", "https://json-schema.org");
  });

  for (const entry of await readdir(testSuiteFilePath, { withFileTypes: true })) {
    if (!entry.isFile() || !entry.name.endsWith(".json")) {
      continue;
    }

    const file = `${testSuiteFilePath}/${entry.name}`;

    if (shouldSkip([entry.name])) {
      continue;
    }

    describe(entry.name, async () => {
      /** @type Suite[] */
      const suites = JSON.parse(await readFile(file, "utf8")); // eslint-disable-line @typescript-eslint/no-unsafe-assignment

      for (const suite of suites) {
        if (shouldSkip([entry.name, suite.description])) {
          continue;
        }

        describe(suite.description, () => {
          for (const schemaTest of suite.tests) {
            if (shouldSkip([entry.name, suite.description, schemaTest.description])) {
              continue;
            }

            test(schemaTest.description, () => {
              const output = validate(suite.schema, schemaTest.data);
              expect(output.valid).to.equal(schemaTest.valid);
            });
          }
        });
      }
    });
  }
});
