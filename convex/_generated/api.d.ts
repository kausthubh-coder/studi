/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as agent from "../agent.js";
import type * as billing from "../billing.js";
import type * as billingActions from "../billingActions.js";
import type * as chat from "../chat.js";
import type * as chatActions from "../chatActions.js";
import type * as codeSparkActions from "../codeSparkActions.js";
import type * as codeSparkRuntime from "../codeSparkRuntime.js";
import type * as codeSparks from "../codeSparks.js";
import type * as http from "../http.js";
import type * as playground from "../playground.js";
import type * as rateLimits from "../rateLimits.js";
import type * as sparks_schemas from "../sparks/schemas.js";
import type * as sparks_tools from "../sparks/tools.js";
import type * as sparks_validators from "../sparks/validators.js";
import type * as telemetry from "../telemetry.js";
import type * as textModelProvider from "../textModelProvider.js";
import type * as waitlist from "../waitlist.js";
import type * as waitlistActions from "../waitlistActions.js";
import type * as waitlistPublic from "../waitlistPublic.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  agent: typeof agent;
  billing: typeof billing;
  billingActions: typeof billingActions;
  chat: typeof chat;
  chatActions: typeof chatActions;
  codeSparkActions: typeof codeSparkActions;
  codeSparkRuntime: typeof codeSparkRuntime;
  codeSparks: typeof codeSparks;
  http: typeof http;
  playground: typeof playground;
  rateLimits: typeof rateLimits;
  "sparks/schemas": typeof sparks_schemas;
  "sparks/tools": typeof sparks_tools;
  "sparks/validators": typeof sparks_validators;
  telemetry: typeof telemetry;
  textModelProvider: typeof textModelProvider;
  waitlist: typeof waitlist;
  waitlistActions: typeof waitlistActions;
  waitlistPublic: typeof waitlistPublic;
}>;

/**
 * A utility for referencing Convex functions in your app's public API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
export declare const api: FilterApi<
  typeof fullApi,
  FunctionReference<any, "public">
>;

/**
 * A utility for referencing Convex functions in your app's internal API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = internal.myModule.myFunction;
 * ```
 */
export declare const internal: FilterApi<
  typeof fullApi,
  FunctionReference<any, "internal">
>;

export declare const components: {
  agent: import("@convex-dev/agent/_generated/component.js").ComponentApi<"agent">;
  rateLimiter: import("@convex-dev/rate-limiter/_generated/component.js").ComponentApi<"rateLimiter">;
};
