import * as vscode from "vscode";
import { TestNode } from "./parser";

export const repository = new WeakMap<vscode.TestItem, Testable>();

export class Testable {
    constructor(
        private readonly id: string,
        private readonly name: string,
        public readonly folder: vscode.WorkspaceFolder,
        public readonly file: vscode.TextDocument,
        public readonly type: "file" | "function",
    ) {};

    public getId(): string {
        return this.id;
    }

    public getName(): string {
        return this.name;
    }

    public static newTestFile(folder: vscode.WorkspaceFolder, file: vscode.TextDocument): Testable {
        return new Testable(
            file.uri.toString(),
            file.uri.path.split("/").pop()!,
            folder,
            file,
            "file",
        );
    }

    public static newTestNode(node: TestNode, parent: Testable): Testable {
        return new Testable(
            `${parent.getId()}/${node.name}`,
            node.name,
            parent.folder,
            parent.file,
            "function",
        );
    }
}
