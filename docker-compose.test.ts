// @vitest-environment node
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('docker compose persistence', () => {
  it('uses an image-initialized named volume for writable SQLite state', () => {
    const compose = readFileSync('docker-compose.yml', 'utf8');

    expect(compose).toContain('youtube-subscriptions-data:/app/server/data');
    expect(compose).toContain('\nvolumes:\n  youtube-subscriptions-data:\n');
    expect(compose).not.toContain('./server/data:/app/server/data');
  });

  it('publishes the container image for server and Apple Silicon Docker hosts', () => {
    const workflow = readFileSync('.github/workflows/docker-publish.yml', 'utf8');

    expect(workflow).toContain('docker/setup-qemu-action@v3');
    expect(workflow).toContain('platforms: linux/amd64,linux/arm64');
  });
});
