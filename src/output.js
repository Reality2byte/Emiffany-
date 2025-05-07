/**
 * @import { JsonNode } from "./jsonast.d.ts"
 */


export class Output {
  valid;
  instanceLocation;
  absoluteKeywordLocation;
  errors;

  /**
   * @param {boolean} valid
   * @param {JsonNode} keywordNode
   * @param {JsonNode} instanceNode
   * @param {Output[]} [errors]
   */
  constructor(valid, keywordNode, instanceNode, errors) {
    this.valid = valid;
    this.absoluteKeywordLocation = keywordNode.location;
    this.instanceLocation = instanceNode.location;

    if (errors) {
      this.errors = errors;
    }
  }
}
