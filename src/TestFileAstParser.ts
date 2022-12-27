import * as ts from "typescript";
import * as vscode from "vscode";
import { TestableFunction, TestableFile } from "./repo";
import { allowedTestIdentifiers, TestKind } from "./TestKindHelper";

export class TestFileAstParser {
    static getTestFunctions = (source: ts.Node, kind: TestKind): ts.CallExpression[] => {
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
            if (!ts.isIdentifier(maybeTestFunction) || !allowedTestIdentifiers[kind].includes(maybeTestFunction.text)) {
                return;
            }

            testFunctions.push(maybeCallExpression);
        });
        return testFunctions;
    };

    static _parse = (
        source: ts.SourceFile,
        root: ts.Node,
        test: TestableFunction | TestableFile,
        kind: TestKind,
        cb: ParserCallback,
    ): void => {
        const functions = TestFileAstParser.getTestFunctions(root, kind);

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
            const {line, character} = source.getLineAndCharacterOfPosition(testArrowFunc.pos);
            const suite = cb({name: testNameLiteral.text, line, character}, test);
            TestFileAstParser._parse(source, testArrowFunc.body, suite, kind, cb);
        });
    };

    public static parse = (
        document: vscode.TextDocument,
        test: TestableFile,
        cb: ParserCallback,
    ): void => {
        const source = ts.createSourceFile(document.uri.path, document.getText(), ts.ScriptTarget.ES2020);
        TestFileAstParser._parse(source, source, test, test.kind, cb);
    };
}

type ParserCallback = (node: TestNode, parent: TestableFunction | TestableFile) => TestableFunction;

export interface TestNode {
    name: string;
    line: number;
    character: number;
}
