import * as vscode from "vscode";
import { parse } from "./parser";
import { Testable, TestableFile, TestableFunction, TestableService } from "./repo";
import { TestUiExecutor } from "./testOutputParser";

const repoItemIdToItem: {[itemId: string]: vscode.TestItem} = {};
const repoItemToTestable = new WeakMap<vscode.TestItem, Testable>();

export const getAllControllerTests = (controller: vscode.TestController): vscode.TestItem[] => {
    const tests: vscode.TestItem[] = [];
    controller.items.forEach((i) => {
        tests.push(i);
    });
    return tests;
};

export const registerDocumentTests = (
    controller: vscode.TestController,
    service: TestableService,
    file: TestableFile,
    document: vscode.TextDocument,
) => {
    let serviceItem = controller.items.get(service.getId());
    if (serviceItem === undefined) {
        serviceItem = controller.createTestItem(service.getId(), service.getName(), undefined);

        controller.items.add(serviceItem);
        repoItemIdToItem[serviceItem.id] = serviceItem;
        repoItemToTestable.set(serviceItem, service);
    }

    let fileItem = serviceItem.children.get(file.getId());
    if (fileItem === undefined) {
        fileItem = controller.createTestItem(file.getId(), file.getName(), file.file);

        serviceItem.children.add(fileItem);
        repoItemIdToItem[fileItem.id] = fileItem;
        repoItemToTestable.set(fileItem, file);
    }

    let sortCounter = 0; // to keep the view tests order similar to to the file
    parse(document, file, (node, parent) => {
        const parentTestItem = repoItemIdToItem[parent.getId()];
        if (parentTestItem === undefined) {
            throw new Error("parent should be present");
        }

        const nodeTest = TestableFunction.new(node, parent);
        let nodeTestItem = repoItemIdToItem[nodeTest.getId()];

        // test not seen before
        if (nodeTestItem === undefined) {
            nodeTestItem = controller.createTestItem(nodeTest.getId(), nodeTest.getName(), document.uri);
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

export const removeDocumentTests = (controller: vscode.TestController, document: vscode.TextDocument) => {
    const file = TestableFile.new(document.uri);
    if (file === null) {
        return;
    }

    const service = TestableService.new(document.uri);
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

export const runDocumentTests = async (
    run: vscode.TestRun,
    items: readonly vscode.TestItem[],
    token: vscode.CancellationToken,
): Promise<void> => {
    const executor = new TestUiExecutor(run);
    for (const item of items) {
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
