import * as vscode from "vscode";
import { TestNode } from "./parser";
import { isAllowedTestKind, TestKind, testKindToFileNameSuffix } from "./testKind";

const getPathTestKind = (pathFragments: string[]): TestKind | null => {
    const indexOfTest = pathFragments.indexOf("test");
    if (indexOfTest < 0) {
        return null;
    }

    const kind = pathFragments.at(indexOfTest + 1);
    if (kind === undefined) {
        return null;
    }
    if (!isAllowedTestKind(kind)) {
        return null;
    }

    return kind;
};

export class TestableFolder {
    constructor(
        protected readonly name: string,
        public readonly path: vscode.Uri,
        public readonly workspace: vscode.WorkspaceFolder,
        public readonly kind: TestKind,
    ) {
    };

    public getId(): string {
        return `/${this.name}-${this.kind}`;
    }

    public getName(): string {
        return `${this.name}-${this.kind}`;
    }

    public static new(uri: vscode.Uri): TestableService | null {
        const workspace = vscode.workspace.getWorkspaceFolder(uri);
        if (workspace === undefined) {
            return null;
        }

        const pathParts = uri.path.split("/");
        const name = pathParts.at(-1);

        const kind = getPathTestKind(pathParts);
        if (kind === null) {
            return null;
        }

        return new TestableService(name!, uri, workspace, kind);
    }
}

export class TestableService extends TestableFolder {
    public readonly type = "service";

    constructor(
        protected readonly name: string,
        public readonly path: vscode.Uri,
        public readonly workspace: vscode.WorkspaceFolder,
        public readonly kind: TestKind,
    ) {
        super(name, path, workspace, kind);
    };

    public static new(uri: vscode.Uri): TestableService | null {
        const workspace = vscode.workspace.getWorkspaceFolder(uri);
        if (workspace === undefined) {
            return null;
        }

        const pathParts = uri.path.split("/");

        const indexOfTest = pathParts.indexOf("test");
        const name = pathParts.at(indexOfTest - 1);

        const folder = uri.with({path: pathParts.slice(0, indexOfTest + 2).join("/")});

        const kind = getPathTestKind(pathParts);
        if (kind === null) {
            return null;
        }

        return new TestableService(name!, folder, workspace, kind);
    }
}

export class TestableFile {
    public readonly type = "file";

    constructor(
        public readonly file: vscode.Uri,
        public readonly workspace: vscode.WorkspaceFolder,
        public readonly kind: TestKind,
    ) {};

    public getId(): string {
        return this.file.toString();
    }

    public getName(): string {
        return this.file.path.split("/").pop()!;
    }

    public static new(uri: vscode.Uri): TestableFile | null {
        if (uri.scheme !== "file") {
            return null;
        }

        const kind = getPathTestKind(uri.path.split("/"));
        if (kind === null) {
            return null;
        }

        if (!uri.path.endsWith(`-${testKindToFileNameSuffix[kind]}.ts`)) {
            return null;
        }

        const workspace = vscode.workspace.getWorkspaceFolder(uri);
        if (workspace === undefined) {
            return null;
        }

        return new TestableFile(uri, workspace, kind);
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
