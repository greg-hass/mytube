import { describe, expect, it } from 'vitest';
import { parseChannelInput } from './youtube-parser';

describe('parseChannelInput', () => {
  it('parses channel IDs', () => {
    expect(parseChannelInput('UCBJycsmduvYEL83R_U4JriQ')).toMatchObject({
      type: 'channel_id',
      value: 'UCBJycsmduvYEL83R_U4JriQ',
    });
  });

  it('parses bare handles', () => {
    expect(parseChannelInput('@MarioNawfal')).toMatchObject({
      type: 'handle',
      value: 'MarioNawfal',
    });
  });

  it('parses full handle URLs', () => {
    expect(parseChannelInput('https://www.youtube.com/@MarioNawfal')).toMatchObject({
      type: 'handle',
      value: 'MarioNawfal',
    });
  });

  it('parses schemeless www.youtube.com handle URLs', () => {
    expect(parseChannelInput('www.youtube.com/@MarioNawfal')).toMatchObject({
      type: 'handle',
      value: 'MarioNawfal',
    });
  });

  it('parses schemeless youtube.com channel URLs', () => {
    expect(
      parseChannelInput('youtube.com/channel/UCBJycsmduvYEL83R_U4JriQ'),
    ).toMatchObject({
      type: 'channel_id',
      value: 'UCBJycsmduvYEL83R_U4JriQ',
    });
  });

  it('parses schemeless youtube.com /c/ custom URLs', () => {
    expect(parseChannelInput('youtube.com/c/somechannel')).toMatchObject({
      type: 'custom_url',
      value: 'somechannel',
    });
  });

  it('still treats non-URL slugs as custom URLs', () => {
    expect(parseChannelInput('somechannel')).toMatchObject({
      type: 'custom_url',
      value: 'somechannel',
    });
  });
});
