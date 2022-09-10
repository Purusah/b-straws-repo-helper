import * as vscode from "vscode";
import { TestNode } from "./parser";
import { isAllowedTestKind, TestKind } from "./testKind";

export class TestableService {
    public readonly type = "service";

    constructor(
        private readonly name: string,
        public readonly path: vscode.Uri,
        public readonly workspace: vscode.WorkspaceFolder,
        public readonly kind: TestKind,
    ) {};

    public getId(): string {
        return `/${this.name}-${this.kind}`;
    }

    public getName(): string {
        return `${this.name}-${this.kind}`;
    }

    public static new(file: TestableFile): TestableService | null {
        const pathParts = file.file.uri.path.split("/");

        const indexOfTest = pathParts.indexOf("test");
        const name = pathParts.at(indexOfTest - 1);

        const folder = file.file.uri.with({path: pathParts.slice(0, indexOfTest + 2).join("/")});

        return new TestableService(name!, folder, file.workspace, file.kind);
    }
}

export class TestableFile {
    public readonly type = "file";

    constructor(
        public readonly file: vscode.TextDocument,
        public readonly workspace: vscode.WorkspaceFolder,
        public readonly kind: TestKind,
    ) {};

    public getId(): string {
        return this.file.uri.toString();
    }

    public getName(): string {
        return this.file.uri.path.split("/").pop()!;
    }

    public static new(document: vscode.TextDocument): TestableFile | null {
        if (document.uri.scheme !== "file") {
            return null;
        }

        const pathParts = document.uri.path.split("/");

        const indexOfTest = pathParts.indexOf("test");
        if (indexOfTest < 0) {
            return null;
        }

        const kind = pathParts.at(indexOfTest + 1);
        if (kind === undefined) {
            return null;
        }
        if (!isAllowedTestKind(kind)) {
            return null;
        }

        if (!document.uri.path.endsWith(`-${kind}.ts`)) {
            return null;
        }

        const workspace = vscode.workspace.getWorkspaceFolder(document.uri);
        if (workspace === undefined) {
            return null;
        }

        return new TestableFile(document, workspace, kind);
    }
}

export class TestableFunction {
    public readonly type = "function";
    constructor(
        private readonly name: string,
        private readonly parent: TestableFunction | TestableFile,
    ) {};

    public getId(): string {
        return `${this.parent.getId()}/${this.name}`;
    }

    public getName(): string {
        return this.name;
    }

    public getParentFile(): TestableFile {
        if (this.parent instanceof TestableFile) {
            return this.parent;
        }

        return this.parent.getParentFile();
    }

    public static new(node: TestNode, parent: TestableFunction | TestableFile): TestableFunction {
        return new TestableFunction(node.name, parent);
    }
}

export type Testable = TestableFunction | TestableFile | TestableService;
