// @vitest-environment node
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('docker compose persistence', () => {
  it('uses an image-initialized named volume for writable SQLite state', () => {
    const compose = readFileSync('docker-compose.yml', 'utf8');

    expect(compose).toContain('mytube:');
    expect(compose).toContain('container_name: mytube');
    expect(compose).toContain('image: ghcr.io/greg-hass/mytube:latest');
    expect(compose).toContain('mytube-data:/app/server/data');
    expect(compose).toContain('\nvolumes:\n  mytube-data:\n');
    expect(compose).not.toContain('./server/data:/app/server/data');
  });

  it('publishes a cached image for the production x86 server without emulation', () => {
    const workflow = readFileSync('.github/workflows/docker-publish.yml', 'utf8');

    expect(workflow).toContain('platforms: linux/amd64');
    expect(workflow).not.toContain('docker/setup-qemu-action@v3');
    expect(workflow).not.toContain('linux/arm64');
    expect(workflow).toContain('cache-from: type=gha');
    expect(workflow).toContain('cache-to: type=gha,mode=max');
  });
});
