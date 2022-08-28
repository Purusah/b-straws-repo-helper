import * as ts from "typescript";
import * as vscode from "vscode";
import { Testable } from "./repo";

const testIdentifiers = ["ctest", "describe", "csuite"];

const getTestFunctions = (source: ts.Node): ts.CallExpression[] => {
    const testFunctions: ts.CallExpression[] = [];
    source.forEachChild((node) => {
        if (!ts.isExpressionStatement(node)) {
            return;
        }
        const maybeCallExpression = node.expression;
        if (!ts.isCallExpression(maybeCallExpression)) {
            return;
        }
        const maybeTestFunction = maybeCallExpression.expression;
        if (!ts.isIdentifier(maybeTestFunction) || !testIdentifiers.includes(maybeTestFunction.text)) {
            return;
        }

        testFunctions.push(maybeCallExpression);
    });
    return testFunctions;
};

const _parse = (
    root: ts.Node,
    test: Testable,
    cb: (node: TestNode, parent: Testable) => Testable,
): void => {
    const functions = getTestFunctions(root);

    let testNameLiteral: ts.Expression | undefined;
    let testArrowFunc: ts.Expression | undefined;
    functions.forEach((c) => {
        if (c.arguments.length === 2) {
            [testNameLiteral, testArrowFunc] = c.arguments;
        }
        if (c.arguments.length === 3) {
            [testNameLiteral, , testArrowFunc] = c.arguments;
        }
        if (
            testNameLiteral === undefined
            || testArrowFunc === undefined
            || !ts.isStringLiteral(testNameLiteral)
            || !ts.isArrowFunction(testArrowFunc)
        ) {
            return;
        }
        const suite = cb({name: testNameLiteral.text}, test);
        _parse(testArrowFunc.body, suite, cb);

    });
};

export const parse = (
    code: vscode.TextDocument,
    test: Testable,
    cb: (node: TestNode, parent: Testable) => Testable,
): void => {
    const rootAst = ts.createSourceFile(code.uri.path, code.getText(), ts.ScriptTarget.ES2020);
    _parse(rootAst, test, cb);
};

export interface TestNode {
    name: string;
}
