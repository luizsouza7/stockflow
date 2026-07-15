import { createHash } from 'node:crypto';
import { readFile, readdir, writeFile } from 'node:fs/promises';
import { relative, resolve } from 'node:path';
import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';

const BUILD_ID_PLACEHOLDER = '__STOCKFLOW_BUILD_ID__';
const VERSIONED_SERVICE_WORKER_FILES = ['sw.js', 'sw-policy.js'];

async function listFiles(directory: string): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  const nestedFiles = await Promise.all(
    entries.map((entry) => {
      const entryPath = resolve(directory, entry.name);
      return entry.isDirectory() ? listFiles(entryPath) : [entryPath];
    }),
  );

  return nestedFiles.flat();
}

function stockFlowBuildIdPlugin(): Plugin {
  let outputDirectory = '';

  return {
    name: 'stockflow-build-id',
    apply: 'build',
    enforce: 'post',
    configResolved(config) {
      outputDirectory = resolve(config.root, config.build.outDir);
    },
    async closeBundle() {
      const generatedFiles = await listFiles(outputDirectory);
      const applicationFiles = generatedFiles
        .filter((filePath) => {
          const fileName = relative(outputDirectory, filePath).replaceAll('\\', '/');
          return !VERSIONED_SERVICE_WORKER_FILES.includes(fileName);
        })
        .sort();
      const hash = createHash('sha256');

      for (const filePath of applicationFiles) {
        hash.update(relative(outputDirectory, filePath).replaceAll('\\', '/'));
        hash.update('\0');
        hash.update(await readFile(filePath));
        hash.update('\0');
      }

      const buildId = hash.digest('hex').slice(0, 12);

      await Promise.all(
        VERSIONED_SERVICE_WORKER_FILES.map(async (fileName) => {
          const filePath = resolve(outputDirectory, fileName);
          const source = await readFile(filePath, 'utf8');
          if (!source.includes(BUILD_ID_PLACEHOLDER)) {
            throw new Error(`Marcador de build ausente em ${fileName}.`);
          }
          await writeFile(filePath, source.replaceAll(BUILD_ID_PLACEHOLDER, buildId), 'utf8');
        }),
      );
    },
  };
}

export default defineConfig({
  plugins: [react(), stockFlowBuildIdPlugin()],
});
