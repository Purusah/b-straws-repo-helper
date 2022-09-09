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
            const cleanedData = data.replace(
                /[\u001b\u009b][[()#;?]*(?:[0-9]{1,4}(?:;[0-9]{0,4})*)?[0-9A-ORZcf-nqry=><]/g,
                "",
            ).trimStart();
            if (!testResultOk && cleanedData.startsWith("PASS")) {
                testResultOk = true;
            }
            run.appendOutput(data.replace(/(?<!\r)\n/gm, "\r\n"), undefined, this.item);
        });
        this.proc.stdout.setEncoding("utf-8").on("data", (data: string) => {
            run.appendOutput(data.replace(/(?<!\r)\n/gm, "\r\n"), undefined, this.item);
        });

        this.proc.on("exit", (_code, _signal) => {
            this.isReady = true;
            if (this.proc.killed) {
                // console message: setting the state of test is a no-op after the run ends
                return;
            }

            if (testResultOk) {
                this.run.passed(this.item);
            } else {
                this.run.errored(this.item, {message: "failed"});
            }
        });
    };

    public kill(): boolean {
        return this.proc.kill();

    }
}

export class TestExecutor {
    private processes: TestOutputParser[];

    constructor(private readonly runner: vscode.TestRun) {
        this.processes = [];
    }

    public start(item: vscode.TestItem, test: Testable) {
        let args: string[];
        let cwd: string;

        switch (test.type) {
        case "service": {
            args = ["ctest", "--color", test.path.fsPath];
            cwd = test.workspace.uri.path;
            break;
        }
        case "file": {
            args = ["ctest", "--color", relative(test.workspace.uri.fsPath, test.file.uri.fsPath)];
            cwd = test.workspace.uri.path;
            break;
        }
        case "function": {
            const filePath = relative(test.getParentFile().workspace.uri.fsPath, test.getParentFile().file.uri.fsPath);
            args = ["ctest", "--color", `-t="${test.getName()}"`, filePath];
            cwd = test.getParentFile().workspace.uri.path;
            break;
        }}

        const cp = subprocess.spawn(
            "yarn", args,
            {
                stdio: "pipe",
                cwd,
                env: {...process.env, FORCE_COLOR: "1"}, // eslint-disable-line @typescript-eslint/naming-convention
            },
        );

        this.processes.push(new TestOutputParser(cp, item, this.runner));
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
