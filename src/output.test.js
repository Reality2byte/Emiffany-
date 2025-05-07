import { describe, expect, test } from "vitest";
import { validate } from "./index.js";


describe("Basic Output Format", () => {
  describe("$ref", () => {
    test("invalid", () => {
      const output = validate({
        $ref: "#/$defs/string",
        $defs: {
          string: { type: "string" }
        }
      }, 42);

      expect(output).to.eql({
        valid: false,
        errors: [
          {
            absoluteKeywordLocation: "#/$ref",
            instanceLocation: "#"
          },
          {
            absoluteKeywordLocation: "#/$defs/string/type",
            instanceLocation: "#"
          }
        ]
      });
    });

    test("valid", () => {
      const output = validate({
        $ref: "#/$defs/string",
        $defs: {
          string: { type: "string" }
        }
      }, "foo");

      expect(output).to.eql({ valid: true });
    });
  });

  describe("additionalProperties", () => {
    test("invalid", () => {
      const output = validate({ additionalProperties: false }, { foo: 42 });

      expect(output).to.eql({
        valid: false,
        errors: [
          {
            absoluteKeywordLocation: "#/additionalProperties",
            instanceLocation: "#"
          },
          {
            absoluteKeywordLocation: "#/additionalProperties",
            instanceLocation: "#/foo"
          }
        ]
      });
    });

    test("invalid - multiple errors", () => {
      const output = validate({ additionalProperties: false }, { foo: 42, bar: 24 });

      expect(output).to.eql({
        valid: false,
        errors: [
          {
            absoluteKeywordLocation: "#/additionalProperties",
            instanceLocation: "#"
          },
          {
            absoluteKeywordLocation: "#/additionalProperties",
            instanceLocation: "#/foo"
          },
          {
            absoluteKeywordLocation: "#/additionalProperties",
            instanceLocation: "#/bar"
          }
        ]
      });
    });

    test("invalid - schema", () => {
      const output = validate({
        additionalProperties: { type: "string" }
      }, { foo: 42 });

      expect(output).to.eql({
        valid: false,
        errors: [
          {
            absoluteKeywordLocation: "#/additionalProperties",
            instanceLocation: "#"
          },
          {
            absoluteKeywordLocation: "#/additionalProperties/type",
            instanceLocation: "#/foo"
          }
        ]
      });
    });

    test("valid", () => {
      const output = validate({ additionalProperties: true }, {});
      expect(output).to.eql({ valid: true });
    });
  });

  describe("allOf", () => {
    test("invalid", () => {
      const output = validate({
        allOf: [
          { type: "number" },
          { maximum: 5 }
        ]
      }, 42);

      expect(output).to.eql({
        valid: false,
        errors: [
          {
            absoluteKeywordLocation: "#/allOf",
            instanceLocation: "#"
          },
          {
            absoluteKeywordLocation: "#/allOf/1/maximum",
            instanceLocation: "#"
          }
        ]
      });
    });

    test("invalid - multiple errors", () => {
      const output = validate({
        type: "number",
        allOf: [
          { maximum: 2 },
          { maximum: 5 }
        ]
      }, 42);

      expect(output).to.eql({
        valid: false,
        errors: [
          {
            absoluteKeywordLocation: "#/allOf",
            instanceLocation: "#"
          },
          {
            absoluteKeywordLocation: "#/allOf/0/maximum",
            instanceLocation: "#"
          },
          {
            absoluteKeywordLocation: "#/allOf/1/maximum",
            instanceLocation: "#"
          }
        ]
      });
    });

    test("valid", () => {
      const output = validate({
        allOf: [
          { type: "number" },
          { maximum: 5 }
        ]
      }, 3);
      expect(output).to.eql({ valid: true });
    });
  });

  describe("anyOf", () => {
    test("invalid", () => {
      const output = validate({
        anyOf: [
          { type: "string" },
          { type: "number" }
        ]
      }, true);

      expect(output).to.eql({
        valid: false,
        errors: [
          {
            absoluteKeywordLocation: "#/anyOf",
            instanceLocation: "#"
          },
          {
            absoluteKeywordLocation: "#/anyOf/0/type",
            instanceLocation: "#"
          },
          {
            absoluteKeywordLocation: "#/anyOf/1/type",
            instanceLocation: "#"
          }
        ]
      });
    });

    test("valid", () => {
      const output = validate({
        anyOf: [
          { type: "string" },
          { type: "number" }
        ]
      }, "foo");
      expect(output).to.eql({ valid: true });
    });
  });

  describe("oneOf", () => {
    test("invalid", () => {
      const output = validate({
        oneOf: [
          { type: "string" },
          { type: "number" }
        ]
      }, true);

      expect(output).to.eql({
        valid: false,
        errors: [
          {
            absoluteKeywordLocation: "#/oneOf",
            instanceLocation: "#"
          },
          {
            absoluteKeywordLocation: "#/oneOf/0/type",
            instanceLocation: "#"
          },
          {
            absoluteKeywordLocation: "#/oneOf/1/type",
            instanceLocation: "#"
          }
        ]
      });
    });

    test("valid", () => {
      const output = validate({
        oneOf: [
          { type: "string" },
          { type: "number" }
        ]
      }, "foo");
      expect(output).to.eql({ valid: true });
    });
  });

  describe("not", () => {
    test("invalid", () => {
      const output = validate({
        not: { type: "number" }
      }, 42);

      expect(output).to.eql({
        valid: false,
        errors: [
          {
            absoluteKeywordLocation: "#/not",
            instanceLocation: "#"
          }
        ]
      });
    });

    test("valid", () => {
      const output = validate({
        not: { type: "number" }
      }, "foo");
      expect(output).to.eql({ valid: true });
    });
  });

  describe("contains", () => {
    test("invalid", () => {
      const output = validate({
        contains: { type: "string" }
      }, [1, 2]);

      expect(output).to.eql({
        valid: false,
        errors: [
          {
            absoluteKeywordLocation: "#/contains",
            instanceLocation: "#"
          },
          {
            absoluteKeywordLocation: "#/contains/type",
            instanceLocation: "#/0"
          },
          {
            absoluteKeywordLocation: "#/contains/type",
            instanceLocation: "#/1"
          }
        ]
      });
    });

    test("valid", () => {
      const output = validate({
        contains: { type: "string" }
      }, [1, "foo"]);
      expect(output).to.eql({ valid: true });
    });
  });

  describe("dependentSchemas", () => {
    test("invalid", () => {
      const output = validate({
        dependentSchemas: {
          foo: { required: ["a"] }
        }
      }, { foo: 42 });

      expect(output).to.eql({
        valid: false,
        errors: [
          {
            absoluteKeywordLocation: "#/dependentSchemas",
            instanceLocation: "#"
          },
          {
            absoluteKeywordLocation: "#/dependentSchemas/foo/required",
            instanceLocation: "#"
          }
        ]
      });
    });

    test("invalid - multiple conditions fail", () => {
      const output = validate({
        dependentSchemas: {
          foo: { required: ["a"] },
          bar: { required: ["b"] }
        }
      }, { foo: 42, bar: 24 });

      expect(output).to.eql({
        valid: false,
        errors: [
          {
            absoluteKeywordLocation: "#/dependentSchemas",
            instanceLocation: "#"
          },
          {
            absoluteKeywordLocation: "#/dependentSchemas/foo/required",
            instanceLocation: "#"
          },
          {
            absoluteKeywordLocation: "#/dependentSchemas/bar/required",
            instanceLocation: "#"
          }
        ]
      });
    });

    test("valid", () => {
      const output = validate({
        dependentSchemas: {
          foo: { required: ["a"] }
        }
      }, { foo: 42, a: true });

      expect(output).to.eql({ valid: true });
    });
  });

  describe("then", () => {
    test("invalid", () => {
      const output = validate({
        if: { type: "string" },
        then: { minLength: 1 }
      }, "");

      expect(output).to.eql({
        valid: false,
        errors: [
          {
            absoluteKeywordLocation: "#/then",
            instanceLocation: "#"
          },
          {
            absoluteKeywordLocation: "#/then/minLength",
            instanceLocation: "#"
          }
        ]
      });
    });

    test("valid", () => {
      const output = validate({
        if: { type: "string" },
        then: { minLength: 1 }
      }, "foo");
      expect(output).to.eql({ valid: true });
    });
  });

  describe("else", () => {
    test("invalid", () => {
      const output = validate({
        type: ["string", "number"],
        if: { type: "string" },
        else: { minimum: 42 }
      }, 5);

      expect(output).to.eql({
        valid: false,
        errors: [
          {
            absoluteKeywordLocation: "#/else",
            instanceLocation: "#"
          },
          {
            absoluteKeywordLocation: "#/else/minimum",
            instanceLocation: "#"
          }
        ]
      });
    });

    test("valid", () => {
      const output = validate({
        type: ["string", "number"],
        if: { type: "string" },
        else: { minimum: 5 }
      }, 42);
      expect(output).to.eql({ valid: true });
    });
  });

  describe("items", () => {
    test("invalid", () => {
      const output = validate({
        items: { type: "string" }
      }, [42, 24]);

      expect(output).to.eql({
        valid: false,
        errors: [
          {
            absoluteKeywordLocation: "#/items",
            instanceLocation: "#"
          },
          {
            absoluteKeywordLocation: "#/items/type",
            instanceLocation: "#/0"
          },
          {
            absoluteKeywordLocation: "#/items/type",
            instanceLocation: "#/1"
          }
        ]
      });
    });

    test("valid", () => {
      const output = validate({
        items: { type: "string" }
      }, ["foo"]);
      expect(output).to.eql({ valid: true });
    });
  });

  describe("patternProperties", () => {
    test("invalid", () => {
      const output = validate({
        patternProperties: {
          "^f": { type: "string" },
          "^b": { type: "number" }
        }
      }, { foo: 42, bar: true });

      expect(output).to.eql({
        valid: false,
        errors: [
          {
            absoluteKeywordLocation: "#/patternProperties",
            instanceLocation: "#"
          },
          {
            absoluteKeywordLocation: "#/patternProperties/%5Ef/type",
            instanceLocation: "#/foo"
          },
          {
            absoluteKeywordLocation: "#/patternProperties/%5Eb/type",
            instanceLocation: "#/bar"
          }
        ]
      });
    });

    test("valid", () => {
      const output = validate({
        patternProperties: {
          "^f": { type: "string" },
          "^b": { type: "number" }
        }
      }, { foo: "a", bar: 42 });
      expect(output).to.eql({ valid: true });
    });
  });

  describe("prefixItems", () => {
    test("invalid", () => {
      const output = validate({
        prefixItems: [
          { type: "string" },
          { type: "number" }
        ]
      }, [42, "foo"]);

      expect(output).to.eql({
        valid: false,
        errors: [
          {
            absoluteKeywordLocation: "#/prefixItems",
            instanceLocation: "#"
          },
          {
            absoluteKeywordLocation: "#/prefixItems/0/type",
            instanceLocation: "#/0"
          },
          {
            absoluteKeywordLocation: "#/prefixItems/1/type",
            instanceLocation: "#/1"
          }
        ]
      });
    });

    test("valid", () => {
      const output = validate({
        prefixItems: [
          { type: "string" },
          { type: "number" }
        ]
      }, ["foo", 42]);
      expect(output).to.eql({ valid: true });
    });
  });

  describe("properties", () => {
    test("invalid", () => {
      const output = validate({
        properties: {
          foo: { type: "string" },
          bar: { type: "number" }
        }
      }, { foo: 42, bar: true });

      expect(output).to.eql({
        valid: false,
        errors: [
          {
            absoluteKeywordLocation: "#/properties",
            instanceLocation: "#"
          },
          {
            absoluteKeywordLocation: "#/properties/foo/type",
            instanceLocation: "#/foo"
          },
          {
            absoluteKeywordLocation: "#/properties/bar/type",
            instanceLocation: "#/bar"
          }
        ]
      });
    });

    test("valid", () => {
      const output = validate({
        properties: {
          foo: { type: "string" },
          bar: { type: "number" }
        }
      }, { foo: "a", bar: 42 });
      expect(output).to.eql({ valid: true });
    });
  });

  describe("propertyNames", () => {
    test("invalid", () => {
      const output = validate({
        propertyNames: { pattern: "^a" }
      }, { banana: true, pear: false });

      expect(output).to.eql({
        valid: false,
        errors: [
          {
            absoluteKeywordLocation: "#/propertyNames",
            instanceLocation: "#"
          },
          {
            absoluteKeywordLocation: "#/propertyNames/pattern",
            instanceLocation: "#/banana"
          },
          {
            absoluteKeywordLocation: "#/propertyNames/pattern",
            instanceLocation: "#/pear"
          }
        ]
      });
    });

    test("valid", () => {
      const output = validate({
        propertyNames: { pattern: "^a" }
      }, { apple: true });
      expect(output).to.eql({ valid: true });
    });
  });

  describe("const", () => {
    test("invalid", () => {
      const output = validate({ const: "foo" }, 42);

      expect(output).to.eql({
        valid: false,
        errors: [
          {
            absoluteKeywordLocation: "#/const",
            instanceLocation: "#"
          }
        ]
      });
    });

    test("valid", () => {
      const output = validate({ const: "foo" }, "foo");
      expect(output).to.eql({ valid: true });
    });
  });

  describe("dependentRequired", () => {
    test("invalid", () => {
      const output = validate({
        dependentRequired: {
          foo: ["a"]
        }
      }, { foo: 42 });

      expect(output).to.eql({
        valid: false,
        errors: [
          {
            absoluteKeywordLocation: "#/dependentRequired",
            instanceLocation: "#"
          }
        ]
      });
    });

    test("invalid - multiple conditions fail", () => {
      const output = validate({
        dependentRequired: {
          foo: ["a"],
          bar: ["b"]
        }
      }, { foo: 42, bar: 24 });

      expect(output).to.eql({
        valid: false,
        errors: [
          {
            absoluteKeywordLocation: "#/dependentRequired",
            instanceLocation: "#"
          }
        ]
      });
    });

    test("valid", () => {
      const output = validate({
        dependentRequired: {
          foo: ["a"]
        }
      }, { foo: 42, a: true });

      expect(output).to.eql({ valid: true });
    });
  });

  describe("enum", () => {
    test("invalid", () => {
      const output = validate({ enum: ["foo"] }, 42);

      expect(output).to.eql({
        valid: false,
        errors: [
          {
            absoluteKeywordLocation: "#/enum",
            instanceLocation: "#"
          }
        ]
      });
    });

    test("valid", () => {
      const output = validate({ enum: ["foo"] }, "foo");
      expect(output).to.eql({ valid: true });
    });
  });

  describe("exclusiveMaximum", () => {
    test("invalid", () => {
      const output = validate({ exclusiveMaximum: 5 }, 42);

      expect(output).to.eql({
        valid: false,
        errors: [
          {
            absoluteKeywordLocation: "#/exclusiveMaximum",
            instanceLocation: "#"
          }
        ]
      });
    });

    test("valid", () => {
      const output = validate({ exclusiveMaximum: 42 }, 5);
      expect(output).to.eql({ valid: true });
    });
  });

  describe("exclusiveMinimum", () => {
    test("invalid", () => {
      const output = validate({ exclusiveMinimum: 42 }, 5);

      expect(output).to.eql({
        valid: false,
        errors: [
          {
            absoluteKeywordLocation: "#/exclusiveMinimum",
            instanceLocation: "#"
          }
        ]
      });
    });

    test("valid", () => {
      const output = validate({ exclusiveMinimum: 5 }, 42);
      expect(output).to.eql({ valid: true });
    });
  });

  describe("maxItems", () => {
    test("invalid", () => {
      const output = validate({ maxItems: 1 }, [1, 2]);

      expect(output).to.eql({
        valid: false,
        errors: [
          {
            absoluteKeywordLocation: "#/maxItems",
            instanceLocation: "#"
          }
        ]
      });
    });

    test("valid", () => {
      const output = validate({ maxItems: 1 }, []);
      expect(output).to.eql({ valid: true });
    });
  });

  describe("minItems", () => {
    test("invalid", () => {
      const output = validate({ minItems: 1 }, []);

      expect(output).to.eql({
        valid: false,
        errors: [
          {
            absoluteKeywordLocation: "#/minItems",
            instanceLocation: "#"
          }
        ]
      });
    });

    test("valid", () => {
      const output = validate({ minItems: 1 }, [1, 2]);
      expect(output).to.eql({ valid: true });
    });
  });

  describe("maxLength", () => {
    test("invalid", () => {
      const output = validate({ maxLength: 2 }, "foo");

      expect(output).to.eql({
        valid: false,
        errors: [
          {
            absoluteKeywordLocation: "#/maxLength",
            instanceLocation: "#"
          }
        ]
      });
    });

    test("valid", () => {
      const output = validate({ maxLength: 2 }, "a");
      expect(output).to.eql({ valid: true });
    });
  });

  describe("minLength", () => {
    test("invalid", () => {
      const output = validate({ minLength: 2 }, "a");

      expect(output).to.eql({
        valid: false,
        errors: [
          {
            absoluteKeywordLocation: "#/minLength",
            instanceLocation: "#"
          }
        ]
      });
    });

    test("valid", () => {
      const output = validate({ minLength: 1 }, "foo");
      expect(output).to.eql({ valid: true });
    });
  });

  describe("maxProperties", () => {
    test("invalid", () => {
      const output = validate({ maxProperties: 1 }, { a: 1, b: 2 });

      expect(output).to.eql({
        valid: false,
        errors: [
          {
            absoluteKeywordLocation: "#/maxProperties",
            instanceLocation: "#"
          }
        ]
      });
    });

    test("valid", () => {
      const output = validate({ maxProperties: 1 }, {});
      expect(output).to.eql({ valid: true });
    });
  });

  describe("minProperties", () => {
    test("invalid", () => {
      const output = validate({ minProperties: 1 }, {});

      expect(output).to.eql({
        valid: false,
        errors: [
          {
            absoluteKeywordLocation: "#/minProperties",
            instanceLocation: "#"
          }
        ]
      });
    });

    test("valid", () => {
      const output = validate({ minProperties: 1 }, { a: 1, b: 2 });

      expect(output).to.eql({ valid: true });
    });
  });

  describe("maximum", () => {
    test("invalid", () => {
      const output = validate({ maximum: 5 }, 42);

      expect(output).to.eql({
        valid: false,
        errors: [
          {
            absoluteKeywordLocation: "#/maximum",
            instanceLocation: "#"
          }
        ]
      });
    });

    test("valid", () => {
      const output = validate({ maximum: 42 }, 5);

      expect(output).to.eql({ valid: true });
    });
  });

  describe("minimum", () => {
    test("invalid", () => {
      const output = validate({ minimum: 42 }, 5);

      expect(output).to.eql({
        valid: false,
        errors: [
          {
            absoluteKeywordLocation: "#/minimum",
            instanceLocation: "#"
          }
        ]
      });
    });

    test("valid", () => {
      const output = validate({ minimum: 5 }, 42);
      expect(output).to.eql({ valid: true });
    });
  });

  describe("multipleOf", () => {
    test("invalid", () => {
      const output = validate({ multipleOf: 2 }, 3);

      expect(output).to.eql({
        valid: false,
        errors: [
          {
            absoluteKeywordLocation: "#/multipleOf",
            instanceLocation: "#"
          }
        ]
      });
    });

    test("valid", () => {
      const output = validate({ multipleOf: 2 }, 4);
      expect(output).to.eql({ valid: true });
    });
  });

  describe("pattern", () => {
    test("invalid", () => {
      const output = validate({ pattern: "^a" }, "banana");

      expect(output).to.eql({
        valid: false,
        errors: [
          {
            absoluteKeywordLocation: "#/pattern",
            instanceLocation: "#"
          }
        ]
      });
    });

    test("valid", () => {
      const output = validate({ pattern: "^a" }, "apple");
      expect(output).to.eql({ valid: true });
    });
  });

  describe("required", () => {
    test("invalid", () => {
      const output = validate({ required: ["a"] }, {});

      expect(output).to.eql({
        valid: false,
        errors: [
          {
            absoluteKeywordLocation: "#/required",
            instanceLocation: "#"
          }
        ]
      });
    });

    test("invalid - multiple missing", () => {
      const output = validate({ required: ["a", "b"] }, {});

      expect(output).to.eql({
        valid: false,
        errors: [
          {
            absoluteKeywordLocation: "#/required",
            instanceLocation: "#"
          }
        ]
      });
    });

    test("valid", () => {
      const output = validate({ required: ["a"] }, { a: 1 });
      expect(output).to.eql({ valid: true });
    });
  });

  describe("type", () => {
    test("invalid", () => {
      const output = validate({ type: "string" }, 42);

      expect(output).to.eql({
        valid: false,
        errors: [
          {
            absoluteKeywordLocation: "#/type",
            instanceLocation: "#"
          }
        ]
      });
    });

    test("invalid - multiple types", () => {
      const output = validate({ type: ["string", "null"] }, 42);

      expect(output).to.eql({
        valid: false,
        errors: [
          {
            absoluteKeywordLocation: "#/type",
            instanceLocation: "#"
          }
        ]
      });
    });

    test("valid", () => {
      const output = validate({ type: "string" }, "foo");
      expect(output).to.eql({ valid: true });
    });
  });

  describe("uniqueItems", () => {
    test("invalid", () => {
      const output = validate({ uniqueItems: true }, [1, 1]);

      expect(output).to.eql({
        valid: false,
        errors: [
          {
            absoluteKeywordLocation: "#/uniqueItems",
            instanceLocation: "#"
          }
        ]
      });
    });

    test("valid", () => {
      const output = validate({ uniqueItems: true }, [1, 2]);
      expect(output).to.eql({ valid: true });
    });
  });

  test("Multiple errors in schema", () => {
    const output = validate({
      properties: {
        foo: { type: "string" },
        bar: { type: "boolean" }
      },
      required: ["foo", "bar"]
    }, { foo: 42 });

    expect(output).to.eql({
      valid: false,
      errors: [
        {
          absoluteKeywordLocation: "#/properties",
          instanceLocation: "#"
        },
        {
          absoluteKeywordLocation: "#/properties/foo/type",
          instanceLocation: "#/foo"
        },
        {
          absoluteKeywordLocation: "#/required",
          instanceLocation: "#"
        }
      ]
    });
  });

  test("Deeply nested", () => {
    const output = validate({
      properties: {
        foo: {
          properties: {
            bar: { type: "boolean" }
          }
        }
      }
    }, { foo: { bar: 42 } });

    expect(output).to.eql({
      valid: false,
      errors: [
        {
          absoluteKeywordLocation: "#/properties",
          instanceLocation: "#"
        },
        {
          absoluteKeywordLocation: "#/properties/foo/properties",
          instanceLocation: "#/foo"
        },
        {
          absoluteKeywordLocation: "#/properties/foo/properties/bar/type",
          instanceLocation: "#/foo/bar"
        }
      ]
    });
  });
});
