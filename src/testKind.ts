export type TestKind = "comp" | "spec";

export const allowedTestIdentifiers: {[key in TestKind]: string[]} = {
    "spec": ["it", "describe"],
    "comp": ["ctest", "describe", "csuite"],
};

export const isAllowedTestKind = (name: string): name is TestKind => {
    return name === "comp" || name === "spec";
};
