import {
  AbilityBuilder,
  createMongoAbility,
  ForbiddenError,
  type MongoAbility,
  type RawRuleOf,
} from "@casl/ability";

import type { AuthzAction } from "./actions.js";
import type { AuthzSubject } from "./subjects.js";

export type FastiflyAbilityTuple = [AuthzAction, AuthzSubject];
export type FastiflyAbility = MongoAbility<FastiflyAbilityTuple>;
export type FastiflyRawRule = RawRuleOf<FastiflyAbility>;
export type FastiflyAbilityBuilder = AbilityBuilder<FastiflyAbility>;

export function createFastiflyAbility(rules: readonly FastiflyRawRule[] = []): FastiflyAbility {
  return createMongoAbility<FastiflyAbility>([...rules]);
}

export function createFastiflyAbilityBuilder(): FastiflyAbilityBuilder {
  return new AbilityBuilder<FastiflyAbility>(createMongoAbility);
}

export function assertCan(
  ability: FastiflyAbility,
  action: AuthzAction,
  subject: AuthzSubject,
): void {
  ForbiddenError.from(ability).throwUnlessCan(action, subject);
}
