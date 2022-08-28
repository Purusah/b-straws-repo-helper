import * as vscode from "vscode";
import { parse } from "./parser";
import { repository, Testable } from "./repo";
import { TestExecutor, TestOutputParser } from "./testOutputParser";

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
        true
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

    parse(document, file, (node, parent) => {
        const parentTestItem = controller.items.get(parent.getId());
        if (parentTestItem === undefined) {
            throw new Error("parent should be present");
        }

        const nodeTest = Testable.newTestNode(node, parent);
        let nodeTestItem = controller.items.get(nodeTest.getId());
        if (nodeTestItem) {
            parentTestItem.children.add(nodeTestItem);

            const existingNodeTest = repository.get(nodeTestItem);
            if (existingNodeTest) {
                return existingNodeTest;
            }

            repository.set(nodeTestItem, nodeTest);
            return nodeTest;
        }

        nodeTestItem = controller.createTestItem(nodeTest.getId(), nodeTest.getName(), undefined);
        parentTestItem.children.add(nodeTestItem);
        return nodeTest;
    });

    item.canResolveChildren = true;
    controller.items.add(item);
    repository.set(item, file);
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
    controller.items.delete(file.getId());
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
    token: vscode.CancellationToken
): Promise<void> {
    const run = controller.createTestRun(request);

    const executor = new TestExecutor(run);
    for (const t of request.include ?? getAllControllerTests(controller)) {
        if (token.isCancellationRequested) {
            run.skipped(t);
            continue;
        }

        const file = repository.get(t);
        if (!file) {
            run.skipped(t);
            continue;
        }
        run.enqueued(t);

        executor.start(t, file, );
    }

    await executor.wait(token);
    run.end();
}

export function deactivate() {}
