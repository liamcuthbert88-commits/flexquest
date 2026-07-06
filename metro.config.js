const { getDefaultConfig } = require("expo/metro-config");

const config = getDefaultConfig(__dirname);

/** three.js's package.json exports map ships two non-interoperable builds —
 * "import" -> build/three.module.js, "require" -> build/three.cjs — each
 * independently initializing three's internal global state. Metro's
 * package-exports resolution picks the condition matching each importer's
 * own syntax (ESM `import` vs CJS `require`), so whichever one of our files
 * uses a plain `import ... from "three"` lands on a different physical file
 * than a dependency (e.g. @react-three/fiber) that does `require("three")`
 * — two "instances" of three.js loaded, tripping its own runtime check
 * ("THREE.WARNING: Multiple instances of Three.js being imported").
 *
 * Forcing every resolution of the bare `three` specifier through the
 * "require" condition only (three.cjs) makes it irrelevant which import
 * syntax any given consumer uses — everyone lands on the same file. */
const defaultResolveRequest = config.resolver.resolveRequest;
config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (moduleName === "three") {
    return context.resolveRequest(
      { ...context, unstable_conditionNames: ["require"] },
      moduleName,
      platform
    );
  }
  return defaultResolveRequest
    ? defaultResolveRequest(context, moduleName, platform)
    : context.resolveRequest(context, moduleName, platform);
};

module.exports = config;
