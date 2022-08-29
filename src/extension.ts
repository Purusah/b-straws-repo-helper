import * as vscode from "vscode";
import { parse } from "./parser";
import { repository, Testable } from "./repo";
import { TestExecutor } from "./testOutputParser";

const testControllerItems: {[itemId: string]: vscode.TestItem} = {};

export function activate(context: vscode.ExtensionContext) {
    const controller = vscode.tests.createTestController(
        "compTests",
        "B Comp Tests",
    );
    context.subscriptions.push(controller);

    controller.createRunProfile(
        "Run Comp Tests",
        vscode.TestRunProfileKind.Run,
        (req, token) => runDocumentTests(controller, req, token),
        true,
    );

    vscode.window.visibleTextEditors.forEach((e) => {
        addDocumentTests(controller, e.document);
    });

    // update available tests on
    context.subscriptions.push(
        vscode.workspace.onDidOpenTextDocument(e => addDocumentTests(controller, e)),
        vscode.workspace.onDidChangeTextDocument(e => addDocumentTests(controller, e.document)),
        vscode.workspace.onDidCloseTextDocument(e => removeDocumentTests(controller, e)),
    );
}

function isDocumentTestFile(e: vscode.TextDocument): boolean {
    if (e.uri.scheme !== "file") {
        return false;
    }

    if (!e.uri.path.endsWith("-comp.ts")) {
        return false;
    }

    return true;
};

function addDocumentTests(controller: vscode.TestController, document: vscode.TextDocument) {
    if (!isDocumentTestFile(document)) {
        return;
    }

    const folder = vscode.workspace.getWorkspaceFolder(document.uri);
    if (!folder) {
        return;
    }

    const file = Testable.newTestFile(folder, document);
    const existingTestFileItem = controller.items.get(file.getId());
    if (existingTestFileItem !== undefined) {
        return existingTestFileItem;
    }

    const item = controller.createTestItem(file.getId(), file.getName(), document.uri);
    controller.items.add(item);
    testControllerItems[item.id] = item;
    repository.set(item, file);

    let sortCounter = 0; // to keep the view tests order similar to to the file
    parse(document, file, (node, parent) => {
        const parentTestItem = testControllerItems[parent.getId()];
        if (parentTestItem === undefined) {
            throw new Error("parent should be present");
        }

        const nodeTest = Testable.newTestNode(node, parent);
        let nodeTestItem = testControllerItems[nodeTest.getId()];

        // test not seen before
        if (nodeTestItem === undefined) {
            nodeTestItem = controller.createTestItem(nodeTest.getId(), nodeTest.getName(), document.uri);
            nodeTestItem.sortText = String(sortCounter++);
            const testPosition = new vscode.Position(node.line, node.character);
            nodeTestItem.range = new vscode.Range(testPosition, testPosition);

            repository.set(nodeTestItem, nodeTest);
            parentTestItem.children.add(nodeTestItem);
            testControllerItems[nodeTestItem.id] = nodeTestItem;

            return nodeTest;
        }

        repository.set(nodeTestItem, nodeTest);
        // test already exists and assigned to the correct parent
        if (nodeTestItem.parent?.id === parentTestItem.id) {
            return nodeTest;
        }

        // test was child of different parent
        nodeTestItem.parent?.children?.delete(nodeTestItem.id);
        parentTestItem.children.add(nodeTestItem);
        return nodeTest;
    });
}

function removeDocumentTests(controller: vscode.TestController, document: vscode.TextDocument) {
    if (!isDocumentTestFile(document)) {
        return;
    }

    const folder = vscode.workspace.getWorkspaceFolder(document.uri);
    if (!folder) {
        return;
    }
    const file = Testable.newTestFile(folder, document);
    const item = testControllerItems[file.getId()];

    // clean in memory storages
    controller.items.delete(file.getId());

    // TODO move to separate function
    const cleanItems = (i: vscode.TestItem) => {
        i.children.forEach((c) => {
            cleanItems(c);
        });

        i?.parent?.children.delete(i.id);
        delete testControllerItems[i.id];
        repository.delete(i);
    };

    cleanItems(item);
}

function getAllControllerTests(controller: vscode.TestController): vscode.TestItem[] {
    const tests: vscode.TestItem[] = [];
    controller.items.forEach((i) => {
        tests.push(i);
    });
    return tests;
}

async function runDocumentTests(
    controller: vscode.TestController,
    request: vscode.TestRunRequest,
    token: vscode.CancellationToken,
): Promise<void> {
    const run = controller.createTestRun(request, undefined, false);

    const executor = new TestExecutor(run);
    for (const item of request.include ?? getAllControllerTests(controller)) {
        if (token.isCancellationRequested) {
            run.skipped(item);
            continue;
        }

        const testable = repository.get(item);
        if (!testable) {
            run.skipped(item);
            continue;
        }
        run.enqueued(item);

        executor.start(item, testable);
    }

    await executor.wait(token);
    run.end();
}

export function deactivate() {}
