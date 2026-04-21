const fs = require("node:fs");
const path = require("node:path");
const parser = require("@babel/parser");
const traverse = require("@babel/traverse").default;
const t = require("@babel/types");
const generate = require("@babel/generator").default;

const MARKER_FN = "__nextrayMark";
const RUNTIME_SOURCE = "@saadeh/nextray/runtime";

module.exports = function nextrayLoader(source, inputSourceMap) {
  if (typeof this.cacheable === "function") {
    this.cacheable();
  }

  const callback = this.async();
  const options = typeof this.getOptions === "function" ? this.getOptions() : {};
  const resourcePath = this.resourcePath || "";

  if (!shouldProcess(resourcePath, options)) {
    callback(null, source, inputSourceMap);
    return;
  }

  let ast;
  try {
    ast = parser.parse(source, {
      sourceType: "module",
      plugins: ["jsx", "typescript"]
    });
  } catch (error) {
    this.emitWarning(
      new Error(`[nextray] skipped ${resourcePath}: parser error: ${error.message}`)
    );
    callback(null, source, inputSourceMap);
    return;
  }

  const kind = detectKind(ast.program, source, resourcePath);
  const projectRoot = options.projectRoot || this.rootContext || process.cwd();
  const relativeFile = toPosixPath(path.relative(projectRoot, stripResourceQuery(resourcePath)));
  const absoluteFile = toPosixPath(stripResourceQuery(resourcePath));

  let wrappedCount = 0;

  traverse(ast, {
    ReturnStatement(returnPath) {
      const functionPath = returnPath.getFunctionParent();
      if (
        !functionPath ||
        !isTopLevelFunction(functionPath) ||
        !isSupportedFunction(functionPath.node)
      ) {
        return;
      }

      const argument = returnPath.node.argument;
      if (!argument || !isJsx(argument) || isAlreadyMarked(argument)) {
        return;
      }

      const componentName = getFunctionName(functionPath) || "Anonymous";
      returnPath.node.argument = createMarkerCall(kind, componentName, relativeFile, absoluteFile, argument);
      wrappedCount += 1;
    },
    Function(functionPath) {
      if (!isTopLevelFunction(functionPath) || !isSupportedFunction(functionPath.node)) {
        return;
      }

      const bodyNode = functionPath.node.body;
      if (!isJsx(bodyNode)) {
        return;
      }

      const componentName = getFunctionName(functionPath) || "Anonymous";
      functionPath.node.body = t.blockStatement([
        t.returnStatement(createMarkerCall(kind, componentName, relativeFile, absoluteFile, bodyNode))
      ]);
      wrappedCount += 1;
    }
  });

  if (wrappedCount === 0) {
    callback(null, source, inputSourceMap);
    return;
  }

  ensureRuntimeImport(ast.program);

  const output = generate(
    ast,
    {
      sourceMaps: Boolean(this.sourceMap),
      sourceFileName: resourcePath,
      retainLines: true
    },
    source
  );

  callback(null, output.code, output.map || inputSourceMap);
};

function shouldProcess(resourcePath, options) {
  const normalized = toPosixPath(stripResourceQuery(resourcePath));

  if (!normalized.endsWith(".tsx") && !normalized.endsWith(".jsx")) {
    return false;
  }

  if (normalized.includes("/node_modules/") || normalized.includes("/.next/")) {
    return false;
  }

  const includePaths = Array.isArray(options.includePaths) ? options.includePaths : [];
  if (includePaths.length > 0) {
    const resolved = includePaths.map((entry) => toPosixPath(path.resolve(entry)));
    const insideIncludedRoot = resolved.some(
      (includePath) => normalized === includePath || normalized.startsWith(`${includePath}/`)
    );

    if (!insideIncludedRoot) {
      return false;
    }
  }

  const excludePaths = Array.isArray(options.excludePaths) ? options.excludePaths : [];
  if (excludePaths.length > 0) {
    const resolved = excludePaths.map((entry) => toPosixPath(path.resolve(entry)));
    const insideExcludedRoot = resolved.some(
      (excludePath) => normalized === excludePath || normalized.startsWith(`${excludePath}/`)
    );

    if (insideExcludedRoot) {
      return false;
    }
  }

  return true;
}

function detectKind(program, transformedSource, resourcePath) {
  const fromTransformed = detectKindInProgram(program);
  if (fromTransformed) {
    return fromTransformed;
  }

  if (typeof transformedSource === "string") {
    if (transformedSource.includes("__next_internal_client_entry_do_not_use__")) {
      return "client";
    }

    if (transformedSource.includes("registerClientReference")) {
      return "client";
    }
  }

  const fromOriginal = detectKindFromOriginalSource(resourcePath);
  if (fromOriginal) {
    return fromOriginal;
  }

  return "server";
}

