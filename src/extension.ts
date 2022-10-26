import * as vscode from "vscode";
import { TestTerminalExecutor } from "./executor";
import { Testable, TestableFile, TestableFolder, TestableService } from "./repo";
import { getAllControllerTests, registerDocumentTests, removeDocumentTests, runDocumentTests } from "./view";

const onCommandRunUriTests = (uri: vscode.Uri | vscode.Uri[]) => {
    let testable: Testable | null = null;

    // explorer/context menu returns array
    if (Array.isArray(uri)) {
        if (uri.length === 0) {
            return;
        }
        // only one path is passed here (right clicked context menu)
        uri = uri[0];
    }

    const file = TestableFile.new(uri);
    if (file === null) {
        // only explorer/context menu returns folder
        testable = TestableFolder.new(uri);
    } else {
        testable = file;
    }

    if (testable === null) {
        return;
    }
    const executor = new TestTerminalExecutor();
    executor.start(testable);
};

const onEventOpenDocument = (controller: vscode.TestController, document: vscode.TextDocument) => {
    const service = TestableService.new(document.uri);
    if (service === null) {
        return;
    }

    const file = TestableFile.new(document.uri);
    if (file === null) {
        return;
    }

    registerDocumentTests(controller, service, file, document);
};

const onEventUpdateDocument = (controller: vscode.TestController): (e: vscode.TextDocumentChangeEvent) => void => {
    let lastCalled = 0;

    const _onEventUpdateDocument = (event: vscode.TextDocumentChangeEvent) => {
        const file = TestableFile.new(event.document.uri);
        if (file === null) {
            return;
        }

        const service = TestableService.new(event.document.uri);
        if (service === null) {
            return;
        }

        removeDocumentTests(controller, event.document);
        registerDocumentTests(controller, service, file, event.document);
    };

    return (e: vscode.TextDocumentChangeEvent) => {
        const now = new Date().getTime();
        if(now < lastCalled + 1000) {
            return;
        }
        lastCalled = now;
        _onEventUpdateDocument(e);
    };
};

const onRunDocumentTests = async (
    controller: vscode.TestController,
    request: vscode.TestRunRequest,
    token: vscode.CancellationToken,
): Promise<void> => {
    const run = controller.createTestRun(request, undefined, false);
    const items = request.include ?? getAllControllerTests(controller);
    await runDocumentTests(run, items, token);
};

export async function activate(context: vscode.ExtensionContext) {
    // register test controller
    const controller = vscode.tests.createTestController(
        "compTests",
        "B Comp Tests",
    );
    context.subscriptions.push(controller);

    controller.createRunProfile(
        "Run Comp Tests",
        vscode.TestRunProfileKind.Run,
        (req, token) => onRunDocumentTests(controller, req, token),
        true,
    );

    await vscode.commands.executeCommand("testing.clearTestResults");
    vscode.window.visibleTextEditors.forEach((e) => {
        onEventOpenDocument(controller, e.document);
    });

    // subscribe to file changes
    context.subscriptions.push(
        vscode.workspace.onDidOpenTextDocument(e => onEventOpenDocument(controller, e)),
        vscode.workspace.onDidChangeTextDocument(onEventUpdateDocument(controller)),
        vscode.workspace.onDidCloseTextDocument(e => removeDocumentTests(controller, e)),
    );

    // register commands
    context.subscriptions.push(vscode.commands.registerCommand("bRepoHelper.runTests", onCommandRunUriTests));
}

export function deactivate() {}
