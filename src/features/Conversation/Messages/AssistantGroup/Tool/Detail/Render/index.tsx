import { getBuiltinRender } from '@lobechat/builtin-tools/renders';
import { type ChatPluginPayload } from '@lobechat/types';
import { memo, useMemo } from 'react';

import CustomRender from './CustomRender';
import { FallbackArgumentRender } from './FallbacktArgumentRender';
import LunaTalkResultRender, { parseLunaTalkResult } from './LunaTalkResultRender';

interface ToolRenderProps {
  content: string;
  messageId?: string;
  plugin?: ChatPluginPayload;
  pluginState?: any;
  showCustomToolRender?: boolean;
  toolCallId: string;
}

const ToolRender = memo<ToolRenderProps>(
  ({ showCustomToolRender, content, messageId, plugin, pluginState, toolCallId }) => {
    const hasCustomRender = !!getBuiltinRender(plugin?.identifier, plugin?.apiName);
    // MCP connectors get no builtin render; LunaTalk card-writer previews and
    // validation reports are recognised by shape instead of by identifier.
    const lunatalkResult = useMemo(
      () => (hasCustomRender ? null : parseLunaTalkResult(content)),
      [content, hasCustomRender],
    );

    if (lunatalkResult) {
      return (
        <LunaTalkResultRender
          requestArgs={plugin?.arguments}
          result={lunatalkResult}
          toolCallId={toolCallId}
        />
      );
    }

    if (hasCustomRender && showCustomToolRender) {
      return (
        <CustomRender
          content={content}
          messageId={messageId}
          plugin={plugin}
          pluginState={pluginState}
          toolCallId={toolCallId}
        />
      );
    }

    return (
      <FallbackArgumentRender
        content={content}
        requestArgs={plugin?.arguments}
        toolCallId={toolCallId}
      />
    );
  },
);

ToolRender.displayName = 'ToolResultRender';

export default ToolRender;
