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
 * An earlier attempt delegated back to `context.resolveRequest` with an
 * `unstable_conditionNames` override on a spread-copied context — Metro
 * silently ignored it (verified: the resulting bundle still contained both
 * three.module.js and three.core.js). Returning a `sourceFile` resolution
 * directly, bypassing condition/exports resolution entirely, actually
 * works — every resolution of the bare `three` specifier lands on the
 * exact same absolute file regardless of which import syntax the consumer
 * used. */
const threeCjsPath = require.resolve("three");
const defaultResolveRequest = config.resolver.resolveRequest;
config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (moduleName === "three") {
    return { type: "sourceFile", filePath: threeCjsPath };
  }
  return defaultResolveRequest
    ? defaultResolveRequest(context, moduleName, platform)
    : context.resolveRequest(context, moduleName, platform);
};

module.exports = config;
