import path from "node:path";
import { fileURLToPath } from "node:url";

const loaderPath = fileURLToPath(new URL("./loader.cjs", import.meta.url));
const TURBOPACK_RULE_GLOB = "*.{tsx,jsx}";

function resolvePaths(projectDir, paths, fallback) {
  const entries = Array.isArray(paths) && paths.length > 0 ? paths : fallback;
  return entries.map((entry) =>
    path.isAbsolute(entry) ? entry : path.resolve(projectDir, entry)
  );
}

function createLoaderOptions(projectRoot, include, exclude) {
  return {
    projectRoot,
    includePaths: resolvePaths(projectRoot, include, [projectRoot]),
    excludePaths: resolvePaths(projectRoot, exclude, [])
  };
}

function mergeTurbopackRule(existingRule, newRule) {
  if (!existingRule) {
    return newRule;
  }

  if (Array.isArray(existingRule)) {
    return [...existingRule, newRule];
  }

  return [existingRule, newRule];
}

export function withNextray(nextConfig = {}, options = {}) {
  const {
    enabled = true,
    include = ["."],
    exclude = []
  } = options;

  const projectRoot = process.cwd();
  const loaderOptions = createLoaderOptions(projectRoot, include, exclude);
  const userWebpack = nextConfig.webpack;

  const nextTurbopackConfig = { ...(nextConfig.turbopack ?? {}) };

  if (enabled) {
    const currentRules = { ...(nextTurbopackConfig.rules ?? {}) };
    const nextrayRule = {
      condition: "development",
      loaders: [{ loader: loaderPath, options: loaderOptions }]
    };

    currentRules[TURBOPACK_RULE_GLOB] = mergeTurbopackRule(
      currentRules[TURBOPACK_RULE_GLOB],
      nextrayRule
    );

    nextTurbopackConfig.rules = currentRules;
  }

  return {
    ...nextConfig,
    turbopack: nextTurbopackConfig,
    webpack(config, context) {
      const nextWebpackConfig =
        typeof userWebpack === "function" ? userWebpack(config, context) || config : config;

      if (enabled && context.dev) {
        nextWebpackConfig.module.rules.unshift({
          test: /\.[jt]sx$/,
          include: loaderOptions.includePaths,
          exclude: [/node_modules/, /\.next/],
          enforce: "pre",
          use: [
            {
              loader: loaderPath,
              options: loaderOptions
            }
          ]
        });
      }

      return nextWebpackConfig;
    }
  };
}
