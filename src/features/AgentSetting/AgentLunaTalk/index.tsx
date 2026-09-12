import { Flexbox } from '@lobehub/ui';
import { Avatar, Button, Tag, Text } from '@lobehub/ui/base-ui';
import { memo, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { useClientDataSWR } from '@/libs/swr';
import { lunatalkRoleCardService } from '@/services/lunatalkRoleCard';

import { useStore } from '../store';

const PAGE_SIZE = 20;

const isNotConnected = (error: unknown) =>
  error instanceof Error && error.message.includes('LUNATALK_NOT_CONNECTED');

/**
 * Bind this agent to one of the user's LunaTalk role cards. The binding is an
 * always-loaded agent document holding the card snapshot, so the model knows
 * which roleId to edit without asking.
 */
const AgentLunaTalk = memo(() => {
  const { t, i18n } = useTranslation('setting');
  const [agentId, disabled] = useStore((s) => [s.id, s.disabled]);
  const [page, setPage] = useState(1);
  const [busy, setBusy] = useState<string | null>(null);

  const { data: binding, mutate: refreshBinding } = useClientDataSWR(
    agentId ? `lunatalk-role-binding:${agentId}` : null,
    () => lunatalkRoleCardService.getBinding(agentId!),
  );
  const {
    data: roles,
    error,
    isLoading,
  } = useClientDataSWR(agentId ? `lunatalk-my-roles:${page}` : null, () =>
    lunatalkRoleCardService.listMyRoles({ pageNum: page, pageSize: PAGE_SIZE }),
  );

  const run = async (key: string, action: () => Promise<unknown>) => {
    if (!agentId) return;
    setBusy(key);
    try {
      await action();
      await refreshBinding();
    } finally {
      setBusy(null);
    }
  };
  const bind = (roleId: string) =>
    run(roleId, () => lunatalkRoleCardService.bind({ agentId: agentId!, roleId }));
  const unbind = () => run('unbind', () => lunatalkRoleCardService.unbind(agentId!));

  const muted = { color: 'var(--lobe-colors-neutral-500)', fontSize: 12 };

  return (
    <Flexbox gap={24}>
      <Flexbox gap={8}>
        <Text weight={500}>{t('agentLunaTalk.current.title')}</Text>
        <div style={muted}>{t('agentLunaTalk.current.desc')}</div>
        {binding ? (
          <Flexbox horizontal align={'center'} gap={10} style={{ padding: '10px 12px' }}>
            <Flexbox flex={1} gap={2}>
              <Flexbox horizontal align={'center'} gap={8}>
                <span style={{ fontWeight: 500 }}>{binding.roleName}</span>
                {binding.roleVisibility && <Tag>{binding.roleVisibility}</Tag>}
              </Flexbox>
              <div style={muted}>
                {binding.roleId}
                {binding.syncedAt &&
                  ` · ${t('agentLunaTalk.syncedAt', {
                    date: new Date(binding.syncedAt).toLocaleString(i18n.language),
                  })}`}
              </div>
            </Flexbox>
            <Button
              disabled={disabled}
              loading={busy === binding.roleId}
              size={'small'}
              onClick={() => bind(binding.roleId)}
            >
              {t('agentLunaTalk.refresh')}
            </Button>
            <Button disabled={disabled} loading={busy === 'unbind'} size={'small'} onClick={unbind}>
              {t('agentLunaTalk.unbind')}
            </Button>
          </Flexbox>
        ) : (
          <div style={{ ...muted, padding: '10px 12px' }}>{t('agentLunaTalk.current.empty')}</div>
        )}
      </Flexbox>

      <Flexbox gap={8}>
        <Text weight={500}>{t('agentLunaTalk.list.title')}</Text>
        {error ? (
          <div style={{ ...muted, padding: '10px 12px' }}>
            {isNotConnected(error) ? t('agentLunaTalk.notConnected') : t('agentLunaTalk.loadError')}
          </div>
        ) : isLoading ? null : !roles || roles.roles.length === 0 ? (
          <div style={{ ...muted, padding: '10px 12px' }}>{t('agentLunaTalk.list.empty')}</div>
        ) : (
          <Flexbox gap={4}>
            {roles.roles.map((role) => {
              const isCurrent = binding?.roleId === role.roleId;
              return (
                <Flexbox
                  horizontal
                  align={'center'}
                  gap={10}
                  key={role.roleId}
                  style={{ borderRadius: 8, padding: '8px 12px' }}
                >
                  <Avatar avatar={role.roleAvatar} shape={'square'} size={32} />
                  <Flexbox flex={1} gap={2}>
                    <Flexbox horizontal align={'center'} gap={8}>
                      <span style={{ fontWeight: 500 }}>{role.roleName}</span>
                      {role.roleVisibility && <Tag>{role.roleVisibility}</Tag>}
                    </Flexbox>
                    <div style={muted}>{role.roleId}</div>
                  </Flexbox>
                  <Button
                    disabled={disabled || isCurrent}
                    loading={busy === role.roleId}
                    size={'small'}
                    type={isCurrent ? 'default' : 'primary'}
                    onClick={() => bind(role.roleId)}
                  >
                    {isCurrent ? t('agentLunaTalk.bound') : t('agentLunaTalk.bind')}
                  </Button>
                </Flexbox>
              );
            })}
            {(page > 1 || roles.hasNextPage) && (
              <Flexbox horizontal gap={8} justify={'flex-end'} style={{ paddingTop: 8 }}>
                <Button disabled={page <= 1} size={'small'} onClick={() => setPage((p) => p - 1)}>
                  {t('agentLunaTalk.prev')}
                </Button>
                <Button
                  disabled={!roles.hasNextPage}
                  size={'small'}
                  onClick={() => setPage((p) => p + 1)}
                >
                  {t('agentLunaTalk.next')}
                </Button>
              </Flexbox>
            )}
          </Flexbox>
        )}
      </Flexbox>
    </Flexbox>
  );
});

AgentLunaTalk.displayName = 'AgentLunaTalk';

export default AgentLunaTalk;
