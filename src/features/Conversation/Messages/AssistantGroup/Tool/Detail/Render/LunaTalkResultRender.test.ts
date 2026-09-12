import { describe, expect, it } from 'vitest';

import { parseLunaTalkResult } from './LunaTalkResultRender';

const wrap = (payload: object) =>
  JSON.stringify({
    content: JSON.stringify(payload),
    state: { content: [{ text: JSON.stringify(payload), type: 'text' }] },
    success: true,
  });

describe('parseLunaTalkResult', () => {
  it('turns a render_preview result into an inline preview with its report warnings', () => {
    const result = parseLunaTalkResult(
      wrap({
        expiresAt: '2026-09-12T01:00:00Z',
        previewUrl: 'https://lunatalk.ai/pages/mcp/rolePreview?renderId=r1&sig=s',
        structuredReport: {
          blockedElements: [],
          contrastWarnings: ['low contrast'],
          textOverflow: [],
        },
      }),
    );

    expect(result).toEqual({
      expiresAt: '2026-09-12T01:00:00Z',
      kind: 'preview',
      previewUrl: 'https://lunatalk.ai/pages/mcp/rolePreview?renderId=r1&sig=s',
      warnings: ['low contrast'],
    });
  });

  it('refuses non-http preview urls', () => {
    expect(parseLunaTalkResult(wrap({ previewUrl: 'javascript:alert(1)' }))).toBeNull();
  });

  it('turns a validate_role report into lists', () => {
    const result = parseLunaTalkResult(
      JSON.stringify({
        qualityDimensions: [{ key: 'voice', label: 'Voice', score: 0.8, status: 'pass' }],
        suggestedFixes: ['shorten the welcome'],
        tokenBudget: { estimatedTokens: 1200, totalChars: 3600 },
        warnings: ['welcome too long'],
      }),
    );

    expect(result).toEqual({
      estimatedTokens: 1200,
      kind: 'validation',
      quality: [{ label: 'Voice', score: 0.8, status: 'pass' }],
      suggestedFixes: ['shorten the welcome'],
      totalChars: 3600,
      warnings: ['welcome too long'],
    });
  });

  it('ignores errors, plain results and non-JSON', () => {
    expect(parseLunaTalkResult(wrap({ roleId: 'r1' }))).toBeNull();
    expect(
      parseLunaTalkResult(JSON.stringify({ state: { content: [], isError: true }, success: true })),
    ).toBeNull();
    expect(parseLunaTalkResult('plain text')).toBeNull();
    expect(parseLunaTalkResult(undefined)).toBeNull();
  });
});
