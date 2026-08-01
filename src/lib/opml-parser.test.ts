import { describe, expect, it } from 'vitest';
import {
  getSubscriptionImportStats,
  parseSubscriptionImportPreview,
  parseSubscriptionImportToSubscriptions,
} from './opml-parser';

describe('subscription import parser', () => {
  it('imports Google Takeout subscriptions.csv files', () => {
    const csv = [
      'Channel Id,Channel Url,Channel Title',
      'UC1234567890123456789012,http://www.youtube.com/channel/UC1234567890123456789012,Alpha Channel',
      'UCabcdefghijklmnopqrstuv,http://www.youtube.com/channel/UCabcdefghijklmnopqrstuv,"Beta, Channel"',
    ].join('\n');

    const subscriptions = parseSubscriptionImportToSubscriptions(csv);

    expect(subscriptions).toEqual([
      expect.objectContaining({
        id: 'UC1234567890123456789012',
        title: 'Alpha Channel',
      }),
      expect.objectContaining({
        id: 'UCabcdefghijklmnopqrstuv',
        title: 'Beta, Channel',
      }),
    ]);
  });

  it('reports stats for Google Takeout CSV files', () => {
    const csv = [
      'Channel Id,Channel Url,Channel Title',
      'UC1234567890123456789012,http://www.youtube.com/channel/UC1234567890123456789012,Alpha Channel',
    ].join('\n');

    expect(getSubscriptionImportStats(csv)).toEqual({
      isValid: true,
      channelCount: 1,
      duplicateCount: 0,
      skippedCount: 0,
      format: 'csv',
    });
  });

  it('previews new, duplicate, and invalid CSV entries without writing state', () => {
    const csv = [
      'Channel Id,Channel Url,Channel Title',
      'UC1234567890123456789012,http://www.youtube.com/channel/UC1234567890123456789012,Alpha Channel',
      'UCabcdefghijklmnopqrstuv,http://www.youtube.com/channel/UCabcdefghijklmnopqrstuv,Beta Channel',
      'UCabcdefghijklmnopqrstuv,http://www.youtube.com/channel/UCabcdefghijklmnopqrstuv,Beta Duplicate',
      'not-a-channel,not-a-channel,Broken Row',
    ].join('\n');

    expect(parseSubscriptionImportPreview(csv)).toEqual({
      format: 'csv',
      channelCount: 2,
      duplicateCount: 1,
      skippedCount: 1,
      subscriptions: [
        expect.objectContaining({ id: 'UC1234567890123456789012' }),
        expect.objectContaining({ id: 'UCabcdefghijklmnopqrstuv' }),
      ],
    });
  });
});
