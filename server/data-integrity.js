const { recoverJsonFile } = require('./json-store');

async function recoverDataFiles(files) {
    const results = [];

    for (const fileConfig of files) {
        results.push(await recoverJsonFile(fileConfig.file, { fallback: fileConfig.fallback }));
    }

    return results;
}

module.exports = { recoverDataFiles };
