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
import type * as http from "../http.js";
import type * as labActions from "../labActions.js";
import type * as labs from "../labs.js";
import type * as labs_daytonaProvider from "../labs/daytonaProvider.js";
import type * as playground from "../playground.js";
import type * as rateLimits from "../rateLimits.js";
import type * as sparkFeedback from "../sparkFeedback.js";
import type * as sparks_schemas from "../sparks/schemas.js";
import type * as sparks_tools from "../sparks/tools.js";
import type * as sparks_validators from "../sparks/validators.js";
import type * as telemetry from "../telemetry.js";
import type * as trackActions from "../trackActions.js";
import type * as tracks from "../tracks.js";
import type * as tracks_schemas from "../tracks/schemas.js";
import type * as tracks_tools from "../tracks/tools.js";
import type * as tracks_validators from "../tracks/validators.js";
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
  http: typeof http;
  labActions: typeof labActions;
  labs: typeof labs;
  "labs/daytonaProvider": typeof labs_daytonaProvider;
  playground: typeof playground;
  rateLimits: typeof rateLimits;
  sparkFeedback: typeof sparkFeedback;
  "sparks/schemas": typeof sparks_schemas;
  "sparks/tools": typeof sparks_tools;
  "sparks/validators": typeof sparks_validators;
  telemetry: typeof telemetry;
  trackActions: typeof trackActions;
  tracks: typeof tracks;
  "tracks/schemas": typeof tracks_schemas;
  "tracks/tools": typeof tracks_tools;
  "tracks/validators": typeof tracks_validators;
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
