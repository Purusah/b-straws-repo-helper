export type TestKind = "comp" | "ecomp" | "spec";

export const allowedTestIdentifiers: {[key in TestKind]: string[]} = {
    "comp": ["fctest", "ctest", "describe", "csuite"],
    "ecomp": ["ctest", "describe", "csuite"],
    "spec": ["it", "describe"],
};

export const testKindToFileNameSuffix: {[key in TestKind]: string} = {
    "comp": "comp",
    "ecomp": "comp",
    "spec": "spec",
};

export const isAllowedTestKind = (name: string): name is TestKind => {
    return name === "comp" || name === "ecomp" || name === "spec";
};
