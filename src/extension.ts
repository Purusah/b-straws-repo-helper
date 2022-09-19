import * as vscode from "vscode";
import { parse } from "./parser";
import { Testable, TestableFile, TestableFunction, TestableService } from "./repo";
import { TestExecutor } from "./testOutputParser";

const repoItemIdToItem: {[itemId: string]: vscode.TestItem} = {};
const repoItemToTestable = new WeakMap<vscode.TestItem, Testable>();

const addDocumentTests = (controller: vscode.TestController, service: TestableService, file: TestableFile) => {
    let serviceItem = controller.items.get(service.getId());
    if (serviceItem === undefined) {
        serviceItem = controller.createTestItem(service.getId(), service.getName(), undefined);

        controller.items.add(serviceItem);
        repoItemIdToItem[serviceItem.id] = serviceItem;
        repoItemToTestable.set(serviceItem, service);
    }

    let fileItem = serviceItem.children.get(file.getId());
    if (fileItem === undefined) {
        fileItem = controller.createTestItem(file.getId(), file.getName(), file.file.uri);

        serviceItem.children.add(fileItem);
        repoItemIdToItem[fileItem.id] = fileItem;
        repoItemToTestable.set(fileItem, file);
    }

    let sortCounter = 0; // to keep the view tests order similar to to the file
    parse(file.file, file, (node, parent) => {
        const parentTestItem = repoItemIdToItem[parent.getId()];
        if (parentTestItem === undefined) {
            throw new Error("parent should be present");
        }

        const nodeTest = TestableFunction.new(node, parent);
        let nodeTestItem = repoItemIdToItem[nodeTest.getId()];

        // test not seen before
        if (nodeTestItem === undefined) {
            nodeTestItem = controller.createTestItem(nodeTest.getId(), nodeTest.getName(), file.file.uri);
            nodeTestItem.sortText = String(sortCounter++);
            const testPosition = new vscode.Position(node.line, node.character);
            nodeTestItem.range = new vscode.Range(testPosition, testPosition);

            repoItemToTestable.set(nodeTestItem, nodeTest);
            parentTestItem.children.add(nodeTestItem);
            repoItemIdToItem[nodeTestItem.id] = nodeTestItem;

            return nodeTest;
        }

        repoItemToTestable.set(nodeTestItem, nodeTest);
        // test already exists and assigned to the correct parent
        if (nodeTestItem.parent?.id === parentTestItem.id) {
            return nodeTest;
        }

        // test was child of different parent
        nodeTestItem.parent?.children?.delete(nodeTestItem.id);
        parentTestItem.children.add(nodeTestItem);
        return nodeTest;
    });
};

const removeDocumentTests = (controller: vscode.TestController, document: vscode.TextDocument) => {
    const file = TestableFile.new(document);
    if (file === null) {
        return;
    }

    const service = TestableService.new(file);
    if (service === null) {
        return;
    }

    const serviceItem = repoItemIdToItem[service.getId()];
    if (serviceItem === undefined) {
        return;
    }

    const fileItem = serviceItem.children.get(file.getId());
    if (fileItem === undefined) {
        return;
    }

    // TODO move to separate function
    const cleanItems = (i: vscode.TestItem) => {
        i.children.forEach((c) => {
            cleanItems(c);
        });

        i?.parent?.children.delete(i.id);
        delete repoItemIdToItem[i.id];
        repoItemToTestable.delete(i);
    };

    cleanItems(fileItem);

    serviceItem.children.delete(file.getId());
    delete repoItemIdToItem[file.getId()];
    repoItemToTestable.delete(fileItem);

    if (serviceItem.children.size === 0) {
        controller.items.delete(service.getId());
        delete repoItemIdToItem[service.getId()];
        repoItemToTestable.delete(serviceItem);
    }
};

const getAllControllerTests = (controller: vscode.TestController): vscode.TestItem[] => {
    const tests: vscode.TestItem[] = [];
    controller.items.forEach((i) => {
        tests.push(i);
    });
    return tests;
};

const runDocumentTests = async (
    controller: vscode.TestController,
    request: vscode.TestRunRequest,
    token: vscode.CancellationToken,
): Promise<void> => {
    const run = controller.createTestRun(request, undefined, false);

    const executor = new TestExecutor(run);
    for (const item of request.include ?? getAllControllerTests(controller)) {
        if (token.isCancellationRequested) {
            continue;
        }

        const testable = repoItemToTestable.get(item);
        if (!testable) {
            run.skipped(item);
            continue;
        }
        run.enqueued(item);

        executor.start(item, testable);
    }

    await executor.wait(token);
    run.end();
};

const onOpenDocument = (controller: vscode.TestController, document: vscode.TextDocument) => {
    const file = TestableFile.new(document);
    if (file === null) {
        return;
    }

    const service = TestableService.new(file);
    if (service === null) {
        return;
    }

    addDocumentTests(controller, service, file);
};

const onUpdateDocument = (controller: vscode.TestController, event: vscode.TextDocumentChangeEvent) => {
    const file = TestableFile.new(event.document);
    if (file === null) {
        return;
    }

    const service = TestableService.new(file);
    if (service === null) {
        return;
    }

    removeDocumentTests(controller, event.document);
    addDocumentTests(controller, service, file);
};

const onUpdateDocumentThrottled = (controller: vscode.TestController): (e: vscode.TextDocumentChangeEvent) => void => {
    let lastCalled = 0;

    return (e: vscode.TextDocumentChangeEvent) => {
        const now = new Date().getTime();
        if(now < lastCalled + 1000) {
            return;
        }
        lastCalled = now;
        onUpdateDocument(controller, e);
    };
};

export async function activate(context: vscode.ExtensionContext) {
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

    await vscode.commands.executeCommand("testing.clearTestResults");
    vscode.window.visibleTextEditors.forEach((e) => {
        onOpenDocument(controller, e.document);
    });

    // update available tests on
    context.subscriptions.push(
        vscode.workspace.onDidOpenTextDocument(e => onOpenDocument(controller, e)),
        vscode.workspace.onDidChangeTextDocument(onUpdateDocumentThrottled(controller)),
        vscode.workspace.onDidCloseTextDocument(e => removeDocumentTests(controller, e)),
    );
}

export function deactivate() {}
