# JSON Schema (lite)

**_NOT FOR PRODUCTION USE_**

This is a minimal implementation of JSON Schema 2020-12 with a couple of the
more complex features left out. This implementation exists solely to facilitate
the qualification task for the JSON Schema GSoC project [Better JSON Schema
Errors](https://github.com/json-schema-org/community/issues/870) project. Do not
use it in production. It will not be maintained or supported.

## Qualification Task

There's no better way to get familiar with the JSON Schema output format than to
implement it yourself. This implementation currently implements the Flag output
format. Your task is to update it to support either the Basic or Detailed output
formats. You must include `valid`, `absoluteKeywordLocation`, and
`instanceLocation`. Because we aren't implementing the Verbose output format,
you don't need to support `annotations`/`annotation`. You don't need to support
`error` because we're going to ignore messages from the implementation anyway.
`keywordLocation` is optional because I can't see any reason we'd use it. **You
must include output format tests to show that your implementation works
including coverage for all implemented keywords. This is in addition to the
validation tests that I provided.**

To submit your qualification task, use `npm pack` and DM it to me. I will
provide one and only one review for each candidate, so make sure you're ready
when you submit. You can't fail the qualification task. As long as you submit
something, I'll consider your application. However, I will strongly take into
consideration the quality of your submission when evaluating applications.

This project uses ESLint. I encourage you to install an ESLint plugin in your
editor to get feedback in real time. ESLint is also used for code style checks,
but it doesn't check everything, so make an effort to match my code style when
making changes.

There are three scripts you should make sure that you are passing before
submitting.

- `npm test`
- `npm run lint`
- `npm run type-check`

I strongly encourage you to turn off your AI coding assistants for this
exercise. They tend to generate very low quality code. Code that works is just
the beginning. It also needs to be maintainable. Sloppy code hides bugs, is hard
to maintain, and slows down progress in the long term. This may be throw away
code that we're never going to build on later, but remember that part of the
goal of this task is to demonstrate your ability to write quality code for a
project that will need to evolve and be maintained over the several next years.

## About the Implementation

Unsupported features and keywords
- Embedded schemas
- `$anchor`
- `$dynamicRef`/`$dynamicAnchor`
- `unevaluatedProperties`/`unevaluatedItems`
- `format` assertion
- Annotations
- Custom dialect/vocabularies/keywords
- Older dialects
- Retrieving files from the file system or the web

### API

* `validate(schema: Json, instance: Json) => Output`
* `registerSchema(schema: Json, uri: string) => void`

The `Json` type represents any JavaScript value that is compatible with JSON.

The `Output` type represents the Flag output format. It includes the `valid`
property, but no `errors`.

### Example Usage

```javascript
import { validate } from "../src/index.js";

/**
 * @import { Json } from "./src/jsonast.d.ts"
 */

/** @type Json */
const schema = {
  $ref: "#/$defs/a",
  $defs: {
    a: { type: "number" }
  }
};
const instance = true;
const output = validate(schema, instance);
console.log("valid", output.valid);
```
