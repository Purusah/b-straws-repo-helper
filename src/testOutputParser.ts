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
            console.dir(cleanedData);
            console.dir(cleanedData.startsWith("PASS"));
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
        let cp: subprocess.ChildProcessWithoutNullStreams;

        const testFilePath = relative(test.folder.uri.fsPath, test.file.uri.fsPath);
        switch (test.type) {
        case "file": {
            cp = subprocess.spawn(
                "yarn", ["ctest", "--color", testFilePath],
                {
                    stdio: "pipe",
                    cwd: test.folder.uri.path,
                    // eslint-disable-next-line @typescript-eslint/naming-convention
                    env: {...process.env, FORCE_COLOR: "1"},
                },
            );
            break;
        }
        case "function": {
            cp = subprocess.spawn(
                "yarn", ["ctest", "--color", `-t="${test.getName()}"`, testFilePath],
                {
                    stdio: "pipe",
                    cwd: test.folder.uri.path,
                    // eslint-disable-next-line @typescript-eslint/naming-convention
                    env: {...process.env, FORCE_COLOR: "1"},
                },
            );
            break;
        }
        default: {
            throw new Error(test.type);
        }}

        this.processes.push(new TestOutputParser(cp!, item, this.runner));
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
