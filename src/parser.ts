import * as ts from "typescript";
import * as vscode from "vscode";
import { Testable } from "./repo";

import AstNode = ts.Node;

const getCSuite = (node: AstNode): ts.CallExpression | null => {
    if (!ts.isExpressionStatement(node)) {
        return null;
    }
    const maybeCallExpression = node.expression;
    if (!ts.isCallExpression(maybeCallExpression)) {
        return null;
    }
    const maybeCSuite = maybeCallExpression.expression;
    if (!ts.isIdentifier(maybeCSuite) || maybeCSuite.text !== "csuite") {
        return null;
    }
    return maybeCallExpression;
};

export const findCSuites = (source: ts.SourceFile): ts.CallExpression[] =>{
    const cSuites: ts.CallExpression[] = [];
    source.forEachChild((node) => {
        const maybeCSuite = getCSuite(node);
        if (maybeCSuite !== null) {
            cSuites.push(maybeCSuite);
        }
    });
    return cSuites;
};

export const parse = (
    file: vscode.TextDocument,
    test: Testable,
    cb: (node: TestNode, parent: Testable) => Testable,
): void => {
    const rootAst = ts.createSourceFile(file.uri.path, file.getText(), ts.ScriptTarget.ES2020);

    // const resolveChild = (node: AstNode) => {
    //     if (node.kind === ts.SyntaxKind.CallExpression) {
    //         [];
    //     }
    //     console.dir(`${node.kind} ${node.getText()}`);
    //     node.forEachChild(f);
    // };

    const cSuites = findCSuites(rootAst);
    cSuites.forEach((c) => {
        const name: ts.Expression | undefined = c.arguments[0];
        if (name === undefined || !ts.isStringLiteral(name)) {
            return;
        }

        cb({name: name.text, type: "csuite"}, test);

    });
};

export interface TestNode {
    name: string;
    type: "file" | "csuite" | "describe" | "ctest";
}