function detectKindInProgram(program) {
  if (Array.isArray(program.directives)) {
    for (const directive of program.directives) {
      if (directive.value?.value === "use client") {
        return "client";
      }

      if (directive.value?.value === "use server") {
        return "server";
      }
    }
  }

  for (const statement of program.body) {
    if (!t.isExpressionStatement(statement) || !t.isStringLiteral(statement.expression)) {
      continue;
    }

    if (statement.expression.value === "use client") {
      return "client";
    }

    if (statement.expression.value === "use server") {
      return "server";
    }
  }

  return null;
}

function detectKindFromOriginalSource(resourcePath) {
  const filePath = stripResourceQuery(resourcePath);
  if (!filePath) {
    return null;
  }

  try {
    const originalSource = fs.readFileSync(filePath, "utf8");

    if (hasTopDirective(originalSource, "use client")) {
      return "client";
    }

    if (hasTopDirective(originalSource, "use server")) {
      return "server";
    }
  } catch {
    return null;
  }

  return null;
}

function hasTopDirective(source, directive) {
  const escaped = directive.replace(/[-/\\^$*+?.()|[\]{}]/g, "\\$&");
  const pattern = new RegExp(
    `^(?:\\uFEFF)?(?:\\s|\\/\\*[\\s\\S]*?\\*\\/|\\/\\/[^\\n]*\\n)*[\"']${escaped}[\"']\\s*;?`
  );

  const header = source.slice(0, 4096);
  return pattern.test(header);
}

function isTopLevelFunction(functionPath) {
  return !functionPath.findParent((candidate) => candidate !== functionPath && candidate.isFunction());
}

function isSupportedFunction(node) {
  return (
    t.isFunctionDeclaration(node) ||
    t.isFunctionExpression(node) ||
    t.isArrowFunctionExpression(node)
  );
}

function isJsx(node) {
  return t.isJSXElement(node) || t.isJSXFragment(node);
}

function isAlreadyMarked(node) {
  return (
    t.isCallExpression(node) &&
    t.isIdentifier(node.callee) &&
    node.callee.name === MARKER_FN
  );
}

function getFunctionName(functionPath) {
  const node = functionPath.node;

  if ((t.isFunctionDeclaration(node) || t.isFunctionExpression(node)) && node.id?.name) {
    return node.id.name;
  }

  let current = functionPath.parentPath;
  while (current) {
    if (current.isVariableDeclarator() && t.isIdentifier(current.node.id)) {
      return current.node.id.name;
    }

    if (current.isAssignmentExpression() && t.isIdentifier(current.node.left)) {
      return current.node.left.name;
    }

    if (current.isExportDefaultDeclaration()) {
      return "default";
    }

    if (current.isProgram()) {
      break;
    }

    current = current.parentPath;
  }

  return null;
}

function createMarkerCall(kind, name, file, absoluteFile, expression) {
  return t.callExpression(t.identifier(MARKER_FN), [
    t.stringLiteral(kind),
    t.stringLiteral(name),
    t.stringLiteral(file),
    t.stringLiteral(absoluteFile),
    expression
  ]);
}

function ensureRuntimeImport(program) {
  for (const statement of program.body) {
    if (!t.isImportDeclaration(statement)) {
      continue;
    }

    if (statement.source.value !== RUNTIME_SOURCE) {
      continue;
    }

    const hasNamedImport = statement.specifiers.some(
      (specifier) =>
        t.isImportSpecifier(specifier) &&
        t.isIdentifier(specifier.imported) &&
        specifier.imported.name === MARKER_FN
    );

    if (!hasNamedImport) {
      statement.specifiers.push(
        t.importSpecifier(t.identifier(MARKER_FN), t.identifier(MARKER_FN))
      );
    }

    return;
  }

  const declaration = t.importDeclaration(
    [t.importSpecifier(t.identifier(MARKER_FN), t.identifier(MARKER_FN))],
    t.stringLiteral(RUNTIME_SOURCE)
  );

  const body = program.body;
  let insertIndex = 0;

  while (insertIndex < body.length) {
    const statement = body[insertIndex];
    const isDirective =
      t.isExpressionStatement(statement) &&
      t.isStringLiteral(statement.expression) &&
      typeof statement.directive === "string";

    if (isDirective || t.isImportDeclaration(statement)) {
      insertIndex += 1;
      continue;
    }

    break;
  }

  body.splice(insertIndex, 0, declaration);
}

function stripResourceQuery(resourcePath) {
  const index = resourcePath.indexOf("?");
  if (index === -1) {
    return resourcePath;
  }

  return resourcePath.slice(0, index);
}

function toPosixPath(value) {
  return value.split(path.sep).join("/");
}
