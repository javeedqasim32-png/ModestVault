import { cache } from "react";
import { auth } from "@/auth";

// React's `cache()` memoizes the result of `auth()` within a single render
// pass, so the Navbar, UnpaidEarningsBanner, and the page itself can all call
// `getCachedSession()` and only one underlying `auth()` (and therefore one
// User.findUnique in the JWT callback) actually runs. Without this each
// caller pays its own DB round-trip on every page load.
export const getCachedSession = cache(auth);
