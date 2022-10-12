import fs from "node:fs/promises";
import {exec} from "node:child_process";
import path from "node:path";
import {promisify} from "node:util";

const runCommand = promisify(exec);

const changelogFile = path.join(process.cwd(), "CHANGELOG.md");
const emptyLine = "";
const encoding = "utf8";
const newLineCharacter = "\n";
const unreleasedLineMatcher = /## \[Unreleased\]/;
const versionLineMatcher = /## \[(\d\.\d\.\d)\]/;

/**
 *
 * @param {string[]} args
 *
 * @returns {object} diff to apply to the last published version
 */
const readInput = (args) => {
    const increment = {major: 0, minor: 0, patch: 0};
    const parameter = args[2];

    if (args.length !== 3 || !Object.keys(increment).includes(parameter)) {
        throw new Error("one parameter must be passed major|minor|patch");
    }

    increment[parameter] += 1;

    return increment;
};

/**
 *
 * @param {string} content file content
 * @param {object} increment file content
 *
 * @returns file new content
 */
const parseFile = async (content, increment) => {
    let lineNumber = 0;
    let unreleasedLineNumber = null;
    const version = {major: 0, minor: 0, patch: 0};
    const lines = content.split(newLineCharacter);

    for (const line of lines) {
        const isUnresolvedMatched = line.match(unreleasedLineMatcher)?.pop();
        if (isUnresolvedMatched !== undefined) {
            unreleasedLineNumber = lineNumber;
        }

        const previousVersion = line.match(versionLineMatcher)?.pop();
        if (previousVersion !== undefined) {
            const parts = previousVersion.split(".");
            if (parts.length !== 3) {
                throw new Error("wrong version format");
            }

            version.major = parseInt(parts[0], 10) + increment.major;
            version.minor = parseInt(parts[1], 10) + increment.minor;
            version.patch = parseInt(parts[2], 10) + increment.patch;
            break;
        }

        lineNumber += 1;
    }

    if (unreleasedLineNumber === null) {
        throw new Error("failed to find last published version");
    }

    const now = new Date();
    const month = now.getMonth() + 1 < 10 ? `0${now.getMonth() + 1}` : (now.getMonth() + 1).toString();
    const day = now.getDate() + 1 < 10 ? `0${now.getDate() + 1}` : (now.getDate() + 1).toString();
    const versionString = `${version.major}.${version.minor}.${version.patch}`;
    return {
        content: [
            ...lines.slice(0, unreleasedLineNumber + 1),
            emptyLine,
            `## [${versionString}] - ${now.getFullYear()}-${month}-${day}`,
            ...lines.slice(unreleasedLineNumber + 1, lines.length),
        ].join(newLineCharacter),
        version: versionString,
    };
};

/**
 * Update CHANGELOG file with new minor version
 *
 * @param {string} parameter parameter passed to the function
 */
const main = async (args) => {
    const increment = readInput(args);
    const file = await fs.open(changelogFile, "r+");

    const changelogContent = await file.readFile({encoding});
    const {content, version} = await parseFile(changelogContent, increment);

    const result = await file.write(content, 0, encoding);
    if (result === undefined || result.bytesWritten === 0) {
        await file.close();
        throw new Error("write to the file failed");
    }
    await file.close();

    await runCommand(`git commit -a -m "CHANGELOG new version ${version}"`);
};

main(process.argv).then(() => console.info("OK")).catch((err) => console.error(err.message));
