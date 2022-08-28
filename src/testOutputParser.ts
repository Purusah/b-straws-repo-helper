import * as subprocess from "node:child_process";
import { relative } from "node:path/posix";
import * as vscode from "vscode";
import { Testable } from "./repo";

export class TestOutputParser {
    isReady: boolean = false;
    constructor(
        private readonly proc: subprocess.ChildProcessWithoutNullStreams,
        private readonly item: vscode.TestItem,
        private readonly run: vscode.TestRun,
    ) {
        let testResultOk = false;

        this.proc.stderr.setEncoding("utf-8").on("data", (data: string) => {
            if (!testResultOk && data.startsWith("PASS")) {
                testResultOk = true;
            }
            run.appendOutput(data.replace(/(?<!\r)\n/gm, "\r\n"), undefined, this.item);
        });
        this.proc.stdout.setEncoding("utf-8").on("data", (data: string) => {
            run.appendOutput(data.replace(/(?<!\r)\n/gm, "\r\n"), undefined, this.item);
        });

        this.proc.on("exit", (_code, _signal) => {
            this.isReady = true;

            if (testResultOk) {
                this.run.passed(this.item);
            } else {
                this.run.errored(this.item, {message: "failed"});
            }
        });
    };

    public kill(): boolean {
        this.run.skipped(this.item);
        return this.proc.kill();

    }
}

export class TestExecutor {
    private processes: TestOutputParser[];

    constructor(private readonly runner: vscode.TestRun) {
        this.processes = [];
    }

    public start(item: vscode.TestItem, test: Testable) {
        if (test.type === "file") {
            const cp = subprocess.spawn(
                "yarn", ["ctest", relative(test.folder.uri.fsPath, test.file.uri.fsPath)],
                {
                    stdio: "pipe",
                    cwd: test.folder.uri.path,
                    env: {...process.env},
                },
            );
            this.processes.push(new TestOutputParser(cp, item, this.runner));
        }
        if (test.type === "function") {
            // TODO
        }
    };

    public async wait(token: vscode.CancellationToken): Promise<void> {
        let wait = true;
        while (wait) {
            wait = this.processes.some((t) => !t.isReady);
            await new Promise(r => setTimeout(r, 1000));

            if (token.isCancellationRequested) {
                this.processes.forEach((p) => {if (!p.isReady) {p.kill();}});
                wait = false;
            }
        }
    }
}
