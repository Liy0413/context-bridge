#!/usr/bin/env node

// Keep the distributable plugin entry point small. The shared implementation is
// also used by the project-hook installer, so both installation routes behave
// identically.
import "../scripts/hooks/context-bridge-semi-auto.mjs";
