import { Block, Flexbox } from '@lobehub/ui';
import { Text } from '@lobehub/ui/base-ui';
import { memo } from 'react';
import { useTranslation } from 'react-i18next';

import Arguments from '../Arguments';

interface QualityDimension {
  label: string;
  score?: number;
  status?: string;
}

/** The two card-writer results worth a visual: a preview URL, or a validation report. */
export type LunaTalkVisualResult =
  | {
      expiresAt?: string;
      kind: 'preview';
      previewUrl: string;
      warnings: string[];
    }
  | {
      estimatedTokens?: number;
      kind: 'validation';
      quality: QualityDimension[];
      suggestedFixes: string[];
      totalChars?: number;
      warnings: string[];
    };

const toRecord = (value: unknown): Record<string, unknown> | null =>
  value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;

const parseJSON = (value: unknown): unknown => {
  if (typeof value !== 'string') return value;
  try {
    return JSON.parse(value);
  } catch {
    return undefined;
  }
};

const strings = (value: unknown): string[] =>
  Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];

const isHttpUrl = (value: unknown): value is string => {
  if (typeof value !== 'string') return false;
  try {
    const { protocol } = new URL(value);
    return protocol === 'https:' || protocol === 'http:';
  } catch {
    return false;
  }
};

/**
 * Peel the MCP wrapper the message stores (`{ content, state: { content:
 * blocks }, success }`) or a bare JSON string down to the tool's own payload.
 */
const unwrap = (content: string): Record<string, unknown> | null => {
  let record = toRecord(parseJSON(content));
  if (!record) return null;
  const state = toRecord(record.state);
  if (state) record = state;
  if (record.isError === true) return null;
  const structured = toRecord(record.structuredContent);
  if (structured) return structured;
  if (Array.isArray(record.content)) {
    const text = record.content
      .map((block) => toRecord(block)?.text)
      .filter((item): item is string => typeof item === 'string')
      .join('\n');
    return toRecord(parseJSON(text));
  }
  if (typeof record.content === 'string') return toRecord(parseJSON(record.content)) ?? record;
  return record;
};

export const parseLunaTalkResult = (content?: string): LunaTalkVisualResult | null => {
  if (!content) return null;
  const payload = unwrap(content);
  if (!payload) return null;

  if (isHttpUrl(payload.previewUrl)) {
    const report = toRecord(payload.structuredReport);
    return {
      expiresAt: typeof payload.expiresAt === 'string' ? payload.expiresAt : undefined,
      kind: 'preview',
      previewUrl: payload.previewUrl,
      warnings: report
        ? [
            ...strings(report.textOverflow),
            ...strings(report.contrastWarnings),
            ...strings(report.blockedElements),
          ]
        : [],
    };
  }

  if (Array.isArray(payload.warnings) && Array.isArray(payload.suggestedFixes)) {
    const budget = toRecord(payload.tokenBudget);
    return {
      estimatedTokens:
        typeof budget?.estimatedTokens === 'number' ? budget.estimatedTokens : undefined,
      kind: 'validation',
      quality: Array.isArray(payload.qualityDimensions)
        ? payload.qualityDimensions
            .map(toRecord)
            .filter(
              (item): item is Record<string, unknown> => !!item && typeof item.label === 'string',
            )
            .map((item) => ({
              label: item.label as string,
              score: typeof item.score === 'number' ? item.score : undefined,
              status: typeof item.status === 'string' ? item.status : undefined,
            }))
        : [],
      suggestedFixes: strings(payload.suggestedFixes),
      totalChars: typeof budget?.totalChars === 'number' ? budget.totalChars : undefined,
      warnings: strings(payload.warnings),
    };
  }

  return null;
};

const List = memo<{ items: string[]; title: string }>(({ items, title }) => {
  if (items.length === 0) return null;
  return (
    <Flexbox gap={4}>
      <Text type={'secondary'}>{title}</Text>
      <ul style={{ margin: 0, paddingInlineStart: 20 }}>
        {items.map((item, index) => (
          <li key={index}>{item}</li>
        ))}
      </ul>
    </Flexbox>
  );
});

interface LunaTalkResultRenderProps {
  requestArgs?: string;
  result: LunaTalkVisualResult;
  toolCallId: string;
}

/**
 * Card-writer results are worth looking at, not reading: the preview URL is
 * framed inline (the same page the author would open), the validation report
 * becomes lists instead of a JSON blob.
 */
const LunaTalkResultRender = memo<LunaTalkResultRenderProps>(
  ({ requestArgs, result, toolCallId }) => {
    const { t, i18n } = useTranslation('plugin');

    return (
      <Block id={toolCallId} variant={'outlined'} width={'100%'}>
        <Arguments arguments={requestArgs} />
        <Flexbox gap={12} padding={16}>
          {result.kind === 'preview' ? (
            <>
              {/* The preview lives on the LunaTalk origin, so allow-same-origin
                  grants it its own origin (storage, cookies for its API), never
                  ours; the page needs scripts to render the card. */}
              {}
              <iframe
                sandbox={'allow-scripts allow-same-origin allow-popups allow-forms'}
                src={result.previewUrl}
                style={{ border: 0, borderRadius: 8, height: 560, width: '100%' }}
                title={'LunaTalk preview'}
              />
              <Flexbox horizontal gap={12} style={{ fontSize: 12 }}>
                <a href={result.previewUrl} rel={'noopener noreferrer'} target={'_blank'}>
                  {t('lunatalk.preview.open')}
                </a>
                {result.expiresAt && (
                  <Text type={'secondary'}>
                    {t('lunatalk.preview.expires', {
                      date: new Date(result.expiresAt).toLocaleString(i18n.language),
                    })}
                  </Text>
                )}
              </Flexbox>
              <List items={result.warnings} title={t('lunatalk.validation.warnings')} />
            </>
          ) : (
            <>
              {result.quality.length > 0 && (
                <Flexbox gap={4}>
                  <Text type={'secondary'}>{t('lunatalk.validation.quality')}</Text>
                  {result.quality.map((dimension) => (
                    <Flexbox horizontal gap={8} key={dimension.label}>
                      <span style={{ flex: 1 }}>{dimension.label}</span>
                      {dimension.status && <Text type={'secondary'}>{dimension.status}</Text>}
                      {dimension.score !== undefined && <span>{dimension.score}</span>}
                    </Flexbox>
                  ))}
                </Flexbox>
              )}
              {result.warnings.length === 0 ? (
                <Text type={'secondary'}>{t('lunatalk.validation.clean')}</Text>
              ) : (
                <List items={result.warnings} title={t('lunatalk.validation.warnings')} />
              )}
              <List items={result.suggestedFixes} title={t('lunatalk.validation.suggestedFixes')} />
              {result.estimatedTokens !== undefined && (
                <Text type={'secondary'}>
                  {t('lunatalk.validation.tokenBudget', {
                    chars: result.totalChars ?? 0,
                    tokens: result.estimatedTokens,
                  })}
                </Text>
              )}
            </>
          )}
        </Flexbox>
      </Block>
    );
  },
);

LunaTalkResultRender.displayName = 'LunaTalkResultRender';

export default LunaTalkResultRender;
