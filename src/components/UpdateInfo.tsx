import {dump as yamlDump} from 'js-yaml';
import React from 'react';
import {ScrollView, Text, YStack} from 'tamagui';

interface UpdateInfoProps {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  backgroundColor?: any;
  data: Record<string, unknown> | null | undefined;
  title: string;
}

function cleanObjectForYaml(obj: unknown): unknown {
  if (obj === null || obj === undefined) {
    return null;
  }

  if (obj instanceof Date) {
    return obj.toLocaleString();
  }

  if (typeof obj === 'function') {
    return '[Function]';
  }

  if (Array.isArray(obj)) {
    return obj.map(cleanObjectForYaml);
  }

  if (typeof obj === 'object') {
    const cleaned: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(obj)) {
      // Skip functions and undefined values
      if (typeof value !== 'function' && value !== undefined) {
        cleaned[key] = cleanObjectForYaml(value);
      }
    }
    return cleaned;
  }

  return obj;
}

export function UpdateInfo({
  title,
  data,
  backgroundColor = '$background',
}: UpdateInfoProps) {
  if (!data) return null;

  // Clean and convert to YAML
  const cleanedData = cleanObjectForYaml(data);
  const yamlString = yamlDump(cleanedData, {
    indent: 2,
    lineWidth: -1,

    noRefs: true,

    // Preserve order
    skipInvalid: true,
    // No line wrapping
    sortKeys: false,
  });

  // Split YAML into lines for rendering
  const lines = yamlString.split('\n').filter((line) => line.trim());

  return (
    <YStack
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
      backgroundColor={backgroundColor}
      borderRadius="$2"
      marginTop="$2"
      padding="$2">
      <Text color="$color" fontSize="$3" fontWeight="600" marginBottom="$1">
        {title}
      </Text>
      <ScrollView
        backgroundColor="$backgroundFocus"
        maxHeight={300}
        padding="$3"
        showsHorizontalScrollIndicator={false}>
        <YStack gap="$0.5">
          {lines.map((line, index) => {
            // Calculate indentation level
            const indentLevel = (line.length - line.trimStart().length) / 2;
            const paddingLeft = indentLevel * 16; // 16px per indent level

            // Style based on content
            const isKey = line.includes(':') && !line.trim().startsWith('-');
            const trimmedLine = line.trim();

            // Create a unique key from content and position to satisfy ESLint
            const uniqueKey = `${index}-${trimmedLine.slice(0, 20).replace(/[^a-zA-Z0-9]/g, '')}`;

            return (
              <Text
                color={isKey ? '$color' : '$color11'}
                // fontFamily="$mono"
                // fontSize="$2"
                key={uniqueKey}
                opacity={trimmedLine === 'null' ? 0.5 : 1}
                paddingLeft={paddingLeft}>
                {trimmedLine}
              </Text>
            );
          })}
        </YStack>
      </ScrollView>
    </YStack>
  );
}
